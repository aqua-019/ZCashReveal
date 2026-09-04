/**
 * The rate-aware mempool loop, driven against a real HTTP endpoint that counts.
 *
 * A1, A2, A3 AND A8 LIVE HERE. Every one is driven through `MempoolTicker` -
 * the real tick - and a real `ZebraRpc` over a real socket to
 * `MockRpcEndpoint`, because each assertion is about what the loop DOES rather
 * than about what it was configured with. A ceiling honoured by a plan object
 * and a ceiling honoured on the wire are different claims, and only the second
 * is A1.
 *
 * THE INDEPENDENT WITNESS IS THE POINT. `MockRpcEndpoint.peakInWindow` counts
 * requests as the ENDPOINT saw them, with its own implementation of the rolling
 * window. Asking `RateGate` whether it kept to its own budget would be the
 * instrument marking its own homework.
 *
 * F-56-1: every module these probes mutate was read line-by-line before the
 * probe was written - `index.ts` whole (286 lines, at c12826a), `client.ts`'s
 * retry loop and `#once`, `mempool-state.ts` whole, `anchor-depth.ts` whole,
 * and `leak-analyzer.ts` around its three `getHeightForAnchor` call sites,
 * which is where A8's "null, never zero" is decided.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { MockRpcEndpoint, RateGate, RpcRateLimitError, ZebraRpc } from "@zcashreveal/zebra-rpc";
import { mempoolDrainStateSchema, type Hex, type MempoolDrainState } from "@zcashreveal/types";

import { MempoolTicker, type AnalyzeOutcome } from "../mempool-tick.js";
import { planMempoolPoll } from "../mempool-plan.js";
import { NO_CHAIN_WRITES } from "../chain-access.js";

const log = pino({ level: "silent" });

/** N distinct 64-hex txids, deterministic so a failure names the same one twice. */
function txids(n: number): Hex[] {
  return Array.from({ length: n }, (_, i) => (String(i).padStart(64, "0") as Hex));
}

/**
 * A committed mainnet transaction, re-keyed per txid.
 *
 * THE FIRST DRAFT OF THIS FILE SERVED `{ txid }` AND EVERY ASSERTION IN IT WAS
 * ABOUT SOMETHING ELSE. `rpcTransactionSchema` rejected the stub, so
 * `getRawTransaction` threw `RpcSchemaError` on the FIRST transaction of every
 * drain - which the probes' own catch blocks read as a refusal. A1 then
 * measured three requests instead of twelve, A2 held zero reports instead of
 * two, and A3 published nothing at all. Four red assertions, none of them about
 * the code they named. Recorded rather than quietly repaired (LEDGER-05
 * fold 7), because a mock whose payload the real schema rejects produces
 * exactly the shape of a rate limit and there is no way to tell them apart from
 * the result.
 */
const FIXTURE = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test", "fixtures", "transactions", "ywallet-orchard-only.json"),
    "utf8",
  ),
) as Record<string, unknown>;

function transactionsFor(pool: readonly Hex[]): Record<string, unknown> {
  return Object.fromEntries(pool.map((t) => [t, { ...FIXTURE, txid: t }]));
}

/** The half of `MempoolState` a tick uses, with the same eviction semantics. */
function fakeState() {
  const held = new Set<string>();
  const removed: string[] = [];
  return {
    held,
    removed,
    has: (txid: string) => held.has(txid),
    size: () => held.size,
    reconcile: (current: string[]) => {
      const authoritative = new Set(current);
      for (const txid of [...held]) {
        if (!authoritative.has(txid)) {
          held.delete(txid);
          removed.push(txid);
        }
      }
    },
  };
}

