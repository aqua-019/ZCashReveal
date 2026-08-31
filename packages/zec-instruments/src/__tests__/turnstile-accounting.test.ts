import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  orchardDrain,
  selectWindow,
  turnstileResidual,
  violatesExitOnly,
  type PoolBalanceSample,
} from "../turnstile-accounting.js";
import {
  NU6_3_ACTIVATION_MAINNET,
  orchardExitOnlyFrom,
} from "../activation-heights.js";

/**
 * HANDOFF-09 assertions A1 and A2, plus the falsifiable form of plan section
 * 3.1's exit-only invariant.
 *
 * WHY EVERY EXPECTATION HERE IS WRITTEN TWICE - once at the precision the code
 * actually computes and once at the precision the handoff's own figure implies.
 * A1 states `V = 0.95669 +/- 1e-5` and A2 states `D = 0.8063 +/- 1e-4`, which are
 * rounded figures with tolerances attached. Asserting only the rounded figure
 * lets a defect of 9e-6 through on the site's headline number; asserting only the
 * full-precision value drops the link back to the handoff. Both are asserted, and
 * the arithmetic was checked before the code was written rather than after - see
 * the worked sums beside each block. HANDOFF-08's A8 set this precedent and
 * LEDGER-08 Q2 records it as the right move.
 */

const ZATOSHI_PER_ZEC = 100_000_000n;
function zec(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > 8) throw new Error(`more than 8 decimal places: ${amount}`);
  return BigInt(whole!) * ZATOSHI_PER_ZEC + BigInt(frac.padEnd(8, "0"));
}

const MS_PER_HOUR = 3_600_000;

/**
 * An arbitrary fixed epoch for the fixtures. A LITERAL, not `Date.now()` and not
 * `Date.UTC` of "today": every timestamp in this suite has to be reproducible on
 * a rerun, for the same reason the module reads block timestamps rather than a
 * clock.
 */
const T0 = 1_800_000_000_000;

/* ==========================================================================
   A1 - the Unprovable Residual (plan section 3.2)
   ========================================================================== */

