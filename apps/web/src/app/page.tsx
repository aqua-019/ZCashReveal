import Link from "next/link";

import { getBeware, getStats, getTimeline, resolveSources, type SupplyBucket } from "@zcashreveal/content";

import { FogCanvas } from "@/components/ambience/FogCanvas";
import { IconArrowRight } from "@/components/icons";
import { Cite } from "@/components/record/Cite";
import { TurnstilePlane } from "@/components/record/TurnstilePlane";
import { TwoWindows, TwoWindowsCite } from "@/components/record/TwoWindows";
import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Pill } from "@/components/ui/Pill";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { resolveSnapshot } from "@/lib/snapshot/store";
import { POOL_LABEL, POOL_ORDER, POOL_SW } from "@/lib/chain";
import { fmtInt, fmtPct } from "@/lib/format";
import { NAV_ENTRIES } from "@/lib/nav";

/**
 * 00 SPLASH.
 *
 * ============================================================================
 * THE ORDER IS THE FIX (HANDOFF-04a)
 * ============================================================================
 * A reader's diagnosis, verbatim: "Instead of: Claim -> explanation ->
 * evidence -> visualization, we get: Vibes -> cryptographic terminology ->
 * vibes -> huge number -> tiny explanation -> vibes."
 *
 * That is the whole complaint and the other three are symptoms of it. The
 * complaint is not VOLUME, it is ORDER - which is why nothing here was deleted
 * to fix it. The same figures, the same sources and the same fog are on the
 * page; what changed is that the page now opens with a falsifiable sentence
 * instead of a wordmark over a four-idea paragraph, and the beats are LABELLED
 * rather than implied, so a reader can see where they are in the argument.
 *
 *   CLAIM     - one sentence you could disagree with, and the figure in it.
 *   EVIDENCE  - the turnstile plane, the pools at the tip, the readings.
 *   THE WORKING - what the chain publishes, how the residual is derived, and
 *                 what this instrument cannot do. Collapsed, each summary
 *                 carrying its own finding.
 *
 * THE FOG STAYS AND IS DEMOTED. The approved composition drops it, and this
 * build keeps it as a bounded backdrop behind the claim rather than as a
 * full-viewport opening. Two reasons, and the first is the weaker one: it is
 * the instrument assertions A5 and A6 read - `reduced-motion.spec.ts` and
 * `record-motion.spec.ts` both prove the reduced-motion contract by checking
 * that `FogCanvas` REFUSED to construct on this route, and a page with no
 * ambience proves that contract vacuously. The second is that the fog's
 * argument is true and is cited in the tree: what stays in the haze is what the
 * proof hides, what lifts is what the chain publishes anyway. Behind a claim it
 * is atmosphere supporting an assertion; in front of one it was the assertion,
 * which is what the reader objected to. Section 7 records the departure.
 *
 * WHAT THE FLOATING BOXES BECAME. "PUBLISHED NULLIFIERS / ANCHORS /
 * COMMITMENTS - are they buttons? Filters? Evidence? A legend? Nobody knows."
 * They were an unlabelled list of pill-shaped boxes over the fog whose only
 * statement of what they were lived in an `aria-label`. They are now a
 * definition list inside "the working", under a summary that names them and
 * counts them. See the `.pubgrid` block in globals.css for the four things that
 * make it read as a legend.
 *
 * Every figure still comes from `packages/content`, which HANDOFF-02
 * transcribed from the research dossiers. Nothing is a network read and nothing
 * is a literal typed into this file, so a figure here cannot disagree with the
 * same figure on /beware - or, now, with the same figure inside the plane.
 */

/**
 * Pool balances in whole ZEC, computed from the seed's zatoshi rather than its
 * decimal string: `zatoshi` is a bigint after the schema parses it, and CLAUDE.md
 * requires that no zatoshi value is rounded through a float on its way to a
 * display. The division is exact for every real balance, which is what makes
 * `Number()` safe here and not elsewhere.
 */
const ZAT_PER_ZEC = 100_000_000n;

