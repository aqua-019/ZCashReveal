import { describe, expect, it } from "vitest";

import { conventionalFeeZat } from "../views/tx.js";
import { countText, stampBefore, stampFromUnix, stampNoTime, zecString, zecText } from "../views/units.js";
import { decodeAddress } from "../address.js";

/**
 * THE ARITHMETIC UNDER EVERY RENDERED FIGURE.
 *
 * This file exists because of a planted-defect probe that failed to fail.
 * Changing `ZAT_PER_ZEC` in `views/units.ts` from 100,000,000 to 10,000,000 - a
 * ten-fold error under every amount the Tracking pages print - left the whole
 * gateway suite green: four files, fifty-six tests, all passing. A suite that
 * cannot see a ten-fold error in the unit conversion is not covering the unit
 * conversion, and the fail-side transcript for assertion A1 was demonstrating
 * that rather than what it was written to demonstrate.
 *
 * Every expectation below is a value that would move if that constant did.
 */

describe("zecString - zatoshi to ZEC, by integer arithmetic", () => {
  it("renders the lockbox balance exactly, which a double cannot", () => {
    // 7,818,340,930,000 / 1e8 as a double is 78183.40929999999.
    expect(zecString(7_818_340_930_000n)).toBe("78,183.4093");
    expect(zecString(7_818_340_930_000n, 8)).toBe("78,183.40930000");
    expect(zecText(7_818_340_930_000n)).toBe("78,183.4093 ZEC");
  });

  it("renders a case step exactly", () => {
    // 29,999.99 ZEC. Through a float this is 2999998999999.9995.
    expect(zecString(2_999_999_000_000n)).toBe("29,999.9900");
  });

  it("renders one ZEC, and one zatoshi under it", () => {
    expect(zecString(100_000_000n)).toBe("1.0000");
    expect(zecString(99_999_999n, 8)).toBe("0.99999999");
  });

  it("NEVER renders a non-zero amount as zero", () => {
    // The site's convention is four decimals, at which a single zatoshi would
    // print as "0.0000" - hiding a movement rather than rounding one. A value
    // that would round to all zeros is printed at full precision instead.
    expect(zecString(1n)).toBe("0.00000001");
    expect(zecString(-1n)).toBe("-0.00000001");
    expect(zecString(9_999n)).toBe("0.00009999");
    // A value with something to show at four decimals still uses four.
    expect(zecString(10_000_000n)).toBe("0.1000");
  });

  it("renders zero as zero at the requested precision", () => {
    expect(zecString(0n)).toBe("0.0000");
    expect(zecString(0n, 8)).toBe("0.00000000");
    expect(zecString(0n, 0)).toBe("0");
  });

  it("carries the sign", () => {
    expect(zecString(-7_818_340_930_000n)).toBe("-78,183.4093");
    expect(zecText(-100_000_000n)).toBe("-1.0000 ZEC");
  });

  it("separates thousands", () => {
    expect(countText(3_456_227)).toBe("3,456,227");
  });
});

describe("ZIP 317's conventional fee", () => {
  it("prices a transaction at 5,000 zatoshi per logical action", () => {
    expect(conventionalFeeZat(3)).toBe(15_000n);
    expect(conventionalFeeZat(10)).toBe(50_000n);
  });

  it("applies the two-action grace, so nothing is priced below 10,000", () => {
    expect(conventionalFeeZat(0)).toBe(10_000n);
    expect(conventionalFeeZat(1)).toBe(10_000n);
    expect(conventionalFeeZat(2)).toBe(10_000n);
  });
});

describe("stamps", () => {
  it("renders a block time to the second, and sorts on the same scale", () => {
    const s = stampFromUnix(1_755_900_000);
    expect(s.text).toBe("2025-08-22 22:00:00");
    expect(s.precision).toBe("second");
    expect(s.sortMs).toBe(1_755_900_000_000);
  });

  it("puts ZERO in sortMs when there is no time, never the height", () => {
    // A height in a milliseconds field is the defect this guards: one array
    // held 3,455,999 beside 1,750,000,000,000, and a consumer plotting sortMs
    // would have drawn the point in 1970.
    const s = stampNoTime(3_455_999);
    expect(s.sortMs).toBe(0);
    expect(s.text).toContain("time not reported");
    expect(s.text).toContain("3,455,999");
  });

  it("places a preceding point one millisecond before the event it precedes", () => {
    const first = stampFromUnix(1_755_900_000);
    const before = stampBefore(first);
    expect(before.sortMs).toBe(first.sortMs - 1);
    expect(before.text).toBe("before 2025-08-22 22:00:00");
    expect(before.precision).toBe(first.precision);
  });
});

describe("address decoding", () => {
  it("decodes the four version prefixes to the right script and network", () => {
    expect(decodeAddress("t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo")).toMatchObject({ script: "p2sh", network: "mainnet" });
    expect(decodeAddress("t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ")).toMatchObject({ script: "p2pkh", network: "mainnet" });
    expect(decodeAddress("t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8")).toMatchObject({ script: "p2sh", network: "testnet" });
  });

  it("refuses an address whose checksum does not verify", () => {
    // One character changed from the lockbox address.
    expect(decodeAddress("t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYX")).toBeNull();
  });

  it("returns the CANONICAL address, trimmed, not the string it was given", () => {
    // A caller that keeps the raw input asks the node about " t3ev... ", caches
    // under it, and prints it back as the address it answered for.
    const decoded = decodeAddress("  t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo  ");
    expect(decoded?.address).toBe("t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo");
  });

  it("refuses a string longer than any address, before decoding it", () => {
    // base58 decoding is quadratic. Fastify's maxParamLength already caps a
    // path parameter at 100, so this is defence in depth against that default
    // changing - and against a caller that is not a route.
    expect(decodeAddress("1".repeat(200))).toBeNull();
    expect(decodeAddress("")).toBeNull();
    expect(decodeAddress("   ")).toBeNull();
  });

  it("refuses a mixed-case bech32 string rather than normalising it", () => {
    expect(decodeAddress("TeX1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq")).toBeNull();
  });
});
