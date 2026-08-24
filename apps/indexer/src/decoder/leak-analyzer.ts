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
  Zip318MigrationRecord,
} from "@zcashreveal/types";

import { decodeSaplingSpends, decodeSaplingOutputs } from "./sapling.js";
import { decodeOrchardBundle, orchardProofSizeViolation } from "./orchard.js";
import { decodeIronwoodBundle } from "./ironwood.js";
import { sproutValueBalanceZat } from "./sprout.js";
import { dispatchByVersion, IRONWOOD_MIN_TX_VERSION, topLevelFieldNames } from "./v6.js";
import { NU6_2_ACTIVATION_MAINNET, NU6_2_ACTIVATION_TESTNET, type Network } from "./activation-heights.js";
import { AnchorRegistry } from "./anchor-depth.js";
import { guessWallet, isZip317Conventional } from "./fingerprint.js";
import {
  canonicalDenomination,
  isBelowMaxResidual,
  isOverDenomCap,
  zip317LogicalActions,
} from "@zcashreveal/types";
import { joinSplitObservability, type JoinSplitObservability } from "@zcashreveal/zebra-rpc";
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
   * An OVERRIDE for Ironwood's value balance. Three states, and the difference
   * between them is the point.
   *
   *   `undefined` (omitted)  use the value this analyser DECODED from the
   *                          transaction's own `ironwood` bundle. This is what
   *                          the live path does, and what almost every caller
   *                          should do.
   *   `null`                 explicitly WITHHOLD the balance: treat it as not
   *                          known, so `MIGRATION_O2I` cannot fire however the
   *                          rest of the transaction looks.
   *   a `Zatoshi`            use this instead of the decoded value.
   *
   * WHAT THIS FIELD WAS, AND WHY IT IS NOT THAT ANY MORE. HANDOFF-06 added it
   * as the only way the `MIGRATION_O2I` rule could be reached at all: the rule
   * was implemented, `analyze()` passed a literal `null`, and no transaction of
   * any shape could reach the branch while the docblock beside it claimed the
   * classifier's unit tests supplied the balance directly - which they could
   * not, `classifyLeak` being module-private. HANDOFF-07 decodes the bundle, so
   * the seam is no longer load-bearing for the live path and `undefined` is now
   * the right answer for every production caller.
   *
   * IT IS KEPT, NOT DELETED, AND KEPT AS A THREE-STATE RATHER THAN A NULLABLE.
   * `null` is what makes assertion A8's fail side discriminate: withholding the
   * balance at the call site must produce `MIXED` for a transaction that
   * otherwise classifies `MIGRATION_O2I`, and there is no way to demonstrate
   * that if the only input is the transaction itself. A fail-side probe that
   * cannot fail is a finding in this project (LEDGER-05 fold 7), so the
   * mechanism that lets it fail is worth a field.
   */
  ironwoodValueBalanceZat?: Zatoshi | null | undefined;
  /**
   * Which network's activation heights the height-dependent rules use.
   *
   * Only ZIP 257's canonical proof length reads it today, and only to decide
   * whether NU6.2 had happened at `tipHeight`. Defaults to mainnet so every
   * existing construction site keeps its meaning - the two networks' NU6.2
   * heights differ by nearly 700,000 blocks, so a testnet replay that did not
   * say so would apply the rule from the wrong side of the boundary.
   */
  network?: Network | undefined;
}

