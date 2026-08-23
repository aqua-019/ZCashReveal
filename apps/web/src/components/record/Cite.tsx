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
        <span className="cite-verb">cite</span>
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
