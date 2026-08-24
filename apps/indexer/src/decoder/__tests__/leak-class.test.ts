import { describe, expect, it } from "vitest";
import {
  asHex,
  type Hex,
  type RpcOrchardAction,
  type RpcSaplingOutput,
  type RpcSaplingSpend,
  type RpcTransaction,
  type RpcVin,
  type RpcVout,
} from "@zcashreveal/types";

import type { AnchorRegistry } from "../anchor-depth.js";
import { analyze, type AnalyzeContext } from "../leak-analyzer.js";

/**
 * LeakClass — driven through `analyze()`, because there is no other seam.
 *
 * WHICH SEAM WAS CHOSEN AND WHY. `classifyLeak` is module-private in
 * `leak-analyzer.ts` with exactly one call site, inside `analyze()`, and
 * `decoder/index.ts` re-exports the module rather than the function. Exporting
 * it purely so a test could reach it would widen the module's public surface
 * for the convenience of the suite, and the file offers a real alternative:
 * `analyze()` takes an `RpcTransaction` and returns the class on the report, so
 * every rule below is exercised on the input shape a node actually sends rather
 * than on a hand-built argument object that can drift from what the analyser
 * passes.
 *
 * WHAT THAT COST, AND HOW IT WAS PAID. `analyze()` first passed
 * `ironwoodValueBalanceZat: null` as a literal, which made the POSITIVE case of
 * the MIGRATION_O2I rule unreachable through this entry point by any
 * transaction of any shape - so the rule was implemented, documented as tested,
 * and had never executed. A gate round against this handoff found it and the
 * fix was a seam rather than a workaround: `AnalyzeContext` gained an optional
 * `ironwoodValueBalanceZat`, which a caller holding a decoded bundle supplied
 * and the live path left unset.
 *
 * THAT SENTENCE DESCRIBED HANDOFF-06 AND IS NO LONGER TRUE. HANDOFF-07 decodes
 * the bundle inside `analyze()`, so the live path reaches this branch with no
 * help from a caller and the context field is an OVERRIDE with three states:
 * omitted means use the decoded value, `null` means withhold it, a number means
 * substitute one. Leaving the old wording here would have told a reviewer the
 * classification is still unreachable in production - which is exactly the
 * claim HANDOFF-06 was punished for making.
 *
 * A DIVERGENCE FROM THE HANDOFF'S WORDING, STATED RATHER THAN SLIPPED IN.
 * Deliverable 2 says to fill the field "at its call site", meaning
 * `apps/indexer/src/index.ts`; nothing is filled there. The analyser holds the
 * transaction and can decode the bundle itself, and routing the value through
 * the caller would leave production depending on one call site remembering to
 * pass it - which is the failure the deliverable exists to prevent, relocated.
 * The deliverable's PURPOSE, that MIGRATION_O2I fires on the live path, is met
 * and is what A8 asserts. The `null` state is what keeps A8's fail side able
 * to fail.
 */

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
const hexOf = (bytes: number): Hex => asHex("ab".repeat(bytes));

/** Anchor depth is not what these tests are about; every branch below is depth-blind. */
function offlineRegistry(): AnchorRegistry {
  return { getHeightForAnchor: () => Promise.resolve(null) } as unknown as AnchorRegistry;
}

/** A tip well past NU6.3, so nothing here is classified for a chain that does not exist yet. */
function context(): AnalyzeContext {
  return {
    tipHeight: 3_500_000,
    seenAt: 1_755_900_000,
    anchorRegistry: offlineRegistry(),
    recentAnchorThreshold: 100,
  };
}

function txn(over: Partial<RpcTransaction>): RpcTransaction {
  return { txid: h(1), version: 5, locktime: 0, vin: [], vout: [], ...over };
}

/** A non-coinbase transparent input. Only its presence matters to the classifier. */
function transparentInput(): RpcVin {
  return {
    txid: h(0xaa),
    vout: 0,
    scriptSig: { asm: "", hex: hexOf(107) },
    sequence: 0xffff_fffe,
  };
}

/**
 * A transparent output paying `valueZat` to a P2PKH script.
 *
 * The classifier only asks whether one exists, but the value is real because
 * `netTransparentInflowZat` sums it and several assertions read that.
 */
function transparentOutput(valueZat: number): RpcVout {
  return {
    value: valueZat / 100_000_000,
    valueZat,
    n: 0,
    scriptPubKey: { asm: "", hex: hexOf(25), type: "pubkeyhash", addresses: ["t1probe"] },
  };
}

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

/**
 * An Ironwood action, in the shape a node serialises.
 *
 * IT WAS `{}` UNTIL HANDOFF-07, AND FOUR TESTS PASSED OVER IT. `RpcTransaction`
 * had no `ironwood` field, so every Ironwood fixture in this repository was an
 * `as RpcTransaction` cast over an object literal, and a cast agrees with
 * whatever the author typed. Nothing read the actions, so nothing noticed that
 * `{}` has no `cmx`, no `nullifier` and no ciphertext - a shape
 * `rpcOrchardActionSchema` rejects and no node could produce. The moment the
 * decoder read one it threw, which is the honest outcome and is why the cast
 * had to go rather than the throw.
 *
 * Deliberately the same byte sizes as `orchardAction()`: Ironwood reuses
 * Orchard's circuit on the same curve, so its action serialises identically and
 * a fixture that differed would be inventing a distinction the wire does not
 * make.
 */
