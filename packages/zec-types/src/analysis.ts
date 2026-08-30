/**
 * Analysis-layer types — the public observables consumed by the per-pool
 * state machine and downstream candidate-set construction.
 *
 * Module 1 (this file's first cut) ships the subset needed for the five
 * state classes in apps/indexer/src/state/. Later modules add types for
 * Cand_0/filter results, entropy/N_eff annotations, and claim levels.
 *
 * Every type here describes a *public* observable. No identity-implying
 * fields — see RESEARCH.md for the framing.
 */

import type { Hex } from "./transactions.js";
import type { ShieldedPool } from "./shielded.js";

/**
 * The shielded pools ZCashReveal reasons about, aliased to `ShieldedPool` so
 * there is a single source of truth across the type graph.
 *
 * FOUR SINCE HANDOFF-06 - sprout, sapling, orchard, ironwood. It read "the two
 * shielded pools" until then, and `views.ts` carried a docblock saying this
 * alias was "still the v0.2 pair" and naming HANDOFF-06 as the owner of the
 * widening. Both were true statements that this commit makes false, so both are
 * corrected here rather than left for a reader to trip over.
 *
 * Widening this admits `"sprout"` and `"ironwood"` into every generic below -
 * `Commitment<P>`, `Anchor<P>`, `SpentNullifier<P>`, `BoundaryDelta<P>`,
 * `PoolStateSnapshot<P>`, `CandidateRange<P>`, `ClaimAssessment<P>` - with no
 * accompanying runtime check. The two that now exist are the database CHECK
 * that migration 003 widens, and `ValuePool`'s exit-only guard.
 */
export type Pool = ShieldedPool;

/**
 * A note commitment that has been added to a pool's append-only commitment
 * tree (T^p in RESEARCH.md). `position` is the NCT index assigned on
 * append; positions are monotonic and contiguous from 0n.
 */
export type Commitment<P extends Pool = Pool> = {
  readonly pool: P;
  readonly cmId: Hex;
  readonly position: bigint;
  readonly txid: Hex;
  readonly height: number;
};

/**
 * A note commitment tree root, with the maximum NCT position it commits
 * to. `maxPosition` bounds the raw candidate set for any nullifier that
 * cites this anchor: Cand_0(nf) ⊆ { cm | pos(cm) ≤ maxPosition }.
 */
export type Anchor<P extends Pool = Pool> = {
  readonly pool: P;
  readonly root: Hex;
  readonly heightCreated: number;
  readonly maxPosition: bigint;
};

/**
 * A nullifier that has been published in pool P, marking that some note
 * in T^p has been spent. The mapping from nfId back to a specific
 * commitment is private and cannot be reconstructed from public data —
 * this type only records that the spend happened.
 */
export type SpentNullifier<P extends Pool = Pool> = {
  readonly pool: P;
  readonly nfId: Hex;
  readonly spentTxid: Hex;
  readonly spentHeight: number;
};

/**
 * A per-transaction turnstile boundary delta for pool P.
 *
 * Sign convention (matches Zcash RPC valueBalanceZat and existing decoder):
 *   deltaZat > 0n  → value leaving the pool (unshielding / withdrawal)
 *   deltaZat < 0n  → value entering the pool (shielding / deposit)
 *   deltaZat = 0n  → intra-pool transfer with no public boundary movement
 */
export type BoundaryDelta<P extends Pool = Pool> = {
  readonly pool: P;
  readonly txid: Hex;
  readonly height: number;
  readonly deltaZat: bigint;
};

/**
 * A point-in-time summary of a PoolState. Cheap to compute; safe to log,
 * publish, or compare across heights for monitoring.
 */
export type PoolStateSnapshot<P extends Pool = Pool> = {
  readonly pool: P;
  readonly height: number;
  readonly commitmentCount: bigint;
  readonly anchorCount: number;
  readonly nullifierCount: number;
  readonly balanceZat: bigint;
};

/**
 * Anchor-bounded raw candidate range for a single spend.
 * No filtering — this is Cand_0 from RESEARCH.md.
 *
 * - minPosition is always 0n in Module 3; lower-bound heuristics land in Modules 4-5.
 * - maxPosition is the anchor's maxPosition (the highest commitment position the anchor sees).
 * - rawCount = maxPosition - minPosition + 1n  (positions are 0-indexed inclusive).
 */
export type CandidateRange<P extends Pool = Pool> = {
  readonly pool: P;
  readonly anchorRoot: Hex;
  readonly minPosition: bigint;
  readonly maxPosition: bigint;
  readonly rawCount: bigint;
};

