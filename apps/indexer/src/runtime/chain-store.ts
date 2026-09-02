/**
 * What the runtime persists, as an interface with two implementations
 * (HANDOFF-12).
 *
 * `PostgresChainStore` is the production one and is a thin composition of the
 * persistence module's writers, readers and its one rollback, wrapped so that
 * one block's writes are one transaction. `MemoryChainStore` mirrors the SQL
 * semantics row for row - the same height column per table on rollback, the
 * same read orderings - so the reorg property test (A4) and the startup-order
 * test (A2) execute the real driver, the real replay and the real rollback
 * shape without a database. A2's note in section 5 is the reason that matters:
 * `replayInto`'s only callers were two Postgres-gated files, and a test placed
 * there passes vacuously on a runner without Postgres.
 *
 * THE MEMORY STORE IS NOT A MOCK OF THE DATABASE, IT IS A SECOND
 * IMPLEMENTATION OF THE SAME CONTRACT, and the contract's one subtle clause is
 * copied from `rollbackAllToHeight`: rows AT the height survive, rows above it
 * go, and each table decides "above" by its own height column - anchors by
 * `heightCreated`, nullifiers by `spentHeight`, everything else by the block
 * height. The fail side of A4 mutates exactly that clause.
 */
import type { Sql } from "postgres";
import type {
  Anchor,
  BoundaryDelta,
  Commitment,
  Hex,
  Pool,
  PoolStateSnapshot,
  SpentNullifier,
} from "@zcashreveal/types";

import {
  readBlockTimes,
  readHighestBlock,
  readLowestBlock,
  writeBlock,
  type BlockTime,
} from "../persistence/blocks.js";
import { readAllPoolAnchors, writePoolAnchor } from "../persistence/pool-anchors.js";
import { readAllPoolBoundaryFlows, writePoolBoundaryFlow } from "../persistence/pool-boundary-flows.js";
import { readAllPoolCommitments, writePoolCommitment } from "../persistence/pool-commitments.js";
import { readAllPoolNullifiers, writePoolNullifier } from "../persistence/pool-nullifiers.js";
import { readPoolSnapshots, writePoolSnapshot } from "../persistence/pool-snapshots.js";
import { rollbackAllToHeight, type PoolReader } from "../persistence/replay.js";
import { POOLS, type ChainBase } from "./chain-state.js";

/** Everything one confirmed block writes, gathered so a store can commit it as one unit. */
export interface BlockWrites {
  readonly block: BlockTime;
  readonly commitments: ReadonlyArray<Commitment>;
  readonly anchors: ReadonlyArray<Anchor>;
  readonly nullifiers: ReadonlyArray<{ readonly record: SpentNullifier; readonly anchorRoot: Hex | null }>;
  readonly boundaryFlows: ReadonlyArray<{ readonly record: BoundaryDelta; readonly txSeq: number }>;
  readonly snapshots: ReadonlyArray<PoolStateSnapshot>;
}

export interface RollbackCounts {
  readonly commitments: number;
  readonly anchors: number;
  readonly nullifiers: number;
  readonly boundaryFlows: number;
  readonly snapshots: number;
  readonly blocks: number;
}

export interface ChainStore extends PoolReader {
  readBlocks(lowHeight: number, highHeight: number): Promise<BlockTime[]>;
  readSnapshots<P extends Pool>(pool: P, lowHeight: number, highHeight: number): Promise<PoolStateSnapshot<P>[]>;
  /** The base row - `null` on a cold store. */
  readLowestBlock(): Promise<BlockTime | null>;
  /** Where the indexer left off - `null` on a cold store. */
  readHighestBlock(): Promise<BlockTime | null>;
  /**
   * Record where the chain state opened: one `blocks` row at the base height
   * and one snapshot per pool carrying the node's figures for it. `timeS` is
   * the base block's own header time, fetched by the caller, because a row in
   * `blocks` is a block time and never a wall clock.
   */
  writeBase(base: ChainBase, timeS: number): Promise<void>;
  /** One block, as one unit where the store can make it one. */
  writeBlock(writes: BlockWrites): Promise<void>;
  /** Rows above `height` go; rows at it stay. */
  rollbackToHeight(height: number): Promise<RollbackCounts>;
}

/* ============================================================================
   Postgres
   ========================================================================== */

export class PostgresChainStore implements ChainStore {
  constructor(private readonly sql: Sql) {}

