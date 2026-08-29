/**
 * Module 8E - the flow estimate over hops, "taint" (TRACKING-MATH section 4).
 *
 * "From a transparent address, follow value through `k <= 3` boundary crossings
 * multiplying `p_j` along paths; display edges with opacity proportional to
 * weight and a 'mass unresolved in pool' residual bar. Cut when `p < 0.02`. The
 * residual is shown as a first-class number because it is the honest answer most
 * of the time."
 *
 * THE RESIDUAL IS THE OUTPUT. That sentence in section 4 is the specification
 * and it is easy to read as a caveat on the real result. It is the other way
 * round: on a shielded chain the mass that stays unresolved is what the
 * measurement actually establishes, and the resolved paths are the small
 * remainder. So `unresolvedMass` is a required field beside the edges, and
 * `estimateTaint` accounts for every unit of the starting mass:
 * `unresolvedMass + resting.terminal + resting.hopLimit` is `startingMass`,
 * reported as `accountedMass` so a caller can assert it rather than recompute
 * it. A taint graph whose weights do not account for the input is a picture
 * rather than an estimate.
 *
 * THAT SUM IS FLOATING-POINT AND THE ASSERTION MUST BE TOO. The mass is
 * repeatedly multiplied by normalised shares and re-summed, so `accountedMass`
 * is `startingMass` up to accumulated representation error and `===` is the
 * wrong comparison: three edges of `p = 1/3` already return 0.9999999999999999
 * for a starting mass of 1. Callers - and this module's own tests - compare
 * within a tolerance. The docblock used to say `===`, which is the kind of
 * claim that reads as rigour and would have made a correct implementation fail
 * its own contract.
 *
 * WHY "TAINT" IS IN QUOTES EVERYWHERE IN THIS PROJECT. The word comes from
 * Bitcoin forensics, where it means a deterministic property of a UTXO graph.
 * Nothing here is deterministic and nothing here is a property of a coin: this
 * is a probability mass flowing along edges each of which is a HEURISTIC link
 * with its own claim level. The module keeps the name because the literature
 * does, and refuses the semantics: it never returns a set of "tainted"
 * addresses, only a mass distribution with an explicit unresolved share.
 *
 * THREE HOPS, AND WHY THE CUT MATTERS MORE THAN THE DEPTH. At an edge weight of
 * 0.5 - a strong link by this project's standards - three hops is 0.125, well
 * above the cut. At 0.2, which is an ordinary MEDIUM-ish weight, two hops is
 * 0.04 and three is 0.008, which the cut removes. So in practice the `p < 0.02`
 * rule is what bounds the graph and `k <= 3` is the backstop; a change to the
 * cut changes the output far more than a change to the depth, which is worth
 * knowing before anyone tunes either.
 */

import type { Hex } from "@zcashreveal/types";

/** Section 4's cut: an edge below this probability is not followed or displayed. */
export const TAINT_CUT_P = 0.02;

/** Section 4's `k <= 3`. */
export const MAX_TAINT_HOPS = 3;

/**
 * One heuristic hop: value leaving `from` and arriving at `to` with probability
 * `p`.
 *
 * `p` IS THE POSTERIOR OF A LINK, NOT A FRACTION OF THE VALUE. Two edges out of
 * one node do not have to sum to 1: they are competing explanations of the same
 * mass, not a split of it. That is why `estimate()` normalises the outgoing
 * edges of each node rather than trusting them to be a distribution - and why
 * the unresolved share exists at all, since the normalisation is what reveals
 * how much of the mass no edge explains.
 */
export interface TaintEdge {
  readonly from: Hex;
  readonly to: Hex;
  readonly p: number;
  /** What this edge asserts, for the assumption line the UI prints. */
  readonly what: string;
}

/** One node reached, with the mass that reached it and how far away it is. */
export interface TaintNode {
  readonly txid: Hex;
  readonly mass: number;
  readonly hops: number;
}