function ironwoodAction(): RpcOrchardAction {
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

/**
 * The shape a real Orchard-to-Ironwood migration has on the wire: a v6
 * transaction whose Orchard bundle publishes a positive value balance - value
 * LEAVING Orchard, which is the only direction ZIP 2006 still permits - and
 * whose Ironwood bundle takes the same amount in.
 *
 * NO TRANSPARENT SIDE AT ALL, and that is part of the shape rather than an
 * omission. ZIP 318 spends exactly one Orchard note into exactly one Ironwood
 * output; a crossing that also paid a transparent address would be a different
 * transaction, and `classifyLeak` requires the absence.
 *
 * `orchardZat` and `ironwoodZat` are separate so a test can make the two legs
 * disagree - a migration pays its fee out of the note it spends, so on the real
 * chain they nearly always do.
 */
function orchardToIronwood(
  over: { orchardZat?: number; ironwoodZat?: number } = {},
): RpcTransaction {
  return {
    ...txn({
      version: 6,
      orchard: { actions: [orchardAction()], valueBalanceZat: over.orchardZat ?? 700_000 },
    }),
    ironwood: { actions: [ironwoodAction()], valueBalanceZat: over.ironwoodZat ?? -700_000 },
  };
}

/** 500 ZEC in zatoshi. A4's fixture amount, and 5 x 10^10 zat = 5 x 10^2 ZEC. */
const FIVE_HUNDRED_ZEC = 50_000_000_000;

describe("MIGRATION_O2I — decoded end to end, which is what HANDOFF-07 changed", () => {
  /**
   * THIS BLOCK REPLACES ONE THAT PINNED THE OPPOSITE BEHAVIOUR, AND THE
   * REPLACEMENT WAS ASKED FOR IN THE FILE IT REPLACES.
   *
   * HANDOFF-06 implemented the rule and could not reach it: the Ironwood bundle
   * was not decoded, so `analyze()` had no balance to give the classifier and
   * every real migration came out `MIXED`. Its tests pinned that, correctly and
   * deliberately, and one of them said so in a comment - "when HANDOFF-07
   * decodes the Ironwood bundle, MIGRATION_O2I fires above and this assertion
   * should be replaced rather than kept".
   *
   * So the assertions below are the mirror image of the ones they replace, and
   * that is the point: the same transaction that had to classify `MIXED` must
   * now classify `MIGRATION_O2I`, and the fail sides have to change with them
   * or they stop discriminating. A `not.toBe("MIGRATION_O2I")` that passed
   * yesterday because nothing could reach the branch would pass today for a
   * different reason and prove nothing either way.
   */
  it("A8 PASS: a v6 migration reaches MIGRATION_O2I through the REAL decoder path", async () => {
    // No `ironwoodValueBalanceZat` in the context. The balance comes off the
    // transaction's own bundle, which is the whole deliverable: for one handoff
    // the only way into this branch was a value the caller supplied, and a rule
    // reachable only from a test is a rule that does not run.
    const report = await analyze(orchardToIronwood(), context());

    expect(report.leakClass).toBe("MIGRATION_O2I");
    expect(report.valueFlow.ironwoodValueBalanceZat).toBe(-700_000n);
    expect(report.bundle.ironwoodActions).toHaveLength(1);
  });

  it("A8 FAIL: withholding the Ironwood balance at the call site returns it to MIXED", async () => {
    // The discriminating half. `null` on the context means WITHHELD - not
    // decoded, not zero - and the identical transaction then cannot satisfy the
    // predicate. Without this, "the decoder classifies it" and "anything at all
    // classifies it" would be the same passing test.
    const report = await analyze(orchardToIronwood(), {
      ...context(),
      ironwoodValueBalanceZat: null,
    });

    expect(report.leakClass).not.toBe("MIGRATION_O2I");
    expect(report.leakClass).toBe("MIXED");
    // And the report still records what the pool did. Withholding a balance
    // from the CLASSIFIER must not erase the pool from the measurement: the
    // caller is testing a branch, not editing the chain.
    expect(report.valueFlow.ironwoodValueBalanceZat).toBe(-700_000n);
  });

  it("A8 FAIL, the other polarity: a v6 migration whose ironwood bundle is absent is MIXED", async () => {
    // The shape a node that does not serialise the bundle would produce, and
    // the shape the pre-HANDOFF-07 analyser saw for every transaction. Orchard
    // drains, nothing observably receives it, and the class admits that rather
    // than guessing Ironwood - which would be defensible past NU6.3, since
    // Orchard is exit-only, and would still be a guess.
    const report = await analyze(
      txn({ version: 6, orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 } }),
      context(),
    );

    expect(report.leakClass).toBe("MIXED");
    expect(report.valueFlow.perPoolZat.map((p) => p.pool)).not.toContain("ironwood");
  });

  it("Ironwood now appears in perPoolZat, and only when it moved", async () => {
    // The assertion this replaces was `not.toContain("ironwood")`, and it was
    // right at the time: an undecoded pool must be ABSENT rather than present
    // at zero, because a hardcoded zero renders as a measurement. Decoding does
    // not change that rule, it changes which side of it this transaction is on.
    const moved = await analyze(orchardToIronwood(), context());
    expect(moved.valueFlow.perPoolZat).toContainEqual({
      pool: "ironwood",
      deltaZat: -700_000n,
    });

    // FAIL SIDE: a v6 transaction whose Ironwood bundle is present and empty is
    // a measurement that the pool did not move, and it is still omitted. Same
    // rule as the other three pools - the array is what moved, not what exists.
    const still = await analyze(
      {
        ...txn({ version: 6, vin: [transparentInput()], vout: [transparentOutput(90_000)] }),
        ironwood: { actions: [], valueBalanceZat: 0 },
      },
      context(),
    );
    expect(still.valueFlow.perPoolZat.map((p) => p.pool)).not.toContain("ironwood");
    expect(still.valueFlow.ironwoodValueBalanceZat).toBe(0n);
  });

  it("a decoded Ironwood balance of ZERO is not a migration", async () => {
    // Zero is a decoded fact saying the pool did not move, so it must fail the
    // predicate for the opposite reason a withheld balance does. If `0n`
    // passed, the sign test would be decoration - which is the reasoning that
    // produced `BigInt(tx.feeZat ?? 0)`.
    const report = await analyze(orchardToIronwood({ ironwoodZat: 0 }), context());
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
  });

  it("Ironwood filling WITHOUT Orchard draining is not a migration", async () => {
    // Value entering Ironwood from somewhere other than Orchard is not ZIP 318.
    // Both halves of the predicate have to carry weight or one is decoration.
    const shielding = {
      ...txn({
        version: 6,
        vin: [transparentInput()],
        orchard: { actions: [], valueBalanceZat: 0 },
      }),
      ironwood: { actions: [ironwoodAction()], valueBalanceZat: -700_000 },
    };
    const report = await analyze(shielding, context());
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
  });

  it("a crossing that ALSO pays a transparent output is not a ZIP 318 migration", async () => {
    // §3: "with no transparent components". ZIP 318 spends one Orchard note
    // into one Ironwood output and nothing else, so a transaction that drained
    // Orchard into both Ironwood and a public address is a different animal -
    // and publishing it as a pure pool crossing would hide the public recipient
    // standing in the same transaction, which is the opposite of what this site
    // exists to notice.
    const withPayout = {
      ...txn({
        version: 6,
        vout: [transparentOutput(100_000)],
        orchard: { actions: [orchardAction()], valueBalanceZat: 800_000 },
      }),
      ironwood: { actions: [ironwoodAction()], valueBalanceZat: -700_000 },
    };
    const report = await analyze(withPayout, context());

    expect(report.leakClass).not.toBe("MIGRATION_O2I");
    // AND IT FALLS TO `MIXED`, NOT TO `Z_TO_T`. This assertion read `Z_TO_T`
    // first and was wrong: `direction` is DEPOSIT here, because a pool GAINED
    // value, and `Z_TO_T` requires a WITHDRAWAL direction with a transparent
    // output beside it. So the transaction that both crossed pools and paid a
    // public address gets the class that says value moved between pools and the
    // crossing could not be characterised - which is exactly what happened.
    // Naming either half alone would be the more specific claim, and it would
    // be the wrong one in whichever direction it named.
    expect(report.leakClass).toBe("MIXED");
    // The transparent output is still on the report, so nothing is hidden by
    // the class declining to name it.
    expect(report.valueFlow.netTransparentInflowZat).toBe(100_000n);
  });
});

