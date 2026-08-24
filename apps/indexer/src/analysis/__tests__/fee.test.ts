import { describe, expect, it } from "vitest";
import {
  asHex,
  conventionalFeeZat,
  isConventionalFee,
  zip317LogicalActions,
  type Hex,
  type RpcTransaction,
  type RpcVin,
  type RpcVout,
  type Zatoshi,
} from "@zcashreveal/types";

import {
  computeFeeZat,
  hasUndecodedIronwood,
  isCoinbaseTx,
  noPrevOutResolver,
  poolContributionZat,
  sumTransparentOut,
  type PrevOutResolver,
} from "../fee.js";

/**
 * FOLD 5 — the fee is computed from the outputs a transaction spends.
 *
 * WHAT THIS SUITE IS GUARDING. `leak-analyzer.ts` read `BigInt(tx.feeZat ?? 0)`.
 * No node sends `feeZat` - Zebra's `TransactionObject` has no fee field and
 * neither does zcashd's `getrawtransaction`, because a fee is the difference
 * between what a transaction spends and what it pays out and the spent outputs
 * live in earlier transactions - so that expression was `0n` for every
 * transaction this project had ever analysed. ZIP 317's conventional fee has a
 * floor of 10,000 zatoshi, so the two wallet signatures that gate on a
 * conventional fee could never fire. They were not degraded, they were INERT,
 * and every test over them passed because the fixtures shared the assumption.
 *
 * So the arithmetic below is written out in full rather than asserted against a
 * constant computed the same way the implementation computes it. Every case
 * states the numbers a reader can add up:
 *
 *   fee = sum(spent outputs) + sum(pool contributions) - sum(transparent outputs)
 *
 * in the sign convention where a POSITIVE pool contribution is value LEAVING
 * the shielded side for the transparent one.
 */

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/** A hex blob of exactly `bytes` bytes, for scripts whose SIZE is what matters. */
const hexOf = (bytes: number): Hex => asHex("ab".repeat(bytes));

/** `76a914{20}88ac` — a standard 25-byte P2PKH scriptPubKey. */
const P2PKH_SCRIPT_PUBKEY = asHex(`76a914${"11".repeat(20)}88ac`);

/**
 * A standard P2PKH scriptSig: a 72-byte signature and a 33-byte compressed
 * pubkey, each with its push opcode. 107 bytes, which is what makes a P2PKH
 * input 148 bytes on the wire and therefore exactly one ZIP 317 logical action.
 */
const P2PKH_SCRIPT_SIG_BYTES = 107;

const PREV_A = h(0xa1);
const PREV_B = h(0xb2);
const PREV_C = h(0xc3);

/**
 * A resolver backed by a Map, which is the whole reason `computeFeeZat` takes
 * the lookup as a parameter: this suite needs no node, no database and no
 * fixtures beyond the numbers each case states.
 */
function mapResolver(
  entries: ReadonlyArray<readonly [Hex, number, Zatoshi]>,
): PrevOutResolver {
  const values = new Map<string, Zatoshi>(
    entries.map(([txid, index, value]) => [`${txid}:${index}`, value]),
  );
  return (txid, vout) => Promise.resolve(values.get(`${txid}:${vout}`) ?? null);
}

function txn(over: Partial<RpcTransaction>): RpcTransaction {
  return { txid: h(1), version: 5, locktime: 0, vin: [], vout: [], ...over };
}

function spendOf(prevTxid: Hex, prevIndex = 0, scriptBytes = P2PKH_SCRIPT_SIG_BYTES): RpcVin {
  return {
    txid: prevTxid,
    vout: prevIndex,
    scriptSig: { asm: "", hex: hexOf(scriptBytes) },
    sequence: 0xffff_fffe,
  };
}

function payTo(valueZat: number, n = 0): RpcVout {
  return {
    value: valueZat / 1e8,
    valueZat,
    n,
    scriptPubKey: { asm: "", hex: P2PKH_SCRIPT_PUBKEY, type: "pubkeyhash" },
  };
}