describe("A1 - the loop runs at a 5/minute ceiling and never exceeds it", () => {
  it("issues at most five requests in any window, across four ticks, measured at the ENDPOINT", async () => {
    // THE DATA MUTATION IS THE RUN ITSELF: the exclusion set is "any rolling
    // minute in which a sixth request goes out", and the member the fail side
    // draws from it is the endpoint's own peak. A run that exceeded the ceiling
    // would have `peakInWindow > 5` here, and the mock would also have started
    // answering 429 - two independent witnesses to one violation.
    const pool = txids(20);
    const endpoint = new MockRpcEndpoint({
      mempool: pool,
      transactions: transactionsFor(pool),
    });
    const url = await endpoint.start();
    try {
      const clock = { t: 1_000_000 };
      const gate = new RateGate({
        perMinute: 5,
        now: () => clock.t,
        sleep: (ms) => {
          clock.t += ms;
          return Promise.resolve();
        },
      });
      // THE ENDPOINT IS PUT ON THE GATE'S CLOCK, AND THE FIRST DRAFT WAS NOT.
      // `peakInWindow` reads the `at` the mock stamps each record with; with
      // the mock on `Date.now()` and the gate on a fake clock, twelve requests
      // the gate had correctly spread over three minutes all landed inside one
      // real millisecond and the peak read 12. The probe was measuring two
      // clocks against each other - LEDGER-04a's shape, an instrument whose
      // scope does not match what it is asked about - and the code was right.
      endpoint.setClock(() => clock.t);
      const rpc = new ZebraRpc({ url, retries: 0, gate });
      const plan = planMempoolPoll({ perMinute: 5, requestedIntervalMs: 2_000 });
      // The plan is the arithmetic; assert it here so a later change to the
      // formula cannot silently make this test about a different budget.
      expect(plan.pollIntervalMs).toBe(60_000);
      expect(plan.txBudget).toBe(3);
      expect(plan.txPerMinute).toBe(3);

      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne: async (txid) => {
          await rpc.getRawTransaction(txid);
          state.held.add(txid);
          return "analysed" as AnalyzeOutcome;
        },
        plan,
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: 5,
        now: () => clock.t,
      });

      for (let i = 0; i < 4; i += 1) await ticker.tick();

      // NEVER EXCEEDED, ON THE ENDPOINT'S OWN COUNT.
      expect(endpoint.peakInWindow(60_000)).toBeLessThanOrEqual(5);
      // AND IT RAN: four ticks of two overhead plus three transactions each.
      expect(endpoint.records.every((r) => r.status === 200)).toBe(true);
      expect(state.held.size).toBe(12);
      expect(published).toHaveLength(4);
      // AND IT SAYS SO: twenty in the pool, twelve analysed, never complete.
      expect(published[3]?.observed).toBe(20);
      expect(published[3]?.analysed).toBe(12);
      expect(published[3]?.complete).toBe(false);
      expect(published[3]?.completeAtMs).toBeNull();
      expect(published[3]?.txPerMinute).toBe(3);
    } finally {
      await endpoint.stop();
    }
  });

  it("FAIL SIDE: the same run with the gate removed exceeds the ceiling and the endpoint refuses", async () => {
    // The member of the exclusion set, produced deliberately. Without the gate
    // the loop asks as fast as it can; the mock's own ceiling then refuses, and
    // the peak is above five. If this test ever goes green with the gate
    // removed, A1's positive result was never evidence (LEDGER-05 fold 7).
    const pool = txids(20);
    const endpoint = new MockRpcEndpoint({
      mempool: pool,
      transactions: transactionsFor(pool),
      perMinute: 5,
    });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const plan = planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 });
      const state = fakeState();
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne: async (txid) => {
          // NARROWED TO THE REFUSAL. A bare `catch` here reads every failure as
          // a rate limit, which is how the first draft turned a schema error
          // into four assertions about the wrong thing.
          try {
            await rpc.getRawTransaction(txid);
          } catch (err) {
            if (err instanceof RpcRateLimitError) return "rate-limited" as AnalyzeOutcome;
            throw err;
          }
          state.held.add(txid);
          return "analysed" as AnalyzeOutcome;
        },
        plan,
        publish: () => Promise.resolve(),
        onTip: () => undefined,
        log,
        ceilingPerMinute: null,
      });
      await ticker.tick();
      expect(endpoint.peakInWindow(60_000)).toBeGreaterThan(5);
      expect(endpoint.records.some((r) => r.status === 429)).toBe(true);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("A2 - a 429 mid-drain backs off and resumes without losing or duplicating a report", () => {
  it("429s on request 3 of 8 and the drain completes across two ticks with the same set", async () => {
    // The mock refuses the FIFTH request overall, which is the third
    // transaction fetch: requests 1 and 2 are the tick's overhead. Placed by
    // ordinal so the refusal lands mid-drain with budget still available -
    // which is a different condition from an exhausted budget, and the reason
    // `refuseAt` exists beside `perMinute`.
    const pool = txids(8);
    const endpoint = new MockRpcEndpoint({
      mempool: pool,
      transactions: transactionsFor(pool),
      refuseAt: [5],
    });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const plan = planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 });
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const analyzeOne = async (txid: Hex): Promise<AnalyzeOutcome> => {
        try {
          await rpc.getRawTransaction(txid);
        } catch (err) {
          if (err instanceof RpcRateLimitError) return "rate-limited";
          throw err;
        }
        state.held.add(txid);
        return "analysed";
      };
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne,
        plan,
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: null,
      });

      await ticker.tick();
      // Two analysed, then refused. The tick stopped rather than spending the
      // remaining five fetches on requests it had just been told to stop making.
      expect(state.held.size).toBe(2);
      expect(published[0]?.refused).toBe(true);
      expect(published[0]?.complete).toBe(false);
      // AND NOTHING WAS EVICTED. `reconcile` ran against the node's full list,
      // not against the two that were fetched - the "re-enters a mutated state"
      // failure, which would have removed both and published a removal for each.
      expect(state.removed).toEqual([]);

      await ticker.tick();
      expect(state.held.size).toBe(8);
      expect([...state.held].sort()).toEqual([...pool].sort());
      expect(published[1]?.complete).toBe(true);
      expect(published[1]?.completeAtMs).not.toBeNull();
      // NO DUPLICATE: eight distinct txids for eight transactions, and the
      // second tick refetched only the six it had not seen.
      const fetched = endpoint.records.filter((r) => r.method === "getrawtransaction" && r.status === 200);
      expect(fetched).toHaveLength(8);
      expect(new Set(fetched.map((r) => String(r.params[0]))).size).toBe(8);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("A3 - a partial drain is a NAMED partial", () => {
  it("publishes N of M when the budget runs out, and stops saying partial when it does not", async () => {
    const pool = txids(9);
    const endpoint = new MockRpcEndpoint({
      mempool: pool,
      transactions: transactionsFor(pool),
    });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const mk = (plan: ReturnType<typeof planMempoolPoll>) =>
        new MempoolTicker({
          rpc,
          state,
          analyzeOne: async (txid) => {
            await rpc.getRawTransaction(txid);
            state.held.add(txid);
            return "analysed" as AnalyzeOutcome;
          },
          plan,
          publish: (d) => {
            published.push(d);
            return Promise.resolve();
          },
          onTip: () => undefined,
          log,
          ceilingPerMinute: null,
        });

      // THE PARTIAL POLARITY. A budget of 3 over a mempool of 9.
      await mk({
        pollIntervalMs: 60_000,
        txBudget: 3,
        overheadPerTick: 2,
        txPerMinute: 3,
        metered: true,
      }).tick();
      expect(published[0]?.observed).toBe(9);
      expect(published[0]?.analysed).toBe(3);
      expect(published[0]?.deferred).toBe(6);
      expect(published[0]?.complete).toBe(false);
      expect(published[0]?.completeAtMs).toBeNull();

      // THE COMPLETE POLARITY, on the same state. `complete` must flip and
      // `deferred` must reach zero: an assertion that only ever saw the partial
      // side could be satisfied by a field hardcoded to false.
      await mk(planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 })).tick();
      const last = published[published.length - 1];
      expect(last?.observed).toBe(9);
      expect(last?.analysed).toBe(9);
      expect(last?.deferred).toBe(0);
      expect(last?.complete).toBe(true);
      expect(last?.completeAtMs).not.toBeNull();
    } finally {
      await endpoint.stop();
    }
  });
});

