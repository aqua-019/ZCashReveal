/**
 * Leak analyzer.
 *
 * Takes a parsed RpcTransaction + current tip context + anchor registry
 * and produces a fully annotated LeakReport. Every transaction passing
 * through the indexer is run through this analyzer.
 */

import type {
  Hex,
  RpcTransaction,
  LeakReport,
  LeakClass,
  Severity,
  SpendAnnotation,
  OutputAnnotation,
  ValueBalanceAnnotation,
  FingerprintAnnotation,
  Finding,
  Zatoshi,
} from "@zcashreveal/types";

import { decodeSaplingSpends, decodeSaplingOutputs } from "./sapling.js";
import { decodeOrchardBundle } from "./orchard.js";
import { AnchorRegistry } from "./anchor-depth.js";
import { guessWallet } from "./fingerprint.js";

export interface AnalyzeContext {
  tipHeight: number;
  seenAt: number;
  anchorRegistry: AnchorRegistry;
  recentAnchorThreshold: number;
}

export async function analyze(
  tx: RpcTransaction,
  ctx: AnalyzeContext,
): Promise<LeakReport> {
  const saplingSpends = decodeSaplingSpends(tx.vShieldedSpend);
  const saplingOutputs = decodeSaplingOutputs(tx.vShieldedOutput);
  const orchard = decodeOrchardBundle(tx.orchard);

  const saplingValueBalanceZat = BigInt(tx.valueBalanceZat ?? 0);
  const orchardValueBalanceZat = orchard.valueBalanceZat;

  const spendAnnotations: SpendAnnotation[] = [];

  for (const s of saplingSpends) {
    const anchorHeight = await ctx.anchorRegistry.getHeightForAnchor(s.anchor);
    const depth = anchorHeight === null ? null : ctx.tipHeight - anchorHeight;
    const isRecent =
      depth !== null && depth >= 0 && depth < ctx.recentAnchorThreshold;
    spendAnnotations.push({
      pool: "sapling",
      index: s.index,
      nullifier: s.nullifier,
      anchor: s.anchor,
      anchorHeight,
      anchorDepthBlocks: depth,
      isRecentAnchor: isRecent,
      severity: isRecent ? "MEDIUM" : depth === null ? "LOW" : "INFO",
    });
  }

  if (orchard.anchor && orchard.actions.length > 0) {
    const anchorHeight = await ctx.anchorRegistry.getHeightForAnchor(orchard.anchor);
    const depth = anchorHeight === null ? null : ctx.tipHeight - anchorHeight;
    const isRecent =
      depth !== null && depth >= 0 && depth < ctx.recentAnchorThreshold;
    for (const a of orchard.actions) {
      spendAnnotations.push({
        pool: "orchard",
        index: a.index,
        nullifier: a.nullifier,
        anchor: orchard.anchor,
        anchorHeight,
        anchorDepthBlocks: depth,
        isRecentAnchor: isRecent,
        severity: isRecent ? "MEDIUM" : depth === null ? "LOW" : "INFO",
      });
    }
  }

  const outputAnnotations: OutputAnnotation[] = [];
  for (const o of saplingOutputs) {
    outputAnnotations.push({ pool: "sapling", index: o.index, commitment: o.cmu });
  }
  for (const a of orchard.actions) {
    outputAnnotations.push({ pool: "orchard", index: a.index, commitment: a.cmx });
  }

  const netTransparentInflowZat = computeTransparentInflow(tx);
  const valueFlow = classifyValueFlow({
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    netTransparentInflowZat,
    hasShieldedAny:
      saplingSpends.length + saplingOutputs.length + orchard.actions.length > 0,
  });

  const leakClass = classifyLeak({
    valueFlow,
    saplingSpendCount: saplingSpends.length,
    saplingOutputCount: saplingOutputs.length,
    orchardActionCount: orchard.actions.length,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    hasTransparentInputs: tx.vin.some((v) => !v.coinbase),
    hasCoinbase: tx.vin.some((v) => !!v.coinbase),
  });

  const feeZat: Zatoshi = BigInt(tx.feeZat ?? 0);
  const expiryDelta =
    tx.expiryHeight === undefined ? null : tx.expiryHeight - ctx.tipHeight;

  const wallet = guessWallet({
    txVersion: tx.version,
    vinCount: tx.vin.length,
    voutCount: tx.vout.length,
    saplingSpendCount: saplingSpends.length,
    saplingOutputCount: saplingOutputs.length,
    orchardActionCount: orchard.actions.length,
    feeZat,
    expiryDelta,
    hasOrchardBundle: orchard.actions.length > 0,
    hasSaplingBundle: saplingSpends.length + saplingOutputs.length > 0,
  });

  const fingerprint: FingerprintAnnotation = {
    outputCount: tx.vout.length + saplingOutputs.length + orchard.actions.length,
    spendCount: tx.vin.length + saplingSpends.length + orchard.actions.length,
    outputPadded: saplingOutputs.length >= 2 || orchard.actions.length >= 2,
    feeZat,
    isZip317ConventionalFee: wallet === "ZCASHD_RUST" || wallet === "NIGHTHAWK",
    expiryDelta,
    hasMemo: false,
    likelyWallet: wallet,
  };

  const findings: Finding[] = collectFindings({
    leakClass,
    valueFlow,
    spendAnnotations,
    fingerprint,
    saplingSpends,
    saplingOutputs,
    orchard,
  });

  const overallSeverity = highestSeverity(findings);

  const transparent = {
    vin: tx.vin.map((v, i) => ({
      index: i,
      coinbase: !!v.coinbase,
      ...(v.txid !== undefined ? { prevTxid: v.txid } : {}),
      ...(v.vout !== undefined ? { prevVout: v.vout } : {}),
      address: null as string | null,
      sequence: v.sequence,
    })),
    vout: tx.vout.map((o) => ({
      index: o.n,
      valueZat: BigInt(o.valueZat),
      addresses: o.scriptPubKey.addresses ?? [],
      scriptType: o.scriptPubKey.type,
    })),
  };

  const identity = buildIdentityProfile({
    transparent,
    saplingSpends,
    saplingOutputs,
    orchardActions: orchard.actions,
  });

  return {
    txid: tx.txid,
    seenAt: ctx.seenAt,
    tipHeightAtSeen: ctx.tipHeight,
    txVersion: tx.version,
    leakClass,
    overallSeverity,
    bundle: {
      saplingSpends,
      saplingOutputs,
      saplingValueBalanceZat,
      orchardActions: orchard.actions,
      orchardValueBalanceZat,
      orchardAnchor: orchard.anchor,
      orchardFlags: orchard.flags,
    },
    transparent,
    identity,
    spends: spendAnnotations,
    outputs: outputAnnotations,
    valueFlow,
    fingerprint,
    findings,
    links: [],
  };
}

