/**
 * Network-upgrade activation heights.
 *
 * Centralizes the block heights at which Sapling and NU5 (Orchard) became
 * active on each network. Pre-activation blocks carry no commitment-tree
 * root for the not-yet-active pool, so callers in 7B gate pool replay on
 * these heights rather than trusting the absence of `finalsaplingroot` /
 * `finalorchardroot` in an RPC response.
 *
 * Re-exports only — no behavior. Values are the canonical activation heights
 * from the Zcash protocol spec / `zcashd` chainparams.
 */

/** Sapling activated on mainnet at this height (NU1). */
export const SAPLING_ACTIVATION_MAINNET = 419_200;

/** NU5 (Orchard) activated on mainnet at this height. */
export const NU5_ACTIVATION_MAINNET = 1_687_104;

/** Sapling activated on testnet at this height. */
export const SAPLING_ACTIVATION_TESTNET = 280_000;

/** NU5 (Orchard) activated on testnet at this height. */
export const NU5_ACTIVATION_TESTNET = 1_842_420;
