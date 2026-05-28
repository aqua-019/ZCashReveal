/**
 * Global per-pool state snapshot. Sits at the top of the right rail.
 *
 * Reads from a dashboard-local PoolStateSummary view shape that extends
 * the canonical PoolStateSnapshot from @zcashreveal/types with a
 * lastAnchorHeightCreated field. Module 7 will provide a serializer
 * that maps real PoolState<P> instances → PoolStateSummary. For now,
 * MOCK_POOL_SNAPSHOT supplies illustrative values.
 */

import { IconShield, IconShieldCracked } from "./icons";

export interface PoolStateSummary {
  readonly pool: "sapling" | "orchard";
  readonly commitmentCount: bigint;
  readonly anchorCount: number;
  readonly nullifierCount: number;
  readonly lastAnchorHeightCreated: number;
  readonly balanceZat: bigint;
}

export interface PoolStatePanelProps {
  readonly sapling: PoolStateSummary;
  readonly orchard: PoolStateSummary;
  /** Current chain tip — gives lastAnchorHeightCreated a frame of reference. */
  readonly tipHeight: number;
}

export function PoolStatePanel({ sapling, orchard, tipHeight }: PoolStatePanelProps) {
  return (
    <section className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="display text-[16px] text-ink">Pool state</h3>
        <span className="mono text-[9px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">
          per-pool snapshot
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <PoolCard summary={sapling} tipHeight={tipHeight} />
        <PoolCard summary={orchard} tipHeight={tipHeight} />
      </div>
    </section>
  );
}

function PoolCard({
  summary,
  tipHeight,
}: {
  summary: PoolStateSummary;
  tipHeight: number;
}) {
  const isOrchard = summary.pool === "orchard";
  const accent = isOrchard ? "var(--c-orchard)" : "var(--c-sapling)";
  const Icon = isOrchard ? IconShieldCracked : IconShield;
  const depthFromTip = tipHeight - summary.lastAnchorHeightCreated;

  return (
    <div className="glass p-3 rounded-sm">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon size={12} style={{ color: accent }} />
        <span className="mono text-[9px] uppercase tracking-[0.18em]" style={{ color: accent }}>
          {summary.pool}
        </span>
      </div>

      <div className="mb-3">
        <div className="mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)] mb-0.5">
          Commitments
        </div>
        <div className="display text-[24px] text-ink mono tabular-nums leading-none">
          {fmtBig(summary.commitmentCount)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <SubStat label="Anchors" value={summary.anchorCount} />
        <SubStat label="Nullifiers" value={summary.nullifierCount} />
      </div>

      <div className="hairline mb-2" />
      <div className="mono text-[9px] text-[var(--color-ink-muted)] flex items-baseline gap-1.5">
        <span className="uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">latest</span>
        <span className="tabular-nums text-ink">h={summary.lastAnchorHeightCreated.toLocaleString()}</span>
        <span className="text-[var(--color-ink-dim)]">({depthFromTip > 0 ? "−" : ""}{depthFromTip})</span>
      </div>
    </div>
  );
}

function SubStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)] mb-0.5">
        {label}
      </div>
      <div className="mono text-[13px] tabular-nums text-ink leading-none">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function fmtBig(n: bigint): string {
  return n.toLocaleString();
}
