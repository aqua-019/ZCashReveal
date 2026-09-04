// @vitest-environment jsdom
/**
 * HANDOFF-17 - the living plane, rendered.
 *
 * The pure half is in `live-plane.test.ts`. This is the half that needs a DOM:
 * A4's two members that have no representation in a reducer (a timer firing and
 * a re-render), A5's reduced-motion refusal, A6's two empties, and A7's DOM
 * separability of the settled marks from the unconfirmed ones.
 *
 * FRAMES ARE DELIVERED THROUGH THE REAL BUS, not through a mock of it.
 * `publishFrameForTest` walks the same subscriber set the socket walks, so a
 * component that failed to attach its effect receives nothing and every
 * assertion below goes red - which is the property `tip-bus.ts` states about
 * its own test hook, and the reason it exports one rather than letting a test
 * dispatch the raw event itself.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MempoolRow, ZecFrame } from "@zcashreveal/types";

import { TurnstilePlane } from "@/components/record/TurnstilePlane";
import { LivePlaneLayer } from "@/components/record/LivePlaneLayer";
import { publishFrameForTest, publishStateForTest, resetFrameBusForTest } from "@/lib/api/frame-bus";
import { fixtureSnapshot } from "@/lib/api/fixtures/snapshot";

/**
 * THE TRANSPORT IS STUBBED, THE BUS AND THE COMPONENT ARE REAL.
 *
 * Without this, `onFrames` opens the committed `FixtureStream`, which replays
 * the whole mempool corpus a few timer ticks later - so A4's "advance the
 * timers and assert zero marks" found ELEVEN marks on its first run. Those were
 * not a defect: they were real frames, correctly drawn, which is A4 working
 * rather than failing. But a test that cannot tell "no frame arrived" from "a
 * frame arrived" cannot state A4 at all, so the socket is stubbed at its own
 * module boundary and every frame in this file is one the test chose to send.
 *
 * `frame-bus.test.ts` drives the REAL `subscribeFrames` over that same
 * committed stream, so the wiring this stub removes is asserted there rather
 * than nowhere.
 */
vi.mock("@/lib/api/stream", () => ({
  subscribeFrames: () => () => undefined,
}));

const txid = (n: number): string => n.toString(16).padStart(64, "0");

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

const added = (r: MempoolRow): ZecFrame => ({ type: "tx_added", entry: r });

/** `matchMedia` is not implemented in jsdom; both polarities of A5 need it. */
function stubMatchMedia(reduce: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  );
}

const liveMarks = (): readonly Element[] => [...document.querySelectorAll("[data-live-mark]")];

/**
 * This codebase names a rendered surface with `data-ui`, not `data-testid` -
 * every `data-ui` in `TurnstilePlane` and `MempoolPanel` predates this handoff.
 * The first draft of this file reached for `getByTestId` and five assertions
 * went red against correct markup; recorded rather than quietly rewritten,
 * because a probe that fails for its own reasons and a component that is wrong
 * produce the same red.
 */
function ui(name: string): Element {
  const el = document.querySelector(`[data-ui='${name}']`);
  if (el === null) throw new Error(`no element with data-ui='${name}'`);
  return el;
}

const uiOrNull = (name: string): Element | null => document.querySelector(`[data-ui='${name}']`);

beforeEach(() => {
  stubMatchMedia(false);
  resetFrameBusForTest();
});

afterEach(() => {
  cleanup();
  resetFrameBusForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ========================================================================== */
/* A4 - nothing draws a mark except an arrived frame                          */
/* ========================================================================== */

describe("A4 - nothing draws a live mark except an arrived frame", () => {
  it("FAIL SIDE (data - the timer, a member of the stated exclusion set): zero frames, timers advanced, zero marks", () => {
    // THE ASSERTION THE WHOLE CONTRACT RESTS ON. Mounted with no frame at all,
    // with every timer the subtree could hold driven far past any plausible
    // interval, and re-rendered: the tank must be empty. An ambient generator,
    // a seeded shoal or a `migrationHist` mark counted as live would all show
    // up here as a non-zero count.
    vi.useFakeTimers();
    const { rerender } = render(<LivePlaneLayer />);

    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    rerender(<LivePlaneLayer />);
    act(() => {
      vi.advanceTimersByTime(600_000);
    });

    expect(liveMarks()).toHaveLength(0);
  });

  it("FAIL SIDE (data - a re-render, the second member): still zero marks", () => {
    const { rerender } = render(<LivePlaneLayer />);
    for (let i = 0; i < 5; i += 1) rerender(<LivePlaneLayer />);
    expect(liveMarks()).toHaveLength(0);
  });

  it("PASS STATE: a delivered frame draws exactly one mark, keyed by its txid", () => {
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1) })));
    });
    const marks = liveMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("data-txid")).toBe(txid(1));
  });

  it("the count on the page is the count on the board", () => {
    // The same rule `TurnstilePlane` states about the settled half: every
    // number on the surface comes from one derivation. A reading that said
    // three beside two drawn marks is the defect that rule exists against.
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1) })));
      publishFrameForTest(added(row({ txid: txid(2) })));
    });
    expect(liveMarks()).toHaveLength(2);
    expect(ui("turnstile-live-count").textContent).toContain("2");
  });
});

