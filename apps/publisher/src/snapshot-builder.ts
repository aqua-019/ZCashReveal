/**
 * Assemble a `SnapshotV1` from one tip's inputs (HANDOFF-09 section 3,
 * docs/2.0/SNAPSHOT.md section 8).
 *
 * PURE. NO I/O, NO CLOCK, NO MUTATION OF THE INPUT ARRAYS. Both halves matter
 * and the second is the one that bites: `publishedAt` is a timestamp this
 * function must not read from a clock, so it arrives as `publishedAtMs`. A
 * builder that called `Date.now()` would produce a different document on every
 * call for the same block, and the assertion that a snapshot round-trips through
 * `serializeSnapshot` and `snapshotV1Schema` would be pinning a moving target.
 *
 * EVERY PANEL IS NULLABLE AND A NULL IS AN ABSENCE, NOT A ZERO. SNAPSHOT.md
 * section 8.1 states the rule and this is its enforcement: an instrument that is
 * not wired, a window with no data, a supply figure the node did not report -
 * each of those produces `null` for its panel rather than a zero. The four
 * fields that are NOT nullable are `schema`, `height`, `hash` and `time`,
 * because a document that cannot say which block it describes is not a snapshot,
 * and a page rendering it would print numbers with no height beside them.
 *
 * THE FIVE LANE SHARES ARE OF THE LANES' OWN TOTAL, AND THAT IS A DIFFERENT
 * DENOMINATOR FROM `residual.supplyZat`. The shares are what a `/pools` bar
 * chart reads, so they have to sum to 1; the supply figure is a separate
 * measurement with a separate source string, and the two differ by whatever the
 * node accounts for outside these five lanes - the ZIP 271 lockbox above all,
 * which `apps/gateway/src/views/pools.ts` also carries separately because it is
 * "the protocol's own reserve, not a lane value moves along". Dividing the lanes
 * by the supply would give five shares that visibly do not sum to one, and a
 * reader would have no way to tell that from an arithmetic fault.
 */

import {
  SNAPSHOT_MAX_REPORTS,
  SNAPSHOT_SCHEMA_VERSION,
  type LedgerLane,
  type MempoolRow,
  type Pool,
  type SnapshotDrain,
  type SnapshotLane,
  type SnapshotMigrationHist,
  type SnapshotNeffSeries,
  type SnapshotResidual,
  type SnapshotV1,
} from "@zcashreveal/types";

import type { Crossing, Instruments, IronwoodSpend, PoolBalanceSample } from "./instruments.js";

/** One lane's balance as the caller read it from the node. */
export interface LaneBalance {
  readonly lane: LedgerLane;
  readonly balanceZat: bigint;
}

/** A height range, inclusive at both ends. */
export interface HeightWindow {
  readonly lowHeight: number;
  readonly highHeight: number;
}

/** Everything one publish needs, already read from the world. */
export interface SnapshotInputs {
  readonly height: number;
  /** The block hash: 64 lowercase hex characters, no `0x`. */
  readonly hash: string;
  /** The BLOCK's own timestamp, milliseconds since epoch. Never the publish time. */
  readonly timeMs: number;
  /** When this publish happened, milliseconds since epoch. Supplied, never read from a clock here. */
  readonly publishedAtMs: number;

  /** The five site lanes, as read from `valuePools`. The lockbox is not one of them. */
  readonly lanes: ReadonlyArray<LaneBalance>;

  /**
   * `Supply_h`, or null when the node did not report one.
   *
   * Null suppresses the whole residual panel rather than substituting the lane
   * total: `U/Supply` computed against a denominator the caller did not ask for
   * is a different number wearing the same label, and plan section 3.2 requires
   * the supply's SOURCE to be published beside it for exactly that reason.
   */
  readonly supplyZat: bigint | null;
  /** Free text naming where `supplyZat` came from. Never empty when `supplyZat` is present. */
  readonly supplySource: string;

  /** Per-pool shielded balances at this height, for the residual. */
  readonly poolBalances: Readonly<Partial<Record<Pool, bigint>>>;

  /** Orchard balance samples, for the drain and its two velocities. */
  readonly orchardSeries: ReadonlyArray<PoolBalanceSample>;
  /** The drain's denominator. Null suppresses the drain panel. */
  readonly drainBaseline: { readonly height: number; readonly zat: bigint } | null;

