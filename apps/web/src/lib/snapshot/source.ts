/**
 * What a snapshot resolution produced, as a type both halves of the app can read.
 *
 * SPLIT FROM THE STORE ON PURPOSE, AND THE SPLIT IS ASSERTION A4's. The store
 * reads the managed store's server-only variables, and Next inlines a
 * `NEXT_PUBLIC_`-free
 * server variable nowhere - but only as long as no `'use client'` file
 * transitively imports the module that reads it. The staleness indicator is a
 * client component (it has to be: the marker A8 greps for must reach
 * `.next/static`, and a server component's strings do not), so it imports THIS
 * module and never `./store`.
 *
 * THE PREFIX ITSELF IS NOT SPELLED OUT ANYWHERE IN THIS FILE, and that is the
 * assertion rather than fastidiousness. A4's predicate is that no module the
 * client graph reaches carries the name at all - not merely that none READS it
 * - because the weaker predicate is the one that would have let the read-write
 * token through as a "mention" and is exactly the narrowing the A8 pair had to
 * make for a different reason. A comment cannot leak a credential, but a
 * predicate with an exception in it is a predicate whose next exception is
 * argued rather than refused. This module is imported by the staleness
 * indicator, which is a client component, so the name stays out of it and the
 * variables are named where they are read: `./store`, which nothing client-side
 * imports.
 *
 * `src/lib/env.ts` would have been the obvious home for the reads and is the
 * one place that breaks A4: its own docblock promises "the first server-side
 * reader arrives in HANDOFF-11", and it is already inside the client graph -
 * `env.ts` to `api/stream.ts` to `MempoolPanel.tsx`, which carries
 * `'use client'`. Recorded here because the next reader will have the same idea.
 */

/**
 * Which rung of the resolution order answered.
 *
 * The order is `docs/2.0/SNAPSHOT.md` §3 and HANDOFF-11 §3: the managed store's
 * REST endpoint first (edge-safe, read-only token), its TCP URL second (Node
 * runtime only), the gateway third, the bundled document last.
 */
export type SnapshotSource = "redis-rest" | "redis" | "gateway" | "fixture";

export const SNAPSHOT_SOURCES: readonly SnapshotSource[] = [
  "redis-rest",
  "redis",
  "gateway",
  "fixture",
];

/**
 * A rung that was CONFIGURED and did not answer.
 *
 * THIS TYPE IS THE WHOLE OF ASSERTION A13 AND IT IS WHY THE RESOLUTION IS NOT
 * A BARE `SnapshotV1`. §3: "An assertion here must fail when the FIRST source
 * is unreachable, not merely when the last one is." A resolution order that
 * quietly walks past a configured rung and renders the bundled fixture is a
 * stale site that renders and reports no fault - which is the failure that
 * emptied v0.2 production, one layer up.
 *
 * A rung that is NOT configured produces no fault: an unset managed-store variable
 * on a preview build is a deployment choice, not a fault. Only a rung whose
 * credentials are present and which then failed is recorded.
 */
export interface SnapshotFault {
  readonly rung: SnapshotSource;
  /** Client-safe. Never carries a URL, a token or a path. */
  readonly reason: string;
}

/** The document, where it came from, and every configured rung that did not answer. */
export interface ResolvedSnapshot {
  readonly doc: import("@zcashreveal/types").SnapshotV1;
  readonly source: SnapshotSource;
  readonly faults: readonly SnapshotFault[];
  /** When this resolution was performed, ms since epoch. Drives the memo, not the display. */
  readonly fetchedAtMs: number;
}

/**
 * How far the rendered document is behind the chain, in blocks.
 *
 * A DIFFERENCE OF HEIGHTS AND NOT OF CLOCKS, deliberately. `SnapshotV1` carries
 * both `time` (the block's own timestamp) and `publishedAt` (when the publisher
 * wrote it), and an age computed from either against the reader's clock would
 * measure clock skew as staleness. The site keeps time in blocks; so does this.
 *
 * Never negative: a snapshot ahead of the tip the page believes in is a reorg
 * or a stale tip frame, and reporting "-2 blocks" would be a measurement of
 * neither.
 *
 * THE ARITHMETIC ONLY. Whether the page is entitled to state this number at all
 * is {@link snapshotAge}'s question, and the two are separate because the answer
 * to the second was wrong for eleven routes while the first was always right.
 */
