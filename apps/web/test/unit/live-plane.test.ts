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

import { POOL_INITIAL } from "@zcashreveal/types";

import {
  EMPTY_LIVE_STATE,
  POOL_FOR_INITIAL,
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
/* A11 - a snapshot is the mempool, not an addition to it (gate round 1)      */
/* ========================================================================== */

describe("A11 - a reconnect snapshot is AUTHORITATIVE", () => {
  it("FAIL SIDE (data - a snapshot that OMITS a held txid): the omitted mark is retired", () => {
    // The member of the exclusion set is the reconciling snapshot naming fewer
    // transactions than are held, which is what a reconnect after a confirmation
    // looks like: the `tx_removed` went to a closed socket and is never coming.
    // Folded additively the board went on drawing a CONFIRMED transaction as
    // unconfirmed and the affordance printed the wrong count with confidence.
    let s = fold([added(row({ txid: txid(1) })), added(row({ txid: txid(2) }))]);
    expect(buildLivePlane(s, OPTS).drawn).toBe(2);

    s = liveReduce(s, {
      type: "snapshot",
      view: { tipHeight: 1, entries: [row({ txid: txid(2) })], drain: null, summary: SUMMARY },
    });
    const after = buildLivePlane(s, OPTS);
    expect(after.held).toBe(1);
    expect(after.marks.map((m) => m.txid)).toStrictEqual([txid(2)]);
  });

  it("a survivor keeps its ORIGINAL seq, IN EVERY ORDER THE PRODUCER CAN SEND", () => {
    // THE FIRST DRAFT DROVE ARRIVAL ORDER, WHICH IS THE ONE ORDER THE GATEWAY
    // NEVER SENDS - so it passed against the mutant it exists to exclude.
    //
    // Read off the producer rather than guessed: `readLiveReports` in
    // `apps/gateway/src/live-reports.ts` builds the view from
    // `Object.values(await redis.hgetall("zcashreveal:mempool:live"))`. That is
    // a Redis HASH, keyed by txid, and its iteration order is the hash's
    // internal order - arbitrary with respect to arrival, and for a mempool of
    // any size effectively a permutation keyed by the txid. Nothing anywhere on
    // that path sorts by arrival.
    //
    // Driven in arrival order the reshuffle is INVISIBLE, because fresh
    // sequence numbers assigned in arrival order preserve the arrival ordering:
    // the sorted top-42 comes out identical and the assertion cannot move. The
    // property is that the board is invariant under the ORDER of the view, so
    // the test quantifies over orders instead of picking the flattering one.
    let base = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 50; i += 1) base = liveReduce(base, added(row({ txid: txid(i) })));
    const before = buildLivePlane(base, OPTS).marks.map((m) => m.txid).sort();

    // NOTE THE SIZE: at 50 the hold never reaches `HOLD_MAX`, so this block
    // exercises the DRAW cap only and is blind to the verbatim pre-fix fold.
    // A1 (18) below drives the same orders at 300, which is where the hold caps.
    for (const [name, order] of REPLAY_ORDERS(50)) {
      // The same 50, re-delivered as one snapshot. Nothing has changed, so the
      // board must not change either - whichever order they arrive in.
      const after = liveReduce(base, {
        type: "snapshot",
        view: {
          tipHeight: 1,
          entries: order.map((i) => row({ txid: txid(i) })),
          drain: null,
          summary: SUMMARY,
        },
      });
      expect(buildLivePlane(after, OPTS).marks.map((m) => m.txid).sort(), name).toStrictEqual(before);
    }
  });

  it("an empty snapshot empties the tank - a quiet mempool is a real reading", () => {
    let s = fold([added(row({ txid: txid(1) }))]);
    s = liveReduce(s, {
      type: "snapshot",
      view: { tipHeight: 1, entries: [], drain: null, summary: SUMMARY },
    });
    expect(buildLivePlane(s, OPTS).held).toBe(0);
  });
});

