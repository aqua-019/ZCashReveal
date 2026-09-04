"use client";

/**
 * ONE socket for the whole document, and every frame consumer reading it.
 *
 * ============================================================================
 * WHY THIS EXISTS, IN THE WORDS OF THE MODULE THAT FOUND THE PROBLEM
 * ============================================================================
 * `tip-bus.ts` was written in HANDOFF-11 with this header: *"`subscribeFrames`
 * opens a socket per call. Three sockets to one gateway is three times the
 * connection cap `apps/gateway` enforces per reader, for one event that every
 * consumer wants identically."* It solved that for the TIP by ref-counting one
 * subscription behind a DOM event.
 *
 * HANDOFF-17 adds a further consumer - the turnstile plane, which wants
 * `tx_added` and `tx_removed` rather than `tip` - and a bare `subscribeFrames`
 * on the splash page would be exactly the cost `tip-bus` was written to avoid,
 * one route down. So the ref-count moves here and carries every frame; `onTip`
 * becomes a filter over this bus rather than a second subscription.
 *
 * ============================================================================
 * FIXTURE MODE, AND WHY THE TWO CONSUMERS DISAGREE ABOUT IT
 * ============================================================================
 * `tip-bus` refuses to open in fixture mode, and its reason is exact: the
 * committed `FixtureStream` emits no `tip` frame at all, so subscribing would
 * open a socket, replay a mempool and deliver the clock nothing. That reason is
 * about the TIP and it does not generalise - the fixture stream emits
 * `tx_added` for every entry in the committed corpus, which is precisely what
 * the plane consumes.
 *
 * So a subscriber says whether it is worth opening a socket FOR: `openInFixture`
 * defaults true, and `onTip` passes false. The socket opens while at least one
 * subscriber that wants it open is attached, and every attached subscriber
 * receives whatever arrives. A clock that would learn nothing does not open a
 * connection on its own account, and does not have to refuse frames that some
 * other consumer's socket happened to deliver.
 *
 * ============================================================================
 * WHAT THIS IS NOT
 * ============================================================================
 * It is not a cache and it holds no frames. A consumer that attaches late has
 * missed what it missed; the gateway sends a `snapshot` frame on connect, which
 * is how a late reader catches up, and inventing a replay here would be this
 * module deciding what a reader saw.
 */

import type { ZecFrame } from "@zcashreveal/types";

import type { SocketState } from "./socket";
import { IS_LIVE_TRANSPORT, subscribeFrames } from "./stream";

export interface FrameBusOptions {
  /**
   * Whether this subscriber is worth opening a socket for in fixture mode.
   *
   * Defaults true. `onTip` passes false: the committed stream emits no `tip`
   * frame, so a clock opening a connection to receive nothing is a cost with no
   * reading attached.
   */
  readonly openInFixture?: boolean;
}

/** What a subscriber is handed: every frame, and the socket's own state. */
export interface FrameBusHandlers {
  readonly onFrame?: (frame: ZecFrame) => void;
  readonly onState?: (state: SocketState) => void;
  /**
   * Called when `resetFrameBusForTest` drops every subscriber, so a consumer
   * that CACHES its detach can forget it.
   *
   * `tip-bus` is such a consumer: `stop !== null` is its whole record of
   * whether it is attached, and a reset that cleared this set without telling
   * it left it believing it was subscribed - after which no tip could be
   * delivered again for the life of the process and every later tip assertion
   * in that file passed vacuously. That is an assertion satisfied by every
   * value it was written to exclude, arriving in the harness rather than in the
   * product. Found by a gate reviewer whose own probe hit it.
   *
   * It is a HANDLER rather than `frame-bus` calling `tip-bus` directly, because
   * that would be a circular import and would put a test-only function into the
   * production module graph. The dependency stays one-directional.
   */
  readonly onReset?: () => void;
}

interface Subscriber extends FrameBusHandlers {
  readonly opens: boolean;
}

const subscribers = new Set<Subscriber>();
let stop: (() => void) | null = null;
let state: SocketState = "connecting";

/**
 * Attach handlers. Returns the detach function; the last detach that leaves no
 * socket-wanting subscriber closes the connection.
 *
 * SAFE TO ATTACH TWICE. React strict mode double-invokes an effect, so a
 * component mounts, detaches and mounts again on the same tick. Each call gets
 * its own `Subscriber` identity and its own detach, so a double mount opens at
 * most one socket and a double unmount cannot close someone else's - the same
 * property `subscribeFrames` gives its own callers by returning a closure
 * rather than a global stop.
 */
