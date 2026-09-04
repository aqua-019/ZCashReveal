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
 * to transparent) and `migration` (the ZIP 318 crossing, orchard to ironwood).
 * `shielded`, `mixed` and `transparent` say where value went WITHIN a register
 * without orienting it across a boundary, and `undecoded` says the decoder
 * declined to read the transaction at all.
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
  const directed = directionFor(row.class, lanes);
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
function directionFor(cls: MempoolRow["class"], lanes: readonly LedgerLane[]): LiveShape | null {
  if (cls === "migration") {
    // ZIP 318 is Orchard leaving for Ironwood, and it is the one crossing
    // relation this document measures anywhere - `MEASURED_CROSSINGS` in
    // `plane.ts` holds exactly this pair.
    return { kind: "crossing", from: "orchard", to: "ironwood" };
  }

  const shielded = lanes.filter((l) => SHIELDED.has(l));
  const pool = shielded[0];
  if (shielded.length !== 1 || pool === undefined) return null;

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
  readonly lastRemoval: RemovalReason | null;
}

/** `zecFrameSchema`'s `tx_removed.reason`. Three members, one of them settlement. */
export type RemovalReason = "confirmed" | "evicted" | "replaced";

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
      if (!state.held.has(frame.txid)) {
        // A removal for a txid never held is not an error and not a no-op we
        // can be silent about: the reason is still what just happened on the
        // wire. The held set is unchanged, which is A2's fail side.
        return { ...state, lastRemoval: frame.reason };
      }
      const held = new Map(state.held);
      held.delete(frame.txid);
      return { held, seq: state.seq, lastRemoval: frame.reason };
    }
    case "snapshot": {
      let next = state;
      for (const entry of frame.view.entries) next = add(next, entry);
      return next;
    }
    case "hello":
    case "tip":
      return state;
  }
}

function add(state: LiveState, row: MempoolRow): LiveState {
  const existing = state.held.get(row.txid);
  const result = markFor(row);
  const shape = "undrawn" in result ? null : result;
  const undrawn = "undrawn" in result ? result.undrawn : null;

  const held = new Map(state.held);
  held.set(row.txid, {
    txid: row.txid,
    shape,
    undrawn,
    severity: row.severity,
    cls: row.class,
    // A RE-DELIVERED FRAME KEEPS ITS ORIGINAL PLACE IN THE QUEUE. Giving it a
    // fresh `seq` would let a reconnect - which replays the whole view - push
    // every older transaction out of a capped board, so the tank would appear
    // to empty and refill on a socket blip that changed nothing.
    seq: existing?.seq ?? state.seq,
  });
  return { held, seq: existing === undefined ? state.seq + 1 : state.seq, lastRemoval: state.lastRemoval };
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
 * `seq`. The board still says `capped` and the affordance still prints the true
 * held figure, on the same rule `plane.ts` states: the count is the
 * measurement, the marks are not.
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
