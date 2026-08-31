/**
 * `SnapshotV1` - the document `apps/publisher` writes on every tip.
 *
 * WHY IT EXISTS (plan section 4, decision 2): "the gateway (or a small
 * `apps/publisher`) writes `snapshot.json` every block ... The site renders from
 * it at build/ISR time; the WS layer upgrades it live. **Empty dashboards become
 * structurally impossible.**" That last sentence is the whole design goal, and it
 * is what makes this schema's tolerance decisions the way they are: a snapshot
 * that refuses to parse is an empty dashboard, so every field a page can render
 * without is nullable, and only the four that identify WHICH BLOCK THIS IS are
 * required outright.
 *
 * ZATOSHI CROSS THE WIRE AS DECIMAL STRINGS AND COME BACK AS `bigint`. That is
 * `zatSchema`'s existing contract in `views.ts` and this file reuses it rather
 * than inventing a second one: `JSON.stringify` throws on a `bigint`, so the
 * publisher serialises through a replacer and the reader parses through this
 * schema. A snapshot written by hand with JSON numbers would silently lose
 * precision above 2^53 - roughly 90 million ZEC, which the transparent pool is
 * nowhere near and the total supply cap makes unreachable, but the rule is the
 * rule and the string form costs nothing.
 *
 * THE `schema` FIELD IS NOT IN THE HANDOFF'S FIELD LIST AND IS ADDED ANYWAY.
 * HANDOFF-09 section 3 names `{height, hash, time, pools, residual, drain,
 * migrationHist, neffSeries, lastReports, labelsVersion}` and this adds one
 * more. The reason is the type's own name: a document called `SnapshotV1` that
 * carries no version cannot tell a reader it is a V1, and `apps/web`'s
 * resolution order (HANDOFF-11) has to distinguish "this is a snapshot I do not
 * understand" from "this is not a snapshot" - the first falls through to the
 * next source, the second is a fault worth reporting. A literal `1` makes that a
 * parse result rather than a guess.
 *
 * WHAT IS DELIBERATELY NOT HERE. No candidate sets, no per-transaction shielded
 * detail, no address attributions. This document is served to the public site
 * from a store shared with another project's production data
 * (`docs/2.0/SNAPSHOT.md`); it carries the pool-level aggregates and the last
 * fifty mempool rows, which is what the pages render, and nothing that would
 * make it worth reading for any other reason.
 */

import { z } from "zod";

import {
  countSchema,
  heightSchema,
  ledgerSchema,
  mempoolRowSchema,
  poolNameSchema,
  txidSchema,
  zatSchema,
} from "./views.js";

/**
 * The one version this schema accepts.
 *
 * A literal rather than a range: a reader that accepts `1 | 2` has to be written
 * to handle both, and nothing here is. When a V2 exists it gets its own schema
 * and its own literal, and the resolution order decides which to try.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/** The most recent mempool rows a snapshot carries. HANDOFF-09 section 3 says 50. */
export const SNAPSHOT_MAX_REPORTS = 50 as const;

/**
 * One lane's balance at the snapshot height.
 *
 * FIVE LANES, NOT FOUR POOLS, and `ledgerSchema` rather than `poolNameSchema` is
 * why: the site's ledger has a `transparent` lane, which is not a shielded pool
 * and has no commitment tree, and a reader of `/pools` needs all five to make a
 * share add to one. `docs/2.0/API.md` records that Zebra's `valuePools` carries
 * SIX entries - the ZIP 271 lockbox being the sixth - and that mapping six onto
 * five is the gateway's job, done explicitly there rather than by dropping an
 * entry silently. The lockbox is carried separately on the residual block below
 * for the same reason.
 */
export const snapshotLaneSchema = z.object({
  lane: ledgerSchema,
  balanceZat: zatSchema,
  /** Of the supply at this height, in [0, 1]. */
  share: z.number().min(0).max(1),
});
export type SnapshotLane = z.infer<typeof snapshotLaneSchema>;

