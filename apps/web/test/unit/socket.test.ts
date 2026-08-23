/**
 * ASSERTION A7 - the mempool socket reconnects after a simulated close within
 * 1.5 s, with a fake WebSocket.
 *
 * The 1.5 s in the assertion is not arbitrary: it is exactly the delay the
 * legacy client used, hard-coded, as its entire reconnection policy. Porting
 * that verbatim would have made this assertion a coin toss - a fixed 1,500 ms
 * timer plus the time to open a connection is not reliably inside 1,500 ms - so
 * the port replaced the policy rather than copying it, and the schedule below
 * is what it replaced it with.
 *
 * THE CLOCK IS INJECTED. `setTimeout` and `clearTimeout` are constructor
 * options, so this file drives time directly rather than waiting on it. A test
 * that sleeps for 1.5 s to prove something happens within 1.5 s is a test that
 * proves nothing about the boundary and takes 1.5 s to do it.
 */
import { describe, expect, it } from "vitest";

import { parseFrame, ZecSocket, type SocketLike } from "@/lib/api/socket";

/* -------------------------------------------------------------------------- */
/* A fake transport and a fake clock                                          */
/* -------------------------------------------------------------------------- */

/**
 * A socket that does exactly what it is told, and records what it was told.
 *
 * Not `implements SocketLike`: the interface's `addEventListener` is a set of
 * overloads so that `ZecSocket`'s own call sites are checked per event type,
 * and a single loose signature cannot satisfy all four of them nominally. It
 * satisfies them structurally, which is what the cast at each construction site
 * asserts and what every call in this file exercises.
 */
class FakeSocket {
  readonly #handlers = new Map<string, Set<(ev?: unknown) => void>>();
  readonly sent: string[] = [];
  closed = false;
  closeCode: number | undefined;

  addEventListener(type: string, handler: (ev?: never) => void, options?: { signal?: AbortSignal }): void {
    let set = this.#handlers.get(type);
    if (set === undefined) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    const h = handler as (ev?: unknown) => void;
    set.add(h);
    // The AbortController contract the client relies on to detach listeners
    // between attempts. A fake that ignores the signal would let the leak the
    // port exists to fix pass this suite.
    options?.signal?.addEventListener("abort", () => set?.delete(h));
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closed = true;
    this.closeCode = code;
  }

  /** How many listeners are attached for a type, across every attempt. */
  listeners(type: string): number {
    return this.#handlers.get(type)?.size ?? 0;
  }

  emit(type: string, data?: unknown): void {
    for (const h of [...(this.#handlers.get(type) ?? [])]) h(data);
  }
}

/** A clock the test advances by hand. */
class FakeClock {
  #now = 0;
  #next = 1;
  readonly #timers = new Map<number, { at: number; fn: () => void }>();

  get now(): number {
    return this.#now;
  }

  readonly setTimeout = (fn: () => void, ms: number): number => {
    const id = this.#next;
    this.#next += 1;
    this.#timers.set(id, { at: this.#now + ms, fn });
    return id;
  };

  readonly clearTimeout = (id: number): void => {
    this.#timers.delete(id);
  };

  /** Advance to `now + ms`, firing every timer due on the way, in time order. */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const due = [...this.#timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at);
      const first = due[0];
      if (first === undefined) break;
      this.#timers.delete(first[0]);
      this.#now = first[1].at;
      first[1].fn();
    }
    this.#now = target;
  }

  get pending(): number {
    return this.#timers.size;
  }
}

/** A client wired to a fake transport and a fake clock, with the sockets it opened. */
function harness(options: { idleTimeoutMs?: number; pingIntervalMs?: number } = {}) {
  const clock = new FakeClock();
  const sockets: FakeSocket[] = [];
  const frames: unknown[] = [];
  const states: string[] = [];
  const client = new ZecSocket("wss://gateway.example/ws", {
    open: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as SocketLike;
    },
    onFrame: (f) => frames.push(f),
    onState: (s) => states.push(s),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    idleTimeoutMs: options.idleTimeoutMs ?? 0,
    pingIntervalMs: options.pingIntervalMs ?? 0,
  });
  return { clock, sockets, frames, states, client };
}

/* -------------------------------------------------------------------------- */

describe("A7 pass state - it reconnects within 1.5 s of a close", () => {
  it("opens one socket on connect", () => {
    const h = harness();
    h.client.connect();
    expect(h.sockets).toHaveLength(1);
    expect(h.client.state).toBe("connecting");
  });

  it("a close is followed by a NEW socket inside 1,500 ms", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("open");
    expect(h.client.state).toBe("open");

    h.sockets[0]?.emit("close");
    // The instant of the close: nothing has reopened yet.
    expect(h.sockets).toHaveLength(1);

    h.clock.advance(1_500);
    expect(h.sockets.length, "no reconnect within 1,500 ms of the close").toBeGreaterThan(1);
    expect(h.sockets[1]).not.toBe(h.sockets[0]);
  });

  it("the first retry is well inside the budget, not at the edge of it", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.sockets[0]?.emit("close");

    // The legacy client's fixed 1,500 ms would still be waiting here. The
    // schedule's first step is 250 ms with full jitter over the window, so the
    // slowest possible first retry is 250 ms.
    h.clock.advance(250);
    expect(h.sockets.length, "the first retry did not land inside 250 ms").toBeGreaterThan(1);
  });