describe("A4 — the ZIP 318 denomination, in both units and both polarities", () => {
  /**
   * A4 STATES `(n,k) = (5, 2)` AND THE DATABASE STORES `(5, 10)`. BOTH ARE
   * RIGHT AND THEY ARE DIFFERENT NUMBERS FOR ONE DENOMINATION.
   *
   * The research states ZIP 318's ladder in ZEC, where 500 ZEC is `5 x 10^2`
   * and 0.5 ZEC would need a negative exponent. `migrations_zip318.denom_k`
   * (migration 003) is declared `CHECK (denom_k >= 0)` precisely because it is
   * an exponent over ZATOSHI: 500 ZEC is `5 x 10^10` zat and 0.5 ZEC is
   * `5 x 10^7`, so no row ever carries a negative one.
   *
   * Two names for one quantity is how `summary.conventionalFeeZat` came to mean
   * two things in HANDOFF-05, so neither is called `k`: the record carries
   * `kZec` and `kZatoshi`, and both are asserted here. A4's pair is `kZec`.
   */
  it("PASS: 500 ZEC crossing is canonical, (n, kZec) = (5, 2) and kZatoshi = 10", async () => {
    const report = await analyze(
      orchardToIronwood({ orchardZat: FIVE_HUNDRED_ZEC, ironwoodZat: -FIVE_HUNDRED_ZEC }),
      context(),
    );

    expect(report.leakClass).toBe("MIGRATION_O2I");
    expect(report.migration?.canonical).toBe(true);
    expect(report.migration?.denomination).toEqual({ n: 5, kZec: 2, kZatoshi: 10 });
    expect(report.migration?.amountZat).toBe(BigInt(FIVE_HUNDRED_ZEC));
  });

  it("FAIL: 499.5 ZEC is not canonical, and carries no denomination at all", async () => {
    // 499.5 ZEC is 49,950,000,000 zat, which strips to 4995 - not 1, 2 or 5.
    // The record says so rather than rounding to the nearest rung: rounding
    // would manufacture the very regularity the migration lens measures, which
    // is the argument migration 003 already wrote against storing a
    // denomination on a non-canonical row.
    const report = await analyze(
      orchardToIronwood({ orchardZat: 49_950_000_000, ironwoodZat: -49_950_000_000 }),
      context(),
    );

    expect(report.leakClass).toBe("MIGRATION_O2I");
    expect(report.migration?.canonical).toBe(false);
    expect(report.migration?.denomination).toBeNull();
    expect(report.findings.map((f) => f.code)).toContain("MIGRATION_DENOMINATION");
  });

  it("both magnitudes are recorded, because the fee sits between them", async () => {
    // A migration pays its fee out of the note it spends, so what leaves
    // Orchard and what enters Ironwood are different numbers. Which one ZIP 318
    // means by "the net amount crossing between the pools" is not settled by
    // anything in this repository - the corpus gives DENOM_CAP both as
    // "10,000 ZEC plus canonical fee" and as a flat 10,000, which only makes
    // sense if the two statements had different sides in mind. So both are kept
    // and the question is carried as a deferred assumption.
    const report = await analyze(
      orchardToIronwood({ orchardZat: FIVE_HUNDRED_ZEC, ironwoodZat: -(FIVE_HUNDRED_ZEC - 10_000) }),
      context(),
    );

    expect(report.migration?.amountZat).toBe(BigInt(FIVE_HUNDRED_ZEC));
    expect(report.migration?.arrivedZat).toBe(BigInt(FIVE_HUNDRED_ZEC - 10_000));
    // The denomination is tested on the Orchard side, which is the note ZIP
    // 318's phase 1 quantised, so the fee does not make the crossing look
    // unquantised.
    expect(report.migration?.canonical).toBe(true);
  });

  it("FAIL SIDE: a crossing funded from a transparent INPUT is not a ZIP 318 migration", async () => {
    // THE MIRROR OF THE OUTPUT CASE, AND THE DIRECTION THAT HIDES RATHER THAN
    // MERELY OMITS. A transaction that drains Orchard into Ironwood while ALSO
    // taking a transparent input has a public funding address standing in it;
    // publishing that as a pure pool-to-pool crossing says the value came from
    // Orchard alone. The guard has two clauses and only the outputs clause had
    // a probe, so the inputs clause could have been deleted with the suite
    // green - which is how a two-clause guard quietly becomes a one-clause one.
    const funded = {
      ...txn({
        version: 6,
        vin: [transparentInput()],
        orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 },
      }),
      ironwood: { actions: [ironwoodAction()], valueBalanceZat: -700_000 },
    };
    const report = await analyze(funded, context());

    expect(report.leakClass).not.toBe("MIGRATION_O2I");
    expect(report.migration).toBeUndefined();
  });

  it("FAIL SIDE: a crossing that ALSO drains Sapling is not a ZIP 318 migration", async () => {
    // THE FINDING A GATE ROUND FOUND, AND WHAT IT PUBLISHED WAS AN
    // IMPOSSIBILITY. The predicate used to read only "Orchard positive and
    // Ironwood negative", which a transaction spending BOTH a Sapling note and
    // an Orchard note into one Ironwood output satisfies. `migrationRecord`
    // then took the Orchard leg as the amount that left and the whole Ironwood
    // leg as the amount that arrived, so the finding a reader saw reported MORE
    // value arriving than left: a pool crossing that created ZEC. ZIP 318
    // spends exactly one Orchard note into exactly one Ironwood output;
    // anything else is not it.
    const twoSources = {
      ...txn({
        version: 6,
        vShieldedSpend: [saplingSpend()],
        valueBalanceZat: 200_000,
        orchard: { actions: [orchardAction()], valueBalanceZat: 500_000 },
      }),
      ironwood: { actions: [ironwoodAction()], valueBalanceZat: -700_000 },
    };
    const report = await analyze(twoSources, context());

    expect(report.leakClass).not.toBe("MIGRATION_O2I");
    expect(report.migration).toBeUndefined();
    // The pools it moved are all still on the report; only the CLASS declines
    // to name a crossing it cannot characterise.
    expect([...report.valueFlow.perPoolZat.map((p) => p.pool)].sort()).toEqual([
      "ironwood",
      "orchard",
      "sapling",
    ]);
  });

  it("MIGRATION_DENOMINATION fires on an over-cap crossing, canonical or not", async () => {
    // 20,000 ZEC is `2 x 10^4` - structurally canonical and twice DENOM_CAP on
    // the flat reading TRACKING-MATH 3.9 gives. Until this assertion existed
    // the over-cap arm had never run: the only end-to-end probe used a
    // NON-canonical amount and entered through the other arm, so the two `why`
    // strings quoting the corpus were dead code with the suite green.
    const twentyThousandZec = 20_000 * 100_000_000;
    const report = await analyze(
      orchardToIronwood({ orchardZat: twentyThousandZec, ironwoodZat: -twentyThousandZec }),
      context(),
    );

    expect(report.leakClass).toBe("MIGRATION_O2I");
    expect(report.migration?.canonical).toBe(true);
    expect(report.migration?.overDenomCap).toBe(true);
    expect(report.findings.map((f) => f.code)).toContain("MIGRATION_DENOMINATION");
    expect(report.findings.find((f) => f.code === "MIGRATION_DENOMINATION")?.message).toContain(
      "DENOM_CAP",
    );
  });

  it("MIGRATION_DENOMINATION fires below MAX_RESIDUAL_VALUE, and says which fact fired", async () => {
    // 0.005 ZEC is `5 x 10^5` zat - structurally canonical, and below the
    // 0.01 ZEC ZIP 318 says is stranded in Orchard permanently. Both facts are
    // reported, because a crossing can be canonical in FORM and off the ladder
    // in SIZE, and a histogram showing only the first would draw a rung the
    // ladder does not have.
    const report = await analyze(
      orchardToIronwood({ orchardZat: 500_000, ironwoodZat: -500_000 }),
      context(),
    );

    expect(report.migration?.canonical).toBe(true);
    expect(report.migration?.belowMaxResidual).toBe(true);
    expect(report.migration?.overDenomCap).toBe(false);
    const message = report.findings.find((f) => f.code === "MIGRATION_DENOMINATION")?.message;
    expect(message).toContain("MAX_RESIDUAL_VALUE");
    expect(message).not.toContain("DENOM_CAP");
  });

  it("FAIL SIDE: an in-range canonical crossing raises no denomination finding at all", async () => {
    // The discriminating half for the three assertions above: 500 ZEC is on the
    // ladder, above the residual and under the cap, so none of the three arms
    // fires. Without this the finding could be unconditional and every
    // assertion above would still pass.
    const report = await analyze(
      orchardToIronwood({ orchardZat: FIVE_HUNDRED_ZEC, ironwoodZat: -FIVE_HUNDRED_ZEC }),
      context(),
    );

    expect(report.migration?.canonical).toBe(true);
    expect(report.migration?.overDenomCap).toBe(false);
    expect(report.migration?.belowMaxResidual).toBe(false);
    expect(report.findings.map((f) => f.code)).not.toContain("MIGRATION_DENOMINATION");
  });

  it("no migration record at all on a transaction that is not one", async () => {
    // `migration` is present iff the class is MIGRATION_O2I. A record on any
    // other transaction would be a ZIP 318 crossing asserted about something
    // that did not cross.
    const report = await analyze(txn({ version: 5, vin: [transparentInput()] }), context());
    expect(report.migration).toBeUndefined();
  });
});

