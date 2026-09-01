/**
 * `GET /v2/address/:addr`.
 *
 * The address is DECODED before anything else happens - base58check or bech32m,
 * checksum verified, version bytes read. Two rejections come out of that and
 * they are different answers to different questions:
 *
 *   400 "not a transparent address"     the string is not one on any network
 *   400 "not on this network"           it is one, on the other chain
 *
 * Assertion A3's third case is the second of those: a `t2` address is a valid
 * TESTNET script hash, and a mainnet gateway that answered for it would be
 * answering about a chain it does not read. Collapsing the two into one message
 * would tell a reader with a testnet address that they had made a typo.
 */
import { addressViewSchema } from "@zcashreveal/types";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { badRequest, toStatus } from "./errors.js";
import { decodeAddress } from "../address.js";
import { respond } from "../serialize.js";
import { ReadContext } from "../views/context.js";
import { buildAddressView } from "../views/address.js";

export function registerAddressRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get<{ Params: { addr: string } }>("/address/:addr", async (req, reply) => {
    const raw = req.params.addr;
    const decoded = decodeAddress(raw);
    if (decoded === null) {
      return badRequest(reply, "not a transparent address", [
        {
          path: "addr",
          message:
            "expected a base58check t-address or a bech32m tex address; the checksum or the version bytes did not verify",
        },
      ]);
    }
    if (decoded.network !== deps.cfg.GATEWAY_NETWORK) {
      return badRequest(reply, "not on this network", [
        {
          path: "addr",
          message: `this is a ${decoded.network} address and this gateway reads ${deps.cfg.GATEWAY_NETWORK}`,
        },
      ]);
    }

    // From here on the CANONICAL address, never `raw`. The decoder trims, so a
    // request for "%20t3ev...%20" validates and would then have queried the node
    // for the padded string, cached under it, and printed it back as the address
    // this view answered for.
    const address = decoded.address;

    const ctx = new ReadContext(deps.rpc, deps.cache, deps.cfg);
    try {
      const projection = await buildAddressView(ctx, address, decoded);
      // Written back AFTER the view is built, so a request that failed halfway
      // does not leave a half-true cache entry behind.
      if (!projection.fromCache) await deps.cache.putAddress(address, projection.cacheable);
      return respond("/address", addressViewSchema, projection.view);
    } catch (err) {
      deps.log.warn({ err: String(err) }, "address view failed");
      return toStatus(err, reply);
    }
  });
}
