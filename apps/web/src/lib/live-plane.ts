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
 * DIRECTION IS DERIVED FROM `class`, NEVER GUESSED FROM `lanes`
 * ============================================================================
 * `mempoolRowSchema.lanes` is `z.array(ledgerSchema)` - an unordered SET of the
 * lanes a transaction touched, whose own docblock says "EMPTY IS LEGAL SINCE
 * HANDOFF-07 AND MEANS 'NO LANE CAN BE CLAIMED'". It carries no direction. A
 * transaction touching `{transparent, orchard}` may be a shield or a deshield
 * and the array cannot tell you which; picking one would render a measurement
 * the row does not contain, which is this project's whole subject in miniature.
 *
 * The direction is in `class`, and only three of its seven members carry one:
 * `shield` (transparent into a shielded lane), `deshield` (a shielded lane out
 * to transparent) and `migration` (a crossing with no public side).
 * `shielded`, `mixed` and `transparent` say where value went WITHIN a register
 * without orienting it across a boundary, and `undecoded` says the decoder
 * declined to read the transaction at all.
 *
 * AND FOR A `migration` THE CLASS NAMES THE KIND WHILE `flow` NAMES THE PAIR AND
 * THE DIRECTION - WHICH IS THE HALF THE FIRST TWO DRAFTS BOTH MISSED.
 * `migration` is assigned by the gateway to ANY pool-to-pool crossing with no
 * public side, in either direction and between any two pools. Draft one read it
 * as ZIP 318 and drew orchard-to-ironwood for a Sapling-to-Orchard transfer;
 * draft two required the row to NAME orchard and ironwood, which closed the PAIR
 * and left the DIRECTION open - so a REVERSED ZIP 318 row, Ironwood back to
 * Orchard, still drew orchard-to-ironwood, in the wrong lane's hue, beside a
 * cell reading "I to O".
 *
 * The lane set cannot settle it and no amount of care applied to the lane set
 * ever could. CAPTURED FROM THE PRODUCER (F-57-1): `mempoolRow` emits
 * `lanes: ["orchard","ironwood"]` for BOTH directions, in the same canonical
 * order, differing only in `flow` - `"O to I"` against `"I to O"`. So the
 * direction is read from `flow`, which is the field the producer put it in and
 * the field the table cell beside the arc prints.
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
  const directed = directionFor(row, lanes);
  if (directed !== null) return directed;

  // 2b. A `migration` WHOSE `flow` DID NOT DECIDE DRAWS NOTHING, and it does not
  //     fall through to the undirected chord below. The class is an assertion by
  //     the producer that value crossed from one pool to another, and `flow` is
  //     where it says which way; `migrationFlowText` answers `"N pools"` when a
  //     side has more than one pool and the literal `"migration"` when a side is
  //     empty. A chord would claim a two-lane relationship for a row that
  //     described a different one, and an arc would guess the direction the cell
  //     declined to state - so the row is HELD and COUNTED with its reason, which
  //     is A8's rule applied to the one class that names a crossing outright.
  if (row.class === "migration") return { undrawn: "no single crossing describes it" };

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
 *
 * IT TAKES THE ROW AND NOT THE CLASS, because a `migration`'s direction is not
 * in its class. See `migrationCrossing` below.
 */
function directionFor(row: MempoolRow, lanes: readonly LedgerLane[]): LiveShape | null {
  const cls = row.class;
  if (cls === "migration") return migrationCrossing(row.flow, lanes);

  const shielded = lanes.filter((l) => SHIELDED.has(l));
  const pool = shielded[0];
  if (shielded.length !== 1 || pool === undefined) return null;

  if (cls === "shield") return { kind: "crossing", from: "transparent", to: pool };
  if (cls === "deshield") return { kind: "crossing", from: pool, to: "transparent" };
  return null;
}

