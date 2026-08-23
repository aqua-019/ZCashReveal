import type { Metadata } from "next";

import { getContradictions, type Confidence } from "@zcashreveal/content";

import { ContradictionCard } from "@/components/record/ContradictionCard";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Conf } from "@/components/ui/Conf";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { screenByHref } from "@/lib/nav";

import "@/styles/record-beware.css";

const S = screenByHref("/contradictions");

export const metadata: Metadata = {
  title: "Contradictions",
  description: S?.dek ?? "",
};

/**
 * 02 CONTRADICTIONS - what was claimed, against what the record shows.
 *
 * The structure is the argument, so the page is a grid of pairs and nothing
 * else: the claim as the corpus recorded it, then the chain, the filings or
 * the disclosure history underneath it. Neither side is paraphrased here - the
 * corpus holds both strings and this page renders them - because the interest
 * of a contradiction lies entirely in the exact wording of the two halves.
 *
 * The point is not that the claims are lies. Most are defensible with a
 * qualifier that was left off, and several entries say as much in their own
 * text: "no trusted setup" is true of Orchard and Ironwood; the disclosure
 * timeline really did improve by two orders of magnitude between 2019 and
 * 2026. What the page collects is where the qualifier went.
 *
 * The mockup shows eight cards and captions itself "8 of 16 shown". That was a
 * mockup's economy; all sixteen ship, in the order the corpus numbers them.
 *
 * Zero motion: one hover verb, no animation, nothing that arrives.
 */

/** The confidence ladder, in the order `confidenceSchema` declares it. */
const LADDER: readonly Confidence[] = ["high", "med", "low"];

export default function ContradictionsPage() {
  const entries = getContradictions();

  // Counted, not asserted: each figure is a tally of the cards below, and each
  // card carries its own sources, confidence and last-verified date.
  const tally = LADDER.map((level) => ({ level, n: entries.filter((c) => c.confidence === level).length })).filter(
    (row) => row.n > 0,
  );
  const notHigh = entries.filter((c) => c.confidence !== "high");
  const verified = [...new Set(entries.map((c) => c.lastVerified))].sort();

  return (
    <>
      <RecordHead
        idx="02 CONTRADICTIONS"
        kicker="the claim, then the record - all sixteen - zero motion"
        title="What was claimed, and what the"
        titleAccent="chain shows"
        dek={
          <>
            {entries.length} public claims set beside what the chain, the filings and the disclosure history actually
            record. The point is not that the claims are lies - most are defensible with a qualifier that was left off,
            and several of these entries grant it in their own words. <b>The qualifier is the subject.</b> Every pair
            carries the claim as the corpus recorded it, the record it collides with, at least one source, a confidence
            and a last-verified date.
          </>
        }
        aside={
          <Glass>
            <Eyebrow idx="the set">counted from the cards below</Eyebrow>
            <div style={{ marginTop: 12 }}>
              <KV
                stack
                entries={[
                  { k: "entries", v: `${entries.length} - C1 to C${entries.length}` },
                  { k: "confidence", v: tally.map((row) => `${row.n} ${row.level}`).join(" · ") },
                  { k: "not high", v: notHigh.map((c) => `${c.id} ${c.confidence}`).join(" · ") },
                  { k: "last verified", v: verified.join(" · ") },
                ]}
              />
            </div>
            <p className="note" style={{ marginTop: 12 }}>
              A pair graded <Conf level="med" /> rests on one reputable secondary source rather than on a primary or two
              independent ones. It is published at that grade, not held back and not promoted.
            </p>
          </Glass>
        }
      />

      <Block
        idx="01"
        title="The sixteen"
        right={
          <>
            claim as recorded, then the chain or the filings
            <br />
            id order, C1 to C{entries.length} - every pair sourced
          </>
        }
      >
        <div className="contra">
          {entries.map((entry) => (
            <ContradictionCard entry={entry} key={entry.id} />
          ))}
        </div>

        <p className="note measure" style={{ marginTop: 18 }}>
          The exploit ledger behind several of these pairs is on <a href="/beware">Beware</a>, and the events sit on one
          axis with the funding and governance strands on <a href="/timeline">the timeline</a>.
        </p>
      </Block>
    </>
  );
}