describe("fold 5 — the four value-flow shapes, with the arithmetic written out", () => {
  it("fully transparent: 100,000 spent, 90,000 paid out, no pools", async () => {
    // 100,000 + 0 - 90,000 = 10,000.
    const tx = txn({ vin: [spendOf(PREV_A)], vout: [payTo(90_000)] });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.reason).toBeNull();
    expect(fee.isCoinbase).toBe(false);
    expect(fee.inputsResolved).toBe(1);
    expect(fee.inputsUnresolved).toBe(0);
    expect(fee.spentZat).toBe(100_000n);
    expect(fee.poolContributionZat).toBe(0n);
    expect(fee.transparentOutZat).toBe(90_000n);
  });

  it("shielding: 100,000 spent, nothing paid out, Sapling valueBalance -90,000", async () => {
    // 100,000 + (-90,000) - 0 = 10,000. The negative balance is value ENTERING
    // Sapling, so it is subtracted from what the transparent side keeps.
    const tx = txn({ vin: [spendOf(PREV_A)], vout: [], valueBalanceZat: -90_000 });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.poolContributionZat).toBe(-90_000n);
    expect(fee.transparentOutZat).toBe(0n);
  });

  it("deshielding: nothing spent, 90,000 paid out, Sapling valueBalance +100,000", async () => {
    // 0 + 100,000 - 90,000 = 10,000. With no inputs the resolver is never
    // consulted, which is why this case would have looked correct even before
    // the resolver existed - and why it is not the one that proves anything.
    const tx = txn({ vin: [], vout: [payTo(90_000)], valueBalanceZat: 100_000 });
    const fee = await computeFeeZat(tx, mapResolver([]));

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.spentZat).toBe(0n);
    expect(fee.poolContributionZat).toBe(100_000n);
  });

  it("pure shielded: nothing spent, nothing paid out, Sapling valueBalance +10,000", async () => {
    // 0 + 10,000 - 0 = 10,000. A shielded-to-shielded transfer pays its fee out
    // of the pool, so the fee IS the whole value balance.
    const tx = txn({ vin: [], vout: [], valueBalanceZat: 10_000 });
    const fee = await computeFeeZat(tx, mapResolver([]));

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.poolContributionZat).toBe(10_000n);
  });
});

describe("fold 5 — Sprout, which was the invisible term", () => {
  it("a JoinSplit with vpub_old 90,000 balances against 100,000 spent", async () => {
    // Sprout publishes no `valueBalance`. Each JoinSplit carries `vpub_old`,
    // the value it takes OUT of the transparent pool and puts INTO Sprout, and
    // `vpub_new`, the value it releases back - so Sprout's contribution in the
    // shared sign convention is `vpub_new - vpub_old` = 0 - 90,000 = -90,000.
    //
    // 100,000 + (-90,000) - 0 = 10,000. Before HANDOFF-06 this term was simply
    // absent, so the same transaction computed a fee of 100,000: the entire
    // shielded amount reported as a fee, on the pool holding the residual this
    // site's argument is about.
    const tx = txn({
      version: 4,
      vin: [spendOf(PREV_A)],
      vout: [],
      vjoinsplit: [{ vpub_oldZat: 90_000, vpub_newZat: 0 }],
    });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.poolContributionZat).toBe(-90_000n);
  });

  it("FAIL STATE: dropping the JoinSplit turns the shielded amount into the fee", async () => {
    // The same transaction with the term removed. This is what the omission
    // looked like, and it is the discriminating half of the case above: if
    // `poolContributionZat` did not read `vjoinsplit`, the two would agree.
    const tx = txn({ version: 4, vin: [spendOf(PREV_A)], vout: [] });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(fee.feeZat).toBe(100_000n);
  });

  it("a JoinSplit releasing value back reads with the opposite sign", async () => {
    // vpub_new 90,000, vpub_old 0: value LEAVING Sprout. 0 + 90,000 - 80,000
    // = 10,000. Both signs matter, because a term with the sign inverted
    // balances exactly as well on a symmetric fixture.
    const tx = txn({
      version: 4,
      vin: [],
      vout: [payTo(80_000)],
      vjoinsplit: [{ vpub_oldZat: 0, vpub_newZat: 90_000 }],
    });
    const fee = await computeFeeZat(tx, mapResolver([]));

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.poolContributionZat).toBe(90_000n);
  });

  it("several JoinSplits sum, and the unsuffixed ZEC floats are not read", async () => {
    // `vpub_old` and `vpub_new` without the `Zat` suffix are ZEC floats. Reading
    // them would be wrong by a factor of 100,000,000, so they are set here to
    // values that would be visible if they leaked into the sum.
    const tx = txn({
      version: 4,
      vin: [spendOf(PREV_A)],
      vout: [],
      vjoinsplit: [
        { vpub_old: 0.0006, vpub_oldZat: 60_000, vpub_newZat: 0 },
        { vpub_old: 0.0003, vpub_oldZat: 30_000, vpub_newZat: 0 },
      ],
    });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(fee.poolContributionZat).toBe(-90_000n);
    expect(fee.feeZat).toBe(10_000n);
  });
});