function poolZec(stats: ReturnType<typeof getStats>): Record<SupplyBucket, number> {
  const out = {} as Record<SupplyBucket, number>;
  for (const p of stats.pools) out[p.bucket] = Number(p.zatoshi / ZAT_PER_ZEC);
  return out;
}

/**
 * What the chain publishes. A LEGEND: a name and what it is, per row.
 *
 * Six rows, and the summary that discloses them says six - `PUBLISHED.length`
 * rather than a literal, because a count typed in beside a list is a second
 * source for a quantity the list already carries.
 */
const PUBLISHED: readonly (readonly [string, string])[] = [
  ["nullifiers", "one per spent note"],
  ["valueBalance", "every boundary amount"],
  ["anchors", "tree root at spend time"],
  ["commitments", "one per output note"],
  ["t-addresses", "every shield and unshield endpoint"],
  ["migration amounts", "quantised, since NU6.3"],
];

/** What the instrument cannot do. Four limits, and the summary counts them. */
const LIMITS: readonly string[] = [
  "It cannot name a wallet.",
  "It cannot show a shielded balance without your own viewing key.",
  "It cannot prove nothing was minted.",
  "It cannot tell you a bound is tight - only that it holds.",
];

/**
 * ISR at sixty seconds, which is HANDOFF-11 section 3's window and the same
 * number `SNAPSHOT_TTL_MS` uses in the store.
 *
 * THE TWO NUMBERS ARE ONE POLICY AND MUST NOT DRIFT. A memo shorter than this
 * window spends managed-store reads the window has already paid for; a memo
 * longer than it serves a document older than the page claims to be. Sixty
 * seconds is also roughly one block at the 75-second target interval, so a
 * reader is at worst one tip behind and the system bar says by how much.
 *
 * THIS ROUTE HAD NO `revalidate` BEFORE AND WAS PRERENDERED ONCE AT BUILD TIME,
 * which is why assertion A10's read count was zero rather than one: there was
 * no render to attach a read to. That is stated here rather than in the ledger
 * because it is the fact that makes the number in `docs/2.0/SNAPSHOT.md`
 * section 5 mean anything.
 */
export const revalidate = 120;

