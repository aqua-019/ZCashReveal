/**
 * The Tracking side of /flows: a summary that links to the Record.
 *
 * Deliverable 2 makes this a summary, not a second copy. The case ledger is
 * read out of `packages/content` - `K-2026-01-02`, the same nine steps the
 * Record renders - so there is exactly one place the 2 January movements are
 * written down. Everything the Record says at length about labelling
 * infrastructure, the rich list and the allegations stays on the Record, behind
 * a link.
 *
 * The outcome figures are derived from the case's own steps rather than
 * transcribed from the mockup, which is what makes "26.8 percent reached the
 * exchange wallet" checkable against the ledger directly above it.
 */
import { getCase } from "@zcashreveal/content";
import type { CaseView, FlowsView } from "@zcashreveal/types";

import { stampFromIso, zec } from "./units";

const CASE_ID = "K-2026-01-02";

/** The corpus case, as a view. Throws if the seed loses it, rather than rendering an empty page. */
function caseView(): CaseView {
  const k = getCase(CASE_ID);
  if (k === undefined) throw new Error(`flows fixture: case ${CASE_ID} is not in the corpus`);
  return {
    id: k.id,
    title: k.title,
    summary: k.summary,
    steps: k.steps.map((s) => ({
      stamp: stampFromIso(s.time),
      height: s.height ?? null,
      from: s.from,
      to: s.to,
      amountZat: zec(s.amount),
      note: s.note,
      txid: s.txid ?? null,
    })),
    verdict: k.verdict,
    confidence: k.confidence,
    sources: [...k.sources],
    lastVerified: k.lastVerified,
  };
}

const K = caseView();

/** The 202,076.207 that left the pool on 2 January and has not moved since. */
const PARKED = zec("202076.207");
/** The 74,001.9317 consolidation that reached the hot wallet. */
const REACHED = zec("74001.9317");
const TOTAL_UNSHIELDED = zec("276077.739");

const pct = (part: bigint, whole: bigint): string => `${((Number(part) / Number(whole)) * 100).toFixed(1)} percent`;

export const FLOWS_VIEW: FlowsView = {
  headline: "2 January 2026 - the largest unshielding day of the cycle - 276,077.739 ZEC, verified on chain",
  case: K,
  outcome: [
    { k: "reached the exchange wallet", v: `74,001.93 ZEC - ${pct(REACHED, TOTAL_UNSHIELDED)} of the day` },
    { k: "still parked, unmoved", v: `202,076.21 ZEC - ${pct(PARKED, TOTAL_UNSHIELDED)} - one address, never spent since` },
    { k: "net new inflow after the round trip", v: "at most about 24,001 ZEC - the 50,000 leg went out and came back" },
    { k: "press said", v: "\"over 200,000 in the first week\", and \"74,002 to Binance on 3 to 5 January\"" },
  ],
  institutions: [
    { k: "Grayscale Zcash Trust", v: "388,673.68 ZEC at 30 Jun 2026 - custodian Coinbase Custody - 10-Q" },
    { k: "in-kind sponsor fee", v: "4,848.65 ZEC withdrawn in H1 2026, about 9,700 a year - resale undisclosed" },
    { k: "Cypherpunk Technologies", v: "323,394.38 ZEC - custodian Gemini, per its own 10-Q, not Coinbase Prime" },
    { k: "ZIP 271 lockbox", v: "78,183.41 ZEC - 99.28 percent untouched - spends shielded by mandate" },
    { k: "Silbert and DCG", v: "148 Form 144s, all of them ZCSH shares on OTCQX - zero ZEC on chain" },
    { k: "Arthur Hayes", v: "exit self-disclosed - venue, size and on-chain footprint all unknown" },
  ],
  notSupported:
    "No public Arkham label exists for Coinbase Prime, Coinbase Custody, Grayscale, Cypherpunk or DCG on any ZEC address. No report of ZEC moving to Coinbase Prime exists. Whale Alert does not index Zcash, and no usable exchange-reserve series exists for it. The rich list's third entry, 386,846 ZEC, is close to Grayscale's 388,674 and its fourth, 341,937, is close to Cypherpunk's 323,394 - both custodians run omnibus wallets, and proximity is not identification. The insider-selling allegations in circulation cite no addresses, no transactions and no supply audit.",
};
