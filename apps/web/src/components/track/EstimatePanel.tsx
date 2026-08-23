/**
 * An `Estimate`, rendered whole.
 *
 * This is the component the whole Tracking suite exists to be able to show, and
 * it is the one that assertion A8 checks: every estimate on the site renders at
 * least one filter row carrying `countIn` and `countOut`, and a claim chip.
 *
 * The four parts, in the order a reader needs them:
 *
 *   1. THE CHAIN - each filter as a surviving count with the cost of getting
 *      there. The cost is COMPUTED from countIn minus countOut rather than
 *      taken from a field, so a chain whose arithmetic does not close cannot be
 *      displayed as though it did. A filter that removed nothing prints "no
 *      candidates removed" instead of "-0", because a filter that failed is a
 *      finding and should read like one.
 *
 *   2. THE CLAIM CHIP - the v0.2 claim level, from the DTO, with the link grade
 *      beside it when there is one. They answer different questions and are
 *      shown separately for that reason: the claim level is about how large the
 *      surviving set is, and the grade is about how much the filter that
 *      produced it is worth.
 *
 *   3. THE CANDIDATES - at most the top three, each with its posterior weight
 *      and its own words. A candidate is a TRANSACTION, never a party: the DTO
 *      has no field for a name and this component has nowhere to put one.
 *
 *   4. THE ASSUMPTIONS - every one of them, as a list, never truncated. The
 *      schema refuses an estimate with an empty `assumptions`, so there is
 *      always at least one and this section is never empty.
 */
import type { Estimate } from "@zcashreveal/types";

import { Chip, type ChipTone } from "@/components/ui/Chip";
import { CLAIM_TEXT } from "@/lib/claim";
import { fmtCount } from "@/lib/format";


/**
 * A claim level's tone. Only `requires_disclosure` is danger: it is the level at
 * which a candidate set has become small enough that acting on it would need a
 * disclosure-backed signal, which is the one outcome this site treats as a
 * warning about itself.
 */
const CLAIM_TONE: Readonly<Record<Estimate["claim"], ChipTone | "neutral">> = {
  aggregate_only: "ok",
  // Neutral: a broad candidate set is the ordinary case and gets no colour at
  // all. Spending one on it would leave nothing to say with a colour when the
  // set narrows, which is the accent budget's whole argument.
  broad_candidate_set: "neutral",
  // Warn, not gold. A claim level is not a primary action, an active state,
  // value crossing a pool boundary or the system-identity register, so gold
  // was unlicensed here - and /pools spent gold on the level one rung UP the
  // same ladder, so the two surfaces gave a reader opposite readings of the
  // same word. One vocabulary now: ok, neutral, warn, danger, bottom to top.
  small_heuristic_set: "warn",
  requires_disclosure: "danger",
};

/** A tone or nothing, spread rather than passed as `undefined` (exactOptionalPropertyTypes). */
function toneProps(claim: Estimate["claim"]): { tone?: ChipTone } {
  const t = CLAIM_TONE[claim];
  return t === "neutral" ? {} : { tone: t };
}

/** A count as the chain prints it: exact for small sets, compact for millions. */
function count(n: bigint): string {
  return n < 100_000n ? n.toLocaleString("en-US") : fmtCount(Number(n));
}

