/**
 * The pools fixture: five lanes, the value crossing between them, and the two
 * windows in which a pool's soundness rested on a broken proof system.
 *
 * Deliverable 5. Balances are CipherScan's at height 3,456,227, which is the
 * figure the mockup carries and the one `packages/content`'s stats seed
 * disagrees with by a few hundred blocks - a disagreement /flows already
 * surfaces rather than hides, and which this page states as its source line.
 *
 * EVERY AGGREGATE ON THIS PAGE IS DERIVED FROM ITS OWN COMPONENTS. Shares are
 * computed from the balances, the residual from the two unprovable pools, the
 * Sankey's total from its bands, the migration histogram's crossing count and
 * ZEC total from its own rows, and the drain rate from the drain series and its
 * own window. Three of those aggregates are stated in the mockup as literals
 * that its own components contradict, and they are corrected here rather than
 * transcribed - see the notes at each site. A page that prints a total its own
 * bars disagree with is the exact failure this site was built to point at, and
 * the fixture does not get an exemption.
 */
import { claimLevelFor, type PoolsView } from "@zcashreveal/types";

import { zec } from "./units";

/** Balances at CipherScan's stated height. */
const BALANCES = [
  { pool: "transparent" as const, label: "Transparent", zec: "12500223", rule: "public" },
  { pool: "ironwood" as const, label: "Ironwood", zec: "3129287", rule: "Bal >= 0 - ZIP 209" },
  { pool: "orchard" as const, label: "Orchard", zec: "708841", rule: "exit-only - ZIP 2006" },
  { pool: "sapling" as const, label: "Sapling", zec: "529015", rule: "Bal >= 0" },
  { pool: "sprout" as const, label: "Sprout", zec: "22621", rule: "migration-only - ZIP 308" },
];

const SUPPLY = BALANCES.reduce((a, b) => a + zec(b.zec), 0n);

/**
 * The unprovable residual: Sprout and Orchard.
 *
 * Sprout's soundness rested on the 2016 Powers of Tau parameters, and Orchard's
 * on the Halo 2 circuit that carried the 2026 counterfeiting bug. Neither pool's
 * balance can be proven not to include counterfeit value, which is a different
 * statement from saying it does - and the number is given as a share of supply
 * because that is the only honest scale for it.
 */
const RESIDUAL = zec("22621") + zec("708841");

/** Value crossing each boundary in the last 24 hours. */
const FLOWS = [
  { from: "transparent" as const, to: "ironwood" as const, zec: "18402" },
  { from: "transparent" as const, to: "sapling" as const, zec: "1205" },
  { from: "ironwood" as const, to: "transparent" as const, zec: "2104" },
  { from: "sapling" as const, to: "transparent" as const, zec: "1892" },
  { from: "orchard" as const, to: "transparent" as const, zec: "1140" },
  { from: "orchard" as const, to: "ironwood" as const, zec: "134472" },
  { from: "sapling" as const, to: "ironwood" as const, zec: "611" },
  { from: "sprout" as const, to: "sapling" as const, zec: "12" },
];

const FLOW_TOTAL = FLOWS.reduce((a, f) => a + zec(f.zec), 0n);
const MIGRATION_BAND = zec("134472");

/**
 * The ZIP 318 migration histogram.
 *
 * The denominations are the canonical ladder of TRACKING-MATH section 3.9:
 * n x 10^k for n in {1, 2, 5}, capped at 10,000 ZEC. The counts are the
 * mockup's profile with its top end corrected: as the mockup writes them the
 * fourteen bars sum to 82,428.5 ZEC across 847 crossings, while the caption
 * beside them - and the Sankey band directly above - says 134,472. Two panels
 * on one page disagreeing by 52,043 ZEC about the same twenty-four hours is not
 * a rounding difference; it is the page contradicting itself.
 *
 * Corrected by moving eleven crossings up the ladder and leaving the shape
 * alone: five from 1 ZEC to 10,000, four from 0.5 to 500, one from 0.5 to 50,
 * one from 1 to 2. The bars now sum to exactly 847 crossings and exactly
 * 134,472 ZEC, which is the Orchard-to-Ironwood band above them, and both
 * totals are computed from the rows below rather than written beside them.
 */
