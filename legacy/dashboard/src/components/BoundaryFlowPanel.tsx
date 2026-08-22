/**
 * Boundary flow panel — per-pool turnstile direction display.
 *
 * Replaces LeakPanel's private ValueFlowSection wholesale and adopts
 * RESEARCH.md's terminology. Sign convention:
 *
 *   deltaZat > 0  →  value leaving the pool (Out_p, withdrawal)
 *   deltaZat < 0  →  value entering the pool (In_p, deposit)
 *   deltaZat = 0  →  intra-pool transfer; no public boundary movement
 *
 * Each pool gets a card with the direction-arrow icon, the absolute
 * value in ZEC, a prose translation, and the raw deltaZat as a footnote.
 * A wider explanation strip below summarizes the overall tx direction.
 */

import { SectionHeader } from "./primitives/SectionHeader";
import { IconArrowDown, IconArrowRight, IconArrowUp } from "./icons";
import { zatToZec } from "../lib/formatters";

export interface BoundaryFlowPanelProps {
  /** Sapling pool balance delta. Sign: positive = leaving pool. */
  saplingValueBalanceZat: bigint | string;
  /** Orchard pool balance delta. Sign: positive = leaving pool. */
  orchardValueBalanceZat: bigint | string;
  /** Net transparent inflow (informational; not currently rendered but kept on the contract). */
  netTransparentInflowZat: bigint | string;
  /** Overall direction classification from the indexer. */
  direction: "DEPOSIT" | "WITHDRAWAL" | "INTRA_POOL" | "NONE";
}

function toBig(v: bigint | string): bigint {
  return typeof v === "string" ? BigInt(v) : v;
}

export function BoundaryFlowPanel({
  saplingValueBalanceZat,
  orchardValueBalanceZat,
  direction,
}: BoundaryFlowPanelProps) {
  const sapling = toBig(saplingValueBalanceZat);
  const orchard = toBig(orchardValueBalanceZat);

  return (
    <section>
      <SectionHeader index="03" title="Boundary flow" />
      <div className="grid grid-cols-2 gap-3">
        <PoolCard pool="sapling" delta={sapling} />
        <PoolCard pool="orchard" delta={orchard} />
      </div>
      <div className="mt-4 glass p-4 rounded-sm">
        <div className="flex items-center gap-2 mono text-[11px] text-ink">
          <DirectionBlurb direction={direction} />
        </div>
      </div>
    </section>
  );
}

function PoolCard({
  pool,
  delta,
}: {
  pool: "sapling" | "orchard";
  delta: bigint;
}) {
  const accent = pool === "orchard" ? "var(--c-orchard)" : "var(--c-sapling)";
  const isOut = delta > 0n;
  const isIn = delta < 0n;
  const absZec = zatToZec(delta < 0n ? -delta : delta);

  let valueColor: string;
  let directionLabel: string;
  let prose: string;
  let Arrow: typeof IconArrowDown;

  if (isOut) {
    valueColor = "var(--color-withdrawal)";
    directionLabel = "Out_p";
    prose = "sending to transparent";
    Arrow = IconArrowUp;
  } else if (isIn) {
    valueColor = "var(--color-deposit)";
    directionLabel = "In_p";
    prose = "receiving from transparent";
    Arrow = IconArrowDown;
  } else {
    valueColor = "var(--color-pure)";
    directionLabel = "0";
    prose = "intra-pool · no boundary movement";
    Arrow = IconArrowRight;
  }

  return (
    <div className="glass p-4 rounded-sm">
      <div className="flex items-center gap-1.5 mb-3">
        <span
          className="mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          {pool} pool
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <Arrow size={14} style={{ color: valueColor }} />
        <span
          className="mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: valueColor }}
        >
          {directionLabel}
        </span>
      </div>

      <div className="display text-[28px] mono tabular-nums leading-none mb-2" style={{ color: valueColor }}>
        {isOut ? "+" : isIn ? "−" : ""}{absZec}
        <span className="mono text-[11px] text-[var(--color-ink-dim)] ml-2">ZEC</span>
      </div>

      <div className="mono text-[10px] text-[var(--color-ink-muted)] leading-snug">
        {prose}
      </div>

      <div className="mt-2 mono text-[9px] text-[var(--color-ink-dim)] break-all">
        deltaZat = {delta.toString()}
      </div>
    </div>
  );
}

function DirectionBlurb({ direction }: { direction: BoundaryFlowPanelProps["direction"] }) {
  switch (direction) {
    case "DEPOSIT":
      return (
        <>
          <span className="text-[var(--color-deposit)]">
            <IconArrowDown size={12} />
          </span>
          <span className="display-italic text-[16px] text-[var(--color-deposit)]">
            Deposit
          </span>
          <span className="text-[var(--color-ink-muted)]">
            — net value entering shielded pool(s)
          </span>
        </>
      );
    case "WITHDRAWAL":
      return (
        <>
          <span className="text-[var(--color-withdrawal)]">
            <IconArrowUp size={12} />
          </span>
          <span className="display-italic text-[16px] text-[var(--color-withdrawal)]">
            Withdrawal
          </span>
          <span className="text-[var(--color-ink-muted)]">
            — net value leaving shielded pool(s)
          </span>
        </>
      );
    case "INTRA_POOL":
      return (
        <>
          <span className="text-[var(--color-pure)]">
            <IconArrowRight size={12} />
          </span>
          <span className="display-italic text-[16px] text-[var(--color-pure)]">
            Intra-pool
          </span>
          <span className="text-[var(--color-ink-muted)]">
            — pure shielded transaction within the pool
          </span>
        </>
      );
    case "NONE":
      return (
        <span className="text-[var(--color-ink-muted)]">No shielded value flow.</span>
      );
  }
}
