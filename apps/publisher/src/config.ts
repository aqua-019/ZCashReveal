/**
 * Every knob `apps/publisher` reads, with a default that works on a laptop.
 *
 * TWO REDIS INSTANCES, NEVER CONFUSED, AND THIS IS THE ONE PROCESS THAT DIALS
 * BOTH (docs/2.0/SNAPSHOT.md sections 2 and 4). `REDIS_URL` is the VPS-local
 * instance - pub/sub, the tip channel, the live mempool - and it never leaves
 * the box. `SNAPSHOT_REDIS_KV_URL` / `SNAPSHOT_REDIS_REDIS_URL` are the two
 * spellings Upstash injects for the Vercel-managed store, which is SHARED WITH
 * AN UNRELATED PRODUCTION PROJECT and which this process is the only writer of.
 *
 * WHICH VARIABLES `assertNotManagedStore` IS CALLED ON, AND WHY THE LIST IS
 * SHORTER HERE THAN IN THE GATEWAY. The gateway and the indexer assert on every
 * Redis URL they hold, because for them the managed store is always a mistake.
 * The publisher is the one process for which it is the destination, so asserting
 * on `SNAPSHOT_REDIS_*` would make this app refuse to start on every CORRECT
 * configuration. What is asserted is `REDIS_URL` and `DATABASE_URL`: those two
 * are the hot-path, per-transaction connections, they are the ones an operator
 * could paste the managed URL into while copying values around, and neither has
 * any business addressing it.
 *
 * THE NAMES ARE THE ONES VERCEL INJECTS, NOT NAMES THIS REPOSITORY CHOSE
 * (SNAPSHOT.md section 3). `SNAPSHOT_REDIS_URL`, `SNAPSHOT_REDIS_REST_URL` and
 * `SNAPSHOT_REDIS_REST_TOKEN` - which thirteen places in this repository used to
 * state - are injected by nothing, and code written against them reads
 * `undefined` in production and falls through to a fallback with no fault
 * reported. The two read here are `SNAPSHOT_REDIS_KV_URL` and
 * `SNAPSHOT_REDIS_REDIS_URL`, both `rediss://` TCP URLs, both injected by the
 * integration, and the REST pair is deliberately absent: it belongs to
 * `apps/web`, server-side, with the READ-ONLY token.
 */

import { assertNotManagedStore } from "@zcashreveal/types";
import { z } from "zod";

/**
 * Mainnet NU6.3, the height at which Orchard became exit-only.
 *
 * A DEFAULT AND NOT A CONSTANT, because plan section 3.3's drain is well defined
 * against any baseline a caller can justify - testnet's NU6.3, or a chart
 * re-based to a later height - and `orchardDrain` takes the baseline as a
 * parameter for exactly that reason. A publisher pointed at testnet sets it.
 */
export const NU6_3_MAINNET_HEIGHT = 3_428_143;

/** Roughly one day of blocks at the 75-second target interval (1,152). */
export const BLOCKS_PER_DAY = 1152;

