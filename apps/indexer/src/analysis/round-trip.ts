/**
 * Round-trip detection — replaces the v0.1 LinkEngine (link-engine.ts).
 *
 * Maintains a sliding time window of shielding deposits and unshielding
 * withdrawals across all four pools. For each new report, prunes expired
 * entries, records the report's contribution as a deposit and/or
 * withdrawal, and emits LinkRecords for any newly-matchable pairs.
 *
 * SINCE HANDOFF-08 A REPORT MUST HAVE A TRANSPARENT SIDE TO CONTRIBUTE ONE.
 * See the wide rule inside `ingest()`. It is the one change to this class's
 * behaviour since it replaced the v0.1 LinkEngine, and it removes links rather
 * than adding them: the links it removes were between wallets with no
 * relationship and no addresses.
 *
 * Match algorithm preserved BIT-FOR-BIT from link-engine.ts:
 *   - EXACT amount match takes precedence over FEE_TOLERANT
 *   - Single EXACT candidate  → confidence HIGH
 *   - Multiple EXACT candidates → confidence MEDIUM (per match)
 *   - Single FEE_TOLERANT candidate  → confidence MEDIUM
 *   - Multiple FEE_TOLERANT candidates → confidence LOW (per match)
 *
 * What's new in Module 5B vs the v0.1 LinkEngine:
 *   - `height` field on each deposit/withdrawal (from report.tipHeightAtSeen),
 *     to feed Module 7's amountMatchFilter when PoolState is plumbed.
 *   - Injectable `now` clock for deterministic pruning in tests.
 *   - Configurable `windowMs` and `feeToleranceZat` (defaults from
 *     constants.ts).
 *   - LinkRecord.assessment field declared optional and left undefined
 *     in this module (Module 7 will populate via assessFiltered once
 *     PoolState reaches AnalyzeContext).
 */

import type {
  ClaimAssessment,
  Hex,
  LeakReport,
  LinkRecord,
  Pool,
  PoolPath,
  ShieldedPool,
  Zatoshi,
} from "@zcashreveal/types";
import type { PoolState, PoolStates } from "../state/pool-state.js";
import { assessFiltered } from "./assessment.js";
import { rawCandidateRange } from "./candidate-set.js";
import { FEE_TOLERANCE_ZAT, LINK_WINDOW_BLOCKS, MAX_LINK_WINDOW_MS } from "./constants.js";
import { matchEcho, type BoundaryEvent } from "./echo.js";
import { amountMatchFilter, timeWindowFilter, type Filter } from "./scoring.js";

interface ShieldingDeposit {
  readonly txid: Hex;
  readonly senderAddress: string | null;
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: ShieldedPool;
  /**
   * The deposit's output commitments in this pool, by id (HANDOFF-12). They
   * are what lets the amount-match filter find the deposit IN THE TREE once it
   * confirms: a mempool report's `tipHeightAtSeen` is the tip when it was
   * seen, never the height it confirmed at, and a filter given that height
   * would look for the deposit's commitments in a block that does not hold
   * them and narrow the candidate set to nothing - a false disclosure claim.
   */
  readonly commitments: ReadonlyArray<Hex>;
}

interface UnshieldingWithdrawal {
  readonly txid: Hex;
  readonly recipientAddress: string | null;
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: ShieldedPool;
  /** The anchor the withdrawal's spend in this pool cites, or null when the report carries no such spend. */
  readonly anchorRoot: Hex | null;
}

export interface RoundTripIndexConfig {
  /** Match window in ms. Defaults to MAX_LINK_WINDOW_MS (7 days). */
  readonly windowMs?: number;
  /** Fee tolerance for fee-tolerant amount matching. Defaults to FEE_TOLERANCE_ZAT. */
  readonly feeToleranceZat?: bigint;
  /** Injectable clock for deterministic pruning in tests. Defaults to Date.now. */
  readonly now?: () => number;
  /**
   * The chain state to assess links against (HANDOFF-12, A3). A GETTER rather
   * than a value, because the confirmed-block driver replaces the state object
   * on a reorg; the index reads the current one for each link it makes. Absent
   * means no link carries an assessment, which is what every caller before
   * HANDOFF-12 got.
   */
  readonly chainState?: () => PoolStates | undefined;
  /** The time-window filter's width in blocks. Defaults to LINK_WINDOW_BLOCKS, which is `windowMs` in blocks. */
  readonly windowBlocks?: number;
}

