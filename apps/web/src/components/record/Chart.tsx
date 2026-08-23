import type { ReactNode } from "react";

/**
 * The chart frame, and the reason every chart on this site has one.
 *
 * HANDOFF-03 section 3: "a visually-hidden table twin for every chart".
 * Assertion A3 checks it by counting, so the structure is fixed and literal -
 * one `<figure data-chart>`, containing exactly one `<svg>` and exactly one
 * `<table>`, as siblings. A chart that renders its twin somewhere else, or
 * inside a wrapper, breaks the count and is a gate failure rather than a
 * stylistic difference.
 *
 * The `<svg>` is `aria-hidden`: it is a picture of the table, and announcing
 * both makes a screen reader read the same numbers twice, once as a shape. The
 * caption is visible and names the chart for everyone; the table carries the
 * values.
 */
export function Chart({
  id,
  caption,
  note,
  legend,
  table,
  children,
}: {
  /** Stable id, also the `data-chart` value the assertion selects on. */
  readonly id: string;
  readonly caption: ReactNode;
  /** Optional line under the chart: what the reader should not conclude from it. */
  readonly note?: ReactNode;
  readonly legend?: ReactNode;
  /** The twin. Rows only - `ChartTable` supplies the element. */
  readonly table: ReactNode;
  /** The inline SVG. Exactly one `<svg>` element. */
  readonly children: ReactNode;
}) {
  return (
    <figure className="chart" data-chart={id}>
      <figcaption className="chart-cap">{caption}</figcaption>
      {children}
      {table}
      {legend === undefined ? null : <ul className="legend">{legend}</ul>}
      {note === undefined ? null : <p className="note chart-note">{note}</p>}
    </figure>
  );
}

/**
 * The table twin. Visually hidden, fully announced, and a real `<table>` with a
 * `<caption>` and column scopes - the point is that the chart's numbers are
 * readable without seeing it, not that a table exists to satisfy a counter.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.join("|")}>
            {r.map((cell, i) =>
              i === 0 ? (
                <th key={columns[i] ?? String(i)} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={columns[i] ?? String(i)}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One legend entry: a mark in the series colour, then the label in ink. */
export function LegendItem({ colour, children }: { readonly colour: string; readonly children: ReactNode }) {
  return (
    <li>
      <span className="sw" style={{ background: colour }} aria-hidden="true" />
      {children}
    </li>
  );
}

/**
 * The five supply buckets, in the fixed order the design system validates, with
 * the token each one is painted in. Charts import this rather than choosing
 * their own hues, so a pool is the same colour on every surface.
 */
export const POOL_COLOUR = {
  transparent: "var(--p-transparent)",
  sprout: "var(--p-sprout)",
  sapling: "var(--p-sapling)",
  orchard: "var(--p-orchard)",
  ironwood: "var(--p-ironwood)",
} as const;

export const POOL_ORDER = ["transparent", "sprout", "sapling", "orchard", "ironwood"] as const;
