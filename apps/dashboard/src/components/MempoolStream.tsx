import { useMemo, useState } from "react";
import clsx from "clsx";
import type { RawReport } from "../hooks/useMempool";
import { TxRow } from "./TxRow";
import { LEAK_CLASS_LABEL } from "../lib/tokens";
import type { LeakClass } from "@zcashreveal/types";

interface MempoolStreamProps {
  reports: RawReport[];
  selectedTxid: string | null;
  onSelect: (txid: string) => void;
}

const FILTER_CLASSES: (LeakClass | "ALL")[] = [
  "ALL", "PURE_SHIELDED", "T_TO_Z", "Z_TO_T", "MIXED", "MIGRATION_S2O", "FULLY_TRANSPARENT",
];

export function MempoolStream({ reports, selectedTxid, onSelect }: MempoolStreamProps) {
  const [filter, setFilter] = useState<LeakClass | "ALL">("ALL");

  const filtered = useMemo(() => {
    if (filter === "ALL") return reports;
    return reports.filter((r) => r.leakClass === filter);
  }, [reports, filter]);

  return (
    <section className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h2 className="display text-[20px] text-ink">Live mempool</h2>
        <span className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">{filtered.length} tx</span>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {FILTER_CLASSES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={clsx(
              "mono text-[9.5px] uppercase tracking-[0.12em] px-2 py-1 transition-colors border rounded-sm",
              filter === c
                ? "text-[var(--color-zec-gold)] border-[var(--color-zec-gold)]/40 bg-[var(--color-zec-gold)]/5"
                : "text-[var(--color-ink-dim)] border-[var(--color-edge)] hover:border-[var(--color-edge-strong)] hover:text-[var(--color-ink-muted)]",
            )}
          >
            {c === "ALL" ? "all" : LEAK_CLASS_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="hairline mx-4" />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-[var(--color-edge)]">
            {filtered.map((r) => (
              <li key={r.txid}>
                <TxRow report={r} selected={r.txid === selectedTxid} onClick={() => onSelect(r.txid)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
      <div className="h-2 w-2 rounded-full bg-[var(--color-zec-gold)] pulse-gold" />
      <p className="display-italic text-[18px] text-[var(--color-ink-muted)]">Awaiting first transaction</p>
      <p className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)] max-w-[200px]">
        Indexer connecting to zebrad. Mempool will populate as transactions arrive.
      </p>
    </div>
  );
}
