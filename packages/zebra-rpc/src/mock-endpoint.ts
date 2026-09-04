/**
 * A local stand-in for a rate-limited third-party Zcash RPC endpoint.
 *
 * WHY A REAL SERVER RATHER THAN A `FetchLike` DOUBLE. `client.ts` already
 * accepts an injected `fetch`, and for a schema or a retry test that is the
 * right instrument. It is the wrong one here, for the reason LEDGER-11 records
 * about seams: a double returns whatever its author believed the wire carries,
 * and this handoff is about a wire behaviour - an HTTP status and a header -
 * that no double can be wrong about in a way its author would notice. A 429 has
 * to arrive as a 429, with `Retry-After` present or absent, through undici,
 * or the two polarities of A2 are evidence about a fixture.
 *
 * WHAT IT SERVES. The three methods the mempool path calls -
 * `getblockchaininfo`, `getrawmempool` and `getrawtransaction` - and, since
 * HANDOFF-16, the three the CONFIRMED-BLOCK path calls: `getblock`,
 * `getblockheader` and `z_gettreestate`. That is six, and it is every wire
 * method this stack sends outside the address index. An unknown method answers
 * with a JSON-RPC error object rather than a 404, because that is what a real
 * node does and a client that treats the two the same has a bug this mock
 * should be able to show.
 *
 * AND A METHOD IT COULD SERVE CAN BE MADE ABSENT, WHICH IS THE POINT OF
 * `absentMethods`. `z_gettreestate` is missing from the keyless public gateway
 * this project measured, and "missing" is a fact about an ENDPOINT rather than
 * about this mock's feature list. Modelling it by leaving the method
 * unimplemented would make every fail side about it a CODE mutation of the
 * mock; `absentMethods` makes it a DATA mutation - a value drawn from the set
 * "endpoints that do not serve this method" - which is what LEDGER-09a Q2
 * requires of at least one fail side per assertion.
 *
 * HOW IT REFUSES. Two independent controls, deliberately not one:
 *   - `perMinute`   an automatic ceiling. Past it every request is 429, and the
 *                   window rolls, so the mock refuses on exactly the shape the
 *                   measurement in HANDOFF-15 section 1 recorded: five 200s,
 *                   then 429 for every request from the sixth on.
 *   - `refuseAt`    a set of 1-based request ordinals that are 429 whatever the
 *                   ceiling says. This is what "told to 429 on demand" means in
 *                   deliverable 5, and it is what makes A2's "429 on request 3
 *                   of 8" a data mutation rather than a code one.
 * A test that used only the first could not place a refusal mid-drain without
 * also exhausting the budget, and the two conditions are not the same thing.
 *
 * NOT A NODE. It serves fixtures, it does not model a chain. Every quantity it
 * returns is whatever the caller handed it.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** One line of the mock's own record of what it was asked. */
export interface MockRequestRecord {
  /** 1-based, in arrival order, counting refusals. */
  readonly ordinal: number;
  readonly method: string;
  readonly params: readonly unknown[];
  /** The status this request was answered with. */
  readonly status: number;
  /** `Date.now()` at the moment the response was written. */
  readonly at: number;
}

