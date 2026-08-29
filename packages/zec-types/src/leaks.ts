import type { Hex, Zatoshi } from "./transactions.js";
import type { DecodedShieldedBundle, PoolPath, ShieldedPool } from "./shielded.js";
import type { Zip318Denomination } from "./zip318.js";
import type { ClaimAssessment } from "./analysis.js";

/**
 * The shape of a transaction's value flow.
 *
 * Every member except the migrations is POOL-AGNOSTIC: `PURE_SHIELDED`,
 * `T_TO_Z`, `Z_TO_T` and `MIXED` describe where value crossed, not which pool
 * it crossed in. Only a migration names its pools, because a migration IS the
 * pair of pools it moves between.
 *
 * `MIGRATION_O2I` is Orchard to Ironwood under ZIP 318 - one Orchard note
 * spent into exactly one Ironwood output, with the net amount public and
 * quantised. It is the crossing NU6.3 exists to produce, and until this member
 * existed such a transaction was classified `Z_TO_T` - an affirmatively FALSE
 * claim, not merely a vague one, because `Z_TO_T` asserts that value went to
 * the transparent side while the same report carried a transparent inflow of
 * zero. It now falls through to `MIXED` when the Ironwood balance has not been
 * decoded, which admits the gap instead of filling it.
 *
 * HANDOFF-06's contract asked for "Ironwood variants", plural. One is added,
 * not a family, and the reason is the pool-agnostic rule above: a
 * pure-Ironwood transaction is `PURE_SHIELDED` exactly as a pure-Orchard one
 * is, and an `IRONWOOD_ONLY` member would be the only pool-named non-migration
 * class in the union - which would then owe a `SAPLING_ONLY` and an
 * `ORCHARD_ONLY` for symmetry, and the taxonomy would be about pools instead
 * of about flow. Recorded in the section 8 ledger as SPEC-WAS-AMBIGUOUS.
 */
export type LeakClass =
  | "PURE_SHIELDED"
  | "T_TO_Z"
  | "Z_TO_T"
  | "MIXED"
  | "MIGRATION_S2O"
  | "MIGRATION_O2I"
  | "COINBASE_SHIELDED"
  | "FULLY_TRANSPARENT"
  /**
   * THE ONLY MEMBER THAT IS NOT A CLASSIFICATION. It is a refusal to classify.
   *
   * A transaction whose version this decoder does not model, or whose bundle it
   * cannot read, gets this and nothing else: no value flow, no fingerprint, no
   * findings about its shape. Every other member of this union asserts
   * something about where value went, and asserting any of them about bytes
   * nobody here understands would be a claim manufactured out of a gap - which
   * is the one thing this project will not publish.
   *
   * A report carrying this class also carries {@link LeakReport.unsupported},
   * and its quantitative fields are UNPOPULATED rather than measured. Read that
   * object's presence, not the zeros, to know which it is.
   *
   * It is never a crash. Zebra will serialise transaction versions this build
   * has never seen the moment a network upgrade defines one, and an indexer that
   * throws on the first of them stops indexing the chain.
   */
  | "UNSUPPORTED_TX";

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SpendAnnotation {
  pool: ShieldedPool;
  index: number;
  nullifier: Hex;
  anchor: Hex;
  anchorHeight: number | null;
  anchorDepthBlocks: number | null;
  isRecentAnchor: boolean;
  severity: Severity;
  /**
   * Module 5+ claim assessment for this spend's Cand_0. Optional —
   * undefined when PoolState is not yet plumbed (populated by Module 7
   * once AnalyzeContext carries chainState).
   */
  assessment?: ClaimAssessment;
}

export interface OutputAnnotation {
  pool: ShieldedPool;
  index: number;
  commitment: Hex;
}

/**
 * Where a transaction moved value across pool boundaries.
 *
 * Sign convention throughout, matching Zcash's own `valueBalance` and
 * `BoundaryDelta` in analysis.ts: POSITIVE means value LEFT the pool for the
 * transparent side, NEGATIVE means it entered.
 */
