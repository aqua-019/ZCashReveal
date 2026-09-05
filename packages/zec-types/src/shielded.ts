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
 * from NU6.3. See `@zcashreveal/instruments`' `activation-heights.ts` for the
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

/**
 * One pool, one letter, and the SINGLE source of that mapping for the repository.
 *
 * ============================================================================
 * WHY IT IS HERE AND NOT IN THE PRODUCER THAT WRITES IT
 * ============================================================================
 * `apps/gateway`'s `migrationFlowText` writes a migration's direction onto the
 * wire as `"<initial> to <initial>"` - `"O to I"` for the ZIP 318 crossing,
 * `"I to O"` for its reverse - and `apps/web`'s live plane reads that string to
 * decide which way the arc points. Two processes, one encoding, and until this
 * constant existed the encoding was written down on ONE side only: the gateway
 * had a private `poolInitial` switch and the browser had nothing.
 *
 * That is the seam shape CLAUDE.md records this project finding four times
 * (LEDGER-11): two ends agreeing about a TYPE and disagreeing about the WIRE,
 * each with passing tests, because each built its own input. A letter map that
 * lives in one file and is imported by both ends cannot drift; a letter map
 * copied into a reader would be the fifth instance rather than a fix for the
 * fourth.
 *
 * SPROUT IS `P`, WHICH IS NOT A TYPO. Sprout and Sapling both begin with S, so
 * one of them cannot have its own initial. The corpus settled this before the
 * gateway did - `apps/web/src/lib/api/fixtures/mempool.ts` states "O, I, S, P
 * for Orchard, Ironwood, Sapling and Sprout" over the column that prints these
 * four pools - and the mapping is taken from there rather than invented.
 *
 * THE BROWSER READS THESE LETTERS AND DOES NOT IMPORT THIS OBJECT, WHICH IS
 * MEASURED RATHER THAN PREFERRED. `apps/web`'s live plane keeps a local inverse
 * (`POOL_FOR_INITIAL` in `lib/live-plane.ts`) because importing anything by
 * VALUE from this package's barrel pulls zod into the client bundle: measured
 * by building the splash route both ways on one variable, 5.5 kB route JS and
 * 118 kB first load against 21.4 kB and 133 kB - the same 15 kB
 * `apps/web/src/lib/api/stream.ts`'s own header records paying to keep out.
 *
 * A copy is a drift risk and it is closed by a TEST rather than by a comment:
 * `apps/web/test/unit/live-plane.test.ts` imports this object and asserts the
 * browser's map is exactly its inverse, ITERATING THESE KEYS, so a fifth pool
 * added here fails there rather than silently going unparsed on the wire.
 */
export const POOL_INITIAL: Readonly<Record<ShieldedPool, string>> = {
  sprout: "P",
  sapling: "S",
  orchard: "O",
  ironwood: "I",
};

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
 * One Ironwood action.
 *
 * STRUCTURALLY IDENTICAL TO {@link DecodedOrchardAction} AND DELIBERATELY NOT
 * AN ALIAS OF IT. Zebra serialises the same struct for both bundles, so the RPC
 * types share one declaration (`RpcIronwoodBundle` aliases `RpcOrchardBundle`);
 * on the DECODED side the pools must not be interchangeable, because Orchard is
 * exit-only from NU6.3 and Ironwood is where the value it loses goes. The
 * literal `pool` field is what makes a mixed-up array a type error rather than a
 * silently wrong migration.
 *
 * Ironwood reuses Orchard's Halo 2 circuit on the same Pallas curve, with the
 * soundness bug fixed (docs/2.0/research/01-contemporary-zcash.md §2.2), which
 * is why the action shape is the same: an action is simultaneously a spend and
 * an output, publishing a nullifier and a cmx together. What ZIP 2005 changes -
 * the quantum-recoverable note plaintext, lead byte `0x03` - is inside
 * `encCiphertext`, which this project never decrypts without a viewing key, so
 * nothing here can see it and nothing here claims to.
 */
export interface DecodedIronwoodAction {
  pool: "ironwood";
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
 * four-pool decoded spend or output type, and there cannot be one: Orchard's
 * and Ironwood's units are ACTIONS, each simultaneously a spend and an output,
 * so neither has a spend type or an output type to unify with Sapling's. Sprout
 * has no decoded structure at all. Kept as aliases because callers import them;
 * do not read the name as a promise about the union.
 */
export type DecodedShieldedSpend = DecodedSaplingSpend;
export type DecodedShieldedOutput = DecodedSaplingOutput;

/**
 * What the decoder extracted from a transaction's shielded bundles.
 *
 * THREE POOLS ARE DECODED HERE, NOT FOUR, AND THE FOURTH IS ABSENT FOR A
 * DIFFERENT REASON THAN IT USED TO BE. Through HANDOFF-06 the gap was Ironwood:
 * its bundle is a v6 field, decoding v6 was out of scope, and an
 * `ironwoodActions: []` that was always empty would have been a hardcoded zero
 * the site renders as a fact. HANDOFF-07 decodes it, so the four fields below
 * carry a measurement - `ironwoodActions: []` now means the transaction had no
 * Ironwood bundle, which is a fact about the transaction rather than about this
 * codebase.
 *
 * SPROUT IS THE ONE STILL MISSING, AND IT ALWAYS WILL BE. Sprout's movement is
 * not a bundle at all: it is `vpub_new - vpub_old` summed over the JoinSplits,
 * which the analyser computes onto
 * `ValueBalanceAnnotation.sproutValueBalanceZat` without a decoded structure.
 * There is nothing to decode, so there is no field here to add.
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
  /** Decoded since HANDOFF-07. Empty means the transaction carried no Ironwood bundle. */
  ironwoodActions: DecodedIronwoodAction[];
  ironwoodValueBalanceZat: Zatoshi;
  ironwoodAnchor: Hex | null;
  ironwoodFlags: {
    enableSpends: boolean;
    enableOutputs: boolean;
  } | null;
}
