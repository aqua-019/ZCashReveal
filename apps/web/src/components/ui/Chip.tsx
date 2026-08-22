import type { ReactNode } from "react";

/**
 * A small mono tag. Four tones, and only four:
 *   gold   - active state or value crossing a boundary (the accent budget)
 *   danger - Beware severity, nothing else
 *   ok     - a verified or sound state
 *   blue   - functional, outside the palette: a link or a focus affordance
 * Omitting the tone gives the neutral ink chip, which is the default answer.
 */
export type ChipTone = "gold" | "danger" | "ok" | "blue";

export function Chip({
  tone,
  children,
  title,
}: {
  readonly tone?: ChipTone;
  readonly children: ReactNode;
  readonly title?: string;
}) {
  return (
    <span
      className={tone === undefined ? "chip" : `chip ${tone}`}
      data-primitive="Chip"
      data-tone={tone ?? "neutral"}
      {...(title === undefined ? {} : { title })}
    >
      {children}
    </span>
  );
}
