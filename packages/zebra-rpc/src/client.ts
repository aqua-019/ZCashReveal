/**
 * A typed Zebra JSON-RPC client with timeouts, bounded retries and validation.
 *
 * This is `apps/indexer/src/zebrad-rpc.ts` moved into a package (HANDOFF-05
 * deliverable 1) and given the three things it did not have: a request
 * timeout, a retry policy that can tell a dead socket from a "no such
 * transaction", and Zod validation of every result.
 *
 * WHAT CHANGED FOR THE INDEXER, and what deliberately did not. The methods it
 * calls keep their names, their signatures and their return types, so
 * `decodeBlock(await rpc.getBlock({height}))` reads the same. What is new is
 * that a malformed response now fails at the call rather than three layers
 * down as `undefined`, and that a hung node fails after a bounded wait rather
 * than never.
 */
import { fetch as undiciFetch, type RequestInit } from "undici";

import { RpcError, RpcRateLimitError, RpcSchemaError, RpcTransportError } from "./errors.js";
import { RateGate, parseRetryAfterMs } from "./rate-limit.js";
import {
  addressBalanceSchema,
  addressTxIdsSchema,
  addressUtxosSchema,
  blockHeaderSchema,
  blockchainInfoSchema,
  getInfoSchema,
  getTreestateSchema,
  rawMempoolSchema,
  rawMempoolVerboseSchema,
  rpcBlockSchema,
  rpcTransactionSchema,
  type AddressBalance,
  type AddressUtxo,
  type GetInfo,
  type GetTreestate,
} from "./schemas.js";
import type { BlockHeaderResult, BlockchainInfoResult, RpcBlock } from "./types.js";
import type { Hex, RpcTransaction } from "@zcashreveal/types";
import { z } from "zod";

/**
 * The subset of `fetch` this client uses, so a test can supply one.
 *
 * `headers` IS OPTIONAL AND THAT IS NOT A CONVENIENCE FOR TEST DOUBLES. A 429
 * carries `Retry-After` only when the endpoint chooses to; RFC 9110 does not
 * require it and most gateways omit it. So the absent case is a live production
 * branch rather than a test artefact, and a double that omits `headers`
 * exercises the same branch a real Cloudflare-fronted 429 usually does. Undici's
 * `Response` always supplies it, so the present branch is the live one too.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface ZebraRpcOptions {
  /** `http://127.0.0.1:8232` in the compose file. */
  readonly url: string;
  /**
   * Basic-auth credentials.
   *
   * Kept for portability with zcashd and with an auth-enabled Zebra. The
   * project's dev-mode Zebra runs `enable_cookie_auth=false` and ignores them,
   * which is why the RPC port is loopback-bound in docker-compose.yml rather
   * than defended by these.
   */
  readonly user?: string;
  readonly password?: string;
  /** Per-attempt timeout. The total wall clock is roughly this times `retries + 1` plus backoff. */
  readonly timeoutMs?: number;
  /** How many times to retry a TRANSPORT failure. A JSON-RPC error is never retried. */
  readonly retries?: number;
  /** First backoff step; each retry doubles it. */
  readonly retryBaseMs?: number;
  /** Injected for tests. */
  readonly fetch?: FetchLike;
  /** Injected for tests, so a retry test does not spend real seconds sleeping. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * A request budget this client must stay inside.
   *
   * ABSENT MEANS UNMETERED, WHICH IS THE RIGHT DEFAULT FOR A NODE YOU OWN.
   * Zebra over loopback has no ceiling worth modelling and adding one would
   * make every existing caller slower for nothing. A third-party endpoint has a
   * ceiling, and `apps/indexer` builds this from `INDEXER_RPC_MAX_RPM`.
   *
   * THE GATE IS CONSULTED PER ATTEMPT, NOT PER CALL. A retried transport
   * failure is a second request on the wire and the endpoint counts it as one,
   * so a gate asked once per `call()` would let a three-attempt call spend
   * three slots having reserved one.
   */
  readonly gate?: RateGate;
}

const DEFAULTS = {
  timeoutMs: 10_000,
  retries: 2,
  retryBaseMs: 200,
} as const;

