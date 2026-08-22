import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Glass } from "@/components/ui/Glass";
import { Ledger, LedgerRow } from "@/components/ui/LedgerRow";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/beware");

export const metadata: Metadata = {
  title: "Beware",
  description: S?.dek ?? "",
};

/**
 * 01 BEWARE - the exploit ledger.
 *
 * Two of the eighteen entries are rendered here as structural samples: they
 * exercise the LedgerRow severity register and the detectability column, which
 * is the one column that makes the ledger a forensic document rather than a
 * list of CVEs. The other sixteen arrive with packages/content in HANDOFF-02
 * and are rendered by HANDOFF-03; nothing here is authored copy about an
 * exploit that is not already sourced in docs/2.0/RESEARCH-2026-08-DOSSIER.md.
 *
 * This is the Lighthouse budget page: performance and accessibility both >= 95.
 * It is deliberately zero-motion.
 */
export default function BewarePage() {
  return (
    <>
      <RecordHead
        idx="01"
        kicker="the exploit ledger"
        title="Beware"
        titleAccent="the windows"
        dek={
          <>
            Twice in ten years the shielded circuits were <b>unsound</b>, and in neither window can anyone prove that nothing was
            minted. A soundness bug does not leave a trace: that is what soundness means. The ledger records what was found, when
            it was disclosed, how long the window stayed open, and - the column that matters - whether it was ever detectable.
          </>
        }
        aside={
          <MetricRow>
            <Metric label="Entries" value="18" sub="5 in depth" />
            <Metric label="Unsound days" value="2,192" sub="Sprout 730 + Orchard 1,462" accent />
          </MetricRow>
        }
      />

      <Block idx="01" title="Critical soundness failures" right="two of eighteen - the rest arrive with HANDOFF-02">
        <Ledger label="Exploit ledger">
          <LedgerRow
            id="B1"
            severity="crit"
            name="Sprout counterfeiting - BCTV14 soundness"
            sub="CVE-2019-7167"
            window="28 Oct 2016 to 28 Oct 2018"
            detail="Found 1 Mar 2018; fixed silently at Sapling, 28 Oct 2018; disclosed 5 Feb 2019, 341 days later. Ariel Gabizon (ECC), confirmed by Sean Bowe."
            detectable={<span style={{ color: "var(--danger)" }}>NO - only via a turnstile that never concluded</span>}
            confidence="high"
          />
          <LedgerRow
            id="B2"
            severity="crit"
            name="Orchard Action circuit soundness"
            sub="CVE-2026-54496 - CVSS 9.3"
            window="31 May 2022 to 1 Jun 2026"
            detail="Found 29 May 2026; soft fork 2 Jun; NU6.2 3 Jun; disclosed 4 Jun. One missing copy constraint left the nullifier key unenforced."
            detectable={<span style={{ color: "var(--danger)" }}>NO - forged nullifiers are indistinguishable</span>}
            confidence="high"
          />
        </Ledger>
      </Block>

      <Block idx="02" title="Why the residual cannot be cleared" right="the arithmetic, not the allegation">
        <div className="grid g2">
          <Glass>
            <p className="note">
              A turnstile bounds what a pool can pay out by what it took in. It cannot distinguish a legitimate note from a forged
              one already inside the pool - it can only refuse to let the pool go negative. So a pool that ran on an unsound
              circuit can be <b>emptied</b>, and emptying it is the only thing that settles the question. Until then the balance
              is an open quantity, and this site publishes it as one.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Chip tone="danger">unprovable</Chip>
              <Chip>public aggregate</Chip>
              <Chip tone="ok">no identity claim</Chip>
            </div>
          </Glass>
          <Glass>
            <p className="note">
              Nothing on this page alleges that counterfeiting occurred. The claim is narrower and harder to dismiss: for
              2,192 days the property that would rule it out did not hold, and the residual balance is the measure of what is
              still unresolved. Every entry carries its sources and its confidence, and disputed items stay off the site.
            </p>
          </Glass>
        </div>
      </Block>

      <Block idx="03" title="The remaining sixteen" right="scheduled">
        <Pending handoff="HANDOFF-02 / 03" title="The full ledger, schema-validated">
          The other sixteen entries, the per-entry detail pages and the claim-ID permalinks (/beware#B5) land once
          packages/content defines the zod schema and the seed data is imported from the research dossiers. The schema requires
          at least one source, a confidence and a last-verified date on every claim, and the build fails without them.
        </Pending>
      </Block>
    </>
  );
}