const DENOMINATIONS = [
  { label: "0.5", zec: "0.5", count: 56 },
  { label: "1", zec: "1", count: 178 },
  { label: "2", zec: "2", count: 98 },
  { label: "5", zec: "5", count: 142 },
  { label: "10", zec: "10", count: 128 },
  { label: "20", zec: "20", count: 44 },
  { label: "50", zec: "50", count: 74 },
  { label: "100", zec: "100", count: 58 },
  { label: "200", zec: "200", count: 21 },
  { label: "500", zec: "500", count: 23 },
  { label: "1k", zec: "1000", count: 9 },
  { label: "2k", zec: "2000", count: 6 },
  { label: "5k", zec: "5000", count: 3 },
  { label: "10k", zec: "10000", count: 7 },
];

const CROSSINGS = DENOMINATIONS.reduce((a, d) => a + d.count, 0);
const MIGRATED_ZAT = DENOMINATIONS.reduce((a, d) => a + zec(d.zec) * BigInt(d.count), 0n);

/**
 * The Orchard drain since Ironwood activated.
 *
 * A deterministic descent from the 3.66M sealed on 28 July to the 708,841 that
 * remain, in 26 samples over 25 days. `Math.random` is banned repo-wide, and
 * the mockup's own version of this curve is drawn from the seeded stream, so
 * the shape is a fixed table rather than a fresh sample per render.
 */
const DRAIN_START = zec("3660000");
const DRAIN_NOW = zec("708841");
const DRAIN_DAYS = 25;

const DRAIN_POINTS = Array.from({ length: 26 }, (_, i) => {
  // A decelerating drain: fastest in the first days, then thinning. Written as
  // a closed form so the curve is identical on the server and in the browser.
  const f = i / 25;
  const eased = 1 - (1 - f) ** 1.9;
  const span = DRAIN_START - DRAIN_NOW;
  return { i, zat: i === 25 ? DRAIN_NOW : DRAIN_START - (span * BigInt(Math.round(eased * 10_000))) / 10_000n };
});

/**
 * ZEC per hour, derived.
 *
 * The mockup states 5,603 ZEC/h, which corresponds to about 22 days; the window
 * it labels is 28 July to 22 August, which is 25. 2,951,159 ZEC over 600 hours
 * is 4,919. The window and the total are both stated on the page, so the rate
 * is computed from them rather than restated beside them.
 */
const DRAIN_PER_HOUR = Number(DRAIN_START - DRAIN_NOW) / 1e8 / (DRAIN_DAYS * 24);

/**
 * Pool balances 2016 to 2026, in ZEC, as an indicative reconstruction.
 *
 * Labelled indicative on the page, because it is: the series is reconstructed
 * from the shielded-share figures the research carries, not read from per-block
 * balances, and the indexer replaces it at HANDOFF-09. The last point is the
 * real one and matches the balances table above it exactly.
 */
const HISTORY: readonly [number, string, string, string, string, string][] = [
  [2016.9, "late 2016", "20000", "0", "0", "0"],
  [2017.5, "mid 2017", "180000", "0", "0", "0"],
  [2018.0, "early 2018", "250000", "0", "0", "0"],
  [2018.8, "late 2018", "300000", "40000", "0", "0"],
  [2019.5, "mid 2019", "220000", "300000", "0", "0"],
  [2020.5, "mid 2020", "120000", "500000", "0", "0"],
  [2021.5, "mid 2021", "70000", "780000", "0", "0"],
  [2022.5, "mid 2022", "45000", "900000", "150000", "0"],
  [2023.5, "mid 2023", "35000", "800000", "520000", "0"],
  [2024.1, "early 2024", "30000", "700000", "600000", "0"],
  [2024.6, "mid 2024", "28000", "660000", "780000", "0"],
  [2025.0, "early 2025", "27000", "640000", "1150000", "0"],
  [2025.8, "late 2025", "26000", "640000", "2300000", "0"],
  [2025.9, "late 2025", "26000", "640000", "3200000", "0"],
  [2026.4, "May 2026", "25600", "636000", "4300000", "0"],
  [2026.56, "Jul 2026", "24000", "600000", "3660000", "0"],
  [2026.58, "Jul 2026", "23800", "590000", "3480000", "176000"],
  [2026.61, "Aug 2026", "23200", "560000", "1760000", "1976000"],
  [2026.64, "22 Aug 2026", "22621", "529015", "708841", "3129287"],
];