export class RoundTripIndex {
  private deposits: ShieldingDeposit[] = [];
  private withdrawals: UnshieldingWithdrawal[] = [];
  private readonly windowMs: number;
  private readonly feeToleranceZat: bigint;
  private readonly now: () => number;
  private readonly chainState: (() => PoolStates | undefined) | undefined;
  private readonly windowBlocks: number;

  constructor(config?: RoundTripIndexConfig) {
    this.windowMs = config?.windowMs ?? MAX_LINK_WINDOW_MS;
    this.feeToleranceZat = config?.feeToleranceZat ?? FEE_TOLERANCE_ZAT;
    this.now = config?.now ?? Date.now;
    this.chainState = config?.chainState;
    this.windowBlocks = config?.windowBlocks ?? LINK_WINDOW_BLOCKS;
  }

  /**
   * Ingest a LeakReport: prune expired entries (using the injected clock),
   * record the report's deposit and/or withdrawal contribution, match
   * any new withdrawals against in-window deposits, and return the
   * resulting LinkRecords (which the caller assigns onto report.links).
   *
   * A report with no transparent side contributes NOTHING, however much value
   * it moved between pools. See the wide rule below.
   */
  ingest(report: LeakReport): LinkRecord[] {
    this.prune(this.now());

    const hits: LinkRecord[] = [];

    // FOUR POOLS, DRIVEN OFF `valueFlow.perPoolZat` RATHER THAN TWO NAMED
    // FIELDS. This used to read `bundle.saplingValueBalanceZat` and
    // `bundle.orchardValueBalanceZat` by name, in two hand-unrolled copies of
    // the same block, so a Sprout or Ironwood turnstile movement was invisible
    // to round-trip detection - no error, no warning, simply no links. Reading
    // the single list the analyser builds means a pool becomes visible here the
    // moment it becomes visible there, with no second place to remember.
    //
    // Sign convention, as everywhere: negative is value ENTERING the pool (a
    // shielding deposit), positive is value LEAVING it (an unshielding
    // withdrawal).
    // THE WIDE RULE (HANDOFF-08 deliverable 2, LEDGER-07 Q1). A deposit requires
    // a transparent INPUT and a withdrawal a transparent OUTPUT, and without
    // those two guards this index manufactured high-visibility links between
    // unrelated wallets.
    //
    // The mechanism, reproduced end to end on committed code by HANDOFF-07: a
    // pool-to-pool crossing is neither a deposit nor a withdrawal - it did not
    // come from the transparent side and it did not go there - but the loop
    // below read every `perPoolZat` leg as one or the other. One migration's
    // ARRIVING leg was filed as a deposit, a later unrelated migration's
    // DEPARTING leg matched it on amount, and out came a `LinkRecord` whose two
    // address fields were both `null`, because no transparent end existed. The
    // `LinkRecord` shape was the type system saying so and nobody was reading it.
    //
    // ZIP 318 IS WHY THIS IS URGENT RATHER THAN TIDY. Quantising migration
    // amounts to `n x 10^k` is the entire scheme, so two unrelated migrations of
    // the same denomination are the EXPECTED case once Ironwood is live, not a
    // coincidence. The defect's rate goes up with adoption.
    //
    // WHY THE WIDE RULE AND NOT THE NARROW ONE. The narrow guard considered -
    // skip a report whose `perPoolZat` both gained and lost - is a symptom
    // filter: it catches migrations because migrations happen to have that
    // shape, and it would keep admitting any future one-sided pool crossing. A
    // round-trip is a claim about value entering and leaving the TRANSPARENT
    // side, so requiring a transparent side is the definition rather than a
    // heuristic about it.
    const hasTransparentSource = report.transparent.vin.some((v) => !v.coinbase);
    const hasTransparentSink = report.transparent.vout.length > 0;

    for (const { pool, deltaZat } of report.valueFlow.perPoolZat) {
      if (deltaZat < 0n) {
        if (!hasTransparentSource) continue;
        this.deposits.push({
          txid: report.txid,
          senderAddress: report.identity.sender.transparentAddresses[0] ?? null,
          amountZat: -deltaZat,
          seenAt: report.seenAt,
          height: report.tipHeightAtSeen,
          pool,
          commitments: report.outputs.filter((o) => o.pool === pool).map((o) => o.commitment),
        });
      } else if (deltaZat > 0n) {
        if (!hasTransparentSink) continue;
        const w: UnshieldingWithdrawal = {
          txid: report.txid,
          recipientAddress:
            report.identity.recipient.transparentAddresses[0] ?? null,
          amountZat: deltaZat,
          seenAt: report.seenAt,
          height: report.tipHeightAtSeen,
          pool,
          anchorRoot: report.spends.find((s) => s.pool === pool)?.anchor ?? null,
        };
        this.withdrawals.push(w);
        hits.push(...this.matchWithdrawal(w));
      }
    }

    return hits;
  }