  readAllCommitments<P extends Pool>(pool: P): Promise<Commitment<P>[]> {
    return readAllPoolCommitments(pool, this.sql);
  }
  readAllAnchors<P extends Pool>(pool: P): Promise<Anchor<P>[]> {
    return readAllPoolAnchors(pool, this.sql);
  }
  readAllNullifiers<P extends Pool>(pool: P): Promise<SpentNullifier<P>[]> {
    return readAllPoolNullifiers(pool, this.sql);
  }
  readAllBoundaryFlows<P extends Pool>(pool: P): Promise<BoundaryDelta<P>[]> {
    return readAllPoolBoundaryFlows(pool, this.sql);
  }
  readBlocks(lowHeight: number, highHeight: number): Promise<BlockTime[]> {
    return readBlockTimes(lowHeight, highHeight, this.sql);
  }
  readSnapshots<P extends Pool>(pool: P, lowHeight: number, highHeight: number): Promise<PoolStateSnapshot<P>[]> {
    return readPoolSnapshots(pool, lowHeight, highHeight, this.sql);
  }
  readLowestBlock(): Promise<BlockTime | null> {
    return readLowestBlock(this.sql);
  }
  readHighestBlock(): Promise<BlockTime | null> {
    return readHighestBlock(this.sql);
  }

  async writeBase(base: ChainBase, timeS: number): Promise<void> {
    if (base.hash === null) {
      throw new TypeError(`a base can only be persisted with its block hash; height ${base.height} has none`);
    }
    const hash = base.hash;
    await this.sql.begin(async (tx) => {
      await writeBlock({ height: base.height, timeS, hash }, tx);
      for (const pool of POOLS) {
        await writePoolSnapshot(
          {
            pool,
            height: base.height,
            balanceZat: base.pools[pool].openingBalanceZat,
            commitmentCount: base.pools[pool].commitmentBase,
            nullifierCount: 0,
            anchorCount: 0,
          },
          tx,
        );
      }
    });
  }

  /**
   * ONE TRANSACTION PER BLOCK. The persistence writers are each idempotent on
   * their own key, which is what makes a block that failed half-way safe to
   * re-apply - but "safe to re-apply" is a weaker property than "never
   * half-written", and the publisher joins `blocks` to `pool_snapshots` on
   * every tip. A crash between those two writes would hand it a height with a
   * time and no balances. `begin` makes the six writes one unit.
   */
  async writeBlock(w: BlockWrites): Promise<void> {
    await this.sql.begin(async (tx) => {
      for (const c of w.commitments) await writePoolCommitment(c, tx);
      for (const a of w.anchors) await writePoolAnchor(a, tx);
      for (const n of w.nullifiers) await writePoolNullifier(n.record, tx, n.anchorRoot);
      for (const f of w.boundaryFlows) await writePoolBoundaryFlow(f.record, f.txSeq, tx);
      for (const s of w.snapshots) await writePoolSnapshot(s, tx);
      await writeBlock(w.block, tx);
    });
  }

  rollbackToHeight(height: number): Promise<RollbackCounts> {
    return rollbackAllToHeight(height, this.sql);
  }
}

/* ============================================================================
   In memory - the same contract, for the tests that must not skip
   ========================================================================== */

export class MemoryChainStore implements ChainStore {
  readonly blocks = new Map<number, BlockTime>();
  readonly commitments: Commitment[] = [];
  readonly anchors: Anchor[] = [];
  readonly nullifiers: Array<{ record: SpentNullifier; anchorRoot: Hex | null }> = [];
  /** `id` mirrors the BIGSERIAL: read order within a block is write order. */
  readonly boundaryFlows: Array<{ id: number; record: BoundaryDelta; txSeq: number }> = [];
  readonly snapshots: PoolStateSnapshot[] = [];
  private nextFlowId = 1;

