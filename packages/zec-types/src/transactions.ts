/**
 * Branded hex string. Construct only via `asHex()` at RPC deserialization
 * boundaries — never with a bare type assertion. Lowercase or uppercase
 * digits are accepted; no `0x` prefix; non-empty.
 */
export type Hex = string & { readonly __brand: "Hex" };

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Validate and brand a raw string as Hex. Throws TypeError if `s` is empty
 * or contains non-hex characters. This is the only sanctioned way to enter
 * the Hex type from untrusted input.
 */
export function asHex(s: string): Hex {
  if (!HEX_PATTERN.test(s)) {
    const preview = s.length > 32 ? `${s.slice(0, 32)}...(${s.length} chars)` : s;
    throw new TypeError(`asHex: not a hex string: "${preview}"`);
  }
  return s as Hex;
}

/** Type guard for Hex without throwing. */
export function isHex(s: string): s is Hex {
  return HEX_PATTERN.test(s);
}

export type Zatoshi = bigint;

export interface RpcVin {
  txid?: Hex | undefined;
  vout?: number | undefined;
  scriptSig?: { asm: string; hex: Hex } | undefined;
  sequence: number;
  coinbase?: Hex | undefined;
}

export interface RpcVout {
  value: number;
  valueZat: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: Hex;
    reqSigs?: number | undefined;
    type: string;
    addresses?: string[] | undefined;
  };
}

export interface RpcSaplingSpend {
  cv: Hex;
  anchor: Hex;
  nullifier: Hex;
  rk: Hex;
  proof: Hex;
  spendAuthSig: Hex;
}

export interface RpcSaplingOutput {
  cv: Hex;
  cmu: Hex;
  ephemeralKey: Hex;
  encCiphertext: Hex;
  outCiphertext: Hex;
  proof: Hex;
}

export interface RpcOrchardAction {
  cv: Hex;
  nullifier: Hex;
  rk: Hex;
  cmx: Hex;
  ephemeralKey: Hex;
  encCiphertext: Hex;
  outCiphertext: Hex;
  spendAuthSig: Hex;
}

/**
 * An Orchard-shaped bundle as `getrawtransaction` and `getblock` verbosity 2
 * render it.
 *
 * FOUR FIELDS ARE OPTIONAL BECAUSE ZEBRA OMITS THEM. `flags`, `anchor`, `proof`
 * and `bindingSig` all carry `skip_serializing_if = "Option::is_none"` on
 * Zebra's `Orchard` struct (zebra-rpc/src/methods/types/transaction.rs, 6.3.0
 * at 1c9b245), and Zebra emits the `orchard` key UNCONDITIONALLY - with an
 * empty action list and zero balances - even for a pre-NU5 coinbase. So the
 * presence of the bundle says nothing, only `actions.length` does, and for the
 * majority of transactions these four are simply absent.
 *
 * They were declared required until HANDOFF-05, which is how `decodeOrchardBundle`
 * came to read `undefined` out of `anchor` and assign it to a field it types as
 * `Hex | null`. Correcting the declaration is what made that visible; the
 * decoder now coalesces. Nothing in the analysis changed - the value it stored
 * for such a transaction was already absent, it was merely spelled `undefined`
 * where the type said `null`.
 */
export interface RpcOrchardBundle {
  actions: RpcOrchardAction[];
  flags?:
    | {
        enableSpends: boolean;
        enableOutputs: boolean;
      }
    | undefined;
  valueBalanceZat: number;
  anchor?: Hex | undefined;
  proof?: Hex | undefined;
  bindingSig?: Hex | undefined;
}

