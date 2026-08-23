import type { ReactNode } from "react";

/**
 * A pull quote in the display serif, attributed. Used by the Network phrase
 * catalogue, where the wording is itself the evidence, so the attribution line
 * is required rather than optional.
 */
export function Quote({ who, children }: { readonly who: string; readonly children: ReactNode }) {
  return (
    <figure style={{ margin: 0 }} data-primitive="Quote">
      <blockquote className="quote" cite="">
        {children}
      </blockquote>
      <figcaption className="quote">
        <span className="who">{who}</span>
      </figcaption>
    </figure>
  );
}
