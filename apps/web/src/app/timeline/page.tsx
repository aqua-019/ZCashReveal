import type { Metadata } from "next";

import {
  getContradictions,
  getTimeline,
  resolveSources,
  timelineCategorySchema,
  type TimelineCategory,
  type TimelineEvent,
} from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { PageClaim } from "@/components/record/PageClaim";
import { ShieldedShare, ShieldedShareCite } from "@/components/record/ShieldedShare";
import { ALL, TimelineFilter, type FilterOption } from "@/components/record/TimelineFilter";
import { Working } from "@/components/record/Working";
import { RecordHead } from "@/components/shell/RecordHead";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/timeline");

export const metadata: Metadata = {
  title: "Timeline",
  description: S?.dek ?? "",
};

/**
 * 02 RECORD - the timeline.
 *
 * One spine, 2013 to 2026, every strand on the same axis. The argument of the
 * page is that these are not eight separate stories: the money raised in 2015
 * becomes the Founders' Reward, becomes the dev-fund fight, becomes the January
 * 2026 walkout, while a soundness bug lives in the circuit for 730 days and
 * then another for 1,462, and the promotion network runs at full volume across
 * the same months. Reading them together is what makes the pattern visible, and
 * the strand filter is there so a reader can check that the pattern survives
 * being taken apart.
 *
 * DATES. Every row prints `dateText` - the corpus's own rendering - and never a
 * formatted `date`. `date` exists to sort; 36 of the 124 rows are month-, year-
 * or range-precise, and formatting their sort key would print a day the
 * research does not have on a site whose whole argument is about not doing
 * that. LEDGER-02 Q3 and fold 5; assertion A11.
 *
 * ============================================================================
 * CLAIM ORDER (HANDOFF-04b R5), AND WHY THIS PAGE WAS THE CLEAREST INSTANCE
 * ============================================================================
 * The reader's diagnosis - "instead of claim, explanation, evidence,
 * visualization, we get vibes, cryptographic terminology, vibes, huge number,
 * tiny explanation, vibes" - was rendered here almost literally. What a reader
 * met, in order: an eyebrow, a dek that was a LIST with the page's one
 * falsifiable assertion buried inside a bolded clause of 37 words - counted off
 * the pre-fix file rather than taken from the brief, which said 44 - a chart in
 * the masthead aside, then, as the first thing BELOW the head, a bare CITATION
 * CHIP, then a count, then 124 rows. A chip before a sentence, and a chart
 * before a claim.
 *
 * The fix is order, not volume, and nothing was cut. The buried assertion is
 * now the first thing under the masthead, with its citation UNDER it rather
 * than standing in for it; the dek keeps the scope sentence; the date rule -
 * the dek's third sentence, which is a method walk-through - moved into the
 * working, where it gained the counts it was describing.
 *
 * THE EPISTEMIC STRIP RESTS ON C8 AND ON NOTHING AGGREGATED. The claim above
 * takes its FIGURE from C8 - the ZIP 1016 author who founded the lab that wrote
 * roughly 82 per cent of Ironwood - and the line it traces from the spine's own
 * rows, so the confidence, the date and the source count beside it are C8's own
 * three and the citation under them says which part of the sentence they cover.
 * The claim keeps this page's narrower wording for the figure's scope, "merged
 * protocol and wallet repository changes", rather than C8's "the code shipped
 * in Ironwood": it was already the more careful of the two and this handoff
 * moves sentences, it does not restate facts. Averaging the 124 rows' own
 * grades into a page-level confidence would state a number no corpus row makes;
 * each row carries its three in the open, on the row, in the spine below.
 */

/** The filter's own order, from the mockup: loudest strand first, launch last. */
const CHIP_ORDER: readonly TimelineCategory[] = [
  "EXPLOIT",
  "GOV",
  "FUND",
  "LEAD",
  "TECH",
  "MARKET",
  "REG",
  "NET",
  "LAUNCH",
];

