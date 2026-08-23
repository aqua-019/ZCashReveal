/**
 * Zod schemas for every Zebra JSON-RPC result this project reads.
 *
 * READ FROM THE SOURCE, NOT FROM THE DOCS. Every shape below was taken from
 * Zebra 6.3.0 at commit 1c9b2450349b53232e2787bef62dd0e21b10e041 (2026-08-22) -
 * `zebra-rpc/src/methods.rs`, `zebra-rpc/src/methods/types/*.rs`, and the
 * `insta` snapshots under `zebra-rpc/src/methods/tests/snapshots/`, which are
 * the actual serialised JSON and therefore the best evidence of wire shape.
 * That mattered: four of Zebra's own doc comments contradict its
 * (de)serialisation code, and a client written against the comments would
 * mis-parse. Each is recorded at the schema it affects.
 *
 * WHY VALIDATE AT ALL. CLAUDE.md: "`Hex` is branded and validated at the RPC
 * boundary." This file is that boundary. Nothing downstream re-checks that a
 * txid is hex or that a height is a non-negative integer, because everything
 * downstream is handed a value that has already been through here.
 *
 * WHY PASSTHROUGH. Every object schema keeps unknown keys rather than stripping
 * them. Zebra emits fields this project has no use for today - `authdigest`,
 * `vjoinsplit`, the `ironwood` bundle, `trees` - and a later handoff will want
 * them. Stripping would mean a decoder that silently sees no Ironwood bundle on
 * a chain that has one. Validation here means "these fields are present and
 * well-formed", never "these are the only fields".
 */
import { z } from "zod";
import { asHex, type Hex } from "@zcashreveal/types";

/* ============================================================================
   Primitives
   ========================================================================== */

/**
 * Hex as it arrives from the node, branded on the way through.
 *
 * Zebra emits lowercase, but `asHex` accepts either case and so does this: a
 * client that rejects a valid response because a future Zebra changed its
 * casing would be failing for the wrong reason. Lowercasing is the CALLER's
 * job where a lowercase-only invariant matters (CLAUDE.md's wire convention),
 * and `hexLower` below is that.
 */
export const hexSchema: z.ZodType<Hex, z.ZodTypeDef, unknown> = z
  .string()
  .regex(/^[0-9a-fA-F]+$/, "hex carries no 0x prefix and no other characters")
  .transform((s) => asHex(s));

/** Hex, normalised to the lowercase form CLAUDE.md fixes for anything stored or served. */
export const hexLowerSchema: z.ZodType<Hex, z.ZodTypeDef, unknown> = z
  .string()
  .regex(/^[0-9a-fA-F]+$/, "hex carries no 0x prefix and no other characters")
  .transform((s) => asHex(s.toLowerCase()));

/** A 32-byte identifier: block hash, txid, nullifier, commitment. */
export const hash32Schema: z.ZodType<Hex, z.ZodTypeDef, unknown> = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "a 32-byte identifier is 64 hex characters")
  .transform((s) => asHex(s.toLowerCase()));

/** A block height. A count, so `number` (CLAUDE.md). */
export const heightSchema = z.number().int().nonnegative();

/**
 * A zatoshi amount arriving as a JSON number, converted to `bigint`.
 *
 * CLAUDE.md fixes `bigint` for zatoshi and this is where the conversion
 * happens, once. The guard is not ceremony: Zebra serialises these as JSON
 * numbers, so anything non-integral means either a field that is actually ZEC
 * (Zebra has several, and at least one is documented as zatoshi while being
 * ZEC) or a value that has been through a double. Both are bugs to surface
 * here rather than to round away.
 *
 * The whole money supply, 21e6 ZEC, is 2.1e15 zatoshi and fits in a double's
 * exact-integer range (9.007e15), so no precision is lost in transit for a
 * chain-total figure. That is a fact about Zcash's supply cap, not a general
 * property of JSON numbers, which is why the value does not stay a number.
 */
export const zatFromNumberSchema = z
  .number()
  .refine((n) => Number.isInteger(n), "a zatoshi amount is an integer, not a decimal")
  .refine((n) => Number.isSafeInteger(n), "a zatoshi amount beyond 2^53 has already lost precision")
  .transform((n) => BigInt(n));

