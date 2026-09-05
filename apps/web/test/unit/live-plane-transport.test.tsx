// @vitest-environment jsdom
/**
 * HANDOFF-18 A4 - THE DEPLOYED CONFIGURATION, OVER THE REAL TRANSPORT.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS AT ALL, WHICH IS THE WHOLE POINT OF IT
 * ============================================================================
 * HANDOFF-17's headline defect was measured on a real `next start` build: the
 * plane opened the committed `FixtureStream` and drew ELEVEN MOCKUP ROWS -
 * txids beginning `ee0119443c` and `c0ffee12d3`, out of a file whose own header
 * calls them invented - under the bold word "live", on the site as actually
 * deployed. It was fixed by passing `openInFixture: false`.
 *
 * ITS TEST DID NOT ASSERT THAT. `live-plane-layer.test.tsx` opens with
 * `vi.mock("@/lib/api/stream", ... subscribeFrames: () => () => undefined)`, so
 * in that file NOTHING CAN EVER DELIVER A FRAME and "zero marks" is true of any
 * component whatsoever - the fix deleted, the subscription deleted, the whole
 * module deleted. Gate round 2 recorded the consequence in one sentence: the
 * commit's own headline defect **is asserted nowhere in the repository**.
 *
 * The stub is not wrong there - that file states A4, and a test that cannot
 * tell "no frame arrived" from "a frame arrived" cannot state A4 at all. It is
 * wrong as the ONLY place the defect is checked. So this file stubs nothing:
 * the real `subscribeFrames`, the real `ZecSocket`, the real `FixtureStream`
 * and the real committed corpus, driven for ten minutes of fake time.
 *
 * ============================================================================
 * THE CONFIGURATION IS THE DEPLOYED ONE BY DEFAULT, NOT BY ARRANGEMENT
 * ============================================================================
 * `IS_LIVE_TRANSPORT` is `DATA_MODE === "live" && WS_URL !== "" && API_URL !== ""`.
 * The unit suite sets no `NEXT_PUBLIC_*`, so `readDataMode()` falls to
 * `"fixture"` and the constant is FALSE - which is exactly what
 * `DEPLOY-2.0.md` puts on Production and Preview (`snapshot`, no
 * `NEXT_PUBLIC_WS_URL`). This file therefore drives the shipping configuration
 * with no stub, no getter and no override: the thing the reader gets.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LivePlaneLayer } from "@/components/record/LivePlaneLayer";
import { onFrames, resetFrameBusForTest } from "@/lib/api/frame-bus";
import { MEMPOOL_VIEW } from "@/lib/api/fixtures/mempool";
import { IS_LIVE_TRANSPORT } from "@/lib/api/stream";
import type { ZecFrame } from "@zcashreveal/types";

const liveMarks = (): readonly Element[] => [...document.querySelectorAll("[data-live-mark]")];

function stubMatchMedia(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/**
 * Let the committed stream open and pump, if anything opened it.
 *
 * `subscribeFrames` defaults `tickMs` to 4,000 and `FixtureStream` emits
 * `hello` and `snapshot` on the next turn of the loop, then one `tx_added`
 * every four seconds. `advanceTimersByTimeAsync` rather than the synchronous
 * form, because the stream opens on a promise callback the synchronous form
 * never runs - the probe failure `frame-bus.test.ts` records.
 */
async function settle(ms = 600_000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia();
  resetFrameBusForTest();
});

