/**
 * The transaction fixture: the 2 January 2026 unshield.
 *
 * Deliverable 4 names it. It is TRACKING-MATH section 6's first golden case and
 * section 3.4's calibration case at once, and it is the reason the relative
 * amount tolerance exists: the v0.2 absolute tolerance of 160,000 zatoshi -
 * 0.0016 ZEC - would have missed a delta of 0.4059 ZEC on 50,000, which as a
 * fraction is 8.1 in a million. Every figure below is a row of
 * `packages/content/data/cases.json`, case `K-2026-01-02`.
 *
 * THE ARITHMETIC IS DERIVED. The inference chain's four steps are written as
 * counts, and each step's cost is computed from the pair rather than restated,
 * so a chain whose steps do not subtract to its own totals cannot be shipped.
 * The relative delta printed in the assumptions is computed from the two
 * amounts. `test/unit/fixtures.test.ts` re-derives both.
 *
 * WHAT THIS PAGE MUST NOT DO. It renders a MEDIUM link between a shield and a
 * deshield fifty-two minutes apart. It does not say who. The sender field of
 * the publishes panel says "not on chain, by construction", the recipient is a
 * fresh single-use address with no label, and the round-trip ledger's middle
 * line is fifty-two minutes of nothing - which is the pool working exactly as
 * designed, printed as such.
 */
import { claimLevelFor, type Estimate, type LedgerLine, type TxView } from "@zcashreveal/types";

import { at, zec } from "./units";

export const ROUND_TRIP_TXID = "7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c";
const ORIGIN_TXID = "a79347138b88b5a0405c643964c8ef308240fa5ea1058f6e35e40789f4b621c0";

/** The shield that went in, and the deshield that came out. */
const SHIELDED_IN = zec("50000.96");
const UNSHIELDED_OUT = zec("50000.5541");
const DELTA = SHIELDED_IN - UNSHIELDED_OUT;

/**
 * The relative residual, as a string, computed rather than transcribed.
 *
 * Computed in zatoshi and only then divided, so the ratio is taken between two
 * exact integers. The result is about 8.12e-6, comfortably inside the 1e-4
 * tolerance and about twelve times outside the v0.2 absolute one.
 */
export const RELATIVE_DELTA = Number(DELTA) / Number(SHIELDED_IN);

/** The four steps of the chain, as counts. The cost of each is the difference. */
const CHAIN = [
  { n: 4_918_402n, filter: "anchor_bound" as const, label: "raw candidate set, anchor bound", params: { pool: "orchard", anchorHeight: 3_191_050, anchorDepth: 1 } },
  { n: 3_105_911n, filter: "spent_count" as const, label: "spent-count subtraction", params: { nullifiersBeforeAnchor: 1_812_491 } },
  { n: 41_208n, filter: "time_window" as const, label: "time window, W = 576 blocks", params: { windowBlocks: 576, hoursApprox: 12 } },
  { n: 1n, filter: "amount_match" as const, label: "amount echo, epsilon = 1e-4", params: { epsilon: "1e-4", relativeDelta: "8.1e-6", deltaZec: "0.4059", matchKind: "RELATIVE" } },
];

const ROUND_TRIP_ESTIMATE: Estimate = {
  candidates: 1n,
  top: [
    { txid: ORIGIN_TXID, what: "t1XKfbZY... shielding its entire balance, 52 minutes earlier", p: 1 },
  ],
  filters: CHAIN.map((step, i) => ({
    filter: step.filter,
    label: step.label,
    params: step.params,
    countIn: i === 0 ? step.n : (CHAIN[i - 1] as { n: bigint }).n,
    countOut: step.n,
  })),
  nEff: 1,
  entropyBits: 0,
  claim: claimLevelFor(1),
  grade: "MEDIUM",
  assumptions: [
    "A single-note spend. The fee of 10,000 zatoshi is ZIP 317 conventional at two logical actions, which bounds the shielded arity at two - one real spend and one likely dummy.",
    "Receipt within about twelve hours of the anchor, which is the 576-block window the time filter applies.",
    `That the 50,000.96 ZEC shield 52 minutes earlier (tx a7934713...) is the origin. The residual is ${(Number(DELTA) / 1e8).toFixed(4)} ZEC, a relative error of ${RELATIVE_DELTA.toExponential(1)} - inside the 1e-4 tolerance, and about twelve times outside the v0.2 absolute one of 0.0016 ZEC, which would have missed this link entirely.`,
    "One external signal would confirm or refute this. The chain alone cannot, and the link is graded MEDIUM rather than HIGH for exactly that reason.",
  ],
};

