/**
 * THE TURNSTILE PLANE - geometry and readings, as a pure function of a snapshot.
 *
 * The composition is approved and is not this module's to reopen; it is
 * `docs/2.0/mockups/04a-turnstile-plane.html` at full size and
 * `docs/2.0/mockups/04a-splash-record.html` in context, and both carry their own
 * annotation layer. What IS this module's is the boundary between what the
 * snapshot can honestly feed the picture and what it cannot, which is the whole
 * difficulty of HANDOFF-04a deliverable 5.
 *
 * ============================================================================
 * WHAT MAY FEED IT, AND WHAT MAY NOT
 * ============================================================================
 * MAY: `snapshot.pools` - five lanes, `balanceZat`, `share` - for the nodes.
 *      `snapshot.migrationHist` for the crossing COUNT in the window.
 * MAY NOT: per-crossing amounts, ordering, or confirmation state. `SnapshotV1`
 *      carries none, deliberately: `snapshotMigrationHistSchema` says in as many
 *      words that "there is nowhere in it to put a wallet, an address or a
 *      txid", and `pool_boundary_flows` has the right shape but
 *      `writePoolBoundaryFlow` has no production caller - the confirmed-block
 *      driver is HANDOFF-12.
 *
 * SO THE PLANE DRAWS ONE MARK PER COUNTED CROSSING, AT UNIFORM WEIGHT. The
 * count is real and rendering it as marks is rendering the count. Giving each
 * mark a distinct amount, time or pending state it does not have would be
 * manufacturing a measurement. When HANDOFF-12 lands, the picture gets RICHER
 * (thickness becomes amount, fade becomes age, pending arcs appear) and never
 * DIFFERENT: same component, better input.
 *
 * THE INPUT TYPE IS `SnapshotV1` AND THAT IS LOAD-BEARING, NOT TIDINESS. The
 * fixture `PoolsView` carries a `flows: {from, to, zat}[]` field that would draw
 * a five-edge plane immediately and beautifully, and that `SnapshotV1` has no
 * field for at all. Anything drawing pool-to-pool flow off the fixture is
 * drawing off a field the published document cannot supply, so the honest
 * picture would silently become a dishonest one at the cutover. Taking the
 * snapshot type as input makes that unreachable rather than merely discouraged.
 *
 * ============================================================================
 * ONLY ONE CROSSING RELATION IS MEASURED, AND THE OTHER NINE SAY SO
 * ============================================================================
 * `migrationHist` IS THE MIGRATION LENS. It counts ZIP 318 crossings, which are
 * Orchard leaving for Ironwood, and it counts nothing else. Shields, unshields
 * and every other pool boundary are simply not in `SnapshotV1`.
 *
 * A pool outside that relation therefore renders "not measured", never
 * "0 crossings in window". Those two sentences look alike on a screen and are
 * opposite claims: one says the instrument looked and found nothing, the other
 * says the instrument did not look. `docs/2.0/SNAPSHOT.md` section 8.1 is
 * explicit - "a null renders as an absence and a zero renders as a measurement"
 * - and this is that rule applied per NODE rather than per panel.
 *
 * THIS IS THE ONE PLACE THIS BUILD DEPARTS FROM THE APPROVED STUDY, and the
 * departure is in the study's favour on its own stated principle. The study
 * prints "closed - 0 crossings in window" under `sprout`, whose `EDGES` table
 * contains no sprout edge at all - so the picture states a measured zero for a
 * relation it never had. Its own comment two lines above says "A pair that
 * cannot occur is absent, never drawn at zero". Section 7 records this.
 *
 * ============================================================================
 * THE ADAPTIVE RETENTION WINDOW, ON THE QUANTITY THE SNAPSHOT ACTUALLY CARRIES
 * ============================================================================
 * The board holds a constant visual DENSITY - at most `N_MAX` marks - and a
 * reader must be able to tell a busy board from a quiet one. That is the defect
 * the rule exists to prevent, stated by the operator: "without that line the
 * picture holds its density constant and quietly misreports how busy the chain
 * is."
 *
 * The study's mechanism for it is a SHORTENED WINDOW: keep the newest N_MAX
 * crossings and report the span they cover. THAT MECHANISM IS NOT DERIVABLE
 * HERE, and reaching for it anyway would be the exact defect this handoff
 * refuses. `migrationHist` carries `lowHeight`, `highHeight` and a count - one
 * window, chosen by the publisher, and no per-crossing height. To report a
 * shortened window the renderer would have to assume the crossings are spread
 * evenly across the window and scale it down, which is an inference about
 * arrival times from data that contains none. It would also be reported in
 * MINUTES, which needs a block time for `lowHeight` that the snapshot does not
 * carry either; the study prints "47 min" because its fixture invented one.
 *
 * So the same defect is closed on the derivable quantity: when the board caps,
 * IT SAYS SO AND IT PRINTS THE TRUE COUNT beside the drawn one - "42 of 1,284
 * crossings" - and the window stays what it measurably is, in BLOCKS. A reader
 * comparing two boards sees 42-of-1,284 against 17-of-17 and reads the traffic
 * off the numbers rather than off the density, which is strictly more
 * information than the shortened window would have carried. `capped` and
 * `countedCrossings` exist on the reading so an assertion can check that the
 * true count reaches the header and not only the drawn one.
 *
 * ============================================================================
 * STATELESS BY CONSTRUCTION
 * ============================================================================
 * Every value below is a function of the snapshot and nothing else - no clock,
 * no timer, no expiry. A server render and a browser that loaded fifteen
 * seconds later draw the same plane, byte for byte, because there is nothing in
 * here that could have moved. Age is a pure function of POSITION in the window
 * rather than of elapsed time, so opacity is recomputed when a block arrives -
 * the surface's one ceremony - and never between blocks.
 *
 * Determinism is the tip hash through FNV-1a to mulberry32 (`lib/seed.ts`, the
 * sanctioned generator; `Math.random` is banned by eslint). Same block, same
 * plane, every visitor, re-derivable by anyone with the same document.
 */