describe("A1 - the Unprovable Residual", () => {
  // The handoff's fixture, and the arithmetic checked by hand before the code:
  //   U = 22,621 + 708,841 = 731,462 ZEC
  //   U/Supply = 731,462 / 16,889,987 = 0.043307434162...
  //   V = 1 - that = 0.956692565838...
  //   |V - 0.95669| = 2.5658e-6, which is inside the handoff's 1e-5. The stated
  //   figure holds; nothing was bent to fit it and the tolerance was not loosened.
  const SPROUT = zec("22621");
  const ORCHARD = zec("708841");
  const SUPPLY = zec("16889987");

  it("A1 PASS STATE: sprout 22,621 and orchard 708,841 against supply 16,889,987 give U = 731,462 ZEC and V = 0.95669", () => {
    const r = turnstileResidual({ sprout: SPROUT, orchard: ORCHARD }, SUPPLY);

    expect(r.unprovableZat).toBe(zec("731462"));
    expect(r.unprovableZat).toBe(73_146_200_000_000n);
    expect(r.supplyZat).toBe(SUPPLY);

    // The handoff's figure, at the handoff's tolerance.
    expect(Math.abs(r.verifiedShare - 0.95669)).toBeLessThanOrEqual(1e-5);

    // ...and the value the code actually computes, at the full precision of the
    // module's 1e-12 fixed-point ratio. Asserted as scaled integers because a
    // float literal at the twelfth decimal is a worse thing for a later reader to
    // check by eye than 43307434162 is.
    expect(Math.round(r.unprovableShare * 1e12)).toBe(43_307_434_162);
    expect(Math.round(r.verifiedShare * 1e12)).toBe(956_692_565_838);

    // The share is a share: it is in [0, 1] and the pair sums to one.
    expect(r.unprovableShare).toBeGreaterThan(0);
    expect(r.unprovableShare).toBeLessThan(1);
    expect(r.unprovableShare + r.verifiedShare).toBeCloseTo(1, 15);
  });

  it("A1 PASS STATE: the residual emits no FilterApplication, because it narrows nothing", () => {
    const r = turnstileResidual({ sprout: SPROUT, orchard: ORCHARD }, SUPPLY);
    // U and V are aggregates at one height with no candidate set. A record here
    // would document a filter that did not run, which is worse than no record
    // because a reader trusts an audit trail.
    expect(Object.keys(r).sort()).toEqual([
      "supplyZat",
      "unprovableShare",
      "unprovableZat",
      "verifiedShare",
    ]);
    expect(r).not.toHaveProperty("audit");
    expect(r).not.toHaveProperty("audits");
  });

  it("A1 PASS STATE: sapling and ironwood are ignored - U is sprout plus orchard and nothing else", () => {
    const withOthers = turnstileResidual(
      { sprout: SPROUT, orchard: ORCHARD, sapling: zec("529000"), ironwood: zec("3130000") },
      SUPPLY,
    );
    expect(withOthers.unprovableZat).toBe(zec("731462"));
    expect(withOthers.verifiedShare).toBe(
      turnstileResidual({ sprout: SPROUT, orchard: ORCHARD }, SUPPLY).verifiedShare,
    );
  });

  it("A1 FAIL STATE: a supply of 0 throws rather than producing Infinity", () => {
    // The fail side is not "an exception is raised". It is that the number the
    // naive arithmetic produces never reaches a caller - and this is what that
    // number is, executed here so the guard has something to be measured against.
    expect(Number(SPROUT + ORCHARD) / 0).toBe(Infinity);

    expect(() => turnstileResidual({ sprout: SPROUT, orchard: ORCHARD }, 0n)).toThrow(RangeError);
    expect(() => turnstileResidual({ sprout: SPROUT, orchard: ORCHARD }, 0n)).toThrow(
      /supplyZat must be positive/,
    );
    // A negative supply is the same failure and must not slip through a `=== 0n`.
    expect(() => turnstileResidual({ sprout: SPROUT, orchard: ORCHARD }, -1n)).toThrow(RangeError);

    // The control: one zatoshi of supply is a real division and returns finite.
    const tiny = turnstileResidual({ sprout: 0n, orchard: 0n }, 1n);
    expect(Number.isFinite(tiny.verifiedShare)).toBe(true);
    expect(tiny.verifiedShare).toBe(1);
  });

  it("A1 FAIL STATE: an absent sprout or orchard balance throws rather than counting as zero", () => {
    // Counting an unsupplied balance as zero would publish a HIGHER verified
    // share than the truth, which is an unearned reassurance about the one
    // number the site leads with.
    expect(() => turnstileResidual({ orchard: ORCHARD }, SUPPLY)).toThrow(TypeError);
    expect(() => turnstileResidual({ orchard: ORCHARD }, SUPPLY)).toThrow(/sprout/);
    expect(() => turnstileResidual({ sprout: SPROUT }, SUPPLY)).toThrow(/orchard/);
    expect(() => turnstileResidual({}, SUPPLY)).toThrow(/sprout and orchard/);
    // An explicit zero is a reading and is accepted: an emptied Sprout pool is
    // the event this instrument exists to detect.
    expect(turnstileResidual({ sprout: 0n, orchard: ORCHARD }, SUPPLY).unprovableZat).toBe(ORCHARD);
  });

  it("A1 FAIL STATE: a negative pool balance throws - ZIP 209 says Bal^p >= 0", () => {
    expect(() => turnstileResidual({ sprout: -1n, orchard: ORCHARD }, SUPPLY)).toThrow(RangeError);
    expect(() => turnstileResidual({ sprout: SPROUT, orchard: -1n }, SUPPLY)).toThrow(/ZIP 209/);
  });

  it("A1 FAIL STATE: a residual larger than the supply throws rather than publishing a negative verified share", () => {
    expect(() => turnstileResidual({ sprout: SUPPLY, orchard: SUPPLY }, SUPPLY)).toThrow(RangeError);
    expect(() => turnstileResidual({ sprout: SUPPLY, orchard: 1n }, SUPPLY)).toThrow(/exceeds the supply/);
    // The boundary is inclusive on the legal side: a pool holding the entire
    // supply is 0% verified, which is a coherent statement.
    expect(turnstileResidual({ sprout: SUPPLY, orchard: 0n }, SUPPLY).verifiedShare).toBe(0);
  });
});

