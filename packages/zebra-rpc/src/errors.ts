/**
 * The three ways a Zebra call fails, kept apart on purpose.
 *
 * They are not interchangeable and the retry policy turns on the distinction:
 *
 *   RpcTransportError  the request never produced a JSON-RPC answer - a socket
 *                      error, a timeout, a 5xx. Retrying may work.
 *   RpcError           the node answered, and the answer is an error object.
 *                      "Transaction not found in mempool or best chain" (-5) is
 *                      a FACT about the chain, not a hiccup; retrying it wastes
 *                      the caller's time and hides the answer behind a delay.
 *   RpcSchemaError     the node answered with a result this package does not
 *                      recognise. Retrying cannot help: the shape is the shape.
 *   RpcRateLimitError  the endpoint answered 429. It is not a dead socket and it
 *                      is not a fact about the chain: it is a fact about US, and
 *                      the only useful response is to slow down. Retrying it on
 *                      the transport policy spends the very budget it is
 *                      refusing for.
 *
 * Collapsing these into one class is how a client ends up retrying a 404 three
 * times and reporting a timeout for a transaction that simply does not exist -
 * and, before HANDOFF-15, how it spent three of a five-request minute retrying
 * the 429 the first request earned, then reported "no response after 3
 * attempts" for an endpoint that had answered all three times, promptly, with a
 * number.
 */

/** Base class, so a caller can catch every failure from this package at once. */
export class ZebraRpcError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly params: readonly unknown[],
  ) {
    super(message);
    this.name = "ZebraRpcError";
  }
}

/**
 * The node returned a JSON-RPC `error` object.
 *
 * `code` is Zebra's legacy zcashd-compatible code where it has one. The ones
 * this project reads, from Zebra 6.3.0 `zebra-rpc/src/server/error.rs`:
 *   -1  Misc
 *   -5  InvalidAddressOrKey  - unknown txid, unparseable address, unknown hash
 *   -8  InvalidParameter     - height above the tip, bad verbosity
 * A JSON-RPC standard code also occurs: -32602 for `start > end` on
 * `getaddresstxids`.
 */
export class RpcError extends ZebraRpcError {
  constructor(
    message: string,
    method: string,
    params: readonly unknown[],
    readonly code?: number,
  ) {
    super(`[RPC ${method}] ${message}`, method, params);
    this.name = "RpcError";
  }

  /**
   * True where the node is saying "no such thing" rather than "I failed".
   *
   * A route turns this into a 404 and everything else into a 502, which is the
   * difference between "the chain does not have that transaction" and "the
   * gateway cannot talk to the chain". A page that cannot tell those apart
   * renders an empty result for an outage.
   */
  get isNotFound(): boolean {
    return this.code === -5 || this.code === -8;
  }
}

/** The request never produced a JSON-RPC answer. Retryable. */
export class RpcTransportError extends ZebraRpcError {
  constructor(
    message: string,
    method: string,
    params: readonly unknown[],
    readonly attempts: number,
    override readonly cause?: unknown,
  ) {
    super(`[RPC ${method}] ${message}`, method, params);
    this.name = "RpcTransportError";
  }
}

/**
 * The endpoint refused with HTTP 429.
 *
 * A FIRST-CLASS STATE, NOT AN ERROR PATH (HANDOFF-15 section 3). Three things
 * distinguish it from every other failure in this file and each one changes what
 * a caller should do:
 *
 *   - The request was well formed and the endpoint is healthy. Nothing is
 *     broken, so "the gateway cannot talk to the chain" is the wrong thing to
 *     render.
 *   - It is not a fact about the chain, so it must never be turned into an
 *     empty result. A mempool view built after a 429 is THINNER than the
 *     mempool, and a reader shown five transactions has no way to know that.
 *     `retryAfterMs` and the gate's window are what a caller turns into the
 *     staleness figure it owes that reader.
 *   - Retrying it immediately makes it worse. At the measured five-per-minute
 *     ceiling, two silent retries cost 40 per cent of the minute's budget and
 *     buy nothing.
 *
 * `retryAfterMs` IS NULLABLE AND THE NULL IS THE COMMON CASE. RFC 9110 does not
 * require `Retry-After` on a 429 and most gateways omit it, so a caller's
 * fallback is the rolling window rather than a number the server gave it. It is
 * null when the header is absent, empty, or in neither of the two forms
 * `parseRetryAfterMs` reads - never a fabricated default, because a wait this
 * package invented and a wait the endpoint asked for are different claims.
 */
export class RpcRateLimitError extends ZebraRpcError {
  constructor(
    method: string,
    params: readonly unknown[],
    /** How long the endpoint asked us to wait, or null when it did not say. */
    readonly retryAfterMs: number | null,
    /** The status that produced this. 429 today; kept so a log line can say so. */
    readonly status: number = 429,
  ) {
    super(
      `[RPC ${method}] the endpoint refused with ${status}: rate limited${
        retryAfterMs === null ? ", with no Retry-After" : `, retry after ${retryAfterMs} ms`
      }`,
      method,
      params,
    );
    this.name = "RpcRateLimitError";
  }
}

/** The result did not match this package's schema for the method. Not retryable. */
export class RpcSchemaError extends ZebraRpcError {
  constructor(
    method: string,
    params: readonly unknown[],
    readonly issues: readonly { path: string; message: string }[],
  ) {
    const first = issues[0];
    super(
      `[RPC ${method}] the node returned a shape this client does not recognise: ${
        first === undefined ? "no issue reported" : `${first.path} - ${first.message}`
      }`,
      method,
      params,
    );
    this.name = "RpcSchemaError";
  }
}
