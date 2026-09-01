import type { Metadata } from "next";

import { getSources, type Source } from "@zcashreveal/content";

import { PageClaim } from "@/components/record/PageClaim";
import { Working } from "@/components/record/Working";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
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
 *
 * ============================================================================
 * CLAIM ORDER (HANDOFF-04b R5) AND THE COLLAPSE RULE (R4)
 * ============================================================================
 * WHAT A READER MET BEFORE, in order: two 40px figures in the masthead aside,
 * one of them in gold, and then - as the first thing below the head - a block
 * of provenance caveats, and then 328 source rows printed in full. The page's
 * own claim, "that gap is deliberate", was the dek's third sentence, behind the
 * counts. That is the reader's diagnosis rendered almost literally: "vibes,
 * cryptographic terminology, vibes, huge number, tiny explanation, vibes".
 *
 * NOTHING WAS CUT TO ANSWER IT; the order changed and two lists went behind a
 * toggle. The claim is now the first thing under the masthead, the counts sit
 * under it as the evidence for it, and the caveats moved DOWN into the working
 * where a method walk-through belongs.
 *
 * THE FULL SOURCE LIST IS THE COLLAPSE RULE'S OWN NAMED EXAMPLE and this page
 * rendered it twice, open, with zero disclosures anywhere on it. Both lists are
 * now `Working` panels whose summaries carry DERIVED counts, so a summary
 * cannot disagree with the list it summarises. What stays OUTSIDE the toggles
 * is every count a reader needs to judge the page: the two figures, each
 * group's "N of 328" annotation, and the sentence explaining which direction
 * the citation graph is read in. Only the ROWS are collapsed.
 *
 * ============================================================================
 * WHY THIS PAGE STATES A CONDITION INSTEAD OF A CONFIDENCE
 * ============================================================================
 * `sourceSchema` is `.strict()` and carries `{id, title, url, publisher, date,
 * accessed}`. There is no `confidence` and no `lastVerified` on a Source, for
 * any of the 328 - so this page renders no `Conf` and no citation popover, and
 * inventing either would be the precise defect the site exists to refuse.
 * `PageClaim` takes `status` instead, and it names what a bibliography carries
 * in their place: the date the research fetched each URL, the publication date
 * where the corpus has one, and the claims resting on each cited source. That
 * is `docs/2.0/SNAPSHOT.md` section 8.1's rule about absences - state the
 * CONDITION, never an owner - applied to epistemic status.
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
  const citedPublishers = new Set(cited.map((s) => s.publisher)).size;
  const uncitedPublishers = new Set(uncited.map((s) => s.publisher)).size;
  const undated = sources.filter((s) => s.date === null).length;

  /**
   * The fetch dates, derived rather than written down.
   *
   * `accessed` is the one date every Source carries, and today all 328 carry
   * the same one - which is a fact about this corpus, not a property of the
   * schema, so the masthead register reads the SET rather than a date typed
   * beside it. A second research pass gains its date in the register in the
   * same render instead of leaving a hand-written one stale, and a corpus with
   * several fetch dates states the span rather than picking one.
   *
   * The `?? ""` arms are unreachable: `sourcesFileSchema` is `.min(1)`, so the
   * array is never empty. They are here because `noUncheckedIndexedAccess` is
   * on and an unreachable branch is cheaper to read than a non-null assertion.
   */
  const fetchDates = [...new Set(sources.map((s) => s.accessed))].sort();
  const fetched =
    fetchDates.length === 1
      ? (fetchDates[0] ?? "")
      : `${fetchDates[0] ?? ""} to ${fetchDates[fetchDates.length - 1] ?? ""}`;

  return (
    <>
      <RecordHead
        idx="08 SOURCES"
        kicker="every claim resolves to a URL, a confidence and a date"
        title="The bibliography is larger than"
        titleAccent="the argument"
        dek={<>Every URL the four research dossiers consulted, in one list, sorted by who published it.</>}
        /* THE ASIDE IS A REGISTER, NOT A HEADLINE. It carried two 40px numerals
           - the cited and uncited counts, one of them in gold - which is the
           "huge number" beat arriving before the claim that explains it. The
           counts moved below the claim, as its evidence; what stays in the
           masthead is the corpus's shape in the apparatus register, at label
           size, where a reader reads it as metadata rather than as an argument. */
        aside={
          <Glass>
            <Eyebrow idx="the corpus">counted from the list below</Eyebrow>
            <div style={{ marginTop: 12 }}>
              <KV
                stack
                entries={[
                  { k: "entries", v: fmtInt(sources.length) },
                  { k: "publishers", v: `${publishers} - ${citedPublishers} of them cited` },
                  { k: "fetched", v: `${fetched} - none re-fetched since` },
                  { k: "no publication date", v: `${fmtInt(undated)} - the source states none` },
                ]}
              />
            </div>
          </Glass>
        }
      />

      {/* The claim, then the explanation, then the evidence. The claim is
          LIFTED, not invented: "that gap is deliberate" and the sentence after
          it were already on this page, as the third and fourth sentences of the
          dek, behind the two figures they explain. */}
      <PageClaim
        claim={
          <>
            {fmtInt(uncited.length)} of these {fmtInt(sources.length)} sources carry no claim on this site, and the gap
            is deliberate: a bibliography that contains only what a site already used is a bibliography that cannot be
            argued with.
          </>
        }
        explain={
          <>
            The corpus is the union of every URL the research consulted, so a reader who wants to check something the
            Record did <b>not</b> claim can still find where the research looked. The other {fmtInt(cited.length)} carry
            at least one of {fmtInt(claimCount)} claims, and each of those rows lists the claims resting on it - the
            citation graph read from the source&apos;s end, which is the useful direction: a reader who distrusts a
            publisher can see in one line exactly which claims they now need to discount.
          </>
        }
        /* THE THREE ARE NOT AVAILABLE AND ARE NOT INVENTED. `sourceSchema` is
           `.strict()` and has no `confidence` and no `lastVerified` field, for
           any of the 328, so `status` names the CONDITION instead - which is
           `docs/2.0/SNAPSHOT.md` section 8.1's rule about absences applied to
           epistemic status. It says WHERE the substitutes are rather than
           reprinting the register above it: two statements of one date can
           drift apart, and one of them would then be wrong. */
        status={
          <>
            No source on this site carries a confidence or a last-verified date - the schema has neither field, for any
            of these {fmtInt(sources.length)} - and neither is invented here. What a bibliography carries instead is in
            the open: the fetch date and the publication dates in the register above, and, on every cited row, the
            claims resting on it.
          </>
        }
      />

      {/* The two figures the page used to open on, now standing under the claim
          they are evidence for. Neither is `accent`: gold has four licensed
          jobs and none of them is a magnitude (LEDGER-04 Q1b), and a count of
          sources is not a value crossing a pool boundary. "Cited by the Record"
          was set in gold because it was the bigger number. */}
      <MetricRow>
        <Metric label="Cited by the Record" value={fmtInt(cited.length)} sub={`across ${fmtInt(claimCount)} claims`} />
        <Metric
          label="In the corpus, not cited"
          value={fmtInt(uncited.length)}
          sub={`from ${uncitedPublishers} publishers`}
        />
      </MetricRow>

      <section className="srcgroup" id="cited">
        <Block
          idx="01"
          title="Cited by the Record"
          right={
            <>
              {fmtInt(cited.length)} of {fmtInt(sources.length)}
              <br />
              each listing the claims that rest on it
            </>
          }
        >
          {/* OUTSIDE THE TOGGLE, because it is how the reader gets from a claim
              to its sources rather than a detail of the list. The rows carry
              the graph one way; a claim's own sources are on the claim, in its
              citation, where they count that claim's evidence and not the
              page's. */}
          <p className="note measure">
            Each row lists the claims that rest on it, so this list is the citation graph read from the source&apos;s
            end. A claim&apos;s own sources travel with the claim, in the citation beside it, on the page that makes it.
          </p>
          <Working
            id="cited-list"
            title="Every cited source, with the claims resting on it"
            finding={`${cited.length} rows, ${claimCount} claims`}
          >
            <ol className="srclist">
              {cited.map((s) => (
                <SourceRow key={s.id} source={s} citations={index.get(s.id)} />
              ))}
            </ol>
          </Working>
        </Block>
      </section>

      <section className="srcgroup" id="uncited">
        <Block
          idx="02"
          title="In the corpus, not cited"
          right={
            <>
              {fmtInt(uncited.length)} of {fmtInt(sources.length)}
              <br />
              consulted by the research, not used by a claim
            </>
          }
        >
          <p className="note measure">
            Nothing on this site rests on these. They are here because the research read them, and because a reader
            auditing a claim we did not make should not have to repeat the search.
          </p>
          <Working
            id="uncited-list"
            title="Every source the research read and no claim used"
            finding={`${uncited.length} rows, ${uncitedPublishers} publishers`}
          >
            <ol className="srclist">
              {uncited.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </ol>
          </Working>
        </Block>
      </section>

      {/* ---------------- THE WORKING ----------------
          Claim, explanation, evidence, then the working. What is behind this
          toggle is a method walk-through - which script asserts what, and what
          none of them establishes - which is exactly what the collapse rule
          says to collapse. What is NOT behind it: the strip beside the claim
          says that no source carries a confidence or a last-verified date, and
          the masthead register carries the fetch date, the count with no
          publication date, and the fact that nothing has been re-fetched.
          Epistemic status behind a toggle is the null-panel-renders-as-zero
          defect in a nicer coat. */}
      <section className="beat beat-working">
        <span className="beattag">The working</span>

        {/* THE FINDING IS KEPT SHORT, AND THE REASON IS A MEASUREMENT. `.wd-n`
            is `white-space: nowrap` inside a `.wdisc` that is
            `overflow: hidden`, so a finding wider than the summary row is
            CLIPPED - not wrapped, not scrolled, and not visible. Measured at
            390: this text gives the row scrollWidth 356 against clientWidth
            356; the longer draft, "328 URLs proven against the corpus, 0
            re-fetched", gives 467 against 356, losing 111px of itself. The
            rendered A4 check reads `innerText`, which returns the whole string
            either way, so it stays green while the reader cannot read it. */}
        <Working title="What this page is not" finding={`${sources.length} URLs, 0 re-fetched`}>
          <p className="note">
            Provenance here is proven against the <b>corpus</b>, not against the live web.{" "}
            <code className="mono">scripts/check-provenance.mjs</code> asserts that every URL in this list occurs in{" "}
            <code className="mono">docs/2.0/research</code>, and <code className="mono">scripts/resolve-refs.mjs</code>{" "}
            rewrites citations from URLs to ids and fails on any URL the corpus does not contain. So a citation from
            outside the research cannot survive a build. What none of that establishes is that a URL still resolves
            today.
          </p>
          <p className="note">
            No link here has been re-fetched. The research reports at least one dead link already, and {fmtInt(undated)}{" "}
            of these entries carry no publication date because the source states none - an absent date is recorded as
            absent rather than guessed. A link-rot sweep needs an environment with outbound access and is recorded as
            deferred in the handoff ledger.
          </p>
        </Working>
      </section>
    </>
  );
}
