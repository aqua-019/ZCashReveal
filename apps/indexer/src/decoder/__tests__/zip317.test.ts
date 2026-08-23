import { describe, expect, it } from "vitest";
import {
  P2PKH_STANDARD_INPUT_SIZE,
  P2PKH_STANDARD_OUTPUT_SIZE,
  ZIP317_MARGINAL_FEE,
  asHex,
  compactSize,
  conventionalFeeZat,
  isConventionalFee,
  transparentInputSize,
  transparentOutputSize,
  zip317LogicalActions,
  zip317LogicalActionsP2pkhApproximation,
  type Hex,
  type RpcOrchardAction,
  type RpcSaplingOutput,
  type RpcSaplingSpend,
  type RpcTransaction,
  type RpcVin,
  type RpcVout,
} from "@zcashreveal/types";

/**
 * ZIP 317 — logical actions and the conventional fee.
 *
 * THESE TESTS LIVE IN THE INDEXER, NOT BESIDE THE CODE. `packages/zec-types`
 * has no `test` script and no test runner in its `devDependencies`, so a suite
 * placed there would never run - in CI or locally. The indexer's vitest config
 * aliases `@zcashreveal/types` to the package SOURCE rather than to `dist`, so
 * every import below exercises the file in the repository and there is nothing
 * stale to resolve. Moving these next to the implementation is a one-line
 * change the day that package acquires a runner.
 *
 * WHY EACH CASE IS HERE. The project computed L three different ways before
 * HANDOFF-06 and the three disagreed on ORDINARY transactions rather than on
 * edge cases. Three things are easy to get wrong and this project got all
 * three wrong in its first pass: Sapling contributes the MAXIMUM of its spends
 * and outputs rather than their sum; JoinSplits count double; and the
 * transparent side is measured in BYTES against a standard size, not in inputs
 * and outputs. There is a block below for each.
 */

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
const hexOf = (bytes: number): Hex => asHex("ab".repeat(bytes));

/* --------------------------------------------------------------------------
   Script sizes, stated as their construction so a reader can check them
   -------------------------------------------------------------------------- */

/** `OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG` — 25 bytes. */
const P2PKH_SCRIPT_PUBKEY_BYTES = 25;

/** A 72-byte signature and a 33-byte compressed pubkey, each with its push opcode. */
const P2PKH_SCRIPT_SIG_BYTES = 1 + 72 + 1 + 33;

/** `OP_HASH160 <20> OP_EQUAL` — 23 bytes. */
const P2SH_SCRIPT_PUBKEY_BYTES = 23;

/**
 * A 2-of-3 P2SH multisig scriptSig, which is the script this project actually
 * has to reason about: `OP_0`, two 72-byte signatures with their push opcodes,
 * and the redeem script pushed with OP_PUSHDATA1.
 *
 * The redeem script is `OP_2 <33><pk1> <33><pk2> <33><pk3> OP_3 OP_CHECKMULTISIG`
 * = 1 + 3*34 + 1 + 1 = 105 bytes. The whole scriptSig is
 * 1 + 73 + 73 + (2 + 105) = 254 bytes, which is 1.7 times ZIP 317's standard
 * input size on its own.
 */
const MULTISIG_2OF3_REDEEM_BYTES = 1 + 3 * 34 + 1 + 1;
const MULTISIG_2OF3_SCRIPT_SIG_BYTES = 1 + 73 + 73 + (2 + MULTISIG_2OF3_REDEEM_BYTES);

function txn(over: Partial<RpcTransaction>): RpcTransaction {
  return { txid: h(1), version: 5, locktime: 0, vin: [], vout: [], ...over };
}

function spendOf(scriptBytes: number, n = 0): RpcVin {
  return {
    txid: h(0x100 + n),
    vout: 0,
    scriptSig: { asm: "", hex: hexOf(scriptBytes) },
    sequence: 0xffff_fffe,
  };
}

