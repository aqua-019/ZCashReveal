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
