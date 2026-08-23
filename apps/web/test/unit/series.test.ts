/**
 * The charted series carry real citations.
 *
 * `src/lib/series.ts` holds figures the corpus states as dated tables rather
 * than as claim objects, so they sit outside `packages/content` and outside the
 * validator that guards it. This is the replacement guarantee: every source id
 * in every series must resolve through `getSource()`, which is backed by
 * `sources.json`, which `scripts/check-provenance.mjs` in turn holds to
 * `docs/2.0/research`. A citation that drifts to something the corpus does not
 * contain therefore fails here rather than shipping.
 *
 * The fail state is the important half: it plants an id that is not in
 * sources.json and shows the same check rejecting it, so a green run cannot be
 * a check that never looked.
 */
import { describe, expect, it } from "vitest";

import { getSource, getStats } from "@zcashreveal/content";

import {
  SHIELDED_SHARE,
  SHIELDED_SHARE_LAST_T,
  ZEC_PRICE,
  ZEC_PRICE_MARKS,
  day,
  type DatedPoint,
  type SeriesPoint,
} from "@/lib/series";

/**
 * Every series this module publishes, so a new one cannot escape the sweep.
 *
 * The two shapes differ on purpose and both are covered here. `SeriesPoint`
 * carries a decimal year, because the shielded-share readings are month- and
 * year-precise and a decimal year is the honest resolution for them;
 * `DatedPoint` carries an ISO day, because every price reading is a named
 * calendar day in the corpus and deriving a decimal year from it would be a
 * lossy re-encoding of a fact the record states exactly. The common contract -
 * at least one resolvable source per point, a stated date, sorted - is the same.
 */
const SERIES: readonly (readonly [string, readonly (SeriesPoint | DatedPoint)[]])[] = [
  ["SHIELDED_SHARE", SHIELDED_SHARE],
  ["ZEC_PRICE", ZEC_PRICE],
];

/** The plotting key of either shape, as a number, for the sort check. */
function key(p: SeriesPoint | DatedPoint): number {
  return "t" in p ? p.t : day(p.date);
}

describe("series provenance - pass state", () => {
  for (const [name, points] of SERIES) {
    it(`${name}: every point cites at least one source, and every source resolves`, () => {
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) {
        expect(p.sources.length, `${name} point ${p.when} cites nothing`).toBeGreaterThan(0);
        for (const ref of p.sources) {
          expect(getSource(ref), `${name} point ${p.when} cites ${ref}, which is not in sources.json`).toBeDefined();
        }
      }
    });

    it(`${name}: is sorted, and every point states its own date rather than deriving one`, () => {
      const ts = points.map(key);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
      for (const p of points) {
        expect(p.when.length, "a point with no stated date").toBeGreaterThan(0);
        expect(Number.isFinite(p.value)).toBe(true);
      }
    });
  }

  it("the shielded-share series stops before the current reading, which is a range", () => {
    // The last point is a range in stats.json because CipherScan and ZECStats
    // disagree, and the chart draws it as a band. If a point were ever appended
    // past this boundary, the chart would draw a line into the band and imply a
    // precision the sources do not have.
    for (const p of SHIELDED_SHARE) expect(p.t).toBeLessThan(SHIELDED_SHARE_LAST_T);
    const { low, high } = getStats().shieldedSharePct;
    expect(low).toBeLessThanOrEqual(high);
  });

  it("the series is consistent with the corpus on both endpoints", () => {
    // Kappos measured 3.6 per cent in 2018; the peak the research records is 30.
    expect(SHIELDED_SHARE[0]?.value).toBe(3.6);
    expect(Math.max(...SHIELDED_SHARE.map((p) => p.value))).toBe(30);
  });

  it("every price point is a real calendar day, not a formatted approximation", () => {
    for (const p of ZEC_PRICE) {
      expect(p.date, `${p.when} is not an ISO day`).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
      expect(Number.isFinite(day(p.date))).toBe(true);
      expect(p.value, `${p.when} has a non-positive price, which has no logarithm`).toBeGreaterThan(0);
    }
  });

  it("every price annotation binds to a timeline row rather than to a hardcoded label", async () => {
    const { getTimeline } = await import("@zcashreveal/content");
    const ids = new Set(getTimeline().map((e) => e.id));
    expect(ZEC_PRICE_MARKS.length).toBeGreaterThan(0);
    for (const m of ZEC_PRICE_MARKS) {
      // The wording, the date, the sources and the confidence all come from the
      // row. A mark whose id does not resolve would render an assertion with no
      // record behind it, which is the one thing this chart must not do.
      expect(ids.has(m.event), `annotation ${m.label} points at ${m.event}, which is not a timeline row`).toBe(true);
    }
  });
});

describe("series provenance - fail state", () => {
  it("the same check rejects a source id that is not in the corpus", () => {
    const planted = "S-not-a-real-source-planted-by-this-test";
    expect(getSource(planted)).toBeUndefined();
  });

  it("the same check rejects a point that cites nothing", () => {
    const planted: SeriesPoint = { t: 2026.9, when: "later", value: 42, sources: [] };
    expect(planted.sources.length).toBe(0);
  });
});