/**
 * The chip labels the mockup prints, which are not the category codes: three of
 * the nine read differently to a reader than they do to the schema.
 */
const CHIP_LABEL: Record<TimelineCategory, string> = {
  LAUNCH: "launch",
  FUND: "funding",
  GOV: "governance",
  LEAD: "leadership",
  EXPLOIT: "exploit",
  TECH: "protocol",
  MARKET: "market",
  REG: "regulatory",
  NET: "network",
};

/** How the corpus knows a date, said plainly next to it. */
const PRECISION_NOTE: Record<TimelineEvent["datePrecision"], string | null> = {
  day: null,
  month: "month only",
  year: "year only",
  range: "a span",
};

/**
 * The precisions, read off the map above rather than written out beside it.
 *
 * `Object.keys` erases the key type and the cast restores what the map's own
 * type already guarantees: it is keyed by the schema union, so its key set IS
 * the union. A fifth precision entering the schema fails to typecheck AT THE
 * MAP - a missing property - rather than arriving in the corpus, rendering on
 * every row and leaving the disclosure below still describing four. That is the
 * same argument as `BewareRow`'s exported enum order: the panel iterates the
 * rule's own data structure instead of a second list that can disagree with it.
 */
const PRECISIONS = Object.keys(PRECISION_NOTE) as readonly TimelineEvent["datePrecision"][];

