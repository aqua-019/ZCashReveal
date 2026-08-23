import type { ReactNode } from "react";

import { Conf, type Confidence } from "./Conf";

export type LedgerSeverity = "crit" | "high" | "note";

/** Was this ever detectable from the chain? The ledger's load-bearing column. */
export type Detectability = "no" | "yes" | "part";

/**
 * One row of the Beware ledger.
 *
 * Six columns, matching the mockup: identifier, name, window and dates, root
 * cause, who found it, and the detectability plus confidence pair. The last
 * two content columns are the ones that make this a forensic record rather
 * than a list of CVEs - a claim with no named discoverer is a rumour, and a
 * vulnerability that was never detectable from public data is the whole reason
 * the Unprovable Residual exists.
 *
 * Severity is carried by a rule down the left edge rather than by a coloured
 * background: danger is a register, not a decoration, and the row text stays at
 * full contrast either way.
 *
 * Real list markup, no ARIA. An earlier pass had <div role="list"> around
 * <article role="listitem">, which traded axe's aria-required-children for its
 * aria-allowed-role - patching one rule with another. <ul> and <li> give the
 * screen reader the item count with nothing to override.
 */
export function LedgerRow({
  id,
  severity = "note",
  name,
  sub,
  window: win,
  dates,
  cause,
  discoveredBy,
  detectable,
  detectableNote,
  confidence,
}: {
  readonly id: string;
  readonly severity?: LedgerSeverity;
  readonly name: string;
  readonly sub?: string;
  readonly window: string;
  readonly dates?: ReactNode;
  readonly cause?: ReactNode;
  /** Who found it. Required: an unattributed finding is not a finding. */
  readonly discoveredBy: ReactNode;
  readonly detectable: Detectability;
  readonly detectableNote: string;
  readonly confidence: Confidence;
}) {
  return (
    <li className={`lrow ${severity}`} id={id} data-primitive="LedgerRow" data-severity={severity} data-detectable={detectable}>
      <div className="id">{id}</div>
      <h3 className="name">
        {name}
        {sub === undefined ? null : <small>{sub}</small>}
      </h3>
      <div className="cell">
        <b>{win}</b>
        {dates === undefined ? null : (
          <>
            <br />
            {dates}
          </>
        )}
      </div>
      <div className="cell hide-m">{cause}</div>
      <div className="cell hide-m">{discoveredBy}</div>
      <div>
        <div className={`det ${detectable}`}>{detectableNote}</div>
        <div style={{ marginTop: 6 }}>
          <Conf level={confidence} />
        </div>
      </div>
    </li>
  );
}

export function Ledger({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <ul className="ledger" data-primitive="Ledger" aria-label={label}>
      {children}
    </ul>
  );
}
