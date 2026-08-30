/**
 * `labelsVersion` - which `packages/content` labels build produced any label a
 * page renders.
 *
 * WHY IT IS DERIVED RATHER THAN READ. `snapshotV1Schema` requires a non-empty
 * string and `packages/content` publishes no version of its own: there is no
 * build stamp, no digest and no field in `labels.json` that says which revision
 * of the corpus this is. The three ways to satisfy the schema were to invent a
 * constant, to read the package's semver - which is `0.1.0` for every build this
 * project has made and will not change when a label does - or to derive
 * something from the labels themselves. Only the third answers the question the
 * field asks.
 *
 * WHAT IT IS: the number of labels and the newest `lastVerified` date among
 * them. Both are facts about the corpus, both change when the corpus changes in
 * a way a reader would care about, and both are reproducible by anyone holding
 * the same `packages/content`. It is NOT a content hash, which would be
 * stronger and would also change on a whitespace edit - the point is to let a
 * reader tell one labels build from another, not to attest to bytes.
 *
 * WHAT IT IS NOT: a claim about a label's correctness. Label provenance is
 * `labeller`, `method`, `confidence` and `sources[]`, and every one of those
 * travels with the label itself. This string identifies the build, and nothing
 * more.
 */

import { getLabels, type AddressLabel } from "@zcashreveal/content";

/**
 * Derive the version string.
 *
 * `none` FOR AN EMPTY CORPUS RATHER THAN AN EMPTY STRING, because
 * `snapshotV1Schema` requires `min(1)` and an empty corpus is a real state (a
 * checkout with the seeds not yet loaded). Saying `labels-0-none` publishes that
 * state; publishing `""` would fail the parse and take the whole document down
 * with it, which is exactly the empty dashboard the design forbids.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function labelsVersionOf(labels: ReadonlyArray<AddressLabel>): string {
  let newest: string | null = null;
  for (const l of labels) {
    // ISO dates compare correctly as strings, which is why `isoDateSchema`
    // exists rather than a `Date` on the wire. `null` rather than seeding the
    // comparison with `"none"`: that sentinel sorts ABOVE every digit in
    // ASCII, so it would have won every comparison and pinned the answer to
    // `none` for a non-empty corpus.
    if (newest === null || l.lastVerified > newest) newest = l.lastVerified;
  }
  return `labels-${labels.length}-${newest ?? "none"}`;
}

/** The version for the corpus this build carries. Reads `packages/content`'s JSON seeds. */
export function currentLabelsVersion(): string {
  return labelsVersionOf(getLabels());
}