/**
 * The envelope Zebra replies with. Validated before the result is looked at, so
 * a proxy returning an HTML error page produces "the node returned a shape this
 * client does not recognise" rather than `undefined`.
 */
const envelopeSchema = z
  .object({
    result: z.unknown().optional(),
    error: z
      .object({ code: z.number().optional(), message: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export class ZebraRpc {
  readonly #url: string;
  readonly #authHeader: string | undefined;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #retryBaseMs: number;
  readonly #fetch: FetchLike;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #gate: RateGate | undefined;
  #nextId = 1;

  constructor(options: ZebraRpcOptions) {
    this.#url = options.url;
    this.#authHeader =
      options.user === undefined && options.password === undefined
        ? undefined
        : `Basic ${Buffer.from(`${options.user ?? ""}:${options.password ?? ""}`, "utf8").toString("base64")}`;
    this.#timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.#retries = options.retries ?? DEFAULTS.retries;
    this.#retryBaseMs = options.retryBaseMs ?? DEFAULTS.retryBaseMs;
    this.#fetch = options.fetch ?? (undiciFetch as unknown as FetchLike);
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#gate = options.gate;
  }

  /** The budget this client meters itself against, or undefined when unmetered. */
  get gate(): RateGate | undefined {
    return this.#gate;
  }

  /**
   * One JSON-RPC call, validated.
   *
   * THE RETRY POLICY IS THE INTERESTING PART. A transport failure - a refused
   * socket, a timeout, a 5xx - is retried with a doubling backoff. A JSON-RPC
   * error object is NOT: "Transaction not found in mempool or best chain" is a
   * fact about the chain, and retrying it three times turns an instant, correct
   * 404 into a slow one. Neither is a schema failure: the shape is the shape.
   *
   * THERE IS NO JITTER, deliberately. `Math.random` is banned project-wide
   * (CLAUDE.md, enforced by eslint) and the thundering-herd problem jitter
   * solves does not arise here: the herd is one gateway process talking to one
   * node over loopback, not ten thousand browsers reconnecting to one endpoint.
   * Where a seeded jitter WAS needed - the browser's socket backoff - HANDOFF-04
   * used `seededRng`, and that is the precedent for adding one here if a fleet
   * ever makes it necessary.
   */
  async call<T>(method: string, params: readonly unknown[], schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
    const body = JSON.stringify({ jsonrpc: "1.0", id: this.#nextId++, method, params });
    let lastCause: unknown;

    for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
      if (attempt > 0) await this.#sleep(this.#retryBaseMs * 2 ** (attempt - 1));
      // PER ATTEMPT, BECAUSE THE ENDPOINT COUNTS REQUESTS AND NOT CALLS. See
      // the `gate` option's docblock. `take()` resolves immediately when the
      // window has room, so an unmetered client pays one already-resolved
      // promise per attempt and nothing else.
      if (this.#gate !== undefined) await this.#gate.take();

      let payload: unknown;
      try {
        payload = await this.#once(method, params, body);
      } catch (err) {
        // A 429 IS NOT A TRANSPORT FAILURE AND MUST NOT BE RETRIED HERE. It is
        // the endpoint saying our own request count is too high; asking again
        // 200 ms later spends another slot of the budget it is refusing for and
        // makes the refusal last longer. The gate is told - so every LATER call
        // on this client waits - and the typed error escapes to a caller that
        // can render the staleness it causes. Before HANDOFF-15 this fell
        // through to `lastCause` and came back as
        // `RpcTransportError: no response after 3 attempts`, which named a
        // timeout for an endpoint that had answered promptly three times.
        if (err instanceof RpcRateLimitError) {
          this.#gate?.penalise(err.retryAfterMs);
          throw err;
        }
        // Only a transport failure reaches here as a retryable one. An RpcError
        // is thrown from inside #once and must escape this loop immediately.
        if (err instanceof RpcError) throw err;
        lastCause = err;
        continue;
      }

      const envelope = envelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new RpcSchemaError(method, params, issuesOf(envelope.error));
      }
      const { error, result } = envelope.data;
      if (error !== undefined && error !== null) {
        throw new RpcError(error.message ?? "unspecified error", method, params, error.code);
      }
      if (result === undefined) {
        throw new RpcError("empty result", method, params);
      }

      const parsed = schema.safeParse(result);
      if (!parsed.success) throw new RpcSchemaError(method, params, issuesOf(parsed.error));
      return parsed.data;
    }

    throw new RpcTransportError(
      `no response after ${this.#retries + 1} attempts`,
      method,
      params,
      this.#retries + 1,
      lastCause,
    );
  }

  /**
   * One attempt. Throws RpcError for a JSON-RPC error, RpcRateLimitError for a
   * 429, anything else for a transport failure.
   *
   * `params` IS THREADED IN RATHER THAN PASSED AS `[]`. Every error this method
   * raises carries the params it was raised for, and the 429 branch is the one
   * a caller most needs them on - "which call did we get refused for" is the
   * question an operator asks first at a ceiling. `RpcError` below passed `[]`
   * for as long as this method did not have them.
   */
  async #once(method: string, params: readonly unknown[], body: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, this.#timeoutMs);
    try {
      const res = await this.#fetch(this.#url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.#authHeader === undefined ? {} : { Authorization: this.#authHeader }),
        },
        body,
        signal: controller.signal,
      });

      // A 4xx from Zebra with a JSON-RPC error body is an ANSWER, not a
      // transport failure: zcashd-compatible servers return 500 with a
      // well-formed error object for -5 and -8. Read the body before deciding.
      const text = await res.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`HTTP ${res.status} with a non-JSON body (${text.length} bytes)`);
      }
      const envelope = envelopeSchema.safeParse(payload);
      if (envelope.success && envelope.data.error !== undefined && envelope.data.error !== null) {
        const { code, message } = envelope.data.error;
        throw new RpcError(message ?? "unspecified error", method, params, code);
      }
      // THE 429 BRANCH SITS BELOW THE ERROR-OBJECT READ AND ABOVE THE GENERIC
      // `!res.ok`, AND BOTH NEIGHBOURS ARE LOAD-BEARING. Below the first,
      // because a gateway that returns 429 WITH a JSON-RPC error object is
      // telling us something specific and that object is the better message.
      // Above the second, because that line is where every 429 went before
      // HANDOFF-15: a bare `Error`, indistinguishable from a 500, retried by
      // `call()` on the transport policy.
      if (res.status === 429) {
        throw new RpcRateLimitError(
          method,
          params,
          parseRetryAfterMs(res.headers?.get("retry-after"), Date.now()),
          res.status,
        );
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from zebra`);
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------------ chain */

  /**
   * `getinfo`, for `subversion` - the only field this project reads from it.
   *
   * The version floor is a CORRECTNESS floor with three named reasons (see
   * `version-floor.ts`), and every one of them is silent when it is unmet: an
   * older node answers, the schemas parse, and the numbers are wrong. A pin in
   * `docker-compose.yml` binds the image an operator brings up and says nothing
   * about the node a gateway is talking to later. This is the call that lets
   * something notice.
   */
  getInfo(): Promise<GetInfo> {
    return this.call("getinfo", [], getInfoSchema);
  }

  getBlockchainInfo(): Promise<BlockchainInfoResult> {
    return this.call("getblockchaininfo", [], blockchainInfoSchema).then(asBlockchainInfo);
  }

  /** The raw `getblockchaininfo`, including `valuePools` and `chainSupply`. */
  getBlockchainInfoFull(): Promise<z.infer<typeof blockchainInfoSchema>> {
    return this.call("getblockchaininfo", [], blockchainInfoSchema);
  }

  getRawMempool(): Promise<Hex[]> {
    return this.call("getrawmempool", [false], rawMempoolSchema);
  }

  /**
   * `getrawmempool` with verbose=true: one entry per transaction, keyed by txid.
   *
   * `verbose` here genuinely is a JSON bool, unlike `getrawtransaction`'s
   * verbosity, which is a `u8`. The two are inconsistent in Zebra and a client
   * that assumed either shape for both would fail on one of them.
   */
  getRawMempoolVerbose(): Promise<Record<string, { size: number }>> {
    return this.call("getrawmempool", [true], rawMempoolVerboseSchema);
  }

  getRawTransaction(txid: Hex): Promise<RpcTransaction> {
    // Verbosity is `u8` in Zebra, not `bool` (methods.rs:424-429): a client
    // sending JSON `true` fails to deserialise. This is one of the four places
    // Zebra's wire contract differs from what a zcashd-shaped client sends.
    return this.call("getrawtransaction", [txid, 1], rpcTransactionSchema).then(asRpcTransaction);
  }

  /**
   * Fetch a full block (verbosity 2) by hash or height.
   *
   * The block selector is passed as a STRING either way, and for a height that
   * is a requirement rather than a convention: Zebra's `hash_or_height` is
   * typed `String` (methods.rs:303-307), so a bare JSON number fails to
   * deserialise.
   *
   * Errors callers should expect, surfaced as {@link RpcError} with `code`:
   *   -8  height not in the best chain, or an invalid verbosity
   *   -5  block hash not found
   */
  getBlock(id: { hash: Hex } | { height: number }): Promise<RpcBlock> {
    const selector = "hash" in id ? id.hash : String(id.height);
    return this.call("getblock", [selector, 2], rpcBlockSchema).then((block) => asRpcBlock(block, selector));
  }

  /**
   * `z_gettreestate`: the note-commitment-tree roots as of a block, by hash or
   * by height.
   *
   * THE ONLY PLACE THIS PROJECT CAN GET AN IRONWOOD ROOT. `getblock` carries no
   * Ironwood root under any spelling (LEDGER-07 Q5), only `trees.ironwood.size`;
   * the root is here, under `ironwood.commitments.finalRoot`, for every height
   * at which NU6.3 is active. HANDOFF-12's confirmed-block driver calls this
   * at exactly the heights `decodeBlock` marks `ironwoodAnchorPendingTreestate`
   * - a block that appended Ironwood commitments - and at no other, because a
   * pool most blocks do not move should not cost a second RPC on every block.
   *
   * The selector is a STRING either way, as for `getBlock`: Zebra's
   * `hash_or_height` is typed `String`. A height not in the best chain is a
   * JSON-RPC -8 (`LegacyCode::InvalidParameter`), surfaced as {@link RpcError}.
   */
  getTreestate(id: { hash: Hex } | { height: number }): Promise<GetTreestate> {
    const selector = "hash" in id ? id.hash : String(id.height);
    return this.call("z_gettreestate", [selector], getTreestateSchema);
  }

  getBlockHeader(hash: Hex): Promise<BlockHeaderResult> {
    return this.call("getblockheader", [hash, true], blockHeaderSchema).then(asBlockHeader);
  }

  async getHeightForHash(hash: Hex): Promise<number> {
    const header = await this.getBlockHeader(hash);
    return header.height;
  }

  /* ---------------------------------------------------------- address index */

  /**
   * `getaddressbalance`.
   *
   * The parameter is a single OBJECT, not an array of strings: Zebra's
   * `GetAddressBalanceRequest` deserialises `{"addresses": [...]}`
   * (methods.rs:3759-3789). It also accepts a bare string through an untagged
   * variant, which its own doc comment denies; this sends the object form,
   * because that is what lightwalletd sends and therefore what is exercised.
   */
  getAddressBalance(addresses: readonly string[]): Promise<AddressBalance> {
    return this.call("getaddressbalance", [{ addresses: [...addresses] }], addressBalanceSchema);
  }

  /**
   * `getaddresstxids`, in chain order.
   *
   * `start` and `end` are block heights and are clamped by the node rather than
   * rejected when they exceed the tip. `start > end` is a -32602, which is a
   * JSON-RPC standard code and not one of the legacy zcashd ones - the only
   * place in this client's surface where that happens.
   */
  getAddressTxIds(
    addresses: readonly string[],
    range?: { start: number; end: number },
  ): Promise<Hex[]> {
    const params =
      range === undefined
        ? [{ addresses: [...addresses] }]
        : [{ addresses: [...addresses], start: range.start, end: range.end }];
    return this.call("getaddresstxids", params, addressTxIdsSchema);
  }

  /** `getaddressutxos`. Returns the bare array form; `chainInfo` is not requested. */
  getAddressUtxos(addresses: readonly string[]): Promise<AddressUtxo[]> {
    return this.call("getaddressutxos", [{ addresses: [...addresses], chainInfo: false }], addressUtxosSchema);
  }
}

/* ==========================================================================
   Compile-time proofs that a validated result IS the declared interface
   ========================================================================== */

/**
 * These four functions are the ONLY bridge between the Zod-validated shapes and
 * the interfaces `apps/indexer/src/decoder/*` consumes, and they are identity
 * functions with a declared return type. That is deliberate and it is not
 * ceremony: if a schema ever stops producing something assignable to the
 * decoder's interface, `tsc` fails HERE, at the boundary, instead of a cast
 * silently asserting a shape the node does not send.
 *
 * The alternative - `as RpcBlock` - would compile whatever the schema became.
 * The same idiom is used in `packages/zec-types/src/views.ts`
 * (`auditRecordToEstimateFilter`) for the same reason.
 */
function asBlockchainInfo(v: z.infer<typeof blockchainInfoSchema>): BlockchainInfoResult {
  return v;
}

function asBlockHeader(v: z.infer<typeof blockHeaderSchema>): BlockHeaderResult {
  return v;
}

function asRpcTransaction(v: z.infer<typeof rpcTransactionSchema>): RpcTransaction {
  return v;
}

/**
 * The one case that is not pure identity.
 *
 * `getblock` at verbosity 2 returns full transaction objects and at verbosity 1
 * returns txid strings, and Zebra expresses that as one untagged union, so the
 * schema does too. `getBlock` always asks for 2, and this narrows the union to
 * match - throwing rather than casting if a node ever answered otherwise, which
 * is the case a cast would turn into a crash inside the decoder.
 *
 * `height` and `time` are optional on the schema because Zebra marks them so,
 * and required on `RpcBlock` because the decoder cannot work without them. A
 * block that arrives without either is a node contradiction, and it is named
 * here rather than defaulted to zero: a decoded block at height 0 would be
 * written to the database as the genesis block.
 */
function asRpcBlock(v: z.infer<typeof rpcBlockSchema>, selector: string): RpcBlock {
  const tx: RpcTransaction[] = [];
  for (const entry of v.tx) {
    if (typeof entry === "string") {
      throw new RpcSchemaError("getblock", [selector, 2], [
        { path: "tx", message: "verbosity 2 was requested and the node returned txid strings" },
      ]);
    }
    tx.push(entry);
  }
  if (v.height === undefined || v.time === undefined) {
    throw new RpcSchemaError("getblock", [selector, 2], [
      { path: v.height === undefined ? "height" : "time", message: "a confirmed block carries both a height and a time" },
    ]);
  }
  return {
    hash: v.hash,
    height: v.height,
    time: v.time,
    tx,
    ...(v.finalsaplingroot === undefined ? {} : { finalsaplingroot: v.finalsaplingroot }),
    ...(v.finalorchardroot === undefined ? {} : { finalorchardroot: v.finalorchardroot }),
    // NO IRONWOOD ROOT IS FORWARDED, BECAUSE `getblock` SENDS NONE. A
    // `finalironwoodroot` was forwarded here through HANDOFF-07 on the same
    // terms as the two above, inferred by analogy; L2 confirmed against Zebra's
    // source that the field does not exist (LEDGER-07 Q5). `trees` below is
    // what this response carries about Ironwood at block level, and it carries
    // a SIZE rather than a root.
    ...(v.trees === undefined ? {} : { trees: v.trees }),
    // FORWARDED BY HANDOFF-12, AND ITS ABSENCE WAS THE WHOLE OF A1'S BLOCKER.
    // `rpcBlockSchema` has parsed these two since HANDOFF-06 and this literal
    // dropped them, so the node's own per-pool accounting was parsed and then
    // discarded one line before the indexer could read it. Nothing downstream
    // read `valueDeltaZat` because nothing downstream could.
    ...(v.valuePools === undefined ? {} : { valuePools: v.valuePools }),
    ...(v.chainSupply === undefined ? {} : { chainSupply: v.chainSupply }),
    ...(v.previousblockhash === undefined ? {} : { previousblockhash: v.previousblockhash }),
    ...(v.nextblockhash === undefined ? {} : { nextblockhash: v.nextblockhash }),
    ...(v.confirmations === undefined ? {} : { confirmations: v.confirmations }),
    ...(v.size === undefined ? {} : { size: v.size }),
  };
}

function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message }));
}
