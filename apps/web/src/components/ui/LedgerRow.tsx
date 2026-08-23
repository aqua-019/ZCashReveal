import type { ReactNode } from "react";

import { Conf, type Confidence } from "./Conf";

export type LedgerSeverity = "crit" | "high" | "note";

/**
 * One row of the Beware ledger. The severity is carried by a rule down the
 * left edge rather than by a coloured background: danger is a register, not a
 * decoration, and the row text stays at full contrast either way.
 *
 * Wrap rows in <Ledger> so the hover verb has a group to dim.
 */
export function LedgerRow({
  id,
  severity = "note",
  name,
  sub,
  window: win,
  detail,
  detectable,
  confidence,
}: {
  readonly id: string;
  readonly severity?: LedgerSeverity;
  readonly name: string;
  readonly sub?: string;
  readonly window: string;
  readonly detail?: ReactNode;
  readonly detectable: ReactNode;
  readonly confidence: Confidence;
}) {
  return (
    // role="listitem" is required, not decorative: the parent <Ledger> is
    // role="list", and an <article> maps to role "article", which trips
    // axe's aria-required-children on the one page carrying the a11y budget.
    <article className={`lrow ${severity}`} id={id} role="listitem" data-primitive="LedgerRow" data-severity={severity}>
      <div className="id">{id}</div>
      <h3 className="name">
        {name}
        {sub === undefined ? null : <small>{sub}</small>}
      </h3>
      <div className="cell hide-m">
        <b>{win}</b>
        {detail === undefined ? null : (
          <>
            <br />
            {detail}
          </>
        )}
      </div>
      <div>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".08em" }}>
          {detectable}
        </div>
        <div style={{ marginTop: 6 }}>
          <Conf level={confidence} />
        </div>
      </div>
    </article>
  );
}

export function Ledger({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className="ledger" data-primitive="Ledger" role="list" aria-label={label}>
      {children}
    </div>
  );
}