/* ==========================================================================
   A2 - the Orchard drain and its velocity (plan section 3.3)
   ========================================================================== */

describe("A2 - the Orchard drain", () => {
  // The handoff's fixture, checked by hand before the code:
  //   D = 1 - 708,841 / 3,660,000 = 1 - 0.193672404372 = 0.806327595628
  //   |D - 0.8063| = 2.7596e-5, inside the handoff's 1e-4. The stated figure
  //   holds; nothing was bent and no tolerance was loosened.
  const BASELINE_ZAT = zec("3660000");
  const BASE_HEIGHT = 3_500_000;

  /**
   * Twenty-five hourly samples, falling one ZEC per sample, ending at the
   * handoff's 708,841 ZEC.
   *
   * THE WINDOW SPANS EXACTLY 24 HOURS BECAUSE THE FIXTURE WAS BUILT THAT WAY,
   * and that is the only reason `velocity24hZecPerHour` equals `delta / 24`
   * here. The module divides by the ELAPSED hours the samples' own timestamps
   * report, never by the 24 it was asked for, so on a fixture spanning 23.7 h -
   * which is what a real day of blocks looks like when one is slow - the two
   * definitions differ and the module's is the correct one. The coincidence is
   * what makes A2's second clause checkable by eye; it is not a property of the
   * code.
   */
  function hourlySeries(): PoolBalanceSample[] {
    const out: PoolBalanceSample[] = [];
    for (let i = 0; i <= 24; i += 1) {
      out.push({
        height: BASE_HEIGHT + i,
        timeMs: T0 + i * MS_PER_HOUR,
        balanceZat: zec("708865") - zec(String(i)),
      });
    }
    return out;
  }

  it("A2 PASS STATE: baseline 3,660,000 ZEC and 708,841 ZEC now give D = 0.8063", () => {
    const series = hourlySeries();
    const d = orchardDrain(series, {
      baselineHeight: NU6_3_ACTIVATION_MAINNET,
      baselineZat: BASELINE_ZAT,
      atHeight: BASE_HEIGHT + 24,
    });

    expect(d.pool).toBe("orchard");
    expect(d.baselineHeight).toBe(3_428_143);
    expect(d.baselineZat).toBe(BASELINE_ZAT);
    expect(d.currentZat).toBe(zec("708841"));

    // The handoff's figure at the handoff's tolerance, then the full precision.
    expect(Math.abs(d.drained - 0.8063)).toBeLessThanOrEqual(1e-4);
    expect(Math.round(d.drained * 1e12)).toBe(806_327_595_628);
  });

  it("A2 PASS STATE: velocity over a 24 h fixture window equals delta balance over 24", () => {
    const series = hourlySeries();
    const d = orchardDrain(series, {
      baselineHeight: NU6_3_ACTIVATION_MAINNET,
      baselineZat: BASELINE_ZAT,
      atHeight: BASE_HEIGHT + 24,
    });

    // delta = 708,841 - 708,865 = -24 ZEC across a span of exactly 24 h.
    const deltaZec = -24;
    expect(d.velocity24hZecPerHour).not.toBeNull();
    expect(Math.abs(d.velocity24hZecPerHour! - deltaZec / 24)).toBeLessThanOrEqual(1e-6);
    expect(d.velocity24hZecPerHour).toBe(-1);

    // The 7 d window admits the same 25 samples - the fixture is only 24 h long -
    // so the two velocities coincide here. On a real week they would not, and a
    // test that read this as "the windows agree" would be pinning the fixture.
    expect(d.velocity7dZecPerHour).toBe(d.velocity24hZecPerHour);

    expect(d.sampleCount).toBe(25);
  });

  it("A2 PASS STATE: the drain emits the two turnstile_window records, every field of each", () => {
    const series = hourlySeries();
    const d = orchardDrain(series, {
      baselineHeight: NU6_3_ACTIVATION_MAINNET,
      baselineZat: BASELINE_ZAT,
      atHeight: BASE_HEIGHT + 24,
    });

    expect(d.audits).toHaveLength(2);
    for (const [i, hours] of [24, 168].entries()) {
      const audit = d.audits[i]!;
      expect(audit.filter).toBe("turnstile_window");
      // NARROWED ON THE DISCRIMINATOR, NOT CAST THROUGH IT: reading
      // `params.deltaZat` only compiles once the record is narrowed, so this is a
      // compile-time check that the module emits the right variant as well as a
      // runtime one.
      if (audit.filter !== "turnstile_window") throw new Error("not a turnstile_window record");
      expect(audit.params.pool).toBe("orchard");
      expect(audit.params.windowHours).toBe(hours);
      expect(audit.params.lowHeight).toBe(BASE_HEIGHT);
      expect(audit.params.highHeight).toBe(BASE_HEIGHT + 24);
      expect(audit.params.deltaZat).toBe(-zec("24"));
      expect(audit.countIn).toBe(25n);
      expect(audit.countOut).toBe(25n);
    }
  });

  it("A2 FAIL STATE: a baseline of 0 throws - D is undefined", () => {
    const series = hourlySeries();
    // What the guard prevents: division by a zero baseline is Infinity, and
    // 1 - Infinity would publish a drain of minus infinity.
    expect(Number(zec("708841")) / 0).toBe(Infinity);

    expect(() =>
      orchardDrain(series, {
        baselineHeight: NU6_3_ACTIVATION_MAINNET,
        baselineZat: 0n,
        atHeight: BASE_HEIGHT + 24,
      }),
    ).toThrow(RangeError);
    expect(() =>
      orchardDrain(series, {
        baselineHeight: NU6_3_ACTIVATION_MAINNET,
        baselineZat: 0n,
        atHeight: BASE_HEIGHT + 24,
      }),
    ).toThrow(/baselineZat must be positive/);
    expect(() =>
      orchardDrain(series, {
        baselineHeight: NU6_3_ACTIVATION_MAINNET,
        baselineZat: -1n,
        atHeight: BASE_HEIGHT + 24,
      }),
    ).toThrow(RangeError);
  });

  it("A2 FAIL STATE: a window with one sample gives a null velocity, not a zero one", () => {
    const one: PoolBalanceSample[] = [
      { height: BASE_HEIGHT, timeMs: T0, balanceZat: zec("708841") },
    ];
    const w = selectWindow("orchard", one, { windowHours: 24, highHeight: BASE_HEIGHT });

    expect(w.samples).toHaveLength(1);
    expect(w.elapsedHours).toBe(0);
    // NOT ZERO. A single sample reports no change over no time, and "0 ZEC/h"
    // is a measurement that says the pool stopped draining. The distinction is
    // the same one HANDOFF-06 got wrong when an unknown fee was published as a
    // verdict.
    expect(w.zecPerHour).toBeNull();
    expect(w.zecPerHour).not.toBe(0);
    expect(w.deltaZat).toBe(0n);

    const d = orchardDrain(one, {
      baselineHeight: NU6_3_ACTIVATION_MAINNET,
      baselineZat: BASELINE_ZAT,
      atHeight: BASE_HEIGHT,
    });
    expect(d.velocity24hZecPerHour).toBeNull();
    expect(d.velocity7dZecPerHour).toBeNull();
    expect(d.sampleCount).toBe(1);
    // The drain itself is still defined: it needs one balance, not two.
    expect(Math.abs(d.drained - 0.8063)).toBeLessThanOrEqual(1e-4);
  });

  it("A2 FAIL STATE: two samples sharing one timestamp give a null velocity, not Infinity", () => {
    const sameInstant: PoolBalanceSample[] = [
      { height: BASE_HEIGHT, timeMs: T0, balanceZat: zec("708850") },
      { height: BASE_HEIGHT + 1, timeMs: T0, balanceZat: zec("708841") },
    ];
    const w = selectWindow("orchard", sameInstant, { windowHours: 24, highHeight: BASE_HEIGHT + 1 });
    expect(w.samples).toHaveLength(2);
    expect(w.deltaZat).toBe(-zec("9"));
    expect(w.elapsedHours).toBe(0);
    // -9 / 0 is -Infinity in float, and it would render as a rate.
    expect(-9 / 0).toBe(-Infinity);
    expect(w.zecPerHour).toBeNull();
  });

  it("A2 FAIL STATE: a series with nothing at or below atHeight throws rather than reporting a drain it never read", () => {
    const series = hourlySeries();
    expect(() =>
      orchardDrain(series, {
        baselineHeight: NU6_3_ACTIVATION_MAINNET,
        baselineZat: BASELINE_ZAT,
        atHeight: BASE_HEIGHT - 1,
      }),
    ).toThrow(/no sample at or below atHeight/);
  });
});