function payTo(scriptBytes: number, n = 0): RpcVout {
  return {
    value: 0.001,
    valueZat: 100_000,
    n,
    scriptPubKey: { asm: "", hex: hexOf(scriptBytes), type: "pubkeyhash" },
  };
}

/** Sizes are all that matter to ZIP 317, so the cryptographic fields are filler. */
function saplingSpend(): RpcSaplingSpend {
  return {
    cv: hexOf(32),
    anchor: hexOf(32),
    nullifier: hexOf(32),
    rk: hexOf(32),
    proof: hexOf(192),
    spendAuthSig: hexOf(64),
  };
}

function saplingOutput(): RpcSaplingOutput {
  return {
    cv: hexOf(32),
    cmu: hexOf(32),
    ephemeralKey: hexOf(32),
    encCiphertext: hexOf(580),
    outCiphertext: hexOf(80),
    proof: hexOf(192),
  };
}

function orchardAction(): RpcOrchardAction {
  return {
    cv: hexOf(32),
    nullifier: hexOf(32),
    rk: hexOf(32),
    cmx: hexOf(32),
    ephemeralKey: hexOf(32),
    encCiphertext: hexOf(580),
    outCiphertext: hexOf(80),
    spendAuthSig: hexOf(64),
  };
}

describe("ZIP 271 lockbox — the input the byte form and the count form disagree on", () => {
  /**
   * THE CASE THAT MATTERS, and the reason the byte form is not pedantry.
   *
   * Two 2-of-3 P2SH multisig inputs serialise at 297 bytes each (32 txid + 4
   * index + 3 compact-size + 254 script + 4 sequence), so the transparent term
   * is ceil(594 / 150) = 4 and the conventional fee is 20,000 zatoshi. The
   * count form sees two inputs and one output and says 2, for 10,000.
   *
   * The largest script this site discusses is the ZIP 271 lockbox. A page
   * saying a lockbox disbursement did not pay the conventional fee, when by the
   * protocol it did, is a false statement about the one address this project
   * exists to track - and it would have been published as a computed fact.
   */
  const lockbox = txn({
    vin: [
      spendOf(MULTISIG_2OF3_SCRIPT_SIG_BYTES, 0),
      spendOf(MULTISIG_2OF3_SCRIPT_SIG_BYTES, 1),
    ],
    vout: [payTo(P2PKH_SCRIPT_PUBKEY_BYTES, 0)],
  });

  it("the construction is the size it claims: 254-byte scriptSig, 297-byte input", () => {
    // Stated so the two numbers below are checkable rather than asserted.
    expect(MULTISIG_2OF3_REDEEM_BYTES).toBe(105);
    expect(MULTISIG_2OF3_SCRIPT_SIG_BYTES).toBe(254);
    expect(transparentInputSize(lockbox.vin[0] as RpcVin)).toBe(297);
    expect(297 * 2).toBeGreaterThan(P2PKH_STANDARD_INPUT_SIZE * 3);
  });

  it("PASS STATE: the protocol gives 4 logical actions and a 20,000 zatoshi fee", () => {
    expect(zip317LogicalActions(lockbox)).toBe(4);
    expect(conventionalFeeZat(zip317LogicalActions(lockbox))).toBe(20_000n);
  });

  it("FAIL STATE: the count approximation gives 2 and 10,000 — half the fee", () => {
    expect(zip317LogicalActionsP2pkhApproximation(lockbox)).toBe(2);
    expect(conventionalFeeZat(zip317LogicalActionsP2pkhApproximation(lockbox))).toBe(10_000n);
  });

  it("so a lockbox disbursement paying 20,000 tests conventional one way and not the other", () => {
    // The consequence in the form the site would publish it.
    expect(isConventionalFee(20_000n, zip317LogicalActions(lockbox))).toBe(true);
    expect(isConventionalFee(20_000n, zip317LogicalActionsP2pkhApproximation(lockbox))).toBe(false);
  });

  it("and the two AGREE on plain P2PKH, which is why the error stayed invisible", () => {
    // Every ordinary transaction on the chain is this shape, so a suite built
    // only from P2PKH fixtures would have found nothing wrong with either
    // function. Two inputs at 148 bytes give ceil(296/150) = 2; two outputs at
    // 34 bytes give ceil(68/34) = 2; the counts give max(2, 2) = 2 as well.
    const ordinary = txn({
      vin: [spendOf(P2PKH_SCRIPT_SIG_BYTES, 0), spendOf(P2PKH_SCRIPT_SIG_BYTES, 1)],
      vout: [payTo(P2PKH_SCRIPT_PUBKEY_BYTES, 0), payTo(P2PKH_SCRIPT_PUBKEY_BYTES, 1)],
    });

    expect(transparentInputSize(ordinary.vin[0] as RpcVin)).toBe(148);
    expect(transparentOutputSize(ordinary.vout[0] as RpcVout)).toBe(34);
    expect(zip317LogicalActions(ordinary)).toBe(2);
    expect(zip317LogicalActionsP2pkhApproximation(ordinary)).toBe(2);
  });

  it("a P2SH scriptPubKey is 23 bytes, so the OUTPUT side of a lockbox is unremarkable", () => {
    // Only the spending side of a multisig is oversized. Saying so keeps a
    // reader from concluding the whole transaction is large.
    const toLockbox = txn({ vin: [], vout: [payTo(P2SH_SCRIPT_PUBKEY_BYTES, 0)] });
    expect(transparentOutputSize(toLockbox.vout[0] as RpcVout)).toBe(32);
    expect(zip317LogicalActions(toLockbox)).toBe(1);
  });
});

