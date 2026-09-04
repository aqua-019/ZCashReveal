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

// EXTENSIONLESS, LIKE EVERY OTHER IMPORT IN THIS DIRECTORY. The first draft
// wrote `./format.js` - correct for the indexer and the gateway, which are ESM
// packages compiled by tsc, and wrong here: `next build` resolves through
// webpack and answers "Module not found: Can't resolve './format.js'". Nothing
// in this repository's gate caught it. `pnpm -r test`, `pnpm typecheck`,
// `pnpm lint` and `pnpm check` were all green on the commit that shipped it,
// because none of them runs a production Next build; the Vercel deployment on
// the PR is the first thing that does. Noted in the report.
import type { MempoolDrain } from "@zcashreveal/types";

import { fmtInt } from "./format";

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

/* ============================================================================
   How complete the view is (HANDOFF-15 deliverable 3)
   ========================================================================== */

/**
 * What /track says about the completeness of the mempool it is showing.
 *
 * A DISCRIMINATED RESULT RATHER THAN A STRING, ON `SnapshotAge`'s PRECEDENT
 * (`lib/snapshot/source.ts`). The renderer has to treat "nothing told us how
 * complete this is" differently from "this is 3 of 9" - the first is a named
 * absence and the second is a measurement - and a function returning one string
 * for both forces the page to re-derive the distinction from the words. That is
 * the second producer this file's own header exists to prevent.
 */
export type DrainNotice =
  | { readonly known: false; readonly condition: string }
  | {
      readonly known: true;
      readonly complete: boolean;
      /** "3 of 9 analysed". Never "3" alone, and never "9" alone. */
      readonly headline: string;
      /** Why it is partial, and how long since it last was not. */
      readonly detail: string;
    };

/**
 * The rate clause, and NO `?? 0` ANYWHERE IN IT.
 *
 * `fmtInt(drain.ceilingPerMinute ?? 0)` printed "metered at 0 requests a minute,
 * which affords 3 transactions a minute" - a zero standing for an absence, in
 * the function whose whole subject is refusing that, in a sentence that
 * contradicts itself. A gate reviewer found it.
 *
 * THE COMBINATION IS NOT UNREACHABLE, WHICH IS WHY THIS IS A BRANCH AND NOT AN
 * ASSERTION. `ceilingPerMinute` and `txPerMinute` are independently nullable at
 * four layers - `MempoolDrainState`, `mempoolDrainSchema`, `asDrain`, and
 * `MempoolTickDeps`, where the ceiling and the plan are two unrelated
 * constructor fields. Nothing types the implication, so the wire admits a null
 * ceiling beside a stated rate and the renderer has to answer it rather than
 * coerce it.
 */
function rateText(
  drain: MempoolDrain,
  form: "long" | "short" = "long",
): string {
  if (drain.txPerMinute === null) return "";
  if (drain.ceilingPerMinute === null) {
    return ` - it analyses ${fmtInt(drain.txPerMinute)} transactions a minute, against a ceiling it did not state`;
  }
  return form === "short"
    ? ` - it analyses ${fmtInt(drain.txPerMinute)} a minute at its ceiling of ${fmtInt(drain.ceilingPerMinute)} requests a minute`
    : ` - the indexer is metered at ${fmtInt(drain.ceilingPerMinute)} requests a minute, which affords ${fmtInt(drain.txPerMinute)} transactions a minute`;
}

/** "just now", "45 s ago", "3 min ago". Seconds in, prose out. */
function agoText(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 90) return `${fmtInt(seconds)} s ago`;
  return `${fmtInt(Math.round(seconds / 60))} min ago`;
}

/**
 * The completeness notice.
 *
 * SECTION 3's CONTRACT IN ONE FUNCTION: "a reader must never be shown five
 * transactions and left to assume that is the mempool". So the partial form
 * always prints BOTH numbers, and the reason - a budget, or a refusal - is
 * named rather than left as a gap between them.
 *
 * `null` IN, A NAMED ABSENCE OUT, AND NEVER A CLAIM OF COMPLETENESS. A missing
 * drain state means an indexer that predates HANDOFF-15, or none running, or a
 * gateway that could not read the key. Rendering any of those as "complete"
 * publishes exactly the confidence the field exists to withhold.
 */
