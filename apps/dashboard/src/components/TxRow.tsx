import clsx from "clsx";
import type { RawReport } from "../hooks/useMempool";
import { shortHex, fmtRelativeTime } from "../lib/formatters";
import { SEVERITY_COLOR, LEAK_CLASS_LABEL, LEAK_CLASS_COLOR } from "../lib/tokens";
import type { Severity, LeakClass } from "@zcashreveal/types";
import { IconArrowDown, IconArrowUp, IconArrowRight } from "./icons";

interface TxRowProps {
  report: RawReport;
  selected: boolean;
  onClick: () => void;
}

export function TxRow({ report, selected, onClick }: TxRowProps) {
  const severity = report.overallSeverity as Severity;
  const leakClass = report.leakClass as LeakClass;
  const flow = report.valueFlow.direction;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group relative w-full text-left transition-colors",
        "border-l-2 px-4 py-3 hover:bg-white/[0.025]",
        selected ? "bg-white/[0.04] border-l-[var(--color-zec-gold)]" : "border-l-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: SEVERITY_COLOR[severity] }} />
          <span className="mono text-[11px] text-ink tracking-tight truncate">{shortHex(report.txid, 10, 6)}</span>
        </div>
        <span className="mono text-[10px] text-[var(--color-ink-dim)] shrink-0">{fmtRelativeTime(report.seenAt)}</span>
      </div>

      <div className="flex items-center justify-between mt-1.5 gap-3">
        <span className="display-italic text-[14px] leading-none" style={{ color: LEAK_CLASS_COLOR[leakClass] }}>
          {LEAK_CLASS_LABEL[leakClass]}
        </span>
        <div className="flex items-center gap-2 mono text-[10px] text-[var(--color-ink-muted)]">
          {flow === "DEPOSIT" && <IconArrowDown size={10} />}
          {flow === "WITHDRAWAL" && <IconArrowUp size={10} />}
          {flow === "INTRA_POOL" && <IconArrowRight size={10} />}
          {report.findings.length > 0 && (
            <span className="text-[var(--color-ink-muted)]">
              {report.findings.length} finding{report.findings.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
