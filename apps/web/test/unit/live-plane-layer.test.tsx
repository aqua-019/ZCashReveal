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
/**
 * `IS_LIVE_TRANSPORT` IS A GETTER SO BOTH CONFIGURATIONS CAN BE DRIVEN.
 *
 * The component branches on it - a build with no gateway must not claim a feed -
 * and it is a module constant, so a test that could only see one value could
 * only ever assert half the surface. The deployed configuration is `false`
 * (`DEPLOY-2.0.md` sets Production and Preview to `snapshot` with no
 * `NEXT_PUBLIC_WS_URL`), so that half gets its own block below rather than being
 * the accidental default of every test in the file.
 */
let liveTransport = true;

vi.mock("@/lib/api/stream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/stream")>()),
  subscribeFrames: () => () => undefined,
  get IS_LIVE_TRANSPORT() {
    return liveTransport;
  },
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
  liveTransport = true;
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
  /**
   * THE THREE EMPTIES, AND ONLY ONE IS A FAULT.
   *
   * The first draft of this block drove `closed` for its pass state and `open`
   * for its fail side, and a gate reviewer showed that both polarities came
   * from `publishStateForTest` - the one function only tests call. `ZecSocket`
   * never reported state to `subscribeFrames`' caller at all, so the green run
   * was evidence about the test hook and not about the site: `closed` had no
   * production producer, which is F-58-1's shape, adopted by this very session
   * one commit before it shipped an instance of it.
   *
   * The states are now real, and the fault is the one the socket can actually
   * reach: it was open and it is not now. `closed` is teardown-only and is
   * deliberately NOT the fault, because dressing an unreachable case is how a
   * component comes to document a case nothing produces.
   */
  it("PASS STATE: a feed that WAS open and dropped names the fault", () => {
    render(<LivePlaneLayer />);
    act(() => {
      publishStateForTest("open");
    });
    expect(uiOrNull("turnstile-live-fault")).toBeNull();

    act(() => {
      publishStateForTest("connecting");
    });
    expect(liveMarks()).toHaveLength(0);
    expect(ui("turnstile-live-fault")).toBeTruthy();
    expect(ui("turnstile-live-state").getAttribute("data-state")).toBe("closed");
    expect(ui("turnstile-live-state").textContent).toContain("dropped");
  });

  it("FAIL SIDE (data - a CONNECTED socket with zero transactions): empty, and NO fault text", () => {
    // THE MEMBER THAT DISCRIMINATES. A test that only drove the fault state
    // would pass against a component printing it unconditionally, which would
    // tell every reader on a quiet chain that the site was broken.
    render(<LivePlaneLayer />);
    act(() => {
      publishStateForTest("open");
    });
    expect(liveMarks()).toHaveLength(0);
    expect(uiOrNull("turnstile-live-fault")).toBeNull();
    expect(ui("turnstile-live-state").getAttribute("data-state")).toBe("open");
  });

  it("FAIL SIDE (data - the FIRST paint, which every reader sees): connecting is not a fault", () => {
    // THE STATE A JAVASCRIPT-OFF READER SEES AND THE ONLY ONE THEY SEE. Found
    // by reading `next build`'s own `index.html`, where this layer rendered
    // "connecting" and "no transactions are reaching this page" in one line -
    // a fault claim made during normal startup, once per page load, for
    // everyone. The old A6 drove `open` and `closed` and could not see it.
    render(<LivePlaneLayer />);
    expect(ui("turnstile-live-state").getAttribute("data-state")).toBe("connecting");
    expect(uiOrNull("turnstile-live-fault")).toBeNull();
    expect(ui("turnstile-live-state").textContent).toContain("has not connected yet");
  });

  it("the rate is an absence when the producer published none, never a zero", () => {
    // `chain-inputs.ts:42`'s rule on a new surface: a null renders as an
    // absence and a zero renders as a measurement.
    render(<LivePlaneLayer />);
    const rate = ui("turnstile-live-rate").textContent ?? "";
    expect(rate).toContain("publishes no rate");
    expect(rate).not.toMatch(/\b0 transactions a minute\b/);
  });

  it("FAIL SIDE (data - txPerMinute = 1 and ceilingPerMinute = 1, both legal): the noun agrees", () => {
    // `mempoolDrainStateSchema` admits both: `txPerMinute` is `nonnegative()`
    // and `ceilingPerMinute` is `positive()`. At the measured ceiling of five
    // the figure is three, so this sentence is only wrong at values nobody
    // typed while writing it - which is why reading it found nothing and
    // executing it found two defects in one line.
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest({
        type: "snapshot",
        view: { tipHeight: 1, entries: [], drain: drain(1, 1), summary: SUMMARY },
      });
    });
    const rate = ui("turnstile-live-rate").textContent ?? "";
    expect(rate).toContain("1 transaction a minute");
    expect(rate).toContain("ceiling of 1 request");
    expect(rate).not.toContain("1 transactions");
    expect(rate).not.toContain("1 requests");
  });

  it("a MEASURED zero rate stays plural and stays a measurement, not an absence", () => {
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest({
        type: "snapshot",
        view: { tipHeight: 1, entries: [], drain: drain(0, 5), summary: SUMMARY },
      });
    });
    const rate = ui("turnstile-live-rate").textContent ?? "";
    expect(rate).toContain("0 transactions a minute");
    expect(rate).not.toContain("publishes no rate");
  });

  it("a refusal is dated to the connect, not claimed as the last tick", () => {
    // The drain arrives ONLY on a `snapshot` frame, which the gateway sends on
    // connect, so it never refreshes while the page is open. "the last tick was
    // cut short by a refusal" therefore went on standing after any number of
    // later arrivals - a transient rendered as a standing fact.
    render(<LivePlaneLayer />);
    act(() => {
      publishFrameForTest({
        type: "snapshot",
        view: { tipHeight: 1, entries: [], drain: { ...drain(3, 5), refused: true }, summary: SUMMARY },
      });
    });
    const rate = ui("turnstile-live-rate").textContent ?? "";
    expect(rate).toContain("when this page connected");
    expect(rate).not.toContain("the last tick");
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

/** A drain state carrying just the two figures the affordance reads. */
function drain(txPerMinute: number | null, ceilingPerMinute: number | null) {
  return {
    observed: 9,
    analysed: 3,
    complete: false,
    deferred: 6,
    failed: 0,
    refused: false,
    completeSecondsAgo: null,
    updatedSecondsAgo: 4,
    ceilingPerMinute,
    txPerMinute,
  };
}

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
/* A3 (18) - the PRINTED figure, which is the half R2-3 was actually about    */
/* ========================================================================== */

describe("A3 (18) - a hold that has evicted prints a FLOOR, not a count", () => {
  /**
   * THE PURE HALF WAS ASSERTED AND THE PRINTED HALF WAS NOT, AND THE DELIVERABLE
   * IS THE PRINTED ONE.
   *
   * Section 5's A3 excludes "any held figure PRINTED as an exact count while the
   * hold has evicted". Every A3 assertion in `live-plane.test.ts` reads
   * `buildLivePlane`'s OBJECT - `plane.holdCapped` - and a gate reviewer showed
   * what that leaves open: reverting the `"at least "` on the page restores R2-3
   * verbatim with the whole web suite green at 604/604. The defect was
   * reachable, and the only thing asserting against it was a comment.
   */
  it("FAIL SIDE (data - a mempool deeper than HOLD_MAX): the figure is named as a floor", () => {
    render(<LivePlaneLayer />);
    act(() => {
      for (let i = 1; i <= 300; i += 1) publishFrameForTest(added(row({ txid: txid(i) })));
    });
    const line = ui("turnstile-live-count").textContent ?? "";
    expect(line).toContain("of at least 250 held");
    // AND NOT THE BARE FIGURE. The mutant that restores R2-3 prints exactly
    // this, so the negative is what makes the positive discriminate.
    expect(line).not.toMatch(/drawn of 250 held/);
    expect(ui("turnstile-live-floor").textContent).toContain("floor rather than a count");
  });

  it("PASS STATE: a hold that never evicted prints the exact figure, with no hedge", () => {
    // The other polarity, and the one that stops the fix being "always hedge":
    // a permanent "at least" would make every honest count unreadable.
    render(<LivePlaneLayer />);
    act(() => {
      for (let i = 1; i <= 50; i += 1) publishFrameForTest(added(row({ txid: txid(i) })));
    });
    const line = ui("turnstile-live-count").textContent ?? "";
    expect(line).toContain("of 50 held");
    expect(line).not.toContain("at least");
    expect(uiOrNull("turnstile-live-floor")).toBeNull();
  });

  it("FAIL SIDE (data - the hold evicted and then DRAINED): no claim about a pool that is gone", () => {
    // THE MEMBER A SINGLE-STATE TEST CANNOT SEE, and it is a defect this
    // handoff introduced and a gate reviewer measured: `holdCapped` is sticky by
    // design, so folding it into the sample sentence kept "more transactions are
    // in the pool than this board draws" standing over an EMPTY tank, beside a
    // bound of "at least 0" that carries no information.
    render(<LivePlaneLayer />);
    act(() => {
      for (let i = 1; i <= 300; i += 1) publishFrameForTest(added(row({ txid: txid(i) })));
    });
    act(() => {
      for (let i = 1; i <= 300; i += 1) {
        publishFrameForTest({ type: "tx_removed", txid: txid(i), reason: "confirmed" });
      }
    });
    const line = ui("turnstile-live-count").textContent ?? "";
    expect(liveMarks()).toHaveLength(0);
    expect(line).toContain("0 unconfirmed transactions drawn");
    expect(line).not.toContain("at least 0 held");
    expect(line).not.toContain("more transactions are in the pool");
  });
});

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


/* ========================================================================== */
/* A15 - the DEPLOYED configuration draws nothing and says why (gate round 1) */
/* ========================================================================== */

describe("A15 - a build with no gateway does not replay the committed corpus as live", () => {
  /**
   * THE DEFECT THIS BLOCK EXISTS AGAINST WAS MEASURED ON A REAL BUILD.
   *
   * `DEPLOY-2.0.md` sets Production AND Preview to `NEXT_PUBLIC_DATA_MODE=snapshot`
   * with `NEXT_PUBLIC_WS_URL` blank, so `IS_LIVE_TRANSPORT` is false on the site
   * as actually deployed. The first draft passed no `openInFixture`, so the
   * plane opened the committed `FixtureStream` and drew ELEVEN MOCKUP ROWS -
   * txids beginning `ee0119443c` and `c0ffee12d3`, out of a file whose own
   * header calls them invented - under the bold word "live" and the sentence
   * "11 unconfirmed transactions drawn of 14 held". A gate reviewer measured it
   * against `next start` with no network.
   *
   * That is the fabricated fish section 3 of the handoff says would make the
   * whole page a lie, and it was the SHIPPING configuration.
   */
  it("FAIL SIDE (data - IS_LIVE_TRANSPORT false, the deployed value): zero marks, and the reason named", () => {
    liveTransport = false;
    render(<LivePlaneLayer />);

    expect(liveMarks()).toHaveLength(0);
    const state = ui("turnstile-live-state").textContent ?? "";
    expect(state).toContain("no feed");
    expect(state).toContain("no live mempool feed is configured");
    // NOT A FAULT. A build with no gateway is not broken; it has nothing to show.
    expect(uiOrNull("turnstile-live-fault")).toBeNull();
    // AND IT NEVER CLAIMS A CHAIN FEED, NOR A REPLAY.
    //
    // NOT `not.toContain("mempool feed")`: the honest sentence is "no live
    // MEMPOOL FEED is configured", which contains that substring, so the loose
    // form failed against correct copy. That is F-43-1's shape - a pattern
    // matching inside a longer string - and the discriminating check is the
    // bold word plus the replay claim, both of which differ between the two
    // branches.
    expect(ui("turnstile-live-state").querySelector("b")?.textContent).toBe("no feed");
    expect(state).not.toContain("corpus");
  });

  it("PASS STATE: with a transport configured, the same component names the feed", () => {
    liveTransport = true;
    render(<LivePlaneLayer />);
    act(() => {
      publishStateForTest("open");
    });
    const state = ui("turnstile-live-state").textContent ?? "";
    expect(state).toContain("mempool feed");
    expect(state).not.toContain("no live mempool feed is configured");
  });
});
