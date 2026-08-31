/**
 * The pure pieces around the assertions: configuration, the node reading, the
 * tip payload, the labels version and the logger's redaction.
 *
 * These are not section 5 assertions. They exist because every one of them is
 * code that ships and that no section 5 assertion reaches, and this project's
 * ledger records what an unexercised branch costs.
 */

import { describe, expect, it } from "vitest";

import {
  ironwoodSpendsFromRows,
  type IronwoodSpendRow,
} from "../sources/chain-inputs.js";

/**
 * EVERY URL IN THIS FILE IS A FIXTURE AND NONE OF THEM CAN REACH ANYTHING.
 * A8 greps `apps/publisher` for a committed Redis URL, so the shapes below are
 * chosen to be unmistakable to a reader as well as to a scanner: hosts are under
 * `.test`, which RFC 6761 reserves and no resolver will ever answer, or are
 * obviously-named stand-ins; the one `upstash.io` host exists because
 * `isManagedStoreUrl` matches on that suffix and the guard cannot be tested
 * without it; and the one password-shaped run is the literal string
 * `not-a-real-password`, in the assertion that proves such a run is redacted out
 * of a log line.
 */

import { assertLocalEndpointsAreLocal, loadConfig, managedStoreUrl } from "../config.js";
import { labelsVersionOf } from "../labels-version.js";
import { redactUrlCredentials } from "../logger.js";
import { crossingsFromRows, readChainValues } from "../sources/chain-inputs.js";
import { parseTipMessage } from "../sources/tip-source.js";

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe("config", () => {
  it("everything is defaulted, so it runs on a laptop with an empty environment", () => {
    const cfg = loadConfig(EMPTY_ENV);
    expect(cfg.SNAPSHOT_FILE).toBe("./snapshot.json");
    expect(cfg.SNAPSHOT_REDIS_MONTHLY_BUDGET).toBe(200_000);
    expect(cfg.SNAPSHOT_BUDGET_FILE).toBe("./snapshot-budget.json");
    expect(managedStoreUrl(cfg)).toBeNull();
  });

  it("SNAPSHOT_REDIS_KV_URL wins over SNAPSHOT_REDIS_REDIS_URL when both are set", () => {
    const cfg = loadConfig({
      SNAPSHOT_REDIS_KV_URL: "rediss://kv.example.test:6379",
      SNAPSHOT_REDIS_REDIS_URL: "rediss://alt.example.test:6379",
    });
    expect(managedStoreUrl(cfg)).toBe("rediss://kv.example.test:6379");
  });

  /**
   * THE PUBLISHER IS THE ONE PROCESS FOR WHICH THE MANAGED STORE IS THE
   * DESTINATION, so `assertNotManagedStore` is called on `REDIS_URL` and
   * `DATABASE_URL` and NOT on `SNAPSHOT_REDIS_*`. Asserting on the latter would
   * make this app refuse to start on every correct configuration, which is a
   * guard that has to be removed the first time it is right.
   */
  it("a managed-store URL under SNAPSHOT_REDIS_KV_URL is accepted - that is this app's destination", () => {
    expect(() =>
      loadConfig({ SNAPSHOT_REDIS_KV_URL: "rediss://real-store.upstash.io:6379" }),
    ).not.toThrow();
  });

  it("the same URL under REDIS_URL is refused, by host", () => {
    expect(() => loadConfig({ REDIS_URL: "rediss://real-store.upstash.io:6379" })).toThrow(
      /Vercel-managed store/,
    );
  });

  it("the same URL under DATABASE_URL is refused too", () => {
    expect(() => loadConfig({ DATABASE_URL: "rediss://real-store.upstash.io:6379" })).toThrow(
      /Vercel-managed store/,
    );
  });

  it("a VPS URL copied from a SNAPSHOT_REDIS_ value is refused by exact match, whatever its host", () => {
    const pasted = "rediss://default:not-a-real-password@some-host.example.test:6379";
    expect(() =>
      assertLocalEndpointsAreLocal(
        loadConfig({ REDIS_URL: pasted }),
        { REDIS_URL: pasted, SNAPSHOT_REDIS_KV_URL: pasted },
      ),
    ).toThrow(/same value as SNAPSHOT_REDIS_KV_URL/);
  });
});

