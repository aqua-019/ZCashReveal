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
 * The coinbase split is the corpus's, not a remembered one. This block is at
 * height 3,191,051, which is above NU6.1's activation at 3,146,400, so the
 * governing allocation is ZIP 1016's: 80 percent to miners, 12 percent
 * coinholder-controlled and deferred, 8 percent to Zcash Community Grants
 * (packages/content/data/timeline.json:1390, and :1183 for the same 12/8 split
 * introduced at NU6). ECC's and ZF's DIRECT streams ended at NU6; ZCG's did
 * not, which is why the muted line names the two that ended and not the third.
 * ZIP 271's 78,750 ZEC was a one-time disbursement out of the lockbox, not a
 * per-block stream - it is the same 78,750 the address fixture describes, and
 * 1.5625 x 12 percent x (3,146,400 - 2,726,400) reproduces it exactly, which
 * is the arithmetic connecting the two pages.
 *
 * A gate round corrected this: the first draft said 60/40 and named ZCG among
 * the ended streams, both of which the corpus contradicts.
 */
import type { BlockView } from "@zcashreveal/types";

import { at, zec } from "./units";
import { ROUND_TRIP_TXID } from "./tx";

export const ROUND_TRIP_HEIGHT = 3_191_051;

/** ZIP 1016, in force at this height: 80 percent miner, 12 percent deferred, 8 percent ZCG. */
const BLOCK_SUBSIDY = zec("1.5625");
const DEFERRED_SHARE = (BLOCK_SUBSIDY * 12n) / 100n;
const ZCG_SHARE = (BLOCK_SUBSIDY * 8n) / 100n;
const MINER_SHARE = BLOCK_SUBSIDY - DEFERRED_SHARE - ZCG_SHARE;

/** A share as the page prints it, four places, from the zatoshi rather than from prose. */
const share = (zat: bigint): string => (Number(zat) / 1e8).toFixed(4);
const pct = (zat: bigint): string => `${((Number(zat) / Number(BLOCK_SUBSIDY)) * 100).toFixed(0)} percent`;

export const ROUND_TRIP_BLOCK: BlockView = {
  height: ROUND_TRIP_HEIGHT,
  hash: "00000000012f8a4b7c6d5e3f1a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b",
  stamp: at({ y: 2026, mo: 1, d: 2, h: 18, mi: 53, s: 18 }),
  txCount: 7,
  sizeBytes: 21_448,
  /**
   * IRONWOOD IS ABSENT FROM THIS LIST, AND ITS ABSENCE IS THE CORRECT FACT.
   *
   * This block is at height 3,191,051 and NU6.3 activated at 3,428,143, so the
   * Ironwood pool did not exist here. The row said `{ pool: "ironwood",
   * deltaZat: 0n }` and `/block/[height]` renders every entry of this array
   * into its per-pool deltas section, so the page published "Ironwood moved 0"
   * about a block that predates the pool by 237,000 blocks - a measurement of
   * something that was not there.
   *
   * The indexer refuses exactly this statement: `perPoolZat` omits a pool that
   * did not move, on the stated grounds that a hardcoded zero renders as a
   * measurement, and `poolsActiveAt(3_191_051)` returns three pools with
   * Ironwood not among them. The fixture was printing what the producer
   * declines to say.
   *
   * The other three zeros stay: those pools existed at this height and a
   * measured zero is a fact about them.
   */
  deltas: [
    { pool: "orchard", deltaZat: zec("50000.5541") },
    { pool: "sapling", deltaZat: 0n },
    { pool: "sprout", deltaZat: 0n },
  ],
  coinbase: {
    totalZat: BLOCK_SUBSIDY,
    lines: [
      { k: "block subsidy", v: "1.5625 ZEC", muted: false },
      { k: "miner", v: `${share(MINER_SHARE)} ZEC - ${pct(MINER_SHARE)}`, muted: false },
      { k: "deferred lockbox", v: `${share(DEFERRED_SHARE)} ZEC - ${pct(DEFERRED_SHARE)}, ZIP 1016`, muted: false },
      { k: "Zcash Community Grants", v: `${share(ZCG_SHARE)} ZEC - ${pct(ZCG_SHARE)}, ZIP 1016`, muted: false },
      { k: "direct dev streams", v: "ECC's and ZF's ended at NU6; ZCG's 8 percent did not. ZIP 271 disbursed the lockbox once, at NU6.1", muted: true },
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
