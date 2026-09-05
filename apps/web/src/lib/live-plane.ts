/**
 * THE LIVING PLANE - what an arriving transaction draws in the tank, as a pure
 * function of the frames that arrived.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE MODULE FROM `plane.ts`
 * ============================================================================
 * `plane.ts` draws CONFIRMED crossings from `snapshot.migrationHist`: a count
 * the publisher measured over a window of settled blocks. This module draws
 * UNCONFIRMED transactions from the live mempool socket. They are different
 * claims about different objects and they share a board, so the one thing that
 * must never happen is a reader taking one for the other.
 *
 * They are kept apart three ways, and the first is the only one that cannot
 * drift: the two mark sets are built by different functions from different
 * inputs and rendered into different SVG layers, so there is no code path in
 * which a live mark can reach `Plane.marks` or a counted crossing can reach
 * `LivePlane.marks`. The second is the DOM - every live mark carries
 * `data-live-mark` and its own `data-txid`. The third is the paint, below.
 *
 * ============================================================================
 * GOLD IS THE SETTLEMENT REGISTER, AND THAT IS WHY A LIVE MARK HAS NO ARROWHEAD
 * ============================================================================
 * `TurnstilePlane` spends gold on the arrowhead because that is where a
 * crossing LANDS - the accent's fourth licensed job, "value crossing a pool
 * boundary". A transaction in the mempool has not landed. It may be evicted, it
 * may be replaced, and it may never confirm at all.
 *
 * So a live mark carries NO gold and NO arrowhead. It ends in a hollow ring in
 * the origin lane's own hue - open, because the crossing is open. The reader's
 * rule is one sentence and it is legible without a legend: **a gold head means
 * it landed; a hollow head means it has not.** That is the accent budget doing
 * the distinguishing work rather than a caption asking to be believed.
 *
 * ============================================================================
 * DIRECTION IS READ FROM THE PRODUCER, NEVER GUESSED FROM `lanes`
 * ============================================================================
 * `mempoolRowSchema.lanes` is `z.array(ledgerSchema)` - an unordered SET of the
 * lanes a transaction touched, whose own docblock says "EMPTY IS LEGAL SINCE
 * HANDOFF-07 AND MEANS 'NO LANE CAN BE CLAIMED'". It carries no direction. A
 * transaction touching `{transparent, orchard}` may be a shield or a deshield
 * and the array cannot tell you which; picking one would render a measurement
 * the row does not contain, which is this project's whole subject in miniature.
 *
 * Only three of `class`'s seven members carry a direction at all, and they do
 * not carry it the same way. `shield` and `deshield` carry it IN THE CLASS -
 * `flowTextFor` returns the constant "t to z" / "z to t" for them, so the class
 * is the producer's whole statement. `migration` does NOT: the gateway assigns
 * that class to any pool-to-pool crossing with no public side, so it names
 * neither the pair nor the orientation, and both have to be read off `flow`,
 * which is `migrationFlowText`'s rendering of the sign of `perPoolZat`.
 * `shielded`, `mixed` and `transparent` say where value went WITHIN a register
 * without orienting it across a boundary, and `undecoded` says the decoder
 * declined to read the transaction at all.
 *
 * BOTH SENTENCES ABOVE WERE ONCE WRONG IN THIS FILE. The first said direction
 * came from `class`, which `directionFor` itself contradicted once it started
 * gating on the lane set; the second said `migration` WAS "the ZIP 318
 * crossing, orchard to ironwood", which is false for every other pool pair the
 * gateway gives that class and false again for a reversed one. A gate round
 * measured both.
 *
 * ============================================================================
 * FIVE CASES, AND TWO OF THEM DRAW NOTHING ON PURPOSE
 * ============================================================================
 * `markFor` is total and returns one of four shapes or `null`:
 *
 *   1. `undecoded`, or no lanes at all  ->  NULL. Nothing may be claimed.
 *   2. a derivable direction            ->  CROSSING. An arc, origin to
 *                                           destination, which travels.
 *   3. exactly one lane                 ->  RESIDENT. A ring on that lane's
 *                                           own orbit. Value moving inside a
 *                                           pool crosses nothing - the plane's
 *                                           own caption already says so - and
 *                                           a ring says "a transaction is
 *                                           here" without claiming a crossing.
 *   4. exactly two lanes, no direction  ->  CHORD. An arc between them that
 *                                           does NOT travel and has no head at
 *                                           either end, because travel is what
 *                                           renders direction.
 *   5. three or more lanes, no direction -> NULL. No single arc describes a
 *                                           transaction touching three pools,
 *                                           and picking two of them would drop
 *                                           the third silently.
 *
 * A row that draws nothing is still HELD and still COUNTED. `LivePlane.undrawn`
 * carries it with its reason, and the affordance prints the figure, because a
 * dropped row does not look like a bug - it looks like a quiet mempool, which
 * is the one misreading this whole surface exists to prevent.
 *
 * ============================================================================
 * DETERMINISM IS KEYED BY TXID, NOT BY THE TIP
 * ============================================================================
 * `plane.ts` seeds its fan from the tip hash, because a confirmed board is a
 * function of the block. A live mark must not move when its neighbour arrives
 * or when the tip advances, so each one seeds its own spread from its OWN
 * txid through `seededRng` - the sanctioned generator, `Math.random` being
 * banned repository-wide by eslint. Same transaction, same arc, every render,
 * every reader.
 */

