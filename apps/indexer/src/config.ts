import { z } from "zod";

const ConfigSchema = z.object({
  ZEBRAD_RPC_URL: z.string().url().default("http://127.0.0.1:8232"),
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

  /** ZIP-317 conventional fee floor in zatoshi per logical action. */
  ZIP317_MARGINAL_FEE_ZAT: z.coerce.number().int().positive().default(5000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse(process.env);
}
