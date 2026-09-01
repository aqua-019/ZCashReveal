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
 * The tip is whatever the page knows to be current - the WebSocket's `tip`
 * frame once one has arrived, and the document's own height before that, which
 * is why a fresh snapshot reads `snapshot age: 0 blocks` rather than a
 * pretended non-zero.
 *
 * Never negative: a snapshot ahead of the tip the page believes in is a reorg
 * or a stale tip frame, and reporting "-2 blocks" would be a measurement of
 * neither.
 */
export function snapshotAgeBlocks(snapshotHeight: number, tipHeight: number): number {
  const age = tipHeight - snapshotHeight;
  return age > 0 ? age : 0;
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