  private matchWithdrawal(w: UnshieldingWithdrawal): LinkRecord[] {
    const exactCandidates: ShieldingDeposit[] = [];
    const feeTolerantCandidates: ShieldingDeposit[] = [];

    for (const d of this.deposits) {
      if (d.seenAt >= w.seenAt) continue;
      const delta = w.seenAt - d.seenAt;
      if (delta > this.windowMs) continue;

      if (d.amountZat === w.amountZat) {
        exactCandidates.push(d);
      } else {
        const diff =
          d.amountZat > w.amountZat
            ? d.amountZat - w.amountZat
            : w.amountZat - d.amountZat;
        if (diff <= this.feeToleranceZat) {
          feeTolerantCandidates.push(d);
        }
      }
    }

    const out: LinkRecord[] = [];

    for (const d of exactCandidates) {
      const assessment = this.assessLink(w, d, "EXACT");
      out.push({
        shieldingTxid: d.txid,
        unshieldingTxid: w.txid,
        senderAddress: d.senderAddress,
        recipientAddress: w.recipientAddress,
        amountZat: w.amountZat,
        timeDeltaMs: w.seenAt - d.seenAt,
        matchKind: "EXACT",
        poolPath: poolPath(d.pool, w.pool),
        confidence: exactCandidates.length === 1 ? "HIGH" : "MEDIUM",
        // POPULATED SINCE HANDOFF-12, when the index has a chain state; see
        // `assessLink`. Spread rather than assigned so an absent assessment is
        // absent, not `undefined`, on the wire.
        ...(assessment === undefined ? {} : { assessment }),
      });
    }

    if (out.length === 0) {
      for (const d of feeTolerantCandidates) {
        const assessment = this.assessLink(w, d, "FEE_TOLERANT");
        out.push({
          shieldingTxid: d.txid,
          unshieldingTxid: w.txid,
          senderAddress: d.senderAddress,
          recipientAddress: w.recipientAddress,
          amountZat: w.amountZat,
          timeDeltaMs: w.seenAt - d.seenAt,
          matchKind: "FEE_TOLERANT",
          poolPath: poolPath(d.pool, w.pool),
          confidence: feeTolerantCandidates.length === 1 ? "MEDIUM" : "LOW",
          ...(assessment === undefined ? {} : { assessment }),
        });
      }
    }

    return out;
  }

  /**
   * The claim assessment for one link: the withdrawal's spend's Cand_0,
   * narrowed by `timeWindowFilter`, then by `amountMatchFilter` once the
   * matched deposit's commitments are in the tree, with the HANDOFF-08 echo's
   * audit record appended when the echo estimator matched the same pair
   * (HANDOFF-12, section 3).
   *
   * THE AMOUNT MATCH RUNS ONLY AGAINST A CONFIRMED DEPOSIT, AND THE HEIGHT IT
   * RUNS AT IS THE TREE'S, NOT THE MEMPOOL'S. `amountMatchFilter` intersects
   * the range with the commitment positions the deposit's BLOCK contributed,
   * so it needs the height the deposit confirmed at. The index holds mempool
   * reports, whose `tipHeightAtSeen` is the tip when the report was seen and
   * never the height the deposit landed in; handing that to the filter would
   * find no commitments at that height and narrow Cand_0 to nothing - a
   * `requires_disclosure` manufactured from a wrong clock. So the deposit's
   * own output commitments are looked up in the tree by id, and the filter is
   * given the height they were appended at; a deposit not yet in the tree
   * gets the time window alone, which is the honest narrower claim.
   *
   * THE POSTERIOR IS NOT ATTACHED. `computePosterior` yields a distribution
   * over deposit candidates - `top`, a real-valued effective set, a claim -
   * and `LinkRecord` has no field for it: `ClaimAssessment.effectiveSetSize`
   * is a bigint count of commitment positions, a different set. Widening a
   * shared wire type for a value nothing renders yet is the shape CLAUDE.md
   * warns about, and it is recorded in the ledger as the question it is.
   */
  private assessLink(
    w: UnshieldingWithdrawal,
    d: ShieldingDeposit,
    matchKind: "EXACT" | "FEE_TOLERANT",
  ): ClaimAssessment | undefined {
    const states = this.chainState?.();
    if (states === undefined || w.anchorRoot === null) return undefined;
    const filters: FilterBuilder = <P extends Pool>(state: PoolState<P>): Filter<P>[] => {
      const out: Filter<P>[] = [timeWindowFilter<P>({ windowBlocks: this.windowBlocks })];
      const confirmed = d.commitments.map((c) => state.commitments.byCmId(c)).find((c) => c !== undefined);
      if (confirmed !== undefined) {
        out.push(
          amountMatchFilter<P>({
            matchedDepositTxid: d.txid,
            matchedDepositHeight: confirmed.height,
            matchedDepositAmountZat: d.amountZat,
            withdrawalAmountZat: w.amountZat,
            toleranceZat: this.feeToleranceZat,
            matchKind,
          }),
        );
      }
      return out;
    };
    const assessment = assessOver(w.pool, w.anchorRoot, states, filters);
    if (assessment === null) return undefined;

    // The echo module, over the same window the index matched in. Its audit
    // is appended only when it matched THIS pair, so the inference chain
    // carries the grade the shipped estimator gives the link.
    const echo = matchEcho(
      toEvent(w, w.recipientAddress),
      this.deposits.filter((x) => x.pool === w.pool).map((x) => toEvent(x, x.senderAddress)),
      { windowMs: this.windowMs, feeToleranceZat: this.feeToleranceZat },
    ).find((m) => m.depositTxids.includes(d.txid));
    return echo === undefined ? assessment : { ...assessment, appliedFilters: [...assessment.appliedFilters, echo.audit] };
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.deposits = this.deposits.filter((d) => d.seenAt >= cutoff);
    this.withdrawals = this.withdrawals.filter((w) => w.seenAt >= cutoff);
  }

