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
 * fix was a seam rather than a workaround: `AnalyzeContext` now carries an
 * optional `ironwoodValueBalanceZat`, which a caller holding a decoded bundle
 * supplies and the live path leaves unset. Both halves are covered below, and
 * HANDOFF-07 fills the seam rather than reopening the module.
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
 * The shape a real Orchard-to-Ironwood migration has on the wire: a v6
 * transaction whose Orchard bundle publishes a positive value balance - value
 * LEAVING Orchard, which is the only direction ZIP 2006 still permits - and
 * whose Ironwood bundle takes the same amount in.
 */
function orchardToIronwood(): RpcTransaction {
  return {
    ...txn({
      version: 6,
      orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 },
    }),
    ironwood: { actions: [{}], valueBalanceZat: -700_000 },
  } as RpcTransaction;
}

describe("MIGRATION_O2I — the negative case, which is the one the live analyser takes", () => {
  it("Orchard positive with the Ironwood balance UNKNOWN is not classified as a migration", async () => {
    // `null` means not decoded, which is not the same as zero and not the same
    // as negative. A null input cannot satisfy the predicate, so nothing is
    // guessed and nothing is claimed - which is the whole reason the rule takes
    // a nullable rather than defaulting to 0n. This is the branch every
    // transaction takes today.
    const report = await analyze(orchardToIronwood(), context());
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
  });

  it("no heuristic stands in for the missing half, even where one would be defensible", async () => {
    // It would be easy to guess: past NU6.3, Orchard is exit-only, so value
    // leaving Orchard with no transparent output to receive it has nowhere to go
    // but Ironwood. That inference is defensible and it is still a guess, and it
    // would misclassify an Orchard-to-Sapling transfer as a migration. This
    // transaction has exactly that profile - Orchard positive, no vout - and it
    // still does not classify as a migration.
    const report = await analyze(orchardToIronwood(), context());
    expect(report.valueFlow.netTransparentInflowZat).toBe(0n);
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
  });

  it("with the Ironwood half unknown it is MIXED - an admission, not a claim", async () => {
    // THIS ASSERTION USED TO READ `Z_TO_T`, AND THAT WAS THE DEFECT. A gate
    // round against this handoff pinned the live behaviour here and condemned
    // it in the same breath: `Z_TO_T` asserts that value left the shielded side
    // for the transparent one, while the assertion above shows
    // `netTransparentInflowZat` is `0n` and nothing transparent received
    // anything. The analyser was not declining to identify the migration, it
    // was making a specific false statement about it, and would have made that
    // statement about every NU6.3 migration.
    //
    // The cause was that `direction` was being read as if it named the other
    // side of the crossing. It does not: it says only which way value moved
    // across a pool boundary, and value leaving one pool lands in another pool
    // as readily as in a transparent output. `classifyLeak` now requires a
    // transparent output before it will say `Z_TO_T`, and a transparent input
    // before `T_TO_Z`, so this falls through to `MIXED`.
    //
    // `MIXED` is the right answer and not a consolation prize: value moved
    // between pools and this build cannot characterise the crossing, which is
    // exactly what MIXED means. When HANDOFF-07 decodes the Ironwood bundle,
    // MIGRATION_O2I fires above and this assertion should be replaced rather
    // than deleted - the transaction will have a name by then.
    const report = await analyze(orchardToIronwood(), context());
    expect(report.leakClass).toBe("MIXED");
    expect(report.valueFlow.direction).toBe("WITHDRAWAL");
    expect(report.valueFlow.perPoolZat).toEqual([{ pool: "orchard", deltaZat: 700_000n }]);
  });

  it("FAIL SIDE: the same Orchard outflow WITH a transparent recipient is Z_TO_T", async () => {
    // The discriminating half, and the reason the guard is not simply
    // "never say Z_TO_T". A genuine deshield has somewhere for the value to go:
    // one transparent output, and the class is Z_TO_T again. Only the vout
    // differs from the transaction above.
    const deshield = txn({
      version: 5,
      orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 },
      vout: [transparentOutput(690_000)],
    });
    const report = await analyze(deshield, context());
    expect(report.valueFlow.direction).toBe("WITHDRAWAL");
    expect(report.leakClass).toBe("Z_TO_T");
  });

  it("Ironwood contributes nothing to perPoolZat, so the report does not imply it moved", async () => {
    // The honest half of the gap. An undecoded pool is ABSENT from the list
    // rather than present at zero, because a hardcoded zero renders as a
    // measurement - and "Ironwood moved 0 ZEC" is a claim this build cannot make.
    const report = await analyze(orchardToIronwood(), context());
    expect(report.valueFlow.perPoolZat.map((p) => p.pool)).not.toContain("ironwood");
  });
});

