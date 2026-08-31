import { describe, expect, it } from "vitest";
import { asHex, type BoundaryDelta, type Pool } from "@zcashreveal/types";

import { NU6_3_ACTIVATION_MAINNET, NU6_3_ACTIVATION_TESTNET } from "@zcashreveal/instruments";
import { ExitOnlyViolation, NegativeBalanceError, ZCashRevealStateError } from "../errors.js";
import { ValuePool } from "../value-pool.js";

/**
 * ASSERTION A5 — ZIP 2006 makes Orchard exit-only from NU6.3.
 *
 * THE SIGN IS THE THING MOST LIKELY TO BE WRONG, AND IT WAS WRONG ONCE ALREADY
 * IN HANDOFF-05. Under the convention this project shares with Zcash's own
 * `valueBalance`, a POSITIVE delta is value LEAVING the pool and a NEGATIVE
 * delta is value ENTERING it. Exit-only forbids entry, so the rejected delta is
 * the negative one - which reads backwards to anyone who thinks of "exit" as
 * subtraction. A guard with the comparison inverted would reject every
 * withdrawal from Orchard after NU6.3 and permit every deposit, and both
 * halves would be silent: the permitted deposits look like ordinary state and
 * the rejected withdrawals look like a decoder bug somewhere else.
 *
 * So the passing case alone proves nothing here. Every block below pairs the
 * throw with the acceptance that an inverted, over-broad or pool-blind guard
 * would also have thrown on.
 *
 * The throw is a statement about OUR decoder and never about the chain: a block
 * that reached consensus satisfies ZIP 2006 by construction, so a violation
 * means our replay is wrong. That is why it is an exception rather than a
 * `Finding` on a report.
 */

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/** A delta for the pool under test. Named so each case reads as its own sentence. */
function delta<P extends Pool>(pool: P, height: number, deltaZat: bigint, n = 1): BoundaryDelta<P> {
  return { pool, txid: h(n), height, deltaZat };
}

/** One block past NU6.3 on mainnet, the height every "after" case uses. */
const AFTER = 3_428_200;
/** Forty-three blocks before it, the height every "before" case uses. */
const BEFORE = 3_428_100;

describe("A5 — value may not enter Orchard at or after NU6.3", () => {
  it("PASS STATE: a negative Orchard delta after the boundary throws ExitOnlyViolation", () => {
    const v = new ValuePool<"orchard">("orchard");
    expect(() => v.apply(delta("orchard", AFTER, -1n))).toThrow(ExitOnlyViolation);
  });

  it("FAIL STATE: the same delta before the boundary is accepted", () => {
    // The identical delta, differing only in height. Anything that rejected
    // this too would be rejecting Orchard deposits outright rather than
    // enforcing a rule that starts at a height.
    const v = new ValuePool<"orchard">("orchard");
    v.apply(delta("orchard", BEFORE, -1n));
    expect(v.balance()).toBe(1n);
  });

  it("the boundary block itself throws: the protocol says 'from height N onward'", () => {
    // Inclusive, exactly as `poolsActiveAt` is. An exclusive comparison would
    // let one block's worth of Orchard deposits through and would be invisible
    // in any test that only probed AFTER.
    const v = new ValuePool<"orchard">("orchard");
    expect(() => v.apply(delta("orchard", NU6_3_ACTIVATION_MAINNET, -1n))).toThrow(
      ExitOnlyViolation,
    );
    const w = new ValuePool<"orchard">("orchard");
    w.apply(delta("orchard", NU6_3_ACTIVATION_MAINNET - 1, -1n));
    expect(w.balance()).toBe(1n);
  });
});

describe("A5 — the guard is not simply a wall after NU6.3", () => {
  it("a POSITIVE Orchard delta after the boundary is accepted: exits are the point", () => {
    // The case that separates "exit-only" from "sealed". Around 3.6M ZEC
    // remained withdrawable from Orchard at activation and migration is
    // voluntary with no deadline, so a guard that rejected this would freeze
    // the balance this project exists to watch drain.
    const v = new ValuePool<"orchard">("orchard");
    v.apply(delta("orchard", BEFORE, -1_000n, 1));
    v.apply(delta("orchard", AFTER, 400n, 2));
    expect(v.balance()).toBe(600n);
  });

  it("a zero Orchard delta after the boundary is accepted: nothing entered", () => {
    // `deltaZat < 0n` and not `<= 0n`. A zero delta moves no value in either
    // direction and cannot violate a rule about entry.
    const v = new ValuePool<"orchard">("orchard");
    v.apply(delta("orchard", AFTER, 0n));
    expect(v.balance()).toBe(0n);
  });

  it("ZIP 209 still applies after NU6.3: a positive delta cannot overdraw", () => {
    // The exit-only check runs first, so this proves it did not swallow the
    // arithmetic check on its way past.
    const v = new ValuePool<"orchard">("orchard");
    v.apply(delta("orchard", BEFORE, -100n, 1));
    expect(() => v.apply(delta("orchard", AFTER, 101n, 2))).toThrow(NegativeBalanceError);
    expect(v.balance()).toBe(100n);
  });
});

