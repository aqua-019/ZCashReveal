"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SCREENS, isActive } from "@/lib/nav";

/**
 * The screen list in the system bar.
 *
 * The hover verb lives entirely in CSS (`.screens:hover a:not(:hover)...` in
 * globals.css) and changes `color` and `background-color` only. No transform is
 * declared on this component at any state - that is assertion A6, and it is
 * also the design law: what recedes is what the proof hides, and receding is a
 * change in light, not in position.
 *
 * Real <a> elements, not tab buttons: these are navigations. `aria-current`
 * carries the active state, and the gold fill follows from it.
 */
export function ScreenNav() {
  const pathname = usePathname();

  return (
    <nav className="screens" aria-label="Screens" data-primitive="ScreenNav" data-ui="screennav">
      {SCREENS.map((s) => {
        const active = isActive(pathname, s.href);
        return (
          <Link key={s.href} href={s.href} {...(active ? { "aria-current": "page" as const } : {})}>
            <span className="i" aria-hidden="true">
              {s.idx}
            </span>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
