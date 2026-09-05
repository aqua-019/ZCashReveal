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

  it("a survivor keeps its ORIGINAL seq, so a reconnect does not reshuffle a capped board", () => {
    let s = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 50; i += 1) s = liveReduce(s, added(row({ txid: txid(i) })));
    const before = buildLivePlane(s, OPTS).marks.map((m) => m.txid).sort();

    // The same 50, re-delivered as one snapshot. Nothing has changed, so the
    // board must not change either.
    s = liveReduce(s, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        // REORDERED ON PURPOSE, AND A GATE ROUND IS WHY. `view.entries` is
        // `reports.map(...)` in the INDEXER's order, never this reader's
        // arrival order - so a snapshot built in arrival order is the one shape
        // at which the survivor-seq restoration is invisible, and this
        // assertion passed against the mutant that deleted it. Reversed, the
        // board moves the moment the restoration is gone.
        entries: Array.from({ length: 50 }, (_, i) => row({ txid: txid(50 - i) })),
        drain: null,
        summary: SUMMARY,
      },
    });
    expect(buildLivePlane(s, OPTS).marks.map((m) => m.txid).sort()).toStrictEqual(before);
  });

  it("A2 - FAIL SIDE (data - a 300-tx mempool, one reconnect): the drawn board does not move", () => {
    // THE DEFECT `add`'s OWN COMMENT SAID IT PREVENTED, produced by the snapshot
    // replacement and `HOLD_MAX` meeting for the first time. The snapshot arm
    // started from an empty map, so the eviction ran mid-loop on a half-built
    // map, before each survivor's true `seq` was restored one line later - and
    // dropped survivors in favour of rows this reader had already evicted, which
    // re-entered carrying the highest counter values. Measured pre-fix:
    // ZERO OF 42 DRAWN MARKS SURVIVED, the board flipping wholesale to the
    // oldest transactions in the pool.
    //
    // 300 is the member from inside the stated set: it must exceed HOLD_MAX
    // (250) for the eviction and the restoration to meet at all, and the
    // committed corpus is fourteen rows, so nothing in this repository reached
    // it before.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const before = buildLivePlane(state, OPTS).marks.map((m) => m.txid);
    expect(before).toHaveLength(SPLASH_N_MAX);

    // The gateway's reconciling view on reconnect: the same 300 transactions.
    state = liveReduce(state, {
      type: "snapshot",
      view: {
        tipHeight: 1,
        entries: Array.from({ length: 300 }, (_, i) => row({ txid: txid(i + 1) })),
        drain: null,
        summary: SUMMARY,
      },
    });
    const after = buildLivePlane(state, OPTS).marks.map((m) => m.txid);
    expect(after.filter((t) => before.includes(t))).toHaveLength(SPLASH_N_MAX);
  });

  it("A2 - FAIL SIDE (data - a snapshot in the INDEXER's order, not this reader's): the right 250 survive", () => {
    // THE HALF THE PREVIOUS ASSERTION COULD NOT SEE, and it is round 2's own
    // finding turned on this session's fix. Driving the reconnect with entries
    // in ascending order makes view order agree with `seq` order, and a
    // mid-loop eviction then happens to drop the right rows - so the "evict
    // once, at the end" half of the fix was invisible: reverting it left the
    // suite green.
    //
    // `view.entries` is `reports.map(...)` in the INDEXER's order, which has no
    // relation to this reader's arrival order. Shuffled, a cap applied on a
    // half-built map evicts by the seq visible SO FAR and drops rows a later
    // entry would have outranked.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 300; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));

    // A deterministic shuffle: reverse, which is the maximally adversarial
    // order and needs no generator.
    const shuffled = Array.from({ length: 300 }, (_, i) => row({ txid: txid(300 - i) }));
    state = liveReduce(state, {
      type: "snapshot",
      view: { tipHeight: 1, entries: shuffled, drain: null, summary: SUMMARY },
    });

    // The hold keeps the 250 NEWEST it ever watched arrive - txids 51..300 -
    // whatever order the view named them in.
    expect(state.held.size).toBe(250);
    expect(state.held.has(txid(300))).toBe(true);
    expect(state.held.has(txid(51))).toBe(true);
    expect(state.held.has(txid(50))).toBe(false);
    expect(state.held.has(txid(1))).toBe(false);
  });

  it("A3 - FAIL SIDE (data - 3,000 undecoded rows): the held figure says it is the tank's", () => {
    // `capped` is `drawable.length > nMax`, which here is `0 > 42` - false - so
    // the one branch that would have hedged the figure was off while the page
    // printed "of 250 held" for a mempool of 3,000. Two different saturations
    // needed two different flags.
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 3000; i += 1) {
      state = liveReduce(state, added(row({ txid: txid(i), class: "undecoded", lanes: [] })));
    }
    const plane = buildLivePlane(state, OPTS);
    expect(plane.drawn).toBe(0);
    expect(plane.capped).toBe(false);
    expect(plane.holdFull).toBe(true);
  });

  it("A3 - below the ceiling the hold is not full and the figure is the pool's", () => {
    let state = EMPTY_LIVE_STATE;
    for (let i = 1; i <= 9; i += 1) state = liveReduce(state, added(row({ txid: txid(i) })));
    const plane = buildLivePlane(state, OPTS);
    expect(plane.held).toBe(9);
    expect(plane.holdFull).toBe(false);
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
    // A MIGRATION FIXTURE MUST CARRY THE `flow` ITS PRODUCER WOULD PRINT. This
    // row previously inherited the helper's default `flow: "t to z"`, which
    // `flowTextFor` cannot produce for a migration - so the fixture asserted
    // behaviour against a shape the gateway does not emit, which is the fixture
    // half of the same F-57-1 defect the code half had.
    expect(
      markFor(row({ txid: txid(3), class: "migration", lanes: ["orchard", "ironwood"], flow: "O to I" })),
    ).toStrictEqual({ kind: "crossing", from: "orchard", to: "ironwood" });
  });

  it("FAIL SIDE (data - a `migration` the GATEWAY emits that is NOT ZIP 318): no ZIP 318 arc", () => {
    // CAPTURED FROM THE PRODUCER, NOT ENUMERATED FROM THE FIXTURE (F-57-1).
    // `crossesWithNoPublicSide` in `apps/gateway/src/views/mempool.ts` is
    // `movedPools.length > 1 && hasPoolSource && hasPoolSink &&
    // !hasTransparentSource && vout.length === 0`, which a Sapling-to-Orchard
    // shielded transfer satisfies - and `migrationFlowText` prints "S to O" for
    // it. The committed corpus contains only `O to I`, so this shape exists in
    // production and in no fixture: the exclusion set could not be closed by
    // reading the corpus, which is exactly what F-57-1 says.
    const shape = markFor(
      row({ txid: txid(1), class: "migration", lanes: ["sapling", "orchard"], flow: "S to O" }),
    );
    // IT DRAWS THE CROSSING THE ROW ACTUALLY STATES, which is stronger than the
    // undirected chord this assertion first expected. The chord was the right
    // answer while the module could not derive a direction at all; now that it
    // reads the producer's own statement, sapling-to-orchard is a measurement
    // the row carries and drawing it is not a guess.
    expect(shape).toStrictEqual({ kind: "crossing", from: "sapling", to: "orchard" });
    expect(shape).not.toStrictEqual({ kind: "crossing", from: "orchard", to: "ironwood" });
  });

  it("A1 - FAIL SIDE (data - a REVERSED ZIP 318 row): the arc points the way the row says", () => {
    // THE MEMBER OF THE EXCLUSION SET, and the one two previous predicates both
    // shipped wrong. `lanes` is a SET built from bundle presence, so both lanes
    // light for either direction; `leaks.ts` calls Ironwood-back-to-Orchard "the
    // rarer event", not an impossible one. Captured by driving the real
    // `mempoolRow`, not enumerated from the corpus - the committed fixture has
    // only `O to I`.
    expect(
      markFor(row({ txid: txid(1), class: "migration", lanes: ["orchard", "ironwood"], flow: "I to O" })),
    ).toStrictEqual({ kind: "crossing", from: "ironwood", to: "orchard" });
  });

  it("A1 - a migration whose flow states NO pair falls to the chord, never to a guess", () => {
    // `migrationFlowText` returns "N pools" when either side has more than one
    // pool, and the literal "migration" when a side is empty. Neither states a
    // direction, so neither may draw one.
    expect(
      markFor(row({ txid: txid(1), class: "migration", lanes: ["sapling", "orchard"], flow: "3 pools" })),
    ).toStrictEqual({ kind: "chord", a: "sapling", b: "orchard" });
    expect(
      markFor(row({ txid: txid(2), class: "migration", lanes: ["sapling", "orchard"], flow: "migration" })),
    ).toStrictEqual({ kind: "chord", a: "sapling", b: "orchard" });
  });

  it("A1 - a flow naming a lane the row did not touch draws nothing", () => {
    // `flow` and `lanes` are built by different functions from one report. An
    // arc between two lanes the row does not claim to have touched would be this
    // module trusting one field over the other; it requires both to agree.
    expect(
      markFor(row({ txid: txid(1), class: "migration", lanes: ["sapling", "orchard"], flow: "O to I" })),
    ).toStrictEqual({ kind: "chord", a: "sapling", b: "orchard" });
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
