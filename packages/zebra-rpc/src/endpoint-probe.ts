/**
 * Which methods an endpoint actually serves, decided by asking it (HANDOFF-16).
 *
 * WHY THIS IS NEEDED AT RUNTIME AND NOT ONLY IN A PREFLIGHT SCRIPT. A method
 * this stack calls on EVERY block fails loudly the first time it is missing;
 * `z_gettreestate` does not. It is called only at the heights that append
 * Ironwood commitments, so an endpoint without it starts, runs, and looks
 * healthy until the first such block - and what happens then is worse than a
 * missing anchor.
 *
 * MEASURED, ON `main` AT `f976477`, BEFORE THIS MODULE EXISTED. `ZebraRpc`'s
 * `getTreestate` returns `Promise<GetTreestate>` and `call()` throws `RpcError`
 * for a JSON-RPC error object, which is what `-32601 Method not found` is.
 * `applyConfirmedBlock` awaits the treestate ABOVE every mutation, so the throw
 * propagates out of `step()` into the follower's loop, where `isFatal` is false
 * for an `RpcError` - it is neither a `ChainRuntimeError` nor a
 * `ZCashRevealStateError`. The loop therefore logs "confirmed-block step failed;
 * retrying after the poll interval" and fetches the SAME block again, forever.
 * Driven against the real classes: the step threw `RpcError`, `isFatal` was
 * `false`, no block was written, the chain height did not move, and the retry
 * threw identically. **The follower does not degrade; it stalls, permanently, at
 * the first Ironwood block, and the only symptom is a log line.**
 *
 * So the answer is not to make the driver tolerant of a throw - a transport
 * failure SHOULD stop the block, which is the ordering `c53f2ba` fixed and this
 * module must not undo. It is to learn, at startup, that the method is ABSENT,
 * and to hand the driver a source that returns `null` for it - which is the
 * `TreestateSource` contract's own documented case, "a node that does not serve
 * it", and the one the production wiring could never produce.
 *
 * THREE OUTCOMES, AND THE THIRD IS WHAT KEEPS THIS HONEST. See {@link classifyProbe}.
 */
import { RpcError, RpcRateLimitError, RpcSchemaError, RpcTransportError } from "./errors.js";

/** One wire call this stack sends, with the params it sends. */
export interface EndpointProbe {
  /** The row an operator reads. Distinct per SHAPE, so the two `getrawmempool` verbosities are two rows. */
  readonly key: string;
  readonly method: string;
  readonly params: readonly unknown[];
  /** Whether the stack can run without it. */
  readonly required: boolean;
  /**
   * Which path sends it, so a process can probe what IT sends and not the union.
   *
   * ADDED BECAUSE THE FIRST VERSION GATED THE WHOLE PROBE ON `store !== null`
   * AND JUSTIFIED IT WITH A FALSE SENTENCE. The comment said "in mempool-only
   * mode nothing calls getblock, getblockheader or z_gettreestate" - true - and
   * then skipped all EIGHT probes, including the three that mode calls on every
   * tick (`getblockchaininfo` at `index.ts`, `getRawMempool` twice, and
   * `getRawTransaction` per transaction). So the mode most likely to be pointed
   * at an unknown third-party endpoint was the one that probed nothing. A gate
   * reviewer found it by grepping the call sites the sentence named.
   */
  readonly path: "mempool" | "confirmed" | "either";
  /** What its absence costs, in the operator's terms. */
  readonly why: string;
}

/**
 * The probes a process running these paths sends.
 *
 * TAKES A SET, NOT A SINGLE PATH, BECAUSE A FULL INDEXER RUNS BOTH AND THE
 * FIRST VERSION FORGOT IT. `probesForPath("confirmed")` returned the confirmed
 * rows plus the `either` rows and DROPPED `getrawmempool` in both verbosities
 * and `getrawtransaction` - three required shapes a full-mode indexer sends on
 * every tick. So the fix for "mempool-only probes nothing" created "full mode
 * probes five of eight", which is the same defect with the modes swapped, and a
 * gate reviewer found it in the fix commit one round later. The composition root
 * now names every path the process actually runs.
 */
export function probesForPaths(
  paths: ReadonlyArray<"mempool" | "confirmed">,
  probes: readonly EndpointProbe[] = ENDPOINT_PROBES,
): readonly EndpointProbe[] {
  const want = new Set<string>(paths);
  return probes.filter((p) => p.path === "either" || want.has(p.path));
}

/** One path's probes. Kept as the single-path spelling of {@link probesForPaths}. */
export function probesForPath(path: "mempool" | "confirmed", probes: readonly EndpointProbe[] = ENDPOINT_PROBES): readonly EndpointProbe[] {
  return probesForPaths([path], probes);
}

