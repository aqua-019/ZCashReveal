/**
 * The confirmed-block driver: one verbosity-2 block into the four pools'
 * state, cross-checked against the node's own accounting of the same block,
 * then persisted as one unit (HANDOFF-12, section 3: decode, append state,
 * write persistence, write a pool_snapshots row).
 *
 * WHAT IS CHECKED ON EVERY BLOCK, AND WHY A DISAGREEMENT STOPS THE PROCESS.
 * A verbosity-2 block carries the node's cumulative `chainValueZat` and signed
 * `valueDeltaZat` per pool, and each tree's cumulative size. After this
 * driver has applied the block's own transactions, its per-pool delta must
 * equal the node's delta, its running balance must equal the node's
 * cumulative figure, and its commitment count must equal the node's tree
 * size - A1, executed live rather than only over the committed captures. A
 * consensus-valid block cannot be wrong about these; a disagreement means
 * THIS decode is wrong, and the state layer's own rule applies (see
 * `ExitOnlyViolation`): throw, never log an anomaly, never publish the number.
 * The block is not written, and the in-memory state is left dirty on
 * purpose - the follower treats the error as fatal, the process exits, and a
 * restart replays the last block that WAS written.
 *
 * THE IRONWOOD ANCHOR NEEDS A SECOND CALL, AND ONLY WHERE IT EXISTS
 * (deliverable 2). `getblock` carries no Ironwood root; `z_gettreestate` does,
 * for every NU6.3-active height. `decodeBlock` marks the blocks that appended
 * Ironwood commitments with `ironwoodAnchorPendingTreestate`, which is exactly
 * the set of heights at which an Ironwood anchor exists that the block cannot
 * supply, so the treestate is fetched at those and at no other. The anchor's
 * root comes from that response; its `maxPosition` is the block's own
 * `trees.ironwood.size - 1`, and the two halves are cross-checked against each
 * other through the commitment count the tree-size check has just proved
 * equal to the node's. A response that is withheld, names a different block,
 * or carries no Ironwood root produces NO anchor and a logged notice - never a
 * fabricated root - which is the fail side section 5 asks for.
 *
 * THE SPROUT DELTA COMES FROM THE RAW BLOCK, as `boundaryDeltasOf`'s docblock
 * says it must: Sprout's movement is a JoinSplit sum the structural decode
 * does not carry, and it is computed here from `vjoinsplit` by the same
 * function the mempool analyser uses, so the two paths cannot disagree.
 */
import type { Logger } from "pino";
import type {
  Anchor,
  BoundaryDelta,
  Commitment,
  Hex,
  Pool,
  SpentNullifier,
} from "@zcashreveal/types";
import type { GetTreestate, RpcBlock } from "@zcashreveal/zebra-rpc";

import { boundaryDeltasOf, decodeBlock } from "../decoder/block-decoder.js";
import { sproutValueBalanceZat } from "../decoder/sprout.js";
import type { PoolState } from "../state/pool-state.js";
import { POOLS, valuePoolEntry, type ChainState } from "./chain-state.js";
import type { BlockWrites, ChainStore } from "./chain-store.js";
import { ChainContinuityError, ChainPersistenceError, TreeSizeMismatchError, ValueAccountingMismatchError } from "./errors.js";

/**
 * Where an Ironwood treestate comes from. `null` means the response was
 * withheld - a node that does not serve it, or a test exercising the fail
 * side. A thrown error is a TRANSPORT failure and propagates: an anchor
 * skipped on a transient fault would never be retried, since the block it
 * belongs to would already be written, so the block is not applied and the
 * follower tries again.
 */
export type TreestateSource = (hash: Hex) => Promise<GetTreestate | null>;

export type BlockNoticeCode =
  /** The treestate source returned nothing for this block. */
  | "IRONWOOD_TREESTATE_ABSENT"
  /** A treestate came back, but it names a different block than the one asked for. */
  | "IRONWOOD_TREESTATE_MISMATCH"
  /** A treestate came back for this block with no `ironwood.commitments.finalRoot`. */
  | "IRONWOOD_ROOT_ABSENT"
  /** The block appended Ironwood commitments and reports no `trees.ironwood.size`, so an anchor has no `maxPosition`. */
  | "IRONWOOD_TREE_SIZE_ABSENT"
  /** The block carries no `valuePools` entry with a delta for this pool, so A1's check did not run for it. */
  | "VALUE_POOLS_ABSENT"
  /** The block carries no `trees.<pool>.size`, so the tree-size check did not run for it. */
  | "TREES_ABSENT";

export interface BlockNotice {
  readonly code: BlockNoticeCode;
  readonly pool?: Pool;
  readonly message: string;
}

