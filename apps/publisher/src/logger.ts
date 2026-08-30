/**
 * The publisher's logger.
 *
 * A FACTORY RATHER THAN A MODULE-LEVEL `pino({...})`, for the reason
 * `apps/gateway/src/logger.ts` gives: an assertion needs to build one over a
 * capturing stream and read back the SAME lines the real process writes. A7's
 * fail side is exactly that - the redis sink is pointed at a closed port and the
 * evidence is a log line carrying `sink=redis` - and a test that configured its
 * own logger would be testing its own configuration.
 *
 * WHAT IT REDACTS AND WHY THE LIST IS SHORT. This process serves no requests and
 * sees no viewing keys, so the gateway's key serialisers have nothing to do
 * here. What it does hold is two credentialled URLs: the managed store's
 * `rediss://` TCP URL carries the store's password in its userinfo, and the
 * `postgres://` URL carries the database's. Both arrive in this process from the
 * environment and both would be written verbatim by `ioredis` and `postgres`
 * error messages - "connect ECONNREFUSED" is harmless, "AUTH failed for
 * rediss://default:PASSWORD@host" is not. So an error's message goes through a
 * redaction that removes the userinfo of any URL in it, and the stack is dropped
 * rather than redacted line by line for the same reason the gateway drops it.
 */

import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * `scheme://user:secret@host` - the userinfo of any URL, matched loosely.
 *
 * LOOSE BECAUSE A MALFORMED URL STILL CARRIES A PASSWORD. A run that looks like
 * credentialled userinfo is redacted whether or not `new URL()` would accept it,
 * since the alternative is redacting only the well-formed ones and writing the
 * rest to disk. The scheme and host survive, which is what an operator reading
 * the line actually needs.
 */
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+)(:[^/\s@]*)?@/gi;

/** Replace the userinfo of every URL in a string. Exported so the assertion uses the same rule. */
export function redactUrlCredentials(value: string): string {
  return value.replace(URL_USERINFO, (_m, scheme: string) => `${scheme}[redacted]@`);
}

export interface PublisherLoggerOptions {
  /** A pino level name. Required rather than optional: a logger with no level is a configuration nobody chose. */
  readonly level: string;
  /** Pretty-print, for a TTY. Never in production, where the sink is a file. */
  readonly pretty?: boolean;
}

/** Build the publisher's logger, optionally over a capturing stream. */
export function createPublisherLogger(
  options: PublisherLoggerOptions,
  destination?: NodeJS.WritableStream,
): Logger {
  const config: LoggerOptions = {
    level: options.level,
    ...(options.pretty === true && destination === undefined
      ? { transport: { target: "pino-pretty" } }
      : {}),
    serializers: {
      err: (err: Error & { code?: unknown }) => ({
        type: err.name,
        message: redactUrlCredentials(err.message),
        ...(err.code === undefined ? {} : { code: err.code }),
      }),
    },
  };
  return destination === undefined ? pino(config) : pino(config, destination);
}