import type { LedgerLane, MempoolRow, ZecFrame } from "@zcashreveal/types";

import { PLACEMENT, project, type Camera } from "./plane";
import { seededRng } from "./seed";

/** The shielded lanes. `transparent` is a ledger but not a shielded pool. */
const SHIELDED: ReadonlySet<LedgerLane> = new Set<LedgerLane>(["sprout", "sapling", "orchard", "ironwood"]);

/**
 * Draw order for a chord's two endpoints, so a two-lane transaction draws the
 * same chord however the producer happened to order its `lanes` array.
 *
 * ORDERING THE ENDPOINTS IS NOT CLAIMING A DIRECTION. The chord has no head at
 * either end and does not travel; this exists so the geometry is a function of
 * the SET, which is what `lanes` actually is.
 */
const CHORD_ORDER: readonly LedgerLane[] = ["transparent", "sprout", "sapling", "orchard", "ironwood"];

/** What a row draws, before any geometry. `null` is a real answer. */
export type LiveShape =
  | { readonly kind: "crossing"; readonly from: LedgerLane; readonly to: LedgerLane }
  | { readonly kind: "resident"; readonly lane: LedgerLane }
  | { readonly kind: "chord"; readonly a: LedgerLane; readonly b: LedgerLane };

/** Why a held transaction draws nothing. Printed, never swallowed. */
export type UndrawnReason = "no lane can be claimed" | "no single crossing describes it";

/**
 * The shape a row draws, or `null` with the reason it draws nothing.
 *
 * Total over every `MempoolRow` this build can receive, including the ones
 * HANDOFF-07 and HANDOFF-08 taught the schema to express: an `undecoded` row
 * and an empty `lanes` array are both legal and both mean the same thing here.
 */
export function markFor(row: MempoolRow): LiveShape | { readonly undrawn: UndrawnReason } {
  const lanes = dedupe(row.lanes);

  // 1. NOTHING MAY BE CLAIMED. `undecoded` is not a kind of flow - it is the
  //    row's way of saying the decoder declined to read the transaction's
  //    shape - and an empty lane list says the same thing one field over.
  if (row.class === "undecoded" || lanes.length === 0) return { undrawn: "no lane can be claimed" };

  // 2. A DERIVABLE DIRECTION. Only these three classes carry one.
  const directed = directionFor(row.class, lanes, row.flow);
  if (directed !== null) return directed;

  // 3. ONE LANE. Value moving inside a pool crosses nothing.
  const only = lanes[0];
  if (lanes.length === 1 && only !== undefined) return { kind: "resident", lane: only };

  // 4. TWO LANES, NO DIRECTION. An undirected chord, ordered by CHORD_ORDER so
  //    it is a function of the set rather than of the producer's array order.
  if (lanes.length === 2) {
    const [a, b] = [...lanes].sort((p, q) => CHORD_ORDER.indexOf(p) - CHORD_ORDER.indexOf(q));
    if (a !== undefined && b !== undefined) return { kind: "chord", a, b };
  }

  // 5. THREE OR MORE, NO DIRECTION. Picking two would drop the rest in silence.
  return { undrawn: "no single crossing describes it" };
}

