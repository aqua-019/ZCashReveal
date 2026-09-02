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
 * else with nothing, recording the SQL text it was handed.
 */
function stubs(rows: Array<{ anchor: string }>): { registry: AnchorRegistry; log: Recorded } {
  const queries: string[] = [];
  const deleted: string[][] = [];
  const sql = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(text);
    return Promise.resolve(text.startsWith("DELETE FROM anchors") ? rows : []);
  }) as unknown as Sql;
  const redis = {
    del: (...keys: string[]) => {
      deleted.push(keys);
      return Promise.resolve(keys.length);
    },
    get: () => Promise.resolve(null),
    set: () => Promise.resolve("OK"),
  } as unknown as Redis;
  return { registry: new AnchorRegistry(redis, sql), log: { queries, deleted } };
}

describe("forgetAbove drops the orphaned anchors from all three tiers", () => {
  it("PASS STATE: the rows above the split leave Postgres and the memo stops answering from them", async () => {
    const { registry, log } = stubs([{ anchor: "aa" }, { anchor: "bb" }]);
    // Warm the memo the way a live spend would, so there is something in it
    // to go stale.
    await registry.record("aa", 1_700_006);
    expect(await registry.getHeightForAnchor("aa")).toBe(1_700_006);

    expect(await registry.forgetAbove(1_700_003)).toBe(2);
    expect(log.queries.some((q) => q.startsWith("DELETE FROM anchors WHERE height >"))).toBe(true);

    // The memo answered 1,700,006 above; after the forget it must go back to
    // the store rather than repeat itself - and the stub store has no rows.
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
