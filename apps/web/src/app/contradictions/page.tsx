import type { Metadata } from "next";

import { getContradictions, type Confidence } from "@zcashreveal/content";

import { ContradictionCard } from "@/components/record/ContradictionCard";
import { PageClaim } from "@/components/record/PageClaim";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Conf } from "@/components/ui/Conf";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { screenByHref } from "@/lib/nav";


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
 * THE CLAIM IS THE FIRST THING UNDER THE MASTHEAD (HANDOFF-04b, rule R5). It
 * used to be the dek's THIRD sentence, behind a count and a concession, and the
 * reader's complaint was about that order rather than about the volume: "we get
 * vibes, cryptographic terminology, vibes, huge number, tiny explanation,
 * vibes". Nothing was cut to answer it. The dek keeps the sentence that states
 * the page's scope; the concession and the claim moved DOWN into the claim
 * beat, where the claim leads and the concession explains it, and the evidence
 * - the sixteen pairs - follows both.
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

  /**
   * THE EPISTEMIC STRIP BESIDE THE CLAIM, and what this page can honestly put
   * in it.
   *
   * `lastVerified` is the SAME expression the aside prints rather than a second
   * derivation of the same fact, so the two cannot disagree. The sixteen share
   * one date today and it renders as one; a second date would appear in both
   * places at once.
   *
   * `sourceCount` counts DISTINCT source ids across the sixteen, so a source
   * three pairs cite counts once. Each pair's own count stays in its citation,
   * where it counts that pair's evidence rather than the page's.
   *
   * NO PAGE-LEVEL CONFIDENCE, and it is omitted rather than derived. The corpus
   * grades each PAIR - the tally is in the aside, counted from the cards - and
   * it grades no sentence like the claim above, which is this page's reading OF
   * the sixteen. A single chip there would be a grade invented for a sentence
   * nothing graded, which is `docs/2.0/SNAPSHOT.md` section 8.1's rule about
   * absences applied to epistemic status. Nothing is hidden by leaving it out:
   * the distribution is in the open beside the title, and each pair's own grade
   * is in the open on its own card.
   */
  const sourceCount = new Set(entries.flatMap((c) => c.sources)).size;

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
            record.
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

      {/* The claim, then the explanation, then the evidence. The claim is
          LIFTED, not invented: both sentences were already on this page, as the
          second and third of the dek, and the page's own material - sixteen
          pairs, several of which grant the missing qualifier in their own text
          - is what supports them. */}
      <PageClaim
        claim={
          <>
            Most of these {entries.length} public claims are defensible - with a qualifier that was left off. The
            qualifier is the subject.
          </>
        }
        explain={
          <>
            The point is not that the claims are lies, and several of these entries grant the missing qualifier in their
            own words. What the page collects is where the qualifier went: each pair below sets the claim as the corpus
            recorded it against the record it collides with, and carries its own grade, its own last-verified date and
            at least one source.
          </>
        }
        lastVerified={verified.join(" · ")}
        sourceCount={sourceCount}
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
