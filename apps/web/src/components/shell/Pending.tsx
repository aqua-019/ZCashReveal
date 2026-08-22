import type { ReactNode } from "react";

/**
 * A stated gap.
 *
 * HANDOFF-01 ships the shell for nine routes whose content arrives in 02, 03,
 * 04 and 11. Rather than leaving those pages blank - the "empty dashboard"
 * failure the plan calls out by name - each says exactly what belongs there and
 * which handoff delivers it. An unfinished page should read as a scheduled one.
 */
export function Pending({
  handoff,
  title,
  children,
}: {
  readonly handoff: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="pending" data-ui="pending" data-handoff={handoff}>
      <p className="eyebrow">
        <b>{handoff}</b> - not yet delivered
      </p>
      <h3 className="h">{title}</h3>
      <p>{children}</p>
    </div>
  );
}
