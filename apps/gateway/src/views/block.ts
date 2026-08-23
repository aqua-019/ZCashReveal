/**
 * `BlockView` from `getblock` verbosity 2.
 *
 * One RPC call carries the whole page: at verbosity 2 the `tx` array is full
 * transaction objects, so every row's version, flow and value are read from the
 * same response rather than fetched one at a time. That is the reason this
 * projection is short where the address one is long.
 *
 * THE COINBASE SPLIT IS READ, NOT ASSUMED. ZIP 1014, ZIP 1015 and ZIP 271 each
 * changed where the block subsidy goes, and HANDOFF-04's gate caught a
 * hardcoded split that the corpus contradicted by a factor of 3.3. So the lines
 * here are the coinbase's ACTUAL outputs with their actual values and, where
 * the Record labels the destination, its label - never a percentage from a
 * table of what the rules say should happen.
 */
import type { BlockView, LedgerLane } from "@zcashreveal/types";
import type { RpcTransaction } from "@zcashreveal/types";

import { labelFor } from "./labels.js";
import { lanesTouched, poolValueBalanceZat, shieldedActionCount, versionText } from "./context.js";
import { countText, stampFromUnix, zecText } from "./units.js";

export interface BlockSource {
  readonly hash: string;
  readonly height: number;
  readonly time: number;
  readonly size?: number | undefined;
  readonly tx: readonly RpcTransaction[];
}

export function buildBlockView(block: BlockSource): BlockView {
  const coinbase = block.tx[0];

  const deltas = new Map<LedgerLane, bigint>();
  const add = (lane: LedgerLane, zat: bigint): void => {
    deltas.set(lane, (deltas.get(lane) ?? 0n) + zat);
  };

  const rows: BlockView["transactions"] = [];
  for (const tx of block.tx) {
    const boundary = poolValueBalanceZat(tx);
    const lanes = lanesTouched(tx);
    const shielded = lanes.filter((l) => l !== "transparent");
    const isCoinbase = tx.vin.some((v) => v.coinbase !== undefined);

    if ((tx.vShieldedSpend?.length ?? 0) + (tx.vShieldedOutput?.length ?? 0) > 0) {
      add("sapling", BigInt(tx.valueBalanceZat ?? 0));
    }
    if ((tx.orchard?.actions.length ?? 0) > 0) add("orchard", BigInt(tx.orchard?.valueBalanceZat ?? 0));
    const ironwood = (tx as unknown as { ironwood?: { actions?: unknown[]; valueBalanceZat?: number } }).ironwood;
    if ((ironwood?.actions?.length ?? 0) > 0) add("ironwood", BigInt(ironwood?.valueBalanceZat ?? 0));
    add("transparent", -boundary);

    rows.push({
      txid: tx.txid,
      version: versionText(tx.version),
      flow: isCoinbase
        ? "coinbase"
        : boundary === 0n
          ? shielded.length > 0
            ? "shielded"
            : "t to t"
          : boundary > 0n
            ? `z to t (${shielded.join(", ") || "pool"})`
            : `t to z (${shielded.join(", ") || "pool"})`,
      valueText:
        boundary === 0n
          ? shielded.length > 0
            ? `${countText(shieldedActionCount(tx))} shielded actions`
            : zecText(tx.vout.reduce<bigint>((a, o) => a + BigInt(o.valueZat), 0n))
          : zecText(boundary < 0n ? -boundary : boundary),
      // Severity is the indexer's judgement and the indexer did not see these
      // transactions here. INFO is the honest default for a row this view can
      // only describe; /tx says "not classified" in the same situation and the
      // two must not disagree.
      severity: "INFO",
    });
  }

  const coinbaseTotal = coinbase === undefined ? 0n : coinbase.vout.reduce<bigint>((a, o) => a + BigInt(o.valueZat), 0n);

  return {
    height: block.height,
    hash: block.hash,
    stamp: stampFromUnix(block.time),
    txCount: block.tx.length,
    sizeBytes: block.size ?? 0,
    deltas: [...deltas.entries()].map(([pool, deltaZat]) => ({ pool, deltaZat })),
    coinbase: {
      totalZat: coinbaseTotal,
      lines:
        coinbase === undefined
          ? [{ k: "coinbase", v: "this block carries none", muted: true }]
          : coinbase.vout.map((o) => {
              const addresses = o.scriptPubKey.addresses ?? [];
              const first = addresses[0];
              const labelled = first === undefined ? null : labelFor(first);
              return {
                k: labelled?.label ?? first ?? `output ${o.n}`,
                v: zecText(BigInt(o.valueZat)),
                muted: labelled === null,
              };
            }),
    },
    transactions: rows,
    note:
      block.size === undefined
        ? "The node did not report this block's serialised size, so it is shown as zero rather than estimated."
        : `${countText(block.tx.length)} transactions, ${countText(block.size)} bytes. Pool deltas are summed from the transactions in this block, and the transparent delta is their mirror image.`,
  };
}
