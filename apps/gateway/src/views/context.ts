/**
 * The shared reading context every projection is built from.
 *
 * One object rather than four parameters, because every projection needs the
 * same four things and because the transaction lookup has to be SHARED: an
 * address view resolves the same funding transaction once per input that spends
 * it, and a per-projection cache is the difference between one round trip and
 * forty for a consolidation.
 */
import type { RpcTransaction } from "@zcashreveal/types";
import { RpcError, type ZebraRpc } from "@zcashreveal/zebra-rpc";
import { asHex } from "@zcashreveal/types";

import type { CacheStore } from "../cache.js";
import type { GatewayConfig } from "../config.js";

/** Raised when a projection cannot be built without exceeding a stated bound. */
export class BoundExceeded extends Error {
  constructor(readonly what: string, readonly bound: number) {
    super(`${what} exceeds the configured bound of ${bound}`);
    this.name = "BoundExceeded";
  }
}

export class ReadContext {
  /**
   * Transactions resolved during THIS request.
   *
   * Separate from the Postgres cache and not a substitute for it: this exists
   * so that resolving forty inputs that all spend one funding transaction is
   * one lookup, and it is discarded when the request ends. The Postgres cache
   * is what survives between requests.
   */
  readonly #seen = new Map<string, RpcTransaction>();
  #rpcCalls = 0;

  constructor(
    readonly rpc: ZebraRpc,
    readonly cache: CacheStore,
    readonly cfg: GatewayConfig,
  ) {}

  /** How many calls actually reached the node. Assertion A6 counts this. */
  get rpcCalls(): number {
    return this.#rpcCalls;
  }

  /**
   * A transaction, from the request scope, then the cache, then the node.
   *
   * Returns null for a transaction the chain does not have, which is a real
   * answer a route turns into a 404. Any other RPC failure propagates, because
   * "the node is unreachable" and "there is no such transaction" must not both
   * arrive at a page as an empty result.
   */
  async tx(txid: string): Promise<RpcTransaction | null> {
    const local = this.#seen.get(txid);
    if (local !== undefined) return local;

    const cached = await this.cache.getTx(txid, this.cfg.GATEWAY_TX_CACHE_TTL_S);
    if (cached !== null && cached !== undefined) {
      const value = cached as RpcTransaction;
      this.#seen.set(txid, value);
      return value;
    }

    try {
      this.#rpcCalls += 1;
      const fetched = await this.rpc.getRawTransaction(asHex(txid));
      this.#seen.set(txid, fetched);
      const height = typeof fetched.height === "number" && fetched.height >= 0 ? fetched.height : null;
      await this.cache.putTx(txid, height, fetched);
      return fetched;
    } catch (err) {
      if (err instanceof RpcError && err.isNotFound) return null;
      throw err;
    }
  }

  /** Count an RPC call this context made outside `tx()`, so A6's counter stays honest. */
  countRpc(n = 1): void {
    this.#rpcCalls += n;
  }
}

/**
 * The value and address of the output an input spends.
 *
 * ZEBRA NEVER PUTS THIS ON THE INPUT (types/transaction.rs:903-905: `value`,
 * `valueSat` and `address` are always `None`). It has to be read from the
 * funding transaction, which is why every figure derived from it - an address's
 * debit, a transaction's fee - costs a lookup per distinct funding transaction
 * and is bounded by `GATEWAY_MAX_FUNDING_LOOKUPS`.
 */
export interface FundedInput {
  readonly valueZat: bigint;
  readonly addresses: readonly string[];
}

/**
 * Resolve every non-coinbase input of a transaction to the output it spends.
 *
 * Returns null where the funding transaction cannot be found - which happens on
 * a pruned node - so a caller can say "this could not be computed" rather than
 * report a number computed from a subset. That distinction is the reason this
 * returns `(FundedInput | null)[]` and not a summed total: a partial sum looks
 * exactly like a correct one.
 */