  readAllCommitments<P extends Pool>(pool: P): Promise<Commitment<P>[]> {
    const rows = this.commitments.filter((c): c is Commitment<P> => c.pool === pool);
    return Promise.resolve([...rows].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)));
  }
  readAllAnchors<P extends Pool>(pool: P): Promise<Anchor<P>[]> {
    const rows = this.anchors.filter((a): a is Anchor<P> => a.pool === pool);
    return Promise.resolve(
      [...rows].sort((a, b) => a.heightCreated - b.heightCreated || a.root.localeCompare(b.root)),
    );
  }
  readAllNullifiers<P extends Pool>(pool: P): Promise<SpentNullifier<P>[]> {
    const rows = this.nullifiers.map((n) => n.record).filter((n): n is SpentNullifier<P> => n.pool === pool);
    return Promise.resolve([...rows].sort((a, b) => a.spentHeight - b.spentHeight || a.nfId.localeCompare(b.nfId)));
  }
  readAllBoundaryFlows<P extends Pool>(pool: P): Promise<BoundaryDelta<P>[]> {
    const rows = this.boundaryFlows.filter((f) => f.record.pool === pool);
    return Promise.resolve(
      [...rows].sort((a, b) => a.record.height - b.record.height || a.id - b.id).map((f) => f.record as BoundaryDelta<P>),
    );
  }
  readBlocks(lowHeight: number, highHeight: number): Promise<BlockTime[]> {
    return Promise.resolve(
      [...this.blocks.values()].filter((b) => b.height >= lowHeight && b.height <= highHeight).sort((a, b) => a.height - b.height),
    );
  }
  readSnapshots<P extends Pool>(pool: P, lowHeight: number, highHeight: number): Promise<PoolStateSnapshot<P>[]> {
    const rows = this.snapshots.filter(
      (s): s is PoolStateSnapshot<P> => s.pool === pool && s.height >= lowHeight && s.height <= highHeight,
    );
    return Promise.resolve([...rows].sort((a, b) => a.height - b.height));
  }
  readLowestBlock(): Promise<BlockTime | null> {
    const all = [...this.blocks.values()].sort((a, b) => a.height - b.height);
    return Promise.resolve(all[0] ?? null);
  }
  readHighestBlock(): Promise<BlockTime | null> {
    const all = [...this.blocks.values()].sort((a, b) => b.height - a.height);
    return Promise.resolve(all[0] ?? null);
  }

  writeBase(base: ChainBase, timeS: number): Promise<void> {
    if (base.hash === null) {
      throw new TypeError(`a base can only be persisted with its block hash; height ${base.height} has none`);
    }
    this.blocks.set(base.height, { height: base.height, timeS, hash: base.hash });
    for (const pool of POOLS) {
      this.upsertSnapshot({
        pool,
        height: base.height,
        balanceZat: base.pools[pool].openingBalanceZat,
        commitmentCount: base.pools[pool].commitmentBase,
        nullifierCount: 0,
        anchorCount: 0,
      });
    }
    return Promise.resolve();
  }

  writeBlock(w: BlockWrites): Promise<void> {
    // The same idempotency the SQL writers have: DO NOTHING on the pool keys,
    // DO UPDATE on blocks and snapshots.
    for (const c of w.commitments) {
      if (!this.commitments.some((x) => x.pool === c.pool && x.cmId === c.cmId)) this.commitments.push(c);
    }
    for (const a of w.anchors) {
      if (!this.anchors.some((x) => x.pool === a.pool && x.root === a.root)) this.anchors.push(a);
    }
    for (const n of w.nullifiers) {
      const existing = this.nullifiers.find((x) => x.record.pool === n.record.pool && x.record.nfId === n.record.nfId);
      if (existing === undefined) this.nullifiers.push({ record: n.record, anchorRoot: n.anchorRoot });
      else if (
        existing.anchorRoot === null &&
        existing.record.spentTxid === n.record.spentTxid &&
        existing.record.spentHeight === n.record.spentHeight
      ) {
        existing.anchorRoot = n.anchorRoot;
      }
    }
    for (const f of w.boundaryFlows) {
      if (
        !this.boundaryFlows.some(
          (x) => x.record.pool === f.record.pool && x.record.txid === f.record.txid && x.txSeq === f.txSeq,
        )
      ) {
        this.boundaryFlows.push({ id: this.nextFlowId++, record: f.record, txSeq: f.txSeq });
      }
    }
    for (const s of w.snapshots) this.upsertSnapshot(s);
    this.blocks.set(w.block.height, w.block);
    return Promise.resolve();
  }

  rollbackToHeight(height: number): Promise<RollbackCounts> {
    const before = {
      commitments: this.commitments.length,
      anchors: this.anchors.length,
      nullifiers: this.nullifiers.length,
      boundaryFlows: this.boundaryFlows.length,
      snapshots: this.snapshots.length,
      blocks: this.blocks.size,
    };
    // EACH TABLE BY ITS OWN HEIGHT COLUMN, exactly as rollbackAllToHeight.
    retainWhere(this.commitments, (c) => c.height <= height);
    retainWhere(this.anchors, (a) => a.heightCreated <= height);
    retainWhere(this.nullifiers, (n) => n.record.spentHeight <= height);
    retainWhere(this.boundaryFlows, (f) => f.record.height <= height);
    retainWhere(this.snapshots, (s) => s.height <= height);
    for (const h of [...this.blocks.keys()]) if (h > height) this.blocks.delete(h);
    return Promise.resolve({
      commitments: before.commitments - this.commitments.length,
      anchors: before.anchors - this.anchors.length,
      nullifiers: before.nullifiers - this.nullifiers.length,
      boundaryFlows: before.boundaryFlows - this.boundaryFlows.length,
      snapshots: before.snapshots - this.snapshots.length,
      blocks: before.blocks - this.blocks.size,
    });
  }

  private upsertSnapshot(s: PoolStateSnapshot): void {
    const i = this.snapshots.findIndex((x) => x.pool === s.pool && x.height === s.height);
    if (i >= 0) this.snapshots[i] = s;
    else this.snapshots.push(s);
  }
}

function retainWhere<T>(rows: T[], keep: (row: T) => boolean): void {
  let w = 0;
  for (const row of rows) if (keep(row)) rows[w++] = row;
  rows.length = w;
}