/**
 * The Ironwood bundle, as `getrawtransaction` and `getblock` verbosity 2 render it.
 *
 * AN ALIAS RATHER THAN A TWIN, BECAUSE THE WIRE MAKES NO DISTINCTION. Zebra
 * serialises the same `Orchard` struct for both bundles - `packages/zebra-rpc`
 * validates `ironwood` with `rpcOrchardBundleSchema`, from HANDOFF-05's read of
 * Zebra 6.3.0 at commit 1c9b2450 - so declaring a structurally identical
 * `RpcIronwoodBundle` interface would invent a difference the response does not
 * have, and the two would drift the first time anyone edited one of them.
 *
 * WHAT IS GENUINELY DIFFERENT ABOUT IRONWOOD IS NOT IN THIS JSON. ZIP 2005
 * gives every Ironwood output note the quantum-recoverable note plaintext
 * format, lead byte `0x03` where Orchard's is `0x02`, and re-derives the note
 * randomness commitment over all note fields. That lives inside
 * `encCiphertext`, which this project never decrypts without a viewing key
 * (Mode A, client-side only), so it is invisible at this layer by design.
 *
 * THE DISTINCTION THAT DOES MATTER IS MADE ON THE DECODED SIDE.
 * `DecodedIronwoodAction` carries `pool: "ironwood"` against
 * `DecodedOrchardAction`'s `pool: "orchard"`, so once a bundle has been through
 * the decoder the four-pool model cannot confuse them - which is the layer
 * where confusing them would matter, since Orchard is exit-only from NU6.3 and
 * Ironwood is where the value goes.
 */
export type RpcIronwoodBundle = RpcOrchardBundle;

/**
 * One JoinSplit description, as `getrawtransaction` renders it.
 *
 * DECLARED HERE SINCE HANDOFF-06 BECAUSE FOUR CALL SITES WERE READING IT
 * THROUGH `as unknown as`. Sprout's movement is not a `valueBalance` field: each
 * JoinSplit carries `vpub_old`, the value it takes out of the transparent pool
 * and puts into Sprout, and `vpub_new`, the value it releases back, so Sprout's
 * contribution in the `valueBalance` sign convention is `vpub_new - vpub_old`
 * summed over these. An undeclared field read through a cast is the exact shape
 * of the `expiryheight` defect HANDOFF-05 found: the cast agrees with whatever
 * the author typed and the wire is never consulted.
 *
 * The `Zat` suffixed fields are the integer ones. The unsuffixed `vpub_old` and
 * `vpub_new` are ZEC floats (Zebra 6.3.0, types/transaction.rs `JoinSplit`) and
 * are declared so that reading the wrong one is a type error rather than a
 * hundred-million-fold mistake.
 */
export interface RpcJoinSplit {
  vpub_old?: number | undefined;
  vpub_new?: number | undefined;
  vpub_oldZat?: number | undefined;
  vpub_newZat?: number | undefined;
  anchor?: Hex | undefined;
  nullifiers?: Hex[] | undefined;
  commitments?: Hex[] | undefined;
  onetimePubKey?: Hex | undefined;
  randomSeed?: Hex | undefined;
  macs?: Hex[] | undefined;
  proof?: Hex | undefined;
  ciphertexts?: Hex[] | undefined;
}