/* ========================================================================== */
/* A5 - reduced motion                                                        */
/* ========================================================================== */

describe("A5 - reduced motion removes the swimming, never the information", () => {
  it("BOTH POLARITIES: the same frames animate at `false` and do not at `true`", () => {
    stubMatchMedia(false);
    const moving = render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1), class: "shield", lanes: ["transparent", "orchard"] })));
    });
    expect(document.querySelector("[data-ui='turnstile-live']")?.getAttribute("data-motion")).toBe("on");
    expect(document.querySelectorAll(".tlive-swim")).toHaveLength(1);
    const movingCount = liveMarks().length;
    moving.unmount();
    resetFrameBusForTest();

    stubMatchMedia(true);
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1), class: "shield", lanes: ["transparent", "orchard"] })));
    });
    expect(document.querySelector("[data-ui='turnstile-live']")?.getAttribute("data-motion")).toBe("off");
    expect(document.querySelectorAll(".tlive-swim")).toHaveLength(0);
    // THE SECOND MEMBER OF THE EXCLUSION SET: reduced motion must not drop a
    // mark. The same information, no swimming.
    expect(liveMarks()).toHaveLength(movingCount);
  });
});

/* ========================================================================== */
/* A6 - the two empties read differently                                      */
/* ========================================================================== */

describe("A6 - a disconnected socket is a named state, not a calm empty tank", () => {
  it("PASS STATE: a socket that never connects names the fault", () => {
    render(<LivePlaneLayer />);
    act(() => {
      publishStateForTest("closed");
    });
    expect(liveMarks()).toHaveLength(0);
    expect(ui("turnstile-live-fault")).toBeTruthy();
    expect(ui("turnstile-live-state").getAttribute("data-state")).toBe("closed");
  });

  it("FAIL SIDE (data - a CONNECTED socket with zero transactions): empty, and NO fault text", () => {
    // THE MEMBER THAT DISCRIMINATES. A test that only drove the closed socket
    // would pass against a component printing the fault unconditionally, which
    // would tell every reader on a quiet chain that the site was broken.
    render(<LivePlaneLayer />);
    act(() => {
      publishStateForTest("open");
    });
    expect(liveMarks()).toHaveLength(0);
    expect(uiOrNull("turnstile-live-fault")).toBeNull();
    expect(ui("turnstile-live-state").getAttribute("data-state")).toBe("open");
  });

  it("the rate is an absence when the producer published none, never a zero", () => {
    // `chain-inputs.ts:42`'s rule on a new surface: a null renders as an
    // absence and a zero renders as a measurement.
    render(<LivePlaneLayer />);
    const rate = ui("turnstile-live-rate").textContent ?? "";
    expect(rate).toContain("publishes no rate");
    expect(rate).not.toMatch(/\b0 transactions a minute\b/);
  });

  it("the rate the producer DID publish reaches the page", () => {
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest({
        type: "snapshot",
        view: {
          tipHeight: 3_456_227,
          entries: [],
          drain: {
            observed: 9,
            analysed: 3,
            complete: false,
            deferred: 6,
            failed: 0,
            refused: false,
            completeSecondsAgo: null,
            updatedSecondsAgo: 4,
            ceilingPerMinute: 5,
            txPerMinute: 3,
          },
          summary: SUMMARY,
        },
      });
    });
    const rate = ui("turnstile-live-rate").textContent ?? "";
    expect(rate).toContain("3 transactions a minute");
    expect(rate).toContain("ceiling of 5");
    expect(rate).toContain("metered feed, not a fault");
  });
});

