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
 *
 * THE PASSWORD CLASS EXCLUDES WHITESPACE AND NOTHING ELSE, AND THE FIRST
 * VERSION OF THIS PATTERN LEAKED BECAUSE IT EXCLUDED MORE. It was
 * `(:[^/\s@]*)?`, which stops at a `/` or an `@` inside the password - and the
 * one credential this process is most likely to hold is a base64 token, whose
 * alphabet is `A-Za-z0-9+/=`. Measured, not argued: against
 * `AUTH failed for rediss://default:AbC/d12+34=@fly-x.upstash.io:6379` the old
 * pattern matched nothing and wrote the token verbatim, and against
 * `rediss://default:pa@ssword@host` it produced `rediss://[redacted]@ssword@host`
 * - the tail of the password surviving the redaction. That is the exact failure
 * this module exists to prevent, in the exact shape the managed store's own URL
 * takes, and the docblock above already claimed the malformed case was covered.
 *
 * THE PASSWORD IS GREEDY, WHICH PICKS THE LAST `@` IN THE RUN. That is what
 * makes a password containing `@` redact whole rather than in half. Its cost is
 * stated rather than hidden: in `redis://u:pw@host/x@y` the later `@` wins and
 * the HOST is redacted too. That is over-redaction, which is the safe direction
 * - it loses an operator a hostname and never writes a password - and a URL
 * whose path carries an `@` is not a shape either of this process's two URLs
 * takes.
 *
 * GREEDY RATHER THAN LAZY-PLUS-LOOKAHEAD, AND THE REASON IS COMPLEXITY. The
 * first version of this fix reached the same last-`@` by writing the password
 * lazily and adding `@(?![^\s]*@)`. It produces identical output on every case
 * below - checked one by one - and it is QUADRATIC: the lazy class grows one
 * character at a time and the lookahead rescans the rest of the run at each
 * step. Measured on `"rediss://default:" + "a@".repeat(n/2)`: 39ms at 10k
 * characters, 978ms at 50k, 16.4 SECONDS at 200k. This function runs on error
 * messages, which is exactly the input a wedged process produces most of. The
 * greedy form runs the same 200k in 0.6ms and 500k in 1.2ms, because the engine
 * consumes the run once and backtracks to the last `@` once. A redaction that
 * hangs the logger is not a safer redaction.
 */
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@]+)(:[^\s]*)?@/gi;

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
