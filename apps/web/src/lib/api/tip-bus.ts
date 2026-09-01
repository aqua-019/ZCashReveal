"use client";

/**
 * ONE live subscription for the whole document, and three consumers reading it.
 *
 * WHY A BUS RATHER THAN THREE SUBSCRIPTIONS. Block arrival is now read by three
 * things in the shell - the epoch clock's height, the staleness indicator's
 * age, and the block-arrival ceremony plus the redraw it triggers - and
 * `subscribeFrames` opens a socket per call. Three sockets to one gateway is
 * three times the connection cap `apps/gateway` enforces per reader, for one
 * event that every consumer wants identically.
 *
 * WHY A DOM EVENT RATHER THAN A CONTEXT. The consumers are not in one subtree:
 * `Tide` is mounted by `Shell` above `Grain`, `EpochClock` is inside
 * `ScreenDisclosure`'s bar slot, and the refresh trigger has no visual position
 * at all. A context would mean a provider wrapping the whole document and every
 * consumer becoming a client component to read it. A window event costs
 * nothing and each consumer stays exactly as client-side as it already was.
 *
 * FIXTURE MODE OPENS NOTHING. `subscribeFrames` falls back to the committed
 * `FixtureStream`, which emits no `tip` frame at all, so subscribing off live
 * mode would open a socket, replay a mempool and deliver nothing. The feed is
 * started only when the socket is real, which is also what keeps the clock
 * standing still against a fixture - the honest reading of a fixture.
 */

import { DATA_MODE } from "@/lib/env";

import { subscribeFrames } from "./stream";

/** What a block arrival carries. The two fields every consumer reads. */
export interface TipEvent {
  readonly height: number;
  readonly hash: string;
}

const EVENT = "zr:tip";

let stop: (() => void) | null = null;
let refs = 0;

/**
 * Attach a handler and, on the first attachment, start the feed.
 *
 * Reference-counted, so the socket lives exactly as long as at least one
 * consumer is mounted. Returns the detach function; the last detach closes it.
 *
 * MONOTONIC AT THE SOURCE, so no consumer has to remember to check. A `tip`
 * frame naming a lower height is a reorg or a late-delivered frame, and letting
 * it through would make every consumer independently responsible for not
 * running its clock backwards.
 */
export function onTip(handler: (tip: TipEvent) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const listener = (ev: Event) => {
    handler((ev as CustomEvent<TipEvent>).detail);
  };
  window.addEventListener(EVENT, listener);
  refs += 1;

  if (stop === null && DATA_MODE === "live") {
    let seen = -1;
    stop = subscribeFrames((frame) => {
      if (frame.type !== "tip" || frame.height <= seen) return;
      seen = frame.height;
      window.dispatchEvent(new CustomEvent<TipEvent>(EVENT, { detail: { height: frame.height, hash: frame.hash } }));
    });
  }

  return () => {
    window.removeEventListener(EVENT, listener);
    refs -= 1;
    if (refs <= 0 && stop !== null) {
      stop();
      stop = null;
      refs = 0;
    }
  };
}

/**
 * Test-only: publish a tip as though the socket had delivered one.
 *
 * The e2e suite drives the live path through a fake WebSocket server, and the
 * unit suite drives it through this. Exported rather than reached for through a
 * mock because the alternative - a test that dispatches the raw `CustomEvent`
 * itself - would pass with the bus deleted.
 */
export function publishTipForTest(tip: TipEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TipEvent>(EVENT, { detail: tip }));
}
