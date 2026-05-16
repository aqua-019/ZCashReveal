import { z } from "zod";

const Schema = z.object({
  GATEWAY_HOST: z.string().default("0.0.0.0"),
  GATEWAY_PORT: z.coerce.number().int().positive().default(8080),
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
});

export type GatewayConfig = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return Schema.parse(env);
}
