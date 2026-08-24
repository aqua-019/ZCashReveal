/**
 * Network-upgrade activation heights, and which pools exist at a given height.
 *
 * Callers gate pool replay on these rather than on the absence of a
 * commitment-tree root in an RPC response: a pre-activation block carries no
 * root for the not-yet-active pool, and "the field was missing" and "the pool
 * did not exist yet" are different facts that must not be conflated.
 *
 * PROVENANCE. Every height NU6 and later carries a citation to the line in
 * `docs/2.0/research/` that corroborates it, each at `high` confidence. Line
 * numbers move when the corpus is edited, so each also names the section it
 * lives in, and all of them are consolidated in one table at
 * `docs/2.0/research/01-contemporary-zcash.md:60`, "Network-upgrade activation
 * heights" - which exists because reading a height out of an ordered pair in a
 * sentence is how testnet NU6.2 came to be recorded here as ordering-derived.
 *
 * The four pre-NU6 values - Sapling and NU5, mainnet and testnet - were already
 * here and carry no per-constant citation. The two MAINNET ones are corroborated
 * in this repository (Sapling 419,200 and NU5 1,687,104 both appear across the
 * research corpus); the two TESTNET ones are NOT, and the file's original author
 * sourced all four to the Zcash protocol spec and `zcashd` chainparams, which
 * are not here either. That sourcing is restated rather than dropped, so those
 * two cannot pass as corroborated alongside the cited ones below.
 *
 * THE TWO TESTNET HEIGHTS NOW APPEAR IN THE CORPUS, AND THAT IS NOT
 * CORROBORATION. Until HANDOFF-07 they appeared nowhere in this tree except in
 * this file and the test that pins these constants - which is the carve-out the
 * corpus note makes and an earlier draft of this paragraph dropped. HANDOFF-07 added the consolidated activation table, which
 * carries 280,000 and 1,842,420 at `01-contemporary-zcash.md:66` and `:67`
 * marked *(uncorroborated)* - a transcription of these same two constants, made
 * by the session that wrote the table, from no source but this file. Reading
 * them back out of it and citing the line would be this project's own claim
 * returning as its own evidence. The corpus note under that table says the same
 * thing from the other side and names this file; a gate round found the
 * correction had landed there and not here, which is the failure mode
 * CLAUDE.md rates HIGH - two files, one fact, and only one of them corrected.
 *
 * TWO KINDS OF CITATION LIVE HERE AND THEY ARE NOT INTERCHANGEABLE. Most
 * constants cite a line of `docs/2.0/research/`, which is this repository's
 * transcription of a source. Four of them - NU6 testnet, NU6.1 testnet, NU6.2
 * testnet and the two mitigation heights - cite the ZIP ITSELF, read by L2 and
 * relayed in the HANDOFF-06 resolution, because the corpus either did not carry
 * the height or carried it in a form that had to be inferred. A session in this
 * container cannot re-read a ZIP: `zips.z.cash` is refused by the egress proxy
 * (`CONNECT tunnel failed, response 403`), which is the same wall CLAUDE.md
 * records in front of preview hosts. Where a constant says "ZIP NNN (Final)
 * states", the provenance is L2's read, not this session's.
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
 * ZIP 255; docs/2.0/research/01-contemporary-zcash.md:28 (the dated-facts table),
 * `high`. This is the
 * one height in this file that is also committed as content data and covered by
 * a test - packages/content/data/cases.json and its suite pin 3,146,400.
 */
export const NU6_1_ACTIVATION_MAINNET = 3_146_400;

/**
 * The Orchard mitigation soft fork.
 *
 * ZIP 257, quoted verbatim in docs/2.0/research/01-contemporary-zcash.md:168 (§1.4):
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

/** NU6.2, 1,174 blocks after the mitigation. ZIP 257; 01-contemporary-zcash.md:172 (§1.4), `high`. */
export const NU6_2_ACTIVATION_MAINNET = 3_364_600;

/**
 * NU6.3 "Ironwood", 28 July 2026, ~13:00 UTC.
 *
 * ZIP 258; docs/2.0/research/01-contemporary-zcash.md:240 (§2.1), `high`, and the
 * consolidated activation table at :60.
 *
 * ZIP 258 IS DRAFT, NOT FINAL - see {@link IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP}
 * below, which every Ironwood height in this project is bound by.
 *
 * Two things start here and both are load-bearing for this project:
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
 * UNCORROBORATED IN THIS REPOSITORY. It appears in one research file - the
 * activation table at `01-contemporary-zcash.md:66`, marked *(uncorroborated)*
 * there - and that row was transcribed FROM THIS CONSTANT in HANDOFF-07, so
 * citing it here would be circular. Pre-existing, sourced by the file's
 * original author to the protocol spec and `zcashd` chainparams, neither of
 * which is in this repository. Stated so rather than left to look as sourced as
 * the heights above it.
 */
export const SAPLING_ACTIVATION_TESTNET = 280_000;

/**
 * NU5 (Orchard) activated on testnet.
 *
 * UNCORROBORATED here on exactly Sapling's terms, and the sourcing is written
 * out rather than cross-referenced: the protocol specification and `zcashd`
 * chainparams, per the file's original author, neither present in this
 * repository. Its one appearance in the corpus is the same transcribed table
 * row (`01-contemporary-zcash.md:67`, marked *(uncorroborated)*).
 *
 * The cross-reference form this replaces - "UNCORROBORATED here, as Sapling's
 * is" - named no source at all, so the corpus note claiming this file states
 * the sourcing at each of the two testnet constants was true of one of them.
 */
export const NU5_ACTIVATION_TESTNET = 1_842_420;

