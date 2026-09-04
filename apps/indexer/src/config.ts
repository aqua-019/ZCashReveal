import { NU6_3_ACTIVATION_MAINNET, NU6_3_ACTIVATION_TESTNET } from "@zcashreveal/instruments";
import { assertNotManagedStore } from "@zcashreveal/types";
import { z } from "zod";

const ConfigSchema = z.object({
  ZEBRAD_RPC_URL: z.string().url().default("http://127.0.0.1:8232"),
  // Kept for portability (zcashd / auth-enabled Zebra); the current dev-mode Zebra runs enable_cookie_auth=false and ignores these.
  ZEBRAD_RPC_USER: z.string().default("zcashreveal"),
  ZEBRAD_RPC_PASSWORD: z.string().default("changeme"),
  ZEBRAD_ZMQ_URL: z.string().default("tcp://127.0.0.1:28332"),

  /**
   * Postgres, or absent for mempool-only mode.
   *
   * OPTIONAL SINCE HANDOFF-15, AND THE DEFAULT IT LOST IS THE WHOLE CHANGE.
   * This read used to be
   * `.default("postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal")`,
   * so `cfg.DATABASE_URL` was a string in every configuration this repository
   * could express and the composition root opened a connection unconditionally
   * - which it did, at `index.ts:61`. That is LEDGER-14's shape exactly, one
   * app over: A NULLABLE DEPENDENCY WHOSE NULL NO CONFIGURATION CAN PRODUCE IS
   * NOT A BRANCH, IT IS A COMMENT. `AnchorRegistry` has returned
   * `number | null` from `getHeightForAnchor` since HANDOFF-06 and the null was
   * reachable only by a cold cache; now it is reachable by configuration.
   *
   * WHAT ABSENCE COSTS, stated so nobody has to infer it. The confirmed-block
   * follower does not start - it needs `PostgresChainStore` and there is no
   * store - so pool state, reorg handling and every crossing are absent, which
   * is rung 3's subject and out of this handoff's scope. The mempool path runs:
   * it polls, analyses, publishes to Redis and serves `/v2/mempool`. Two things
   * degrade rather than fail, both to a STATED ABSENCE and never to a zero:
   * a leak report is not persisted, and an anchor whose root misses both the
   * memo and Redis has depth `null` - "unknown" - instead of a depth measured
   * from a table nobody read.
   *
   * `migrate.ts` READS THIS TOO AND MUST STILL REFUSE WITHOUT IT. A migration
   * runner with no URL has nothing to do and defaulting it to localhost is how
   * a developer migrates the wrong database; it asks `databaseUrl` below and
   * exits non-zero on null.
   */
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),

  /**
   * The endpoint's request ceiling, in requests per minute. Absent is unmetered.
   *
   * ABSENT IS THE RIGHT DEFAULT AND IT IS NOT LAZINESS. A Zebra you run over
   * loopback has no ceiling worth modelling, and every deployment of this
   * project before HANDOFF-15 is one of those; giving it a number would make
   * them all slower for nothing. A third-party gateway has a ceiling, and it is
   * small: HANDOFF-15 section 1 records five requests per minute measured
   * against the keyless Tatum endpoint - sixteen requests in a 1.4-second
   * burst, five 200s, then 429 for every request from the sixth on, and it
   * stayed refused.
   *
   * WHAT IT DOES. `planMempoolPoll` derives the poll interval and a per-tick
   * transaction budget from it (see `mempool-plan.ts` for the arithmetic), and
   * a `RateGate` on the RPC client enforces it as an invariant regardless of
   * what anything plans. The two are separate on purpose: one can be got wrong
   * by arithmetic, the other cannot be argued with.
   *
   * EMPTY IS ABSENT, for the reason `INDEXER_START_HEIGHT` above documents at
   * length: `docker compose` writes `KEY: ""` for a `${VAR:-}` whose VAR is
   * unset and never omits the key, so "" is how "the operator did not choose
   * one" actually arrives. Without the preprocess, `Number("")` is 0, which
   * fails `.positive()` and throws at module scope before the logger exists -
   * a crash loop under `restart: unless-stopped`.
   */
  INDEXER_RPC_MAX_RPM: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    // BOUNDED ABOVE, BECAUSE `RateGate.penalise` MATERIALISES THIS MANY ARRAY
    // SLOTS ON EVERY 429. A typo'd 100000000 allocates about 800 MB on the
    // first refusal; `Number.MAX_SAFE_INTEGER` throws `RangeError: Invalid
    // array length` from inside the client's 429 handler, which replaces the
    // `RpcRateLimitError` and makes a refusal read as a poll-loop crash. A
    // ceiling above 100,000 a minute is not a ceiling worth metering - leave
    // the variable unset instead. Found by a gate reviewer.
    z.coerce.number().int().positive().max(100_000).optional(),
  ),
  /**
   * Where confirmed blocks are stored when there is no `DATABASE_URL`
   * (HANDOFF-16, rung 3).
   *
   * `auto` IS THE DEFAULT AND KEEPS EVERY EXISTING DEPLOYMENT UNCHANGED:
   * Postgres when `DATABASE_URL` is set, and no store - so no follower - when it
   * is not, which is rung 2's mempool-only mode exactly.
   *
   * `memory` IS RUNG 3's MODE AND ITS COST IS NOT HIDDEN. The follower runs
   * against `MemoryChainStore`, so crossings accrue from `INDEXER_START_HEIGHT`
   * forward with no database at all - and every block applied is lost on
   * restart, because the store IS the process. `chain-access.ts` says so on
   * every start. It has no effect when `DATABASE_URL` is set: a configured
   * database always wins, since silently preferring memory over a real store an
   * operator configured would be the worst possible reading of an enum.
   *
   * NO LITERAL DEFAULT BELONGS IN A COMPOSE FILE OR `.env.example` FOR THIS ONE
   * EITHER, and for `check-config-defaults.mjs`'s reason one variable over: a
   * constant written on a surface that cannot read a sibling variable applies on
   * every deployment and wins wherever the operator left it alone.
   */
  INDEXER_CHAIN_STORE: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["auto", "memory"]).default("auto"),
  ),
  INDEXER_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /**
   * The network the node follows (HANDOFF-12). Decides the activation heights
   * the value invariants and the analyser apply, and the default start height
   * below. The gateway has `GATEWAY_NETWORK` for the same reason.
   */
  INDEXER_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  /**
   * The first block the confirmed-block driver indexes on a COLD database
   * (HANDOFF-12). Ignored once a base row is on disk: a warm start replays
   * from the store and never reads this. Unset means NU6.3 activation on
   * `INDEXER_NETWORK` - where Ironwood begins, and the earliest height at
   * which this build's four-pool accounting is checked against the node on
   * every block it applies. Resolved in `loadConfig`, because a zod default
   * cannot read a sibling field. See docs/2.0/RUNTIME.md.
   */
  // AN EMPTY STRING IS ABSENT, AND SAYING SO IS WHAT LETS THE DEFAULT BE THE
  // NETWORK'S. `docker compose` writes `KEY: ""` for a `${VAR:-}` whose VAR is
  // unset - it never omits the key - and a blank `.env` line does the same, so
  // "" is how "the operator did not choose one" actually arrives here. Without
  // this, `Number("") === 0` failed `.positive()` and `loadConfig` threw at
  // module scope before the logger existed, crash-looping under
  // `restart: unless-stopped`. Found by a gate reviewer, measured against the
  // installed zod: bare `.optional()` throws on "", this resolves it to
  // undefined, and every other malformed value ("abc", "0", "3428143.5")
  // still throws.
  INDEXER_START_HEIGHT: z.preprocess(
    // TRIMMED, because "" was only the most common spelling of blank. A value
    // exported as a single space is not empty to compose's `${VAR:-}`, which
    // substitutes only on unset-or-empty, so it arrived here as " ",
    // coerced to 0 and threw at module scope - the same crash-loop the empty
    // case was fixed for, by a different door. Found by the gate round that
    // reviewed that fix.
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),

  /** Anchors within this depth (in blocks) are flagged as "recent" — a tighter
   *  anchor narrows the window during which the spent note could have entered
   *  the tree. 100 blocks ≈ 2.5 hours on Zcash's 2.5-min target. */
  RECENT_ANCHOR_THRESHOLD: z.coerce.number().int().positive().default(100),

  /*
   * ZIP317_MARGINAL_FEE_ZAT WAS HERE AND HAS BEEN DELETED (HANDOFF-06).
   *
   * It made a CONSENSUS CONSTANT settable per deployment. Nothing read it -
   * `cfg.ZIP317_MARGINAL_FEE_ZAT` had no call site - so it was an invitation
   * rather than a live fault, but it is the kind of invitation someone accepts
   * during an incident: a process whose marginal fee is not 5,000 zatoshi is
   * not misconfigured, it is computing a different chain's conventional fee and
   * publishing the answer as Zcash's. Its comment also called it the
   * "conventional fee floor per logical action", which is two errors in six
   * words - it is the marginal fee, and the floor is two actions' worth of it.
   *
   * The value lives in `packages/zec-types/src/zip317.ts` as ZIP317_MARGINAL_FEE.
   */

  /** Per-attempt Zebra RPC timeout, and how many transport failures to retry. */
  ZEBRAD_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ZEBRAD_RPC_RETRIES: z.coerce.number().int().nonnegative().default(2),
});

