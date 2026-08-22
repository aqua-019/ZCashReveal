/**
 * The screen table. One source for the system bar, the route set, the metadata
 * titles and the assertion A7 route list, so a route can never exist without a
 * nav entry or be tested without being reachable.
 *
 * The two-digit index is the mockup's grammar ("00 SYSTEM", "01 BEWARE"): the
 * Record is numbered like evidence, not labelled like a menu.
 */

export interface Screen {
  /** Two-digit index, rendered before the label in the system bar. */
  readonly idx: string;
  readonly href: string;
  readonly label: string;
  /** Title tag and page eyebrow. */
  readonly title: string;
  /** One-line description; feeds the meta description and the page dek. */
  readonly dek: string;
  /** The Record is zero-motion and static; the Instrument is live. */
  readonly half: "record" | "instrument";
}

export const SCREENS: readonly Screen[] = [
  {
    idx: "00",
    href: "/",
    label: "Splash",
    title: "ZCashReveal",
    dek: "A public instrument for the turnstile, and a public record of the two windows in which Zcash's circuits were unsound.",
    half: "record",
  },
  {
    idx: "01",
    href: "/beware",
    label: "Beware",
    title: "Beware",
    dek: "The exploit ledger: what was found, when it was disclosed, how long the window stayed open, and whether it was ever detectable.",
    half: "record",
  },
  {
    idx: "02",
    href: "/contradictions",
    label: "Contradictions",
    title: "Contradictions",
    dek: "Marketing claims set against on-chain reality, each side carrying its own source and confidence.",
    half: "record",
  },
  {
    idx: "03",
    href: "/timeline",
    label: "Timeline",
    title: "Timeline",
    dek: "Launch, funding, governance, leadership, exploits and market, 2013 to today, filterable by category.",
    half: "record",
  },
  {
    idx: "04",
    href: "/network",
    label: "Network",
    title: "The Network",
    dek: "Who promotes, who holds, who pays whom - with the fairness panel that states what cuts the other way.",
    half: "record",
  },
  {
    idx: "05",
    href: "/track",
    label: "Track",
    title: "Track",
    dek: "Search the chain: addresses exactly, shielded activity as bounds. Transparent is exact; shielded is bounded, never named.",
    half: "instrument",
  },
  {
    idx: "06",
    href: "/method",
    label: "Method",
    title: "Method",
    dek: "How every number on this site is derived: the filter stack, the entropy bound, the claim levels, and what each one refuses to say.",
    half: "record",
  },
  {
    idx: "07",
    href: "/flows",
    label: "Flows",
    title: "Flows",
    dek: "Exchange inflows, the insider question, and reproducible case files - including the cases where the evidence does not support the claim.",
    half: "instrument",
  },
  {
    idx: "08",
    href: "/sources",
    label: "Sources",
    title: "Sources",
    dek: "Every claim resolves to a source URL, a confidence and a last-verified date. Unverified items are not published.",
    half: "record",
  },
] as const;

/** Every public route, in nav order. Assertion A7 walks exactly this list. */
export const ROUTES: readonly string[] = SCREENS.map((s) => s.href);

export function screenByHref(href: string): Screen | undefined {
  return SCREENS.find((s) => s.href === href);
}

/**
 * Active-state matcher. `/` is exact; everything else matches its own subtree
 * so `/address/t1...` will light `/track` when HANDOFF-04 adds those routes.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
