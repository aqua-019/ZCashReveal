/**
 * Units and stamps for the projections.
 *
 * `apps/web/src/lib/api/fixtures/units.ts` does the same job for the fixture
 * corpus, and the two are deliberately separate rather than shared: that one
 * turns a HUMAN-WRITTEN decimal string into zatoshi, this one turns a NODE's
 * unix timestamp into a rendered stamp. Sharing them would mean the gateway
 * depended on `apps/web`, which it must not - the whole point of the DTOs is
 * that the two ends only agree on `packages/zec-types`.
 */
import type { Stamp } from "@zcashreveal/types";

const ZAT_PER_ZEC = 100_000_000n;

const pad = (n: number): string => n.toString().padStart(2, "0");

/**
 * A block's unix time as a second-precise stamp.
 *
 * A block time IS second-precise - it is a consensus field - so this never
 * emits a coarser precision, and `text` is what renders. `sortMs` exists only
 * to order rows and is never formatted for display (LEDGER-02 Q3).
 */
export function stampFromUnix(seconds: number): Stamp {
  const d = new Date(seconds * 1000);
  return {
    text: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
      d.getUTCMinutes(),
    )}:${pad(d.getUTCSeconds())}`,
    precision: "second",
    sortMs: seconds * 1000,
  };
}

/**
 * A stamp for something the node gave no time for.
 *
 * `sortMs` IS ZERO, NOT THE HEIGHT, and that is the whole point of this
 * function existing rather than being inlined. An earlier version put the
 * HEIGHT in `sortMs` - a milliseconds field - so one `balances` array held
 * 3,455,999 beside 1,750,000,000,000. Every sort in this gateway happens to be
 * height-first, so nothing broke here; a consumer that plots `sortMs` as an
 * x-axis, which the DTO entitles it to do, would have drawn the point in 1970.
 *
 * Zero is the honest value: it says "no time", it sorts to the start where a
 * timeless row belongs, and it is visibly not a timestamp rather than
 * plausibly the wrong one. The text says so in words as well.
 */
export function stampNoTime(height: number): Stamp {
  return { text: `block ${height.toLocaleString("en-US")}, time not reported`, precision: "day", sortMs: 0 };
}

/**
 * The stamp for a point that precedes a known event.
 *
 * An address's opening balance is not an event and has no time of its own, but
 * it is definitely BEFORE the first movement - so it borrows that movement's
 * instant, one millisecond earlier, and says in words what it is. That keeps
 * `sortMs` on one scale within an array and keeps the ordering true.
 */
export function stampBefore(first: Stamp): Stamp {
  return { text: `before ${first.text}`, precision: first.precision, sortMs: first.sortMs - 1 };
}

/**
 * Zatoshi as a decimal ZEC string, exactly, by integer arithmetic.
 *
 * Never `Number(zat) / 1e8`. 7,818,340,930,000 zatoshi divided as a double is
 * 78183.40929999999, and a page that printed that would be wrong about the
 * lockbox by a hundredth of a ZEC while looking precise to eight places.
 *
 * A NON-ZERO AMOUNT NEVER RENDERS AS ZERO. At the site's four-decimal
 * convention a single zatoshi would otherwise print as "0.0000", which hides a
 * movement rather than rounding one - so a value that is not zero but rounds to
 * all zeros at the requested precision is printed at full precision instead.
 * The alternative is a dust transaction rendering as no transaction at all.
 */
export function zecString(zat: bigint, decimals = 4): string {
  const negative = zat < 0n;
  const abs = negative ? -zat : zat;
  const digits = abs % ZAT_PER_ZEC === 0n ? decimals : effectiveDecimals(abs, decimals);
  const whole = abs / ZAT_PER_ZEC;
  const frac = (abs % ZAT_PER_ZEC).toString().padStart(8, "0").slice(0, digits);
  const body = digits === 0 ? whole.toLocaleString("en-US") : `${whole.toLocaleString("en-US")}.${frac}`;
  return negative ? `-${body}` : body;
}

/** The precision this value needs to avoid printing as zero when it is not. */
function effectiveDecimals(abs: bigint, requested: number): number {
  if (abs === 0n) return requested;
  const whole = abs / ZAT_PER_ZEC;
  if (whole > 0n) return requested;
  const frac = (abs % ZAT_PER_ZEC).toString().padStart(8, "0");
  if (frac.slice(0, requested).replace(/0/g, "") !== "") return requested;
  return 8;
}

/** "78,183.4093 ZEC". The unit is part of the string because every caller wants it. */
export function zecText(zat: bigint, decimals = 4): string {
  return `${zecString(zat, decimals)} ZEC`;
}

/** A count with thousands separators. Counts are `number` per CLAUDE.md. */
export function countText(n: number): string {
  return n.toLocaleString("en-US");
}