/**
 * Every wire call this stack sends outside the address index, WITH THE PARAMS IT
 * SENDS.
 *
 * WITH THE REAL PARAMS BECAUSE AVAILABILITY IS PER SHAPE AND NOT PER NAME.
 * `getblock` at verbosity 1 and at verbosity 2 are one method name and two
 * capabilities; this stack only ever sends 2 (`client.ts`'s `getBlock` hard-codes
 * it), and a gateway serving 1 and refusing 2 cannot carry this stack. The same
 * is true of `getrawmempool` `[false]` against `[true]`. A list keyed by NAME
 * would certify both.
 *
 * THE SELECTORS ARE CHOSEN TO BE CHEAP AND TO BE WRONG. A height above any
 * chain and an all-zero hash make a working endpoint answer an error ABOUT THE
 * ARGUMENT, which is proof the method exists and costs no block transfer.
 *
 * EIGHT ROWS OVER SIX WIRE METHODS, and the count is measured rather than
 * recalled: `apps/` calls eight client methods outside the address index -
 * `getBlockchainInfo`, `getBlockchainInfoFull`, `getBlock`, `getBlockHeader`,
 * `getRawMempool`, `getRawMempoolVerbose`, `getRawTransaction`, `getTreestate` -
 * and the first two share one wire method, as do the two mempool ones. A brief
 * that listed "the seven methods this stack calls" was counting client methods
 * and missed `getRawMempoolVerbose`; the object to enumerate is the wire shape,
 * because that is what an endpoint serves or does not.
 */
export const ENDPOINT_PROBES: readonly EndpointProbe[] = [
  {
    key: "getblockchaininfo",
    method: "getblockchaininfo",
    params: [],
    required: true,
    path: "either",
    why: "the tip, the lane balances, and the follower's every step",
  },
  {
    key: "getblock",
    method: "getblock",
    params: ["99999999", 2],
    required: true,
    path: "confirmed",
    why: "every confirmed block, at verbosity 2 - the only verbosity this stack sends",
  },
  {
    key: "getblockheader",
    method: "getblockheader",
    params: ["0000000000000000000000000000000000000000000000000000000000000000", true],
    required: true,
    path: "confirmed",
    why: "the base row's block time on a cold start",
  },
  {
    key: "getrawmempool",
    method: "getrawmempool",
    params: [false],
    required: true,
    path: "mempool",
    why: "the mempool txid list",
  },
  {
    key: "getrawmempool[verbose]",
    method: "getrawmempool",
    params: [true],
    required: true,
    path: "mempool",
    why: "the mempool with sizes, which is what /v2/mempool renders",
  },
  {
    key: "getrawtransaction",
    method: "getrawtransaction",
    params: ["0000000000000000000000000000000000000000000000000000000000000000", 1],
    required: true,
    path: "mempool",
    why: "every mempool transaction this stack analyses",
  },
  {
    key: "z_gettreestate",
    method: "z_gettreestate",
    params: ["99999999"],
    required: true,
    path: "confirmed",
    why:
      "THE ONLY SOURCE OF AN IRONWOOD ROOT. Absent, every Ironwood anchor is missing and every later spend citing one " +
      "reads UNKNOWN_ANCHOR permanently - there is no backfill (LEDGER-12 Q2)",
  },
  {
    key: "getinfo",
    method: "getinfo",
    params: [],
    required: false,
    path: "either",
    why: "subversion, for the version window. Nothing else in this stack calls it, so its absence costs the version check alone",
  },
];

export type MethodOutcome = "SERVED" | "ABSENT" | "UNKNOWN";

/**
 * The messages an endpoint uses to say "I do not have that method".
 *
 * AS DATA BECAUSE `-32601` IS NOT UNIVERSAL. Zebra answers the JSON-RPC standard
 * code; gateways in front of a node routinely answer their own text with `-1`,
 * `-32000`, or no code at all. The code is checked first and the text second,
 * and an error matching neither is SERVED - because an unrecognised error is an
 * error ABOUT THE ARGUMENTS until shown otherwise, and that is the safe
 * direction: it can only make a check admit an endpoint the runtime will then
 * name, never make it reject a working one.
 */
export const ABSENCE_PATTERNS: readonly RegExp[] = [
  /method not found/i,
  /unknown method/i,
  /not supported/i,
  /unsupported method/i,
  /no such method/i,
  /method .* is disabled/i,
  /disabled method/i,
];

export interface ProbeVerdict {
  readonly outcome: MethodOutcome;
  readonly detail: string;
}

/**
 * SERVED / ABSENT / UNKNOWN from what one probe threw, or did not.
 *
 * THREE OUTCOMES AND THE THIRD IS THE POINT. A check that collapsed UNKNOWN into
 * ABSENT would reject good endpoints; one that collapsed it into SERVED would
 * certify bad ones. The worked case is `getrawtransaction` probed with a txid
 * that does not exist: a WORKING endpoint answers `-5 No such mempool or main
 * chain transaction`, and that error is proof the method is there. A rate-limited
 * endpoint answers 429 to the same probe and proves nothing. Those two are one
 * HTTP status apart.
 *
 * @param err what the call threw, or `null` if it resolved.
 */