  /** Orchard to Ironwood crossings the migration lens reads. */
  readonly crossings: ReadonlyArray<Crossing>;
  /** The window the lens reports over. Null suppresses the panel. */
  readonly migrationWindow: HeightWindow | null;

  /** Ironwood spends the N_eff series is computed over. Null suppresses the panel. */
  readonly ironwoodSpends: ReadonlyArray<IronwoodSpend> | null;
  /**
   * The birth height, the window, and how many spends were SEEN in it.
   *
   * `spendsInWindow` is the population before anchor resolution, so the panel
   * can publish it beside the count it actually measured. Null suppresses the
   * panel.
   */
  readonly ironwoodWindow:
    | (HeightWindow & { readonly birthHeight: number; readonly spendsInWindow: number })
    | null;

  /** Mempool rows, any order. Trimmed to `SNAPSHOT_MAX_REPORTS`, newest first. */
  readonly lastReports: ReadonlyArray<MempoolRow>;
  /** Which `packages/content` labels build produced any label a page renders. */
  readonly labelsVersion: string;
}

/** 64 lowercase hex characters, which is what `txidSchema` accepts for a block hash. */
const BLOCK_HASH = /^[0-9a-f]{64}$/;

/**
 * A ratio of two zatoshi amounts as a float in [0, 1].
 *
 * SCALED IN `bigint` BEFORE THE DIVISION, the same way
 * `@zcashreveal/instruments`' `turnstile-accounting.ts` does it. Converting both sides with
 * `Number()` first is correct for every balance this chain can hold and stops
 * being correct the moment somebody reuses the helper for something larger; the
 * scaled form has no such edge and costs nothing.
 */
const RATIO_SCALE = 10n ** 12n;
function ratioToNumber(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) return 0;
  const scaled = (numerator * RATIO_SCALE) / denominator;
  return Number(scaled) / Number(RATIO_SCALE);
}

/** ISO 8601 UTC, which is what `z.string().datetime()` accepts. */
function isoOf(ms: number, field: string): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`buildSnapshot: ${field} is ${ms}, which is not a timestamp`);
  }
  return new Date(ms).toISOString();
}

/**
 * The five lanes with their shares.
 *
 * @throws RangeError on a negative lane balance. ZIP 209 makes non-negativity a
 * consensus invariant, so a negative here is our decoder being wrong and never
 * the chain - the same reading `turnstileResidual` and `ValuePool` take. The
 * alternative is publishing a negative share, which renders as a bar pointing
 * the wrong way with nothing to say why.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function lanesWithShares(lanes: ReadonlyArray<LaneBalance>): SnapshotLane[] {
  let total = 0n;
  for (const l of lanes) {
    if (l.balanceZat < 0n) {
      throw new RangeError(
        `buildSnapshot: lane ${l.lane} has a negative balance (${l.balanceZat} zat). ` +
          "ZIP 209 requires Bal >= 0, so this is our replay being wrong, never the chain.",
      );
    }
    total += l.balanceZat;
  }
  return lanes.map((l) => ({
    lane: l.lane,
    balanceZat: l.balanceZat,
    share: ratioToNumber(l.balanceZat, total),
  }));
}

/**
 * The most recent rows, newest first, capped at `SNAPSHOT_MAX_REPORTS`.
 *
 * SORTS A COPY. `mempoolRowSchema` carries `ageSeconds`, so "newest" is the
 * smallest age; the caller's array is not assumed to be ordered and is not
 * reordered either, because a builder that sorted its argument in place would
 * have mutated an input the caller may still be reading.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function newestReports(rows: ReadonlyArray<MempoolRow>): MempoolRow[] {
  return [...rows]
    .sort((a, b) => a.ageSeconds - b.ageSeconds)
    .slice(0, SNAPSHOT_MAX_REPORTS);
}

/**
 * Build the document.
 *
 * @throws RangeError if `hash` is not 64 lowercase hex characters, if a
 * timestamp is not finite, or if a lane balance is negative. Each of those is a
 * contradiction in the inputs rather than an unusual reading, and the publisher
 * catches the throw, logs it and publishes nothing for that tip - which is
 * correct, because the alternative is a document that names the wrong block.
 *
 * Pure. No I/O, no clock, no mutation of the input arrays.
 */
