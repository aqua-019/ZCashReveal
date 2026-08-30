/**
 * What a sink is, and what "independent" means (docs/2.0/SNAPSHOT.md section 8.5).
 *
 * SINKS ARE INDEPENDENT AND THE PROCESS NEVER EXITS ON A SINK FAILURE. A failing
 * sink is logged as `{sink, err}` and the others still write. That is not
 * defensive habit, it is the design goal restated: the snapshot exists so the
 * public site renders when the VPS or the tunnel is down, and a publisher that
 * died because the managed store was briefly unreachable would take the FILE
 * sink - the gateway's own copy - down with it, converting a partial outage into
 * a total one.
 *
 * ONE SERIALISATION, SHARED BY EVERY SINK. `serializeSnapshot` is handed to the
 * sinks already applied, rather than each sink calling it, so there is exactly
 * one answer to "how does a zatoshi appear in the document" and so that two
 * sinks can never disagree about the bytes for one tip.
 */

import type { SnapshotV1 } from "@zcashreveal/types";

/** Something that writes one snapshot somewhere. */
export interface Sink {
  /** `file`, `redis`. Appears verbatim in the failure log line, which A7's fail side reads. */
  readonly name: string;
  /**
   * How many commands one `write` spends against the SHARED managed-store
   * allowance. `0` for a sink that does not touch it.
   *
   * ON THE SINK RATHER THAN INFERRED FROM ITS NAME, because the monthly ceiling
   * is the mechanism by which this project can never rate limit the other one
   * (docs/2.0/SNAPSHOT.md section 5), and a mechanism that decided which sinks
   * to charge by string-matching `"redis"` would silently stop charging the day
   * a sink was renamed. The publisher sums this over the sinks it attempted, and
   * drops every sink with a non-zero cost once the ceiling is reached.
   */
  readonly managedStoreCommandsPerWrite: number;
  /**
   * Write one snapshot.
   *
   * @param snapshot the document, for a sink that needs a field out of it
   * @param json the same document through `serializeSnapshot`
   */
  write(snapshot: SnapshotV1, json: string): Promise<void>;
  /** Release whatever the sink holds. Never writes anything. */
  close(): Promise<void>;
}

/** What one sink did with one snapshot. */
export interface SinkResult {
  readonly sink: string;
  readonly ok: boolean;
  readonly err?: unknown;
}

/** The subset of a pino logger this module uses. */
export interface SinkLogger {
  error(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Write one snapshot to every sink, independently.
 *
 * NEVER REJECTS AND NEVER RETHROWS. The return value carries what happened to
 * each sink, so a caller that wants to count failures can, and a caller that
 * does not is not made to handle an exception it must swallow anyway.
 *
 * SEQUENTIAL RATHER THAN `Promise.all`. The sinks are two - a local file and one
 * network round trip per block - so concurrency buys nothing measurable, and the
 * sequential form means a rejection in one cannot be observed by another as an
 * unhandled rejection while it is still in flight.
 */
export async function writeToAllSinks(
  sinks: ReadonlyArray<Sink>,
  snapshot: SnapshotV1,
  json: string,
  log: SinkLogger,
): Promise<SinkResult[]> {
  const results: SinkResult[] = [];
  for (const sink of sinks) {
    try {
      await sink.write(snapshot, json);
      results.push({ sink: sink.name, ok: true });
    } catch (err) {
      // `{sink, err}` is SNAPSHOT.md section 8.5's own shape, and A7's fail side
      // asserts on the `sink` field of this line.
      log.error({ sink: sink.name, err, height: snapshot.height }, "snapshot sink failed");
      results.push({ sink: sink.name, ok: false, err });
    }
  }
  return results;
}