export interface MockEndpointOptions {
  /**
   * The result for `getblockchaininfo`. Passed through verbatim.
   *
   * A caller that wants the client's schema to reject something supplies
   * something the schema rejects; this mock does not validate on the way out,
   * because a mock that could only emit valid results could not test the
   * branch that handles invalid ones.
   */
  readonly blockchainInfo?: unknown;
  /** The txid list `getrawmempool` returns. Mutable through `setMempool`. */
  readonly mempool?: readonly string[];
  /** txid to the `getrawtransaction` result for it. Missing txid answers -5. */
  readonly transactions?: Readonly<Record<string, unknown>>;
  /**
   * An automatic ceiling. Undefined means unmetered.
   *
   * Counted over a rolling window exactly as `RateGate` counts, so that a test
   * asserting "the client never exceeds the ceiling" is checked by an
   * independent implementation of the same rule rather than by the one under
   * test.
   */
  readonly perMinute?: number;
  /** Window for `perMinute`, in ms. */
  readonly windowMs?: number;
  /** 1-based request ordinals to refuse with 429 regardless of the ceiling. */
  readonly refuseAt?: Iterable<number>;
  /**
   * The BODY a refusal carries. FOUR real shapes, and the client must classify
   * all four as a refusal.
   *
   * THE DEFAULT IS THE ENVELOPE, NOT THE BARE STRING, AND THAT CHANGE IS THE
   * WHOLE REASON THIS OPTION EXISTS. The first version answered
   * `{error: "rate limited"}` - `error` as a STRING, which fails
   * `envelopeSchema`'s `z.object(...)`. That made it the one 429 body in
   * existence that skipped the client's error-object branch, so the single
   * shape the whole suite drove was the shape that dodged the collision by
   * accident, and a real gateway's envelope was classified as `RpcError` with
   * the gate never penalised. A fail side chosen - unknowingly - to pass.
   */
  readonly refusalBody?: "envelope" | "bare" | "html" | "gateway";
  /**
   * What to put in `Retry-After` on a refusal, or null to omit the header.
   *
   * NULL IS THE DEFAULT BECAUSE OMISSION IS THE COMMON CASE. RFC 9110 does not
   * require the header on a 429 and the measured Tatum endpoint does not send
   * one, so a mock that always sent it would make the client's null branch -
   * the live one - the untested one.
   */
  readonly retryAfter?: string | null;
  readonly now?: () => number;
  /**
   * `getblock` results by HEIGHT. Passed through verbatim, like `blockchainInfo`.
   *
   * BY HEIGHT AND NOT BY HASH, because that is the selector the confirmed-block
   * driver sends: `getBlock({height})` is every call `ChainFollower.step` makes
   * and `bootstrapChain` makes. A mock keyed by hash would answer a selector
   * this stack never sends.
   */
  readonly blocks?: Readonly<Record<string, unknown>>;
  /** `getblockheader` results by hash. A missing hash answers -5, as a node does. */
  readonly blockHeaders?: Readonly<Record<string, unknown>>;
  /** `z_gettreestate` results by hash. A missing hash answers -5. */
  readonly treestates?: Readonly<Record<string, unknown>>;
  /**
   * The `getinfo` result. Undefined means the endpoint does not serve `getinfo`.
   *
   * ABSENT BY DEFAULT, DELIBERATELY. Nothing in this stack calls `getinfo` -
   * `checkZebraVersionFloor` has no production caller in the tree, which the
   * HANDOFF-16 session measured - so a mock that served it by default would make
   * the preflight's version row pass on every endpoint and the ABSENT arm of
   * that row unreachable.
   */
  readonly info?: unknown;
  /**
   * Wire method names this endpoint does NOT serve, answered `-32601` even
   * where a fixture for them exists.
   *
   * THIS IS WHAT MAKES "THE ENDPOINT IS MISSING A METHOD" A DATA MUTATION.
   * See the module header. The measured keyless gateway serves six of the seven
   * client methods this stack calls and refuses `z_gettreestate`; that is a
   * property of the ENDPOINT, so it is configured on the endpoint rather than
   * modelled by deleting a case from the switch below.
   */
  readonly absentMethods?: Iterable<string>;
}

export class MockRpcEndpoint {
  #server: Server | null = null;
  #url = "";
  #ordinal = 0;
  #issued: number[] = [];
  #records: MockRequestRecord[] = [];
  #mempool: string[];
  #transactions: Record<string, unknown>;
  #blockchainInfo: unknown;
  #blocks: Record<string, unknown>;
  #blockHeaders: Record<string, unknown>;
  #treestates: Record<string, unknown>;
  #info: unknown;
  readonly #absentMethods: Set<string>;
  readonly #perMinute: number | undefined;
  readonly #windowMs: number;
  readonly #refuseAt: Set<number>;
  #refuseFrom = Number.POSITIVE_INFINITY;
  readonly #retryAfter: string | null;
  readonly #refusalBody: "envelope" | "bare" | "html" | "gateway";
  #clock: () => number;

