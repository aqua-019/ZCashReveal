/**
 * The `SnapshotStore`: one case per source, both polarities, and the fault
 * record that makes a silent degradation impossible.
 *
 * WHY EACH RUNG GETS ITS OWN CASE RATHER THAN ONE "IT RESOLVES" TEST.
 * HANDOFF-11 section 4.1 asks for "a unit test per source", and the reason is
 * assertion A13: the resolution order's whole job is to answer from the FIRST
 * rung that can, and a test that only checks the final document cannot tell a
 * store that read the managed Redis from one that fell through four rungs to
 * the bundled fixture and rendered a stale site reporting no fault.
 *
 * THE MODULE IS RE-IMPORTED PER CASE. `resolveSnapshot` memoises at module
 * scope - deliberately, because that memo is what makes assertion A10's read
 * count one rather than one per render - so a second case in the same module
 * instance would read the first case's answer. `vi.resetModules()` plus a fresh
 * dynamic import gives each case its own store, which is also how the real
 * thing behaves: one module instance per server instance.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SNAPSHOT_MAX_REPORTS } from "@zcashreveal/types";

import type { MempoolBaseline } from "@/components/track/MempoolPanel";
import { fixtureSnapshot } from "@/lib/api/fixtures/snapshot";

const REST_URL = "SNAPSHOT_REDIS_KV_REST_API_URL";
const REST_TOKEN = "SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN";
const KV_URL = "SNAPSHOT_REDIS_KV_URL";
const TCP_URL = "SNAPSHOT_REDIS_REDIS_URL";
const API_URL = "NEXT_PUBLIC_API_URL";

const ALL = [REST_URL, REST_TOKEN, KV_URL, TCP_URL, API_URL];

/** A document that is NOT the fixture, so "which rung answered" is decidable by value. */
function publishedDoc(height: number) {
  return { ...fixtureSnapshot(), height };
}

/**
 * The wire form, which is a REPLACER and not a plain stringify.
 *
 * `JSON.stringify` THROWS ON A `bigint` and the throw is the good case
 * (`packages/zec-types/src/snapshot.ts` says so where `serializeSnapshot` is
 * defined). The first draft of the malformed-document case below stringified
 * without a replacer, so it threw inside the fetch mock and the store recorded
 * `the managed store did not answer (TypeError)` - a fault, and a green-looking
 * failure that never reached the schema guard it was written to exercise. The
 * probe was wrong, not the code; reported here rather than quietly repaired,
 * per CLAUDE.md's rule about checking the instrument first.
 */
function serialise(doc: unknown): string {
  return JSON.stringify(doc, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/snapshot/store");
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of ALL) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ALL) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("A3 - source 1: the managed store over REST", () => {
  it("PASS STATE: with the REST pair set, the document comes from redis-rest and no fault is recorded", async () => {
    const doc = publishedDoc(4_000_001);
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "read-only-token";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: serialise(doc) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("redis-rest");
    expect(resolved.doc.height).toBe(4_000_001);
    expect(resolved.faults).toEqual([]);
    expect(managedStoreReadCount()).toBe(1);

    // THE READ-ONLY TOKEN, NEVER THE READ-WRITE ONE. `SNAPSHOT.md` rule 6, and
    // the half assertion A8 cannot see: a grep proves the read-write NAME is
    // not read, and this proves the value actually sent is the read-only one.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer read-only-token");

    // ONE KEY, INSIDE THE OWNED NAMESPACE. No scan, no enumeration.
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(encodeURIComponent("zecreveal:snapshot:latest"));
  });

  it("FAIL STATE, BY DATA: a configured REST pair that answers 500 records a fault and does NOT resolve silently", async () => {
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "read-only-token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    // It still renders - the site can never be empty - but it says so.
    expect(resolved.source).toBe("fixture");
    expect(resolved.faults).toHaveLength(1);
    expect(resolved.faults[0]?.rung).toBe("redis-rest");
    expect(resolved.faults[0]?.reason).toContain("500");
  });

  it("FAIL STATE, BY DATA: an EMPTY token is absent rather than configured, so the e2e blanking is not a permanent fault", async () => {
    // `playwright.config.ts` sets all five names to the EMPTY STRING rather
    // than deleting them, because Playwright merges webServer.env over
    // process.env and only a present-but-empty value reliably overrides an
    // inherited one. A store that treated "" as configured would turn that
    // guard into a rung that is configured and always fails.
    process.env[REST_URL] = "";
    process.env[REST_TOKEN] = "";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.faults).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(managedStoreReadCount()).toBe(0);
  });

  it("FAIL STATE, BY DATA: a document that is not a SnapshotV1 is a fault, not a render", async () => {
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "read-only-token";
    // A value drawn from the set the schema rejects: the required `hash` is
    // gone. `SnapshotV1`'s four required fields exist so that a page can never
    // print a number with no height beside it.
    const broken = { ...publishedDoc(4_000_002) } as Record<string, unknown>;
    delete broken["hash"];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: serialise(broken) }), { status: 200 })));

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.faults[0]?.reason).toContain("not a SnapshotV1");
  });
});