export async function resolveInputs(ctx: ReadContext, tx: RpcTransaction): Promise<(FundedInput | null)[]> {
  const distinct = new Set(tx.vin.filter((v) => v.coinbase === undefined && v.txid !== undefined).map((v) => v.txid as string));
  if (distinct.size > ctx.cfg.GATEWAY_MAX_FUNDING_LOOKUPS) {
    throw new BoundExceeded(
      `resolving ${distinct.size} funding transactions for ${tx.txid}`,
      ctx.cfg.GATEWAY_MAX_FUNDING_LOOKUPS,
    );
  }

  const out: (FundedInput | null)[] = [];
  for (const vin of tx.vin) {
    if (vin.coinbase !== undefined || vin.txid === undefined || vin.vout === undefined) {
      out.push(null);
      continue;
    }
    const funding = await ctx.tx(vin.txid);
    // BY `n`, NOT BY ARRAY POSITION. An input names the output index it spends,
    // and `vout` is a JSON array that a node happens to emit in index order.
    // Those coincide for every well-formed response and diverge the moment one
    // is filtered, paginated or hand-written - which is exactly how this
    // project's own example fixture silently reported a shield as a transparent
    // transfer, because its single output carried `n: 1` at position 0.
    const vout = funding?.vout.find((o) => o.n === vin.vout);
    if (vout === undefined) {
      out.push(null);
      continue;
    }
    out.push({ valueZat: BigInt(vout.valueZat), addresses: vout.scriptPubKey.addresses ?? [] });
  }
  return out;
}

/**
 * The net value a transaction moved ACROSS the shielded boundary, in zatoshi.
 *
 * Positive means value LEFT the pools for the transparent side (a deshield);
 * negative means it entered them (a shield). That is the sign convention Zcash
 * itself uses for `valueBalance`: it is the value the shielded bundle
 * contributes to the transparent value pool.
 *
 * All four pools are summed: Sapling's and Orchard's balances directly,
 * Ironwood's since HANDOFF-07 declared the field, and Sprout's JoinSplit term
 * from the function directly below.
 *
 * THE `as unknown as` CAST IS GONE. This read the Ironwood bundle through a
 * structural type because `RpcTransaction` did not declare one - defensible
 * while nothing had checked the serialised shape, and the same construct that
 * made `expiryheight` invisible for three revolutions. `ironwood` is declared
 * and validated at the RPC boundary now, so the shape is asserted in one place
 * instead of two.
 *
 * The bundles are still read BY NAME rather than by walking the pool union,
 * because Sprout is not a `valueBalance` field at all and a loop over the union
 * would have to special-case it - at which point the loop is doing less work
 * than the special case.
 */
export function poolValueBalanceZat(tx: RpcTransaction): bigint {
  const sapling = BigInt(tx.valueBalanceZat ?? 0);
  const orchard = BigInt(tx.orchard?.valueBalanceZat ?? 0);
  const ironwood = BigInt(tx.ironwood?.valueBalanceZat ?? 0);
  return sapling + orchard + ironwood + sproutValueBalanceZat(tx);
}

/**
 * Sprout's contribution to the transparent value pool.
 *
 * SPROUT IS NOT A `valueBalance` FIELD, which is why it was missing from the
 * first version of the function above. Each JoinSplit carries `vpub_old` - the
 * value it takes OUT of the transparent pool and puts into Sprout - and
 * `vpub_new`, the value it releases back. So its contribution, in the same sign
 * convention as `valueBalance`, is `vpub_new - vpub_old` summed over the
 * JoinSplits.
 *
 * The consequence of omitting it was not cosmetic: a Sprout transaction had a
 * boundary of zero, so it was classified "transparent throughout", its fee was
 * computed without the term that balances it, and the pool it actually moved
 * value out of did not appear in its deltas. Sprout is a drained pool that the
 * site has a whole argument about, and it is exactly the kind of transaction a
 * reader comes here to look at.
 *
 * `vpub_oldZat` and `vpub_newZat` are the integer fields; the unsuffixed ones
 * are ZEC floats (types/transaction.rs, `JoinSplit`).
 */
