/**
 * A3 on the rendering side: a partial drain is a NAMED partial.
 *
 * THE PAGE CALLS THE SAME FUNCTION THIS FILE CALLS, which is the whole reason
 * `mempool-summary.ts` exists - see its header, and the gate round that found
 * HANDOFF-07's headline fix pinned by nothing because the only site that
 * mattered was inside a server component no test imports.
 *
 * F-56-1: `mempool-summary.ts`, `lib/api/stream.ts`'s `asView`/`asDrain`, and
 * `app/track/page.tsx`'s Block A were read line-by-line before these probes
 * were written.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mempoolDrainNotice } from "@/lib/mempool-summary";
import type { MempoolDrain } from "@zcashreveal/types";

const COMPLETE: MempoolDrain = {
  observed: 9,
  analysed: 9,
  complete: true,
  deferred: 0,
  failed: 0,
  refused: false,
  completeSecondsAgo: 0,
  updatedSecondsAgo: 0,
  ceilingPerMinute: null,
  txPerMinute: null,
};

describe("mempoolDrainNotice", () => {
  it("prints BOTH numbers on a partial drain and never the total alone", () => {
    // THE MEMBER OF A3's EXCLUSION SET IS A NOTICE STATING M WHERE IT ANALYSED
    // N. Three of nine, so "9" must not appear without "3 of" in front of it.
    const notice = mempoolDrainNotice({
      ...COMPLETE,
      analysed: 3,
      complete: false,
      deferred: 6,
      completeSecondsAgo: null,
      ceilingPerMinute: 5,
      txPerMinute: 3,
    });
    expect(notice.known).toBe(true);
    if (!notice.known) return;
    expect(notice.complete).toBe(false);
    expect(notice.headline).toBe("3 of 9 analysed");
    expect(notice.detail).toContain("6 deferred");
    // AND IT SAYS IT HAS NEVER BEEN COMPLETE, rather than reporting an age of
    // zero - `completeSecondsAgo: null` is not "zero seconds ago".
    expect(notice.detail).toContain("has not been complete since the indexer started");
    // TIGHTENED FROM `not.toContain("just now")`, WHICH WAS OVER-BROAD AND
    // BECAME WRONG. That assertion existed to prove a never-complete drain does
    // not report an age; it did so by forbidding a STRING, and "just now" now
    // legitimately appears in the neighbouring `last tick` clause. The property
    // was always "the last-complete clause carries no time", so it says that.
    expect(notice.detail).not.toContain("last complete");
    expect(notice.detail).toContain("last tick");
  });

  it("does NOT say partial when the drain was complete", () => {
    // The other polarity, and it is the one that would go green on a function
    // that always says "partial". Without it the assertion above is satisfied
    // by a constant.
    const notice = mempoolDrainNotice(COMPLETE);
    expect(notice.known).toBe(true);
    if (!notice.known) return;
    expect(notice.complete).toBe(true);
    expect(notice.headline).toBe("9 of 9 analysed");
    expect(notice.detail).toContain("every transaction the node reported has been analysed");
    expect(notice.detail).not.toContain("deferred");
    expect(notice.detail).not.toContain("rate-limited");
  });

  it("names a refusal as a refusal rather than as a budget", () => {
    // Two causes of one shape. A reader deciding whether to reload wants to
    // know whether the indexer ran out of budget or was told to stop.
    const notice = mempoolDrainNotice({
      ...COMPLETE,
      analysed: 2,
      complete: false,
      deferred: 0,
      refused: true,
      completeSecondsAgo: 240,
      ceilingPerMinute: 5,
      txPerMinute: 3,
    });
    expect(notice.known).toBe(true);
    if (!notice.known) return;
    expect(notice.detail).toContain("rate-limited the indexer mid-drain");
    // THE SEPARATOR IS PART OF THE COPY AND IS ASSERTED. A full stop here
    // produced "...mid-drain. last tick ..." on the page.
    expect(notice.detail).toContain("; last tick just now, last complete 4 min ago.");
  });

  it("A STOPPED INDEXER DOES NOT READ LIKE A METERED ONE, which is the claim drain-state.ts makes about its own TTL", () => {
    // `drain-state.ts` gives as the reason its key carries no TTL that "a key
    // whose `updatedAtMs` is an hour old means the indexer stopped - the
    // gateway renders those differently". It did not: the partial branch named
    // only the last COMPLETE drain, so a dead process went on printing the same
    // sentence forever with nothing on the line moving. The sentence was in the
    // tree before the behaviour was, and executing it is what found that.
    const metered = mempoolDrainNotice({
      ...COMPLETE,
      analysed: 3,
      complete: false,
      deferred: 409,
      observed: 412,
      completeSecondsAgo: 840,
      updatedSecondsAgo: 12,
      ceilingPerMinute: 5,
      txPerMinute: 3,
    });
    const stopped = mempoolDrainNotice({
      ...COMPLETE,
      analysed: 3,
      complete: false,
      deferred: 409,
      observed: 412,
      completeSecondsAgo: 840 + 3_600,
      updatedSecondsAgo: 3_600,
      ceilingPerMinute: 5,
      txPerMinute: 3,
    });
    if (!metered.known || !stopped.known) throw new Error("both are known");
    // `agoText` reports seconds from 5 up, so 12 is "12 s ago" and not "just
    // now". The first draft of this probe asserted "just now" for
    // `updatedSecondsAgo: 12` and was wrong about its own fixture.
    expect(metered.detail).toContain("last tick 12 s ago");
    expect(stopped.detail).toContain("last tick 60 min ago");
    // THE DISCRIMINATION IS THE POINT: the two must not be the same sentence.
    expect(stopped.detail).not.toBe(metered.detail);
  });

  it("renders an absent drain state as a named absence and never as completeness", () => {
    // THE `null` MEMBER. An indexer that predates HANDOFF-15, none running, or
    // a gateway that could not read the key - three causes, one honest answer,
    // and it must not be "complete".
    const notice = mempoolDrainNotice(null);
    expect(notice.known).toBe(false);
    if (notice.known) return;
    expect(notice.condition).toContain("no indexer reported");
    expect(notice.condition).toContain("part of it rather than all of it");
  });

  it("reports the metered rate on a complete drain too", () => {
    const notice = mempoolDrainNotice({ ...COMPLETE, ceilingPerMinute: 5, txPerMinute: 3 });
    expect(notice.known).toBe(true);
    if (!notice.known) return;
    expect(notice.detail).toContain("metered at 5 requests a minute");
    expect(notice.detail).toContain("affords 3 transactions a minute");
  });
});

describe("RUNTIME.md section 8.5 quotes copy this function actually emits", () => {
  // A DOCUMENT QUOTING UI COPY HAS NO TRIPWIRE, and this table has now drifted
  // twice: once because its first draft was transcribed rather than captured,
  // and once because a gate fix changed the rate clause under it. Both times
  // the document was wrong before anything else was. This is the cheap half of
  // closing that - it cannot check the table is COMPLETE, only that every row
  // it does carry is a string the function returns.
  const DOC = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "docs", "2.0", "RUNTIME.md"),
    "utf8",
  );

  const rows = [
    {
      name: "keyless, 5/min",
      drain: {
        observed: 412, analysed: 3, complete: false, deferred: 409, failed: 0, refused: false,
        completeSecondsAgo: 840, updatedSecondsAgo: 12, ceilingPerMinute: 5, txPerMinute: 3,
      },
    },
    {
      name: "a provider key, 600/min",
      drain: {
        observed: 412, analysed: 412, complete: true, deferred: 0, failed: 0, refused: false,
        completeSecondsAgo: 2, updatedSecondsAgo: 2, ceilingPerMinute: 600, txPerMinute: 598,
      },
    },
    {
      name: "indexer stopped an hour ago",
      drain: {
        observed: 412, analysed: 3, complete: false, deferred: 409, failed: 0, refused: false,
        completeSecondsAgo: 4440, updatedSecondsAgo: 3600, ceilingPerMinute: 5, txPerMinute: 3,
      },
    },
  ] as const;

  for (const row of rows) {
    it(`the "${row.name}" row is quoted verbatim`, () => {
      const notice = mempoolDrainNotice(row.drain);
      if (!notice.known) throw new Error("expected a known drain");
      expect(DOC).toContain(notice.headline);
      expect(DOC).toContain(notice.detail);
    });
  }

  it("and the absent-drain condition is quoted too", () => {
    const notice = mempoolDrainNotice(null);
    if (notice.known) throw new Error("expected an absence");
    expect(DOC).toContain(notice.condition);
  });

  it("FAIL SIDE: a string the function does NOT emit is not found, so the check is not vacuous", () => {
    // Without this, a `toContain` over a 500-line document could be satisfied
    // by almost anything and the three assertions above would mean nothing.
    expect(DOC).not.toContain("409 deferred by the indexer's per-tick request budget - it analyses 3 a minute at its configured ceiling");
  });
});