/**
 * A migration's crossing, read off the `flow` cell the producer wrote.
 *
 * ============================================================================
 * TWO DRAFTS GOT THIS WRONG IN TWO DIFFERENT WAYS AND BOTH WERE ABOUT `lanes`
 * ============================================================================
 * `migration` is the gateway's "a crossing with no public side", NOT ZIP 318.
 * `apps/gateway/src/views/mempool.ts` assigns it from `crossesWithNoPublicSide
 * = movedPools.length > 1 && hasPoolSource && hasPoolSink && !hasTransparentSource
 * && r.transparent.vout.length === 0`, which a Sapling-to-Orchard shielded
 * transfer satisfies and an Ironwood-to-Orchard one satisfies equally.
 *
 * The FIRST draft returned the Orchard-to-Ironwood pair for every `migration`,
 * so a Sapling-to-Orchard transfer drew a ZIP 318 arc that did not happen. The
 * fix required the row to NAME orchard and ironwood - which closed the PAIR and
 * left the DIRECTION open, because `mempoolRowSchema.lanes` is an unordered SET.
 *
 * MEASURED RATHER THAN ARGUED (F-57-1: the exclusion set is closed by CAPTURE
 * from the real producer, never by enumeration from memory). Driving
 * `mempoolRow` over both directions of the ZIP 318 crossing emits:
 *
 *   REVERSED (Ironwood -> Orchard): class=migration flow="I to O" lanes=["orchard","ironwood"]
 *   FORWARD  (Orchard -> Ironwood): class=migration flow="O to I" lanes=["orchard","ironwood"]
 *
 * The lane arrays are IDENTICAL, in the same canonical order. No predicate over
 * `lanes` can tell the two apart, so the second draft drew the forward arc for
 * the reversed row - in the wrong lane's hue, beside a cell reading "I to O".
 * `leaks.ts` calls the reverse "the rarer event", which is not "the impossible
 * one".
 *
 * ============================================================================
 * SO THE DIRECTION COMES FROM `flow`, AND THE LETTERS ARE NOT RE-DECLARED HERE
 * ============================================================================
 * `migrationFlowText` writes `"<initial> to <initial>"` from the SIGN of each
 * pool's delta, and `POOL_INITIAL` in `@zcashreveal/types` is the one place
 * those letters are DECLARED. This module holds the inverse locally, because
 * importing that object by value costs 15 kB of the splash bundle (measured;
 * see `POOL_FOR_INITIAL` below), and a test asserts the two agree by iterating
 * the declaration's own keys. An unchecked hand-copied letter map here would be
 * the seam shape LEDGER-11 records four instances of, arriving a fifth time in
 * the fix for the fourth - which is why the check is a test and not a comment.
 *
 * `null` FOR ANYTHING THE CELL DOES NOT DECIDE, and `markFor` then holds the row
 * undrawn with its reason rather than falling through to a chord. The producer
 * emits two such captions by construction - the literal `"migration"` when a
 * side is empty, and `"N pools"` when a side has more than one - and both mean
 * "this row's direction is not a single arc".
 *
 * THE FLOW AND THE SWATCHES MUST AGREE BEFORE EITHER IS BELIEVED. A cell naming
 * a pool the row's own `lanes` does not list is two statements about one
 * transaction that contradict each other, and drawing the arc would pick a
 * winner on no evidence. Nothing in the shipped producer emits that - `lanes`
 * and `perPoolZat` are derived from the same decoded bundle - so this is a guard
 * against a future producer rather than a live case, which is why it draws
 * nothing rather than repairing anything.
 */
const MIGRATION_FLOW = /^(\S+) to (\S+)$/;

/**
 * The `flow` cell's letters, inverted - a DELIBERATE local copy of
 * `POOL_INITIAL` in `@zcashreveal/types`, and the reason is a measurement.
 *
 * Importing that object by VALUE costs 15 kB of the splash bundle. Measured by
 * building `/` both ways with nothing else changed: **5.5 kB route JS / 118 kB
 * first load with this local map, against 21.4 kB / 133 kB with the import** -
 * because `@zcashreveal/types` has no `sideEffects: false`, so pulling one
 * function through its barrel drags `views.ts` and zod in behind it. That is
 * the identical 15 kB `api/stream.ts`'s header records paying to keep out of
 * this bundle, and this module is reached from a client island on the splash.
 *
 * A COPY IS A DRIFT RISK AND A COMMENT IS NOT A GUARD. `live-plane.test.ts`
 * imports `POOL_INITIAL` and asserts this object is exactly its inverse,
 * ITERATING THAT OBJECT'S OWN KEYS - so a fifth pool added there fails the test
 * here rather than arriving as a letter this parser silently declines, which
 * would draw nothing for a crossing the producer described.
 */
