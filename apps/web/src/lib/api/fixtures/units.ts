/**
 * Fixture units: how a decimal ZEC figure written by a human becomes a zatoshi.
 *
 * Every amount in the fixture corpus is written the way the research and the
 * mockup write it - "50000.5541" - and converted here, once, by string
 * arithmetic. Nothing in this corpus ever passes through a float: `50000.5541 *
 * 1e8` is 5000055409999.999 in IEEE 754, which would put the round-trip case
 * off by a zatoshi and quietly falsify the delta the whole /tx page is about.
 */

const ZAT_PER_ZEC = 100_000_000n;

/**
 * A decimal ZEC string to zatoshi, exactly. Accepts a leading minus and up to
 * eight decimal places, and refuses anything else rather than truncating it -
 * a fixture with a ninth decimal place is a fixture nobody checked.
 */
export function zec(amount: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(amount);
  if (m === null) throw new Error(`zec: not a ZEC amount with at most 8 decimals: "${amount}"`);
  const [, sign, whole, frac = ""] = m;
  const zat = BigInt(whole as string) * ZAT_PER_ZEC + BigInt(frac.padEnd(8, "0"));
  return sign === "-" ? -zat : zat;
}

/** Sum a list of ZEC strings, exactly. Used to derive aggregates rather than restate them. */
export function sumZec(amounts: readonly string[]): bigint {
  return amounts.reduce<bigint>((a, s) => a + zec(s), 0n);
}

/**
 * A UTC instant to a rendered date stamp.
 *
 * `text` is what the reader sees and is built here once, so no component
 * formats a sort key by accident (LEDGER-02 Q3, LEDGER-03 fold 2). `sortMs` is
 * the same instant as a number and is never displayed.
 */
export interface StampInput {
  readonly y: number;
  readonly mo: number;
  readonly d: number;
  readonly h?: number;
  readonly mi?: number;
  readonly s?: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad = (n: number): string => n.toString().padStart(2, "0");

/** A second-precise stamp: "2026-01-02 18:53:18". */
export function at(i: Required<StampInput>): { text: string; precision: "second"; sortMs: number } {
  return {
    text: `${i.y}-${pad(i.mo)}-${pad(i.d)} ${pad(i.h)}:${pad(i.mi)}:${pad(i.s)}`,
    precision: "second",
    sortMs: Date.UTC(i.y, i.mo - 1, i.d, i.h, i.mi, i.s),
  };
}

/** A minute-precise stamp: "2 Jan 2026 18:53". */
export function atMinute(i: StampInput & { h: number; mi: number }): { text: string; precision: "minute"; sortMs: number } {
  return {
    text: `${i.d} ${MONTHS[i.mo - 1] as string} ${i.y} ${pad(i.h)}:${pad(i.mi)}`,
    precision: "minute",
    sortMs: Date.UTC(i.y, i.mo - 1, i.d, i.h, i.mi, 0),
  };
}

/** A day-precise stamp: "24 Dec 2025". A record known only to the day never prints a time. */
export function onDay(i: StampInput): { text: string; precision: "day"; sortMs: number } {
  return {
    text: `${i.d} ${MONTHS[i.mo - 1] as string} ${i.y}`,
    precision: "day",
    sortMs: Date.UTC(i.y, i.mo - 1, i.d),
  };
}

/** A month-precise stamp: "Nov 2025". No day, because there is no day to print. */
export function inMonth(y: number, mo: number): { text: string; precision: "month"; sortMs: number } {
  return { text: `${MONTHS[mo - 1] as string} ${y}`, precision: "month", sortMs: Date.UTC(y, mo - 1, 1) };
}

/**
 * Parse the ISO `time` a `packages/content` case step carries into a stamp.
 *
 * The corpus writes most steps as a full `...T18:53:18Z` instant and one - the
 * 1 ZEC test deposit - as a bare `2025-12-24`. That is not a defect to paper
 * over: the research knows the day and not the minute, and the stamp says so,
 * so the rendered row shows a day where a day is all there is.
 */
export function stampFromIso(iso: string): { text: string; precision: "second" | "day"; sortMs: number } {
  const full = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(iso);
  if (full !== null) {
    const [, y, mo, d, h, mi, s] = full as unknown as string[];
    return at({ y: +(y as string), mo: +(mo as string), d: +(d as string), h: +(h as string), mi: +(mi as string), s: +(s as string) });
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (day !== null) {
    const [, y, mo, d] = day as unknown as string[];
    return onDay({ y: +(y as string), mo: +(mo as string), d: +(d as string) });
  }
  throw new Error(`stampFromIso: unrecognised time "${iso}"`);
}
