/**
 * A3, over a real socket.
 *
 * WHAT THIS ADDS OVER `snapshot-store.test.ts`, which mocks `fetch`. A spy
 * records what the code MEANT to send; a server records what it ACTUALLY got.
 * The three things this handoff can most easily get wrong are all on that side
 * of the boundary: the URL the rung constructs, the bearer header it sends, and
 * the key it asks for. `docs/2.0/SNAPSHOT.md` rule 6 turns the second into a
 * rule - `apps/web` reads with the READ-ONLY token and never the read-write one
 * - and a mocked `fetch` cannot tell a correct Authorization header from a
 * plausible one, because nothing on the other end reads it.
 *
 * THE SERVER IS A MOCK AND NOT THE MANAGED STORE, which is rule 5 rather than
 * convenience: that database is shared with an unrelated production project and
 * every read of it is a command drawn from an allowance that project is also
 * drawing on.
 *
 * It listens on an EPHEMERAL port and is closed in `afterAll`. The first
 * version of the mock listened at import time on a fixed port, so a process
 * that imported it never exited and held 3212 - which then failed the next run
 * with "already used". A factory that a test starts and stops has neither
 * problem.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fixtureSnapshot } from "@/lib/api/fixtures/snapshot";

 
const mock = (await import("../e2e/support/mock-store.mjs")) as any;

let store: { server: { close: (cb?: () => void) => void }; url: string };

beforeAll(async () => {
  // Port 0: the OS picks a free one, so this suite cannot collide with a
  // Playwright run, a developer's server, or itself under a re-run.
  store = await mock.startMockStore(0);
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    store.server.close(() => {
      resolve();
    });
  });
});

const NAMES = [
  "SNAPSHOT_REDIS_KV_REST_API_URL",
  "SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN",
  "SNAPSHOT_REDIS_KV_URL",
  "SNAPSHOT_REDIS_REDIS_URL",
  "NEXT_PUBLIC_API_URL",
];

async function freshStore() {
  vi.resetModules();
  return import("@/lib/snapshot/store");
}

function clearEnv() {
  for (const n of NAMES) delete process.env[n];
}

describe("A3 over a real socket - the redis-rest rung against a listening server", () => {
  it("PASS STATE: it resolves `redis-rest` and renders THAT document, by value", async () => {
    clearEnv();
    process.env["SNAPSHOT_REDIS_KV_REST_API_URL"] = store.url;
    process.env["SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN"] = mock.READ_ONLY_TOKEN;

    const { resolveSnapshot, managedStoreReadCount } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("redis-rest");
    expect(resolved.faults).toEqual([]);
    // BY VALUE, NOT BY SOURCE. An assertion that only read `source: redis-rest`
    // would pass on a resolution that reached the rung and then returned the
    // bundled document. This height exists in no other document here.
    expect(resolved.doc.height).toBe(mock.DOCUMENT.height);
    expect(resolved.doc.height).not.toBe(fixtureSnapshot().height);
    expect(resolved.doc.pools[0]?.balanceZat).toBe(BigInt(mock.DOCUMENT.pools[0].balanceZat));
    expect(managedStoreReadCount()).toBe(1);
    clearEnv();
  });

  it("FAIL STATE, BY DATA: the WRONG token is refused by the server, so the rung faults and the site falls through", async () => {
    // The member of the exclusion set rule 6 names: a build reading with
    // anything but the read-only token. The server answers 401, which is what a
    // mocked `fetch` cannot produce without being told to.
    clearEnv();
    process.env["SNAPSHOT_REDIS_KV_REST_API_URL"] = store.url;
    process.env["SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN"] = "the-wrong-token";

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.faults[0]?.rung).toBe("redis-rest");
    expect(resolved.faults[0]?.reason).toContain("401");
    clearEnv();
  });

  it("FAIL STATE, BY DATA: a rung pointed at a CLOSED port faults rather than hanging or throwing", async () => {
    // A13's own case: configured and unreachable. The site must still render,
    // and it must say that a configured source did not answer - the difference
    // between a stale site that reports a fault and one that does not.
    clearEnv();
    process.env["SNAPSHOT_REDIS_KV_REST_API_URL"] = "http://127.0.0.1:9";
    process.env["SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN"] = mock.READ_ONLY_TOKEN;

    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();

    expect(resolved.source).toBe("fixture");
    expect(resolved.doc.schema).toBe(1);
    expect(resolved.faults).toHaveLength(1);
    expect(resolved.faults[0]?.rung).toBe("redis-rest");
    clearEnv();
  });

  it("the server observed the ONE key inside the owned namespace, and no other request", async () => {
    // Rules 1, 3 and 7 of SNAPSHOT.md, checked at the only place they can be
    // observed rather than asserted: the server. A 404 from this mock means the
    // rung asked for something it should not have.
    clearEnv();
    process.env["SNAPSHOT_REDIS_KV_REST_API_URL"] = store.url;
    process.env["SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN"] = mock.READ_ONLY_TOKEN;
    const { resolveSnapshot } = await freshStore();
    const resolved = await resolveSnapshot();
    // A resolution that asked for the wrong key gets `{result: null}` from the
    // 404 arm and faults; this one did not.
    expect(resolved.source).toBe("redis-rest");
    expect(mock.KEY).toBe("zecreveal:snapshot:latest");
    expect(mock.KEY.startsWith("zecreveal:")).toBe(true);
    clearEnv();
  });
});
