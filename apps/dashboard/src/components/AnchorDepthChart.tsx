import { useMemo } from "react";
import type { RawReport } from "../hooks/useMempool";

interface Props { reports: RawReport[]; }

const BUCKETS: { label: string; max: number }[] = [
  { label: "<10", max: 10 },
  { label: "10–50", max: 50 },
  { label: "50–100", max: 100 },
  { label: "100–500", max: 500 },
  { label: "500–2k", max: 2000 },
  { label: "2k–10k", max: 10_000 },
  { label: "10k+", max: Infinity },
];

export function AnchorDepthChart({ reports }: Props) {
  const histogram = useMemo(() => {
    const counts = new Array(BUCKETS.length).fill(0);
    for (const r of reports) {
      for (const s of r.spends) {
        if (s.anchorDepthBlocks === null) continue;
        const i = BUCKETS.findIndex((b) => s.anchorDepthBlocks! < b.max);
        if (i >= 0) counts[i]++;
      }
    }
    return counts;
  }, [reports]);

  const max = Math.max(1, ...histogram);
  const total = histogram.reduce((a, b) => a + b, 0);

  return (
    <Panel title="Anchor depth" caption={`${total} spends with known anchor`}>
      <div className="space-y-1.5">
        {BUCKETS.map((b, i) => {
          const count = histogram[i];
          const pct = (count / max) * 100;
          const isRecent = i < 3;
          return (
            <div key={b.label} className="flex items-center gap-2 mono text-[9.5px]">
              <span className="w-12 text-right text-[var(--color-ink-dim)]">{b.label}</span>
              <div className="flex-1 h-2 bg-white/[0.03] relative">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isRecent ? "var(--color-zec-gold)" : "var(--color-edge-strong)",
                    opacity: isRecent ? 0.9 : 0.7,
                    transition: "width 320ms ease-out",
                  }}
                />
              </div>
              <span className="w-8 text-right text-ink">{count}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Panel({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="display text-[16px] text-ink">{title}</h3>
        {caption && (
          <span className="mono text-[9px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">{caption}</span>
        )}
      </header>
      {children}
    </section>
  );
}
