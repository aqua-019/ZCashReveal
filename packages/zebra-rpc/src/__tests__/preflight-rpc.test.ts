/**
 * A1, A2 and A7 - `scripts/preflight-rpc.mjs`, driven END TO END over a real
 * socket, and its classifier driven over the rule's own data.
 *
 * WHY A SPAWN AND NOT A FUNCTION CALL FOR THE TWO POLARITIES. The property A1
 * states is about an ENDPOINT - "reports ABSENT against one that does not serve
 * the method and SERVED against one that does" - and the thing that decides it
 * is an HTTP round trip through `fetch`, a JSON-RPC envelope and an error code.
 * A test that called `classify` with a hand-built response object would be
 * testing its author's belief about what the wire carries, which is the seam
 * LEDGER-11 is about. `MockRpcEndpoint` is a real `node:http` server for the
 * same reason it was one in HANDOFF-15.
 *
 * AND THE FAIL SIDE IS A DATA MUTATION. `absentMethods` makes ONE method absent
 * on an endpoint that is otherwise byte-identical to the pass side's - a value
 * from inside the exclusion set "endpoints that do not serve this method" -
 * rather than a mock with the case deleted, which would be a code mutation of
 * the instrument (LEDGER-09a Q2).
 *
 * IT LIVES HERE FOR `version-floor-smoke.test.ts`'s REASON, which is worth
 * naming a third time: this package's vitest config includes
 * `src/**\/__tests__/**\/*.test.ts` and nothing else, so a test written next to
 * the script in `scripts/` would never be collected and the run would be green
 * having executed nothing.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MockRpcEndpoint } from "../mock-endpoint.js";
import { parseRetryAfterMs } from "../rate-limit.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = resolve(REPO_ROOT, "scripts/preflight-rpc.mjs");

const mod = (await import(SCRIPT)) as {
  classify: (res: unknown) => { outcome: string; detail: string };
  versionVerdict: (sub: string, w: unknown) => { outcome: string };
  retryAfterMs: (h: string | null, now?: number) => number | null;
  parseVersion: (s: string) => unknown;
  PROBES: ReadonlyArray<{ key: string; method: string; params: readonly unknown[]; required: boolean; why: string }>;
  ABSENCE_PATTERNS: readonly RegExp[];
};
const { classify, versionVerdict, retryAfterMs, PROBES, ABSENCE_PATTERNS } = mod;

const TREESTATE = {
  hash: "aa".repeat(32),
  height: 99_999_999,
  time: 1,
  sapling: { commitments: {} },
  orchard: { commitments: {} },
  ironwood: { commitments: { finalRoot: "bb".repeat(32) } },
};
/** An endpoint that serves every shape `PROBES` sends. The pass side of A1. */
const SERVING = {
  info: { subversion: "/Zebra:6.3.0/" },
  treestates: { "99999999": TREESTATE },
};

function runPreflight(url: string, args: readonly string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((res) => {
    const p = spawn("node", [SCRIPT, url, ...args], { cwd: REPO_ROOT });
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (out += d.toString()));
    p.on("close", (code) => res({ code, out }));
  });
}

/** Start a mock, run the preflight against it, stop the mock. */
async function against(opts: ConstructorParameters<typeof MockRpcEndpoint>[0], args: readonly string[] = ["--skip-rate"]) {
  const mock = new MockRpcEndpoint(opts);
  const url = await mock.start();
  try {
    return await runPreflight(url, args);
  } finally {
    await mock.stop();
  }
}

/** The verdict cell for one method row, read out of the rendered table. */
function verdictOf(out: string, key: string): string | null {
  const row = out.split("\n").find((l) => l.startsWith(`${key} `) || l.startsWith(key.padEnd(24)));
  if (row === undefined) return null;
  return row.slice(24).trim().split(/\s+/)[0] ?? null;
}

describe("A1 - the preflight discriminates a served method from an absent one", () => {
  it("PASS SIDE: an endpoint serving z_gettreestate reports it SERVED and exits 0", async () => {
    const { code, out } = await against(SERVING);
    expect(verdictOf(out, "z_gettreestate")).toBe("SERVED");
    expect(code).toBe(0);
    expect(out).toContain("serves every method this stack sends");
  }, 60_000);

  it("FAIL SIDE, BY DATA: the same endpoint with z_gettreestate in absentMethods reports ABSENT and exits 1", async () => {
    // The member of the exclusion set: an endpoint that answers -32601 for this
    // one method and serves every other. Nothing about the mock's code changes.
    const { code, out } = await against({ ...SERVING, absentMethods: ["z_gettreestate"] });
    expect(verdictOf(out, "z_gettreestate")).toBe("ABSENT");
    expect(verdictOf(out, "getblockchaininfo")).toBe("SERVED");
    expect(code).toBe(1);
    expect(out).toContain("UNKNOWN_ANCHOR permanently");
  }, 60_000);

  it("EVERY REQUIRED PROBE IS DISCRIMINATED, iterating PROBES rather than naming one", async () => {
    // THE RULE'S OWN DATA STRUCTURE (LEDGER-09a Q3). A probe added to PROBES
    // cannot arrive untested, and the loop is what makes that true.
    for (const probe of PROBES) {
      if (!probe.required) continue;
      const { code, out } = await against({ ...SERVING, absentMethods: [probe.method] });
      // `getrawmempool` has two rows on one wire method, so absence hits both.
      expect(verdictOf(out, probe.key), `${probe.key} absent`).toBe("ABSENT");
      expect(code, `${probe.key} absent must block`).toBe(1);
    }
  }, 180_000);
});