export function classifyProbe(err: unknown): ProbeVerdict {
  if (err === null || err === undefined) return { outcome: "SERVED", detail: "answered with a result" };
  if (err instanceof RpcRateLimitError) {
    return { outcome: "UNKNOWN", detail: "429 - the endpoint refused before it said whether it has this method" };
  }
  if (err instanceof RpcError) {
    const message = err.message;
    if (err.code === -32601) return { outcome: "ABSENT", detail: `-32601 ${message}` };
    if (ABSENCE_PATTERNS.some((re) => re.test(message))) {
      return { outcome: "ABSENT", detail: `${String(err.code ?? "no code")} ${message}` };
    }
    // AN "empty result" IS NOT AN ANSWER ABOUT THE ARGUMENT AND MUST NOT BE
    // SERVED. `client.ts` raises `RpcError("empty result")` when the envelope
    // parses and carries neither `result` nor `error` - which is exactly what a
    // proxy answering `{}` to everything produces, and what the FOURTH 429 body
    // produces at a non-429 status. A gate reviewer pointed a mock that returns
    // an empty envelope to every method at this function and got all eight rows
    // SERVED: an endpoint that answers nothing certified as answering
    // everything. It is UNKNOWN, which is what the third outcome is for.
    if (message.includes("empty result")) {
      return { outcome: "UNKNOWN", detail: "the envelope parsed and carried neither result nor error, so nothing was said about this method" };
    }
    return {
      outcome: "SERVED",
      detail: `${String(err.code ?? "no code")} ${message} (an error about the argument, so the method is there)`,
    };
  }
  // NAMED CLASSES, NOT THE BASE CLASS, AND THE FIRST DRAFT GOT THIS WRONG IN THE
  // ONE DIRECTION THAT MATTERS. It tested `err instanceof ZebraRpcError` here
  // and returned SERVED, meaning "the endpoint answered with a shape this client
  // could not read". That is true of `RpcSchemaError` and false of
  // `RpcTransportError`, which ALSO extends `ZebraRpcError` - so a refused
  // socket, a timeout or a 5xx was reported as proof the method exists. The
  // broad branch swallowing the narrow case is this project's most-recorded
  // shape and it was live here for the ten minutes between writing the module
  // and running its test.
  if (err instanceof RpcSchemaError) {
    // The endpoint ANSWERED and this package could not read the answer. A fact
    // about the shape, not about availability - a caller treating it as ABSENT
    // would report a missing method for a gateway that merely wraps its results.
    return { outcome: "SERVED", detail: `${err.name}: the method answered with a shape this client does not recognise` };
  }
  if (err instanceof RpcTransportError) {
    return { outcome: "UNKNOWN", detail: `transport: ${err.message}` };
  }
  // ANY OTHER `ZebraRpcError` FALLS THROUGH TO UNKNOWN DELIBERATELY. A subclass
  // added later says nothing about availability until somebody decides what it
  // says, and UNKNOWN is the outcome that does not pretend to know.
  return { outcome: "UNKNOWN", detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
}

export interface EndpointReport {
  readonly verdicts: ReadonlyArray<{ readonly probe: EndpointProbe; readonly outcome: MethodOutcome; readonly detail: string }>;
  /** Keys whose wire method the endpoint says it does not have. */
  readonly absent: readonly string[];
  /** Keys the endpoint did not answer about. Never counted as absent. */
  readonly unknown: readonly string[];
  /** True when a REQUIRED probe is anything but SERVED. */
  readonly blocking: boolean;
}

/** How one probe is issued. Injected so this module needs no client and a test needs no socket. */
export type ProbeCall = (method: string, params: readonly unknown[]) => Promise<unknown>;

/**
 * Ask an endpoint about every probe, once each, in order.
 *
 * SEQUENTIAL AND NOT CONCURRENT, because a metered endpoint counts requests and
 * eight at once against a five-a-minute ceiling refuses six of them - which
 * would report six UNKNOWNs about an endpoint that serves all eight. The
 * `RateGate` on the client paces this when one is configured; without a ceiling
 * the eight are instant.
 */
export async function probeEndpoint(call: ProbeCall, probes: readonly EndpointProbe[] = ENDPOINT_PROBES): Promise<EndpointReport> {
  const verdicts: Array<{ probe: EndpointProbe; outcome: MethodOutcome; detail: string }> = [];
  for (const probe of probes) {
    let thrown: unknown = null;
    try {
      await call(probe.method, probe.params);
    } catch (err) {
      thrown = err;
    }
    const v = classifyProbe(thrown);
    verdicts.push({ probe, outcome: v.outcome, detail: v.detail });
  }
  return {
    verdicts,
    absent: verdicts.filter((v) => v.outcome === "ABSENT").map((v) => v.probe.key),
    unknown: verdicts.filter((v) => v.outcome === "UNKNOWN").map((v) => v.probe.key),
    blocking: verdicts.some((v) => v.probe.required && v.outcome !== "SERVED"),
  };
}

/** Whether the report says this wire method is absent. Keyed by METHOD, since several rows can share one. */
export function methodIsAbsent(report: EndpointReport, method: string): boolean {
  return report.verdicts.some((v) => v.probe.method === method && v.outcome === "ABSENT");
}