/**
 * Plan section 3.2, the Unprovable Residual.
 *
 * `U_h = Bal^sprout_h + Bal^orchard_h` - value still inside pools whose circuits
 * were unsound during their lifetime, and which can only be cleared by emptying.
 * `V_h = 1 - U_h / Supply_h` is the verified share.
 *
 * `supplyZat` CARRIES ITS OWN SOURCE STRING because the plan says "Supply from
 * `getblockchaininfo` `valuePools`/issuance - document the source" and a number
 * whose provenance lives in a comment in another repository is not documented.
 * The two answers differ: summing `valuePools` gives the value the chain can
 * account for, and an issuance figure gives what was minted. A reader comparing
 * this site's 4.3% against another's needs to know which was used.
 */
export const snapshotResidualSchema = z.object({
  /** `U_h`, in zatoshi. */
  unprovableZat: zatSchema,
  supplyZat: zatSchema,
  /** Free text naming where `supplyZat` came from. Never empty. */
  supplySource: z.string().min(1),
  /** `U_h / Supply_h`. */
  unprovableShare: z.number().min(0).max(1),
  /** `V_h = 1 - U_h / Supply_h`. */
  verifiedShare: z.number().min(0).max(1),
});
export type SnapshotResidual = z.infer<typeof snapshotResidualSchema>;

/**
 * Plan section 3.3, the Orchard drain, with its velocities.
 *
 * `D_h = 1 - Bal^orchard_h / Bal^orchard_{3,428,143}`. The denominator is
 * anchored at NU6.3, where Orchard became exit-only, so the drain is measured
 * from the last height at which the pool could still grow.
 *
 * `NULLABLE VELOCITIES, AND THAT IS THE POINT.` Plan section 3.3 says "expected
 * completion is *undefined* ... show the asymptote, do not forecast a date". A
 * velocity needs two balance samples a window apart; on a freshly synced
 * indexer, or in the first week after a wipe, there is no such pair, and the
 * honest answer is `null` rather than a zero that renders as "the drain has
 * stopped". `sampleCount` says how many samples were behind each one, because a
 * velocity from two samples and a velocity from a thousand print identically.
 */
export const snapshotDrainSchema = z.object({
  pool: poolNameSchema,
  /** The height the denominator is taken at. Mainnet NU6.3 is 3,428,143. */
  baselineHeight: heightSchema,
  baselineZat: zatSchema,
  currentZat: zatSchema,
  /** `D_h`, in [0, 1]. */
  drained: z.number().min(0).max(1),
  /**
   * ZEC per hour over the trailing 24 h, signed. Null when the window holds too
   * few samples.
   *
   * ZEC AND NOT ZATOSHI, AND A FLOAT AND NOT A `bigint`, WHICH IS THE ONE PLACE
   * THIS DOCUMENT LEAVES THE ZATOSHI RULE ON PURPOSE. Plan section 3.3 names the
   * unit - "Velocity `dD/dt` from block timestamps (ZEC/hour, 24h and 7d
   * windows)" - and a rate is a quotient: the elapsed time comes from block
   * timestamps and is not a whole number of hours, so the result is not an
   * integer count of anything. A `bigint` here would have to round, and rounding
   * a rate to the nearest zatoshi-per-hour is a fiction about precision the
   * measurement does not have.
   *
   * Negative while a pool drains, which Orchard is doing by consensus since
   * NU6.3 made it exit-only. A positive value here for Orchard after
   * `baselineHeight` means this build's decoder is wrong, never that the chain
   * is - the same reading `ValuePool`'s exit-only guard takes.
   */
  velocity24hZecPerHour: z.number().nullable(),
  /** ZEC per hour over the trailing 7 d, signed. Null for the same reason. */
  velocity7dZecPerHour: z.number().nullable(),
  /** Balance samples the two velocities were computed from. */
  sampleCount: countSchema,
});
export type SnapshotDrain = z.infer<typeof snapshotDrainSchema>;