/** What one block did to each pool, as the driver measured it: the figures A1 compares to the node's. */
export interface PoolAccounting {
  /** Signed, in the node's convention: positive means the pool GREW. */
  readonly deltaZat: bigint;
  readonly balanceZat: bigint;
  readonly commitmentCount: bigint;
}

export interface AppliedBlock {
  readonly height: number;
  readonly hash: Hex;
  /** Every anchor recorded for this block, Ironwood's included when the treestate supplied a root. */
  readonly anchors: ReadonlyArray<Anchor>;
  readonly notices: ReadonlyArray<BlockNotice>;
  readonly writes: BlockWrites;
  readonly accounting: Readonly<Record<Pool, PoolAccounting>>;
}

export interface ApplyDeps {
  readonly treestate: TreestateSource;
  readonly log: Logger;
}

/**
 * Apply `block` to `chain`, check it against the node's figures on the same
 * block, persist it, and advance the chain's tip.
 *
 * @throws ChainContinuityError if the block does not extend `chain` - the
 *   follower's cue to resolve a reorg. Nothing has been mutated when this is
 *   thrown.
 * @throws ValueAccountingMismatchError, TreeSizeMismatchError, or any state
 *   error, if the decode disagrees with consensus. The in-memory state is
 *   dirty when these are thrown; see the module header.
 */
