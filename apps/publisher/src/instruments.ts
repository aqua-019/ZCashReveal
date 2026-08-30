/**
 * The three pool-level instruments, as this app depends on them: by SIGNATURE,
 * injected, never imported.
 *
 * WHY THE PUBLISHER DOES NOT DEPEND ON `@zcashreveal/indexer`, WHICH IS WHERE
 * THE THREE MODULES LIVE. `apps/publisher/Dockerfile` already exists and this
 * app's shape is not free to contradict it. Three things in that file settle the
 * question and each one alone would:
 *
 *   1. Its build stage copies `packages` and `apps/publisher` and NOTHING ELSE.
 *      `apps/indexer/src` is never in the image, so a `pnpm --filter
 *      @zcashreveal/publisher... build` that had to build the indexer would have
 *      no sources to build.
 *   2. Its runtime stage copies exactly three workspace dists -
 *      `packages/zec-types`, `packages/zebra-rpc`, `packages/content` - and
 *      names them in its header as "three sibling packages". `apps/indexer/dist`
 *      is not among them.
 *   3. Its install stages carry NO COMPILER, on purpose, and the header says why:
 *      "the publisher's dependency tree is pure JavaScript ... adding them here
 *      would enlarge the build for nothing and would quietly let a native
 *      dependency be introduced without anyone noticing it had been."
 *      `@zcashreveal/indexer` depends on `zeromq@6`, which is a native addon -
 *      the indexer's own Dockerfile carries python3/make/g++ for it.
 *
 * There is a fourth, independent reason and it is about runtime rather than
 * build: `apps/indexer`'s package entry point imports its ZMQ subscriber, so
 * importing the barrel at all would load a native addon into a process that
 * writes three keys per block.
 *
 * SO THE THREE FUNCTIONS ARE PARAMETERS. `buildSnapshot` takes an
 * {@link Instruments} bundle and calls whatever it is handed. The types below
 * are structural mirrors of the exported signatures in
 * `apps/indexer/src/analysis/turnstile-accounting.ts`, `migration-lens.ts` and
 * `ironwood-birth.ts`; nothing here reimplements an estimator, and a mirror that
 * drifted from its original is a `tsc` error at the composition root that wires
 * the real function in.
 *
 * WHAT THAT COSTS, RECORDED RATHER THAN LEFT TO BE DISCOVERED. With no
 * instruments wired, `residual`, `drain`, `migrationHist` and `neffSeries` are
 * published as `null`, which `SnapshotV1` permits and `docs/2.0/SNAPSHOT.md`
 * section 8.1 defines as "not measured" rather than as a zero. That is the
 * honest state of a publisher whose image cannot contain the estimators, and it
 * is a smaller defect than either alternative: a build that cannot be built, or
 * four panels of numbers this process invented. The repair is a package move -
 * the three modules into a workspace package the publisher may depend on - and
 * it is a change to files this handoff's publisher worker does not own.
 *
 * WHAT KEEPS A MIRROR HONEST, given that no compiler compares it to its
 * original. Every interface below was read field for field out of
 * `apps/indexer/src/analysis/turnstile-accounting.ts`, `migration-lens.ts` and
 * `ironwood-birth.ts` at the commit this app landed on. Two fields are worth
 * naming because they are the ones a reader would guess wrong:
 * `IronwoodSpend.candidateCount` is a `bigint` and not a count, because Cand_0's
 * bound is derived from a note commitment tree POSITION; and
 * `IronwoodBirth.minNEff` is `number | null`, null for an empty series. The
 * remaining exposure is real and is stated rather than hidden: a later edit to
 * one of those three modules that changes a signature is caught by `tsc` only at
 * the composition root that wires the real function in, and there is no such
 * root while the Dockerfile forbids the dependency. A round of the gate that
 * re-reads the three files against this one is the check until the package move
 * below happens.
 */

import type { ClaimLevel, FilterApplication, Hex, Pool } from "@zcashreveal/types";

/* ------------------------------------------------- turnstile-accounting.ts */

/** Mirror of `PoolBalanceSample`. One pool's balance at one height, with the block's own timestamp. */
export interface PoolBalanceSample {
  readonly height: number;
  /** Block timestamp, milliseconds since epoch. From the chain, never from a clock. */
  readonly timeMs: number;
  readonly balanceZat: bigint;
}

/** Mirror of `TurnstileResidual`. Plan section 3.2's four published figures. */
export interface TurnstileResidual {
  readonly unprovableZat: bigint;
  readonly supplyZat: bigint;
  readonly unprovableShare: number;
  readonly verifiedShare: number;
}

