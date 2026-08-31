/**
 * Pool balances from the chain, and the honest limit of what a gateway can say
 * about them today.
 *
 * SIX POOLS ON THE WIRE, FIVE LANES ON THE SITE. Zebra 6.3.0's `valuePools` is
 * a fixed array of six - transparent, sprout, sapling, orchard, lockbox,
 * ironwood - and `LedgerLane` has five, because the ZIP 271 lockbox is not a
 * pool: it is the protocol's own reserve, and folding it into "transparent"
 * would overstate the transparent supply while hiding a balance the site has an
 * argument about. It is carried separately here, named, and reported.
 *
 * WHY THERE IS NO FULL `PoolsView` IN THIS HANDOFF. `poolsViewSchema` requires
 * four structures no chain query can produce: the long balance history, the
 * unsound-proof-system bands, the Sprout denomination histogram, and the N_eff
 * claim-level distribution. The first two are Record facts and the last two are
 * analysis - `denominations` needs the stranded-note survey and `neff` needs
 * the estimators, which are HANDOFF-08's, published through the snapshot that
 * is HANDOFF-09's. Filling them with plausible numbers is the one thing this
 * project must not do, and filling them with zeros would be a claim that the
 * counts ARE zero.
 *
 * So `/api/pools` serves the full view only once a snapshot supplies those
 * blocks, and until then reports which blocks are missing and which handoff
 * owns each. The chain-derived half is served in the meantime at
 * `/api/pools/balances`, which is also what HANDOFF-09's publisher will read.
 * The handoff sequence already says this: HANDOFF-11, the cutover, depends on
 * 05, 09 and 10 together, so a `/pools` page that is complete only after 09 is
 * the order the plan asks for rather than a shortfall against it.
 */
import type { LedgerLane } from "@zcashreveal/types";
import type { ValuePoolBalance } from "@zcashreveal/zebra-rpc";

import { zecText } from "./units.js";

/** The five lanes the site draws, plus the lockbox, which is not one of them. */
export interface PoolBalances {
  readonly atHeight: number;
  readonly source: string;
  readonly lanes: ReadonlyArray<{ readonly lane: LedgerLane; readonly zat: bigint; readonly share: number; readonly rule: string }>;
  /**
   * The ZIP 271 lockbox, reported separately because it is not a lane.
   *
   * Null where the node does not report one, which is any Zebra older than the
   * lockbox's activation - absence here means "this node has no such pool",
   * never "the balance is zero".
   */
  readonly lockboxZat: bigint | null;
  readonly totalZat: bigint;
  readonly note: string;
}

const RULES: Readonly<Record<LedgerLane, string>> = {
  transparent: "Public. Every balance and every movement is readable by anyone.",
  sprout: "The original shielded pool. Its soundness rested on BCTV14, and it is drained rather than used.",
  sapling: "Shielded. Balances are not readable; the value entering and leaving the pool is.",
  orchard: "Shielded, and the pool the 2026 inflation bug was found in.",
  ironwood: "Shielded, from NU6.3. Orchard value migrates into it and does not migrate back.",
};

/** Which `valuePools` id maps to which lane. `lockbox` is deliberately absent. */
const LANE_BY_ID: Readonly<Record<string, LedgerLane>> = {
  transparent: "transparent",
  sprout: "sprout",
  sapling: "sapling",
  orchard: "orchard",
  ironwood: "ironwood",
};

