import type { ReactNode } from "react";

/**
 * The plotting primitives: thin marks, computed coordinates, no library.
 *
 * Everything here is deterministic and pure. There is no randomness anywhere on
 * this site (CLAUDE.md bans Math.random outright and eslint enforces it), and a
 * chart drawn from data has no need of any.
 *
 * Design constraints these encode, from HANDOFF-03 section 3:
 *   - thin marks;
 *   - a 2px gap between stacked segments, in the surface colour, so adjacent
 *     pools read as separate quantities rather than one striped quantity;
 *   - text in ink tokens, never in a series colour, so a label never inherits
 *     the contrast of the thing it labels;
 *   - direct labels used sparingly, and a legend whenever there are two or more
 *     series.
 */

export const PLOT = {
  /** The viewBox the charts share, so stroke widths mean the same thing on all of them. */
  width: 1000,
  height: 320,
  pad: { top: 18, right: 18, bottom: 34, left: 52 },
} as const;

export interface Scale {
  (value: number): number;
}

/** A linear scale from a data domain to a pixel range. */
export function linear(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  // A zero-width domain would divide by zero; pin it to the middle of the range
  // rather than emitting NaN into the path data.
  if (span === 0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * A base-10 log scale. The Network's statements-against-price chart needs one:
 * ZEC ran from single dollars to several hundred over the period, and on a
 * linear axis the entire first half of the record is a flat line on the floor,
 * which is a picture that argues something false.
 *
 * Non-positive values have no logarithm. Rather than clamping them silently -
 * which would draw a point that is not in the data - the caller filters them
 * out and says so in the note.
 */
export function log10(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  if (d0 <= 0 || d1 <= 0) throw new Error("log10: a log domain must be strictly positive");
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const inner = linear([l0, l1], range);
  return (value) => inner(Math.log10(Math.max(value, Number.MIN_VALUE)));
}

/** Ticks at every power of ten inside a log domain, inclusive. */
export function decades(domain: readonly [number, number]): number[] {
  const [d0, d1] = domain;
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(d0)); e <= Math.ceil(Math.log10(d1)); e += 1) {
    const v = 10 ** e;
    if (v >= d0 && v <= d1) out.push(v);
  }
  return out;
}

/** `n` evenly spaced ticks across a linear domain, endpoints included. */
export function ticks(domain: readonly [number, number], n: number): number[] {
  const [d0, d1] = domain;
  if (n < 2) return [d0];
  return Array.from({ length: n }, (_, i) => d0 + ((d1 - d0) * i) / (n - 1));
}

/** A polyline `d` attribute from points already in pixel space. */
export function path(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/**
 * The plot frame: the axes, their ticks and their labels. Every chart draws
 * this first so the rules, the type size and the tick length are identical
 * across the site.
 */
export function Axes({
  x,
  y,
  xTicks,
  yTicks,
  xLabel,
  yLabel,
}: {
  readonly x: Scale;
  readonly y: Scale;
  readonly xTicks: readonly { readonly at: number; readonly label: string }[];
  readonly yTicks: readonly { readonly at: number; readonly label: string }[];
  readonly xLabel?: string;
  readonly yLabel?: string;
}) {
  const { width, height, pad } = PLOT;
  const x0 = pad.left;
  const x1 = width - pad.right;
  const y0 = height - pad.bottom;
  const y1 = pad.top;
  return (
    <g className="axes" aria-hidden="true">
      {yTicks.map((t) => (
        <g key={`y${t.at}`}>
          <line x1={x0} x2={x1} y1={y(t.at)} y2={y(t.at)} className="gridline" />
          <text x={x0 - 8} y={y(t.at)} className="tick tick-y">
            {t.label}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t.at}`}>
          <line x1={x(t.at)} x2={x(t.at)} y1={y0} y2={y0 + 4} className="axisline" />
          <text x={x(t.at)} y={y0 + 17} className="tick tick-x">
            {t.label}
          </text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y0} y2={y0} className="axisline" />
      {xLabel === undefined ? null : (
        <text x={x1} y={height - 4} className="axis-label axis-label-x">
          {xLabel}
        </text>
      )}
      {yLabel === undefined ? null : (
        <text x={x0 - 8} y={y1 - 6} className="axis-label axis-label-y">
          {yLabel}
        </text>
      )}
    </g>
  );
}

/**
 * The `<svg>` element itself, with the shared viewBox and the aria posture A3
 * expects. Exactly one of these per `<figure data-chart>`: A3 counts svg
 * elements against table twins, so a chart that needs a second drawing needs a
 * second figure.
 *
 * `height` overrides the shared viewBox height for a chart that is a band
 * rather than a field - the two-windows diagram is one bar, and 320 units of
 * viewBox around it would be 200 units of nothing. The width never changes, so
 * a stroke width still means the same thing on every chart.
 */
export function Plot({ height = PLOT.height, children }: { readonly height?: number; readonly children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${PLOT.width} ${height}`}
      className="plot"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