/**
 * Told when one panel's estimator refused its inputs. The caller logs it.
 *
 * @param panel one of `residual`, `drain`, `migrationHist`, `neffSeries`
 * @param err whatever the estimator threw
 */
export type PanelFault = (panel: string, err: unknown) => void;

/*
 * NOTE ON THE DOCBLOCK ABOVE `buildSnapshot`, WHICH IS BELOW THIS TYPE. Gate
 * round 2 inserted `PanelFault` and `panelOrNull` between that block and the
 * function it documents, so for one commit the module's principal export had no
 * doc comment and the block dangled over a type alias. Restored below, with the
 * purity claim corrected: `buildSnapshot` is still pure in the sense the header
 * means - no I/O, no clock, no mutation of its inputs - but it now CALLS a sink
 * the caller supplies, so it is pure only when `onPanelFault` is.
 */

/**
 * One panel, or a stated absence when its estimator refuses its inputs.
 *
 * WHY A PANEL'S REFUSAL MUST NOT COST THE DOCUMENT (gate round 1, H1). The
 * estimators throw on contradictory input, and that is CORRECT - each throw is a
 * refusal to publish a number the inputs do not support. What was not correct is
 * that the throw escaped `buildSnapshot`, so `SnapshotPublisher` caught it as a
 * build failure and published NOTHING for that tip: not a missing panel, no
 * document at all, so `pools`, `residual` and `lastReports` went with it.
 *
 * The worked case is a live one and needs no unusual input. `migrations_zip318`
 * is `CHECK (amount_zat >= 0)` and `migrationLens` refuses `amountZat <= 0n`, so
 * a single zero-amount row - which that table permits - poisoned every tip whose
 * 1,152-block window contained it: about a day of the public site frozen at a
 * stale height while the log said `build_failed`. `chain-inputs.ts` already
 * states this exact trade for the same panel - "losing one panel is a smaller
 * failure than losing the document that carries the other four" - and this is
 * that sentence applied to the estimator as well as to the query.
 *
 * A `null` is `SnapshotV1`'s "not measured" (SNAPSHOT.md section 8.1), which is
 * precisely the honest thing to say about a panel whose estimator would not
 * accept its inputs. The fault is not swallowed: `onFault` carries it to the
 * caller's log, so an absence always has a reason recorded beside it.
 *
 * IT CATCHES A PROGRAMMING ERROR TOO, and that is worth saying because the
 * paragraphs above frame the catch as a refusal. A `TypeError` inside an
 * estimator becomes a null panel and a logged fault, not a crash. In production
 * the composition root logs it with the height and the stack, so it is loud; in
 * a two-argument call it is not, which is what the assertions that pass a spy
 * are for. The trade is deliberate: a bug in one estimator costing one panel is
 * better than a bug in one estimator costing every document until someone
 * notices, and it is the same trade the paragraph above makes for a refusal.
 */
function panelOrNull<T>(panel: string, build: () => T, onFault: PanelFault): T | null {
  try {
    return build();
  } catch (err) {
    // A BROKEN SINK IS NOT WORTH THE DOCUMENT IT WOULD COST (gate round 3).
    // Identical shape and identical reason to `readSnapshotInputs`' `fault`
    // wrapper, which gained this guard one round earlier and at one of the TWO
    // sites that needed it: this call is INSIDE a `catch`, so a throw here
    // escapes `buildSnapshot` entirely and the tip publishes nothing - the exact
    // whole-document loss `panelOrNull` exists to prevent. In production both
    // sinks are the same pino `log.error`, so one broken logger reached both.
    //
    // `void` does not forbid an async sink - TypeScript's void-return
    // assignability admits `Promise<void>` - and a rejected promise escapes a
    // `catch`, so both halves are caught.
    try {
      void Promise.resolve(onFault(panel, err)).catch(() => undefined);
    } catch {
      /* intentionally empty */
    }
    return null;
  }
}

/** The default fault sink: none. Tests that care pass a spy. */
const IGNORE_FAULT: PanelFault = () => {};

