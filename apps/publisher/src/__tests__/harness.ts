/**
 * Fixtures and spies the assertion suites share.
 *
 * THE SPY IS THE POINT OF A10 AND A11. Both assertions are about what this
 * process SENDS to a store shared with another production project, and
 * docs/2.0/SNAPSHOT.md section 5 says why they are counted rather than read:
 * "counting commands is the only honest way to assert 'exactly three'". So
 * {@link SpyManagedStore} records every call the sink makes and the suites
 * assert over the recording - never over the source.
 *
 * THE INSTRUMENT STAND-INS ARE STAND-INS AND ARE LABELLED AS SUCH. `apps/publisher`
 * cannot depend on `apps/indexer` (see `instruments.ts`), so the three estimators
 * arrive as injected functions and these fixtures are what a test injects. They
 * are NOT reimplementations to be trusted: each returns a literal, so a suite
 * that asserts on a published panel is asserting that the BUILDER carried the
 * number through, which is the only thing the builder is responsible for.
 */

import { asHex, serializeSnapshot, type MempoolRow, type SnapshotV1 } from "@zcashreveal/types";

import type { Instruments } from "../instruments.js";
import type { BuiltSnapshot, Tip } from "../publisher.js";
import { buildSnapshot, type SnapshotInputs } from "../snapshot-builder.js";
import type { SnapshotStore, SnapshotTransaction } from "../sinks/redis.js";

export const ZAT_PER_ZEC = 100_000_000n;

/**
 * The fixture chain's clock: 30 August 2026, 12:00 UTC.
 *
 * BLOCK TIMES ARE DERIVED FROM `height % 1000`, NOT FROM THE HEIGHT ITSELF, and
 * the reason is worth recording because the first version of this file did the
 * naive thing. `BASE + height * 75_000` for a mainnet height near 3,800,000 is
 * about nine YEARS of milliseconds, so every fixture tip carried a block time in
 * 2035 - which is harmless for the two ISO strings on the document and is not
 * harmless for the monthly counter, whose month key is taken from the tip's own
 * block time. A budget test then rolled into a new month on its first charge and
 * reset the count it was asserting on.
 */
export const FIXTURE_BASE_MS = Date.UTC(2026, 7, 30, 12, 0, 0);

/** A plausible block time for a fixture height, inside one month. */
export function fixtureTimeMs(height: number): number {
  return FIXTURE_BASE_MS + (height % 1_000) * 75_000;
}

/** A 64-character lowercase hex block hash, distinct per height. */
export function hashFor(height: number): string {
  return height.toString(16).padStart(64, "0");
}

/** One call the sink made against the store. */
export interface StoreCall {
  readonly key: string;
  readonly value: string;
  readonly mode?: "EX";
  readonly seconds?: number;
}

/**
 * A counting stand-in for the managed store.
 *
 * IT RECORDS AND IT DOES NOT PRETEND TO BE REDIS. There is no keyspace here and
 * nothing is readable back: the assertions are about what was SENT, and a spy
 * that also stored values would invite a suite to assert on its own bookkeeping
 * instead of on the wire.
 */
export class SpyManagedStore implements SnapshotStore {
  readonly calls: StoreCall[] = [];
  /** How many transactions were opened. One per publish, per section 8.6. */
  transactions = 0;
  /** How many transactions were executed. */
  execs = 0;
  quits = 0;
  /** When set, `exec` rejects with it - the A7 fail-side and sink-failure path. */
  failWith: Error | null = null;

  multi(): SnapshotTransaction {
    this.transactions += 1;
    // Arrows rather than `const self = this`: they capture the instance
    // lexically, which is the same effect without the alias eslint refuses.
    const chain: SnapshotTransaction = {
      set: (key: string, value: string, mode?: "EX", seconds?: number): SnapshotTransaction => {
        this.calls.push(
          mode === undefined || seconds === undefined
            ? { key, value }
            : { key, value, mode, seconds },
        );
        return chain;
      },
      exec: async (): Promise<unknown> => {
        this.execs += 1;
        if (this.failWith !== null) throw this.failWith;
        return [];
      },
    };
    return chain;
  }

  async quit(): Promise<unknown> {
    this.quits += 1;
    return "OK";
  }

  /** Every key the sink asked for, in order. A11 asserts the prefix over this. */
  keyArguments(): readonly string[] {
    return this.calls.map((c) => c.key);
  }
}

/** One valid mempool row, for the `lastReports` panel. */
export function mempoolRow(txidSeed: number, ageSeconds: number): MempoolRow {
  return {
    txid: txidSeed.toString(16).padStart(64, "0"),
    ageSeconds,
    version: "v6",
    flow: "O to I",
    lanes: ["orchard", "ironwood"],
    valueBalanceText: "1.00000000 ZEC out of Orchard",
    feeZat: 15_000n,
    logicalActions: 3,
    walletGuess: "not claimed",
    finding: "a canonical ZIP 318 crossing",
    severity: "INFO",
    class: "migration",
    reasoning: ["the amount is 1 x 10^8 zatoshi, a canonical denomination"],
  };
}

/**
 * The instrument stand-ins.
 *
 * The residual's numbers are HANDOFF-09 A1's fixture in zatoshi: sprout 22,621
 * ZEC, orchard 708,841 ZEC, supply 16,889,987 ZEC, so `U = 731,462` ZEC and
 * `V = 0.95669`.
 */