/** Mirror of `WindowSelection`. */
export interface WindowSelection {
  readonly samples: ReadonlyArray<PoolBalanceSample>;
  readonly deltaZat: bigint;
  readonly elapsedHours: number;
  readonly zecPerHour: number | null;
  readonly audit: FilterApplication;
}

/** Mirror of `OrchardDrain`. Plan section 3.3's drain, with both velocities. */
export interface OrchardDrain {
  readonly pool: "orchard";
  readonly baselineHeight: number;
  readonly baselineZat: bigint;
  readonly currentZat: bigint;
  readonly drained: number;
  readonly velocity24hZecPerHour: number | null;
  readonly velocity7dZecPerHour: number | null;
  readonly sampleCount: number;
  readonly audits: ReadonlyArray<FilterApplication>;
}

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

/* ------------------------------------------------------- migration-lens.ts */

/** Mirror of `Crossing`. One Orchard to Ironwood pool crossing. */
export interface Crossing {
  readonly txid: Hex;
  readonly height: number;
  /** The public net amount that crossed. Positive. */
  readonly amountZat: bigint;
}

/** Mirror of `DenomBucket`. Both exponents travel together; see `zip318.ts`. */
export interface DenomBucket {
  readonly n: 1 | 2 | 5;
  readonly kZatoshi: number;
  readonly kZec: number;
  readonly count: number;
  readonly sumZat: bigint;
}

/** Mirror of `MigrationLens`. Distributions and bounds only - there is nowhere to put a wallet. */
export interface MigrationLens {
  readonly lowHeight: number;
  readonly highHeight: number;
  readonly buckets: ReadonlyArray<DenomBucket>;
  readonly canonicalCount: number;
  readonly nonCanonicalCount: number;
  readonly sumZat: bigint;
  readonly strandedDustZat: bigint;
  readonly minNotes: number;
  readonly maxWallets: number;
  /** Crossings over `ZIP318_MAX_CROSSING_ZAT`. A finding, never a rejection. */
  readonly overCapCount: number;
  readonly audit: FilterApplication;
}

export type MigrationLensFn = (
  crossings: ReadonlyArray<Crossing>,
  opts: { readonly lowHeight: number; readonly highHeight: number },
) => MigrationLens;

/* ------------------------------------------------------- ironwood-birth.ts */

/**
 * Mirror of one Ironwood spend the N_eff series is computed over.
 *
 * INFERRED, per this file's header: the module was not in the tree when this was
 * written, and the fields are the handoff's stated signature.
 */
export interface IronwoodSpend {
  readonly txid: Hex;
  readonly height: number;
  readonly pool: Pool;
  /**
   * Cand_0 - the anchor bound of TRACKING-MATH section 3.1, before any soft
   * filter.
   *
   * A `bigint` AND NOT A COUNT, which is the one place the estimator's input
   * leaves CLAUDE.md's "counts are `number`" rule and does so deliberately: the
   * bound is derived from a note commitment tree POSITION, and positions are
   * `bigint` everywhere in this codebase. It becomes a `number` one type later,
   * in {@link NeffPoint}.
   */
  readonly candidateCount: bigint;
}

/** Mirror of `NeffPoint`. Matches `snapshotNeffPointSchema` field for field. */
export interface NeffPoint {
  readonly height: number;
  readonly candidateCount: number;
  readonly nEff: number;
  readonly claimLevel: ClaimLevel;
}

/** Mirror of `IronwoodBirth`. */
export interface IronwoodBirth {
  readonly birthHeight: number;
  readonly lowHeight: number;
  readonly highHeight: number;
  /** Ascending by height. */
  readonly series: ReadonlyArray<NeffPoint>;
  readonly spendCount: number;
  readonly shares: Readonly<Record<ClaimLevel, number>>;
  /** The series' worst case. Null when the series is empty. */
  readonly minNEff: number | null;
  readonly audit: FilterApplication;
}

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
 * 8.1: "a `null` renders as an absence and a zero renders as a measurement"),
 * and it is what lets a publisher whose image cannot carry an estimator publish
 * an honest document rather than a confident one.
 */
export interface Instruments {
  readonly turnstileResidual: TurnstileResidualFn | null;
  readonly selectWindow: SelectWindowFn | null;
  readonly orchardDrain: OrchardDrainFn | null;
  readonly migrationLens: MigrationLensFn | null;
  readonly ironwoodBirth: IronwoodBirthFn | null;
}

/**
 * No instruments wired.
 *
 * The composition root uses this today, for the reason in this file's header.
 * Every panel it governs publishes as `null`, which is a stated absence.
 */
export const NO_INSTRUMENTS: Instruments = {
  turnstileResidual: null,
  selectWindow: null,
  orchardDrain: null,
  migrationLens: null,
  ironwoodBirth: null,
};