describe("fold 5 — several inputs", () => {
  it("three inputs are summed, not sampled", async () => {
    // 40,000 + 35,000 + 25,000 = 100,000 spent; 90,000 paid out; fee 10,000.
    // The three values are distinct so that reading only the first, only the
    // last, or the count instead of the values all give a different answer.
    const tx = txn({
      vin: [spendOf(PREV_A, 0), spendOf(PREV_B, 1), spendOf(PREV_C, 2)],
      vout: [payTo(90_000)],
    });
    const fee = await computeFeeZat(
      tx,
      mapResolver([
        [PREV_A, 0, 40_000n],
        [PREV_B, 1, 35_000n],
        [PREV_C, 2, 25_000n],
      ]),
    );

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.spentZat).toBe(100_000n);
    expect(fee.inputsResolved).toBe(3);
  });

  it("the output index is part of the lookup, not just the txid", async () => {
    // Two inputs spending different outputs of ONE parent. A resolver keyed on
    // the txid alone would return the same value twice and be out by 30,000.
    const tx = txn({
      vin: [spendOf(PREV_A, 0), spendOf(PREV_A, 1)],
      vout: [payTo(90_000)],
    });
    const fee = await computeFeeZat(
      tx,
      mapResolver([
        [PREV_A, 0, 35_000n],
        [PREV_A, 1, 65_000n],
      ]),
    );

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.spentZat).toBe(100_000n);
  });

  it("several transparent outputs are summed too", async () => {
    const tx = txn({
      vin: [spendOf(PREV_A)],
      vout: [payTo(50_000, 0), payTo(40_000, 1)],
    });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(fee.transparentOutZat).toBe(90_000n);
    expect(fee.feeZat).toBe(10_000n);
    expect(sumTransparentOut(tx)).toBe(90_000n);
  });
});