/**
 * Claim level mapped from N_eff per RESEARCH.md thresholds. Thresholds are
 * chosen so the levels match the "report uncertainty, not identity" framing:
 * above 1000 candidates is genuinely aggregate, below 10 effectively names a
 * single note and requires a disclosure-backed signal to act on.
 *
 *   N_eff > 1000          → "aggregate_only"
 *   100 < N_eff <= 1000   → "broad_candidate_set"
 *   10  < N_eff <= 100    → "small_heuristic_set"
 *   N_eff <= 10           → "requires_disclosure"
 */
export type ClaimLevel =
  | "aggregate_only"
  | "broad_candidate_set"
  | "small_heuristic_set"
  | "requires_disclosure";

/**
 * Audit record produced by each filter in the scoring stack. The
 * discriminator is the `filter` name; `params` is typed per-variant.
 * countIn/countOut are bigint so the entire audit trail preserves
 * precision across the chain of filter applications.
 *
 * Future filters extend this discriminated union. Anchor-membership and
 * pool-separation filters are intentionally absent: both are enforced at
 * the TypeScript layer (CandidateRange<P> only exists for a known anchor,
 * and the generic P prevents cross-pool composition), so no runtime audit
 * entry would carry new information.
 *
 * WIDENING THIS UNION IS NOT FREE, and the compiler is only half the guard.
 * `views.ts`'s `filterNameSchema` is a CLOSED zod enum and
 * `auditRecordToEstimateFilter` assigns this `filter` into it, so a new member
 * here fails `tsc` until the enum gains it - that is the compile-time proof
 * working, and it is why `amount_echo` appears in both files in one commit.
 * What the compiler does NOT catch is a consumer that switches on `filter` with
 * a `default:` arm, or a `params` bag flattened into strings for the UI. Sweep
 * those by hand; HANDOFF-08 listed them in its section 7.
 */
