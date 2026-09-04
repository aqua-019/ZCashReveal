/**
 * The request budget, the `Retry-After` reader, and the 429 the client used to
 * mistake for a dead socket.
 *
 * DRIVEN THROUGH A REAL SERVER AND REAL UNDICI, NOT A `FetchLike` DOUBLE, and
 * that is the point rather than thoroughness. LEDGER-11's diagnosis is that this
 * project's defects live at seams where two suites each build their own input;
 * a 429 is an HTTP status and a header, so a double asserting "the client sees
 * status 429" is a statement about the double. `MockRpcEndpoint` makes one side
 * actually produce the value and hands it to the other.
 *
 * F-56-1: every module these probes mutate was read line-by-line first -
 * `client.ts` (the retry loop at 175-215 and `#once` at 239-290), `errors.ts`
 * whole, and `rate-limit.ts` whole, which this session wrote.
 */
import { describe, expect, it } from "vitest";

import { ZebraRpc } from "../client.js";
import { RpcError, RpcRateLimitError, RpcSchemaError, RpcTransportError } from "../errors.js";
import { MockRpcEndpoint } from "../mock-endpoint.js";
import { RateGate, parseRetryAfterMs } from "../rate-limit.js";

/** A clock a test drives by hand, so a rolling window costs no wall clock. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("parseRetryAfterMs", () => {
  const NOW = Date.parse("2026-09-03T22:44:05Z");

  it("reads the delta-seconds form", () => {
    expect(parseRetryAfterMs("30", NOW)).toBe(30_000);
    expect(parseRetryAfterMs("  0 ", NOW)).toBe(0);
  });

  it("reads the HTTP-date form, which a client that only reads seconds ignores", () => {
    // RFC 9110 gives Retry-After two forms. A reader that handles one silently
    // treats the other as absent, which looks exactly like a server that did
    // not send the header - the two are indistinguishable from the result.
    expect(parseRetryAfterMs("Wed, 03 Sep 2026 22:44:35 GMT", NOW)).toBe(30_000);
  });

  it("clamps a date already in the past rather than going negative", () => {
    // A negative wait reads as "go now" to `penalise`, which would turn a
    // refusal into an immediate retry - the exact behaviour this file removes.
    expect(parseRetryAfterMs("Wed, 03 Sep 2026 22:43:05 GMT", NOW)).toBe(0);
  });

  it("answers null for absent, empty and unparseable values", () => {
    expect(parseRetryAfterMs(null, NOW)).toBeNull();
    expect(parseRetryAfterMs(undefined, NOW)).toBeNull();
    expect(parseRetryAfterMs("", NOW)).toBeNull();
    expect(parseRetryAfterMs("   ", NOW)).toBeNull();
    expect(parseRetryAfterMs("soon", NOW)).toBeNull();
    // THE MEMBER THAT FOUND A REAL DEFECT. `delta-seconds` is an integer in the
    // grammar, so "1.5" is in neither form and the answer is an absence. The
    // first implementation fell through to `Date.parse`, which reads "1.5" as
    // 5 January 2001, clamped the resulting negative to 0, and handed every
    // caller "retry immediately" for a header it had failed to understand.
    // Absence rendered as a zero, in a parser written the same hour, found by
    // executing this line rather than by reading the function.
    expect(parseRetryAfterMs("1.5", NOW)).toBeNull();
    expect(parseRetryAfterMs("0.5", NOW)).toBeNull();
    // And the fix does not swallow the valid past date, which legitimately IS 0.
    expect(parseRetryAfterMs("Wed, 03 Sep 2026 22:43:05 GMT", NOW)).toBe(0);
  });
});

describe("RateGate", () => {
  it("refuses a sixth request inside one window and admits it after the window rolls", async () => {
    const clock = fakeClock();
    const slept: number[] = [];
    const gate = new RateGate({
      perMinute: 5,
      now: clock.now,
      sleep: (ms) => {
        slept.push(ms);
        clock.advance(ms);
        return Promise.resolve();
      },
    });

    for (let i = 0; i < 5; i += 1) {
      expect(gate.waitMs()).toBe(0);
      await gate.take();
      clock.advance(100);
    }
    expect(gate.remaining()).toBe(0);
    // 500 ms have passed since the first request - the loop advances 100 ms
    // AFTER each of the five takes, not between them - so the oldest slot frees
    // in 59,500 ms. Asserted as the number rather than "greater than zero",
    // because a gate that waits the WRONG amount and a gate that waits are
    // indistinguishable from a boolean.
    //
    // THIS PROBE WAS WRONG BEFORE THE CODE WAS, and it is left recorded rather
    // than quietly corrected (LEDGER-05 fold 7). Its first draft asserted
    // 59,600 by counting four advances where the loop runs five, and the run
    // that failed named the gate. Checking the probe before judging the code is
    // what separated it from the case one describe() up, where the same move
    // found a real defect in `parseRetryAfterMs`.
    expect(gate.waitMs()).toBe(59_500);
    await gate.take();
    expect(slept).toEqual([59_500]);
  });

  it("holds across a window BOUNDARY, which is what makes the window rolling rather than a bucket", async () => {
    // THE DATA MUTATION FOR THE FIXED-BUCKET DESIGN. A bucket that empties on
    // the minute admits five requests at 59.9 s and five more at 60.1 s: ten
    // inside one real minute, and the measured endpoint refuses on the sixth.
    // The member of the exclusion set is that 200 ms straddle.
    const clock = fakeClock();
    const gate = new RateGate({
      perMinute: 5,
      now: clock.now,
      sleep: (ms) => {
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    clock.advance(59_900);
    for (let i = 0; i < 5; i += 1) await gate.take();
    clock.advance(200);
    expect(gate.remaining()).toBe(0);
    expect(gate.waitMs()).toBe(59_800);
  });

  it("serialises concurrent takes so N callers consume N slots rather than all reading one free slot", async () => {
    const clock = fakeClock();
    const gate = new RateGate({
      perMinute: 2,
      now: clock.now,
      sleep: (ms) => {
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    // Three at once against a ceiling of two. Without the serialising tail all
    // three read `remaining() === 2` before any of them consumed a slot.
    await Promise.all([gate.take(), gate.take(), gate.take()]);
    // The third waited a full window rather than going out with the first two.
    expect(clock.now()).toBe(1_060_000);
  });

  it("fills the window on a refusal, and honours a Retry-After longer than the window", () => {
    const clock = fakeClock();
    const gate = new RateGate({ perMinute: 5, now: clock.now });
    expect(gate.remaining()).toBe(5);
    gate.penalise(null);
    expect(gate.remaining()).toBe(0);
    expect(gate.waitMs()).toBe(60_000);

    const clock2 = fakeClock();
    const gate2 = new RateGate({ perMinute: 5, now: clock2.now });
    gate2.penalise(90_000);
    expect(gate2.waitMs()).toBe(90_000);
  });

  it("rejects a non-positive ceiling rather than admitting everything", () => {
    // A ceiling of zero read as "unlimited" is the failure mode where a
    // misconfiguration removes the protection it was meant to add.
    expect(() => new RateGate({ perMinute: 0 })).toThrow(RangeError);
    expect(() => new RateGate({ perMinute: -1 })).toThrow(RangeError);
    expect(() => new RateGate({ perMinute: Number.NaN })).toThrow(RangeError);
  });
});

describe("a 429 over the wire", () => {
  it("arrives as RpcRateLimitError and costs exactly ONE request, not three", async () => {
    // THE DEFECT THIS REPLACES, MEASURED. Before HANDOFF-15 a 429 fell to
    // `if (!res.ok) throw new Error(...)` at the bottom of `#once`; `call()`
    // read it as a transport failure because it was not an `RpcError`, slept
    // 200 ms and 400 ms and asked twice more. At the measured five-per-minute
    // ceiling that is 60 per cent of the minute spent on one refused call, and
    // the caller was then told "no response after 3 attempts" - a timeout, for
    // an endpoint that answered all three times.
    const endpoint = new MockRpcEndpoint({ refuseAt: [1, 2, 3, 4] });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 2, sleep: () => Promise.resolve() });
      await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcRateLimitError);
      expect(endpoint.requestCount).toBe(1);
    } finally {
      await endpoint.stop();
    }
  });

  it("carries Retry-After when the endpoint sends one, and null when it does not", async () => {
    const withHeader = new MockRpcEndpoint({ refuseAt: [1], retryAfter: "30" });
    const u1 = await withHeader.start();
    try {
      const rpc = new ZebraRpc({ url: u1, retries: 0 });
      const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RpcRateLimitError);
      expect((err as RpcRateLimitError).retryAfterMs).toBe(30_000);
      expect((err as RpcRateLimitError).status).toBe(429);
      expect((err as RpcRateLimitError).method).toBe("getblockchaininfo");
    } finally {
      await withHeader.stop();
    }

    // THE NULL SIDE IS THE COMMON ONE AND IS ASSERTED AS SUCH. The measured
    // Tatum endpoint sends no Retry-After, so a suite that only drove the
    // present branch would leave the live branch untested.
    const without = new MockRpcEndpoint({ refuseAt: [1] });
    const u2 = await without.start();
    try {
      const rpc = new ZebraRpc({ url: u2, retries: 0 });
      const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RpcRateLimitError);
      expect((err as RpcRateLimitError).retryAfterMs).toBeNull();
    } finally {
      await without.stop();
    }
  });

  it("is NOT confused with a 500, which is still retried", async () => {
    // Two-polarity for the distinction itself: the retryable neighbour must
    // still retry, or "429 is distinguished" would be satisfied by a client
    // that stopped retrying everything.
    let hits = 0;
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:1/",
      retries: 2,
      sleep: () => Promise.resolve(),
      fetch: () => {
        hits += 1;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("{}"),
        });
      },
    });
    await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcTransportError);
    expect(hits).toBe(3);
  });

  it("penalises the gate, so the NEXT call waits rather than asking straight into the refusal", async () => {
    const clock = fakeClock();
    const gate = new RateGate({
      perMinute: 5,
      now: clock.now,
      sleep: (ms) => {
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    const endpoint = new MockRpcEndpoint({ refuseAt: [1] });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0, gate });
      expect(gate.remaining()).toBe(5);
      await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcRateLimitError);
      // The window is FULL after a refusal, not merely one slot lighter: the
      // endpoint's count disagrees with ours and its answer is the one that
      // decides. Trusting our count would ask again immediately.
      expect(gate.remaining()).toBe(0);
      expect(gate.waitMs()).toBe(60_000);
    } finally {
      await endpoint.stop();
    }
  });
});

/**
 * F-57-1's EVIDENCE, MEASURED HERE RATHER THAN ARGUED (HANDOFF-16).
 *
 * The rule adopted on PR #57 says an exclusion-set member must be a shape a REAL
 * PRODUCER emits, and that where a producer emits several the mock emits all of
 * them - with the set closed by CAPTURE rather than by enumeration from memory.
 * The captured body below is what earned it: it was measured on the live
 * endpoint the day after three bodies had been enumerated, and it is none of
 * them.
 *
 * WHAT IS RELAYED AND WHAT IS MEASURED, KEPT APART. The body's TEXT is L2's
 * capture, relayed through the handoff prompt, because the session that added
 * this test could not reach the endpoint - six public hosts, every one refused
 * at CONNECT with 403 by its container's egress proxy. The body's BEHAVIOUR is
 * measured right here, by driving it through the real client at both statuses.
 * F-57-1 asks for a capture; where the wire is unreachable, the honest form is a
 * relayed capture whose discriminating property is re-measured locally, and
 * saying which half is which is the whole of the honesty.
 */
