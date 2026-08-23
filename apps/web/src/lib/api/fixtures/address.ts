/**
 * The address fixture: the ZIP 271 lockbox.
 *
 * Deliverable 3 names it and gives its four figures. Every one of them, and
 * every transaction below, is a row of `packages/content/data/cases.json`
 * (case `K-zip271-lockbox`) or of `labels.json` - so the Instrument's address
 * view and the Record's /flows are reading the same four movements, and a
 * correction to either lands on both.
 *
 * WHY THIS ADDRESS. It is the only ZEC address whose owner is defined by
 * consensus code rather than by a labelling vendor, so it is the one address on
 * which this site can state an owner at all - and it is also the address whose
 * spends are shielded by mandate, so it is where "exact on the transparent
 * side, bounded on the pool side" is not a slogan but the literal shape of the
 * data. The header states a consensus label; the pool-side column under it
 * refuses to name a destination for a single one of the three spends.
 *
 * AGGREGATES ARE DERIVED, NOT TRANSCRIBED. balance, received, sent and net-to-
 * pool are computed from the four transactions below, and `test/unit/
 * fixtures.test.ts` re-derives them independently. The mockup states all four
 * as literals and they happen to be right; a fixture that states an aggregate
 * its own rows contradict is the defect this site exists to point at.
 */
import { claimLevelFor, type AddressTx, type AddressView, type Estimate } from "@zcashreveal/types";

import { labelFor } from "./labels";
import { at, zec } from "./units";

export const LOCKBOX = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";

/** The mainnet chain the whole fixture corpus describes. */
const NETWORK = "mainnet" as const;

/* -------------------------------------------------------------------------- */
/* The estimates attached to the three boundary events                        */
/* -------------------------------------------------------------------------- */

/**
 * The 7,875 shield of 3 Feb 2026, and the 7,438.2295 that came back twenty
 * minutes later.
 *
 * This is TRACKING-MATH section 6's second golden case, and its point is that
 * it must grade LOW. The delta is 436.7705 ZEC, which is 5.5 percent - about
 * 555 times outside the relative tolerance of 1e-4, which is the figure
 * /method renders for the same case - so the amount
 * echo does NOT fire, and what is left is a coincidence of timing and address.
 * The chain is shown with the filter that failed, because a filter that removed
 * nothing is exactly as much a part of the audit trail as one that removed four
 * million candidates.
 */
const PARTIAL_ECHO: Estimate = {
  candidates: 1_204n,
  top: [
    {
      txid: "eaedfdddd569ef24eaeeae9642746aaa26959a0e7f35ccb32aef660277ade2a9",
      what: "the 7,875 ZEC shield from this same address, 20 minutes earlier",
      p: 0.62,
    },
    { txid: null, what: "any other note in the window", p: 0.38 },
  ],
  filters: [
    {
      filter: "anchor_bound",
      label: "raw candidate set, anchor bound",
      params: { anchorDepth: 2, pool: "orchard" },
      countIn: 4_921_884n,
      countOut: 4_921_884n,
    },
    {
      filter: "spent_count",
      label: "spent-count subtraction",
      params: { nullifiersBeforeAnchor: 1_813_006 },
      countIn: 4_921_884n,
      countOut: 3_108_878n,
    },
    {
      filter: "time_window",
      label: "time window, W = 576 blocks",
      params: { windowBlocks: 576, halfLifeDays: 2 },
      countIn: 3_108_878n,
      countOut: 1_204n,
    },
    {
      filter: "amount_match",
      label: "amount echo, epsilon = 1e-4 - REMOVED NOTHING",
      params: {
        relativeDelta: "5.5e-2",
        epsilon: "1e-4",
        deltaZec: "436.7705",
        outcome: `outside tolerance by a factor of ${(0.055463 / 1e-4).toFixed(0)}`,
      },
      countIn: 1_204n,
      countOut: 1_204n,
    },
  ],
  nEff: 1_204,
  entropyBits: 10.23,
  claim: claimLevelFor(1_204),
  grade: "LOW",
  assumptions: [
    "A single-note spend. Two notes of 3,719.11 each would look identical from outside and are not excluded.",
    "Receipt within the 576-block window of the anchor - about twelve hours at 75 seconds a block.",
    "That the 7,875 ZEC this address shielded twenty minutes earlier is the origin. The amount echo does NOT support that: the residual is 436.7705 ZEC, 5.5 percent, against a tolerance of 0.01 percent. What is left is a coincidence of timing and of address, which is why this grades LOW and not MEDIUM.",
  ],
};

