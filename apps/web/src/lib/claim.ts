import type { ClaimLevel } from "@zcashreveal/types";

/**
 * The claim level in the words the site uses on /method, not the enum's
 * spelling.
 *
 * Its own module rather than a constant inside `EstimatePanel` because three
 * surfaces need it and one of them is `/reveal`'s Mode B pane, which is a
 * client island: importing it from `EstimatePanel` would pull that component,
 * `Chip` and the formatters into /reveal's bundle for the sake of four
 * strings. A gate round is why Mode B reads from a lookup at all - it used to
 * write the word "broad" into the sentence by hand, where the level the
 * ladder computes for the same figure is `aggregate_only`.
 */
export const CLAIM_TEXT: Readonly<Record<ClaimLevel, string>> = {
  aggregate_only: "aggregate only",
  broad_candidate_set: "broad candidate set",
  small_heuristic_set: "small heuristic set",
  requires_disclosure: "requires disclosure",
};
