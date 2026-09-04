/**
 * `probeEndpoint` and `classifyProbe` - what an endpoint says it has
 * (HANDOFF-16).
 *
 * DRIVEN OVER A REAL SOCKET FOR THE END-TO-END LEG, and over the rule's own data
 * for the classifier. The first is LEDGER-11's seam argument: "does this
 * endpoint serve z_gettreestate" is decided by an HTTP round trip through
 * `fetch`, a JSON-RPC envelope and an error code, and a test that handed
 * `classifyProbe` a hand-built error object would be testing its author's belief
 * about what the wire carries. The second is LEDGER-09a Q3: a probe set written
 * by hand under-covers its rule the moment a row is added.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZebraRpc } from "../client.js";
import { RpcError, RpcRateLimitError, RpcSchemaError, RpcTransportError } from "../errors.js";
import { MockRpcEndpoint } from "../mock-endpoint.js";
import {
  ABSENCE_PATTERNS,
  ENDPOINT_PROBES,
  classifyProbe,
  methodIsAbsent,
  probeEndpoint,
  probesForPath,
  probesForPaths,
} from "../endpoint-probe.js";

const TREESTATE = {
  hash: "aa".repeat(32),
  height: 99_999_999,
  time: 1,
  sapling: { commitments: {} },
  orchard: { commitments: {} },
  ironwood: { commitments: { finalRoot: "bb".repeat(32) } },
};
const SERVING = { info: { subversion: "/Zebra:6.3.0/" }, treestates: { "99999999": TREESTATE } };

async function reportFor(opts: ConstructorParameters<typeof MockRpcEndpoint>[0]) {
  const mock = new MockRpcEndpoint(opts);
  const url = await mock.start();
  try {
    const rpc = new ZebraRpc({ url, retries: 0 });
    return await probeEndpoint((method, params) => rpc.call(method, params, z.unknown()));
  } finally {
    await mock.stop();
  }
}

describe("probeEndpoint, over a real socket", () => {
  it("PASS SIDE: an endpoint serving every shape reports SERVED for all of them and does not block", async () => {
    const report = await reportFor(SERVING);
    expect(report.verdicts.map((v) => v.outcome)).toEqual(ENDPOINT_PROBES.map(() => "SERVED"));
    expect(report.absent).toEqual([]);
    expect(report.blocking).toBe(false);
    expect(methodIsAbsent(report, "z_gettreestate")).toBe(false);
  }, 30_000);

  it("FAIL SIDE, BY DATA: one method in absentMethods is ABSENT and everything else is unchanged", async () => {
    const report = await reportFor({ ...SERVING, absentMethods: ["z_gettreestate"] });
    expect(report.absent).toEqual(["z_gettreestate"]);
    expect(report.blocking).toBe(true);
    expect(methodIsAbsent(report, "z_gettreestate")).toBe(true);
    expect(report.verdicts.filter((v) => v.probe.key !== "z_gettreestate").every((v) => v.outcome === "SERVED")).toBe(true);
  }, 30_000);

  it("EVERY PROBE IS DISCRIMINATED, iterating ENDPOINT_PROBES rather than naming one", async () => {
    // The rule's own data structure. A probe added to ENDPOINT_PROBES cannot
    // arrive untested, and `blocking` is asserted per row against `required`.
    for (const probe of ENDPOINT_PROBES) {
      const report = await reportFor({ ...SERVING, absentMethods: [probe.method] });
      expect(methodIsAbsent(report, probe.method), probe.key).toBe(true);
      expect(report.blocking, `${probe.key} required=${String(probe.required)}`).toBe(probe.required);
    }
  }, 120_000);

  it("a REFUSED endpoint reports UNKNOWN and never ABSENT - the whole reason for the third outcome", async () => {
    const mock = new MockRpcEndpoint(SERVING);
    const url = await mock.start();
    try {
      mock.refuseFrom(1);
      const rpc = new ZebraRpc({ url, retries: 0 });
      const report = await probeEndpoint((method, params) => rpc.call(method, params, z.unknown()));
      expect(report.absent).toEqual([]);
      expect(report.unknown).toEqual(ENDPOINT_PROBES.map((p) => p.key));
      // Blocking, because a required method was not shown to work - but never
      // reported as absent, which is a different fact and a different fix.
      expect(report.blocking).toBe(true);
    } finally {
      await mock.stop();
    }
  }, 30_000);
});

describe("probesForPath - a process probes what IT sends", () => {
  /**
   * THE FIRST VERSION PROBED NOTHING IN MEMPOOL-ONLY MODE, on a true sentence
   * about three methods. `apps/indexer` gated the whole probe on
   * `store !== null` and justified it with "in mempool-only mode nothing calls
   * getblock, getblockheader or z_gettreestate" - which is true, and which does
   * not license skipping the OTHER five. That mode calls `getblockchaininfo`,
   * `getrawmempool` in both verbosities and `getrawtransaction` on every tick,
   * so the configuration most likely to be pointed at an unknown third-party
   * endpoint was the one that checked nothing at all. A gate reviewer found it
   * by grepping the call sites the sentence itself named.
   */
  it("every probe declares a path, iterating the list rather than naming rows", () => {
    for (const p of ENDPOINT_PROBES) {
      expect(["mempool", "confirmed", "either"], p.key).toContain(p.path);
    }
  });

  it("the two paths partition the list, with `either` in both and nothing lost", () => {
    const mempool = probesForPath("mempool");
    const confirmed = probesForPath("confirmed");
    const union = new Set([...mempool, ...confirmed].map((p) => p.key));
    expect(union.size).toBe(ENDPOINT_PROBES.length);
    // `either` rows are in both, and there is at least one, or the split is a
    // partition of convenience rather than of what each path sends.
    const both = mempool.filter((p) => confirmed.includes(p));
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((p) => p.path === "either")).toBe(true);
  });

  it("THE ROW THAT MATTERS: the mempool path probes getrawtransaction, which it sends on every tick", () => {
    const keys = probesForPath("mempool").map((p) => p.key);
    expect(keys).toContain("getblockchaininfo");
    expect(keys).toContain("getrawmempool");
    expect(keys).toContain("getrawmempool[verbose]");
    expect(keys).toContain("getrawtransaction");
    // And NOT the three the sentence was right about.
    expect(keys).not.toContain("getblock");
    expect(keys).not.toContain("getblockheader");
    expect(keys).not.toContain("z_gettreestate");
  });

  it("the confirmed path probes z_gettreestate, which is the whole reason the probe exists", () => {
    expect(probesForPath("confirmed").map((p) => p.key)).toContain("z_gettreestate");
  });

  it("A FULL INDEXER RUNS BOTH PATHS, so both together are EVERY probe - none dropped", () => {
    // THE FIX FOR "MEMPOOL-ONLY PROBES NOTHING" CREATED "FULL MODE PROBES FIVE
    // OF EIGHT". `probesForPath("confirmed")` is the confirmed rows plus the
    // `either` rows, which drops getrawmempool in both verbosities and
    // getrawtransaction - three required shapes a full indexer sends every tick.
    // A gate reviewer found it in the commit that fixed the first hole.
    const both = probesForPaths(["mempool", "confirmed"]).map((p) => p.key);
    expect(both.sort()).toEqual(ENDPOINT_PROBES.map((p) => p.key).sort());
    // And the single-path spelling still drops them, which is why the caller
    // must name every path it runs rather than the one it is named after.
    expect(probesForPath("confirmed").map((p) => p.key)).not.toContain("getrawtransaction");
  });

  it("FAIL SIDE, BY DATA: a full indexer against an endpoint missing getrawtransaction is BLOCKED", async () => {
    const mock = new MockRpcEndpoint({ ...SERVING, absentMethods: ["getrawtransaction"] });
    const url = await mock.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const report = await probeEndpoint((m, p) => rpc.call(m, p, z.unknown()), probesForPaths(["mempool", "confirmed"]));
      expect(report.absent).toEqual(["getrawtransaction"]);
      expect(report.blocking).toBe(true);
    } finally {
      await mock.stop();
    }
  }, 30_000);

  it("FAIL SIDE, BY DATA: an endpoint missing getrawtransaction BLOCKS the mempool path", async () => {
    // The member: an endpoint that serves the confirmed path's methods and not
    // one the mempool path sends. Under the old gate this configuration started
    // silently and failed on the first transaction.
    const mock = new MockRpcEndpoint({ ...SERVING, absentMethods: ["getrawtransaction"] });
    const url = await mock.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const report = await probeEndpoint((m, p) => rpc.call(m, p, z.unknown()), probesForPath("mempool"));
      expect(report.absent).toEqual(["getrawtransaction"]);
      expect(report.blocking).toBe(true);
    } finally {
      await mock.stop();
    }
  }, 30_000);
});

