import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Tide } from "@/components/ambience/Tide";
import { FogCanvas } from "@/components/ambience/FogCanvas";
import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Conf } from "@/components/ui/Conf";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EpochClock } from "@/components/ui/EpochClock";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { InferenceChain } from "@/components/ui/InferenceChain";
import { KV } from "@/components/ui/KV";
import { Ledger, LedgerRow } from "@/components/ui/LedgerRow";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { Pill } from "@/components/ui/Pill";
import { Quote } from "@/components/ui/Quote";
import { Reason } from "@/components/ui/Reason";
import { ScreenNav } from "@/components/ui/ScreenNav";
import { SearchBar } from "@/components/ui/SearchBar";
import { SubNav } from "@/components/ui/SubNav";
import { Tooltip } from "@/components/ui/Tooltip";
import { FIXTURE_TIP, POOL_LABEL, POOL_ORDER, POOL_VAR } from "@/lib/chain";
import { DEV_SURFACES } from "@/lib/env";
import { fmtInt, shortHex, zatToZecGrouped } from "@/lib/format";

export const metadata: Metadata = {
  title: "Primitives",
  description: "Development-only gallery of the ZEC Forensic primitive set.",
  robots: { index: false, follow: false },
};

/**
 * The primitives gallery.
 *
 * Development-only, and the gate fails closed: reachable in `next dev`, and in
 * a production build only when NEXT_PUBLIC_ENABLE_DEV_SURFACES=1. The single
 * place that variable is ever set is apps/web/playwright.config.ts, so the
 * assertions run against shipped output rather than a dev bundle. A deployed
 * site never sets it and this route returns 404 whatever NEXT_PUBLIC_DATA_MODE
 * says - see src/lib/env.ts and docs/2.0/DEPLOY-2.0.md.
 *
 * Every primitive in the HANDOFF-01 deliverables appears here at least once,
 * with every variant of the ones that have variants. Assertion A4 walks the
 * data-primitive attributes; keeping the gallery complete is therefore not a
 * courtesy to reviewers, it is what makes the assertion meaningful.
 */

interface Row {
  readonly pool: string;
  readonly delta: bigint;
  readonly height: number;
}

const ROWS: readonly Row[] = [
  { pool: "orchard", delta: -125_000_000_000n, height: 3_456_801 },
  { pool: "ironwood", delta: 125_000_000_000n, height: 3_456_801 },
  { pool: "sapling", delta: -4_250_000_000n, height: 3_456_799 },
];

const COLUMNS: readonly Column<Row>[] = [
  { key: "pool", head: "pool", mono: true, cell: (r) => r.pool },
  { key: "delta", head: "boundary delta (ZEC)", mono: true, cell: (r) => zatToZecGrouped(r.delta) },
  { key: "height", head: "height", mono: true, cell: (r) => fmtInt(r.height) },
];