const Schema = z.object({
  /* ------------------------------------------------------------ file sink */

  /**
   * Where the `file` sink writes.
   *
   * REQUIRED IN THE SENSE THAT IT ALWAYS HAS A VALUE. SNAPSHOT.md section 8.5
   * marks the file sink `required: yes` - it is what the gateway serves and what
   * a dev run produces - so there is no configuration in which it is absent, and
   * a default is what makes that true on a laptop.
   */
  SNAPSHOT_FILE: z.string().min(1).default("./snapshot.json"),

  /* --------------------------------------------------------- managed store */

  /**
   * The managed store's TCP URL, first spelling. Optional: absent BOTH spellings,
   * the redis sink is not constructed at all and the publisher runs file-only.
   */
  SNAPSHOT_REDIS_KV_URL: z.string().optional(),
  /** The same store, second spelling. Upstash injects both; either satisfies the sink. */
  SNAPSHOT_REDIS_REDIS_URL: z.string().optional(),

  /**
   * The monthly command ceiling, and it is a hard refusal rather than a warning.
   *
   * The allowance is 500,000 commands a month and it is SHARED with the other
   * project. The design puts 5 commands on the wire per new tip - `MULTI` +
   * 3 x `SET` + `EXEC` - which is about 172,500 a month, and the default of
   * 200,000 leaves roughly 16% headroom over that while spending a minority
   * share of the shared allowance. This project can never be the reason the
   * other one is rate limited (SNAPSHOT.md section 5).
   *
   * RAISED FROM 150,000 ON 31 AUG 2026 (LEDGER-09 Q2, fold 2). The old default
   * was calibrated on the WRITE count of 3, which HANDOFF-09 charged; the
   * counter now charges the wire count of 5, and 150,000 would have tripped the
   * refusal around day 26 of every month for a reason that was an accounting
   * choice rather than a real limit. See `WIRE_COMMANDS_PER_TIP` in
   * `budget.ts` for why the envelope is charged at all.
   */
  SNAPSHOT_REDIS_MONTHLY_BUDGET: z.coerce.number().int().positive().default(200_000),

  /**
   * Where the monthly command counter lives.
   *
   * A FILE ON A NAMED VOLUME, NEVER THE MANAGED STORE AND NEVER MEMORY ALONE.
   * SNAPSHOT.md section 5 gives both halves: in the store it is counting it
   * would be a FOURTH command per tip and would break the assertion that says
   * there are exactly three; in memory alone it would reset on every restart and
   * make the ceiling vacuous. The default is repository-local so a laptop run
   * works; on the VPS this points into a named volume, which is the half
   * `docker-compose.yml` still owes (HANDOFF-10).
   */
  SNAPSHOT_BUDGET_FILE: z.string().min(1).default("./snapshot-budget.json"),

  /* ------------------------------------------------------------ local stack */

  /** The VPS Redis. Tip pub/sub. Guarded below - it must never be the managed store. */
  REDIS_URL: z.string().default("redis://localhost:6379"),

  /**
   * The indexer's Postgres, or ABSENT for RPC-only mode. Guarded below for the
   * same reason as `REDIS_URL`.
   *
   * OPTIONAL SINCE HANDOFF-14, AND THE DEFAULT IT LOST IS THE WHOLE CHANGE. This
   * read used to be
   * `.default("postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal")`,
   * so `cfg.DATABASE_URL` was a string in every configuration and the
   * composition root could open a connection unconditionally - which it did.
   * `ChainInputsDeps` has typed all four queries `| null` since HANDOFF-09b,
   * each with the comment "or null when there is no database", and nothing could
   * ever reach that branch because no configuration could express its absence.
   *
   * WHICH PANELS EACH MODE PUBLISHES. Both modes publish the same DOCUMENT -
   * `schema`, `height`, `hash`, `time`, `publishedAt`, `pools`, `lastReports`
   * and `labelsVersion` - because those come from the tip and the node.
   *
   *   FULL (`DATABASE_URL` set): `residual`, `drain`, `migrationHist` and
   *   `neffSeries` are all measurable. Each still publishes `null` if its own
   *   query or estimator refuses, with the reason logged - that is unchanged.
   *
   *   RPC-ONLY (`DATABASE_URL` absent): `drain`, `migrationHist` and
   *   `neffSeries` are `null`, because each reads a table. `residual` is
   *   MEASURED, because `turnstileResidual` takes the pool balances and
   *   `chainSupply`, and both arrive on `getblockchaininfo`. Three absences,
   *   not four, and the fourth panel being present is a property of this mode
   *   rather than an accident - HANDOFF-14 asserts it positively (A1b) for that
   *   reason.
   *
   * A NULL PANEL IS A STATED ABSENCE AND NEVER A ZERO (SNAPSHOT.md section 8.1).
   * That is what makes RPC-only a configuration rather than a degraded mode:
   * the document says which panels nothing measured, and the site renders that
   * as an absence. A mode that published `0` for an unmeasured panel would be
   * fabricating a measurement, and no amount of logging would fix it.
   *
   * EMPTY IS ABSENT, and `databaseUrl` below is where that is decided rather
   * than here, for the reason `managedStoreUrl` gives: an operator who writes
   * `DATABASE_URL=` in a `.env` to turn the database off means it, and a
   * `.min(1)` here would refuse to start instead.
   */
  DATABASE_URL: z.string().optional(),

  PUBLISHER_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  /* ----------------------------------------------------------------- zebra */

  ZEBRAD_RPC_URL: z.string().url().default("http://127.0.0.1:8232"),
  ZEBRAD_RPC_USER: z.string().default("zcashreveal"),
  ZEBRAD_RPC_PASSWORD: z.string().default("changeme"),
  ZEBRAD_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ZEBRAD_RPC_RETRIES: z.coerce.number().int().nonnegative().default(2),

  /* ------------------------------------------------------------ instruments */

  /** The drain's denominator height. See {@link NU6_3_MAINNET_HEIGHT}. */
  SNAPSHOT_DRAIN_BASELINE_HEIGHT: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(NU6_3_MAINNET_HEIGHT),

  /**
   * How many blocks back the migration lens looks from the tip.
   *
   * A WINDOW AND NOT ALL OF HISTORY. TRACKING-MATH section 3.9 reports the lens
   * "per window", and a histogram over every crossing since the fork answers a
   * different question from one over the last day - the second is the one a live
   * page renders.
   */
  SNAPSHOT_MIGRATION_WINDOW_BLOCKS: z.coerce.number().int().positive().default(BLOCKS_PER_DAY),

  /**
   * How many blocks back the DRAIN reads its Orchard balance series from the tip.
   *
   * SEVEN DAYS PLUS A MARGIN, BECAUSE THE INSTRUMENT ASKS FOR SEVEN. `orchardDrain`
   * computes two velocities, over 24 hours and over 168, and `selectWindow` admits
   * a sample by its BLOCK TIME rather than by its height. A window sized to exactly
   * seven days of blocks at the target interval would therefore come up short
   * whenever blocks ran slow, and the 7d velocity would quietly narrow to whatever
   * the query happened to return. Eight days of blocks is the cheapest way to make
   * the time rule the binding one, which is what `selectWindow`'s audit record
   * reports as `countIn` against `countOut`.
   */
  SNAPSHOT_DRAIN_WINDOW_BLOCKS: z.coerce
    .number()
    .int()
    .positive()
    .default(BLOCKS_PER_DAY * 8),

  /**
   * How many blocks back the N_eff series reads Ironwood spends from the tip.
   *
   * The same one-day window the migration lens uses, and for the same reason
   * (plan section 3.5 reports the series over a window, not over all of history).
   * It is a SEPARATE knob rather than a reuse of `SNAPSHOT_MIGRATION_WINDOW_BLOCKS`
   * because the two answer different questions and an operator widening one to
   * investigate a migration burst should not silently rescale the other.
   */
  SNAPSHOT_IRONWOOD_WINDOW_BLOCKS: z.coerce.number().int().positive().default(BLOCKS_PER_DAY),

  /**
   * The height Ironwood was born at - NU6.3 on the network this publisher reads.
   *
   * A SEPARATE KNOB FROM `SNAPSHOT_DRAIN_BASELINE_HEIGHT` EVEN THOUGH BOTH
   * DEFAULT TO THE SAME NUMBER, and the reason is that they are different KINDS
   * of quantity that happen to coincide on mainnet.
   *
   * `SNAPSHOT_DRAIN_BASELINE_HEIGHT` is a CHART ORIGIN. `orchardDrain`'s own
   * docblock says so - "the baseline is the caller's, not this module's ... the
   * drain is well defined against any baseline a caller can justify, testnet's
   * NU6.3, or A CHART RE-BASED TO A LATER HEIGHT" - so an operator moving it to
   * re-base the drain is using it exactly as intended.
   *
   * A BIRTH HEIGHT IS A CONSENSUS FACT and cannot be re-based at all. The first
   * draft of HANDOFF-09b read `birthHeight` from the drain baseline, on the
   * argument that "one configured height is one thing to get right instead of
   * two". That argument was wrong, and the failure it produces is silent: an
   * operator re-basing the drain chart to a later height would move Ironwood's
   * birth with it, `ironwoodBirth` would exclude every spend below the new
   * value, and `neffSeries` would shorten - a real measurement, of a window
   * nobody asked for, with nothing on the page saying so.
   *
   * The two-knobs-can-drift objection is real and is answered by which drift
   * matters: setting this wrong shortens or over-extends a series, and
   * `violatesBirthBound` is the falsifiable check a caller runs for exactly
   * that. Setting the drain baseline wrong changes a denominator that is
   * PUBLISHED beside its result, where a reader can see it.
   */
  SNAPSHOT_IRONWOOD_BIRTH_HEIGHT: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(NU6_3_MAINNET_HEIGHT),
});