const SUMMARY = {
  unconfirmed: 0,
  shielded: 0,
  migrations: 0,
  transparent: 0,
  decodedCount: 0,
  bytes: 0,
  nextBlockSeconds: 40,
  crossingZat: 0n,
  crossingSplit: "none",
  conventionalFeeZat: 10_000n,
  pricedCount: 0,
  conventionalCount: 0,
  findingsHigh: 0,
  findingsNote: "none",
  feeWeather: "calm",
};

/* ========================================================================== */
/* A7 - the two mark sets are separable, and the tank is correct with zero    */
/*      settled crossings - the shape the first cutover ships                 */
/* ========================================================================== */

describe("A7 - settled crossings and unconfirmed marks are different claims", () => {
  it("FAIL SIDE (data - a snapshot carrying counted crossings AND a live frame): the two are separable", () => {
    const snapshot = fixtureSnapshot();
    render(<TurnstilePlane snapshot={snapshot} />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1) })));
    });

    const settled = document.querySelectorAll(".tplane-svg .tmark");
    const live = liveMarks();
    expect(settled.length).toBeGreaterThan(0);
    expect(live).toHaveLength(1);

    // NO SETTLED MARK CARRIES THE LIVE ATTRIBUTE AND NO LIVE MARK CARRIES THE
    // SETTLED CLASS. If a reader cannot tell them apart, an unconfirmed
    // transaction is being reported as a settled crossing.
    for (const s of settled) expect(s.hasAttribute("data-live-mark")).toBe(false);
    for (const l of live) expect(l.classList.contains("tmark")).toBe(false);

    // They are in different SVGs, which is what makes this true by
    // construction rather than by care.
    expect(document.querySelectorAll("[data-ui='turnstile-svg'] [data-live-mark]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-ui='turnstile-live-svg'] .tmark")).toHaveLength(0);
  });

  it("A SETTLED CROSSING KEEPS THE GOLD HEAD AND A LIVE ONE NEVER HAS IT", () => {
    // The distinction the reader actually sees, and the accent budget doing the
    // work: gold is where a crossing LANDS, and nothing unconfirmed has landed.
    render(<TurnstilePlane snapshot={fixtureSnapshot()} />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1), class: "shield", lanes: ["transparent", "orchard"] })));
    });
    const arrowed = [...document.querySelectorAll(".tplane-svg .tmark path")].filter(
      (p) => p.getAttribute("marker-end") !== null,
    );
    expect(arrowed.length).toBeGreaterThan(0);
    for (const p of document.querySelectorAll("[data-live-mark] path")) {
      expect(p.getAttribute("marker-end")).toBeNull();
    }
  });

  it("THE SHAPE THE FIRST CUTOVER SHIPS: zero settled crossings, live marks still drawn and legible", () => {
    // HANDOFF-16 measured this by execution: `readSnapshotInputs` returns
    // `{ crossings: [], window: null }` with no database, because the publisher
    // is a separate process that queries Postgres for `migrationHist`. On the
    // RPC-only cutover the settled board draws NOTHING, so the live marks are
    // the only marks there are and the board has to be correct without them.
    const bare = { ...fixtureSnapshot(), migrationHist: null };
    render(<TurnstilePlane snapshot={bare} />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1) })));
      publishFrameForTest(added(row({ txid: txid(2) })));
    });

    expect(document.querySelectorAll(".tplane-svg .tmark")).toHaveLength(0);
    expect(liveMarks()).toHaveLength(2);

    // The settled half states its ABSENCE with a condition rather than a zero,
    // which is the behaviour `buildPlane` already had and which must survive
    // having a live layer over it.
    expect(ui("turnstile-reading").textContent).toContain("not measured");
    expect(ui("turnstile-live-count").textContent).toContain("2");
  });
});

/* ========================================================================== */
/* Mounting twice - React strict mode double-invokes an effect                */
/* ========================================================================== */

describe("the subscription survives a double mount", () => {
  it("two mounted layers both receive frames, and unmounting one does not deafen the other", () => {
    const first = render(<LivePlaneLayer />);
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest(added(row({ txid: txid(1) })));
    });
    expect(liveMarks()).toHaveLength(2);

    first.unmount();
    act(() => {
      publishFrameForTest(added(row({ txid: txid(2) })));
    });
    expect(liveMarks()).toHaveLength(2);
  });
});
