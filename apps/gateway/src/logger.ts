/**
 * The gateway's logger, and the promise it keeps about viewing keys.
 *
 * THE LOG IS THE WORSE COPY. `/api/search` is built so that a viewing key which
 * arrives is not echoed to the caller, and the not-found handler drops the query
 * string for the same reason. Neither stops the key being WRITTEN: Fastify's
 * default request serialiser logs `req.url` verbatim, query string included, on
 * every request and again on the error path, and that line lands on the VPS disk
 * and in anything the logs are shipped to. A caller who sends a key already has
 * it; a log file is durable and is read by people who do not.
 *
 * WHY NOT JUST REDACT `req.url`. That was the first attempt and it works, in the
 * sense that the key does not appear - because the WHOLE url becomes
 * "[redacted]" and every request in the log becomes indistinguishable from every
 * other. Executed against that configuration: six lines, three requests, three
 * identical `"url":"[redacted]"`. A log nobody can read is not a security
 * control, it is a broken log that happens to be safe, and the next person to
 * need a route in a trace will remove it.
 *
 * So the serialiser below keeps what an operator needs - the method, the request
 * id, the PATH - and drops what nobody needs: the query string, entirely, and
 * any run anywhere that looks like a viewing key.
 *
 * THE THIRD COPY IS NOT HERE. A reverse proxy in front of this gateway -
 * cloudflared, nginx, a load balancer - logs full URLs by default, and nothing
 * in this process can reach that. It belongs to the VPS runbook and is recorded
 * for HANDOFF-10 in the section 8 ledger.
 */
import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * The viewing-key encodings, matched loosely and on purpose.
 *
 * Unified full and incoming (`uview`, `uivk`), Sapling extended full
 * (`zxviews`, and the testnet spelling), Sapling incoming (`zivks`), and the
 * `secret-extended-key` spending-key forms - which are not viewing keys at all
 * but are strictly worse to log, so they are covered by the same net.
 *
 * Loose because a malformed key is still a key: a run that starts with one of
 * these prefixes is redacted whether or not its checksum would verify, since
 * the alternative is redacting only the well-formed ones and writing the rest
 * to disk.
 */
const KEY_SHAPED = /\b(uview|uivk|zxviews?|zxviewtestsapling|zivks?|zivktestsapling|secret-extended-key)[0-9a-z-]*/gi;

/** Replace anything key-shaped in a string. Exported so the assertion uses the same rule. */
export function redactKeys(value: string): string {
  return value.replace(KEY_SHAPED, "[redacted]");
}

/**
 * The path a request asked for, with the query string removed and anything
 * key-shaped redacted.
 *
 * BOTH HALVES ARE NEEDED. Dropping the query stops `?q=uview1...`; redacting the
 * remainder stops `/api/address/uview1...`, which is a path segment and survives
 * the first rule. A key can arrive in either and neither is hypothetical - the
 * address route is exactly where a reader who pasted the wrong thing would send
 * one.
 */
export function safePath(url: string): string {
  return redactKeys(url.split("?")[0] ?? url);
}

/** Fastify's request object, as much of it as this serialiser reads. */
interface RequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly id?: unknown;
  readonly ip?: string;
}

export interface GatewayLoggerOptions {
  readonly level: LoggerOptions["level"];
  /** Pretty-print, for a TTY. Never in production, where the sink is a file. */
  readonly pretty?: boolean;
}

/**
 * Build the gateway's logger.
 *
 * A FACTORY RATHER THAN A CONSTANT so the assertion can build one over a
 * capturing stream and exercise the same serialisers the real process uses. A
 * test that configured its own logger would be testing its own configuration.
 */
export function createGatewayLogger(options: GatewayLoggerOptions, destination?: NodeJS.WritableStream): Logger {
  const config: LoggerOptions = {
    level: options.level,
    ...(options.pretty === true && destination === undefined ? { transport: { target: "pino-pretty" } } : {}),
    serializers: {
      req: (req: RequestLike) => ({
        method: req.method,
        // The PATH, never the url. See the header comment.
        path: typeof req.url === "string" ? safePath(req.url) : undefined,
        id: req.id,
        ip: req.ip,
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      /**
       * An error's message and stack can both carry a URL - a fetch failure
       * names the endpoint it could not reach, and a routing error names the
       * path. Both go through the same redaction, and the stack is dropped
       * rather than redacted line by line: it is the least useful field in a
       * request log and the most likely to carry something unexpected.
       */
      err: (err: Error & { code?: unknown }) => ({
        type: err.name,
        message: redactKeys(err.message),
        ...(err.code === undefined ? {} : { code: err.code }),
      }),
    },
    /**
     * Removed outright rather than censored: a line that says
     * `"authorization":"[redacted]"` still records that a credential was
     * presented and, with a `Basic` scheme, how long it was.
     */
    redact: { paths: ["req.headers.authorization", "req.headers.cookie", "headers.authorization", "headers.cookie"], remove: true },
  };
  return destination === undefined ? pino(config) : pino(config, destination);
}