export function snapshotAgeBlocks(snapshotHeight: number, tipHeight: number): number {
  const age = tipHeight - snapshotHeight;
  return age > 0 ? age : 0;
}

/**
 * The age, or the fact that this page cannot know it.
 *
 * WHY THIS IS NOT A `number`, AND THE DEFECT IT CLOSES (HANDOFF-14 deliverable
 * 4). The tip is whatever the page knows to be current - the WebSocket's `tip`
 * frame once one has arrived, and the document's own height before that. On a
 * document resolved from the managed store or the gateway that fallback is
 * sound: the publisher wrote it at the tip, so "0 blocks" until a frame arrives
 * is a true statement that becomes truer.
 *
 * On the BUNDLED FIXTURE it is false, and it was live on `zcuck.xyz`. The
 * committed document names height 3,456,227; mainnet was at 3,470,402 on 3
 * September 2026; the fixture stream emits no `tip` frame at all, so the tip the
 * page "knows" was the fixture's own height and the bar read `snapshot age: 0
 * blocks - source: fixture` beside data 14,175 blocks old. Each field was true
 * on its own. Together they told a reader the page was current.
 *
 * That is the shape A13 exists against - a stale site that renders and reports
 * no fault - arriving through the one door A13 does not watch. A13 is about a
 * rung that was CONFIGURED and did not answer; nothing here failed. The fixture
 * is the last rung of a resolution order that ran correctly, and the false
 * statement is made by the AGE rather than by the source.
 *
 * SO THE UNKNOWN IS NARROW AND IT IS DELIBERATE. Only a `fixture` document with
 * no frame is unknown. A `redis-rest`, `redis` or `gateway` document with no
 * frame still reads `0 blocks`, because for those the publisher's height IS the
 * page's best evidence of the tip, and widening the unknown to them would
 * replace a true statement with a refusal to make one.
 */
export type SnapshotAge =
  | { readonly known: true; readonly blocks: number }
  | { readonly known: false; readonly reason: string };

/**
 * Decide whether the page may state an age, and what it is.
 *
 * ONE FUNCTION RATHER THAN A PREDICATE PLUS AN ARITHMETIC, so no caller can
 * compute the number and forget to ask whether it means anything - which is the
 * mistake the shipped code made, with `snapshotAgeBlocks` correct and nothing
 * asking the question.
 */
export function snapshotAge(args: {
  readonly snapshotHeight: number;
  readonly tipHeight: number;
  readonly source: SnapshotSource;
  readonly sawTipFrame: boolean;
}): SnapshotAge {
  if (args.source === "fixture" && !args.sawTipFrame) {
    return {
      known: false,
      reason: "a bundled document and no tip frame: nothing here knows the chain's height",
    };
  }
  return { known: true, blocks: snapshotAgeBlocks(args.snapshotHeight, args.tipHeight) };
}

/* -------------------------------------------------------------------------- */
/* The fallback marker, which is assertion A8 (the second of that pair)        */
/* -------------------------------------------------------------------------- */

/**
 * The literal the post-deploy smoke job greps for in the production bundle.
 *
 * WHAT IT PROVES, AND WHY A VERSION IS IN IT. A deployment can be green, serve
 * every route and still have shipped without the snapshot fallback - the exact
 * failure that emptied v0.2 production, where the page had nothing to render
 * when the VPS was unreachable. The marker is emitted by the staleness
 * indicator, which is the fallback's visible half: if the machinery is in the
 * bundle the marker is too, and if it is not, neither is.
 *
 * IT HAS TO REACH `.next/static` AND NOTHING ABOUT THE MANAGED STORE MAY. That
 * is the pair of constraints assertions A8 and A4 impose together, and it is
 * why this constant lives in `./source` - which the client imports and which
 * reads no environment - rather than in `./store`, which reads
 * the managed store's variables and which no client file may touch.
 *
 * A STRING CONSTANT AND NOT A COMMENT: a comment is stripped by the minifier,
 * and a marker that survives only in development output proves nothing about
 * the artefact a visitor loads.
 */
export const SNAPSHOT_FALLBACK_MARKER = "zr:snapshot-fallback:v1";
