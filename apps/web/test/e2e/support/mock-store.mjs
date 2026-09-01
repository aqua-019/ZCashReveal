/**
 * A stand-in for the Vercel-managed Redis, over its REST interface.
 *
 * WHY A MOCK AND NOT THE REAL STORE, AND IT IS A RULE RATHER THAN A
 * CONVENIENCE. `docs/2.0/SNAPSHOT.md` rule 5: "Tests, local development and
 * BUILDS never point at this store", because it is shared with an unrelated
 * production project and every read of it is a command drawn from an allowance
 * that project is also drawing on. HANDOFF-11 section 4.1 says the same thing
 * about this suite specifically: "a Playwright run against the shared store is
 * exactly the mistake section 4.5 forbids."
 *
 * THIS IS ALSO WHAT MAKES A9's FAIL SIDE RUNNABLE. That assertion's fail side
 * as written was "remove the blanking in playwright.config.ts and watch the
 * indicator read `source: redis-rest`" - which is only reachable on a machine
 * holding the real credentials, and running it there IS the prohibited read.
 * Pointing the REST pair at this server discriminates identically and touches
 * nothing shared.
 *
 * THE DOCUMENT IS DELIBERATELY NOT THE FIXTURE'S. Its height, hash and lane
 * balances are values the bundled document does not contain, so "renders the
 * mocked snapshot's balances" (A3) is decidable BY VALUE rather than by the
 * indicator's own say-so. An assertion that only read `source: redis-rest`
 * would pass on a build that resolved the rung and then rendered the fixture.
 *
 * Upstash's REST shape: `GET {base}/get/{key}` with a bearer token answers
 * `{"result": "<the stored string>"}`, and `result` is null for a missing key.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_STORE_PORT ?? 3212);

/** The one key this project owns on that store. Nothing else is served. */
export const KEY = "zecreveal:snapshot:latest";

/**
 * The token the read-only rung must send.
 *
 * DECLARED HERE AND NOT BELOW THE HANDLER: `const` is not hoisted the way
 * `function` is, so a handler referencing it from above the declaration throws
 * a ReferenceError on the first request - which arrives as a socket error at
 * the caller and reads exactly like an unreachable store.
 */
export const READ_ONLY_TOKEN = "e2e-read-only-token";

/**
 * Balances no other document in this repository carries.
 *
 * The bundled fixture is the content corpus at height 3,456,227
 * (transparent 12,500,223 ZEC and so on). These five are different numbers at a
 * different height, so a page rendering them is a page that read THIS document.
 */
const DOC = {
  schema: 1,
  height: 4_111_222,
  hash: "0".repeat(24) + "e2e5eadbeef" + "0".repeat(29),
  time: "2026-09-01T09:00:00.000Z",
  publishedAt: "2026-09-01T09:01:15.000Z",
  pools: [
    { lane: "transparent", balanceZat: "1111100000000", share: 0.5 },
    { lane: "sprout", balanceZat: "222200000000", share: 0.1 },
    { lane: "sapling", balanceZat: "333300000000", share: 0.15 },
    { lane: "orchard", balanceZat: "444400000000", share: 0.2 },
    { lane: "ironwood", balanceZat: "111100000000", share: 0.05 },
  ],
  residual: null,
  drain: null,
  migrationHist: null,
  neffSeries: null,
  lastReports: [],
  labelsVersion: "e2e-mock-store",
};

/** The ZEC figures the page must render, grouped as `zatToZecGrouped(zat, 0)` does. */
export const EXPECTED_ZEC = ["11,111", "2,222", "3,333", "4,444", "1,111"];
export const EXPECTED_HEIGHT = "4,111,222";

/**
 * Start the server on `port`, resolving once it is listening.
 *
 * A FACTORY RATHER THAN A SIDE EFFECT AT IMPORT, and the difference is not
 * stylistic. The first version listened as soon as the module was imported, so
 * a process that imported it to read the document never exited and held the
 * port; the next run of anything wanting that port failed with "already used".
 * A test needs to start it, use it and CLOSE it.
 */
export function startMockStore(port = PORT) {
  return new Promise((resolve) => {
    const s = createServer(handle);
    s.listen(port, "127.0.0.1", () => {
      resolve({ server: s, port: s.address().port, url: `http://127.0.0.1:${s.address().port}` });
    });
  });
}

function handle(req, res) {
  const url = req.url ?? "/";
  // The store is read-only to this app and only ever asked for one key. A mock
  // that answered anything for any path would let a store reading the WRONG key
  // pass, which is one of the two things the real rule protects.
  if (url === `/get/${encodeURIComponent(KEY)}`) {
    const auth = req.headers["authorization"];
    // THE TOKEN IS CHECKED, so a build that sent none - or sent the read-write
    // name, which is read nowhere - fails here rather than being served anyway.
    if (auth !== `Bearer ${READ_ONLY_TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result: JSON.stringify(DOC) }));
    return;
  }
  if (url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ result: null }));
}

/** The document, for a test that wants to compare against it by value. */
export const DOCUMENT = DOC;

// Run directly - `node test/e2e/support/mock-store.mjs` - and it serves on PORT.
// Imported, and it does nothing until `startMockStore` is called.
if (process.argv[1] !== undefined && process.argv[1].endsWith("mock-store.mjs")) {
  const { url } = await startMockStore(PORT);
  process.stdout.write(`mock managed store on ${url}\n`);
}
