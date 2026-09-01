import { permalink, type Confidence, type Source } from "@zcashreveal/content";

import { Conf } from "@/components/ui/Conf";
import { SITE_URL } from "@/lib/site";

/**
 * The "cite this" apparatus, on every rendered claim.
 *
 * HANDOFF-03 section 3 requires that every claim show its id, its confidence
 * and a popover carrying the id, the canonical URL, the last-verified date and
 * the sources. It lists the popover among the client islands, and it is not one
 * here: a native `<details>` disclosure is keyboard-operable, screen-reader
 * announced and dismissible without a line of JavaScript, and it registers no
 * animation, which is what assertion A6 measures on every Record page. An
 * island would have had to re-implement all three and then be excluded from A6
 * by hand. Recorded as an inference in the section 8 block.
 *
 * The canonical URL is absolute. A citation that only resolves relative to the
 * page it was copied from is not a citation.
 *
 * WHAT THE CLOSED STATE CARRIES, AND WHY IT IS NOT JUST THE ID. HANDOFF-04a
 * deliverable 4 states the collapse rule for every disclosure on the site:
 * collapse the derivation, the raw table, the full source list - never the
 * claim, and never `confidence`, `lastVerified` or the source count, because
 * epistemic status behind a toggle is the null-panel-renders-as-zero defect in
 * a nicer coat. This summary used to read `N-cameron-winklevoss  CITE` and put
 * all three of those behind the triangle, so a reader skimming a page of claims
 * saw a row of identical grey chips and could not tell a high-confidence claim
 * verified last week from a low-confidence one verified in March without
 * opening every one of them. The closed state now carries the id, the
 * confidence, the last-verified date and the number of sources; the derivation
 * - the canonical URL and the sources themselves, with their publishers and
 * access dates - is what stays behind the toggle.
 *
 * THE COUNT IS DERIVED, never written beside the list. `sources.length` is the
 * same array the body maps over, so a summary saying "4 sources" above a list
 * of three is not reachable: the two cannot disagree. The count is the only
 * finding this summary can honestly carry - `Source` has no field marking a
 * source primary or secondary, so the "14 cited, 3 primary" shape the rule
 * gives as its example has no second number available here.
 *
 * The dl in the body still repeats the date and the confidence. That is not an
 * oversight: the body is a citation a reader copies whole, and a citation that
 * omits when it was last verified because the chip above it happened to say so
 * is not a citation.
 *
 * A claim can have NO canonical URL: `permalink()` returns null for the 22
 * quarantined records that render on no page (LEDGER-04 Q4, fold 5). The
 * popover then states that rather than linking, because an anchor that lands
 * on a page which does not carry the claim tells the reader it is there when
 * it is not. The id, the date, the confidence and the sources all still
 * render - the record is held and citable, it just has no address on this
 * site yet.
 */
export function Cite({
  id,
  lastVerified,
  confidence,
  sources,
  href,
}: {
  readonly id: string;
  readonly lastVerified: string;
  readonly confidence: Confidence;
  readonly sources: readonly Source[];
  /** Override the permalink for an id outside the known families. */
  readonly href?: string;
}) {
  const path = href ?? permalink(id);
  const canonical = path === null ? null : `${SITE_URL}${path}`;
  return (
    <details className="cite" data-cite={id}>
      <summary>
        <span className="cite-id">{id}</span>
        <span className="sr-only">confidence: </span>
        <Conf level={confidence} />
        <span className="cite-date">verified {lastVerified}</span>
        <span className="cite-verb">{`cite - ${sources.length} ${sources.length === 1 ? "source" : "sources"}`}</span>
      </summary>
      <div className="cite-body">
        <dl className="kv stack">
          <div style={{ display: "contents" }}>
            <dt className="k">claim</dt>
            <dd className="v">{id}</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt className="k">canonical</dt>
            <dd className="v">
              {path === null || canonical === null ? (
                <span className="note">held in the quarantine; no page renders it yet</span>
              ) : (
                <a href={path}>{canonical}</a>
              )}
            </dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt className="k">last verified</dt>
            <dd className="v">{lastVerified}</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt className="k">confidence</dt>
            <dd className="v">
              <Conf level={confidence} />
            </dd>
          </div>
        </dl>
        <ol className="cite-sources">
          {sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} rel="noopener noreferrer nofollow">
                {s.title}
              </a>
              <span className="src">
                {" "}
                {s.publisher}
                {s.date === null ? "" : ` · ${s.date}`} {"·"} accessed {s.accessed}
              </span>
            </li>
          ))}
        </ol>
        {sources.length === 0 ? (
          <p className="note">
            No source. Nothing on this site is published in that state; if you are reading this, a seed has drifted from
            the schema that forbids it.
          </p>
        ) : null}
      </div>
    </details>
  );
}