/** The parsed environment, with the start height resolved to a number. */
export type Config = Omit<z.infer<typeof ConfigSchema>, "INDEXER_START_HEIGHT"> & {
  readonly INDEXER_START_HEIGHT: number;
};

/**
 * The Postgres URL, or null when this process runs mempool-only.
 *
 * ONE PLACE DECIDES THE MODE, and every caller asks this function rather than
 * testing `cfg.DATABASE_URL` itself - the rule `apps/publisher/src/config.ts`
 * states for its own copy and the reason it has one. Two callers testing the
 * field separately is two definitions of "configured", and the day they differ
 * is the day the composition root opens a connection the queries think it did
 * not.
 *
 * EMPTY IS ABSENT for the compose reason above: `DATABASE_URL: ${DATABASE_URL:-}`
 * with the variable unset arrives here as "", and a zero-length connection
 * string is not a database.
 */
export function databaseUrl(cfg: Config): string | null {
  const url = cfg.DATABASE_URL;
  if (url !== undefined && url.length > 0) return url;
  return null;
}

/**
 * The endpoint's ceiling, or null when unmetered.
 *
 * A SECOND ONE-PLACE-DECIDES FUNCTION, for the same reason and with the same
 * shape, so a caller never asks whether the field is undefined.
 */
export function rpcCeilingPerMinute(cfg: Config): number | null {
  return cfg.INDEXER_RPC_MAX_RPM ?? null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.parse(env);
  const cfg: Config = {
    ...parsed,
    INDEXER_START_HEIGHT:
      parsed.INDEXER_START_HEIGHT ??
      (parsed.INDEXER_NETWORK === "mainnet" ? NU6_3_ACTIVATION_MAINNET : NU6_3_ACTIVATION_TESTNET),
  };
  /**
   * The indexer is the highest-volume writer in the project, and the managed store
   * injects a variable name one token away from this one (`SNAPSHOT_REDIS_REDIS_URL`
   * against `REDIS_URL`). That store is SHARED with an unrelated production project
   * on a 500,000-command monthly allowance; per-transaction traffic there would
   * exhaust it in days and would write keys outside the `zecreveal:` namespace into
   * someone else's database. The guard is in `packages/zec-types` so the gateway
   * enforces the same rule from the same code. See docs/2.0/SNAPSHOT.md.
   */
  assertNotManagedStore([["REDIS_URL", cfg.REDIS_URL]], env);
  return cfg;
}