describe("A3 - source 2: the managed store over TCP", () => {
  it("PASS STATE: with only a TCP URL set, the document comes from redis", async () => {
    const doc = publishedDoc(4_000_003);
    process.env[KV_URL] = "rediss://mock.example:6379";
    const get = vi.fn(async () => serialise(doc));
    const quit = vi.fn(async () => "OK");
    vi.doMock("ioredis", () => ({ Redis: class { get = get; quit = quit; } }));

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("redis");
    expect(resolved.doc.height).toBe(4_000_003);
    expect(get).toHaveBeenCalledWith("zecreveal:snapshot:latest");
    // ONE CONNECTION, CLOSED. A long-lived pool in a serverless function is a
    // connection leaked per instance.
    expect(quit).toHaveBeenCalledTimes(1);
    expect(managedStoreReadCount()).toBe(1);
    vi.doUnmock("ioredis");
  });

  it("FAIL STATE, BY DATA: a configured TCP URL holding no snapshot records a fault", async () => {
    process.env[TCP_URL] = "rediss://mock.example:6379";
    vi.doMock("ioredis", () => ({
      Redis: class { get = async () => null; quit = async () => "OK"; },
    }));

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.faults[0]?.rung).toBe("redis");
    expect(resolved.faults[0]?.reason).toContain("no snapshot yet");
    vi.doUnmock("ioredis");
  });
});

describe("A3 - source 3: the gateway", () => {
  it("PASS STATE: with only the API URL set, the document comes from the gateway - at /v2/snapshot, not /api", async () => {
    const doc = publishedDoc(4_000_004);
    process.env[API_URL] = "https://gateway.example";
    const fetchMock = vi.fn(async () => new Response(serialise(doc), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("gateway");
    expect(resolved.doc.height).toBe(4_000_004);
    // THE PATH IS THE POINT. Section 3 as written spelled this `/api/snapshot`
    // while section 4.2 of the same handoff deletes the `/api` prefix, so a rung
    // written against it would answer 410 the moment the gateway change landed
    // and fall silently through to the fixture. Corrected by deliverable 0, and
    // pinned here so the correction cannot be undone by an edit.
    expect((fetchMock.mock.calls as unknown as [string][])[0]?.[0]).toBe("https://gateway.example/v2/snapshot");
    // The gateway is this project's own box, so it draws on no shared allowance.
    expect(managedStoreReadCount()).toBe(0);
  });

  it("FAIL STATE, BY DATA: the gateway's own 503 - the answer it gives when the publisher has not written - is a fault", async () => {
    process.env[API_URL] = "https://gateway.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no snapshot is available", reason: "absent" }), { status: 503 })),
    );

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.faults[0]?.rung).toBe("gateway");
    expect(resolved.faults[0]?.reason).toContain("503");
  });
});

describe("A3 - source 4: the bundled fixture", () => {
  it("PASS STATE: with nothing configured, the fixture answers and NO fault is recorded", async () => {
    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.doc.height).toBe(fixtureSnapshot().height);
    // AN UNSET VARIABLE IS A DEPLOYMENT CHOICE, NOT A FAULT. A preview build
    // with no store configured is working as intended, and a fault there would
    // make the indicator cry wolf on every such build.
    expect(resolved.faults).toEqual([]);
  });

  it("is TOTAL: the last rung is a bundled import, so no configuration can produce no document", async () => {
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "t";
    process.env[KV_URL] = "rediss://mock.example:6379";
    process.env[API_URL] = "https://gateway.example";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    vi.doMock("ioredis", () => ({
      Redis: class { get = async () => { throw new Error("down"); }; quit = async () => "OK"; },
    }));

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    // Every rung configured, every rung down, and the page still renders -
    // which is plan decision 2's whole goal: "empty dashboards become
    // structurally impossible."
    expect(resolved.source).toBe("fixture");
    expect(resolved.doc.schema).toBe(1);
    // AND ALL THREE FAILURES ARE NAMED. This is assertion A13's core: the
    // indicator must fail when the FIRST source is unreachable, not merely when
    // the last one is.
    expect(resolved.faults.map((f) => f.rung)).toEqual(["redis-rest", "redis", "gateway"]);
    vi.doUnmock("ioredis");
  });
});

