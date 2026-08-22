/**
 * SVG icons. CLAUDE.md: SVG only, no emoji anywhere.
 *
 * Grammar harvested from legacy/dashboard/src/components/icons.tsx: 24x24 view
 * box, `currentColor` stroke, 1.6 stroke width, square caps. Square caps are
 * deliberate - the Record is an engraving, not a UI kit.
 *
 * Every icon is decorative and paired with real text, so each carries
 * `aria-hidden` and `focusable="false"`. An icon that ever becomes the sole
 * label needs a `<title>`, not a removed `aria-hidden`.
 */

import type { SVGProps } from "react";

export interface IconProps {
  readonly size?: number;
  readonly className?: string;
}

function base(size: number, className?: string): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "square",
    strokeLinejoin: "miter",
    "aria-hidden": true,
    focusable: false,
    ...(className === undefined ? {} : { className }),
  };
}

/** The wordmark glyph: a Z that doubles back, the turnstile in one stroke. */
export function ZecMark({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 5h14L5 19h14" />
      <path d="M8 12h8" opacity=".5" />
    </svg>
  );
}

/** A spent note: one nullifier, published forever. */
export function IconNullifier({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="7" />
      <path d="M7.5 16.5 16.5 7.5" />
    </svg>
  );
}

/** The tree root at spend time. */
export function IconAnchor({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 7v12" />
      <circle cx="12" cy="5" r="2" />
      <path d="M5 13a7 7 0 0 0 14 0" />
    </svg>
  );
}

/** One output note, one commitment. */
export function IconCommitment({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 4 20 8v8l-8 4-8-4V8z" />
    </svg>
  );
}

/** Value crossing the boundary - the one thing gold is spent on. */
export function IconBoundary({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3v18" opacity=".5" />
      <path d="M4 9h6M7 6l3 3-3 3" />
      <path d="M20 15h-6M17 18l-3-3 3-3" />
    </svg>
  );
}

export function IconArrowRight({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}

export function IconSearch({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  );
}

/** Sound circuit. */
export function IconShield({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
    </svg>
  );
}

/** Unsound circuit - the two windows. */
export function IconShieldCracked({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
      <path d="M12 6.5 10 12h4l-2 5.5" />
    </svg>
  );
}

export function IconWarn({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 4 21 19H3z" />
      <path d="M12 10v4" />
      <path d="M12 16.6v.2" />
    </svg>
  );
}

export function IconClock({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconChain({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="9" width="8" height="6" />
      <rect x="13" y="9" width="8" height="6" />
      <path d="M11 12h2" />
    </svg>
  );
}

/** The candidate set an anchor bounds. */
export function IconCandidates({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" opacity=".5" />
    </svg>
  );
}

/** One step of the filter stack. */
export function IconFilter({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  );
}

export function IconSource({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M14 4H6v16h12V8z" />
      <path d="M14 4v4h4" />
      <path d="M9 13h6M9 16h4" opacity=".6" />
    </svg>
  );
}
