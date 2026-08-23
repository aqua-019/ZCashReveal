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
  ShieldedPool,
  Zatoshi,
} from "@zcashreveal/types";

import { decodeSaplingSpends, decodeSaplingOutputs } from "./sapling.js";
import { decodeOrchardBundle } from "./orchard.js";
import { sproutValueBalanceZat } from "./sprout.js";
import { AnchorRegistry } from "./anchor-depth.js";
import { guessWallet, isZip317Conventional } from "./fingerprint.js";
import { zip317LogicalActions } from "@zcashreveal/types";
import {
  computeFeeZat,
  noPrevOutResolver,
  type PrevOutResolver,
} from "../analysis/fee.js";

export interface AnalyzeContext {
  tipHeight: number;
  seenAt: number;
  anchorRegistry: AnchorRegistry;
  recentAnchorThreshold: number;
  /**
   * Resolves the value of an output a transaction spends, so the fee can be
   * computed by summing them (HANDOFF-06 deliverable 4).
   *
   * OPTIONAL, AND ITS ABSENCE IS VISIBLE RATHER THAN SILENT. When it is not
   * supplied the fee comes back `null` with a stated reason, not `0n`. Before
   * HANDOFF-06 the analyser read `tx.feeZat`, which no node sends, so the fee
   * was `0n` for every transaction and the two wallet signatures that gate on a
   * conventional fee could never fire.
   */
  resolvePrevOut?: PrevOutResolver | undefined;
  /**
   * Ironwood's value balance for this transaction, when the caller has decoded
   * it. `undefined` or `null` mean NOT DECODED, which is not the same as zero.
   *
   * THIS SEAM EXISTS SO THE MIGRATION_O2I RULE IS REACHABLE, and adding it was
   * a gate finding against this very handoff. `classifyLeak` had the rule and
   * `analyze()` passed a literal `null`, so no transaction of any shape could
   * reach the branch - and the docblock beside it claimed the classifier's unit
   * tests supplied the balance directly, which they could not, because the
   * function is module-private and `analyze()` is the only way in. A rule that
   * reads as covered while never running is precisely the defect this handoff
   * exists to close: it is `tx.feeZat` and `expiryheight` a third time.
   *
   * Decoding a v6 bundle to populate it is HANDOFF-07's deliverable. Until then
   * the live path leaves it unset and every migration classifies as MIXED,
   * which is an admission rather than a claim.
   */
  ironwoodValueBalanceZat?: Zatoshi | null | undefined;
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
  // Sprout is a JoinSplit sum, not a `valueBalance` field. See decoder/sprout.ts
  // for what omitting it cost the gateway in HANDOFF-05.
  const sproutBalanceZat = sproutValueBalanceZat(tx);

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
    sproutValueBalanceZat: sproutBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    netTransparentInflowZat,
    hasShieldedAny:
      saplingSpends.length + saplingOutputs.length + orchard.actions.length > 0 ||
      sproutBalanceZat !== 0n,
  });

  const leakClass = classifyLeak({
    valueFlow,
    saplingSpendCount: saplingSpends.length,
    saplingOutputCount: saplingOutputs.length,
    orchardActionCount: orchard.actions.length,
    sproutValueBalanceZat: sproutBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    // Supplied only by a caller that has decoded the bundle; an Ironwood bundle
    // is a v6 field and HANDOFF-07 owns v6, so the live path leaves it unset.
    // `null` means "not known", which is what keeps MIGRATION_O2I from firing
    // on a guess. See classifyLeak.
    ironwoodValueBalanceZat: ctx.ironwoodValueBalanceZat ?? null,
    hasTransparentInputs: tx.vin.some((v) => !v.coinbase),
    hasTransparentOutputs: tx.vout.length > 0,
    hasCoinbase: tx.vin.some((v) => !!v.coinbase),
  });

  // The fee is computed from the outputs this transaction spends, because no
  // node sends one. `fee.feeZat` is null - never 0n - when a term is missing.
  const fee = await computeFeeZat(tx, ctx.resolvePrevOut ?? noPrevOutResolver);
  const feeZat: Zatoshi | null = fee.feeZat;
  const expiryDelta =
    tx.expiryHeight === undefined ? null : tx.expiryHeight - ctx.tipHeight;

  const logicalActions = zip317LogicalActions(tx);

  const wallet = guessWallet({
    txVersion: tx.version,
    vinCount: tx.vin.length,
    voutCount: tx.vout.length,
    saplingSpendCount: saplingSpends.length,
    saplingOutputCount: saplingOutputs.length,
    orchardActionCount: orchard.actions.length,
    logicalActions,
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
    // ASKED OF THE FEE DIRECTLY, NOT INFERRED FROM THE WALLET GUESS. This read
    // `wallet === "ZCASHD_RUST" || wallet === "NIGHTHAWK"` - the two guesses
    // that happen to gate on a conventional fee - so the field reported which
    // WALLET had been guessed rather than whether the fee was conventional.
    // Every other wallet paying a textbook ZIP 317 fee was published as not
    // paying one, and with `feeZat` stuck at 0n the two that could say true
    // never did. Null when the fee is unknown: unknown is not false.
    isZip317ConventionalFee:
      feeZat === null ? null : isZip317Conventional(feeZat, logicalActions),
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

/**
 * Where a transaction moved value across pool boundaries.
 *
 * SPROUT IS COUNTED HERE SINCE HANDOFF-06 and its absence was not cosmetic: a
 * JoinSplit transaction had a boundary of exactly zero, so it classified as
 * transparent throughout and the pool it actually drained did not appear in its
 * deltas. Ironwood is not counted, because reading a v6 bundle is HANDOFF-07's
 * deliverable - `perPoolZat` simply omits it rather than carrying an
 * always-zero entry that would render as a measurement.
 */
function classifyValueFlow(input: {
  sproutValueBalanceZat: Zatoshi;
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  netTransparentInflowZat: Zatoshi;
  hasShieldedAny: boolean;
}): ValueBalanceAnnotation {
  const { sproutValueBalanceZat, saplingValueBalanceZat, orchardValueBalanceZat } = input;

  // Built once, here, and read by everything that needs per-pool deltas. Two
  // derivations of the same quantity is how `summary.conventionalFeeZat` came
  // to mean two different things in HANDOFF-05.
  const perPoolZat: Array<{ pool: ShieldedPool; deltaZat: Zatoshi }> = [];
  if (sproutValueBalanceZat !== 0n)
    perPoolZat.push({ pool: "sprout", deltaZat: sproutValueBalanceZat });
  if (saplingValueBalanceZat !== 0n)
    perPoolZat.push({ pool: "sapling", deltaZat: saplingValueBalanceZat });
  if (orchardValueBalanceZat !== 0n)
    perPoolZat.push({ pool: "orchard", deltaZat: orchardValueBalanceZat });

  const crossesPoolBoundary = perPoolZat.length > 0;
  const isPureShielded = !crossesPoolBoundary && input.hasShieldedAny;

  let direction: ValueBalanceAnnotation["direction"];
  if (!input.hasShieldedAny) direction = "NONE";
  else if (isPureShielded) direction = "INTRA_POOL";
  else if (perPoolZat.some((p) => p.deltaZat < 0n)) direction = "DEPOSIT";
  else direction = "WITHDRAWAL";

  return {
    sproutValueBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    perPoolZat,
    netTransparentInflowZat: input.netTransparentInflowZat,
    isPureShielded,
    crossesPoolBoundary,
    direction,
  };
}

/**
 * The shape of a transaction's value flow.
 *
 * A MIGRATION IS ONE POOL DRAINING INTO ANOTHER, and both halves must be
 * observed. Sapling to Orchard is detectable today, because both pools publish
 * a `valueBalance`. Orchard to Ironwood is not yet: Ironwood's bundle is a v6
 * field and decoding v6 is HANDOFF-07's deliverable, so
 * `ironwoodValueBalanceZat` arrives as `null` from the live analyser.
 *
 * THE RULE IS IMPLEMENTED AND REACHABLE, and `null` is why that is honest
 * rather than the same defect in a new place. A null input cannot satisfy the
 * predicate, so nothing is guessed and nothing is claimed - but a caller that
 * HAS the balance can pass it through `AnalyzeContext.ironwoodValueBalanceZat`,
 * which is the seam the tests drive and the seam HANDOFF-07 will fill.
 *
 * That seam was added by a gate round against this handoff. The first version
 * passed a literal `null` from `analyze()`, so the branch was unreachable from
 * every caller, while this docblock asserted that the unit tests exercised it.
 * They could not: `classifyLeak` is module-private. The claim was the same
 * shape as the two defects this handoff closes - a rule that reads as covered
 * and never runs - and it is recorded in section 7 rather than quietly fixed.
 *
 * NO HEURISTIC STANDS IN FOR THE MISSING HALF. It would be easy to guess: at a
 * height past NU6.3, Orchard is exit-only, so value leaving Orchard with no
 * transparent output to receive it has nowhere to go but Ironwood. That
 * inference is defensible and it is still a guess, and it would misclassify an
 * Orchard-to-Sapling transfer as a migration - a specific false statement about
 * a specific transaction, which is the one thing this project will not publish
 * to fill a gap.
 */
function classifyLeak(input: {
  valueFlow: ValueBalanceAnnotation;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActionCount: number;
  sproutValueBalanceZat: Zatoshi;
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  /** `null` means not decoded, which is not the same as zero. */
  ironwoodValueBalanceZat: Zatoshi | null;
  hasTransparentInputs: boolean;
  hasTransparentOutputs: boolean;
  hasCoinbase: boolean;
}): LeakClass {
  const {
    valueFlow,
    saplingSpendCount,
    saplingOutputCount,
    orchardActionCount,
    sproutValueBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    ironwoodValueBalanceZat,
    hasTransparentInputs,
    hasTransparentOutputs,
    hasCoinbase,
  } = input;

  const hasSprout = sproutValueBalanceZat !== 0n;
  const hasSapling = saplingSpendCount + saplingOutputCount > 0;
  const hasOrchard = orchardActionCount > 0;
  const hasShielded = hasSprout || hasSapling || hasOrchard;

  if (!hasShielded) return "FULLY_TRANSPARENT";
  if (hasCoinbase) return "COINBASE_SHIELDED";

  // Orchard drains, Ironwood fills: ZIP 318. Checked before Sapling-to-Orchard
  // because a transaction can carry both bundles and the newer crossing is the
  // more specific fact about it.
  if (
    hasOrchard &&
    orchardValueBalanceZat > 0n &&
    ironwoodValueBalanceZat !== null &&
    ironwoodValueBalanceZat < 0n
  ) {
    return "MIGRATION_O2I";
  }

  if (
    saplingSpendCount > 0 &&
    orchardActionCount > 0 &&
    saplingValueBalanceZat > 0n &&
    orchardValueBalanceZat < 0n
  ) {
    return "MIGRATION_S2O";
  }

  if (valueFlow.isPureShielded) return "PURE_SHIELDED";

  // A CLASS THAT NAMES THE TRANSPARENT SIDE REQUIRES THE TRANSPARENT SIDE TO
  // BE THERE. `direction` says only which way value crossed a pool boundary; it
  // does not say what was on the other side, because value leaving one pool can
  // land in another pool just as easily as in a transparent output.
  //
  // These two guards were missing, and the consequence was not a vague answer
  // but a specific false one. An Orchard-to-Ironwood migration - Orchard
  // positive, no transparent output at all - came out `Z_TO_T`, which asserts
  // that value went to the transparent side, while `netTransparentInflowZat` on
  // the same report was `0n`. The site would have published that about every
  // NU6.3 migration. An Orchard-to-Sapling transfer had the mirror defect and
  // came out `T_TO_Z`.
  //
  // With the guards, such a transaction falls through to `MIXED` - "value moved
  // between pools and we cannot characterise the crossing" - which is an
  // admission rather than a claim, and is the correct answer until HANDOFF-07
  // decodes the Ironwood bundle and MIGRATION_O2I above can fire.
  if (valueFlow.direction === "DEPOSIT" && hasTransparentInputs) return "T_TO_Z";
  if (valueFlow.direction === "WITHDRAWAL" && hasTransparentOutputs) return "Z_TO_T";
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