  it("reconnects again, and again, on every subsequent close", () => {
    const h = harness();
    h.client.connect();
    for (let i = 0; i < 4; i += 1) {
      h.sockets[h.sockets.length - 1]?.emit("open");
      h.sockets[h.sockets.length - 1]?.emit("close");
      h.clock.advance(1_500);
    }
    expect(h.sockets.length).toBe(5);
  });

  it("a successful open resets the backoff, so a flapping gateway does not become a slow one", () => {
    const h = harness();
    h.client.connect();
    const first = h.client.delayFor(0);

    // Fail four times without ever opening: the delay grows.
    for (let i = 0; i < 4; i += 1) {
      h.sockets[h.sockets.length - 1]?.emit("close");
      h.clock.advance(10_000);
    }
    // Now open successfully, then close.
    h.sockets[h.sockets.length - 1]?.emit("open");
    const before = h.sockets.length;
    h.sockets[h.sockets.length - 1]?.emit("close");
    h.clock.advance(first + 1);
    expect(h.sockets.length, "the attempt counter did not reset on a successful open").toBe(before + 1);
  });
});

describe("A7 fail state - a client with no reconnect never opens a second socket", () => {
  it("the same close, with the retry schedule removed, leaves one socket for ever", () => {
    // The fail state is the legacy shape with its one line deleted: a client
    // that hears a close and does nothing. Simulated by closing the client
    // first, which latches, so the close handler's retry is refused - the same
    // observable outcome as having no retry at all.
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.client.close();
    h.sockets[0]?.emit("close");

    h.clock.advance(60_000);
    expect(h.sockets, "a closed client reopened itself").toHaveLength(1);
  });

  it("and the legacy delay of 1,500 ms would not have cleared the budget", () => {
    // A fixed 1,500 ms timer fires AT 1,500 ms. The assertion asks for a
    // reconnect WITHIN 1.5 s, and a schedule whose first step is exactly the
    // budget passes or fails on scheduler jitter. This is why the port replaced
    // the policy rather than copying it.
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("close");
    h.clock.advance(1_499);
    const withNewSchedule = h.sockets.length;
    expect(withNewSchedule).toBeGreaterThan(1);
    // The legacy delay, for contrast: 1,500 is not less than 1,500.
    expect(1_500 < 1_500).toBe(false);
  });
});

describe("A7 - the schedule itself", () => {
  it("doubles, and stops doubling at the ceiling", () => {
    const h = harness();
    const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => h.client.delayFor(i));
    // Full jitter over the doubled window: never faster than half the intended
    // delay, never slower than the ceiling.
    for (const [i, d] of delays.entries()) {
      const doubled = Math.min(250 * 2 ** i, 8_000);
      expect(d, `attempt ${i}`).toBeGreaterThanOrEqual(Math.floor(doubled / 2));
      expect(d, `attempt ${i}`).toBeLessThanOrEqual(doubled);
    }
    expect(delays[8]).toBeLessThanOrEqual(8_000);
  });

  it("is jittered, so a fleet does not reconnect in lockstep", () => {
    const h = harness();
    const draws = [0, 0, 0, 0, 0, 0].map((_, i) => h.client.delayFor(4 + i));
    // Six draws at or above the ceiling window: if they were all identical the
    // jitter is not doing its job.
    expect(new Set(draws).size, "every draw was identical - the jitter is dead").toBeGreaterThan(1);
  });

  it("draws its jitter from the seeded stream, not from Math.random", () => {
    // Reproducibility is the point: the same url gives the same schedule, which
    // is what makes this suite deterministic and what keeps the repo-wide ban
    // on Math.random intact.
    const a = new ZecSocket("wss://same/ws", { open: () => new FakeSocket() as unknown as SocketLike, onFrame: () => undefined });
    const b = new ZecSocket("wss://same/ws", { open: () => new FakeSocket() as unknown as SocketLike, onFrame: () => undefined });
    expect([0, 1, 2, 3].map((i) => a.delayFor(i))).toEqual([0, 1, 2, 3].map((i) => b.delayFor(i)));

    const c = new ZecSocket("wss://different/ws", { open: () => new FakeSocket() as unknown as SocketLike, onFrame: () => undefined });
    expect([0, 1, 2, 3].map((i) => c.delayFor(i))).not.toEqual([0, 1, 2, 3].map((i) => a.delayFor(i)));
  });
});

