/**
 * Anchor → block-height registry with Redis hot tier + Postgres cold tier.
 * Used for anchor-depth computation on every shielded spend.
 */

import type { Redis } from "ioredis";
import type { Sql } from "postgres";

/** How long a recorded anchor lives in the hot tier, and now in the memo too. */
const ANCHOR_TTL_S = 60 * 60 * 24;

/** How many memo writes between sweeps of expired entries. See `sweepIfDue`. */
const MEMO_SWEEP_EVERY = 512;

/**
 * A height this registry could have written, or null.
 *
 * WRITTEN AS A PARSER RATHER THAN A `Number()` BECAUSE `Number()` HAS NO
 * DOMAIN. Every rejection below was measured against the real coercion:
 * `"not-a-number"` is `NaN`, `""` and `"  "` are `0`, `"1e400"` is `Infinity`,
 * `"0x10"` is `16`, and `"9007199254740993"` silently becomes
 * `9007199254740992`. A block height is a non-negative safe integer and nothing
 * else, and the string form must round-trip - which is what rejects `"0x10"`
 * and the leading-space forms without a second regex.
 */
function parseAnchorHeight(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  if (String(n) !== raw.trim()) return null;
  return n;
}

/**
 * The one question the analyser asks a registry, as its own type.
 *
 * NARROWED IN HANDOFF-15 SO THE ABSENT-DATABASE CASE HAS SOMEWHERE TO LIVE.
 * `AnalyzeContext.anchorRegistry` was typed as the concrete class, and the
 * class needs a `Sql` - so the mempool path could not run without Postgres
 * without either a nullable field on the hot path or a fake connection. Both
 * are worse than a one-method interface: the first pushes a branch into
 * `leak-analyzer.ts`, which this handoff is not entitled to change, and the
 * second is a lie that typechecks.
 *
 * `AnchorRegistry` SATISFIES THIS STRUCTURALLY AND NO CALL SITE MOVED. The
 * mempool-only implementation is `NO_CHAIN_WRITES.anchors` in
 * `../chain-access.ts`, which answers `null` - "I do not know this root" -
 * which is what the memo and Redis already answer for a root they have not
 * seen, and is precisely NOT a depth of zero.
 */
export interface AnchorHeightSource {
  getHeightForAnchor(anchor: string): Promise<number | null>;
}

export class AnchorRegistry implements AnchorHeightSource {
  private readonly redisKey = "zcashreveal:anchor:";
  /**
   * THE MEMO EXPIRES, AND IT DID NOT UNTIL A GATE ROUND MEASURED THE SENTENCE
   * THAT SAID IT DID. `forgetAbove` clears this map on a reorg, but the next
   * lookup of a forgotten root read Redis - which still holds it, because that
   * tier cannot be cleared from here - and wrote the orphaned height straight
   * back into a map with no expiry. So the documented bound, "an orphaned
   * height answers until the Redis key's TTL elapses", was false: after one
   * read it answered for the life of the process, TTL or no TTL. A reviewer
   * proved it by driving the real class against a Redis fake that remembers
   * what it was told, which the first version of the test could not do.
   *
   * The entry now carries the Redis key's OWN REMAINING deadline - read with
   * `pttl` on the hit path - and an expired entry is a miss. It said "the same
   * 24-hour deadline" and gave a FRESH 24 hours from the moment of the read,
   * which is the same number only on the `record()` path; on the Redis-hit path,
   * the only one the fix exists for, it doubled the window to about 48 hours. A
   * fourth gate round measured it: the key was dead at T+24h and the registry
   * kept answering until T+47h. That is the third consecutive round in which the
   * defect was inside the previous round's fix.
   */
  private memo = new Map<string, { height: number | null; expiresAt: number }>();
  private writesSinceSweep = 0;

  constructor(
    private readonly redis: Redis,
    private readonly sql: Sql,
    /** Injectable clock, so the expiry above is testable without waiting a day. */
    private readonly now: () => number = Date.now,
    /** Called when the hot tier holds a value this registry could not have written. Injected so a test can watch it. */
    private readonly log?: (key: string, raw: string) => void,
  ) {}

