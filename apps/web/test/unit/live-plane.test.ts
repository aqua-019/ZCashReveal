/**
 * HANDOFF-17 - the living plane, on the pure half.
 *
 * The reducer and the geometry are pure functions, so every assertion about
 * WHAT is drawn can be stated here without a DOM. The rendered half - the
 * subscription, the reduced-motion refusal, the affordance and the DOM
 * separability of the two mark sets - is in `live-plane-layer.test.tsx`.
 *
 * EVERY FAIL SIDE HERE IS A DATA MUTATION drawn from the exclusion set the
 * assertion names in section 5, because a fail side that is only a code
 * mutation proves the assertion is WIRED and never that it DISCRIMINATES
 * (CLAUDE.md, LEDGER-09a Q2). Where the member is a shape of ROW rather than a
 * value, the row is built by `row()` below and handed to the real reducer.
 */
import { describe, expect, it } from "vitest";

import type { LedgerLane, MempoolRow, ZecFrame } from "@zcashreveal/types";

import {
  EMPTY_LIVE_STATE,
  buildLivePlane,
  liveReduce,
  markFor,
  type LiveState,
} from "@/lib/live-plane";
import { SPLASH_CAMERA, SPLASH_N_MAX } from "@/lib/plane";

const OPTS = { camera: SPLASH_CAMERA, nMax: SPLASH_N_MAX };

/** A well-formed row. Every field is one `mempoolRowSchema` actually accepts. */
function row(over: Partial<MempoolRow> & { txid: string }): MempoolRow {
  return {
    ageSeconds: 12,
    version: "v5",
    flow: "t to z",
    lanes: ["transparent", "orchard"],
    valueBalanceText: "-1.00000000",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "unknown",
    finding: "none",
    severity: "INFO",
    class: "shield",
    reasoning: ["a reason"],
    ...over,
  };
}

const txid = (n: number): string => n.toString(16).padStart(64, "0");

function fold(frames: readonly ZecFrame[], from: LiveState = EMPTY_LIVE_STATE): LiveState {
  return frames.reduce<LiveState>((s, f) => liveReduce(s, f), from);
}

const added = (r: MempoolRow): ZecFrame => ({ type: "tx_added", entry: r });

/* ========================================================================== */
/* A4 - NOTHING DRAWS A MARK EXCEPT AN ARRIVED FRAME                          */
/* ========================================================================== */

describe("A4 - nothing draws a live mark except an arrived frame", () => {
  /**
   * THE FAIL SIDE IS THE WHOLE ASSERTION HERE, so it is stated first and it is
   * a DATA mutation over the exclusion set section 5 names: every source of a
   * mark that is not a frame. The reducer is pure and takes only frames, so
   * "advance timers" and "re-render" have no representation in it at all - the
   * DOM half of A4, in the layer test, drives those two. What this half proves
   * is that the FOLD ITSELF invents nothing.
   */
  it("FAIL SIDE (data): zero frames folded gives exactly zero marks, held and drawn", () => {
    const plane = buildLivePlane(EMPTY_LIVE_STATE, OPTS);
    expect(plane.marks).toHaveLength(0);
    expect(plane.held).toBe(0);
    expect(plane.drawn).toBe(0);
    expect(plane.capped).toBe(false);
  });

  it("FAIL SIDE (data): frames that carry no transaction add nothing", () => {
    // `hello` and `tip` are the two members of the frame union that are not
    // about a transaction. A reducer that grew a mark from either would be
    // drawing off the tip, which is exactly the seeded-shoal defect A4 forbids.
    const state = fold([
      { type: "hello", tipHeight: 3_456_227 },
      { type: "tip", height: 3_456_228, hash: txid(9) },
    ]);
    expect(buildLivePlane(state, OPTS).held).toBe(0);
  });

  it("PASS STATE: a mark appears if and only if a tx_added carried it", () => {
    const state = fold([added(row({ txid: txid(1) }))]);
    const plane = buildLivePlane(state, OPTS);
    expect(plane.held).toBe(1);
    expect(plane.drawn).toBe(1);
    expect(plane.marks[0]?.txid).toBe(txid(1));
  });

  it("the fold is a pure function of the frames: the same frames give an identical board", () => {
    // DETERMINISM IS KEYED BY TXID, so a second fold of the same frames in a
    // different order draws the same arcs. This is what makes "a mark does not
    // move when its neighbour arrives" checkable rather than asserted.
    const frames = [added(row({ txid: txid(1) })), added(row({ txid: txid(2) }))];
    const a = buildLivePlane(fold(frames), OPTS);
    const b = buildLivePlane(fold([...frames].reverse()), OPTS);
    const paths = (p: typeof a): readonly string[] => [...p.marks].map((m) => `${m.txid}:${m.d}`).sort();
    expect(paths(a)).toStrictEqual(paths(b));
  });
});

