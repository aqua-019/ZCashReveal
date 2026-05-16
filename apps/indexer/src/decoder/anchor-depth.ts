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
