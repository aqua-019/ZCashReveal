import { z } from "zod";

/**
 * Every knob the gateway reads, with a default that works on a laptop.
 *
 * TWO REDIS INSTANCES, NEVER CONFUSED (CLAUDE.md, HANDOFF-05 section 3).
 * `REDIS_URL` is the VPS-local instance: pub/sub, `zcashreveal:mempool:live`
 * and the anchor registry, and it never leaves the box. `RATE_LIMIT_REDIS_URL`
 * is optional and shares a limiter across gateway processes. The Vercel-managed
 * Marketplace Redis (`SNAPSHOT_REDIS_*`) is NOT here and must never be: it holds
 * `zecreveal:snapshot:*` only, it is written by the publisher, and putting it on
 * the gateway's hot path would send per-transaction traffic off the VPS.
 */
const Schema = z.object({
  GATEWAY_HOST: z.string().default("0.0.0.0"),
  GATEWAY_PORT: z.coerce.number().int().positive().default(8080),
  /**
   * Comma-separated allow list, or `*`.
   *
   * The default is the v0.2 dashboard's dev origin, kept so a local checkout
   * still works. Production sets the site's origin. `*` is accepted because a
   * read-only public API legitimately wants it, and is called out in
   * docs/2.0/API.md rather than left as a surprise.
   */
  GATEWAY_CORS_ORIGIN: z.string().default("http://localhost:5173"),
  GATEWAY_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z
    .string()
    .default(
      "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal",
    ),

  /* ----------------------------------------------------------------- zebra */

  ZEBRAD_RPC_URL: z.string().url().default("http://127.0.0.1:8232"),
  ZEBRAD_RPC_USER: z.string().default("zcashreveal"),
  ZEBRAD_RPC_PASSWORD: z.string().default("changeme"),
  ZEBRAD_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ZEBRAD_RPC_RETRIES: z.coerce.number().int().nonnegative().default(2),

  /**
   * Which chain this gateway reads.
   *
   * It decides which transparent address prefixes are accepted, so it is not
   * cosmetic: a mainnet gateway that accepts a `t2` testnet address would
   * answer for an address that cannot exist on the chain it is reading, which
   * is assertion A3's third case.
   */
  GATEWAY_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),

  /* ----------------------------------------------------------------- cache */

  /** Cache-aside TTLs, in seconds. Zero disables the cache, which is A6's fail side. */
  GATEWAY_ADDRESS_CACHE_TTL_S: z.coerce.number().int().nonnegative().default(60),
  GATEWAY_TX_CACHE_TTL_S: z.coerce.number().int().nonnegative().default(3600),

  /**
   * How many transactions an address view will read before it stops.
   *
   * `getaddresstxids` returns every txid an address ever touched, and the
   * lockbox has thousands. The page renders a window, and the view says how
   * wide the window was rather than presenting a truncation as a whole history.
   */
  GATEWAY_ADDRESS_TX_LIMIT: z.coerce.number().int().positive().max(500).default(50),

  /**
   * How many funding transactions a fee computation may fetch.
   *
   * Zebra never populates an input's value (types/transaction.rs:903-905), so a
   * transaction's fee can only be computed by reading the outputs it spends.
   * A consolidation with more inputs than this gets a stated refusal rather
   * than a fee computed from a subset, which would be wrong and would look
   * right.
   */
  GATEWAY_MAX_FUNDING_LOOKUPS: z.coerce.number().int().positive().default(256),

  /* -------------------------------------------------------------- hardening */

  /** Per-IP request budget and its window, in milliseconds. */
  GATEWAY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  GATEWAY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(10_000),
  /**
   * Optional shared store for the limiter.
   *
   * UNSET IS THE DEFAULT AND IS DELIBERATE. With it unset the limiter uses an
   * in-process store and the gateway opens exactly two Redis connections - the
   * pub/sub subscriber and the reader - which assertion A4 pins. Setting it
   * opens a third, which is correct when several gateway processes must share
   * one budget and wrong when there is one.
   */
  RATE_LIMIT_REDIS_URL: z.string().optional(),

  /** WebSocket connection cap. The one over it is closed with 1013, Try Again Later. */
  GATEWAY_WS_MAX_CONNECTIONS: z.coerce.number().int().positive().default(500),

  /**
   * Addresses whose `x-forwarded-for` this gateway will believe.
   *
   * THE RATE LIMIT IS ONLY PER-IP IF THIS IS SET CORRECTLY. `@fastify/rate-limit`
   * keys on `req.ip`, and behind a reverse proxy every request arrives from the
   * proxy's address - so with this empty, one bucket is shared by every reader
   * and a single client denies service to all of them. HANDOFF-10 puts a
   * cloudflared tunnel in front of this gateway, which is exactly that topology.
   *
   * EMPTY IS THE DEFAULT AND IS THE SAFE ONE, not the convenient one. Blanket
   * `trustProxy: true` would let ANY caller forge `x-forwarded-for` and mint a
   * fresh bucket per request, which is worse than one shared bucket: it removes
   * the limit entirely rather than making it coarse. So the value is a list of
   * addresses or CIDR ranges, and an operator who deploys behind a tunnel sets
   * it to the tunnel's address.
   *
   * Comma-separated, e.g. `127.0.0.1,10.0.0.0/8`.
   */
  GATEWAY_TRUSTED_PROXIES: z.string().default(""),
});

export type GatewayConfig = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return Schema.parse(env);
}

/**
 * What to pass Fastify as `trustProxy`.
 *
 * `false` when no proxy is configured, which makes `req.ip` the socket address
 * and `x-forwarded-for` unforgeable. A list otherwise, which makes `req.ip` the
 * forwarded address only for hops this gateway was told to believe.
 */
export function trustProxyFor(cfg: GatewayConfig): boolean | string[] {
  const list = cfg.GATEWAY_TRUSTED_PROXIES.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return list.length === 0 ? false : list;
}

/**
 * The environment values that must never appear in a response.
 *
 * Assertion A7 greps every serialised body for these. It is a list of VALUES,
 * not of names: a body containing the string "ZEBRAD_RPC_PASSWORD" is harmless,
 * and one containing the password is not. The RPC URL is included because it is
 * an internal hostname, which A7 names alongside the credentials.
 */
export function secretValues(cfg: GatewayConfig): readonly string[] {
  return [cfg.ZEBRAD_RPC_URL, cfg.ZEBRAD_RPC_USER, cfg.ZEBRAD_RPC_PASSWORD, cfg.DATABASE_URL, cfg.REDIS_URL].filter(
    (v) => v.length > 0,
  );
}
