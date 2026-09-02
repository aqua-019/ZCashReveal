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

/**
 * A boundary delta would move value INTO Orchard at or after NU6.3.
 *
 * ZIP 2006 makes Orchard exit-only from that height: no new value may enter it.
 * Under this project's sign convention - positive means value LEFT the pool,
 * negative means it entered - the rule is `deltaZat >= 0` for Orchard, and this
 * error is what a negative one raises.
 *
 * THE THROW IS A STATEMENT ABOUT OUR DECODER, NEVER ABOUT THE CHAIN. A block
 * that reached consensus satisfies the rule by construction; if our replay says
 * otherwise, our replay is wrong. That is why this is a thrown error rather
 * than a logged anomaly or a `Finding` on a report: an anomaly would invite the
 * reader to conclude that Zcash accepted an invalid transaction, which is the
 * most damaging false claim this project could publish.
 */
export class ExitOnlyViolation extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "ExitOnlyViolation";
  }
}

/** An anchor's maxPosition references a commitment position that has not yet been appended. */
export class AnchorOutOfBoundsError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "AnchorOutOfBoundsError";
  }
}

/**
 * A replayed commitment's STORED position is not the one the index assigned it.
 *
 * `pool_commitments.position` is absolute - an NCT index - and a `PoolState`
 * opened at a base assigns positions from that base. The two agree when the
 * state was constructed with the base the rows were written under, and
 * disagree when it was not: a state opened at zero replaying rows written at
 * 73,944,723, a row missing from the middle of a run, or two runs written
 * under different bases. Until HANDOFF-12 `replayInto` ignored the stored
 * position and renumbered silently, so any of those replayed green and every
 * candidate set built on it was wrong by the gap.
 */
export class ReplayPositionMismatchError extends ZCashRevealStateError {
  constructor(message: string) {
    super(message);
    this.name = "ReplayPositionMismatchError";
  }
}