/** The 129.8202 shield of 14 Apr 2026, which has no matching exit at all. */
const NO_EXIT: Estimate = {
  candidates: 0n,
  top: [],
  filters: [
    {
      filter: "anchor_bound",
      label: "exit candidates in the 576-block window",
      params: { windowBlocks: 576, targetZec: "129.8202", pool: "orchard" },
      countIn: 812n,
      countOut: 812n,
    },
    {
      filter: "amount_match",
      label: "amount echo, exact and relative",
      params: { epsilon: "1e-4", exactMatches: 0, relativeMatches: 0 },
      countIn: 812n,
      countOut: 0n,
    },
  ],
  nEff: 0,
  entropyBits: 0,
  /**
   * COMPUTED, not chosen. A gate round found `aggregate_only` written here by
   * hand beside an N_eff of 0, which is the ladder's top rung under its bottom
   * reading: `claimLevelFor(0)` is `requires_disclosure`, because the ladder is
   * a safety ladder and nEff <= 10 is its strictest rung. An empty set is an
   * odd thing to call a requires-disclosure claim, and the last assumption
   * below says so rather than softening the level - erring strict costs a
   * reader nothing, and erring loose is the failure this site is about.
   */
  claim: claimLevelFor(0),
  grade: null,
  assumptions: [
    "No deshield in the window matches 129.8202 ZEC to within 0.01 percent, or exactly.",
    "The value is therefore still inside the pool as far as public data can tell, and the honest answer is that the origin is unresolved rather than unknown-but-guessable.",
    "The claim chip reads requires-disclosure because the ladder is computed from N_eff and 0 is below its strictest threshold. Nothing survived here, so there is nothing to disclose either; the level is left strict rather than relabelled, because a ladder that softens when the answer is empty is a ladder that can be argued down when it is not.",
  ],
};

/** The 7,875 shield, seen from the shielding side: an exit watch that fired weakly. */
const SHIELD_WATCH: Estimate = {
  candidates: 1n,
  top: [
    {
      txid: "1f6099a47cac73924e53ad36b00f3d2bfa81820d526a87d866db4bc71faa663f",
      what: "7,438.2295 ZEC to this same address, 20 minutes later",
      p: 1,
    },
  ],
  filters: [
    {
      filter: "anchor_bound",
      label: "deshields within 576 blocks",
      params: { windowBlocks: 576, pool: "orchard" },
      countIn: 331n,
      countOut: 331n,
    },
    {
      filter: "amount_match",
      label: "amount echo against 7,875.0000",
      params: { epsilon: "1e-4", exact: 0, feeTolerant: 0, partial: 1, residualZec: "436.7705" },
      countIn: 331n,
      countOut: 1n,
    },
  ],
  nEff: 1,
  entropyBits: 0,
  claim: claimLevelFor(1),
  grade: "LOW",
  assumptions: [
    "One candidate survives, and it survives on timing and address reuse rather than on the amount: 436.7705 ZEC of the 7,875 did not come back and is unresolved in the pool.",
    "A single candidate at N_eff 1 would ordinarily be a requires-disclosure claim. It is graded LOW anyway, because the filter that produced the single candidate is the weakest one in the toolkit. The claim level and the link grade are answering different questions and this row is where that shows.",
  ],
};

/* -------------------------------------------------------------------------- */
/* The four transactions                                                      */
/* -------------------------------------------------------------------------- */

