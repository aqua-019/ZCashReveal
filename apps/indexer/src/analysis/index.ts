export * from "./candidate-set.js";
export * from "./constants.js";
export * from "./scoring.js";
export * from "./assessment.js";
export * from "./round-trip.js";
/* HANDOFF-08's toolkit - TRACKING-MATH sections 1, 3 and 4. */
export * from "./echo.js";
export * from "./clustering.js";
export * from "./labels.js";
export * from "./posterior.js";
export * from "./taint.js";
export * from "./conservation.js";

/**
 * HANDOFF-09's instruments and the two leaves they share, re-exported from
 * `@zcashreveal/instruments`, into which HANDOFF-09a moved them.
 *
 * NAMED ONE BY ONE RATHER THAN `export *`, and the reason is the whole point of
 * this block. The package also contains `activation-heights.ts`, which this
 * barrel has NEVER exported - it lived under `decoder/` and the indexer's state
 * and decoder layers import it directly. An `export * from
 * "@zcashreveal/instruments"` here would have quietly added about twenty
 * consensus-height constants to this barrel's surface, which is a widening
 * rather than a move, and HANDOFF-09a's own A7 asserts this list is unchanged by
 * comparing it as a sorted set. So the names are written out: the list below is
 * exactly what `./entropy.js`, `./claim-classifier.js`,
 * `./turnstile-accounting.js`, `./migration-lens.js` and `./ironwood-birth.js`
 * exported from this file before the move, and a symbol added to the package
 * does not reach this barrel until someone adds it here on purpose.
 */
export {
  /* entropy.ts */
  effectiveSetSize,
  entropyBitsUniform,
  /* claim-classifier.ts */
  classifyByEffectiveSet,
  /* turnstile-accounting.ts - plan sections 3.1 to 3.3 */
  orchardDrain,
  selectWindow,
  turnstileResidual,
  violatesExitOnly,
  /* migration-lens.ts - plan section 3.4 */
  migrationLens,
  violatesDenominationBounds,
  /* ironwood-birth.ts - plan section 3.5 */
  ironwoodBirth,
  violatesBirthBound,
} from "@zcashreveal/instruments";

export type {
  /* turnstile-accounting.ts */
  OrchardDrain,
  PoolBalanceSample,
  TurnstileResidual,
  WindowSelection,
  /* migration-lens.ts */
  Crossing,
  DenomBucket,
  MigrationLens,
  /* ironwood-birth.ts */
  IronwoodBirth,
  IronwoodSpend,
  NeffPoint,
} from "@zcashreveal/instruments";