/* ==========================================================================
   selectWindow - the selection rule A2's velocity rests on
   ========================================================================== */

describe("A2 - the window selection rule", () => {
  const BASE = 3_500_000;

  /** One sample per hour for `n + 1` hours, balance falling one ZEC per hour. */
  function series(n: number): PoolBalanceSample[] {
    const out: PoolBalanceSample[] = [];
    for (let i = 0; i <= n; i += 1) {
      out.push({
        height: BASE + i,
        timeMs: T0 + i * MS_PER_HOUR,
        balanceZat: zec("1000") - zec(String(i)),
      });
    }
    return out;
  }

  it("A2 PASS STATE: the upper bound is a height and the span is time, both inclusive", () => {
    const all = series(48);
    const w = selectWindow("orchard", all, { windowHours: 24, highHeight: BASE + 30 });

    // Nothing above the height ceiling.
    expect(w.samples.every((s) => s.height <= BASE + 30)).toBe(true);
    // The newest ADMITTED sample is the anchor, not the newest supplied one.
    expect(w.samples[w.samples.length - 1]!.height).toBe(BASE + 30);
    // Inclusive at the old end: the sample exactly 24 h before the anchor is in.
    expect(w.samples[0]!.height).toBe(BASE + 6);
    expect(w.samples).toHaveLength(25);
    expect(w.elapsedHours).toBe(24);
    expect(w.deltaZat).toBe(-zec("24"));
    expect(w.zecPerHour).toBe(-1);

    if (w.audit.filter !== "turnstile_window") throw new Error("not a turnstile_window record");
    expect(w.audit.countIn).toBe(49n);
    expect(w.audit.countOut).toBe(25n);
    expect(w.audit.params.lowHeight).toBe(BASE + 6);
    expect(w.audit.params.highHeight).toBe(BASE + 30);
  });

  it("A2 PASS STATE: a sample one millisecond older than the window is excluded", () => {
    const twoSamples: PoolBalanceSample[] = [
      { height: BASE, timeMs: T0 - 1, balanceZat: zec("1000") },
      { height: BASE + 1, timeMs: T0 + 24 * MS_PER_HOUR, balanceZat: zec("900") },
    ];
    const w = selectWindow("orchard", twoSamples, { windowHours: 24, highHeight: BASE + 1 });
    expect(w.samples).toHaveLength(1);
    expect(w.zecPerHour).toBeNull();

    // ...and one millisecond younger is included, so the boundary is where it
    // says it is rather than merely somewhere nearby.
    const justInside: PoolBalanceSample[] = [
      { height: BASE, timeMs: T0, balanceZat: zec("1000") },
      { height: BASE + 1, timeMs: T0 + 24 * MS_PER_HOUR, balanceZat: zec("900") },
    ];
    const w2 = selectWindow("orchard", justInside, { windowHours: 24, highHeight: BASE + 1 });
    expect(w2.samples).toHaveLength(2);
    expect(w2.elapsedHours).toBe(24);
    expect(w2.zecPerHour).toBeCloseTo(-100 / 24, 12);
  });

  it("A2 PASS STATE: an empty window reports countOut 0 and no rate", () => {
    const w = selectWindow("orchard", series(10), { windowHours: 24, highHeight: BASE - 1 });
    expect(w.samples).toHaveLength(0);
    expect(w.deltaZat).toBe(0n);
    expect(w.zecPerHour).toBeNull();
    if (w.audit.filter !== "turnstile_window") throw new Error("not a turnstile_window record");
    expect(w.audit.countIn).toBe(11n);
    expect(w.audit.countOut).toBe(0n);
    // No low edge exists, so both bounds carry the ceiling and countOut says so.
    expect(w.audit.params.lowHeight).toBe(BASE - 1);
    expect(w.audit.params.highHeight).toBe(BASE - 1);
  });

  it("A2 PASS STATE: the caller's array is neither reordered nor mutated", () => {
    const all = series(30);
    const shuffled = [all[5]!, all[0]!, all[30]!, all[12]!];
    const before = shuffled.map((s) => ({ ...s }));

    const w = selectWindow("orchard", shuffled, { windowHours: 168, highHeight: BASE + 30 });
    expect(shuffled).toEqual(before);
    // ...and the module sorted its own copy: the result is ascending in time.
    expect(w.samples.map((s) => s.height)).toEqual([BASE, BASE + 5, BASE + 12, BASE + 30]);

    orchardDrain(shuffled, {
      baselineHeight: NU6_3_ACTIVATION_MAINNET,
      baselineZat: zec("3660000"),
      atHeight: BASE + 30,
    });
    expect(shuffled).toEqual(before);
  });

  it("A2 FAIL STATE: a window of zero or negative hours throws", () => {
    expect(() => selectWindow("orchard", series(4), { windowHours: 0, highHeight: BASE + 4 })).toThrow(
      RangeError,
    );
    expect(() =>
      selectWindow("orchard", series(4), { windowHours: -24, highHeight: BASE + 4 }),
    ).toThrow(/positive finite/);
    expect(() =>
      selectWindow("orchard", series(4), { windowHours: Number.NaN, highHeight: BASE + 4 }),
    ).toThrow(RangeError);
  });
});