const TXS: readonly AddressTx[] = [
  {
    txid: "8a93724082fcc84bcd2c423c539214f1b3ec0802f11d25ec6021370a9e764c8a",
    height: 3_308_125,
    stamp: at({ y: 2026, mo: 4, d: 14, h: 21, mi: 24, s: 25 }),
    direction: "t-to-z",
    directionText: "t to z - partial",
    amountZat: zec("-129.8202"),
    creditZat: zec("7308.4093"),
    debitZat: zec("7438.2295"),
    amountNote: "7,438.2295 spent, 7,308.4093 back as change",
    counterparty: { title: "shielded pool", detail: "Orchard - change returns to this address", address: null },
    estimate: NO_EXIT,
    poolNote: "No exit in the window matches 129.8202 within tolerance. The value stays in the pool as far as public data can tell.",
    exactness: "bounded",
  },
  {
    txid: "1f6099a47cac73924e53ad36b00f3d2bfa81820d526a87d866db4bc71faa663f",
    height: 3_227_959,
    stamp: at({ y: 2026, mo: 2, d: 3, h: 23, mi: 29, s: 23 }),
    direction: "z-to-t",
    directionText: "z to t",
    amountZat: zec("7438.2295"),
    creditZat: zec("7438.2295"),
    debitZat: 0n,
    counterparty: { title: "shielded pool", detail: "Orchard - 1 nullifier, anchor depth 2", address: null },
    estimate: PARTIAL_ECHO,
    poolNote: "Origin candidates narrowed to 1,204. The 7,875 shield twenty minutes earlier is the leading one and the amount does not support it.",
    exactness: "bounded",
  },
  {
    txid: "eaedfdddd569ef24eaeeae9642746aaa26959a0e7f35ccb32aef660277ade2a9",
    height: 3_227_947,
    stamp: at({ y: 2026, mo: 2, d: 3, h: 23, mi: 9, s: 40 }),
    direction: "t-to-z",
    directionText: "t to z",
    amountZat: zec("-7875.0000"),
    creditZat: 0n,
    debitZat: zec("7875.0000"),
    counterparty: { title: "shielded pool", detail: "Orchard - no transparent outputs", address: null },
    estimate: SHIELD_WATCH,
    poolNote: "Exit watch: 7,438.2295 returned to this address twenty minutes later. Residual 436.7705 ZEC unresolved in the pool.",
    exactness: "bounded",
  },
  {
    txid: "525f440283b4c9ec30fa04a5796f3ddfa4ba1e1e48657a8d6f32313f36cf1381",
    height: 3_146_400,
    stamp: at({ y: 2025, mo: 11, d: 24, h: 19, mi: 56, s: 42 }),
    direction: "coinbase",
    directionText: "coinbase",
    amountZat: zec("78750.0000"),
    creditZat: zec("78750.0000"),
    debitZat: 0n,
    amountNote: "10 outputs of 7,875",
    counterparty: { title: "NU6.1 activation coinbase", detail: "lockbox value pool - protocol issuance", address: null },
    estimate: null,
    poolNote: "Protocol issuance. There is nothing to estimate: the coinbase is written by the consensus rules.",
    exactness: "exact",
  },
];

/* -------------------------------------------------------------------------- */
/* Aggregates, derived                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Received and sent are sums of the GROSS legs, the way an explorer counts
 * them: the April spend pays 7,438.2295 out of this address and 7,308.4093 back
 * into it, and both halves are real movements of a real UTXO. Summing the net
 * column instead would report received as 86,188.2295 and sent as 8,004.8202 -
 * numbers that are internally consistent, agree on the balance, and are both
 * wrong, because they silently drop every change output the address ever took.
 */
const received = TXS.reduce((a, t) => a + t.creditZat, 0n);
const sent = TXS.reduce((a, t) => a + t.debitZat, 0n);
const balance = received - sent;
const credits = TXS.filter((t) => t.creditZat > 0n).length;
const debits = TXS.filter((t) => t.debitZat > 0n).length;

/**
 * Value this address has put into shielded pools and not seen come back.
 * Net, because that is the only sense in which value is "in the pool".
 */
const netToPool =
  TXS.filter((t) => t.direction === "t-to-z").reduce((a, t) => a - t.amountZat, 0n) -
  TXS.filter((t) => t.direction === "z-to-t").reduce((a, t) => a + t.amountZat, 0n);

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