/**
 * The oriented pair for the three classes that carry one, or null.
 *
 * `shield` and `deshield` need EXACTLY ONE shielded lane to be oriented: a
 * `shield` naming two shielded lanes has a transparent origin and two possible
 * destinations, and choosing one would be the guess this function exists to
 * refuse.
 */
/**
 * The initials `poolInitial` prints, which is the alphabet `flow` is written in.
 *
 * Read off `apps/gateway/src/views/mempool.ts` rather than assumed: sprout is
 * `P`, not `S`. `S` is sapling.
 */
const FLOW_INITIAL: Readonly<Record<string, LedgerLane>> = {
  P: "sprout",
  S: "sapling",
  O: "orchard",
  I: "ironwood",
};

/** `migrationFlowText`'s two-pool form, and nothing else. */
const FLOW_PAIR = /^([PSOI]) to ([PSOI])$/;

/**
 * The oriented pair for the classes that carry one, or null.
 *
 * ============================================================================
 * `migration` NEEDED THREE ATTEMPTS AND THE FIRST TWO BOTH SHIPPED WRONG
 * ============================================================================
 * HANDOFF-17 first returned the Orchard-to-Ironwood pair for EVERY row whose
 * class was `migration`. A gate round showed the gateway assigns that class to
 * any pool-to-pool crossing with no public side, so a Sapling-to-Orchard
 * transfer drew a ZIP 318 arc it never made.
 *
 * The fix for that read the LANES and required them to name orchard and
 * ironwood - which closed the PAIR and left the DIRECTION open, because `lanes`
 * is a SET built from bundle presence and both lanes light for either
 * direction. Gate round 2 drove the real `mempoolRow` and caught it: a row with
 * `flow: "I to O"` still drew orchard-to-ironwood, arrowhead on the wrong node,
 * stroke in the wrong lane's hue, beside a table cell saying the opposite.
 * Ironwood back to Orchard is what `leaks.ts` calls "the rarer event" - not an
 * impossible one.
 *
 * ============================================================================
 * SO THE DIRECTION IS READ FROM THE PRODUCER'S OWN STATEMENT OF IT
 * ============================================================================
 * The direction lives in the SIGN of `valueFlow.perPoolZat` - "positive means
 * value LEFT the pool" - and `perPoolZat` NEVER REACHES THE BROWSER.
 * `MempoolRow` carries thirteen fields and `flow` is the only one that survives
 * the crossing's orientation: `flowTextFor` sends a migration to
 * `migrationFlowText`, which filters positives into `from`, negatives into
 * `to`, and prints `poolInitial(from) to poolInitial(to)`.
 *
 * THIS IS A COUPLING TO A DISPLAY STRING AND IT IS NOT PRETENDED OTHERWISE.
 * It is accepted here because the alternative is worse in both directions:
 * guessing keeps drawing arcs the row contradicts, and dropping the directed
 * arc entirely would mean the plane never draws the one crossing relation this
 * whole document measures. The grammar is exact, produced by one function, and
 * anything that does not match it falls through to the undirected chord - so a
 * producer that changes the wording makes the plane claim LESS, never something
 * false. The structural fix is a directed pair on the DTO itself, which is a
 * schema change across the gateway, the types package and their tests; it is
 * out of this handoff's scope and is section 8's question for L2.
 */
