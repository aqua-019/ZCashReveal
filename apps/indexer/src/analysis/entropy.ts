/**
 * Shannon entropy primitives for the analysis layer.
 *
 * For a uniform posterior over N outcomes the Shannon entropy is H = log2(N)
 * bits, and the effective anonymity set size is N_eff = 2^H. These two are
 * inverses for uniform inputs and serve as the foundation Module 5's filter
 * stack will compose against (the filtered posterior is no longer uniform,
 * but at v0.2 we model it as the largest uniform distribution compatible
 * with the surviving candidates — see RESEARCH.md "Effective anonymity set").
 *
 * Precision: bigint inputs cross into float64 here. For N within JS safe
 * integer range (< 2^53) the cast is exact. Beyond that, LSBs of the input
 * are lost — but the entropy value's precision is not load-bearing, because
 * the claim-level thresholds (10, 100, 1000) are decimal-orders apart and
 * float64's ~15-digit precision dominates.
 */

/**
 * Shannon entropy in bits for a uniform posterior over N outcomes: H = log2(N).
 *
 * @throws TypeError if N <= 0n. Zero or negative candidate counts have no
 * meaningful entropy interpretation and indicate a bug upstream.
 */
export function entropyBitsUniform(N: bigint): number {
  if (N <= 0n) {
    throw new TypeError(
      `entropyBitsUniform: N must be a positive bigint, got ${N}`,
    );
  }
  return Math.log2(Number(N));
}

/**
 * Effective anonymity set size N_eff = 2^entropyBits, rounded to nearest
 * bigint. Inverse of entropyBitsUniform for uniform inputs (modulo IEEE 754
 * rounding when entropyBits is non-integer).
 *
 * @throws RangeError if entropyBits is not a non-negative finite number.
 */
export function effectiveSetSize(entropyBits: number): bigint {
  if (!Number.isFinite(entropyBits) || entropyBits < 0) {
    throw new RangeError(
      `effectiveSetSize: entropyBits must be a non-negative finite number, got ${entropyBits}`,
    );
  }
  const value = Math.pow(2, entropyBits);
  return BigInt(Math.round(value));
}
