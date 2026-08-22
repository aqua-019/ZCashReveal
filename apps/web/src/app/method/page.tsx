import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Glass } from "@/components/ui/Glass";
import { InferenceChain } from "@/components/ui/InferenceChain";
import { Pill } from "@/components/ui/Pill";
import { Reason } from "@/components/ui/Reason";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/method");

export const metadata: Metadata = {
  title: "Method",
  description: S?.dek ?? "",
};

interface LevelRow {
  readonly level: string;
  readonly range: string;
  readonly means: string;
}

/** The claim ladder, mirroring analysis/claim-classifier.ts. Lower-inclusive. */
const LEVELS: readonly LevelRow[] = [
  { level: "aggregate_only", range: "N_eff > 1000", means: "Publishable only as a distribution. No per-transaction statement." },
  { level: "broad_candidate_set", range: "100 to 1000", means: "A bound worth reporting. Names nothing." },
  { level: "small_heuristic_set", range: "10 to 100", means: "Reportable with the assumption stack shown in full." },
  { level: "requires_disclosure", range: "N_eff <= 10", means: "Not published as a finding. The set is small enough to harm." },
];

const COLUMNS: readonly Column<LevelRow>[] = [
  { key: "level", head: "claim level", mono: true, cell: (r) => r.level },
  { key: "range", head: "effective set size", mono: true, cell: (r) => r.range },
  { key: "means", head: "what it permits", cell: (r) => r.means },
];

/**
 * 06 METHOD - how every number on this site is derived.
 *
 * This page is the site's warrant. It exists so that a reader who distrusts a
 * figure can find the exact step that produced it and reject that step
 * specifically, rather than dismissing the whole instrument.
 *
 * The definitions here are RESEARCH.md's, not new ones.
 */
export default function MethodPage() {
  return (
    <>
      <RecordHead
        idx="06"
        kicker="how the numbers are made"
        title="Method"
        dek={
          <>
            Every bound on this site comes from the same stack: an anchor gives a raw candidate set, filters shrink it, and the
            entropy of what remains gives <b>N_eff = 2^H</b>. Each filter buys its reduction with an assumption, and the
            assumption is displayed next to the number it bought.
          </>
        }
      />

      <Block idx="01" title="The three registers" right="what kind of number is this">
        <div className="grid g3">
          <Glass>
            <Pill kind="exact" />
            <p className="note" style={{ marginTop: 10 }}>
              Transparent chain data. Balances, amounts, heights, counterparties. Arithmetically exact and independently
              checkable against any node.
            </p>
          </Glass>
          <Glass>
            <Pill kind="bounded" />
            <p className="note" style={{ marginTop: 10 }}>
              Shielded activity. An upper bound on a candidate set, never a value and never an owner. A bound that shrinks is a
              bound that bought its reduction with an assumption.
            </p>
          </Glass>
          <Glass>
            <Pill kind="undefined" />
            <p className="note" style={{ marginTop: 10 }}>
              Not derivable from public data. Printed as a refusal rather than left blank, because a blank cell reads as an
              oversight and a refusal reads as a finding.
            </p>
          </Glass>
        </div>
      </Block>

      <Block idx="02" title="The filter stack" right="illustrative shape, not a real transaction">
        <div className="grid g2">
          <Glass>
            <InferenceChain
              steps={[
                { n: "412,908", what: "raw anchor bound", note: "every commitment at or below the anchor position" },
                { n: "18,204", what: "time window", note: "7 days from heightCreated", cost: "assumes prompt spending" },
                { n: "63", what: "amount match", note: "two-sided interval, fee tolerance", cost: "assumes one matching deposit" },
              ]}
              assumption="Drop either assumption and the number returns to the line above it. The raw anchor bound is the only step that holds unconditionally."
            />
          </Glass>
          <Glass>
            <Reason
              steps={[
                { n: "01", text: <>The anchor published with a spend fixes a tree position; nothing above it can be the spent note. This is the only universally correct filter.</> },
                { n: "02", text: <>A time window is a behavioural guess. It is anchored at the height the note was created and it is logged as an assumption, with its parameters.</> },
                { n: "03", text: <>An amount match intersects two intervals with an explicit fee tolerance. The absolute tolerance inherited from v0.2 is known to miss real round trips; the relative rule replaces it.</> },
                { n: "04", text: <>Every estimator is a pure function and emits an audit record - filter, params, countIn, countOut - so the chain above is generated, not narrated.</> },
              ]}
            />
          </Glass>
        </div>
      </Block>

      <Block idx="03" title="Claim levels" right="lower-inclusive, coarse on purpose">
        <DataTable caption="What each effective set size permits" columns={COLUMNS} rows={LEVELS} rowKey={(r) => r.level} />
        <p className="note" style={{ marginTop: 14 }}>
          The thresholds are deliberately coarse and are not retuned without calibration data. The lowest band is a refusal to
          publish, not a confidence rating: a set of ten is small enough that publishing it could harm a person, and no bound
          this site can compute is worth that.
        </p>
      </Block>

      <Block idx="04" title="The full method" right="scheduled">
        <Pending handoff="HANDOFF-03 / 08" title="Derivations, worked cases and the assumptions panel">
          The full derivations - turnstile accounting across four pools, the Unprovable Residual, the Orchard drain, the ZIP 318
          migration lens and the Ironwood birth curve - render here once the analysis toolkit lands, each with the golden cases
          it was calibrated against.
        </Pending>
      </Block>
    </>
  );
}