function directionFor(
  cls: MempoolRow["class"],
  lanes: readonly LedgerLane[],
  flow: string,
): LiveShape | null {
  if (cls === "migration") {
    const stated = FLOW_PAIR.exec(flow.trim());
    if (stated === null) return null;
    const from = FLOW_INITIAL[stated[1] ?? ""];
    const to = FLOW_INITIAL[stated[2] ?? ""];
    if (from === undefined || to === undefined || from === to) return null;
    // THE ROW HAS TO AGREE WITH ITSELF. `flow` and `lanes` are built by
    // different functions from the same report, and an arc drawn between two
    // lanes the row does not claim to have touched would be this module
    // trusting one field over the other rather than requiring both.
    const touched = new Set(lanes);
    if (!touched.has(from) || !touched.has(to)) return null;
    return { kind: "crossing", from, to };
  }

  const shielded = lanes.filter((l) => SHIELDED.has(l));
  const pool = shielded[0];
  if (shielded.length !== 1 || pool === undefined) return null;

  // `shield` AND `deshield` KEEP THEIR CLASS-DERIVED DIRECTION, and that is not
  // an inconsistency with the arm above. Their `flow` is the literal "t to z" /
  // "z to t" - `flowTextFor` returns a constant for both - so the class IS the
  // producer's statement for them, and there is nothing further to read.
  if (cls === "shield") return { kind: "crossing", from: "transparent", to: pool };
  if (cls === "deshield") return { kind: "crossing", from: pool, to: "transparent" };
  return null;
}

function dedupe(lanes: readonly LedgerLane[]): readonly LedgerLane[] {
  return [...new Set(lanes)];
}

/* -------------------------------------------------------------------------- */
/* The held set                                                               */
/* -------------------------------------------------------------------------- */

/** One unconfirmed transaction the tank is holding. */
export interface HeldTx {
  readonly txid: string;
  readonly shape: LiveShape | null;
  readonly undrawn: UndrawnReason | null;
  readonly severity: MempoolRow["severity"];
  readonly cls: MempoolRow["class"];
  /** Arrival order, so the newest marks can be the ones a capped board keeps. */
  readonly seq: number;
}

/**
 * The tank's state. A Map keyed by txid, which is what makes A1 and A2 true by
 * construction rather than by care: a re-delivered `tx_added` overwrites its
 * own key and cannot double-draw, and a `tx_removed` deletes by key and cannot
 * evict a neighbour.
 */
export interface LiveState {
  readonly held: ReadonlyMap<string, HeldTx>;
  /** Monotonic arrival counter. Never a clock - a clock would make this impure. */
  readonly seq: number;
  /**
   * How the last removal described itself, kept rather than discarded.
   *
   * Only `confirmed` means the transaction settled. Collapsing the three onto
   * "it confirmed" is HANDOFF-06's `UNKNOWN_NONSTANDARD` conflation in a new
   * surface - an unmeasured thing given a measured thing's verdict - so the
   * reason survives the fold and the affordance prints it.
   */
  readonly lastRemoval: Removal | null;
}

/** `zecFrameSchema`'s `tx_removed.reason`. Three members, one of them settlement. */
export type RemovalReason = "confirmed" | "evicted" | "replaced";

/**
 * What a removal actually did to THIS board, which is what the copy claims.
 *
 * THE FIRST DRAFT KEPT ONLY THE REASON, AND THE AFFORDANCE THEN SAID "the last
 * MARK to leave was confirmed into a block" IN THREE CASES WHERE NO MARK LEFT:
 * a `tx_removed` for a txid this reader never held (routine - the reader
 * connected after it entered the pool, or the gateway's view was partial), a
 * held row that drew nothing (`undecoded`, or three-plus lanes), and a held row
 * that was capped off the board. A sentence about a mark that never existed, on
 * a surface whose whole subject is not claiming more than it measured.
 */
export interface Removal {
  readonly reason: RemovalReason;
  /** Whether the tank was holding it at all. */
  readonly wasHeld: boolean;
  /** Whether it was drawing a mark. A held row with no shape draws none. */
  readonly drewMark: boolean;
}