export interface ValueBalanceAnnotation {
  /**
   * Sprout's contribution, as `vpub_new - vpub_old` summed over the JoinSplits.
   *
   * SPROUT IS NOT A `valueBalance` FIELD, which is why it was absent until
   * HANDOFF-06. The cost of the omission was not cosmetic and the gateway paid
   * it first: a Sprout transaction had a boundary of zero, so it classified as
   * transparent throughout, and its fee was computed without the term that
   * balances it. Sprout is the pool half of this site's unprovable residual, so
   * it is the last one that should have been invisible.
   */
  sproutValueBalanceZat: Zatoshi;
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  /**
   * Ironwood's value balance, in the same sign convention as the three above:
   * positive means value LEFT the pool, negative means it entered.
   *
   * DECODED SINCE HANDOFF-07, and until then this field did not exist rather
   * than existing at zero - HANDOFF-06 argued that an `ironwoodValueBalanceZat:
   * 0n` on every report would be a measurement nobody took, in the same shape as
   * the `feeZat` of `0n` it spent its length removing. It is a measurement now.
   *
   * NEARLY EVERY VALUE HERE IS A NEGATIVE ONE, which is worth knowing when
   * reading a chart across NU6.3. Ironwood was born at a balance of zero on 28
   * July 2026 and value has flowed INTO it ever since, out of an Orchard that
   * became exit-only in the same upgrade; a positive Ironwood balance is value
   * leaving the newest pool, which is the rarer event.
   */
  ironwoodValueBalanceZat: Zatoshi;
  /**
   * One entry per pool this transaction actually moved, built in a single place
   * from the four fields above.
   *
   * A POOL THAT DID NOT MOVE DOES NOT APPEAR. That is the point of an array
   * rather than a `Record<ShieldedPool, Zatoshi>`: a record would owe an entry
   * for every pool on every transaction, and a hardcoded zero renders as a
   * measurement. Ironwood joined the other three in HANDOFF-07 on exactly those
   * terms - present when the pool moved, absent when it did not, never a
   * standing zero.
   *
   * Consumers that need per-pool deltas read THIS and not the named fields, so
   * there is one construction site and the two cannot come to disagree - which
   * is how `summary.conventionalFeeZat` came to mean two things in HANDOFF-05.
   */
  perPoolZat: ReadonlyArray<{ readonly pool: ShieldedPool; readonly deltaZat: Zatoshi }>;
  netTransparentInflowZat: Zatoshi;
  isPureShielded: boolean;
  crossesPoolBoundary: boolean;
  direction: "DEPOSIT" | "WITHDRAWAL" | "INTRA_POOL" | "NONE";
}

export interface FingerprintAnnotation {
  outputCount: number;
  spendCount: number;
  outputPadded: boolean;
  /**
   * The fee this transaction paid, in zatoshi, or `null` when it could not be
   * computed.
   *
   * NULLABLE SINCE HANDOFF-06, AND THE NULL IS THE WHOLE POINT. No node sends a
   * fee: Zebra's `TransactionObject` has no such field and neither does
   * zcashd's `getrawtransaction`, because a fee is a property of the outputs a
   * transaction SPENDS and those are not in the response. This field used to be
   * `BigInt(tx.feeZat ?? 0)`, so it was `0n` for every transaction ever
   * analysed - and `isZip317Conventional(0n, ...)` is false for every one of
   * them, because ZIP 317's conventional fee has a floor of 10,000 zatoshi.
   * Two wallet signatures gated on it and were therefore inert rather than
   * wrong, which is the harder failure to see.
   *
   * `computeFeeZat` now sums the spent outputs through an injected resolver. It
   * returns `null` rather than a partial sum when any input is unresolvable: a
   * fee computed from two of three inputs is not an approximate fee, it is a
   * wrong one, and 0n was exactly that lie with a friendlier type.
   */
  feeZat: Zatoshi | null;
  /** `null` when `feeZat` is null - unknown, which is neither true nor false. */
  isZip317ConventionalFee: boolean | null;
  /**
   * ZIP 317 logical actions, by the PROTOCOL rule - the byte-based transparent
   * term, not the count approximation.
   *
   * CARRIED ON THE REPORT SO THE VIEW LAYER DOES NOT HAVE TO GUESS. The
   * analyser holds the whole `RpcTransaction` and can measure the serialised
   * script sizes ZIP 317 actually divides by; a `LeakReport` holds counts and
   * script TYPES, so anything downstream of it could only reach the count
   * approximation. That is what /track was doing: deciding whether a fee was
   * conventional from the approximation, which the site's own /method page
   * states in as many words must never decide it - "whether a fee is
   * conventional is settled by the byte form or left unsettled". /tx used the
   * protocol rule, so the two pages could disagree about one transaction.
   */
  logicalActions: number;
  expiryDelta: number | null;
  hasMemo: boolean;
  likelyWallet: WalletGuess;
}

