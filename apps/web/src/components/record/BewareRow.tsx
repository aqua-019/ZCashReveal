import { requirePermalink, resolveSources, type BewareEntry } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";

/**
 * One row of the exploit ledger, rendered from a corpus entry.
 *
 * This extends `components/ui/LedgerRow` rather than calling it, for two
 * reasons the primitive cannot absorb without being changed under another
 * worker's feet:
 *
 *   1. `detectable` in the corpus is a four-value enum - yes, no, partial,
 *      n/a - and the primitive's `Detectability` carries three. Three of the
 *      fourteen entries (B9, B13, B14) are `n/a`, and there is no honest
 *      mapping from "the question does not apply" onto yes, no or partial:
 *      each of those would paint a verdict the corpus does not make.
 *   2. `severity` in the corpus is crit / high / mid; the primitive's is
 *      crit / high / note.
 *
 * Everything else is the primitive's markup and every class is the one
 * globals.css already defines, so the two render identically where they
 * overlap. HANDOFF-05 or 06 should fold this back into `ui/LedgerRow` and
 * delete this file; it is noted in the section 8 block.
 *
 * The claim strip is the one addition to the mockup's six columns. CLAUDE.md
 * requires every rendered claim to show its sources, its confidence and its
 * last-verified date, and the mockup shows none of the three on a ledger row.
 *
 * ONE CONFIDENCE CHIP PER ROW AND ONE DATE, NOT TWO OF EACH. HANDOFF-04a moved
 * the confidence, the last-verified date and the source count into `Cite`'s
 * CLOSED state, and this row was still printing its own copy of the first two
 * beside it - so a fourteen-row ledger stated its epistemic status twenty-eight
 * times and the repetition read as chrome rather than as a record. What was
 * removed is the duplicate, never the only copy: the collapse rule is that
 * status stays in the OPEN, and the citation's summary is open - a reader sees
 * `B2 · high · verified 2026-08-22 · cite - 4 sources` without opening
 * anything. The `Detectable` verdict stays in the register column because it is
 * the column, and `Cite` does not carry it.
 */

/** The corpus's severity, as a word, next to the rail that encodes it in colour.
 *  Colour is the only cue the rail gives, so the row states it in text too. */
const SEVERITY_WORD: Record<BewareEntry["severity"], string> = {
  crit: "critical",
  high: "high",
  mid: "mid",
};

/**
 * The detectability enum to its class and its label. `n/a` gets a namespaced
 * class because it has no colour of its own: `.det.bw-na` is muted ink, not a
 * verdict. Nothing here is per-row - the corpus supplies the enum and only the
 * enum, and inventing a sentence for each entry is what the mockup did.
 */
export const DETECTABLE: Record<
  BewareEntry["detectable"],
  { readonly cls: string; readonly label: string; readonly what: string }
> = {
  yes: { cls: "yes", label: "YES", what: "it would show on-chain" },
  no: { cls: "no", label: "NO", what: "no trace a reader could find" },
  partial: { cls: "part", label: "PARTIAL", what: "a trace only in part, or only for some observers" },
  "n/a": { cls: "bw-na", label: "N/A", what: "not a question this entry answers; the row says why" },
};

/**
 * The four values in the order the key states them, exported beside the map
 * they index rather than restated in the page.
 *
 * `what` and this order used to live as a sentence in `/beware`'s legend markup,
 * which meant the key and the rows were two sources for one four-value enum: a
 * fifth value could enter the corpus, get a row here, and leave the legend
 * describing four. The page now iterates this, so the count in its disclosure
 * summary is `DETECTABILITY_ORDER.length` and cannot disagree with what the
 * rows below it can render.
 */
export const DETECTABILITY_ORDER: readonly BewareEntry["detectable"][] = ["yes", "no", "partial", "n/a"];

export function BewareRow({ entry }: { readonly entry: BewareEntry }) {
  const det = DETECTABLE[entry.detectable];
  // The mockup's sub-line is an editorial one-liner per row that the corpus
  // does not carry. What it does carry is the severity and the advisory ids,
  // which is what the line says here.
  const sub = entry.cve === undefined ? SEVERITY_WORD[entry.severity] : `${SEVERITY_WORD[entry.severity]} · ${entry.cve.join(" · ")}`;

  return (
    <li
      className={`lrow ${entry.severity}`}
      id={entry.id}
      data-severity={entry.severity}
      data-detectable={entry.detectable}
    >
      <div className="id">{entry.id}</div>
      <h3 className="name">
        {entry.title}
        <small>{sub}</small>
      </h3>
      <div className="cell">
        <span className="sr-only">window: </span>
        <b>
          {entry.window.from} &rarr; {entry.window.to}
        </b>
        <br />
        found {entry.discovered} · fixed {entry.fixed} · disclosed {entry.disclosed}
      </div>
      <div className="cell hide-m">
        <span className="sr-only">root cause: </span>
        {entry.rootCause}
      </div>
      <div className="cell hide-m">
        <span className="sr-only">found by: </span>
        {entry.discoverer}
      </div>
      <div>
        <div className={`det ${det.cls}`}>
          <span className="sr-only">detectable from public data: </span>
          {det.label}
        </div>
      </div>
      <div className="bw-claimline">
        <span className="claim">
          <a className="anchor" href={requirePermalink(entry.id)}>
            {entry.id}
          </a>
          <Cite
            id={entry.id}
            lastVerified={entry.lastVerified}
            confidence={entry.confidence}
            sources={resolveSources(entry.sources)}
          />
        </span>
      </div>
    </li>
  );
}