export function buildSnapshot(
  inputs: SnapshotInputs,
  instruments: Instruments,
  onPanelFault: PanelFault = IGNORE_FAULT,
): SnapshotV1 {
  if (!BLOCK_HASH.test(inputs.hash)) {
    throw new RangeError(
      `buildSnapshot: ${JSON.stringify(inputs.hash)} is not a block hash. ` +
        "Sixty-four lowercase hex characters, no 0x - a snapshot that names the wrong block is worse than no snapshot.",
    );
  }

  return {
    schema: SNAPSHOT_SCHEMA_VERSION,
    height: inputs.height,
    hash: inputs.hash,
    time: isoOf(inputs.timeMs, "timeMs"),
    publishedAt: isoOf(inputs.publishedAtMs, "publishedAtMs"),
    pools: lanesWithShares(inputs.lanes),
    residual: panelOrNull("residual", () => buildResidual(inputs, instruments), onPanelFault),
    drain: panelOrNull("drain", () => buildDrain(inputs, instruments), onPanelFault),
    migrationHist: panelOrNull("migrationHist", () => buildMigrationHist(inputs, instruments), onPanelFault),
    neffSeries: panelOrNull("neffSeries", () => buildNeffSeries(inputs, instruments), onPanelFault),
    lastReports: newestReports(inputs.lastReports),
    labelsVersion: inputs.labelsVersion,
  };
}

/** Plan section 3.2. Null when the instrument is not wired or the supply is unknown. */
function buildResidual(inputs: SnapshotInputs, instruments: Instruments): SnapshotResidual | null {
  const fn = instruments.turnstileResidual;
  if (fn === null || inputs.supplyZat === null) return null;
  const r = fn(inputs.poolBalances, inputs.supplyZat);
  return {
    unprovableZat: r.unprovableZat,
    supplyZat: r.supplyZat,
    supplySource: inputs.supplySource,
    unprovableShare: r.unprovableShare,
    verifiedShare: r.verifiedShare,
  };
}

/**
 * Plan section 3.3. Null when the instrument is not wired or no baseline is known.
 *
 * THE VELOCITIES ARE COPIED THROUGH AND NEVER SUBSTITUTED. `orchardDrain`
 * answers `null` for a window that admitted fewer than two samples, and
 * `snapshotDrainSchema` records why that null must survive: "a velocity from two
 * samples and a velocity from a thousand print identically", and a zero here
 * would render as "the drain has stopped".
 */
function buildDrain(inputs: SnapshotInputs, instruments: Instruments): SnapshotDrain | null {
  const fn = instruments.orchardDrain;
  const baseline = inputs.drainBaseline;
  if (fn === null || baseline === null) return null;
  const d = fn(inputs.orchardSeries, {
    baselineHeight: baseline.height,
    baselineZat: baseline.zat,
    atHeight: inputs.height,
  });
  // `drained` OUTSIDE [0, 1] IS REFUSED RATHER THAN PUBLISHED OR CLAMPED (gate
  // round 1, M3). `snapshotDrainSchema` bounds it, and a baseline below the
  // current balance produces a negative one - which does NOT throw, so it would
  // reach `serializeSnapshot` (a bare `JSON.stringify`, validating nothing), be
  // written to the file sink AND to the SHARED managed store, and die later in
  // the gateway's `safeParse` taking every other panel with it, while this
  // process logged `snapshot published`. Null is the honest outcome: the drain
  // was not measured. Never a clamp - a clamped 0 is a fabricated measurement,
  // and SNAPSHOT.md section 8.1's rule is that a zero renders as one.
  if (!Number.isFinite(d.drained) || d.drained < 0 || d.drained > 1) {
    throw new RangeError(
      `buildDrain: drained = ${d.drained} is outside [0, 1], which snapshotDrainSchema forbids. ` +
        "A baseline below the current balance produces this; publishing it would put an invalid " +
        "document in a store shared with another project.",
    );
  }

  return {
    pool: d.pool,
    baselineHeight: d.baselineHeight,
    baselineZat: d.baselineZat,
    currentZat: d.currentZat,
    drained: d.drained,
    velocity24hZecPerHour: d.velocity24hZecPerHour,
    velocity7dZecPerHour: d.velocity7dZecPerHour,
    sampleCount: d.sampleCount,
  };
}