export async function analyze(
  tx: RpcTransaction,
  ctx: AnalyzeContext,
): Promise<LeakReport> {
  // BEFORE ANY FIELD IS INTERPRETED, DECIDE WHETHER THIS SHAPE IS MODELLED AT
  // ALL. Running the decoders over an unmodelled version would produce zeros
  // for everything they did not find, and publish them as measurements about
  // bytes nobody here understands. See decoder/v6.ts.
  const dispatch = dispatchByVersion(tx);
  if (dispatch.kind === "UNSUPPORTED") {
    return unsupportedReport(tx, ctx, dispatch.reason, dispatch.rawFieldNames);
  }

  const saplingSpends = decodeSaplingSpends(tx.vShieldedSpend);
  const saplingOutputs = decodeSaplingOutputs(tx.vShieldedOutput);
  const orchard = decodeOrchardBundle(tx.orchard);
  const ironwood = decodeIronwoodBundle(tx.ironwood);

  const saplingValueBalanceZat = BigInt(tx.valueBalanceZat ?? 0);
  const orchardValueBalanceZat = orchard.valueBalanceZat;
  // DECODED, NOT SUPPLIED, SINCE HANDOFF-07. `ctx.ironwoodValueBalanceZat` can
  // still override it - `null` to withhold, a number to substitute - and the
  // live path does neither.
  const ironwoodDecodedZat = ironwood.valueBalanceZat;
  const ironwoodValueBalanceZat: Zatoshi | null =
    ctx.ironwoodValueBalanceZat === undefined
      ? ironwoodDecodedZat
      : ctx.ironwoodValueBalanceZat;
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

  // Ironwood actions carry an anchor exactly as Orchard's do, so the anchor
  // depth is computed the same way. It will resolve to `null` until something
  // records Ironwood anchors into the registry, and a null depth is reported as
  // a null depth rather than as a zero.
  if (ironwood.anchor && ironwood.actions.length > 0) {
    const anchorHeight = await ctx.anchorRegistry.getHeightForAnchor(ironwood.anchor);
    const depth = anchorHeight === null ? null : ctx.tipHeight - anchorHeight;
    const isRecent =
      depth !== null && depth >= 0 && depth < ctx.recentAnchorThreshold;
    for (const a of ironwood.actions) {
      spendAnnotations.push({
        pool: "ironwood",
        index: a.index,
        nullifier: a.nullifier,
        anchor: ironwood.anchor,
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
  for (const a of ironwood.actions) {
    outputAnnotations.push({ pool: "ironwood", index: a.index, commitment: a.cmx });
  }

  const netTransparentInflowZat = computeTransparentInflow(tx);
  const valueFlow = classifyValueFlow({
    sproutValueBalanceZat: sproutBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    // The DECODED value, never the override. `perPoolZat` is a record of what
    // this transaction did; a caller withholding the balance to test a
    // classifier branch must not thereby erase the pool from the report.
    ironwoodValueBalanceZat: ironwoodDecodedZat,
    netTransparentInflowZat,
    hasShieldedAny:
      saplingSpends.length +
        saplingOutputs.length +
        orchard.actions.length +
        ironwood.actions.length >
        0 || sproutBalanceZat !== 0n,
  });

  const leakClass = classifyLeak({
    valueFlow,
    saplingSpendCount: saplingSpends.length,
    saplingOutputCount: saplingOutputs.length,
    orchardActionCount: orchard.actions.length,
    sproutValueBalanceZat: sproutBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    // DECODED FROM THE TRANSACTION, unless the caller overrode it above. This
    // comment used to say the opposite - "the live path leaves it unset" - and
    // it was true until this handoff decoded the bundle. A correction that
    // lands in the code and leaves a restatement of the old fact standing
    // beside it is the sweep-the-corrected-fact defect inside a single file,
    // and a reader who trusted this sentence would conclude MIGRATION_O2I is
    // still unreachable in production, which is precisely the claim HANDOFF-06
    // was punished for making. See the three-state contract on `AnalyzeContext`.
    ironwoodValueBalanceZat,
    ironwoodActionCount: ironwood.actions.length,
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
    ironwoodActionCount: ironwood.actions.length,
    logicalActions,
    feeZat,
    expiryDelta,
    hasOrchardBundle: orchard.actions.length > 0,
    hasSaplingBundle: saplingSpends.length + saplingOutputs.length > 0,
    hasIronwoodBundle: ironwood.actions.length > 0,
  });

  const fingerprint: FingerprintAnnotation = {
    outputCount:
      tx.vout.length + saplingOutputs.length + orchard.actions.length + ironwood.actions.length,
    spendCount:
      tx.vin.length + saplingSpends.length + orchard.actions.length + ironwood.actions.length,
    outputPadded:
      saplingOutputs.length >= 2 || orchard.actions.length >= 2 || ironwood.actions.length >= 2,
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
    logicalActions,
    expiryDelta,
    hasMemo: false,
    likelyWallet: wallet,
  };

  // The ZIP 318 record, built only when the class says this IS a crossing.
  // Derived from the class rather than from the balances a second time: two
  // derivations of one quantity is how `summary.conventionalFeeZat` came to
  // mean two things in HANDOFF-05.
  const migration: Zip318MigrationRecord | null =
    leakClass === "MIGRATION_O2I"
      ? migrationRecord(orchardValueBalanceZat, ironwoodValueBalanceZat)
      : null;

  const findings: Finding[] = collectFindings({
    leakClass,
    valueFlow,
    spendAnnotations,
    fingerprint,
    saplingSpends,
    saplingOutputs,
    orchard,
    ironwood,
    migration,
    // ZIP 257's canonical proof length applies to the Orchard bundle from
    // NU6.2, and to no other pool - see orchardProofSizeViolation.
    proofSize: orchardProofSizeViolation({
      proof: tx.orchard?.proof,
      actionCount: orchard.actions.length,
      height: ctx.tipHeight,
      nu6_2ActivationHeight:
        (ctx.network ?? "mainnet") === "mainnet"
          ? NU6_2_ACTIVATION_MAINNET
          : NU6_2_ACTIVATION_TESTNET,
    }),
    // A v6 transaction with no `ironwood` key at all is how a wrong guess at
    // the wire field name would look. Its own finding code, not
    // UNSUPPORTED_TX_SHAPE: this report is fully decoded and its class is not
    // UNSUPPORTED_TX, so sharing a code with the abstention path would give one
    // machine-readable signal two mutually exclusive meanings and make neither
    // countable.
    ironwoodKeyMissingOnV6:
      tx.version >= IRONWOOD_MIN_TX_VERSION && tx.ironwood === undefined
        ? topLevelFieldNames(tx)
        : null,
    // Whether `sproutBalanceZat` above is a measurement or an assumption. It is
    // `0n` in both the "no JoinSplits" case and the "node too old to serialise
    // the field" case, and only this can tell them apart.
    joinSplits: joinSplitObservability(tx),
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
    ironwoodActions: ironwood.actions,
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
      ironwoodActions: ironwood.actions,
      ironwoodValueBalanceZat: ironwoodDecodedZat,
      ironwoodAnchor: ironwood.anchor,
      ironwoodFlags: ironwood.flags,
    },
    transparent,
    identity,
    spends: spendAnnotations,
    outputs: outputAnnotations,
    valueFlow,
    fingerprint,
    findings,
    links: [],
    ...(migration === null ? {} : { migration }),
  };
}

/**
 * The report for a transaction this decoder declined to read.
 *
 * EVERY NUMBER ON IT IS A DEFAULT AND NOT A MEASUREMENT, and `unsupported`'s
 * presence is what says so. That is a stronger claim than it looks, so it is
 * worth being explicit about why the alternative was worse. The alternative was
 * to run the Sapling, Orchard and Ironwood decoders anyway and let them return
 * whatever they found: for an unmodelled version they would find nothing and
 * return zeros, and the report would publish "this transaction moved no
 * shielded value" about bytes nobody here understands. That is `tx.feeZat` and
 * `expiryheight` a fourth time - a fabricated measurement with a green suite -
 * and it would be about a shape the project has no way to check itself against.
 *
 * WHY NOT MAKE EVERY FIELD NULLABLE INSTEAD. Because the honesty would be
 * per-field and the fact is per-report: nothing here was measured, not one
 * thing more or less than another. A `Zatoshi | null` on the Ironwood balance
 * alone would say Ironwood is unknown while Sapling's `0n` beside it still read
 * as measured, which is less true than saying it once, loudly, at the top.
 * `LeakReport.unsupported` is that one place, and it is documented as the field
 * a consumer must read before any number on the report.
 *
 * `perPoolZat` IS EMPTY AND `direction` IS "NONE" - the shapes that already
 * mean "no pool movement was recorded" - so a consumer that ignores
 * `unsupported` entirely still gets the least wrong answer available rather
 * than a confident one. `overallSeverity` is INFO: nothing is wrong with the
 * transaction, only with this build's ability to read it.
 */
async function unsupportedReport(
  tx: RpcTransaction,
  ctx: AnalyzeContext,
  reason: string,
  rawFieldNames: string[],
): Promise<LeakReport> {
  const empty: ValueBalanceAnnotation = {
    sproutValueBalanceZat: 0n,
    saplingValueBalanceZat: 0n,
    orchardValueBalanceZat: 0n,
    ironwoodValueBalanceZat: 0n,
    perPoolZat: [],
    netTransparentInflowZat: 0n,
    isPureShielded: false,
    crossesPoolBoundary: false,
    direction: "NONE",
  };

  return Promise.resolve({
    txid: tx.txid,
    seenAt: ctx.seenAt,
    tipHeightAtSeen: ctx.tipHeight,
    txVersion: tx.version,
    leakClass: "UNSUPPORTED_TX",
    overallSeverity: "INFO",
    bundle: {
      saplingSpends: [],
      saplingOutputs: [],
      saplingValueBalanceZat: 0n,
      orchardActions: [],
      orchardValueBalanceZat: 0n,
      orchardAnchor: null,
      orchardFlags: null,
      ironwoodActions: [],
      ironwoodValueBalanceZat: 0n,
      ironwoodAnchor: null,
      ironwoodFlags: null,
    },
    // The transparent side is not copied either. `vin`/`vout` are version-
    // independent in every format this project knows, so copying them would
    // usually be right - and "usually right about a shape we just said we do
    // not model" is the reasoning this whole path exists to refuse.
    transparent: { vin: [], vout: [] },
    identity: {
      sender: { transparentAddresses: [], nullifiers: [], commitments: [] },
      recipient: { transparentAddresses: [], nullifiers: [], commitments: [] },
    },
    spends: [],
    outputs: [],
    valueFlow: empty,
    fingerprint: {
      outputCount: 0,
      spendCount: 0,
      outputPadded: false,
      feeZat: null,
      isZip317ConventionalFee: null,
      logicalActions: 0,
      expiryDelta: null,
      hasMemo: false,
      likelyWallet: "UNKNOWN_UNPRICED",
    },
    findings: [
      {
        code: "UNSUPPORTED_TX_SHAPE",
        severity: "INFO",
        message: `${reason}. Nothing on this report was measured. Top-level keys present: ${rawFieldNames.join(", ")}`,
      },
    ],
    links: [],
    unsupported: { version: tx.version, reason, rawFieldNames },
  });
}

/**
 * Build the ZIP 318 record for a crossing the classifier has already accepted.
 *
 * TWO MAGNITUDES, NOT ONE, AND THEY DIFFER BY THE FEE. `amountZat` is what LEFT
 * Orchard and `arrivedZat` is what ENTERED Ironwood; a migration pays its fee
 * out of the note it spends, so the second is the smaller. Which of the two ZIP
 * 318 means by "the net amount crossing between the pools" is not settled by
 * anything in this repository, and the corpus's `DENOM_CAP` is stated both as
 * "10,000 ZEC plus canonical fee" and as a flat 10,000 - a difference that only
 * makes sense if the two authors had different sides in mind. So BOTH are
 * recorded, the fee is recoverable as the difference, and the question is
 * carried as a deferred assumption rather than closed by picking one quietly.
 *
 * THE DENOMINATION IS TESTED ON THE ORCHARD SIDE. Phase 1 of ZIP 318 quantises
 * a wallet's balance into canonical denominations by sending to ITSELF inside
 * Orchard; phase 2 spends one of those notes across the boundary. So the
 * quantised quantity is the note, which is what left Orchard - and it is also
 * the quantity the Orchard drain measures, so it is the one the migration lens
 * and `pool_snapshots` will need to agree with.
 */
function migrationRecord(
  orchardValueBalanceZat: Zatoshi,
  ironwoodValueBalanceZat: Zatoshi | null,
): Zip318MigrationRecord {
  const amountZat = orchardValueBalanceZat;
  // Negative means value entered, so the magnitude that arrived is its negation.
  // `null` cannot reach here: the classifier requires a non-null negative
  // balance before it returns MIGRATION_O2I. Handled anyway rather than
  // asserted, because a `!` here would be a claim about a caller.
  const arrivedZat = ironwoodValueBalanceZat === null ? 0n : -ironwoodValueBalanceZat;
  const denomination = canonicalDenomination(amountZat);
  return {
    amountZat,
    arrivedZat,
    denomination,
    canonical: denomination !== null,
    overDenomCap: isOverDenomCap(amountZat),
    belowMaxResidual: isBelowMaxResidual(amountZat),
  };
}

function buildIdentityProfile(input: {
  transparent: { vin: Array<{ address: string | null }>; vout: Array<{ addresses: string[] }> };
  saplingSpends: Array<{ pool: "sapling"; nullifier: Hex }>;
  saplingOutputs: Array<{ pool: "sapling"; cmu: Hex }>;
  orchardActions: Array<{ pool: "orchard"; nullifier: Hex; cmx: Hex }>;
  ironwoodActions: Array<{ pool: "ironwood"; nullifier: Hex; cmx: Hex }>;
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
        ...input.ironwoodActions.map((a) => ({ pool: "ironwood" as const, value: a.nullifier })),
      ],
      commitments: [],
    },
    recipient: {
      transparentAddresses: recipientAddrs,
      nullifiers: [],
      commitments: [
        ...input.saplingOutputs.map((o) => ({ pool: "sapling" as const, value: o.cmu })),
        ...input.orchardActions.map((a) => ({ pool: "orchard" as const, value: a.cmx })),
        ...input.ironwoodActions.map((a) => ({ pool: "ironwood" as const, value: a.cmx })),
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
 * ALL FOUR POOLS ARE COUNTED HERE SINCE HANDOFF-07, and the two that arrived
 * late arrived for opposite reasons. Sprout's absence through HANDOFF-05 was a
 * defect: a JoinSplit transaction had a boundary of exactly zero, so it
 * classified as transparent throughout and the pool it actually drained did not
 * appear in its deltas. Ironwood's absence through HANDOFF-06 was a refusal -
 * the bundle was not decoded, and an always-zero entry would have rendered as a
 * measurement. Now that it is decoded, `ironwoodValueBalanceZat` of `0n` means
 * the transaction carried no Ironwood movement, and the pool is omitted from
 * `perPoolZat` on the same terms as the other three.
 *
 * A MIGRATION NOW CONTRIBUTES TWO ENTRIES, NOT ONE, and anything summing this
 * array has to know that. An Orchard-to-Ironwood crossing publishes Orchard
 * positive and Ironwood negative, so the SUM of `perPoolZat` for such a
 * transaction is the fee, not the amount that crossed. That was not true
 * yesterday - only the Orchard leg existed - so a consumer that reduces this
 * array to one number was correct by accident and is now wrong. The gateway's
 * mempool view is the one that was; see `netCrossingZat` there.
 */
function classifyValueFlow(input: {
  sproutValueBalanceZat: Zatoshi;
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  ironwoodValueBalanceZat: Zatoshi;
  netTransparentInflowZat: Zatoshi;
  hasShieldedAny: boolean;
}): ValueBalanceAnnotation {
  const {
    sproutValueBalanceZat,
    saplingValueBalanceZat,
    orchardValueBalanceZat,
    ironwoodValueBalanceZat,
  } = input;

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
  if (ironwoodValueBalanceZat !== 0n)
    perPoolZat.push({ pool: "ironwood", deltaZat: ironwoodValueBalanceZat });

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
    ironwoodValueBalanceZat,
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
 * observed. Both halves ARE observed since HANDOFF-07: Sapling and Orchard
 * publish a `valueBalance`, and Ironwood's bundle is decoded from the v6
 * transaction, so `MIGRATION_O2I` fires on the live path rather than only
 * through a supplied value.
 *
 * IT DID NOT, FOR ONE HANDOFF, AND THE HISTORY IS WORTH KEEPING. HANDOFF-06
 * implemented this rule while `analyze()` passed a literal `null`, so no
 * transaction of any shape could reach the branch - and the docblock here
 * asserted that the classifier's unit tests exercised it, which they could not,
 * `classifyLeak` being module-private. A gate round found it and added
 * `AnalyzeContext.ironwoodValueBalanceZat` as a seam. That seam survives as an
 * OVERRIDE rather than as the only way in: `null` withholds the balance, which
 * is what lets assertion A8's fail side actually fail.
 *
 * NO HEURISTIC STANDS IN FOR A MISSING HALF, AND THAT STILL MATTERS. It would
 * be easy to guess: at a height past NU6.3, Orchard is exit-only, so value
 * leaving Orchard with no transparent output to receive it has nowhere to go
 * but Ironwood. That inference is defensible and it is still a guess, and it
 * would misclassify an Orchard-to-Sapling transfer as a migration - a specific
 * false statement about a specific transaction, which is the one thing this
 * project will not publish to fill a gap. So the rule reads the Ironwood
 * balance and returns `MIXED` when it cannot.
 */
function classifyLeak(input: {
  valueFlow: ValueBalanceAnnotation;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActionCount: number;
  ironwoodActionCount: number;
  sproutValueBalanceZat: Zatoshi;
  saplingValueBalanceZat: Zatoshi;
  orchardValueBalanceZat: Zatoshi;
  /** `null` means WITHHELD by the caller, which is not the same as zero. */
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
    ironwoodActionCount,
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
  const hasIronwood = ironwoodActionCount > 0;
  const hasShielded = hasSprout || hasSapling || hasOrchard || hasIronwood;

  if (!hasShielded) return "FULLY_TRANSPARENT";
  if (hasCoinbase) return "COINBASE_SHIELDED";

  // Orchard drains, Ironwood fills: ZIP 318. Checked before Sapling-to-Orchard
  // because a transaction can carry both bundles and the newer crossing is the
  // more specific fact about it.
  // ZIP 318 IS ONE POOL DRAINING INTO ONE OTHER POOL AND NOTHING ELSE, so the
  // rule is stated as a shape rather than as a pile of conjuncts about two
  // pools. The first version read only "Orchard positive and Ironwood
  // negative", which is satisfied by a transaction that ALSO drains Sapling
  // into the same Ironwood output - and a gate round showed what that
  // published: `amountZat` took the Orchard leg alone while `arrivedZat` took
  // the whole Ironwood leg, so the finding a reader saw said 500 ZEC left
  // Orchard and 700 ZEC entered Ironwood. A pool crossing that created 200 ZEC.
  //
  // The shape is: exactly one pool lost value and it is Orchard; exactly one
  // pool gained value and it is Ironwood; nothing transparent is involved.
  // ZIP 318 spends exactly one Orchard note into exactly one Ironwood output
  // (docs/2.0/research/01-contemporary-zcash.md §2.7), so anything else in the
  // transaction means it is not the crossing this class names.
  //
  // THE TRANSPARENT CLAUSES ARE BOTH LOAD-BEARING AND IN OPPOSITE DIRECTIONS. A
  // crossing that also pays a transparent OUTPUT would be published as a pure
  // pool crossing while a public recipient stood in the same transaction; one
  // funded from a transparent INPUT would hide a public funding address the
  // same way. Both are the opposite of what this site exists to notice, and
  // both are tested.
  const drained = valueFlow.perPoolZat.filter((p) => p.deltaZat > 0n);
  const filled = valueFlow.perPoolZat.filter((p) => p.deltaZat < 0n);
  if (
    hasOrchard &&
    drained.length === 1 &&
    drained[0]?.pool === "orchard" &&
    filled.length === 1 &&
    filled[0]?.pool === "ironwood" &&
    orchardValueBalanceZat > 0n &&
    // Still read from the CLASSIFIER's input rather than from `perPoolZat`,
    // because a caller may withhold it (`null`) to test that this branch is
    // reachable only with the balance - which is A8's fail side.
    ironwoodValueBalanceZat !== null &&
    ironwoodValueBalanceZat < 0n &&
    !hasTransparentInputs &&
    !hasTransparentOutputs
  ) {
    return "MIGRATION_O2I";
  }

  // THE SAME SHAPE TEST, BECAUSE IT IS THE SAME CLAIM ONE POOL PAIR OVER. This
  // was the four-conjunct pile the block above was rewritten out of - two
  // bundle counts and two signs, with no shape test and no transparent clauses
  // - and a gate round found it fires on the shapes the O2I sibling now
  // refuses: a Sapling-to-Orchard transfer that also pays a transparent address
  // was published as a "textbook migration" while a public recipient stood in
  // the same transaction, and so was one funded from a transparent input, and
  // so was one draining Sprout at the same time.
  //
  // It is a smaller harm than the O2I case - no arithmetic creates ZEC here,
  // and the row still draws a transparent lane swatch, so the public side stays
  // visible while the label overstates - which is why it was rated LOW and is
  // still fixed. A file that argues a rule for twenty lines and then declines
  // to apply it three lines later is worse than one that never argued it: the
  // next reader takes the argument as the file's practice.
  if (
    saplingSpendCount > 0 &&
    orchardActionCount > 0 &&
    drained.length === 1 &&
    drained[0]?.pool === "sapling" &&
    filled.length === 1 &&
    filled[0]?.pool === "orchard" &&
    saplingValueBalanceZat > 0n &&
    orchardValueBalanceZat < 0n &&
    !hasTransparentInputs &&
    !hasTransparentOutputs
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
  ironwood: { actions: unknown[]; anchor: string | null };
  migration: Zip318MigrationRecord | null;
  proofSize: { expectedBytes: number; actualBytes: number } | null;
  ironwoodKeyMissingOnV6: string[] | null;
  joinSplits: JoinSplitObservability;
}): Finding[] {
  const out: Finding[] = [];

  // THE SPROUT TERM MAY BE AN ASSUMPTION RATHER THAN A MEASUREMENT, AND THIS IS
  // WHERE THAT IS SAID OUT LOUD. `sproutValueBalanceZat` returns `0n` both for a
  // transaction with no JoinSplits and for one whose node never serialised the
  // field - Zebra gained `vjoinsplit` on `getrawtransaction` only in PR #9805
  // (merged 22 Aug 2025), and this repository's compose file still pins 4.4.1.
  // Only versions 2 to 4 can carry a JoinSplit at all, so this fires on those
  // and stays silent on v5 and v6, where absence is a fact about the format.
  // INFO, not a warning: nothing is wrong with the transaction. See
  // `sprout-field.ts` in packages/zebra-rpc.
  if (input.joinSplits === "ABSENT_INDETERMINATE") {
    out.push({
      code: "SPROUT_FIELD_INDETERMINATE",
      severity: "INFO",
      message:
        "Node did not serialise `vjoinsplit` on a transaction version that can carry JoinSplits - the Sprout value balance is unknown, not zero. Zebra >= 6.0.0 (or any node with ZcashFoundation/zebra PR #9805) reports it.",
      field: "valueBalance",
    });
  }

  if (input.valueFlow.crossesPoolBoundary) {
    out.push({
      code: "VALUE_BALANCE_NONZERO",
      severity: "HIGH",
      // NOT "t to z". `perPoolZat` records that value crossed a POOL boundary,
      // and value leaving one pool lands in another pool as readily as in a
      // transparent output - which is the same confusion that made an
      // Orchard-to-Ironwood migration classify `Z_TO_T` in HANDOFF-06.
      message: `Tx crosses a pool boundary: ${describeFlow(input.valueFlow)}`,
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

  if (input.leakClass === "MIGRATION_O2I" && input.migration !== null) {
    const m = input.migration;
    out.push({
      code: "MIGRATION_PATTERN",
      severity: "MEDIUM",
      message:
        `ZIP 318 Orchard→Ironwood crossing: ${m.amountZat} zat left Orchard, ` +
        `${m.arrivedZat} zat entered Ironwood` +
        (m.denomination === null
          ? " — the amount is not a canonical denomination"
          : ` — canonical denomination ${m.denomination.n} x 10^${m.denomination.kZec} ZEC`),
    });

    // AN OBSERVATION ABOUT AN AMOUNT, NEVER ABOUT A SENDER. ZIP 318's privacy
    // defence is denomination bucketing plus scheduling, both heuristic, and
    // TRACKING-MATH 3.9 permits distributions and counts per window while
    // forbidding "wallet W migrated B". A per-crossing finding is the easiest
    // place in this codebase to break that rule, so it says only what the
    // amount is and what the corpus says about amounts of that size.
    if (!m.canonical || m.overDenomCap || m.belowMaxResidual) {
      const why: string[] = [];
      if (!m.canonical) why.push("not a canonical n x 10^k denomination");
      if (m.overDenomCap)
        why.push("above DENOM_CAP on the flat 10,000 ZEC reading, which the corpus states two ways");
      if (m.belowMaxResidual)
        why.push("below MAX_RESIDUAL_VALUE (0.01 ZEC), the size ZIP 318 leaves stranded in Orchard");
      out.push({
        code: "MIGRATION_DENOMINATION",
        severity: "LOW",
        message: `Crossing amount ${m.amountZat} zat: ${why.join("; ")}`,
        field: "valueBalance",
      });
    }
  }

  if (input.saplingSpends.length > 0 && input.orchard.actions.length > 0) {
    out.push({
      code: "MIXED_POOLS",
      severity: "MEDIUM",
      message: "Both Sapling and Orchard pools touched — wallet bridges both pools",
    });
  }

  // ZIP 257 fixed the Orchard proof length at NU6.2. A consensus-valid chain
  // cannot carry a violation, so this firing means THIS decoder miscounted the
  // actions or measured the wrong field - which is why it is a finding and not
  // a throw. See orchardProofSizeViolation.
  if (input.proofSize !== null) {
    out.push({
      code: "PROOF_SIZE_NONCANONICAL",
      severity: "MEDIUM",
      message:
        `Orchard proof is ${input.proofSize.actualBytes} bytes where ZIP 257 fixes ` +
        `${input.proofSize.expectedBytes} (2720 + 2272 x actions) from NU6.2. A block that ` +
        `reached consensus cannot carry this, so our reading of the bundle is the likelier fault.`,
      field: "valueBalance",
    });
  }

  // THE ALARM ON THE ONE UNVERIFIED FIELD NAME IN THIS DECODER. Nothing in this
  // repository has seen a real Ironwood bundle, and `ironwood` is inferred
  // rather than quoted. Zebra emits `orchard` unconditionally on the versions
  // that have it, so a v6 arriving with no `ironwood` key at all is the shape a
  // wrong guess would take - and under the belief this never fires. If it fires
  // on every v6 transaction, the name is wrong and every Ironwood balance this
  // build has published is a false zero.
  if (input.ironwoodKeyMissingOnV6 !== null) {
    out.push({
      code: "IRONWOOD_FIELD_ABSENT",
      severity: "LOW",
      message:
        "v6 transaction carried no `ironwood` key. Either the node omits an empty bundle, or " +
        "the field name this decoder reads is wrong and every Ironwood balance is a false zero. " +
        `Top-level keys present: ${input.ironwoodKeyMissingOnV6.join(", ")}`,
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

  // The three UNKNOWN_* members are not signatures, so none of them raises a
  // WALLET_FINGERPRINT finding. UNKNOWN_UNPRICED is new in HANDOFF-06 and had to
  // be added here as well: without it, "we could not price this transaction"
  // would have been reported to the reader as a matched wallet signature.
  if (
    input.fingerprint.likelyWallet !== "UNKNOWN_BUT_STANDARD" &&
    input.fingerprint.likelyWallet !== "UNKNOWN_NONSTANDARD" &&
    input.fingerprint.likelyWallet !== "UNKNOWN_UNPRICED"
  ) {
    out.push({
      code: "WALLET_FINGERPRINT",
      severity: "LOW",
      message: `Wallet signature matches: ${input.fingerprint.likelyWallet}`,
      field: "fingerprint",
    });
  }

  // FEE_OUTLIER requires a fee that was MEASURED and found non-conventional.
  // UNKNOWN_UNPRICED deliberately does not raise it: a finding that says
  // "non-ZIP-317 fee" about a transaction whose fee nobody computed is the
  // published form of the same conflation UNKNOWN_UNPRICED exists to end.
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

/**
 * The per-pool deltas as a sentence, read off `perPoolZat` and nothing else.
 *
 * TWO DEFECTS FIXED HERE AT ONCE, AND BOTH WERE ALREADY LIVE. It named Sapling
 * and Orchard only, so a Sprout-only crossing produced an EMPTY string and the
 * message it is interpolated into stopped at its colon - a sentence published
 * to a reader that says nothing. Ironwood would have been the second pool with
 * that behaviour. And it read the two named fields rather than `perPoolZat`,
 * which is the two-derivations-of-one-quantity split `ValueBalanceAnnotation`'s
 * own docblock forbids: a pool could appear in the array and not in the
 * sentence.
 *
 * Reading `perPoolZat` also makes the empty case impossible to reach from
 * `VALUE_BALANCE_NONZERO`, whose guard is `crossesPoolBoundary`, which is
 * `perPoolZat.length > 0`. The fallback below is kept anyway, because a
 * guard and its message living in different functions is exactly how the
 * empty string survived in the first place.
 */
function describeFlow(v: ValueBalanceAnnotation): string {
  const parts = v.perPoolZat.map(
    (p) => `${POOL_LABEL[p.pool]} ${p.deltaZat > 0n ? "+" : ""}${p.deltaZat} zat`,
  );
  return parts.length > 0 ? parts.join(", ") : "no per-pool delta recorded";
}

/** Display names for the four pools, in one place so two files cannot disagree. */
const POOL_LABEL: Record<ShieldedPool, string> = {
  sprout: "Sprout",
  sapling: "Sapling",
  orchard: "Orchard",
  ironwood: "Ironwood",
};

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
