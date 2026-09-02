/**
 * PoolState — S^p_h, the composition of the four per-pool indexes into
 * the full state machine described in RESEARCH.md.
 *
 * The five files in this directory each implement one component:
 *
 *   commitment-index.ts → T^p_h      append-only commitment tree
 *   anchor-index.ts     → Roots^p_h  set of valid anchors with max positions
 *   nullifier-index.ts  → NFSet^p_h  spent nullifier set
 *   value-pool.ts       → Bal^p_h    pool balance via turnstile deltas
 *   pool-state.ts       → S^p_h      composition + cross-index invariants
 *
 * Each index is pool-typed (`<P extends Pool>`) so the four pools' state are
 * distinct types at compile time. Inside an index, the generic parameter is
 * mostly unused at runtime — it exists to make cross-pool data corruption
 * impossible to express. `ValuePool` is the exception since HANDOFF-06: it
 * reads its own pool at runtime to enforce Orchard's exit-only rule.
 *
 * PoolState owns only the cross-index invariant: an anchor's maxPosition
 * must reference a real commitment position (`< commitments.size()`).
 * Everything else is locally enforced by the individual indexes.
 */

import type { Anchor, Pool, PoolStateSnapshot } from "@zcashreveal/types";
import type { Network } from "@zcashreveal/instruments";
import { CommitmentIndex } from "./commitment-index.js";
import { AnchorIndex } from "./anchor-index.js";
import { NullifierIndex } from "./nullifier-index.js";
import { ValuePool } from "./value-pool.js";
import { AnchorOutOfBoundsError } from "./errors.js";

/**
 * Where a pool's state STARTS when it is not indexed from the pool's birth
 * (HANDOFF-12): the tree size and the balance at the height before the first
 * block this state will see. Both are the node's own figures for that height -
 * `trees.<pool>.size` and `valuePools[].chainValueZat` on a verbosity-2 block -
 * so the state's `commitments.size()` and `value.balance()` are the quantities
 * the node reports, not counters that happen to start where the indexer did.
 */
export interface PoolStateBase {
  readonly commitmentBase: bigint;
  readonly openingBalanceZat: bigint;
}

export class PoolState<P extends Pool> {
  public readonly commitments: CommitmentIndex<P>;
  public readonly anchors: AnchorIndex<P>;
  public readonly nullifiers: NullifierIndex<P>;
  public readonly value: ValuePool<P>;

  /**
   * @param pool which pool this state machine tracks.
   * @param network which network's activation heights the value invariants
   *   use. Passed straight through to `ValuePool`, which is the only component
   *   whose rules are height-dependent. Defaults to mainnet.
   * @param base the tree size and balance this state opens at. Omitted means
   *   a pool indexed from its birth - which every existing construction site
   *   is, and the live indexer is not. See {@link PoolStateBase}.
   */
  constructor(
    public readonly pool: P,
    public readonly network: Network = "mainnet",
    base?: PoolStateBase,
  ) {
    this.commitments = new CommitmentIndex<P>(pool, base?.commitmentBase ?? 0n);
    this.anchors = new AnchorIndex<P>(pool);
    this.nullifiers = new NullifierIndex<P>(pool);
    this.value = new ValuePool<P>(pool, network, base?.openingBalanceZat ?? 0n);
  }

  /**
   * Record an anchor while enforcing the cross-index invariant that
   * `anchor.maxPosition` references a real commitment position
   * (i.e. `maxPosition < commitments.size()`). Use this in place of
   * `anchors.record()` whenever commitment state has been populated.
   *
   * @throws AnchorOutOfBoundsError if `maxPosition >= commitments.size()`.
   */
  recordAnchor(anchor: Anchor<P>): void {
    const size = this.commitments.size();
    if (anchor.maxPosition >= size) {
      throw new AnchorOutOfBoundsError(
        `anchor ${anchor.root} maxPosition=${anchor.maxPosition} ` +
          `>= ${this.pool} commitments.size()=${size}`,
      );
    }
    this.anchors.record(anchor);
  }

  /** Full point-in-time snapshot. */
  snapshot(height: number): PoolStateSnapshot<P> {
    return {
      pool: this.pool,
      height,
      commitmentCount: this.commitments.size(),
      anchorCount: this.anchors.snapshot().anchorCount,
      nullifierCount: this.nullifiers.snapshot().nullifierCount,
      balanceZat: this.value.balance(),
    };
  }
}

/**
 * The four pools' state machines as one value - what the confirmed-block
 * driver maintains and what the mempool analyser reads (HANDOFF-12).
 *
 * A mapped type rather than four named fields so the pool literal indexes it:
 * `states[spend.pool]` is a `PoolState<typeof spend.pool>` and a cross-pool
 * lookup does not typecheck, which is the same guarantee each index gives on
 * its own carried up one level.
 */
export type PoolStates = { readonly [P in Pool]: PoolState<P> };