export interface TaintEstimate {
  /** Every node reached above the cut, including the origin at hop 0. */
  readonly nodes: ReadonlyArray<TaintNode>;
  /** Every edge followed, with the mass that flowed along it. */
  readonly followed: ReadonlyArray<TaintEdge & { readonly mass: number }>;
  /**
   * The share of the starting mass that no link accounts for.
   *
   * TWO CAUSES, AND NEITHER IS "THE TRAIL ENDED". Mass becomes unresolved when
   * the outgoing links of a node do not sum to 1 - the share none of them
   * explains - or when the only link that would carry it is below the cut. Mass
   * that reached a transaction and STOPPED there is not unresolved: it is
   * resting at a named destination, which is a result. See `resting`.
   *
   * THE FIRST DRAFT OF THIS MODULE GOT THIS WRONG AND THE ERROR WAS TOTAL. It
   * drained the whole final frontier into this field, so every unit of mass
   * eventually became unresolved and the number was `startingMass` on every
   * input - a residual bar permanently at 100 per cent, which would have looked
   * like appropriate humility rather than a broken measurement. It is recorded
   * here because the failure mode is specific to this project: a number that is
   * always maximally cautious is the hardest kind of wrong number to notice.
   */
  readonly unresolvedMass: number;
  /** Why mass went unresolved. The two causes are not equivalent. */
  readonly unresolvedBy: {
    /** The outgoing links did not sum to 1; this is the share none explained. */
    readonly unexplained: number;
    /** The only links available were below `cutP`, so they were not followed. */
    readonly belowCut: number;
  };
  /**
   * Mass that came to rest at a named transaction, and why it stopped.
   *
   * `terminal` is a trail that genuinely ends - no outgoing link at all.
   * `hopLimit` is a trail this estimate stopped following, with links still
   * available, and it is the one a caller can do something about by raising
   * `maxHops`. Collapsing the two would hide which knob to turn.
   */
  readonly resting: {
    readonly terminal: number;
    readonly hopLimit: number;
  };
  /**
   * `unresolvedMass + resting.terminal + resting.hopLimit`, which is
   * `startingMass` up to floating-point accumulation. Carried explicitly so a
   * caller can assert conservation rather than recompute the sum and trust it -
   * and compared with a tolerance, never with `===`. See the module docblock.
   */
  readonly accountedMass: number;
  readonly assumptions: ReadonlyArray<string>;
}

export interface TaintOptions {
  readonly maxHops?: number;
  readonly cutP?: number;
  /** Mass at the origin. Default 1, i.e. the answer is a share. */
  readonly startingMass?: number;
}

/**
 * Follow probability mass from `origin` along `edges`, at most `maxHops` deep,
 * cutting below `cutP`.
 *
 * BREADTH-FIRST BY HOP, NOT DEPTH-FIRST, so the hop limit means what it says
 * even when the graph has cycles: a node reached again at a greater depth
 * receives more mass rather than restarting the walk. Cycles are possible here -
 * value can return to an address it left - and a depth-first walk over one would
 * not terminate.
 *
 * A NON-FINITE WEIGHT IS TREATED AS ZERO, NOT PROPAGATED. `NaN` or `Infinity`
 * in an edge's `p` - or in `startingMass` - would flow through the
 * normalisation into every downstream number, including the residual bar the
 * UI prints as this module's headline result, and `NaN` compares false against
 * every threshold so no conservation check would catch it. A weight that is not
 * a finite number is not a probability, so it carries no mass. The estimator
 * does not throw: it is pure and its callers are batch consumers, and a bad
 * edge in one window should not lose the window.
 *
 * Pure. No I/O, no clock, no mutation of the inputs.
 */
