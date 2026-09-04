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

import { DATA_MODE } from "@/lib/env";

import type { SocketState } from "./socket";
import { subscribeFrames } from "./stream";

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
  // A subscriber attaching to an already-open socket is told the state it is
  // joining, rather than waiting for the next transition to learn it.
  if (stop !== null) handlers.onState?.(state);
  open();

  return () => {
    subscribers.delete(sub);
    close();
  };
}

/** True when at least one attached subscriber is worth a connection. */
function wanted(): boolean {
  if (DATA_MODE === "live") return subscribers.size > 0;
  for (const s of subscribers) if (s.opens) return true;
  return false;
}

function open(): void {
  if (stop !== null || !wanted()) return;
  state = "connecting";
  stop = subscribeFrames((frame) => {
    // A frame arriving IS the socket being open, and `subscribeFrames` does not
    // report state. This is the same inference `MempoolPanel` makes on every
    // frame it handles.
    publishState("open");
    for (const s of [...subscribers]) s.onFrame?.(frame);
  });
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
  for (const s of [...subscribers]) s.onState?.(next);
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
  subscribers.clear();
  if (stop !== null) {
    stop();
    stop = null;
  }
  state = "connecting";
}
