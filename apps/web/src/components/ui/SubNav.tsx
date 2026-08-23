"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SubNavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * The second-level nav inside a surface (Track's views, the Record's sections).
 * Same hover verb as ScreenNav; the active item is marked by an inset gold rule
 * rather than a fill, so the accent budget is not spent twice on one screen.
 *
 * `path` renders the canonical route on the right, the way an explorer shows
 * you where you are.
 */
export function SubNav({
  items,
  label,
  path,
}: {
  readonly items: readonly SubNavItem[];
  readonly label: string;
  readonly path?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="subnav" aria-label={label} data-primitive="SubNav" data-ui="subnav">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link key={it.href} href={it.href} {...(active ? { "aria-current": "page" as const } : {})}>
            {it.label}
          </Link>
        );
      })}
      {path === undefined ? null : <span className="path">{path}</span>}
    </nav>
  );
}