describe("the node reading", () => {
  const info = {
    valuePools: [
      { id: "transparent", chainValueZat: 400n },
      { id: "sprout", chainValueZat: 1n },
      { id: "sapling", chainValueZat: 20n },
      { id: "orchard", chainValueZat: 70n },
      { id: "lockbox", chainValueZat: 9n },
      { id: "ironwood", chainValueZat: 30n },
    ],
  };

  it("six pools on the wire become five lanes, and the lockbox is not one of them", () => {
    const values = readChainValues(info, 3_500_000);
    expect(values.lanes.map((l) => l.lane)).toEqual([
      "transparent",
      "sprout",
      "sapling",
      "orchard",
      "ironwood",
    ]);
    expect(values.lanes.reduce((s, l) => s + l.balanceZat, 0n)).toBe(521n);
  });

  it("the lockbox is still inside the summed supply, and the source string says which sum it is", () => {
    const values = readChainValues(info, 3_500_000);
    expect(values.supplyZat).toBe(530n);
    expect(values.supplySource).toContain("valuePools");
    expect(values.supplySource).toContain("lockbox");
  });

  it("chainSupply wins when the node reports one, and the source string names it", () => {
    const values = readChainValues({ ...info, chainSupply: { chainValueZat: 999n } }, 3_500_000);
    expect(values.supplyZat).toBe(999n);
    expect(values.supplySource).toContain("chainSupply");
  });

  it("a node that reports no pools gives a NULL supply, never a zero", () => {
    const values = readChainValues({}, 3_500_000);
    expect(values.supplyZat).toBeNull();
    expect(values.supplySource).toBe("not reported by the node");
  });

  it("a NUMERIC amount arrives as a string and is parsed with BigInt, never Number", () => {
    const [crossing] = crossingsFromRows([
      { txid: "cd".repeat(32), height: 3_500_000, amount_zat: "2100000000000001" },
    ]);
    expect(crossing?.amountZat).toBe(2_100_000_000_000_001n);
  });
});

describe("the tip payload", () => {
  const hash = "ab".repeat(32);

  it("a well-formed tip parses", () => {
    expect(parseTipMessage(JSON.stringify({ type: "tip", height: 3_500_000, hash }))).toEqual({
      height: 3_500_000,
      hash,
    });
  });

  it("anything else is null, and is therefore never published", () => {
    expect(parseTipMessage("not json")).toBeNull();
    expect(parseTipMessage(JSON.stringify({ type: "tx_added" }))).toBeNull();
    expect(parseTipMessage(JSON.stringify({ type: "tip", height: "3500000", hash }))).toBeNull();
    expect(parseTipMessage(JSON.stringify({ type: "tip", height: 3_500_000, hash: "AB" }))).toBeNull();
    expect(
      parseTipMessage(JSON.stringify({ type: "tip", height: 3_500_000, hash: hash.toUpperCase() })),
    ).toBeNull();
  });
});

describe("labelsVersion", () => {
  it("carries the count and the newest lastVerified", () => {
    const version = labelsVersionOf([
      { lastVerified: "2026-01-02" },
      { lastVerified: "2026-08-22" },
      { lastVerified: "2025-11-30" },
    ] as never);
    expect(version).toBe("labels-3-2026-08-22");
  });

  it("an empty corpus is a stated state, not an empty string", () => {
    expect(labelsVersionOf([])).toBe("labels-0-none");
    expect(labelsVersionOf([]).length).toBeGreaterThan(0);
  });
});

