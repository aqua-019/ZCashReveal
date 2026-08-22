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
  children,
}: {
  readonly as?: ElementType;
  readonly padded?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const cls = ["glass", padded ? "card" : null, className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} data-primitive="Glass">
      {children}
    </Tag>
  );
}
