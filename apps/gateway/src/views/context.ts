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
    const vout = funding?.vout[vin.vout];
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
 * Sapling's balance and Orchard's are summed, and Ironwood's is included as
 * soon as a node sends it - reading the bundle by name rather than by a pool
 * union, because widening `Pool` to four is HANDOFF-06's and this must not
 * pretend to have done it.
 */
export function poolValueBalanceZat(tx: RpcTransaction): bigint {
  const sapling = BigInt(tx.valueBalanceZat ?? 0);
  const orchard = BigInt(tx.orchard?.valueBalanceZat ?? 0);
  const ironwood = BigInt(
    (tx as unknown as { ironwood?: { valueBalanceZat?: number } }).ironwood?.valueBalanceZat ?? 0,
  );
  return sapling + orchard + ironwood;
}

/** How many shielded actions a transaction carries, across every pool. */
export function shieldedActionCount(tx: RpcTransaction): number {
  const ironwood = (tx as unknown as { ironwood?: { actions?: unknown[] } }).ironwood?.actions?.length ?? 0;
  return (
    (tx.vShieldedSpend?.length ?? 0) + (tx.vShieldedOutput?.length ?? 0) + (tx.orchard?.actions.length ?? 0) + ironwood
  );
}

/** Which lanes a transaction touches, in the site's five-lane vocabulary. */
export function lanesTouched(tx: RpcTransaction): ("transparent" | "sapling" | "orchard" | "ironwood")[] {
  const lanes: ("transparent" | "sapling" | "orchard" | "ironwood")[] = [];
  if (tx.vin.length > 0 || tx.vout.length > 0) lanes.push("transparent");
  if ((tx.vShieldedSpend?.length ?? 0) + (tx.vShieldedOutput?.length ?? 0) > 0) lanes.push("sapling");
  if ((tx.orchard?.actions.length ?? 0) > 0) lanes.push("orchard");
  if (((tx as unknown as { ironwood?: { actions?: unknown[] } }).ironwood?.actions?.length ?? 0) > 0) {
    lanes.push("ironwood");
  }
  return lanes;
}

/** The transaction version as the DTOs spell it. */
export function versionText(version: number): "v4" | "v5" | "v6" {
  if (version >= 6) return "v6";
  if (version === 5) return "v5";
  return "v4";
}
