import type { Hex, Zatoshi } from "./transactions.js";
import type { DecodedShieldedBundle } from "./shielded.js";
import type { ClaimAssessment } from "./analysis.js";

export type LeakClass =
  | "PURE_SHIELDED"
  | "T_TO_Z"
  | "Z_TO_T"
  | "MIXED"
  | "MIGRATION_S2O"
  | "COINBASE_SHIELDED"
  | "FULLY_TRANSPARENT";

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SpendAnnotation {
  pool: "sapling" | "orchard";
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
  pool: "sapling" | "orchard";
  index: number;
  commitment: Hex;
}

export interface ValueBalanceAnnotation {
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  netTransparentInflowZat: Zatoshi;
  isPureShielded: boolean;
  crossesPoolBoundary: boolean;
  direction: "DEPOSIT" | "WITHDRAWAL" | "INTRA_POOL" | "NONE";
}

export interface FingerprintAnnotation {
  outputCount: number;
  spendCount: number;
  outputPadded: boolean;
  feeZat: Zatoshi;
  isZip317ConventionalFee: boolean;
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
  nullifiers: Array<{ pool: "sapling" | "orchard"; value: Hex }>;
  commitments: Array<{ pool: "sapling" | "orchard"; value: Hex }>;
}

export interface LinkRecord {
  shieldingTxid: Hex;
  unshieldingTxid: Hex;
  senderAddress: string | null;
  recipientAddress: string | null;
  amountZat: Zatoshi;
  timeDeltaMs: number;
  matchKind: "EXACT" | "FEE_TOLERANT";
  poolPath: "sapling" | "orchard" | "sapling→orchard" | "orchard→sapling";
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
