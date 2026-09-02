/**
 * Anchor → block-height registry with Redis hot tier + Postgres cold tier.
 * Used for anchor-depth computation on every shielded spend.
 */

import type { Redis } from "ioredis";
import type { Sql } from "postgres";

export class AnchorRegistry {
  private readonly redisKey = "zcashreveal:anchor:";
  private memo = new Map<string, number | null>();

  constructor(
    private readonly redis: Redis,
    private readonly sql: Sql,
  ) {}

  async getHeightForAnchor(anchor: string): Promise<number | null> {
    const cached = this.memo.get(anchor);
    if (cached !== undefined) return cached;

    const rk = this.redisKey + anchor;
    const fromRedis = await this.redis.get(rk);
    if (fromRedis !== null) {
      const h = Number(fromRedis);
      this.memo.set(anchor, h);
      return h;
    }

    const rows = await this.sql<{ height: number }[]>`
      SELECT height FROM anchors WHERE anchor = ${anchor} LIMIT 1
    `;
    const found = rows[0]?.height ?? null;
    if (found !== null) {
      await this.redis.set(rk, found, "EX", 60 * 60 * 24);
    }
    this.memo.set(anchor, found);
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
   * remedies - a real VPS-target proof at the deletion site, or moving the
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
    await this.redis.set(this.redisKey + anchor, height, "EX", 60 * 60 * 24);
    this.memo.set(anchor, height);
  }
}