  /** Diagnostic snapshot. windowMs reflects the effective configured value. */
  snapshot(): {
    readonly depositCount: number;
    readonly withdrawalCount: number;
    readonly windowMs: number;
  } {
    return {
      depositCount: this.deposits.length,
      withdrawalCount: this.withdrawals.length,
      windowMs: this.windowMs,
    };
  }
}

/**
 * The label for a link between two pools.
 *
 * NO CAST. This used to end `as LinkRecord["poolPath"]`, because the field was
 * a hand-enumerated union of the two-pool era - four members, none of them
 * `orchard->ironwood`. The assertion was what let a path outside the union be
 * stamped as inside it with no diagnostic, and it would have hidden exactly the
 * omission it was written around. `PoolPath` is now derived from `ShieldedPool`
 * as a template type, so the template expression below satisfies it by
 * construction and cannot fall behind the union.
 */
function poolPath(fromPool: ShieldedPool, toPool: ShieldedPool): PoolPath {
  if (fromPool === toPool) return fromPool;
  return `${fromPool}→${toPool}`;
}

/** A deposit or withdrawal as the echo estimator reads it. */
function toEvent(
  e: { txid: Hex; amountZat: Zatoshi; seenAt: number; height: number; pool: ShieldedPool },
  address: string | null,
): BoundaryEvent {
  return { txid: e.txid, amountZat: e.amountZat, seenAt: e.seenAt, height: e.height, pool: e.pool, address };
}

/**
 * A filter stack built for whichever pool's state it is handed. Generic in the
 * pool rather than fixed to `ShieldedPool`, so `assessOver` can hand it the
 * narrowed `PoolState<P>` and get back `Filter<P>[]` with no cast between the
 * union and the member - the cast this replaced was the compiler saying the
 * two did not overlap, and it was right.
 */
type FilterBuilder = <P extends Pool>(state: PoolState<P>) => Filter<P>[];

/**
 * `assessFiltered` over one pool's state with the generic narrowed per pool.
 * `null` when the anchor is unknown to the state - the same condition under
 * which a spend gets no assessment and an `UNKNOWN_ANCHOR` finding.
 */
function assessOver(
  pool: ShieldedPool,
  anchorRoot: Hex,
  states: PoolStates,
  filters: FilterBuilder,
): ClaimAssessment | null {
  const over = <P extends Pool>(p: P, state: PoolState<P>): ClaimAssessment<P> | null => {
    const anchor = state.anchors.getByRoot(anchorRoot);
    const range = rawCandidateRange(p, anchorRoot, state);
    if (anchor === null || range === null) return null;
    return assessFiltered(range, anchor, state, filters(state));
  };
  switch (pool) {
    case "sprout":
      return over("sprout", states.sprout);
    case "sapling":
      return over("sapling", states.sapling);
    case "orchard":
      return over("orchard", states.orchard);
    case "ironwood":
      return over("ironwood", states.ironwood);
  }
}