export function fixtureInstruments(): Instruments {
  return {
    turnstileResidual: (balances, supplyZat) => {
      const unprovableZat = (balances.sprout ?? 0n) + (balances.orchard ?? 0n);
      const unprovableShare = Number(unprovableZat) / Number(supplyZat);
      return {
        unprovableZat,
        supplyZat,
        unprovableShare,
        verifiedShare: 1 - unprovableShare,
      };
    },
    selectWindow: null,
    orchardDrain: (_series, opts) => ({
      pool: "orchard",
      baselineHeight: opts.baselineHeight,
      baselineZat: opts.baselineZat,
      currentZat: 708_841n * ZAT_PER_ZEC,
      drained: 0.8063,
      velocity24hZecPerHour: -12.5,
      velocity7dZecPerHour: null,
      sampleCount: 2,
      audits: [],
    }),
    migrationLens: (crossings, opts) => ({
      lowHeight: opts.lowHeight,
      highHeight: opts.highHeight,
      buckets: [{ n: 1, kZatoshi: 8, kZec: 0, count: crossings.length, sumZat: 100_000_000n }],
      canonicalCount: crossings.length,
      nonCanonicalCount: 0,
      sumZat: 100_000_000n,
      strandedDustZat: 0n,
      minNotes: 1,
      maxWallets: crossings.length,
      denominationRuns: 1,
      overCapCount: 0,
      audit: {
        filter: "migration_lens",
        params: {
          lowHeight: opts.lowHeight,
          highHeight: opts.highHeight,
          canonicalCount: crossings.length,
          nonCanonicalCount: 0,
          sumZat: 100_000_000n,
          strandedDustZat: 0n,
          minNotes: 1,
          maxWallets: crossings.length,
          denominationRuns: 1,
        },
        countIn: BigInt(crossings.length),
        countOut: BigInt(crossings.length),
      },
    }),
    ironwoodBirth: (spends, opts) => ({
      birthHeight: opts.birthHeight,
      lowHeight: opts.lowHeight,
      highHeight: opts.highHeight,
      series: spends.map((s) => ({
        height: s.height,
        candidateCount: Number(s.candidateCount),
        nEff: 5,
        claimLevel: "requires_disclosure" as const,
      })),
      spendCount: spends.length,
      shares: {
        aggregate_only: 0,
        broad_candidate_set: 0,
        small_heuristic_set: 0,
        requires_disclosure: spends.length === 0 ? 0 : 1,
      },
      minNEff: spends.length === 0 ? null : 5,
      audit: {
        filter: "ironwood_birth",
        params: {
          birthHeight: opts.birthHeight,
          lowHeight: opts.lowHeight,
          highHeight: opts.highHeight,
          requiresDisclosureShare: spends.length === 0 ? 0 : 1,
          minNEff: spends.length === 0 ? 0 : 5,
        },
        countIn: BigInt(spends.length),
        countOut: BigInt(spends.length),
      },
    }),
  };
}

/** A complete set of builder inputs for one height. */
export function fixtureInputs(height: number, overrides: Partial<SnapshotInputs> = {}): SnapshotInputs {
  const timeMs = fixtureTimeMs(height);
  return {
    height,
    hash: hashFor(height),
    timeMs,
    publishedAtMs: timeMs + 4_000,
    lanes: [
      { lane: "transparent", balanceZat: 4_000_000n * ZAT_PER_ZEC },
      { lane: "sprout", balanceZat: 22_621n * ZAT_PER_ZEC },
      { lane: "sapling", balanceZat: 1_200_000n * ZAT_PER_ZEC },
      { lane: "orchard", balanceZat: 708_841n * ZAT_PER_ZEC },
      { lane: "ironwood", balanceZat: 300_000n * ZAT_PER_ZEC },
    ],
    supplyZat: 16_889_987n * ZAT_PER_ZEC,
    supplySource: "getblockchaininfo chainSupply, fixture",
    poolBalances: {
      sprout: 22_621n * ZAT_PER_ZEC,
      sapling: 1_200_000n * ZAT_PER_ZEC,
      orchard: 708_841n * ZAT_PER_ZEC,
      ironwood: 300_000n * ZAT_PER_ZEC,
    },
    orchardSeries: [],
    drainBaseline: { height: 3_428_143, zat: 3_660_000n * ZAT_PER_ZEC },
    crossings: [
      { txid: asHex("aa".repeat(32)), height, amountZat: 100_000_000n },
    ],
    migrationWindow: { lowHeight: height - 1151, highHeight: height },
    ironwoodSpends: [
      { txid: asHex("bb".repeat(32)), height, pool: "ironwood", candidateCount: 5n },
    ],
    ironwoodWindow: { birthHeight: 3_428_143, lowHeight: height - 1151, highHeight: height },
    lastReports: [mempoolRow(1, 30), mempoolRow(2, 5)],
    labelsVersion: "labels-9-2026-08-22",
    ...overrides,
  };
}

/** A tip, matching {@link fixtureInputs} at the same height. */
export function fixtureTip(height: number): Tip {
  return { height, hash: hashFor(height), timeMs: fixtureTimeMs(height) };
}

/** The `build` a publisher test injects: fixture inputs through the real builder. */
export function fixtureBuild(tip: Tip): Promise<BuiltSnapshot> {
  const snapshot: SnapshotV1 = buildSnapshot(fixtureInputs(tip.height), fixtureInstruments());
  return Promise.resolve({ snapshot, json: serializeSnapshot(snapshot) });
}

/** A logger that records instead of printing. */
export class RecordingLog {
  readonly lines: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  info(obj: Record<string, unknown>, msg: string): void {
    this.lines.push({ level: "info", obj, msg });
  }
  warn(obj: Record<string, unknown>, msg: string): void {
    this.lines.push({ level: "warn", obj, msg });
  }
  error(obj: Record<string, unknown>, msg: string): void {
    this.lines.push({ level: "error", obj, msg });
  }
}