describe("A2 - the rate is measured, with its n", () => {
  it("PASS SIDE: a 5/minute endpoint gives last success 5, first refusal 6, n=8", async () => {
    const { out } = await against({ ...SERVING, perMinute: 5 }, ["--burst", "8", "--rate-only"]);
    expect(out).toContain("last success 5, first refusal 6, n=8");
    expect(out).toContain("rate                    MEASURED      5 succeeded, request 6 refused, n=8");
  }, 60_000);

  it("FAIL SIDE, BY DATA: an endpoint that never refuses reports its n and NOT a ceiling", async () => {
    // The discriminating case, and the mutation is in the ENDPOINT rather than
    // in the script: the same burst against an endpoint with no `perMinute`.
    // A run that answered "unmetered" here would be a rate quoted without its n,
    // which CLAUDE.md says is not a measurement at all.
    const { out } = await against(SERVING, ["--burst", "6", "--rate-only"]);
    expect(out).toContain("no refusal in n=6");
    expect(out).not.toContain("MEASURED");
  }, 60_000);
});

describe("classify - three outcomes, and the third is not a failure", () => {
  it("an error ABOUT THE ARGUMENT is SERVED, which is the worked case", () => {
    // getrawtransaction on a txid that does not exist. A working endpoint says
    // this, and a preflight reading it as ABSENT would reject good endpoints.
    const v = classify({ kind: "RPC-ERROR", status: 200, code: -5, message: "No such mempool or main chain transaction." });
    expect(v.outcome).toBe("SERVED");
  });

  it("-32601 is ABSENT", () => {
    expect(classify({ kind: "RPC-ERROR", status: 200, code: -32601, message: "Method not found" }).outcome).toBe("ABSENT");
  });

  it("EVERY ABSENCE_PATTERNS ROW IS DRIVEN, and each is shown to decide the verdict", () => {
    // Iterating the rule's data: a pattern added to the list cannot arrive
    // untested. Each row is driven with a code that is NOT -32601, so the row
    // itself is what produces ABSENT rather than the code shortcut.
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
      expect(classify({ kind: "RPC-ERROR", status: 200, code: -1, message: sample }).outcome).toBe("ABSENT");
    }
  });

  it("a 429 is UNKNOWN and NEVER ABSENT - one HTTP status from the worked case above", () => {
    expect(classify({ kind: "REFUSED", status: 429, retryAfterMs: null, body: "" }).outcome).toBe("UNKNOWN");
  });

  it("a body carrying NEITHER result NOR error is UNKNOWN, not SERVED", () => {
    expect(classify({ kind: "UNREADABLE", status: 200, body: "{}" }).outcome).toBe("UNKNOWN");
  });
});

describe("the version window, in the preflight's own copy of the parser", () => {
  const W = { floor: { major: 6, minor: 3, patch: 0 }, ceiling: { major: 6, minor: 3, patch: 0 }, inclusive: true };
  it("in window, below floor, above ceiling and unparsed are four outcomes", () => {
    expect(versionVerdict("/Zebra:6.3.0/", W).outcome).toBe("IN-WINDOW");
    expect(versionVerdict("/Zebra:6.2.3/", W).outcome).toBe("BELOW-FLOOR");
    expect(versionVerdict("/Zebra:6.4.0/", W).outcome).toBe("ABOVE-CEILING");
    expect(versionVerdict("/MagicBean:5.4.2/", W).outcome).toBe("UNPARSED");
  });
});

describe("retryAfterMs - the preflight's copy agrees with the shipped parser", () => {
  /**
   * THE TABLE IS THE PIN. `scripts/preflight-rpc.mjs` carries a second copy of
   * `parseRetryAfterMs` because it must run with no workspace imports, before
   * `pnpm install`, against a candidate endpoint. A duplicate that nothing
   * compares is a duplicate that drifts, and this one drifted before it was ten
   * minutes old: its first draft handed everything that was not delta-seconds to
   * `Date.parse`, and `Date.parse("1.5")` is 5 January 2001, so an unreadable
   * header came back as 0 - "retry immediately" - which is HANDOFF-15's measured
   * defect reproduced inside a copy of its own fix.
   *
   * Driven as DATA rather than as three hand-written cases, so a form added to
   * either implementation is compared in both.
   */
  const NOW = 1_757_000_000_000;
  const CASES: ReadonlyArray<{ header: string | null; expect: number | null; why: string }> = [
    { header: "60", expect: 60_000, why: "delta-seconds, the common form" },
    { header: "0", expect: 0, why: "delta-seconds zero is a real instruction" },
    { header: "1.5", expect: null, why: 'Date.parse("1.5") is 5 January 2001 - unreadable, NOT retry-immediately' },
    { header: "0.5", expect: null, why: 'Date.parse("0.5") is 1 May 2000 - the same trap one digit over' },
    { header: "", expect: null, why: "empty is absent" },
    { header: null, expect: null, why: "absent is absent" },
    { header: "not a date at all", expect: null, why: "unreadable" },
    { header: "Wed, 03 Sep 2026 22:44:05 GMT", expect: Date.parse("Wed, 03 Sep 2026 22:44:05 GMT") - NOW, why: "IMF-fixdate" },
    { header: "Wed, 03 Sep 2020 22:44:05 GMT", expect: 0, why: "a well-formed date in the past DOES mean retry now" },
  ];

  it("both implementations agree on every row, and each row is the value the assertion names", () => {
    for (const c of CASES) {
      expect(retryAfterMs(c.header, NOW), `preflight copy: ${String(c.header)} - ${c.why}`).toBe(c.expect);
      expect(parseRetryAfterMs(c.header, NOW), `shipped parser: ${String(c.header)} - ${c.why}`).toBe(c.expect);
    }
  });
});