export type FilterApplication =
  | {
      readonly filter: "time_window";
      readonly params: {
        readonly windowBlocks: number;
        /** Exclusive lower bound of the half-open (lo, hi] height range. */
        readonly lowHeight: number;
        /** Inclusive upper bound — equals anchor.heightCreated. */
        readonly highHeight: number;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  | {
      readonly filter: "amount_match";
      readonly params: {
        /** Txid of the matched shielding deposit (the upstream half of the round-trip pair). */
        readonly matchedDepositTxid: Hex;
        /** Block height of the matched shielding deposit; filter narrows to commitments at this height. */
        readonly matchedDepositHeight: number;
        /** Deposit's net value (positive zat, into-pool). */
        readonly matchedDepositAmountZat: bigint;
        /** Withdrawal's net value (positive zat, out-of-pool). */
        readonly withdrawalAmountZat: bigint;
        /** Fee tolerance used at match time; documents the assumption envelope. */
        readonly toleranceZat: bigint;
        /** Whether the match was exact (amounts equal) or fee-tolerant (within toleranceZat). */
        readonly matchKind: "EXACT" | "FEE_TOLERANT";
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  | {
      /**
       * TRACKING-MATH section 3.4's amount echo, in all four of its tolerances
       * plus the partial echo section 6 requires.
       *
       * ONE FILTER NAME FOR FOUR TOLERANCES, ON PURPOSE. Section 3.4 is a
       * single estimator - "Amount echo (Kappos round-trip), three tolerances"
       * with subset-sum added as a fourth bullet under the same heading - so
       * `matchKind` discriminates INSIDE the record rather than forking it into
       * four filter names. A reader of the inference chain sees one step that
       * says which rule admitted the candidate, which is the honest rendering:
       * the assumption being bought is "the amounts are close enough", and
       * `matchKind` is what "enough" meant.
       *
       * `countOut` IS THE CANDIDATE COUNT AT THE MATCH'S GRADE, not 1. The
       * grade is derived from how many candidates survived, so a record whose
       * `countOut` disagreed with the grade printed beside it would be an audit
       * trail contradicting its own conclusion.
       */
      readonly filter: "amount_echo";
      readonly params: {
        /** Which of section 3.4's tolerances admitted this match. */
        readonly matchKind: "EXACT" | "FEE_TOLERANT" | "RELATIVE" | "SUBSET_SUM" | "PARTIAL";
        readonly grade: "HIGH" | "MEDIUM" | "LOW";
        readonly withdrawalTxid: Hex;
        readonly withdrawalAmountZat: bigint;
        /** One txid, or up to three for a subset-sum split. */
        readonly depositTxids: ReadonlyArray<Hex>;
        /** The summed deposit magnitude the withdrawal was compared against. */
        readonly depositAmountZat: bigint;
        /** Signed: `depositAmountZat - withdrawalAmountZat`. */
        readonly residualZat: bigint;
        readonly relativeError: number;
        readonly timeDeltaMs: number;
        readonly splitCount: number;
        readonly partial: boolean;
        /** The absolute fee tolerance in force; documents the envelope. */
        readonly toleranceZat: bigint;
        /** The relative tolerance in force. */
        readonly relativeEpsilon: number;
        /**
         * How many in-window deposits the SEARCH actually examined.
         *
         * `countIn` is what was available; this is what was looked at, and the
         * two differ whenever the subset-sum search truncated its candidate
         * pool. An earlier version of the echo's docblock claimed `countIn`
         * carried the truncation and it did not, so the record stated that N
         * candidates were considered when the search had seen at most 48 - "an
         * estimate that quietly stopped looking", which is the failure the audit
         * contract exists to prevent, committed by the audit record.
         */
        readonly searchedCandidates: number;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  | {
      /**
       * TRACKING-MATH section 3.11's turnstile conservation, applied over a
       * window of estimator output.
       *
       * IT IS A REAL RECORD PRODUCED BY REAL CODE, and saying so is not
       * redundant: HANDOFF-08's first attempt at assertion A9 CONSTRUCTED an
       * object of roughly this shape inside its own test and asserted that its
       * own string contained its own phrase, while no production code rejected
       * anything and this union had no such member. The gate found it. Section
       * 3.11 says a violating output "is rejected and logged", and a test that
       * writes the log line itself has implemented neither half.
       *
       * `countIn` is how many matches the sieve was given, `countOut` how many
       * survived. The three rejection counts are broken out because the causes
       * are different failures: `rejectedForDoubleClaim` means one txid was
       * cited by two accepted matches, `rejectedForRivalWithdrawal` means one
       * withdrawal already had an accepted explanation, and
       * `rejectedForBalance` means the estimator's claims outran the pool.
       *
       * THE FIRST TWO ARE THE SAME LAW ON THE TWO SIDES OF A ONE-TO-ONE
       * ASSIGNMENT, and only the first existed when this variant was written.
       * Section 4 says "one-to-one assignment", which constrains both vertex
       * sets: one note is spent once, one withdrawal leaves once. Three
       * distinct deposits explaining one withdrawal passed the deposit-side
       * guard and published 300 ZEC of exits through a transaction that moved
       * 100.
       *
       * `claimedZat` is the DEPOSIT side and `exitZat` the withdrawal side.
       * Section 3.11 bounds the second - "Sigma estimated exits" - and the two
       * are equal only for an EXACT match, so a variant carrying only the first
       * documented a bound the law does not state.
       */
      readonly filter: "conservation";
      readonly params: {
        readonly poolBalanceZat: bigint;
        /** Summed deposit magnitude of the ACCEPTED matches. Never above the balance. */
        readonly claimedZat: bigint;
        /** Summed withdrawal magnitude of the ACCEPTED matches - section 3.11's own quantity. */
        readonly exitZat: bigint;
        readonly rejectedForDoubleClaim: number;
        readonly rejectedForRivalWithdrawal: number;
        readonly rejectedForBalance: number;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  /**
   * HANDOFF-09's turnstile window (plan section 3.1-3.3, TRACKING-MATH section 3.11's
   * balance side).
   *
   * WHAT THIS RECORD IS A FILTER APPLICATION OF, because "accounting" does not
   * sound like a narrowing and the reader is entitled to ask. A drain velocity is
   * `(balance at the end of a window - balance at the start) / hours`, and the
   * only honest way to compute it from a series is to SELECT the samples inside
   * the window. `countIn` is the samples the caller supplied, `countOut` is the
   * samples the window admitted. A velocity computed from two samples out of
   * 1,150 is a different claim from one computed from 1,150, and that difference
   * is invisible in the number itself - which is exactly what an audit record is
   * for.
   *
   * `U_h` and `V_h` are NOT in this record. They are aggregates over a single
   * height with no candidate set and nothing narrowed, so a filter record for
   * them would be a record of a filter that did not happen. `turnstileResidual`
   * returns them without one and says so in its docblock.
   */
  | {
      readonly filter: "turnstile_window";
      readonly params: {
        readonly pool: ShieldedPool;
        /** Inclusive lower bound of the window, in heights. */
        readonly lowHeight: number;
        /** Inclusive upper bound of the window, in heights. */
        readonly highHeight: number;
        /** The window as the caller asked for it: 24 or 168, per plan section 3.3. */
        readonly windowHours: number;
        /** `balance(highHeight) - balance(lowHeight)`, signed. Negative while a pool drains. */
        readonly deltaZat: bigint;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  /**
   * HANDOFF-09's migration lens (plan section 3.4, TRACKING-MATH section 3.9).
   *
   * `migration_lens` was already a member of `views.ts`'s `filterNameSchema`
   * before anything emitted it - one of the names that file records as "section 3
   * estimators still to be written". This is the commit that writes one, so the
   * promise the enum made is now kept.
   *
   * `countIn` is every crossing in the window; `countOut` is the crossings that
   * landed in a canonical `n x 10^k` bucket. THE DIFFERENCE IS THE MEASUREMENT,
   * NOT THE ERROR: `zip318.ts` rules that a non-canonical amount is recorded with
   * both denomination fields null rather than rounded into a neighbouring bucket,
   * and that a crossing over `ZIP318_MAX_CROSSING_ZAT` is "a finding, never a
   * rejection". So `nonCanonicalCount` is a first-class number here rather than a
   * silent gap between the two counts.
   */
  | {
      readonly filter: "migration_lens";
      readonly params: {
        readonly lowHeight: number;
        readonly highHeight: number;
        /** Crossings that matched `n x 10^k, n in {1,2,5}`. */
        readonly canonicalCount: number;
        /** Crossings that did not. Counted, never bucketed. */
        readonly nonCanonicalCount: number;
        /** Summed magnitude of every crossing in the window, canonical or not. */
        readonly sumZat: bigint;
        /** Crossings strictly below `ZIP318_MAX_RESIDUAL_ZAT` - stranded, not migrating. */
        readonly strandedDustZat: bigint;
        /** `ceil(sum / 10,000 ZEC)` - the note-count LOWER bound, per section 3.4. */
        readonly minNotes: number;
        /**
         * `Sigma counts` - the wallet-count UPPER bound of plan section 3.4. No
         * lower bound is claimable.
         */
        readonly maxWallets: number;
        /**
         * Maximal runs of one denomination key. A SHAPE OBSERVATION, NOT A
         * BOUND: two wallets crossing the same denomination in adjacent blocks
         * form one run, so this is below the wallet count and must never be
         * rendered as one. Kept because section 3.9 names the quantity.
         */
        readonly denominationRuns: number;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  /**
   * HANDOFF-09's Ironwood birth series (plan section 3.5).
   *
   * `countIn` is every spend the caller offered; `countOut` is the spends that
   * belong to the series - Ironwood, at or after the pool's birth height, with a
   * candidate count an `N_eff` can be computed from. A spend excluded for any of
   * those reasons is excluded from the shares too, which is why the two counts
   * are on the record: a share of 25% over four spends and a share of 25% over
   * four thousand are the same number and not the same claim.
   */
  | {
      readonly filter: "ironwood_birth";
      readonly params: {
        /** NU6.3, where `|T^ironwood|` was 0. Mainnet 3,428,143. */
        readonly birthHeight: number;
        readonly lowHeight: number;
        readonly highHeight: number;
        /** Share of the series at `requires_disclosure` - the claim level that gates publication. */
        readonly requiresDisclosureShare: number;
        /** Smallest `N_eff` in the series. The tree grows, so this is the series' worst case. */
        readonly minNEff: number;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    };

/**
 * Combines a CandidateRange with its derived uncertainty quantification
 * and the audit trail of filters that produced it. Module 4's assessRaw
 * returns appliedFilters: [] (no filters applied). Module 5's assessFiltered
 * populates appliedFilters with one record per filter run.
 *
 * Invariant: rawCount is the size of un-filtered Cand_0; effectiveSetSize
 * is the post-filter count. The two diverge as filters narrow the set;
 * they are equal when appliedFilters is empty.
 */
export type ClaimAssessment<P extends Pool = Pool> = {
  readonly pool: P;
  readonly anchorRoot: Hex;
  readonly rawCount: bigint;
  readonly effectiveSetSize: bigint;
  readonly entropyBits: number;
  readonly claimLevel: ClaimLevel;
  readonly appliedFilters: ReadonlyArray<FilterApplication>;
};
