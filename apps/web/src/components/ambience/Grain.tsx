import type { ReactNode } from "react";

/**
 * The grain overlay: a fixed film of fractal noise over the whole page, so the
 * dark ground reads as a printed surface rather than as a flat fill.
 *
 * Static by construction - an inline SVG turbulence filter in a CSS background,
 * no script, no animation frame - so there is nothing for reduced motion to
 * suppress. It is texture, and texture is not motion.
 *
 * A server component: the noise never changes, so nothing here needs to hydrate.
 */
export function Grain({ children }: { readonly children: ReactNode }) {
  return (
    <div className="shell grain" data-primitive="Grain" data-ui="grain">
      {children}
    </div>
  );
}
