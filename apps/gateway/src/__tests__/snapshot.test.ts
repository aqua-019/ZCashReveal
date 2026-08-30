import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { snapshotV1Schema } from "@zcashreveal/types";

import { harness, type Harness } from "./harness.js";
import { WS_SNAPSHOT_CHANNEL } from "../ws-broker.js";

/**
 * Assertion A9, both halves and both polarities.
 *
 * A9: "GET /api/snapshot returns the latest file with `Cache-Control: max-age=60`;
 * the WS snapshot frame is the first frame a new client receives."
 *
 * THE FILE IS REAL AND SO IS THE SERVER. Every test here writes an actual
 * document into an actual temporary directory and points the actual config at
 * it, because the route's whole job is reading a file another process renamed
 * into place - a mocked reader would assert that this suite can build an object.
 * The WebSocket half listens on a real port and connects a real client, for the
 * same reason: "the FIRST frame" is a statement about bytes in order on a
 * socket, and `app.inject()` has no socket.
 *
 * THE NODE IS A THROWER ON PURPOSE. The snapshot path asks Zebra for nothing,
 * and a scripted node that answered would hide a route that had started asking.
 */

const HASH = "ab".repeat(32);
const HEIGHT = 3_456_227;

/** A node that fails loudly, because nothing on this path may reach one. */
const noNode = (method: string): never => {
  throw new Error(`the snapshot path asked the node for ${method}, and it must ask for nothing`);
};

/**
 * A valid `SnapshotV1` as it appears ON DISK: zatoshi as decimal strings.
 *
 * `serializeSnapshot` is what writes these in production, and it writes every
 * `bigint` as a decimal string. Building the fixture by hand in that shape is
 * the point - it is the shape the gateway must be able to read back, and a
 * fixture built from a live `SnapshotV1` object would prove only that this file
 * agrees with itself.
 */
function fixtureDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 1,
    height: HEIGHT,
    hash: HASH,
    time: "2026-08-30T12:00:00.000Z",
    publishedAt: "2026-08-30T12:00:03.000Z",
    pools: [{ lane: "orchard", balanceZat: "70884100000000", share: 0.042 }],
    residual: {
      unprovableZat: "73146200000000",
      supplyZat: "1688998700000000",
      supplySource: "getblockchaininfo valuePools, summed",
      unprovableShare: 0.043309,
      verifiedShare: 0.956691,
    },
    drain: null,
    migrationHist: null,
    neffSeries: null,
    lastReports: [],
    labelsVersion: "labels-2026-08-22",
    ...overrides,
  };
}

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "zecreveal-gateway-snapshot-"));
  file = join(dir, "snapshot.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A path inside the temp directory that nothing writes. */
function missingPath(): string {
  return join(dir, "never-written", "snapshot.json");
}

async function write(document: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(document), "utf8");
}

describe("A9 - GET /api/snapshot serves the latest file with Cache-Control: max-age=60", () => {
  it("A9 PASS STATE: the published document is served with max-age=60, and it is a V1", async () => {
    await write(fixtureDocument());
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });

    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("max-age=60");

    // The served bytes are re-parsed by the SAME schema apps/web will use, so
    // this is the client's question and not a restatement of the route's own.
    const parsed = snapshotV1Schema.safeParse(res.json());
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);

    const body = res.json() as {
      height: number;
      hash: string;
      pools: { lane: string; balanceZat: string }[];
      residual: { unprovableZat: string };
    };
    expect(body.height).toBe(HEIGHT);
    expect(body.hash).toBe(HASH);
    // A STRING, not a number, and that is half of why this project counts in
    // zatoshi: 708,841 ZEC survives a double and 50,000.5541 ZEC does not.
    expect(body.pools[0]?.balanceZat).toBe("70884100000000");
    expect(body.residual.unprovableZat).toBe("73146200000000");
    await h.close();
  });

  it("A9 PASS STATE: /v2/snapshot serves the same document, since the shipped client uses that prefix", async () => {
    await write(fixtureDocument());
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const api = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    const v2 = await h.app.inject({ method: "GET", url: "/v2/snapshot" });
    expect(v2.statusCode).toBe(200);
    expect(v2.headers["cache-control"]).toBe("max-age=60");
    expect(v2.json()).toEqual(api.json());
    await h.close();
  });

  it("A9 PASS STATE: the body is the file on disk and not a constant - a second height serves that height", async () => {
    await write(fixtureDocument({ height: 3_456_228, hash: "cd".repeat(32) }));
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect((res.json() as { height: number }).height).toBe(3_456_228);
    await h.close();
  });

  it("A9 FAIL STATE: with no snapshot file the route answers 503, and NEVER an empty 200", async () => {
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: missingPath() } });
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });

    expect(res.statusCode).toBe(503);
    expect(res.statusCode).not.toBe(200);

    // A client can tell it apart from a real snapshot WITHOUT reading the
    // status: the body is not a V1, so a snapshot store that parses first still
    // falls through to its next source instead of caching an empty document.
    // That is the argument the 501 stub made and it did not stop binding.
    expect(snapshotV1Schema.safeParse(res.json()).success).toBe(false);
    const body = res.json() as { error: string; reason: string; height?: number };
    expect(body.reason).toBe("absent");
    expect(body.height).toBeUndefined();

    // And the absence is not cacheable: a shared cache holding it for sixty
    // seconds would keep answering "no snapshot" for a minute after the first
    // publish.
    expect(res.headers["cache-control"]).toBe("no-store");
    await h.close();
  });
});

