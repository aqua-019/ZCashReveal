/**
 * Module 5A — scoring (filter stack).
 *
 * Filters are pure synchronous functions that take a CandidateRange<P> and
 * narrow it (or leave it unchanged), producing both the new range and a
 * FilterApplication audit record. They compose left-to-right via
 * applyFilters; the result is fed into assessFiltered (assessment.ts) for
 * entropy and claim-level computation.
 *
 * Why anchor-membership and pool-separation filters are absent:
 *   - Anchor membership: enforced by Module 3's rawCandidateRange returning
 *     null when the anchor root is unknown. CandidateRange<P> only exists
 *     downstream of a successful AnchorIndex lookup, so any filter pipeline
 *     starting from a CandidateRange has already passed anchor membership.
 *   - Pool separation: enforced by the <P extends Pool> generic. A Filter
 *     <"sapling"> cannot accept a CandidateRange<"orchard"> at compile
 *     time. The TypeScript layer eliminates the cross-pool bug class
 *     entirely; a runtime audit record would just confirm "yes, the
 *     compiler did its job."
 *
 * Both invariants are documented at the type level. No no-op audit
 * entries are emitted for them — they would dilute the meaningful audit
 * trail without adding information.
 */

import type {
  Anchor,
  CandidateRange,
  FilterApplication,
  Hex,
  Pool,
} from "@zcashreveal/types";
import type { PoolState } from "../state/pool-state.js";

/**
 * The data a filter has access to. The anchor is pre-resolved once at the
 * pipeline entry point so individual filters don't repeat the lookup.
 */
export type FilterInput<P extends Pool> = {
  readonly range: CandidateRange<P>;
  readonly anchor: Anchor<P>;
  readonly state: PoolState<P>;
};

/**
 * The output of a single filter: the (possibly narrowed) range and an
 * audit record. rawCount = 0n is a valid degenerate state; downstream
 * assessFiltered short-circuits before calling entropyBitsUniform.
 */
export type FilterResult<P extends Pool> = {
  readonly range: CandidateRange<P>;
  readonly application: FilterApplication;
};

/**
 * Filters are pure synchronous. All 5A data sources are in-memory
 * PoolState; no I/O. Parameters are baked in via factory functions.
 */
export type Filter<P extends Pool> = (input: FilterInput<P>) => FilterResult<P>;

/**
 * Run a sequence of filters in order. Each filter sees the output of the
 * previous one. Returns both the final range and the full application
 * trail for audit.
 *
 * Filters that throw propagate the exception; this function does not
 * swallow errors. The caller (assessFiltered) decides on the error
 * handling policy.
 */
export function applyFilters<P extends Pool>(
  initial: CandidateRange<P>,
  anchor: Anchor<P>,
  state: PoolState<P>,
  filters: ReadonlyArray<Filter<P>>,
): {
  readonly range: CandidateRange<P>;
  readonly applications: ReadonlyArray<FilterApplication>;
} {
  let current = initial;
  const applications: FilterApplication[] = [];
  for (const filter of filters) {
    const result = filter({ range: current, anchor, state });
    current = result.range;
    applications.push(result.application);
  }
  return { range: current, applications };
}

/**
 * Time-window filter: assume the spender received the note within
 * `windowBlocks` blocks of the height they're proving against (the
 * anchor's heightCreated). Under that assumption, only commitments added
 * in the half-open height range (anchor.heightCreated - windowBlocks,
 * anchor.heightCreated] could be the spent note.
 *
 * The window is anchored at anchor.heightCreated, NOT at the current tip
 * height. The note was committed somewhere in the tree state captured by
 * the anchor's root; the assumption bounds how far back that could be.
 *
 * The K most recent positions in the original range survive:
 *   newMaxPosition = range.maxPosition (unchanged)
 *   newMinPosition = newMaxPosition - K + 1n   (or maxPosition + 1n if K === 0n)
 *   newRawCount    = K
 *
 * Clamping: if countBetweenHeights returns K > range.rawCount (state
 * inconsistency — more commitments in the window than the anchor sees),
 * the filter takes min(K, range.rawCount). The application's countOut
 * reflects the clamped value.
 */
