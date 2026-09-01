import type { Metadata } from "next";

import { getBeware, getContradictions, getTimeline, requirePermalink, resolveSources } from "@zcashreveal/content";

import { BewareDeepDive } from "@/components/record/BewareDeepDive";
import { BewareRow, DETECTABILITY_ORDER, DETECTABLE } from "@/components/record/BewareRow";
import { Cite } from "@/components/record/Cite";
import { PageClaim } from "@/components/record/PageClaim";
import { Working } from "@/components/record/Working";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Conf } from "@/components/ui/Conf";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { Ledger } from "@/components/ui/LedgerRow";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { Quote } from "@/components/ui/Quote";
import { screenByHref } from "@/lib/nav";


const S = screenByHref("/beware");

export const metadata: Metadata = {
  title: "Beware",
  description: S?.dek ?? "",
};

/**
 * 01 LEDGER - the exploit record.
 *
 * The argument of the page is that two of these fourteen entries can never be
 * settled by analysis. A soundness bug in a zero-knowledge circuit is the one
 * class of defect whose exploitation leaves no evidence, because the pool
 * hides a forged note exactly as well as it hides a legitimate one; the two
 * windows together cover most of the chain's life. So the page refuses
 * rhetoric and lays out a register instead: every row carries its window, its
 * root cause, its discoverer, whether it was ever detectable, its confidence,
 * its sources and its last-verified date, and a reader who rejects a row can
 * strike it without the argument collapsing.
 *
 * Zero motion. The only transition is the 320ms dim on the ledger's own hover,
 * which is declared on `.ledger` in globals.css and is the one hover verb the
 * design system allows. This is the page assertion A6 measures and the page
 * the Lighthouse floors are set against.
 *
 * NOTHING HERE IS AUTHORED. Every figure and every sentence of substance comes
 * from `@zcashreveal/content`; where the mockup carried an editorial line the
 * corpus does not have - the per-row detectability sentences, the "sorted by
 * severity" caption - the page states what the corpus states instead. Where a
 * seed hedges ("roughly 22,000 to 25,400 ZEC"), the hedge is carried.
 *
 * ============================================================================
 * CLAIM ORDER (HANDOFF-04b R5), AND WHAT WAS ACTUALLY WRONG HERE
 * ============================================================================
 * This page had a claim - it was fourth. A reader met a dek opening on a count,
 * then two block quotes, then four large figures, and only after those the
 * sentence they were figures about. That is the reader's own diagnosis, "vibes,
 * cryptographic terminology, vibes, huge number, tiny explanation, vibes",
 * with the beats in that order.
 *
 * The fix is order, not volume: nothing was deleted. The claim that was buried
 * is now the first thing under the masthead, the explanation that trailed the
 * metric row now precedes it, and the three pieces of WORKING - the
 * reconstructed diff, the nine-step register and the detectability key - are
 * behind disclosures whose summaries state what is inside them.
 *
 * THE EPISTEMIC STRIP RESTS ON C2 AND ON NOTHING AGGREGATED. The claim above is
 * C2's `reality` field in this page's words - the combined span, and that
 * neither window can be retroactively proven clean - so the confidence, the
 * date and the source count beside it are C2's own three, and C2's citation
 * sits under them. Deriving a page-level confidence by, say, taking the weakest
 * of the fourteen rows would state a number no corpus row makes: B12 is `med`
 * and has nothing to do with the counterfeiting windows. The rows each carry
 * their own three, in the open, in the ledger below.
 */

/**
 * The corpus timeline rows that fall inside B2's window and belong to its
 * story, in the order the loader returns them (chronological, then by id).
 * This is a named list rather than a date filter because the same nine weeks
 * also carry the Grayscale ETF filing, the Multicoin disclosure and the
 * Ironwood announcement, none of which is part of this account.
 */
const B2_STEPS: readonly string[] = [
  "T2022-05-31",
  "T2026-05-28",
  "T2026-05-29",
  "T2026-06-01",
  "T2026-06-03",
  "T2026-06-04",
  "T2026-06-04-2",
  "T2026-06-15",
  "T2026-07-28",
];

