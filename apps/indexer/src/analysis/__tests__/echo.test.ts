import { describe, expect, it } from "vitest";
import { asHex } from "@zcashreveal/types";

import {
  RELATIVE_EPSILON,
  SUBSET_SUM_QUANTUM_ZAT,
  absDiff,
  findSubsetSum,
  matchEcho,
  quantise,
  relativeErrorOf,
  subsetSumTolerance,
  type BoundaryEvent,
} from "../echo.js";
import { FEE_TOLERANCE_ZAT } from "../constants.js";

/**
 * THE GOLDEN CASES, FROM THE CHAIN AND NOT FROM THIS FILE.
 *
 * Every amount below is transcribed from `packages/content/data/cases.json`,
 * case `K-2026-01-02`, which the research pass verified against Blockchair on
 * 2026-08-22, or from `docs/2.0/TRACKING-MATH.md` section 6. The txids are the
 * real ones. `__tests__/GOLDEN.md` says which step of the case each is and what
 * it is evidence of.
 *
 * WHY THE AMOUNTS ARE WRITTEN AS ZEC TIMES 1e8 RATHER THAN AS ZATOSHI LITERALS.
 * A fourteen-digit literal is unreadable and unverifiable against a source that
 * states ZEC, and a transcription error in one would be invisible - the test
 * would pin the wrong number and pass. `zec()` does the conversion once, in
 * integer arithmetic, so each amount below can be read straight across from
 * cases.json.
 */
const ZATOSHI_PER_ZEC = 100_000_000n;

/** ZEC given as a decimal string, in exact integer arithmetic. No floats. */
function zec(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > 8) throw new Error(`more than 8 decimal places: ${amount}`);
  return BigInt(whole!) * ZATOSHI_PER_ZEC + BigInt(frac.padEnd(8, "0"));
}

const TX = {
  /** Step 5: t1XKfb shields its entire balance. 2026-01-02 18:01:43Z, h 3,191,017. */
  shield50k: asHex("a79347138b88b5a0405c643964c8ef308240fa5ea1058f6e35e40789f4b621c0"),
  /** Step 6: 52 minutes later, to t1dP1M. 2026-01-02 18:53:18Z, h 3,191,051. */
  unshield50k: asHex("7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c"),
  /** Step 7: the second tranche, to t1U1NE. 2026-01-02 19:31:34Z, h 3,191,091. */
  unshield24k: asHex("6db13a92f870a655e9a03d5914cad2dcc1be22be205ef781abce4eebf6ca6062"),
  /** Step 4: the largest single unshielding of the period, to t1gGCY. */
  unshield202k: asHex("e179e5b0f9fec1c6a9718b1dbe8cedddf1d8e494db276fe72c047a153365a163"),
};

const ADDR = {
  shielder: "t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK",
  recipient: "t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e",
  lockbox: "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
};

const MINUTE = 60 * 1000;
const T0 = 1_767_376_903_000; // 2026-01-02T18:01:43Z, step 5's own timestamp.

function ev(o: Partial<BoundaryEvent> & { amountZat: bigint; seenAt: number }): BoundaryEvent {
  return {
    txid: o.txid ?? asHex("00".repeat(32)),
    amountZat: o.amountZat,
    seenAt: o.seenAt,
    height: o.height ?? 3_191_000,
    pool: o.pool ?? "orchard",
    address: o.address ?? null,
  };
}

/* ========================================================================== */

