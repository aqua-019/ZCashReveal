import type { ReactNode } from "react";

/**
 * One headline number: mono label, Fraunces numeral, mono sub-line.
 * `accent` spends the gold budget - use it for the figure a surface exists to
 * report (the Unprovable Residual, the drain), not for every number on it.
 */
export function Metric({
  label,
  value,
  sub,
  accent = false,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub?: ReactNode;
  readonly accent?: boolean;
}) {
  return (
    <div className="metric" data-primitive="Metric">
      <div className="l">{label}</div>
      <div className={accent ? "v gold" : "v"}>{value}</div>
      {sub === undefined ? null : <div className="s">{sub}</div>}
    </div>
  );
}

/** A flush row of metrics, hairline-ruled top and bottom. */
export function MetricRow({ children }: { readonly children: ReactNode }) {
  return (
    <div className="metrics" data-primitive="MetricRow">
      {children}
    </div>
  );
}