/* ========================================================================== */
/* A1 - a tx_added adds exactly one mark, and a re-delivery adds none         */
/* ========================================================================== */

describe("A1 - tx_added adds exactly one mark and it persists", () => {
  it("PASS STATE: one frame, one mark, still there after further unrelated frames", () => {
    const state = fold([
      added(row({ txid: txid(1) })),
      { type: "tip", height: 3_456_229, hash: txid(9) },
      { type: "hello", tipHeight: 3_456_229 },
    ]);
    const plane = buildLivePlane(state, OPTS);
    expect(plane.drawn).toBe(1);
    expect(plane.marks[0]?.txid).toBe(txid(1));
  });

  it("FAIL SIDE (data - a txid already held): the same frame twice moves no count", () => {
    // The member of the exclusion set is the re-delivered frame, which is what
    // a reconnect produces: the gateway sends a `snapshot` on connect and the
    // panel has already seen every row in it.
    const once = fold([added(row({ txid: txid(1) }))]);
    const twice = fold([added(row({ txid: txid(1) }))], once);
    expect(buildLivePlane(twice, OPTS).drawn).toBe(1);
    expect(buildLivePlane(twice, OPTS).held).toBe(1);
  });

  it("FAIL SIDE (data - the same txid through a snapshot frame): still one mark", () => {
    // The second face of the same member, and the one a reconnect actually
    // takes: `snapshot` carries the whole view, so every held transaction
    // arrives a second time in one message rather than as repeated `tx_added`.
    const first = fold([added(row({ txid: txid(1) }))]);
    const view = {
      tipHeight: 3_456_227,
      entries: [row({ txid: txid(1) }), row({ txid: txid(2) })],
      drain: null,
      summary: SUMMARY,
    };
    const after = liveReduce(first, { type: "snapshot", view });
    expect(buildLivePlane(after, OPTS).held).toBe(2);
  });

  it("a re-delivered frame keeps its ORIGINAL place in the queue", () => {
    // Otherwise a reconnect would push every older transaction out of a capped
    // board and the tank would appear to empty and refill on a socket blip.
    //
    // THE HELD COUNT MUST EXCEED THE CEILING FOR THIS TO BITE, AND THE FIRST
    // DRAFT OF THIS TEST HELD EXACTLY `SPLASH_N_MAX`. At the boundary nothing
    // is evicted, so a re-delivery that reshuffled every `seq` still drew the
    // same 42 txids and the assertion - which sorts them - could not see it.
    // The probe was green against a deliberate mutation of the very line it
    // exists to protect (`seq: existing?.seq ?? state.seq` forced to
    // `seq: state.seq`), which is a fail side that does not fail and therefore
    // a finding in the instrument rather than evidence about the code. It is
    // recorded here rather than quietly repaired, per CLAUDE.md's fail-side
    // rule, and it is this project's LEDGER-08 A9 shape in miniature: an
    // assertion written over an aggregate, driven at the one size where the
    // aggregate cannot move.
    //
    // With 50 held and 42 drawn, txid(1) is the oldest and is NOT on the board.
    // Re-delivering it must leave it off; a fresh `seq` would make it the
    // newest arrival and evict a transaction that really did arrive later.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 50; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const before = buildLivePlane(state, OPTS).marks.map((m) => m.txid).sort();
    expect(before).not.toContain(txid(1));

    state = liveReduce(state, added(row({ txid: txid(1) })));
    const after = buildLivePlane(state, OPTS);
    expect(after.marks.map((m) => m.txid).sort()).toStrictEqual(before);
    expect(after.held).toBe(50);
  });
});