export type WalletGuess =
  | "ZCASHD_RUST"
  | "ZECWALLET_LITE"
  | "NIGHTHAWK"
  | "EDGE"
  /**
   * Zodl, the wallet ECC's Zashi was rebranded to after the team moved to ZODL.
   *
   * ADDED IN HANDOFF-07 AND IT IS THE ONLY ONE OF THE FIVE THE HANDOFF NAMED
   * THAT COULD BE SOURCED. `docs/2.0/TRACKING-MATH.md` §3.6 gives an expiry
   * delta for it - "zcashd 20, Zashi/Zodl 40" - and the corpus gives it
   * Ironwood support at 3.8.0. Vizor, Zkool, Zingo and Cake have neither an
   * expiry delta nor a padding rule anywhere in this repository, so they have
   * no member here: a `WalletGuess` no rule can return is a branch that reads
   * as covered and never runs, which is the defect this project keeps finding.
   * See `fingerprint.ts` for what each of the four would need.
   *
   * `"YWALLET"` WAS REMOVED FROM THIS UNION IN HANDOFF-08 UNDER THE SAME RULE.
   * It was returned on an `expiryDelta` in 35-50, a band hardcoded at
   * HANDOFF-00 that never carried a citation; §3.6's "others vary" is the
   * corpus declining to state one for Ywallet. `guessWallet` no longer returns
   * it, so leaving the member would have left precisely the unreachable branch
   * the paragraph above refuses (L2 finding F-07-1, LEDGER-07 fold 1). Ywallet
   * is now listed in `UNSOURCED_WALLET_HYPOTHESES` beside the other four, which
   * is where a wallet this project can name but cannot fingerprint belongs.
   * Nothing about the CHAIN changed: transactions Ywallet sent are still
   * classified, by their fee, as `UNKNOWN_BUT_STANDARD` or
   * `UNKNOWN_NONSTANDARD`, or as `UNKNOWN_UNPRICED` when the fee is unknown.
   */
  | "ZODL"
  /** Not one of the five signatures, but it paid ZIP 317's conventional fee. */
  | "UNKNOWN_BUT_STANDARD"
  /** Not one of the five, and its fee was MEASURED and found non-conventional. */
  | "UNKNOWN_NONSTANDARD"
  /**
   * Not one of the five, and there is not enough evidence to say which of the
   * two above it is.
   *
   * ADDED IN HANDOFF-06 BECAUSE IGNORANCE WAS BEING PUBLISHED AS A VERDICT.
   * `UNKNOWN_BUT_STANDARD` and `UNKNOWN_NONSTANDARD` are both claims about the
   * fee - one says it was conventional, the other says it was not - and with no
   * fee at all the guesser returned the second, so a transaction whose parent
   * this node could not resolve was published as having underpaid. The row then
   * contradicted itself one column apart: "not priced" in the fee cell and
   * `UNKNOWN_NONSTANDARD` in the wallet cell.
   *
   * This is assertion A9's rule in a second field. `feeZat` and
   * `isZip317ConventionalFee` were made nullable so they could admit an
   * absence; this member is what lets `likelyWallet` admit the same one instead
   * of overriding them.
   */
  | "UNKNOWN_UNPRICED";

