/**
 * Wire-shape parsers. The dashboard receives JSON over WebSocket (and
 * mirrors the same shape in mock mode) where bigints are encoded as
 * strings. This module converts those wire shapes into the canonical
 * @zcashreveal/types shapes that components consume.
 *
 * Pure transformations — no side effects, no network, no state.
 */

import { asHex, type ClaimAssessment, type FilterApplication } from "@zcashreveal/types";
import type { RawAssessment } from "../hooks/useMempool";

/**
 * Parse a RawAssessment (bigints as strings) into a canonical
 * ClaimAssessment (bigints as bigint). Validates Hex fields via asHex().
 */
export function parseAssessment(raw: RawAssessment): ClaimAssessment {
  return {
    pool: raw.pool,
    anchorRoot: asHex(raw.anchorRoot),
    rawCount: BigInt(raw.rawCount),
    effectiveSetSize: BigInt(raw.effectiveSetSize),
    entropyBits: raw.entropyBits,
    claimLevel: raw.claimLevel,
    appliedFilters: raw.appliedFilters.map(parseFilterApplication),
  };
}

/**
 * One audit record, from unvalidated JSON.
 *
 * DEFENSIVE BY NECESSITY, NOT BY TASTE. `RawAssessment.appliedFilters` is a
 * `JSON.parse` cast (see its docblock), so every field here is `unknown` until
 * checked. The previous version narrowed on `time_window` and then returned an
 * `amount_match` record UNCONDITIONALLY - so an `amount_echo` record, which
 * carries no `matchedDepositTxid`, reached `asHex(undefined)` and threw inside a
 * React render. That was the fourth implicit else in this dashboard's filter
 * handling; HANDOFF-08 fixed three of them in `CandidatesPanel.tsx` and stopped
 * one file short of the module that feeds them.
 *
 * A record this build does not model becomes an INERT `time_window` step with
 * zeroed bounds rather than a coerced `amount_match`. It renders as a step that
 * removed nothing, which is true, instead of as a narrowing whose parameters
 * were invented. `legacy/dashboard` is v0.2 and retired at the HANDOFF-11
 * cutover, so the bar here is that a newer wire shape cannot crash a page.
 */
function parseFilterApplication(
  raw: RawAssessment["appliedFilters"][number],
): FilterApplication {
  if (raw.filter === "time_window") {
    return {
      filter: "time_window",
      params: {
        windowBlocks: asNum(raw.params["windowBlocks"]),
        lowHeight: asNum(raw.params["lowHeight"]),
        highHeight: asNum(raw.params["highHeight"]),
      },
      countIn: BigInt(raw.countIn),
      countOut: BigInt(raw.countOut),
    };
  }
  if (raw.filter === "amount_match") {
    return {
      filter: "amount_match",
      params: {
        matchedDepositTxid: asHex(asStr(raw.params["matchedDepositTxid"])),
        matchedDepositHeight: asNum(raw.params["matchedDepositHeight"]),
        matchedDepositAmountZat: BigInt(asStr(raw.params["matchedDepositAmountZat"]) || "0"),
        withdrawalAmountZat: BigInt(asStr(raw.params["withdrawalAmountZat"]) || "0"),
        toleranceZat: BigInt(asStr(raw.params["toleranceZat"]) || "0"),
        matchKind: raw.params["matchKind"] === "EXACT" ? "EXACT" : "FEE_TOLERANT",
      },
      countIn: BigInt(raw.countIn),
      countOut: BigInt(raw.countOut),
    };
  }
  return {
    filter: "time_window",
    params: { windowBlocks: 0, lowHeight: 0, highHeight: 0 },
    countIn: BigInt(raw.countIn),
    countOut: BigInt(raw.countOut),
  };
}

/** A wire number, or 0. Never `NaN`, which would render as "NaN blocks". */
function asNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** A wire string, or the empty string. */
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