describe("A1 - golden 1: the 2 Jan 2026 round trip is a RELATIVE match at MEDIUM", () => {
  const deposit = ev({
    txid: TX.shield50k,
    amountZat: zec("50000.96"),
    seenAt: T0,
    height: 3_191_017,
    address: ADDR.shielder,
  });
  const withdrawal = ev({
    txid: TX.unshield50k,
    amountZat: zec("50000.5541"),
    seenAt: T0 + 52 * MINUTE,
    height: 3_191_051,
    address: ADDR.recipient,
  });

  it("PASS STATE: grade MEDIUM, relative error 8.1e-6 +/- 1e-7, matchKind RELATIVE", () => {
    const matches = matchEcho(withdrawal, [deposit]);
    expect(matches).toHaveLength(1);

    const m = matches[0]!;
    expect(m.kind).toBe("RELATIVE");
    expect(m.grade).toBe("MEDIUM");
    expect(m.splitCount).toBe(1);
    expect(m.partial).toBe(false);
    expect(m.candidateCount).toBe(1);

    // The residual is the case's own 0.4059 ZEC, computed rather than restated.
    expect(m.residualZat).toBe(zec("0.4059"));
    expect(m.relativeError).toBeCloseTo(8.1e-6, 7);
    // The assertion's stated tolerance, checked as an interval rather than
    // through `toBeCloseTo`'s decimal-places argument, because the assertion
    // says "+/- 1e-7" and that is not what a decimal-place count means.
    expect(Math.abs(m.relativeError - 8.1e-6)).toBeLessThanOrEqual(1e-7);

    expect(m.timeDeltaMs).toBe(52 * MINUTE);
  });

  it("PASS STATE: the audit record is filter 'amount_echo' with matchKind 'RELATIVE'", () => {
    const m = matchEcho(withdrawal, [deposit])[0]!;
    expect(m.audit.filter).toBe("amount_echo");
    if (m.audit.filter !== "amount_echo") throw new Error("narrowing failed");

    expect(m.audit.params.matchKind).toBe("RELATIVE");
    expect(m.audit.params.grade).toBe("MEDIUM");
    expect(m.audit.params.withdrawalTxid).toBe(TX.unshield50k);
    expect(m.audit.params.depositTxids).toEqual([TX.shield50k]);
    expect(m.audit.params.residualZat).toBe(zec("0.4059"));
    expect(m.audit.params.relativeEpsilon).toBe(RELATIVE_EPSILON);
    // countIn is the whole window; countOut is how many survived at this grade,
    // which is what makes the grade legible beside the record.
    expect(m.audit.countIn).toBe(1n);
    expect(m.audit.countOut).toBe(1n);
  });

  it("FAIL STATE: a second candidate at the same distance drops it to LOW", () => {
    // The grade is a claim about how many candidates the rule left standing, so
    // the discriminating perturbation is another candidate rather than another
    // amount. Without this, "MEDIUM" would be pinned by a single input.
    const twin = ev({
      txid: asHex("11".repeat(32)),
      amountZat: zec("50000.9599"),
      seenAt: T0 + MINUTE,
      address: ADDR.shielder,
    });
    const matches = matchEcho(withdrawal, [deposit, twin]);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.grade)).toEqual(["LOW", "LOW"]);
    expect(matches.every((m) => m.candidateCount === 2)).toBe(true);
  });

  it("FAIL STATE: outside the window there is no match at all", () => {
    const stale = { ...deposit, seenAt: T0 - 30 * 24 * 60 * MINUTE };
    expect(matchEcho(withdrawal, [stale])).toEqual([]);
    // ...and the window is the only thing that changed.
    expect(matchEcho(withdrawal, [deposit])).toHaveLength(1);
  });
});

describe("A2 - golden 2: the v0.2 ABSOLUTE tolerance misses the same pair", () => {
  const deposit = ev({ txid: TX.shield50k, amountZat: zec("50000.96"), seenAt: T0 });
  const withdrawal = ev({
    txid: TX.unshield50k,
    amountZat: zec("50000.5541"),
    seenAt: T0 + 52 * MINUTE,
  });

  it("the residual is 254 times the v0.2 fee tolerance, so the old rule cannot see it", () => {
    const residual = absDiff(deposit.amountZat, withdrawal.amountZat);
    expect(residual).toBe(zec("0.4059"));
    expect(residual).toBeGreaterThan(FEE_TOLERANCE_ZAT);
    // Stated as the ratio, because "greater than" would also be true at
    // 160,001 zat and the point of the golden case is the SIZE of the miss.
    expect(Number(residual) / Number(FEE_TOLERANCE_ZAT)).toBeCloseTo(253.7, 1);
  });

  it("with epsilon at zero - the estimator reduced to the v0.2 rule - there is no match", () => {
    // This is the whole v0.2 rule: exact, or within the absolute fee tolerance.
    // Setting epsilon to zero is exactly that rule and nothing else, so a null
    // result here is the old behaviour reproduced rather than described.
    expect(matchEcho(withdrawal, [deposit], { relativeEpsilon: 0 })).toEqual([]);
  });

  it("FAIL STATE: restoring the calibrated epsilon finds it again", () => {
    // The discriminating half. Without this the assertion above is satisfied by
    // any estimator that never matches anything.
    const found = matchEcho(withdrawal, [deposit], { relativeEpsilon: RELATIVE_EPSILON });
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("RELATIVE");
  });
});