const SUMMARY = {
  unconfirmed: 2,
  shielded: 1,
  migrations: 0,
  transparent: 1,
  decodedCount: 2,
  bytes: 900,
  nextBlockSeconds: 40,
  crossingZat: 0n,
  crossingSplit: "none",
  conventionalFeeZat: 10_000n,
  pricedCount: 2,
  conventionalCount: 2,
  findingsHigh: 0,
  findingsNote: "none",
  feeWeather: "calm",
};

/* ========================================================================== */
/* A2 - a tx_removed removes that mark and no other                           */
/* ========================================================================== */

describe("A2 - tx_removed removes the mark with that txid and no other", () => {
  it("PASS STATE: the named mark goes and its neighbours stay", () => {
    const state = fold([
      added(row({ txid: txid(1) })),
      added(row({ txid: txid(2) })),
      added(row({ txid: txid(3) })),
      { type: "tx_removed", txid: txid(2), reason: "confirmed" },
    ]);
    const plane = buildLivePlane(state, OPTS);
    expect(plane.marks.map((m) => m.txid).sort()).toStrictEqual([txid(1), txid(3)].sort());
  });

  it("FAIL SIDE (data - a txid never added): the set is unchanged and nothing throws", () => {
    const before = fold([added(row({ txid: txid(1) }))]);
    const after = liveReduce(before, { type: "tx_removed", txid: txid(77), reason: "evicted" });
    expect(buildLivePlane(after, OPTS).held).toBe(1);
    expect(buildLivePlane(after, OPTS).marks[0]?.txid).toBe(txid(1));
  });

  it("FAIL SIDE (data - a well-formed txid of a DIFFERENT held transaction): only the named one goes", () => {
    // THE MEMBER THAT DISCRIMINATES. A one-mark tank cannot tell "removes the
    // named mark" from "removes everything", so the assertion is driven against
    // a populated tank and the survivors are named rather than counted.
    const state = fold([
      added(row({ txid: txid(4) })),
      added(row({ txid: txid(5) })),
      { type: "tx_removed", txid: txid(4), reason: "replaced" },
    ]);
    expect(buildLivePlane(state, OPTS).marks.map((m) => m.txid)).toStrictEqual([txid(5)]);
  });

  it("all three reasons remove the mark, and the reason survives the fold", () => {
    // C4: only `confirmed` means the transaction settled. The mark leaves in
    // every case because the tank's fullness is the mempool's depth, and the
    // reason is kept because saying "confirmed" of an eviction would tell a
    // reader a dropped transaction landed.
    for (const reason of ["confirmed", "evicted", "replaced"] as const) {
      const state = fold([
        added(row({ txid: txid(1) })),
        { type: "tx_removed", txid: txid(1), reason },
      ]);
      expect(buildLivePlane(state, OPTS).held).toBe(0);
      expect(state.lastRemoval).toBe(reason);
    }
  });
});

/* ========================================================================== */
/* A3 - the count, the cap, and the true figure beside the drawn one          */
/* ========================================================================== */

describe("A3 - the mark count equals the held count up to SPLASH_N_MAX", () => {
  it("PASS STATE: below the ceiling, drawn equals held and capped is false", () => {
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 7; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const plane = buildLivePlane(state, OPTS);
    expect(plane.drawn).toBe(7);
    expect(plane.held).toBe(7);
    expect(plane.capped).toBe(false);
  });

  it("FAIL SIDE (data - a held count of 50, from inside the stated set): 42 marks AND capped true AND the true 50", () => {
    // Never 50 marks, and never a silent 42: a cap the reader cannot see is the
    // same defect as no cap at all, because a full tank and a busy one then
    // look identical.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 50; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const plane = buildLivePlane(state, OPTS);
    expect(plane.drawn).toBe(SPLASH_N_MAX);
    expect(plane.marks).toHaveLength(SPLASH_N_MAX);
    expect(plane.capped).toBe(true);
    expect(plane.held).toBe(50);
  });

  it("exactly at the ceiling is NOT capped", () => {
    // The boundary, because `>` and `>=` are the same length and read alike.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= SPLASH_N_MAX; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const plane = buildLivePlane(state, OPTS);
    expect(plane.drawn).toBe(SPLASH_N_MAX);
    expect(plane.capped).toBe(false);
  });

  it("a capped board keeps the NEWEST arrivals", () => {
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 50; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const kept = new Set(buildLivePlane(state, OPTS).marks.map((m) => m.txid));
    expect(kept.has(txid(50))).toBe(true);
    expect(kept.has(txid(1))).toBe(false);
  });

  it("undrawn rows do NOT consume the board's ceiling", () => {
    // A row that draws nothing is held and counted; letting it occupy a slot
    // would make a tank of undecodable transactions look full and empty at once.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 20; i += 1) {
      state = liveReduce(state, added(row({ txid: txid(i), class: "undecoded", lanes: [] })));
    }
    for (let i = 100; i < 100 + SPLASH_N_MAX; i += 1) {
      state = liveReduce(state, added(row({ txid: txid(i) })));
    }
    const plane = buildLivePlane(state, OPTS);
    expect(plane.drawn).toBe(SPLASH_N_MAX);
    expect(plane.capped).toBe(false);
    expect(plane.held).toBe(20 + SPLASH_N_MAX);
  });
});