/**
 * The round trip, from `cases.json`.
 *
 * The middle line is the one that matters: fifty-two minutes inside the Orchard
 * pool during which nothing is observable. It carries no amount, because there
 * is no amount to carry - not zero, not unknown-but-estimated. The pool is
 * designed to break this link and it did; what survives is a delta, a gap and a
 * fresh address.
 */
const ROUND_TRIP: readonly LedgerLine[] = [
  {
    stamp: at({ y: 2026, mo: 1, d: 2, h: 18, mi: 1, s: 43 }),
    height: 3_191_017,
    description: "t1XKfbZY... shields its entire balance",
    amountZat: -SHIELDED_IN,
    shielded: false,
    txid: ORIGIN_TXID,
  },
  {
    stamp: { text: "18:01 to 18:53", precision: "minute", sortMs: Date.UTC(2026, 0, 2, 18, 27, 0) },
    height: null,
    description: "inside the Orchard pool - 52 minutes, unobservable",
    amountZat: null,
    shielded: true,
    txid: null,
  },
  {
    stamp: at({ y: 2026, mo: 1, d: 2, h: 18, mi: 53, s: 18 }),
    height: 3_191_051,
    description: "t1dP1MJw... receives from the pool",
    amountZat: UNSHIELDED_OUT,
    shielded: false,
    txid: ROUND_TRIP_TXID,
  },
  {
    stamp: at({ y: 2026, mo: 1, d: 2, h: 19, mi: 31, s: 34 }),
    height: 3_191_091,
    description: "t1U1NE8w... receives from the pool",
    amountZat: zec("24000.9781"),
    shielded: false,
    txid: "6db13a92f870a655e9a03d5914cad2dcc1be22be205ef781abce4eebf6ca6062",
  },
  {
    stamp: at({ y: 2026, mo: 1, d: 2, h: 20, mi: 35, s: 38 }),
    height: 3_191_134,
    description: "t1Ym8XWv... consolidates into t1PKBiv7... - the hot wallet Lookonchain labels Binance",
    amountZat: zec("74001.9317"),
    shielded: false,
    txid: "ba0783815529f9825d3d3a8c2d7f3dafe63468e4b5b60dcec61f7d54d1dee84c",
  },
];

export const ROUND_TRIP_VIEW: TxView = {
  txid: ROUND_TRIP_TXID,
  version: "v5",
  height: 3_191_051,
  stamp: at({ y: 2026, mo: 1, d: 2, h: 18, mi: 53, s: 18 }),
  leakClass: "Z_TO_T",
  severity: "HIGH",
  summary: "an unshield of 50,000.5541 ZEC to t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e",
  deltas: [{ pool: "orchard", deltaZat: UNSHIELDED_OUT }],
  metrics: [
    {
      label: "valueBalanceOrchard",
      value: "+50,000.5541",
      note: "leaving the pool - exact",
      // Value crossing a pool boundary is one of gold's four licensed jobs.
      accent: true,
    },
    { label: "transparent out", value: "1", note: "single-use address, spent 1h42m later", accent: false },
    { label: "fee to logical actions", value: "L = 2", note: "10,000 zat - ZIP 317 conventional - at most 2 real spends", accent: false },
    { label: "anchor depth", value: "1", note: "synced immediately before spending", accent: false },
  ],
  publishes: [
    { k: "nullifiers", v: "2 - orchard, one of them likely a dummy", muted: false },
    { k: "commitments", v: "2 - orchard: change and dummy", muted: false },
    { k: "anchor", v: "root at 3,191,050 - depth 1", muted: false },
    { k: "expiryDelta", v: "40 blocks - Zashi family", muted: false },
    { k: "proof size", v: "2,720 + 2,272 x 2 = 7,264 B - canonical", muted: false },
    { k: "recipient", v: "t1dP1MJw... - fresh - exact", muted: false },
    { k: "sender", v: "not on chain, by construction", muted: true },
  ],
  estimate: ROUND_TRIP_ESTIMATE,
  roundTrip: [...ROUND_TRIP],
  roundTripNote:
    "The pool is designed to break exactly this link, and it did. What survives it is an amount delta of 0.4059 ZEC, a fifty-two minute gap, a fresh single-use address, and the fact that the same 50,000 ZEC had left that hot wallet eight days earlier. ZECReveal grades that MEDIUM and prints why. It does not say who.",
  feeZat: 10_000n,
  logicalActions: 2,
  conventionalFee: true,
};

export const TX_VIEWS: ReadonlyMap<string, TxView> = new Map([[ROUND_TRIP_TXID, ROUND_TRIP_VIEW]]);
