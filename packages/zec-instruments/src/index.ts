/**
 * `@zcashreveal/instruments` - the pool-level estimators, in a package that two
 * apps may depend on and that depends on nothing but `@zcashreveal/types`.
 *
 * WHY THIS PACKAGE EXISTS, WHICH IS ALSO THE CONSTRAINT ON IT. HANDOFF-09 built
 * three instruments inside `apps/indexer/src/analysis/` and a publisher that
 * could not reach them, so `residual`, `drain`, `migrationHist` and `neffSeries`
 * published as `null` on every tip. That was not an oversight: the publisher's
 * image STRUCTURALLY cannot contain the indexer. Its Dockerfile copies `packages`
 * and `apps/publisher` and nothing else; its runtime stage copies named workspace
 * dists; its install stages carry no compiler ON PURPOSE, and
 * `@zcashreveal/indexer` depends on `zeromq@6`, a native addon. There is a fourth
 * reason that is about runtime rather than build: the indexer's package entry
 * imports its ZMQ subscriber, so importing the barrel at all would load a socket
 * layer into a process whose job is to write three keys per block.
 *
 * SO THE CONSTRAINT IS THE POINT OF THE PACKAGE, AND IT IS A GUARD RATHER THAN A
 * COMMENT. `scripts/check-instrument-deps.mjs` resolves this package's dependency
 * graph transitively through the workspace and fails if `zeromq` or
 * `@zcashreveal/indexer` appears anywhere in it. A sentence here would have been
 * satisfied by a reader agreeing with it; the guard is satisfied by nothing but
 * the graph. Adding a dependency to `package.json` is where a future session will
 * meet it.
 *
 * WHAT IS IN HERE AND WHY EACH FILE EARNED ITS PLACE. Three of the six are the
 * instruments L2's scope named. The other three are the leaves those three
 * import, and they moved because the alternative to moving a leaf is duplicating
 * it, which for a consensus height means two sources of truth for a number the
 * chain decides:
 *
 *   turnstile-accounting.ts  plan 3.1-3.3   the Unprovable Residual, the window
 *                                           selector, the Orchard drain
 *   migration-lens.ts        plan 3.4       ZIP 318 denomination distributions
 *   ironwood-birth.ts        plan 3.5       the N_eff series from Ironwood's birth
 *   claim-classifier.ts      needed by ironwood-birth: N_eff to a claim level
 *   entropy.ts               needed by ironwood-birth: log2 and its inverse
 *   activation-heights.ts    needed by turnstile-accounting for the exit-only
 *                                           height, and by the indexer's decoder
 *                                           and state layers, which import it
 *                                           from here now
 *
 * `activation-heights.ts` IS THE ONE A READER WILL QUESTION, so the reasoning is
 * here rather than left to be re-derived. It is not an instrument; it is a
 * zero-import module of consensus constants. It is in this package because
 * `turnstile-accounting.ts`'s exit-only law needs `orchardExitOnlyFrom`, and
 * because a package that is dependency-free cannot reach back into the app it
 * came from. The three options were: move it (taken), duplicate the constant
 * (rejected - two sources of truth for a consensus height is the defect this
 * project rates highest), or change `violatesExitOnly`'s signature to take the
 * height as a parameter (rejected - HANDOFF-09a is a MOVE, and a diff that also
 * changes an estimator's API is a diff whose gate cannot tell a move defect from
 * an estimator defect).
 */

/* The instruments L2's scope named - plan sections 3.1 to 3.5. */
export * from "./turnstile-accounting.js";
export * from "./migration-lens.js";
export * from "./ironwood-birth.js";

/* The leaves they import. Exported because the indexer imported them too. */
export * from "./claim-classifier.js";
export * from "./entropy.js";
export * from "./activation-heights.js";
