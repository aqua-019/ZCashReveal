import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Conf } from "@/components/ui/Conf";
import { Glass } from "@/components/ui/Glass";
import { Quote } from "@/components/ui/Quote";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/contradictions");

export const metadata: Metadata = {
  title: "Contradictions",
  description: S?.dek ?? "",
};

/**
 * 02 CONTRADICTIONS - marketing claim against on-chain reality.
 *
 * The structure is the argument: a claim in the display serif, the chain's
 * answer in prose beneath it, and a confidence on the pairing. HANDOFF-02
 * supplies all sixteen from packages/content.
 */
export default function ContradictionsPage() {
  return (
    <>
      <RecordHead
        idx="02"
        kicker="claims against the chain"
        title="Contradictions"
        dek={
          <>
            Sixteen public claims set against what the chain actually publishes. The point is not that the claims are lies -
            most are defensible with a qualifier that was left off. The point is the <b>qualifier</b>, and where it went.
          </>
        }
      />

      <Block idx="01" title="The shape of an entry" right="one structural sample">
        <div className="grid g2">
          <Glass>
            <Quote who="the pattern, not a quotation">A shielded transaction reveals nothing.</Quote>
            <p className="note" style={{ marginTop: 12 }}>
              True of a z-to-z transfer&apos;s value and endpoints. Not true of the transaction&apos;s existence, its nullifiers,
              its anchor, its action count, its fee, or the exact amount of any value crossing the pool boundary in either
              direction. Roughly three quarters of supply is transparent, so most activity never enters the shielded set at all.
            </p>
            <p style={{ marginTop: 12 }}>
              <Conf level="high" />
            </p>
          </Glass>
          <Glass>
            <p className="note">
              Each real entry carries the claim verbatim with its speaker and date, the chain&apos;s answer, at least one source
              URL, a confidence, and a last-verified date. Where a claim cuts both ways the entry says so - the Record is not an
              argument that Zcash is bad, it is an argument that the qualifiers belong in public.
            </p>
          </Glass>
        </div>
      </Block>

      <Block idx="02" title="The sixteen" right="scheduled">
        <Pending handoff="HANDOFF-02 / 03" title="Contradictions, schema-validated">
          The sixteen entries come from docs/2.0/RESEARCH-2026-08-DOSSIER.md through packages/content. Several premises in the
          original brief were corrected by the research and must not be published: they are held in unverified.json and are not
          rendered anywhere on this site.
        </Pending>
      </Block>
    </>
  );
}