/* ============================================================================
   getblockchaininfo
   ========================================================================== */

/**
 * One entry of `valuePools`, or the `chainSupply` object.
 *
 * `id` is omitted when empty, which is exactly how `chainSupply` differs from a
 * pool entry - same struct, no id. `valueDelta` / `valueDeltaZat` appear only
 * inside `getblock`'s copy of this array, never in `getblockchaininfo`.
 *
 * Source: zebra-rpc/src/methods/types/get_blockchain_info.rs:15-37,
 * snapshot get_blockchain_info@mainnet_10.snap.
 */
export const valuePoolBalanceSchema = z
  .object({
    id: z.string().optional(),
    /** ZEC, as a float. Never used for arithmetic here - `chainValueZat` is. */
    chainValue: z.number(),
    chainValueZat: zatFromNumberSchema,
    monitored: z.boolean().optional(),
    valueDelta: z.number().optional(),
    valueDeltaZat: zatFromNumberSchema.optional(),
  })
  .passthrough();
export type ValuePoolBalance = z.infer<typeof valuePoolBalanceSchema>;

/**
 * `getblockchaininfo`.
 *
 * The v0.2 client declared four fields and cast the rest. This declares what
 * the tracking API actually reads and keeps the rest.
 *
 * NOTE, from the source rather than the docs: `chainwork` is a hardcoded
 * integer 0 with a doc comment claiming it is hex-encoded, and `commitments` is
 * a hardcoded 0 (methods.rs:1238-1242). Neither is read here, and neither is
 * declared, so a future Zebra that implements them cannot break this schema.
 *
 * `valuePools` carries SIX entries in 6.3.0 - transparent, sprout, sapling,
 * orchard, lockbox, ironwood - in that fixed order. The site's `LedgerLane` has
 * five: the ZIP 271 lockbox is not a pool lane. Mapping the six onto the five
 * is the gateway's job and is done explicitly there, not by dropping an entry
 * here.
 */
export const blockchainInfoSchema = z
  .object({
    chain: z.string().min(1),
    blocks: heightSchema,
    bestblockhash: hash32Schema,
    estimatedheight: heightSchema.optional(),
    verificationprogress: z.number().optional(),
    headers: heightSchema.optional(),
    difficulty: z.number().optional(),
    size_on_disk: z.number().optional(),
    valuePools: z.array(valuePoolBalanceSchema).optional(),
    chainSupply: valuePoolBalanceSchema.optional(),
  })
  .passthrough();
export type BlockchainInfo = z.infer<typeof blockchainInfoSchema>;

/* ============================================================================
   Address index
   ========================================================================== */

/**
 * `getaddressbalance`.
 *
 * ZEBRA'S OWN DOC COMMENT IS WRONG ABOUT THIS. methods.rs:248-249 says "zcashd
 * also returns the total amount of Zatoshis received by the addresses, but
 * Zebra doesn't". `GetAddressBalanceResponse` (methods.rs:3843-3861) has
 * `pub received: u64` with no skip attribute, and the snapshot
 * get_address_balance@mainnet_10.snap is `{"balance": 687500, "received":
 * 687500}`. A client that believed the comment would have had to derive
 * `received` from the transaction list, which is both slower and wrong for an
 * address whose history has been pruned from what it can page through.
 *
 * Both fields are zatoshi. `received` includes change.
 */
export const addressBalanceSchema = z
  .object({
    balance: zatFromNumberSchema,
    received: zatFromNumberSchema,
  })
  .passthrough();
export type AddressBalance = z.infer<typeof addressBalanceSchema>;

/** `getaddresstxids` returns a flat array of txid strings, in chain order. */
export const addressTxIdsSchema = z.array(hash32Schema);

/**
 * One `getaddressutxos` element.
 *
 * `outputIndex` is the only camelCase key among them, and `height` is last to
 * match zcashd's field order (methods.rs:4485-4489). Snapshot:
 * get_address_utxos@mainnet_10.snap.
 */