describe("fold 5 — the refusals, which are the point of the function", () => {
  it("ONE unresolved input out of three refuses, and does NOT return the partial sum", async () => {
    // THE ASSERTION THIS SUITE EXISTS FOR. 40,000 and 35,000 resolve, 25,000
    // does not. The tempting answer is 40,000 + 35,000 - 90,000, which is
    // -15,000; the answer before HANDOFF-06 was 0n; both are confident and
    // wrong. A fee computed from two of three inputs is not an approximate fee.
    const tx = txn({
      vin: [spendOf(PREV_A, 0), spendOf(PREV_B, 1), spendOf(PREV_C, 2)],
      vout: [payTo(90_000)],
    });
    const fee = await computeFeeZat(
      tx,
      mapResolver([
        [PREV_A, 0, 40_000n],
        [PREV_B, 1, 35_000n],
      ]),
    );

    expect(fee.feeZat).toBeNull();
    expect(fee.reason).toBe("unresolved-inputs");
    expect(fee.feeZat).not.toBe(-15_000n);
    expect(fee.feeZat).not.toBe(75_000n);
    expect(fee.feeZat).not.toBe(0n);
    // The partial sum is not returned through the terms either: a caller
    // showing its working must not be handed two thirds of one.
    expect(fee.spentZat).toBe(0n);
    expect(fee.poolContributionZat).toBe(0n);
    expect(fee.transparentOutZat).toBe(0n);
    // The audit trail still says how far it got, which is what makes a refusal
    // diagnosable rather than merely safe.
    expect(fee.inputsResolved).toBe(2);
    expect(fee.inputsUnresolved).toBe(1);
  });

  it("FAIL STATE: supply the third previous output and the same call succeeds", async () => {
    // The refusal is about the missing value and nothing else.
    const tx = txn({
      vin: [spendOf(PREV_A, 0), spendOf(PREV_B, 1), spendOf(PREV_C, 2)],
      vout: [payTo(90_000)],
    });
    const fee = await computeFeeZat(
      tx,
      mapResolver([
        [PREV_A, 0, 40_000n],
        [PREV_B, 1, 35_000n],
        [PREV_C, 2, 25_000n],
      ]),
    );

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.reason).toBeNull();
  });

  it("an input carrying neither a prevout nor a coinbase script is malformed, not unresolved", async () => {
    // Two different diagnoses. "Unresolved" says ask a better-synced node;
    // "malformed" says the response itself was not a transaction we understand.
    const tx = txn({
      vin: [{ sequence: 0xffff_fffe }],
      vout: [payTo(90_000)],
    });
    const fee = await computeFeeZat(tx, mapResolver([]));

    expect(fee.feeZat).toBeNull();
    expect(fee.reason).toBe("malformed-input");
  });

  it("a v6 transaction WITH an ironwood bundle is priced, and the bundle is a term in the fee", async () => {
    // THE REFUSAL THIS REPLACES WOULD HAVE BECOME PERMANENT. Through HANDOFF-06
    // `hasUndecodedIronwood` was `tx.version >= 6 || "ironwood" in tx`, true of
    // every v6 transaction forever, and the guard was correct only because
    // nothing decoded the bundle. Left alone after HANDOFF-07 landed the
    // decoder it would have refused a fee for the entire post-NU6.3 chain while
    // naming a gap that no longer existed - an "unknown" published about
    // something known, which no test catches because a refusal looks the same
    // whether or not it is warranted.
    //
    // The bundle is a real term: 100,000 spent, 90,000 paid out, and 5,000
    // leaving Ironwood for the transparent side gives a fee of 15,000.
    const tx: RpcTransaction = {
      ...txn({ version: 6, vin: [spendOf(PREV_A)], vout: [payTo(90_000)] }),
      ironwood: { actions: [], valueBalanceZat: 5_000 },
    };
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(hasUndecodedIronwood(tx)).toBe(false);
    expect(fee.feeZat).toBe(15_000n);
  });

  it("FAIL SIDE: a v6 transaction with NO ironwood key still refuses, because that is where the doubt is", async () => {
    // The one case the narrowed guard keeps, and it is a real one. The
    // `ironwood` field NAME is inferred rather than observed - nothing in this
    // repository has seen a real Ironwood bundle - so a v6 arriving without the
    // key is the shape a wrong guess would take, and the Ironwood balance is
    // then genuinely unknown rather than zero. A fee computed without the term
    // would be confidently wrong, which is worse than no fee.
    const tx = txn({ version: 6, vin: [spendOf(PREV_A)], vout: [payTo(90_000)] });
    const fee = await computeFeeZat(tx, mapResolver([[PREV_A, 0, 100_000n]]));

    expect(hasUndecodedIronwood(tx)).toBe(true);
    expect(fee.feeZat).toBeNull();
    expect(fee.reason).toBe("ironwood-not-decoded");
  });

  it("an `ironwood` key on a v5 transaction no longer refuses the fee - it is a shape refusal instead", async () => {
    // The old rule refused the FEE for a v5 carrying an Ironwood key, on the
    // grounds that the key is what a node actually sends. That refusal is in
    // the wrong place: an Ironwood bundle on a version that predates Ironwood
    // is not a pricing problem, it is a transaction whose shape contradicts its
    // own format, and `dispatchByVersion` declines to classify it at all. So
    // the fee function no longer has an opinion about it, and the decoder's
    // UNSUPPORTED_TX path does. Both halves are asserted so the responsibility
    // is visibly moved rather than dropped.
    const tx: RpcTransaction = {
      ...txn({ version: 5, vin: [], vout: [] }),
      ironwood: { actions: [], valueBalanceZat: 0 },
    };
    expect(hasUndecodedIronwood(tx)).toBe(false);
    expect(hasUndecodedIronwood(txn({ version: 5 }))).toBe(false);
  });

  it("noPrevOutResolver refuses any transaction with inputs", async () => {
    // The honest default for a caller with no node and no cache. This is what
    // the analyser did in effect before `computeFeeZat` existed, except that it
    // said 0n and meant null.
    const tx = txn({ vin: [spendOf(PREV_A)], vout: [payTo(90_000)] });
    const fee = await computeFeeZat(tx, noPrevOutResolver);

    expect(fee.feeZat).toBeNull();
    expect(fee.reason).toBe("unresolved-inputs");
    expect(fee.inputsUnresolved).toBe(1);
  });

  it("FAIL STATE: with no inputs there is nothing to resolve, so noPrevOutResolver still answers", async () => {
    // A pure-shielded transaction has no previous outputs, so an ignorant
    // resolver costs it nothing. This is the case that shows the refusal is
    // driven by unresolved LOOKUPS and not by the resolver's identity.
    const tx = txn({ vin: [], vout: [], valueBalanceZat: 10_000 });
    const fee = await computeFeeZat(tx, noPrevOutResolver);

    expect(fee.feeZat).toBe(10_000n);
    expect(fee.reason).toBeNull();
  });
});

