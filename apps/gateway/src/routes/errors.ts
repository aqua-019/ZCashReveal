/**
 * The one place a failure becomes a status code.
 *
 * THE DISTINCTION THAT MATTERS is between "the chain does not have this" and
 * "the gateway could not ask". `apps/web`'s `HttpApi` turns a 404 into `null`,
 * which its pages render as a stated gap, and throws on anything else, which
 * they render as a failure. A gateway that answered 404 for an unreachable node
 * would have every page quietly reporting that the chain is empty.
 */
import type { FastifyReply } from "fastify";
import { RpcError, RpcSchemaError, RpcTransportError } from "@zcashreveal/zebra-rpc";

import { BoundExceeded } from "../views/context.js";
import { DtoViolation } from "../serialize.js";

export interface ApiError {
  readonly error: string;
  readonly detail?: string;
  readonly issues?: readonly { path: string; message: string }[];
}

/** A 400 with the Zod issue list, which is what assertion A3 reads. */
export function badRequest(
  reply: FastifyReply,
  error: string,
  issues: readonly { path: string; message: string }[],
): ApiError {
  reply.code(400);
  return { error, issues };
}

export function notFound(reply: FastifyReply, error: string): ApiError {
  reply.code(404);
  return { error };
}

/**
 * Map a thrown failure to a status.
 *
 * NOTHING FROM THE FAILURE'S MESSAGE REACHES THE BODY except for the two cases
 * where it is this gateway's own text. An `RpcTransportError` message carries
 * the node's URL, and assertion A7 exists because a 502 that helpfully quoted
 * it would publish an internal hostname to every reader who triggered one.
 */
export function toStatus(err: unknown, reply: FastifyReply): ApiError {
  if (err instanceof RpcError && err.isNotFound) {
    reply.code(404);
    return { error: "the chain does not have that" };
  }
  if (err instanceof RpcError) {
    reply.code(502);
    return { error: "the node refused the request", detail: `rpc error code ${err.code ?? "unspecified"}` };
  }
  if (err instanceof RpcTransportError) {
    reply.code(504);
    return { error: "the node did not answer", detail: `after ${err.attempts} attempts` };
  }
  if (err instanceof RpcSchemaError) {
    reply.code(502);
    return { error: "the node returned a shape this gateway does not recognise", issues: err.issues };
  }
  if (err instanceof BoundExceeded) {
    reply.code(413);
    // This gateway's own words, and they name the bound rather than hiding it:
    // a reader who hits it should be able to see that the refusal is a policy
    // and not a failure.
    return { error: err.message };
  }
  if (err instanceof DtoViolation) {
    // The gateway's own defect, so a 5xx. Reporting 4xx would blame the caller
    // for something the caller did not do.
    reply.code(500);
    return { error: "the gateway built a response that does not satisfy its own contract", issues: err.issues };
  }
  reply.code(500);
  return { error: "internal error" };
}
