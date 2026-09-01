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
 *
 * `labels` IS THE CHART'S TEXT, AND IT IS NOT INSIDE THE `<svg>`. HANDOFF-04b
 * measured that a `<text>` in a scaled viewBox paints at `declared x scale`, so
 * a floor stated in CSS pixels cannot be satisfied by any declared value at
 * every supported width. The drawing keeps its geometry; the words are HTML,
 * stacked on it by the grid in `globals.css`. Both are DIRECT children of the
 * figure, because A3 counts `figure[data-chart] > svg` and a wrapper would take
 * the drawing out of that selector - the argument in full is in
 * `ChartLabels.tsx`.
 */
export function Chart({
  id,
  dense,
  caption,
  note,
  legend,
  table,
  labels,
  children,
}: {
  /** Stable id, also the `data-chart` value the assertion selects on. */
  readonly id: string;
  /**
   * A DENSE diagram: it gives up its label overlay one breakpoint earlier.
   *
   * Every chart hands its labels to the table twin below 900, because a 12px
   * word does not shrink with the drawing under it. Three do it at 1100
   * instead, and which three was MEASURED rather than judged - a sweep of five
   * routes at twelve widths found overlapping label pairs at 1024 on exactly
   * `network-loop` (9 nodes, 11 edges, all hand-placed), `tk-sankey` (ten node
   * labels in two columns) and `tk-interactions` (three nodes and three edge
   * labels in a 560-unit box that renders at 435px). Every other chart was
   * clean at 1024 and stays on 900.
   */
  readonly dense?: boolean;
  readonly caption: ReactNode;
  /** Optional line under the chart: what the reader should not conclude from it. */
  readonly note?: ReactNode;
  readonly legend?: ReactNode;
  /** The twin. Rows only - `ChartTable` supplies the element. */
  readonly table: ReactNode;
  /**
   * The chart's text, as an HTML layer over the drawing. One `<ChartLabels>`,
   * or nothing for a chart that carries no words.
   */
  readonly labels?: ReactNode;
  /** The inline SVG. Exactly one `<svg>` element. */
  readonly children: ReactNode;
}) {
  return (
    <figure className="chart" data-chart={id} {...(dense === true ? { "data-dense": "true" } : {})}>
      <figcaption className="chart-cap">{caption}</figcaption>
      {children}
      {labels === undefined ? null : labels}
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
