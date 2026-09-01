/**
 * Display formatters. Harvested from legacy/dashboard/src/lib/formatters.ts and
 * widened for 2.0; nothing is imported from `legacy/`, which is frozen and
 * retired at the HANDOFF-11 cutover.
 *
 * Contract (CLAUDE.md): `bigint` carries zatoshi, `number` carries heights and
 * counts, hex is lowercase without an `0x` prefix. These functions never round
 * a zatoshi amount into a float.
 */

const ZAT_PER_ZEC = 100_000_000n;

/** Zatoshi to a plain ZEC string. Exact - no float arithmetic on the way. */
export function zatToZec(zat: bigint | string): string {
  const n = typeof zat === "string" ? BigInt(zat) : zat;
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const whole = abs / ZAT_PER_ZEC;
  const frac = abs % ZAT_PER_ZEC;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/** Zatoshi to a grouped ZEC string, for tabular display. */
export function zatToZecGrouped(zat: bigint | string, maxFractionDigits = 4): string {
  const plain = zatToZec(zat);
  const negative = plain.startsWith("-");
  const body = negative ? plain.slice(1) : plain;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? "" : body.slice(dot + 1, dot + 1 + maxFractionDigits).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/** Group a whole number with thousands separators, without locale surprises. */
export function fmtInt(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Elide the middle of a hash for display. Never used where the full value matters. */
export function shortHex(hex: string, lead = 6, tail = 4): string {
  if (hex.length <= lead + tail + 1) return hex;
  return `${hex.slice(0, lead)}...${hex.slice(-tail)}`;
}

/** Compact counts: 842 / 12.4k / 3.19M. */
export function fmtCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/**
 * Elapsed time as a coarse label. Takes `now` explicitly so callers stay pure
 * and so server and client renders cannot disagree about the clock.
 */
export function fmtElapsed(fromMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - fromMs);
  if (delta < 1000) return "now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

/**
 * The staleness reading the system bar and the footer ledger both print.
 *
 * ONE FUNCTION FOR BOTH CALL SITES, so the two cannot disagree about how far
 * behind the document is. They are two renderings of one quantity, which is
 * only safe because they share a source AND a formatter; the defect that rule
 * is written against is two renderings that share neither.
 */
export function fmtSnapshotAge(blocks: number): string {
  // ALWAYS A DIGIT, INCLUDING AT THE TIP, and that is the change HANDOFF-11
  // made. This function used to be `fmtBlockAge` and returned the bare word
  // `tip` for a zero age - a string with no digit in it - which assertion A2's
  // `/snapshot age: \d+ blocks/` cannot match, and which reads as a claim
  // ("this IS the tip") where `snapshot age: 0 blocks` reads as the measurement
  // it is. The alternative was a second, differently-worded indicator beside
  // the first, which is two renderings of one quantity: the defect
  // `lib/api/fixtures/snapshot.ts` was written to avoid on the pool balances.
  //
  // A NEGATIVE AGE IS CLAMPED RATHER THAN PRINTED. A snapshot ahead of the tip
  // the page believes in is a reorg or a stale tip frame, and "-2 blocks" is a
  // measurement of neither. `snapshotAgeBlocks` clamps at the source too; this
  // is the second half of the same rule, kept here because this function is
  // also called with a raw difference in the footer.
  const behind = blocks > 0 ? blocks : 0;
  return `snapshot age: ${fmtInt(behind)} block${behind === 1 ? "" : "s"}`;
}

/** A percentage with a fixed number of decimals and no locale drift. */
export function fmtPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
