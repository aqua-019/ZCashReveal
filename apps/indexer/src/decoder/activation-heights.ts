/**
 * Network-upgrade activation heights, and which pools exist at a given height.
 *
 * Callers gate pool replay on these rather than on the absence of a
 * commitment-tree root in an RPC response: a pre-activation block carries no
 * root for the not-yet-active pool, and "the field was missing" and "the pool
 * did not exist yet" are different facts that must not be conflated.
 *
 * PROVENANCE. Every height NU6 and later carries a citation to the line in
 * `docs/2.0/research/` that corroborates it, each at `high` confidence.
 *
 * The four pre-NU6 values - Sapling and NU5, mainnet and testnet - were already
 * here and carry no per-constant citation. The two MAINNET ones are corroborated
 * in this repository (Sapling 419,200 and NU5 1,687,104 both appear across the
 * research corpus); the two TESTNET ones appear nowhere in this tree, and the
 * file's original author sourced all four to the Zcash protocol spec and
 * `zcashd` chainparams, which are not here either. That sourcing is restated
 * rather than dropped: this file deliberately omits `NU6_ACTIVATION_TESTNET`
 * because nothing corroborates it, so it cannot quietly leave two other testnet
 * constants standing with no provenance statement at all.
 *
 * WHY THIS FILE HAS NO NETWORK ENUM OF ITS OWN BEYOND `Network`: it is a leaf
 * module with no imports, which is what lets `state/` depend on it without a
 * cycle. It lives under `decoder/` for historical reasons; the heights are
 * chain parameters rather than a decoding concern, and moving the file is a
 * later handoff's tidy-up, not this one's.
 */

/** The two networks this project reasons about. */
export type Network = "mainnet" | "testnet";

/** The four shielded pools, in activation order. Mirrors `ShieldedPool`. */
export type PoolName = "sprout" | "sapling" | "orchard" | "ironwood";

/* --------------------------------------------------------------------------
   Mainnet
   -------------------------------------------------------------------------- */

/**
 * Sprout has existed since the genesis block: it is the pool Zcash launched
 * with, so there is no activation height to gate on and the constant is 0.
 *
 * It is not a historical curiosity. Sprout still holds roughly 22,621 ZEC as of
 * block 3,456,227 (docs/2.0/RESEARCH-2026-08-DOSSIER.md) and has never emptied
 * in eight years - which matters because the Sprout turnstile can only settle
 * the CVE-2019-7167 counterfeiting question by emptying, and it never has.
 *
 * The dates, since this file gets them wrong easily: 1 March 2018 is the
 * DISCOVERY, kept to four people; 28 October 2018 the silent fix; 5 February
 * 2019 the public DISCLOSURE (docs/2.0/research/03-history-exploits-governance.md,
 * and the site's own /beware page states the same). The repository could not
 * source any published, dated turnstile-audit result, so this comment does not
 * claim one was opened.
 */
export const SPROUT_ACTIVATION_MAINNET = 0;

/** Sapling activated on mainnet at this height (NU1). */
export const SAPLING_ACTIVATION_MAINNET = 419_200;

/** NU5 (Orchard) activated on mainnet at this height. */
export const NU5_ACTIVATION_MAINNET = 1_687_104;

/**
 * NU6, 23 November 2024. It activated at exactly the second halving height
 * (3.125 to 1.5625 ZEC), which is a coincidence worth knowing when reading a
 * supply chart across it.
 *
 * docs/2.0/research/03-history-exploits-governance.md:415 and :569, `HIGH`.
 */
export const NU6_ACTIVATION_MAINNET = 2_726_400;

/**
 * NU6.1, deploying ZIP 271 (the lockbox disbursement) and ZIP 1016.
 *
 * ZIP 255; docs/2.0/research/01-contemporary-zcash.md:28, `high`. This is the
 * one height in this file that is also committed as content data and covered by
 * a test - packages/content/data/cases.json and its suite pin 3,146,400.
 */
