import { useMemo } from "react";
import type { RawReport } from "../hooks/useMempool";
import { shortHex } from "../lib/formatters";
import { SEVERITY_COLOR, LEAK_CLASS_LABEL } from "../lib/tokens";
import type { Severity, LeakClass } from "@zcashreveal/types";

interface Props { reports: RawReport[]; }

export function MarqueeTape({ reports }: Props) {
  const items = useMemo(() => reports.slice(0, 30), [reports]);

  if (items.length === 0) {
    return (
      <div className="border-b border-[var(--color-edge)] h-7 flex items-center px-6 mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-dim)] mr-3" />
        waiting for transactions
      </div>
    );
  }

  const doubled = [...items, ...items];

  return (
    <div className="border-b border-[var(--color-edge)] h-7 overflow-hidden relative">
      <div className="marquee absolute inset-y-0 flex items-center gap-7 whitespace-nowrap px-6">
        {doubled.map((r, i) => (<TapeItem key={`${r.txid}-${i}`} report={r} />))}
      </div>
      <div className="absolute inset-y-0 left-0 w-12 pointer-events-none z-10" style={{ background: "linear-gradient(to right, var(--color-canvas), transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-12 pointer-events-none z-10" style={{ background: "linear-gradient(to left, var(--color-canvas), transparent)" }} />
    </div>
  );
}

function TapeItem({ report }: { report: RawReport }) {
  return (
    <span className="flex items-center gap-2 mono text-[10px]">
      <span className="h-1 w-1 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[report.overallSeverity as Severity] }} />
      <span className="text-[var(--color-ink-muted)]">{shortHex(report.txid, 6, 4)}</span>
      <span className="display-italic text-[12px] text-[var(--color-ink)]">{LEAK_CLASS_LABEL[report.leakClass as LeakClass]}</span>
    </span>
  );
}
