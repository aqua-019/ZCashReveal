import { describe, expect, it } from "vitest";

import { MEMPOOL_VIEW } from "@/lib/api/fixtures/mempool";
import { mempoolHeaderText, shieldedShareTile } from "@/lib/mempool-summary";

/**
 * The two sentences /track prints ABOUT the mempool.
 *
 * THESE EXIST BECAUSE THE STATISTIC THEY CARRY MOVED FOUR POINTS IN ONE
 * DIRECTION AND FOUR BACK ACROSS TWO GATE ROUNDS, PINNED BY NOTHING. The
 * fixture-side and gateway-side halves of that fix were both covered; the line
 * on the page was not, and reverting it left all 359 web tests green. A server
 * component cannot be imported by a unit test, so the arithmetic moved into a
 * module the page and this file both call - which is the only arrangement in
 * which the number here is the number on the page rather than a restatement of
 * the formula.
 */
describe("the shielded-share tile", () => {
  it("divides by what was decoded, over the corpus the site actually ships", () => {
    const tile = shieldedShareTile(MEMPOOL_VIEW.summary);
    expect(tile.value).toBe("58%");
    expect(tile.sub).toBe("by count - 7 of 12 decoded");
  });

  it("FAIL SIDE: the wrong denominator is a different, and worse, answer", () => {
    // The two figures this tile printed while the undecoded row was being
    // counted first into the numerator and then into the denominator. Named so
    // a regression to either reads as a regression rather than as a number.
    const s = MEMPOOL_VIEW.summary;
    expect(Math.round((s.shielded / s.unconfirmed) * 100)).toBe(54);
    expect(shieldedShareTile(s).value).not.toBe("54%");
    expect(shieldedShareTile({ ...s, shielded: 8 }).value).not.toBe("58%");
  });

  it("a mempool nobody could decode is NOT MEASURED, and never NaN per cent", () => {
    // `Math.round((0 / 0) * 100)` is NaN, and a headline tile rendering "NaN%"
    // over "0 of 0 decoded" publishes a non-number as a measurement. The state
    // is reachable: a chain upgrade shipping a version outside 1..6 makes every
    // row `undecoded`, which is the case this whole handoff exists to handle.
    const tile = shieldedShareTile({
      unconfirmed: 3,
      shielded: 0,
      migrations: 0,
      transparent: 0,
      decodedCount: 0,
    });
    expect(tile.value).toBe("not measured");
    expect(tile.value).not.toContain("NaN");
    expect(tile.sub).toContain("3 unconfirmed");
  });

  it("an empty mempool says so rather than dividing nothing by nothing", () => {
    const tile = shieldedShareTile({
      unconfirmed: 0,
      shielded: 0,
      migrations: 0,
      transparent: 0,
      decodedCount: 0,
    });
    expect(tile.value).toBe("not measured");
    expect(tile.sub).toBe("nothing is waiting");
  });
});

describe("the block header's enumeration of the mempool", () => {
  it("accounts for every row, including the one nobody decoded", () => {
    // It printed "13 unconfirmed - 7 shielded - 2 migrations - 3 transparent",
    // three figures summing to 12 against a total of 13, with nothing saying
    // where the thirteenth went. That is the harm the gateway's own comment
    // cites when it argues for the shielded count's definition: figures printed
    // beside each other that account for less than the total, silently.
    const line = mempoolHeaderText(MEMPOOL_VIEW.summary, MEMPOOL_VIEW.summary.feeWeather);
    expect(line).toContain("13 unconfirmed");
    expect(line).toContain("1 not decoded");

    const stated = 7 + 2 + 3 + 1;
    expect(stated).toBe(MEMPOOL_VIEW.summary.unconfirmed);
  });

  it("FAIL SIDE: a mempool the decoder read in full carries no remainder clause", () => {
    // The discriminating half. The clause must appear because a row is
    // undecoded, not on every render.
    const line = mempoolHeaderText(
      { unconfirmed: 5, shielded: 2, migrations: 1, transparent: 2, decodedCount: 5 },
      "calm",
    );
    expect(line).not.toContain("not decoded");
    expect(line).toBe("5 unconfirmed - 2 shielded - 1 migrations - 2 transparent - fee weather: calm");
  });
});