// `LedgerLane` is the five-lane union (`ledgerSchema`), not the four-pool one:
// the site's ledger has a transparent lane, which is not a shielded pool and
// has no commitment tree, and the plane draws all five.
import type { LedgerLane, SnapshotLane, SnapshotV1 } from "@zcashreveal/types";

import { seededRng } from "./seed";

/**
 * The most marks the board holds.
 *
 * 42 ON THE SPLASH, where the study uses 60 at full size. The board is 1180 by
 * 560 there against 1500 by 830 in the study, and the count is set by the
 * plane's AREA rather than by taste: 60 arcs across the splash board put two
 * fans within a stroke width of each other near Ironwood, where every migration
 * arc converges. 42 is the largest count at which the Orchard-to-Ironwood fan
 * still resolves as countable strands at the splash's size. Section 7 states
 * this; `/pools` may raise it to the study's 60 when it renders the plane at
 * full size, which is why it is a parameter and not a literal in the geometry.
 */
export const SPLASH_N_MAX = 42;

/** World-space placement, and it is an argument rather than decoration.
 *
 * The two unsound circuits - `sprout` and `orchard` - sit on one diagonal, so
 * the thing the Record is about is a shape rather than a caption.
 * `transparent` is nearest the reader because it is the only ledger anyone can
 * see into. `ironwood` is raised at the centre because every ZIP 318 migration
 * lands there, and its drop-line keeps it locatable rather than floating.
 */
interface Placement {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** A shielded interior is not observable by anyone, this site included. */
  readonly veiled: boolean;
}

export const PLACEMENT: Readonly<Record<LedgerLane, Placement>> = {
  transparent: { x: -0.8, z: 0.8, y: 0, veiled: false },
  orchard: { x: 0.8, z: 0.8, y: 0, veiled: true },
  sprout: { x: -0.8, z: -0.8, y: 0, veiled: true },
  sapling: { x: 0.8, z: -0.8, y: 0, veiled: true },
  ironwood: { x: 0, z: 0, y: 0.3, veiled: true },
};

/** Draw order: far first, so nearer nodes occlude correctly. */
export const LANE_ORDER: readonly LedgerLane[] = ["transparent", "orchard", "sprout", "sapling", "ironwood"];