export const POOLS_VIEW: PoolsView = {
  atHeight: 3_456_227,
  source: "CipherScan at 3,456,227. The loader's own stats seed reads 3,456,938; /flows carries both rather than choosing.",
  balances: BALANCES.map((b) => ({
    pool: b.pool,
    label: b.label,
    zat: zec(b.zec),
    share: Number(zec(b.zec)) / Number(SUPPLY),
    rule: b.rule,
  })),
  flows: FLOWS.map((f) => ({ from: f.from, to: f.to, zat: zec(f.zec) })),
  flowWindow: "last 24 hours",
  flowTotalZat: FLOW_TOTAL,
  flowNote: `source to destination, last 24 hours. ${(Number(MIGRATION_BAND) / Number(FLOW_TOTAL) * 100).toFixed(0)} percent of it is the Orchard to Ironwood migration. Orchard shows zero inflow by consensus: ZIP 2006 makes it exit-only.`,
  residual: {
    zat: RESIDUAL,
    share: Number(RESIDUAL) / Number(SUPPLY),
    verifiedShare: 1 - Number(RESIDUAL) / Number(SUPPLY),
    note: "Sprout rests on the 2016 Powers of Tau parameters and Orchard on the circuit that carried the 2026 counterfeiting bug. Neither balance can be proven free of counterfeit value. That is not a claim that either contains any.",
  },
  history: HISTORY.map(([t, when, sprout, sapling, orchard, ironwood]) => ({
    t,
    when,
    sprout: zec(sprout),
    sapling: zec(sapling),
    orchard: zec(orchard),
    ironwood: zec(ironwood),
  })),
  unsoundBands: [
    { from: 2016.83, to: 2018.83, label: "Sprout unsound" },
    { from: 2022.41, to: 2026.42, label: "Orchard unsound" },
  ],
  drain: {
    startZat: DRAIN_START,
    nowZat: DRAIN_NOW,
    points: DRAIN_POINTS,
    marks: [
      { i: 0, text: "28 Jul" },
      { i: 13, text: "10 Aug" },
      { i: 25, text: "22 Aug" },
    ],
    note: `${((Number(DRAIN_START - DRAIN_NOW) / Number(DRAIN_START)) * 100).toFixed(1)} percent migrated over ${DRAIN_DAYS} days, about ${Math.round(DRAIN_PER_HOUR).toLocaleString("en-US")} ZEC an hour. No deadline; dust under 0.01 ZEC is stranded.`,
  },
  denominations: {
    rows: DENOMINATIONS.map((d) => ({ label: d.label, count: d.count })),
    crossings: CROSSINGS,
    zat: MIGRATED_ZAT,
    strandedNote: "Under 0.01 ZEC per note, across roughly 3,120 notes, is stranded below the migration's dust floor.",
  },
  /**
   * The context /reveal's Mode B pane shows beside a shielded address.
   *
   * The tree size is the Ironwood commitment count; the median N_eff of 1,240
   * is the mockup's figure and sits inside the broad-candidate-set band, which
   * is what `claimLevelFor` returns for it. Both are counts, so the pane can
   * carry them without rendering a ZEC amount - which is A5's requirement and
   * the reason they are counts rather than a balance.
   */
  context: {
    pool: "ironwood",
    noteCount: 3_129_287,
    medianNEff: 1_240,
    claim: claimLevelFor(1_240),
  },
  neff: {
    rows: [
      { claim: "requires_disclosure", label: "requires disclosure - N_eff <= 10", pct: 6 },
      { claim: "small_heuristic_set", label: "small heuristic set - 10 to 100", pct: 17 },
      { claim: "broad_candidate_set", label: "broad candidate set - 100 to 1k", pct: 41 },
      { claim: "aggregate_only", label: "aggregate only - over 1k", pct: 36 },
    ],
    note: "A pool born at zero has small trees, and early anchors bound small sets. Plotted, not asserted: this is the distribution of what the anchor bound permits, not of what anyone has resolved.",
  },
};