describe("MIGRATION_O2I — the positive case, through the seam a gate round added", () => {
  /**
   * THE RULE IS IMPLEMENTED AND REACHABLE, and this block is where that stops
   * being a claim.
   *
   * It was neither, briefly. `classifyLeak` returns MIGRATION_O2I when
   * Orchard's balance is positive and Ironwood's is non-null and negative, and
   * the first version of `analyze()` passed `ironwoodValueBalanceZat: null` as
   * a LITERAL - so no transaction of any shape could reach the branch, while
   * the docblock beside it asserted that the classifier's unit tests supplied
   * the balance directly. They could not: `classifyLeak` is module-private and
   * `analyze()` is the only way in. A rule that reads as covered and never runs
   * is the same defect as `tx.feeZat` and `expiryheight`, which is what this
   * handoff exists to close, so finding a third instance inside the fix was not
   * a thing to repair quietly.
   *
   * `AnalyzeContext.ironwoodValueBalanceZat` is the seam. A caller that has
   * decoded the bundle supplies it; the live path does not, because decoding v6
   * is HANDOFF-07's deliverable. Both halves are exercised below.
   */
  it("PASS STATE: Orchard positive with a supplied negative Ironwood balance is MIGRATION_O2I", async () => {
    const report = await analyze(orchardToIronwood(), {
      ...context(),
      ironwoodValueBalanceZat: -700_000n,
    });
    expect(report.leakClass).toBe("MIGRATION_O2I");
  });

  it("FAIL STATE: the identical transaction with the balance withheld is not", async () => {
    // Only the context differs. This is the branch every live transaction takes
    // today, and it must not become a migration by proximity to one.
    const report = await analyze(orchardToIronwood(), context());
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
    expect(report.leakClass).toBe("MIXED");
  });

  it("a supplied Ironwood balance of ZERO is not a migration either", async () => {
    // Zero is a decoded fact and it says the pool did not move, so it must fail
    // the predicate for the opposite reason null does. If `0n` passed, the
    // nullable would be decoration and a coalesced default would be as good -
    // which is exactly the reasoning that produced `BigInt(tx.feeZat ?? 0)`.
    const report = await analyze(orchardToIronwood(), {
      ...context(),
      ironwoodValueBalanceZat: 0n,
    });
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
  });

  it("Ironwood negative WITHOUT Orchard draining is not a migration", async () => {
    // Value entering Ironwood from somewhere other than Orchard is not ZIP 318.
    // Both halves of the predicate have to carry weight or one of them is
    // decoration.
    const shielding = txn({
      version: 6,
      vin: [transparentInput()],
      orchard: { actions: [], valueBalanceZat: 0 },
    });
    const report = await analyze(shielding, {
      ...context(),
      ironwoodValueBalanceZat: -700_000n,
    });
    expect(report.leakClass).not.toBe("MIGRATION_O2I");
  });

  it("no combination of version or ironwood KEY reaches the branch without the context balance", async () => {
    // The wire shape alone is never enough. `hasUndecodedIronwood` reads the
    // key to refuse a fee; the classifier will not read it to make a claim,
    // because this build has not verified Ironwood's serialised shape and a
    // value taken out of an unverified field is money taken on trust.
    const shapes: ReadonlyArray<readonly [string, RpcTransaction]> = [
      ["v6 with a negative ironwood balance on the wire", orchardToIronwood()],
      [
        "v5 with an ironwood key",
        {
          ...txn({ version: 5, orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 } }),
          ironwood: { actions: [{}], valueBalanceZat: -700_000 },
        } as RpcTransaction,
      ],
      [
        "v6 with no ironwood key at all",
        txn({ version: 6, orchard: { actions: [orchardAction()], valueBalanceZat: 700_000 } }),
      ],
    ];

    for (const [name, tx] of shapes) {
      const report = await analyze(tx, context());
      expect(report.leakClass, `${name} reached MIGRATION_O2I`).not.toBe("MIGRATION_O2I");
    }
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
    const report = await analyze(orchardToIronwood(), {
      ...context(),
      ironwoodValueBalanceZat: -700_000n,
    });
    expect(report.transparent.vout).toHaveLength(0);
    expect(report.valueFlow.netTransparentInflowZat).toBe(0n);
    expect(report.leakClass).toBe("MIGRATION_O2I");
    expect(["Z_TO_T", "T_TO_Z"]).not.toContain(report.leakClass);
  });

  it("PASS A': with the Ironwood half withheld it is still never transparent-naming", async () => {
    // The branch every live transaction takes until HANDOFF-07 decodes v6. It
    // may decline to name the crossing; it may not name the wrong one.
    const report = await analyze(orchardToIronwood(), context());
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
