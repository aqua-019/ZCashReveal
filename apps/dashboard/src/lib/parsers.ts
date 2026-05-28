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

function parseFilterApplication(
  raw: RawAssessment["appliedFilters"][number],
): FilterApplication {
  if (raw.filter === "time_window") {
    return {
      filter: "time_window",
      params: {
        windowBlocks: raw.params.windowBlocks,
        lowHeight: raw.params.lowHeight,
        highHeight: raw.params.highHeight,
      },
      countIn: BigInt(raw.countIn),
      countOut: BigInt(raw.countOut),
    };
  }
  return {
    filter: "amount_match",
    params: {
      matchedDepositTxid: asHex(raw.params.matchedDepositTxid),
      matchedDepositHeight: raw.params.matchedDepositHeight,
      matchedDepositAmountZat: BigInt(raw.params.matchedDepositAmountZat),
      withdrawalAmountZat: BigInt(raw.params.withdrawalAmountZat),
      toleranceZat: BigInt(raw.params.toleranceZat),
      matchKind: raw.params.matchKind,
    },
    countIn: BigInt(raw.countIn),
    countOut: BigInt(raw.countOut),
  };
}
