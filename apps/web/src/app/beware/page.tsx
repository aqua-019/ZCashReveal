import type { Metadata } from "next";

import { getBeware, getContradictions, getTimeline, requirePermalink, resolveSources } from "@zcashreveal/content";

import { BewareDeepDive } from "@/components/record/BewareDeepDive";
import { BewareRow } from "@/components/record/BewareRow";
import { Cite } from "@/components/record/Cite";
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

  return (
    <>
      <RecordHead
        idx="01 LEDGER"
        kicker="the exploit record - zero motion - every row sourced"
        title="Beware: what the proof could not"
        titleAccent="prove"
        dek={
          <>
            {entries.length} entries, in the order the corpus numbers them. Two are windows in which the shielded
            circuits were unsound and counterfeiting was possible without limit, and{" "}
            <b>neither can be cleared after the fact</b>: a zero-knowledge pool hides a forged note exactly as well as
            it hides a legitimate one. The rest are the side-channels, the spam, the 5.7 years in which Sprout proofs
            went unverified, the turnstile that could be silently switched off, and the two ceremonies the oldest pools
            still rest on.
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

      {c2 === undefined ? null : (
        <div className="bw-lede">
          <p className="note measure">
            The two windows are B1 and B2. The corpus states their combined span as an approximation rather than as a
            count of days: they <b>span roughly six of the chain&apos;s ~9.8 years</b>, and nothing computed
            afterwards narrows that span.
          </p>
          <span className="claim">
            <a className="anchor" href={requirePermalink(c2.id)}>
              {c2.id}
            </a>
            <Cite
              id={c2.id}
              lastVerified={c2.lastVerified}
              confidence={c2.confidence}
              sources={resolveSources(c2.sources)}
            />
            <span className="src">last verified {c2.lastVerified}</span>
          </span>
        </div>
      )}

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
        <Metric
          label="Never detectable"
          value={`${undetectable.length} of ${entries.length}`}
          sub={`${undetectable.map((e) => e.id).join(" · ")} - no trace in public data`}
          accent
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

      <p className="note measure" style={{ marginTop: 10 }}>
        The four figures above are counted from the fourteen rows below, not asserted separately. Strike a row you do
        not accept and the counts move with it.
      </p>

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

        <div className="bw-legend">
          <div>
            <b>Detectable</b> is whether exploitation would have left anything a reader of public data could find.{" "}
            <span className="det yes">YES</span> it would show on-chain · <span className="det no">NO</span> no trace a
            reader could find · <span className="det part">PARTIAL</span> a trace only in part, or only for some
            observers · <span className="det bw-na">N/A</span> not a question this entry answers; the row says why.
          </div>
          <div>
            The column is the corpus&apos;s own four-value field. The mockup carried a sentence for each row; the corpus
            does not, and this page does not invent one.
          </div>
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
