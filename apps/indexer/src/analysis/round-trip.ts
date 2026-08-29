/**
 * Round-trip detection — replaces the v0.1 LinkEngine (link-engine.ts).
 *
 * Maintains a sliding time window of shielding deposits and unshielding
 * withdrawals across all four pools. For each new report, prunes expired
 * entries, records the report's contribution as a deposit and/or
 * withdrawal, and emits LinkRecords for any newly-matchable pairs.
 *
 * SINCE HANDOFF-08 A REPORT MUST HAVE A TRANSPARENT SIDE TO CONTRIBUTE ONE.
 * See the wide rule inside `ingest()`. It is the one change to this class's
 * behaviour since it replaced the v0.1 LinkEngine, and it removes links rather
 * than adding them: the links it removes were between wallets with no
 * relationship and no addresses.
 *
 * Match algorithm preserved BIT-FOR-BIT from link-engine.ts:
 *   - EXACT amount match takes precedence over FEE_TOLERANT
 *   - Single EXACT candidate  → confidence HIGH
 *   - Multiple EXACT candidates → confidence MEDIUM (per match)
 *   - Single FEE_TOLERANT candidate  → confidence MEDIUM
 *   - Multiple FEE_TOLERANT candidates → confidence LOW (per match)
 *
 * What's new in Module 5B vs the v0.1 LinkEngine:
 *   - `height` field on each deposit/withdrawal (from report.tipHeightAtSeen),
 *     to feed Module 7's amountMatchFilter when PoolState is plumbed.
 *   - Injectable `now` clock for deterministic pruning in tests.
 *   - Configurable `windowMs` and `feeToleranceZat` (defaults from
 *     constants.ts).
 *   - LinkRecord.assessment field declared optional and left undefined
 *     in this module (Module 7 will populate via assessFiltered once
 *     PoolState reaches AnalyzeContext).
 */

import type {
  Hex,
  LeakReport,
  LinkRecord,
  PoolPath,
  ShieldedPool,
  Zatoshi,
} from "@zcashreveal/types";
import { FEE_TOLERANCE_ZAT, MAX_LINK_WINDOW_MS } from "./constants.js";

interface ShieldingDeposit {
  readonly txid: Hex;
  readonly senderAddress: string | null;
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: ShieldedPool;
}

interface UnshieldingWithdrawal {
  readonly txid: Hex;
  readonly recipientAddress: string | null;
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: ShieldedPool;
}

export interface RoundTripIndexConfig {
  /** Match window in ms. Defaults to MAX_LINK_WINDOW_MS (7 days). */
  readonly windowMs?: number;
  /** Fee tolerance for fee-tolerant amount matching. Defaults to FEE_TOLERANCE_ZAT. */
  readonly feeToleranceZat?: bigint;
  /** Injectable clock for deterministic pruning in tests. Defaults to Date.now. */
  readonly now?: () => number;
}

export class RoundTripIndex {
  private deposits: ShieldingDeposit[] = [];
  private withdrawals: UnshieldingWithdrawal[] = [];
  private readonly windowMs: number;
  private readonly feeToleranceZat: bigint;
  private readonly now: () => number;

  constructor(config?: RoundTripIndexConfig) {
    this.windowMs = config?.windowMs ?? MAX_LINK_WINDOW_MS;
    this.feeToleranceZat = config?.feeToleranceZat ?? FEE_TOLERANCE_ZAT;
    this.now = config?.now ?? Date.now;
  }

