"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS, isActive } from "@/lib/nav";

/**
 * The screen index, grouped and annotated.
 *
 * WHAT CHANGED IN HANDOFF-04a, AND WHY IT NEEDED NO NEW COPY. A reader said
 * "SPLASH, BEWARE, CONTRADICTIONS - am I browsing a website or selecting
 * missions in Metal Gear Solid?". Both answers to that were already sitting in
 * `nav.ts` and neither was rendered: every screen carries a `dek`, whose own
 * field comment says it "feeds the meta description and the page dek", and
 * every screen carries `half: "record" | "instrument"`. This component rendered
 * `idx` and `label` and nothing else. So the fix is one field and one grouping,
 * not a rewrite of the labels: nine undifferentiated words read as a mission
 * select; two named groups, each item saying what it is, read as two purposes.
 *
 * THE TWO-DIGIT INDEX STAYS. `nav.ts` argues it - "the Record is numbered like
 * evidence, not labelled like a menu" - and that argument survives the
 * complaint. The numbering was never what said nothing. The label beside it
 * was.
 *
 * ONE HOVER VERB. The list dims its siblings on hover and nothing else: no
 * transform at any state, which assertion A6 checks by reading the computed
 * style of every link. Active state is `aria-current="page"` and CSS off that
 * attribute, so it is announced as well as painted.
 */
export function ScreenNav({ ariaLabel = "Screens" }: { readonly ariaLabel?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="screens"
      id="screens"
      aria-label={ariaLabel}
      data-primitive="ScreenNav"
      data-ui="screennav"
    >
      {NAV_GROUPS.map((group) => (
        <div className="screengroup" key={group.half} data-half={group.half}>
          <span className="screengroup-h">{group.heading}</span>
          <ul className="screenlist">
            {group.entries.map((s) => {
              const active = isActive(pathname, s.href);
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    // The bar carries every screen on every page, so the default
                    // viewport prefetch pulls eleven RSC payloads on each load and
                    // puts them in front of the fonts on a throttled connection.
                    // The Record is static and small; fetching a screen when it is
                    // asked for is fast enough, and the first paint is what the
                    // budget measures.
                    prefetch={false}
                    {...(active ? { "aria-current": "page" as const } : {})}
                  >
                    <span className="i" aria-hidden="true">
                      {s.idx}
                    </span>
                    <span className="screentext">
                      <span className="screenlabel">{s.label}</span>
                      {/* The dek is the answer to "what is this page", and it is
                          rendered rather than described. A5 reads exactly this
                          node. */}
                      <span className="screendek">{s.dek}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
