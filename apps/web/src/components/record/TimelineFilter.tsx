"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * The timeline's strand filter (HANDOFF-03 assertion A7).
 *
 * The 124 rows are rendered on the server, and the ones outside the active
 * category carry the `hidden` attribute, which the server sets from the
 * `category` search parameter. So `/timeline?category=EXPLOIT` shows the
 * exploit rows and nothing else with JavaScript switched off entirely, and the
 * chips below are real links in that state. A filter that only works once an
 * island has hydrated is a filter that has already failed the reader on a slow
 * connection.
 *
 * This island upgrades that to instant switching without a round trip, and
 * keeps the URL in step so a filtered view can be copied out of the address bar
 * and sent to someone. It does not re-render the rows - it could not, they are
 * server-rendered children carrying resolved sources - it toggles the same
 * `hidden` attribute the server set. One attribute, one meaning, no second
 * mechanism to disagree with the first.
 *
 * Year headings are never hidden. That is the mockup's behaviour and it is the
 * right one: a year whose rows are all filtered out still prints its numeral,
 * so the gaps in a strand stay visible. Filtering to LEAD and finding 2021
 * empty is information.
 *
 * `history.replaceState` throws in a sandboxed iframe whose `allow-same-origin`
 * is withheld. The platform throws it, nothing else can catch it, and losing
 * URL sync there is a small loss where throwing inside a click handler and
 * taking the filter down with it is not. A7 checks exactly this by stubbing the
 * method to throw.
 */

export interface FilterOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

/** The value that means "no filter". Not a category, so it can never collide with one. */
export const ALL = "ALL";

export function TimelineFilter({
  options,
  initial,
  children,
}: {
  readonly options: readonly FilterOption[];
  readonly initial: string;
  /** The server-rendered spine: year headings and rows, each row carrying `data-cat`. */
  readonly children: ReactNode;
}) {
  const [active, setActive] = useState(initial);
  const spine = useRef<HTMLDivElement | null>(null);

  const choose = useCallback((value: string) => {
    setActive(value);

    const host = spine.current;
    if (host !== null) {
      for (const row of host.querySelectorAll<HTMLElement>(".ev[data-cat]")) {
        row.hidden = value !== ALL && row.dataset["cat"] !== value;
      }
    }

    const url = new URL(window.location.href);
    if (value === ALL) url.searchParams.delete("category");
    else url.searchParams.set("category", value);
    try {
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // SecurityError, thrown by the platform inside a sandboxed iframe. The
      // rows are already filtered; only the address bar is stale, and that is
      // the smaller loss by a wide margin.
    }
  }, []);

  return (
    <>
      <div className="tl-filters" role="group" aria-label="Filter the record by strand">
        {options.map((o) => (
          <a
            key={o.value}
            className={o.value === ALL ? "chip" : `chip cat-${o.value}`}
            // A real link: the filter works before hydration, and a reader can
            // open one strand in a new tab.
            href={o.value === ALL ? "/timeline" : `/timeline?category=${o.value}`}
            aria-current={active === o.value ? "true" : undefined}
            onClick={(e) => {
              // A modified click is a request for a new tab, not for a filtered
              // view in this one. Leave it to the browser.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              choose(o.value);
            }}
          >
            {o.label}
            <span className="n">{o.count}</span>
          </a>
        ))}
      </div>
      <div className="tl" ref={spine} data-active-category={active}>
        {children}
      </div>
    </>
  );
}
