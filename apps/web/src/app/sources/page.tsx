import type { Metadata } from "next";

import { getSources, type Source } from "@zcashreveal/content";

import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { citationIndex, type Citation } from "@/lib/citations";
import { fmtInt } from "@/lib/format";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/sources");

export const metadata: Metadata = {
  title: "Sources",
  description: S?.dek ?? "",
};

/**
 * 08 SOURCES - the bibliography.
 *
 * Two labelled groups, each with its own count, and not one undifferentiated
 * list of 328 links (LEDGER-02 Q2, fold 4).
 *
 * The bibliography is deliberately larger than the citation graph. It is the
 * union of every URL in the four research dossiers, which means a reader who
 * wants to check something the Record did not claim can still find where the
 * research looked. That is the right shape for a site whose argument is that
 * the record is public and checkable - but only if the reader can tell the two
 * apart at a glance, which is what the split below is for.
 *
 * Each cited source lists the claims that rest on it, as permalinks. That is
 * the more useful direction to read the graph in: a source matters because of
 * what was built on it, and a reader who distrusts a publisher can see in one
 * line exactly which claims they now need to discount.
 */

/** Sort by publisher, then title, so the list is scannable by who published it. */
function byPublisherThenTitle(a: Source, b: Source): number {
  const p = a.publisher.localeCompare(b.publisher, "en");
  return p === 0 ? a.title.localeCompare(b.title, "en") : p;
}

function SourceRow({
  source,
  citations = [],
}: {
  readonly source: Source;
  /** Empty for an uncited source, which is a state, not an absence. */
  readonly citations?: readonly Citation[] | undefined;
}) {
  return (
    <li id={source.id}>
      <span className="t">
        <a href={source.url} rel="noopener noreferrer nofollow">
          {source.title}
        </a>
      </span>
      <span className="meta">
        {source.publisher}
        {source.date === null ? "" : ` · ${source.date}`}
      </span>
      <span className="u">{source.url}</span>
      {citations.length === 0 ? null : (
        <span className="by">
          {citations.map((c) =>
            // A quarantined record that renders on no page has no href, and
            // gets plain text rather than an anchor to a page that does not
            // carry it (LEDGER-04 Q4, fold 5). The title says why, so the
            // reader is told the claim exists and is not yet published rather
            // than left wondering why one id is not a link.
            c.href === null ? (
              <span key={c.id} title={`${c.id} in ${c.collection} - held in the quarantine, rendered on no page`}>
                {c.id}
              </span>
            ) : (
              <a key={c.id} href={c.href} title={`${c.id} in ${c.collection}`}>
                {c.id}
              </a>
            ),
          )}
        </span>
      )}
    </li>
  );
}

export default function SourcesPage() {
  const sources = getSources();
  const index = citationIndex();

  const cited: Source[] = [];
  const uncited: Source[] = [];
  for (const s of sources) {
    if ((index.get(s.id)?.length ?? 0) > 0) cited.push(s);
    else uncited.push(s);
  }
  cited.sort(byPublisherThenTitle);
  uncited.sort(byPublisherThenTitle);

  // How many distinct claims rest on the bibliography at all.
  const claimCount = new Set([...index.values()].flatMap((cs) => cs.map((c) => c.id))).size;

  const publishers = new Set(sources.map((s) => s.publisher)).size;
  const undated = sources.filter((s) => s.date === null).length;

  return (
    <>
      <RecordHead
        idx="08 SOURCES"
        kicker="every claim resolves to a URL, a confidence and a date"
        title="The bibliography is larger than"
        titleAccent="the argument"
        dek={
          <>
            {fmtInt(sources.length)} sources, of which {fmtInt(cited.length)} carry a claim on this site and{" "}
            {fmtInt(uncited.length)} do not. That gap is deliberate. The corpus is the union of every URL the research
            consulted, so a reader who wants to check something the Record did <b>not</b> claim can still find where the
            research looked - and a bibliography that only contains what a site already used is a bibliography that cannot be
            argued with.
          </>
        }
        aside={
          <MetricRow>
            <Metric label="Cited by the Record" value={fmtInt(cited.length)} sub={`across ${fmtInt(claimCount)} claims`} accent />
            <Metric label="In the corpus, not cited" value={fmtInt(uncited.length)} sub={`${publishers} publishers in all`} />
          </MetricRow>
        }
      />

      <Block idx="01" title="What this page is not" right="the honest limits of a bibliography">
        <div className="grid g2">
          <Glass>
            <p className="note">
              Provenance here is proven against the <b>corpus</b>, not against the live web.{" "}
              <code className="mono">scripts/check-provenance.mjs</code> asserts that every URL in this list occurs in{" "}
              <code className="mono">docs/2.0/research</code>, and{" "}
              <code className="mono">scripts/resolve-refs.mjs</code> rewrites citations from URLs to ids and fails on any URL
              the corpus does not contain. So a citation from outside the research cannot survive a build. What none of that
              establishes is that a URL still resolves today.
            </p>
          </Glass>
          <Glass>
            <p className="note">
              No link here has been re-fetched. The research reports at least one dead link already, and{" "}
              {fmtInt(undated)} of these entries carry no publication date because the source states none - an absent date is
              recorded as absent rather than guessed. A link-rot sweep needs an environment with outbound access and is
              recorded as deferred in the handoff ledger.
            </p>
          </Glass>
        </div>
      </Block>

      <section className="srcgroup" id="cited">
        <Block
          idx="02"
          title="Cited by the Record"
          right={
            <>
              {fmtInt(cited.length)} of {fmtInt(sources.length)}
              <br />
              each listing the claims that rest on it
            </>
          }
        >
          <ol className="srclist">
            {cited.map((s) => (
              <SourceRow key={s.id} source={s} citations={index.get(s.id)} />
            ))}
          </ol>
        </Block>
      </section>

      <section className="srcgroup" id="uncited">
        <Block
          idx="03"
          title="In the corpus, not cited"
          right={
            <>
              {fmtInt(uncited.length)} of {fmtInt(sources.length)}
              <br />
              consulted by the research, not used by a claim
            </>
          }
        >
          <p className="note measure" style={{ marginBottom: 4 }}>
            Nothing on this site rests on these. They are here because the research read them, and because a reader auditing a
            claim we did not make should not have to repeat the search.
          </p>
          <ol className="srclist">
            {uncited.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ol>
        </Block>
      </section>
    </>
  );
}
