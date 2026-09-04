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
  expiries: Map<string, number>;
  faults: Array<{ key: string; raw: string }>;
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
  // THE FAKE NOW EXPIRES KEYS ON THE SAME CLOCK THE REGISTRY READS, AND WITHOUT
  // THAT THE ONE ASSERTION THIS FILE EXISTS FOR CANNOT DISCRIMINATE. The
  // previous version stored values forever and a test simulated expiry by
  // calling `redisStore.delete` by hand at a moment of its own choosing - so
  // "the memo carries the key's deadline" and "the memo carries a fresh 24
  // hours from the read" produced identical output, and round 3 shipped the
  // second while its docblock claimed the first. A fake that cannot represent
  // the difference between two deadlines cannot test a fix about deadlines.
  const expiries = new Map<string, number>();
  const alive = (key: string): boolean => {
    const at = expiries.get(key);
    if (at !== undefined && at <= clock) {
      redisStore.delete(key);
      expiries.delete(key);
      return false;
    }
    return redisStore.has(key);
  };
  const redis = {
    del: (...keys: string[]) => {
      deleted.push(keys);
      for (const k of keys) {
        redisStore.delete(k);
        expiries.delete(k);
      }
      return Promise.resolve(keys.length);
    },
    get: (key: string) => Promise.resolve(alive(key) ? (redisStore.get(key) ?? null) : null),
    set: (key: string, value: number | string, mode?: string, seconds?: number) => {
      redisStore.set(key, String(value));
      if (mode === "EX" && seconds !== undefined) expiries.set(key, clock + seconds * 1000);
      return Promise.resolve("OK");
    },
    // -2 no such key, -1 no expiry, else the remaining milliseconds. Redis's own
    // contract, because the registry now branches on all three.
    pttl: (key: string) => {
      if (!alive(key)) return Promise.resolve(-2);
      const at = expiries.get(key);
      return Promise.resolve(at === undefined ? -1 : at - clock);
    },
  } as unknown as Redis;
  const faults: Array<{ key: string; raw: string }> = [];
  return {
    registry: new AnchorRegistry(redis, sql, () => clock, (key, raw) => faults.push({ key, raw })),
    log: { queries, deleted },
    redisStore,
    expiries,
    faults,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const A_DAY_MS = 24 * 60 * 60 * 1000;

describe("ROUND 4: the memo carries the KEY'S REMAINING deadline, not a fresh one", () => {
  /**
   * ROUND 3's FIX SAID THE TWO TIERS EXPIRE TOGETHER AND GAVE THE MEMO A FRESH
   * 24 HOURS FROM THE MOMENT OF THE READ. That is the key's deadline only on the
   * `record()` path, where the key is written in the same instant. On the
   * REDIS-HIT path - the only path the fix exists for - a read at T+23h pinned
   * the height until T+47h, and both `anchor-depth.ts` and RUNTIME.md section 4
   * asserted otherwise. A fourth round measured it.
   *
   * THE FAIL SIDE IS A DATA MUTATION AND IT IS THE READ'S TIMING. Same registry,
   * same key, same TTL: only WHEN the hit happens changes, and that is what the
   * two deadlines disagree about. A code mutation would have proved the
   * assertion is wired; this proves it discriminates.
   */
  it("PASS SIDE: a hit at T+23h does NOT outlive the key it came from", async () => {
    const { registry, tick } = stubs([{ anchor: "aa" }]);
    await registry.record("aa", 1_700_006); // key written at T0, dies at T0+24h
    await registry.forgetAbove(1_700_003); // Postgres emptied, memo cleared

    // The hit, 23 hours in. Round 3's version memoised this until T0+47h.
    tick(A_DAY_MS - 60 * 60 * 1000);
    expect(await registry.getHeightForAnchor("aa")).toBe(1_700_006);

    // T0+25h: the key is an hour dead. The memo must be too.
    tick(2 * 60 * 60 * 1000);
    expect(await registry.getHeightForAnchor("aa")).toBeNull();
  });

  it("the memo's deadline IS the key's, read rather than recomputed, at any hit time", async () => {
    // Driven over a range of hit times rather than one, because the two
    // deadlines coincide at exactly one point - a hit at T0 - and a test that
    // happened to pick it would pass against both implementations.
    for (const hitAtHours of [1, 6, 12, 18, 23]) {
      const { registry, tick } = stubs([{ anchor: "aa" }]);
      await registry.record("aa", 1_700_006);
      await registry.forgetAbove(1_700_003);
      tick(hitAtHours * 60 * 60 * 1000);
      expect(await registry.getHeightForAnchor("aa"), `hit at +${String(hitAtHours)}h`).toBe(1_700_006);
      // One hour past the KEY's death, whenever the hit was.
      tick((24 - hitAtHours + 1) * 60 * 60 * 1000);
      expect(await registry.getHeightForAnchor("aa"), `read at +25h, hit at +${String(hitAtHours)}h`).toBeNull();
    }
  });

  it("a key with NO expiry is served once and not memoised, because -1 is not a duration", async () => {
    const { registry, redisStore } = stubs([]);
    // A value another writer left with no TTL. `pttl` answers -1.
    redisStore.set("zcashreveal:anchor:cc", "1700009");
    expect(await registry.getHeightForAnchor("cc")).toBe(1_700_009);
    // Removed from the hot tier: with nothing memoised, the next lookup falls
    // through to Postgres, which has no row for it.
    redisStore.delete("zcashreveal:anchor:cc");
    expect(await registry.getHeightForAnchor("cc")).toBeNull();
  });
});

describe("ROUND 4: a hot-tier value this registry could not have written is a MISS, not a height", () => {
  /**
   * `Number()` HAS NO DOMAIN AND EVERY REJECTION BELOW WAS MEASURED. `NaN` is
   * not `null`, so it was returned as a height and reached `tipHeight - height`
   * in `leak-analyzer.ts`, where every comparison against `NaN` is false and a
   * depth silently stops grading. A blank string became `0`, which is a claim
   * that the anchor is the TIP - the strongest statement this analyser can make
   * about a spend, manufactured from an empty value.
   */
  const BAD: ReadonlyArray<readonly [string, string]> = [
    ["not-a-number", "NaN, which is not null and so was returned as a height"],
    ["", "0, which claims the anchor is the tip"],
    ["  ", "0 again, through a different blank"],
    ["1e400", "Infinity"],
    ["0x10", "16 - a hex string silently read as decimal 16"],
    ["9007199254740993", "9007199254740992 - silently rounded past the safe range"],
    ["-5", "a negative height"],
    ["1.5", "a fractional height"],
  ];

  it("every one falls through to Postgres and is reported, rather than becoming a depth", async () => {
    for (const [raw, why] of BAD) {
      const { registry, redisStore, faults } = stubs([]);
      redisStore.set("zcashreveal:anchor:dd", raw);
      expect(await registry.getHeightForAnchor("dd"), `${JSON.stringify(raw)} -> ${why}`).toBeNull();
      expect(faults.map((f) => f.raw), JSON.stringify(raw)).toEqual([raw]);
    }
  });

  it("PASS SIDE: a value this registry DID write is read back unchanged and reported as nothing", async () => {
    const { registry, faults } = stubs([]);
    await registry.record("ee", 1_700_042);
    expect(await registry.getHeightForAnchor("ee")).toBe(1_700_042);
    expect(faults).toEqual([]);
    // And zero is a legal height, so it must NOT be rejected by the parser.
    const z = stubs([]);
    z.redisStore.set("zcashreveal:anchor:ff", "0");
    expect(await z.registry.getHeightForAnchor("ff")).toBe(0);
    expect(z.faults).toEqual([]);
  });
});

describe("ROUND 4: the memo is swept, so it does not grow for the life of the process", () => {
  it("FAIL SIDE, BY DATA: ten thousand lookups that find nothing leave a BOUNDED map", async () => {
    // Measured before the sweep existed: ten thousand misses left ten thousand
    // entries, and a year of clock advance with no reads left the same ten
    // thousand. Nothing evicted but a read that happened to find an entry
    // expired, or a forgetAbove that named it - so an anchor recorded by
    // `onApplied` and never cited again was never freed at all.
    const { registry, tick } = stubs([]);
    for (let i = 0; i < 10_000; i += 1) {
      await registry.getHeightForAnchor(`miss-${String(i)}`);
      // Advance past the deadline every so often so the sweep has work to do.
      if (i % 1000 === 999) tick(A_DAY_MS + 1);
    }
    const size = (registry as unknown as { memo: Map<string, unknown> }).memo.size;
    expect(size).toBeLessThan(10_000);
    expect(size).toBeLessThanOrEqual(2000);
  });

  it("PASS SIDE: an UNEXPIRED entry is never swept away", async () => {
    const { registry } = stubs([]);
    await registry.record("keep", 1_700_100);
    for (let i = 0; i < 1200; i += 1) await registry.getHeightForAnchor(`other-${String(i)}`);
    // No clock advance, so nothing has expired and the recorded entry must still
    // answer without a Postgres round trip.
    expect(await registry.getHeightForAnchor("keep")).toBe(1_700_100);
  });
});

describe("forgetAbove drops the orphaned anchors from all three tiers", () => {
  it("PASS STATE: the rows above the split leave Postgres, AND THE MEMO ENTRY IS GONE - asserted, not only titled", async () => {
    /**
     * THE TITLE SAID "THE MEMO STOPS ANSWERING" AND NOTHING CHECKED THE MEMO.
     * A round-4 reviewer deleted `for (const r of rows) this.memo.delete(...)`
     * - the line the whole seventh-table fix is about - and every test in this
     * file stayed green. So did the three this session added.
     *
     * AND THE REASON IS WORTH MORE THAN THE FIX, because it says what the line
     * is for. The memo clear is INVISIBLE AT THE BOUNDARY: `forgetAbove` does
     * not delete Redis keys (it cannot, see the docblock), the memo now carries
     * the key's own deadline, so the memo can never outlive the tier that would
     * answer with the same height anyway. Every boundary observation is
     * identical with the line and without it. That does not make the line
     * pointless - it stops the memo holding a row Postgres has deleted, which is
     * defence in depth against a future in which the hot tier CAN be cleared -
     * but it does mean a black-box assertion cannot reach it.
     *
     * So this one reads the map. A white-box assertion is the honest instrument
     * for a defence-in-depth line, and calling it that is better than a
     * boundary test whose title claims a behaviour it cannot see.
     */
    const { registry, log } = stubs([{ anchor: "aa" }, { anchor: "bb" }]);
    // Warm the memo the way a live spend would, so there is something in it
    // to go stale.
    await registry.record("aa", 1_700_006);
    expect(await registry.getHeightForAnchor("aa")).toBe(1_700_006);
    const memo = (registry as unknown as { memo: Map<string, unknown> }).memo;
    expect(memo.has("aa")).toBe(true);

    expect(await registry.forgetAbove(1_700_003)).toBe(2);
    expect(log.queries.some((q) => q.startsWith("DELETE FROM anchors WHERE height >"))).toBe(true);
    // THE ASSERTION THE TITLE ALWAYS CLAIMED. Deleting the memo clear turns this
    // red and turns nothing else red, which is exactly what a defence-in-depth
    // line should look like under test.
    expect(memo.has("aa")).toBe(false);
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