/**
 * The crossing relations this document measures. Exactly one, today.
 *
 * `migrationHist` is TRACKING-MATH section 3.9's migration lens: ZIP 318
 * crossings, which are Orchard exiting to Ironwood. A second entry here is a
 * claim that the snapshot carries a second count, so nothing may be added to
 * this list without a field to back it.
 */
export const MEASURED_CROSSINGS: readonly (readonly [LedgerLane, LedgerLane])[] = [["orchard", "ironwood"]];

/** The camera. World: x left-right [-1, 1], z far-to-near [-1, 1], y = lift. */
export interface Camera {
  readonly cx: number;
  readonly cy: number;
  readonly sx: number;
  readonly sz: number;
  readonly lift: number;
  readonly persp: number;
}

/** The splash board, 1180 x 560, ported from the approved composition. */
export const SPLASH_CAMERA: Camera = { cx: 590, cy: 268, sx: 372, sz: 166, lift: 176, persp: 0.32 };

/** Perspective projection. Returns `[x, y, depth]`; depth scales size and stroke. */
export function project(cam: Camera, x: number, y: number, z: number): readonly [number, number, number] {
  const d = 1 / (1 - z * cam.persp);
  return [cam.cx + x * cam.sx * d, cam.cy + z * cam.sz * d - y * cam.lift * d, d];
}

/** What a node's traffic line says, and the three cases are not interchangeable. */
export type Traffic =
  | { readonly kind: "measured"; readonly out: number; readonly in: number }
  /** In the measured relation and the measurement was zero. A real reading. */
  | { readonly kind: "measured-zero" }
  /** Outside every measured relation. The instrument did not look. */
  | { readonly kind: "not-measured" };

export interface PlaneNode {
  readonly lane: LedgerLane;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly depth: number;
  readonly veiled: boolean;
  readonly balanceZat: bigint;
  readonly share: number;
  /** Sweep of the share arc on the node's ring, in radians. */
  readonly shareSweep: number;
  /** Foot of the drop-line for a raised node; null when the node sits on the plane. */
  readonly drop: { readonly cx: number; readonly cy: number } | null;
  readonly traffic: Traffic;
}

export interface PlaneMark {
  readonly from: LedgerLane;
  readonly to: LedgerLane;
  /** SVG path, sampled in world space and projected point by point. */
  readonly d: string;
  /** 0 = newest in the window, 1 = oldest. A position, never a clock. */
  readonly age: number;
  readonly opacity: number;
  /** The arrowhead is the one gold mark: it is where the crossing LANDS. */
  readonly arrow: boolean;
  /** Mean depth, for far-first ordering. */
  readonly depth: number;
}

export interface PlaneReading {
  readonly height: number;
  /** Crossings the snapshot counted in its window. The true figure. */
  readonly countedCrossings: number;
  /** Marks the board drew. Equals `countedCrossings` unless `capped`. */
  readonly drawnMarks: number;
  readonly capped: boolean;
  /** The measured window, in blocks. The snapshot carries heights, not times. */
  readonly windowBlocks: number;
  readonly lowHeight: number;
  readonly highHeight: number;
}

/**
 * A named absence: what is missing, and the CONDITION that produced it.
 *
 * Never an owner. `docs/2.0/SNAPSHOT.md` section 8.1, and the wording is the
 * table's own.
 */
export interface PlaneAbsence {
  readonly what: string;
  readonly condition: string;
}

export interface Plane {
  readonly nodes: readonly PlaneNode[];
  readonly marks: readonly PlaneMark[];
  /** Null exactly when `crossings` could not be measured at all. */
  readonly reading: PlaneReading | null;
  /** Non-null when something the picture would otherwise imply is unmeasured. */
  readonly absence: PlaneAbsence | null;
  /** Rendered under the board. Present when the board is capped. */
  readonly capNote: string | null;
}

const SEGMENTS = 34;
const TAU = Math.PI * 2;

/**
 * Build the plane.
 *
 * Pure: same snapshot in, identical plane out, on the server and in the
 * browser. `nMax` is a parameter rather than a constant so `/pools` can render
 * the same component at the study's density without a second implementation.
 */