describe("the transparent term is a maximum of two byte counts, not a sum", () => {
  it("many small outputs are charged by their bytes, and inputs and outputs do not add", () => {
    // One P2PKH input (148 bytes, 1 action) and ten P2PKH outputs (340 bytes,
    // 10 actions). The protocol says max(1, 10) = 10. Summing would give 11.
    const fanOut = txn({
      vin: [spendOf(P2PKH_SCRIPT_SIG_BYTES, 0)],
      vout: Array.from({ length: 10 }, (_, i) => payTo(P2PKH_SCRIPT_PUBKEY_BYTES, i)),
    });

    expect(zip317LogicalActions(fanOut)).toBe(10);
    expect(zip317LogicalActions(fanOut)).not.toBe(11);
  });

  it("an empty transparent side contributes nothing, not a floor of one", () => {
    // ceil(0 / 150) is 0. The floor lives in `conventionalFeeZat`, not here, and
    // conflating the two would charge a shielded transaction for a transparent
    // side it does not have.
    expect(zip317LogicalActions(txn({}))).toBe(0);
  });

  it("the standard sizes are the protocol's 150 and 34", () => {
    expect(P2PKH_STANDARD_INPUT_SIZE).toBe(150);
    expect(P2PKH_STANDARD_OUTPUT_SIZE).toBe(34);
    expect(ZIP317_MARGINAL_FEE).toBe(5_000n);
  });

  it("a coinbase input is sized from its `coinbase` script, which lives in a different field", () => {
    // The script is in `coinbase` rather than `scriptSig` for a coinbase, so a
    // sizer reading only `scriptSig` would call it a 41-byte input.
    const coinbase: RpcVin = { coinbase: hexOf(40), sequence: 0xffff_ffff };
    expect(transparentInputSize(coinbase)).toBe(32 + 4 + 1 + 40 + 4);
    const bare: RpcVin = { txid: h(2), vout: 0, sequence: 0xffff_ffff };
    expect(transparentInputSize(bare)).toBe(32 + 4 + 1 + 0 + 4);
  });
});

