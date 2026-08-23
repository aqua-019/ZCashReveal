import type { Hex, Zatoshi } from "./transactions.js";

/**
 * The four shielded pools, and the single source of truth for the union.
 *
 * `Pool` in analysis.ts is an alias of this, `poolNameSchema` in views.ts is
 * its zod mirror, and the `CHECK (pool IN (...))` constraints migration 003
 * writes onto the four `pool_*` tables are its database mirror. All four move
 * together or the site can hold a value in one layer that another rejects.
 *
 * The order is chronological, which is also the order the display layer draws
 * them in: Sprout from genesis, Sapling from NU1, Orchard from NU5, Ironwood
 * from NU6.3. See `apps/indexer/src/decoder/activation-heights.ts` for the
 * heights and `poolsActiveAt()` for which of them exist at a given height.
 *
 * SPROUT IS NOT DEAD. It holds ~22.6k ZEC and has never emptied in eight
 * years, which is half of the unprovable residual this site exists to publish.
 * ORCHARD IS NOT SEALED. From NU6.3 it is exit-only - no new value may enter -
 * but ~3.6M ZEC remained withdrawable at activation and migration is voluntary
 * with no deadline, so "exit-only" is a direction, not a closure.
 */
export type ShieldedPool = "sprout" | "sapling" | "orchard" | "ironwood";

/**
 * A directed movement of value between pools, as a display and link label.
 *
 * Derived from `ShieldedPool` rather than hand-enumerated. The old form spelled
 * out a cross-product of the two-pool era - four members - and `orchard->ironwood`,
 * the migration NU6.3 actually produces, was not among them; the code that built
 * one therefore carried an `as` cast, which is precisely the construct that would
 * have hidden the omission. A template type cannot fall behind the union it is
 * built from.
 *
 * A same-pool path is written as the bare pool name, not `sapling-arrow-sapling`.
 */
export type PoolPath = ShieldedPool | `${ShieldedPool}→${ShieldedPool}`;

export interface DecodedSaplingSpend {
  pool: "sapling";
  index: number;
  nullifier: Hex;
  anchor: Hex;
  cv: Hex;
  rk: Hex;
}

export interface DecodedSaplingOutput {
  pool: "sapling";
  index: number;
  cmu: Hex;
  cv: Hex;
  ephemeralKey: Hex;
  encCiphertextSize: number;
  outCiphertextSize: number;
}

export interface DecodedOrchardAction {
  pool: "orchard";
  index: number;
  nullifier: Hex;
  cmx: Hex;
  cv: Hex;
  rk: Hex;
  ephemeralKey: Hex;
  encCiphertextSize: number;
  outCiphertextSize: number;
}

/**
 * SAPLING-SHAPED, DESPITE THE NAME. Both aliases resolve to the Sapling
 * structures, whose `pool` field is the literal `"sapling"` - there is no
 * four-pool decoded spend or output type, because Orchard's is an action and
 * Ironwood's needs the v6 decoder HANDOFF-07 owns. Kept as aliases because
 * callers import them; do not read the name as a promise about the union.
 */
export type DecodedShieldedSpend = DecodedSaplingSpend;
export type DecodedShieldedOutput = DecodedSaplingOutput;

/**
 * What the decoder extracted from a transaction's shielded bundles.
 *
 * TWO POOLS ARE DECODED HERE, NOT FOUR, and the gap is deliberate rather than
 * overlooked. Sprout's movement is not a bundle at all - it is `vpub_new -
 * vpub_old` summed over the JoinSplits, which the analyser computes onto
 * `ValueBalanceAnnotation.sproutValueBalanceZat` without a decoded structure.
 * Ironwood's bundle is a v6 transaction field, and decoding v6 is HANDOFF-07's
 * deliverable and explicitly out of HANDOFF-06's scope; adding an
 * `ironwoodActions: []` that is always empty would be a hardcoded zero the site
 * renders as a fact.
 */
export interface DecodedShieldedBundle {
  saplingSpends: DecodedSaplingSpend[];
  saplingOutputs: DecodedSaplingOutput[];
  saplingValueBalanceZat: Zatoshi;
  orchardActions: DecodedOrchardAction[];
  orchardValueBalanceZat: Zatoshi;
  orchardAnchor: Hex | null;
  orchardFlags: {
    enableSpends: boolean;
    enableOutputs: boolean;
  } | null;
}