describe("A12 - the held set is bounded (gate round 1)", () => {
  it("FAIL SIDE (data - 3000 additions, from inside the stated set): the hold caps at 250", () => {
    // `SPLASH_N_MAX` caps what is DRAWN and nothing capped what was HELD, so a
    // tab left open on a gateway that never sends `tx_removed` grew the map
    // without bound - measured at 3,000 - with `add` copying it per frame.
    // 250 is `MempoolPanel`'s own cap, adopted rather than invented.
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 3000; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    expect(s.held.size).toBe(250);
  });

  it("the hold evicts the OLDEST, so the newest arrivals survive", () => {
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    expect(s.held.has(txid(300))).toBe(true);
    expect(s.held.has(txid(1))).toBe(false);
  });
});

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
    // AND IT RECORDS THAT NO MARK LEFT, so the affordance cannot say one did.
    // A `tx_removed` for a txid this reader never held is routine - the reader
    // connected after it entered the pool - and the first draft printed "the
    // last mark to leave was confirmed into a block" for it, about a mark that
    // never existed on this board.
    expect(after.lastRemoval).toStrictEqual({ reason: "evicted", wasHeld: false, drewMark: false });
  });

  it("a held row that DREW NO MARK records that it drew none", () => {
    const s2 = fold([
      added(row({ txid: txid(1), class: "undecoded", lanes: [] })),
      { type: "tx_removed", txid: txid(1), reason: "confirmed" },
    ]);
    expect(s2.lastRemoval).toStrictEqual({ reason: "confirmed", wasHeld: true, drewMark: false });
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
      expect(state.lastRemoval).toStrictEqual({ reason, wasHeld: true, drewMark: true });
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

describe("A8 - direction comes from `class` and `flow`, and an underivable row draws no mark", () => {
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
    // THE `flow` IS PASSED HERE AND IT WAS NOT BEFORE, which is the whole of
    // R2-1 showing up in a test. This row previously inherited the helper's
    // default `flow: "t to z"` and still drew the ZIP 318 arc - because the
    // pre-fix code never read `flow` at all. That is a row the producer cannot
    // emit: `flowTextFor` sends every `migration` through `migrationFlowText`,
    // which writes pool initials. A `migration` carrying a shield caption is a
    // contradiction, and it now draws nothing rather than an arc chosen from
    // the half of the row that cannot carry a direction.
    expect(
      markFor(row({ txid: txid(3), class: "migration", lanes: ["orchard", "ironwood"], flow: "O to I" })),
    ).toStrictEqual({
      kind: "crossing",
      from: "orchard",
      to: "ironwood",
    });
  });

  it("FAIL SIDE (data - a `migration` the GATEWAY emits that is NOT ZIP 318): the arc is the pair the CELL names", () => {
    // CAPTURED FROM THE PRODUCER, NOT ENUMERATED FROM THE FIXTURE (F-57-1).
    // `crossesWithNoPublicSide` in `apps/gateway/src/views/mempool.ts` is
    // `movedPools.length > 1 && hasPoolSource && hasPoolSink &&
    // !hasTransparentSource && vout.length === 0`, which a Sapling-to-Orchard
    // shielded transfer satisfies - and `migrationFlowText` prints "S to O" for
    // it. The committed corpus contains only `O to I`, so this shape exists in
    // production and in no fixture: the exclusion set could not be closed by
    // reading the corpus, which is exactly what F-57-1 says.
    //
    // THIS ASSERTION USED TO EXPECT A CHORD, AND THAT WAS THE SECOND DRAFT'S
    // DEFECT WRITTEN DOWN AS AN EXPECTATION. Refusing the ZIP 318 arc was
    // right; drawing an UNDIRECTED chord for a row whose own cell says "S to O"
    // claims less than the row measured, and it came from the same reading of
    // `lanes` that left R2-1's direction open. The flow decides, so the arc is
    // Sapling to Orchard and agrees with the cell beside it.
    const shape = markFor(
      row({ txid: txid(1), class: "migration", lanes: ["sapling", "orchard"], flow: "S to O" }),
    );
    expect(shape).toStrictEqual({ kind: "crossing", from: "sapling", to: "orchard" });
    expect(shape).not.toStrictEqual({ kind: "crossing", from: "orchard", to: "ironwood" });
  });

  it("a THREE-pool migration - the gateway's `N pools` row - draws nothing", () => {
    expect(
      markFor(row({ txid: txid(1), class: "migration", lanes: ["sprout", "sapling", "orchard"], flow: "3 pools" })),
    ).toStrictEqual({ undrawn: "no single crossing describes it" });
  });

  it("PASS STATE: a migration that NAMES orchard and ironwood still draws the ZIP 318 arc", () => {
    expect(
      markFor(row({ txid: txid(1), class: "migration", lanes: ["orchard", "ironwood"], flow: "O to I" })),
    ).toStrictEqual({ kind: "crossing", from: "orchard", to: "ironwood" });
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
/* HANDOFF-18 - the round-2 debt                                              */
/* ========================================================================== */

/**
 * The orders a `snapshot` view can arrive in, for a replay of `n` rows.
 *
 * ARRIVAL ORDER IS THE ONE ORDER THE GATEWAY NEVER SENDS.
 * `apps/gateway/src/live-reports.ts` builds the view from
 * `Object.values(await redis.hgetall("zcashreveal:mempool:live"))` - a Redis
 * HASH keyed by txid, whose iteration order is arbitrary with respect to
 * arrival. Any assertion about a reconnect that drives arrival order alone is
 * driving the one case in which a reshuffle cannot be seen.
 */
const REPLAY_ORDERS = (n: number): ReadonlyArray<readonly [string, readonly number[]]> => {
  const arrival = Array.from({ length: n }, (_, i) => i + 1);
  return [
    ["arrival", arrival],
    ["reversed", [...arrival].reverse()],
    // A deterministic permutation standing in for hash order: multiplicative
    // scatter on the index, which is what a bucket layout amounts to here.
    ["scattered", [...arrival].sort((a, b) => ((a * 2654435761) % 997) - ((b * 2654435761) % 997))],
  ];
};

describe("A1 (18) - a 300-transaction mempool and ONE reconnect keeps the marks it held", () => {
  /**
   * THE MEASURED SYMPTOM, AND IT IS THE ONE THE OPERATOR WOULD HAVE SEEN.
   *
   * `HOLD_MAX` caps the tank at 250 and the snapshot arm rebuilt the map by
   * calling `add` against a FRESH EMPTY MAP, writing each survivor's `seq` back
   * afterwards. `add` reads `existing` from the map it is handed, so every row
   * looked new and took a fresh higher `seq`; `add` also evicted inside itself,
   * so eviction ran MID-LOOP against sequence numbers not yet restored.
   *
   * Reproduced against the pre-fix tree by execution, 300 rows and one
   * reconnect replaying the SAME view:
   *
   *   before the snapshot the board drew txids 259..300
   *   after  the snapshot the board drew txids 9..50
   *   SURVIVED: 0 of 42
   *   and it was holding txid(1) - a row it had already evicted - while the
   *   rows it had been drawing were gone.
   *
   * That is verbatim the failure `add`'s own comment says a kept `seq`
   * prevents: "the tank would appear to empty and refill on a socket blip that
   * changed nothing."
   *
   * THE COMMITTED CORPUS CANNOT REACH THIS AND MUST NOT BE STRETCHED TO. It is
   * 14 rows - evidence about the chain, not a fixture to bend - and the shape
   * needs 300, so the rows are built here from the producer's own shape.
   */
  it("FAIL SIDE (data - 300 rows and one reconnect, from inside the stated set): all 42 survive", () => {
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    const before = buildLivePlane(s, OPTS).marks.map((m) => m.txid);
    expect(before).toHaveLength(SPLASH_N_MAX);

    // DRIVEN OVER EVERY ORDER, AND THE SIZE AND THE ORDER BOTH MATTER.
    // A gate reviewer measured the two axes separately: at n=50 the hold never
    // reaches `HOLD_MAX`, so the verbatim pre-fix fold is invisible in all three
    // orders; at n=300 in ARRIVAL order the seq-loss mutant is invisible,
    // because fresh numbers assigned in arrival order preserve the arrival
    // ordering. Only n=300 crossed with a NON-arrival order sees both, and that
    // is also the only combination the real gateway can send - `readLiveReports`
    // builds the view from `Object.values(hgetall)`, which is Redis hash order.
    for (const [name, order] of REPLAY_ORDERS(300)) {
      const after = liveReduce(s, {
        type: "snapshot",
        view: {
          tipHeight: 3_456_227,
          entries: order.map((i) => row({ txid: txid(i) })),
          drain: null,
          summary: SUMMARY,
        },
      });
      const drawn = buildLivePlane(after, OPTS).marks.map((m) => m.txid);

      // EVERY ONE, not "most" and not "the count is still 42" - a board that
      // swapped all 42 for 42 others also has 42 marks, which is how the pre-fix
      // tree looked correct to a count.
      expect(drawn.filter((t) => before.includes(t)), name).toHaveLength(SPLASH_N_MAX);
    }
  });

  it("and a row the reader had EVICTED is not promoted over one it still holds", () => {
    // THE OTHER HALF OF THE SAME DEFECT, and the half a survivor count cannot
    // see. txid(1) is the oldest of 300 and was evicted long before the
    // reconnect; the replayed view names it again, and dating it as a fresh
    // arrival is what pushed the held rows off the board.
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    expect(s.held.has(txid(1))).toBe(false);

    const after = liveReduce(s, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        entries: Array.from({ length: 300 }, (_, i) => row({ txid: txid(i + 1) })),
        drain: null,
        summary: SUMMARY,
      },
    });
    expect(after.held.has(txid(1))).toBe(false);
    expect(after.held.has(txid(300))).toBe(true);
  });

  it("a txid TWICE in one view is ONE transaction (the band width is not observable - see below)", () => {
    // THE HELD SET IS THE PART THAT IS OBSERVABLE, AND IT IS ASSERTED HERE.
    // `lanes` is a set in meaning and an array on the wire, and the same is true
    // of a view's entries: nothing upstream dedupes them.
    const held1 = fold([added(row({ txid: txid(9) }))]);
    const s = liveReduce(held1, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        entries: [row({ txid: txid(9) }), row({ txid: txid(1) }), row({ txid: txid(2) }), row({ txid: txid(1) })],
        drain: null,
        summary: SUMMARY,
      },
    });
    expect(s.held.size).toBe(3);
    expect(s.held.has(txid(1))).toBe(true);
  });

  /*
   * AND `replace()`'s DUPLICATE-TXID BRANCH IS AN EQUIVALENT MUTANT, REPORTED
   * RATHER THAN DRESSED WITH A TEST THAT WOULD NOT DISCRIMINATE.
   *
   * A gate reviewer deleted that branch and the file stayed green, and reported
   * it as an unguarded site. Two probes were then written for it and NEITHER
   * discriminated, which is a finding about the site rather than about the
   * probes: worked by hand, the stranger band's occupied MINIMUM is
   * `floor - (distinct strangers)` whether or not the duplicate is counted,
   * because a duplicate's earlier slot is overwritten by its later one. Driven:
   * deleting the branch leaves 57/57 green.
   *
   * What does change is WHICH stranger sits where inside the band - with the
   * branch the first occurrence's view position wins, without it the last. That
   * order is Redis hash order, which this file's own `REPLAY_ORDERS` docblock
   * says carries no meaning, so pinning it would assert a property the producer
   * does not define. LEDGER-11 Q5(c): an assertion whose exclusion set is empty
   * is deleted, not dressed.
   *
   * The branch is KEPT - it stops `strangers` counting a row twice, which is
   * what the band width is computed from, and it saves a second `markFor` on a
   * duplicated row - and it is recorded here as covered by a written rule rather
   * than by a guard, which CLAUDE.md's clause (b) says is explicitly WEAKER and
   * must be recorded as weaker.
   */

  it("a stranger in the view is HELD when there is room, and never dated as newest", () => {
    // The complement, so the rule is not "ignore anything unrecognised". A
    // snapshot naming a transaction this reader never saw is a real
    // transaction: it is kept. What it does not get is a claim to be recent,
    // because nothing here watched it arrive.
    let s = fold([added(row({ txid: txid(1) })), added(row({ txid: txid(2) }))]);
    s = liveReduce(s, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        entries: [row({ txid: txid(1) }), row({ txid: txid(2) }), row({ txid: txid(9) })],
        drain: null,
        summary: SUMMARY,
      },
    });
    expect(s.held.size).toBe(3);
    expect(s.held.has(txid(9))).toBe(true);
    const stranger = s.held.get(txid(9));
    const survivors = [txid(1), txid(2)].map((t) => s.held.get(t)?.seq ?? 0);
    for (const seq of survivors) expect(stranger?.seq).toBeLessThan(seq);
  });
});

