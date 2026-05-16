import { useMemo } from "react";
import type { RawReport } from "../hooks/useMempool";
import { zatToZec } from "../lib/formatters";

interface Props { reports: RawReport[]; }

interface Event {
  txid: string;
  pool: "sapling" | "orchard";
  valueZat: bigint;
  ts: number;
}

export function ValueBalanceMonitor({ reports }: Props) {
  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];
    for (const r of reports) {
      const s = BigInt(r.bundle.saplingValueBalanceZat);
      const o = BigInt(r.bundle.orchardValueBalanceZat);
      if (s !== 0n) out.push({ txid: r.txid, pool: "sapling", valueZat: s, ts: r.seenAt });
      if (o !== 0n) out.push({ txid: r.txid, pool: "orchard", valueZat: o, ts: r.seenAt });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 12);
  }, [reports]);

  const max = useMemo(() => {
    if (events.length === 0) return 1n;
    return events.reduce((m, e) => {
      const abs = e.valueZat < 0n ? -e.valueZat : e.valueZat;
      return abs > m ? abs : m;
    }, 1n);
  }, [events]);

  return (
    <section className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="display text-[16px] text-ink">Value flow</h3>
        <span className="mono text-[9px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">last {events.length}</span>
      </header>

      {events.length === 0 ? (
        <p className="mono text-[10px] text-[var(--color-ink-dim)]">No t↔z flow observed.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e, i) => (<EventRow key={i} event={e} max={max} />))}
        </ul>
      )}
    </section>
  );
}

function EventRow({ event, max }: { event: Event; max: bigint }) {
  const isOut = event.valueZat > 0n;
  const abs = event.valueZat < 0n ? -event.valueZat : event.valueZat;
  const pct = Number((abs * 100n) / max);

  return (
    <li className="mono text-[10px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[var(--color-ink-muted)]">{event.pool}</span>
        <span style={{ color: isOut ? "var(--color-withdrawal)" : "var(--color-deposit)" }}>
          {isOut ? "+" : ""}{zatToZec(event.valueZat)} ZEC
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.03] relative">
        <div
          className="absolute inset-y-0"
          style={{
            width: `${pct}%`,
            backgroundColor: isOut ? "var(--color-withdrawal)" : "var(--color-deposit)",
            opacity: 0.6,
            [isOut ? "left" : "right"]: "50%",
          }}
        />
        <div className="absolute inset-y-0 w-px bg-[var(--color-edge-strong)]" style={{ left: "50%" }} />
      </div>
    </li>
  );
}
