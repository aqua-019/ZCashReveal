import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Conf } from "@/components/ui/Conf";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Glass } from "@/components/ui/Glass";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/sources");

export const metadata: Metadata = {
  title: "Sources",
  description: S?.dek ?? "",
};

interface FieldRow {
  readonly field: string;
  readonly rule: string;
}

/** The record shape packages/content enforces. The build fails without these. */
const FIELDS: readonly FieldRow[] = [
  { field: "id", rule: "Stable and permalinkable. /beware#B5 must keep resolving." },
  { field: "claim", rule: "The statement, in the words being examined." },
  { field: "sources[]", rule: "At least one. Each with url, title and date. Zero sources fails the build." },
  { field: "confidence", rule: "high, med or low. Always rendered next to the claim." },
  { field: "lastVerified", rule: "The date the source was last fetched and read." },
];

const COLUMNS: readonly Column<FieldRow>[] = [
  { key: "field", head: "field", mono: true, cell: (r) => r.field },
  { key: "rule", head: "rule", cell: (r) => r.rule },
];

/**
 * 08 SOURCES - the apparatus.
 *
 * The contract, stated on its own page so it can be cited: no claim without a
 * source, no source without a date, and nothing unverified rendered anywhere.
 */
export default function SourcesPage() {
  return (
    <>
      <RecordHead
        idx="08"
        kicker="the apparatus"
        title="Sources"
        dek={
          <>
            Every claim on this site resolves to a source URL, a confidence and a last-verified date. Items the research could
            not corroborate live in <b>unverified.json</b> and are not rendered anywhere - not greyed out, not marked
            provisional, not published.
          </>
        }
      />

      <Block idx="01" title="What a record must carry" right="enforced by the schema, not by review">
        <DataTable caption="Required fields on every Record claim" columns={COLUMNS} rows={FIELDS} rowKey={(r) => r.field} />
      </Block>

      <Block idx="02" title="Confidence is displayed, never inferred" right="three levels, no fourth">
        <div className="grid g3">
          <Glass>
            <Conf level="high" />
            <p className="note" style={{ marginTop: 10 }}>
              A primary document: a filing, a CVE record, a consensus rule, or the chain itself.
            </p>
          </Glass>
          <Glass>
            <Conf level="med" />
            <p className="note" style={{ marginTop: 10 }}>
              A credible secondary account, or a primary source that is partial or contested.
            </p>
          </Glass>
          <Glass>
            <Conf level="low" />
            <p className="note" style={{ marginTop: 10 }}>
              Reported but thinly sourced. Published only where the claim itself is the subject, and labelled.
            </p>
          </Glass>
        </div>
      </Block>

      <Block idx="03" title="The source index" right="scheduled">
        <Pending handoff="HANDOFF-02 / 03" title="Every URL, with its freshness">
          The full index, grouped by surface and sorted by last-verified date, arrives with packages/content. A monthly
          verification pass re-fetches each source, flags dead links and bumps the dates.
        </Pending>
      </Block>
    </>
  );
}
