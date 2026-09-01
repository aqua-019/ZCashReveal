/**
 * The screen table. One source for the system bar, the route set, the metadata
 * titles and the assertion A7 route list, so a route can never exist without a
 * nav entry or be tested without being reachable.
 *
 * THAT SENTENCE USED TO BE FALSE AND IS NOW ENFORCED (HANDOFF-04a, F-04a-3).
 * It claimed an invariant this file then broke ninety lines further down:
 * `/pools` and `/reveal` are top-level user-facing pages, they had no nav
 * entry, and the comment on `TRACK_FAMILY` argued the exclusion in a paragraph
 * the docblock above it contradicted outright. A file that states an invariant
 * in one place and carves an exception out of it in another has no invariant,
 * only two opinions. `scripts/check-nav-routes.mjs` now decides: every
 * user-facing static route under `src/app` has an entry in `NAV_ENTRIES` or is
 * named in that guard's own exclusion list with a reason.
 *
 * THE OLD ARGUMENT FOR THE EXCLUSION IS ANSWERED RATHER THAN IGNORED, and it
 * had two halves. The half that was simply wrong: it called the bar "a
 * seven-item screen index" when `SCREENS` has held nine since HANDOFF-03, and
 * called `TRACK_FAMILY` "six sub-views of one of those seven" when one of the
 * six IS `/track` itself, so there were five. The half that was right: putting
 * `/pools` in the numbered sequence would say it is a peer of the whole Record.
 * The approved composition answers that without renumbering anything - the bar
 * groups by `half`, and `/pools` and `/reveal` sit inside The Instrument as
 * UNNUMBERED views, carrying `idx: "--"`. The numbered sequence stays exactly
 * what it was: nine screens, `00` through `08`, consecutive and closed.
 *
 * The two-digit index is the mockup's grammar ("00 SYSTEM", "01 BEWARE"): the
 * Record is numbered like evidence, not labelled like a menu. A reader called
 * it a mission select, and the fix is not to drop the numbering - it is to
 * render the `dek` that was already written beside every one of them, which is
 * what `ScreenNav` now does. The numbering was never the thing that said
 * nothing; the label beside it was.
 */

/** The index an unnumbered instrument view carries in place of a two-digit one. */
export const UNNUMBERED = "--" as const;

export interface Screen {
  /**
   * Two-digit index, rendered before the label in the system bar - or
   * `UNNUMBERED` for an instrument view that is deliberately outside the
   * numbered Record sequence.
   */
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

/**
 * The unnumbered instrument views.
 *
 * Real top-level pages with their own `page.tsx`, their own titles and their
 * own readers, which the bar did not carry until HANDOFF-04a. They are a
 * SEPARATE LIST rather than two more members of `SCREENS`, because the two
 * lists answer different questions and collapsing them would lose one of the
 * answers: `SCREENS` is the numbered Record-and-Instrument sequence, closed at
 * nine and consecutive from `00`, which `nav.test.ts` pins; `NAV_ENTRIES` is
 * what the system bar renders. Adding `idx: "--"` members to `SCREENS` would
 * have made "unique two-digit index" false, and the honest repair for that is
 * a second list rather than a weaker assertion.
 *
 * `/pools` in particular is not cosmetic: it is the page the turnstile plane is
 * about, and it was unreachable from the bar.
 */
export const VIEWS: readonly Screen[] = [
  {
    idx: UNNUMBERED,
    href: "/pools",
    label: "Pools",
    title: "Pools",
    dek: "Balances at the tip, per lane, with the rule that governs each one.",
    half: "instrument",
  },
  {
    idx: UNNUMBERED,
    href: "/reveal",
    label: "Reveal",
    title: "Reveal",
    dek: "Open your own balance with a viewing key, in this browser only. The key never leaves it.",
    half: "instrument",
  },
] as const;

/**
 * What the system bar renders, in bar order: the nine numbered screens, then
 * the unnumbered instrument views. `ScreenNav` groups this by `half`.
 */
export const NAV_ENTRIES: readonly Screen[] = [...SCREENS, ...VIEWS];

/** Every public route, in nav order. Assertion A7 walks exactly this list. */
export const ROUTES: readonly string[] = NAV_ENTRIES.map((s) => s.href);

export function screenByHref(href: string): Screen | undefined {
  return NAV_ENTRIES.find((s) => s.href === href);
}

/**
 * The Tracking suite's sub-views.
 *
 * They are top-level rather than nested under `/track` because HANDOFF-04's
 * section 5 names them that way in four separate machine-checkable assertions -
 * `/address/t3ev37Q2...`, `/tx/7ae8...`, `/pools`, `/reveal?addr=u1...` - and
 * three handoffs of ledger say that a spec which only passes under a charitable
 * reading is a spec nobody can run. The cost is that subtree matching no longer
 * lights the right screen for them, which is what this list fixes.
 *
 * `/pools` AND `/reveal` LEFT THIS LIST IN HANDOFF-04a. They now carry their
 * own nav entries, so lighting `/track` for them would light two entries at
 * once - the sub-view's own and its former parent's. What remains here is the
 * three routes that genuinely have no entry of their own and never will:
 * `/address/<addr>`, `/tx/<txid>` and `/block/<height>` are dynamic segments,
 * one page per value, and a bar cannot carry them.
 */
export const TRACK_FAMILY: readonly string[] = ["/track", "/address", "/tx", "/block"];

/**
 * Active-state matcher. `/` is exact; everything else matches its own subtree,
 * and `/track` additionally matches its family, so `/address/t3ev37Q2...`
 * lights the Track item in the system bar rather than nothing at all.
 *
 * `/pools` and `/reveal` now match themselves, which is the point of giving
 * them entries.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/track") {
    return TRACK_FAMILY.some((base) => pathname === base || pathname.startsWith(`${base}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The bar's two groups, in bar order, each with the entries that belong to it.
 *
 * `half` has been on every screen since HANDOFF-01 and nothing rendered it.
 * Nine undifferentiated items read as a mission select; two named groups read
 * as two purposes, which is the whole of the fix for the first complaint.
 */
export interface NavGroup {
  readonly half: Screen["half"];
  /** The group heading, as the bar prints it. */
  readonly heading: string;
  readonly entries: readonly Screen[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    half: "record",
    heading: "The Record",
    entries: NAV_ENTRIES.filter((s) => s.half === "record"),
  },
  {
    half: "instrument",
    heading: "The Instrument",
    entries: NAV_ENTRIES.filter((s) => s.half === "instrument"),
  },
];