export function sproutValueBalanceZat(tx: RpcTransaction): bigint {
  // Read through the DECLARED field. `RpcJoinSplit` has been on
  // `RpcTransaction` since HANDOFF-06 and this cast outlived it; a cast agrees
  // with whatever the author typed, which is the construct that made
  // `expiryheight` invisible for three revolutions.
  const joinsplits = tx.vjoinsplit;
  if (joinsplits === undefined) return 0n;
  return joinsplits.reduce<bigint>(
    (acc, js) => acc + BigInt(js.vpub_newZat ?? 0) - BigInt(js.vpub_oldZat ?? 0),
    0n,
  );
}

/** How many shielded actions a transaction carries, across every pool. */
export function shieldedActionCount(tx: RpcTransaction): number {
  const ironwood = tx.ironwood?.actions.length ?? 0;
  return (
    (tx.vShieldedSpend?.length ?? 0) + (tx.vShieldedOutput?.length ?? 0) + (tx.orchard?.actions.length ?? 0) + ironwood
  );
}

/* ==========================================================================
   ZIP 317 logical actions
   ========================================================================== */

/**
 * ZIP 317's logical-action count, re-exported from the one implementation.
 *
 * THE COPY THAT USED TO LIVE HERE IS GONE, along with its byte-size helpers and
 * the long argument for them. This project computed L three different ways -
 * here, in `apps/indexer/src/decoder/fingerprint.ts`, and in prose in
 * `docs/2.0/TRACKING-MATH.md` section 3.5 - and the three disagreed on ordinary
 * transactions rather than on edge cases, so `/track` and `/tx` could state two
 * different action counts for the same transaction. HANDOFF-06 moved the rule
 * to `packages/zec-types/src/zip317.ts`, which is where the reasoning now lives:
 * the byte-based transparent term, the case that makes it matter (a 2-of-3 P2SH
 * lockbox input serialises at 297 bytes, so two of them cost four logical
 * actions and 20,000 zatoshi where a count of inputs says two and 10,000), and
 * `zip317LogicalActionsP2pkhApproximation` beside it - the count form, kept so
 * `/method` can show a reader the difference rather than assert one.
 *
 * Re-exported rather than deleted because the projections read every derived
 * quantity through this module, and a second import path for the same rule is
 * how a second copy of it gets written.
 */
export { zip317LogicalActions } from "@zcashreveal/types";

/** Which lanes a transaction touches, in the site's five-lane vocabulary. */
export function lanesTouched(tx: RpcTransaction): ("transparent" | "sprout" | "sapling" | "orchard" | "ironwood")[] {
  const lanes: ("transparent" | "sprout" | "sapling" | "orchard" | "ironwood")[] = [];
  if (tx.vin.length > 0 || tx.vout.length > 0) lanes.push("transparent");
  if ((tx.vjoinsplit?.length ?? 0) > 0) lanes.push("sprout");
  if ((tx.vShieldedSpend?.length ?? 0) + (tx.vShieldedOutput?.length ?? 0) > 0) lanes.push("sapling");
  if ((tx.orchard?.actions.length ?? 0) > 0) lanes.push("orchard");
  if ((tx.ironwood?.actions.length ?? 0) > 0) {
    lanes.push("ironwood");
  }
  return lanes;
}

/**
 * The transaction version as the DTOs spell it, or `unknown`.
 *
 * IT USED TO CLAMP, AND A CLAMP IS A FALSE STATEMENT WITH A CONFIDENT SHAPE.
 * The rule was `>= 6 ? "v6" : === 5 ? "v5" : "v4"`, so every version outside
 * 4-6 was published as its nearest neighbour: a version-7 transaction printed
 * `v6` in the cell beside its own finding "transaction version 7 is outside the
 * range this decoder models (1 to 6)", and a v1, v2 or v3 - Zcash shipped all
 * three before Overwinter - printed `v4`. A gate round reproduced both ends.
 *
 * The version is one of the few fields on these surfaces that a reader can
 * check against a block explorer in ten seconds, which is exactly why it must
 * not be rounded. `unknown` is the third state the enum gained for it, on the
 * same argument the `undecoded` mempool class was added on: the site says what
 * it read, and says so when it read nothing.
 */
export function versionText(version: number): "v4" | "v5" | "v6" | "unknown" {
  if (version === 6) return "v6";
  if (version === 5) return "v5";
  if (version === 4) return "v4";
  return "unknown";
}
