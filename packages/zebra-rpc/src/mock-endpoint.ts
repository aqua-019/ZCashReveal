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
 * WHAT IT SERVES. The three methods the mempool path calls, and nothing else:
 * `getblockchaininfo`, `getrawmempool` and `getrawtransaction`. An unknown
 * method answers with a JSON-RPC error object rather than a 404, because that
 * is what a real node does and a client that treats the two the same has a bug
 * this mock should be able to show.
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
   * What to put in `Retry-After` on a refusal, or null to omit the header.
   *
   * NULL IS THE DEFAULT BECAUSE OMISSION IS THE COMMON CASE. RFC 9110 does not
   * require the header on a 429 and the measured Tatum endpoint does not send
   * one, so a mock that always sent it would make the client's null branch -
   * the live one - the untested one.
   */
  readonly retryAfter?: string | null;
  readonly now?: () => number;
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
  readonly #perMinute: number | undefined;
  readonly #windowMs: number;
  readonly #refuseAt: Set<number>;
  readonly #retryAfter: string | null;
  readonly #now: () => number;

  constructor(opts: MockEndpointOptions = {}) {
    this.#blockchainInfo = opts.blockchainInfo ?? {
      chain: "main",
      blocks: 3_470_960,
      bestblockhash: "0000000000301fe326bd00000000000000000000000000000000000000000000",
    };
    this.#mempool = [...(opts.mempool ?? [])];
    this.#transactions = { ...(opts.transactions ?? {}) };
    this.#perMinute = opts.perMinute;
    this.#windowMs = opts.windowMs ?? 60_000;
    this.#refuseAt = new Set(opts.refuseAt ?? []);
    this.#retryAfter = opts.retryAfter ?? null;
    this.#now = opts.now ?? Date.now;
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
    const now = this.#now();
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
    if (this.#refuseAt.has(ordinal) || this.#overCeiling(now)) {
      record(429);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.#retryAfter !== null) headers["Retry-After"] = this.#retryAfter;
      res.writeHead(429, headers);
      res.end(JSON.stringify({ error: "rate limited" }));
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