export const EMPTY_LIVE_STATE: LiveState = { held: new Map(), seq: 0, lastRemoval: null };

/**
 * Fold one frame into the tank.
 *
 * PURE, AND THAT IS WHAT MAKES A4 CHECKABLE. Nothing in here reads a clock, a
 * seed, an ambience value or a snapshot: the ONLY way a transaction enters the
 * held set is a `tx_added` frame, and the only way one leaves is `tx_removed`.
 * A test can therefore assert the whole of A4 - "nothing draws a mark except an
 * arrived frame" - by folding zero frames and reading `held.size`.
 *
 * A `snapshot` frame seeds the tank from the view the socket opens with, which
 * is the same transactions arriving in one message instead of many. `hello` and
 * `tip` carry no transaction and change nothing here.
 *
 * ALL THREE REMOVAL REASONS REMOVE THE MARK, AND THAT IS DELIBERATE. Only
 * `confirmed` means the transaction settled; `evicted` and `replaced` mean it
 * left the mempool without settling. The mark goes in every case, because the
 * tank's fullness is the mempool's depth and a transaction that is no longer in
 * the mempool is not in the tank either. What differs is what the page SAYS,
 * which is why the reason is kept rather than discarded - treating all three as
 * "confirmed" would tell a reader a dropped transaction settled.
 */
