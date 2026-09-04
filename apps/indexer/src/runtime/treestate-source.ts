/**
 * Where the confirmed-block driver's Ironwood treestate comes from, and what
 * happens when the endpoint does not have the method (HANDOFF-16, deliverable 2).
 *
 * `TreestateSource`'s CONTRACT ALREADY NAMED THIS CASE AND NOTHING COULD
 * PRODUCE IT. Its docblock in `confirmed-block.ts` says `null` means "the
 * response was withheld - a node that does not serve it, or a test exercising
 * the fail side", and that a thrown error is a TRANSPORT failure which
 * propagates so the block is not applied and the follower tries again. Both
 * halves are right. The production wiring implemented only the second: the
 * follower built its source as `(hash) => rpc.getTreestate({ hash })`, and
 * `ZebraRpc.getTreestate` returns `Promise<GetTreestate>` - never null - because
 * `call()` throws `RpcError` for a JSON-RPC error object, which is exactly what
 * `-32601 Method not found` arrives as.
 *
 * SO THE NAMED CASE WAS UNREACHABLE AND ITS CONSEQUENCE WAS A STALL, MEASURED.
 * Driven against the real `ChainFollower`, the real `applyConfirmedBlock` and a
 * node answering `-32601` for this one method: the step threw `RpcError`;
 * `isFatal` was `false`, because an `RpcError` is neither a `ChainRuntimeError`
 * nor a `ZCashRevealStateError`; no block was written; the chain height did not
 * move; and the retry threw identically. The loop's own log line says "retrying
 * after the poll interval", and it does, forever, on the first block that
 * appends Ironwood commitments. A brief describing this configuration said "the
 * driver writes the block, logs the notice and records no anchor". It does not.
 * It writes nothing and follows nothing, and the site simply stops advancing.
 *
 * WHY TOLERANCE IS CONFIGURED RATHER THAN INFERRED FROM THE ERROR. Catching
 * `-32601` inside the driver would work and would be wrong: it makes a
 * per-request decision out of an endpoint-wide fact, so an endpoint that answers
 * `-32601` because a gateway hiccuped would silently drop one anchor with no
 * anchor ever recorded for that height and no backfill to fix it (LEDGER-12 Q2).
 * A startup probe learns the fact ONCE, and the driver is then handed a source
 * that is honest about it for every block. When the method IS served, a throw
 * stays a throw and the block stays unapplied - which is the ordering `c53f2ba`
 * fixed and this module must not undo.
 */
import type { Logger } from "pino";
import type { Hex } from "@zcashreveal/types";
import type { GetTreestate } from "@zcashreveal/zebra-rpc";

import type { TreestateSource } from "./confirmed-block.js";

/** What the follower needs from an RPC client to fetch a treestate. */
export interface TreestateRpc {
  getTreestate(id: { readonly hash: Hex }): Promise<GetTreestate>;
}

/**
 * The ordinary source: every failure propagates, so a transient fault leaves the
 * block unapplied and retryable.
 */
export function treestateSource(rpc: TreestateRpc): TreestateSource {
  return (hash) => rpc.getTreestate({ hash });
}

/**
 * The source for an endpoint MEASURED not to serve `z_gettreestate`.
 *
 * IT NEVER CALLS. Asking a method the endpoint has already said it does not have
 * spends a request of a small ceiling on every Ironwood block to be told the
 * same thing again, and on a five-a-minute endpoint those are requests the
 * mempool loop then does not get. The absence is a property of the endpoint and
 * it was established once.
 *
 * `null` PUTS THE DRIVER ON ITS OWN DOCUMENTED PATH: `ironwoodAnchorFrom` pushes
 * `IRONWOOD_TREESTATE_ABSENT`, records NO anchor, and the block is written and
 * the tip advances. Never a fabricated root - which is section 5's A5 fail side
 * and the thing this must not become.
 *
 * THE COST IS PERMANENT AND IS LOGGED AS SUCH, ONCE PER BLOCK THAT WANTED ONE.
 * There is no backfill in this project, so every Ironwood anchor missed here is
 * missed for the life of the data, and every later spend citing one reads
 * `UNKNOWN_ANCHOR`. An operator reading a warn line that says "not recorded"
 * should not have to know that "not recorded" means "not ever".
 */
export function absentTreestateSource(log: Logger): TreestateSource {
  return (hash) => {
    log.warn(
      { hash, method: "z_gettreestate" },
      "this endpoint does not serve z_gettreestate, so this block's Ironwood anchor is NOT recorded and will NEVER be: " +
        "nothing backfills it, and every later spend citing this anchor reads UNKNOWN_ANCHOR",
    );
    return Promise.resolve(null);
  };
}
