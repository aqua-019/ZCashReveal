import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Reason } from "@/components/ui/Reason";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/flows");

export const metadata: Metadata = {
  title: "Flows",
  description: S?.dek ?? "",
};

/**
 * 07 FLOWS - exchange inflows, the insider question, and the case files.
 *
 * The surface exists to publish a negative result as prominently as a positive
 * one. The research went looking for on-chain evidence of insider selling and
 * did not find it; that finding is the headline here, not a footnote, because a
 * forensic instrument that only reports hits is a rumour mill.
 */
export default function FlowsPage() {
  return (
    <>
      <RecordHead
        idx="07"
        kicker="inflows and case files"
        title="Flows"
        dek={
          <>
            Reproducible case files: the transactions, the heights, the method that matched them, and the grade. Where the
            evidence does not support a widely repeated claim, the case file says <b>not supported</b> and shows the work that
            failed to support it.
          </>
        }
      />

      <Block idx="01" title="What the research found" right="a negative result, published as one">
        <div className="grid g2">
          <Glass className="fair">
            <p className="eyebrow">
              <b>not supported</b> - insider selling
            </p>
            <p className="note" style={{ marginTop: 10 }}>
              No on-chain evidence of insider selling was found. Custody arrangements are what the filings say they are, a
              widely cited exchange-inflow event is substantially a round trip, and the consensus lockbox has barely moved. The
              case files are published side by side with the box that says the claim is not supported.
            </p>
            <div style={{ marginTop: 14 }}>
              <KV
                entries={[
                  { k: "lockbox untouched", v: "99.28%" },
                  { k: "largest cited inflow", v: "two-thirds a round trip" },
                  { k: "third-party flow coverage", v: "none exists for ZEC" },
                ]}
              />
            </div>
          </Glass>
          <Glass>
            <p className="eyebrow">
              <b>grading</b> - restraint is the test
            </p>
            <Reason
              steps={[
                { n: "01", text: <>An <b>exact</b> match on amount and a plausible interval grades HIGH. Everything else has to argue for itself.</> },
                { n: "02", text: <>A relative epsilon replaces v0.2&apos;s absolute fee tolerance, which was calibrated too tight and missed a real round trip by four tenths of a ZEC.</> },
                { n: "03", text: <>A 5.5 per cent amount gap over twenty minutes grades LOW even when everything else lines up. A grader that calls that one HIGH is a grader that will call anything HIGH.</> },
                { n: "04", text: <>Every case file is reproducible from public data: the txids are printed, so the reader can check the grade rather than trust it.</> },
              ]}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Chip tone="ok">exact</Chip>
              <Chip tone="gold">fee-tolerant</Chip>
              <Chip>relative epsilon</Chip>
              <Chip>subset-sum k &lt;= 3</Chip>
            </div>
          </Glass>
        </div>
      </Block>

      <Block idx="02" title="The case files" right="scheduled">
        <Pending handoff="HANDOFF-04 / 08 / 09" title="Inflow ledgers, the rich list and the labelled-address registry">
          The exchange inflow ledgers, the labelled-address registry with its provenance ranks, the rich list and the three
          reproducible case files arrive once packages/content carries labels.json and cases.json and the echo matcher is
          calibrated against them.
        </Pending>
      </Block>
    </>
  );
}
