/**
 * Round-trip detection — replaces the v0.1 LinkEngine (link-engine.ts).
 *
 * Maintains a sliding time window of shielding deposits and unshielding
 * withdrawals across both pools. For each new report, prunes expired
 * entries, records the report's contribution as a deposit and/or
 * withdrawal, and emits LinkRecords for any newly-matchable pairs.
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

import type { Hex, LeakReport, LinkRecord, Zatoshi } from "@zcashreveal/types";
import { FEE_TOLERANCE_ZAT, MAX_LINK_WINDOW_MS } from "./constants.js";

interface ShieldingDeposit {
  readonly txid: Hex;
  readonly senderAddress: string | null;
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: "sapling" | "orchard";
}

interface UnshieldingWithdrawal {
  readonly txid: Hex;
  readonly recipientAddress: string | null;
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: "sapling" | "orchard";
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
   */
  ingest(report: LeakReport): LinkRecord[] {
    this.prune(this.now());

    const sapBal = BigInt(report.bundle.saplingValueBalanceZat);
    const orchBal = BigInt(report.bundle.orchardValueBalanceZat);

    if (sapBal < 0n) {
      this.deposits.push({
        txid: report.txid,
        senderAddress: report.identity.sender.transparentAddresses[0] ?? null,
        amountZat: -sapBal,
        seenAt: report.seenAt,
        height: report.tipHeightAtSeen,
        pool: "sapling",
      });
    }
    if (orchBal < 0n) {
      this.deposits.push({
        txid: report.txid,
        senderAddress: report.identity.sender.transparentAddresses[0] ?? null,
        amountZat: -orchBal,
        seenAt: report.seenAt,
        height: report.tipHeightAtSeen,
        pool: "orchard",
      });
    }

    const hits: LinkRecord[] = [];
    if (sapBal > 0n) {
      const w: UnshieldingWithdrawal = {
        txid: report.txid,
        recipientAddress:
          report.identity.recipient.transparentAddresses[0] ?? null,
        amountZat: sapBal,
        seenAt: report.seenAt,
        height: report.tipHeightAtSeen,
        pool: "sapling",
      };
      this.withdrawals.push(w);
      hits.push(...this.matchWithdrawal(w));
    }
    if (orchBal > 0n) {
      const w: UnshieldingWithdrawal = {
        txid: report.txid,
        recipientAddress:
          report.identity.recipient.transparentAddresses[0] ?? null,
        amountZat: orchBal,
        seenAt: report.seenAt,
        height: report.tipHeightAtSeen,
        pool: "orchard",
      };
      this.withdrawals.push(w);
      hits.push(...this.matchWithdrawal(w));
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

function poolPath(
  fromPool: "sapling" | "orchard",
  toPool: "sapling" | "orchard",
): LinkRecord["poolPath"] {
  if (fromPool === toPool) return fromPool;
  return `${fromPool}→${toPool}` as LinkRecord["poolPath"];
}