export function liveReduce(state: LiveState, frame: ZecFrame): LiveState {
  switch (frame.type) {
    case "tx_added":
      return add(state, frame.entry);
    case "tx_removed": {
      const prior = state.held.get(frame.txid);
      if (prior === undefined) {
        // A removal for a txid never held changed NOTHING on this board, and the
        // affordance must not say a mark left. The event is kept with that fact
        // attached rather than discarded. The held set is unchanged, which is
        // A2's fail side.
        return { ...state, lastRemoval: { reason: frame.reason, wasHeld: false, drewMark: false } };
      }
      const held = new Map(state.held);
      held.delete(frame.txid);
      return {
        held,
        seq: state.seq,
        lastRemoval: { reason: frame.reason, wasHeld: true, drewMark: prior.shape !== null },
      };
    }
    case "snapshot": {
      // A SNAPSHOT IS THE MEMPOOL, NOT AN ADDITION TO IT, AND THE FIRST DRAFT
      // FOLDED IT ADDITIVELY.
      //
      // The gateway sends this frame on every connect and the socket reconnects
      // constantly - the committed `FixtureStream` closes itself after each
      // cycle BY DESIGN, and a real gateway drops. A transaction that left the
      // pool while the socket was down gets no `tx_removed`, because that frame
      // was sent to a closed socket; the reconciling snapshot is the only thing
      // that can retire it. Folded additively it never did, so the board went on
      // drawing a CONFIRMED transaction as unconfirmed and the affordance
      // printed the wrong count with full confidence. Reproduced: two held, a
      // snapshot naming one, two still drawn.
      //
      // AND IT IS THE SEAM SHAPE, WHICH IS WHY IT IS WORTH THIS MANY LINES.
      // `MempoolPanel` consumes the identical frame from the identical socket
      // and treats it as authoritative - `setView((v) => ({ ...frame.view, ...}))`
      // replaces `entries` wholesale. Two consumers of one frame, disagreeing
      // about what it MEANS, each with its own passing tests, and neither test
      // could see the disagreement because each built its own input.
      //
      // Survivors keep their original `seq`, so a reconnect does not reshuffle a
      // capped board - the same rule `add` states for a re-delivered frame.
      // A SNAPSHOT CARRIES A SET, NOT AN ORDERING, AND THAT IS THE WHOLE
      // DIFFICULTY.
      //
      // `view.entries` is `reports.map(...)` in the INDEXER's order, never this
      // reader's arrival order, so for a transaction we did not watch arrive we
      // do not know its age. Survivors keep the `seq` we recorded when we saw
      // them; everything else is placed BELOW all of them, because "we did not
      // watch it arrive" cannot be turned into "it is the newest".
      //
      // MINTING THEM AS NEWEST IS EXACTLY THE DEFECT THIS ARM WAS FIRST FIXED
      // FOR, one layer further in. Evicting mid-loop dropped survivors; not
      // evicting mid-loop but still minting re-entrants at the top of the
      // counter dropped them again at the DRAW cap instead - measured, a
      // 300-transaction mempool and one reconnect, and 0 of 42 marks survived
      // both times. The first fix moved the symptom rather than removing it,
      // which is what a second round is for.
      const priorSeqs: number[] = [];
      for (const entry of frame.view.entries) {
        const prior = state.held.get(entry.txid);
        if (prior !== undefined) priorSeqs.push(prior.seq);
      }
      // Below the oldest thing we are still holding, or below the counter itself
      // when this is the first view we have ever seen.
      let unseen =
        (priorSeqs.length > 0 ? Math.min(...priorSeqs) : state.seq) - frame.view.entries.length;

      const placed = new Map<string, HeldTx>();
      for (const entry of frame.view.entries) {
        const prior = state.held.get(entry.txid);
        placed.set(entry.txid, heldFor(entry, prior?.seq ?? unseen));
        if (prior === undefined) unseen += 1;
      }

      // EVICT ONCE, AT THE END - AND THAT IS TIDINESS, NOT THE FIX. Stated
      // plainly because the first version of this comment claimed otherwise.
      //
      // Evicting the running minimum on every placement past the ceiling is a
      // valid streaming top-K and reaches the same set, which a mutation
      // proved: restoring the mid-loop eviction leaves the whole suite green,
      // including a reconnect driven in reverse view order. The mutant is not
      // caught because the mutant is CORRECT.
      //
      // WHAT ACTUALLY BROKE was that the old arm evicted using a seq it had not
      // finished computing: every entry was minted with a fresh counter value
      // and each survivor's true seq was restored one line LATER, so the cap ran
      // on numbers that were about to change. Placing each entry with its final
      // seq - `heldFor(entry, prior?.seq ?? unseen)` above - removes that
      // whole class, and then where the eviction runs stops mattering.
      //
      // `seq` IS NOT ADVANCED BY A SNAPSHOT. It counts arrivals this reader
      // watched, and a snapshot is a reconciliation rather than an arrival -
      // advancing it by `entries.length` per reconnect inflated it 300 -> 600 on
      // one reconnect and is what let re-entrants outrank everything.
      return capHold({ held: placed, seq: state.seq, lastRemoval: state.lastRemoval });
    }
    case "hello":
    case "tip":
      return state;
  }
}

/**
 * The most transactions the tank will HOLD, as distinct from the most it draws.
 *
 * `SPLASH_N_MAX` caps what is DRAWN. Nothing capped what was held, so a tab left
 * open on a gateway that never sends `tx_removed` grew the map without bound -
 * measured at 3,000 entries after 3,000 frames, with `add` copying the whole map
 * per frame, so the cost is quadratic in a session's length.
 *
 * 250 IS `MempoolPanel`'s OWN CAP, adopted rather than invented, for the reason
 * its comment gives: "the legacy dashboard capped at 250; the committed corpus
 * never reaches it, and the cap is here so the live path cannot grow without
 * bound." Two consumers of one socket should not disagree about how much of it
 * they keep.
 */
const HOLD_MAX = 250;

function add(state: LiveState, row: MempoolRow): LiveState {
  return capHold(place(state, row));
}

/** One held entry from a row, at a given place in the queue. */
function heldFor(row: MempoolRow, seq: number): HeldTx {
  const result = markFor(row);
  return {
    txid: row.txid,
    shape: "undrawn" in result ? null : result,
    undrawn: "undrawn" in result ? result.undrawn : null,
    severity: row.severity,
    cls: row.class,
    seq,
  };
}

