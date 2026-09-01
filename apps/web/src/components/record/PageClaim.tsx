import type { ReactNode } from "react";

import { Conf } from "@/components/ui/Conf";
import type { Confidence } from "@zcashreveal/content";

/**
 * THE CLAIM BEAT, at the top of a Record page, and the epistemic strip beside it.
 *
 * READER COMPLAINT 4, WHICH L2 CALLED THE DIAGNOSIS OF THE WHOLE REDESIGN:
 * "instead of claim, explanation, evidence, visualization, we get vibes,
 * cryptographic terminology, vibes, huge number, tiny explanation, vibes".
 * HANDOFF-04a answered it on the splash, by naming the beats - Claim, Evidence,
 * The working - and putting the claim first. It did not reach the other seven
 * Record pages, and its own section 7 said so. This is that grammar, extracted
 * so seven pages get the same one rather than seven near-copies.
 *
 * WHAT A PAGE OPENED ON BEFORE, measured page by page rather than asserted:
 *   /timeline    a citation chip, then a count, with the chart in the aside
 *   /sources     two large figures in a metric row
 *   /contradictions  a count, then a concession, with the claim third
 *   /flows       a legend for the notation, with the page's finding sideways
 *   /beware      a claim, then four large figures before the explanation
 *   /network     a claim, then a count, then a diagram, then a 41-row table
 * A number with no claim above it is a vibe with a decimal point, which is what
 * the reader was describing.
 *
 * THE EPISTEMIC STRIP IS NEVER COLLAPSED, and that is the collapse rule's
 * hardest clause: "epistemic status behind a toggle is the null-panel-renders-
 * as-zero defect in a nicer coat". Confidence, last-verified and the source
 * count sit in the open beside the claim.
 *
 * AND WHERE THE DATA DOES NOT CARRY THEM, THE ABSENCE IS NAMED RATHER THAN
 * FILLED. `sourceSchema` has no `confidence` and no `lastVerified` - a Source
 * carries a publication date and a fetch date and nothing else - so /sources
 * cannot state a confidence without one being invented, and /method's own
 * material is documentation of this site's procedure rather than a sourced
 * claim about the world ("fabricating one would be the precise defect this page
 * exists to argue against"). Those pages pass `status` instead of the three,
 * and it states the CONDITION. That is `docs/2.0/SNAPSHOT.md` section 8.1's
 * rule about absences, applied to epistemic status rather than to a panel.
 */
export function PageClaim({
  claim,
  explain,
  confidence,
  lastVerified,
  sourceCount,
  status,
  children,
}: {
  /** The claim. A sentence that asserts something, not a label. */
  readonly claim: ReactNode;
  /** Why it is true, in the reader's language, before any evidence. */
  readonly explain: ReactNode;
  readonly confidence?: Confidence;
  readonly lastVerified?: string;
  /**
   * How many sources the page's claims rest on. A count, because `Source` has
   * no field marking one primary, so "14 cited, 3 primary" - the collapse
   * rule's own worked example - has no second number available anywhere in this
   * schema. `Cite.tsx` records the same limit for the same reason.
   */
  readonly sourceCount?: number;
  /**
   * For a page whose data carries none of the three: what stands in its place,
   * stated as a condition. Mutually exclusive with the three above; passing
   * both is a caller deciding to say two things about one question.
   */
  readonly status?: ReactNode;
  /** Anything else that belongs above the fold, after the explanation. */
  readonly children?: ReactNode;
}) {
  const hasApparatus = confidence !== undefined || lastVerified !== undefined || sourceCount !== undefined;
  return (
    <section className="beat beat-claim pageclaim">
      <span className="beattag">Claim</span>
      <p className="pc-claim">{claim}</p>
      <p className="explain pc-explain">{explain}</p>
      {/* THE STRIP, IN THE OPEN. Not a `<details>`, not an aside, not below the
          evidence. A reader who cannot tell a high-confidence claim verified
          last week from a low-confidence one verified in March, without opening
          anything, has been given a mood rather than a record. */}
      {hasApparatus ? (
        <p className="pc-status">
          {/* THE LABEL GOES WITH THE VALUE. Emitted unconditionally, a page that
              passes no confidence announced the field anyway, so a screen reader
              read "confidence: verified 2026-08-22 43 sources" and took the DATE
              for the grade. A field announced with no value is the
              null-panel-renders-as-zero shape inside the component written
              against it. Measured on the served /contradictions. */}
          {confidence === undefined ? null : (
            <>
              <span className="sr-only">confidence: </span>
              <Conf level={confidence} />
            </>
          )}
          {lastVerified === undefined ? null : <span className="pc-date">verified {lastVerified}</span>}
          {sourceCount === undefined ? null : (
            <span className="pc-src">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
            </span>
          )}
        </p>
      ) : null}
      {status === undefined ? null : <p className="pc-status pc-status-absent">{status}</p>}
      {children}
    </section>
  );
}