export const NU6_1_ACTIVATION_MAINNET = 3_146_400;

/**
 * The Orchard mitigation soft fork.
 *
 * ZIP 257, quoted verbatim in docs/2.0/research/01-contemporary-zcash.md:145:
 * "From block height 3363426 (Mainnet) or 4048500 (Testnet) onward, until the
 * activation of NU6.2 on each network, v5 and later transactions MUST NOT
 * contain any Orchard Action descriptions".
 *
 * NOTE WHAT THIS IS AND IS NOT. It froze Orchard ACTIVITY for the 1,174 blocks
 * between it and NU6.2; it did not deactivate the pool. The commitment tree,
 * the nullifier set and the balance all persist across the window, so
 * `poolsActiveAt` reports Orchard as present throughout - a pool with no new
 * actions is not an absent pool, and treating it as absent would drop its
 * balance out of the supply reconciliation for those blocks.
 */
export const ORCHARD_MITIGATION_MAINNET = 3_363_426;

/** NU6.2, 1,174 blocks after the mitigation. ZIP 257; 01-contemporary-zcash.md:149, `high`. */
export const NU6_2_ACTIVATION_MAINNET = 3_364_600;

/**
 * NU6.3 "Ironwood", 28 July 2026, ~13:00 UTC.
 *
 * ZIP 258; docs/2.0/research/01-contemporary-zcash.md:215, `high`. Two things
 * start here and both are load-bearing for this project:
 *
 *   The Ironwood pool is born, at a balance of zero. It is not new
 *   cryptography - it reuses Orchard's Halo 2 circuit with the bug fixed, on
 *   the same Pallas curve - but it has its own note commitment tree, its own
 *   nullifier set and its own chain value pool, which is why it is a fourth
 *   pool here and not a flag on the third.
 *
 *   Orchard becomes exit-only under ZIP 2006: no new value may enter it. That
 *   is the invariant `ValuePool` enforces from this height, and the one whose
 *   governing ZIP is still marked Reserved with its consensus text unpublished
 *   - the largest documentation gap this project's research found.
 */
export const NU6_3_ACTIVATION_MAINNET = 3_428_143;

/* --------------------------------------------------------------------------
   Testnet
   -------------------------------------------------------------------------- */

/** Sprout: genesis, as on mainnet. */
export const SPROUT_ACTIVATION_TESTNET = 0;

/**
 * Sapling activated on testnet at this height.
 *
 * UNCORROBORATED IN THIS REPOSITORY - the value appears in no research file.
 * Pre-existing, sourced by the file's original author to the protocol spec and
 * `zcashd` chainparams. Stated so rather than left to look as sourced as the
 * heights above it.
 */
export const SAPLING_ACTIVATION_TESTNET = 280_000;

/** NU5 (Orchard) activated on testnet. UNCORROBORATED here, as Sapling's is. */
export const NU5_ACTIVATION_TESTNET = 1_842_420;

/**
 * NU6.1 on testnet.
 *
 * ZIP 255; docs/2.0/research/01-contemporary-zcash.md:628, `high`, which gives
 * the mainnet and testnet heights in one sentence.
 *
 * NOT ONE OF THE THREE TESTNET NUMBERS HANDOFF-06 SUPPLIED. The contract listed
 * exactly three (4,048,500 / 4,052,000 / 4,134,000) while naming five upgrades,
 * and spreading three values across five names positionally would have written
 * this constant wrong. It is taken from the repository instead. Recorded in the
 * section 8 ledger as an INFERRED resolution.
 */
export const NU6_1_ACTIVATION_TESTNET = 3_536_500;

/**
 * The Orchard mitigation soft fork on testnet.
 *
 * ZIP 257, named explicitly in the same verbatim clause as the mainnet height:
 * "3363426 (Mainnet) or 4048500 (Testnet)". This pairing is stated, not
 * inferred.
 */
export const ORCHARD_MITIGATION_TESTNET = 4_048_500;

