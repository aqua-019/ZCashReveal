import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asHex } from "@zcashreveal/types";
import { ValuePool } from "../value-pool.js";
import { NegativeBalanceError } from "../errors.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

describe("ValuePool (happy path)", () => {
  it("starts at balance 0n", () => {
    const v = new ValuePool<"sapling">("sapling");
    expect(v.balance()).toBe(0n);
  });

  it("deposits (negative delta) increase balance", () => {
    const v = new ValuePool<"sapling">("sapling");
    v.apply({ pool: "sapling", txid: h(1), height: 1, deltaZat: -100n });
    expect(v.balance()).toBe(100n);
  });

  it("withdrawals (positive delta) decrease balance", () => {
    const v = new ValuePool<"sapling">("sapling");
    v.apply({ pool: "sapling", txid: h(1), height: 1, deltaZat: -500n });
    v.apply({ pool: "sapling", txid: h(2), height: 2, deltaZat: 200n });
    expect(v.balance()).toBe(300n);
  });

  it("throws NegativeBalanceError if balance would go below zero", () => {
    const v = new ValuePool<"sapling">("sapling");
    v.apply({ pool: "sapling", txid: h(1), height: 1, deltaZat: -100n });
    expect(() =>
      v.apply({ pool: "sapling", txid: h(2), height: 2, deltaZat: 200n }),
    ).toThrow(NegativeBalanceError);
  });

  it("failed apply does not mutate state", () => {
    const v = new ValuePool<"sapling">("sapling");
    v.apply({ pool: "sapling", txid: h(1), height: 1, deltaZat: -100n });
    try {
      v.apply({ pool: "sapling", txid: h(2), height: 2, deltaZat: 200n });
    } catch {
      // expected
    }
    expect(v.balance()).toBe(100n);
    expect(v.deltasFor(h(2))).toEqual([]);
  });

  it("deltasFor returns deltas in insertion order", () => {
    const v = new ValuePool<"orchard">("orchard");
    v.apply({ pool: "orchard", txid: h(7), height: 1, deltaZat: -100n });
    v.apply({ pool: "orchard", txid: h(7), height: 1, deltaZat: -200n });
    const deltas = v.deltasFor(h(7));
    expect(deltas).toHaveLength(2);
    expect(deltas[0]?.deltaZat).toBe(-100n);
    expect(deltas[1]?.deltaZat).toBe(-200n);
  });

  it("deltasFor returns empty for unknown txid", () => {
    const v = new ValuePool<"sapling">("sapling");
    expect(v.deltasFor(h(0))).toEqual([]);
  });

  it("snapshot reports pool and balance", () => {
    const v = new ValuePool<"sapling">("sapling");
    v.apply({ pool: "sapling", txid: h(1), height: 1, deltaZat: -150n });
    expect(v.snapshot()).toEqual({ pool: "sapling", balanceZat: 150n });
  });
});

describe("ValuePool (properties)", () => {
  it("balance stays non-negative across any deposit-only sequence", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 2n ** 40n }), {
          minLength: 0,
          maxLength: 200,
        }),
        (deposits) => {
          const v = new ValuePool<"sapling">("sapling");
          for (let i = 0; i < deposits.length; i++) {
            const d = deposits[i];
            if (d === undefined) return false;
            v.apply({ pool: "sapling", txid: h(i), height: i, deltaZat: -d });
          }
          return v.balance() >= 0n;
        },
      ),
    );
  });

  it("deposit then equal withdrawal nets to zero balance", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 2n ** 30n }), {
          minLength: 1,
          maxLength: 100,
        }),
        (amounts) => {
          const v = new ValuePool<"sapling">("sapling");
          for (let i = 0; i < amounts.length; i++) {
            const a = amounts[i];
            if (a === undefined) return false;
            v.apply({ pool: "sapling", txid: h(i), height: i, deltaZat: -a });
          }
          for (let i = 0; i < amounts.length; i++) {
            const a = amounts[i];
            if (a === undefined) return false;
            v.apply({
              pool: "sapling",
              txid: h(i + 10_000),
              height: i,
              deltaZat: a,
            });
          }
          return v.balance() === 0n;
        },
      ),
    );
  });

  it("apply that would go negative throws AND leaves state untouched", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 2n ** 30n }),
        fc.bigInt({ min: 1n, max: 2n ** 30n }),
        (deposit, overdraw) => {
          const v = new ValuePool<"sapling">("sapling");
          v.apply({ pool: "sapling", txid: h(0), height: 0, deltaZat: -deposit });
          const before = v.balance();
          const tooMuch = deposit + overdraw;
          try {
            v.apply({ pool: "sapling", txid: h(1), height: 1, deltaZat: tooMuch });
            return false;
          } catch (e) {
            if (!(e instanceof NegativeBalanceError)) return false;
            return v.balance() === before && v.deltasFor(h(1)).length === 0;
          }
        },
      ),
    );
  });
});

describe("ValuePool opened at a balance (HANDOFF-12)", () => {
  // Sapling's chainValueZat at 3,444,836, from the committed capture.
  const OPENING = 53_978_605_190_185n;

  it("opens at the node's figure and moves from there", () => {
    const v = new ValuePool<"sapling">("sapling", "mainnet", OPENING);
    expect(v.balance()).toBe(OPENING);
    // 3,444,837's Sapling delta: +875,651,408 left the pool.
    v.apply({ pool: "sapling", txid: h(1), height: 3_444_837, deltaZat: 875_651_408n });
    expect(v.balance()).toBe(OPENING - 875_651_408n);
  });

  it("FAIL STATE, BY DATA: opened at zero, the first withdrawal is refused - the pool was not empty, the counter was", () => {
    const v = new ValuePool<"sapling">("sapling");
    expect(() =>
      v.apply({ pool: "sapling", txid: h(1), height: 3_444_837, deltaZat: 875_651_408n }),
    ).toThrow(NegativeBalanceError);
  });

  it("refuses a negative opening balance, because ZIP 209 holds at every height including the first", () => {
    expect(() => new ValuePool<"sapling">("sapling", "mainnet", -1n)).toThrow(NegativeBalanceError);
  });
});