export async function applyConfirmedBlock(
  chain: ChainState,
  block: RpcBlock,
  store: ChainStore,
  deps: ApplyDeps,
): Promise<AppliedBlock> {
  const height = block.height;
  if (height !== chain.height + 1) {
    throw new ChainContinuityError(`block ${height} does not follow the chain tip at ${chain.height}`);
  }
  if (chain.hash !== null) {
    if (block.previousblockhash === undefined) {
      throw new ChainContinuityError(`block ${height} names no previousblockhash, so it cannot be shown to extend ${chain.hash}`);
    }
    if (block.previousblockhash !== chain.hash) {
      throw new ChainContinuityError(
        `block ${height} extends ${block.previousblockhash}, not this chain's tip ${chain.hash} at ${chain.height}`,
      );
    }
  }

  const decoded = decodeBlock(block);

  // THE TREESTATE IS FETCHED BEFORE ANY MUTATION OF `chain`, NOT AFTER, AND
  // THE ORDER IS THE WHOLE POINT. `chain.pools.*` is append-only with no undo,
  // and `TreestateSource`'s own contract above says a transport failure here
  // leaves the block unapplied "so the follower tries again". That promise was
  // false while the fetch sat below the commitment loop: the failing attempt
  // had already appended this block's commitments to the in-memory state the
  // follower reuses across steps, so the retry threw
  // `CommitmentAlreadyExistsError` - which `isFatal` reads as a consensus
  // disagreement, stopping the process over one dropped RPC call. Found by a
  // gate reviewer reading the order, reproduced by making the suite's own
  // "the anchor is retried with it" test actually retry, and fixed here rather
  // than by teaching the retry to tolerate a dirty state.
  const treestate: GetTreestate | null =
    decoded.ironwoodAnchorPendingTreestate && decoded.ironwoodTreeSize !== null
      ? await deps.treestate(block.hash)
      : null;

  const notices: BlockNotice[] = [];
  const commitments: Commitment[] = [];
  const nullifiers: Array<{ record: SpentNullifier; anchorRoot: Hex | null }> = [];

  // COMMITMENTS AND NULLIFIERS, IN TRANSACTION ORDER, which is tree order:
  // Sapling outputs in order, then each Orchard-shaped bundle's actions in
  // order. Every Orchard-shaped action publishes both a nullifier and a cmx.
  for (const tx of decoded.txs) {
    for (const o of tx.saplingOutputs) {
      const position = chain.pools.sapling.commitments.append({ pool: "sapling", cmId: o.cmu, txid: tx.txid, height });
      commitments.push({ pool: "sapling", cmId: o.cmu, position, txid: tx.txid, height });
    }
    for (const a of tx.orchardActions) {
      const position = chain.pools.orchard.commitments.append({ pool: "orchard", cmId: a.cmx, txid: tx.txid, height });
      commitments.push({ pool: "orchard", cmId: a.cmx, position, txid: tx.txid, height });
    }
    for (const a of tx.ironwoodActions) {
      const position = chain.pools.ironwood.commitments.append({ pool: "ironwood", cmId: a.cmx, txid: tx.txid, height });
      commitments.push({ pool: "ironwood", cmId: a.cmx, position, txid: tx.txid, height });
    }
    for (const s of tx.saplingSpends) {
      const record: SpentNullifier<"sapling"> = { pool: "sapling", nfId: s.nullifier, spentTxid: tx.txid, spentHeight: height };
      chain.pools.sapling.nullifiers.record(record);
      nullifiers.push({ record, anchorRoot: s.anchor });
    }
    for (const a of tx.orchardActions) {
      const record: SpentNullifier<"orchard"> = { pool: "orchard", nfId: a.nullifier, spentTxid: tx.txid, spentHeight: height };
      chain.pools.orchard.nullifiers.record(record);
      nullifiers.push({ record, anchorRoot: tx.orchardAnchor });
    }
    for (const a of tx.ironwoodActions) {
      const record: SpentNullifier<"ironwood"> = { pool: "ironwood", nfId: a.nullifier, spentTxid: tx.txid, spentHeight: height };
      chain.pools.ironwood.nullifiers.record(record);
      nullifiers.push({ record, anchorRoot: tx.ironwoodAnchor });
    }
  }

  // VALUE. The structural decode's three pools, then Sprout from the raw
  // transactions, each pool in transaction order.
  const deltas: BoundaryDelta[] = boundaryDeltasOf(decoded);
  for (const tx of block.tx) {
    const sprout = sproutValueBalanceZat(tx);
    if (sprout !== 0n) deltas.push({ pool: "sprout", txid: tx.txid, height, deltaZat: sprout });
  }
  const boundaryFlows: Array<{ record: BoundaryDelta; txSeq: number }> = [];
  const seq = new Map<string, number>();
  const moved: Record<Pool, bigint> = { sprout: 0n, sapling: 0n, orchard: 0n, ironwood: 0n };
  for (const d of deltas) {
    applyDelta(chain, d);
    const key = `${d.pool}:${d.txid}`;
    const txSeq = seq.get(key) ?? 0;
    seq.set(key, txSeq + 1);
    boundaryFlows.push({ record: d, txSeq });
    moved[d.pool] += d.deltaZat;
  }

  // A1, ON THIS BLOCK. `valueDeltaZat` is signed in the node's convention -
  // positive means the pool grew - and a BoundaryDelta is signed in this
  // project's: positive means value LEFT. So the node's delta is minus ours.
  const accounting = {} as { [P in Pool]: PoolAccounting };
  for (const pool of POOLS) {
    const state = chain.pools[pool];
    const deltaZat = -moved[pool];
    accounting[pool] = { deltaZat, balanceZat: state.value.balance(), commitmentCount: state.commitments.size() };
    const entry = valuePoolEntry(block, pool);
    if (entry === undefined || entry.valueDeltaZat === undefined) {
      notices.push({
        code: "VALUE_POOLS_ABSENT",
        pool,
        message: `block ${height} carries no valuePools delta for ${pool}; the value cross-check did not run for it`,
      });
      continue;
    }
    if (entry.valueDeltaZat !== deltaZat) {
      throw new ValueAccountingMismatchError(
        `${pool} at ${height}: this build's delta is ${deltaZat} zat and the node's valueDeltaZat is ${entry.valueDeltaZat}`,
      );
    }
    if (entry.chainValueZat !== state.value.balance()) {
      throw new ValueAccountingMismatchError(
        `${pool} at ${height}: this build's balance is ${state.value.balance()} zat and the node's chainValueZat is ${entry.chainValueZat}`,
      );
    }
  }

  // TREE SIZES. An absent `trees.ironwood` is an EMPTY tree by PR #10888's
  // `skip_serializing_if`, so it checks as zero; an absent `trees` object, or
  // an absent Sapling or Orchard entry, is a node that does not report them.
  for (const pool of ["sapling", "orchard", "ironwood"] as const) {
    const reported = block.trees?.[pool]?.size;
    const expected = reported !== undefined ? BigInt(reported) : pool === "ironwood" && block.trees !== undefined ? 0n : null;
    if (expected === null) {
      notices.push({ code: "TREES_ABSENT", pool, message: `block ${height} carries no trees.${pool}.size; the tree-size cross-check did not run for it` });
      continue;
    }
    const ours = chain.pools[pool].commitments.size();
    if (ours !== expected) {
      throw new TreeSizeMismatchError(
        `${pool} at ${height}: this build counts ${ours} commitments and the node reports ${expected}`,
      );
    }
  }

  // ANCHORS. Sapling and Orchard from the block; Ironwood from the treestate,
  // at exactly the heights the decoder marks.
  const anchors: Anchor[] = [];
  if (decoded.saplingAnchor !== null) {
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: decoded.saplingAnchor.root,
      heightCreated: height,
      maxPosition: chain.pools.sapling.commitments.size() - 1n,
    };
    chain.pools.sapling.recordAnchor(anchor);
    anchors.push(anchor);
  }
  if (decoded.orchardAnchor !== null) {
    const anchor: Anchor<"orchard"> = {
      pool: "orchard",
      root: decoded.orchardAnchor.root,
      heightCreated: height,
      maxPosition: chain.pools.orchard.commitments.size() - 1n,
    };
    chain.pools.orchard.recordAnchor(anchor);
    anchors.push(anchor);
  }
  if (decoded.ironwoodAnchorPendingTreestate) {
    const ironwoodAnchor = ironwoodAnchorFrom(block, decoded.ironwoodTreeSize, treestate, notices);
    if (ironwoodAnchor !== null) {
      chain.pools.ironwood.recordAnchor(ironwoodAnchor);
      anchors.push(ironwoodAnchor);
    }
  }

  for (const n of notices) {
    deps.log.warn({ height, code: n.code, ...(n.pool === undefined ? {} : { pool: n.pool }) }, n.message);
  }

  const writes: BlockWrites = {
    block: { height, timeS: block.time, hash: block.hash },
    commitments,
    anchors,
    nullifiers,
    boundaryFlows,
    snapshots: POOLS.map((pool) => chain.pools[pool].snapshot(height)),
  };
  // A STORE FAILURE HERE IS FATAL, NOT RETRYABLE, BECAUSE THE STATE IS ALREADY
  // DIRTY. Everything above this line has mutated `chain.pools.*`, which is
  // append-only with no undo, and the writes below are derived from the
  // positions those mutations produced - so this call cannot be hoisted above
  // them the way `c53f2ba` hoisted the treestate fetch. Left raw, the error was
  // neither a `ChainRuntimeError` nor a state error, `isFatal` read false, and
  // the follower retried the same block into a state that already held it:
  // `CommitmentAlreadyExistsError`, which IS fatal and says the build disagrees
  // with consensus. A dropped Postgres connection stopped the process and
  // blamed the decoder. Named as what it is, it stops on the first failure and
  // a restart replays the last block that was actually written.
  try {
    await store.writeBlock(writes);
  } catch (err) {
    throw new ChainPersistenceError(
      `the store refused block ${height} after the in-memory state had been mutated; this state cannot be reconciled in place, so the process must restart and replay from the last written block`,
      err,
    );
  }
  chain.height = height;
  chain.hash = block.hash;
  return { height, hash: block.hash, anchors, notices, writes, accounting };
}