export default function PrimitivesPage() {
  if (!DEV_SURFACES) notFound();

  return (
    <div className="gallery">
      <Eyebrow idx="DEV">primitive gallery - not part of the public site</Eyebrow>
      <h1 className="display" style={{ fontSize: 44, marginTop: 10 }}>
        ZEC Forensic primitives
      </h1>
      <p className="note measure">
        Every component in the HANDOFF-01 deliverable list, with each variant. This route exists only where DEV_SURFACES is
        true; a deployed site returns 404 here.
      </p>

      <Block idx="G1" title="Shell" right="SysBar, ScreenNav, EpochClock">
        <div className="spec">
          <Eyebrow idx="SysBar">the bar at the top of this page is the instance</Eyebrow>
          <p className="note">
            SysBar is a shell singleton and is not remounted here. A second one would put a second role=&quot;banner&quot; landmark
            inside &lt;main&gt;, which is an accessibility defect rather than a demonstration.
          </p>
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="ScreenNav">hover the group: siblings dim, nothing transforms</Eyebrow>
          <ScreenNav ariaLabel="Screens (gallery sample)" />
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="EpochClock">height advances on block arrival, reduced motion or not</Eyebrow>
          <EpochClock tip={FIXTURE_TIP} />
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="SubNav">second level, gold rule instead of a fill</Eyebrow>
          <SubNav
            label="Gallery sub navigation"
            path="/dev/primitives"
            items={[
              { href: "/dev/primitives", label: "Primitives" },
              { href: "/track", label: "Track" },
            ]}
          />
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="SearchBar">classifies the query shape; submission is inert until HANDOFF-04</Eyebrow>
          <SearchBar />
        </div>
      </Block>

      <Block idx="G2" title="Surfaces" right="Glass, Block, Metric">
        <div className="grid g2">
          <Glass>
            <Eyebrow idx="Glass">padded card over the grain</Eyebrow>
            <p className="note" style={{ marginTop: 8 }}>
              Gradient panel, hairline border, blurred backdrop.
            </p>
          </Glass>
          <Glass padded={false}>
            <div style={{ padding: "18px 20px" }}>
              <Eyebrow idx="Glass">unpadded, for a child that owns its inset</Eyebrow>
            </div>
          </Glass>
        </div>
        <MetricRow>
          <Metric label="Metric - default" value={fmtInt(3_129_287)} sub="ZEC in Ironwood" />
          <Metric label="Metric - accent" value={fmtInt(731_462)} sub="the unprovable residual" accent />
          <Metric label="Metric - no sub" value="4" />
        </MetricRow>
      </Block>

      <Block idx="G3" title="Tags" right="Chip, Conf, Pill - every variant">
        <div className="spec">
          <Eyebrow idx="Chip">neutral, gold, danger, ok, blue</Eyebrow>
          <div className="row">
            <Chip>neutral</Chip>
            <Chip tone="gold">gold</Chip>
            <Chip tone="danger">danger</Chip>
            <Chip tone="ok">ok</Chip>
            <Chip tone="blue">blue</Chip>
          </div>
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="Conf">high, med, low</Eyebrow>
          <div className="row">
            <Conf level="high" />
            <Conf level="med" />
            <Conf level="low" />
          </div>
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="Pill">exact, bounded, label, undefined</Eyebrow>
          <div className="row">
            <Pill kind="exact" />
            <Pill kind="bounded" />
            <Pill kind="label" />
            <Pill kind="undefined" />
          </div>
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="Tooltip">one shared layer, following the pointer</Eyebrow>
          <div className="row">
            {POOL_ORDER.map((k) => (
              <Tooltip key={k} text={`${POOL_LABEL[k]} - hover text comes from data-tip on this element`}>
                <span className="chip">
                  <i className="sw" style={{ background: `var(${POOL_VAR[k]})` }} aria-hidden="true" />
                  {POOL_LABEL[k]}
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      </Block>

      <Block idx="G4" title="Data" right="KV, DataTable, LedgerRow">
        <div className="grid g2">
          <Glass>
            <Eyebrow idx="KV">two column</Eyebrow>
            <div style={{ marginTop: 10 }}>
              <KV
                entries={[
                  { k: "tip height", v: fmtInt(FIXTURE_TIP.height) },
                  { k: "tip hash", v: shortHex(FIXTURE_TIP.hash, 8, 6) },
                  { k: "snapshot age", v: "0 blocks" },
                ]}
              />
            </div>
          </Glass>
          <Glass>
            <Eyebrow idx="KV">stacked, for narrow panels</Eyebrow>
            <div style={{ marginTop: 10 }}>
              <KV
                stack
                entries={[
                  { k: "anchor", v: shortHex("2f8e1c5b9a7d3e04f6b2c8a1d5e7930bf4a6c2e8d1b7f3a9e5c1d7b3f9a5e2c8", 10, 8) },
                  { k: "claim level", v: "broad_candidate_set" },
                ]}
              />
            </div>
          </Glass>
        </div>

        <div style={{ marginTop: 14 }}>
          <DataTable caption="DataTable - owns its horizontal scroll" columns={COLUMNS} rows={ROWS} rowKey={(r, i) => `${r.pool}-${i}`} />
        </div>

        <div style={{ marginTop: 14 }}>
          <Ledger label="LedgerRow variants">
            <LedgerRow
              id="G1"
              severity="crit"
              name="LedgerRow - critical"
              sub="the danger rule runs down the left edge"
              window="an interval"
              dates="the dates below it, dimmed"
              cause="The root-cause column. Hidden below 1000px; the window above is not."
              discoveredBy="who found it · and who confirmed it"
              detectable="no"
              detectableNote="NO - the danger register"
              confidence="high"
            />
            <LedgerRow
              id="G2"
              severity="high"
              name="LedgerRow - high"
              window="an interval"
              cause="Same columns, lighter severity rule."
              discoveredBy="an analyst, cited"
              detectable="part"
              detectableNote="PARTIAL - the warn register"
              confidence="med"
            />
            <LedgerRow
              id="G3"
              name="LedgerRow - note"
              window="an interval"
              cause="No severity rule at all."
              discoveredBy="a public filing"
              detectable="yes"
              detectableNote="YES - the ok register"
              confidence="low"
            />
          </Ledger>
        </div>
      </Block>

      <Block idx="G5" title="Argument" right="Reason, InferenceChain, Quote, Eyebrow">
        <div className="grid g2">
          <Glass>
            <Eyebrow idx="Reason">a numbered argument, ruled in gold</Eyebrow>
            <div style={{ marginTop: 10 }}>
              <Reason
                steps={[
                  { n: "01", text: <>The anchor bounds the candidate set unconditionally.</> },
                  { n: "02", text: <>Each further filter buys its reduction with an assumption.</> },
                  { n: "03", text: <>The assumption is printed next to the number it bought.</> },
                ]}
              />
            </div>
          </Glass>
          <Glass>
            <Eyebrow idx="InferenceChain">the filter stack, with its costs</Eyebrow>
            <InferenceChain
              steps={[
                { n: "412,908", what: "raw anchor bound" },
                { n: "18,204", what: "time window", note: "7 days", cost: "assumes prompt spending" },
                { n: "63", what: "amount match", cost: "assumes one matching deposit" },
              ]}
              assumption="Reject either assumption and the count returns to the line above it."
            />
          </Glass>
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="Quote">display serif, attributed</Eyebrow>
          <Quote who="the pattern, not a quotation">A shielded transaction reveals nothing.</Quote>
        </div>
      </Block>

      <Block idx="G6" title="Ambience" right="FogCanvas, Tide, Grain - all reduced-motion gated">
        <div className="spec">
          <Eyebrow idx="FogCanvas">seeded by the tip hash; no rAF under reduced motion</Eyebrow>
          <div style={{ position: "relative", height: 220, background: "var(--bg-deep)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <FogCanvas seed={FIXTURE_TIP.hash} />
          </div>
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="Tide">the one ceremony; never constructed under reduced motion</Eyebrow>
          <p className="note">
            Tide is a shell singleton, but from HANDOFF-03 it renders only on the splash: section 3 makes Record pages
            zero-motion and the ceremony was running on all of them. The shell&apos;s instance is therefore absent here, and
            this gallery mounts its own with the <code className="mono">always</code> escape - the one place in the tree that
            passes it. It is fixed-position and fully transparent until a block arrives, so exactly one exists on this page
            and nothing overlaps.
          </p>
          <Tide always />
        </div>
        <div className="spec" style={{ marginTop: 14 }}>
          <Eyebrow idx="Grain">static texture, nothing to suppress</Eyebrow>
          <p className="note">
            Grain is a shell singleton too, and the film over this page is that instance. Nesting a second would stack two
            full-viewport overlays and make the gallery - the page a reviewer judges the texture on - the one page where the
            texture is wrong.
          </p>
        </div>
      </Block>
    </div>
  );
}
