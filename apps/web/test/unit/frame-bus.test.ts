// @vitest-environment jsdom
/**
 * HANDOFF-17 - the frame bus, driven over the REAL committed stream.
 *
 * `live-plane-layer.test.tsx` stubs `subscribeFrames` so it can state A4 - a
 * test that cannot tell "no frame arrived" from "a frame arrived" cannot assert
 * that nothing draws a mark except a frame. This file is where that stub is
 * paid for: everything here runs the actual transport, so the wiring the layer
 * test removes is asserted rather than assumed.
 *
 * WHAT THIS FILE IS ABOUT is the reason the bus exists at all. `tip-bus.ts`'s
 * own header: "`subscribeFrames` opens a socket per call. Three sockets to one
 * gateway is three times the connection cap `apps/gateway` enforces per
 * reader." The turnstile plane is a further consumer wanting a different frame,
 * so the count of sockets must stay at one no matter how many consumers attach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ZecFrame } from "@zcashreveal/types";

import { onFrames, publishFrameForTest, resetFrameBusForTest } from "@/lib/api/frame-bus";
import { onTip } from "@/lib/api/tip-bus";

/**
 * THE TRANSPORT IS COUNTED, NOT STUBBED.
 *
 * The real `subscribeFrames` still runs - this file exists to drive it - and
 * the wrapper only records how many times it was called. That distinction is
 * the whole of this file's first assertion and the first draft did not have it:
 * it compared the frames three subscribers received and called agreement
 * "one transport". Under fake timers three independent `FixtureStream`s advance
 * in lockstep and replay the same committed corpus, so three sockets deliver
 * three IDENTICAL sequences and the assertion passes either way. Driven against
 * a deliberate mutation of the bus's own guard (`if (stop !== null || !wanted())`
 * reduced to `if (!wanted())`, which opens a socket per subscriber - precisely
 * the cost `tip-bus.ts`'s header says the bus exists to prevent) the suite
 * stayed green: a fail side that does not fail, and therefore a finding in the
 * instrument. Recorded rather than silently rewritten, per CLAUDE.md.
 */
vi.mock("@/lib/api/stream", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/stream")>();
  return {
    ...real,
    subscribeFrames: (...args: Parameters<typeof real.subscribeFrames>) => {
      opens += 1;
      return real.subscribeFrames(...args);
    },
  };
});

let opens = 0;

beforeEach(() => {
  vi.useFakeTimers();
  opens = 0;
});

