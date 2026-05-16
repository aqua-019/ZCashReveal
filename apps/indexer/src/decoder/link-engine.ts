/**
 * Round-trip link engine.
 *
 * Productionized Kappos et al. (USENIX Security 2018) heuristic.
 * v0.2 note: this is the *boundary-flow* approximation. Whiteboard
 * RESEARCH.md describes the constraint-and-uncertainty upgrade
 * (anchor-bounded candidate sets + Shannon entropy / N_eff) that
 * supersedes this in v0.2.
 */

import type {
  Hex,
  Zatoshi,
  LeakReport,
  LinkRecord,
} from "@zcashreveal/types";

const ZIP317_MARGINAL_FEE_ZAT = 5_000n;
const MAX_INTERNAL_HOPS = 4n;
const FEE_TOLERANCE_ZAT = ZIP317_MARGINAL_FEE_ZAT * MAX_INTERNAL_HOPS * 8n;
const MAX_LINK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ShieldingDeposit {
  txid: Hex;
  senderAddress: string | null;
  amountZat: Zatoshi;
  seenAt: number;
  pool: "sapling" | "orchard";
}

interface UnshieldingWithdrawal {
  txid: Hex;
  recipientAddress: string | null;
  amountZat: Zatoshi;
  seenAt: number;
  pool: "sapling" | "orchard";
}

export class LinkEngine {
  private deposits: ShieldingDeposit[] = [];
  private withdrawals: UnshieldingWithdrawal[] = [];

  ingest(report: LeakReport): LinkRecord[] {
    this.prune(Date.now());

    const sapBal = BigInt(report.bundle.saplingValueBalanceZat);
    const orchBal = BigInt(report.bundle.orchardValueBalanceZat);

    if (sapBal < 0n) {
      this.deposits.push({
        txid: report.txid,
        senderAddress: report.identity.sender.transparentAddresses[0] ?? null,
        amountZat: -sapBal,
        seenAt: report.seenAt,
        pool: "sapling",
      });
    }
    if (orchBal < 0n) {
      this.deposits.push({
        txid: report.txid,
        senderAddress: report.identity.sender.transparentAddresses[0] ?? null,
        amountZat: -orchBal,
        seenAt: report.seenAt,
        pool: "orchard",
      });
    }

    const hits: LinkRecord[] = [];
    if (sapBal > 0n) {
      const w: UnshieldingWithdrawal = {
        txid: report.txid,
        recipientAddress: report.identity.recipient.transparentAddresses[0] ?? null,
        amountZat: sapBal,
        seenAt: report.seenAt,
        pool: "sapling",
      };
      this.withdrawals.push(w);
      hits.push(...this.matchWithdrawal(w));
    }
    if (orchBal > 0n) {
      const w: UnshieldingWithdrawal = {
        txid: report.txid,
        recipientAddress: report.identity.recipient.transparentAddresses[0] ?? null,
        amountZat: orchBal,
        seenAt: report.seenAt,
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
      if (delta > MAX_LINK_WINDOW_MS) continue;

      if (d.amountZat === w.amountZat) {
        exactCandidates.push(d);
      } else {
        const diff =
          d.amountZat > w.amountZat
            ? d.amountZat - w.amountZat
            : w.amountZat - d.amountZat;
        if (diff <= FEE_TOLERANCE_ZAT) {
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
        });
      }
    }

    return out;
  }

  private prune(now: number) {
    const cutoff = now - MAX_LINK_WINDOW_MS;
    this.deposits = this.deposits.filter((d) => d.seenAt >= cutoff);
    this.withdrawals = this.withdrawals.filter((w) => w.seenAt >= cutoff);
  }

  snapshot() {
    return {
      depositCount: this.deposits.length,
      withdrawalCount: this.withdrawals.length,
      windowMs: MAX_LINK_WINDOW_MS,
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
