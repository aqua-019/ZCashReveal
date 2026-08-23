import type { ReactNode } from "react";

export interface Column<Row> {
  readonly key: string;
  readonly head: string;
  /** Mono, tabular alignment - use it for anything numeric or hex. */
  readonly mono?: boolean;
  readonly cell: (row: Row) => ReactNode;
}

/**
 * A table that owns its own horizontal scroll container, so a wide table
 * scrolls inside itself instead of scrolling the page. Every table on the site
 * goes through this component for that reason.
 *
 * `caption` is rendered, not hidden: a table with no caption is a table whose
 * units are guesswork.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row, index: number) => string;
}) {
  return (
    // tabIndex only: the <caption> already names the table, and repeating it as
    // an aria-label on a role="group" wrapper makes a screen reader read the
    // same sentence twice on entry. The tab stop is what a scrollable region
    // needs to be reachable by keyboard.
    <div className="tbl-wrap" data-primitive="DataTable" tabIndex={0}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.mono === true ? "mono" : undefined}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((c) => (
                <td key={c.key} className={c.mono === true ? "mono" : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