export function buildPlane(
  snapshot: SnapshotV1,
  options: { readonly camera?: Camera; readonly nMax?: number } = {},
): Plane {
  const cam = options.camera ?? SPLASH_CAMERA;
  const nMax = options.nMax ?? SPLASH_N_MAX;

  const hist = snapshot.migrationHist;
  // Every crossing the window held, canonical or not. `nonCanonicalCount` is a
  // MEASUREMENT and not an error count - `zip318.ts` calls a crossing outside
  // the canonical ladder "a finding, never a rejection" - so dropping it here
  // would under-report the traffic the instrument actually saw.
  const counted = hist === null ? null : hist.canonicalCount + hist.nonCanonicalCount;

  const traffic = trafficByLane(counted);
  const nodes = buildNodes(snapshot.pools, cam, traffic);
  const marks = counted === null || counted === 0 ? [] : buildMarks(snapshot.hash, counted, nMax, cam);

  const reading: PlaneReading | null =
    hist === null || counted === null
      ? null
      : {
          height: snapshot.height,
          countedCrossings: counted,
          drawnMarks: Math.min(counted, nMax),
          capped: counted > nMax,
          // Inclusive: a window from height H to height H is one block, not zero.
          windowBlocks: hist.highHeight - hist.lowHeight + 1,
          lowHeight: hist.lowHeight,
          highHeight: hist.highHeight,
        };

  return {
    nodes,
    marks,
    reading,
    absence:
      hist === null
        ? {
            what: "Crossings",
            condition: "no migration window was read for this height",
          }
        : null,
    capNote:
      reading !== null && reading.capped
        ? `the board holds ${String(nMax)} marks and the window counted ` +
          `${reading.countedCrossings.toLocaleString("en")} crossings, so what is drawn is a ` +
          "sample of them - the count above is the measurement, the marks are not"
        : null,
  };
}

/**
 * Per-lane traffic, and the three-way split is the honest part.
 *
 * A lane in the measured relation gets a count - including a real zero. A lane
 * outside every measured relation gets `not-measured`, because nothing in this
 * document looked at its boundary. Collapsing those two into "0 crossings"
 * would put a measurement where an absence belongs, on four lanes out of five.
 */
export function trafficByLane(counted: number | null): Readonly<Record<LedgerLane, Traffic>> {
  const out = {} as Record<LedgerLane, Traffic>;
  for (const lane of LANE_ORDER) out[lane] = { kind: "not-measured" };
  if (counted === null) return out;

  // Accumulate first, classify second. Doing both in one pass would let a
  // second relation sharing a lane reset the first relation's count back to
  // zero on its way through the `measured-zero` branch - a bug that cannot fire
  // with one relation and would fire silently on the day a second one lands.
  const tally = new Map<LedgerLane, { out: number; in: number }>();
  for (const [from, to] of MEASURED_CROSSINGS) {
    const f = tally.get(from) ?? { out: 0, in: 0 };
    f.out += counted;
    tally.set(from, f);
    const t = tally.get(to) ?? { out: 0, in: 0 };
    t.in += counted;
    tally.set(to, t);
  }

  for (const [lane, t] of tally) {
    // A zero here is a MEASURED zero: the lane is in a relation this document
    // counts, and the count came back nothing. That is a different sentence
    // from `not-measured`, which is what every lane outside the relation keeps.
    out[lane] = t.out === 0 && t.in === 0 ? { kind: "measured-zero" } : { kind: "measured", out: t.out, in: t.in };
  }
  return out;
}

function buildNodes(
  pools: readonly SnapshotLane[],
  cam: Camera,
  traffic: Readonly<Record<LedgerLane, Traffic>>,
): readonly PlaneNode[] {
  const byLane = new Map<LedgerLane, SnapshotLane>();
  for (const lane of pools) byLane.set(lane.lane, lane);

  const nodes: PlaneNode[] = [];
  for (const lane of LANE_ORDER) {
    const row = byLane.get(lane);
    // A lane the document does not carry is not drawn at zero. `pools` is a
    // bare array in the schema - an empty one parses clean - so this is
    // reachable, and a node with no balance would be a disc claiming a
    // measurement of nothing.
    if (row === undefined) continue;

    const p = PLACEMENT[lane];
    const [cx, cy, depth] = project(cam, p.x, p.y, p.z);
    const r = (lane === "ironwood" ? 26 : 22) * depth;
    const drop =
      p.y > 0
        ? (() => {
            const [fx, fy] = project(cam, p.x, 0, p.z);
            return { cx: fx, cy: fy };
          })()
        : null;

    nodes.push({
      lane,
      cx,
      cy,
      r,
      depth,
      veiled: p.veiled,
      balanceZat: row.balanceZat,
      share: row.share,
      // BALANCE IS AN ARC ON THE RING, NEVER DISC AREA. The span between the
      // largest and smallest ledger is about 550x, which makes area useless -
      // sprout at 0.13 per cent becomes a dot. On the ring it is a short tick a
      // reader can still see and count.
      shareSweep: row.share * TAU,
      drop,
      traffic: traffic[lane],
    });
  }

  return nodes;
}

