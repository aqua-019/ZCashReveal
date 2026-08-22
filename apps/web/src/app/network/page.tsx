import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/network");

export const metadata: Metadata = {
  title: "The Network",
  description: S?.dek ?? "",
};

/**
 * 04 NETWORK - who promotes, who holds, who pays whom.
 *
 * The fairness panel is not a disclaimer bolted on at the end: it is a
 * first-class surface with the same weight as the lattice, because a promotion
 * map without one is an insinuation. HANDOFF-02 supplies the holdings tables,
 * the phrase catalogue and the graph.
 */
export default function NetworkPage() {
  return (
    <>
      <RecordHead
        idx="04"
        kicker="the promotion lattice"
        title="The Network"
        dek={
          <>
            Who promotes, who holds, who pays whom - drawn as a graph with the money on the edges. Every node is an entity with
            a filing or a public statement behind it, and the <b>fairness panel</b> carries what cuts the other way with the
            same prominence as the lattice itself.
          </>
        }
      />

      <Block idx="01" title="Label provenance" right="precedence is displayed, always">
        <div className="grid g2">
          <Glass>
            <p className="note">
              An address gets a label only through a ranked ladder, and the rank is rendered next to the label everywhere it
              appears. A behavioural guess never displays as a name.
            </p>
            <div style={{ marginTop: 14 }}>
              <KV
                entries={[
                  { k: "1 consensus", v: "defined by a ZIP - lockbox, funding streams" },
                  { k: "2 owner filing", v: "a 10-Q or equivalent naming the custodian" },
                  { k: "3 exchange confirmation", v: "the venue confirms the deposit address" },
                  { k: "4 analyst", v: "a named third party, cited and dated" },
                  { k: "5 behaviour", v: "clustering only - displayed as a heuristic, never as a name" },
                ]}
                stack
              />
            </div>
          </Glass>
          <Glass className="fair">
            <p className="eyebrow">
              <b>fairness panel</b>
            </p>
            <p className="note" style={{ marginTop: 10 }}>
              What cuts the other way is published beside what does not. The research found <b>no on-chain evidence of insider
              selling</b>; the ZIP 271 lockbox is 99.28 per cent untouched; a widely repeated exchange-inflow event is
              two-thirds a round trip. Those findings sit on /flows next to the case files, not in a footnote.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Chip tone="ok">not supported</Chip>
              <Chip>stated, not buried</Chip>
            </div>
          </Glass>
        </div>
      </Block>

      <Block idx="02" title="Holdings, grants and the phrase catalogue" right="scheduled">
        <Pending handoff="HANDOFF-02 / 03" title="The lattice, the tables and the phrases">
          The purchase ledgers, the cap tables, the grant book and the phrase catalogue arrive from the research dossiers
          through packages/content, each entry sourced, dated and confidence-ranked. Claims the research could not corroborate
          stay in unverified.json and are never rendered.
        </Pending>
      </Block>
    </>
  );
}
