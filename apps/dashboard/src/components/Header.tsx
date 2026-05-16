import clsx from "clsx";
import { ZecleakMark, IconConnection, IconChain } from "./icons";

interface HeaderProps {
  tipHeight: number | null;
  mempoolSize: number;
  connected: boolean;
  selectedTxid: string | null;
}

export function Header({ tipHeight, mempoolSize, connected, selectedTxid }: HeaderProps) {
  return (
    <header className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-8 px-4 md:px-8 pt-5 md:pt-7 pb-4 md:pb-5">
      <div className="flex items-end gap-3 md:gap-4">
        <ZecleakMark size={36} className="text-[var(--color-zec-gold)] md:hidden" />
        <ZecleakMark size={42} className="text-[var(--color-zec-gold)] hidden md:block" />
        <div className="flex flex-col">
          <h1 className="display-italic text-[34px] md:text-[44px] leading-none text-ink" style={{ letterSpacing: "-0.025em" }}>
            ZCashReveal
          </h1>
          <p className="mono text-[9px] md:text-[10px] tracking-[0.18em] uppercase text-[var(--color-ink-dim)] mt-1.5 md:mt-2">
            Shielded mempool forensics
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:gap-6 mono text-[10px] md:text-[11px]">
        <StatusCell label="Chain tip">
          <IconChain size={11} className="text-[var(--color-ink-muted)]" />
          <span className="text-ink">{tipHeight !== null ? tipHeight.toLocaleString() : "—"}</span>
        </StatusCell>
        <Sep />
        <StatusCell label="Mempool">
          <span className="text-ink">{mempoolSize}</span>
          <span className="text-[var(--color-ink-dim)]">tx</span>
        </StatusCell>
        <Sep />
        <StatusCell label="Selected">
          <span className={clsx("text-ink", !selectedTxid && "text-[var(--color-ink-dim)]")}>
            {selectedTxid ? selectedTxid.slice(0, 8) + "…" : "none"}
          </span>
        </StatusCell>
        <Sep />
        <div className="flex items-center gap-2">
          <span
            className={clsx("h-2 w-2 rounded-full", connected ? "bg-[var(--color-zec-gold)] pulse-gold" : "bg-[var(--color-critical)]")}
          />
          <IconConnection size={11} className={clsx(connected ? "text-[var(--color-zec-gold)]" : "text-[var(--color-critical)]")} />
          <span className="uppercase tracking-[0.15em] text-[10px] text-[var(--color-ink-muted)]">
            {connected ? "live" : "offline"}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatusCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="uppercase tracking-[0.18em] text-[9px] text-[var(--color-ink-dim)]">{label}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function Sep() {
  return <span className="h-6 w-px bg-[var(--color-edge)]" />;
}