  constructor(opts: MockEndpointOptions = {}) {
    this.#blockchainInfo = opts.blockchainInfo ?? {
      chain: "main",
      blocks: 3_470_960,
      bestblockhash: "0000000000301fe326bd00000000000000000000000000000000000000000000",
    };
    this.#mempool = [...(opts.mempool ?? [])];
    this.#blocks = { ...(opts.blocks ?? {}) };
    this.#blockHeaders = { ...(opts.blockHeaders ?? {}) };
    this.#treestates = { ...(opts.treestates ?? {}) };
    this.#info = opts.info;
    this.#absentMethods = new Set(opts.absentMethods ?? []);
    this.#transactions = { ...(opts.transactions ?? {}) };
    this.#perMinute = opts.perMinute;
    this.#windowMs = opts.windowMs ?? 60_000;
    this.#refuseAt = new Set(opts.refuseAt ?? []);
    this.#retryAfter = opts.retryAfter ?? null;
    this.#refusalBody = opts.refusalBody ?? "envelope";
    this.#clock = opts.now ?? Date.now;
  }

  /** `http://127.0.0.1:<port>/`, valid only while listening. */
  get url(): string {
    return this.#url;
  }

  /** Every request this mock has answered, in order. */
  get records(): readonly MockRequestRecord[] {
    return this.#records;
  }

  /** How many requests arrived, refusals included. */
  get requestCount(): number {
    return this.#ordinal;
  }

  /**
   * The largest number of requests that arrived inside any window.
   *
   * THE ASSERTION A1 IS WRITTEN AGAINST. "The loop never exceeds the ceiling"
   * is a statement about the endpoint's view, so it is measured here rather
   * than by asking the gate what it thinks it did.
   */
  peakInWindow(windowMs = this.#windowMs): number {
    let peak = 0;
    for (let i = 0; i < this.#records.length; i += 1) {
      const start = this.#records[i]?.at;
      if (start === undefined) continue;
      let n = 0;
      for (let j = i; j < this.#records.length; j += 1) {
        const at = this.#records[j]?.at;
        if (at === undefined) continue;
        if (at - start < windowMs) n += 1;
      }
      if (n > peak) peak = n;
    }
    return peak;
  }

  /**
   * Put the mock on someone else's clock.
   *
   * NEEDED BECAUSE `peakInWindow` IS A MEASUREMENT AND A MEASUREMENT NEEDS ONE
   * CLOCK. A test driving a `RateGate` on a fake clock while the mock stamps
   * `Date.now()` is comparing two timelines: requests the gate correctly spread
   * over three minutes all land inside one real millisecond, and the peak reads
   * the total. That happened on this method's first outing, in HANDOFF-15's own
   * A1 probe, and it looked exactly like the gate failing to hold.
   */
  setClock(now: () => number): void {
    this.#clock = now;
  }

  /**
   * Refuse every request from this ordinal on.
   *
   * `refuseAt` PLACES INDIVIDUAL REFUSALS AND THIS ONE FLIPS THE ENDPOINT
   * HOSTILE, which is a different condition: a test that needs "the endpoint
   * now refuses everything" would otherwise have to enumerate every future
   * ordinal, and would silently stop refusing when the count ran past the list.
   */
  refuseFrom(ordinal: number): void {
    this.#refuseFrom = ordinal;
  }

  /** Replace the mempool the mock serves, so a test can evict or add. */
  setMempool(txids: readonly string[]): void {
    this.#mempool = [...txids];
  }

  /** Add or replace one transaction result. */
  setTransaction(txid: string, result: unknown): void {
    this.#transactions[txid] = result;
  }

  /** Replace the `getblockchaininfo` result. */
  setBlockchainInfo(info: unknown): void {
    this.#blockchainInfo = info;
  }

  /** Add or replace one `getblock` result, keyed by height. */
  setBlock(height: number, result: unknown): void {
    this.#blocks[String(height)] = result;
  }

  /** Add or replace one `getblockheader` result, keyed by hash. */
  setBlockHeader(hash: string, result: unknown): void {
    this.#blockHeaders[hash] = result;
  }

  /** Replace the `getinfo` result. `undefined` makes the method absent again. */
  setInfo(info: unknown): void {
    this.#info = info;
  }

  /** Add or replace one `z_gettreestate` result, keyed by hash. */
  setTreestate(hash: string, result: unknown): void {
    this.#treestates[hash] = result;
  }

  /**
   * Make a method absent, or present again.
   *
   * A SETTER AS WELL AS AN OPTION, because A3's fail side wants an endpoint that
   * serves a method and then stops - the shape an operator meets when a gateway
   * changes plan under them - and constructing a second mock would change the
   * port as well as the answer.
   */
  setMethodAbsent(method: string, absent = true): void {
    if (absent) this.#absentMethods.add(method);
    else this.#absentMethods.delete(method);
  }

  async start(): Promise<string> {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer | string) => {
        body += String(chunk);
      });
      req.on("end", () => {
        this.#answer(body, res);
      });
    });
    this.#server = server;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const addr = server.address() as AddressInfo;
    this.#url = `http://127.0.0.1:${String(addr.port)}/`;
    return this.#url;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    if (server === null) return;
    this.#server = null;
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  #overCeiling(now: number): boolean {
    if (this.#perMinute === undefined) return false;
    const cutoff = now - this.#windowMs;
    this.#issued = this.#issued.filter((t) => t > cutoff);
    return this.#issued.length >= this.#perMinute;
  }

  #answer(body: string, res: import("node:http").ServerResponse): void {
    const now = this.#clock();
    this.#ordinal += 1;
    const ordinal = this.#ordinal;

    let method = "";
    let params: readonly unknown[] = [];
    let id: unknown = null;
    try {
      const parsed = JSON.parse(body) as { method?: unknown; params?: unknown; id?: unknown };
      method = typeof parsed.method === "string" ? parsed.method : "";
      params = Array.isArray(parsed.params) ? (parsed.params as unknown[]) : [];
      id = parsed.id ?? null;
    } catch {
      method = "";
    }

    const record = (status: number): void => {
      this.#records.push({ ordinal, method, params, status, at: now });
    };

    // THE REFUSAL DECISION COMES BEFORE THE METHOD SWITCH AND BEFORE THE
    // BUDGET IS SPENT. A refused request costs the caller a slot at the
    // endpoint's own count - that is what a rate limiter is - but it must not
    // count towards OUR window twice, so `#issued` is only pushed on a served
    // request and `#overCeiling` reads the served ones. The explicit `refuseAt`
    // is checked first so a test can place a refusal inside a budget that has
    // room, which is the case A2 is about.
    if (ordinal >= this.#refuseFrom || this.#refuseAt.has(ordinal) || this.#overCeiling(now)) {
      record(429);
      const html = this.#refusalBody === "html";
      const headers: Record<string, string> = {
        "Content-Type": html ? "text/html" : "application/json",
      };
      if (this.#retryAfter !== null) headers["Retry-After"] = this.#retryAfter;
      res.writeHead(429, headers);
      // THE THREE REAL SHAPES, and the client must read all three as a refusal.
      //   envelope  a gateway that wraps its limiter in JSON-RPC. This is the
      //             default because it is the common one and because it is the
      //             one that used to be misclassified as `RpcError`.
      //   html      a Cloudflare challenge page. `JSON.parse` throws on it, and
      //             that throw used to produce a bare `Error` retried on the
      //             transport policy - three requests of a five-request minute.
      //   bare      the original `{error: "<string>"}`, kept precisely because
      //             it is the shape that PASSED by accident: it fails
      //             `envelopeSchema`, so it skipped the collision. Keeping it
      //             lets a test show that the fix did not merely move the
      //             accident somewhere else.
      if (html) {
        res.end("<html><head><title>429</title></head><body>rate limited</body></html>");
      } else if (this.#refusalBody === "bare") {
        res.end(JSON.stringify({ error: "rate limited" }));
      } else if (this.#refusalBody === "gateway") {
        // THE FOURTH SHAPE, AND IT IS THE ONE THE MEASURED ENDPOINT ACTUALLY
        // SENDS (F-57-1, HANDOFF-16). It carries NEITHER `result` NOR `error`:
        // `envelopeSchema` is `.passthrough()` over two optional fields, so this
        // body PARSES and then takes neither the error-object branch nor the
        // parse-failure branch. That is a THIRD escape route from the pre-fix
        // ordering, distinct from both shapes gate round 3 found, and the only
        // reason it is not a live defect is that `#once` now decides on the
        // STATUS before it reads the body at all.
        //
        // ITS CONTENT IS RELAYED, NOT CAPTURED HERE, AND THAT IS STATED RATHER
        // THAN GLOSSED. L2 captured it from the live endpoint on 4 September
        // 2026; the session that added it could not reach that endpoint or any
        // of five others (every one refused at CONNECT with 403 by this
        // container's egress proxy), so the SHAPE below is L2's measurement and
        // this file is a transcription of it. What IS measured here is the
        // property that matters and it is measured by execution: the test beside
        // this mock drives this exact body through the real `envelopeSchema` and
        // shows it parsing into neither branch. F-57-1 asks for a capture; where
        // the wire is unreachable, the honest form is a relayed capture whose
        // discriminating BEHAVIOUR is re-measured locally.
        res.end(
          JSON.stringify({
            statusCode: 429,
            message:
              "You have exceeded your limit of 5 requests per minute. To increase this limit, upgrade to a Paid plan with 200 requests per second...",
          }),
        );
      } else {
        res.end(
          JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32005, message: "rate limit exceeded" } }),
        );
      }
      return;
    }

    this.#issued.push(now);
    record(200);
    res.writeHead(200, { "Content-Type": "application/json" });

    const ok = (result: unknown): void => {
      res.end(JSON.stringify({ jsonrpc: "1.0", id, result, error: null }));
    };
    const rpcError = (code: number, message: string): void => {
      res.end(JSON.stringify({ jsonrpc: "1.0", id, result: null, error: { code, message } }));
    };

    // ABSENCE IS DECIDED BEFORE THE SWITCH, so a method with a fixture behind it
    // still answers `-32601` when the endpoint is configured not to serve it.
    // Placed here rather than inside each case so a method added below cannot
    // forget to honour it.
    if (this.#absentMethods.has(method)) {
      rpcError(-32601, `Method not found: ${method}`);
      return;
    }

    switch (method) {
      case "getblockchaininfo":
        ok(this.#blockchainInfo);
        return;
      case "getrawmempool":
        // verbose=true is the shape `/v2/mempool` asks for; the client sends
        // `[true]` for it and `[false]` for the id list, and answering the same
        // shape to both is how a mock hides a real client defect.
        if (params[0] === true) {
          const verbose: Record<string, { size: number }> = {};
          for (const txid of this.#mempool) verbose[txid] = { size: 1_024 };
          ok(verbose);
          return;
        }
        ok([...this.#mempool]);
        return;
      case "getrawtransaction": {
        const txid = typeof params[0] === "string" ? params[0] : "";
        const tx = this.#transactions[txid];
        if (tx === undefined) {
          // The real message, because a caller that greps for it should find it.
          rpcError(-5, "No such mempool or main chain transaction. Use -txindex to enable blockchain transaction queries.");
          return;
        }
        ok(tx);
        return;
      }
      case "getinfo":
        if (this.#info === undefined) {
          rpcError(-32601, "Method not found: getinfo");
          return;
        }
        ok(this.#info);
        return;
      case "getblock": {
        // THE SELECTOR IS `[height, 2]` AND BOTH HALVES ARE READ. A gateway
        // serving verbosity 1 and refusing 2 is an endpoint this stack cannot
        // use, and a mock that ignored the verbosity could not show that.
        const selector = params[0];
        const verbosity = params[1];
        if (verbosity !== 2) {
          rpcError(-8, `this endpoint serves getblock at verbosity 2 only; asked for ${String(verbosity)}`);
          return;
        }
        const key = typeof selector === "string" || typeof selector === "number" ? String(selector) : "";
        const block = this.#blocks[key];
        if (block === undefined) {
          rpcError(-8, "Block height out of range.");
          return;
        }
        ok(block);
        return;
      }
      case "getblockheader": {
        const hash = typeof params[0] === "string" ? params[0] : "";
        const header = this.#blockHeaders[hash];
        if (header === undefined) {
          rpcError(-5, "Block not found.");
          return;
        }
        ok(header);
        return;
      }
      case "z_gettreestate": {
        // THE SELECTOR IS A BARE STRING - a hash or a height - because that is
        // what `getTreestate` sends: `this.call("z_gettreestate", [selector], ...)`
        // where the selector is `id.hash` or `String(id.height)`.
        const key = typeof params[0] === "string" || typeof params[0] === "number" ? String(params[0]) : "";
        const treestate = this.#treestates[key];
        if (treestate === undefined) {
          rpcError(-5, "Block not found.");
          return;
        }
        ok(treestate);
        return;
      }
      default:
        rpcError(-32601, `Method not found: ${method}`);
        return;
    }
  }
}

/**
 * Run the mock from a terminal, so an operator can point a real indexer at it.
 *
 * `node --import tsx packages/zebra-rpc/src/mock-endpoint.ts` - or
 * `pnpm --filter @zcashreveal/indexer mock:rpc`, which is the same thing with
 * the flags remembered. Reads three optional environment variables:
 *   MOCK_RPC_PER_MINUTE   the ceiling to enforce. Unset means unmetered.
 *   MOCK_RPC_REFUSE_AT    comma-separated 1-based ordinals to refuse.
 *   MOCK_RPC_RETRY_AFTER  the header value to send on a refusal. Unset omits it.
 *
 * GUARDED SO AN IMPORT NEVER STARTS A SERVER. `import.meta.url` is compared
 * against `process.argv[1]`, which is the only reliable "am I the entry point"
 * test in ESM; a bare top-level `start()` would open a socket in every test
 * file that imports the class.
 */
async function runFromCli(): Promise<void> {
  const perMinuteRaw = process.env["MOCK_RPC_PER_MINUTE"];
  const refuseRaw = process.env["MOCK_RPC_REFUSE_AT"];
  // `exactOptionalPropertyTypes` IS ON, so "the key is absent" and "the key is
  // present holding undefined" are different types and only the first means
  // unmetered here. Built by spreading rather than by assigning undefined.
  const options: MockEndpointOptions = {
    ...(perMinuteRaw === undefined || perMinuteRaw === ""
      ? {}
      : { perMinute: Number(perMinuteRaw) }),
    refuseAt:
      refuseRaw === undefined || refuseRaw === ""
        ? []
        : refuseRaw.split(",").map((s) => Number(s.trim())),
    retryAfter: process.env["MOCK_RPC_RETRY_AFTER"] ?? null,
  };
  const endpoint = new MockRpcEndpoint(options);
  const url = await endpoint.start();
  process.stdout.write(
    `mock-zebra-rpc listening on ${url}\n` +
      `  ceiling      ${perMinuteRaw ?? "none"}\n` +
      `  refuse at    ${refuseRaw ?? "none"}\n` +
      `  Retry-After  ${process.env["MOCK_RPC_RETRY_AFTER"] ?? "omitted"}\n`,
  );
  process.on("SIGINT", () => {
    void endpoint.stop().then(() => {
      process.exit(0);
    });
  });
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  void runFromCli();
}
