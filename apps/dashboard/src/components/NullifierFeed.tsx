import { useMemo } from "react";
import type { RawReport } from "../hooks/useMempool";
import { shortHex, fmtRelativeTime } from "../lib/formatters";
import { IconNullifier, IconShield, IconShieldCracked } from "./icons";

interface Props { reports: RawReport[]; }

interface NullifierObservation {
  nullifier: string;
  pool: "sapling" | "orchard";
  txid: string;
  seenAt: number;
}

export function NullifierFeed({ reports }: Props) {
  const observations = useMemo<NullifierObservation[]>(() => {
    const all: NullifierObservation[] = [];
    for (const r of reports) {
      for (const s of r.bundle.saplingSpends) {
        all.push({ nullifier: s.nullifier, pool: "sapling", txid: r.txid, seenAt: r.seenAt });
      }
      for (const a of r.bundle.orchardActions) {
        all.push({ nullifier: a.nullifier, pool: "orchard", txid: r.txid, seenAt: r.seenAt });
      }
    }
    return all.sort((a, b) => b.seenAt - a.seenAt).slice(0, 14);
  }, [reports]);

  return (
    <section className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="display text-[16px] text-ink">Nullifier feed</h3>
        <div className="flex items-center gap-1.5">
          <IconNullifier size={11} className="text-[var(--color-zec-gold)]" />
          <span className="mono text-[9px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">spent-set growth</span>
        </div>
      </header>

      {observations.length === 0 ? (
        <p className="mono text-[10px] text-[var(--color-ink-dim)]">No nullifiers observed.</p>
      ) : (
        <ul className="space-y-1.5">
          {observations.map((o, i) => (
            <li key={i} className="flex items-center gap-2 mono text-[10px]">
              <span className="shrink-0 text-[var(--color-ink-dim)]">
                {o.pool === "sapling" ? <IconShield size={10} /> : <IconShieldCracked size={10} className="text-[var(--color-zec-gold)]" />}
              </span>
              <span className="text-ink truncate flex-1">{shortHex(o.nullifier, 8, 6)}</span>
              <span className="text-[var(--color-ink-dim)] shrink-0">{fmtRelativeTime(o.seenAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