/**
 * One mark per counted crossing, capped, at uniform weight.
 *
 * Every mark is sampled in WORLD space and projected point by point, so it
 * foreshortens like an object instead of bowing like a 2-D ribbon. The fan
 * spread comes from the tip hash, which is what makes two readers on the same
 * block draw the same board.
 */
function buildMarks(tipHash: string, counted: number, nMax: number, cam: Camera): readonly PlaneMark[] {
  const shown = Math.min(counted, nMax);
  const rnd = seededRng(tipHash, "turnstile");
  const marks: PlaneMark[] = [];

  for (let i = 0; i < shown; i += 1) {
    const pair = MEASURED_CROSSINGS[i % MEASURED_CROSSINGS.length];
    if (pair === undefined) continue;
    const [from, to] = pair;
    const a = PLACEMENT[from];
    const b = PLACEMENT[to];
    const spread = (rnd() - 0.5) * 0.46;

    // AGE IS POSITION IN THE WINDOW, NOT ELAPSED TIME. `shown - 1` in the
    // denominator so the oldest mark is exactly 1 and the newest exactly 0; a
    // single mark is newest rather than oldest, which is why the guard is
    // `Math.max(1, ...)` rather than a division that would produce NaN.
    const age = shown === 1 ? 0 : i / (shown - 1);

    // UNIFORM WEIGHT. The lift is a constant, not an amount: the snapshot
    // carries no per-crossing amount, and a varying lift would render one.
    const lift = 0.045 + 0.5 * 0.13;

    let nx = -(b.z - a.z);
    let nz = b.x - a.x;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;

    const pts: string[] = [];
    let depthSum = 0;
    for (let s = 0; s <= SEGMENTS; s += 1) {
      const t = s / SEGMENTS;
      const bow = Math.sin(Math.PI * t);
      const x = a.x + (b.x - a.x) * t + nx * spread * bow;
      const z = a.z + (b.z - a.z) * t + nz * spread * bow;
      const y = a.y + (b.y - a.y) * t + bow * lift;
      const [px, py, pd] = project(cam, x, y, z);
      depthSum += pd;
      pts.push(`${px.toFixed(1)} ${py.toFixed(1)}`);
    }

    marks.push({
      from,
      to,
      d: `M${pts.join(" L")}`,
      age,
      // D3646's two registers extended by age: the newest mark is engraved and
      // the oldest is nearly gone. A pure function of `age`, so it is
      // recomputed on block arrival and never between blocks.
      opacity: Number((0.92 - age * 0.74).toFixed(3)),
      arrow: age <= 0.72,
      depth: depthSum / (SEGMENTS + 1),
    });
  }

  // Far first, so nearer marks occlude correctly.
  return marks.slice().sort((p, q) => p.depth - q.depth);
}

/** The traffic line a node prints, in words. Never a bare zero. */
export function trafficLine(t: Traffic): string {
  switch (t.kind) {
    case "measured":
      // Grouped, like every other count on the site. `1284 out` next to
      // `1,284 crossings measured` in the header is one quantity in two
      // notations, which is the same defect A1 names in a smaller coat.
      return `${t.out.toLocaleString("en")} out / ${t.in.toLocaleString("en")} in`;
    case "measured-zero":
      return "closed - 0 crossings in window";
    case "not-measured":
      // The condition, not the count. This lane's boundary is not in the
      // document at all, and "0" would be a claim the instrument cannot make.
      return "not measured - no crossing source for this boundary";
  }
}