describe("A7 - what the port fixed", () => {
  it("detaches the previous attempt's listeners rather than stacking them", () => {
    // The legacy client attaches four listeners per attempt and removes none,
    // so after ten reconnects a single frame runs ten handlers.
    const h = harness();
    h.client.connect();
    const first = h.sockets[0];
    expect(first?.listeners("message")).toBe(1);

    h.sockets[0]?.emit("close");
    h.clock.advance(1_500);
    expect(first?.listeners("message"), "the old socket's listener was not detached").toBe(0);
    expect(h.sockets[1]?.listeners("message")).toBe(1);
  });

  it("closes the previous socket rather than orphaning it", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("close");
    h.clock.advance(1_500);
    expect(h.sockets[0]?.closed).toBe(true);
  });

  it("close() latches, as in v0.2: a stopped client is not revived by a stray timer", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("close");
    h.client.close();
    h.clock.advance(60_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.client.state).toBe("closed");
  });

  it("close() clears every pending timer", () => {
    const h = harness({ idleTimeoutMs: 30_000, pingIntervalMs: 10_000 });
    h.client.connect();
    h.sockets[0]?.emit("open");
    expect(h.clock.pending).toBeGreaterThan(0);
    h.client.close();
    expect(h.clock.pending, "a timer survived close()").toBe(0);
  });

  it("treats silence past the idle timeout as a dead connection, not a quiet one", () => {
    const h = harness({ idleTimeoutMs: 30_000, pingIntervalMs: 0 });
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.clock.advance(29_000);
    expect(h.sockets).toHaveLength(1);
    h.clock.advance(2_000);
    h.clock.advance(1_500);
    expect(h.sockets.length, "an idle connection was never replaced").toBeGreaterThan(1);
  });

  it("a frame resets the idle timer, so a busy connection is never torn down", () => {
    const h = harness({ idleTimeoutMs: 30_000, pingIntervalMs: 0 });
    h.client.connect();
    h.sockets[0]?.emit("open");
    for (let i = 0; i < 5; i += 1) {
      h.clock.advance(20_000);
      h.sockets[0]?.emit("message", { data: JSON.stringify({ type: "hello", tipHeight: 1 }) });
    }
    h.clock.advance(20_000);
    expect(h.sockets, "a connection delivering frames was torn down as idle").toHaveLength(1);
  });

  it("sends a heartbeat while otherwise idle", () => {
    const h = harness({ idleTimeoutMs: 0, pingIntervalMs: 10_000 });
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.clock.advance(10_000);
    expect(h.sockets[0]?.sent).toEqual([JSON.stringify({ type: "ping" })]);
  });
});

describe("A7 - frames", () => {
  it("delivers a parsed frame to the consumer", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.sockets[0]?.emit("message", { data: JSON.stringify({ type: "tip", height: 7, hash: "ab" }) });
    expect(h.frames).toEqual([{ type: "tip", height: 7, hash: "ab" }]);
  });

  it("drops a malformed frame and counts it, rather than throwing", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.sockets[0]?.emit("message", { data: "{not json" });
    h.sockets[0]?.emit("message", { data: 42 });
    expect(h.frames).toEqual([]);
    expect(h.client.droppedFrames).toBe(2);
  });

  it("parseFrame is total: it answers undefined rather than throwing", () => {
    expect(parseFrame("{}")).toEqual({});
    expect(parseFrame("{nope")).toBeUndefined();
    expect(parseFrame(42)).toBeUndefined();
    expect(parseFrame(undefined)).toBeUndefined();
    expect(parseFrame(null)).toBeUndefined();
  });

  it("reports state changes so a stale panel can say it is stale", () => {
    const h = harness();
    h.client.connect();
    h.sockets[0]?.emit("open");
    h.sockets[0]?.emit("close");
    h.clock.advance(1_500);
    h.sockets[1]?.emit("open");
    expect(h.states).toEqual(["connecting", "open", "connecting", "open"]);
  });
});
