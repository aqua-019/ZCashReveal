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

/* -------------------------------------------------------------------------- */
/* ZEC price, and the statements dated against it                             */
/* -------------------------------------------------------------------------- */

/**
 * A point on a daily series, dated to the day.
 *
 * `SeriesPoint` above carries a decimal year because the shielded-share
 * readings are month- and year-precise and a decimal year is the honest
 * resolution for them. The price series is the opposite case: every reading is
 * a named calendar day in a table the research pulled from one API, so the date
 * is the datum and deriving a decimal year from it would be a lossy
 * re-encoding of a fact the corpus states exactly. `date` plots; `when` prints.
 */
export interface DatedPoint {
  /** ISO day. The plotting key, and here also what the corpus states. */
  readonly date: string;
  /** What the reader is told the date is. */
  readonly when: string;
  readonly value: number;
  /** Where the figure comes from. At least one, always. */
  readonly sources: readonly SourceRef[];
  /** The corpus's own qualifier, where it hedges. */
  readonly note?: string;
}

/**
 * Days since 1970-01-01 for an ISO day, as a plotting coordinate.
 *
 * `Date.UTC` rather than `new Date(string)`: the latter is parsed in the
 * runtime's local zone for some formats, and a chart whose x positions move
 * with the server's TZ is a chart that renders differently in CI than in
 * production. Nothing here is displayed - `when` is what the reader sees.
 */
export function day(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * ZEC's daily close, Aug 2025 to Aug 2026.
 *
 * This is research 01 section 5.1 verbatim - "Verified price series (CoinGecko
 * API, daily)", marked `high`, described there as a direct API pull of 366
 * daily points. Twenty-five of those points are published as a table; those
 * twenty-five are the ones below, in the corpus's order, with nothing added
 * between them.
 *
 * TWO POINTS THE MOCKUP DREW ARE NOT HERE. The mockup's series carried
 * 2025-10-26 at $272 and 2025-10-27 at $355. Those two numbers are real and
 * are on this page - they are the move that followed Arthur Hayes' $10k call,
 * and research 02 section 2.1 records them as "+30% in 24h ($272 to $355)".
 * What the corpus does not state is that they are the daily closes of those two
 * days: they are a before-and-after pair attached to a call the corpus itself
 * dates only as "~26 Oct 2025". Plotting them as dated closes would put a
 * precision on the record that the record does not have, so they stay in the
 * phrase catalogue, where the corpus does state them, and off the line.
 *
 * THREE POINTS THE MOCKUP DROPPED ARE HERE: 2026-06-03, 2026-07-27 and
 * 2026-08-20. All three are in the same corpus table, and each sits beside a
 * dated statement, so leaving them out flattened exactly the days the chart is
 * about.
 */
