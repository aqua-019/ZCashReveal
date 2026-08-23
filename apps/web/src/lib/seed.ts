/**
 * Determinism (DGIGA LAW-10). Every stochastic-looking surface on this site is
 * a pure function of the chain tip hash, so a given block renders identically
 * for every visitor, in every browser, forever. The platform's own
 * non-deterministic generator is banned repository-wide by the
 * `no-restricted-properties` rule in eslint.config.js; this module is the
 * sanctioned replacement, and it is the only source of randomness in apps/web.
 *
 * FNV-1a folds a seed string into a 32-bit integer; mulberry32 expands that
 * integer into a uniform stream. Both are ported from the reference
 * implementation in docs/2.0/mockups/zecreveal-2.0-mockups-v2.html.
 */

/** FNV-1a, 32-bit. Returns an unsigned integer. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. Returns a generator of uniform values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The one entry point ambience components use.
 *
 * `namespace` keeps independent surfaces on independent streams: the fog and
 * the grain both derive from the same tip hash but must not be correlated, so
 * each names its own channel (`seededRng(tip, "fog")`).
 */
export function seededRng(seed: string, namespace?: string): () => number {
  return mulberry32(fnv1a(namespace === undefined ? seed : `${seed}:${namespace}`));
}

/**
 * A short, stable display form of a seed.
 *
 * The leading zero run is stripped first. Every Zcash block hash begins with
 * one - that is what the proof of work buys - so eliding the raw string would
 * render "0000...c21e" for every block that has ever existed, which identifies
 * nothing. Dropping the zeros gives four characters of actual entropy and
 * matches the mockup, which shows "5f3a...c21e" for this tip.
 */
export function seedLabel(seed: string): string {
  const s = seed.replace(/^0+/, "") || seed;
  if (s.length <= 9) return s;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}
