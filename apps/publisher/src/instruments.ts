/**
 * The three pool-level instruments, as this app depends on them: by SIGNATURE,
 * injected, and now backed by the real functions.
 *
 * WHAT CHANGED IN HANDOFF-09a, because this file's previous header was a
 * 60-line argument for the opposite and a reader deserves to know which parts
 * survived. HANDOFF-09 could not import the estimators AT ALL. They lived in
 * `apps/indexer/src/analysis/`, and `apps/publisher/Dockerfile` settles what this
 * image may contain: its build stage copies `packages` and `apps/publisher` and
 * nothing else, its runtime stage copies named workspace dists, and its install
 * stages carry no compiler on purpose - while `@zcashreveal/indexer` depends on
 * `zeromq@6`, a native addon, and its package entry imports a ZMQ subscriber. A
 * worker refused an instruction to import it and was right. So HANDOFF-09
 * declared the five functions as STRUCTURAL MIRRORS of signatures it could not
 * reach, passed {@link NO_INSTRUMENTS} at the composition root, and published
 * `residual`, `drain`, `migrationHist` and `neffSeries` as `null` on every tip.
 *
 * EVERY ONE OF THOSE FOUR REASONS IS STILL TRUE, and none of them is about the
 * estimators - they are about `apps/indexer`. HANDOFF-09a moved the three modules
 * into `@zcashreveal/instruments`, a workspace package under `packages/` that
 * depends on `@zcashreveal/types` and nothing else. That is inside what the
 * Dockerfile already copies, it carries no native addon, and it opens no socket.
 * So the mirrors are gone and the types below come FROM the package. The
 * exposure the old header recorded - "a later edit to one of those three modules
 * that changes a signature is caught by `tsc` only at the composition root, and
 * there is no such root" - is closed by construction: there is one type now, not
 * two, and {@link REAL_INSTRUMENTS} is the root.
 *
 * WHAT KEEPS THE CONSTRAINT FROM BEING RE-BROKEN IS A GUARD, NOT THIS COMMENT.
 * `scripts/check-instrument-deps.mjs` resolves the package's dependency graph
 * transitively through the workspace and fails if `zeromq` or
 * `@zcashreveal/indexer` appears in it. That is the mechanism; this paragraph is
 * only its explanation.
 *
 * THE INJECTION SEAM STAYS, and it is not vestigial. {@link Instruments} keeps
 * every member nullable and {@link NO_INSTRUMENTS} keeps existing, because
 * `SnapshotV1`'s `null` means "not measured" rather than "zero"
 * (`docs/2.0/SNAPSHOT.md` section 8.1: "a `null` renders as an absence and a zero
 * renders as a measurement"). That distinction is the honest way to publish a
 * panel nothing has measured, and deleting the null implementation would remove
 * the only way to say so - as well as the fail side of HANDOFF-09a's A1, which
 * proves the four panels are non-null by watching them go null when the real
 * functions are withheld. The seam is also what lets `snapshot-builder`'s tests
 * drive each panel without a fixture chain behind it.
 */

import type {
  Crossing,
  IronwoodSpend,
  MigrationLens,
  OrchardDrain,
  PoolBalanceSample,
  TurnstileResidual,
  WindowSelection,
} from "@zcashreveal/instruments";
import {
  ironwoodBirth,
  migrationLens,
  orchardDrain,
  selectWindow,
  turnstileResidual,
} from "@zcashreveal/instruments";
import type { IronwoodBirth } from "@zcashreveal/instruments";
import type { Pool } from "@zcashreveal/types";

/**
 * The estimator input and output types, re-exported so this app's other modules
 * keep importing them from the seam rather than reaching past it.
 *
 * `snapshot-builder.ts` imports `Crossing`, `IronwoodSpend` and
 * `PoolBalanceSample` from here, and did so when they were mirrors. They are the
 * real types now and the import sites did not have to change, which is the
 * property that made the mirror worth having in the first place.
 */
export type {
  Crossing,
  DenomBucket,
  IronwoodBirth,
  IronwoodSpend,
  MigrationLens,
  NeffPoint,
  OrchardDrain,
  PoolBalanceSample,
  TurnstileResidual,
  WindowSelection,
} from "@zcashreveal/instruments";

/* ------------------------------------------------------- injected signatures */

export type TurnstileResidualFn = (
  balances: Readonly<Partial<Record<Pool, bigint>>>,
  supplyZat: bigint,
) => TurnstileResidual;

export type SelectWindowFn = (
  pool: Pool,
  series: ReadonlyArray<PoolBalanceSample>,
  opts: { readonly windowHours: number; readonly highHeight: number },
) => WindowSelection;

export type OrchardDrainFn = (
  series: ReadonlyArray<PoolBalanceSample>,
  opts: {
    readonly baselineHeight: number;
    readonly baselineZat: bigint;
    readonly atHeight: number;
  },
) => OrchardDrain;

export type MigrationLensFn = (
  crossings: ReadonlyArray<Crossing>,
  opts: { readonly lowHeight: number; readonly highHeight: number },
) => MigrationLens;

export type IronwoodBirthFn = (
  spends: ReadonlyArray<IronwoodSpend>,
  opts: {
    readonly birthHeight: number;
    readonly lowHeight: number;
    readonly highHeight: number;
  },
) => IronwoodBirth;

/* ----------------------------------------------------------------- bundle */