export function EstimatePanel({ estimate, label = "inference chain" }: { readonly estimate: Estimate; readonly label?: string }) {
  return (
    <div data-estimate className="tk-estimate">
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        <b>{label}</b>
      </div>

      <ol className="chain" style={{ listStyle: "none", padding: "0 0 0 14px" }} data-chain>
        {estimate.filters.map((f) => {
          const removed = f.countIn - f.countOut;
          return (
            <li className="st" key={`${f.filter}-${f.label}`} data-filter={f.filter} data-count-in={f.countIn.toString()} data-count-out={f.countOut.toString()}>
              <span className="n">{count(f.countOut)}</span>
              <span className="w">
                <b>{f.label}</b>
              </span>
              <span className="cost">{removed === 0n ? "no candidates removed" : `-${count(removed)}`}</span>
            </li>
          );
        })}
        <li className="st" data-filter="neff">
          <span className="n">{estimate.nEff.toLocaleString("en-US")}</span>
          <span className="w">
            <b>N_eff</b> {` - H = ${estimate.entropyBits.toFixed(2)} bits`}
          </span>
          <span className="cost" style={{ color: "inherit" }}>
            <Chip {...toneProps(estimate.claim)}>{CLAIM_TEXT[estimate.claim]}</Chip>
          </span>
        </li>
      </ol>

      {estimate.grade === null ? null : (
        <p className="note" style={{ marginTop: 10, fontSize: 12 }}>
          Link grade <b data-link-grade={estimate.grade}>{estimate.grade}</b>
          {" - the claim level above says how large the surviving set is; the grade says how much the filter that produced it is worth."}
        </p>
      )}

      {estimate.top.length === 0 ? null : (
        <div className="tk-est-top" data-candidates>
          {estimate.top.slice(0, 3).map((c) => (
            <div key={c.what}>
              <span className="p">{`p = ${c.p.toFixed(2)}`}</span> {c.what}
            </div>
          ))}
        </div>
      )}

      <ul className="tk-assume-list" data-assumptions aria-label="Assumptions behind this estimate">
        {estimate.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The compact form used inside a table cell: the surviving count and the claim
 * chip in the line, the audit trail behind a disclosure.
 *
 * A GATE ROUND PUT THE AUDIT TRAIL BACK. The first draft rendered the count and
 * the chip and nothing else, on the reasoning that the full chain lives on the
 * transaction's own page and a column two inches wide cannot hold it. Both
 * halves of that were wrong. The contract says every estimate renders its
 * assumptions and its claim chip, with no exemption for a narrow column; and
 * the page it deferred to is not reachable in this build - the three lockbox
 * txids these cells link to resolve to the stated-gap branch, because the
 * fixture corpus holds one transaction. What a reader lost was load-bearing:
 * the strongest claim level on the site renders here, and the assumption that
 * qualifies it - that the single surviving candidate came from the weakest
 * filter in the toolkit - was on no page at all.
 *
 * `<details>` rather than always-open, so the column still reads at a glance
 * and the ninety words are one keypress away rather than absent. Closed is a
 * rendering; hidden behind a link to a page that does not exist is not.
 */
export function EstimateCell({ estimate, note }: { readonly estimate: Estimate | null; readonly note: string }) {
  if (estimate === null) return <span className="cp">{note}</span>;
  return (
    <div className="cp" data-estimate-cell>
      {`${count(estimate.candidates)} ${estimate.candidates === 1n ? "candidate" : "candidates"} after ${estimate.filters.length} ${estimate.filters.length === 1 ? "filter" : "filters"}. `}
      <Chip {...toneProps(estimate.claim)}>{CLAIM_TEXT[estimate.claim]}</Chip>
      {estimate.grade === null ? null : <> {estimate.grade}</>}
      <details className="tk-est-more">
        <summary>{`how this was bounded - ${estimate.filters.length} ${estimate.filters.length === 1 ? "filter" : "filters"}, ${estimate.assumptions.length} ${estimate.assumptions.length === 1 ? "assumption" : "assumptions"}`}</summary>
        <ol className="chain" style={{ listStyle: "none", padding: "0 0 0 14px", marginTop: 8 }} data-chain>
          {estimate.filters.map((f) => {
            const removed = f.countIn - f.countOut;
            return (
              <li
                className="st"
                key={`${f.filter}-${f.label}`}
                data-filter={f.filter}
                data-count-in={f.countIn.toString()}
                data-count-out={f.countOut.toString()}
              >
                <span className="n">{count(f.countOut)}</span>
                <span className="w">
                  <b>{f.label}</b>
                </span>
                <span className="cost">{removed === 0n ? "no candidates removed" : `-${count(removed)}`}</span>
              </li>
            );
          })}
          <li className="st" data-filter="neff">
            <span className="n">{estimate.nEff.toLocaleString("en-US")}</span>
            <span className="w">
              <b>N_eff</b> {` - H = ${estimate.entropyBits.toFixed(2)} bits`}
            </span>
            <span className="cost" style={{ color: "inherit" }}>
              <Chip {...toneProps(estimate.claim)}>{CLAIM_TEXT[estimate.claim]}</Chip>
            </span>
          </li>
        </ol>
        <ul className="tk-assume-list" data-assumptions aria-label="Assumptions behind this estimate">
          {estimate.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
      <span style={{ display: "block", marginTop: 4 }}>{note}</span>
    </div>
  );
}
