import Link from "next/link";

import { getBeware, getStats, getTimeline, resolveSources, type SupplyBucket } from "@zcashreveal/content";

import { FogCanvas } from "@/components/ambience/FogCanvas";
import { IconArrowRight } from "@/components/icons";
import { Cite } from "@/components/record/Cite";
import { TwoWindows, TwoWindowsCite } from "@/components/record/TwoWindows";
import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Pill } from "@/components/ui/Pill";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { FIXTURE_TIP, POOL_LABEL, POOL_ORDER, POOL_SW } from "@/lib/chain";
import { fmtInt, fmtPct } from "@/lib/format";
import { SCREENS } from "@/lib/nav";

/**
 * 00 SPLASH.
 *
 * The one surface that carries the fog: the field is the argument. Motes that
 * stay in the haze are what the proof hides; the gold ones that lift are what
 * the chain publishes regardless.
 *
 * Every figure comes from `packages/content`, which HANDOFF-02 transcribed from
 * the research dossiers: `stats.json` for the pools and the market, and the
 * `B1`/`B2`/`C2` claims for the two windows. Nothing is a network read -
 * HANDOFF-11 swaps the source and the markup does not change - and nothing is a
 * literal typed into this file, so a figure here cannot disagree with the same
 * figure on /beware.
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

const PUBLISHED: readonly string[] = [
  "nullifiers - one per spent note",
  "valueBalance - every boundary amount",
  "anchors - tree root at spend time",
  "commitments - one per output note",
  "t-addresses - every shield and unshield endpoint",
  "migration amounts - quantised, since NU6.3",
];

export default function SplashPage() {
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

  return (
    <>
      <div className="hero">
        <FogCanvas seed={FIXTURE_TIP.hash} />
        <div className="veil" aria-hidden="true" />

        <ul className="leaks" aria-label="What the chain publishes versus what the proof hides">
          {PUBLISHED.map((line) => (
            <li className="leak" key={line}>
              <span className="k">published</span>
              {line}
            </li>
          ))}
          <li className="leak">
            <span className="off">hidden</span>
            sender, recipient, note value (z to z only)
          </li>
        </ul>

        <div className="over">
          <Eyebrow idx="00 SYSTEM">shielded-pool forensics - public data only</Eyebrow>
          <h1>
            ZCash<em>Reveal</em>
          </h1>
          <p className="sub">
            A public instrument for the <b>turnstile</b> - the boundary where shielded value enters and leaves - and a public
            record of the <b>two windows</b> in which Zcash&apos;s circuits were unsound and nobody can prove nothing was minted.
            Nullifiers, anchors, commitments, boundary amounts, migration denominations and anonymity-set bounds: rendered as
            data, never as identity.
          </p>
        </div>
      </div>

      <MetricRow>
        <Metric
          label="Unprovable residual"
          value={
            <>
              {fmtInt(residual)} <small>ZEC</small>
            </>
          }
          sub={`Orchard ${fmtInt(zec.orchard ?? 0)} + Sprout ${fmtInt(zec.sprout ?? 0)} - ${fmtPct(residualShare)} of supply`}
          accent
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

      <p className="src" style={{ marginTop: 10 }}>
        Pool balances and the shielded range as of {stats.asOf}, block {fmtInt(stats.height)}.{" "}
        <span className="claim" style={{ display: "inline-flex", marginTop: 0 }}>
          <Cite
            id="stats"
            href="/#pools"
            lastVerified={stats.lastVerified}
            confidence={stats.confidence}
            sources={resolveSources(stats.sources)}
          />
        </span>
      </p>

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

      <Block idx="03" title="Two halves, one identity" right="the Record cites; the Instrument measures">
        <div className="grid g2">
          <Glass>
            <Eyebrow idx="A">the Record</Eyebrow>
            <p className="note" style={{ marginTop: 10 }}>
              Static, citable, zero-motion. The exploit ledger, the contradictions, the timeline and the promotion lattice - every
              entry carrying a source URL, a confidence and a last-verified date. Claim identifiers are permalinks, so a
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
              Ironwood birth curve. Transparent values are exact; shielded values are bounds on a candidate set. The page renders
              from the last good snapshot when the feed is down, and says how old it is.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Pill kind="bounded" />
              <Chip>snapshot baseline</Chip>
              <Chip tone="blue">seeded ambience</Chip>
            </div>
          </Glass>
        </div>
      </Block>

      <Block idx="04" title="Open a surface" right="the Record is numbered like evidence">
        <div className="grid g3 entries">
          {SCREENS.filter((s) => s.href !== "/").map((s, i) => (
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
    </>
  );
}