export default function BewarePage() {
  const entries = getBeware();
  const contradictions = getContradictions();

  const b1 = entries.find((e) => e.id === "B1");
  const b2 = entries.find((e) => e.id === "B2");
  // C2 states the combined span of the two windows; C3 and C9 state what is
  // still inside the two pools those windows ran under. None of the three is a
  // figure this page derives for itself.
  const c2 = contradictions.find((c) => c.id === "C2");
  const c3 = contradictions.find((c) => c.id === "C3");
  const c9 = contradictions.find((c) => c.id === "C9");

  const steps = getTimeline().filter((e) => B2_STEPS.includes(e.id));

  // The ledger's own range, stated from the data rather than typed in: the
  // schema allows B1 to B14 and the seed currently fills all fourteen.
  const firstId = entries[0]?.id ?? "B1";
  const lastId = entries[entries.length - 1]?.id ?? "B14";

  const critical = entries.filter((e) => e.severity === "crit");
  const undetectable = entries.filter((e) => e.detectable === "no");
  const highConfidence = entries.filter((e) => e.confidence === "high");

  /**
   * The claim's epistemic status, or the condition that stands in for it.
   *
   * `PageClaim` takes the three or a `status`, never both, and a page whose
   * source row is missing must state the CONDITION rather than borrow a
   * confidence from a row that does not make the claim - `docs/2.0/SNAPSHOT.md`
   * section 8.1's rule about absences, applied to epistemic status. The
   * conditional is not defensive coding for its own sake: `find()` returns
   * `undefined` and `exactOptionalPropertyTypes` will not let the three be
   * passed as such, so the absent case has to be said out loud somewhere.
   */
  const claimApparatus =
    c2 === undefined
      ? {
          status:
            "The corpus row stating the combined span is not in this build, so this page states no confidence and no last-verified date for the claim above.",
        }
      : {
          confidence: c2.confidence,
          lastVerified: c2.lastVerified,
          sourceCount: resolveSources(c2.sources).length,
        };

  return (
    <>
      <RecordHead
        idx="01 LEDGER"
        kicker="the exploit record - zero motion - every row sourced"
        title="Beware: what the proof could not"
        titleAccent="prove"
        dek={
          <>
            The exploit record, in the order the corpus numbers them: what was broken, when, who found it, and whether
            anyone outside could have seen it. Most of the {entries.length} entries are ordinary defects - the
            side-channels, the spam, the 5.7 years in which Sprout proofs went unverified, the turnstile that could be
            silently switched off, and the two ceremonies the oldest pools still rest on.{" "}
            {critical.map((e) => e.id).join(" and ")} are not.
          </>
        }
        aside={
          <Glass>
            <Quote who="Bruce Schneier - on CVE-2026-54496 - recorded in B2">
              &ldquo;there&apos;s no way of knowing if anyone exploited the vulnerability to steal money.&rdquo;
            </Quote>
            <div className="hair" style={{ margin: "14px 0" }} />
            <Quote who="Zcash Foundation - 5 Feb 2019 - on CVE-2019-7167 - recorded in B1">
              &ldquo;it&apos;s impossible to know if it&apos;s been exploited... until Sprout addresses are
              deprecated&rdquo;
            </Quote>
            <div className="claim">
              {b2 === undefined ? null : (
                <>
                  <a className="anchor" href={requirePermalink(b2.id)}>
                    {b2.id}
                  </a>
                  <Cite
                    id={b2.id}
                    lastVerified={b2.lastVerified}
                    confidence={b2.confidence}
                    sources={resolveSources(b2.sources)}
                  />
                </>
              )}
              {b1 === undefined ? null : (
                <>
                  <a className="anchor" href={requirePermalink(b1.id)}>
                    {b1.id}
                  </a>
                  <Cite
                    id={b1.id}
                    lastVerified={b1.lastVerified}
                    confidence={b1.confidence}
                    sources={resolveSources(b1.sources)}
                  />
                </>
              )}
            </div>
          </Glass>
        }
      />

      <PageClaim
        claim={
          <>
            For roughly six of the chain&apos;s ~9.8 years a shielded circuit was unsound and counterfeiting was
            possible without limit - and the windows in which that was true, {critical.map((e) => e.id).join(" and ")}{" "}
            below, cannot be cleared after the fact.
          </>
        }
        explain={
          <>
            A zero-knowledge pool hides a forged note exactly as well as it hides a legitimate one, so no analysis run
            afterwards can settle whether either window was used: the question closes when the pools those circuits ran
            under are empty, and not before. The corpus states the combined span as an approximation rather than as a
            count of days, and nothing computed since narrows it. What follows is the register the claim rests on, then
            the working.
          </>
        }
        {...claimApparatus}
      >
        {/* A div, not a <p>: `Cite` renders a `<details>`, which the parser
            treats as closing an open paragraph - the disclosure is torn out,
            promoted to a sibling and followed by a stray empty <p>, and React
            reports the hydration mismatch. Twice in this repository, which is
            why `no-disclosure-in-paragraph.test.ts` exists. */}
        {c2 === undefined ? null : (
          <div className="claim">
            <a className="anchor" href={requirePermalink(c2.id)}>
              {c2.id}
            </a>
            <Cite
              id={c2.id}
              lastVerified={c2.lastVerified}
              confidence={c2.confidence}
              sources={resolveSources(c2.sources)}
            />
          </div>
        )}
      </PageClaim>

      {/* The explanation of the figures, ABOVE the figures. It was below them,
          which is the "huge number, tiny explanation" half of the complaint
          rendered literally: four large counts, then a line saying where they
          came from. */}
      <p className="note measure" style={{ marginTop: 26 }}>
        The figures below are counted from the {entries.length} rows in the ledger, not asserted separately. Strike a
        row you do not accept and the counts move with it.
      </p>

      <MetricRow>
        <Metric
          label="Ledger entries"
          value={String(entries.length)}
          sub={`${firstId} to ${lastId} - each with its own sources`}
        />
        <Metric
          label="Critical"
          value={String(critical.length)}
          sub={`${critical.map((e) => e.id).join(" · ")} - the two counterfeiting windows`}
        />
        {/* NOT `accent`. Gold has four licensed jobs and none of them is a
            magnitude; "a figure about unprovability is never gold, because size
            in the accent colour reads as an accusation this site does not make"
            (LEDGER-04 Q1b). This is the most unprovable figure on the page and
            it was the one set in gold. */}
        <Metric
          label="Never detectable"
          value={`${undetectable.length} of ${entries.length}`}
          sub={`${undetectable.map((e) => e.id).join(" · ")} - no trace in public data`}
        />
        <Metric
          label="Confidence high"
          value={`${highConfidence.length} of ${entries.length}`}
          sub={`the rest: ${entries
            .filter((e) => e.confidence !== "high")
            .map((e) => `${e.id} ${e.confidence}`)
            .join(" · ")}`}
        />
      </MetricRow>

      <Block
        idx="01"
        title="The ledger"
        right={
          <>
            id order, {firstId} to {lastId} - hover a row, the rest recede
            <br />
            <Conf level="high" /> primary source or two independent secondaries · <Conf level="med" /> one reputable
            secondary
          </>
        }
      >
        <Ledger label={`The exploit ledger, ${firstId} to ${lastId}`}>
          {entries.map((entry) => (
            <BewareRow entry={entry} key={entry.id} />
          ))}
        </Ledger>

        {/* The key is a method walk-through, so it collapses - and it is now
            one line per value with that value's own count, rather than four
            marks run together in a sentence. Both the values and their order
            come from `BewareRow`'s own enum map: the key and the rows were two
            sources for one four-value field, and a fifth value could have
            entered the corpus, been rendered by every row and left the legend
            still describing four. */}
        <div style={{ marginTop: 16 }}>
          <Working
            title="How to read the Detectable column"
            finding={`${DETECTABILITY_ORDER.length} values, ${entries.length} rows`}
          >
            <div className="bw-legend">
              <div>
                <b>Detectable</b> is whether exploitation would have left anything a reader of public data could find.
              </div>
              {DETECTABILITY_ORDER.map((value) => (
                <div key={value}>
                  <span className={`det ${DETECTABLE[value].cls}`}>{DETECTABLE[value].label}</span>{" "}
                  {DETECTABLE[value].what} - {entries.filter((e) => e.detectable === value).length} of {entries.length}{" "}
                  rows
                </div>
              ))}
              <div>
                The column is the corpus&apos;s own {DETECTABILITY_ORDER.length}-value field. The mockup carried a
                sentence for each row; the corpus does not, and this page does not invent one.
              </div>
            </div>
          </Working>
        </div>
      </Block>

      {b2 === undefined ? null : (
        <Block
          idx="02"
          title="The Orchard soundness flaw, in full"
          right={
            <>
              {b2.cve === undefined ? b2.id : b2.cve.join(" · ")} · CVSS 9.3
              <br />
              window {b2.window.from} &rarr; {b2.window.to}
            </>
          }
        >
          <BewareDeepDive entry={b2} steps={steps} />
        </Block>
      )}

      <Block idx="03" title="Why the residual cannot be cleared" right="the bound, not the allegation">
        <div className="grid g2">
          <Glass>
            <Eyebrow idx="the bound">what a turnstile can and cannot do</Eyebrow>
            <p className="note" style={{ marginTop: 10 }}>
              A turnstile bounds what a pool may pay out by what provably entered it. It cannot tell a forged note from
              a real one already inside the pool; it can only refuse to let the pool go negative. A pool that ran on an
              unsound circuit is therefore settled by being emptied, and by nothing else - which is why the question B1
              opened in 2016 is still open.
            </p>
            {c3 === undefined || c9 === undefined ? null : (
              <>
                <p className="note" style={{ marginTop: 12 }}>
                  Sprout has not emptied in about eight years: it still holds roughly 22,000 to 25,400 ZEC under the
                  2016 ceremony parameters. Orchard has been exit-only since 28 July 2026, and roughly 708,841 ZEC
                  remain inside it, in a pool whose supply is not yet verifiable.
                </p>
                <div className="claim">
                  <a className="anchor" href={requirePermalink(c3.id)}>
                    {c3.id}
                  </a>
                  <Cite
                    id={c3.id}
                    lastVerified={c3.lastVerified}
                    confidence={c3.confidence}
                    sources={resolveSources(c3.sources)}
                  />
                  <a className="anchor" href={requirePermalink(c9.id)}>
                    {c9.id}
                  </a>
                  <Cite
                    id={c9.id}
                    lastVerified={c9.lastVerified}
                    confidence={c9.confidence}
                    sources={resolveSources(c9.sources)}
                  />
                </div>
              </>
            )}
          </Glass>

          <Glass>
            <Eyebrow idx="what this is not">the claim is narrower than the accusation</Eyebrow>
            <p className="note" style={{ marginTop: 10 }}>
              Nothing on this page says that counterfeiting occurred. The claim is the narrower and harder one: for the
              length of two windows the property that would have ruled it out did not hold, and no analysis performed
              afterwards can restore it. The balances still sitting in those two pools are the measure of what remains
              unresolved, and this site publishes them as an open quantity rather than as an accusation.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Chip tone="danger">unprovable</Chip>
              <Chip>public aggregate</Chip>
              <Chip tone="ok">no identity claim</Chip>
            </div>
            <p className="note" style={{ marginTop: 14 }}>
              {contradictions.length} marketing claims are set against the same record on{" "}
              <a href="/contradictions">Contradictions</a>, and the same events sit on one axis with the funding and
              governance strands on <a href="/timeline">the timeline</a>.
            </p>
          </Glass>
        </div>
      </Block>
    </>
  );
}