describe("A8 - with no database, every database-derived quantity is an absence", () => {
  it("resolves an unknown anchor to null and NEVER to zero", async () => {
    // THE MEMBER OF THE EXCLUSION SET IS A ZERO. A depth of zero is the
    // strongest claim this analyser can make about a spend - that its anchor is
    // the tip - and manufacturing it out of a table nobody read is the
    // absence-versus-zero rule's worst case. `null` is the required answer and
    // `leak-analyzer.ts` renders it as an unknown depth graded LOW.
    const height = await NO_CHAIN_WRITES.anchors.getHeightForAnchor("f".repeat(64));
    expect(height).toBeNull();
    expect(height).not.toBe(0);
  });

  it("persists nothing, resolves anyway, and offers no reorg hooks", async () => {
    // `persist` must RESOLVE rather than throw: a report that could not be
    // filed is not a report that could not be published, and turning the first
    // into the second would take the live view down to protect a history
    // nobody asked for.
    await expect(
      NO_CHAIN_WRITES.persist({ txid: "a".repeat(64) } as never),
    ).resolves.toBeUndefined();
    // The two follower-only hooks are null rather than no-ops, because a
    // process with no store never applies a block or resolves a reorg, and a
    // silent no-op would hide a caller that thought it did.
    expect(NO_CHAIN_WRITES.forgetAnchorsAbove).toBeNull();
    expect(NO_CHAIN_WRITES.recordAnchor).toBeNull();
  });
});