describe("A9 - a snapshot file that fails snapshotV1Schema is not served as a 200", () => {
  it("FAIL STATE: a document with no `hash` is a 503 that names the field", async () => {
    const document = fixtureDocument();
    delete document["hash"];
    await write(document);
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });

    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { reason: string; issues: { path: string }[] };
    expect(body.reason).toBe("invalid");
    expect(body.issues.map((i) => i.path)).toContain("hash");
    await h.close();
  });

  it("FAIL STATE: a version this gateway does not understand is a 503, not a best-effort 200", async () => {
    // The distinction docs/2.0/SNAPSHOT.md section 8.2 draws: a V2 is "a
    // snapshot I do not understand", which falls through, and it is a parse
    // result rather than a guess because `schema` is a literal.
    await write(fixtureDocument({ schema: 2 }));
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { reason: string }).reason).toBe("invalid");
    await h.close();
  });

  it("FAIL STATE: a zatoshi written as a JSON number is refused rather than rounded", async () => {
    // The realistic publisher defect: a writer that bypassed
    // `serializeSnapshot` and let JSON.stringify emit a float. 708,841 ZEC
    // would survive; the rule is that the gateway never has to know which
    // values would.
    await write(fixtureDocument({ pools: [{ lane: "orchard", balanceZat: 70_884_100_000_000, share: 0.042 }] }));
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { reason: string }).reason).toBe("invalid");
    await h.close();
  });

  it("FAIL STATE: a half-written file is a 503 with reason `malformed`, and the parser's words are not echoed", async () => {
    await writeFile(file, '{"schema":1,"height":34', "utf8");
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { reason: string; detail: string };
    expect(body.reason).toBe("malformed");
    expect(body.detail).toBe("the snapshot file is not JSON");
    // The path is a fact about this box and never reaches a reader.
    expect(JSON.stringify(body)).not.toContain(dir);
    await h.close();
  });
});

/* ============================================================================
   The WebSocket half of A9: a real socket, and the order of the bytes on it
   ========================================================================== */

interface WireFrame {
  readonly channel: string;
  readonly payload: unknown;
}

interface Stream {
  readonly frames: WireFrame[];
  waitFor(n: number, ms?: number): Promise<void>;
  settle(ms: number): Promise<void>;
  close(): void;
}

/**
 * Listen, connect a real client, and record every frame in arrival order.
 *
 * Node 22's global `WebSocket` rather than the `ws` package: `ws` is a
 * transitive dependency of `@fastify/websocket` and not one this package
 * declares, and reaching through another package's node_modules to test our own
 * would be a dependency nobody wrote down.
 */