  /**
   * Memoise with an explicit deadline.
   *
   * `ttlMs` IS THE KEY'S REMAINING LIFETIME, NOT A FRESH 24 HOURS, AND THE
   * DIFFERENCE IS THE DEFECT ROUND 4 FOUND IN ROUND 3's OWN FIX. The previous
   * version computed `now() + ANCHOR_TTL_S * 1000` unconditionally. On the
   * `record()` path that IS the key's deadline, because the key is written in
   * the same instant. On the REDIS-HIT path - the only path the whole fix exists
   * for - the key was written at some earlier time T and dies at T + 24h, while
   * the memo entry was given a deadline of (read time) + 24h. A read at T + 23h
   * therefore pinned the height until T + 47h, and the docblock above and
   * RUNTIME.md section 4 both said the two tiers "expire together". Measured
   * against the real class: the Redis key was dead at T + 24h and the registry
   * kept answering `1700006` until T + 47h.
   */
  private remember(anchor: string, height: number | null, ttlMs: number = ANCHOR_TTL_S * 1000): void {
    this.memo.set(anchor, { height, expiresAt: this.now() + ttlMs });
    this.sweepIfDue();
  }

  /**
   * Drop expired entries every {@link MEMO_SWEEP_EVERY} writes.
   *
   * NOTHING ELSE EVICTS. An entry is freed only by a read that finds it expired
   * or by a `forgetAbove` that names it, so an anchor recorded by `onApplied`
   * and never cited by a later spend was never freed at all. Measured: ten
   * thousand lookups that found nothing left ten thousand entries in the map,
   * and a year of clock advance with no reads left the same ten thousand. On a
   * process that indexes for weeks this is a leak with a deadline that nobody
   * reads.
   *
   * ON A COUNTER RATHER THAN ON A TIMER, so there is no handle to unref and no
   * behaviour that depends on a process staying alive between sweeps. The cost
   * is one map iteration per {@link MEMO_SWEEP_EVERY} writes.
   */
  private sweepIfDue(): void {
    this.writesSinceSweep += 1;
    if (this.writesSinceSweep < MEMO_SWEEP_EVERY) return;
    this.writesSinceSweep = 0;
    const now = this.now();
    for (const [anchor, entry] of this.memo) {
      if (entry.expiresAt <= now) this.memo.delete(anchor);
    }
  }

  async getHeightForAnchor(anchor: string): Promise<number | null> {
    const cached = this.memo.get(anchor);
    if (cached !== undefined) {
      if (cached.expiresAt > this.now()) return cached.height;
      this.memo.delete(anchor);
    }

    const rk = this.redisKey + anchor;
    const fromRedis = await this.redis.get(rk);
    if (fromRedis !== null) {
      const h = parseAnchorHeight(fromRedis);
      if (h === null) {
        // A VALUE THIS REGISTRY COULD NOT HAVE WRITTEN IS A MISS, LOUDLY, AND
        // NOT A HEIGHT. `Number()` accepts every string that coerces: measured,
        // `"not-a-number"` becomes `NaN`, `""` and `"  "` become `0`, `"1e400"`
        // becomes `Infinity` and `"0x10"` becomes `16`. `NaN` is not `null`, so
        // it was returned as a height and reached `tipHeight - height` in
        // `leak-analyzer.ts`, where every comparison against `NaN` is false and
        // a depth silently stops grading. A zero is worse: it is a claim that
        // the anchor is the tip, which is the strongest statement this analyser
        // can make about a spend, manufactured from a blank string. Falling
        // through to Postgres is the honest answer, because Postgres is where a
        // height this registry wrote actually lives.
        this.log?.(rk, fromRedis);
      } else {
        // THE KEY'S OWN REMAINING LIFETIME. `pttl` answers -2 for a key that has
        // vanished between the `get` and here, and -1 for one with no expiry -
        // which this registry never writes, but another writer might. Neither is
        // a duration, so neither is memoised: a value with no readable deadline
        // is served once and looked up again next time, which is slower and
        // cannot outlive the tier it came from.
        const pttl = await this.redis.pttl(rk);
        if (pttl > 0) this.remember(anchor, h, pttl);
        return h;
      }
    }

    const rows = await this.sql<{ height: number }[]>`
      SELECT height FROM anchors WHERE anchor = ${anchor} LIMIT 1
    `;
    const found = rows[0]?.height ?? null;
    if (found !== null) {
      await this.redis.set(rk, found, "EX", ANCHOR_TTL_S);
    }
    // Written in this instant, so a fresh full TTL IS this key's deadline.
    this.remember(anchor, found);
    return found;
  }

