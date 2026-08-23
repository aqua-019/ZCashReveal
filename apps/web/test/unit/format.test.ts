/**
 * Formatters. The contract in CLAUDE.md is that zatoshi are carried as `bigint`
 * and never routed through a double on the way to the screen, so most of what
 * follows is a precision argument rather than a string-shape argument.
 *
 * Every expectation here was produced by running the shipped implementation, so
 * a failure means behaviour changed, not that the test guessed.
 */
import { describe, expect, it } from "vitest";

import {
  fmtBlockAge,
  fmtCount,
  fmtElapsed,
  fmtInt,
  fmtPct,
  shortHex,
  zatToZec,
  zatToZecGrouped,
} from "@/lib/format";

const ZAT_PER_ZEC = 100_000_000n;

describe("zatToZec", () => {
  it("formats the anchor values", () => {
    expect(zatToZec(0n)).toBe("0");
    expect(zatToZec(ZAT_PER_ZEC)).toBe("1");
    expect(zatToZec(150_000_000n)).toBe("1.5");
    expect(zatToZec(1n)).toBe("0.00000001");
  });

  it("trims trailing zeros from the fraction but keeps leading ones", () => {
    expect(zatToZec(10_000_000n)).toBe("0.1");
    expect(zatToZec(100n)).toBe("0.000001");
    expect(zatToZec(110_000_000n)).toBe("1.1");
  });

  it("carries the sign without disturbing the magnitude", () => {
    expect(zatToZec(-1n)).toBe("-0.00000001");
    expect(zatToZec(-ZAT_PER_ZEC)).toBe("-1");
    expect(zatToZec(-150_000_000n)).toBe("-1.5");
  });

  it("accepts a decimal string as well as a bigint", () => {
    expect(zatToZec("150000000")).toBe("1.5");
    expect(zatToZec("-1")).toBe("-0.00000001");
    expect(zatToZec("0")).toBe("0");
    expect(zatToZec("2100000000000000")).toBe(zatToZec(2_100_000_000_000_000n));
  });

  it("formats the whole 21M supply exactly", () => {
    expect(zatToZec(2_100_000_000_000_000n)).toBe("21000000");
    expect(zatToZec(2_099_999_999_999_999n)).toBe("20999999.99999999");
    expect(zatToZec(2_100_000_000_000_001n)).toBe("21000000.00000001");
  });

  it("does not route the amount through a double", () => {
    // The proof: a value whose zatoshi count exceeds 2**53, so Number() cannot
    // hold it and the naive `Number(zat) / 1e8` path produces a different string.
    const zat = 12_345_678_901_234_567_890n;
    expect(BigInt(Number(zat))).not.toBe(zat);
    const naive = (Number(zat) / 1e8).toString();
    expect(naive).toBe("123456789012.34567");
    expect(zatToZec(zat)).toBe("123456789012.3456789");
    expect(zatToZec(zat)).not.toBe(naive);
  });

  it("never loses a zatoshi across a round trip", () => {
    for (const zat of [0n, 1n, 7n, 99_999_999n, ZAT_PER_ZEC, 2_100_000_000_000_000n - 1n]) {
      const s = zatToZec(zat);
      const [whole = "0", frac = ""] = s.split(".");
      const back = BigInt(whole) * ZAT_PER_ZEC + BigInt(frac.padEnd(8, "0") || "0");
      expect(back).toBe(zat);
    }
  });
});

describe("zatToZecGrouped", () => {
  it("groups the whole part in thousands", () => {
    expect(zatToZecGrouped(2_100_000_000_000_000n)).toBe("21,000,000");
    expect(zatToZecGrouped(123_456_789_012_345n)).toBe("1,234,567.8901");
    expect(zatToZecGrouped(ZAT_PER_ZEC)).toBe("1");
  });

  it("truncates the fraction to maxFractionDigits rather than rounding", () => {
    expect(zatToZecGrouped(123_456_789n)).toBe("1.2345");
    expect(zatToZecGrouped(123_456_789n, 8)).toBe("1.23456789");
    expect(zatToZecGrouped(123_456_789n, 2)).toBe("1.23");
    // 1.99999999 truncated at 4 digits is 1.9999, not 2.
    expect(zatToZecGrouped(199_999_999n)).toBe("1.9999");
  });

  it("drops a fraction that rounds away entirely at the requested precision", () => {
    expect(zatToZecGrouped(1n)).toBe("0");
    expect(zatToZecGrouped(1n, 8)).toBe("0.00000001");
    expect(zatToZecGrouped(100_000_001n, 4)).toBe("1");
  });

  it("keeps the sign in front of the grouping", () => {
    expect(zatToZecGrouped(-123_456_789_012n)).toBe("-1,234.5678");
    expect(zatToZecGrouped(-2_100_000_000_000_000n)).toBe("-21,000,000");
    // Documented sharp edge: a negative amount smaller than the displayed
    // precision renders as "-0" rather than "0".
    expect(zatToZecGrouped(-1n)).toBe("-0");
  });

  it("accepts a string amount", () => {
    expect(zatToZecGrouped("123456789012345")).toBe("1,234,567.8901");
  });
});