afterEach(() => {
  resetFrameBusForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * Let the committed stream open and pump.
 *
 * FAKE TIMERS, AND THE FIGURE MATTERS. `subscribeFrames` defaults `tickMs` to
 * 4,000, so the stream emits `hello` and `snapshot` immediately and then one
 * `tx_added` every FOUR SECONDS. The first draft of this file waited 120 ms of
 * real time and concluded the stream delivers no `tx_added` at all - a probe
 * failing for its own reasons, which looks exactly like a bus that drops
 * frames. Recorded rather than quietly rewritten.
 *
 * `advanceTimersByTimeAsync` rather than the synchronous form, because
 * `FixtureStream` opens on the next turn of the loop and the frames it emits
 * are delivered through promise callbacks the synchronous form never runs.
 */
async function settle(ms = 12_000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("the bus opens ONE socket however many consumers attach", () => {
  it("three subscribers, ONE transport - counted, not inferred from agreement", async () => {
    const frames: ZecFrame[][] = [[], [], []];
    const stops = frames.map((sink) => onFrames({ onFrame: (f) => sink.push(f) }));
    await settle();

    // THE ASSERTION THAT ACTUALLY BITES. `opens` is incremented by the wrapper
    // around the real `subscribeFrames`, so this counts sockets rather than
    // inferring their number from the frames that came out of them.
    expect(opens).toBe(1);

    for (const sink of frames) expect(sink.length).toBeGreaterThan(0);
    expect(frames[1]).toStrictEqual(frames[0]);
    expect(frames[2]).toStrictEqual(frames[0]);
    for (const stop of stops) stop();
  });

  it("a fourth consumer attaching later still opens no second socket", async () => {
    const stop1 = onFrames({ onFrame: () => undefined });
    await settle(5_000);
    const stop2 = onFrames({ onFrame: () => undefined });
    const stop3 = onTip(() => undefined);
    await settle(5_000);
    expect(opens).toBe(1);
    stop1();
    stop2();
    stop3();
  });

  it("the socket is closed when the last subscriber leaves, and re-opened for the next", async () => {
    const stop = onFrames({ onFrame: () => undefined });
    await settle(5_000);
    expect(opens).toBe(1);
    stop();
    const again = onFrames({ onFrame: () => undefined });
    await settle(5_000);
    expect(opens).toBe(2);
    again();
  });

  it("the committed stream really does deliver tx_added - the frames the plane consumes", async () => {
    const seen: ZecFrame[] = [];
    const stop = onFrames({ onFrame: (f) => seen.push(f) });
    await settle();
    stop();
    expect(seen.some((f) => f.type === "snapshot")).toBe(true);
    expect(seen.some((f) => f.type === "tx_added")).toBe(true);
  });

  it("a subscriber that detaches stops receiving, and the others do not", async () => {
    const a: ZecFrame[] = [];
    const b: ZecFrame[] = [];
    const stopA = onFrames({ onFrame: (f) => a.push(f) });
    const stopB = onFrames({ onFrame: (f) => b.push(f) });
    await settle();
    stopA();
    const atDetach = a.length;
    await settle();
    stopB();

    expect(a).toHaveLength(atDetach);
    expect(b.length).toBeGreaterThan(atDetach);
  });

  it("state reaches a subscriber, and a late subscriber is told the state it joins", async () => {
    const first: string[] = [];
    const stop1 = onFrames({ onState: (s) => first.push(s) });
    await settle();
    expect(first).toContain("open");

    const late: string[] = [];
    const stop2 = onFrames({ onState: (s) => late.push(s) });
    // A LATE SUBSCRIBER MUST NOT SIT AT "connecting" WHILE THE SOCKET IS UP.
    // It would render the fault text over a working feed, which is A6's
    // exclusion set arriving through the bus instead of through the component.
    expect(late).toStrictEqual(["open"]);
    stop1();
    stop2();
  });
});

describe("A13 - the state is the SOCKET's, not an inference from a frame (gate round 1)", () => {
  it("the socket's own transitions reach a subscriber", async () => {
    // `subscribeFrames` never passed `onState` to `ZecSocket`, so a full state
    // machine - `connecting` on connect and on every retry, `open` on the open
    // event, `closed` on teardown - terminated at an `undefined` callback, and
    // the bus INFERRED `open` from a frame arriving.
    const seen: string[] = [];
    const stop = onFrames({ onState: (st) => seen.push(st) });
    // The state it JOINS is delivered synchronously on attach; the socket's own
    // transitions follow.
    expect(seen).toStrictEqual(["connecting"]);
    await settle();
    expect(seen).toContain("open");
    stop();
  });

  it("FAIL SIDE (data - a transport that opens, delivers, then dies): the state LEAVES open", async () => {
    // THE MEMBER THAT DISCRIMINATES, and the one the inference could never see:
    // a socket that connects and then dies delivers no frame to revise the
    // inference with, so the page latched at "live" over a dead feed for ever -
    // a frozen surface reporting no fault, in the component whose own docblock
    // says it exists to prevent exactly that.
    const seen: string[] = [];
    const stop = onFrames({ onState: (st) => seen.push(st) });
    await settle(3_000);
    expect(seen).toContain("open");

    // The committed stream closes itself after a full cycle BY DESIGN, which is
    // the death this test needs and does not have to fake. It then RECONNECTS,
    // which is also by design - so the assertion is that the state genuinely
    // LEFT `open`, not that it stays away. The first draft asserted the latter
    // and failed against correct behaviour: a probe wrong about the module it
    // was pointed at.
    const openAt = seen.lastIndexOf("open");
    await settle(300_000);
    expect(seen.slice(openAt + 1)).toContain("connecting");
    // Detached, so this subscription cannot bleed into the next test. Dropping
    // it is what the lint caught; a leaked subscriber is also a leaked socket.
    stop();
  });
});

describe("A14 - resetFrameBusForTest does not deafen tip-bus (gate round 1, repaired)", () => {
  /**
   * THE FIRST VERSION OF THIS BLOCK PASSED AGAINST A TIP-BUS THAT WAS
   * PERMANENTLY AND COMPLETELY DEAF, and it did so twice over.
   *
   * It asserted that the SOCKET COUNT moved after re-attaching. But `onTip`
   * passes `openInFixture: false`, so `onTip` can never move that count in this
   * suite - the count was moved by the ordinary `onFrames` consumer attached
   * beside it, which would have opened a socket with `tip-bus.ts` deleted from
   * the repository. Driven against two mutants it returned 13/13 both times.
   *
   * AND IT NEVER REACHED THE SCENARIO EITHER. It detached the first consumer
   * BEFORE the reset - which sets `stop = null` on the way out - so the reset
   * arrived with tip-bus already unsubscribed and the desynchronisation it
   * exists to catch could not occur.
   *
   * The subject is whether a TIP REACHES A CONSUMER, so that is what is
   * asserted: the bus's own `publishFrameForTest` walks the real subscriber
   * set, so a tip-bus that believes itself attached and is not receives
   * nothing, dispatches nothing, and this goes red.
   *
   * KILLING MUTANT: delete the `onReset` handler from `tip-bus.ts`'s `onFrames`
   * call - the exact line the fix added. Transcript in section 7.
   */
  const TIP_HASH = "a".repeat(64);

  it("FAIL SIDE (data - a reset while tip-bus is STILL ATTACHED): a tip still reaches a consumer", async () => {
    const heights: number[] = [];
    // ATTACHED AND LEFT ATTACHED. The reset must arrive while tip-bus holds a
    // live `stop`, which is the state that desynchronises it.
    const before = onTip((t) => heights.push(t.height));
    await settle(1_000);

    resetFrameBusForTest();

    const after = onTip((t) => heights.push(t.height));
    // Through the REAL bus, into the REAL tip-bus filter, out as the REAL DOM
    // event. Nothing here dispatches `zr:tip` itself - a test that did would
    // pass with tip-bus deleted.
    publishFrameForTest({ type: "tip", height: 3_456_227, hash: TIP_HASH });

    expect(heights).toContain(3_456_227);
    before();
    after();
  });

  /**
   * THIS CONTROL IS NOT RESET-FREE, AND CALLING IT "with no reset" WAS WRONG.
   *
   * The file's `afterEach` calls `resetFrameBusForTest()`, so every test after
   * the first already runs post-reset. A gate reviewer executed it: with the
   * `onReset` handler deleted this case fails too, for the same reason as the
   * fail side, so it isolates nothing - and two of the three reds that mutant
   * produces are collateral from module-level state rather than three
   * assertions catching it. What it does assert, honestly, is that a tip
   * reaches a consumer on a bus that has been reset and re-attached, which is
   * worth keeping as long as it is not read as a control.
   */
  it("a tip reaches a consumer after a reset-and-reattach (NOT a reset-free control)", async () => {
    const heights: number[] = [];
    const stop = onTip((t) => heights.push(t.height));
    await settle(1_000);
    publishFrameForTest({ type: "tip", height: 3_456_228, hash: TIP_HASH });
    expect(heights).toContain(3_456_228);
    stop();
  });
});

describe("tip-bus - the detach is IDEMPOTENT (asserted here for the first time)", () => {
  /**
   * THE PROPERTY WORKS AND WAS ASSERTED NOWHERE. `tip-bus.ts` carries a
   * `detached` flag and a docblock four lines long explaining what it prevents,
   * and gate round 2 found no test anywhere in the repository that would fail
   * without it - which is the same standing as a property that does not work.
   *
   * What it prevents: a consumer whose cleanup runs twice - a double unmount, a
   * defensive caller - decrementing `refs` for a subscription it no longer
   * holds, driving the count to zero while OTHER listeners are still attached,
   * tearing down the shared feed and leaving them permanently deaf. The
   * module's own docblock claims the socket "lives exactly as long as at least
   * one consumer is mounted", which was false under a double detach.
   *
   * KILLING MUTANT: delete `if (detached) return; detached = true;` from the
   * returned closure. Transcript in section 7.
   */
  const TIP_HASH = "b".repeat(64);

  it("FAIL SIDE (data - the same detach called TWICE): the other consumer still hears", async () => {
    const first: number[] = [];
    const second: number[] = [];
    const stopFirst = onTip((t) => first.push(t.height));
    const stopSecond = onTip((t) => second.push(t.height));
    await settle(1_000);

    // TWICE. Once is ordinary; the second is the member of the exclusion set.
    stopFirst();
    stopFirst();

    publishFrameForTest({ type: "tip", height: 3_456_229, hash: TIP_HASH });

    // The one that detached hears nothing, and the one that did not still does.
    // Both halves matter: a bus that had simply stopped tearing down would pass
    // the second assertion and fail the first.
    expect(first).toHaveLength(0);
    expect(second).toContain(3_456_229);
    stopSecond();
  });

  it("PASS STATE: when the LAST consumer detaches, the feed does go quiet", async () => {
    // The other polarity, so "idempotent" is not read as "never tears down".
    const heard: number[] = [];
    const stop = onTip((t) => heard.push(t.height));
    await settle(1_000);
    stop();
    publishFrameForTest({ type: "tip", height: 3_456_230, hash: TIP_HASH });
    expect(heard).toHaveLength(0);
  });
});

describe("openInFixture - the clock does not open a socket it would learn nothing from", () => {
  it("FAIL SIDE (data - a fixture-mode subscriber that does not want the socket): nothing is opened", async () => {
    // `tip-bus` passes `openInFixture: false` because the committed stream
    // emits no `tip` frame at all. Driven here against the real transport: a
    // lone such subscriber must receive nothing, because nothing was opened.
    const seen: ZecFrame[] = [];
    const stop = onFrames({ onFrame: (f) => seen.push(f) }, { openInFixture: false });
    await settle();
    stop();
    expect(seen).toHaveLength(0);
  });

  it("PASS STATE: it still receives frames once ANOTHER consumer opens the socket", async () => {
    // The difference between `openInFixture: false` and the old `DATA_MODE`
    // test, and it is a real one: the old form refused to subscribe at all, so
    // a frame this module did not open for could never reach it.
    const quiet: ZecFrame[] = [];
    const stopQuiet = onFrames({ onFrame: (f) => quiet.push(f) }, { openInFixture: false });
    const stopLoud = onFrames({ onFrame: () => undefined });
    await settle();
    stopQuiet();
    stopLoud();
    expect(quiet.length).toBeGreaterThan(0);
  });

  it("onTip attaches without opening a socket in fixture mode, and dispatches nothing", async () => {
    // The end-to-end shape of the same rule, through the real `tip-bus`: the
    // clock standing still against a fixture is the honest reading of a
    // fixture, and it must not cost a connection.
    const tips: number[] = [];
    const stop = onTip((t) => tips.push(t.height));
    await settle();
    stop();
    expect(tips).toHaveLength(0);
  });
});

describe("mounting twice", () => {
  it("attaching and detaching the same handler object twice is safe", async () => {
    // React strict mode double-invokes an effect: mount, detach, mount again on
    // one tick. Each `onFrames` call gets its own subscriber identity, so the
    // second detach cannot close the first subscription's socket.
    const seen: ZecFrame[] = [];
    const handlers = { onFrame: (f: ZecFrame) => seen.push(f) };
    const stopA = onFrames(handlers);
    stopA();
    const stopB = onFrames(handlers);
    await settle();
    expect(seen.length).toBeGreaterThan(0);
    stopB();
    stopB();
  });
});