export function mempoolDrainNotice(drain: MempoolDrain | null): DrainNotice {
  if (drain === null) {
    return {
      known: false,
      condition:
        "no indexer reported how much of the mempool it analysed, so the rows below may be part of it rather than all of it",
    };
  }

  const headline = `${fmtInt(drain.analysed)} of ${fmtInt(drain.observed)} analysed`;
  const lastComplete =
    drain.completeSecondsAgo === null
      ? "this view has not been complete since the indexer started"
      : `last complete ${agoText(drain.completeSecondsAgo)}`;
  // THE LAST TICK IS PRINTED BESIDE THE LAST COMPLETE DRAIN, AND WITHOUT IT A
  // STOPPED INDEXER READS EXACTLY LIKE A METERED ONE. `drain-state.ts` already
  // states, as the reason its key carries no TTL, that "a key whose
  // `updatedAtMs` is an hour old means the indexer stopped - the gateway
  // renders those differently". It did not: the partial branch named only the
  // last COMPLETE drain, so a process that died an hour ago went on saying
  // "409 deferred by the per-tick budget; last complete 14 min ago" forever,
  // with nothing on the line moving. That is this project's own recurring
  // shape - a stale surface that renders and reports no fault - and the
  // sentence claiming otherwise was in the tree before the behaviour was.
  const lastTick = `last tick ${agoText(drain.updatedSecondsAgo)}`;

  if (drain.complete) {
    // THE RATE IS PRINTED EVEN WHEN THE DRAIN IS COMPLETE, because a reader
    // deciding whether to trust a live table wants to know it is fed at three
    // transactions a minute before the mempool gets busy, not after.
    const rate = rateText(drain);
    return {
      known: true,
      complete: true,
      headline,
      detail: `every transaction the node reported has been analysed, ${agoText(drain.updatedSecondsAgo)}${rate}`,
    };
  }

  // FOUR REASONS, NOT THREE, AND THE ORDER IS THE PRECEDENCE. A refusal is the
  // most specific fact available; a decode failure is next, because it is the
  // one reason a drain will NEVER complete on its own; the budget is the
  // ordinary case; and the fallback names only what it can see.
  //
  // `failed` USED NOT TO EXIST HERE, and its absence made the fallback lie: a
  // permanently undecodable transaction kept `complete` false forever while the
  // only available words were "the indexer has not finished this drain" - a
  // claim of pending-ness about work that will never finish. A gate reviewer
  // found it by asking what happens when `analyzeOne` returns "failed", which
  // no test in this branch had done.
  const why = drain.refused
    ? "the endpoint rate-limited the indexer mid-drain"
    : drain.failed > 0 && drain.deferred > 0
      ? `${fmtInt(drain.deferred)} deferred by the indexer's per-tick request budget and ${fmtInt(drain.failed)} the decoder could not read`
      : drain.failed > 0
        ? `${fmtInt(drain.failed)} could not be decoded, so this view will not complete on its own`
        : drain.deferred > 0
          ? `${fmtInt(drain.deferred)} deferred by the indexer's per-tick request budget`
          : "the indexer has not finished this drain";
  const rate = rateText(drain, "short");
  return {
    known: true,
    complete: false,
    headline,
    // SEMICOLON RATHER THAN A FULL STOP, because `lastComplete` begins
    // lowercase and a full stop in front of it produced "...at its configured
    // ceiling. last complete 14 min ago." - a sentence starting mid-word-case,
    // on the page, in the copy this deliverable exists to add. Found by
    // executing the function to transcribe RUNTIME.md section 8.5's table
    // rather than by reading it.
    // SEMICOLON RATHER THAN A FULL STOP BEFORE `lastTick`, because both
    // clauses begin lowercase and a full stop in front of one produced
    // "...at its configured ceiling. last complete 14 min ago." on the page.
    detail: `${why}${rate}; ${lastTick}, ${lastComplete}.`,
  };
}