export const addressUtxoSchema = z
  .object({
    address: z.string().min(1),
    txid: hash32Schema,
    outputIndex: z.number().int().nonnegative(),
    script: hexLowerSchema,
    satoshis: zatFromNumberSchema,
    height: heightSchema,
  })
  .passthrough();
export type AddressUtxo = z.infer<typeof addressUtxoSchema>;

export const addressUtxosSchema = z.array(addressUtxoSchema);

/* ============================================================================
   Transactions
   ========================================================================== */

const scriptSigSchema = z.object({ asm: z.string(), hex: hexLowerSchema }).passthrough();

/**
 * One transparent input.
 *
 * Two shapes, discriminated by presence rather than by a tag: a coinbase input
 * carries `coinbase` and no outpoint, everything else carries `txid` + `vout`.
 *
 * ZEBRA NEVER POPULATES `value`, `valueSat` OR `address` ON AN INPUT
 * (types/transaction.rs:903-905, always `None`). They are declared because a
 * zcashd-shaped response would still validate, and no caller here may assume
 * them: the value an input spends has to come from the funding transaction's
 * output, which is why the address and fee projections fetch those rather than
 * reading a field that is always absent.
 */
export const rpcVinSchema = z
  .object({
    txid: hash32Schema.optional(),
    vout: z.number().int().nonnegative().optional(),
    scriptSig: scriptSigSchema.optional(),
    sequence: z.number().int().nonnegative(),
    coinbase: hexLowerSchema.optional(),
  })
  .passthrough();