/**
 * Plan section 3.4 / TRACKING-MATH section 3.9. Null when not wired or no window.
 *
 * `overCapCount` AND `audit` ARE DROPPED HERE AND THAT IS THE SCHEMA'S DECISION,
 * NOT A LOSS THIS FUNCTION CHOSE. `snapshotMigrationHistSchema` carries neither:
 * the audit record belongs to the inference chain the gateway renders, and it is
 * not what a public snapshot is for. `nonCanonicalCount` survives and is the
 * measurement a reader needs - `zip318.ts`'s rule is that an over-cap crossing is
 * "a finding, never a rejection", and it is counted, not dropped, upstream.
 */
function buildMigrationHist(
  inputs: SnapshotInputs,
  instruments: Instruments,
): SnapshotMigrationHist | null {
  const fn = instruments.migrationLens;
  const window = inputs.migrationWindow;
  if (fn === null || window === null) return null;
  const m = fn(inputs.crossings, {
    lowHeight: window.lowHeight,
    highHeight: window.highHeight,
  });
  return {
    lowHeight: m.lowHeight,
    highHeight: m.highHeight,
    buckets: m.buckets.map((b) => ({
      n: b.n,
      kZatoshi: b.kZatoshi,
      kZec: b.kZec,
      count: b.count,
      sumZat: b.sumZat,
    })),
    canonicalCount: m.canonicalCount,
    nonCanonicalCount: m.nonCanonicalCount,
    sumZat: m.sumZat,
    strandedDustZat: m.strandedDustZat,
    minNotes: m.minNotes,
    maxWallets: m.maxWallets,
    denominationRuns: m.denominationRuns,
  };
}

/** Plan section 3.5. Null when the instrument is not wired or there are no spends to read. */
function buildNeffSeries(
  inputs: SnapshotInputs,
  instruments: Instruments,
): SnapshotNeffSeries | null {
  const fn = instruments.ironwoodBirth;
  const window = inputs.ironwoodWindow;
  const spends = inputs.ironwoodSpends;
  if (fn === null || window === null || spends === null) return null;
  const b = fn(spends, {
    birthHeight: window.birthHeight,
    lowHeight: window.lowHeight,
    highHeight: window.highHeight,
  });
  // REFUSED AT THE PRODUCER, NOT ONLY AT THE SCHEMA - the trade `buildDrain`
  // makes for `drained`, applied to the invariant gate round 3 added here and
  // missed by the commit that added it (gate round 4). `snapshotNeffSeriesSchema`
  // refines `windowSpendCount >= spendCount`, `serializeSnapshot` is a bare
  // `JSON.stringify` that validates nothing, and the gateway's `safeParse`
  // rejects the WHOLE document - so an inverted pair costs `pools`, `residual`
  // and `lastReports` as well, while this process logs `snapshot published`.
  // Reproduced by the round-4 reviewer: `spendsInWindow: 1` against two admitted
  // spends published cleanly and came back from `readSnapshotFile` as
  // `{ ok: false, reason: "invalid" }`.
  //
  // Structurally the production path maintains it - `spendsInWindow` is
  // `rows.length` and both `ironwoodSpendsFromRows` and `ironwoodBirth` only
  // narrow - and that is exactly the argument a schema-only constraint rests on.
  // A producer bug is the case the refine was added for, so it is the case the
  // producer must refuse.
  if (window.spendsInWindow < b.spendCount) {
    throw new RangeError(
      `buildNeffSeries: windowSpendCount = ${window.spendsInWindow} is smaller than spendCount = ` +
        `${b.spendCount}, which snapshotNeffSeriesSchema forbids. Publishing it would put an ` +
        "invalid document in a store shared with another project.",
    );
  }
  return {
    birthHeight: b.birthHeight,
    series: b.series.map((p) => ({
      height: p.height,
      candidateCount: p.candidateCount,
      nEff: p.nEff,
      claimLevel: p.claimLevel,
    })),
    spendCount: b.spendCount,
    // THE POPULATION THE SHARES ARE NOT OVER. `ironwoodBirth` measures the
    // spends it could bound; this is how many there were. Publishing only the
    // first made a window where four of five anchors did not resolve read as
    // "100 per cent require disclosure" (gate round 2).
    windowSpendCount: window.spendsInWindow,
    shares: {
      aggregate_only: b.shares.aggregate_only,
      broad_candidate_set: b.shares.broad_candidate_set,
      small_heuristic_set: b.shares.small_heuristic_set,
      requires_disclosure: b.shares.requires_disclosure,
    },
  };
}