describe("the FOURTH 429 body - the one production sends", () => {
  // Captured from the live endpoint on 4 September 2026. Neither `result` nor
  // `error`, which is what makes it a third escape route.
  const GATEWAY_BODY = {
    statusCode: 429,
    message:
      "You have exceeded your limit of 5 requests per minute. To increase this limit, upgrade to a Paid plan with 200 requests per second...",
  };

  it("AT STATUS 200 it parses and reaches NEITHER branch - which is the property that makes it a third escape route", async () => {
    // The pre-fix ordering read the BODY to classify a refusal. This body defeats
    // that read: `envelopeSchema` is `.passthrough()` over two OPTIONAL fields,
    // so it PARSES (not the parse-failure branch, which the HTML page takes) and
    // carries no `error` (not the error-object branch, which the JSON-RPC-wrapped
    // limiter takes). The client falls through to "empty result", which is a
    // statement about the CHAIN - and the endpoint was talking about US.
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:8232",
      retries: 0,
      sleep: () => Promise.resolve(),
      fetch: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve(GATEWAY_BODY),
          text: () => Promise.resolve(JSON.stringify(GATEWAY_BODY)),
        }),
    });
    const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
    // It parsed: NOT a schema error and NOT a transport error.
    expect(err).not.toBeInstanceOf(RpcSchemaError);
    expect(err).not.toBeInstanceOf(RpcTransportError);
    // And it took neither refusal branch: an `RpcError` about an empty result.
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).message).toContain("empty result");
  });

  it("AT STATUS 429 the shipped fix covers it: RpcRateLimitError, before the body is read at all", async () => {
    // The pass side, and the reason this closes an exclusion set rather than
    // fixing a defect. `#once` decides on the STATUS first, so the body above
    // cannot reach the branch it would otherwise defeat.
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:8232",
      retries: 2,
      sleep: () => Promise.resolve(),
      fetch: () =>
        Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: (n: string) => (n.toLowerCase() === "retry-after" ? "60" : null) },
          json: () => Promise.resolve(GATEWAY_BODY),
          text: () => Promise.resolve(JSON.stringify(GATEWAY_BODY)),
        }),
    });
    const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcRateLimitError);
    // Retry-After IS sent on a real refusal - LEDGER-15's deferral, closed as
    // MEASURED rather than carried: L2 dumped the live headers on both a 200 and
    // a 429 and found `retry-after: 60` present and NO `X-RateLimit-*` header of
    // any kind, only `x-ttm-plan: anonymous`.
    expect((err as RpcRateLimitError).retryAfterMs).toBe(60_000);
  });

  it("the mock emits it byte for byte, so the loop below drives the captured shape and not a paraphrase", async () => {
    const endpoint = new MockRpcEndpoint({ refuseAt: [1], refusalBody: "gateway" });
    const url = await endpoint.start();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "1.0", id: 1, method: "getblockchaininfo", params: [] }),
      });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual(GATEWAY_BODY);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("a 429 is classified by its STATUS, whatever body it carries", () => {
  // THE THREE REAL BODIES, AND TWO OF THEM ESCAPED THE FIRST IMPLEMENTATION.
  // The 429 check sat BELOW the JSON parse and BELOW the error-object branch,
  // so a Cloudflare HTML page became a bare `Error` retried on the transport
  // policy, and a JSON-RPC-wrapped limiter became an `RpcError` that never
  // penalised the gate. Both are verbatim the defect `rate-limit.ts`'s header
  // says this package removed, reached through a different line.
  //
  // NO TEST CAUGHT IT BECAUSE THE MOCK SENT THE ONE BODY THAT DODGES THE
  // COLLISION: `{error: "rate limited"}` has `error` as a STRING, which fails
  // `envelopeSchema`'s `z.object(...)`, so `envelope.success` was false and the
  // 429 branch was reached by accident. A fail side chosen, unknowingly, to
  // pass. The table below drives all four.
  //
  // AND THE FOURTH ARRIVED AFTER THE FIX, WHICH IS WHY F-57-1 EXISTS
  // (HANDOFF-16). L2 captured the body the measured endpoint ACTUALLY sends on
  // 4 September 2026 - `{"statusCode": 429, "message": "You have exceeded your
  // limit of 5 requests per minute..."}` - and it is a THIRD escape route from
  // the pre-fix ordering, distinct from both of the two above: it PARSES, and it
  // carries neither `result` nor `error`, so it reached neither the
  // error-object branch nor the parse-failure branch. `envelopeSchema` is
  // `.passthrough()` over two OPTIONAL fields, which is what admits it. The
  // shipped status-first fix covers it, so this closes an exclusion set rather
  // than fixing a defect - and F-57-1's point is that the set is closed by
  // CAPTURE from a real producer, because the three bodies enumerated from
  // memory did not contain the one production sends.
  //
  // ITS CONTENT IS RELAYED RATHER THAN CAPTURED HERE, and that is stated rather
  // than glossed: the session that added it could not reach the endpoint or any
  // of five others, every one refused at CONNECT with 403 by its container's
  // egress proxy. What IS measured here is the discriminating property, and it
  // is measured by execution in the `envelopeSchema` block below.
  const bodies = ["envelope", "html", "bare", "gateway"] as const;

  for (const refusalBody of bodies) {
    it(`a ${refusalBody} body: RpcRateLimitError, and exactly ONE request`, async () => {
      const endpoint = new MockRpcEndpoint({ refuseAt: [1, 2, 3, 4], refusalBody });
      const url = await endpoint.start();
      try {
        const rpc = new ZebraRpc({ url, retries: 2, sleep: () => Promise.resolve() });
        const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(RpcRateLimitError);
        // NOT AN RpcError AND NOT AN RpcTransportError - the two wrong answers
        // the pre-fix code gave for the first two bodies respectively.
        expect(err).not.toBeInstanceOf(RpcTransportError);
        expect((err as RpcRateLimitError).name).toBe("RpcRateLimitError");
        // ONE request, not three: the retry loop must not have run.
        expect(endpoint.requestCount).toBe(1);
      } finally {
        await endpoint.stop();
      }
    });

    it(`a ${refusalBody} body penalises the gate, so the next call waits`, async () => {
      // The gate penalty is what turns classification into behaviour. An
      // `RpcError` escapes `call()` without touching it, so the JSON-RPC
      // envelope case was silently unmetered before the fix.
      const clock = fakeClock();
      const gate = new RateGate({
        perMinute: 5,
        now: () => clock.now(),
        sleep: (ms) => {
          clock.advance(ms);
          return Promise.resolve();
        },
      });
      const endpoint = new MockRpcEndpoint({ refuseAt: [1], refusalBody });
      const url = await endpoint.start();
      try {
        const rpc = new ZebraRpc({ url, retries: 0, gate, now: () => clock.now() });
        await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcRateLimitError);
        expect(gate.remaining()).toBe(0);
        expect(gate.waitMs()).toBe(60_000);
      } finally {
        await endpoint.stop();
      }
    });
  }

  it("reads Retry-After off an HTML refusal too, because the header is not in the body", async () => {
    const endpoint = new MockRpcEndpoint({ refuseAt: [1], refusalBody: "html", retryAfter: "30" });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
      expect((err as RpcRateLimitError).retryAfterMs).toBe(30_000);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("a hostile Retry-After cannot park or spin the process", () => {
  it("a MONTH-long Retry-After is capped rather than honoured literally", () => {
    // MEASURED ON NODE 22: `setTimeout(fn, 2_678_400_000)` warns
    // `TimeoutOverflowWarning: ... Timeout duration was set to 1` and fires in
    // about a millisecond. So an uncapped penalty does not park the gate - it
    // makes `take()`'s re-check loop spin at roughly a kilohertz forever, with
    // the tick's non-reentrancy flag held the whole time, so nothing publishes
    // a drain state again. The member of the exclusion set is a legal
    // `delta-seconds` of 2678400.
    const clock = fakeClock();
    const gate = new RateGate({ perMinute: 5, now: () => clock.now() });
    gate.penalise(2_678_400_000);
    expect(gate.waitMs()).toBe(15 * 60_000);
    expect(gate.waitMs()).toBeLessThan(2_147_483_647);
  });

  it("and the cap is a CAP, not a floor: a short Retry-After is still at least the window", () => {
    // The other polarity. `penalise` fills the window AND sets the deadline, so
    // a 5-second Retry-After is honoured as a lower bound - the window is the
    // real constraint. An assertion that only drove the long case would be
    // satisfied by a gate that returned the cap for every input.
    const clock = fakeClock();
    const gate = new RateGate({ perMinute: 5, now: () => clock.now() });
    gate.penalise(5_000);
    expect(gate.waitMs()).toBe(60_000);
  });

  it("take() resolves under a capped penalty rather than spinning", async () => {
    const clock = fakeClock();
    let sleeps = 0;
    const gate = new RateGate({
      perMinute: 5,
      now: () => clock.now(),
      sleep: (ms) => {
        sleeps += 1;
        // THE PROBE'S OWN GUARD. Before the cap this loop did not terminate,
        // so a test without a bound would hang the suite rather than fail it.
        if (sleeps > 50) throw new Error(`take() span ${String(sleeps)} sleeps - it is spinning`);
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    gate.penalise(2_678_400_000);
    await gate.take();
    expect(sleeps).toBeLessThanOrEqual(2);
  });

  it("a ceiling large enough to exhaust the heap does not allocate it", () => {
    // `Array.from({length: n})` materialises n slots. The config caps this at
    // 100,000; the gate caps it again at the site that spends it, because a
    // guard in one place is a guard the next caller does not have.
    const gate = new RateGate({ perMinute: 100_000_000 });
    gate.penalise(null);
    expect(gate.remaining()).toBe(0);
  });
});

describe("MockRpcEndpoint", () => {
  it("refuses on the sixth request of a five-per-minute window, which is the measured shape", async () => {
    // The mock reproduces HANDOFF-15 section 1's measurement: sixteen requests
    // in a burst, five 200s, then 429 for every request from the sixth on.
    const endpoint = new MockRpcEndpoint({ perMinute: 5 });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const statuses: string[] = [];
      for (let i = 0; i < 16; i += 1) {
        statuses.push(await rpc.getBlockchainInfo().then(() => "200", () => "429"));
      }
      expect(statuses.slice(0, 5)).toEqual(["200", "200", "200", "200", "200"]);
      expect(statuses.slice(5)).toEqual(Array.from({ length: 11 }, () => "429"));
      expect(endpoint.records.filter((r) => r.status === 200)).toHaveLength(5);
    } finally {
      await endpoint.stop();
    }
  });

  it("answers -5 for a transaction it does not hold, and a method error for an unknown method", async () => {
    // The keyless endpoint's own behaviour, recorded in section 1: a fake txid
    // answers "No such mempool or main chain transaction", which is how L2
    // established getrawtransaction is SERVED rather than blocked.
    const endpoint = new MockRpcEndpoint({ mempool: ["a".repeat(64)] });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const err = await rpc.getRawTransaction("b".repeat(64) as never).catch((e: unknown) => e);
      expect(String(err)).toContain("No such mempool or main chain transaction");
      expect(await rpc.getRawMempool()).toEqual(["a".repeat(64)]);
      expect(await rpc.getRawMempoolVerbose()).toEqual({ ["a".repeat(64)]: { size: 1_024 } });
    } finally {
      await endpoint.stop();
    }
  });
});
