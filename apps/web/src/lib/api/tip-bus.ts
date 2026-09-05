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
 * SINCE HANDOFF-17 THE SOCKET ITSELF LIVES IN `frame-bus.ts`, one layer down.
 * The turnstile plane became a fourth consumer wanting a DIFFERENT frame, so
 * the ref-count had to serve more than the tip; this module keeps the tip's own
 * contract - monotonic, live-only, delivered as a DOM event - and reads the
 * shared subscription instead of opening its own. The count of sockets is
 * unchanged at one; what changed is that a second kind of consumer can now
 * exist without making it two.
 *
 * WHY A DOM EVENT RATHER THAN A CONTEXT. The consumers are not in one subtree:
 * `Tide` is mounted by `Shell` above `Grain`, `EpochClock` is inside
 * `ScreenDisclosure`'s bar slot, and the refresh trigger has no visual position
 * at all. A context would mean a provider wrapping the whole document and every
 * consumer becoming a client component to read it. A window event costs
 * nothing and each consumer stays exactly as client-side as it already was.
 *
 * FIXTURE MODE OPENS NOTHING ON THIS MODULE'S ACCOUNT. `subscribeFrames` falls
 * back to the committed `FixtureStream`, which emits no `tip` frame at all, so
 * subscribing off live mode would open a socket, replay a mempool and deliver
 * nothing. That is why `onFrames` is called with `openInFixture: false`: the
 * clock never opens a connection it would learn nothing from, and the clock
 * standing still against a fixture is the honest reading of a fixture.
 *
 * IT IS `openInFixture: false` AND NOT A `DATA_MODE` TEST, and the difference
 * is a real one rather than a restatement. The old form asked "is the socket
 * real?" and refused to subscribe at all; this one asks "is it worth opening a
 * socket FOR?" and still receives a `tip` frame should some other consumer's
 * socket deliver one. In fixture mode no such frame exists, so the behaviour is
 * identical today - but a gateway that starts sending tips down a stream this
 * module did not open would reach the clock rather than being filtered out by a
 * mode flag that was standing in for a fact about the stream.
 */

import { onFrames } from "./frame-bus";

/** What a block arrival carries. The two fields every consumer reads. */
export interface TipEvent {
  readonly height: number;
  readonly hash: string;
}

const EVENT = "zr:tip";

let stop: (() => void) | null = null;
let refs = 0;
/**
 * Bumped whenever the shared subscription is dropped out from under this module.
 *
 * A DETACH CLOSURE OUTLIVES THE SUBSCRIPTION IT BELONGS TO. `onReset` sets
 * `refs = 0` while closures handed out before the reset are still live and still
 * un-detached; each of those then decrements a counter that no longer describes
 * them, driving `refs` NEGATIVE - after which the next consumer's ordinary
 * detach reaches zero early and tears down a feed another consumer is still
 * using. Found by a gate round as a hazard and reproduced here by a test whose
 * ordering happened to trigger it: two consumers attached, one detached, and the
 * other went deaf.
 *
 * A closure captures the generation it was made in and does nothing if that
 * generation has passed, which is the same idempotence `detached` gives one
 * closure, applied to the whole cohort.
 */
let generation = 0;

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
  // THE DETACH IS IDEMPOTENT, as `onFrames`' is. Without this a consumer whose
  // cleanup ran twice - a double unmount, a defensive caller - decremented
  // `refs` for a subscription it no longer held, drove the count to zero while
  // OTHER listeners were still attached, tore down the shared feed and left
  // them permanently deaf. The docblock above claims the socket "lives exactly
  // as long as at least one consumer is mounted", which was false under a
  // double detach. Pre-existing; fixed here because HANDOFF-17 gave the layer
  // below this property and documented it, and leaving the two disagreeing is
  // how one of them comes to be wrong.
  let detached = false;
  const bornIn = generation;

  if (stop === null) {
    let seen = -1;
    stop = onFrames(
      {
        onFrame: (frame) => {
          if (frame.type !== "tip" || frame.height <= seen) return;
          seen = frame.height;
          window.dispatchEvent(
            new CustomEvent<TipEvent>(EVENT, { detail: { height: frame.height, hash: frame.hash } }),
          );
        },
        // `resetFrameBusForTest` drops every subscriber; without this the
        // module would still hold a non-null `stop`, believe itself attached,
        // and never resubscribe - so no tip could reach any consumer again.
        onReset: () => {
          stop = null;
          refs = 0;
          generation += 1;
        },
      },
      { openInFixture: false },
    );
  }

  return () => {
    // A closure from a previous generation describes a subscription that no
    // longer exists; decrementing for it corrupts the count for the live one.
    if (detached || bornIn !== generation) return;
    detached = true;
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
