/**
 * `FlowsView` - the Tracking side of `/flows`, from `packages/content`.
 *
 * A SUMMARY, NOT A SECOND COPY. HANDOFF-04's DTO comment says why and it binds
 * here too: the Record page holds the rich rows with their provenance, and
 * HANDOFF-03's ledger records what happens when one fact lives in two files - a
 * correction lands in one and the site then contradicts itself about a named
 * person. So this carries the case ledger, the outcome, what is documented
 * about institutions and what is not supported, and everything else is a link.
 *
 * Every figure below is READ from a seed rather than restated. Where the seed
 * does not carry a figure, this view does not carry it either.
 */
import { getCases, getStats } from "@zcashreveal/content";
import type { FlowsView } from "@zcashreveal/types";

import { caseViews } from "./labels.js";
import { zecText } from "./units.js";

/** The case the Tracking side summarises. Named by id, so a re-ordered seed cannot silently change it. */
const CASE_ID = "K-2026-01-02";

export function buildFlowsView(): FlowsView {
  const view = caseViews().find((k) => k.id === CASE_ID);
  if (view === undefined) {
    throw new Error(`flows: the seed no longer carries ${CASE_ID}, which this view summarises`);
  }
  const seed = getCases().find((k) => k.id === CASE_ID);
  const stats = getStats();

  const reached = view.steps.filter((s) => s.amountZat > 0n);
  const largest = reached.reduce<bigint>((max, s) => (s.amountZat > max ? s.amountZat : max), 0n);

  return {
    headline: view.title,
    case: view,
    outcome: [
      { k: "verdict", v: view.verdict },
      { k: "steps documented", v: `${view.steps.length}` },
      { k: "largest single movement", v: zecText(largest) },
      { k: "confidence", v: view.confidence },
      { k: "last verified", v: view.lastVerified },
      {
        k: "sources",
        v: `${seed?.sources.length ?? 0} cited on the Record page for this case`,
      },
    ],
    institutions: [
      {
        k: "shielded share of supply",
        v: `${stats.shieldedSharePct.low} to ${stats.shieldedSharePct.high} per cent, as of ${stats.asOf}`,
      },
      { k: "chain height when the balances were read", v: stats.height.toLocaleString("en-US") },
      {
        k: "what the filings name",
        v: "Custodians. Not addresses: the S-3, the S-3/A and the 10-Q were checked and none publishes one.",
      },
      {
        k: "what an aggregator label proves",
        v: "That someone labelled an address. Precedence is displayed with every label on this site, and behaviour ranks below an owner filing.",
      },
    ],
    notSupported:
      "No claim here attributes an address to a person or an institution. The case ledger records movements between addresses, with the labels the Record publishes and their precedence; where a claim could not be located it is quarantined with the reason rather than repeated. Nothing on this page rests on a shielded balance, because no shielded balance is readable without a viewing key.",
  };
}
