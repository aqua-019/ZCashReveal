import type { ElementType, ReactNode } from "react";

/**
 * The dark glass surface: a gradient panel over the grain, hairline bordered.
 * `padded` adds the standard card inset; turn it off when the child owns its
 * own padding (a table, a canvas).
 */
export function Glass({
  as: Tag = "div",
  padded = true,
  className,
  id,
  children,
}: {
  readonly as?: ElementType;
  readonly padded?: boolean;
  readonly className?: string;
  /**
   * The claim id, when this panel IS a claim. Added in HANDOFF-03: a card that
   * renders one contradiction, one entity or one case has to be the scroll
   * target of its own permalink, and without this the page has to drop the
   * primitive and write `class="glass card"` by hand to put the id somewhere.
   * Two workers hit that in the same afternoon.
   */
  readonly id?: string;
  readonly children: ReactNode;
}) {
  const cls = ["glass", padded ? "card" : null, className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} data-primitive="Glass" {...(id === undefined ? {} : { id })}>
      {children}
    </Tag>
  );
}