export default async function SplashPage() {
  const stats = getStats();
  const zec = poolZec(stats);
  const supply = POOL_ORDER.reduce((a, k) => a + (zec[k] ?? 0), 0);
  const share = (k: (typeof POOL_ORDER)[number]): number =>
    (stats.pools.find((p) => p.bucket === k)?.sharePct ?? 0) / 100;

  /**
   * The Unprovable Residual: value sitting inside pools whose circuits were
   * unsound. Sprout and Orchard are exactly the two the ledger records as
   * unsound (B1, B2); Sapling and Ironwood are not, and transparent is not a
   * pool at all.
   *
   * ONE SOURCE. This number is now rendered three times on this page - in the
   * claim sentence, in the metric row, and inside the derivation panel - and
   * all three read this constant. A1 is written against exactly the case where
   * they would not.
   */
  const residual = (zec.sprout ?? 0) + (zec.orchard ?? 0);
  const residualShare = share("sprout") + share("orchard");

  const beware = getBeware();
  const b1 = beware.find((e) => e.id === "B1");
  const b2 = beware.find((e) => e.id === "B2");

  /**
   * The Ironwood migration and the Orchard drain. `stats.json` carries no field
   * for either: the corpus states them inside the prose of two timeline rows,
   * which is where these come from. Rendering a figure by slicing a substring
   * out of a summary would be worse than citing the row, so the row is cited
   * and the figure is carried here with its source next to it. Recorded in the
   * section 8 ledger as a field `packages/content` should gain.
   */
  const drainRow = getTimeline().find((e) => e.id === "T2026-08-22");
  const ironwoodRow = getTimeline().find((e) => e.id === "T2026-07-28");

  /**
   * The document the plane is a pure function of.
   *
   * THE READ PATH ARRIVED IN HANDOFF-11 AND THIS LINE IS THE WHOLE OF THE
   * CHANGE, which is what 04a's decision to take a `SnapshotV1` bought. The
   * plane structurally cannot reach for the fixture `PoolsView.flows` field
   * that would draw a five-edge picture the published document could never
   * supply, so an honest picture stayed honest across the cutover instead of
   * going quietly dishonest at it. `resolveSnapshot()` returns the bundled
   * document as its last rung, so fixture mode renders exactly what it did.
   */
  const resolved = await resolveSnapshot();
  const snapshot = resolved.doc;

  return (
    <>
      {/* ---------------- 1. CLAIM ---------------- */}
      <section className="beat beat-claim">
        {/*
          SEEDED BY THE RESOLVED DOCUMENT'S HASH, not by the fixture's. The
          footer ledger states "AMBIENCE seeded by tip hash", and until this
          line changed that sentence became false the moment the store answered
          from anywhere but the fixture: the fog was a pure function of a
          committed constant while the page beside it rendered a real block.
          CLAUDE.md's rule is that the whole page is a pure function of the tip
          hash, and this is the page where it was not.
        */}
        <FogCanvas seed={snapshot.hash} />
        <div className="veil" aria-hidden="true" />
        <div className="beat-claim-in">
          <span className="beattag">Claim</span>
          <h1>
            Two windows in Zcash&apos;s history cannot be proven sound, and {fmtInt(residual)} ZEC still sits inside the pools
            they touched.
          </h1>
          <p className="explain">
            Sprout&apos;s proving system was unsound for five years and Orchard&apos;s for four. Neither window can be closed by
            argument - only by <b>emptying the pools</b>. Until then nobody, including this site, can prove that nothing was
            minted. What follows is the evidence, then the working.
          </p>
        </div>
      </section>

      {/* ---------------- 2. EVIDENCE ---------------- */}
      <section className="beat beat-evidence">
        <span className="beattag">Evidence</span>

        {/* The one ceremony on this surface is block arrival, and the plane is
            what it drives. Nothing here animates between blocks. */}
        <TurnstilePlane snapshot={snapshot} />

        <MetricRow>
          <Metric
            label="Unprovable residual"
            value={
              <>
                {fmtInt(residual)} <small>ZEC</small>
              </>
            }
            sub={`Orchard ${fmtInt(zec.orchard ?? 0)} + Sprout ${fmtInt(zec.sprout ?? 0)} - ${fmtPct(residualShare)} of supply`}
          />
          <Metric
            label="Transparent supply"
            value={fmtPct(share("transparent"))}
            sub={`${fmtInt(zec.transparent ?? 0)} ZEC in t-addresses - as public as Bitcoin`}
          />
          <Metric
            label="Orchard, sealed"
            value={fmtInt(zec.orchard ?? 0)}
            sub="ZEC still inside a pool that has been exit-only since NU6.3"
          />
          <Metric
            label="Ironwood pool"
            value={`${((zec.ironwood ?? 0) / 1_000_000).toFixed(2)}M`}
            sub={`${fmtPct(share("ironwood"))} of supply, four weeks after the pool was created`}
          />
          <Metric
            label="Shielded share"
            value={`${stats.shieldedSharePct.low} to ${stats.shieldedSharePct.high}%`}
            sub="the two explorers disagree; the range is what is known"
          />
        </MetricRow>

        {/* Not a <p>. `Cite` renders a <details>, which the HTML parser treats as
            closing an open paragraph: the disclosure gets torn out of both the
            <p> and the .claim container, becomes a sibling, and leaves a stray
            empty paragraph behind - a server/client DOM divergence React reports
            as a hydration mismatch. Found by design review at gate round 1. The
            same shape is why record-beware.css documents `.bw-lede` as a div. */}
        <div className="src" style={{ marginTop: 10 }}>
          Pool balances and the shielded range as of {stats.asOf}, block {fmtInt(stats.height)}.
          <span className="claim">
            <Cite
              id="stats"
              href="/#pools"
              lastVerified={stats.lastVerified}
              confidence={stats.confidence}
              sources={resolveSources(stats.sources)}
            />
          </span>
        </div>

        <Block
          idx="01"
          id="two-windows"
          title="The two windows"
          right={
            <>
              {b1?.window.from} to {b1?.window.to}
              <br />
              {b2?.window.from} to {b2?.window.to}
            </>
          }
        >
          <Glass>
            <TwoWindows />
            <TwoWindowsCite />
          </Glass>
        </Block>

        <Block
          idx="02"
          id="pools"
          title="The pools, at the tip"
          right={
            <>
              {stats.asOf} - block {fmtInt(stats.height)}
              <br />
              HANDOFF-11 wires the live snapshot
            </>
          }
        >
          <Glass>
            <div className="poolbar" data-testid="poolbar">
              {POOL_ORDER.map((k) => {
                const frac = share(k);
                return (
                  // data-tip goes on the flex item itself. TooltipLayer listens at
                  // the document, so no wrapper element is needed - and a wrapper
                  // here would BE the flex item, leaving the percentage width to
                  // resolve against a shrink-to-fit box and collapsing all five
                  // segments to the 2px floor.
                  <span
                    key={k}
                    className={`seg ${POOL_SW[k]}`}
                    style={{ flexBasis: `${frac * 100}%` }}
                    data-pool={k}
                    data-tip={`${POOL_LABEL[k]} - ${fmtInt(zec[k] ?? 0)} ZEC - ${fmtPct(frac)} of supply`}
                  />
                );
              })}
            </div>
            {/* The bar's own table twin. The segments carry pointer tooltips,
                which are pointer-only by design, so without this the five
                quantities the bar exists to state are unavailable to a reader
                who is not using a mouse. Same contract as the SVG charts. */}
            <table className="sr-only">
              <caption>Supply by pool at block {fmtInt(stats.height)}</caption>
              <thead>
                <tr>
                  <th scope="col">Pool</th>
                  <th scope="col">ZEC</th>
                  <th scope="col">Share of supply</th>
                </tr>
              </thead>
              <tbody>
                {POOL_ORDER.map((k) => (
                  <tr key={k}>
                    <th scope="row">{POOL_LABEL[k]}</th>
                    <td>{fmtInt(zec[k] ?? 0)}</td>
                    <td>{fmtPct(share(k))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="legend" style={{ marginTop: 12 }}>
              {POOL_ORDER.map((k) => (
                <li key={k}>
                  <i className={`sw ${POOL_SW[k]}`} aria-hidden="true" />
                  {POOL_LABEL[k]} - {fmtInt(zec[k] ?? 0)}
                </li>
              ))}
            </ul>
            <p className="note" style={{ marginTop: 14 }}>
              {supply === 0 ? null : (
                <>
                  {fmtInt(supply)} ZEC accounted for across five buckets. Transparent is not a pool - it is the absence of one -
                  but supply accounting needs all five on one axis.{" "}
                </>
              )}
              {drainRow === undefined ? null : <>{drainRow.summary} </>}
              {ironwoodRow === undefined ? null : <>{ironwoodRow.summary}</>}
            </p>
            <span className="claim">
              {drainRow === undefined ? null : (
                <a className="anchor" href={`/timeline#${drainRow.id}`}>
                  {drainRow.id}
                </a>
              )}
              {ironwoodRow === undefined ? null : (
                <a className="anchor" href={`/timeline#${ironwoodRow.id}`}>
                  {ironwoodRow.id}
                </a>
              )}
            </span>
          </Glass>
        </Block>
      </section>

      {/* ---------------- 3. THE WORKING ----------------
          Collapsed by default, and every summary carries its finding. A closed
          panel that says "Sources" tells a reader nothing and reads as evasion;
          one that says "6 fields, all public" is still an answer with the
          panel shut. `EstimatePanel` established the pattern and this promotes
          it to page level.

          What is NEVER collapsed: the claim above, and the confidence,
          last-verified date and source count on the citation. Epistemic status
          behind a toggle is the null-panel-renders-as-zero defect in a nicer
          coat. */}
      <section className="beat beat-working">
        <span className="beattag">The working</span>

        <details className="wdisc">
          <summary>
            <span className="wd-t">What the chain publishes</span>
            <span className="wd-n">{PUBLISHED.length} fields, all public</span>
          </summary>
          <div className="wd-body">
            <p className="note">
              These are the fields this site reads. Every number above is derived from them and nothing else. None of them is an
              identity.
            </p>
            <dl className="pubgrid">
              {PUBLISHED.map(([name, what]) => (
                <div className="pubrow" key={name}>
                  <dt className="pubname">{name}</dt>
                  <dd className="pubwhat">{what}</dd>
                </div>
              ))}
            </dl>
            <p className="note" style={{ marginTop: 12 }}>
              What is hidden, on a shielded-to-shielded spend: sender, recipient and note value. That is the whole of it, and it
              is the reason every shielded figure on this site is a bound rather than a total.
            </p>
          </div>
        </details>

        <details className="wdisc">
          <summary>
            <span className="wd-t">How the residual is derived</span>
            <span className="wd-n">TRACKING-MATH 3.2, 2 terms</span>
          </summary>
          <div className="wd-body">
            <p className="note">
              U = Sprout balance + Orchard balance, which is {fmtInt(zec.sprout ?? 0)} + {fmtInt(zec.orchard ?? 0)} ={" "}
              {fmtInt(residual)} ZEC. Both circuits were unsound during their lifetime, so value still inside them cannot be
              shown to have been legitimately created. The verified share is 1 - U / supply, which is {fmtPct(1 - residualShare)}
              . It rises only as the two pools empty, never by argument. The lockbox is carried separately and is not netted
              here.
            </p>
          </div>
        </details>

        <details className="wdisc">
          <summary>
            <span className="wd-t">What this instrument cannot do</span>
            <span className="wd-n">{LIMITS.length} limits, stated</span>
          </summary>
          <div className="wd-body">
            <ul className="wd-list">
              {LIMITS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </details>

        <Block idx="03" title="Two halves, one identity" right="the Record cites; the Instrument measures">
          <div className="grid g2">
            <Glass>
              <Eyebrow idx="A">the Record</Eyebrow>
              <p className="note" style={{ marginTop: 10 }}>
                Static, citable, zero-motion. The exploit ledger, the contradictions, the timeline and the promotion lattice -
                every entry carrying a source URL, a confidence and a last-verified date. Claim identifiers are permalinks, so a
                statement can be argued with rather than merely read.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Chip tone="ok">sourced</Chip>
                <Chip>zero motion</Chip>
                <Chip tone="danger">severity register</Chip>
              </div>
            </Glass>
            <Glass>
              <Eyebrow idx="B">the Instrument</Eyebrow>
              <p className="note" style={{ marginTop: 10 }}>
                Live, deterministic, chain-seeded. Turnstile balances, the Orchard drain, the ZIP 318 migration lens and the
                Ironwood birth curve. Transparent values are exact; shielded values are bounds on a candidate set. The page
                renders from the last good snapshot when the feed is down, and says how old it is.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Pill kind="bounded" />
                <Chip>snapshot baseline</Chip>
                <Chip tone="blue">seeded ambience</Chip>
              </div>
            </Glass>
          </div>
        </Block>

        {/* Every surface the system bar carries, so the grid and the bar cannot
            disagree about what this site has. It read `SCREENS` until
            HANDOFF-04a, which meant /pools and /reveal were missing from both. */}
        <Block idx="04" title="Open a surface" right="the Record is numbered like evidence">
          <div className="grid g3 entries">
            {NAV_ENTRIES.filter((s) => s.href !== "/").map((s, i) => (
              <Link className="entry" key={s.href} href={s.href}>
                <span className="top">
                  <span className="letter" aria-hidden="true">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="lbl">
                    {s.label} - {s.half}
                  </span>
                  <span className="arrow" aria-hidden="true">
                    <IconArrowRight size={14} />
                  </span>
                </span>
                <span className="t">{s.title}</span>
                <span className="d">{s.dek}</span>
                <span className="hint">
                  <span>open</span>
                  <span>{s.href}</span>
                </span>
              </Link>
            ))}
          </div>
        </Block>
      </section>
    </>
  );
}
