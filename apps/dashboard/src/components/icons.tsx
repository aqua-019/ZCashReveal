/**
 * Custom SVG icons. Inline, stroke-based, currentColor-driven.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export function IconConnection({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M7 12a5 5 0 0 1 10 0" opacity="0.6" />
      <path d="M3 12a9 9 0 0 1 18 0" opacity="0.3" />
    </svg>
  );
}

export function IconNullifier({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M5 19 19 5" />
      <circle cx="8" cy="16" r="2" />
      <circle cx="16" cy="8" r="2" />
    </svg>
  );
}

export function IconAnchor({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8v12" />
      <path d="M5 16a7 7 0 0 0 14 0" />
      <path d="M8 13H6m12 0h-2" />
    </svg>
  );
}

export function IconCommitment({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" opacity="0.4" />
    </svg>
  );
}

export function IconValueBalance({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3v18" />
      <path d="M6 7l6-4 6 4" />
      <path d="M5 11l-2 6h8l-2-6" />
      <path d="M19 11l-2 6h8l-2-6" opacity="0.6" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconArrowDown({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function IconArrowUp({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function IconShield({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />
    </svg>
  );
}

export function IconShieldCracked({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />
      <path d="M12 7l-2 5 3 1-1 4" />
    </svg>
  );
}

export function IconWarn({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}

export function IconClock({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconChain({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="3" y="9" width="6" height="6" rx="1" />
      <rect x="15" y="9" width="6" height="6" rx="1" />
      <path d="M9 12h6" />
    </svg>
  );
}

export function IconCopy({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="8" y="8" width="12" height="12" rx="1" />
      <path d="M4 16V5a1 1 0 0 1 1-1h11" />
    </svg>
  );
}

export function ZecleakMark({ size = 24, ...p }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 5 19 5 5 19 19 19" />
      <path d="M14 9 11 12 14 15" opacity="0.5" />
    </svg>
  );
}