export interface RpcTransaction {
  txid: Hex;
  hash?: Hex | undefined;
  version: number;
  /** The wire spells this `versiongroupid`; mapped at the RPC boundary, as `expiryHeight` is. */
  versionGroupId?: Hex | undefined;
  locktime: number;
  /**
   * ZIP 203 expiry height.
   *
   * THE WIRE SPELLS THIS `expiryheight`, ALL LOWERCASE. zcashd and Zebra both
   * do (Zebra 6.3.0, types/transaction.rs `expiry_height` renamed to
   * `expiryheight`), and this camelCase name has never matched a byte of a real
   * response - so `leak-analyzer.ts` read `undefined` here for every
   * transaction, and every fingerprint that keys on the expiry delta was dead
   * against a node. `packages/zebra-rpc` now maps the wire spelling onto this
   * name at the RPC boundary, which is the only place that knows both. See
   * HANDOFF-05 section 7.
   */
  expiryHeight?: number | undefined;
  /** Optional because Zebra marks it so; nothing in 2.0 reads it. */
  size?: number | undefined;
  vsize?: number | undefined;
  weight?: number | undefined;
  vin: RpcVin[];
  vout: RpcVout[];
  /**
   * Sprout.
   *
   * ABSENT FOR TWO DIFFERENT REASONS AND THEY MUST NOT COLLAPSE INTO ONE. The
   * ordinary one: the transaction carries no JoinSplit, which is nearly all of
   * them. The other: Zebra serialises this field only from
   * ZcashFoundation/zebra PR #9805 (merged 22 Aug 2025), so a node older than
   * that omits it on every transaction, including ones that DO carry
   * JoinSplits. `undefined` therefore means "no JoinSplits" on a version that
   * cannot carry them and "unknown" on versions 2 to 4.
   *
   * `joinSplitObservability` in `@zcashreveal/zebra-rpc` is the function that
   * tells the two apart; do not decide it by reading this field's truthiness.
   */
  vjoinsplit?: RpcJoinSplit[] | undefined;
  vShieldedSpend?: RpcSaplingSpend[] | undefined;
  vShieldedOutput?: RpcSaplingOutput[] | undefined;
  valueBalanceZat?: number | undefined;
  bindingSig?: Hex | undefined;
  orchard?: RpcOrchardBundle | undefined;
  /**
   * The Ironwood bundle. Present only on v6 transactions, and only from NU6.3.
   *
   * DECLARED SINCE HANDOFF-07, AND TWO CALL SITES WERE READING IT THROUGH
   * `as unknown as` BEFORE THAT. `zip317LogicalActions` and its P2PKH
   * approximation both counted `(tx as unknown as { ironwood?: ... })` because
   * this interface did not carry the field. That is the construct HANDOFF-06
   * removed for `vjoinsplit` and HANDOFF-05 traced the `expiryheight` defect
   * to: a cast agrees with whatever the author typed and the wire is never
   * consulted. The field is validated at the RPC boundary
   * (`packages/zebra-rpc`), so the declaration and the wire are checked against
   * each other in exactly one place.
   *
   * ABSENT ON EVERY PRE-v6 TRANSACTION, which is nearly all of them, and
   * `decodeIronwoodBundle` returns an empty decode for `undefined` rather than
   * throwing - the same contract `decodeOrchardBundle` has, for the same reason:
   * Zebra emits pool bundles unconditionally on the versions that have them and
   * not at all on the versions that do not, so absence is ordinary.
   */
  ironwood?: RpcIronwoodBundle | undefined;
  time?: number | undefined;
  /**
   * NO NODE SENDS A FEE, AND THESE TWO FIELDS ARE KEPT ONLY TO SAY SO.
   *
   * Zebra's `TransactionObject` has no fee field (6.3.0, types/transaction.rs,
   * scanned in full) and neither does zcashd's `getrawtransaction`: the fee is
   * the difference between the outputs a transaction spends and what it pays
   * out, and the spent outputs are not in the response. Reading `tx.feeZat`
   * therefore yields `undefined` for every transaction from every node, which
   * is how `BigInt(tx.feeZat ?? 0)` produced a fee of `0n` for every
   * transaction this project ever analysed.
   *
   * Compute the fee with `computeFeeZat` in the indexer, which resolves the
   * previous outputs. Do not read these. They stay declared because deleting
   * them would let a future author reintroduce the field believing it arrives.
   *
   * @deprecated Never populated by Zebra or zcashd. Use `computeFeeZat`.
   */
  fee?: number | undefined;
  /** @deprecated Never populated by Zebra or zcashd. Use `computeFeeZat`. */
  feeZat?: number | undefined;
  blockhash?: Hex | undefined;
  confirmations?: number | undefined;
  /**
   * The height of the block containing this transaction.
   *
   * -1 for a transaction on a side chain, and ABSENT for one still in the
   * mempool (Zebra 6.3.0, types/transaction.rs). Not coerced to 0 anywhere: a
   * transaction recorded at height 0 would be recorded as being in the genesis
   * block.
   */
  height?: number | undefined;
  /** The containing block's time. Absent in the mempool, where `time` is the seen time. */
  blocktime?: number | undefined;
}

export interface MempoolEntry {
  txid: Hex;
  seenAt: number;
  height?: number | undefined;
  raw: RpcTransaction;
}