/* ========================================================================== */
/* A8 - a row with no derivable direction draws nothing, and is counted       */
/* ========================================================================== */

describe("A8 - direction comes from `class`, and an underivable row draws no mark", () => {
  it("PASS STATE: the three classes that carry a direction draw an oriented crossing", () => {
    expect(markFor(row({ txid: txid(1), class: "shield", lanes: ["transparent", "orchard"] }))).toStrictEqual({
      kind: "crossing",
      from: "transparent",
      to: "orchard",
    });
    expect(markFor(row({ txid: txid(2), class: "deshield", lanes: ["transparent", "sapling"] }))).toStrictEqual({
      kind: "crossing",
      from: "sapling",
      to: "transparent",
    });
    expect(markFor(row({ txid: txid(3), class: "migration", lanes: ["orchard", "ironwood"] }))).toStrictEqual({
      kind: "crossing",
      from: "orchard",
      to: "ironwood",
    });
  });

  it("FAIL SIDE (data - class `undecoded`): no mark, and the reason is named", () => {
    const shape = markFor(row({ txid: txid(1), class: "undecoded", lanes: ["transparent"] }));
    expect(shape).toStrictEqual({ undrawn: "no lane can be claimed" });
  });

  it("FAIL SIDE (data - an empty lanes array): no mark, same reason", () => {
    // EMPTY IS LEGAL SINCE HANDOFF-07 and means "no lane can be claimed". A
    // build that defaulted it to `transparent` would draw a transparent mark
    // for a transaction nobody read, which is the exact defect
    // `mempoolRowSchema.lanes`'s own docblock records.
    expect(markFor(row({ txid: txid(1), class: "shielded", lanes: [] }))).toStrictEqual({
      undrawn: "no lane can be claimed",
    });
  });

  it("FAIL SIDE (data - three lanes with no direction): no mark, and it says why", () => {
    expect(
      markFor(row({ txid: txid(1), class: "mixed", lanes: ["transparent", "sapling", "orchard"] })),
    ).toStrictEqual({ undrawn: "no single crossing describes it" });
  });

  it("an underivable row is HELD and COUNTED, never dropped", () => {
    // A dropped row does not look like a bug, it looks like a quiet mempool.
    const state = fold([
      added(row({ txid: txid(1), class: "undecoded", lanes: [] })),
      added(row({ txid: txid(2), class: "mixed", lanes: ["transparent", "sapling", "orchard"] })),
    ]);
    const plane = buildLivePlane(state, OPTS);
    expect(plane.held).toBe(2);
    expect(plane.drawn).toBe(0);
    expect(plane.undrawn["no lane can be claimed"]).toBe(1);
    expect(plane.undrawn["no single crossing describes it"]).toBe(1);
  });

  it("a shield naming TWO shielded lanes is not oriented, because the destination is ambiguous", () => {
    // The guess this function exists to refuse: a transparent origin and two
    // possible destinations. It falls through to the undirected chord, which
    // claims no direction rather than picking one.
    const shape = markFor(row({ txid: txid(1), class: "shield", lanes: ["sapling", "orchard"] }));
    expect(shape).toStrictEqual({ kind: "chord", a: "sapling", b: "orchard" });
  });

  it("one lane draws a RESIDENT ring: value moving inside a pool crosses nothing", () => {
    expect(markFor(row({ txid: txid(1), class: "transparent", lanes: ["transparent"] }))).toStrictEqual({
      kind: "resident",
      lane: "transparent",
    });
  });

  it("a chord is a function of the SET, not of the producer's array order", () => {
    const a = markFor(row({ txid: txid(1), class: "mixed", lanes: ["orchard", "transparent"] }));
    const b = markFor(row({ txid: txid(1), class: "mixed", lanes: ["transparent", "orchard"] }));
    expect(a).toStrictEqual(b);
  });

  it("a duplicated lane is one lane, so it stays a resident rather than becoming a chord", () => {
    // `lanes` is a SET in meaning and an array in the wire form, and nothing
    // upstream dedupes it. Without this the same lane twice would draw a chord
    // from a node to itself - a crossing between a pool and itself, which is
    // not a thing that can happen.
    // No cast: `z.array(ledgerSchema)` admits duplicates, so this is a value a
    // producer can legally put on the wire rather than a shape forced past the
    // type. The first draft asserted it through `as unknown as readonly ...`,
    // which typechecked in vitest and failed `tsc` - `MempoolRow["lanes"]` is
    // mutable - and, worse, would have made the test about a value the schema
    // rejects rather than one it accepts.
    expect(markFor(row({ txid: txid(1), class: "shielded", lanes: ["orchard", "orchard"] }))).toStrictEqual({
      kind: "resident",
      lane: "orchard",
    });
  });
});