/** One `n x 10^k` bucket of the migration histogram. */
export const snapshotDenomBucketSchema = z.object({
  /** The mantissa, `n in {1, 2, 5}`. */
  n: z.union([z.literal(1), z.literal(2), z.literal(5)]),
  /**
   * The exponent IN ZATOSHI, which is `kZec + 8`.
   *
   * Named `kZatoshi` rather than `k` because `zip318.ts` records that this
   * project has two exponents for one denomination and that calling either of
   * them `k` is how they came to be confused: 0.5 ZEC is `n=5, kZatoshi=7,
   * kZec=-1`. `migrations_zip318.denom_k` stores this one, which is why it
   * carries a `CHECK (denom_k >= 0)`.
   */
  kZatoshi: countSchema,
  /** The same exponent in ZEC, which may be negative. */
  kZec: z.number().int(),
  count: countSchema,
  sumZat: zatSchema,
});
export type SnapshotDenomBucket = z.infer<typeof snapshotDenomBucketSchema>;

/**
 * Plan section 3.4 / TRACKING-MATH section 3.9, the migration lens.
 *
 * DISTRIBUTIONS ONLY. Section 3.9 forbids "wallet W migrated B" in as many
 * words, and this shape is the enforcement: there is nowhere in it to put a
 * wallet, an address or a txid. What it carries is a histogram, two bounds that
 * are explicitly one-sided, and a count of the crossings that did not match a
 * canonical denomination.
 *
 * `nonCanonicalCount` IS A MEASUREMENT AND NOT AN ERROR COUNT. `zip318.ts`:
 * a crossing outside the canonical ladder, or over `ZIP318_MAX_CROSSING_ZAT`,
 * is "a finding, never a rejection - the chain is the authority on what
 * happened". It is counted here rather than bucketed, because rounding it into
 * a neighbouring bucket would be inventing the measurement.
 */
export const snapshotMigrationHistSchema = z.object({
  lowHeight: heightSchema,
  highHeight: heightSchema,
  buckets: z.array(snapshotDenomBucketSchema),
  canonicalCount: countSchema,
  nonCanonicalCount: countSchema,
  /** Every crossing in the window, canonical or not. */
  sumZat: zatSchema,
  /** Crossings below `ZIP318_MAX_RESIDUAL_ZAT` (0.01 ZEC). Stranded, not migrating. */
  strandedDustZat: zatSchema,
  /** Lower bound on notes: `ceil(sumZat / 10,000 ZEC)`. */
  minNotes: countSchema,
  /**
   * Upper bound on distinct wallets: the number of crossings the window held
   * (plan section 3.4's `Sigma counts`). No lower bound exists.
   */
  maxWallets: countSchema,
  /**
   * Maximal runs of one denomination key. A shape observation, NOT a wallet
   * bound - two wallets crossing the same denomination in adjacent blocks form
   * one run - and no renderer may present it as one.
   */
  denominationRuns: countSchema,
});
export type SnapshotMigrationHist = z.infer<typeof snapshotMigrationHistSchema>;

/** One point of the Ironwood `N_eff` series. */
export const snapshotNeffPointSchema = z.object({
  height: heightSchema,
  /** Candidates before any narrowing - the anchor bound of section 3.1. */
  candidateCount: countSchema,
  /** `N_eff = 2^H`. A float, because `H` is. */
  nEff: z.number().nonnegative(),
  claimLevel: z.enum([
    "aggregate_only",
    "broad_candidate_set",
    "small_heuristic_set",
    "requires_disclosure",
  ]),
});
export type SnapshotNeffPoint = z.infer<typeof snapshotNeffPointSchema>;

/**
 * Plan section 3.5, Ironwood birth.
 *
 * `|T^ironwood_h|` started at 0 on 28 July 2026, so early anchors bound a small
 * candidate set BY CONSTRUCTION. The series and the share below each claim
 * threshold are expected to decay as the tree grows, and the point of publishing
 * them is that the decay is the story - not any individual spend.
 *
 * The four shares are on the document rather than derived by the reader because
 * a page that recomputes them from `series` would get a different answer once
 * `series` is truncated for size, and a reader has no way to notice.
 */