describe("MIGRATION_S2O — still detectable, because both pools publish a balance", () => {
  /** Sapling drains, Orchard fills: spends on one side, actions on the other. */
  function saplingToOrchard(over: { saplingZat: number; orchardZat: number }): RpcTransaction {
    return txn({
      version: 5,
      vShieldedSpend: [saplingSpend()],
      valueBalanceZat: over.saplingZat,
      orchard: { actions: [orchardAction(), orchardAction()], valueBalanceZat: over.orchardZat },
    });
  }

  it("PASS STATE: Sapling positive and Orchard negative is a migration", async () => {
    const report = await analyze(
      saplingToOrchard({ saplingZat: 500_000, orchardZat: -490_000 }),
      context(),
    );
    expect(report.leakClass).toBe("MIGRATION_S2O");
    expect(report.findings.map((f) => f.code)).toContain("MIGRATION_PATTERN");
  });

  it("FAIL STATE: the same transaction with the signs swapped is not a migration", async () => {
    // Orchard draining into Sapling is a crossing, but it is not the one this
    // class names. Both signs are load-bearing and a rule reading either alone
    // would call this a migration too.
    const report = await analyze(
      saplingToOrchard({ saplingZat: -490_000, orchardZat: 500_000 }),
      context(),
    );
    expect(report.leakClass).not.toBe("MIGRATION_S2O");
  });

  it("FAIL STATE: a Sapling bundle of OUTPUTS alone is not a migration, spends are required", async () => {
    // `hasSapling` in the classifier is `spends + outputs > 0`, but the
    // migration rule reads `saplingSpendCount` on its own - and rightly: a
    // transaction with Sapling outputs and no Sapling spends has nothing
    // leaving Sapling to migrate. A rule that reused `hasSapling` here would
    // call this one, and the two predicates are one character apart.
    const report = await analyze(
      txn({
        version: 5,
        vShieldedOutput: [saplingOutput()],
        valueBalanceZat: 500_000,
        orchard: { actions: [orchardAction()], valueBalanceZat: -490_000 },
      }),
      context(),
    );
    expect(report.leakClass).not.toBe("MIGRATION_S2O");
  });

  it("FAIL STATE: Sapling spends with no Orchard actions is not a migration either", async () => {
    // The rule requires both bundles to be present, not merely both balances to
    // have the right sign. A balance without actions has no notes to migrate.
    const report = await analyze(
      txn({
        version: 5,
        vShieldedSpend: [saplingSpend()],
        valueBalanceZat: 500_000,
        orchard: { actions: [], valueBalanceZat: -490_000 },
      }),
      context(),
    );
    expect(report.leakClass).not.toBe("MIGRATION_S2O");
  });

  it("FAIL STATE: a transfer that also pays a transparent address is not a migration", async () => {
    // THE HARM THIS REFUSES IS THE SAME ONE THE O2I SIBLING REFUSES, and this
    // rule did not refuse it until a gate round in HANDOFF-07. The class
    // publishes the MEDIUM finding "Textbook Sapling->Orchard migration:
    // Sapling spends paired with Orchard outputs" - a statement that the value
    // moved between two shielded pools - and a transaction paying a public
    // recipient in the same breath is not that. The label overstated while a
    // transparent address stood in the row beside it.
    const report = await analyze(
      {
        ...saplingToOrchard({ saplingZat: 500_000, orchardZat: -290_000 }),
        vout: [transparentOutput(200_000)],
      },
      context(),
    );
    expect(report.leakClass).not.toBe("MIGRATION_S2O");
    // And it lands on the admission rather than on another confident label:
    // value moved between pools and a public recipient was paid, which this
    // build does not have a name for.
    expect(report.leakClass).toBe("MIXED");
    expect(report.findings.map((f) => f.code)).not.toContain("MIGRATION_PATTERN");
  });

  it("FAIL STATE: a transfer FUNDED from a transparent input is not a migration", async () => {
    // The mirror clause, and it is load-bearing in the opposite direction: a
    // transparent INPUT is a public funding address, and calling the
    // transaction a pool-to-pool migration hides it exactly as the output case
    // hides a public recipient.
    const report = await analyze(
      {
        ...saplingToOrchard({ saplingZat: 500_000, orchardZat: -490_000 }),
        vin: [transparentInput()],
      },
      context(),
    );
    expect(report.leakClass).not.toBe("MIGRATION_S2O");
    // `T_TO_Z` names the transparent side that is actually there, which is the
    // fact the migration label was hiding.
    expect(report.leakClass).toBe("T_TO_Z");
  });

  it("THERE IS NO THIRD-POOL CASE HERE, and the reason is the format rather than an oversight", async () => {
    // O2I carries a shape test - exactly one pool drained, exactly one filled -
    // and the first fix for this rule copied it. A gate round showed those
    // clauses cannot fire for any transaction a node can send, so they were
    // removed rather than kept as unreachable belt-and-braces, and this test
    // records the argument instead of asserting a shape.
    //
    // A third pool has to coexist with Sapling draining into Orchard. Sprout
    // needs `vjoinsplit`, which v5 removed (ZIP 225), and an Orchard bundle
    // needs v5 or later - so no version carries both. Ironwood needs v6, and
    // NU6.3 made Orchard exit-only in the same upgrade, so where Ironwood
    // exists nothing can fill Orchard at all. The only fixture that reached
    // those clauses was a v4 carrying an Orchard bundle AND a JoinSplit, which
    // is exactly the "a pair `analyze()` cannot produce" objection this session
    // raised against a gateway test in the round before.
    //
    // What is asserted here is the half that IS reachable and that the removal
    // restored: with the shape clauses gone, the two sign conjuncts decide
    // again, so the FAIL STATE above them is testing what its comment says.
    const swapped = await analyze(
      saplingToOrchard({ saplingZat: -490_000, orchardZat: 500_000 }),
      context(),
    );
    expect(swapped.leakClass).not.toBe("MIGRATION_S2O");

    // And the deltas the removed clauses would have read are still built for
    // every pool that moved, so a future format that does allow a third leg
    // finds the evidence waiting rather than absent.
    const both = await analyze(
      saplingToOrchard({ saplingZat: 500_000, orchardZat: -490_000 }),
      context(),
    );
    expect(both.valueFlow.perPoolZat.map((p) => p.pool)).toEqual(["sapling", "orchard"]);
  });

  it("FAIL STATE: Sapling draining while Orchard does not fill is not a migration", async () => {
    // THE ORCHARD SIGN CLAUSE, TESTED BY A TRANSACTION A NODE CAN ACTUALLY
    // SEND, which the "signs swapped" test above cannot do: it flips BOTH signs
    // at once, so either clause alone refuses it and neither is shown to carry
    // any weight. A gate round measured that - deleting either sign conjunct
    // left the whole indexer suite green - which made the claim in this file's
    // docblock, that removing the shape test "returns the two sign conjuncts to
    // work", true of the code and false of the tests certifying it.
    //
    // This is the discriminating input: Sapling spends draining 500,000 zat
    // entirely to fee, with an Orchard bundle of net zero - an internal Orchard
    // shuffle in the same transaction. Nothing filled Orchard, so nothing
    // migrated into it, and only `orchardValueBalanceZat < 0n` says so.
    const report = await analyze(
      saplingToOrchard({ saplingZat: 500_000, orchardZat: 0 }),
      context(),
    );
    expect(report.leakClass).not.toBe("MIGRATION_S2O");

    // Pass state on the same builder, so the fixture is not refusing everything.
    const migration = await analyze(
      saplingToOrchard({ saplingZat: 500_000, orchardZat: -490_000 }),
      context(),
    );
    expect(migration.leakClass).toBe("MIGRATION_S2O");
  });

  it("a coinbase is classified as one before any migration rule is consulted", async () => {
    // Order matters here: a shielded coinbase carries bundles and balances, and
    // "the miner shielded the subsidy" is the more specific fact about it.
    const report = await analyze(
      {
        ...saplingToOrchard({ saplingZat: 500_000, orchardZat: -490_000 }),
        vin: [{ coinbase: asHex("03a1b2c3"), sequence: 0xffff_ffff }],
      },
      context(),
    );
    expect(report.leakClass).toBe("COINBASE_SHIELDED");
  });
});

