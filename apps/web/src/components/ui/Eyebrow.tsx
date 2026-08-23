import type { ReactNode } from "react";

/**
 * The mono kicker that numbers a surface: "00 SYSTEM - shielded-pool forensics".
 * The index is set in gold, which is the accent's "active state" budget line.
 */
export function Eyebrow({
  idx,
  children,
  className,
}: {
  readonly idx?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <p className={className === undefined ? "eyebrow" : `eyebrow ${className}`} data-primitive="Eyebrow">
      {idx === undefined ? null : (
        <>
          <b>{idx}</b>
          {"\u00a0\u2014\u00a0"}
        </>
      )}
      {children}
    </p>
  );
}
