import { describe, expect, it } from "vitest";

import {
  NU5_ACTIVATION_MAINNET,
  NU5_ACTIVATION_TESTNET,
  NU6_3_ACTIVATION_MAINNET,
  NU6_3_ACTIVATION_TESTNET,
  SAPLING_ACTIVATION_MAINNET,
  SAPLING_ACTIVATION_TESTNET,
  SPROUT_ACTIVATION_MAINNET,
  isPoolActiveAt,
  poolsActiveAt,
  type Network,
  type PoolName,
} from "../activation-heights.js";

/**
 * ASSERTION A4 — which pools exist at a height, and the one-block boundary.
 *
 * Every case here is written as a PAIR: the block before an activation and the
 * activation block itself. A single-sided assertion would pass against a
 * function that turned a pool on a block early, a block late, or from genesis,
 * and "off by one block at NU6.3" is not a rounding error - it is a claim that
 * Ironwood held value in a block where the chain says the pool did not exist.
 *
 * The constants are pinned to their literals as well as used, because a test
 * that reads `NU6_3_ACTIVATION_MAINNET` on both sides of an assertion agrees
 * with whatever the constant says and can never catch it being edited. The
 * literals are the contract; the constants are the implementation of it.
 */

describe("A4 — Ironwood turns on at NU6.3 and not one block before", () => {
  it("PASS STATE: block 3,428,143 has all four pools", () => {
    expect(poolsActiveAt(3_428_143)).toEqual(["sprout", "sapling", "orchard", "ironwood"]);
  });

  it("FAIL STATE: block 3,428,142 has three, and Ironwood is not among them", () => {
    const pools = poolsActiveAt(3_428_142);
    expect(pools).toEqual(["sprout", "sapling", "orchard"]);
    expect(pools).not.toContain("ironwood");
  });

  it("the mainnet constant is 3,428,143 and the testnet constant is 4,134,000", () => {
    expect(NU6_3_ACTIVATION_MAINNET).toBe(3_428_143);
    expect(NU6_3_ACTIVATION_TESTNET).toBe(4_134_000);
  });
});

describe("A4 — the three earlier boundaries, each as a pair", () => {
  it("genesis carries Sprout alone", () => {
    expect(poolsActiveAt(0)).toEqual(["sprout"]);
    expect(SPROUT_ACTIVATION_MAINNET).toBe(0);
  });

  it("Sapling arrives at 419,200 and is absent at 419,199", () => {
    expect(poolsActiveAt(419_199)).toEqual(["sprout"]);
    expect(poolsActiveAt(419_200)).toEqual(["sprout", "sapling"]);
    expect(SAPLING_ACTIVATION_MAINNET).toBe(419_200);
  });

  it("Orchard arrives at 1,687,104 and is absent at 1,687,103", () => {
    expect(poolsActiveAt(1_687_103)).toEqual(["sprout", "sapling"]);
    expect(poolsActiveAt(1_687_104)).toEqual(["sprout", "sapling", "orchard"]);
    expect(NU5_ACTIVATION_MAINNET).toBe(1_687_104);
  });
});

describe("A4 — testnet has its own boundary, nearly 706,000 blocks away", () => {
  it("Ironwood arrives at testnet 4,134,000 and is absent at 4,133,999", () => {
    expect(poolsActiveAt(4_133_999, "testnet")).toEqual(["sprout", "sapling", "orchard"]);
    expect(poolsActiveAt(4_134_000, "testnet")).toEqual([
      "sprout",
      "sapling",
      "orchard",
      "ironwood",
    ]);
  });

  it("the mainnet Ironwood height means nothing on testnet, and vice versa", () => {
    // The discriminating case for the network parameter. A `poolsActiveAt` that
    // ignored its second argument would pass every mainnet assertion above and
    // fail exactly here - at mainnet's NU6.3 height testnet is still three
    // pools, and at testnet's height mainnet has been four-pool for 705,857
    // blocks.
    expect(poolsActiveAt(NU6_3_ACTIVATION_MAINNET, "testnet")).not.toContain("ironwood");
    expect(poolsActiveAt(NU6_3_ACTIVATION_TESTNET, "mainnet")).toContain("ironwood");
    expect(NU6_3_ACTIVATION_TESTNET - NU6_3_ACTIVATION_MAINNET).toBe(705_857);
  });

  it("testnet's Sapling and Orchard heights differ from mainnet's too", () => {
    expect(SAPLING_ACTIVATION_TESTNET).toBe(280_000);
    expect(NU5_ACTIVATION_TESTNET).toBe(1_842_420);
    expect(poolsActiveAt(280_000, "testnet")).toEqual(["sprout", "sapling"]);
    expect(poolsActiveAt(279_999, "testnet")).toEqual(["sprout"]);
  });

  it("mainnet is the default network, so an unqualified call is a mainnet call", () => {
    expect(poolsActiveAt(4_133_999)).toEqual(poolsActiveAt(4_133_999, "mainnet"));
    expect(poolsActiveAt(4_133_999)).toContain("ironwood");
    expect(isPoolActiveAt("ironwood", 4_133_999)).toBe(true);
    expect(isPoolActiveAt("ironwood", 4_133_999, "testnet")).toBe(false);
  });
});