  /**
   * Ingest a LeakReport: prune expired entries (using the injected clock),
   * record the report's deposit and/or withdrawal contribution, match
   * any new withdrawals against in-window deposits, and return the
   * resulting LinkRecords (which the caller assigns onto report.links).
   *
   * A report with no transparent side contributes NOTHING, however much value
   * it moved between pools. See the wide rule below.
   */
  ingest(report: LeakReport): LinkRecord[] {
    this.prune(this.now());

    const hits: LinkRecord[] = [];

    // FOUR POOLS, DRIVEN OFF `valueFlow.perPoolZat` RATHER THAN TWO NAMED
    // FIELDS. This used to read `bundle.saplingValueBalanceZat` and
    // `bundle.orchardValueBalanceZat` by name, in two hand-unrolled copies of
    // the same block, so a Sprout or Ironwood turnstile movement was invisible
    // to round-trip detection - no error, no warning, simply no links. Reading
    // the single list the analyser builds means a pool becomes visible here the
    // moment it becomes visible there, with no second place to remember.
    //
    // Sign convention, as everywhere: negative is value ENTERING the pool (a
    // shielding deposit), positive is value LEAVING it (an unshielding
    // withdrawal).
    // THE WIDE RULE (HANDOFF-08 deliverable 2, LEDGER-07 Q1). A deposit requires
    // a transparent INPUT and a withdrawal a transparent OUTPUT, and without
    // those two guards this index manufactured high-visibility links between
    // unrelated wallets.
    //
    // The mechanism, reproduced end to end on committed code by HANDOFF-07: a
    // pool-to-pool crossing is neither a deposit nor a withdrawal - it did not
    // come from the transparent side and it did not go there - but the loop
    // below read every `perPoolZat` leg as one or the other. One migration's
    // ARRIVING leg was filed as a deposit, a later unrelated migration's
    // DEPARTING leg matched it on amount, and out came a `LinkRecord` whose two
    // address fields were both `null`, because no transparent end existed. The
    // `LinkRecord` shape was the type system saying so and nobody was reading it.
    //
    // ZIP 318 IS WHY THIS IS URGENT RATHER THAN TIDY. Quantising migration
    // amounts to `n x 10^k` is the entire scheme, so two unrelated migrations of
    // the same denomination are the EXPECTED case once Ironwood is live, not a
    // coincidence. The defect's rate goes up with adoption.
    //
    // WHY THE WIDE RULE AND NOT THE NARROW ONE. The narrow guard considered -
    // skip a report whose `perPoolZat` both gained and lost - is a symptom
    // filter: it catches migrations because migrations happen to have that
    // shape, and it would keep admitting any future one-sided pool crossing. A
    // round-trip is a claim about value entering and leaving the TRANSPARENT
    // side, so requiring a transparent side is the definition rather than a
    // heuristic about it.
    const hasTransparentSource = report.transparent.vin.some((v) => !v.coinbase);
    const hasTransparentSink = report.transparent.vout.length > 0;

    for (const { pool, deltaZat } of report.valueFlow.perPoolZat) {
      if (deltaZat < 0n) {
        if (!hasTransparentSource) continue;
        this.deposits.push({
          txid: report.txid,
          senderAddress: report.identity.sender.transparentAddresses[0] ?? null,
          amountZat: -deltaZat,
          seenAt: report.seenAt,
          height: report.tipHeightAtSeen,
          pool,
        });
      } else if (deltaZat > 0n) {
        if (!hasTransparentSink) continue;
        const w: UnshieldingWithdrawal = {
          txid: report.txid,
          recipientAddress:
            report.identity.recipient.transparentAddresses[0] ?? null,
          amountZat: deltaZat,
          seenAt: report.seenAt,
          height: report.tipHeightAtSeen,
          pool,
        };
        this.withdrawals.push(w);
        hits.push(...this.matchWithdrawal(w));
      }
    }

    return hits;
  }

  private matchWithdrawal(w: UnshieldingWithdrawal): LinkRecord[] {
    const exactCandidates: ShieldingDeposit[] = [];
    const feeTolerantCandidates: ShieldingDeposit[] = [];

    for (const d of this.deposits) {
      if (d.seenAt >= w.seenAt) continue;
      const delta = w.seenAt - d.seenAt;
      if (delta > this.windowMs) continue;

      if (d.amountZat === w.amountZat) {
        exactCandidates.push(d);
      } else {
        const diff =
          d.amountZat > w.amountZat
            ? d.amountZat - w.amountZat
            : w.amountZat - d.amountZat;
        if (diff <= this.feeToleranceZat) {
          feeTolerantCandidates.push(d);
        }
      }
    }

    const out: LinkRecord[] = [];

    for (const d of exactCandidates) {
      out.push({
        shieldingTxid: d.txid,
        unshieldingTxid: w.txid,
        senderAddress: d.senderAddress,
        recipientAddress: w.recipientAddress,
        amountZat: w.amountZat,
        timeDeltaMs: w.seenAt - d.seenAt,
        matchKind: "EXACT",
        poolPath: poolPath(d.pool, w.pool),
        confidence: exactCandidates.length === 1 ? "HIGH" : "MEDIUM",
        // assessment is intentionally undefined here — Module 7 will
        // populate via assessFiltered once PoolState reaches AnalyzeContext.
      });
    }

    if (out.length === 0) {
      for (const d of feeTolerantCandidates) {
        out.push({
          shieldingTxid: d.txid,
          unshieldingTxid: w.txid,
          senderAddress: d.senderAddress,
          recipientAddress: w.recipientAddress,
          amountZat: w.amountZat,
          timeDeltaMs: w.seenAt - d.seenAt,
          matchKind: "FEE_TOLERANT",
          poolPath: poolPath(d.pool, w.pool),
          confidence: feeTolerantCandidates.length === 1 ? "MEDIUM" : "LOW",
          // assessment intentionally undefined — see EXACT match block above.
        });
      }
    }

    return out;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.deposits = this.deposits.filter((d) => d.seenAt >= cutoff);
    this.withdrawals = this.withdrawals.filter((w) => w.seenAt >= cutoff);
  }

  /** Diagnostic snapshot. windowMs reflects the effective configured value. */
  snapshot(): {
    readonly depositCount: number;
    readonly withdrawalCount: number;
    readonly windowMs: number;
  } {
    return {
      depositCount: this.deposits.length,
      withdrawalCount: this.withdrawals.length,
      windowMs: this.windowMs,
    };
  }
}

/**
 * The label for a link between two pools.
 *
 * NO CAST. This used to end `as LinkRecord["poolPath"]`, because the field was
 * a hand-enumerated union of the two-pool era - four members, none of them
 * `orchard->ironwood`. The assertion was what let a path outside the union be
 * stamped as inside it with no diagnostic, and it would have hidden exactly the
 * omission it was written around. `PoolPath` is now derived from `ShieldedPool`
 * as a template type, so the template expression below satisfies it by
 * construction and cannot fall behind the union.
 */
function poolPath(fromPool: ShieldedPool, toPool: ShieldedPool): PoolPath {
  if (fromPool === toPool) return fromPool;
  return `${fromPool}→${toPool}`;
}