/**
 * NU6.2 on testnet.
 *
 * ZIP 257; docs/2.0/research/01-contemporary-zcash.md:149 gives the pair
 * "testnet 4,048,500 and 4,052,000" in the same order as the mainnet pair it
 * follows. The repository never writes "testnet NU6.2 = 4,052,000" in a
 * sentence of its own, so this mapping is CORROBORATED BY ORDERING rather than
 * by statement - reinforced by the fact that its partner, 4,048,500, is pinned
 * to the mitigation independently. Recorded in the section 8 ledger.
 */
export const NU6_2_ACTIVATION_TESTNET = 4_052_000;

/** NU6.3 "Ironwood" on testnet. ZIP 258; 01-contemporary-zcash.md:216, `high`. */
export const NU6_3_ACTIVATION_TESTNET = 4_134_000;

/*
 * THERE IS DELIBERATELY NO `NU6_ACTIVATION_TESTNET`.
 *
 * No line anywhere in this repository gives a testnet activation height for
 * NU6, and the three testnet numbers the handoff supplied account for the
 * mitigation, NU6.2 and NU6.3 - none of them is NU6's. Writing a plausible
 * number here would be indistinguishable, to every later reader, from a
 * sourced one. Nothing in this handoff needs it: `poolsActiveAt` turns on
 * Sapling, NU5 and NU6.3 only, because NU6 and NU6.1 introduce no pool.
 */

/* --------------------------------------------------------------------------
   Which pools exist at a height
   -------------------------------------------------------------------------- */

/** The heights at which each pool comes into existence, per network. */
const POOL_BIRTH: Readonly<Record<Network, Readonly<Record<PoolName, number>>>> = {
  mainnet: {
    sprout: SPROUT_ACTIVATION_MAINNET,
    sapling: SAPLING_ACTIVATION_MAINNET,
    orchard: NU5_ACTIVATION_MAINNET,
    ironwood: NU6_3_ACTIVATION_MAINNET,
  },
  testnet: {
    sprout: SPROUT_ACTIVATION_TESTNET,
    sapling: SAPLING_ACTIVATION_TESTNET,
    orchard: NU5_ACTIVATION_TESTNET,
    ironwood: NU6_3_ACTIVATION_TESTNET,
  },
};

/** Chronological order, which is also the order every pool list is rendered in. */
const POOL_ORDER: readonly PoolName[] = ["sprout", "sapling", "orchard", "ironwood"];

/**
 * The pools that exist at `height`, in activation order.
 *
 * "Exist" means the pool has a commitment tree, a nullifier set and a balance
 * at this height - not that value can still enter it. Orchard is reported from
 * NU5 onward including after NU6.3, because an exit-only pool holding 700k ZEC
 * is emphatically still a pool: its balance belongs in the supply
 * reconciliation and its outflows are the migration this project measures.
 * `ValuePool` is where the exit-only direction is enforced; this function is
 * about presence.
 *
 * Activation is inclusive of the activation block, matching the protocol's own
 * "from block height N onward".
 */
export function poolsActiveAt(height: number, network: Network = "mainnet"): PoolName[] {
  const births = POOL_BIRTH[network];
  return POOL_ORDER.filter((pool) => height >= births[pool]);
}

/** Whether one pool exists at `height`. The single-pool form of `poolsActiveAt`. */
export function isPoolActiveAt(
  pool: PoolName,
  height: number,
  network: Network = "mainnet",
): boolean {
  return height >= POOL_BIRTH[network][pool];
}

/**
 * The height from which Orchard is exit-only on `network`, per ZIP 2006.
 *
 * Read by `ValuePool` so the invariant and the height it turns on cannot drift
 * apart in two files.
 */
export function orchardExitOnlyFrom(network: Network = "mainnet"): number {
  return network === "mainnet" ? NU6_3_ACTIVATION_MAINNET : NU6_3_ACTIVATION_TESTNET;
}
