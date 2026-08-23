import type { SourceRef } from "@zcashreveal/content";

/**
 * Time series the Record charts, with the source of every point.
 *
 * These are readings the corpus states as a dated table rather than as a claim
 * object, so `packages/content` does not carry them: its schemas describe
 * claims, and a claim per data point would be 30 near-identical records saying
 * nothing the table does not. They live here instead, and they are held to the
 * same standard by other means - every `sources` entry below is a real id from
 * `sources.json`, and `test/unit/series.test.ts` resolves every one of them
 * through `getSource()`, so a citation cannot drift into something the corpus
 * does not contain. That is the same property `scripts/check-provenance.mjs`
 * gives the seed files.
 *
 * Moving them into a `packages/content` collection is the better long-term
 * home and is recorded in the section 8 ledger for whichever handoff next owns
 * that package.
 *
 * NOTHING HERE IS INTERPOLATED. Every point is a figure the research states,
 * at the date the research states it. The mockup's series carried two extra
 * points; both are in the corpus tables, and where the mockup and the corpus
 * disagree on the last reading, the corpus wins.
 */

export interface SeriesPoint {
  /** Decimal year, for plotting. 2026.64 is late August 2026. */
  readonly t: number;
  /** What the reader is told the date is. Never derived from `t`. */
  readonly when: string;
  readonly value: number;
  /** Where the figure comes from. At least one, always. */
  readonly sources: readonly SourceRef[];
  /** The corpus's own qualifier, where it hedges. */
  readonly note?: string;
}

/**
 * The shielded share of ZEC supply, 2018 to 2026.
 *
 * The single number that would show privacy actually being used, and the one
 * the marketing claim in C1 stands or falls on: "encrypted Bitcoin" is a
 * description of a chain whose supply is mostly shielded, and this has never
 * been that chain. It reached 30 per cent once, in May 2026, nine and a half
 * years in, and then fell back.
 *
 * Sources: research 03's shielded-adoption curve and research 01 section 6.3,
 * which agree on every point they share.
 */
export const SHIELDED_SHARE: readonly SeriesPoint[] = [
  {
    t: 2018.62,
    when: "Aug 2018",
    value: 3.6,
    sources: ["S-usenix-usenixsecurity18-sec18-kappos"],
    note: "Kappos et al.'s own measurement, in the paper that also found 0.3 per cent of transactions fully private",
  },
  {
    t: 2021.62,
    when: "Aug 2021",
    value: 7.4,
    sources: ["S-zec-stats-zecstats-com"],
    note: "ZECStats' five-years-ago baseline",
  },
  { t: 2024.08, when: "Early 2024", value: 8, sources: ["S-crypto-news-why-30-of-zcash-supply-is-now-in-the"] },
  {
    t: 2024.6,
    when: "Aug 2024",
    value: 9,
    sources: ["S-forbes-08-how-satoshi-collaborator-zooko-wilcox"],
    note: "Forbes gives it as about 9 per cent, 1.48M of 16.3M ZEC",
  },
  { t: 2025.0, when: "Start of 2025", value: 11, sources: ["S-coin-metrics-state-of-the-network-issue-338"] },
  { t: 2025.79, when: "Oct 2025", value: 18, sources: ["S-crypto-news-why-30-of-zcash-supply-is-now-in-the"] },
  { t: 2025.87, when: "Nov 2025", value: 23, sources: ["S-crypto-news-why-30-of-zcash-supply-is-now-in-the"] },
  {
    t: 2026.37,
    when: "May 2026",
    value: 30,
    sources: ["S-crypto-news-why-30-of-zcash-supply-is-now-in-the", "S-coin-metrics-state-of-the-network-issue-338"],
    note: "the peak, about 5M ZEC, and the only time the shielded share has reached 30 per cent",
  },
];

/**
 * The last reading is a RANGE, not a point, and is rendered as one.
 *
 * `stats.json` carries it: CipherScan reads 26.0 per cent at block 3,456,227
 * and ZECStats reads 26.8 per cent on the same day. Two competing explorers
 * disagreeing by 0.8 points is exactly the sort of thing this site refuses to
 * average into a single confident number, so the chart draws the band and the
 * table twin prints both ends.
 *
 * The value is read from `getStats()` at render time rather than repeated here,
 * so it cannot fall out of step with the Splash metrics.
 */
export const SHIELDED_SHARE_LAST_T = 2026.64;
