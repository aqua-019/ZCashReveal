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
        <p className="dek">{dek}</p>
      </div>
      {aside === undefined ? null : <div>{aside}</div>}
    </div>
  );
}