afterEach(() => {
  cleanup();
  resetFrameBusForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("A4 - the deployed configuration draws ZERO marks, over the REAL transport", () => {
  it("the configuration under test IS the deployed one", () => {
    // Stated as its own assertion rather than assumed, because every claim
    // below is a claim about this value. If a future default flipped it, the
    // zero-marks test would pass for the wrong reason and say nothing.
    expect(IS_LIVE_TRANSPORT).toBe(false);
  });

  it("the committed corpus IS reachable from here - the transport is not inert", async () => {
    // THE CONTROL, AND WITHOUT IT THE ASSERTION BELOW IS THE VACUOUS ONE AGAIN.
    // A subscriber that DOES want a socket in fixture mode opens the real
    // `FixtureStream` and receives the real corpus. This proves the frames the
    // plane must refuse actually exist and actually arrive on this path - so
    // "the plane drew none" is a fact about the plane rather than about a
    // transport that had nothing to give.
    const seen: ZecFrame[] = [];
    const stop = onFrames({ onFrame: (f) => seen.push(f) });
    await settle(60_000);
    stop();
    expect(seen.some((f) => f.type === "snapshot")).toBe(true);
    expect(seen.some((f) => f.type === "tx_added")).toBe(true);
    expect(MEMPOOL_VIEW.entries.length).toBeGreaterThan(0);
  });

  it("FAIL SIDE (data - the committed corpus, the member that shipped): the plane draws NOTHING", async () => {
    // THE ASSERTION HANDOFF-17 SHIPPED WITHOUT. Ten minutes of fake time, the
    // real socket path, the real committed corpus - and an empty tank, because
    // `openInFixture: false` means this layer never opens a connection it would
    // learn nothing true from.
    //
    // KILLING MUTANT: delete **BOTH** `{ openInFixture: false }` and the
    // `IS_LIVE_TRANSPORT` dispatch guard in `LivePlaneLayer` - together they are
    // verbatim the pre-`e3a1622` code. The fixture stream then opens, the
    // `snapshot` frame alone seeds the tank from the committed corpus, and this
    // goes red at ELEVEN marks against zero.
    //
    // AN EARLIER COMMENT HERE NAMED ONLY THE FIRST, AND THAT WAS FALSE ABOUT
    // THIS ASSERTION. A gate reviewer executed it: deleting `openInFixture`
    // alone leaves THIS test green, because the dispatch guard still refuses
    // every frame; deleting the dispatch guard alone leaves it green too,
    // because nothing opens a socket. Either guard alone satisfies "zero marks",
    // so this assertion cannot see the loss of one - which is why each has its
    // own isolating assertion below: the reading test covers `openInFixture`
    // (the state path reaches it) and the second-consumer test covers the
    // dispatch guard.
    render(<LivePlaneLayer />);
    await act(async () => {
      await settle();
    });

    expect(liveMarks()).toHaveLength(0);
  });

  it("and the reading names the absence rather than showing a calm empty board", async () => {
    render(<LivePlaneLayer />);
    await act(async () => {
      await settle();
    });
    const state = document.querySelector("[data-ui='turnstile-live-state']");
    expect(state?.querySelector("b")?.textContent).toBe("no feed");
    expect(state?.textContent).toContain("no live mempool feed is configured");
    // NOT A FAULT. A build with no gateway is not broken; it has nothing to show.
    expect(document.querySelector("[data-ui='turnstile-live-fault']")).toBeNull();
    // AND IT NEVER CLAIMS THE CORPUS IS A CHAIN FEED.
    expect(state?.textContent).not.toContain("corpus");
  });

  it("a second consumer opening the socket does not put mockup rows on the board", async () => {
    // THE MEMBER A ONE-COMPONENT TEST CANNOT SEE. `frame-bus` delivers every
    // frame to every attached subscriber, including ones that did not want the
    // socket opened - that is deliberate, and `openInFixture`'s own docblock
    // says so. So the honest question is not "does the plane open a socket" but
    // "can committed rows reach the board at all", and the two differ exactly
    // when something else on the page opens one.
    //
    // Today nothing does: the only two `onFrames` callers in `apps/web` are this
    // layer and `tip-bus`, and both pass `openInFixture: false`. This drives the
    // case anyway, because that is a fact about the current page rather than a
    // property of the plane, and a third consumer is one import away.
    render(<LivePlaneLayer />);
    const stop = onFrames({ onFrame: () => undefined });
    await act(async () => {
      await settle();
    });
    stop();

    expect(liveMarks()).toHaveLength(0);
  });

  it("FAIL SIDE (data - a second consumer, read on the SENTENCE): the absence is still named honestly", async () => {
    // THE HALF THE MARK COUNT CANNOT SEE, and driving the mutant is what found
    // it: removing the `IS_LIVE_TRANSPORT` guard from `onState` left every
    // assertion in this file green, because they all read the BOARD and the
    // damage is in the WORDS. The bus publishes another consumer's socket state
    // to every subscriber exactly as it publishes frames, so with one ordinary
    // consumer attached this layer's honest "no live mempool feed is configured"
    // became "no feed replaying the committed corpus" - a self-contradiction
    // inside one line, over a board drawing nothing.
    render(<LivePlaneLayer />);
    const stop = onFrames({ onFrame: () => undefined });
    await act(async () => {
      await settle();
    });
    stop();

    const state = document.querySelector("[data-ui='turnstile-live-state']");
    expect(state?.querySelector("b")?.textContent).toBe("no feed");
    expect(state?.textContent).toContain("no live mempool feed is configured");
    expect(state?.textContent).not.toContain("replaying the committed corpus");
    expect(state?.getAttribute("data-state")).toBe("connecting");
  });
});
