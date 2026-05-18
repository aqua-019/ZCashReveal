import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { entropyBitsUniform, effectiveSetSize } from "../entropy.js";

describe("entropyBitsUniform", () => {
  it("entropyBitsUniform(1n) === 0 (no uncertainty)", () => {
    expect(entropyBitsUniform(1n)).toBe(0);
  });

  it("entropyBitsUniform(2n) === 1", () => {
    expect(entropyBitsUniform(2n)).toBe(1);
  });

  it("entropyBitsUniform(1024n) === 10", () => {
    expect(entropyBitsUniform(1024n)).toBe(10);
  });

  it("entropyBitsUniform(0n) throws", () => {
    expect(() => entropyBitsUniform(0n)).toThrow(TypeError);
  });

  it("entropyBitsUniform(-1n) throws", () => {
    expect(() => entropyBitsUniform(-1n)).toThrow(TypeError);
  });
});

describe("effectiveSetSize", () => {
  it("effectiveSetSize(0) === 1n", () => {
    expect(effectiveSetSize(0)).toBe(1n);
  });

  it("effectiveSetSize(10) === 1024n", () => {
    expect(effectiveSetSize(10)).toBe(1024n);
  });

  it("effectiveSetSize(NaN) throws", () => {
    expect(() => effectiveSetSize(Number.NaN)).toThrow(RangeError);
  });

  it("effectiveSetSize(-1) throws", () => {
    expect(() => effectiveSetSize(-1)).toThrow(RangeError);
  });
});

describe("entropy / effectiveSetSize roundtrip", () => {
  it("(property) effectiveSetSize(entropyBitsUniform(N)) ≈ N for N in [1n, 2^40n]", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 2n ** 40n }), (N) => {
        const H = entropyBitsUniform(N);
        const back = effectiveSetSize(H);
        // IEEE 754 log2 + pow can be off by 1 ULP at non-power-of-2 inputs.
        // 1n tolerance accommodates that without weakening the property.
        const diff = back > N ? back - N : N - back;
        return diff <= 1n;
      }),
    );
  });

  it("roundtrip is exact for powers of 2", () => {
    for (let k = 0n; k <= 40n; k++) {
      const N = 1n << k;
      expect(effectiveSetSize(entropyBitsUniform(N))).toBe(N);
    }
  });
});
