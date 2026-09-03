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
import { describe, expect, it } from "vitest";

import { mempoolDrainNotice } from "@/lib/mempool-summary";
import type { MempoolDrain } from "@zcashreveal/types";

const COMPLETE: MempoolDrain = {
  observed: 9,
  analysed: 9,
  complete: true,
  deferred: 0,
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
    expect(notice.detail).not.toContain("just now");
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
    expect(notice.detail).toContain("last complete 4 min ago");
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
