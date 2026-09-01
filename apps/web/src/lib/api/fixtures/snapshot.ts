import { getStats } from "@zcashreveal/content";
import { snapshotV1Schema, type SnapshotMigrationHist, type SnapshotV1 } from "@zcashreveal/types";

import { FIXTURE_TIP } from "@/lib/chain";

/**
 * A `SnapshotV1` in fixture mode, so the turnstile plane can be built and
 * asserted before HANDOFF-11 wires the published document.
 *
 * IT IS DERIVED, NOT TYPED OUT, AND THAT IS ASSERTION A1. The splash renders
 * pool balances twice - once as the metric row and once as the plane's five
 * nodes - and two renderings of one quantity that do not share a source is the
 * defect this handoff's first assertion exists against. So the lanes below come
 * from `getStats()`, which is the same call the metric row already makes, and
 * there is no pool figure written into this file at all. A balance can be wrong
 * here, but it cannot be inconsistent.
 *
 * `apps/web` HAS NO SNAPSHOT READ PATH TODAY and this does not add one.
 * `NEXT_PUBLIC_SNAPSHOT_URL` is read in exactly two places - `lib/env.ts`, whose
 * export nothing imports, and `next.config.ts`, for a CSP `connect-src` entry -
 * and `lib/api/index.ts` hard-wires `FixtureApi` and deliberately ignores
 * `DataMode`. Fetching a document is HANDOFF-11's, and doing it here would be
 * the live wiring this handoff puts out of scope. What this file supplies is
 * the SHAPE: the plane takes a `SnapshotV1`, so the cutover replaces this
 * function and changes nothing else.
 *
 * THE DOCUMENT IS PARSED BY ITS OWN SCHEMA ON THE WAY OUT. A fixture that does
 * not satisfy `snapshotV1Schema` is a fixture that would prove nothing about the
 * real document, and the refinement on `neffSeries` is the sort of invariant a
 * hand-built object gets wrong silently.
 */

/**
 * The migration lens, in fixture form.
 *
 * The only crossing count `SnapshotV1` carries, and the only one the plane
 * draws: ZIP 318 crossings, Orchard exiting to Ironwood, over the window
 * `[lowHeight, highHeight]`. Every other pool boundary is absent from the
 * document, which is why the plane says "not measured" under the other three
 * lanes rather than "0".
 *
 * The window is 1,152 blocks - about a day at the nominal spacing, and the
 * plane states it in BLOCKS because blocks are what the document carries. There
 * is no block time for `lowHeight` anywhere in a snapshot, so "24 h" would be a
 * conversion through an assumed block interval rather than a reading.
 *
 * The counts, the sum and the bounds are the approved composition's figures
 * (`docs/2.0/mockups/04a-splash-record.html`), which is what makes the built
 * page comparable to the study by eye.
 */
const MIGRATION_HIST: SnapshotMigrationHist = {
  lowHeight: 3_455_076,
  highHeight: 3_456_227,
  buckets: [
    { n: 1, kZatoshi: 12, kZec: 4, count: 61, sumZat: 61_000_000_000_000n },
    { n: 5, kZatoshi: 11, kZec: 3, count: 214, sumZat: 107_000_000_000_000n },
    { n: 2, kZatoshi: 11, kZec: 3, count: 355, sumZat: 71_000_000_000_000n },
    { n: 1, kZatoshi: 11, kZec: 3, count: 402, sumZat: 40_200_000_000_000n },
    { n: 5, kZatoshi: 10, kZec: 2, count: 219, sumZat: 10_950_000_000_000n },
  ],
  canonicalCount: 1_251,
  // A crossing outside the canonical ladder is a finding, never a rejection -
  // the chain is the authority on what happened - so it is counted and drawn
  // like any other. 1,251 + 33 = 1,284, which is the figure the study shows.
  nonCanonicalCount: 33,
  sumZat: 412_085_000_000_000n,
  strandedDustZat: 41_200_000n,
  minNotes: 42,
  maxWallets: 1_284,
  denominationRuns: 96,
};

/** The fixture document. Built fresh per call: nothing here is mutable state. */
export function fixtureSnapshot(): SnapshotV1 {
  const stats = getStats();

  const doc = {
    schema: 1 as const,
    height: stats.height,
    hash: FIXTURE_TIP.hash,
    time: new Date(FIXTURE_TIP.timeMs).toISOString(),
    // Distinct from `time` on purpose: staleness is measured from the publish,
    // and a fixture that made them equal would hide a whole class of bug at the
    // cutover. One block behind the tip time.
    publishedAt: new Date(FIXTURE_TIP.timeMs + 75_000).toISOString(),
    pools: stats.pools.map((p) => ({
      lane: p.bucket,
      balanceZat: p.zatoshi,
      // `sharePct` is a percentage and `share` is a fraction in [0, 1]. The
      // schema's `.max(1)` is what catches this being forgotten.
      share: p.sharePct / 100,
    })),
    residual: null,
    drain: null,
    migrationHist: MIGRATION_HIST,
    neffSeries: null,
    lastReports: [],
    labelsVersion: `fixture-${stats.asOf}`,
  };

  return snapshotV1Schema.parse(doc);
}
