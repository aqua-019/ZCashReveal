import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * The masthead of a Record surface: numbered eyebrow, display heading with one
 * gold-set word, a dek held to the measure, and an optional aside for the
 * surface's own metadata (counts, last-verified dates).
 *
 * `titleAccent` is the single word or phrase the heading turns on. One per
 * page: the accent is a budget.
 */
export function RecordHead({
  idx,
  kicker,
  title,
  titleAccent,
  dek,
  aside,
}: {
  readonly idx: string;
  readonly kicker: string;
  readonly title: string;
  readonly titleAccent?: string;
  readonly dek: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="record-head">
      <div>
        <Eyebrow idx={idx}>{kicker}</Eyebrow>
        <h1 style={{ marginTop: 14 }}>
          {title}
          {titleAccent === undefined ? null : (
            <>
              {" "}
              <em>{titleAccent}</em>
            </>
          )}
        </h1>
        {/* A div, not a paragraph. `dek` is arbitrary caller JSX, and a caller
            that puts a claim's citation in it is putting a <details> inside
            this element - which the HTML parser treats as closing an open <p>,
            tearing the disclosure out of the dek, promoting it to a sibling and
            leaving a stray empty paragraph. Server and client then disagree and
            React reports a hydration mismatch. The A7 suite caught exactly that
            at gate round 2, on a dek written earlier the same round. A <div>
            takes flow content, so no caller can produce it. */}
        <div className="dek">{dek}</div>
      </div>
      {aside === undefined ? null : <div>{aside}</div>}
    </div>
  );
}
