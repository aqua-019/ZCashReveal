/**
 * Display formatters.
 */

const ZAT_PER_ZEC = 100_000_000n;

export function zatToZec(zat: bigint | string): string {
  const n = typeof zat === "string" ? BigInt(zat) : zat;
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const whole = abs / ZAT_PER_ZEC;
  const frac = abs % ZAT_PER_ZEC;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

export function shortHex(hex: string, lead = 6, tail = 4): string {
  if (hex.length <= lead + tail + 1) return hex;
  return `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
}

export function fmtRelativeTime(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  if (delta < 1000) return "now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

export function fmtCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
