/**
 * Thin typed wrapper over the zebrad / zcashd JSON-RPC interface.
 */

import { fetch } from "undici";
import type { Hex, RpcTransaction } from "@zcashreveal/types";
import type { Config } from "./config.js";

export interface BlockchainInfo {
  chain: "main" | "test" | "regtest";
  blocks: number;
  bestblockhash: Hex;
  verificationprogress: number;
}

export interface BlockHeader {
  hash: Hex;
  height: number;
  time: number;
  previousblockhash?: Hex;
}

/**
 * A verbosity-2 `getblock` response: full transaction objects inline plus the
 * block-level commitment-tree roots.
 *
 * `finalsaplingroot` is absent in blocks before Sapling activation, and
 * `finalorchardroot` is absent before NU5 activation (see
 * decoder/activation-heights.ts). Treat their absence as "pool not yet
 * active at this height", not as "no commitments in this block".
 */
export interface RpcBlock {
  hash: Hex;
  height: number;
  time: number;
  /** Sapling NCT root as of this block. Absent pre-Sapling-activation. */
  finalsaplingroot?: Hex;
  /** Orchard NCT root as of this block. Absent pre-NU5-activation. */
  finalorchardroot?: Hex;
  /** Full transaction objects (verbosity 2). */
  tx: RpcTransaction[];
  previousblockhash?: Hex;
  nextblockhash?: Hex;
  confirmations?: number;
}

export class ZebradRpc {
  private readonly url: string;
  private readonly authHeader: string;
  private nextId = 1;

  constructor(cfg: Config) {
    this.url = cfg.ZEBRAD_RPC_URL;
    const creds = Buffer.from(
      `${cfg.ZEBRAD_RPC_USER}:${cfg.ZEBRAD_RPC_PASSWORD}`,
      "utf8",
    ).toString("base64");
    this.authHeader = `Basic ${creds}`;
  }

  private async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
      body: JSON.stringify({ jsonrpc: "1.0", id, method, params }),
    });

    if (!res.ok) {
      throw new RpcError(`HTTP ${res.status} from zebrad`, method, params);
    }

    const body = (await res.json()) as {
      result?: T;
      error?: { code: number; message: string } | null;
    };

    if (body.error) {
      throw new RpcError(body.error.message, method, params, body.error.code);
    }
    if (body.result === undefined) {
      throw new RpcError("Empty result", method, params);
    }
    return body.result;
  }

  getBlockchainInfo(): Promise<BlockchainInfo> {
    return this.call("getblockchaininfo");
  }

  getRawMempool(): Promise<Hex[]> {
    return this.call("getrawmempool", [false]);
  }

  getRawTransaction(txid: Hex): Promise<RpcTransaction> {
    return this.call("getrawtransaction", [txid, 1]);
  }

  /**
   * Fetch a full block (verbosity 2) by hash or height.
   *
   * The block selector is passed as a string either way: zebrad/zcashd accept
   * a decimal height string or a block hash in the first `getblock` argument.
   *
   * Errors 7B callers should expect (surfaced as {@link RpcError} with `code`):
   *   -8  RPC_INVALID_PARAMETER     — height out of range (above the tip)
   *   -5  RPC_INVALID_ADDRESS_OR_KEY — block hash not found
   */
  getBlock(id: { hash: Hex } | { height: number }): Promise<RpcBlock> {
    const selector = "hash" in id ? id.hash : String(id.height);
    return this.call("getblock", [selector, 2]);
  }

  getBlockHeader(hash: Hex): Promise<BlockHeader> {
    return this.call("getblockheader", [hash, true]);
  }

  async getHeightForHash(hash: Hex): Promise<number> {
    const h = await this.getBlockHeader(hash);
    return h.height;
  }
}

export class RpcError extends Error {
  constructor(
    message: string,
    public readonly method: string,
    public readonly params: unknown[],
    public readonly code?: number,
  ) {
    super(`[RPC ${method}] ${message}`);
    this.name = "RpcError";
  }
}
