"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { NAV_ENTRIES, isActive } from "@/lib/nav";

/**
 * The system bar's disclosure: one line at rest, the whole screen index open.
 *
 * WHY THE BAR COLLAPSES AT ALL. Eleven entries, each now carrying a `dek`, is
 * more than a permanent bar can hold without becoming the page. So the bar
 * carries one line - where you are - and the index arrives when you go for it.
 *
 * THE COLLAPSED LINE STILL NAMES THE CURRENT SCREEN, and that is not a detail.
 * The complaint this handoff answers was disorientation ("am I browsing a
 * website or selecting missions"); a bar that hides the index AND stops saying
 * where you are would answer it by making it worse. So the resting state is
 * `00 Splash`, not a hamburger.
 *
 * THREE WAYS IN, BECAUSE HOVER ALONE EXCLUDES TOUCH AND THE KEYBOARD ENTIRELY.
 *   1. POINTER - `.sysbar:hover`, plus a transparent approach strip below the
 *      bar (`.sysbar::after`) so it opens as the cursor ARRIVES rather than on
 *      contact. The strip is positioned `top: 100%`, so it rides with the bar
 *      as the bar grows instead of being left behind at the collapsed height.
 *   2. KEYBOARD - `.sysbar:focus-within`. Tabbing into the bar opens the index,
 *      so a keyboard user never has to know the button exists - and, more
 *      importantly, never lands on a link inside a zero-height container.
 *   3. TAP - this button, a real `<button>` with `aria-expanded` and
 *      `aria-controls`. On a touch device there is no hover and no tab, and the
 *      first two paths do not exist at all. A7 asserts touch rather than
 *      assuming it.
 *
 * ============================================================================
 * WHY THE STATE IS THREE-VALUED AND NOT A BOOLEAN
 * ============================================================================
 * `forced === null` means "follow the CSS" - hover and focus decide. `true` is
 * forced open, `false` forced closed. A boolean cannot express the resting
 * state, and the first version of this component used one and had a defect that
 * only a measurement found:
 *
 *   ESCAPE CLOSED THE STATE AND THE NAV STAYED OPEN. Escape returns focus to
 *   the toggle - it has to, or the keyboard user is dropped at the top of the
 *   document - and the toggle is INSIDE the bar, so `:focus-within` immediately
 *   re-opened what Escape had just closed. Measured in a browser: after
 *   Escape, `aria-expanded` was `false` and `data-open` was gone while the
 *   computed `grid-template-rows` was still `566.406px`. Both halves reported
 *   success and the picture did not move. An explicit close must therefore beat
 *   an implicit open, which is what `data-closed` is for.
 *
 *   AND THE FORCED CLOSE HAS TO YIELD AGAIN, or it trades one defect for a
 *   worse one: the index's links stay in the tab order inside a zero-height
 *   `overflow: hidden` box, so a reader who pressed Escape and then tabbed
 *   forward would move focus into content they cannot see. `onFocus` clears the
 *   force for anything that is not the toggle itself, and leaving the bar with
 *   the pointer clears it too, so the state is sticky exactly as long as the
 *   gesture that set it.
 *
 * MOTION IS CSS AND NOTHING IS CONSTRUCTED. The open and close is a
 * `grid-template-rows: 0fr -> 1fr` transition declared in the stylesheet. There
 * is no rAF loop, no interval, no Web Animations object - so under
 * `prefers-reduced-motion: reduce` there is nothing to cancel, and the global
 * reduce block removes the transition itself. A10 measures that from outside:
 * `document.getAnimations()` is empty and `window.__zr.rafCalls` is zero after
 * the index has been opened by all three paths.
 */
export function ScreenDisclosure({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  /** `null` = follow hover and focus; `true` = forced open; `false` = forced shut. */
  const [forced, setForced] = useState<boolean | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const here = NAV_ENTRIES.find((s) => isActive(pathname, s.href));

  const close = useCallback(() => {
    setForced(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    // Registered only while forced open. A document listener that outlives the
    // state it serves is how one component ends up swallowing another's Escape.
    if (forced !== true) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [forced, close]);

  return (
    <header
      className="sysbar"
      role="banner"
      data-primitive="SysBar"
      data-ui="sysbar"
      {...(forced === true ? { "data-open": "" } : {})}
      {...(forced === false ? { "data-closed": "" } : {})}
      onPointerLeave={() => {
        setForced(null);
      }}
      onFocus={(e) => {
        // Anything inside the bar that is not the toggle wants the index open:
        // a link in a zero-height container is a focus trap a reader cannot
        // see. The toggle is excluded because Escape focuses it on the way out.
        if (e.target !== buttonRef.current) setForced(null);
      }}
    >
      <div className="sysbar-in">
        {children}
        <button
          type="button"
          className="here"
          ref={buttonRef}
          aria-expanded={forced === true}
          aria-controls="screens"
          data-ui="nav-toggle"
          onClick={() => {
            setForced((v) => v !== true);
          }}
        >
          <span className="here-idx" aria-hidden="true">
            {here?.idx ?? "--"}
          </span>
          <span className="here-label">{here?.label ?? "ZCashReveal"}</span>
          <svg className="here-chev" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 4l4 5 4-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">{forced === true ? "Hide the screen index" : "Show the screen index"}</span>
        </button>
      </div>
    </header>
  );
}
