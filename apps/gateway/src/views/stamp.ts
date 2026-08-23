/**
 * ISO instants from `packages/content` to rendered stamps.
 *
 * The corpus writes most case steps as a full `...T18:53:18Z` instant and one -
 * the 1 ZEC test deposit - as a bare `2025-12-24`. That is not a defect to
 * paper over: the research knows the day and not the minute, and the stamp says
 * so, so the rendered row shows a day where a day is all there is. Inventing a
 * midnight would be fabricating precision on a site whose whole argument is
 * about not doing that (LEDGER-02 Q3).
 */
import type { Stamp } from "@zcashreveal/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function stampFromIso(iso: string): Stamp {
  const full = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(iso);
  if (full !== null) {
    const [, y, mo, d, h, mi, s] = full;
    return {
      text: `${y}-${mo}-${d} ${h}:${mi}:${s}`,
      precision: "second",
      sortMs: Date.UTC(+(y as string), +(mo as string) - 1, +(d as string), +(h as string), +(mi as string), +(s as string)),
    };
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (day !== null) {
    const [, y, mo, d] = day;
    return {
      text: `${+(d as string)} ${MONTHS[+(mo as string) - 1] as string} ${y}`,
      precision: "day",
      sortMs: Date.UTC(+(y as string), +(mo as string) - 1, +(d as string)),
    };
  }
  throw new Error(`stampFromIso: unrecognised time "${iso}"`);
}
