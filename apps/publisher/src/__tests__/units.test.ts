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
  readSnapshotInputs,
  type ChainInputsDeps,
  type InputFault,
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
import { asHex, snapshotNeffSeriesSchema } from "@zcashreveal/types";
import { REAL_INSTRUMENTS } from "../instruments.js";
import { buildSnapshot } from "../snapshot-builder.js";
import { fixtureInputs, mayTruncate, ZAT_PER_ZEC } from "./harness.js";

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

describe("the two fault sinks - a broken logger costs nothing", () => {
  it("buildSnapshot survives a THROWING panel sink", () => {
    // THE SECOND OF TWO SITES (gate round 3). `readSnapshotInputs` gained this
    // guard one round earlier and `panelOrNull` did not, though the call sits in
    // a `catch` in both and in production both sinks are the same pino
    // `log.error` - so one broken logger reached both. Executed then: this threw
    // and the tip published nothing at all.
    // THE FIXTURE MUST MAKE A PANEL ACTUALLY FAULT, or the sink is never called
    // and this test passes with the guard removed - which the first draft did.
    // An empty series with a PRESENT baseline is what `orchardDrain` refuses:
    // "the series holds no sample at or below atHeight ... a drain of 0 would be
    // a reading this call never took."
    const inputs = fixtureInputs(3_500_000, { orchardSeries: [] });
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => {
      throw new Error("the logger itself is broken");
    });
    expect(snapshot.height).toBe(inputs.height);
    expect(snapshot.drain).toBeNull();
  });

  it("buildSnapshot survives an ASYNC panel sink that rejects", async () => {
    // `void` does not forbid an async sink - TypeScript's void-return
    // assignability admits `Promise<void>` - and a rejected promise escapes a
    // `catch`. Unhandled, that is a Node 22 process exit: worse than the
    // document loss the guard was added to prevent.
    // THE FIXTURE MUST MAKE A PANEL ACTUALLY FAULT, or the sink is never called
    // and this test passes with the guard removed - which the first draft did.
    // An empty series with a PRESENT baseline is what `orchardDrain` refuses:
    // "the series holds no sample at or below atHeight ... a drain of 0 would be
    // a reading this call never took."
    const inputs = fixtureInputs(3_500_000, { orchardSeries: [] });
    const rejections: unknown[] = [];
    const onUnhandled = (err: unknown) => rejections.push(err);
    process.on("unhandledRejection", onUnhandled);
    try {
      const snapshot = buildSnapshot(
        inputs,
        REAL_INSTRUMENTS,
        (() => Promise.reject(new Error("the async logger is broken"))) as unknown as () => void,
      );
      expect(snapshot.height).toBe(inputs.height);
      await new Promise((r) => setImmediate(r));
      expect(rejections, "a rejected sink must not reach the process").toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  // THE FIRST OF THE TWO SITES, RESTORED - AND IT HAD LOST ITS ONLY TEST IN THE
  // COMMIT THAT SAID BOTH WERE COVERED (gate round 4). Round 2 added the wrapper
  // in `readSnapshotInputs` with a two-polarity transcript, `F11`, in the
  // integration file. Round 3 added the two cases above for `panelOrNull` and
  // DELETED `F11` - so the commit whose message reads "both sites now guard"
  // left this one with no test in either polarity, in a repository whose §5 rule
  // is a transcript per assertion. Measured at that commit: replacing the
  // wrapper with a bare `sink(panel, err);` left the whole publisher suite at 90
  // passed / 2 skipped, unchanged.
  //
  // THEY LIVE HERE RATHER THAN BACK IN THE INTEGRATION FILE because nothing
  // about a broken logger needs a database: `F11` was skipped on any machine
  // without Postgres, which is a second way for a guard to have no transcript.
  const faultingDeps = (over: Partial<ChainInputsDeps> = {}): ChainInputsDeps => ({
    readChainInfo: () =>
      Promise.resolve({
        valuePools: [
          { id: "transparent", chainValueZat: 4_000_000n * ZAT_PER_ZEC },
          { id: "sprout", chainValueZat: 22_621n * ZAT_PER_ZEC },
          { id: "sapling", chainValueZat: 1_200_000n * ZAT_PER_ZEC },
          { id: "orchard", chainValueZat: 708_841n * ZAT_PER_ZEC },
          { id: "ironwood", chainValueZat: 300_000n * ZAT_PER_ZEC },
        ],
        chainSupply: { chainValueZat: 16_889_987n * ZAT_PER_ZEC },
      }),
    // THE FIXTURE MUST MAKE A PANEL ACTUALLY FAULT, the same requirement the two
    // cases above carry: a rejecting query is what drives `panelInputs` into its
    // `catch`, and the `catch` is the only caller of `fault`.
    queryMigrations: () => Promise.reject(new Error("connection terminated unexpectedly")),
    queryOrchardSeries: null,
    queryDrainBaseline: null,
    queryIronwoodSpends: null,
    cfg: loadConfig({}),
    labelsVersion: "labels-9-2026-08-22",
    now: () => 1_780_000_010_000,
    ...over,
  });

  const FAULT_TIP = { height: 3_500_000, hash: "aa".repeat(32), timeMs: 1_780_000_000_000 };

  it("readSnapshotInputs survives a THROWING input sink", async () => {
    const inputs = await readSnapshotInputs(
      faultingDeps({
        onInputFault: () => {
          throw new Error("the logger itself is broken");
        },
      }),
      FAULT_TIP,
    );
    // It resolved rather than rejecting, and the panel it lost is the one whose
    // query failed.
    expect(inputs.migrationWindow).toBeNull();
    expect(inputs.height).toBe(FAULT_TIP.height);
  });

  it("readSnapshotInputs survives an ASYNC input sink that rejects", async () => {
    // `void` in `InputFault` does not forbid an async sink, and a rejected
    // promise escapes a `catch` entirely - on Node 22 that is a process exit,
    // which is worse than the document loss the wrapper was added to prevent.
    const rejections: unknown[] = [];
    const onUnhandled = (err: unknown) => rejections.push(err);
    process.on("unhandledRejection", onUnhandled);
    try {
      const inputs = await readSnapshotInputs(
        faultingDeps({
          onInputFault: (() =>
            Promise.reject(new Error("the async logger is broken"))) as unknown as InputFault,
        }),
        FAULT_TIP,
      );
      expect(inputs.migrationWindow).toBeNull();
      await new Promise((r) => setImmediate(r));
      expect(rejections, "a rejected sink must not reach the process").toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("snapshotNeffSeriesSchema's windowSpendCount invariant", () => {
  const panel = (spendCount: number, windowSpendCount: number) => ({
    birthHeight: 3_428_143,
    series: [],
    spendCount,
    windowSpendCount,
    shares: {
      aggregate_only: 0,
      broad_candidate_set: 0,
      small_heuristic_set: 0,
      requires_disclosure: 0,
    },
  });

  it("REFUSES a population smaller than the measurement drawn from it", () => {
    // "Always >= spendCount" was written only in a docstring, and both the
    // gateway and apps/web re-validate with this schema - so it is the thing
    // that fails closed (gate round 3). Inverted, SNAPSHOT.md 8.1's mandated
    // form renders "N_eff over 5 of 2 spends in the window".
    expect(snapshotNeffSeriesSchema.safeParse(panel(5, 2)).success).toBe(false);
  });

  it("ADMITS equal counts, which is the fully-measured window", () => {
    expect(snapshotNeffSeriesSchema.safeParse(panel(2, 2)).success).toBe(true);
    expect(snapshotNeffSeriesSchema.safeParse(panel(2, 4)).success).toBe(true);
  });

  it("AND THE PRODUCER REFUSES IT TOO, so the whole document does not die downstream", () => {
    // THE SCHEMA ALONE IS THE WRONG PLACE FOR IT TO FAIL (gate round 4). Round 3
    // added the refine and no matching producer refusal, which is the trade
    // `buildDrain` had already made for `drained` six lines away in the same
    // file: `serializeSnapshot` validates nothing, so an inverted pair is
    // written to the file sink AND the shared managed store, and the gateway's
    // `safeParse` then rejects `pools`, `residual` and `lastReports` along with
    // it - while this process logs `snapshot published`.
    //
    // TWO ADMITTED SPENDS AGAINST A WINDOW POPULATION OF ONE. `spendsInWindow`
    // is the DATA mutation; the code is unmutated, and the harness's own value
    // is the pass side below.
    const height = 3_500_000;
    const inputs = fixtureInputs(height, {
      ironwoodSpends: [
        { txid: asHex("bb".repeat(32)), height, pool: "ironwood", candidateCount: 5n },
        { txid: asHex("cc".repeat(32)), height, pool: "ironwood", candidateCount: 7n },
      ],
      ironwoodWindow: {
        birthHeight: 3_428_143,
        lowHeight: height - 1151,
        highHeight: height,
        spendsInWindow: 1,
      },
    });
    const faults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (p) => faults.push(p));

    // The panel is refused, and refused as a NULL rather than as a throw that
    // costs the tip - `panelOrNull` is what makes the two different.
    //
    // ON MEMBERSHIP, NOT ON THE WHOLE LIST, because the harness faults `drain`
    // BY CONSTRUCTION and that is not this test's subject: `orchardSeries`
    // defaults to `[]` with a baseline PRESENT, which is the combination
    // `orchardDrain` refuses and which the two `panelOrNull` cases above rely
    // on. The pass case below is what makes this assertion two-sided.
    expect(snapshot.neffSeries).toBeNull();
    expect(faults).toContain("neffSeries");
    // AND EVERY OTHER PANEL SURVIVES, which is the whole reason to refuse here
    // rather than let the gateway reject the document.
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.pools.length).toBeGreaterThan(0);
    // What the gateway would have been handed instead: an invalid document.
    expect(snapshotNeffSeriesSchema.safeParse(panel(2, 1)).success).toBe(false);
  });

  it("PUBLISHES the harness's own fully-measured window, so the refusal is not blanket", () => {
    // The SAME fixture with the SAME code, one field different - the harness's
    // own `spendsInWindow: 1` against its own single spend.
    const inputs = fixtureInputs(3_500_000);
    const faults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (p) => faults.push(p));
    expect(faults, "the refusal must not fire on a well-formed window").not.toContain("neffSeries");
    expect(snapshot.neffSeries).not.toBeNull();
    expect(snapshot.neffSeries!.windowSpendCount).toBe(1);
    expect(snapshot.neffSeries!.spendCount).toBeLessThanOrEqual(
      snapshot.neffSeries!.windowSpendCount,
    );
  });
});

describe("mayTruncate - the publisher's own copy of the schema refusal", () => {
  // THE SECOND COPY OF THE GUARD, DRIVEN AT LAST (gate round 4). The integration
  // file truncates directly rather than through `_setup.ts`'s `truncateAll`, so
  // it carries a hand-written duplicate of the same predicate; `truncateAll`'s
  // copy has `truncate-guard.test.ts` and this one had nothing in either
  // polarity. Two copies of a rule with one test is how they come apart, and the
  // failure mode is truncating a developer's `public` schema on every run.
  //
  // The cases are stated as the four inputs that matter rather than as a table,
  // because the empty string is the one a reader gets wrong: `search_path` set
  // to `""` is `public` as surely as unset is, and a `?? ""` upstream is how it
  // arrives.
  it("REFUSES with no schema and no hatch", () => {
    expect(mayTruncate(undefined, undefined)).toBe(false);
  });

  it("REFUSES on an EMPTY schema, not only an absent one", () => {
    expect(mayTruncate("", undefined)).toBe(false);
    expect(mayTruncate("", "")).toBe(false);
  });

  it("ALLOWS when this run owns a schema", () => {
    expect(mayTruncate("zr_test_1234_abc", undefined)).toBe(true);
  });

  it("ALLOWS on the named hatch alone, and ONLY on the exact string", () => {
    expect(mayTruncate(undefined, "1")).toBe(true);
    // Not "true", not "yes", not any truthy string - an opt-out has to be said
    // in the one form the message names.
    expect(mayTruncate(undefined, "true")).toBe(false);
    expect(mayTruncate(undefined, "0")).toBe(false);
  });

  it("AGREES WITH `_setup.ts`'s copy on all four inputs, which is the point of testing it", () => {
    // The two copies read the environment differently - `_setup.ts` reads it
    // dynamically through `testSchema()`, this file reads it once at module
    // scope - so they can only be compared as PREDICATES, on the values.
    const setupCopy = (schema: string | undefined, hatch: string | undefined) =>
      !((schema === undefined || schema === "") && hatch !== "1");
    for (const schema of [undefined, "", "zr_test_1234_abc"]) {
      for (const hatch of [undefined, "", "1", "true"]) {
        expect(mayTruncate(schema, hatch), `schema=${String(schema)} hatch=${String(hatch)}`).toBe(
          setupCopy(schema, hatch),
        );
      }
    }
  });
});