/**
 * The Ironwood anchor for a block that appended Ironwood commitments, or
 * `null` with the reason recorded as a notice. The root is the node's; the
 * `maxPosition` is the block's own tree size minus one; and a treestate that
 * names a different block is refused, because a root from another block is
 * the one thing worse than no root.
 */
function ironwoodAnchorFrom(
  block: RpcBlock,
  treeSize: bigint | null,
  treestate: GetTreestate | null,
  notices: BlockNotice[],
): Anchor<"ironwood"> | null {
  const height = block.height;
  if (treeSize === null) {
    notices.push({
      code: "IRONWOOD_TREE_SIZE_ABSENT",
      pool: "ironwood",
      message: `block ${height} appended Ironwood commitments but reports no trees.ironwood.size; no anchor recorded`,
    });
    return null;
  }
  if (treestate === null) {
    notices.push({
      code: "IRONWOOD_TREESTATE_ABSENT",
      pool: "ironwood",
      message: `no treestate for block ${height} (${block.hash}); the Ironwood anchor for this height is not recorded`,
    });
    return null;
  }
  if (treestate.hash !== block.hash || treestate.height !== height) {
    notices.push({
      code: "IRONWOOD_TREESTATE_MISMATCH",
      pool: "ironwood",
      message: `the treestate for ${block.hash} names ${treestate.hash} at ${treestate.height}; refused, no anchor recorded`,
    });
    return null;
  }
  const root = treestate.ironwood?.commitments.finalRoot;
  if (root === undefined) {
    notices.push({
      code: "IRONWOOD_ROOT_ABSENT",
      pool: "ironwood",
      message: `the treestate for block ${height} carries no ironwood.commitments.finalRoot; no anchor recorded`,
    });
    return null;
  }
  return { pool: "ironwood", root, heightCreated: height, maxPosition: treeSize - 1n };
}

/** `ValuePool.apply` on the pool a delta names, with the generic narrowed per pool. */
function applyDelta(chain: ChainState, d: BoundaryDelta): void {
  switch (d.pool) {
    case "sprout":
      (chain.pools.sprout as PoolState<"sprout">).value.apply(d as BoundaryDelta<"sprout">);
      return;
    case "sapling":
      chain.pools.sapling.value.apply(d as BoundaryDelta<"sapling">);
      return;
    case "orchard":
      chain.pools.orchard.value.apply(d as BoundaryDelta<"orchard">);
      return;
    case "ironwood":
      chain.pools.ironwood.value.apply(d as BoundaryDelta<"ironwood">);
      return;
  }
}