export interface TransparentInput {
  index: number;
  coinbase: boolean;
  prevTxid?: Hex;
  prevVout?: number;
  address: string | null;
  sequence: number;
}

export interface TransparentOutput {
  index: number;
  valueZat: Zatoshi;
  addresses: string[];
  scriptType: string;
}

export interface IdentityProfile {
  transparentAddresses: string[];
  nullifiers: Array<{ pool: ShieldedPool; value: Hex }>;
  commitments: Array<{ pool: ShieldedPool; value: Hex }>;
}

export interface LinkRecord {
  shieldingTxid: Hex;
  unshieldingTxid: Hex;
  senderAddress: string | null;
  recipientAddress: string | null;
  amountZat: Zatoshi;
  timeDeltaMs: number;
  matchKind: "EXACT" | "FEE_TOLERANT";
  poolPath: PoolPath;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /**
   * Module 5+ claim assessment for the unshield's spend (computed over
   * the spend's Cand_0 with the time-window + amount-match filters in
   * the round-trip context). Optional — undefined when PoolState is not
   * yet plumbed (populated by Module 7 once AnalyzeContext carries
   * chainState).
   */
  assessment?: ClaimAssessment;
}

/**
 * A ZIP 318 Orchard-to-Ironwood crossing, as this decoder measured it.
 *
 * Present on a report only when `leakClass === "MIGRATION_O2I"`. Every field is
 * an observation: the amount is public on-chain by ZIP 318's own design, and
 * the denomination is derived from that amount and nothing else. Nothing here
 * names, groups or counts a wallet - TRACKING-MATH §3.9 permits distributions
 * and counts per window and forbids "wallet W migrated B", and a per-crossing
 * record is where that rule is easiest to break.
 */
export interface Zip318MigrationRecord {
  /**
   * The magnitude that LEFT Orchard. Positive.
   *
   * This is the note the wallet spent, which is what ZIP 318's phase 1
   * quantises and what the Orchard drain measures, so it is the side the
   * denomination below is tested on.
   */
  amountZat: Zatoshi;
  /**
   * The magnitude that ENTERED Ironwood. Positive, and smaller than
   * `amountZat` by the fee.
   *
   * RECORDED BECAUSE A CROSSING HAS TWO MAGNITUDES AND THEY DIFFER BY THE FEE.
   * Keeping both was originally defended on a premise that has since been
   * retired: that the corpus stated `DENOM_CAP` two irreconcilable ways, so
   * this record could not know which side the cap was about. L2 read ZIP 318
   * (LEDGER-07 Q3) and the two statements are two quantities, not two readings
   * - `DENOM_CAP` bounds the FUNDING NOTE at 10,000 ZEC plus the canonical fee,
   * and 10,000 ZEC is the largest CROSSING. Both magnitudes are still carried,
   * because the fee is recoverable as their difference and because the Orchard
   * side is the one the drain and `pool_snapshots` measure - but they are
   * carried as a measurement now rather than as an open question.
   */
  arrivedZat: Zatoshi;
  /**
   * The canonical denomination, or `null` when the amount is not one.
   *
   * `null` IS THE MEASUREMENT, NOT A FAILURE TO MEASURE. ZIP 318's bucketing is
   * a heuristic privacy defence, so an unquantised crossing is a real
   * observation the migration lens counts; rounding it into the nearest bucket
   * would manufacture the regularity the lens exists to measure.
   */
  denomination: Zip318Denomination | null;
  /** `denomination !== null`. Mirrors `migrations_zip318.canonical`. */
  canonical: boolean;
  /**
   * Whether the amount exceeds the largest crossing ZIP 318 permits, 10,000 ZEC.
   *
   * A FLAG FOR A HUMAN, NOT A VERDICT - the chain is the authority on what
   * happened, so this is raised as a finding and never used to reject a record.
   *
   * RENAMED FROM `overDenomCap` IN HANDOFF-08, and the old name was the defect.
   * It was believed to answer "the stricter of two readings of DENOM_CAP"; there
   * is one reading, it is over the funding note rather than the crossing, and
   * 10,000 ZEC is simply the crossing bound. The value this field carries has
   * never changed. See `ZIP318_MAX_CROSSING_ZAT` for both quantities, and note
   * that ZIP 318 is status Draft.
   *
   * THE RENAME MOVES A KEY INSIDE THE `report` JSONB COLUMN, which is a wire
   * shape and would normally be left alone. It is free exactly now: `grep` over
   * `apps/` finds no reader of that column - it is written by
   * `persistence/leak-reports.ts` and read by nothing yet - so no row is
   * mis-read by the change and no compatibility shim is owed. Whoever writes
   * the first reader inherits one name instead of two.
   */
  overMaxCrossing: boolean;
  /**
   * Whether the amount is below `MAX_RESIDUAL_VALUE` (0.01 ZEC), the size ZIP
   * 318 says is stranded in Orchard permanently.
   *
   * A SIZE COMPARISON, NOT A CONTRADICTION. A crossing smaller than the residual
   * is something to look at, not something to suppress: the corpus's
   * denomination ladder starts at 0.5 ZEC, so an amount below the residual can
   * still be structurally canonical (`5 x 10^k` for a small k) while sitting
   * off the ladder entirely. Recording both facts is what stops a histogram
   * showing a rung the ladder does not have, labelled the same as the real ones.
   */
  belowMaxResidual: boolean;
}