describe("A2 (18) - a migration's direction comes from `flow`, not from the pair", () => {
  /**
   * THE ROWS BELOW ARE CAPTURED FROM THE REAL PRODUCER, NOT WRITTEN FROM MEMORY.
   *
   * F-57-1: an exclusion-set member must be a shape a real producer emits, and
   * the set is closed by CAPTURE. Driving `mempoolRow` in
   * `apps/gateway/src/views/mempool.ts` over both directions of the ZIP 318
   * crossing - Ironwood-source and Orchard-source `perPoolZat` deltas through
   * the gateway's own `LeakReport` fixture - emitted exactly:
   *
   *   REVERSED (Ironwood -> Orchard): class=migration flow="I to O" lanes=["orchard","ironwood"]
   *   FORWARD  (Orchard -> Ironwood): class=migration flow="O to I" lanes=["orchard","ironwood"]
   *
   * THE LANE ARRAYS ARE IDENTICAL, IN THE SAME CANONICAL ORDER. That is the
   * whole finding: no predicate over `lanes` can tell the two apart, so the fix
   * that required the row to NAME orchard and ironwood closed the PAIR and left
   * the DIRECTION open - and the reversed row still drew orchard-to-ironwood,
   * in the wrong lane's hue, beside a cell reading "I to O".
   */
  const migration = (flow: string, lanes: MempoolRow["lanes"]): MempoolRow =>
    row({ txid: txid(1), class: "migration", lanes, flow });

  it("FAIL SIDE (data - the REVERSED ZIP 318 row the producer emits): Ironwood to Orchard", () => {
    expect(markFor(migration("I to O", ["orchard", "ironwood"]))).toStrictEqual({
      kind: "crossing",
      from: "ironwood",
      to: "orchard",
    });
  });

  it("PASS STATE: the forward row, with the identical lane set, still draws Orchard to Ironwood", () => {
    // THE MEMBER THAT MAKES THE ONE ABOVE EVIDENCE. A build that simply
    // reversed the pair would pass the fail side and fail here; the two rows
    // differ in `flow` alone, so only a reader that reads `flow` gets both.
    expect(markFor(migration("O to I", ["orchard", "ironwood"]))).toStrictEqual({
      kind: "crossing",
      from: "orchard",
      to: "ironwood",
    });
  });

  it("the mark is painted in the ORIGIN lane's hue, which is what the reversed row got wrong", () => {
    // The defect a reader actually saw was a HUE: the arc was painted orchard
    // for a crossing that left Ironwood. `lane` is the origin, so this is the
    // rendered half of the assertion above.
    const s = fold([added(migration("I to O", ["orchard", "ironwood"]))]);
    expect(buildLivePlane(s, OPTS).marks[0]?.lane).toBe("ironwood");
  });

  it("every ordered pair of pools the producer can name draws the pair it named", () => {
    // ITERATING THE RULE'S OWN DATA STRUCTURE rather than sampling two cases,
    // so a fifth pool cannot arrive with an untested letter.
    const pools = Object.keys(POOL_INITIAL) as ReadonlyArray<keyof typeof POOL_INITIAL>;
    for (const from of pools) {
      for (const to of pools) {
        if (from === to) continue;
        const flow = `${POOL_INITIAL[from]} to ${POOL_INITIAL[to]}`;
        expect(markFor(migration(flow, [from, to])), flow).toStrictEqual({
          kind: "crossing",
          from,
          to,
        });
      }
    }
  });

  it("a `flow` the cell could not decide draws NOTHING and is held with its reason", () => {
    // `"N pools"` is the ONE such caption a `migration` row can actually carry,
    // and it is producible: driven through the real `mempoolRow`, a three-pool
    // crossing with no public side emits `flow: "3 pools"`. A chord would claim
    // a two-lane relationship the row describes differently; an arc would guess.
    // A8's rule.
    expect(markFor(migration("3 pools", ["sprout", "sapling", "orchard"]))).toStrictEqual({
      undrawn: "no single crossing describes it",
    });
  });

  it("GUARDS A FUTURE PRODUCER (no shipped caller emits this): the literal `migration` caption", () => {
    // NOT A CAPTURED MEMBER, AND AN EARLIER DRAFT PRESENTED IT AS ONE.
    // `migrationFlowText` returns the literal iff `from.length === 0 ||
    // to.length === 0`, and `crossesWithNoPublicSide` - the predicate that
    // assigns the class - requires `hasPoolSource && hasPoolSink`, the exact
    // negation over the same two filters. So no row can carry both, and 480
    // shapes driven through the real producer emit fourteen distinct migration
    // flows with the literal not among them.
    //
    // Kept, and LABELLED, rather than deleted: the branch is cheap and a future
    // producer could widen the class. What F-58-1 forbids is a case with no
    // producer whose comment reads exactly like one that works.
    expect(markFor(migration("migration", ["orchard", "ironwood"]))).toStrictEqual({
      undrawn: "no single crossing describes it",
    });
  });

  it("a flow naming a lane the row does not list draws nothing rather than picking a winner", () => {
    // Two statements about one transaction that contradict each other. Nothing
    // in the shipped producer emits it - `lanes` and `perPoolZat` come off the
    // same decoded bundle - so this guards a future producer.
    expect(markFor(migration("S to O", ["orchard", "ironwood"]))).toStrictEqual({
      undrawn: "no single crossing describes it",
    });
  });

  it("a pool crossing to ITSELF is not a crossing, and draws nothing", () => {
    // A gate reviewer deleted the `from === to` clause and the file stayed
    // green. `migrationFlowText` cannot emit it - a pool's delta has one sign,
    // so it is a source or a sink and not both - but the guard is the sibling of
    // the flow-versus-lanes agreement check in the same `if`, and that one has a
    // test. An arc from a node to itself has no geometry here.
    expect(markFor(migration("O to O", ["orchard"]))).toStrictEqual({
      undrawn: "no single crossing describes it",
    });
  });

  it("the browser's letter map is exactly the producer's, over the producer's OWN KEYS", () => {
    // THE SEAM, CLOSED BY A TEST BECAUSE IT CANNOT BE CLOSED BY AN IMPORT.
    // `POOL_FOR_INITIAL` is a deliberate local copy of `POOL_INITIAL`: importing
    // that object by value pulls zod through the barrel and cost 15 kB of the
    // splash bundle, measured both ways on one variable (5.5 kB route JS / 118
    // kB first load against 21.4 kB / 133 kB). A copy is a drift risk and a
    // comment is not a guard, so the agreement is checked here.
    //
    // ITERATING `POOL_INITIAL`'s OWN KEYS is the point: a fifth pool added to
    // the declaration fails HERE rather than arriving on the wire as a letter
    // this parser silently declines.
    for (const pool of Object.keys(POOL_INITIAL) as ReadonlyArray<keyof typeof POOL_INITIAL>) {
      expect(POOL_FOR_INITIAL[POOL_INITIAL[pool]], pool).toBe(pool);
    }
    // And no letter on this side that the producer does not write, which is the
    // direction the loop above cannot see.
    expect(Object.keys(POOL_FOR_INITIAL).sort()).toStrictEqual(Object.values(POOL_INITIAL).sort());
  });
});