  /**
   * Forget every anchor recorded ABOVE `height`, in all three tiers.
   *
   * A REORG ROLLS BACK SIX TABLES AND THIS IS THE SEVENTH PLACE A HEIGHT IS
   * WRITTEN. `rollbackAllToHeight` deletes above the split from the six chain
   * tables; this registry is a different table, written from the follower's
   * `onApplied`, and before HANDOFF-12 nothing wrote it at all - so nothing
   * could be stale in it. Now that something does, an orphaned branch's roots
   * would otherwise answer `getHeightForAnchor` forever, and every mempool
   * spend citing one would be given an anchor depth measured from a block the
   * network abandoned. Found by a gate reviewer.
   *
   * TWO TIERS OF THREE, AND THE THIRD IS NAMED RATHER THAN QUIETLY SKIPPED.
   * The cold tier (Postgres) and the in-process memo are cleared here. The
   * Redis hot tier is NOT, and cannot be from this file: `check-redis-safety`
   * rule 4 permits `DEL` only on a `zecreveal:` string LITERAL, and these keys
   * are computed per root - the guard cannot see that they are exact keys this
   * project wrote in the VPS instance, and it is not this handoff's to widen a
   * rule that protects another project's database. So `getHeightForAnchor` can
   * still answer with an orphaned height until that key's 24-hour TTL expires,
   * because Redis is read before Postgres. What the two tiers cleared here do
   * buy: the answer is no longer permanent, and a process restart (which drops
   * the memo) plus the TTL bounds it at a day rather than forever. The
   * AND THE MEMO CLEAR ONLY BOUNDS ANYTHING BECAUSE THE MEMO NOW EXPIRES.
   * `getHeightForAnchor` reads memo, then Redis, then Postgres, and
   * REPOPULATES the memo from a Redis hit - so the next lookup of a forgotten
   * root puts the orphaned height straight back. While the memo had no
   * deadline that put it back FOREVER, and the sentence above about the TTL
   * bounding the window was false; a gate reviewer measured exactly that,
   * against a Redis double that remembers what it was told. The memo entry now
   * carries the Redis key's own REMAINING deadline, read with `pttl` at the
   * moment of the hit, so the two tiers expire together and the answer becomes
   * null when they do. Round 3 wrote that sentence and gave the entry a fresh
   * 24 hours instead, which made it true of the `record()` path and false of the
   * one it was about; round 4 measured the gap at 23 hours.
   *
   * The remedies - a real VPS-target proof at the deletion site, or moving the
   * registry's Redis writes behind one - are a ledger question, not a silent
   * choice. See docs/2.0/RUNTIME.md section 4.
   */
  async forgetAbove(height: number): Promise<number> {
    const rows = await this.sql<{ anchor: string }[]>`
      DELETE FROM anchors WHERE height > ${height} RETURNING anchor
    `;
    for (const r of rows) this.memo.delete(r.anchor);
    return rows.length;
  }

  async record(anchor: string, height: number): Promise<void> {
    await this.sql`
      INSERT INTO anchors (anchor, height, first_seen_at)
      VALUES (${anchor}, ${height}, NOW())
      ON CONFLICT (anchor) DO NOTHING
    `;
    await this.redis.set(this.redisKey + anchor, height, "EX", ANCHOR_TTL_S);
    this.remember(anchor, height);
  }
}
