import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/timeline");

export const metadata: Metadata = {
  title: "Timeline",
  description: S?.dek ?? "",
};

interface Row {
  readonly date: string;
  readonly cat: string;
  readonly what: string;
}

/** Structural samples only - the activation heights the decoder is written against. */
const ROWS: readonly Row[] = [
  { date: "2016-10-28", cat: "LAUNCH", what: "Mainnet launch. Sprout is the only shielded pool." },
  { date: "2018-10-28", cat: "TECH", what: "Sapling activates; the BCTV14 soundness fix ships silently with it." },
  { date: "2022-05-31", cat: "TECH", what: "NU5 activates Orchard." },
  { date: "2026-06-03", cat: "EXPLOIT", what: "NU6.2 at height 3,364,600 fixes the Orchard Action circuit." },
  { date: "2026-07-28", cat: "TECH", what: "NU6.3 at height 3,428,143 opens Ironwood; Orchard becomes exit-only." },
];

const COLUMNS: readonly Column<Row>[] = [
  { key: "date", head: "date", mono: true, cell: (r) => r.date },
  { key: "cat", head: "category", cell: (r) => <Chip>{r.cat.toLowerCase()}</Chip> },
  { key: "what", head: "event", cell: (r) => r.what },
];

/**
 * 03 TIMELINE. Launch through today, filterable by category.
 *
 * The rows below are the consensus activation heights the indexer's
 * activation-heights.ts is written against, so the page is already consistent
 * with the decoder. The ~110-row editorial timeline arrives with HANDOFF-02.
 */
export default function TimelinePage() {
  return (
    <>
      <RecordHead
        idx="03"
        kicker="2013 to today"
        title="Timeline"
        dek={
          <>
            Launch, funding, governance, leadership, exploits and market, in one column. Category filters arrive with the
            content package; the <b>activation heights</b> below are consensus facts and are already what the decoder is written
            against.
          </>
        }
      />

      <Block idx="01" title="Consensus activations" right="the heights the decoder is written against">
        <DataTable
          caption="Network upgrades relevant to pool state"
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.date}
        />
      </Block>

      <Block idx="02" title="The editorial timeline" right="scheduled">
        <Pending handoff="HANDOFF-02 / 03" title="Around 110 rows, filterable by category">
          Nine categories - launch, funding, governance, leadership, exploit, tech, market, regulatory, network - each row
          carrying its sources and a confidence, with date-anchored permalinks of the form /timeline#T2026-06-04.
        </Pending>
      </Block>
    </>
  );
}