function buildIdentityProfile(input: {
  transparent: { vin: Array<{ address: string | null }>; vout: Array<{ addresses: string[] }> };
  saplingSpends: Array<{ pool: "sapling"; nullifier: Hex }>;
  saplingOutputs: Array<{ pool: "sapling"; cmu: Hex }>;
  orchardActions: Array<{ pool: "orchard"; nullifier: Hex; cmx: Hex }>;
}): import("@zcashreveal/types").LeakReport["identity"] {
  const senderAddrs: string[] = [];
  for (const v of input.transparent.vin) {
    if (v.address) senderAddrs.push(v.address);
  }
  const recipientAddrs: string[] = [];
  for (const o of input.transparent.vout) {
    for (const a of o.addresses) recipientAddrs.push(a);
  }

  return {
    sender: {
      transparentAddresses: senderAddrs,
      nullifiers: [
        ...input.saplingSpends.map((s) => ({ pool: "sapling" as const, value: s.nullifier })),
        ...input.orchardActions.map((a) => ({ pool: "orchard" as const, value: a.nullifier })),
      ],
      commitments: [],
    },
    recipient: {
      transparentAddresses: recipientAddrs,
      nullifiers: [],
      commitments: [
        ...input.saplingOutputs.map((o) => ({ pool: "sapling" as const, value: o.cmu })),
        ...input.orchardActions.map((a) => ({ pool: "orchard" as const, value: a.cmx })),
      ],
    },
  };
}

function computeTransparentInflow(tx: RpcTransaction): Zatoshi {
  let voutSum = 0n;
  for (const o of tx.vout) voutSum += BigInt(o.valueZat);
  return voutSum;
}

function classifyValueFlow(input: {
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  netTransparentInflowZat: Zatoshi;
  hasShieldedAny: boolean;
}): ValueBalanceAnnotation {
  const { saplingValueBalanceZat, orchardValueBalanceZat } = input;
  const isPureShielded =
    saplingValueBalanceZat === 0n &&
    orchardValueBalanceZat === 0n &&
    input.hasShieldedAny;
  const crossesPoolBoundary =
    saplingValueBalanceZat !== 0n || orchardValueBalanceZat !== 0n;

  let direction: ValueBalanceAnnotation["direction"];
  if (!input.hasShieldedAny) direction = "NONE";
  else if (isPureShielded) direction = "INTRA_POOL";
  else if (saplingValueBalanceZat < 0n || orchardValueBalanceZat < 0n)
    direction = "DEPOSIT";
  else direction = "WITHDRAWAL";

  return {
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    netTransparentInflowZat: input.netTransparentInflowZat,
    isPureShielded,
    crossesPoolBoundary,
    direction,
  };
}

