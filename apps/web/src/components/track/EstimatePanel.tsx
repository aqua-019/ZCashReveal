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
import { fmtCount } from "@/lib/format";

/** The claim level in the words the site uses on /method, not the enum's spelling. */
const CLAIM_TEXT: Readonly<Record<Estimate["claim"], string>> = {
  aggregate_only: "aggregate only",
  broad_candidate_set: "broad candidate set",
  small_heuristic_set: "small heuristic set",
  requires_disclosure: "requires disclosure",
};

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
  small_heuristic_set: "gold",
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
 * The compact form used inside a table cell: the surviving count, the claim
 * chip, and nothing else. The full chain lives on the transaction's own page,
 * and this links there rather than repeating it in a column two inches wide.
 */
export function EstimateCell({ estimate, note }: { readonly estimate: Estimate | null; readonly note: string }) {
  if (estimate === null) return <span className="cp">{note}</span>;
  return (
    <span className="cp" data-estimate-cell>
      {`${count(estimate.candidates)} candidates after ${estimate.filters.length} filters. `}
      <Chip {...toneProps(estimate.claim)}>{CLAIM_TEXT[estimate.claim]}</Chip>
      {estimate.grade === null ? null : <> {estimate.grade}</>}
      <span style={{ display: "block", marginTop: 4 }}>{note}</span>
    </span>
  );
}