/* ========================================================================== */
/* The geometry, and the one property that makes a live mark honest           */
/* ========================================================================== */

describe("the paint carries the claim: an unconfirmed mark has no settled head", () => {
  it("only a crossing gets a head and only a crossing travels", () => {
    // GOLD IS THE SETTLEMENT REGISTER. A live crossing ends in a hollow ring in
    // its own lane's hue rather than the gold arrowhead the settled board
    // spends, and a chord - which claims no direction - has no head at all,
    // because travel and a head are both direction claims.
    const state = fold([
      added(row({ txid: txid(1), class: "shield", lanes: ["transparent", "orchard"] })),
      added(row({ txid: txid(2), class: "mixed", lanes: ["sapling", "orchard"] })),
      added(row({ txid: txid(3), class: "transparent", lanes: ["transparent"] })),
    ]);
    const byId = new Map(buildLivePlane(state, OPTS).marks.map((m) => [m.txid, m]));

    expect(byId.get(txid(1))?.head).not.toBeNull();
    expect(byId.get(txid(1))?.travels).toBe(true);

    expect(byId.get(txid(2))?.head).toBeNull();
    expect(byId.get(txid(2))?.travels).toBe(false);

    expect(byId.get(txid(3))?.head).toBeNull();
    expect(byId.get(txid(3))?.travels).toBe(false);
  });

  it("the mark is painted in the ORIGIN lane's hue, as the settled board is", () => {
    const state = fold([added(row({ txid: txid(1), class: "deshield", lanes: ["transparent", "sapling"] }))]);
    expect(buildLivePlane(state, OPTS).marks[0]?.lane).toBe("sapling");
  });

  it("every path is finite: no NaN reaches an SVG attribute", () => {
    // `project` divides by `1 - z * persp`, and a NaN in a path `d` renders as
    // nothing at all - a mark that silently does not draw is the one failure
    // mode this whole surface exists to prevent.
    const lanes: readonly LedgerLane[] = ["transparent", "sprout", "sapling", "orchard", "ironwood"];
    let state = EMPTY_LIVE_STATE;
    let n = 1;
    for (const lane of lanes) {
      state = liveReduce(state, added(row({ txid: txid(n), class: "shielded", lanes: [lane] })));
      n += 1;
      for (const other of lanes) {
        if (other === lane) continue;
        state = liveReduce(state, added(row({ txid: txid(n), class: "mixed", lanes: [lane, other] })));
        n += 1;
      }
    }
    const plane = buildLivePlane(state, { camera: SPLASH_CAMERA, nMax: 1000 });
    expect(plane.drawn).toBeGreaterThan(20);
    for (const m of plane.marks) {
      expect(m.d).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(m.depth)).toBe(true);
      if (m.head !== null) {
        expect(Number.isFinite(m.head.cx)).toBe(true);
        expect(Number.isFinite(m.head.cy)).toBe(true);
        expect(Number.isFinite(m.head.r)).toBe(true);
      }
    }
  });
});
