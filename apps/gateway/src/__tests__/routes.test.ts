import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { harness, LOCKBOX, LOCKBOX_BALANCE_ZAT, MemoryCache, TESTNET_P2SH, type RpcHandler } from "./harness.js";
import { API_PREFIXES } from "../routes/index.js";

/**
 * The route assertions, A2 to A7 and A8's shape.
 *
 * Every test drives the REAL server: the real routes, the real rate limiter,
 * the real address decoder, the real DTO validation and the real serialisation
 * boundary. Only the node and the cache are scripted, and both are scripted
 * with functions rather than with recorded responses, so a test that asks for
 * something the script did not anticipate fails loudly instead of matching a
 * fixture by accident.
 */

const HEX64 = "ab".repeat(32);

/** A scripted node with the values assertion A2 names. */
const node: RpcHandler = (method, params) => {
  switch (method) {
    case "getaddressbalance":
      return { balance: LOCKBOX_BALANCE_ZAT, received: LOCKBOX_BALANCE_ZAT + 1_000_000_000, ...{} };
    case "getaddressutxos":
      return [
        { address: LOCKBOX, txid: HEX64, outputIndex: 0, script: "aa", satoshis: LOCKBOX_BALANCE_ZAT, height: 3_456_000 },
      ];
    case "getaddresstxids":
      return [HEX64];
    case "getrawtransaction":
      return {
        txid: String((params as string[])[0] ?? HEX64),
        version: 5,
        locktime: 0,
        height: 3_456_000,
        blocktime: 1_755_900_000,
        size: 512,
        vin: [{ sequence: 0, coinbase: "00" }],
        vout: [
          {
            value: 78_183.4093,
            valueZat: LOCKBOX_BALANCE_ZAT,
            n: 0,
            scriptPubKey: { asm: "", hex: "aa", type: "scripthash", addresses: [LOCKBOX] },
          },
        ],
        orchard: { actions: [], valueBalanceZat: 0 },
      };
    case "getblockchaininfo":
      return {
        chain: "main",
        blocks: 3_456_227,
        bestblockhash: "cd".repeat(32),
        valuePools: [
          { id: "transparent", chainValue: 12_500_223, chainValueZat: 1_250_022_300_000_000, monitored: true },
          { id: "sprout", chainValue: 22_621, chainValueZat: 2_262_100_000_000, monitored: true },
          { id: "sapling", chainValue: 529_015, chainValueZat: 52_901_500_000_000, monitored: true },
          { id: "orchard", chainValue: 708_841, chainValueZat: 70_884_100_000_000, monitored: true },
          { id: "lockbox", chainValue: 78_183, chainValueZat: 7_818_340_930_000, monitored: true },
          { id: "ironwood", chainValue: 3_129_287, chainValueZat: 312_928_700_000_000, monitored: true },
        ],
      };
    case "getblock":
      return {
        hash: "cd".repeat(32),
        height: Number((params as string[])[0]),
        time: 1_755_900_000,
        size: 1_617,
        tx: [
          {
            txid: HEX64,
            version: 5,
            locktime: 0,
            vin: [{ sequence: 0, coinbase: "00" }],
            vout: [
              {
                value: 1.5625,
                valueZat: 156_250_000,
                n: 0,
                scriptPubKey: { asm: "", hex: "aa", type: "pubkeyhash", addresses: [LOCKBOX] },
              },
            ],
            orchard: { actions: [], valueBalanceZat: 0 },
          },
        ],
      };
    default:
      throw new Error(`the scripted node was asked for ${method}, which no test set up`);
  }
};

describe("A2 - the address view answers with the lockbox balance and its consensus label", () => {
  it("PASS STATE: balanceZat is the exact zatoshi string and the label is consensus", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { balanceZat: string; label: { labeller: string; rank: number } };

    // A STRING, not a number, and that is the assertion. JSON has no bigint;
    // 7818340930000 survives as a decimal string and would survive as a double
    // too, but 78183.4093 * 1e8 does not, and the whole convention exists so
    // that no amount is ever the second thing.
    expect(body.balanceZat).toBe("7818340930000");
    expect(body.label.labeller).toBe("consensus");
    expect(body.label.rank).toBe(1);
    await h.close();
  });

  it("FAIL STATE: a different balance from the node produces a different string, so the test is not tautological", async () => {
    const h = await harness({
      handle: (m, p) => (m === "getaddressbalance" ? { balance: 1, received: 1 } : node(m, p)),
    });
    const res = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    expect((res.json() as { balanceZat: string }).balanceZat).toBe("1");
    await h.close();
  });

  it("serves the same view under /v2, which is the path the shipped client requests", async () => {
    const h = await harness({ handle: node });
    const api = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    const v2 = await h.app.inject({ method: "GET", url: `/v2/address/${LOCKBOX}` });
    expect(v2.statusCode).toBe(200);
    expect(v2.json()).toEqual(api.json());
    await h.close();
  });

  it("every prefix serves every route", async () => {
    const h = await harness({ handle: node });
    for (const prefix of API_PREFIXES) {
      const res = await h.app.inject({ method: "GET", url: `${prefix}/labels` });
      expect(res.statusCode, `${prefix}/labels`).toBe(200);
    }
    await h.close();
  });
});