/**
 * Why a report carries `leakClass: "UNSUPPORTED_TX"` and what was seen.
 *
 * ITS PRESENCE IS THE SIGNAL THAT THE REPORT'S NUMBERS ARE UNPOPULATED. Every
 * quantitative field on an unsupported report - value balances, per-pool
 * deltas, transparent inflow, fee, action counts - is a default and not a
 * measurement, because the decoder declined to read a shape it does not model.
 * A consumer that renders such a report as data will publish zeros as facts,
 * which is the failure mode this whole object exists to make impossible to miss.
 */
export interface UnsupportedTx {
  /** The transaction version as the node reported it. */
  version: number;
  /** Which rule declined it, in one phrase, for a log line and a reader alike. */
  reason: string;
  /**
   * The top-level keys the response actually carried, sorted.
   *
   * LOGGED BECAUSE THE NEXT VERSION'S FIELD NAMES ARE THE ONE THING THIS BUILD
   * CANNOT GUESS, and a future handoff implementing v7 will want to know what a
   * v7 looked like on the wire before anyone had a schema for it. Keys only:
   * values could carry an amount or a script, and this project does not log
   * transaction contents it has not classified.
   */
  rawFieldNames: string[];
}

export interface LeakReport {
  txid: Hex;
  seenAt: number;
  tipHeightAtSeen: number;
  txVersion: number;
  leakClass: LeakClass;
  overallSeverity: Severity;
  bundle: DecodedShieldedBundle;
  transparent: {
    vin: TransparentInput[];
    vout: TransparentOutput[];
  };
  identity: {
    sender: IdentityProfile;
    recipient: IdentityProfile;
  };
  spends: SpendAnnotation[];
  outputs: OutputAnnotation[];
  valueFlow: ValueBalanceAnnotation;
  fingerprint: FingerprintAnnotation;
  findings: Finding[];
  links: LinkRecord[];
  /**
   * The ZIP 318 crossing this transaction is, when it is one.
   *
   * Present iff `leakClass === "MIGRATION_O2I"`. Optional rather than nullable
   * so that a report predating HANDOFF-07, replayed out of the `report` JSONB
   * column, is missing the key rather than carrying a `null` that would read as
   * "measured, and it was not a migration".
   */
  migration?: Zip318MigrationRecord;
  /**
   * Why nothing on this report was measured, when nothing was.
   *
   * Present iff `leakClass === "UNSUPPORTED_TX"`. See {@link UnsupportedTx}.
   */
  unsupported?: UnsupportedTx;
}