describe("Sapling contributes the MAXIMUM of spends and outputs, not their sum", () => {
  it("three spends and one output give 3", () => {
    const tx = txn({
      vShieldedSpend: [saplingSpend(), saplingSpend(), saplingSpend()],
      vShieldedOutput: [saplingOutput()],
    });
    expect(zip317LogicalActions(tx)).toBe(3);
    expect(zip317LogicalActions(tx)).not.toBe(4);
  });

  it("one spend and three outputs also give 3, because the rule is symmetric", () => {
    const tx = txn({
      vShieldedSpend: [saplingSpend()],
      vShieldedOutput: [saplingOutput(), saplingOutput(), saplingOutput()],
    });
    expect(zip317LogicalActions(tx)).toBe(3);
  });

  it("FAIL STATE: two spends and two outputs give 2, where the sum would give 4", () => {
    // The discriminating shape. A summing implementation and a maximising one
    // agree whenever one side is zero, which is most fixtures - so this pairing
    // is what actually separates them, and it is what the indexer got wrong.
    const tx = txn({
      vShieldedSpend: [saplingSpend(), saplingSpend()],
      vShieldedOutput: [saplingOutput(), saplingOutput()],
    });
    expect(zip317LogicalActions(tx)).toBe(2);
    expect(zip317LogicalActions(tx)).not.toBe(4);
    // And the count-based approximation agrees here: it differs from the
    // protocol only on the transparent side.
    expect(zip317LogicalActionsP2pkhApproximation(tx)).toBe(2);
  });
});

describe("JoinSplits count double", () => {
  it("one JoinSplit is two logical actions", () => {
    const tx = txn({ version: 4, vjoinsplit: [{ vpub_oldZat: 100_000, vpub_newZat: 0 }] });
    expect(zip317LogicalActions(tx)).toBe(2);
  });

  it("two JoinSplits are four, not two", () => {
    const tx = txn({
      version: 4,
      vjoinsplit: [
        { vpub_oldZat: 100_000, vpub_newZat: 0 },
        { vpub_oldZat: 50_000, vpub_newZat: 0 },
      ],
    });
    expect(zip317LogicalActions(tx)).toBe(4);
    expect(zip317LogicalActions(tx)).not.toBe(2);
  });

  it("an absent `vjoinsplit` contributes nothing, which is nearly every transaction", () => {
    expect(zip317LogicalActions(txn({ version: 5 }))).toBe(0);
    expect(zip317LogicalActions(txn({ version: 4, vjoinsplit: [] }))).toBe(0);
  });
});

describe("Orchard and Ironwood actions each count once", () => {
  it("Orchard actions are counted from the bundle's list, not from its presence", () => {
    // Zebra emits the `orchard` key unconditionally, with an empty action list
    // and zero balances, even for a pre-NU5 coinbase. So the presence of the
    // bundle says nothing and only `actions.length` does.
    const empty = txn({ orchard: { actions: [], valueBalanceZat: 0 } });
    expect(zip317LogicalActions(empty)).toBe(0);

    const two = txn({
      orchard: { actions: [orchardAction(), orchardAction()], valueBalanceZat: -10_000 },
    });
    expect(zip317LogicalActions(two)).toBe(2);
  });

  it("Ironwood actions are counted through a structural read, without asserting a shape", () => {
    // The bundle is read as "a thing with a list" rather than through a declared
    // field, because this build has not verified Ironwood's serialised shape
    // against a node - HANDOFF-07 owns v6 decoding. Counting a list is safe in a
    // way that reading a value out of it would not be: a wrong count shows up in
    // a logical-action figure, a wrong value balance is money.
    const migration = {
      ...txn({
        version: 6,
        orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 },
      }),
      ironwood: { actions: [{}, {}] },
    } as RpcTransaction;

    expect(zip317LogicalActions(migration)).toBe(3);
    expect(zip317LogicalActionsP2pkhApproximation(migration)).toBe(3);
  });

  it("everything adds: transparent, JoinSplits, Sapling, Orchard", () => {
    // One of each, so a dropped term is visible as a specific shortfall rather
    // than as a number that could have come from anywhere.
    const everything = txn({
      version: 5,
      vin: [spendOf(P2PKH_SCRIPT_SIG_BYTES, 0)],
      vout: [payTo(P2PKH_SCRIPT_PUBKEY_BYTES, 0)],
      vjoinsplit: [{ vpub_oldZat: 1, vpub_newZat: 0 }],
      vShieldedSpend: [saplingSpend(), saplingSpend()],
      vShieldedOutput: [saplingOutput()],
      orchard: { actions: [orchardAction()], valueBalanceZat: 0 },
    });
    // max(ceil(148/150), ceil(34/34)) = 1, plus 2*1 JoinSplit, plus max(2,1)
    // Sapling, plus 1 Orchard action = 6.
    expect(zip317LogicalActions(everything)).toBe(6);
  });
});