function classifyLeak(input: {
  valueFlow: ValueBalanceAnnotation;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActionCount: number;
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  hasTransparentInputs: boolean;
  hasCoinbase: boolean;
}): LeakClass {
  const {
    valueFlow,
    saplingSpendCount,
    saplingOutputCount,
    orchardActionCount,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    hasTransparentInputs,
    hasCoinbase,
  } = input;

  const hasSapling = saplingSpendCount + saplingOutputCount > 0;
  const hasOrchard = orchardActionCount > 0;
  const hasShielded = hasSapling || hasOrchard;

  if (!hasShielded) return "FULLY_TRANSPARENT";
  if (hasCoinbase && hasShielded) return "COINBASE_SHIELDED";

  if (
    saplingSpendCount > 0 &&
    orchardActionCount > 0 &&
    saplingValueBalanceZat > 0n &&
    orchardValueBalanceZat < 0n
  ) {
    return "MIGRATION_S2O";
  }

  if (valueFlow.isPureShielded) return "PURE_SHIELDED";
  if (valueFlow.direction === "DEPOSIT") return "T_TO_Z";
  if (valueFlow.direction === "WITHDRAWAL") return "Z_TO_T";
  if (hasTransparentInputs && hasShielded) return "MIXED";
  return "MIXED";
}

function collectFindings(input: {
  leakClass: LeakClass;
  valueFlow: ValueBalanceAnnotation;
  spendAnnotations: SpendAnnotation[];
  fingerprint: FingerprintAnnotation;
  saplingSpends: unknown[];
  saplingOutputs: unknown[];
  orchard: { actions: unknown[]; anchor: string | null };
}): Finding[] {
  const out: Finding[] = [];

  if (input.valueFlow.crossesPoolBoundary) {
    out.push({
      code: "VALUE_BALANCE_NONZERO",
      severity: "HIGH",
      message: `Tx crosses t↔z boundary: ${describeFlow(input.valueFlow)}`,
      field: "valueBalance",
    });
  }

  if (input.leakClass === "MIGRATION_S2O") {
    out.push({
      code: "MIGRATION_PATTERN",
      severity: "MEDIUM",
      message: "Textbook Sapling→Orchard migration: Sapling spends paired with Orchard outputs",
    });
  }

  if (input.saplingSpends.length > 0 && input.orchard.actions.length > 0) {
    out.push({
      code: "MIXED_POOLS",
      severity: "MEDIUM",
      message: "Both Sapling and Orchard pools touched — wallet bridges both pools",
    });
  }

  for (const s of input.spendAnnotations) {
    if (s.isRecentAnchor && s.anchorDepthBlocks !== null) {
      out.push({
        code: "RECENT_ANCHOR",
        severity: "MEDIUM",
        message: `${s.pool} spend #${s.index}: anchor depth ${s.anchorDepthBlocks} blocks — narrows receive window`,
        field: "anchor",
      });
    } else if (s.anchorDepthBlocks !== null && s.anchorDepthBlocks > 10_000) {
      out.push({
        code: "DEEP_ANCHOR",
        severity: "LOW",
        message: `${s.pool} spend #${s.index}: anchor depth ${s.anchorDepthBlocks} blocks — likely cold-storage spend`,
        field: "anchor",
      });
    }
  }

  if (
    input.fingerprint.likelyWallet !== "UNKNOWN_BUT_STANDARD" &&
    input.fingerprint.likelyWallet !== "UNKNOWN_NONSTANDARD"
  ) {
    out.push({
      code: "WALLET_FINGERPRINT",
      severity: "LOW",
      message: `Wallet signature matches: ${input.fingerprint.likelyWallet}`,
      field: "fingerprint",
    });
  }

  if (input.fingerprint.likelyWallet === "UNKNOWN_NONSTANDARD") {
    out.push({
      code: "FEE_OUTLIER",
      severity: "LOW",
      message: "Non-ZIP-317 fee + unusual padding — custom or unusual wallet",
      field: "fingerprint",
    });
  }

  if (input.leakClass === "FULLY_TRANSPARENT") {
    out.push({
      code: "FULL_TRANSPARENT",
      severity: "CRITICAL",
      message: "Fully transparent tx — no shielded components. All amounts and addresses public.",
    });
  }

  if (input.leakClass === "COINBASE_SHIELDED") {
    out.push({
      code: "SHIELDED_COINBASE",
      severity: "LOW",
      message: "Miner shielded coinbase output — privacy posture by mining pool",
    });
  }

  return out;
}

function describeFlow(v: ValueBalanceAnnotation): string {
  const parts: string[] = [];
  if (v.saplingValueBalanceZat !== 0n) {
    parts.push(
      `Sapling ${v.saplingValueBalanceZat > 0n ? "+" : ""}${v.saplingValueBalanceZat} zat`,
    );
  }
  if (v.orchardValueBalanceZat !== 0n) {
    parts.push(
      `Orchard ${v.orchardValueBalanceZat > 0n ? "+" : ""}${v.orchardValueBalanceZat} zat`,
    );
  }
  return parts.join(", ");
}

const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};

function highestSeverity(findings: Finding[]): Severity {
  let max: Severity = "INFO";
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[max]) max = f.severity;
  }
  return max;
}