export const POOL_FOR_INITIAL: Readonly<Record<string, LedgerLane>> = {
  P: "sprout",
  S: "sapling",
  O: "orchard",
  I: "ironwood",
};

/** The pool a `flow` letter names, or null for one no pool claims. */
function poolForInitial(initial: string): LedgerLane | null {
  return POOL_FOR_INITIAL[initial] ?? null;
}

function migrationCrossing(flow: string, lanes: readonly LedgerLane[]): LiveShape | null {
  const parsed = MIGRATION_FLOW.exec(flow);
  if (parsed === null) return null;
  const from = poolForInitial(parsed[1] ?? "");
  const to = poolForInitial(parsed[2] ?? "");
  // A pool crossing to itself is not a crossing. `migrationFlowText` cannot emit
  // one - a pool's delta has a single sign, so it is a source or a sink and not
  // both - and an arc from a node to itself has no geometry here.
  if (from === null || to === null || from === to) return null;
  if (!lanes.includes(from) || !lanes.includes(to)) return null;
  return { kind: "crossing", from, to };
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
  /**
   * Whether `held` is a BOUND rather than the mempool's depth.
   *
   * `HOLD_MAX` was added without this and the affordance went on printing
   * `held` as an exact figure: a 3,000-transaction mempool of undecodable rows
   * read `held=250 drawn=0 capped=false`, so the page printed "of 250 held" -
   * a confident wrong number, which `chain-inputs.ts`'s absence-versus-zero
   * rule rates worse than no number. `capped` could not cover it because it
   * asked `drawable.length > nMax`, and with nothing drawable that is `0 > 42`:
   * the one branch that would have hedged the figure was off precisely when the
   * figure was furthest wrong.
   *
   * True once the hold has evicted, because those rows are gone and no later
   * arrival brings them back. A `snapshot` RECOMPUTES it rather than inheriting
   * it, because a snapshot is the authoritative view: one naming fewer rows than
   * the ceiling makes `held` the true depth again.
   */
  readonly holdCapped: boolean;
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

export const EMPTY_LIVE_STATE: LiveState = { held: new Map(), seq: 0, lastRemoval: null, holdCapped: false };

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
        // CARRIED FORWARD, NOT CLEARED. Removing a row does not give back the
        // ones the hold evicted, so `held` is still a bound. Only an
        // authoritative snapshot can make it a measurement again.
        holdCapped: state.holdCapped,
      };
    }
    case "snapshot":
      return replace(state, frame.view.entries);
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