/* ==========================================================================
   EXIT-ONLY - plan section 3.1's ZIP 2006 invariant, as a falsifiable predicate
   ========================================================================== */

describe("EXIT-ONLY - an Orchard series may not grow at or after NU6.3", () => {
  const H = orchardExitOnlyFrom("mainnet");

  it("EXIT-ONLY PASS STATE: the height comes from activation-heights, not from a literal", () => {
    // Read rather than hardcoded, so a correction to ZIP 258's draft height
    // moves this predicate with it. The literal is asserted ONCE, here, as the
    // link between the two files.
    expect(H).toBe(NU6_3_ACTIVATION_MAINNET);
    expect(H).toBe(3_428_143);
  });

  it("EXIT-ONLY FAIL STATE, the named worked case: an Orchard balance that rises after NU6.3", () => {
    // THE CONCRETE SCENARIO THE PROPERTY EXISTS TO FORBID, executed rather than
    // described. Three consecutive blocks from the activation height: the pool
    // falls by one ZEC and then rises by five. Under ZIP 2006 no value may enter
    // Orchard from H onward, so the rise between H+1 and H+2 is a violation and
    // the predicate must say so.
    const rising: PoolBalanceSample[] = [
      { height: H, timeMs: T0, balanceZat: zec("708841") },
      { height: H + 1, timeMs: T0 + MS_PER_HOUR, balanceZat: zec("708840") },
      { height: H + 2, timeMs: T0 + 2 * MS_PER_HOUR, balanceZat: zec("708845") },
    ];
    expect(violatesExitOnly(rising)).toBe(true);

    // The same rise BEFORE the activation height is legal and must not be
    // flagged - value entering Orchard was ordinary until H.
    const legal: PoolBalanceSample[] = rising.map((s, i) => ({ ...s, height: H - 10 + i }));
    expect(violatesExitOnly(legal)).toBe(false);

    // The pair that straddles activation across a GAP is not attributable to any
    // post-activation block, so it is deliberately not flagged. The module's
    // docblock records this as an under-report and says why.
    const straddling: PoolBalanceSample[] = [
      { height: H - 10, timeMs: T0, balanceZat: zec("708841") },
      { height: H, timeMs: T0 + MS_PER_HOUR, balanceZat: zec("708900") },
    ];
    expect(violatesExitOnly(straddling)).toBe(false);

    // ...but with no gap the delta covers only block H, and it IS flagged.
    const adjacent: PoolBalanceSample[] = [
      { height: H - 1, timeMs: T0, balanceZat: zec("708841") },
      { height: H, timeMs: T0 + MS_PER_HOUR, balanceZat: zec("708900") },
    ];
    expect(violatesExitOnly(adjacent)).toBe(true);
  });

  it("EXIT-ONLY PASS STATE: the network parameter selects the height", () => {
    // One series, two answers. Heights around mainnet's NU6.3 are long before
    // testnet's 4,134,000, so the same growth is a violation on mainnet and
    // unremarkable on testnet.
    const rising: PoolBalanceSample[] = [
      { height: H, timeMs: T0, balanceZat: zec("100") },
      { height: H + 1, timeMs: T0 + MS_PER_HOUR, balanceZat: zec("200") },
    ];
    expect(violatesExitOnly(rising, { network: "mainnet" })).toBe(true);
    expect(violatesExitOnly(rising, { network: "testnet" })).toBe(false);
    expect(violatesExitOnly(rising)).toBe(true);
  });

  it("EXIT-ONLY PROPERTY: a non-increasing post-activation series never violates, and one rise always does", () => {
    // NON-VACUITY, COUNTED ACROSS THE WHOLE RUN. `fc.assert` is satisfied by a
    // property whose quantifier is empty, and a predicate hardwired to `false`
    // would pass the clean half of every run. Both counters are asserted after
    // the property, so the run must have exercised both polarities for this
    // block to mean anything. `numRuns` is a budget, not evidence.
    let cleanSeen = 0;
    let risenSeen = 0;

    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 0n, max: 10_000n * ZATOSHI_PER_ZEC }), {
          minLength: 2,
          maxLength: 30,
        }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.bigInt({ min: 1n, max: 10_000n * ZATOSHI_PER_ZEC }),
        fc.integer({ min: 0, max: 5_000 }),
        (drops, rawIndex, rise, startOffset) => {
          let balance = zec("3660000");
          const clean: PoolBalanceSample[] = drops.map((d, i) => {
            balance -= d;
            return {
              height: H + startOffset + i,
              timeMs: T0 + i * MS_PER_HOUR,
              balanceZat: balance,
            };
          });
          // The generator's own invariant, checked rather than assumed: 30 drops
          // of at most 10,000 ZEC cannot take 3.66M ZEC negative.
          if (clean[clean.length - 1]!.balanceZat < 0n) return false;
          if (violatesExitOnly(clean)) return false;
          cleanSeen += 1;

          // One rise, at a position the generator chooses, built as
          // `previous + rise` so the increase is strict whatever the drops were.
          const at = 1 + (rawIndex % (clean.length - 1));
          const risen = clean.map((s, i) =>
            i === at ? { ...s, balanceZat: clean[at - 1]!.balanceZat + rise } : s,
          );
          if (!violatesExitOnly(risen)) return false;
          risenSeen += 1;

          // The same rise before activation is legal, so the predicate must be
          // reading the height and not merely the shape.
          const shifted = risen.map((s) => ({ ...s, height: s.height - startOffset - 100_000 }));
          if (violatesExitOnly(shifted)) return false;
          return true;
        },
      ),
      { numRuns: 300 },
    );

    expect(cleanSeen, "the property never saw a clean series, so it proved nothing").toBeGreaterThan(0);
    expect(risenSeen, "the property never saw a rising series, so the law was never tested").toBeGreaterThan(0);
  });

  it("EXIT-ONLY PASS STATE: an equal balance across two blocks is not a rise, and the input is not mutated", () => {
    const flat: PoolBalanceSample[] = [
      { height: H, timeMs: T0, balanceZat: zec("708841") },
      { height: H + 1, timeMs: T0 + MS_PER_HOUR, balanceZat: zec("708841") },
    ];
    expect(violatesExitOnly(flat)).toBe(false);

    // Two readings of ONE height are not an interval: no block can be blamed for
    // the difference between them, so the predicate skips the pair.
    const sameHeight: PoolBalanceSample[] = [
      { height: H, timeMs: T0, balanceZat: zec("708841") },
      { height: H, timeMs: T0 + 1, balanceZat: zec("708900") },
    ];
    expect(violatesExitOnly(sameHeight)).toBe(false);

    const unsorted: PoolBalanceSample[] = [
      { height: H + 2, timeMs: T0 + 2 * MS_PER_HOUR, balanceZat: zec("708845") },
      { height: H, timeMs: T0, balanceZat: zec("708841") },
      { height: H + 1, timeMs: T0 + MS_PER_HOUR, balanceZat: zec("708840") },
    ];
    const before = unsorted.map((s) => ({ ...s }));
    // Sorted internally, so an out-of-order series gives the same answer...
    expect(violatesExitOnly(unsorted)).toBe(true);
    // ...without the caller's array being reordered.
    expect(unsorted).toEqual(before);
  });
});