/**
 * The three modules, as five injected functions.
 *
 * EVERY MEMBER IS NULLABLE AND THE NULL MEANS "NOT MEASURED", NOT "ZERO". That
 * is `SnapshotV1`'s own rule for the panels these produce (SNAPSHOT.md section
 * 8.1), and it is what lets a publisher that cannot measure something publish an
 * honest document rather than a confident one. Since HANDOFF-09a the shipping
 * configuration is {@link REAL_INSTRUMENTS}, where no member is null.
 */
export interface Instruments {
  readonly turnstileResidual: TurnstileResidualFn | null;
  /**
   * WIRED AND NEVER CALLED THROUGH THIS SEAM, which is worth a sentence so a
   * later reader does not assume the bundle controls window selection.
   * `snapshot-builder` never reads this member; the real `orchardDrain` calls
   * the real `selectWindow` internally, so injecting it changes nothing and
   * `NO_INSTRUMENTS` cannot suppress it. It stays because the bundle mirrors the
   * package's five exported functions and a gap would read as an omission.
   */
  readonly selectWindow: SelectWindowFn | null;
  readonly orchardDrain: OrchardDrainFn | null;
  readonly migrationLens: MigrationLensFn | null;
  readonly ironwoodBirth: IronwoodBirthFn | null;
}

/* ------------------------------------------- the signatures are IDENTICAL */

/**
 * `true` only when `A` and `B` are the same type in both directions.
 *
 * WHY ASSIGNMENT IS NOT ENOUGH, WHICH IS A CORRECTION TO THIS FILE'S OWN
 * EARLIER CLAIM (gate round 1, M4). This file used to say that assigning each
 * function into a declared field "makes a signature change in
 * `@zcashreveal/instruments` a `tsc` error HERE", and the commit that deleted
 * the structural mirrors did so on the strength of that sentence. It is true
 * for exactly ONE of the five ways a signature drifts. Measured: a parameter
 * NARROWING errors under `strictFunctionTypes`; a widened parameter, an added
 * OPTIONAL parameter, a required option field becoming optional, and an extra
 * field on the return type all compile clean, because assignability is
 * one-directional and identity is not. The added-optional-parameter case is the
 * one with teeth - a future `network?: "mainnet" | "testnet"` on `migrationLens`
 * would default silently at a call site that never learns it exists.
 *
 * So the claim is made true rather than softened - FOR FOUR OF THE FIVE. The
 * assertions below were measured one shape at a time, rebuilding the package
 * between each: a widened parameter, a narrowed parameter, an added OPTIONAL
 * parameter and a required option field becoming optional all raise
 * `TS2344: Type 'false' does not satisfy the constraint 'true'` here.
 *
 * THE FIFTH CANNOT BE CAUGHT AT THIS SEAM, BY CONSTRUCTION, and saying so is the
 * point of this paragraph. An extra FIELD on a return type - `medianZat` added
 * to `MigrationLens`, say - moves BOTH sides of the `Equals` at once, because
 * `MigrationLensFn` returns the very type the package exports. The same holds
 * for every named type in the five signatures: `Crossing`, `IronwoodSpend`,
 * `PoolBalanceSample`, `TurnstileResidual`, `OrchardDrain`, `IronwoodBirth`,
 * `WindowSelection`. `Equals` only sees what THIS file writes out itself.
 *
 * What does catch that fifth shape today is `src/__tests__/harness.ts`, whose
 * stand-in instruments are hand-written object literals - the last surviving
 * structural mirror, doing by accident the job the mirrors used to do on
 * purpose. Measured: adding a return field turns the build red at
 * `harness.ts:161`, not here. That is worth knowing before anyone deletes or
 * generates that harness, which is why it is written down rather than left to be
 * discovered when the cover disappears.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless its argument is exactly `true`. */
type Assert<T extends true> = T;

export type _SigTurnstileResidual = Assert<Equals<TurnstileResidualFn, typeof turnstileResidual>>;
export type _SigSelectWindow = Assert<Equals<SelectWindowFn, typeof selectWindow>>;
export type _SigOrchardDrain = Assert<Equals<OrchardDrainFn, typeof orchardDrain>>;
export type _SigMigrationLens = Assert<Equals<MigrationLensFn, typeof migrationLens>>;
export type _SigIronwoodBirth = Assert<Equals<IronwoodBirthFn, typeof ironwoodBirth>>;

/**
 * The real estimators. **This is what the composition root passes.**
 *
 * Annotated `Instruments` rather than an inferred object literal, because an
 * inferred literal would widen to whatever the package exports and check
 * nothing. The identity assertions above are what make a signature change fail
 * the build in all five drift shapes rather than only in the one.
 */
export const REAL_INSTRUMENTS: Instruments = {
  turnstileResidual,
  selectWindow,
  orchardDrain,
  migrationLens,
  ironwoodBirth,
};

/**
 * No instruments wired. Every panel these govern publishes as a stated absence.
 *
 * NOT WHAT SHIPS SINCE HANDOFF-09a, and kept for two live reasons rather than
 * out of caution. It is the fail side of A1 - the assertion that the four panels
 * are non-null is only evidence if withholding the functions makes them null -
 * and it is the honest bundle for any future caller that genuinely has not
 * measured. A publisher that passed this today would be publishing four
 * absences, which is why A6 asserts the composition root does not.
 */
export const NO_INSTRUMENTS: Instruments = {
  turnstileResidual: null,
  selectWindow: null,
  orchardDrain: null,
  migrationLens: null,
  ironwoodBirth: null,
};