describe("fold 5 — coinbase", () => {
  it("a coinbase pays no fee: 0n is a fact here, not an absence", async () => {
    // It is where the fees GO. `0n` with `isCoinbase: true` is a different
    // statement from `0n` standing in for an unknown, which is the statement
    // this whole handoff removed.
    const tx = txn({
      vin: [{ coinbase: asHex("03a1b2c3"), sequence: 0xffff_ffff }],
      vout: [payTo(156_250_000)],
    });
    const fee = await computeFeeZat(tx, noPrevOutResolver);

    expect(fee.feeZat).toBe(0n);
    expect(fee.isCoinbase).toBe(true);
    expect(fee.reason).toBeNull();
    expect(isCoinbaseTx(tx)).toBe(true);
  });

  it("its terms do not reconcile to 0n, and are not meant to", async () => {
    // A coinbase spends no outputs, so `spentZat` is zero while its real inputs
    // are the block subsidy and every other transaction's fee - neither of
    // which is a property of this transaction. A reader adding the three terms
    // up would get -156,250,000, which is why the docblock says so and why this
    // pins the shape rather than leaving it to be "fixed" later.
    const tx = txn({
      vin: [{ coinbase: asHex("03a1b2c3"), sequence: 0xffff_ffff }],
      vout: [payTo(156_250_000)],
    });
    const fee = await computeFeeZat(tx, noPrevOutResolver);

    expect(fee.spentZat).toBe(0n);
    expect(fee.transparentOutZat).toBe(156_250_000n);
    expect(fee.feeZat).toBe(0n);
  });

  it("the coinbase branch is taken before the v6 branch, so a v6 coinbase still says 0n", async () => {
    // Which order these two checks run in is a real decision: a shielded v6
    // coinbase pays no fee whether or not we can read its Ironwood bundle.
    const tx = txn({
      version: 6,
      vin: [{ coinbase: asHex("03a1b2c3"), sequence: 0xffff_ffff }],
      vout: [payTo(156_250_000)],
    });
    const fee = await computeFeeZat(tx, noPrevOutResolver);

    expect(fee.feeZat).toBe(0n);
    expect(fee.isCoinbase).toBe(true);
  });
});

