/**
 * The chain tip the scaffold renders from.
 *
 * HANDOFF-01 makes no network calls: this is a committed fixture matching the
 * mockup's stated tip (22 Aug 2026). HANDOFF-11 replaces `FIXTURE_TIP` with the
 * snapshot read and the WebSocket upgrade; every consumer already takes a
 * `ChainTip` argument, so nothing else changes when it does.
 *
 * The hash matters beyond display: it is the ambience seed, so the whole page
 * is a pure function of it (see lib/seed.ts).
 */

export interface ChainTip {
  /** Block height. A count, so `number` per the CLAUDE.md convention. */
  readonly height: number;
  /** Lowercase hex, no 0x. The ambience seed. */
  readonly hash: string;
  /** Block time, ms since epoch, UTC. */
  readonly timeMs: number;
  /** How far the rendered data is behind the tip. 0 = at the tip. */
  readonly snapshotAgeBlocks: number;
}

export const FIXTURE_TIP: ChainTip = {
  height: 3_456_854,
  // 64 hex characters. The mockup literal is 65 - one zero too many in the
  // leading run - and a block hash is 32 bytes exactly. Corrected here rather
  // than propagated; HANDOFF-11 replaces this with a validated `Hex` anyway.
  hash: "0000000005f3a9e7c1b2d4f8a6e3c0d9b7f5a2e4c8d1b6f3a9e7c1b2d4f8c21e",
  // 22 Aug 2026 14:58 UTC, the mockup's stated tip time.
  timeMs: Date.UTC(2026, 7, 22, 14, 58, 0),
  snapshotAgeBlocks: 0,
};

/** Pool identifiers, in the fixed display order the design system uses. */
export const POOL_ORDER = ["transparent", "sprout", "sapling", "orchard", "ironwood"] as const;

export type PoolKey = (typeof POOL_ORDER)[number];

/** The CSS custom property carrying each pool's hue. */
export const POOL_VAR: Record<PoolKey, string> = {
  transparent: "--p-transparent",
  sprout: "--p-sprout",
  sapling: "--p-sapling",
  orchard: "--p-orchard",
  ironwood: "--p-ironwood",
};

/**
 * The `.sw` modifier class per pool. The hue itself lives in the token layer
 * (globals.css `.sw.t`, `.sw.sp`, ...); this maps a pool to its class so no
 * component has to inline a colour. POOL_VAR remains for the few places that
 * genuinely need the custom property, such as a percentage-width flex band.
 */
export const POOL_SW: Record<PoolKey, string> = {
  transparent: "t",
  sprout: "sp",
  sapling: "sa",
  orchard: "o",
  ironwood: "i",
};

/**
 * The consensus rule that governs each lane.
 *
 * STATIC METADATA, NOT A MEASUREMENT, and separating it from the balances is
 * what lets `/pools` render its table when the gateway is unreachable. A rule
 * is a property of the protocol at a given upgrade; a balance is a reading of
 * the chain. They used to travel together inside `PoolsView.balances`, so the
 * whole table - rules included - was unavailable whenever the view was, which
 * made a fact nobody has to fetch depend on a fetch.
 */
export const POOL_RULE: Record<PoolKey, string> = {
  transparent: "public",
  sprout: "migration-only - ZIP 308",
  sapling: "Bal >= 0",
  orchard: "exit-only - ZIP 2006",
  ironwood: "Bal >= 0 - ZIP 209",
};

export const POOL_LABEL: Record<PoolKey, string> = {
  transparent: "Transparent",
  sprout: "Sprout",
  sapling: "Sapling",
  orchard: "Orchard",
  ironwood: "Ironwood",
};

/** Format a UTC block time the way the system bar renders it. */
export function fmtTipTime(timeMs: number): string {
  const d = new Date(timeMs);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} - ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * The chain tip a page renders, taken from the published document.
 *
 * WHY THIS REPLACES `FIXTURE_TIP` AT THE LAYOUT AND NOT EVERYWHERE. Every
 * consumer already takes a `ChainTip`, which is what this module's header
 * predicted, so the cutover is one call in `app/layout.tsx`. What it is NOT is
 * a second source of truth: the height, the hash and the time all come from the
 * one document the store resolved, so the ambience seed, the clock and the
 * staleness reading are a pure function of the same block.
 *
 * `snapshotAgeBlocks` IS ZERO HERE AND THAT IS NOT A PLACEHOLDER. The age is a
 * difference between the document's height and the tip the page knows, and on a
 * server render the document IS the tip the page knows. It becomes non-zero in
 * the browser when a `tip` frame arrives naming a later block, which is the one
 * moment the page learns the document is behind. A server-rendered non-zero age
 * would have to come from a clock comparison, and `SnapshotV1` carries two
 * timestamps for two different purposes precisely so that nobody measures
 * staleness against the reader's clock.
 */
export function tipFromSnapshot(doc: {
  readonly height: number;
  readonly hash: string;
  readonly time: string;
}): ChainTip {
  const parsed = Date.parse(doc.time);
  return {
    height: doc.height,
    hash: doc.hash,
    // `time` is validated as ISO 8601 by `snapshotV1Schema`, so `Date.parse`
    // cannot be NaN for a document that reached here. The fallback is not
    // defensive programming, it is the one branch a hand-built test fixture
    // could otherwise take into a `Invalid Date` render.
    timeMs: Number.isNaN(parsed) ? 0 : parsed,
    snapshotAgeBlocks: 0,
  };
}