describe("the conventional fee and its grace floor", () => {
  it("nothing is ever charged for fewer than two actions", () => {
    expect(conventionalFeeZat(0)).toBe(10_000n);
    expect(conventionalFeeZat(1)).toBe(10_000n);
    expect(conventionalFeeZat(2)).toBe(10_000n);
  });

  it("above the floor it is 5,000 zatoshi per action", () => {
    expect(conventionalFeeZat(3)).toBe(15_000n);
    expect(conventionalFeeZat(4)).toBe(20_000n);
    expect(conventionalFeeZat(20)).toBe(100_000n);
  });

  it("bigint and number action counts give the same answer", () => {
    expect(conventionalFeeZat(4n)).toBe(conventionalFeeZat(4));
  });

  it("the floor is why a fee of 0n could never test as conventional", () => {
    // The whole reason `feeZat` being stuck at 0n disabled two wallet
    // signatures rather than merely degrading them: there is no action count
    // for which 0n is the conventional fee.
    for (const actions of [0, 1, 2, 3, 10, 100]) {
      expect(isConventionalFee(0n, actions), `0n conventional at L=${actions}`).toBe(false);
    }
  });

  it("isConventionalFee is exact in both directions", () => {
    expect(isConventionalFee(10_000n, 2)).toBe(true);
    expect(isConventionalFee(9_999n, 2)).toBe(false);
    expect(isConventionalFee(10_001n, 2)).toBe(false);
    expect(isConventionalFee(20_000n, 4)).toBe(true);
    expect(isConventionalFee(10_000n, 4)).toBe(false);
  });
});

describe("compactSize widths, at the boundaries and not merely near them", () => {
  it("one byte up to 252, three from 253", () => {
    expect(compactSize(0)).toBe(1);
    expect(compactSize(252)).toBe(1);
    expect(compactSize(253)).toBe(3);
    expect(compactSize(254)).toBe(3);
  });

  it("three bytes up to 65,535, five from 65,536", () => {
    expect(compactSize(65_535)).toBe(3);
    expect(compactSize(65_536)).toBe(5);
  });

  it("five bytes up to 4,294,967,295, nine beyond", () => {
    expect(compactSize(4_294_967_295)).toBe(5);
    expect(compactSize(4_294_967_296)).toBe(9);
  });

  it("the width feeds straight into the input size, and 253 bytes costs an extra two", () => {
    // A 252-byte script and a 253-byte one differ by one byte of script and two
    // bytes of length prefix. Getting the boundary wrong is a three-byte error
    // per input, which is under 2% of the 150-byte standard size and therefore
    // exactly the kind of thing that never shows up on a small fixture.
    const small: RpcVin = { txid: h(2), vout: 0, scriptSig: { asm: "", hex: hexOf(252) }, sequence: 0 };
    const large: RpcVin = { txid: h(2), vout: 0, scriptSig: { asm: "", hex: hexOf(253) }, sequence: 0 };
    expect(transparentInputSize(small)).toBe(32 + 4 + 1 + 252 + 4);
    expect(transparentInputSize(large)).toBe(32 + 4 + 3 + 253 + 4);
    expect(transparentInputSize(large) - transparentInputSize(small)).toBe(3);
  });
});