async function openStream(h: Harness): Promise<Stream> {
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = h.app.server.address() as AddressInfo;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/stream`);

  const frames: WireFrame[] = [];
  const waiting: { n: number; resolve: () => void }[] = [];

  socket.addEventListener("message", (ev) => {
    frames.push(JSON.parse(String(ev.data)) as WireFrame);
    for (const w of [...waiting]) {
      if (frames.length >= w.n) {
        waiting.splice(waiting.indexOf(w), 1);
        w.resolve();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("the websocket refused to open")));
  });

  return {
    frames,
    /**
     * `ms` is well under vitest's own 5,000 ms test timeout ON PURPOSE.
     *
     * The two are a race, and the loser writes the failure message. At 5,000 ms
     * vitest won it and reported "Test timed out in 5000ms", which says nothing
     * about frames - measured, against a build with the snapshot send removed.
     * At 2,000 ms this rejection wins and names the count it saw, which is what
     * a reader of a failing A9 needs.
     */
    waitFor(n, ms = 2_000) {
      if (frames.length >= n) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`waited ${ms} ms for ${n} frames and saw ${frames.length}`)),
          ms,
        );
        waiting.push({
          n,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
        });
      });
    },
    settle(ms) {
      return new Promise<void>((resolve) => setTimeout(resolve, ms));
    },
    close() {
      socket.close();
    },
  };
}

describe("A9 - the WS snapshot frame is the FIRST frame a new client receives", () => {
  it("A9 PASS STATE: frame 1 is the SnapshotV1 document, frame 2 is the mempool snapshot", async () => {
    await write(fixtureDocument());
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const stream = await openStream(h);

    await stream.waitFor(2);

    const first = stream.frames[0];
    expect(first?.channel).toBe(WS_SNAPSHOT_CHANNEL);
    const payload = first?.payload as { type: string; snapshot: unknown };
    // NOT `snapshot`, which zecFrameSchema already uses for the MEMPOOL view.
    expect(payload.type).toBe("snapshot_v1");
    const parsed = snapshotV1Schema.safeParse(payload.snapshot);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
    expect((payload.snapshot as { height: number }).height).toBe(HEIGHT);

    // The mempool snapshot still goes out, second. It was not replaced.
    const second = stream.frames[1];
    expect(second?.channel).toBe("zcashreveal:mempool");
    expect((second?.payload as { type: string }).type).toBe("mempool_snapshot");

    stream.close();
    await h.close();
  });

  it("A9 PASS STATE: the frame rides inside the { channel, payload } envelope and is not a bare frame", async () => {
    // The narrowing `ws-broker.test.ts` guards with its @ts-expect-error, read
    // off the wire rather than off the type: every frame a client sees has
    // exactly the two envelope keys.
    await write(fixtureDocument());
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const stream = await openStream(h);
    await stream.waitFor(2);
    for (const frame of stream.frames) {
      expect(Object.keys(frame).sort()).toEqual(["channel", "payload"]);
    }
    stream.close();
    await h.close();
  });

  it("A9 PASS STATE: the frame and GET /api/snapshot carry the identical document", async () => {
    // The two go through the same `toJsonSafe`, one of them behind `respond`.
    // That they therefore agree is an argument; this is the measurement, and it
    // is what stops the WebSocket half and the REST half drifting into two
    // spellings of one document - which is the drift `views.ts` records as the
    // reason the mempool `snapshot` frame and this one had to be named apart.
    await write(fixtureDocument());
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: file } });
    const stream = await openStream(h);
    await stream.waitFor(1);
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });

    const framed = (stream.frames[0]?.payload as { snapshot: unknown }).snapshot;
    expect(framed).toEqual(res.json());

    stream.close();
    await h.close();
  });

  it("A9 FAIL STATE: with no snapshot file the client gets the mempool frame and NO placeholder snapshot", async () => {
    const h = await harness({ handle: noNode, env: { SNAPSHOT_FILE: missingPath() } });
    const stream = await openStream(h);

    await stream.waitFor(1);
    // Long enough for a second frame to have arrived if one were ever sent:
    // the snapshot read that would produce it has already failed by the time
    // the mempool frame goes out, because the two are awaited in order.
    await stream.settle(250);

    expect(stream.frames.length).toBe(1);
    expect(stream.frames[0]?.channel).toBe("zcashreveal:mempool");
    expect(stream.frames.some((f) => f.channel === WS_SNAPSHOT_CHANNEL)).toBe(false);

    stream.close();
    await h.close();
  });
});
