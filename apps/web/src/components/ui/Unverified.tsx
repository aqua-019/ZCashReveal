import { Chip } from "./Chip";

/**
 * The `UNVERIFIED` chip: this panel's numbers did not come back checkable.
 *
 * WHERE IT GOES, AND IT NEVER COLLAPSES. Fold 2 of the L2 RESOLUTION for
 * HANDOFF-04b puts it "in the chip row beside the claim, with `confidence` and
 * `lastVerified`, and it NEVER collapses: epistemic status behind a toggle is
 * the null-panel-renders-as-zero defect in a nicer coat." So this is a plain
 * inline element and never a `<summary>` child, and assertion A12's fail side
 * is exactly the move of putting it inside a `<details>` body.
 *
 * IT CARRIES ITS REASON. A chip reading `UNVERIFIED` and nothing else tells a
 * reader that something is wrong and gives them no way to tell whether the
 * gateway is down or this build is reading a schema it does not understand.
 * `SNAPSHOT.md` section 8.1's rule for an absent panel is that it names the
 * CONDITION that produced it, never an owner; the same rule applies one step
 * over, to a panel that is present and unchecked.
 *
 * THE TONE IS `warn` AND NOT `danger`. `danger` is reserved for Beware
 * severity and nothing else (CLAUDE.md), and gold is reserved for four jobs
 * none of which is this. An unverified panel is a statement about what this
 * page could check, not a finding about Zcash.
 */
export function Unverified({ reason }: { readonly reason: string }) {
  return (
    <span className="unverified" data-ui="unverified">
      <Chip tone="warn">UNVERIFIED</Chip>{" "}
      <span className="unverified-why">{reason}</span>
    </span>
  );
}