export function timeWindowFilter<P extends Pool>(opts: {
  readonly windowBlocks: number;
}): Filter<P> {
  return ({ range, anchor, state }) => {
    const highHeight = anchor.heightCreated;
    const lowHeight = highHeight - opts.windowBlocks;
    const K = state.commitments.countBetweenHeights(lowHeight, highHeight);
    const countOut = K > range.rawCount ? range.rawCount : K;

    const newMinPosition =
      countOut === 0n ? range.maxPosition + 1n : range.maxPosition - countOut + 1n;

    const newRange: CandidateRange<P> = {
      pool: range.pool,
      anchorRoot: range.anchorRoot,
      minPosition: newMinPosition,
      maxPosition: range.maxPosition,
      rawCount: countOut,
    };

    const application: FilterApplication = {
      filter: "time_window",
      params: {
        windowBlocks: opts.windowBlocks,
        lowHeight,
        highHeight,
      },
      countIn: range.rawCount,
      countOut,
    };

    return { range: newRange, application };
  };
}

/**
 * Amount-match filter. Encodes the Kappos-style assumption "this unshield
 * consumes a note from the matched shielding deposit" and narrows Cand_0
 * to commitments added at the matched deposit's height.
 *
 * The match decision upstream (in RoundTripIndex) is amount equality or
 * fee-tolerant amount equality — captured in `matchKind` and
 * `toleranceZat` and recorded in the FilterApplication for audit. The
 * filter itself operates on `matchedDepositHeight`: it intersects the
 * input range with the position slice that the matched deposit's block
 * contributed to the commitment tree (a two-sided intersection that
 * handles both above-overflow and below-overflow uniformly).
 *
 * Edge cases:
 *   - No commitment at matched-deposit height → empty range (countOut = 0n)
 *   - Slice does not overlap the input range (above OR below) → empty range
 *   - Slice partially overlaps → intersection of slice and input range
 *
 * ONLY safe to run inside RoundTripIndex's matching path. A spend with
 * no matched deposit has nothing to feed this filter; calling it
 * manually for a per-spend assessment is a logic error.
 */
export function amountMatchFilter<P extends Pool>(opts: {
  readonly matchedDepositTxid: Hex;
  readonly matchedDepositHeight: number;
  readonly matchedDepositAmountZat: bigint;
  readonly withdrawalAmountZat: bigint;
  readonly toleranceZat: bigint;
  readonly matchKind: "EXACT" | "FEE_TOLERANT";
}): Filter<P> {
  return ({ range, state }) => {
    const slice = state.commitments.positionRangeAtHeight(opts.matchedDepositHeight);

    let newMinPosition: bigint;
    let newMaxPosition: bigint;
    let countOut: bigint;

    if (slice === null) {
      // No commitment at matched-deposit height → degenerate empty range.
      newMinPosition = range.maxPosition + 1n;
      newMaxPosition = range.maxPosition;
      countOut = 0n;
    } else {
      const sliceFirst = slice.firstPosition;
      const sliceLast = slice.firstPosition + slice.count - 1n;

      // Two-sided intersection of [sliceFirst, sliceLast] with
      // [range.minPosition, range.maxPosition].
      const effectiveFirst =
        sliceFirst > range.minPosition ? sliceFirst : range.minPosition;
      const effectiveLast =
        sliceLast < range.maxPosition ? sliceLast : range.maxPosition;

      if (effectiveFirst > effectiveLast) {
        // No overlap — slice falls entirely above or below the input range.
        newMinPosition = range.maxPosition + 1n;
        newMaxPosition = range.maxPosition;
        countOut = 0n;
      } else {
        newMinPosition = effectiveFirst;
        newMaxPosition = effectiveLast;
        countOut = effectiveLast - effectiveFirst + 1n;
      }
    }

    const newRange: CandidateRange<P> = {
      pool: range.pool,
      anchorRoot: range.anchorRoot,
      minPosition: newMinPosition,
      maxPosition: newMaxPosition,
      rawCount: countOut,
    };

    const application: FilterApplication = {
      filter: "amount_match",
      params: {
        matchedDepositTxid: opts.matchedDepositTxid,
        matchedDepositHeight: opts.matchedDepositHeight,
        matchedDepositAmountZat: opts.matchedDepositAmountZat,
        withdrawalAmountZat: opts.withdrawalAmountZat,
        toleranceZat: opts.toleranceZat,
        matchKind: opts.matchKind,
      },
      countIn: range.rawCount,
      countOut,
    };

    return { range: newRange, application };
  };
}