export interface Finding {
  code: FindingCode;
  severity: Severity;
  message: string;
  field?: "nullifier" | "valueBalance" | "anchor" | "commitment" | "fingerprint";
}

export type FindingCode =
  | "RECENT_ANCHOR"
  | "DEEP_ANCHOR"
  | "VALUE_BALANCE_NONZERO"
  | "MIXED_POOLS"
  | "MIGRATION_PATTERN"
  | "DUST_OUTPUT"
  | "FEE_OUTLIER"
  | "WALLET_FINGERPRINT"
  | "MEMO_PRESENT"
  | "FULL_TRANSPARENT"
  | "SHIELDED_COINBASE"
  /**
   * A post-NU6.2 Orchard bundle whose proof is not the canonical length.
   *
   * ZIP 257 fixed `proofsOrchard` at exactly `2720 + 2272 x nActionsOrchard`
   * bytes when it replaced the Orchard Action verifying key
   * (docs/2.0/research/01-contemporary-zcash.md §1.4, `high`). A length that
   * disagrees is recorded and never thrown on: a consensus-valid chain cannot
   * carry one, so seeing one means this decoder has miscounted the actions or
   * misread the field, and the finding is how that surfaces instead of being
   * hidden behind an exception or, worse, silently accepted.
   */
  | "PROOF_SIZE_NONCANONICAL"
  /**
   * The transaction's version or bundle shape is one this decoder does not
   * model, so nothing was measured. Accompanies `leakClass: "UNSUPPORTED_TX"`,
   * and ONLY that - see `IRONWOOD_FIELD_ABSENT` for the case that looks similar
   * and is not.
   */
  | "UNSUPPORTED_TX_SHAPE"
  /**
   * A v6 transaction arrived carrying no `ironwood` key at all.
   *
   * A FACT ABOUT THE RESPONSE, ON A REPORT THAT WAS FULLY DECODED. Its class is
   * whatever the transaction's other pools made it, and its numbers ARE
   * measurements - which is why this cannot share `UNSUPPORTED_TX_SHAPE`, whose
   * contract is that nothing on the report was measured. One code carrying two
   * mutually exclusive facts makes neither countable, and a consumer using it
   * as the "read the flag, not the zeros" signal would read a measured report
   * as unmeasured.
   *
   * What it means depends on something this build cannot check: the `ironwood`
   * field name is inferred rather than observed. Zebra emits pool bundles
   * unconditionally on the versions that have them, so under that belief this
   * fires on almost nothing; if the belief is wrong it fires on every v6
   * transaction, and every Ironwood balance the project has published is a
   * false zero. It is an all-or-nothing alarm, which is why both polarities
   * are pinned by tests.
   */
  | "IRONWOOD_FIELD_ABSENT"
  /**
   * A ZIP 318 crossing whose amount is not a canonical denomination, or is
   * outside the band the corpus describes. An observation about an amount and
   * never about a sender - see `zip318.ts`.
   */
  | "MIGRATION_DENOMINATION"
  /**
   * The node did not say whether this transaction has JoinSplits.
   *
   * NOT A PROPERTY OF THE TRANSACTION - a property of the response. Zebra
   * serialises `vjoinsplit` only from ZcashFoundation/zebra PR #9805 (merged
   * 22 Aug 2025); an older node omits it on every transaction, so an absent
   * field on a version that CAN carry JoinSplits (v2, v3, v4) leaves Sprout's
   * contribution unknown rather than zero. Raised so a `sproutValueBalanceZat`
   * of `0n` on such a transaction is never read as a measurement.
   */
  | "SPROUT_FIELD_INDETERMINATE";