export const snapshotNeffSeriesSchema = z
  .object({
    birthHeight: heightSchema,
    /** Points, oldest first. May be sampled; `spendCount` is the population it came from. */
    series: z.array(snapshotNeffPointSchema),
    /** Spends in the series, which is not `series.length` when the series is sampled. */
    spendCount: countSchema,
    /**
     * Ironwood spends SEEN in the window, before any could be bounded.
     *
     * `spendCount` counts the spends the series could measure; this counts the
     * spends there were. They differ whenever a spend's anchor cannot be resolved,
     * and without both numbers the shares below are uninterpretable: four of five
     * spends unbounded published "100 per cent require disclosure", computed over
     * the one spend whose anchor happened to resolve, with no field that could say
     * so (HANDOFF-09b gate round 2). A renderer must show the pair, never the
     * share alone - `docs/2.0/SNAPSHOT.md` section 8.1 states the contract.
     *
     * Always `>= spendCount`.
     */
    windowSpendCount: countSchema,
    /**
     * Shares by claim level, over `spendCount` - NOT over `windowSpendCount`. Sum
     * to 1 when `spendCount > 0`.
     */
    shares: z.object({
      aggregate_only: z.number().min(0).max(1),
      broad_candidate_set: z.number().min(0).max(1),
      small_heuristic_set: z.number().min(0).max(1),
      requires_disclosure: z.number().min(0).max(1),
    }),
  })
  // THE INVARIANT ABOVE IS ENFORCED, NOT MERELY STATED (gate round 3). Both the
  // gateway and apps/web re-validate with this schema, so it is the thing that
  // fails closed - and "always >= spendCount" written only in a docstring let a
  // publisher bug inverting the pair sail through, after which section 8.1's
  // mandated form renders "N_eff over 5 of 2 spends in the window".
  .refine((n) => n.windowSpendCount >= n.spendCount, {
    message:
      "windowSpendCount is the population spendCount was drawn from and cannot be smaller than it",
    path: ["windowSpendCount"],
  });
export type SnapshotNeffSeries = z.infer<typeof snapshotNeffSeriesSchema>;

/**
 * The document.
 *
 * REQUIRED: `schema`, `height`, `hash`, `time`. Everything else is nullable, and
 * the asymmetry is deliberate. A snapshot that cannot say which block it
 * describes is not a snapshot - a page rendering it would print numbers with no
 * height beside them, which is the one thing this site must never do. Every
 * other block is a panel that can say "not measured" instead: an indexer that
 * has not reached NU6.3 has no drain, one with an empty mempool has no reports,
 * and a `null` there renders as an absence while a zero renders as a
 * measurement. That is `analysis-purity`'s rule about `INDETERMINATE` and
 * `sprout-field.ts`'s about a missing `vjoinsplit`, applied to a document.
 */
export const snapshotV1Schema = z.object({
  schema: z.literal(SNAPSHOT_SCHEMA_VERSION),
  height: heightSchema,
  hash: txidSchema,
  /** Block time, ISO 8601 UTC. The block's own timestamp, not the publish time. */
  time: z.string().datetime(),
  /** When the publisher wrote this document. Distinct from `time`: staleness is measured from it. */
  publishedAt: z.string().datetime(),
  pools: z.array(snapshotLaneSchema),
  residual: snapshotResidualSchema.nullable(),
  drain: snapshotDrainSchema.nullable(),
  migrationHist: snapshotMigrationHistSchema.nullable(),
  neffSeries: snapshotNeffSeriesSchema.nullable(),
  /** At most `SNAPSHOT_MAX_REPORTS`, newest first. */
  lastReports: z.array(mempoolRowSchema).max(SNAPSHOT_MAX_REPORTS),
  /** Which `packages/content` labels build produced any label a page renders. */
  labelsVersion: z.string().min(1),
});
export type SnapshotV1 = z.infer<typeof snapshotV1Schema>;

/**
 * Serialise a snapshot to the JSON text the sinks write.
 *
 * ONE PLACE, BECAUSE `JSON.stringify` THROWS ON A `bigint` AND THE THROW IS THE
 * GOOD CASE. The bad case is a caller that reaches for `Number(...)` to get past
 * it and loses precision silently. Every sink goes through this function, so
 * there is exactly one answer to "how does a zatoshi appear in the file", and
 * `zatSchema` reads that answer back.
 *
 * Pure. Takes a value, returns a string.
 */
export function serializeSnapshot(snapshot: SnapshotV1): string {
  return JSON.stringify(snapshot, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