/** "a, b and c". The dek's strand list reads as prose, not as a CSV. */
function prose(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

export default async function TimelinePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params["category"];
  const asked = Array.isArray(raw) ? raw[0] : raw;
  // An unrecognised category is not an error and not an empty page: it is a
  // reader who typed something. Fall back to the whole record.
  const parsed = timelineCategorySchema.safeParse(asked);
  const active: string = parsed.success ? parsed.data : ALL;

  const events = getTimeline();
  // The claim states C8's figure, so it cites C8.
  const c8 = getContradictions().find((c) => c.id === "C8");

  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);

  const options: readonly FilterOption[] = [
    { value: ALL, label: "all", count: events.length },
    ...CHIP_ORDER.map((c) => ({ value: c, label: CHIP_LABEL[c], count: counts.get(c) ?? 0 })),
  ];

  /**
   * The claim's epistemic status, or the condition that stands in for it.
   *
   * `PageClaim` takes the three or a `status`, never both. A missing C8 is not
   * a licence to borrow a confidence from a row that does not make this claim -
   * `docs/2.0/SNAPSHOT.md` section 8.1's rule about absences, applied to
   * epistemic status. The conditional is not defensive coding for its own sake:
   * `find()` returns `undefined` and `exactOptionalPropertyTypes` will not let
   * the three be passed as such, so the absent case has to be said out loud.
   */
  const claimApparatus =
    c8 === undefined
      ? {
          status:
            "The corpus row carrying the 82 per cent figure is not in this build, so this page states no confidence and no last-verified date for the claim above.",
        }
      : {
          confidence: c8.confidence,
          lastVerified: c8.lastVerified,
          sourceCount: resolveSources(c8.sources).length,
        };

  // Year headings punctuate the spine. They are emitted from the sort key
  // rather than from `dateText`, which is the one legitimate use of `date`: the
  // year of a row dated "Apr-Jun 2018" is 2018 whatever the precision, and the
  // heading is a grouping, not a claim about a day.
  const rows: { readonly year: string; readonly events: readonly TimelineEvent[] }[] = [];
  for (const e of events) {
    const year = e.date.slice(0, 4);
    const last = rows[rows.length - 1];
    if (last !== undefined && last.year === year) rows[rows.length - 1] = { year, events: [...last.events, e] };
    else rows.push({ year, events: [e] });
  }

  /** The rows the date disclosure is about, counted rather than remembered. */
  const coarse = events.filter((e) => e.datePrecision !== "day");

  /**
   * The rows carrying a second strand, and the four whose second strand is
   * governance.
   *
   * Both counts are derived because the second one is a caveat on the claim
   * above rather than a curiosity: the chips count, and the filter matches, a
   * row's PRIMARY strand only, so ZIP 1014, ZIP 1016 and the $25M raise - three
   * of the links in the governance line - are filed under funding and are
   * absent from the governance chip. On a page whose argument is that the
   * strands are one story, a filter that quietly disagrees is worth disclosing
   * rather than leaving for a reader to discover by counting.
   */
  const withSecondary = events.filter((e) => e.secondaryCategory !== undefined);
  const govSecond = events.filter((e) => e.secondaryCategory === "GOV");
  const pairExample = withSecondary[0];

  return (
    <>
      <RecordHead
        idx="02 RECORD"
        kicker="2013 to 2026 - one spine - filter by strand"
        title="From Zerocash to"
        titleAccent="the ETF"
        dek={
          // The strand list is DERIVED from the chip order, and that is a fix
          // rather than tidying: it used to name eight strands - launch,
          // funding, governance, leadership, exploits, upgrades, market and the
          // promotion network - while the corpus files nine, so a reader
          // counting the dek against the chips below found regulatory in one
          // and not the other. An enumeration is only exhaustive over the thing
          // it enumerates, so it now enumerates the chips themselves and reads
          // in their words.
          <>Every dated row the corpus holds, on one axis: {prose(CHIP_ORDER.map((c) => CHIP_LABEL[c]))}.</>
        }
        aside={
          <Glass>
            <Eyebrow idx="shielded share of supply">2018 to 2026</Eyebrow>
            <ShieldedShare />
            <ShieldedShareCite />
          </Glass>
        }
      />

      {/* The claim, then the explanation, then the evidence. The claim is
          LIFTED, not invented: it is the bolded clause that was the dek's
          second sentence, and the page's own material - C8 for the figure, the
          governance rows for the line it traces - is what supports it. */}
      <PageClaim
        claim={
          <>
            The governance strand runs one unbroken line: Founders&apos; Reward to ZIP 1014 to ZIP 1015 to ZIP 1016 to
            the January 2026 walkout to a VC-funded lab whose engineers accounted for roughly 82 per cent of merged
            protocol and wallet repository changes in Ironwood.
          </>
        }
        explain={
          <>
            These strands are not separate stories. The money raised in 2015 becomes the Founders&apos;
            Reward, becomes the dev-fund fight, becomes the walkout, while a soundness bug sits in one circuit and then
            in another and the promotion network runs at full volume across the same months. That is why all{" "}
            {events.length} rows share a single spine - and why the strand filter is here, because a pattern that does
            not survive being taken apart is not one.
          </>
        }
        {...claimApparatus}
      >
        {/* A div, not a <p>: `Cite` renders a `<details>`, which the parser
            treats as closing an open paragraph - the disclosure is torn out,
            promoted to a sibling and followed by a stray empty <p>, and React
            reports the hydration mismatch. Twice in this repository, which is
            why `no-disclosure-in-paragraph.test.ts` exists. */}
        {c8 === undefined ? null : (
          <div className="claim">
            <a className="anchor" href={`/contradictions#${c8.id}`}>
              {c8.id}
            </a>
            <Cite id={c8.id} lastVerified={c8.lastVerified} confidence={c8.confidence} sources={resolveSources(c8.sources)} />
            <span className="src">the 82 per cent figure, its scope and its confidence</span>
          </div>
        )}
      </PageClaim>

      {/* The count line that used to sit here now lives INSIDE the island, for
          a reason that is a defect rather than a preference: it read the server's
          `category` parameter, and the island filters without a round trip, so
          after one chip click the page said "Showing all of them" above 24
          visible rows. One state, one renderer. */}
      <TimelineFilter options={options} initial={active}>
        {rows.map((group) => (
          <div key={group.year}>
            <div className="yr">{group.year}</div>
            {group.events.map((e) => {
              const note = PRECISION_NOTE[e.datePrecision];
              return (
                <div
                  className="ev"
                  key={e.id}
                  id={e.id}
                  data-cat={e.category}
                  hidden={active !== ALL && e.category !== active}
                >
                  <span className="d">
                    {e.dateText}
                    {note === null ? null : <span className="approx">{note}</span>}
                  </span>
                  <span className={`cat cat-${e.category}`}>
                    {CHIP_LABEL[e.category]}
                    {e.secondaryCategory === undefined ? null : (
                      <>
                        {" / "}
                        {CHIP_LABEL[e.secondaryCategory]}
                      </>
                    )}
                  </span>
                  <span className="t">
                    <b>{e.title}</b> {e.summary}
                    {e.height === undefined ? null : <span className="src">block {e.height.toLocaleString("en-GB")}</span>}
                    <span className="claim">
                      <a className="anchor" href={`/timeline#${e.id}`}>
                        {e.id}
                      </a>
                      <Cite
                        id={e.id}
                        lastVerified={e.lastVerified}
                        confidence={e.confidence}
                        sources={resolveSources(e.sources)}
                      />
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </TimelineFilter>

      {/* ---------------- THE WORKING ----------------
          Claim, explanation, evidence, then the working. Both panels hold
          material that was either buried in the dek or stated nowhere a reader
          could reach it, so collapsing MOVED something and removed nothing, and
          each summary states its finding from a count the body derives rather
          than from a literal beside it.

          What is never collapsed and is not here: the claim, and the
          confidence, last-verified date and source count beside it. */}
      <section className="beat beat-working">
        <span className="beattag">The working</span>

        <Working
          title="How the record is dated"
          finding={`${coarse.length} of ${events.length} rows are coarser than a day`}
        >
          <p className="note">
            Every row prints the corpus&apos;s own rendering of its date, never a formatted sort key. The sort key
            exists to order the spine; a row the sources date only to a month says so beside the date instead of
            borrowing a day from it. A site whose argument is that a claim may not assert more than its evidence
            carries cannot open by asserting a day it does not have.
          </p>
          <dl className="pubgrid">
            {PRECISIONS.map((p) => {
              const note = PRECISION_NOTE[p];
              return (
                <div className="pubrow" key={p}>
                  <dt className="pubname">{p}</dt>
                  <dd className="pubwhat">
                    {events.filter((e) => e.datePrecision === p).length} rows -{" "}
                    {note === null ? "no qualifier printed" : `marked ${note} beside the date`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Working>

        <Working
          title="How the strand filter counts"
          finding={`${withSecondary.length} of ${events.length} rows carry a second strand`}
        >
          <p className="note">
            Each chip counts, and the filter matches, a row&apos;s PRIMARY strand only. {withSecondary.length} of the{" "}
            {events.length} rows carry a second strand as well - they print both, as{" "}
            {pairExample === undefined || pairExample.secondaryCategory === undefined
              ? "two labels separated by a slash"
              : `${CHIP_LABEL[pairExample.category]} / ${CHIP_LABEL[pairExample.secondaryCategory]}`}{" "}
            - and no chip counts the second one. It bites hardest on the claim at the top of this page: the{" "}
            {CHIP_LABEL.GOV} chip shows the {counts.get("GOV") ?? 0} rows the corpus FILES under governance, and not
            these {govSecond.length}, which carry it second.
          </p>
          <ul className="wd-list">
            {govSecond.map((e) => (
              <li key={e.id}>
                <a href={`/timeline#${e.id}`}>{e.id}</a> {e.title} - filed under {CHIP_LABEL[e.category]}
              </li>
            ))}
          </ul>
          <p className="note">
            Two behaviours below that are deliberate. Year numerals are never hidden, so a strand&apos;s silent years
            stay visible - filtering to leadership and finding a year empty is information. And the chips are real
            links: the server sets the hidden rows from the category parameter, so a filtered view works with
            JavaScript switched off and can be copied out of the address bar.
          </p>
        </Working>
      </section>
    </>
  );
}