describe("a refusal on the tick's OWN OVERHEAD still publishes", () => {
  it("does not leave the last successful tick's complete:true standing", async () => {
    // THE DEFECT: `publish` sits inside the try, above the throw point, so a
    // 429 on `getblockchaininfo` fell to the catch and wrote NOTHING. The
    // gateway then re-aged the last successful record on every request, and a
    // quiet mempool followed by an endpoint refusing every call had /track
    // rendering `data-complete="true"` with "4 of 4 analysed - every
    // transaction the node reported has been analysed" while the real mempool
    // was unreachable. No test drove this: A2 places its refusal at the third
    // TRANSACTION, never at the overhead. Found by a gate reviewer.
    const pool = txids(4);
    const endpoint = new MockRpcEndpoint({ mempool: pool, transactions: transactionsFor(pool) });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne: async (txid) => {
          await rpc.getRawTransaction(txid);
          state.held.add(txid);
          return "analysed" as AnalyzeOutcome;
        },
        plan: planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 }),
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: 5,
      });

      // Tick 1 succeeds on a quiet mempool and is genuinely complete.
      await ticker.tick();
      expect(published[0]?.complete).toBe(true);
      expect(published[0]?.analysed).toBe(4);

      // The endpoint now refuses everything, so tick 2 dies on its first call.
      endpoint.refuseFrom(endpoint.requestCount + 1);
      await ticker.tick();

      // A SECOND RECORD EXISTS, and it withdraws the claim of completeness.
      expect(published).toHaveLength(2);
      expect(published[1]?.complete).toBe(false);
      expect(published[1]?.refused).toBe(true);
      // The denominator is the last one a node gave us, not a fabricated zero:
      // "0 of 0 analysed" would read as an empty mempool.
      expect(published[1]?.observed).toBe(4);
      expect(published[1]?.analysed).toBe(4);
      // `completeAtMs` does NOT move - the last COMPLETE drain really was tick
      // 1 - while `updatedAtMs` does, so "last tick" stays truthful about the
      // attempt rather than about its success.
      expect(published[1]?.completeAtMs).toBe(published[0]?.completeAtMs);
      expect(published[1]?.updatedAtMs).toBeGreaterThanOrEqual(published[0]!.updatedAtMs);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("the counts account for every row", () => {
  it("a refusal mid-drain: deferred + failed === observed - analysed", async () => {
    // THE MEMBER OF THE EXCLUSION SET. `deferred` was computed from the budget
    // slice BEFORE the loop, so an unmetered tick that a 429 stopped at the
    // third of eight published `deferred: 0` - six transactions in no bucket at
    // all, on the wire, in the field whose whole job is saying how many are
    // missing. A2 asserted `refused` and `complete` and never `deferred`, which
    // is why it read as green.
    const pool = txids(8);
    const endpoint = new MockRpcEndpoint({
      mempool: pool,
      transactions: transactionsFor(pool),
      refuseAt: [5],
    });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne: async (txid) => {
          try {
            await rpc.getRawTransaction(txid);
          } catch (err) {
            if (err instanceof RpcRateLimitError) return "rate-limited" as AnalyzeOutcome;
            throw err;
          }
          state.held.add(txid);
          return "analysed" as AnalyzeOutcome;
        },
        plan: planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 }),
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: null,
      });
      await ticker.tick();
      const d = published[0];
      expect(d?.analysed).toBe(2);
      expect(d?.deferred).toBe(6);
      expect(d?.failed).toBe(0);
      expect((d?.deferred ?? 0) + (d?.failed ?? 0)).toBe((d?.observed ?? 0) - (d?.analysed ?? 0));
    } finally {
      await endpoint.stop();
    }
  });

  it("a decode failure is counted as failed, not as deferred, and not as analysed", async () => {
    // `analyzeOne` returning "failed" was never driven by any probe in this
    // branch - all of them returned only "analysed" or "rate-limited" - so the
    // path where a drain can never complete on its own was unexercised.
    const pool = txids(5);
    const endpoint = new MockRpcEndpoint({ mempool: pool, transactions: transactionsFor(pool) });
    const url = await endpoint.start();
    try {
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const bad = new Set([pool[0], pool[1]]);
      const ticker = new MempoolTicker({
        rpc: new ZebraRpc({ url, retries: 0 }),
        state,
        analyzeOne: (txid) => {
          if (bad.has(txid)) return Promise.resolve("failed" as AnalyzeOutcome);
          state.held.add(txid);
          return Promise.resolve("analysed" as AnalyzeOutcome);
        },
        plan: planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 }),
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: null,
      });
      await ticker.tick();
      const d = published[0];
      expect(d?.observed).toBe(5);
      expect(d?.analysed).toBe(3);
      expect(d?.failed).toBe(2);
      expect(d?.deferred).toBe(0);
      expect(d?.complete).toBe(false);
      expect((d?.deferred ?? 0) + (d?.failed ?? 0)).toBe((d?.observed ?? 0) - (d?.analysed ?? 0));
    } finally {
      await endpoint.stop();
    }
  });
});

