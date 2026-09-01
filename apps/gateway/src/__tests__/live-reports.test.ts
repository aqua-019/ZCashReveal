/**
 * The connect-time mempool frame reads `zcashreveal:mempool:live` through the
 * same reviver as the REST route - and until HANDOFF-12 it did not.
 *
 * HANDOFF-11 found the cast on `GET /v2/mempool` as a live 500 and revived
 * there. `server.ts` read the SAME hash for the first frame a new WebSocket
 * client receives, with `JSON.parse(raw) as LeakReport`, one file over. So on a
 * stack with one report in the mempool the route answered and the connect
 * frame threw inside `buildMempoolView`, was caught, and was logged - every new
 * client got no table. This suite is the executed reproduction and the fix.
 */
import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { REDIS_KEYS, serializeWire, type LeakReport } from "@zcashreveal/types";

import { readLiveReports } from "../live-reports.js";
import { snapshotFrame } from "../ws-broker.js";
import { SILENT } from "./harness.js";
import { NOW, report } from "./leak-report-fixture.js";

/** A Redis whose live hash holds exactly what the indexer writes: `JSON.stringify(serializeWire(report))`. */
function redisHolding(reports: LeakReport[]): Redis {
  const hash: Record<string, string> = {};
  for (const r of reports) hash[r.txid] = JSON.stringify(serializeWire(r));
  return {
    hgetall: (key: string) => Promise.resolve(key === REDIS_KEYS.mempoolLive ? hash : {}),
  } as unknown as Redis;
}

const ONE = report({ txid: "aa", vin: 1, orchardActions: 2, perPoolZat: [{ pool: "orchard", deltaZat: 100_000_000n }] });
const TWO = report({ txid: "bb", vout: 1, saplingSpends: 1, perPoolZat: [{ pool: "sapling", deltaZat: -250_000_000n }] });

describe("readLiveReports - one reader for the live hash", () => {
  it("PASS STATE: what the indexer stores comes back as the reports it stored, bigints and all", async () => {
    const reports = await readLiveReports(redisHolding([ONE, TWO]), SILENT);
    expect(reports).toHaveLength(2);
    expect(reports).toEqual(expect.arrayContaining([ONE, TWO]));
    // And the connect frame built from them is the frame built from the
    // originals - the table a client gets on connect is the table it would
    // have got from the route.
    expect(snapshotFrame(reports, NOW)).toEqual(snapshotFrame([ONE, TWO], NOW));
  });

  it("FAIL STATE, BY DATA: the cast server.ts used until HANDOFF-12 hands the frame a value it cannot render", async () => {
    // The member of the excluded set: the stored value, parsed and CAST rather
    // than revived - exactly the old `readLive` in server.ts. The frame builder
    // then hits a tagged bigint where it expects a bigint and throws, which is
    // what the connect handler caught and logged as "failed to send snapshot".
    const stored = await redisHolding([ONE]).hgetall(REDIS_KEYS.mempoolLive);
    const cast = Object.values(stored).map((raw) => JSON.parse(raw) as LeakReport);
    expect(() => snapshotFrame(cast, NOW)).toThrow(/Cannot mix BigInt/);
  });

  it("no Redis means no reports, not an error", async () => {
    expect(await readLiveReports(null, SILENT)).toEqual([]);
  });

  it("one malformed entry is skipped and the rest survive", async () => {
    const good = JSON.stringify(serializeWire(ONE));
    const redis = {
      hgetall: () => Promise.resolve({ [ONE.txid]: good, junk: "{not json" }),
    } as unknown as Redis;
    const reports = await readLiveReports(redis, SILENT);
    expect(reports).toEqual([ONE]);
  });
});
