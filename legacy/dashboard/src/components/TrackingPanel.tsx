import { useMemo } from "react";
import type { RawReport } from "../hooks/useMempool";
import { shortHex, zatToZec } from "../lib/formatters";
import { IconArrowRight } from "./icons";

interface Props { reports: RawReport[]; }

interface LinkView {
  shieldingTxid: string;
  unshieldingTxid: string;
  senderAddress: string | null;
  recipientAddress: string | null;
  amountZat: string;
  timeDeltaMs: number;
  matchKind: "EXACT" | "FEE_TOLERANT";
  poolPath: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

const CONF_COLOR: Record<LinkView["confidence"], string> = {
  HIGH: "var(--color-critical)",
  MEDIUM: "var(--color-high)",
  LOW: "var(--color-medium)",
};

export function TrackingPanel({ reports }: Props) {
  const links = useMemo<LinkView[]>(() => {
    const seen = new Set<string>();
    const out: LinkView[] = [];
    for (const r of reports) {
      for (const l of r.links ?? []) {
        const key = `${l.shieldingTxid}::${l.unshieldingTxid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(l);
      }
    }
    return out;
  }, [reports]);

  return (
    <section className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="display text-[16px] text-ink">Round-trip links</h3>
        <span className="mono text-[9px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">kappos heuristic</span>
      </header>

      {links.length === 0 ? (
        <p className="mono text-[10px] text-[var(--color-ink-dim)] leading-[1.5]">
          No t→z deposits yet matched to z→t withdrawals.
          <br />
          Engine watches a rolling 7-day window.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((l, i) => (<LinkRow key={i} link={l} />))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({ link }: { link: LinkView }) {
  return (
    <li className="glass rounded-sm p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="pill" style={{ color: CONF_COLOR[link.confidence] }}>{link.confidence}</span>
        <span className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)]">
          {link.matchKind === "EXACT" ? "exact" : "fee-tol"} · {link.poolPath}
        </span>
      </div>

      <div className="flex items-center gap-2 mono text-[10px]">
        <span className="text-[var(--color-deposit)] truncate flex-1">
          {link.senderAddress ? shortHex(link.senderAddress, 6, 4) : "—"}
        </span>
        <IconArrowRight size={10} className="text-[var(--color-zec-gold)] shrink-0" />
        <span className="text-[var(--color-withdrawal)] truncate flex-1 text-right">
          {link.recipientAddress ? shortHex(link.recipientAddress, 6, 4) : "—"}
        </span>
      </div>

      <div className="flex items-center justify-between mono text-[10px]">
        <span className="text-ink">{zatToZec(link.amountZat)} ZEC</span>
        <span className="text-[var(--color-ink-dim)]">Δ {fmtTimeDelta(link.timeDeltaMs)}</span>
      </div>
    </li>
  );
}

function fmtTimeDelta(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}
