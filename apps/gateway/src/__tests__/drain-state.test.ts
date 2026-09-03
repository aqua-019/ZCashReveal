/**
 * `readDrainState`: the gateway's half of HANDOFF-15's staleness figure.
 *
 * DRIVEN AGAINST A REDIS DOUBLE THAT REMEMBERS WHAT IT WAS TOLD, not one that
 * answers a constant. HANDOFF-12's anchor-memo defect was found by exactly that
 * upgrade to a double, and the same shape is available here: a reader that
 * always answered null and a Redis that held nothing are indistinguishable from
 * the result.
 *
 * F-56-1: `live-reports.ts` and `packages/zec-types/src/realtime.ts`'s
 * `MempoolDrainState` were read line-by-line before these probes were written.
 */
import { describe, expect, it } from "vitest";
import pino from "pino";
import type { Redis } from "ioredis";
import { REDIS_KEYS, type MempoolDrainState } from "@zcashreveal/types";

import { readDrainState } from "../live-reports.js";

const log = pino({ level: "silent" });

function redisHolding(entries: Record<string, string>): Redis {
  return {
    get: (key: string) => Promise.resolve(entries[key] ?? null),
  } as unknown as Redis;
}

const STATE: MempoolDrainState = {
  observed: 9,
  analysed: 3,
  complete: false,
  deferred: 6,
  refused: false,
  completeAtMs: 1_000_000,
  updatedAtMs: 1_120_000,
  ceilingPerMinute: 5,
  txPerMinute: 3,
};

describe("readDrainState", () => {
  it("ages the timestamps against the response clock rather than shipping them raw", () => {
    // The server knows both ends of the subtraction. A browser doing it against
    // its own clock is where "3 seconds ago" on a minute-old cached page comes
    // from, and where negative durations come from.
    const now = 1_180_000;
    return readDrainState(
      redisHolding({ [REDIS_KEYS.mempoolDrain]: JSON.stringify(STATE) }),
      log,
      now,
    ).then((drain) => {
      expect(drain).not.toBeNull();
      expect(drain?.completeSecondsAgo).toBe(180);
      expect(drain?.updatedSecondsAgo).toBe(60);
      expect(drain?.analysed).toBe(3);
      expect(drain?.observed).toBe(9);
      expect(drain?.deferred).toBe(6);
      expect(drain?.ceilingPerMinute).toBe(5);
    });
  });

  it("carries a never-complete drain through as null and NOT as zero seconds ago", async () => {
    // THE MEMBER OF THE EXCLUSION SET IS A ZERO. `completeAtMs: null` means the
    // indexer has never finished a drain; `completeSecondsAgo: 0` would tell a
    // reader the view was complete a moment ago. That is `snapshot age: 0
    // blocks` beside twelve-day-old data, on a second surface.
    const drain = await readDrainState(
      redisHolding({
        [REDIS_KEYS.mempoolDrain]: JSON.stringify({ ...STATE, completeAtMs: null }),
      }),
      log,
      1_180_000,
    );
    expect(drain?.completeSecondsAgo).toBeNull();
    expect(drain?.completeSecondsAgo).not.toBe(0);
  });

  it("floors a clock skew at zero instead of publishing a negative age", async () => {
    // A gateway one second behind the indexer would otherwise emit a negative
    // count, which `countSchema` rejects - so `/v2/mempool` would 500 for the
    // whole view on a clock difference nobody would think to look for.
    const drain = await readDrainState(
      redisHolding({ [REDIS_KEYS.mempoolDrain]: JSON.stringify(STATE) }),
      log,
      STATE.updatedAtMs - 5_000,
    );
    expect(drain?.updatedSecondsAgo).toBe(0);
  });

  it("answers null for an absent key, a null Redis, and a malformed value", async () => {
    // Three causes, one honest answer: nothing here knows how complete the view
    // is. The renderer says so; distinguishing the three is the indexer's log's
    // job rather than a chip on a public page.
    expect(await readDrainState(redisHolding({}), log, 1)).toBeNull();
    expect(await readDrainState(null, log, 1)).toBeNull();
    expect(
      await readDrainState(redisHolding({ [REDIS_KEYS.mempoolDrain]: "{not json" }), log, 1),
    ).toBeNull();
  });

  it("reads the VPS key and not the managed store's namespace", async () => {
    // A5. `zcashreveal:` is the VPS instance; `zecreveal:` is the shared
    // managed store, one letter apart, and SNAPSHOT.md exists because of that.
    expect(REDIS_KEYS.mempoolDrain).toBe("zcashreveal:mempool:drain");
    expect(REDIS_KEYS.mempoolDrain.startsWith("zecreveal:")).toBe(false);
    // FAIL SIDE BY DATA: the same document under the managed store's spelling
    // is not found, because this reader asks for one key and only one.
    const drain = await readDrainState(
      redisHolding({ "zecreveal:mempool:drain": JSON.stringify(STATE) }),
      log,
      1_180_000,
    );
    expect(drain).toBeNull();
  });
});