describe("a Sprout-only JoinSplit transaction is no longer FULLY_TRANSPARENT", () => {
  /**
   * THE OMISSION THIS PAIR GUARDS. Sprout publishes no `valueBalance`; its
   * movement is `vpub_new - vpub_old` summed over the JoinSplits. Until
   * HANDOFF-06 nothing read that, so a Sprout transaction had a boundary of
   * exactly zero, `hasShielded` was false, and the classifier returned
   * FULLY_TRANSPARENT - raising a CRITICAL finding that said "all amounts and
   * addresses public" about a transaction that had just shielded its value.
   *
   * Sprout holds roughly 22,621 ZEC that has never left in eight years, which
   * is half of the unprovable residual this site exists to publish. It is the
   * last pool that should have been invisible, and calling its transactions
   * fully transparent was not a missing feature but a false claim.
   */
  const joinSplitTx = txn({
    version: 4,
    vin: [transparentInput()],
    vout: [],
    vjoinsplit: [{ vpub_oldZat: 100_000, vpub_newZat: 0 }],
  });

  it("PASS STATE: it is shielded, it is a deposit, and it is not FULLY_TRANSPARENT", async () => {
    const report = await analyze(joinSplitTx, context());

    expect(report.leakClass).not.toBe("FULLY_TRANSPARENT");
    expect(report.leakClass).toBe("T_TO_Z");
    expect(report.valueFlow.sproutValueBalanceZat).toBe(-100_000n);
    expect(report.valueFlow.perPoolZat).toEqual([{ pool: "sprout", deltaZat: -100_000n }]);
    expect(report.valueFlow.crossesPoolBoundary).toBe(true);
  });

  it("PASS STATE: and it raises no CRITICAL claim that its amounts are public", async () => {
    const report = await analyze(joinSplitTx, context());
    expect(report.findings.map((f) => f.code)).not.toContain("FULL_TRANSPARENT");
    expect(report.overallSeverity).not.toBe("CRITICAL");
  });

  it("FAIL STATE: the identical transaction without the JoinSplit IS fully transparent", async () => {
    // The discriminating half. Same version, same input, same absence of
    // outputs - only the JoinSplit is gone. This is precisely what the analyser
    // saw for every Sprout transaction before HANDOFF-06.
    const report = await analyze(
      txn({ version: 4, vin: [transparentInput()], vout: [] }),
      context(),
    );

    expect(report.leakClass).toBe("FULLY_TRANSPARENT");
    expect(report.findings.map((f) => f.code)).toContain("FULL_TRANSPARENT");
    expect(report.overallSeverity).toBe("CRITICAL");
  });

  it("a JoinSplit releasing value back out of Sprout is a withdrawal, not a deposit", async () => {
    // Both signs, because a term with the sign inverted balances just as well on
    // a one-directional fixture.
    //
    // THE FIXTURE GAINED A TRANSPARENT OUTPUT, and that is a correction to the
    // fixture rather than a concession to the code. `vpub_new` releases value
    // into the transaction's transparent value pool, and a transaction that
    // released 90,000 zatoshi there while paying out nothing would be handing
    // the entire 90,000 to the miner as a fee. That is not a transaction anyone
    // sends; it was a shape that existed only because nothing checked. With a
    // recipient it is an ordinary Sprout deshield paying a 10,000 zatoshi fee,
    // and the sign assertion - which is what this test is actually about - is
    // untouched.
    const report = await analyze(
      txn({
        version: 4,
        vin: [],
        vout: [transparentOutput(80_000)],
        vjoinsplit: [{ vpub_oldZat: 0, vpub_newZat: 90_000 }],
      }),
      context(),
    );

    expect(report.valueFlow.sproutValueBalanceZat).toBe(90_000n);
    expect(report.valueFlow.direction).toBe("WITHDRAWAL");
    expect(report.leakClass).toBe("Z_TO_T");
  });

  it("the same release with nothing to receive it is MIXED, not Z_TO_T", async () => {
    // The guard, on the Sprout side. Same JoinSplit, no recipient: the class
    // that names the transparent side is withheld because the transparent side
    // is not there.
    const report = await analyze(
      txn({ version: 4, vin: [], vout: [], vjoinsplit: [{ vpub_oldZat: 0, vpub_newZat: 90_000 }] }),
      context(),
    );

    expect(report.valueFlow.direction).toBe("WITHDRAWAL");
    expect(report.leakClass).toBe("MIXED");
  });

  it("a JoinSplit that nets to zero is shielded, but crosses no boundary", async () => {
    // `hasShieldedAny` reads the balance rather than the JoinSplit count, so a
    // Sprout-internal transfer classifies as intra-pool and appears in no
    // per-pool list. Worth pinning: it is the one Sprout shape where a zero
    // boundary is the truth rather than the bug.
    const report = await analyze(
      txn({
        version: 4,
        vjoinsplit: [{ vpub_oldZat: 50_000, vpub_newZat: 50_000 }],
      }),
      context(),
    );

    expect(report.valueFlow.sproutValueBalanceZat).toBe(0n);
    expect(report.valueFlow.perPoolZat).toEqual([]);
    expect(report.leakClass).toBe("FULLY_TRANSPARENT");
  });

  /**
   * A SPROUT BALANCE OF ZERO IS TWO DIFFERENT STATEMENTS AND THE REPORT NOW
   * SAYS WHICH ONE IT IS.
   *
   * Zebra serialises `vjoinsplit` only from ZcashFoundation/zebra PR #9805
   * (merged 22 Aug 2025), so against an older node the field is absent on every
   * transaction and `sproutValueBalanceZat` is `0n` for all of them - including
   * ones that moved Sprout value. That is the shape of `expiryheight` and
   * `tx.feeZat`: a fabricated measurement with every test green. The reports
   * below carry the same `0n`; only one of them claims it.
   */
  it("flags an absent vjoinsplit on a version that could carry one, and stays silent where it could not", async () => {
    const codesFor = async (version: number): Promise<string[]> => {
      const report = await analyze(txn({ version, vin: [], vout: [] }), context());
      expect(report.valueFlow.sproutValueBalanceZat).toBe(0n);
      return report.findings.map((f) => f.code);
    };

    // v4 CAN carry a JoinSplit, so absence leaves the Sprout term unknown.
    const v4 = await codesFor(4);
    expect(v4).toContain("SPROUT_FIELD_INDETERMINATE");

    // THE FAIL SIDE, AND IT IS THE HALF THAT MAKES THE FINDING WORTH HAVING.
    // v5 removed JoinSplits (ZIP 225) and v6 did not bring them back (ZIP 229),
    // so on those the same absence is a fact about the format. A finding that
    // fired here would fire on substantially every transaction on the chain
    // today and every one of them would be false.
    expect(await codesFor(5)).not.toContain("SPROUT_FIELD_INDETERMINATE");
    expect(await codesFor(6)).not.toContain("SPROUT_FIELD_INDETERMINATE");
  });

  it("does not flag a v4 transaction whose node DID send an empty vjoinsplit", async () => {
    // The distinction the finding exists for: `[]` is an answer, absence is not.
    const report = await analyze(txn({ version: 4, vjoinsplit: [] }), context());
    expect(report.valueFlow.sproutValueBalanceZat).toBe(0n);
    expect(report.findings.map((f) => f.code)).not.toContain("SPROUT_FIELD_INDETERMINATE");
  });
});

