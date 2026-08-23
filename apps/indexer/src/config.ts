import { assertNotManagedStore } from "@zcashreveal/types";
import { z } from "zod";

const ConfigSchema = z.object({
  ZEBRAD_RPC_URL: z.string().url().default("http://127.0.0.1:8232"),
  // Kept for portability (zcashd / auth-enabled Zebra); the current dev-mode Zebra runs enable_cookie_auth=false and ignores these.
  ZEBRAD_RPC_USER: z.string().default("zcashreveal"),
  ZEBRAD_RPC_PASSWORD: z.string().default("changeme"),
  ZEBRAD_ZMQ_URL: z.string().default("tcp://127.0.0.1:28332"),

  DATABASE_URL: z.string().default("postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  INDEXER_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

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

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = ConfigSchema.parse(env);
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
