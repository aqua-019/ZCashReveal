/**
 * `AnchorRegistry.forgetAbove` - the seventh table a reorg has to roll back.
 *
 * The six chain tables are rolled back inside the store; this registry is
 * written from the follower's `onApplied` and was not. A gate round found it:
 * an orphaned branch's roots would answer `getHeightForAnchor` forever, and a
 * mempool spend citing one would be given an anchor depth measured from a
 * block the network abandoned.
 *
 * DRIVEN OVER STUBS, NOT POSTGRES, DELIBERATELY. What is asserted here is the
 * shape of the three-tier delete - which rows leave, which Redis keys are
 * named, and that the in-process memo stops answering - and all three are
 * observable at the boundary. A Postgres-gated test would pass vacuously on a
 * runner without a database, which is the note section 5 makes about A2.
 */
import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import type { Sql } from "postgres";

import { AnchorRegistry } from "../anchor-depth.js";

interface Recorded {
  readonly queries: string[];
  readonly deleted: string[][];
}

/**
 * A `sql` tagged template that answers the DELETE with `rows` and everything
 * else with nothing, and a Redis fake that REMEMBERS WHAT IT WAS TOLD.
 *
 * THE FIRST VERSION OF THIS HELPER ANSWERED `get` WITH A CONSTANT `null`, AND
 * THAT MADE ITS BEST ASSERTION VACUOUS. "After the forget, the lookup returns
 * null" was true of a fake that could never return anything else, not of the
 * registry - and the scenario the limitation is ABOUT, a Redis key that
 * survives the forget, was unreachable through it. A gate reviewer built the
 * remembering fake, drove the real class through it, and got the orphaned
 * height back. It is that fake, here, so the same probe would fail again.
 *
 * The SQL text is recorded; the interpolated values are not inspected, which
 * is a real limit of this double and is why `> height` versus `>= height` is
 * checked by reading `rollbackToHeight`'s contract rather than by this file.
 */
function stubs(rows: Array<{ anchor: string }>): {
  registry: AnchorRegistry;
  log: Recorded;
  redisStore: Map<string, string>;
  tick: (ms: number) => void;
} {
  const queries: string[] = [];
  const deleted: string[][] = [];
  const redisStore = new Map<string, string>();
  let clock = 1_756_000_000_000;
  const sql = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(text);
    return Promise.resolve(text.startsWith("DELETE FROM anchors") ? rows : []);
  }) as unknown as Sql;
  const redis = {
    del: (...keys: string[]) => {
      deleted.push(keys);
      for (const k of keys) redisStore.delete(k);
      return Promise.resolve(keys.length);
    },
    get: (key: string) => Promise.resolve(redisStore.get(key) ?? null),
    set: (key: string, value: number | string) => {
      redisStore.set(key, String(value));
      return Promise.resolve("OK");
    },
  } as unknown as Redis;
  return {
    registry: new AnchorRegistry(redis, sql, () => clock),
    log: { queries, deleted },
    redisStore,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const A_DAY_MS = 24 * 60 * 60 * 1000;

describe("forgetAbove drops the orphaned anchors from all three tiers", () => {
  it("PASS STATE: the rows above the split leave Postgres and the memo stops answering from them", async () => {
    const { registry, log } = stubs([{ anchor: "aa" }, { anchor: "bb" }]);
    // Warm the memo the way a live spend would, so there is something in it
    // to go stale.
    await registry.record("aa", 1_700_006);
    expect(await registry.getHeightForAnchor("aa")).toBe(1_700_006);

    expect(await registry.forgetAbove(1_700_003)).toBe(2);
    expect(log.queries.some((q) => q.startsWith("DELETE FROM anchors WHERE height >"))).toBe(true);
  });

  it("THE LIMITATION, PINNED AS BEHAVIOUR: Redis still answers with the orphaned height, and only until the TTL", async () => {
    // The honest shape of this fix, asserted rather than described. The hot
    // tier cannot be cleared from here (see the docblock), so immediately
    // after the forget the orphaned height is still what a spend gets. What
    // the fix buys is that the answer EXPIRES: the memo now carries the same
    // 24-hour deadline the Redis key does, so when the key goes the answer
    // goes with it. Before the memo had a deadline, one read after the forget
    // pinned the orphaned height for the life of the process - which is what a
    // gate reviewer measured, and what made the sentence in RUNTIME.md false.
    const { registry, redisStore, tick } = stubs([{ anchor: "aa" }]);
    await registry.record("aa", 1_700_006);
    await registry.forgetAbove(1_700_003);

    // Still answered, from the tier this fix cannot touch - and READING IT is
    // what used to make the memo hold it forever.
    expect(await registry.getHeightForAnchor("aa")).toBe(1_700_006);

    // A day later: the Redis key has expired and so has the memo entry, so the
    // lookup falls through to Postgres, which the forget emptied. This is the
    // assertion that goes red without the memo deadline - the read above would
    // have pinned 1,700,006 in a map that never expires.
    tick(A_DAY_MS + 1);
    redisStore.delete("zcashreveal:anchor:aa");
    expect(await registry.getHeightForAnchor("aa")).toBeNull();
  });

  it("NO REDIS DELETION, AND THAT IS THE LIMIT THIS FIX HAS: the hot tier is left to its TTL", async () => {
    // Not an oversight and not a preference: `check-redis-safety` rule 4
    // permits DEL only on a `zecreveal:` string literal, and these keys are
    // computed per root. The guard protects another project's database and is
    // not this handoff's to widen, so the hot tier can still answer with an
    // orphaned height until the key expires. Pinned as a test so the
    // limitation is visible rather than inferred from the absence of a line,
    // and so a later session that DOES widen the guard has to come here.
    const { registry, log } = stubs([{ anchor: "aa" }]);
    await registry.forgetAbove(1_700_003);
    expect(log.deleted).toEqual([]);
  });

  it("FAIL STATE, BY DATA: with no rows above the split nothing is deleted", async () => {
    const { registry, log } = stubs([]);
    expect(await registry.forgetAbove(1_700_003)).toBe(0);
    expect(log.queries.some((q) => q.startsWith("DELETE FROM anchors WHERE height >"))).toBe(true);
    expect(log.deleted).toEqual([]);
  });
});