describe("fold 5 — the pool contribution term on its own", () => {
  it("Sapling, Orchard and Sprout are all summed", async () => {
    // Sapling +7,000, Orchard -2,000, Sprout (0 - 1,000) = -1,000. Net +4,000.
    // Three distinct magnitudes with two signs, so no permutation of the terms
    // and no dropped term gives the same total.
    const tx = txn({
      version: 5,
      valueBalanceZat: 7_000,
      orchard: { actions: [], valueBalanceZat: -2_000 },
      vjoinsplit: [{ vpub_oldZat: 1_000, vpub_newZat: 0 }],
    });

    expect(poolContributionZat(tx)).toBe(4_000n);
  });

  it("a transaction with no shielded bundle at all contributes nothing", async () => {
    expect(poolContributionZat(txn({}))).toBe(0n);
  });
});

/**
 * THE REGRESSION THAT PINS THE DEFECT THIS REPLACES.
 *
 * Named for what it guards rather than for what it does: if a future author
 * reintroduces a read of `tx.feeZat` - the field is still DECLARED, precisely so
 * that deleting it could not let someone add it back believing it arrives - this
 * is the test that says the field is empty on every real response and that the
 * computed number is elsewhere.
 *
 * The transaction below pays a textbook ZIP 317 conventional fee: one standard
 * P2PKH input (148 bytes, one logical action) and two standard P2PKH outputs
 * (68 bytes, two logical actions), so L = max(1, 2) = 2 and the conventional fee
 * is the grace floor of 10,000 zatoshi. It is the most ordinary transaction on
 * the chain, and it is exactly the shape that reported a fee of `0n` and
 * therefore tested as NOT paying a conventional fee for the entire life of this
 * project.
 */
describe("REGRESSION — tx.feeZat is empty on every response; the fee comes from computeFeeZat", () => {
  const conventional = txn({
    version: 5,
    vin: [spendOf(PREV_A)],
    vout: [payTo(50_000, 0), payTo(50_000, 1)],
  });

  it("the field no node populates reads undefined, and the old expression yields 0n", () => {
    expect(conventional.feeZat).toBeUndefined();
    expect(conventional.fee).toBeUndefined();
    // The exact expression `leak-analyzer.ts` carried. It is not an error, it is
    // not a null, and it is not the fee - which is what made it survive so long.
    expect(BigInt(conventional.feeZat ?? 0)).toBe(0n);
  });

  it("computeFeeZat returns the real number: 110,000 spent minus 100,000 paid out", async () => {
    const fee = await computeFeeZat(conventional, mapResolver([[PREV_A, 0, 110_000n]]));
    expect(fee.feeZat).toBe(10_000n);
  });

  it("and that number IS ZIP 317 conventional, where 0n could never have been", async () => {
    // The consequence, stated rather than implied. The conventional fee has a
    // floor of 10,000 zatoshi, so `isConventionalFee(0n, L)` is false for every
    // L - which is why the two fee-gated wallet signatures were unreachable.
    const actions = zip317LogicalActions(conventional);
    expect(actions).toBe(2);
    expect(conventionalFeeZat(actions)).toBe(10_000n);

    const fee = await computeFeeZat(conventional, mapResolver([[PREV_A, 0, 110_000n]]));
    expect(fee.feeZat).not.toBeNull();
    expect(isConventionalFee(fee.feeZat as Zatoshi, actions)).toBe(true);
    expect(isConventionalFee(0n, actions)).toBe(false);
  });

  it("FAIL STATE: a transaction paying 9,999 is not conventional, so the check discriminates", async () => {
    const underpaying = txn({
      version: 5,
      vin: [spendOf(PREV_A)],
      vout: [payTo(50_000, 0), payTo(50_001, 1)],
    });
    const fee = await computeFeeZat(underpaying, mapResolver([[PREV_A, 0, 110_000n]]));

    expect(fee.feeZat).toBe(9_999n);
    expect(isConventionalFee(fee.feeZat as Zatoshi, zip317LogicalActions(underpaying))).toBe(false);
  });
});
