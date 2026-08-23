import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";
import pino from "pino";
import { ZebraRpc, type FetchLike } from "@zcashreveal/zebra-rpc";

import { NullCache } from "../cache.js";
import { loadConfig } from "../config.js";
import { createGatewayLogger, redactKeys, safePath } from "../logger.js";
import { buildServer } from "../server.js";

/**
 * ASSERTION A9 - a viewing key that reaches the gateway is written NOWHERE.
 *
 * `apps/web`'s A11 suite proves the key never leaves the browser. This is the
 * same promise on the other side of the wire, and until this file existed
 * nothing tested it: the browser is not the only way to reach `/api/search`,
 * and a key can arrive in a query string, in a path segment, or in a request to
 * a route that does not exist.
 *
 * THREE SURFACES, and the log is the one that matters most. A caller who sends
 * a key already has it, so echoing it back is a smaller failure than writing it
 * to a file that persists on the VPS disk and is shipped wherever logs go, to
 * be read by people who are not the caller.
 *
 *   1. the response body
 *   2. the response headers
 *   3. every line the logger emits
 *
 * The fail side restores Fastify's default request serialiser and watches the
 * same assertion fail, so this cannot pass because the key never reached the
 * server at all.
 */

/** A well-formed-looking unified full viewing key. The tail is what the assertions grep for. */
const KEY = "uview1qqqqqqqqqqqqqqqqqqqqqqSECRETKEYMATERIALzzzzzzzz";
/** A distinctive fragment, so a partial leak is caught as well as a whole one. */
const FRAGMENT = "SECRETKEYMATERIAL";

function capture(): { stream: Writable; lines: () => string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { stream, lines: () => lines };
}

const rpc: FetchLike = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{"result":[]}'),
  });

/** The URLs a key could realistically arrive on. */
const URLS = [
  `/api/search?q=${KEY}`,
  `/v2/search?q=${KEY}`,
  `/api/address/${KEY}`,
  `/api/tx/${KEY}`,
  `/api/nope?q=${KEY}`,
  `/api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo?vk=${KEY}`,
];

async function run(log: pino.Logger): Promise<{ bodies: string[]; headers: string[] }> {
  const cfg = loadConfig({ GATEWAY_LOG_LEVEL: "info" } as NodeJS.ProcessEnv);
  const built = await buildServer({
    cfg,
    log,
    rpc: new ZebraRpc({ url: cfg.ZEBRAD_RPC_URL, fetch: rpc, retries: 0 }),
    cache: new NullCache(),
  });
  const bodies: string[] = [];
  const headers: string[] = [];
  for (const url of URLS) {
    const res = await built.app.inject({ method: "GET", url });
    bodies.push(res.body);
    headers.push(JSON.stringify(res.headers));
  }
  await built.close();
  return { bodies, headers };
}

describe("A9 - a viewing key is not written to the log, the body or the headers", () => {
  it("PASS STATE: no fragment of the key appears in any of the three", async () => {
    const { stream, lines } = capture();
    const log = createGatewayLogger({ level: "info" }, stream);
    const { bodies, headers } = await run(log);

    const emitted = lines().join("");
    expect(lines().length, "the logger emitted nothing, so this would pass vacuously").toBeGreaterThan(0);

    expect(emitted).not.toContain(FRAGMENT);
    expect(emitted).not.toContain(KEY);
    expect(emitted).not.toContain("uview1");
    for (const body of bodies) expect(body).not.toContain(FRAGMENT);
    for (const header of headers) expect(header).not.toContain(FRAGMENT);
  });

  it("the log is still USEFUL: the method and the path are there, only the query is gone", async () => {
    // Redacting the whole url also passes the assertion above and makes every
    // request in the log identical, which is a broken log that happens to be
    // safe. This is the half that stops the fix being that.
    const { stream, lines } = capture();
    const log = createGatewayLogger({ level: "info" }, stream);
    await run(log);

    const emitted = lines().join("");
    expect(emitted).toContain('"method":"GET"');
    expect(emitted).toContain("/api/search");
    expect(emitted).toContain("/api/nope");
    // The address route's real address survives; only the `vk` query is gone.
    expect(emitted).toContain("t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo");
    expect(emitted).not.toContain("vk=");
  });

  it("FAIL STATE: with Fastify's default serialiser, the key IS written", async () => {
    // The same six requests against a logger configured the way Fastify
    // configures one by default. If this ever stops failing, the assertion
    // above has stopped meaning anything.
    const { stream, lines } = capture();
    const bare = pino({ level: "info" }, stream);
    await run(bare);

    const emitted = lines().join("");
    expect(emitted).toContain(FRAGMENT);
  });

  it("FAIL STATE: redacting only the query would still write a key in a PATH", async () => {
    // Two rules are needed and this is why. `/api/address/uview1...` has no
    // query string at all.
    const queryOnly = (url: string): string => url.split("?")[0] ?? url;
    expect(queryOnly(`/api/address/${KEY}`)).toContain(FRAGMENT);
    expect(safePath(`/api/address/${KEY}`)).not.toContain(FRAGMENT);
  });
});

describe("the redaction rule itself", () => {
  it("covers the unified, Sapling and spending-key encodings", () => {
    for (const prefix of ["uview1", "uivk1", "zxviews1", "zxviewtestsapling1", "zivks1", "secret-extended-key-main1"]) {
      expect(redactKeys(`${prefix}abcdefSECRET`), prefix).not.toContain("SECRET");
      expect(redactKeys(`${prefix}abcdefSECRET`), prefix).toContain("[redacted]");
    }
  });

  it("redacts a malformed key too, because a malformed key is still a key", () => {
    expect(redactKeys("uview1SHORT")).toBe("[redacted]");
  });

  it("leaves an ordinary path alone", () => {
    expect(safePath("/api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo")).toBe(
      "/api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
    );
    expect(safePath("/api/block/3456227")).toBe("/api/block/3456227");
    expect(redactKeys("a transparent address t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ")).toContain("t1PKBiv7");
  });

  it("drops the whole query string, not only the parameters it recognises", () => {
    // A key can arrive under any parameter name, and the gateway reads only
    // `q`. Dropping the lot is the rule that does not depend on guessing.
    expect(safePath("/api/search?q=1&anything=2&vk=uview1abc")).toBe("/api/search");
  });

  it("removes an authorization header rather than censoring it", () => {
    // A line that says "[redacted]" still records that a credential was
    // presented and, for Basic, roughly how long it was.
    const { stream, lines } = capture();
    const log = createGatewayLogger({ level: "info" }, stream);
    log.info({ req: { headers: { authorization: "Basic aGVsbG86d29ybGQ=", cookie: "session=abc" } } }, "probe");
    const emitted = lines().join("");
    expect(emitted).not.toContain("aGVsbG86d29ybGQ");
    expect(emitted).not.toContain("session=abc");
    expect(emitted).not.toContain("authorization");
  });
});
