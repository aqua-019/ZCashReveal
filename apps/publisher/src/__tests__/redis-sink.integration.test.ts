/**
 * A7 - the redis sink against a LOCAL Redis, and its fail side.
 *
 * A LOCAL REDIS, NEVER THE MANAGED STORE. docs/2.0/SNAPSHOT.md rule 5: "Tests,
 * local development and BUILDS never point at this store." The endpoint below is
 * `127.0.0.1:6379` - the `redis:7` service in CI, or a developer's own - and the
 * three keys written here are the same three the sink writes anywhere, which is
 * the point: the assertion exercises the real `ioredis` adapter, the real
 * `MULTI`, and the real TTL, without a single command reaching a database
 * someone else's production depends on.
 *
 * IF NOTHING IS LISTENING THIS SUITE SKIPS ITSELF WITH A NAMED REASON AND SAYS
 * SO. A green run that silently skipped an integration assertion is worse than a
 * red one: it reports coverage it does not have. The `runIf` case below fires in
 * exactly that situation so the skip appears in the output rather than as a
 * missing line.
 */

import { connect } from "node:net";

import { snapshotKeyForHeight, snapshotV1Schema, SNAPSHOT_KEYS } from "@zcashreveal/types";
import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import { createPublisherLogger } from "../logger.js";
import { SnapshotPublisher } from "../publisher.js";
import { createFileSink } from "../sinks/file.js";
import { connectManagedStore } from "../sinks/managed-store.js";
import { createRedisSink } from "../sinks/redis.js";
import { fixtureBuild, fixtureTip } from "./harness.js";

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

const LOCAL_URL = "redis://127.0.0.1:6379";
const CLOSED_URL = "redis://127.0.0.1:6399";
const TTL_SECONDS = 86_400;

/** Can a TCP connection be opened? The narrowest question that decides the skip. */
function probe(host: string, port: number, timeoutMs = 2_000): Promise<{ reachable: boolean; reason: string }> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (reachable: boolean, reason: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ reachable, reason });
    };
    socket.setTimeout(timeoutMs, () => done(false, `no answer from ${host}:${port} within ${timeoutMs}ms`));
    socket.once("connect", () => done(true, ""));
    socket.once("error", (err: Error) => done(false, `${host}:${port} - ${err.message}`));
  });
}

const local = await probe("127.0.0.1", 6379);

describe("A7 - the redis sink against a local Redis", () => {
  it.runIf(!local.reachable)(
    "A7 SKIPPED, WITH ITS REASON: no local Redis, so the integration half did not run",
    () => {
      expect(local.reason).not.toBe("");
      console.warn(`A7 integration skipped: ${local.reason}`);
    },
  );

  it.skipIf(!local.reachable)(
    "A7 PASS STATE: latest parses as SnapshotV1, height equals the tip, TTL is in (0, 86400]",
    async () => {
      const height = 3_901_234;
      const sink = createRedisSink({ connect: () => connectManagedStore(LOCAL_URL) });
      const publisher = new SnapshotPublisher({
        sinks: [sink],
        log: createPublisherLogger({ level: "silent" }),
        build: fixtureBuild,
      });
      await publisher.onTip(fixtureTip(height));
      await sink.close();

      const verifier = new Redis(LOCAL_URL);
      try {
        const latest = await verifier.get(SNAPSHOT_KEYS.latest);
        expect(latest).not.toBeNull();
        const parsed = snapshotV1Schema.parse(JSON.parse(latest ?? ""));
        expect(parsed.height).toBe(height);

        const heightValue = await verifier.get(SNAPSHOT_KEYS.height);
        expect(heightValue).toBe(String(height));

        const ttl = await verifier.ttl(snapshotKeyForHeight(height));
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(TTL_SECONDS);

        // `latest` carries NO TTL: a store that expires it produces the empty
        // dashboard this design exists to prevent. -1 is "no expiry".
        expect(await verifier.ttl(SNAPSHOT_KEYS.latest)).toBe(-1);
      } finally {
        await verifier.quit();
      }
    },
    30_000,
  );

  it(
    "A7 FAIL STATE: a closed port - the file sink still writes, the process stays up, the log carries sink=redis",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "zecreveal-a7-"));
      const snapshotFile = join(dir, "snapshot.json");

      let captured = "";
      const stream = new Writable({
        write(chunk: Buffer, _enc, cb) {
          captured += chunk.toString();
          cb();
        },
      });
      const log = createPublisherLogger({ level: "info" }, stream);

      const redisSink = createRedisSink({ connect: () => connectManagedStore(CLOSED_URL) });
      const publisher = new SnapshotPublisher({
        sinks: [createFileSink({ path: snapshotFile }), redisSink],
        log,
        build: fixtureBuild,
      });

      const outcome = await publisher.onTip(fixtureTip(3_902_000));
      await redisSink.close().catch(() => undefined);

      // The process is still here - `onTip` resolved rather than rejecting.
      expect(outcome.published).toBe(true);
      // The file sink is untouched by the other sink's failure.
      expect(JSON.parse(readFileSync(snapshotFile, "utf8"))).toMatchObject({ height: 3_902_000 });
      // And the failure was reported, naming the sink.
      expect(captured).toContain('"sink":"redis"');
      expect(captured).toContain("snapshot sink failed");
      expect(outcome.results?.find((r) => r.sink === "file")?.ok).toBe(true);
      expect(outcome.results?.find((r) => r.sink === "redis")?.ok).toBe(false);
    },
    30_000,
  );
});