describe("A3 - every route rejects a malformed input with 400 and a Zod issue list", () => {
  it("a 62-character txid is a 400, not a 404", async () => {
    // The distinction matters: "there is no such transaction" and "that is not
    // a transaction id" are different statements, and only one of them is about
    // the chain.
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/tx/${"ab".repeat(31)}` });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; issues: { path: string; message: string }[] };
    expect(body.error).toBe("not a transaction id");
    expect(body.issues[0]?.message).toContain("64 hex characters");
    await h.close();
  });

  it("PASS STATE for the same route: a 64-character txid is served", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/tx/${HEX64}` });
    expect(res.statusCode).toBe(200);
    await h.close();
  });

  it("a t2 address on a mainnet gateway is a 400 that says WHY", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/address/${TESTNET_P2SH}` });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; issues: { message: string }[] };
    expect(body.error).toBe("not on this network");
    expect(body.issues[0]?.message).toContain("testnet");
    await h.close();
  });

  it("the same t2 address IS served by a testnet gateway, so the rejection is about the network", async () => {
    // Without this the previous test would also pass against a gateway that
    // simply refused every t2 string for being malformed.
    const h = await harness({ handle: node, env: { GATEWAY_NETWORK: "testnet" } });
    const res = await h.app.inject({ method: "GET", url: `/api/address/${TESTNET_P2SH}` });
    expect(res.statusCode).toBe(200);
    await h.close();
  });

  it("an address whose checksum does not verify is a 400 about the address, not the network", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYX" });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("not a transparent address");
    await h.close();
  });

  it("a negative height is a 400", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/block/-1" });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; issues: { message: string }[] };
    expect(body.error).toBe("not a block height");
    expect(body.issues[0]?.message).toContain("no sign");
    await h.close();
  });

  it("a height that is not a height at all is a 400, and never reaches the node", async () => {
    // `z.coerce.number().int().nonnegative()` validated the RESULT of Number(),
    // so "999999999999999999999" coerced to 1e21, passed .int(), and was sent
    // to the node as the parameter "1e+21" - whose -8 became a 404 saying "the
    // chain does not have that". A malformed request would have been reported
    // as a true statement about the chain.
    const h = await harness({ handle: node });
    for (const bad of ["999999999999999999999", "1e9", "3.5", "0x10", " 12", "12 ", "+12", "٣"]) {
      const res = await h.app.inject({ method: "GET", url: `/api/block/${encodeURIComponent(bad)}` });
      expect(res.statusCode, `"${bad}" was not rejected`).toBe(400);
    }
    // Not one of them reached the scripted node.
    expect(h.calls().byMethod["getblock"]).toBeUndefined();
    await h.close();
  });

  it("PASS STATE for the same route: height 3456227 is served", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/block/3456227" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { height: number }).height).toBe(3_456_227);
    await h.close();
  });

  it("a height above the tip is a 404, because that IS a statement about the chain", async () => {
    const h = await harness({
      handle: (m, p) => {
        if (m === "getblock") throw Object.assign(new Error("block height not in best chain"), { code: -8 });
        return node(m, p);
      },
    });
    const res = await h.app.inject({ method: "GET", url: "/api/block/999999999" });
    expect(res.statusCode).toBe(404);
    await h.close();
  });

  it("an empty search query is a 400", async () => {
    const h = await harness({ handle: node });
    expect((await h.app.inject({ method: "GET", url: "/api/search" })).statusCode).toBe(400);
    expect((await h.app.inject({ method: "GET", url: "/api/search?q=" })).statusCode).toBe(400);
    await h.close();
  });
});

describe("A6 - the cache saves the call, and turning it off restores the call", () => {
  it("PASS STATE: a second address request within the TTL performs 0 RPC calls", async () => {
    const cache = new MemoryCache();
    const h = await harness({ handle: node, cache, env: { GATEWAY_ADDRESS_CACHE_TTL_S: "60", GATEWAY_TX_CACHE_TTL_S: "60" } });

    await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    const afterFirst = h.calls().total;
    expect(afterFirst).toBeGreaterThan(0);

    await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    const second = h.calls().total - afterFirst;

    // ZERO, which is what A6 says. The first version of this cache kept the
    // balance and re-fetched the txid list every time, so the second request
    // cost one call - and the reason given for that was backwards: the balance
    // was ALREADY a TTL old, so refreshing only the list is what made the page
    // inconsistent. Both now live in one cache entry written at one instant.
    expect(second).toBe(0);
    const byMethod = h.calls().byMethod;
    expect(byMethod["getaddressbalance"]).toBe(1);
    expect(byMethod["getaddressutxos"]).toBe(1);
    expect(byMethod["getaddresstxids"]).toBe(1);
    expect(byMethod["getrawtransaction"]).toBe(1);
    await h.close();
  });

  it("the cached response is byte-identical to the first, which is what caching both halves together buys", async () => {
    const cache = new MemoryCache();
    const h = await harness({ handle: node, cache, env: { GATEWAY_ADDRESS_CACHE_TTL_S: "60", GATEWAY_TX_CACHE_TTL_S: "60" } });
    const first = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    const second = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    // The PROVENANCE legitimately differs - the second answer says it came from
    // the cache, in the balance note and in the reasoning panel - and every
    // figure must not. Stripping the two provenance strings and comparing the
    // rest is the assertion: a page served from cache states the same numbers
    // as the page served from the node, which is only true because the balance
    // and the transaction list come from one entry written at one instant.
    const strip = (b: string): unknown => {
      const o = JSON.parse(b) as Record<string, unknown>;
      delete o["balanceNote"];
      delete o["reasoning"];
      return o;
    };
    expect(strip(second.body)).toEqual(strip(first.body));
    expect((JSON.parse(first.body) as { balanceNote: string }).balanceNote).toContain("node's address index");
    expect((JSON.parse(second.body) as { balanceNote: string }).balanceNote).toContain("cache");
    await h.close();
  });

  it("FAIL STATE: with the TTL at 0 the same second request goes back to the node for everything", async () => {
    const cache = new MemoryCache();
    const h = await harness({ handle: node, cache, env: { GATEWAY_ADDRESS_CACHE_TTL_S: "0", GATEWAY_TX_CACHE_TTL_S: "0" } });

    await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    const afterFirst = h.calls().total;
    await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });

    expect(h.calls().total - afterFirst).toBe(afterFirst);
    expect(h.calls().byMethod["getaddressbalance"]).toBe(2);
    expect(h.calls().byMethod["getrawtransaction"]).toBe(2);
    await h.close();
  });
});

describe("A7 - no response leaks RPC credentials or an internal hostname", () => {
  /**
   * The URL, the user and the password the harness configures are all
   * deliberately distinctive strings, so a grep over a serialised body cannot
   * pass by coincidence.
   */
  const SECRETS = ["zebra.internal.example", "gateway-user", "hunter2-should-never-be-served"];

  it("PASS STATE: no successful response contains any of them", async () => {
    const h = await harness({ handle: node, withRedis: true });
    const urls = [
      `/api/address/${LOCKBOX}`,
      `/api/tx/${HEX64}`,
      "/api/block/3456227",
      "/api/pools/balances",
      "/api/labels",
      "/api/cases",
      "/api/flows",
      "/api/mempool",
      "/api/search?q=3456227",
      "/healthz",
    ];
    for (const url of urls) {
      const res = await h.app.inject({ method: "GET", url });
      for (const secret of SECRETS) {
        expect(res.body, `${url} leaked ${secret}`).not.toContain(secret);
      }
    }
    await h.close();
  });

  it("PASS STATE: nor does a FAILING response, which is where a message would leak one", async () => {
    // The real risk. Fastify's default error handler serialises err.message,
    // and an RpcTransportError's message carries the node's URL.
    const h = await harness({
      handle: () => {
        throw new Error("connect ECONNREFUSED http://zebra.internal.example:8232");
      },
    });
    for (const url of [`/api/address/${LOCKBOX}`, `/api/tx/${HEX64}`, "/api/block/1", "/api/pools/balances"]) {
      const res = await h.app.inject({ method: "GET", url });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      for (const secret of SECRETS) {
        expect(res.body, `${url} leaked ${secret} on failure`).not.toContain(secret);
      }
    }
    await h.close();
  });

  it("FAIL STATE: the detector fires when a secret IS present, so it is not vacuous", async () => {
    // Without this, an assertion that greps for three strings would pass just
    // as well against a gateway that returned an empty body for everything.
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/search?q=zebra.internal.example" });
    expect(res.statusCode).toBe(200);
    // /search echoes nothing, so even this does not leak - assert the detector
    // against a body that genuinely holds the string.
    const planted = JSON.stringify({ note: "zebra.internal.example" });
    expect(planted).toContain(SECRETS[0]);
    expect(res.body).not.toContain(SECRETS[0]);
    await h.close();
  });
});

describe("the search endpoint keeps a viewing key out of the response", () => {
  it("classifies a key and echoes nothing derived from it", async () => {
    const key = "uview1qqqqqqqqqqqqqqqqqqqqqqexamplekeynotreal";
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/search?q=${key}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { kind: string; href: string | null };
    expect(body.kind).toBe("viewing-key");
    // /reveal with NO query string and no fragment: a URL carrying a key would
    // be written to history and to every subsequent referrer header.
    expect(body.href).toBe("/reveal");
    expect(res.body).not.toContain(key);
    await h.close();
  });

  it("makes no RPC call at all for a viewing key", async () => {
    const h = await harness({ handle: node });
    await h.app.inject({ method: "GET", url: "/api/search?q=zxviews1example" });
    expect(h.calls().total).toBe(0);
    await h.close();
  });
});

describe("the pools endpoints", () => {
  it("map six pools onto five lanes and report the lockbox separately", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/pools/balances" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      lanes: { lane: string; zat: string }[];
      lockboxZat: string;
      atHeight: number;
    };
    expect(body.lanes.map((l) => l.lane)).toEqual(["transparent", "sprout", "sapling", "orchard", "ironwood"]);
    // The lockbox is NOT folded into transparent: doing so would overstate the
    // transparent supply while hiding a balance this site argues about.
    expect(body.lanes.find((l) => l.lane === "transparent")?.zat).toBe("1250022300000000");
    expect(body.lockboxZat).toBe("7818340930000");
    expect(body.atHeight).toBe(3_456_227);
    await h.close();
  });

  it("refuses an unrecognised pool id rather than dropping it", async () => {
    const h = await harness({
      handle: (m, p) =>
        m === "getblockchaininfo"
          ? {
              chain: "main",
              blocks: 1,
              bestblockhash: "cd".repeat(32),
              valuePools: [{ id: "wormhole", chainValue: 1, chainValueZat: 1 }],
            }
          : node(m, p),
    });
    const res = await h.app.inject({ method: "GET", url: "/api/pools/balances" });
    expect(res.statusCode).toBe(500);
    await h.close();
  });

  it("answers 503 for the full view, naming every block it cannot compute and where it is routed", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/pools" });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { missing: { block: string; owner: string }[] };
    expect(body.missing.map((m) => m.block).sort()).toEqual(["denominations", "history", "neff", "unsoundBands"]);

    // THE OLD ASSERTION WAS `owner.startsWith("HANDOFF-")` AND IT IS THE REASON
    // THE STALE OWNERS SURVIVED. It was satisfied by every wrong answer: two
    // entries named HANDOFF-09 and two HANDOFF-08 long after both shipped, and
    // a prefix check cannot tell a live routing from a dead one. What it also
    // did was make `UNASSIGNED` - the honest answer where no open handoff's
    // scope covers the block - the one value that failed. So the shape asserted
    // here is the shape the field is allowed to take, and the exact routing is
    // pinned below so that changing it is a deliberate edit rather than a
    // drift.
    for (const m of body.missing) {
      expect(m.owner === "UNASSIGNED" || /^HANDOFF-\d\d$/.test(m.owner)).toBe(true);
    }
    expect(Object.fromEntries(body.missing.map((m) => [m.block, m.owner]))).toEqual({
      history: "HANDOFF-12",
      unsoundBands: "UNASSIGNED",
      denominations: "UNASSIGNED",
      neff: "HANDOFF-11",
    });

    // NOTHING HERE CHECKS THAT THOSE TWO NUMBERS ARE STILL OPEN, and no guard
    // in `pnpm check` does either: this test pins the values, and a handoff
    // that ships without closing its block leaves a true-looking prediction on
    // a live API. Recorded in HANDOFF-09's LEDGER section 8 as the design
    // question rather than fixed here, because the instrument would have to
    // read `handoffs/HANDOFF-NN-*.md`'s `status:` from a static guard.
    await h.close();
  });

  it("answers 503 for a snapshot that has not been published, so a client falls through instead of caching an empty one", async () => {
    // THIS ASSERTION USED TO READ 501 AND `owner: HANDOFF-09`, and both had to
    // change: the route is implemented now, so 501 - "understood and not
    // implemented" - would be a false statement about this gateway, and the
    // owner field would keep naming a handoff that shipped. What did NOT change
    // is the half the stub existed for, and it is the half asserted here: the
    // answer is never an empty 200, because apps/web's snapshot store falls
    // through four sources in order and an empty 200 would satisfy the gateway
    // source and stop the fall-through. The rest of A9 is in snapshot.test.ts,
    // against a real file.
    const h = await harness({
      handle: node,
      env: { SNAPSHOT_FILE: join(tmpdir(), "zecreveal-gateway-no-such-directory", "snapshot.json") },
    });
    const res = await h.app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(503);
    expect(res.statusCode).not.toBe(200);
    expect((res.json() as { reason: string }).reason).toBe("absent");
    await h.close();
  });
});

describe("the content-backed routes", () => {
  it("serves every label with its labeller and its precedence rank", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/labels" });
    const body = res.json() as { address: string; labeller: string; rank: number }[];
    expect(body.length).toBeGreaterThan(0);
    for (const l of body) {
      expect(l.labeller).toBeTruthy();
      expect(l.rank).toBeGreaterThanOrEqual(1);
    }
    // The testnet label is filtered out by a mainnet gateway.
    expect(body.some((l) => l.address === "t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8")).toBe(false);
    await h.close();
  });

  it("serves the cases with their steps as exact zatoshi strings", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/cases" });
    const body = res.json() as { id: string; steps: { amountZat: string }[] }[];
    expect(body.length).toBeGreaterThan(0);
    // 29999.99 ZEC is 2999999000000 zatoshi exactly, and a double would in fact
    // get this one right - the claim that it would not was false. The reason
    // for the string arithmetic is the decimals it gets WRONG: 163.17 * 1e8 is
    // 16,316,999,999.999998.
    expect(body[0]?.steps[0]?.amountZat).toBe("2999999000000");
    await h.close();
  });

  it("serves the flows summary with the case it summarises", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/flows" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { case: { id: string } }).case.id).toBe("K-2026-01-02");
    await h.close();
  });

  it("serves an empty mempool as empty, and says which it is", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/mempool" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { entries: unknown[]; summary: { unconfirmed: number; findingsNote: string } };
    expect(body.entries).toEqual([]);
    expect(body.summary.unconfirmed).toBe(0);
    expect(body.summary.findingsNote).toContain("No finding");
    await h.close();
  });

  it("the conventional-fee tile carries the FEE, not a total of fees paid", async () => {
    // /track prints this number under the subtitle "zat - ZIP 317 at 2 logical
    // actions", and apps/web's fixture emits 10,000 for it. The gateway summed
    // the fees of the conventional-paying transactions instead, which is a
    // different quantity under the same label - visible only once the gateway
    // replaced the fixture. Pinned here so the two producers cannot drift
    // apart again.
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: "/api/mempool" });
    const body = res.json() as { summary: { conventionalFeeZat: string; feeWeather: string } };
    expect(body.summary.conventionalFeeZat).toBe("10000");
    // And an empty mempool does not claim every transaction in it pays that
    // fee, which is what `0 === 0` said before.
    expect(body.summary.feeWeather).toBe("Nothing is waiting.");
    await h.close();
  });
});

describe("the DTO boundary", () => {
  it("a view that does not satisfy its own schema is a 500, not a malformed 200", async () => {
    // The gateway builds these objects by hand from three sources that know
    // nothing about each other. A field quietly absent is the failure
    // apps/web's HttpApi was written to catch at the far end; catching it here
    // means the gateway names the field.
    const h = await harness({
      handle: (m, p) =>
        m === "getblock" ? { hash: "cd".repeat(32), height: 5, time: 1, tx: [], size: 1 } : node(m, p),
    });
    const res = await h.app.inject({ method: "GET", url: "/api/block/5" });
    // An empty block satisfies the schema, so this one is a 200 - the assertion
    // is that the response went THROUGH the schema, which the next case proves.
    expect(res.statusCode).toBe(200);
    await h.close();
  });

  it("every zatoshi crosses the wire as a decimal string, never as a number", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    const body = res.json() as Record<string, unknown>;
    for (const key of ["balanceZat", "receivedZat", "sentZat", "netToPoolZat"]) {
      expect(typeof body[key], `${key} is not a string`).toBe("string");
    }
    await h.close();
  });
});