describe("A3 - golden 3: the lockbox partial echo grades LOW and never above it", () => {
  // TRACKING-MATH section 6: `eaedfddd...` 7,875 to the pool, `1f6099a4...`
  // 7,438.2295 back 20 minutes later to the same address, residual 436.7705.
  const deposit = ev({
    amountZat: zec("7875"),
    seenAt: T0,
    address: ADDR.lockbox,
  });
  const withdrawal = ev({
    amountZat: zec("7438.2295"),
    seenAt: T0 + 20 * MINUTE,
    address: ADDR.lockbox,
  });

  it("PASS STATE: LOW with partial true", () => {
    const matches = matchEcho(withdrawal, [deposit], { includePartial: true });
    expect(matches).toHaveLength(1);

    const m = matches[0]!;
    expect(m.kind).toBe("PARTIAL");
    expect(m.grade).toBe("LOW");
    expect(m.partial).toBe(true);
    expect(m.residualZat).toBe(zec("436.7705"));
    expect(m.timeDeltaMs).toBe(20 * MINUTE);
  });

  it("PASS STATE: never MEDIUM or HIGH, even as the only candidate in the window", () => {
    // The assertion says "never", so it is tested as a property of the rule and
    // not of one input: a single candidate promotes an EXACT match to HIGH and
    // a RELATIVE one to MEDIUM, and must promote this one to neither.
    const m = matchEcho(withdrawal, [deposit], { includePartial: true })[0]!;
    expect(m.candidateCount).toBe(1);
    expect(m.grade).not.toBe("HIGH");
    expect(m.grade).not.toBe("MEDIUM");
  });

  it("it is outside every ordinary tolerance, which is WHY it needs its own kind", () => {
    // 5.5e-2 relative: 554 times epsilon, and 55 times the 10*epsilon LOW band.
    // Recorded so nobody later "fixes" the partial rule by widening epsilon -
    // the epsilon that would admit this would admit almost anything.
    // 43,677,050,000 / 787,500,000,000 exactly, computed rather than recalled:
    // the first draft of this line carried 0.0554566, which is wrong in the
    // fifth decimal place and would have pinned a number nobody derived.
    const err = relativeErrorOf(deposit.amountZat, withdrawal.amountZat);
    expect(err).toBeCloseTo(0.05546292, 8);
    expect(err).toBeGreaterThan(RELATIVE_EPSILON * 10);
    expect(matchEcho(withdrawal, [deposit])).toEqual([]);
  });

  it("FAIL STATE: a DIFFERENT address is not a partial echo at all", () => {
    // The shared address is the whole evidential content of a partial echo.
    // Without it, "a smaller amount left after a larger one entered" is true of
    // most pairs of events on the chain.
    const elsewhere = { ...withdrawal, address: ADDR.recipient };
    expect(matchEcho(elsewhere, [deposit], { includePartial: true })).toEqual([]);
  });

  it("FAIL STATE: a LARGER withdrawal is not a partial return", () => {
    const larger = { ...withdrawal, amountZat: zec("9000") };
    expect(matchEcho(larger, [deposit], { includePartial: true })).toEqual([]);
  });

  it("FAIL STATE: partial echoes are off unless the caller asks", () => {
    expect(matchEcho(withdrawal, [deposit])).toEqual([]);
  });
});

