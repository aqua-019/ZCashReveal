import type { ReactNode } from "react";

/**
 * THE WORKING: a native `<details>` for a derivation, a raw table, a method
 * walk-through or a full source list.
 *
 * THE COLLAPSE RULE, from HANDOFF-04a deliverable 4, which this enforces by
 * shape rather than by discipline:
 *   NEVER collapse the claim. The claim is the page.
 *   NEVER collapse `confidence`, `lastVerified` or the source count.
 *   COLLAPSE the derivation, the raw table, the method walk-through, the full
 *     source list.
 *   EVERY `<summary>` CARRIES ITS FINDING - "Sources - 14 cited, 3 primary",
 *     never "Sources".
 *
 * `finding` IS A REQUIRED PROP, and that is the whole design. A summary that
 * reads "Sources" tells a reader nothing they did not already know from the
 * heading, so a page of them is a row of identical grey triangles and the
 * reader opens all of them or none. Making the finding a separate required
 * argument means a caller cannot write the bare form by omission - only by
 * deliberately passing something empty, which is visible in review.
 *
 * NATIVE `<details>`, NOT AN ISLAND, for the reasons `Cite.tsx` sets out at
 * length: keyboard-operable, screen-reader announced, dismissible without a
 * line of JavaScript, and it registers no animation - which is what assertion
 * A6 measures on every Record page. An island would have had to re-implement
 * all three and then be excluded from A6 by hand.
 *
 * `<details>` IS FLOW CONTENT AND CANNOT NEST IN A `<p>`. The HTML parser
 * treats an open `<p>` as closed by it, which tears the disclosure out, promotes
 * it to a sibling and leaves a stray empty paragraph - server and client then
 * disagree and React reports a hydration mismatch. That has been found twice in
 * this repository, once in HANDOFF-03's gate and once in a dek written the same
 * round, and `test/unit/no-disclosure-in-paragraph.test.ts` exists because of
 * it. Callers put this in a `<div>` or a section, never in a paragraph.
 */
export function Working({
  title,
  finding,
  id,
  children,
}: {
  /** What is inside. A noun phrase, not a sentence. */
  readonly title: string;
  /**
   * The finding the closed state carries, and it must contain a digit - a
   * count, a span, a date. `test/unit/summary-findings.test.ts` checks every
   * summary in `apps/web` for one; the requirement is here so the check has
   * something to be true of rather than something to police.
   */
  readonly finding: string;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <details className="wdisc" {...(id === undefined ? {} : { id })}>
      <summary>
        <span className="wd-t">{title}</span>
        <span className="wd-n">{finding}</span>
      </summary>
      <div className="wd-body">{children}</div>
    </details>
  );
}