export type PublisherConfig = z.infer<typeof Schema>;

/**
 * The managed store's TCP URL, or null when neither spelling is set.
 *
 * `SNAPSHOT_REDIS_KV_URL` WINS WHEN BOTH ARE PRESENT, and the order is arbitrary
 * in the sense that the integration injects the same URL under both names. What
 * is not arbitrary is that ONE of them is chosen deterministically rather than
 * both being dialled: two clients would be two connections and, if the two
 * values ever disagreed, two different databases.
 */
export function managedStoreUrl(cfg: PublisherConfig): string | null {
  const kv = cfg.SNAPSHOT_REDIS_KV_URL;
  if (kv !== undefined && kv.length > 0) return kv;
  const legacy = cfg.SNAPSHOT_REDIS_REDIS_URL;
  if (legacy !== undefined && legacy.length > 0) return legacy;
  return null;
}

/**
 * The indexer's Postgres URL, or null when this publisher runs on RPC alone.
 *
 * THE SAME EMPTY-IS-ABSENT RULE `managedStoreUrl` USES, and for the same reason:
 * a variable set to the empty string is how a `.env` or a compose file turns
 * something off, and reading `""` as a present-but-broken URL would refuse to
 * start on a configuration the operator wrote deliberately.
 *
 * ONE PLACE DECIDES THE MODE. Every caller asks this function rather than
 * testing `cfg.DATABASE_URL` itself, so the composition root, the logged mode
 * line and the assertions cannot disagree about which mode a process is in -
 * which is the same argument `fmtSnapshotAge` makes for its two call sites.
 */