export function estimateTaint(
  origin: Hex,
  edges: ReadonlyArray<TaintEdge>,
  options?: TaintOptions,
): TaintEstimate {
  const maxHops = Math.min(options?.maxHops ?? MAX_TAINT_HOPS, MAX_TAINT_HOPS);
  const requestedCut = options?.cutP ?? TAINT_CUT_P;
  const cutP = Number.isFinite(requestedCut) ? requestedCut : TAINT_CUT_P;
  const requestedMass = options?.startingMass ?? 1;
  const startingMass =
    Number.isFinite(requestedMass) && requestedMass > 0 ? requestedMass : 0;

  const out = new Map<string, TaintEdge[]>();
  for (const e of edges) {
    const list = out.get(e.from);
    if (list === undefined) out.set(e.from, [e]);
    else list.push(e);
  }

  const nodes = new Map<string, TaintNode>();
  const followed: Array<TaintEdge & { mass: number }> = [];
  const unresolvedBy = { unexplained: 0, belowCut: 0 };
  const resting = { terminal: 0, hopLimit: 0 };

  // frontier: mass sitting at a node, waiting to be pushed one hop further.
  let frontier: Array<{ txid: Hex; mass: number }> = [{ txid: origin, mass: startingMass }];
  record(nodes, origin, startingMass, 0);

  let hop = 0;
  for (; hop < maxHops; hop += 1) {
    const next = new Map<string, { txid: Hex; mass: number }>();

    for (const { txid, mass } of frontier) {
      const outgoing = out.get(txid) ?? [];
      if (outgoing.length === 0) {
        // The trail ends at a named transaction. That is a RESULT, not a gap:
        // most trails end, and this is where the value came to rest.
        resting.terminal += mass;
        continue;
      }

      // NORMALISE THE OUTGOING WEIGHTS, AND CARRY THE SHORTFALL AS UNRESOLVED.
      // The edges are competing explanations, so their weights are a posterior
      // over "which of these, if any" - and the share none of them explains is
      // exactly `1 - sum(p)` when that is positive. Skipping this and treating
      // raw weights as fractions would silently create or destroy mass, which is
      // the conservation violation section 3.11 forbids.
      const total = outgoing.reduce((acc, e) => acc + safeP(e.p), 0);
      const explained = Math.min(1, total);
      if (explained < 1) unresolvedBy.unexplained += mass * (1 - explained);

      for (const e of outgoing) {
        const share = total <= 0 ? 0 : (safeP(e.p) / total) * explained;
        const carried = mass * share;
        if (carried <= 0) continue;

        // THE CUT IS ON THE EDGE PROBABILITY, NOT ON THE CARRIED MASS. Section 4
        // says "Cut when p < 0.02", and `p` there is the link's own posterior.
        // Cutting on carried mass instead would make an edge's survival depend
        // on how much value happened to be flowing, so the same link would be
        // shown for a large transfer and hidden for a small one.
        if (safeP(e.p) < cutP) {
          unresolvedBy.belowCut += carried;
          continue;
        }

        followed.push({ ...e, mass: carried });
        const existing = next.get(e.to);
        if (existing === undefined) next.set(e.to, { txid: e.to, mass: carried });
        else existing.mass += carried;
      }
    }

    frontier = [...next.values()];
    for (const n of frontier) record(nodes, n.txid, n.mass, hop + 1);
    if (frontier.length === 0) break;
  }

  // Whatever is still in flight when the hop limit is reached has ARRIVED at a
  // named transaction; it simply has not been followed further. It rests there,
  // classified by whether following it further would have been possible.
  for (const { mass, txid } of frontier) {
    const outgoing = out.get(txid) ?? [];
    if (outgoing.length === 0) {
      resting.terminal += mass;
      continue;
    }
    // THE TRAIL DID NOT END AND WAS NOT FOLLOWED, AND WHICH OF THOSE IT IS
    // DECIDES WHERE THE MASS GOES. `hopLimit` is a knob the caller can turn;
    // a trail whose every onward link is below the cut is one this estimate
    // REFUSES to draw, which is `belowCut` and therefore unresolved. Until
    // HANDOFF-08's gate this branch filed the second case as `terminal` - "the
    // value came to rest here" - so the same node was answered two different
    // ways depending on whether the hop limit happened to fall on it, and mass
    // the cut had discarded was reported as a destination.
    if (outgoing.some((e) => safeP(e.p) >= cutP)) resting.hopLimit += mass;
    else unresolvedBy.belowCut += mass;
  }

  const unresolvedMass = unresolvedBy.unexplained + unresolvedBy.belowCut;
  const accountedMass = unresolvedMass + resting.terminal + resting.hopLimit;
  const unresolvedShare = startingMass === 0 ? 0 : unresolvedMass / startingMass;
  const assumptions = [
    `Flow followed at most ${maxHops} boundary crossings, cutting links below p = ${cutP}.`,
    `${(unresolvedShare * 100).toFixed(1)} per cent of the starting mass is unresolved inside the pool - no link accounts for it. Of the rest, ${((resting.terminal / (startingMass || 1)) * 100).toFixed(1)} per cent rests at a transaction with no onward link and ${((resting.hopLimit / (startingMass || 1)) * 100).toFixed(1)} per cent was still moving when the hop limit stopped this estimate.`,
    "Each edge is a heuristic link with its own claim level, not a proof that value moved between the two transactions. Multiplying weights along a path multiplies the uncertainty with them.",
  ];

  return {
    nodes: [...nodes.values()].sort((a, b) => b.mass - a.mass),
    followed,
    unresolvedMass,
    unresolvedBy,
    resting,
    accountedMass,
    assumptions,
  };
}

/** A weight that is not a finite number is not a probability; it carries no mass. */
function safeP(p: number): number {
  return Number.isFinite(p) && p > 0 ? p : 0;
}

function record(nodes: Map<string, TaintNode>, txid: Hex, mass: number, hops: number): void {
  const existing = nodes.get(txid);
  if (existing === undefined) {
    nodes.set(txid, { txid, mass, hops });
    return;
  }
  // Reached again at a greater depth: accumulate the mass, keep the SHORTEST
  // hop count, because "how far away is this" is a question about the shortest
  // path and the mass is a sum over all of them.
  nodes.set(txid, {
    txid,
    mass: existing.mass + mass,
    hops: Math.min(existing.hops, hops),
  });
}