/**
 * NU6.1 on testnet.
 *
 * ZIP 255 (Final) STATES BOTH HEIGHTS UNDER NU6.1's OWN HEADING - "Testnet:
 * 3536500" and "Mainnet: 3146400" - which L2 confirmed against the ZIP in the
 * HANDOFF-06 resolution. The corpus agrees at
 * docs/2.0/research/01-contemporary-zcash.md:653 (§7.2), `high`, which gives the pair
 * in one sentence.
 *
 * NOT ONE OF THE THREE TESTNET NUMBERS HANDOFF-06 SUPPLIED. The contract listed
 * exactly three (4,048,500 / 4,052,000 / 4,134,000) while naming five upgrades,
 * and spreading three values across five names positionally would have written
 * this constant wrong. It was taken from the repository instead, and L2 then
 * confirmed it from the ZIP. Recorded in the section 8 ledger as an INFERRED
 * resolution that is now closed.
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
 * ZIP 257 (Final) STATES IT. The ZIP prints "Testnet: 4052000" and "Mainnet:
 * 3364600" under NU6.2's own heading, separately from the mitigation clause
 * quoted at ORCHARD_MITIGATION_MAINNET above - so this height is stated, not
 * derived from the order of a pair.
 *
 * IT WAS CARRIED HERE AS ORDERING-DERIVED UNTIL THE HANDOFF-06 RESOLUTION, and
 * the correction is worth keeping visible because the constant did not change:
 * only its provenance did, from weak to strong. HANDOFF-06 read
 * docs/2.0/research/01-contemporary-zcash.md:172 (§1.4), which compressed two
 * separately-labelled ZIP 257 heights into one ordered clause, and correctly
 * refused to claim more than the corpus supported. L2 went to the ZIP. That
 * corpus line is corrected in the same commit as this docblock, so the
 * ambiguity is not left for the next reader to inherit.
 */
export const NU6_2_ACTIVATION_TESTNET = 4_052_000;

/**
 * NU6.3 "Ironwood" on testnet. ZIP 258; 01-contemporary-zcash.md:241 (§2.1), `high`.
 *
 * ZIP 258 IS DRAFT - see {@link IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP}.
 */
export const NU6_3_ACTIVATION_TESTNET = 4_134_000;

/**
 * NU6 on testnet.
 *
 * ZIP 253 (Final) states "Testnet: 2976000";
 * docs/2.0/research/01-contemporary-zcash.md:68, the consolidated activation
 * table, `high`.
 *
 * THIS CONSTANT WAS DELIBERATELY ABSENT UNTIL THE HANDOFF-06 RESOLUTION, and
 * the reason it was absent is the reason it can exist now. No line anywhere in
 * this repository gave a testnet activation height for NU6, and the three
 * testnet numbers HANDOFF-06's contract supplied accounted for the mitigation,
 * NU6.2 and NU6.3, none of them NU6's. Writing a plausible number then would
 * have been indistinguishable, to every later reader, from a sourced one, so
 * the file carried a comment saying why it was missing instead. L2 read ZIP 253
 * and relayed the height, and the same commit that adds this constant adds the
 * height to the corpus - so the citation above is a real line rather than a
 * forward reference to something only L2 has seen.
 *
 * NOTHING IN THIS FILE'S POOL LOGIC READS IT. `poolsActiveAt` turns on Sapling,
 * NU5 and NU6.3 only, because NU6 and NU6.1 introduce no pool. It is exported
 * so that the testnet upgrade list is complete and a later caller does not have
 * to rediscover it.
 */
export const NU6_ACTIVATION_TESTNET = 2_976_000;

/* --------------------------------------------------------------------------
   The draft-ZIP dependency
   -------------------------------------------------------------------------- */

/**
 * EVERY IRONWOOD HEIGHT IN THIS PROJECT RESTS ON A ZIP THAT CAN STILL MOVE.
 *
 * ZIP 258 ("Deployment of the NU6.3 Network Upgrade") is status **DRAFT**, not
 * Final, and it was Draft when NU6.3 activated - which the research corpus
 * notes as a governance-hygiene observation
 * (docs/2.0/research/01-contemporary-zcash.md:243, §2.1). Draft means the document
 * may be edited: a height in it is not frozen the way ZIP 253's, 255's and
 * 257's are.
 *
 * WHAT MOVES IF IT MOVES. {@link NU6_3_ACTIVATION_MAINNET} 3,428,143 and
 * {@link NU6_3_ACTIVATION_TESTNET} 4,134,000; through them, the Ironwood row of
 * `POOL_BIRTH` and therefore every answer `poolsActiveAt` and
 * `isPoolActiveAt` give about Ironwood; `orchardExitOnlyFrom`, and with it the
 * height at which `ValuePool` starts throwing `ExitOnlyViolation` on value
 * entering Orchard; and HANDOFF-07's v6 decoder gate, which reads the same
 * heights to decide whether a v6 transaction is possible at all.
 *
 * WHAT DOES NOT MOVE. The activation happened, at a real height, and the chain
 * is the authority on that. This is a documentation risk, not a chain risk: if
 * the ZIP is edited, the constants here would be found wrong against a node
 * rather than the chain being found wrong against the constants. The mitigation
 * is that HANDOFF-10's captured mainnet fixture will pin the height to observed
 * chain data, at which point this dependency closes.
 *
 * Tracked as a standing DEFERRED entry in `handoffs/LEDGER.md` (L2 RESOLUTION -
 * HANDOFF-06, fold 2). This constant exists to be the thing a grep for
 * "ZIP 258" lands on; it is not read by any code, and deliberately so - a
 * boolean that code branched on would invite someone to "handle" a draft ZIP,
 * and there is nothing to handle until the ZIP changes.
 */
export const IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP = "ZIP 258, status Draft" as const;

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
