/**
 * ZEC arithmetic for /flows, done in zatoshi.
 *
 * Every figure on this page is either a decimal ZEC string straight out of
 * `packages/content` (`zecAmountSchema` hands out strings precisely so nothing
 * rounds in transit) or a sum of several of them. CLAUDE.md forbids rounding a
 * zatoshi through a float, so the sums here parse the decimal string into a
 * bigint zatoshi count, add in bigint, and format back. No `Number` touches a
 * value; the only place a `Number` appears is a percentage, which is a ratio of
 * two bigints and not a quantity of money.
 *
 * This is also why the ledger and the totals do not reproduce the mockup's
 * digits exactly. The mockup prints 50,000.960 / 50,000.554 / 24,000.978 -
 * variously padded, truncated and rounded to three places. The seed states
 * 50000.96, 50000.5541 and 24000.9781, and those are what render.
 */

const ZAT = 100_000_000n;

/** Decimal ZEC string to zatoshi, exactly. Fractions longer than 8 places do not occur. */
export function toZatoshi(zec: string): bigint {
  const dot = zec.indexOf(".");
  const whole = dot === -1 ? zec : zec.slice(0, dot);
  const frac = dot === -1 ? "" : zec.slice(dot + 1);
  return BigInt(whole) * ZAT + BigInt(`${frac}00000000`.slice(0, 8));
}

/** Thousands separators on the integer part; the fraction is left exactly as stated. */
export function groupZec(zec: string): string {
  const dot = zec.indexOf(".");
  const whole = dot === -1 ? zec : zec.slice(0, dot);
  const frac = dot === -1 ? "" : zec.slice(dot + 1);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === "" ? grouped : `${grouped}.${frac}`;
}

/**
 * Zatoshi back to a printable ZEC string. Trailing zeros are trimmed to two
 * places and no further: "78,750.00" rather than "78,750", because a bare
 * integer reads as an approximation on a page whose whole argument is that the
 * figures are exact.
 */
export function formatZatoshi(zat: bigint): string {
  const negative = zat < 0n;
  const abs = negative ? -zat : zat;
  const whole = (abs / ZAT).toString();
  let frac = (abs % ZAT).toString().padStart(8, "0");
  while (frac.length > 2 && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${negative ? "−" : ""}${groupZec(`${whole}.${frac}`)}`;
}

/** Sum a run of decimal ZEC strings in zatoshi. */
export function sumZec(amounts: readonly string[]): bigint {
  return amounts.reduce<bigint>((total, a) => total + toZatoshi(a), 0n);
}

/**
 * A percentage of one zatoshi count by another, rounded half-up at `dp` places.
 * The division happens after both sides have been scaled, so the result is the
 * same on every platform and no float intermediate exists.
 */
export function percent(part: bigint, whole: bigint, dp = 1): string {
  if (whole === 0n) return "0";
  const scale = 10n ** BigInt(dp);
  const scaled = (part * 100n * scale + whole / 2n) / whole;
  const digits = scaled.toString().padStart(dp + 1, "0");
  return dp === 0 ? digits : `${digits.slice(0, -dp)}.${digits.slice(-dp)}`;
}

/** Whole minutes between two ISO instants. Used for the 52-minute round-trip gap. */
export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
}

/**
 * A UTC instant as the chain records it: "2026-01-02 15:45:14". The seed stores
 * ISO with a Z; this drops the separator and the zone marker and nothing else,
 * so no date is ever reformatted into a precision the corpus does not have.
 */
export function utc(iso: string): string {
  return iso.replace("T", " ").replace("Z", "");
}

/** The first eight characters of a txid, which is how the research prints them. */
export function shortTxid(txid: string): string {
  return `${txid.slice(0, 8)}…`;
}

/** An address shortened for a dense cell. The full string is always one jump away. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…`;
}