describe("fmtInt", () => {
  it("groups at every thousand and leaves smaller numbers alone", () => {
    expect(fmtInt(0)).toBe("0");
    expect(fmtInt(999)).toBe("999");
    expect(fmtInt(1000)).toBe("1,000");
    expect(fmtInt(3_456_854)).toBe("3,456,854");
  });

  it("truncates toward zero and keeps the sign ungrouped", () => {
    expect(fmtInt(12.9)).toBe("12");
    expect(fmtInt(-12.9)).toBe("-12");
    expect(fmtInt(-1_234_567)).toBe("-1,234,567");
  });
});

describe("fmtCount", () => {
  it("prints plain integers below one thousand", () => {
    expect(fmtCount(0)).toBe("0");
    expect(fmtCount(842)).toBe("842");
    expect(fmtCount(999)).toBe("999");
  });

  it("switches to k at 1000 with one decimal", () => {
    expect(fmtCount(1000)).toBe("1.0k");
    expect(fmtCount(12_400)).toBe("12.4k");
    // Just under the next boundary the k form is still used, and it reads 1000.0k.
    expect(fmtCount(999_999)).toBe("1000.0k");
  });

  it("switches to M at 1000000 with two decimals", () => {
    expect(fmtCount(1_000_000)).toBe("1.00M");
    expect(fmtCount(3_190_000)).toBe("3.19M");
    expect(fmtCount(1_234_567_890)).toBe("1234.57M");
  });
});

describe("shortHex", () => {
  it("returns input shorter than the elision unchanged", () => {
    expect(shortHex("abc")).toBe("abc");
    expect(shortHex("")).toBe("");
    // lead + tail + 1 = 11 characters still fit without elision.
    expect(shortHex("12345678901")).toBe("12345678901");
  });

  it("elides the middle of a long hash", () => {
    const hash = "0000000000f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b";
    expect(shortHex(hash)).toBe("000000...2a3b");
  });

  it("honours explicit lead and tail widths", () => {
    expect(shortHex("123456789012", 4, 4)).toBe("1234...9012");
  });
});

describe("fmtElapsed", () => {
  const now = 1_700_000_000_000;

  it("covers each branch of the ladder", () => {
    expect(fmtElapsed(now, now)).toBe("now");
    expect(fmtElapsed(now - 999, now)).toBe("now");
    expect(fmtElapsed(now - 1_000, now)).toBe("1s");
    expect(fmtElapsed(now - 59_000, now)).toBe("59s");
    expect(fmtElapsed(now - 60_000, now)).toBe("1m");
    expect(fmtElapsed(now - 3_599_000, now)).toBe("59m");
    expect(fmtElapsed(now - 3_600_000, now)).toBe("1h");
    expect(fmtElapsed(now - 86_399_000, now)).toBe("23h");
    expect(fmtElapsed(now - 86_400_000, now)).toBe("1d");
    expect(fmtElapsed(now - 5 * 86_400_000, now)).toBe("5d");
  });

  it("clamps a future timestamp to now rather than printing a negative age", () => {
    expect(fmtElapsed(now + 50_000, now)).toBe("now");
  });

  it("takes the clock as an argument, so it is pure", () => {
    expect(fmtElapsed(now - 60_000, now)).toBe(fmtElapsed(0, 60_000));
  });
});

describe("fmtBlockAge", () => {
  it("says tip at zero and below", () => {
    expect(fmtBlockAge(0)).toBe("tip");
    expect(fmtBlockAge(-3)).toBe("tip");
  });

  it("agrees with itself about singular and plural", () => {
    expect(fmtBlockAge(1)).toBe("1 block behind");
    expect(fmtBlockAge(2)).toBe("2 blocks behind");
  });

  it("groups a large lag", () => {
    expect(fmtBlockAge(1234)).toBe("1,234 blocks behind");
  });
});

describe("fmtPct", () => {
  it("scales by 100 and fixes the decimals", () => {
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(1)).toBe("100.0%");
    expect(fmtPct(0.1234)).toBe("12.3%");
  });

  it("honours the digits argument", () => {
    expect(fmtPct(0.1234, 2)).toBe("12.34%");
    expect(fmtPct(0.1234, 0)).toBe("12%");
  });

  it("carries a negative sign", () => {
    expect(fmtPct(-0.05)).toBe("-5.0%");
  });
});
