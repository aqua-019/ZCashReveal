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
 *
 * Collapsing these into one class is how a client ends up retrying a 404 three
 * times and reporting a timeout for a transaction that simply does not exist.
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
