/**
 * The two sentences /track prints ABOUT the mempool, as functions rather than
 * as template literals inside a server component.
 *
 * WHY THEY LEFT THE PAGE. A gate round measured that the whole of HANDOFF-07's
 * headline fix - the shielded-share denominator - was pinned by nothing:
 * `apps/web/src/app/track/page.tsx` is a server component, no unit test imports
 * it, the Playwright spec for /track asserts only status, one heading, the
 * sysbar and an empty console, and reverting the tile's denominator left all
 * 359 web tests green. The fixture-side and gateway-side halves of that fix
 * were both pinned; the line the fix is actually about was the one unguarded
 * link in the chain. And this is the statistic that had already moved four
 * points in one direction and four points back across two gate rounds.
 *
 * A test asserting the formula inside the test file is not a fix for that - it
 * restates the arithmetic and agrees with itself. The page has to call the same
 * function the test calls, which is what this module is for.
 */

import { fmtInt } from "./format.js";

/** The four counts /track prints beside each other in the block header. */
export interface MempoolCounts {
  unconfirmed: number;
  shielded: number;
  migrations: number;
  transparent: number;
  decodedCount: number;
}

/**
 * The headline tile: what share of the transactions anyone could read touched a
 * shielded pool.
 *
 * THE DENOMINATOR IS `decodedCount`, and the value returned when it is zero is
 * the whole reason this is a function. `Math.round((0 / 0) * 100)` is `NaN`, and
 * a page rendering "NaN%" over "0 of 0 decoded" has failed in the one way this
 * project cares about most: it is publishing a non-number as a measurement. The
 * state is reachable - an empty mempool reaches it today, and a chain upgrade
 * that ships a version outside 1..6 would make every row `undecoded` - so it is
 * answered in words rather than left to floating point.
 */
export function shieldedShareTile(counts: MempoolCounts): { value: string; sub: string } {
  if (counts.decodedCount === 0) {
    return {
      value: "not measured",
      sub:
        counts.unconfirmed === 0
          ? "nothing is waiting"
          : `no transaction in the mempool could be decoded - ${fmtInt(counts.unconfirmed)} unconfirmed`,
    };
  }
  return {
    value: `${Math.round((counts.shielded / counts.decodedCount) * 100)}%`,
    sub: `by count - ${fmtInt(counts.shielded)} of ${fmtInt(counts.decodedCount)} decoded`,
  };
}

/**
 * The block header's enumeration of the mempool.
 *
 * IT HAS TO ACCOUNT FOR EVERY ROW OR SAY WHY IT DOES NOT. The three class
 * counts stopped summing to `unconfirmed` the moment `undecoded` existed, and
 * the header went on printing "13 unconfirmed - 7 shielded - 2 migrations - 3
 * transparent" with nothing on the line saying where the thirteenth went. That
 * is the harm the gateway's own comment cites when it argues for the shielded
 * count's definition: three figures printed beside each other that account for
 * less than the total, silently. The remainder is named instead.
 */
export function mempoolHeaderText(counts: MempoolCounts, feeWeather: string): string {
  const undecoded = counts.unconfirmed - counts.decodedCount;
  const remainder = undecoded > 0 ? ` - ${fmtInt(undecoded)} not decoded` : "";
  return (
    `${fmtInt(counts.unconfirmed)} unconfirmed - ${fmtInt(counts.shielded)} shielded - ` +
    `${fmtInt(counts.migrations)} migrations - ${fmtInt(counts.transparent)} transparent` +
    `${remainder} - fee weather: ${feeWeather}`
  );
}
