/**
 * HANDOFF-09a's assertion A7: every symbol the indexer previously imported from
 * the three moved estimators still resolves, and the barrel gained nothing.
 *
 * WHY A MOVE NEEDS THIS AND A REFACTOR DOES NOT. `tsc` catches a symbol that
 * stopped resolving at an import SITE, so a name dropped from this barrel is
 * only invisible while nothing imports it - and nothing in this repository
 * imports `analysis/index.ts` today. That makes the barrel a published surface
 * with no consumer, which is precisely the kind of surface a move erodes without
 * anybody noticing: the next handoff to import it would find a name missing and
 * have no way to tell whether it had ever been there.
 *
 * AND THE WIDENING IS CHECKED TOO, WHICH IS THE HALF A NAIVE VERSION WOULD MISS.
 * The estimators moved into `@zcashreveal/instruments`, which ALSO contains
 * `activation-heights.ts` - about twenty consensus-height constants that lived
 * under `decoder/` and that this barrel has never exported. An
 * `export * from "@zcashreveal/instruments"` would have compiled, passed every
 * other test, and quietly widened this barrel by twenty names. So the list below
 * is asserted as a SET EQUALITY rather than as a subset: a missing name and an
 * added name both fail, and the message says which.
 */

import { describe, expect, it } from "vitest";

import * as barrel from "../index.js";

/**
 * Exactly what `./entropy.js`, `./claim-classifier.js`,
 * `./turnstile-accounting.js`, `./migration-lens.js` and `./ironwood-birth.js`
 * contributed to this barrel at 2c5b951, the commit before the move.
 *
 * Extracted mechanically from those five files' `export` lines at that commit,
 * not typed from memory. Type-only exports are absent because they do not exist
 * at runtime; the value exports below are what `import *` can see.
 */
const MOVED_VALUE_EXPORTS = [
  /* entropy.ts */
  "effectiveSetSize",
  "entropyBitsUniform",
  /* claim-classifier.ts */
  "classifyByEffectiveSet",
  /* turnstile-accounting.ts - plan sections 3.1 to 3.3 */
  "orchardDrain",
  "selectWindow",
  "turnstileResidual",
  "violatesExitOnly",
  /* migration-lens.ts - plan section 3.4 */
  "migrationLens",
  "violatesDenominationBounds",
  /* ironwood-birth.ts - plan section 3.5 */
  "ironwoodBirth",
  "violatesBirthBound",
] as const;

/**
 * Names the barrel must NOT have gained. Each is a real export of
 * `@zcashreveal/instruments` that lived under `decoder/activation-heights.ts`
 * before the move and was never part of this barrel.
 */
const MUST_NOT_LEAK = [
  "NU6_3_ACTIVATION_MAINNET",
  "NU6_3_ACTIVATION_TESTNET",
  "SAPLING_ACTIVATION_MAINNET",
  "orchardExitOnlyFrom",
  "poolsActiveAt",
  "isPoolActiveAt",
  "IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP",
] as const;

describe("A7 - the analysis barrel's surface survived the move", () => {
  it("A7 PASS STATE: every symbol the three estimators and their two leaves contributed still resolves", () => {
    const present = MOVED_VALUE_EXPORTS.filter((name) => name in barrel);
    // Compared as sorted lists rather than by eye, and asserted as a whole so the
    // failure names every missing symbol rather than stopping at the first.
    expect([...present].sort()).toEqual([...MOVED_VALUE_EXPORTS].sort());
  });

  it("A7 every one of them is callable, not merely a bound name", () => {
    // `in` is satisfied by an `undefined` value, which is what a broken
    // re-export chain produces. Checking the type is what makes the previous
    // assertion mean something.
    for (const name of MOVED_VALUE_EXPORTS) {
      expect(typeof (barrel as Record<string, unknown>)[name], `${name} is not a function`).toBe("function");
    }
  });

  it("A7 FAIL SIDE OF THE WIDENING: the barrel did not gain activation-heights", () => {
    const leaked = MUST_NOT_LEAK.filter((name) => name in barrel);
    expect(
      leaked,
      `these came in from @zcashreveal/instruments and were never part of this barrel: ${leaked.join(", ")}`,
    ).toEqual([]);
  });

  it("A7 the barrel still carries the modules that did NOT move, so this is a move and not a rewrite", () => {
    // ONE NAME FROM EACH UNMOVED MODULE, asserted by presence. Every assertion
    // above is scoped to the moved set and to the leak set, so a barrel that had
    // silently dropped `echo`, `clustering` or `taint` would pass all of them -
    // those names appear in neither list.
    //
    // THE FIRST DRAFT OF THIS TEST WAS `expect(name in barrel || true).toBe(true)`,
    // which is true for every input including an empty barrel. That is the exact
    // shape LEDGER-09 fold 4 asks HANDOFF-13 to specify a guard for - an
    // assertion whose predicate admits every value it was written to exclude -
    // and it was written here by the session that recorded the fold. Left on the
    // record rather than quietly replaced, because the shape's third instance is
    // what warranted the guard and this would have been a fourth.
    const UNMOVED = [
      "matchEcho", // echo.ts
      "clusterByCommonInput", // clustering.ts
      "labelsFor", // labels.ts
      "computePosterior", // posterior.ts
      "estimateTaint", // taint.ts
      "enforceConservation", // conservation.ts
      "rawCandidateRange", // candidate-set.ts
      "assessRaw", // assessment.ts
      "amountLikelihood", // scoring.ts
      "findSubsetSum", // round-trip.ts
      "ZIP317_MARGINAL_FEE_ZAT", // constants.ts
    ] as const;
    const missing = UNMOVED.filter((name) => !(name in barrel));
    expect(missing, `the barrel lost these unmoved symbols: ${missing.join(", ")}`).toEqual([]);
  });
});