export const ZEC_PRICE: readonly DatedPoint[] = [
  {
    date: "2025-08-26",
    when: "26 Aug 2025",
    value: 39.75,
    sources: ["S-coingecko-coins-zcash"],
    note: "the 52-week low, and the base the +1,720% figure is measured from",
  },
  { date: "2025-09-01", when: "1 Sep 2025", value: 40.57, sources: ["S-coingecko-coins-zcash"] },
  { date: "2025-10-01", when: "1 Oct 2025", value: 74.11, sources: ["S-coingecko-coins-zcash"] },
  { date: "2025-10-15", when: "15 Oct 2025", value: 247.97, sources: ["S-coingecko-coins-zcash"] },
  { date: "2025-11-01", when: "1 Nov 2025", value: 404.76, sources: ["S-coingecko-coins-zcash"] },
  {
    date: "2025-11-07",
    when: "7 Nov 2025, 18:00 UTC",
    value: 723.43,
    sources: ["S-coingecko-coins-zcash", "S-bitmex-com-zec-crash-2026"],
    note: "the cycle high, and the one point on this line that is hourly rather than a daily close. The date is disputed: CoinGecko's hourly series puts $723.43 at 7 Nov, BitMEX puts the same price at 17 Nov. U-cycle-high-date-nov-2025 holds the discrepancy open rather than resolving it",
  },
  { date: "2025-11-15", when: "15 Nov 2025", value: 608.2, sources: ["S-coingecko-coins-zcash"] },
  { date: "2025-12-01", when: "1 Dec 2025", value: 428.76, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-01-01", when: "1 Jan 2026", value: 511.13, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-02-01", when: "1 Feb 2026", value: 302.82, sources: ["S-coingecko-coins-zcash"] },
  {
    date: "2026-03-01",
    when: "1 Mar 2026",
    value: 220.33,
    sources: ["S-coingecko-coins-zcash"],
    note: "the cycle trough",
  },
  { date: "2026-04-01", when: "1 Apr 2026", value: 247.43, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-05-01", when: "1 May 2026", value: 350.46, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-05-28", when: "28 May 2026", value: 541.26, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-06-03", when: "3 Jun 2026", value: 608.64, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-06-04", when: "4 Jun 2026", value: 620.93, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-06-05", when: "5 Jun 2026", value: 459.17, sources: ["S-coingecko-coins-zcash"] },
  {
    date: "2026-06-06",
    when: "6 Jun 2026",
    value: 389.99,
    sources: ["S-coingecko-coins-zcash"],
    note: "a daily close, not the crash low. The Block reports an intraday figure near $250 and BitMEX $309; U-june-5-crash-exact-low keeps the range rather than picking one",
  },
  { date: "2026-07-01", when: "1 Jul 2026", value: 399.32, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-07-27", when: "27 Jul 2026", value: 508.58, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-07-28", when: "28 Jul 2026", value: 477.77, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-08-01", when: "1 Aug 2026", value: 458.62, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-08-20", when: "20 Aug 2026", value: 565.4, sources: ["S-coingecko-coins-zcash"] },
  { date: "2026-08-21", when: "21 Aug 2026", value: 568.03, sources: ["S-coingecko-coins-zcash"] },
  {
    date: "2026-08-22",
    when: "22 Aug 2026",
    value: 784,
    sources: ["S-coingecko-coins-zcash"],
    note: "the venues disagree on the day: CoinGecko $784.00, Blockchair $791.53, CoinDesk $820.65. stats.json publishes the range and this line plots the CoinGecko close, which is the series it belongs to",
  },
];

/**
 * The statements dated against the price, as timeline claims.
 *
 * These are NOT a second hardcoded table. Every mark below names a row of
 * `timeline.json`, and that row is where the date, the wording, the sources,
 * the confidence and the permalink come from. What lives here is only the
 * abbreviation the chart has room for and the corpus's own title does not fit
 * in - "Orchard disclosed" for "Orchard bug disclosed publicly; ZEC falls 31%".
 * A mark whose event id is not in the timeline renders nothing rather than
 * rendering an unsourced label, which is checked at render time.
 *
 * The mockup's tenth mark read "ETF 8-K". The 21 Aug 2026 filing the corpus
 * records is the fifth amended S-3, so the label says that instead.
 *
 * The mockup's "ECC team quits" was dated 8 Jan 2026, which is T2026-01-08,
 * the day the departed team regrouped as cashZ - a `med` row. The resignation
 * itself is T2026-01-07 and is `high`, so the mark points at that.
 */
export interface PriceMark {
  /** A timeline id. The claim; everything printed about it comes from there. */
  readonly event: string;
  /** The chart-length abbreviation of that row's title. */
  readonly label: string;
}

export const ZEC_PRICE_MARKS: readonly PriceMark[] = [
  { event: "T2025-10-01", label: "Naval: insurance" },
  { event: "T2025-10-24", label: "Hayes: $10k" },
  { event: "T2025-11-03", label: "CoinDesk (sponsored)" },
  { event: "T2025-11-12", label: "Cypherpunk launches" },
  { event: "T2026-01-07", label: "ECC team quits" },
  { event: "T2026-03-09", label: "ZODL $25M" },
  { event: "T2026-05-06", label: "Multicoin" },
  { event: "T2026-06-04", label: "Orchard disclosed" },
  { event: "T2026-07-28", label: "Ironwood" },
  { event: "T2026-08-21", label: "Grayscale S-3 No. 5" },
];
