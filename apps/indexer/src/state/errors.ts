/**
 * Error types for the per-pool state machine.
 *
 * Every error thrown by the state classes (CommitmentIndex, AnchorIndex,
 * NullifierIndex, ValuePool, PoolState) extends ZCashRevealStateError so
 * callers can catch the whole family with a single `catch`:
 *
 *   try { ... }
 *   catch (e) {
 *     if (e instanceof ZCashRevealStateError) { ...handle... }
 *     else throw e;
 *   }
 *
 * Specific subclasses preserve enough context (root, txid, current values)
 * for actionable logging — see each constructor's message format.
 */

export class ZCashRevealStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZCashRevealStateError";
  }
}

/** A commitment with this cmId has already been appended. */
export class CommitmentAlreadyExistsError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentAlreadyExistsError";
  }
}

/** An anchor root has already been recorded with different supporting data. */
export class ConflictingAnchorError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictingAnchorError";
  }
}

/** A nullifier has already been recorded as spent. */
export class DoubleSpendError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "DoubleSpendError";
  }
}

/** Applying a boundary delta would drive the pool balance below zero. */
export class NegativeBalanceError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "NegativeBalanceError";
  }
}

/** An anchor's maxPosition references a commitment position that has not yet been appended. */
export class AnchorOutOfBoundsError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "AnchorOutOfBoundsError";
  }
}