describe("A4 — exit-only is a direction, not a removal", () => {
  /**
   * ORCHARD MUST STILL BE REPORTED ACTIVE PAST NU6.3, and this is the assertion
   * with the largest number attached to it. ZIP 2006 stops value ENTERING
   * Orchard from 3,428,143; it does not close the pool. Around 3.6M ZEC
   * remained withdrawable at activation and roughly 700k ZEC of it is what the
   * migration this project measures moves. A `poolsActiveAt` that dropped
   * Orchard after NU6.3 would take that balance out of the supply
   * reconciliation and the site would publish a total that does not add up.
   *
   * The direction is enforced in `ValuePool`, which is a different question
   * from presence and is covered in `state/__tests__/exit-only.test.ts`.
   */
  it("Orchard is still present at the activation block and long after it", () => {
    for (const height of [3_428_143, 3_428_144, 3_500_000, 4_000_000, 10_000_000]) {
      expect(poolsActiveAt(height), `orchard missing at height ${height}`).toContain("orchard");
      expect(isPoolActiveAt("orchard", height)).toBe(true);
    }
  });

  it("and it is still present on testnet past testnet's NU6.3", () => {
    expect(poolsActiveAt(4_200_000, "testnet")).toEqual([
      "sprout",
      "sapling",
      "orchard",
      "ironwood",
    ]);
  });

  it("no pool ever disappears once it has appeared", () => {
    // Monotonicity across the whole range, stated once rather than per pool. A
    // pool that vanished at any sampled height - the NU6.2 window is the
    // obvious candidate, since the Orchard mitigation froze activity there -
    // shows up as a shrinking set.
    const heights = [0, 419_200, 1_687_104, 2_726_400, 3_146_400, 3_363_426, 3_364_600, 3_428_143];
    let previous: PoolName[] = [];
    for (const height of heights) {
      const pools = poolsActiveAt(height);
      for (const p of previous) {
        expect(pools, `${p} disappeared at height ${height}`).toContain(p);
      }
      previous = pools;
    }
  });
});

describe("A4 — the two functions are one fact, and the order is chronological", () => {
  const SAMPLE_HEIGHTS = [
    0, 1, 419_199, 419_200, 1_687_103, 1_687_104, 2_726_400, 3_363_426, 3_428_142, 3_428_143,
    4_133_999, 4_134_000, 9_999_999,
  ];
  const ALL_POOLS: readonly PoolName[] = ["sprout", "sapling", "orchard", "ironwood"];
  const NETWORKS: readonly Network[] = ["mainnet", "testnet"];

  it("isPoolActiveAt agrees with poolsActiveAt for every pool, height and network", () => {
    // Two entry points reading one table is how the two came to disagree in
    // other places in this repository. Cross-checking them is cheaper than
    // trusting that they share the lookup.
    for (const network of NETWORKS) {
      for (const height of SAMPLE_HEIGHTS) {
        const listed = poolsActiveAt(height, network);
        for (const pool of ALL_POOLS) {
          expect(
            isPoolActiveAt(pool, height, network),
            `${pool} at ${network}:${height}`,
          ).toBe(listed.includes(pool));
        }
      }
    }
  });

  it("the returned order is chronological, never the order of some internal record", () => {
    // The display layer draws pools in the order this function returns them, so
    // the order is part of the contract and not an implementation detail. A
    // prefix check is the right shape: the list is always the first N of the
    // chronological sequence, so any reordering or gap fails.
    for (const network of NETWORKS) {
      for (const height of SAMPLE_HEIGHTS) {
        const pools = poolsActiveAt(height, network);
        expect(pools, `${network}:${height}`).toEqual(ALL_POOLS.slice(0, pools.length));
      }
    }
  });

  it("FAIL STATE: the chronological order is not alphabetical, so the check discriminates", () => {
    // ["ironwood", "orchard", "sapling", "sprout"] is the alphabetical order and
    // shares no prefix with the chronological one. If the assertion above were
    // satisfied by any ordering, this would pass too.
    expect(poolsActiveAt(3_428_143)).not.toEqual([...ALL_POOLS].sort());
  });
});