/** One row's held entry, before it is given a place in the queue. */
function entryFor(row: MempoolRow, seq: number): HeldTx {
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

/**
 * Drop the oldest until the hold fits. Returns whether anything was dropped.
 *
 * ONE SITE, CALLED ONCE PER FRAME, and that is R2-2's fix as much as the seq
 * arithmetic below it is. The eviction used to live inside `add`, which the
 * snapshot arm called once per entry - so on a view of 300 it ran 50 times,
 * each against a map whose survivors had not been given their sequence numbers
 * back yet.
 */
function evictOldest(held: Map<string, HeldTx>): boolean {
  if (held.size <= HOLD_MAX) return false;
  const bySeq = [...held.values()].sort((p, q) => p.seq - q.seq);
  for (const evicted of bySeq.slice(0, held.size - HOLD_MAX)) held.delete(evicted.txid);
  return true;
}

function add(state: LiveState, row: MempoolRow): LiveState {
  const existing = state.held.get(row.txid);
  const held = new Map(state.held);
  // A RE-DELIVERED FRAME KEEPS ITS ORIGINAL PLACE IN THE QUEUE. Giving it a
  // fresh `seq` would let a reconnect - which replays the whole view - push
  // every older transaction out of a capped board, so the tank would appear
  // to empty and refill on a socket blip that changed nothing.
  held.set(row.txid, entryFor(row, existing?.seq ?? state.seq));
  // OLDEST OUT WHEN THE HOLD IS FULL, which is the same ordering the drawn cap
  // uses: the newest arrivals are the ones a reader is watching for.
  const evicted = evictOldest(held);
  return {
    held,
    seq: existing === undefined ? state.seq + 1 : state.seq,
    lastRemoval: state.lastRemoval,
    holdCapped: state.holdCapped || evicted,
  };
}

/**
 * Fold a whole `snapshot` view, which REPLACES the tank rather than adding to it.
 *
 * ============================================================================
 * A SNAPSHOT IS THE MEMPOOL, NOT AN ADDITION TO IT, AND THE FIRST DRAFT FOLDED
 * IT ADDITIVELY
 * ============================================================================
 * The gateway sends this frame on every connect and the socket reconnects
 * constantly - the committed `FixtureStream` closes itself after each cycle BY
 * DESIGN, and a real gateway drops. A transaction that left the pool while the
 * socket was down gets no `tx_removed`, because that frame was sent to a closed
 * socket; the reconciling snapshot is the only thing that can retire it. Folded
 * additively it never did, so the board went on drawing a CONFIRMED transaction
 * as unconfirmed and the affordance printed the wrong count with full
 * confidence. Reproduced: two held, a snapshot naming one, two still drawn.
 *
 * AND IT IS THE SEAM SHAPE, WHICH IS WHY IT IS WORTH THIS MANY LINES.
 * `MempoolPanel` consumes the identical frame from the identical socket and
 * treats it as authoritative - `setView((v) => ({ ...frame.view, ...}))`
 * replaces `entries` wholesale. Two consumers of one frame, disagreeing about
 * what it MEANS, each with its own passing tests, and neither test could see the
 * disagreement because each built its own input.
 *
 * ============================================================================
 * THE SECOND DRAFT FIXED THAT AND EMPTIED THE TANK ON EVERY RECONNECT
 * ============================================================================
 * It rebuilt the map by calling `add` per entry against a FRESH EMPTY MAP and
 * then writing the survivor's `seq` back afterwards. Three things followed and
 * all three are the same mistake:
 *
 *   - `add` reads `existing` from the map it is handed, and that map was empty,
 *     so EVERY entry looked new and took a fresh, higher `seq`.
 *   - `add` evicts inside itself, so eviction ran MID-LOOP - against sequence
 *     numbers that had not been restored yet.
 *   - the restore therefore arrived after the decision it was meant to inform.
 *
 * Measured on the pre-fix tree: 300 arrivals, then one snapshot replaying the
 * SAME 300 rows. Before, the board drew txids 259..300; after, it drew txids
 * 9..50 - **0 of 42 drawn marks survived** - and it was holding txid(1), a row
 * it had already evicted, while the rows it had been drawing were gone. Exactly
 * the failure `add`'s own comment says a kept `seq` prevents.
 *
 * ============================================================================
 * SO: RESTORE FIRST, EVICT ONCE, AND DATE A STRANGER BELOW EVERY SURVIVOR
 * ============================================================================
 * A survivor keeps its exact `seq`. An entry this reader has NEVER HELD is dated
 * strictly BELOW every survivor, in the view's own order.
 *
 * That last rule is the one worth arguing, because the obvious alternative is
 * wrong. A snapshot is a reconciliation and not a stream of arrivals: it carries
 * no times, and the rows in it that this reader does not recognise are rows it
 * MISSED, not rows that just arrived. Dating them as newest is what promoted
 * evicted rows over held ones above. Dating them oldest claims nothing - the
 * reader did not watch them arrive and says so by not treating them as recent -
 * and a genuinely new transaction is unaffected, because it arrives on the
 * `tx_added` path afterwards and takes a fresh `seq` above everything here.
 *
 * The cost is stated rather than hidden: after a long disconnection the board
 * keeps drawing the marks it already held while newly-discovered rows sit
 * undrawn, and turns over as real arrivals come in. That is the trade against a
 * tank that empties itself on every socket blip, which is the symptom a reader
 * would take for a broken site.
 */
function replace(state: LiveState, entries: readonly MempoolRow[]): LiveState {
  const held = new Map<string, HeldTx>();
  const strangers: string[] = [];
  // `state.seq` is the floor when nothing survives - a first connect, or a pool
  // that turned over completely - so the strangers land below the counter and
  // the next real arrival is still above all of them.
  let floor = state.seq;

  for (const row of entries) {
    // A txid twice in one view is one transaction. The map already dedupes it;
    // this keeps it out of `strangers` twice, which would shift the band.
    if (held.has(row.txid)) {
      held.set(row.txid, entryFor(row, held.get(row.txid)?.seq ?? floor));
      continue;
    }
    const prior = state.held.get(row.txid);
    if (prior === undefined) {
      strangers.push(row.txid);
      held.set(row.txid, entryFor(row, 0));
    } else {
      held.set(row.txid, entryFor(row, prior.seq));
      if (prior.seq < floor) floor = prior.seq;
    }
  }

  // BELOW EVERY SURVIVOR, IN VIEW ORDER. The band is contiguous and strictly
  // under `floor`, so no stranger can tie with or outrank a row this reader
  // actually watched arrive.
  strangers.forEach((txid, i) => {
    const entry = held.get(txid);
    if (entry !== undefined) held.set(txid, { ...entry, seq: floor - strangers.length + i });
  });

  // ONCE, AFTER THE WHOLE VIEW IS PLACED. See the docblock.
  const evicted = evictOldest(held);
  return {
    held,
    seq: state.seq,
    lastRemoval: state.lastRemoval,
    // RECOMPUTED, NOT INHERITED. The snapshot is the authoritative view, so a
    // pool that now fits under the ceiling makes `held` a measurement again.
    holdCapped: evicted,
  };
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
  /**
   * Transactions the tank is holding, drawn or not.
   *
   * A FLOOR RATHER THAN A COUNT WHEN `holdCapped`. This is what the tank holds,
   * which is the mempool's depth only while the hold has never evicted.
   */
  readonly held: number;
  /** Marks on the board. Equals the drawable count unless `capped`. */
  readonly drawn: number;
  /**
   * True when the reading is a sample: more is drawable than the board draws,
   * OR the hold has evicted so `held` itself understates the pool.
   */
  readonly capped: boolean;
  /**
   * True when `held` is a lower bound rather than a measurement.
   *
   * Separate from `capped` because the two hedge different figures and a reader
   * needs both: `capped` says the MARKS are a sample, this says the NUMBER
   * beside them is a floor. Collapsing them would make the affordance print an
   * exact figure under a sample caption, which is the conflation R2-3 was.
   */
  readonly holdCapped: boolean;
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
 * THE HELD FIGURE IS NOT ALWAYS THE TRUE ONE, AND THIS DOCBLOCK USED TO SAY IT
 * WAS. It read "the affordance still prints the true held figure, on the same
 * rule `plane.ts` states: the count is the measurement, the marks are not" -
 * which was true of `plane.ts`, where the count comes from `migrationHist` and
 * only the marks are capped, and became false here the moment `HOLD_MAX` was
 * added in the same commit. Once the hold evicts, `held` is a floor: the tank
 * cannot count what it threw away.
 *
 * So there are two hedges and they cover different figures. `capped` says the
 * MARKS are a sample. `holdCapped` says the NUMBER is a lower bound. The
 * measured case that needed both: a 3,000-transaction mempool of undecodable
 * rows gave `held=250 drawn=0 capped=false`, because `capped` asked
 * `drawable.length > nMax` and with nothing drawable that is `0 > 42`. The page
 * printed "of 250 held" with no hedge at all - a confident wrong number, which
 * `chain-inputs.ts`'s absence-versus-zero rule rates worse than no number.
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
    // OR, NOT JUST THE DRAW CAP. An evicted hold makes the reading a sample
    // whether or not anything was drawable - which is exactly the case the
    // draw-cap test alone could not see.
    capped: drawable.length > nMax || state.holdCapped,
    holdCapped: state.holdCapped,
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