describe("A3 (18) - at 3,000 held the printed figure is true, or it is named as bounded", () => {
  /**
   * `capped` ASKED THE WRONG QUESTION AND WAS OFF WHEN THE FIGURE WAS FURTHEST
   * WRONG. It was `drawable.length > nMax`, so on a mempool of undecodable rows
   * - nothing drawable - it evaluates `0 > 42` and the one branch that would
   * hedge the figure is false. Reproduced pre-fix: `held=250 drawn=0
   * capped=false`, and the page printed "of 250 held" for a 3,000-transaction
   * mempool. A confident wrong number, which `chain-inputs.ts`'s
   * absence-versus-zero rule rates worse than no number at all.
   */
  it("FAIL SIDE (data - 3,000 undecodable rows, from inside the stated set): the hedge is ON", () => {
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 3000; i += 1) {
      s = liveReduce(s, added(row({ txid: txid(i), class: "undecoded", lanes: [] })));
    }
    const plane = buildLivePlane(s, OPTS);
    expect(plane.held).toBe(250);
    expect(plane.drawn).toBe(0);
    // BOTH, and they hedge different figures: `capped` says the MARKS are a
    // sample, `holdCapped` says the NUMBER beside them is a floor.
    expect(plane.capped).toBe(true);
    expect(plane.holdCapped).toBe(true);
  });

  it("FAIL SIDE (data - 3,000 DRAWABLE rows): the same hedge, through the other branch", () => {
    // The draw cap alone would have caught this one, which is why the undecoded
    // case above is the member that discriminates.
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 3000; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    const plane = buildLivePlane(s, OPTS);
    expect(plane.held).toBe(250);
    expect(plane.drawn).toBe(SPLASH_N_MAX);
    expect(plane.capped).toBe(true);
    expect(plane.holdCapped).toBe(true);
  });

  it("PASS STATE: a hold that never evicted prints an exact figure", () => {
    // The other polarity, and the one that stops the fix being "always hedge" -
    // a permanent "at least" would make every honest count unreadable.
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 50; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    const plane = buildLivePlane(s, OPTS);
    expect(plane.held).toBe(50);
    expect(plane.holdCapped).toBe(false);
    expect(plane.capped).toBe(true);
  });

  it("FAIL SIDE (data - a 3,000-entry SNAPSHOT): the hold caps and says so on the reconnect path too", () => {
    // THE PATH EVERY RECONNECT TAKES, AND IT WAS ASSERTED NOWHERE. Every other
    // A3 case reaches `holdCapped` through `tx_added`; a gate reviewer showed
    // that hardwiring `holdCapped: false` inside `replace()` left the whole file
    // green. In production the full view arrives on every connect, so this is
    // the ordinary way a real reader's hold gets capped rather than an exotic
    // one.
    const s = liveReduce(EMPTY_LIVE_STATE, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        entries: Array.from({ length: 3000 }, (_, i) => row({ txid: txid(i + 1) })),
        drain: null,
        summary: SUMMARY,
      },
    });
    const plane = buildLivePlane(s, OPTS);
    expect(plane.held).toBe(250);
    expect(plane.holdCapped).toBe(true);
    expect(plane.capped).toBe(true);
  });

  it("a removal does NOT give the evicted rows back, so the floor stands", () => {
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    s = liveReduce(s, { type: "tx_removed", txid: txid(300), reason: "confirmed" });
    expect(buildLivePlane(s, OPTS).holdCapped).toBe(true);
  });

  it("an AUTHORITATIVE snapshot that fits makes the figure a measurement again", () => {
    // A snapshot is the mempool, so one naming fewer rows than the ceiling
    // re-establishes the truth. Inheriting the flag for ever would leave the
    // page saying "at least 3" about a pool of three.
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    expect(buildLivePlane(s, OPTS).holdCapped).toBe(true);

    s = liveReduce(s, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        entries: [row({ txid: txid(299) }), row({ txid: txid(300) })],
        drain: null,
        summary: SUMMARY,
      },
    });
    const plane = buildLivePlane(s, OPTS);
    expect(plane.held).toBe(2);
    expect(plane.holdCapped).toBe(false);
    expect(plane.capped).toBe(false);
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