describe("A5 - subset-sum: two shields summing to one unshield", () => {
  const thirtyK = ev({
    txid: asHex("30".repeat(32)),
    amountZat: zec("30000"),
    seenAt: T0,
  });
  const twentyK = ev({
    txid: asHex("20".repeat(32)),
    amountZat: zec("20000"),
    seenAt: T0 + 5 * MINUTE,
  });

  function withdrawalAt(offsetMs: number): BoundaryEvent {
    return ev({ amountZat: zec("49999.98"), seenAt: T0 + offsetMs });
  }

  it("PASS STATE: LOW when the timing is loose", () => {
    // Six hours after the later deposit: a two-way split, but not tight.
    const matches = matchEcho(withdrawalAt(6 * 60 * MINUTE + 5 * MINUTE), [thirtyK, twentyK]);
    expect(matches).toHaveLength(1);

    const m = matches[0]!;
    expect(m.kind).toBe("SUBSET_SUM");
    expect(m.grade).toBe("LOW");
    expect(m.splitCount).toBe(2);
    // Order-independent: the search walks its candidates most-recent-first, so
    // the pair comes back newest first. Asserting a literal order would pin the
    // traversal rather than the result.
    expect([...m.depositTxids].sort()).toEqual([thirtyK.txid, twentyK.txid].sort());
    expect(m.depositAmountZat).toBe(zec("50000"));
    expect(m.residualZat).toBe(zec("0.02"));
  });

  it("PASS STATE: MEDIUM when the timing is under an hour AND the split is 2", () => {
    const m = matchEcho(withdrawalAt(35 * MINUTE), [thirtyK, twentyK])[0]!;
    expect(m.kind).toBe("SUBSET_SUM");
    expect(m.grade).toBe("MEDIUM");
    expect(m.splitCount).toBe(2);
    expect(m.timeDeltaMs).toBeLessThan(60 * MINUTE);
  });

  it("FAIL STATE: tight timing does NOT promote a three-way split", () => {
    // Both conjuncts are required. A three-way split inside the hour stays LOW,
    // so the promotion is not really a timing rule with a decorative split
    // clause.
    const tenK = ev({ txid: asHex("10".repeat(32)), amountZat: zec("10000"), seenAt: T0 });
    const twentyFiveK = ev({ txid: asHex("25".repeat(32)), amountZat: zec("25000"), seenAt: T0 });
    const fifteenK = ev({ txid: asHex("15".repeat(32)), amountZat: zec("15000"), seenAt: T0 });
    const m = matchEcho(withdrawalAt(35 * MINUTE), [tenK, twentyFiveK, fifteenK])[0]!;
    expect(m.splitCount).toBe(3);
    expect(m.grade).toBe("LOW");
  });

  it("FAIL STATE: a single deposit that already matched suppresses the split search", () => {
    // A split containing an already-matched deposit re-describes the single
    // match rather than adding evidence, so one round trip is never reported
    // twice at two grades.
    const exact = ev({ txid: asHex("ee".repeat(32)), amountZat: zec("49999.98"), seenAt: T0 });
    const matches = matchEcho(withdrawalAt(35 * MINUTE), [exact, thirtyK, twentyK]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.kind).toBe("EXACT");
    expect(matches[0]!.grade).toBe("HIGH");
  });

  it("FAIL STATE: k is capped at 3 - four deposits summing exactly do not match", () => {
    const quarter = (i: number) =>
      ev({ txid: asHex(`${i}${i}`.repeat(32).slice(0, 64)), amountZat: zec("12499.995"), seenAt: T0 });
    const four = [quarter(1), quarter(2), quarter(3), quarter(4)];
    // They sum to exactly the withdrawal, and there is no subset of 2 or 3 that
    // lands inside tolerance, so the cap is what refuses it.
    expect(four.reduce((a, e) => a + e.amountZat, 0n)).toBe(zec("49999.98"));
    expect(matchEcho(withdrawalAt(35 * MINUTE), four)).toEqual([]);
  });

  it("quantisation is a search bound and never what makes a match fit", () => {
    // Two deposits whose QUANTISED sum lands on the target but whose true sum is
    // far outside tolerance would be admitted by a rule that checked only the
    // quantised values. The re-check on the real amounts is what refuses it.
    // 1e4 zat is the quantum, so a residual of 5,000 zat per deposit rounds
    // away - and 10,000 zat of drift is still far inside tolerance here, which
    // is why this case is built at a SMALL total where the tolerance is the
    // absolute one rather than the relative one.
    const tol = subsetSumTolerance(zec("1"), 2, FEE_TOLERANCE_ZAT, RELATIVE_EPSILON);
    expect(tol).toBe(FEE_TOLERANCE_ZAT * 2n); // 320,000 zat at 1 ZEC.

    const a = ev({ txid: asHex("aa".repeat(32)), amountZat: 50_000_000n, seenAt: T0 });
    const b = ev({ txid: asHex("bb".repeat(32)), amountZat: 50_000_000n, seenAt: T0 });
    // Sum 1.0 ZEC exactly; a withdrawal 400,000 zat below it is outside a
    // 320,000 tolerance and its quantised distance is 400,000 too - so both
    // checks agree here, which is the control.
    const w = ev({ amountZat: 100_000_000n - 400_000n, seenAt: T0 + MINUTE });
    expect(findSubsetSum(w, [a, b], {
      maxSplitCount: 3,
      maxCandidates: 48,
      epsilon: RELATIVE_EPSILON,
      feeToleranceZat: FEE_TOLERANCE_ZAT,
    })).toBeNull();
  });
});

