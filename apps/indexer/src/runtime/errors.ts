/**
 * Errors the confirmed-block runtime raises (HANDOFF-12).
 *
 * TWO FAMILIES, AND THE FOLLOWER TREATS THEM DIFFERENTLY. A
 * {@link ChainContinuityError} is a fact about the CHAIN - the block fetched
 * for height h+1 does not extend the block this state holds at h - and the
 * follower answers it with a reorg. Everything else here, and every
 * `ZCashRevealStateError` from the state layer, is a fact about THIS BUILD:
 * our decode of a consensus-valid block disagrees with the node's own
 * accounting of it. That is never the chain's fault, the block is not
 * written, and the process stops rather than publishing a number it has just
 * proved wrong - `docs/2.0/RUNTIME.md` lists each under failure modes.
 */

export class ChainRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainRuntimeError";
  }
}

/** The block does not extend the chain this state holds: a height gap or a `previousblockhash` that is not our tip. */
export class ChainContinuityError extends ChainRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "ChainContinuityError";
  }
}

/**
 * Our per-pool delta or running balance disagrees with the node's
 * `valuePools` for the same block (A1, executed on every block rather than
 * only in a test). The node's figure is consensus; ours is a decode.
 */
export class ValueAccountingMismatchError extends ChainRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "ValueAccountingMismatchError";
  }
}

/** Our commitment count after a block disagrees with `trees.<pool>.size` on that block. */
export class TreeSizeMismatchError extends ChainRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "TreeSizeMismatchError";
  }
}

/** The node's chain diverged from ours below the height this state opened at; nothing here can be rolled back that far. */
export class ReorgBelowBaseError extends ChainRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "ReorgBelowBaseError";
  }
}

/** A block from which a base was to be derived carries no `valuePools`, or no tree size for a pool it moved. */
export class ChainBaseUnavailableError extends ChainRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "ChainBaseUnavailableError";
  }
}