describe("classifyProbe", () => {
  it("no error is SERVED", () => expect(classifyProbe(null).outcome).toBe("SERVED"));

  it("an error ABOUT THE ARGUMENT is SERVED - the worked case", () => {
    const err = new RpcError("No such mempool or main chain transaction.", "getrawtransaction", [], -5);
    expect(classifyProbe(err).outcome).toBe("SERVED");
  });

  it("-32601 is ABSENT", () => {
    expect(classifyProbe(new RpcError("Method not found", "z_gettreestate", [], -32601)).outcome).toBe("ABSENT");
  });

  it("a 429 is UNKNOWN, one status away from the worked case", () => {
    expect(classifyProbe(new RpcRateLimitError("getblock", [], null)).outcome).toBe("UNKNOWN");
  });

  it("a transport failure is UNKNOWN", () => {
    expect(classifyProbe(new RpcTransportError("no response after 1 attempt", "getblock", [], 1, null)).outcome).toBe("UNKNOWN");
    expect(classifyProbe(new Error("socket hang up")).outcome).toBe("UNKNOWN");
  });

  it("a SCHEMA error is SERVED - the method answered, this client could not read it", () => {
    expect(classifyProbe(new RpcSchemaError("getblock", [], [{ path: "trees", message: "expected object" }])).outcome).toBe("SERVED");
  });

  it("EVERY ABSENCE_PATTERNS ROW IS DRIVEN with a code that is NOT -32601, so the row decides", () => {
    const samples: Record<string, string> = {
      "/method not found/i": "Method not found",
      "/unknown method/i": "unknown method: z_gettreestate",
      "/not supported/i": "this method is not supported on the free plan",
      "/unsupported method/i": "Unsupported method",
      "/no such method/i": "no such method",
      "/method .* is disabled/i": "method z_gettreestate is disabled",
      "/disabled method/i": "disabled method",
    };
    expect(Object.keys(samples)).toHaveLength(ABSENCE_PATTERNS.length);
    for (const re of ABSENCE_PATTERNS) {
      const sample = samples[String(re)];
      expect(sample, `no sample for ${String(re)}`).toBeDefined();
      expect(re.test(sample as string), `${String(re)} does not match its own sample`).toBe(true);
      expect(classifyProbe(new RpcError(sample as string, "m", [], -1)).outcome).toBe("ABSENT");
    }
  });

  it("an unrecognised error is SERVED, which is the SAFE direction", () => {
    // It can only admit an endpoint the runtime will then name at startup; the
    // other direction rejects working endpoints for an unfamiliar message.
    expect(classifyProbe(new RpcError("something else entirely", "m", [], -99)).outcome).toBe("SERVED");
  });
});