describe("the logger", () => {
  it("a URL's password is removed from an error message; the host survives", () => {
    const line = redactUrlCredentials(
      "AUTH failed for rediss://default:not-a-real-password@example-store.upstash.io:6379",
    );
    expect(line).not.toContain("not-a-real-password");
    expect(line).toContain("example-store.upstash.io:6379");
  });

  it("a message with no URL is unchanged", () => {
    expect(redactUrlCredentials("connect ECONNREFUSED 127.0.0.1:6399")).toBe(
      "connect ECONNREFUSED 127.0.0.1:6399",
    );
  });

  it("a base64 password containing / or = is removed, which the first pattern left in the log", () => {
    // THE SHAPE THE MANAGED STORE'S OWN TOKEN TAKES. `SNAPSHOT_REDIS_REDIS_URL`
    // carries a base64 password, and base64's alphabet is `A-Za-z0-9+/=`. The
    // original pattern's password class was `[^/\s@]*`, so it stopped at the
    // `/` and matched nothing at all - the whole credential went to the log
    // verbatim, in the one case this module exists for. The test above passed
    // throughout, because its fixture happened to be alphanumeric.
    const line = redactUrlCredentials(
      "AUTH failed for rediss://default:AbC/d12+34=@example-store.upstash.io:6379",
    );
    expect(line).not.toContain("AbC/d12+34=");
    expect(line).toBe("AUTH failed for rediss://[redacted]@example-store.upstash.io:6379");
  });

  it("a password containing @ is removed WHOLE, not up to its first @", () => {
    // The original pattern terminated at the first `@` and produced
    // `rediss://[redacted]@ssword@host` - the tail of the password surviving a
    // line that reads as redacted, which is worse than no redaction because it
    // looks handled.
    const line = redactUrlCredentials("AUTH failed for rediss://default:pa@ssword@host:6379");
    expect(line).not.toContain("ssword");
    expect(line).toBe("AUTH failed for rediss://[redacted]@host:6379");
  });

  it("two credentialled URLs in one line are both redacted, and a bare address is not touched", () => {
    // The `@`-lookahead picks the LAST `@` in a whitespace-free run, so it must
    // not reach across the space into the next URL. And a line that merely
    // contains an email address and an uncredentialled URL is left alone -
    // over-redaction is the safe direction but it is not free, and a rule that
    // fired here would redact hosts out of ordinary connection errors.
    expect(redactUrlCredentials("redis://u:p1@h1 and postgres://u2:p/2@h2 both failed")).toBe(
      "redis://[redacted]@h1 and postgres://[redacted]@h2 both failed",
    );
    expect(redactUrlCredentials("see redis://host:6379 and mail ops@example.com")).toBe(
      "see redis://host:6379 and mail ops@example.com",
    );
  });

  it("a pathological message is redacted in linear time, not quadratic", () => {
    // THE FIX'S OWN FIRST VERSION FAILED THIS. Reaching the last `@` with a lazy
    // password and `@(?![^\s]*@)` gives identical output on every case above and
    // is quadratic: 39ms at 10k characters, 978ms at 50k, 16.4 SECONDS at 200k.
    // This function runs on error messages, which is what a wedged process
    // produces most of. The greedy form does the same 200k in under a
    // millisecond. The budget here is deliberately loose - a hundred times the
    // measured figure - so the test fails on a complexity class and not on a
    // slow machine.
    const pathological = `rediss://default:${"a@".repeat(100_000)}`;
    const started = performance.now();
    const out = redactUrlCredentials(pathological);
    expect(performance.now() - started).toBeLessThan(250);
    expect(out.startsWith("rediss://[redacted]@")).toBe(true);
  });
});

describe("ironwoodSpendsFromRows - the pure row mapper", () => {
  const row = (over: Partial<IronwoodSpendRow> = {}): IronwoodSpendRow => ({
    spent_txid: "aa".repeat(32),
    spent_height: 10,
    pool: "ironwood",
    max_position: "9",
    ...over,
  });

  it("READS the pool from the row rather than stamping it", () => {
    // THE ASSERTION THE INTEGRATION SUITE COULD NOT MAKE (gate round 2, F5).
    // There, the query's `WHERE n.pool = 'ironwood'` means no other pool can
    // reach this function, so `expect(every(pool === "ironwood"))` passed
    // identically whether the value was read or manufactured - the one assertion
    // added for the change was the one that could not fail. Over the pure
    // function the value is free, so a stamped `"ironwood"` turns this red.
    //
    // It matters because `ironwoodBirth`'s FIRST admission rule is
    // `s.pool === "ironwood"`, and a manufactured label makes that guard inert:
    // it would be testing a value this function invented rather than one the
    // database supplied.
    const [s] = ironwoodSpendsFromRows([row({ pool: "sapling" })]);
    expect(s?.pool).toBe("sapling");
  });

  it("derives Cand_0 as max_position + 1, on a value that is not a power of two", () => {
    expect(ironwoodSpendsFromRows([row({ max_position: "4090" })])[0]?.candidateCount).toBe(4091n);
  });

  it("drops a row whose anchor did not resolve, rather than counting it as zero", () => {
    expect(ironwoodSpendsFromRows([row({ max_position: null })])).toEqual([]);
  });

  it("REFUSES a non-positive bound instead of dropping it silently", () => {
    // A silent drop publishes `spendCount: 0` and `requires_disclosure: 0` -
    // verbatim what migration 005 says the design refuses, "a manufactured zero
    // would SILENTLY EXCLUDE a spend while looking like a measurement". The
    // caller turns this throw into a stated absence with a logged reason.
    expect(() => ironwoodSpendsFromRows([row({ max_position: "-5" })])).toThrow(
      /not a candidate set/,
    );
  });
});
