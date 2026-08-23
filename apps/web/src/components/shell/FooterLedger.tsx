import type { ChainTip } from "@/lib/chain";
import { fmtBlockAge } from "@/lib/format";

/**
 * The footer ledger: four numbered lines stating what this site does and
 * refuses to do, in the code register, on every page.
 *
 * It is not boilerplate. Each line is a constraint the codebase is actually
 * held to - the claim-level ladder is enforced in apps/indexer, the sources
 * requirement is enforced by the packages/content schema - and putting them
 * under every screen is what makes the instrument citable.
 */

const LINES: readonly string[] = [
  "ZECReveal renders only public chain data: versions, anchors, action counts, boundary values, fees, nullifiers, commitments, migration denominations.",
  "No wallet inside the shielded set is ever decrypted, attributed, or stored. Candidate sets are upper-bounded by anchor depth; N_eff = 2^H is the actionable number.",
  "Claim levels gate every finding: aggregate_only / broad_candidate_set / small_heuristic_set / requires_disclosure.",
  "Every statement in the Record carries a source and a confidence. Unverified claims are kept off the site. Report uncertainty, not identity.",
];

export function FooterLedger({ tip }: { readonly tip: ChainTip }) {
  return (
    <footer className="ledgerfoot" data-ui="footer-ledger">
      <div className="code">
        {LINES.map((text, i) => (
          <p className="line" key={text.slice(0, 24)}>
            <span className="n" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{text}</span>
          </p>
        ))}
      </div>
      <div className="meta">
        <span>
          BUILD 2.0-scaffold · SNAPSHOT {fmtBlockAge(tip.snapshotAgeBlocks)} · AMBIENCE seeded by tip hash (FNV-1a to mulberry32)
        </span>
        <span>BUILT FOR CYPHERPUNKS, NOT FOR COMPLIANCE</span>
      </div>
    </footer>
  );
}