export function databaseUrl(cfg: PublisherConfig): string | null {
  const url = cfg.DATABASE_URL;
  if (url !== undefined && url.length > 0) return url;
  return null;
}

/**
 * Refuse to start if a LOCAL endpoint is pointed at the managed store.
 *
 * The rule, the host list and the two checks live in `packages/zec-types`
 * (`redis-topology.ts`); what is local here is only WHICH variables this process
 * dials, and that list is deliberately two names long. See this file's header
 * for why `SNAPSHOT_REDIS_*` is not on it: the publisher is the one process for
 * which the managed store is the destination, and asserting on it would make
 * every correct configuration refuse to start.
 */
export function assertLocalEndpointsAreLocal(
  cfg: PublisherConfig,
  env: NodeJS.ProcessEnv,
): void {
  assertNotManagedStore(
    [
      ["REDIS_URL", cfg.REDIS_URL],
      ["DATABASE_URL", cfg.DATABASE_URL],
    ],
    env,
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PublisherConfig {
  const cfg = Schema.parse(env);
  assertLocalEndpointsAreLocal(cfg, env);
  return cfg;
}

/**
 * The environment values that must never appear in a log line or a snapshot.
 *
 * A list of VALUES, not of names, for the reason the gateway's `secretValues`
 * gives: a line containing the string "SNAPSHOT_REDIS_KV_URL" is harmless and one
 * containing the URL is not, because that URL carries the store's password.
 */
export function secretValues(cfg: PublisherConfig): readonly string[] {
  return [
    cfg.SNAPSHOT_REDIS_KV_URL,
    cfg.SNAPSHOT_REDIS_REDIS_URL,
    cfg.DATABASE_URL,
    cfg.REDIS_URL,
    cfg.ZEBRAD_RPC_PASSWORD,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
}