/** One transparent output. `value` is ZEC, `valueZat` is zatoshi; both are always present. */
export const rpcVoutSchema = z
  .object({
    value: z.number(),
    valueZat: z.number(),
    n: z.number().int().nonnegative(),
    scriptPubKey: z
      .object({
        asm: z.string(),
        hex: hexLowerSchema,
        reqSigs: z.number().int().optional(),
        type: z.string(),
        addresses: z.array(z.string()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * A Sapling spend description. JSON keys read from
 * zebra-rpc/src/methods/types/transaction.rs `ShieldedSpend`: `spendAuthSig` is
 * renamed, the rest are the Rust field names.
 */
export const rpcSaplingSpendSchema = z
  .object({
    cv: hexLowerSchema,
    anchor: hexLowerSchema,
    nullifier: hexLowerSchema,
    rk: hexLowerSchema,
    proof: hexLowerSchema,
    spendAuthSig: hexLowerSchema,
  })
  .passthrough();

/** A Sapling output description. `ShieldedOutput` in the same file. */
export const rpcSaplingOutputSchema = z
  .object({
    cv: hexLowerSchema,
    cmu: hexLowerSchema,
    ephemeralKey: hexLowerSchema,
    encCiphertext: hexLowerSchema,
    outCiphertext: hexLowerSchema,
    proof: hexLowerSchema,
  })
  .passthrough();

/** One Orchard (or, from NU6.3, Ironwood) action. `OrchardAction` in the same file. */
export const rpcOrchardActionSchema = z
  .object({
    cv: hexLowerSchema,
    nullifier: hexLowerSchema,
    rk: hexLowerSchema,
    cmx: hexLowerSchema,
    ephemeralKey: hexLowerSchema,
    encCiphertext: hexLowerSchema,
    outCiphertext: hexLowerSchema,
    spendAuthSig: hexLowerSchema,
  })
  .passthrough();

/**
 * An Orchard-shaped bundle.
 *
 * `flags`, `anchor`, `proof` and `bindingSig` are OPTIONAL, and that is not a
 * convenience - it is what Zebra serialises. All four carry
 * `skip_serializing_if = "Option::is_none"` (types/transaction.rs, `Orchard`),
 * and Zebra emits the `orchard` key unconditionally, with an empty action list
 * and zero balances, even for a pre-NU5 coinbase. So the presence of the key
 * says nothing and only `actions.length` does.
 *
 * `RpcOrchardBundle` in packages/zec-types declared all four REQUIRED, which
 * meant `decodeOrchardBundle` read `undefined` out of a field it types as
 * `Hex | null` for every transaction without a bundle - the majority of them.
 * The type is corrected alongside this schema and the decoder now coalesces;
 * see HANDOFF-05 section 7.
 */
export const rpcOrchardBundleSchema = z
  .object({
    actions: z.array(rpcOrchardActionSchema),
    flags: z
      .object({ enableSpends: z.boolean(), enableOutputs: z.boolean() })
      .passthrough()
      .optional(),
    valueBalance: z.number().optional(),
    valueBalanceZat: z.number(),
    anchor: hexLowerSchema.optional(),
    proof: hexLowerSchema.optional(),
    bindingSig: hexLowerSchema.optional(),
  })
  .passthrough();

/**
 * `getrawtransaction` with verbosity 1, and each element of `getblock`'s `tx`
 * at verbosity 2 - Zebra serialises the same `TransactionObject` for both
 * (methods.rs:4224-4233).
 *
 * `height` is -1 for a side-chain transaction and ABSENT for one in the
 * mempool, so it is optional and may be negative. Nothing here coerces that
 * away: a caller asking "which block is this in" must be able to see the
 * answer "none yet".
 *
 * THERE IS NO `fee` FIELD. Zebra's `TransactionObject` does not carry one
 * (types/transaction.rs:268-429 scanned in full), and neither does zcashd's
 * `getrawtransaction`: a fee is a property of a transaction's inputs, and the
 * inputs' values are not in this response. Every fee this project reports is
 * either computed from the funding transactions or read from the indexer's own
 * record, and which one is always stated.
 */
export const rpcTransactionSchema = z
  .object({
    txid: hash32Schema,
    hash: hash32Schema.optional(),
    version: z.number().int(),
    overwintered: z.boolean().optional(),
    versiongroupid: hexLowerSchema.optional(),
    locktime: z.number().int().nonnegative(),
    expiryheight: z.number().int().nonnegative().optional(),
    size: z.number().int().nonnegative().optional(),
    vsize: z.number().int().nonnegative().optional(),
    weight: z.number().int().nonnegative().optional(),
    vin: z.array(rpcVinSchema),
    vout: z.array(rpcVoutSchema),
    vShieldedSpend: z.array(rpcSaplingSpendSchema).optional(),
    vShieldedOutput: z.array(rpcSaplingOutputSchema).optional(),
    valueBalance: z.number().optional(),
    valueBalanceZat: z.number().optional(),
    bindingSig: hexLowerSchema.optional(),
    orchard: rpcOrchardBundleSchema.optional(),
    /** NU6.3 and later. Same shape as `orchard`; nothing in 2.0 decodes it yet. */
    ironwood: rpcOrchardBundleSchema.optional(),
    /** -1 on a side chain, absent in the mempool. */
    height: z.number().int().optional(),
    confirmations: z.number().int().optional(),
    blockhash: hash32Schema.optional(),
    blocktime: z.number().int().optional(),
    time: z.number().int().optional(),
    hex: hexLowerSchema.optional(),
  })
  .passthrough()
  /**
   * THE WIRE AND THE PROJECT'S INTERFACE DISAGREE ON TWO NAMES, and this is
   * where they are reconciled.
   *
   * zcashd and Zebra both serialise `expiryheight` and `versiongroupid`, all
   * lowercase. `RpcTransaction` in packages/zec-types has always declared
   * `expiryHeight` and `versionGroupId`, so those two properties were
   * `undefined` for every transaction that ever came off a node - and
   * `leak-analyzer.ts` reads `tx.expiryHeight` to compute the expiry delta that
   * `fingerprint.ts` keys the zcashd-default wallet tell on (a delta of 35 to
   * 50 blocks). That tell has therefore never fired against a real node.
   *
   * The mapping is done HERE rather than by renaming the interface, because
   * this is the only layer that knows both spellings, and because renaming the
   * field would change the analysis rather than repair its input. Both names
   * are present on the output: the wire spelling because that is what arrived,
   * the camelCase one because that is what the decoder reads.
   */
  .transform((tx) => ({
    ...tx,
    ...(tx.expiryheight === undefined ? {} : { expiryHeight: tx.expiryheight }),
    ...(tx.versiongroupid === undefined ? {} : { versionGroupId: tx.versiongroupid }),
  }));
export type RpcTransactionObject = z.infer<typeof rpcTransactionSchema>;

/* ============================================================================
   Blocks
   ========================================================================== */

/**
 * `getblock`.
 *
 * ZEBRA'S DOC COMMENT IS WRONG ABOUT `size`. methods.rs:299 says "The `size`
 * field is only returned with verbosity=2"; it is backfilled from the state's
 * block index at methods.rs:1550 for verbosity 1 and 2 alike, and both
 * snapshots carry `"size": 1617`. In 6.3.0 the ONLY structural difference
 * between the two verbosities is the element type of `tx`: txid strings at 1,
 * full transaction objects at 2.
 *
 * `tx` is therefore a union here rather than two schemas, so one parse handles
 * whichever verbosity the caller asked for and the caller narrows on what it
 * got. `finalorchardroot` appears only from NU5 activation, and
 * `finalsaplingroot` only from Sapling - absence means "the pool was not active
 * at this height", never "this block committed nothing".
 */
export const blockTxSchema = z.union([hash32Schema, rpcTransactionSchema]);

export const rpcBlockSchema = z
  .object({
    hash: hash32Schema,
    confirmations: z.number().int().optional(),
    height: heightSchema.optional(),
    version: z.number().int().optional(),
    merkleroot: hexLowerSchema.optional(),
    finalsaplingroot: hexLowerSchema.optional(),
    finalorchardroot: hexLowerSchema.optional(),
    blockcommitments: hexLowerSchema.optional(),
    nTx: z.number().int().nonnegative().optional(),
    tx: z.array(blockTxSchema),
    time: z.number().int().optional(),
    nonce: hexLowerSchema.optional(),
    solution: hexLowerSchema.optional(),
    bits: hexLowerSchema.optional(),
    difficulty: z.number().optional(),
    size: z.number().int().nonnegative().optional(),
    previousblockhash: hash32Schema.optional(),
    nextblockhash: hash32Schema.optional(),
    valuePools: z.array(valuePoolBalanceSchema).optional(),
    chainSupply: valuePoolBalanceSchema.optional(),
    trees: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type RpcBlockObject = z.infer<typeof rpcBlockSchema>;

/** `getblockheader` with verbose=true. */
export const blockHeaderSchema = z
  .object({
    hash: hash32Schema,
    height: heightSchema,
    time: z.number().int(),
    previousblockhash: hash32Schema.optional(),
    nextblockhash: hash32Schema.optional(),
  })
  .passthrough();
export type BlockHeader = z.infer<typeof blockHeaderSchema>;

/** `getrawmempool` with verbose=false: a flat array of txids. */
export const rawMempoolSchema = z.array(hash32Schema);

/**
 * One entry of `getrawmempool` with verbose=true.
 *
 * ZEBRA'S DOC COMMENT IS WRONG ABOUT THE FEE. `MempoolObject.fee`
 * (types/get_raw_mempool.rs:38) is documented "Transaction fee in zatoshi" and
 * is typed `Zec<NonNegative>`, which serialises through
 * `#[serde(into = "f64")]` - a lossy ZEC FLOAT, not zatoshi. `descendantfees`
 * is the one field in that struct that genuinely is zatoshi.
 *
 * Only `size` is read here, and it is what makes the mempool view's byte total
 * a measurement rather than a zero. `fee` is declared so that a future caller
 * finds this comment before trusting the name.
 */
export const mempoolEntrySchema = z
  .object({
    size: z.number().int().nonnegative(),
    /** ZEC, as a float, despite the upstream doc comment. Never zatoshi. */
    fee: z.number().optional(),
    /** Genuinely zatoshi, unlike `fee`. */
    descendantfees: z.number().optional(),
    time: z.number().int().optional(),
    height: heightSchema.optional(),
    depends: z.array(hash32Schema).optional(),
  })
  .passthrough();

/** `getrawmempool` with verbose=true: an object keyed by txid. */
export const rawMempoolVerboseSchema = z.record(z.string(), mempoolEntrySchema);
