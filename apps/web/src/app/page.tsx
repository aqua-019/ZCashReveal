import Link from "next/link";

import { FogCanvas } from "@/components/ambience/FogCanvas";
import { IconArrowRight } from "@/components/icons";
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
 * Every number below is the committed fixture from docs/2.0 (22 Aug 2026), not
 * a live read - HANDOFF-01 makes no network calls. HANDOFF-11 swaps the source
 * and the markup does not change.
 */

/** Pool balances in whole ZEC, from RESEARCH-2026-08-DOSSIER.md via the mockup. */
const POOL_ZEC: Record<(typeof POOL_ORDER)[number], number> = {
  transparent: 12_500_223,
  sprout: 22_621,
  sapling: 529_015,
  orchard: 708_841,
  ironwood: 3_129_287,
};

const SUPPLY = POOL_ORDER.reduce((a, k) => a + POOL_ZEC[k], 0);

/** The Unprovable Residual: value inside pools whose circuits were unsound. */
const RESIDUAL = POOL_ZEC.sprout + POOL_ZEC.orchard;

const PUBLISHED: readonly string[] = [
  "nullifiers - one per spent note",
  "valueBalance - every boundary amount",
  "anchors - tree root at spend time",
  "commitments - one per output note",
  "t-addresses - every shield and unshield endpoint",
  "migration amounts - quantised, since NU6.3",
];

export default function SplashPage() {
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
              {fmtInt(RESIDUAL)} <small>ZEC</small>
            </>
          }
          sub={`Orchard ${fmtInt(POOL_ZEC.orchard)} + Sprout ${fmtInt(POOL_ZEC.sprout)} - ${fmtPct(RESIDUAL / SUPPLY)} of supply`}
          accent
        />
        <Metric
          label="Transparent supply"
          value={fmtPct(POOL_ZEC.transparent / SUPPLY)}
          sub={`${fmtInt(POOL_ZEC.transparent)} ZEC in t-addresses - as public as Bitcoin`}
        />
        <Metric label="Orchard drain" value="80.6%" sub="exit-only since 3,428,143" />
        <Metric label="Ironwood pool" value="3.13M" sub={`born 28 Jul 2026 at zero - ${fmtPct(POOL_ZEC.ironwood / SUPPLY)} of supply`} />
        <Metric label="Chain life unsound" value="61%" sub="about 6.0 of 9.8 years - Sprout 2016-18, Orchard 2022-26" />
      </MetricRow>

      <Block
        idx="01"
        title="The pools, at the tip"
        right={
          <>
            fixture data - HANDOFF-11
            <br />
            wires the live snapshot
          </>
        }
      >
        <Glass>
          <div className="poolbar" data-testid="poolbar">
            {POOL_ORDER.map((k) => {
              const share = POOL_ZEC[k] / SUPPLY;
              return (
                // data-tip goes on the flex item itself. TooltipLayer listens at
                // the document, so no wrapper element is needed - and a wrapper
                // here would BE the flex item, leaving the percentage width to
                // resolve against a shrink-to-fit box and collapsing all five
                // segments to the 2px floor.
                <span
                  key={k}
                  className={`seg ${POOL_SW[k]}`}
                  style={{ flexBasis: `${share * 100}%` }}
                  data-pool={k}
                  data-tip={`${POOL_LABEL[k]} - ${fmtInt(POOL_ZEC[k])} ZEC - ${fmtPct(share)} of supply`}
                />
              );
            })}
          </div>
          <ul className="legend" style={{ marginTop: 12 }}>
            {POOL_ORDER.map((k) => (
              <li key={k}>
                <i className={`sw ${POOL_SW[k]}`} aria-hidden="true" />
                {POOL_LABEL[k]} - {fmtInt(POOL_ZEC[k])}
              </li>
            ))}
          </ul>
        </Glass>
      </Block>

      <Block idx="02" title="Two halves, one identity" right="the Record cites; the Instrument measures">
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

      <Block idx="03" title="Open a surface" right="the Record is numbered like evidence">
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