export function buildPoolBalances(pools: readonly ValuePoolBalance[], atHeight: number): PoolBalances {
  const byLane = new Map<LedgerLane, bigint>();
  let lockboxZat: bigint | null = null;

  for (const p of pools) {
    if (p.id === undefined) continue;
    if (p.id === "lockbox") {
      lockboxZat = p.chainValueZat;
      continue;
    }
    const lane = LANE_BY_ID[p.id];
    // An unrecognised pool id is NOT dropped silently. A future network upgrade
    // adding a pool would otherwise vanish from a page whose entire subject is
    // where the value is.
    if (lane === undefined) throw new Error(`pools: the node reported a pool this gateway does not know: "${p.id}"`);
    byLane.set(lane, p.chainValueZat);
  }

  // The total is the supply the pools account for, INCLUDING the lockbox: it is
  // issued value held by the protocol, and leaving it out would make the shares
  // below sum to more than the supply.
  const totalZat = [...byLane.values()].reduce<bigint>((a, b) => a + b, 0n) + (lockboxZat ?? 0n);

  const lanes = (["transparent", "sprout", "sapling", "orchard", "ironwood"] as const).map((lane) => {
    const zat = byLane.get(lane) ?? 0n;
    return {
      lane,
      zat,
      // A share computed in floating point, and only for display. The zatoshi
      // figure beside it is the exact one; nothing is derived FROM the share.
      share: totalZat === 0n ? 0 : Number((zat * 1_000_000n) / totalZat) / 1_000_000,
      rule: RULES[lane],
    };
  });

  return {
    atHeight,
    source: "zebra getblockchaininfo valuePools, read at the height above",
    lanes,
    lockboxZat,
    totalZat,
    note:
      lockboxZat === null
        ? `Read from the node at height ${atHeight.toLocaleString("en-US")}. This node reports no ZIP 271 lockbox pool.`
        : `Read from the node at height ${atHeight.toLocaleString("en-US")}. The ZIP 271 lockbox holds ${zecText(lockboxZat)} and is reported separately: it is the protocol's own reserve, not a lane value moves along, and folding it into the transparent supply would overstate that supply while hiding a balance this site has an argument about.`,
  };
}

/**
 * The blocks of `PoolsView` a chain query cannot produce, and where each is
 * routed.
 *
 * Returned to a caller as the reason `/api/pools` cannot serve a full view yet,
 * so the answer names the gap instead of being an opaque 503.
 *
 * `owner` IS A LIVE STATEMENT ON THE WIRE AND DECAYS SILENTLY, which is what
 * this array got wrong until HANDOFF-09's gate. Every entry named a handoff -
 * two of them HANDOFF-09, two HANDOFF-08 - and both of those handoffs shipped
 * without closing what was assigned to them, so `/api/pools` was telling its
 * callers that a closed handoff owed them a field. A number here is a
 * PREDICTION about a future handoff, and a prediction that outlives its
 * subject reads as a fact. So `UNASSIGNED` is now a legal value and is used
 * wherever no open handoff's scope actually covers the block: an honest
 * "nobody has been given this" is worth more to a caller than a number that
 * was true when it was written.
 */
export const POOLS_VIEW_GAPS: ReadonlyArray<{ readonly block: string; readonly owner: string; readonly why: string }> = [
  {
    block: "history",
    // HANDOFF-09 until it shipped. Its snapshot carries `pools` AT THE TIP -
    // `snapshotV1Schema` has no history array - so the series still has no
    // producer. HANDOFF-12 is where one appears: it makes the indexer maintain
    // and PERSIST `PoolState` for all four pools, which is the accumulation
    // this block needs.
    owner: "HANDOFF-12",
    why: "A long per-pool balance series. The chain answers for the tip only; the series has to be accumulated and persisted by the indexer first.",
  },
  {
    block: "unsoundBands",
    // HANDOFF-09 until it shipped, and it was never in that handoff's scope:
    // this is a Record fact with sources, confidence and lastVerified, which
    // is `packages/content`'s shape and not an instrument's.
    owner: "UNASSIGNED",
    why: "The windows in which a pool's soundness rested on a broken proof system. A Record claim in packages/content with its own sources, not a chain query and not an estimator output.",
  },
  {
    block: "denominations",
    // HANDOFF-08 until it shipped without the note survey. HANDOFF-09's
    // migration lens is the ZIP 318 Orchard->Ironwood histogram, which is a
    // different pool and a different ladder; it does not answer this.
    owner: "UNASSIGNED",
    why: "The Sprout residual's denomination histogram and its stranded-note count. Needs a note survey of the Sprout set, not a balance and not the ZIP 318 migration lens.",
  },
  {
    block: "neff",
    // HANDOFF-08 until it shipped. THE ESTIMATOR NOW EXISTS: HANDOFF-09's
    // `@zcashreveal/instruments`' `ironwood-birth.ts` produces the claim-level distribution and
    // the publisher writes it as the snapshot's `neffSeries`. What is missing
    // is the read path - this route answers from the chain and has no snapshot
    // reader - which is HANDOFF-11's wiring.
    owner: "HANDOFF-11",
    why: "The distribution of claim levels across spends. The estimator exists and the publisher writes it into the snapshot; this route reads the chain and not the snapshot yet. A distribution invented to fill the field would be exactly the fabricated precision this site documents in others.",
  },
];