export const LOCKBOX_VIEW: AddressView = {
  address: LOCKBOX,
  network: NETWORK,
  script: "p2sh",
  scriptText: "P2SH - 2-of-3 multisig - mainnet",
  label: labelFor(LOCKBOX),
  balanceZat: balance,
  receivedZat: received,
  sentZat: sent,
  netToPoolZat: netToPool,
  balanceNote: "exact - every credit and debit is a transparent UTXO",
  receivedNote: `${credits} credits, two of them returns from the pool`,
  sentNote: `${debits} debits, both into shielded outputs`,
  netToPoolNote: "0.72 percent of the disbursement - untraceable after this hop",
  balances: [
    { height: 3_146_399, stamp: at({ y: 2025, mo: 11, d: 24, h: 19, mi: 56, s: 41 }), balanceZat: 0n, event: null, crossing: false },
    {
      height: 3_146_400,
      stamp: at({ y: 2025, mo: 11, d: 24, h: 19, mi: 56, s: 42 }),
      balanceZat: zec("78750.0000"),
      event: "78,750 minted - NU6.1 activation coinbase",
      // Protocol issuance into a transparent address. It crosses no pool boundary.
      crossing: false,
    },
    {
      height: 3_227_947,
      stamp: at({ y: 2026, mo: 2, d: 3, h: 23, mi: 9, s: 40 }),
      balanceZat: zec("70875.0000"),
      event: "7,875 into the pool",
      crossing: true,
    },
    {
      height: 3_227_959,
      stamp: at({ y: 2026, mo: 2, d: 3, h: 23, mi: 29, s: 23 }),
      balanceZat: zec("78313.2295"),
      event: "7,438.2295 back, 20 minutes later",
      crossing: true,
    },
    {
      height: 3_308_125,
      stamp: at({ y: 2026, mo: 4, d: 14, h: 21, mi: 24, s: 25 }),
      balanceZat: zec("78183.4093"),
      event: "129.8202 into the pool",
      crossing: true,
    },
    { height: 3_456_854, stamp: at({ y: 2026, mo: 8, d: 22, h: 14, mi: 58, s: 0 }), balanceZat: zec("78183.4093"), event: null, crossing: false },
  ],
  interactions: [
    { kind: "coinbase", from: "NU6.1 coinbase", to: "lockbox", label: "coinbase 78,750", valueZat: zec("78750.0000") },
    { kind: "pool", from: "lockbox", to: "Orchard pool", label: "to pool 7,875 + 129.82", valueZat: zec("8004.8202") },
    { kind: "pool", from: "Orchard pool", to: "lockbox", label: "from pool 7,438.2295", valueZat: zec("7438.2295") },
  ],
  interactionNote:
    "No transparent counterparties at all. Every spend crosses the boundary, which is what ZIP 271 requires, and nothing downstream of that boundary is attributable.",
  transactions: [...TXS],
  reasoning: [
    {
      title: "Identity is consensus-defined",
      body: "ZIP 271 writes this address into the consensus rules and names the 2-of-3 key-holders: the Zcash Foundation, the Electric Coin Company and Shielded Labs. No vendor label is involved, and this is the only kind of ownership claim this site makes.",
      confidence: "high",
    },
    {
      title: "Balances are exact",
      body: "Every credit and debit is a transparent UTXO. The 78,750 was minted in the NU6.1 activation coinbase at block 3,146,400 as ten outputs of 7,875.",
      confidence: "high",
    },
    {
      title: "Spends are shielded by mandate",
      body: "ZIP 271 requires each chunk to be spent completely into a shielded output. After the first hop the funds are inside the pool, so no exchange, custodian or counterparty can be named for any of them.",
      confidence: "high",
    },
    {
      title: "The partial echo grades LOW",
      body: "7,875 went into the pool at 23:09 and 7,438.2295 came back at 23:29 - a residual of 436.7705, or 5.5 percent, against a relative tolerance of 0.01 percent. The timing is tight and the address is the same. It is shown with its arithmetic; it is not claimed.",
      confidence: "med",
    },
    {
      title: "What is not returned",
      body: "Who initiated the two spends. Where the 566.5907 ZEC that has not come back went. Whether anything was sold. None of the three is derivable from this address, and the page does not offer a guess at any of them.",
      confidence: null,
    },
  ],
  note: "Blockchair renders the 7,875 ZEC shielded spend as a fee. It is not a fee; it is value entering the pool - an example of why the boundary needs its own explorer.",
  exactness: "exact",
};

/** Every address the fixture corpus can answer for. */
export const ADDRESS_VIEWS: ReadonlyMap<string, AddressView> = new Map([[LOCKBOX, LOCKBOX_VIEW]]);
