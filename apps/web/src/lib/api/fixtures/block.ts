/**
 * The block fixture: 3,191,051, the block the round-trip unshield landed in.
 *
 * A block is the one query in TRACKING-MATH section 0's table whose answer is
 * exact all the way down - per-pool deltas, coinbase, funding-stream outputs,
 * every transaction's public fields - so this page makes no estimate at all and
 * says so. It exists partly to be the fourth kind of answer beside "exact and
 * bounded", "bounded", and "undefined by construction", and partly because
 * /tx has to link somewhere when a reader asks what else was in that block.
 *
 * The coinbase split is ZIP 1015 as it stands after NU6: 60 percent to miners
 * and 40 percent to the deferred lockbox pool, with no direct ECC, ZF or ZCG
 * stream any more - the lockbox is the recipient, and ZIP 271 is what later
 * disburses it. That is the same lockbox the address fixture describes, which
 * is the connection between the two pages.
 */
import type { BlockView } from "@zcashreveal/types";

import { at, zec } from "./units";
import { ROUND_TRIP_TXID } from "./tx";

export const ROUND_TRIP_HEIGHT = 3_191_051;

/** ZIP 1015 after NU6: 60 percent miner, 40 percent deferred to the lockbox. */
const BLOCK_SUBSIDY = zec("1.5625");
const MINER_SHARE = (BLOCK_SUBSIDY * 60n) / 100n;
const LOCKBOX_SHARE = BLOCK_SUBSIDY - MINER_SHARE;

export const ROUND_TRIP_BLOCK: BlockView = {
  height: ROUND_TRIP_HEIGHT,
  hash: "00000000012f8a4b7c6d5e3f1a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b",
  stamp: at({ y: 2026, mo: 1, d: 2, h: 18, mi: 53, s: 18 }),
  txCount: 7,
  sizeBytes: 21_448,
  deltas: [
    { pool: "orchard", deltaZat: zec("50000.5541") },
    { pool: "sapling", deltaZat: 0n },
    { pool: "ironwood", deltaZat: 0n },
    { pool: "sprout", deltaZat: 0n },
  ],
  coinbase: {
    totalZat: BLOCK_SUBSIDY,
    lines: [
      { k: "block subsidy", v: "1.5625 ZEC", muted: false },
      { k: "miner", v: `${(Number(MINER_SHARE) / 1e8).toFixed(4)} ZEC - 60 percent`, muted: false },
      { k: "deferred lockbox", v: `${(Number(LOCKBOX_SHARE) / 1e8).toFixed(4)} ZEC - 40 percent, ZIP 1015`, muted: false },
      { k: "direct dev streams", v: "none after NU6 - ZIP 271 disburses the lockbox instead", muted: true },
      { k: "shielded coinbase", v: "ZIP 213 - the miner output is a shielded output", muted: false },
    ],
  },
  transactions: [
    { txid: "0000000000000000000000000000000000000000000000000000000000000000", version: "v5", flow: "coinbase", valueText: "+1.5625 issued", severity: "INFO" },
    { txid: ROUND_TRIP_TXID, version: "v5", flow: "z to t", valueText: "+50,000.5541 leaving Orchard", severity: "HIGH" },
    { txid: "b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9011", version: "v5", flow: "t to t", valueText: "no pool component", severity: "INFO" },
    { txid: "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901122", version: "v5", flow: "z to z", valueText: "0 - intra-pool", severity: "INFO" },
    { txid: "d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90112233", version: "v4", flow: "t to t", valueText: "no pool component", severity: "INFO" },
    { txid: "e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9011223344", version: "v5", flow: "t to z", valueText: "-118.4000 entering Orchard", severity: "LOW" },
    { txid: "f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f901122334455", version: "v5", flow: "z to z", valueText: "0 - intra-pool", severity: "INFO" },
  ],
  note: "Everything on this page is exact. A block publishes its transactions' public fields, its per-pool deltas and its coinbase in full, so there is no candidate set to narrow and no assumption to print - which is why this is the only Tracking surface with no inference chain on it.",
};

export const BLOCK_VIEWS: ReadonlyMap<number, BlockView> = new Map([[ROUND_TRIP_HEIGHT, ROUND_TRIP_BLOCK]]);
