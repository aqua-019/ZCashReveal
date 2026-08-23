import type { Hex, Zatoshi } from "./transactions.js";
import type { DecodedShieldedBundle, PoolPath, ShieldedPool } from "./shielded.js";
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
  | "FULLY_TRANSPARENT";

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
   * One entry per pool this transaction actually moved, built in a single place
   * from the three fields above.
   *
   * A POOL THAT DID NOT MOVE DOES NOT APPEAR, and Ironwood does not appear at
   * all yet - decoding a v6 bundle is HANDOFF-07's. That is the point of an
   * array rather than a `Record<ShieldedPool, Zatoshi>`: a record would owe an
   * `ironwood: 0n` on every transaction ever analysed, and a hardcoded zero
   * renders as a measurement.
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
  expiryDelta: number | null;
  hasMemo: boolean;
  likelyWallet: WalletGuess;
}

export type WalletGuess =
  | "ZCASHD_RUST"
  | "ZECWALLET_LITE"
  | "YWALLET"
  | "NIGHTHAWK"
  | "EDGE"
  | "UNKNOWN_BUT_STANDARD"
  | "UNKNOWN_NONSTANDARD";

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
  | "SHIELDED_COINBASE";