function place(state: LiveState, row: MempoolRow): LiveState {
  const existing = state.held.get(row.txid);
  const held = new Map(state.held);
  // A RE-DELIVERED FRAME KEEPS ITS ORIGINAL PLACE IN THE QUEUE. Giving it a
  // fresh `seq` would let a reconnect - which replays the whole view - push
  // every older transaction out of a capped board, so the tank would appear to
  // empty and refill on a socket blip that changed nothing.
  held.set(row.txid, heldFor(row, existing?.seq ?? state.seq));
  return { held, seq: existing === undefined ? state.seq + 1 : state.seq, lastRemoval: state.lastRemoval };
}

/**
 * OLDEST OUT WHEN THE HOLD IS FULL, which is the same ordering the drawn cap
 * uses: the newest arrivals are the ones a reader is watching for.
 *
 * A SEPARATE STEP, CALLED ONCE PER FRAME. Folded into placement it evicts on a
 * half-built map - see the `snapshot` arm.
 */
function capHold(state: LiveState): LiveState {
  if (state.held.size <= HOLD_MAX) return state;
  const held = new Map(state.held);
  const bySeq = [...held.values()].sort((p, q) => p.seq - q.seq);
  for (const evicted of bySeq.slice(0, held.size - HOLD_MAX)) held.delete(evicted.txid);
  return { ...state, held };
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/** A drawn live mark. `head` is where the hollow ring goes; null on a chord. */
export interface LiveMark {
  readonly txid: string;
  readonly kind: LiveShape["kind"];
  /** The lane whose hue paints the mark: the ORIGIN, as on the confirmed board. */
  readonly lane: LedgerLane;
  readonly d: string;
  readonly head: { readonly cx: number; readonly cy: number; readonly r: number } | null;
  /** Mean depth, for far-first ordering. */
  readonly depth: number;
  /** Travel is what renders direction, so only a crossing gets it. */
  readonly travels: boolean;
}

export interface LivePlane {
  readonly marks: readonly LiveMark[];
  /** Transactions the tank is holding, drawn or not. */
  readonly held: number;
  /** Marks on the board. Equals the drawable count unless `capped`. */
  readonly drawn: number;
  /** True when more transactions are held than the board can hold. */
  readonly capped: boolean;
  /**
   * True when the HOLD itself is saturated, so `held` is a FLOOR and not a count.
   *
   * `capped` is about the DRAWN board and `holdFull` is about the tank behind
   * it, and conflating them cost a false figure: `capped` is
   * `drawable.length > nMax`, which for a pool of 3,000 undecodable rows is
   * `0 > 42` - false - so the one branch that would have hedged the number was
   * off while the page printed "of 250 held". Two different saturations, two
   * different sentences.
   */
  readonly holdFull: boolean;
  /** Held transactions that draw nothing, by reason. Printed, never swallowed. */
  readonly undrawn: Readonly<Record<UndrawnReason, number>>;
}

const SEGMENTS = 26;

/**
 * Build the live marks.
 *
 * NEWEST FIRST WHEN CAPPED. `plane.ts` caps a confirmed board by taking the
 * first `nMax` of a count; here the objects are distinguishable and the newest
 * arrivals are the ones a reader is watching for, so the cap keeps the highest
 * `seq`.
 *
 * THE HELD FIGURE IS THE TANK'S, NOT THE POOL'S, AND AN EARLIER VERSION OF THIS
 * SENTENCE CLAIMED OTHERWISE. It read "the affordance still prints the true held
 * figure", which was true while the held map was unbounded and was made false by
 * `HOLD_MAX` in the same commit that wrote it - a docblock justifying a design
 * by asserting a behaviour that had just been removed. `holdFull` is what the
 * affordance needs to say which figure it is showing: below the ceiling `held`
 * is the pool's count, at it `held` is this page's own limit and the page says
 * so rather than reporting 250 for a mempool of 3,000.
 */
export function buildLivePlane(
  state: LiveState,
  options: { readonly camera: Camera; readonly nMax: number },
): LivePlane {
  const { camera, nMax } = options;

  const all = [...state.held.values()];
  const undrawn: Record<UndrawnReason, number> = {
    "no lane can be claimed": 0,
    "no single crossing describes it": 0,
  };
  for (const h of all) if (h.undrawn !== null) undrawn[h.undrawn] += 1;

  const drawable = all.filter((h): h is HeldTx & { shape: LiveShape } => h.shape !== null);
  drawable.sort((p, q) => q.seq - p.seq);
  const kept = drawable.slice(0, nMax);

  const marks = kept.map((h) => geometryFor(h.txid, h.shape, camera));
  // Far first, so nearer marks occlude correctly - the same rule `plane.ts`
  // sorts its confirmed marks by.
  const ordered = marks.slice().sort((p, q) => p.depth - q.depth);

  return {
    marks: ordered,
    held: all.length,
    drawn: ordered.length,
    capped: drawable.length > nMax,
    holdFull: state.held.size >= HOLD_MAX,
    undrawn,
  };
}

function geometryFor(txid: string, shape: LiveShape, cam: Camera): LiveMark {
  const rnd = seededRng(txid, "live-plane");

  if (shape.kind === "resident") {
    // A RING ON THE LANE'S OWN ORBIT, at a seeded angle. It is a closed curve
    // rather than an arc between two places, because there is no second place.
    const p = PLACEMENT[shape.lane];
    const theta = rnd() * Math.PI * 2;
    const orbit = 0.17 + rnd() * 0.06;
    const [cx, cy, depth] = project(cam, p.x + Math.cos(theta) * orbit, p.y + 0.03, p.z + Math.sin(theta) * orbit);
    const r = 3.4 * depth;
    return {
      txid,
      kind: "resident",
      lane: shape.lane,
      d: ringPath(cx, cy, r),
      head: null,
      depth,
      travels: false,
    };
  }

  const [from, to] =
    shape.kind === "crossing" ? ([shape.from, shape.to] as const) : ([shape.a, shape.b] as const);
  const a = PLACEMENT[from];
  const b = PLACEMENT[to];
  const spread = (rnd() - 0.5) * 0.5;
  // UNIFORM LIFT. The row carries no per-transaction amount, and a varying arc
  // height would render one - the same rule `plane.ts`'s `buildMarks` states.
  const lift = 0.1;

  let nx = -(b.z - a.z);
  let nz = b.x - a.x;
  const nl = Math.hypot(nx, nz) || 1;
  nx /= nl;
  nz /= nl;

  const pts: string[] = [];
  let depthSum = 0;
  let last: readonly [number, number, number] = [0, 0, 1];
  for (let s = 0; s <= SEGMENTS; s += 1) {
    const t = s / SEGMENTS;
    const bow = Math.sin(Math.PI * t);
    const x = a.x + (b.x - a.x) * t + nx * spread * bow;
    const z = a.z + (b.z - a.z) * t + nz * spread * bow;
    const y = a.y + (b.y - a.y) * t + bow * lift;
    const projected = project(cam, x, y, z);
    depthSum += projected[2];
    last = projected;
    pts.push(`${projected[0].toFixed(1)} ${projected[1].toFixed(1)}`);
  }

  return {
    txid,
    kind: shape.kind,
    lane: from,
    d: `M${pts.join(" L")}`,
    // THE HOLLOW HEAD IS THE WHOLE DISTINCTION FROM A SETTLED CROSSING, so a
    // chord - which claims no direction - has no head at either end.
    head: shape.kind === "crossing" ? { cx: last[0], cy: last[1], r: 3.2 * last[2] } : null,
    depth: depthSum / (SEGMENTS + 1),
    travels: shape.kind === "crossing",
  };
}

/** A closed circle as a path, so a resident mark and an arc share one element. */
function ringPath(cx: number, cy: number, r: number): string {
  return (
    `M${(cx - r).toFixed(1)} ${cy.toFixed(1)} ` +
    `a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(r * 2).toFixed(1)} 0 ` +
    `a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-r * 2).toFixed(1)} 0`
  );
}