describe("A10 - reads are counted, and the count is per window rather than per render", () => {
  it("PASS STATE: two resolutions inside one window issue ONE managed-store GET", async () => {
    const doc = publishedDoc(4_000_005);
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "t";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: serialise(doc) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    // The two pages section 3 names, rendered together.
    const splash = await resolveSnapshot();
    const pools = await resolveSnapshot();

    expect(splash.doc.height).toBe(pools.doc.height);
    expect(managedStoreReadCount()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("PASS STATE: ten concurrent callers share ONE in-flight read, not ten", async () => {
    // The component case. Section 3: "never once per component". A memo that
    // only caches the RESULT still issues N reads when N callers arrive before
    // the first answer, which on a cold instance is exactly what happens.
    const doc = publishedDoc(4_000_006);
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "t";
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => { resolve(new Response(JSON.stringify({ result: serialise(doc) }), { status: 200 })); }, 5);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    const all = await Promise.all(Array.from({ length: 10 }, () => resolveSnapshot()));

    expect(all.every((r) => r.doc.height === 4_000_006)).toBe(true);
    expect(managedStoreReadCount()).toBe(1);
  });

  it("FAIL STATE, BY DATA: a resolution older than the window issues a SECOND read rather than serving a stale document", async () => {
    // The other polarity of the same rule, and the one that stops the memo
    // becoming a cache with no expiry: a document older than the revalidation
    // window the page advertises must not be served under it.
    const doc = publishedDoc(4_000_007);
    process.env[REST_URL] = "https://mock.example";
    process.env[REST_TOKEN] = "t";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: serialise(doc) }), { status: 200 })));

    const store = await freshStore();
    await store.resolveSnapshot();
    expect(store.managedStoreReadCount()).toBe(1);

    const realNow = Date.now;
    try {
      const t = realNow();
      vi.spyOn(Date, "now").mockImplementation(() => t + store.SNAPSHOT_TTL_MS + 1);
      await store.resolveSnapshot();
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
    expect(store.managedStoreReadCount()).toBe(2);
  });
});

describe("the snapshot's lastReports is a mempool baseline, which is what section 3's fallback rests on", () => {
  it("PASS STATE: a baseline built from the document satisfies the panel's prop, with NO summary", () => {
    // Section 3: "the mempool island hydrates from `snapshot.lastReports` then
    // subscribes to WS". `/track` used to `await zec.getMempool()` with nothing
    // around it - a 500 once `api()` became `HttpApi` and the gateway did not
    // answer, on the one page that exists so the site can never render empty.
    //
    // THE TYPE IS THE ASSERTION. `MempoolPanel` took a whole `MempoolView` and
    // read two fields of it, so a caller with rows and no aggregate had to
    // invent a `MempoolSummary` - and a summary of zeros renders as a
    // MEASUREMENT: "0.0 kB", "0 findings", "0 of 0 priced pay it". Narrowing
    // the prop to what is read is what makes the fallback need no fiction, and
    // this case fails to compile if that narrowing is undone.
    const doc = fixtureSnapshot();
    const baseline: MempoolBaseline = { tipHeight: doc.height, entries: doc.lastReports };

    expect(baseline.tipHeight).toBe(doc.height);
    expect(Array.isArray(baseline.entries)).toBe(true);
    // A `MempoolSummary` is not on it, and there is nowhere to put one.
    expect(baseline).not.toHaveProperty("summary");
  });

  it("the document caps its rows, so the fallback cannot grow without bound", () => {
    const doc = fixtureSnapshot();
    expect(doc.lastReports.length).toBeLessThanOrEqual(SNAPSHOT_MAX_REPORTS);
  });
});