describe("the arithmetic the grades rest on", () => {
  it("quantise rounds to 1e4 zat, half away from zero", () => {
    expect(SUBSET_SUM_QUANTUM_ZAT).toBe(10_000n);
    expect(quantise(0n)).toBe(0n);
    expect(quantise(4_999n)).toBe(0n);
    expect(quantise(5_000n)).toBe(10_000n);
    expect(quantise(10_000n)).toBe(10_000n);
    expect(quantise(14_999n)).toBe(10_000n);
    expect(quantise(15_000n)).toBe(20_000n);
  });

  it("the subset-sum tolerance takes the looser of the absolute and relative rules", () => {
    // Small total: the absolute rule wins, because 1e-4 of 1 ZEC is 10,000 zat.
    expect(subsetSumTolerance(zec("1"), 2, FEE_TOLERANCE_ZAT, RELATIVE_EPSILON)).toBe(320_000n);
    // Large total: the relative rule wins, which is the case section 3.4 works.
    expect(subsetSumTolerance(zec("50000"), 2, FEE_TOLERANCE_ZAT, RELATIVE_EPSILON)).toBe(
      zec("5"),
    );
  });

  it("relativeErrorOf divides by the DEPOSIT, per section 3.4's |X - Y| / X", () => {
    // Asymmetric on purpose: X is the shield. Swapping the arguments gives a
    // different number, and a test that used equal magnitudes could not tell.
    expect(relativeErrorOf(200n, 100n)).toBeCloseTo(0.5, 12);
    expect(relativeErrorOf(100n, 200n)).toBeCloseTo(1.0, 12);
  });

  it("a zero deposit is excluded, and the ABSOLUTE rule is why it has to be", () => {
    // THIS TEST FOUND A REAL DEFECT IN THIS MODULE RATHER THAN CONFIRMING IT.
    // The first draft relied on `relativeErrorOf` returning Infinity for a zero
    // deposit. That is true and it is not enough: the absolute fee tolerance is
    // tried FIRST and never divides, so 0n was within 160,000 zat of any small
    // withdrawal and the estimator returned a MEDIUM `FEE_TOLERANT` match
    // between an event and a non-event. `matchEcho` now drops non-positive
    // magnitudes at the window.
    expect(relativeErrorOf(0n, 100n)).toBe(Number.POSITIVE_INFINITY);
    const zeroDeposit = ev({ amountZat: 0n, seenAt: T0 });
    const w = ev({ amountZat: 100n, seenAt: T0 + MINUTE });
    expect(matchEcho(w, [zeroDeposit])).toEqual([]);

    // Both directions, because the withdrawal side had the same hole.
    const realDeposit = ev({ amountZat: 100n, seenAt: T0 });
    expect(matchEcho(ev({ amountZat: 0n, seenAt: T0 + MINUTE }), [realDeposit])).toEqual([]);
    // FAIL SIDE: two real magnitudes at the same distance DO match, so the
    // exclusion is about the zero and not about the pair being close.
    expect(matchEcho(w, [realDeposit])).toHaveLength(1);
  });
});

