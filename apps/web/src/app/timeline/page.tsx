import type { Metadata } from "next";

import {
  getTimeline,
  resolveSources,
  timelineCategorySchema,
  type TimelineCategory,
  type TimelineEvent,
} from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { ShieldedShare, ShieldedShareCite } from "@/components/record/ShieldedShare";
import { ALL, TimelineFilter, type FilterOption } from "@/components/record/TimelineFilter";
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

  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);

  const options: readonly FilterOption[] = [
    { value: ALL, label: "all", count: events.length },
    ...CHIP_ORDER.map((c) => ({ value: c, label: CHIP_LABEL[c], count: counts.get(c) ?? 0 })),
  ];

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

  const shown = active === ALL ? events.length : (counts.get(active) ?? 0);

  return (
    <>
      <RecordHead
        idx="02 RECORD"
        kicker="2013 to 2026 - one spine - filter by strand"
        title="From Zerocash to"
        titleAccent="the ETF"
        dek={
          <>
            Launch, funding, governance, leadership, exploits, upgrades, market and the promotion network on one axis. The
            governance strand alone runs{" "}
            <b>
              Founders&apos; Reward to ZIP 1014 to ZIP 1015 to ZIP 1016 to the January 2026 walkout to a VC-funded lab writing
              82 per cent of the code
            </b>
            . Dates are printed as the record states them: a row the sources date only to a month says so rather than
            borrowing a day from its sort key.
          </>
        }
        aside={
          <Glass>
            <Eyebrow idx="shielded share of supply">2018 to 2026</Eyebrow>
            <ShieldedShare />
            <ShieldedShareCite />
          </Glass>
        }
      />

      <p className="note" style={{ marginTop: 4 }}>
        {events.length} dated entries, {counts.size} strands.{" "}
        {active === ALL ? (
          <>Showing all of them.</>
        ) : (
          <>
            Showing the {shown} <b>{CHIP_LABEL[active as TimelineCategory]}</b> rows; the year numerals stay, so a strand&apos;s
            silent years remain visible.
          </>
        )}
      </p>

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
    </>
  );
}
