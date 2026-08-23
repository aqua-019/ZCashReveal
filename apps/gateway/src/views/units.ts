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
 * A stamp for something whose time the node did not give.
 *
 * A mempool transaction has no block time, and an address's opening balance
 * point is not an event. Rather than inventing an instant, this says what it
 * knows in words and sorts by the height it was derived from - which is what
 * `precision: "day"` with no day in the text would be lying about, so the
 * precision is the coarsest available and the text carries the height instead.
 */
export function stampAtHeight(height: number): Stamp {
  return { text: `block ${height.toLocaleString("en-US")}`, precision: "day", sortMs: height };
}

/**
 * Zatoshi as a decimal ZEC string, exactly, by integer arithmetic.
 *
 * Never `Number(zat) / 1e8`. 7,818,340,930,000 zatoshi divided as a double is
 * 78183.40929999999, and a page that printed that would be wrong about the
 * lockbox by a hundredth of a ZEC while looking precise to eight places.
 */
export function zecString(zat: bigint, decimals = 4): string {
  const negative = zat < 0n;
  const abs = negative ? -zat : zat;
  const whole = abs / ZAT_PER_ZEC;
  const frac = (abs % ZAT_PER_ZEC).toString().padStart(8, "0").slice(0, decimals);
  const body = decimals === 0 ? whole.toLocaleString("en-US") : `${whole.toLocaleString("en-US")}.${frac}`;
  return negative ? `-${body}` : body;
}

/** "78,183.4093 ZEC". The unit is part of the string because every caller wants it. */
export function zecText(zat: bigint, decimals = 4): string {
  return `${zecString(zat, decimals)} ZEC`;
}

/** A count with thousands separators. Counts are `number` per CLAUDE.md. */
export function countText(n: number): string {
  return n.toLocaleString("en-US");
}
