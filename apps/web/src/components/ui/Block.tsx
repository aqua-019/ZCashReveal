import type { ReactNode } from "react";

/**
 * A numbered section of a surface. The Record is organised as evidence blocks
 * rather than as chapters: a two-digit index, a serif heading, and an optional
 * right-hand annotation in the provisional register.
 */
export function Block({
  idx,
  title,
  right,
  id,
  children,
}: {
  readonly idx: string;
  readonly title: string;
  readonly right?: ReactNode;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="block" data-primitive="Block" {...(id === undefined ? {} : { id })}>
      <div className="block-head">
        <div className="lead">
          <span className="idx">{idx}</span>
          <h2>{title}</h2>
        </div>
        {right === undefined ? null : <div className="right">{right}</div>}
      </div>
      {children}
    </section>
  );
}