describe("the drain state the ticker PRODUCES is the one the gateway VALIDATES", () => {
  it("round-trips through JSON into mempoolDrainStateSchema, every field intact", async () => {
    // LEDGER-11's INSTRUMENT, APPLIED TO A NEW SEAM. Two processes, one wire
    // form: the indexer writes this document to Redis and the gateway reads it.
    // Both sides have tests, and this project's four seam defects all lived in
    // the gap where each side built its own input. So the REAL ticker produces
    // the value, it goes through the REAL `JSON.stringify` a Redis SET does,
    // and the REAL schema the gateway parses with reads it back.
    const pool = txids(4);
    const endpoint = new MockRpcEndpoint({
      mempool: pool,
      transactions: transactionsFor(pool),
    });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne: async (txid) => {
          await rpc.getRawTransaction(txid);
          state.held.add(txid);
          return "analysed" as AnalyzeOutcome;
        },
        plan: planMempoolPoll({ perMinute: 5, requestedIntervalMs: 2_000 }),
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: 5,
      });
      await ticker.tick();

      const onTheWire: unknown = JSON.parse(JSON.stringify(published[0]));
      const parsed = mempoolDrainStateSchema.safeParse(onTheWire);
      // A FAILURE HERE IS THE SEAM DEFECT ITSELF, so the issue path is surfaced
      // rather than left as a bare false.
      expect(parsed.success ? null : parsed.error.issues).toBeNull();
      expect(parsed.success && parsed.data).toEqual(published[0]);
    } finally {
      await endpoint.stop();
    }
  });

  it("and a NEVER-COMPLETE drain survives the same round trip with its null intact", async () => {
    // The nullable field is the one a schema is most likely to disagree about,
    // and `completeAtMs: null` is the value that must not become 0 anywhere on
    // the path. The tick above is partial by construction - a budget of 3
    // against a mempool of 4 - so this is the state it actually produces.
    const pool = txids(4);
    const endpoint = new MockRpcEndpoint({ mempool: pool, transactions: transactionsFor(pool) });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const state = fakeState();
      const published: MempoolDrainState[] = [];
      const ticker = new MempoolTicker({
        rpc,
        state,
        analyzeOne: async (txid) => {
          await rpc.getRawTransaction(txid);
          state.held.add(txid);
          return "analysed" as AnalyzeOutcome;
        },
        plan: planMempoolPoll({ perMinute: 5, requestedIntervalMs: 2_000 }),
        publish: (d) => {
          published.push(d);
          return Promise.resolve();
        },
        onTip: () => undefined,
        log,
        ceilingPerMinute: 5,
      });
      await ticker.tick();
      expect(published[0]?.complete).toBe(false);
      expect(published[0]?.completeAtMs).toBeNull();
      const parsed = mempoolDrainStateSchema.parse(JSON.parse(JSON.stringify(published[0])));
      expect(parsed.completeAtMs).toBeNull();
      expect(parsed.completeAtMs).not.toBe(0);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("the tick is non-reentrant", () => {
  it("skips an interval whose predecessor is still running rather than overlapping it", async () => {
    // Two ticks in flight against a ceiling both spend the budget, both get
    // refused, and the refusals extend the window that made them slow. Before
    // HANDOFF-15 `setInterval` did not await the callback and this was live.
    // `Promise` EXECUTORS RUN SYNCHRONOUSLY, so `release` is assigned before
    // the constructor returns. Captured through a holder rather than a
    // reassigned `let`, because TypeScript's control-flow analysis cannot see
    // into the executor and narrows the variable to `null` at every later read
    // - which vitest ran happily and `tsc --noEmit` rejected.
    const holder: { resolve: () => void } = { resolve: () => undefined };
    const blocked = new Promise<void>((r) => {
      holder.resolve = r;
    });
    const state = fakeState();
    const ticker = new MempoolTicker({
      rpc: {
        getBlockchainInfo: async () => {
          await blocked;
          return { blocks: 1 };
        },
        getRawMempool: () => Promise.resolve([]),
      },
      state,
      analyzeOne: () => Promise.resolve("analysed" as AnalyzeOutcome),
      plan: planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 }),
      publish: () => Promise.resolve(),
      onTip: () => undefined,
      log,
      ceilingPerMinute: null,
    });

    const first = ticker.tick();
    // One microtask turn is enough for `tick()` to reach its first `await`;
    // `vi.waitFor` gives it as many as it needs without a real sleep.
    await vi.waitFor(() => {
      expect(typeof holder.resolve).toBe("function");
    });
    expect(await ticker.tick()).toBe("skipped");
    holder.resolve();
    expect(await first).toBe("ran");
    // And once the first finishes, the next one runs rather than being stuck.
    expect(await ticker.tick()).toBe("ran");
  });
});