describe("A9 — a class that names the transparent side requires a transparent side", () => {
  /**
   * THE ONE ASSERTION THAT PROTECTS THIS SITE'S CENTRAL CLAIM.
   *
   * `Z_TO_T` and `T_TO_Z` are not neutral labels. They say that shielded value
   * crossed to the transparent side, which is the precise claim this whole
   * project exists to make carefully - the difference between "value moved
   * between pools" and "value became publicly attributable" is the difference
   * between what the site is for and what it refuses to do.
   *
   * The analyser was making it wrongly, and not in a corner case. An
   * Orchard-to-Ironwood migration has Orchard positive and no transparent
   * output at all, and it came out `Z_TO_T` while the same report carried
   * `netTransparentInflowZat: 0n`. That is a self-contradicting report and a
   * false statement about every migration NU6.3 exists to produce. The cause
   * was reading `direction` as if it named the other side of the crossing; it
   * names only which way value moved across a pool boundary, and value leaving
   * one pool lands in another pool as readily as in a transparent output.
   *
   * The operator asked for this as its own assertion rather than as a line in a
   * gate-round list, so that a later reader can find the thing that guards it.
   * That is what this block is. Do not merge it into the classifier suite.
   */

  it("PASS A: a migration with no transparent output is MIGRATION_O2I, never transparent-naming", async () => {
    // NO SUPPLIED BALANCE SINCE HANDOFF-07. This called `analyze` with
    // `ironwoodValueBalanceZat: -700_000n` on the context, because that was the
    // only way to reach the branch; the balance now comes off the transaction,
    // so the assertion tests the live path rather than a hand-fed one.
    const report = await analyze(orchardToIronwood(), context());
    expect(report.transparent.vout).toHaveLength(0);
    expect(report.valueFlow.netTransparentInflowZat).toBe(0n);
    expect(report.leakClass).toBe("MIGRATION_O2I");
    expect(["Z_TO_T", "T_TO_Z"]).not.toContain(report.leakClass);
  });

  it("PASS A': with the Ironwood half withheld it is still never transparent-naming", async () => {
    // A9's rule survives the change that made A8 possible, and this is where
    // that is checked. Withholding the balance takes the class from
    // MIGRATION_O2I back to MIXED - the branch every live transaction took
    // before HANDOFF-07 - and MIXED is still an admission rather than a
    // transparent-side claim. The class may decline to name the crossing; it
    // may not name the wrong one.
    //
    // The withholding is now explicit (`null`) where it used to be the default,
    // which is the only thing about this assertion that changed.
    const report = await analyze(orchardToIronwood(), {
      ...context(),
      ironwoodValueBalanceZat: null,
    });
    expect(report.valueFlow.netTransparentInflowZat).toBe(0n);
    expect(["Z_TO_T", "T_TO_Z"]).not.toContain(report.leakClass);
    expect(report.leakClass).toBe("MIXED");
  });

  it("PASS B: a transaction that genuinely pays a transparent output is still Z_TO_T", async () => {
    // The guard must not be "never say Z_TO_T". A real deshield has somewhere
    // for the value to go, and the class is exactly right for it.
    const deshield = txn({
      version: 5,
      orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 },
      vout: [transparentOutput(690_000)],
    });
    const report = await analyze(deshield, context());
    expect(report.valueFlow.netTransparentInflowZat).toBe(690_000n);
    expect(report.leakClass).toBe("Z_TO_T");
  });

  it("PASS B': the mirror, a genuine shield with a transparent input, is still T_TO_Z", async () => {
    const shield = txn({
      version: 5,
      vin: [transparentInput()],
      orchard: { actions: [orchardAction()], valueBalanceZat: -690_000 },
    });
    const report = await analyze(shield, context());
    expect(report.leakClass).toBe("T_TO_Z");
  });
});
