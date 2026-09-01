/**
 * A named absence: a panel that has no measurement, saying so and saying why.
 *
 * THE RULE IT IMPLEMENTS IS `docs/2.0/SNAPSHOT.md` section 8.1, AND IT IS THE
 * ONE HANDOFF-11 MAY NOT WEAKEN. "A renderer receiving `null` for a panel MUST
 * NOT draw the panel's chrome around no data - no empty axes, no zero-height
 * bars, no flat line at the baseline, no `0` in a figure slot. It renders a
 * named absence stating the CONDITION that produced it."
 *
 * The dishonesty in an empty panel is not that it is empty. It is that an empty
 * chart RENDERS AS A MEASUREMENT OF ZERO: a flat drain line reads to every
 * visitor as "the pool is not draining", which is a claim this site has not
 * made and cannot support.
 *
 * A CONDITION AND NEVER AN OWNER. The `owner` form - "needs a block-time
 * source, HANDOFF-09b" - was the original wording and was corrected against
 * this project's own experience: an owner is a live statement on the wire and
 * decays silently, so a prediction that outlives its subject reads as a fact.
 * `apps/gateway/src/views/pools.ts` records the same finding and answers it the
 * same way. A condition does not decay. So this component takes `condition` and
 * has nowhere to put a handoff number, which is the enforcement rather than the
 * request.
 */
export function NotMeasured({
  panel,
  condition,
}: {
  /** What is absent, in the reader's words: "drain", "N_eff series". */
  readonly panel: string;
  /** Why, as a condition of the world rather than a plan: "no block time or no baseline for this height". */
  readonly condition: string;
}) {
  return (
    <p className="notmeasured" data-ui="not-measured" data-panel={panel}>
      <b>{panel}: not measured</b> - {condition}
    </p>
  );
}