describe("A5 — the guard is Orchard-only", () => {
  it("negative deltas on Sprout, Sapling and Ironwood after NU6.3 are accepted", () => {
    // ZIP 2006 names Orchard and only Orchard. A guard keyed on the height
    // alone would stop Ironwood receiving the very migration NU6.3 exists to
    // produce, and would stop Sapling shielding for good.
    for (const pool of ["sprout", "sapling", "ironwood"] as const) {
      const v = new ValuePool(pool);
      v.apply(delta(pool, AFTER, -500n));
      expect(v.balance(), `${pool} rejected a deposit after NU6.3`).toBe(500n);
    }
  });

  it("Ironwood in particular accepts the value Orchard is refusing", () => {
    // The two halves of one migration, at one height, in the two pools it
    // crosses. If both threw, the migration would be unreplayable; if neither
    // did, ZIP 2006 would be unenforced.
    const orchard = new ValuePool<"orchard">("orchard");
    const ironwood = new ValuePool<"ironwood">("ironwood");
    orchard.apply(delta("orchard", BEFORE, -700n, 1));
    orchard.apply(delta("orchard", AFTER, 700n, 2));
    ironwood.apply(delta("ironwood", AFTER, -700n, 2));
    expect(orchard.balance()).toBe(0n);
    expect(ironwood.balance()).toBe(700n);
    expect(() => ironwood.apply(delta("ironwood", AFTER, -1n, 3))).not.toThrow();
  });
});

describe("A5 — the boundary is per network", () => {
  it("on testnet a negative Orchard delta at mainnet's height is accepted", () => {
    // Testnet does not reach NU6.3 until 4,134,000, so at 3,428,200 the rule
    // has not started there. A guard that hardcoded the mainnet height would
    // reject this and make a testnet replay of that range impossible.
    const v = new ValuePool<"orchard">("orchard", "testnet");
    v.apply(delta("orchard", AFTER, -1n));
    expect(v.balance()).toBe(1n);
  });

  it("and it throws at testnet's own height, one block before as well as on it", () => {
    const on = new ValuePool<"orchard">("orchard", "testnet");
    expect(() => on.apply(delta("orchard", NU6_3_ACTIVATION_TESTNET, -1n))).toThrow(
      ExitOnlyViolation,
    );
    const before = new ValuePool<"orchard">("orchard", "testnet");
    before.apply(delta("orchard", NU6_3_ACTIVATION_TESTNET - 1, -1n));
    expect(before.balance()).toBe(1n);
  });

  it("mainnet is the default, so an unqualified Orchard pool enforces the earlier height", () => {
    const v = new ValuePool<"orchard">("orchard");
    expect(v.network).toBe("mainnet");
    expect(() => v.apply(delta("orchard", AFTER, -1n))).toThrow(ExitOnlyViolation);
  });
});

describe("A5 — a refused delta leaves nothing behind", () => {
  it("balance and the per-tx delta log are exactly what they were before the throw", () => {
    // The invariant is checked before any mutation. A guard that threw after
    // updating the balance would leave a pool holding value the chain says
    // never entered it, and the next snapshot would publish that number.
    const v = new ValuePool<"orchard">("orchard");
    v.apply(delta("orchard", BEFORE, -1_000n, 1));
    const balanceBefore = v.balance();

    expect(() => v.apply(delta("orchard", AFTER, -250n, 2))).toThrow(ExitOnlyViolation);

    expect(v.balance()).toBe(balanceBefore);
    expect(v.balance()).toBe(1_000n);
    expect(v.deltasFor(h(2))).toEqual([]);
    expect(v.deltasFor(h(1))).toHaveLength(1);
    expect(v.snapshot()).toEqual({ pool: "orchard", balanceZat: 1_000n });
  });

  it("and the pool still works afterwards: the throw is not a poisoned state", () => {
    const v = new ValuePool<"orchard">("orchard");
    v.apply(delta("orchard", BEFORE, -1_000n, 1));
    expect(() => v.apply(delta("orchard", AFTER, -250n, 2))).toThrow(ExitOnlyViolation);
    v.apply(delta("orchard", AFTER, 400n, 3));
    expect(v.balance()).toBe(600n);
  });
});

describe("A5 — the error is catchable as the family, and says which rule broke", () => {
  it("ExitOnlyViolation is a ZCashRevealStateError, so a family catch still catches it", () => {
    // Callers written before this subclass existed catch
    // `ZCashRevealStateError`. If the new error escaped that catch it would
    // reach the process boundary and take down a replay that was handling
    // state errors correctly.
    const v = new ValuePool<"orchard">("orchard");
    let caught: unknown;
    try {
      v.apply(delta("orchard", AFTER, -1n));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExitOnlyViolation);
    expect(caught).toBeInstanceOf(ZCashRevealStateError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("ExitOnlyViolation");
  });

  it("it is NOT a NegativeBalanceError, because they are different diagnoses", () => {
    // The exit-only check runs first precisely so a delta that would break both
    // is reported as the consensus rule it broke rather than as arithmetic. A
    // caller distinguishing the two by class must be able to.
    const v = new ValuePool<"orchard">("orchard");
    let caught: unknown;
    try {
      v.apply(delta("orchard", AFTER, -1n));
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(NegativeBalanceError);
  });

  it("the message carries the height, the delta, the txid and the network", () => {
    // A replay that trips this has to be debuggable from the log line alone;
    // the offending transaction is the first thing anyone will want.
    const v = new ValuePool<"orchard">("orchard", "testnet");
    expect(() => v.apply(delta("orchard", NU6_3_ACTIVATION_TESTNET + 5, -7n, 42))).toThrow(
      /testnet/,
    );
    expect(() => v.apply(delta("orchard", NU6_3_ACTIVATION_TESTNET + 5, -7n, 42))).toThrow(
      new RegExp(`${NU6_3_ACTIVATION_TESTNET}`),
    );
    expect(() => v.apply(delta("orchard", NU6_3_ACTIVATION_TESTNET + 5, -7n, 42))).toThrow(
      new RegExp(h(42)),
    );
  });
});