export function onFrames(handlers: FrameBusHandlers, options: FrameBusOptions = {}): () => void {
  if (typeof window === "undefined") return () => undefined;

  const sub: Subscriber = { ...handlers, opens: options.openInFixture ?? true };
  subscribers.add(sub);
  // EVERY subscriber is told the state it is joining, not only one attaching to
  // an already-open socket. The old form guarded on `stop !== null`, so a cold
  // attach learned nothing and a consumer had to assume it was connecting - an
  // assumption that happened to be right and was not a fact it had been given.
  handlers.onState?.(state);
  open();

  return () => {
    subscribers.delete(sub);
    close();
  };
}

/**
 * True when at least one attached subscriber is worth a connection.
 *
 * `IS_LIVE_TRANSPORT` RATHER THAN `DATA_MODE === "live"`, and the difference is
 * a real configuration: with the mode set and `NEXT_PUBLIC_WS_URL` missing,
 * `subscribeFrames` falls back to the committed stream, and the old test made
 * `onTip` alone open one - replaying a mempool to deliver a clock nothing,
 * which is the exact cost `openInFixture: false` exists to prevent. The
 * predicate now asks about the TRANSPORT, which is what the question was.
 */
function wanted(): boolean {
  if (IS_LIVE_TRANSPORT) return subscribers.size > 0;
  for (const s of subscribers) if (s.opens) return true;
  return false;
}

function open(): void {
  if (stop !== null || !wanted()) return;
  state = "connecting";
  stop = subscribeFrames(
    (frame) => {
      for (const s of [...subscribers]) if (subscribers.has(s)) s.onFrame?.(frame);
    },
    // THE STATE IS THE SOCKET'S OWN, NOT AN INFERENCE FROM A FRAME ARRIVING.
    // The first draft inferred `open` from traffic, which is one-way: a socket
    // that connects and then dies delivers nothing to revise the inference
    // with, so the page latched at "live" over a dead feed for ever - a frozen
    // surface reporting no fault, which is this project's most-recorded defect
    // shape, in the component whose docblock said it existed to prevent it.
    // `ZecSocket` has tracked all three states since HANDOFF-11; nobody was
    // listening.
    { onState: publishState },
  );
}

function close(): void {
  if (stop === null || wanted()) return;
  stop();
  stop = null;
  publishState("connecting");
}

function publishState(next: SocketState): void {
  if (state === next) return;
  state = next;
  // `subscribers.has(s)` because a handler may detach a subscriber DURING the
  // loop: the copy protects the iteration and would still deliver to one that
  // has already gone. Not reachable through the current consumers - React 19
  // batches a socket callback into a microtask - and one line to close.
  for (const s of [...subscribers]) if (subscribers.has(s)) s.onState?.(next);
}

/**
 * Test-only: publish a frame as though the socket had delivered one.
 *
 * On the same terms as `tip-bus.ts`'s `publishTipForTest`, and for the same
 * stated reason: a test that reached past the bus - constructing a
 * `FixtureStream` itself, or mocking `onFrames` - would pass with the bus
 * deleted, and would therefore prove nothing about whether a component is
 * actually subscribed. This goes through the real subscriber set, so a
 * component that failed to attach receives nothing.
 *
 * It does NOT stand in for the socket itself. `frame-bus.test.ts` drives the
 * real `subscribeFrames` over the committed stream to prove the bus is wired to
 * a transport at all; this is how a COMPONENT test delivers a chosen frame.
 */
export function publishFrameForTest(frame: ZecFrame): void {
  publishState("open");
  for (const s of [...subscribers]) s.onFrame?.(frame);
}

/** Test-only: move the socket state without a frame, for the fault polarity. */
export function publishStateForTest(next: SocketState): void {
  publishState(next);
}

/**
 * Test-only: drop every subscriber and close the socket.
 *
 * A module-level ref-count outlives a test file's individual cases, so a suite
 * that mounts the same component twice would otherwise carry the first case's
 * subscribers into the second. Exported rather than reached for by resetting
 * modules, because a test that re-imports the module gets a different Set and
 * proves nothing about the one the component uses.
 */
export function resetFrameBusForTest(): void {
  // Tell every caching consumer BEFORE the set is cleared, so one that gates
  // its own resubscription on a held handle can forget it. See `onReset`.
  for (const s of [...subscribers]) s.onReset?.();
  subscribers.clear();
  if (stop !== null) {
    stop();
    stop = null;
  }
  state = "connecting";
}