describe("EXACT and FEE_TOLERANT keep the v0.2 grades", () => {
  const w = ev({ amountZat: zec("100"), seenAt: T0 + MINUTE });

  it("one exact candidate is HIGH, two are MEDIUM", () => {
    const one = ev({ txid: asHex("a1".repeat(32)), amountZat: zec("100"), seenAt: T0 });
    const two = ev({ txid: asHex("a2".repeat(32)), amountZat: zec("100"), seenAt: T0 });
    expect(matchEcho(w, [one])[0]!.grade).toBe("HIGH");
    expect(matchEcho(w, [one, two]).map((m) => m.grade)).toEqual(["MEDIUM", "MEDIUM"]);
  });

  it("one fee-tolerant candidate is MEDIUM, two are LOW", () => {
    const one = ev({ txid: asHex("b1".repeat(32)), amountZat: zec("100") + 1_000n, seenAt: T0 });
    const two = ev({ txid: asHex("b2".repeat(32)), amountZat: zec("100") - 1_000n, seenAt: T0 });
    expect(matchEcho(w, [one])[0]!.grade).toBe("MEDIUM");
    expect(matchEcho(w, [one, two]).map((m) => m.grade)).toEqual(["LOW", "LOW"]);
  });

  it("an exact match suppresses nothing, but is reported ahead of the weaker kinds", () => {
    const exact = ev({ txid: asHex("c1".repeat(32)), amountZat: zec("100"), seenAt: T0 });
    const near = ev({ txid: asHex("c2".repeat(32)), amountZat: zec("100") + 1_000n, seenAt: T0 });
    const kinds = matchEcho(w, [exact, near]).map((m) => m.kind);
    expect(kinds).toEqual(["EXACT", "FEE_TOLERANT"]);
  });

  it("a deposit is never counted under two tolerances at once", () => {
    // Inside the fee tolerance is ALSO inside 10*epsilon at this magnitude, so a
    // rule that tried both independently would report the same deposit twice.
    const near = ev({ txid: asHex("d1".repeat(32)), amountZat: zec("100") + 1_000n, seenAt: T0 });
    const matches = matchEcho(w, [near]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.kind).toBe("FEE_TOLERANT");
  });

  it("the 10*epsilon band grades LOW even as the only candidate", () => {
    // Section 3.4 puts "relative <= 10*epsilon" in the LOW clause outright, so a
    // single candidate in that band does not reach MEDIUM.
    const outer = ev({
      txid: asHex("e1".repeat(32)),
      // 5e-4 relative: outside epsilon, inside 10*epsilon.
      amountZat: zec("100") + zec("100") / 2_000n,
      seenAt: T0,
    });
    const m = matchEcho(w, [outer])[0]!;
    expect(m.kind).toBe("RELATIVE");
    expect(m.grade).toBe("LOW");
    expect(m.relativeError).toBeGreaterThan(RELATIVE_EPSILON);
    expect(m.relativeError).toBeLessThanOrEqual(RELATIVE_EPSILON * 10);
  });
});

describe("purity and boundedness", () => {
  it("the same inputs give the same answer, and the inputs are not mutated", () => {
    const deposits = [
      ev({ txid: asHex("f1".repeat(32)), amountZat: zec("10"), seenAt: T0 }),
      ev({ txid: asHex("f2".repeat(32)), amountZat: zec("40"), seenAt: T0 + MINUTE }),
    ];
    const before = JSON.stringify(deposits, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    const w = ev({ amountZat: zec("50"), seenAt: T0 + 2 * MINUTE });

    const first = matchEcho(w, deposits);
    const second = matchEcho(w, deposits);
    expect(second).toEqual(first);
    expect(
      JSON.stringify(deposits, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    ).toBe(before);
  });

  it("the subset-sum search is capped, and the cap is visible in the audit record", () => {
    // 60 deposits, of which only the OLDEST two sum to the withdrawal. With the
    // cap at 8 the search cannot see them; raising it finds them. The cap is not
    // a detail - an estimate that quietly stopped looking is what section 3's
    // audit contract exists to expose.
    const filler = Array.from({ length: 58 }, (_v, i) =>
      ev({
        txid: asHex(i.toString(16).padStart(64, "0")),
        amountZat: zec("7"),
        seenAt: T0 + (i + 3) * MINUTE,
      }),
    );
    const oldA = ev({ txid: asHex("aa".repeat(32)), amountZat: zec("30"), seenAt: T0 });
    const oldB = ev({ txid: asHex("bb".repeat(32)), amountZat: zec("20"), seenAt: T0 + MINUTE });
    const deposits = [oldA, oldB, ...filler];
    const w = ev({ amountZat: zec("50"), seenAt: T0 + 200 * MINUTE });

    expect(matchEcho(w, deposits, { subsetSumMaxCandidates: 8 })).toEqual([]);

    const found = matchEcho(w, deposits, { subsetSumMaxCandidates: 64 });
    expect(found).toHaveLength(1);
    expect(found[0]!.depositTxids.slice().sort()).toEqual([oldA.txid, oldB.txid].slice().sort());
    // countIn reports the whole in-window population, not the truncated slice,
    // so a reader can see that 60 were available.
    expect(found[0]!.audit.countIn).toBe(60n);
  });
});
