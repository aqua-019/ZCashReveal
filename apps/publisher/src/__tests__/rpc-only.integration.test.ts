/**
 * A1, A1b and A2 - the publisher on RPC alone, and the same code with a database.
 *
 * WHAT THIS SUITE IS FOR. `ChainInputsDeps` has typed its four queries `| null`
 * since HANDOFF-09b, each with the comment "or null when there is no database"
 * beside it, and until HANDOFF-14 no configuration could reach that branch:
 * `DATABASE_URL` carried a default, so `cfg.DATABASE_URL` was always a string
 * and the composition root opened a connection unconditionally. A branch that
 * exists in a type and is unreachable from the composition root is a branch
 * nothing has ever executed.
 *
 * BOTH POLARITIES OF A1 ARE IN ONE FILE AND THE FAIL SIDE IS A **DATA** MUTATION.
 * LEDGER-09a Q2: a fail side that is only a code mutation proves the assertion is
 * wired, never that it discriminates. The excluded member here is a real one - a
 * `DATABASE_URL` pointed at a real Postgres holding real rows in
 * `migrations_zip318`, `pool_snapshots`, `blocks`, `pool_nullifiers` and
 * `pool_anchors` - and the three panels the RPC-only document publishes as
 * absences come back MEASURED against it. Nothing is stubbed on that side: it is
 * `makeChainQueries` over a live connection, which is what production runs.
 *
 * A1b IS A SEPARATE ASSERTION BECAUSE `residual` IS NOT AN ABSENCE HERE. The
 * session prompt said "four analysis panels are null" twice, two paragraphs
 * after its own transcript showing three; `turnstileResidual` takes the pool
 * balances and `chainSupply`, and both arrive on `getblockchaininfo`. LEDGER-11
 * Q5(a): an exclusion-set member is checked against the shipped object before it
 * is written, so the property the object actually has is asserted POSITIVELY
 * rather than asserted away.
 *
 * IF POSTGRES IS NOT REACHABLE THE FAIL SIDE SKIPS ITSELF WITH A NAMED REASON
 * AND SAYS SO, on the pattern `redis-sink.integration.test.ts` established. The
 * RPC-only half needs no database by construction and always runs - which is
 * exactly why the fail side must be loud about skipping: a suite in which only
 * the pass side can run is a suite that cannot discriminate.
 */

import { connect } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { snapshotKeyForHeight, snapshotV1Schema, serializeSnapshot } from "@zcashreveal/types";
import { Redis } from "ioredis";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { chainAccessFor } from "../index.js";
import { databaseUrl, loadConfig } from "../config.js";
import { REAL_INSTRUMENTS } from "../instruments.js";
import { createPublisherLogger } from "../logger.js";
import { SnapshotPublisher } from "../publisher.js";
import { buildSnapshot } from "../snapshot-builder.js";
import { createFileSink } from "../sinks/file.js";
import { connectManagedStore } from "../sinks/managed-store.js";
import { createRedisSink } from "../sinks/redis.js";
import { readSnapshotInputs } from "../sources/chain-inputs.js";
import { NO_CHAIN_QUERIES } from "../sources/queries.js";
import { mayTruncate } from "./harness.js";

const ZAT_PER_ZEC = 100_000_000n;
const BASELINE_HEIGHT = 3_428_143;
const TIP_HEIGHT = BASELINE_HEIGHT + 500;
const BASE_TIME_S = 1_780_000_000;
const BASE_WRITE_S = 1_780_200_000;
const IRONWOOD_LOW = Math.max(BASELINE_HEIGHT, TIP_HEIGHT - 1152 + 1);
const hashFor = (n: number) => n.toString(16).padStart(64, "0");

/**
 * The node's answer, with the five lanes and the supply.
 *
 * THE FIGURES ARE MAINNET'S SHAPE AT THE HEIGHT L2 MEASURED, not round numbers,
 * so that a lane accidentally swapped for another is visible in a share rather
 * than hidden by symmetry. They are a STAND-IN for a live reading and are
 * labelled as one: this session's egress proxy refuses every public Zcash RPC
 * host at CONNECT with 403 (transcript in HANDOFF-14 section 7), so no test in
 * this repository can take the reading itself. What the suite proves is that the
 * code path is correct for whatever the node says; that the node says this is a
 * separate claim, and `scripts/prove-rpc-only.mjs` is where an operator checks it.
 */
const LIVE_SHAPED_INFO = {
  valuePools: [
    { id: "transparent", chainValueZat: 1_198_841_232_000_000n },
    { id: "sprout", chainValueZat: 2_259_146_000_000n },
    { id: "sapling", chainValueZat: 52_443_121_000_000n },
    { id: "orchard", chainValueZat: 46_536_940_000_000n },
    { id: "ironwood", chainValueZat: 384_916_352_000_000n },
    // THE LOCKBOX IS ON THE WIRE AND IS NOT A LANE (`chain-inputs.ts`
    // LANE_BY_POOL_ID). Present in the fixture on purpose: a mapping that folded
    // it into `transparent` would overstate that lane, and with six pools in and
    // five lanes out the count itself is an assertion.
    { id: "lockbox", chainValueZat: 15_000_000_000_000n },
  ],
  // DELIBERATELY NOT THE POOL SUM, AND THE FIRST DRAFT OF THIS FIXTURE MADE THEM
  // EQUAL. `readChainValues` has two supply sources - the node's own
  // `chainSupply`, and the `valuePools` total summed as a fallback - and a
  // fixture in which they coincide cannot tell a test which one the code used.
  // That is "a fixture makes two distinct quantities equal", which CLAUDE.md
  // lists among the mechanically decidable defects, and it is why the pool sum
  // (1,699,996,791 x 1e6) and this figure differ by exactly 1 ZEC. On a real
  // node they may well coincide; a fixture must not, or the assertion below is
  // satisfied by either code path.
  chainSupply: { chainValueZat: 1_699_996_891_000_000n },
} as const;

const TIP = {
  height: 3_469_371,
  hash: hashFor(3_469_371),
  timeMs: BASE_TIME_S * 1000,
};

/** Every panel a `SnapshotV1` can carry, so a new one cannot be forgotten here. */
const PANELS = ["residual", "drain", "migrationHist", "neffSeries"] as const;

/** The three that read a table, and the one that does not. */
const DATABASE_DERIVED = ["drain", "migrationHist", "neffSeries"] as const;

/* -------------------------------------------------------------------------- */
/* A1 + A1b - the pass side. No database, by construction.                    */
/* -------------------------------------------------------------------------- */

describe("A1/A1b - a snapshot built on RPC alone", () => {
  /** Every query null. Not a mock of a database: the ABSENCE of one. */
  const rpcOnlyDeps = (over: Record<string, unknown> = {}) => ({
    readChainInfo: () => Promise.resolve(LIVE_SHAPED_INFO),
    ...NO_CHAIN_QUERIES,
    cfg: loadConfig({}),
    labelsVersion: "labels-14-2026-09-03",
    now: () => (BASE_TIME_S + 10) * 1000,
    ...over,
  });

  it("A1: the five lanes are the node's own, and the three database-derived panels are null", async () => {
    const inputs = await readSnapshotInputs(rpcOnlyDeps(), TIP);
    const snap = buildSnapshot(inputs, REAL_INSTRUMENTS, (panel, err) => {
      throw new Error(`no panel should fault in RPC-only mode: ${panel} ${String(err)}`);
    });

    // THE FIELD IS `pools`. The throwaway harness read `s.lanes ?? s.ledger ??
    // s.pools`, which would have printed nothing at all had the first two names
    // been the real one - a probe that cannot tell "absent" from "named
    // differently". Asserted by name here so a rename is a failure rather than a
    // silently empty section.
    expect(snap.pools.map((p) => p.lane)).toEqual([
      "transparent",
      "sprout",
      "sapling",
      "orchard",
      "ironwood",
    ]);
    for (const lane of snap.pools) {
      const onWire = LIVE_SHAPED_INFO.valuePools.find((p) => p.id === lane.lane);
      expect(onWire, `${lane.lane} must come from the node`).toBeDefined();
      expect(lane.balanceZat).toBe(onWire?.chainValueZat);
    }
    // FIVE LANES OUT OF SIX POOLS IN: the lockbox is not a lane.
    expect(snap.pools).toHaveLength(5);
    expect(snap.pools.some((p) => p.lane === ("lockbox" as never))).toBe(false);

    // The tip is the node's, not the fixture's.
    expect(snap.height).toBe(TIP.height);
    expect(snap.hash).toBe(TIP.hash);

    for (const panel of DATABASE_DERIVED) {
      expect(snap[panel], `${panel} reads a table and has none`).toBeNull();
    }
  });

  it("A1b: `residual` is MEASURED, because chainSupply is on the wire", async () => {
    const inputs = await readSnapshotInputs(rpcOnlyDeps(), TIP);
    const snap = buildSnapshot(inputs, REAL_INSTRUMENTS);

    expect(snap.residual).not.toBeNull();
    const r = snap.residual;
    if (r === null) throw new Error("unreachable: asserted non-null above");

    expect(r.supplyZat).toBe(LIVE_SHAPED_INFO.chainSupply.chainValueZat);
    // The source names where the number came from, which plan section 3.2
    // requires be published beside it.
    expect(r.supplySource).toContain("getblockchaininfo");
    // U = Bal^sprout + Bal^orchard, WHICH IS NOT "EVERY SHIELDED POOL", and the
    // first draft of this line asserted the latter. `turnstileResidual`'s own
    // signature is the authority - "U = Bal^sprout + Bal^orchard needs both" -
    // and sapling and ironwood are excluded because their soundness is not the
    // quantity plan section 3.2 is about. Computed from the fixture rather than
    // restated as a literal, so a changed lane figure cannot leave a stale
    // number passing.
    const unprovable = LIVE_SHAPED_INFO.valuePools
      .filter((p) => p.id === "sprout" || p.id === "orchard")
      .reduce((acc, p) => acc + p.chainValueZat, 0n);
    expect(r.unprovableZat).toBe(unprovable);
    // AND THE PAIR IT IS NOT, asserted by name so the two cannot be confused by
    // a later reader: every shielded lane summed is a different, larger number.
    const allShielded = LIVE_SHAPED_INFO.valuePools
      .filter((p) => p.id !== "transparent" && p.id !== "lockbox")
      .reduce((acc, p) => acc + p.chainValueZat, 0n);
    expect(r.unprovableZat).not.toBe(allShielded);
    expect(r.unprovableShare).toBeGreaterThan(0);
    expect(r.unprovableShare).toBeLessThan(1);
    expect(r.unprovableShare + r.verifiedShare).toBeCloseTo(1, 9);
  });

  it("A1b, second source: no `chainSupply` still MEASURES, from the pool sum, and SAYS SO", async () => {
    // THIS TEST EXISTS BECAUSE THE FIRST FAIL SIDE WRITTEN FOR A1b DID NOT
    // DISCRIMINATE, AND THAT IS ITSELF A FINDING (LEDGER-05 fold 7). It removed
    // `chainSupply` expecting a null residual; the residual came back measured,
    // because `readChainValues` has a documented `valuePools` fallback -
    // `fromNode ?? fromPools` - that the probe's author had not read. The rule's
    // converse applies: when a probe says the code is wrong, check the probe
    // before judging the code. The code was right.
    //
    // So the behaviour it accidentally found is pinned instead. The two supply
    // sources are DIFFERENT NUMBERS - the pool sum includes the ZIP 271 lockbox
    // and `chainSupply` is the node's own accounting - and `supplySource` is
    // what tells a reader which one is on the page.
    const inputs = await readSnapshotInputs(
      rpcOnlyDeps({
        readChainInfo: () => Promise.resolve({ valuePools: LIVE_SHAPED_INFO.valuePools }),
      }),
      TIP,
    );
    const snap = buildSnapshot(inputs, REAL_INSTRUMENTS);

    expect(snap.pools).toHaveLength(5);
    expect(snap.residual).not.toBeNull();
    const summed = LIVE_SHAPED_INFO.valuePools.reduce((a, p) => a + p.chainValueZat, 0n);
    expect(snap.residual?.supplyZat).toBe(summed);
    expect(snap.residual?.supplyZat).not.toBe(LIVE_SHAPED_INFO.chainSupply.chainValueZat);
    expect(snap.residual?.supplySource).toContain("valuePools");
    expect(snap.residual?.supplySource).not.toContain("chainSupply");
  });

  it("A1b FAIL SIDE, by DATA: a node that reports NO supply at all gives a NULL residual, never a zero", async () => {
    // THE CORRECTED MEMBER OF A1b's EXCLUSION SET. Neither supply source
    // answers - no `chainSupply` and no `valuePools` - which is
    // `readChainValues`' "not reported by the node" branch, and it is the one
    // reading that legitimately costs this panel. `supplyZat: null` reaches
    // `buildResidual`, which returns null before the estimator is called.
    const inputs = await readSnapshotInputs(
      rpcOnlyDeps({ readChainInfo: () => Promise.resolve({}) }),
      TIP,
    );
    const snap = buildSnapshot(inputs, REAL_INSTRUMENTS);

    // The document still publishes - losing the supply costs one panel, not the
    // whole thing. The five lanes are seeded at zero and still five.
    expect(snap.pools).toHaveLength(5);
    expect(snap.residual).toBeNull();
    // AND NOT A ZERO. Stated as its own expectation because `null` and a
    // `{unprovableZat: 0n}` object are the two things this contract is about,
    // and a reader of the transcript should see the second refused by name: a
    // zero here would render as "no supply is unprovable", which is a
    // measurement nobody took.
    expect(snap.residual).not.toEqual(expect.objectContaining({ unprovableZat: 0n }));
    expect(inputs.supplyZat).toBeNull();
    expect(inputs.supplySource).toContain("not reported by the node");
  });

  it("A1: every panel is accounted for, so a new one cannot arrive unclassified", async () => {
    // THE RULE'S OWN DATA STRUCTURE, ITERATED (LEDGER-09a Q3). If `SnapshotV1`
    // grows a fifth panel, this fails rather than silently leaving it untested -
    // the missing-member shape LEDGER-09b Q3 counts.
    const inputs = await readSnapshotInputs(rpcOnlyDeps(), TIP);
    const snap = buildSnapshot(inputs, REAL_INSTRUMENTS);
    const nullable = Object.entries(snap)
      .filter(([, v]) => v === null)
      .map(([k]) => k)
      .sort();
    expect(nullable).toEqual([...DATABASE_DERIVED].sort());
    expect(new Set(PANELS)).toEqual(new Set([...DATABASE_DERIVED, "residual"]));
  });
});

/* -------------------------------------------------------------------------- */
/* A2 - no client is constructed when there is no URL                          */
/* -------------------------------------------------------------------------- */

describe("A2 - the postgres client is constructed in exactly one of the two modes", () => {
  it("constructs NOTHING when DATABASE_URL is unset, and the queries are all null", () => {
    const calls: string[] = [];
    const access = chainAccessFor(loadConfig({}), (url) => {
      calls.push(url);
      throw new Error("A2: the factory must not be reached in RPC-only mode");
    });

    expect(calls, "zero calls in RPC-only mode").toEqual([]);
    expect(access.sql).toBeNull();
    for (const [name, q] of Object.entries(access.queries)) {
      expect(q, `${name} must be null with no connection`).toBeNull();
    }
  });

  it("A2 FAIL SIDE: with DATABASE_URL set the SAME factory is called exactly once", () => {
    // THE DISCRIMINATING HALF. A spy that records zero in both modes proves the
    // factory is unreachable, not that the branch works - so the same spy, the
    // same function, one variable changed, and the count moves from 0 to 1.
    const calls: string[] = [];
    const fake = { end: () => Promise.resolve() } as unknown as Sql;
    const access = chainAccessFor(
      loadConfig({ DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db" }),
      (url) => {
        calls.push(url);
        return fake;
      },
    );

    expect(calls).toEqual(["postgres://u:p@127.0.0.1:5432/db"]);
    expect(access.sql).toBe(fake);
    for (const [name, q] of Object.entries(access.queries)) {
      expect(q, `${name} must be bound when a connection exists`).not.toBeNull();
    }
  });

  it("A2: an EMPTY DATABASE_URL is an absent one, and still constructs nothing", () => {
    // A DATA MUTATION AT THE BOUNDARY. `DATABASE_URL=` in a `.env` is how an
    // operator turns the database off; reading it as a present-but-broken URL
    // would hand `postgres("")` a value it cannot dial and refuse to start on a
    // configuration written deliberately.
    const calls: string[] = [];
    const access = chainAccessFor(loadConfig({ DATABASE_URL: "" }), (url) => {
      calls.push(url);
      throw new Error("A2: an empty URL must not reach the factory");
    });
    expect(calls).toEqual([]);
    expect(access.sql).toBeNull();
    expect(databaseUrl(loadConfig({ DATABASE_URL: "" }))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Deliverable 2 - the whole path, into a LOCAL Redis and back out             */
/* -------------------------------------------------------------------------- */

/** Can a TCP connection be opened? The narrowest question that decides the skip. */
function probe(host: string, port: number, timeoutMs = 2_000): Promise<{ reachable: boolean; reason: string }> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (reachable: boolean, reason: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ reachable, reason });
    };
    socket.setTimeout(timeoutMs, () => done(false, `no answer from ${host}:${port} within ${timeoutMs}ms`));
    socket.once("connect", () => done(true, ""));
    socket.once("error", (err: Error) => done(false, `${host}:${port} - ${err.message}`));
  });
}

// A LOCAL REDIS, NEVER THE MANAGED STORE (SNAPSHOT.md rule 5). `127.0.0.1:6379`
// is the `redis:7` service in CI or a developer's own; the managed store is
// reached by no test in this repository, which is assertion A5.
const LOCAL_REDIS = "redis://127.0.0.1:6379";
const localRedis = await probe("127.0.0.1", 6379);

describe("deliverable 2 - an RPC-only snapshot published to a local Redis and read back", () => {
  it.runIf(!localRedis.reachable)(
    "SKIPPED, WITH ITS REASON: no local Redis, so the round trip did not run",
    () => {
      expect(localRedis.reachable).toBe(false);
      expect(localRedis.reason.length).toBeGreaterThan(0);
    },
  );

  it.runIf(localRedis.reachable)(
    "writes the three keys and reads back a document that validates, with three absences",
    async () => {
      const inputs = await readSnapshotInputs(
        {
          readChainInfo: () => Promise.resolve(LIVE_SHAPED_INFO),
          ...NO_CHAIN_QUERIES,
          cfg: loadConfig({}),
          labelsVersion: "labels-14-2026-09-03",
          now: () => (BASE_TIME_S + 10) * 1000,
        },
        TIP,
      );
      const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS);

      const dir = mkdtempSync(join(tmpdir(), "zr-rpc-only-"));
      const file = join(dir, "snapshot.json");
      const lines: string[] = [];
      // THE DESTINATION IS THE SECOND POSITIONAL ARGUMENT, not a property of the
      // options object. Passed as a property it was silently ignored, pino wrote
      // to stdout, and `lines` stayed empty - a captured-log assertion that could
      // only ever fail, which is the harmless direction of that mistake.
      const log = createPublisherLogger(
        { level: "info", pretty: false },
        new Writable({
          write(chunk, _enc, cb) {
            lines.push(String(chunk));
            cb();
          },
        }),
      );

      const sinks = [
        createFileSink({ path: file }),
        createRedisSink({ connect: () => connectManagedStore(LOCAL_REDIS) }),
      ];
      const publisher = new SnapshotPublisher({
        sinks,
        log,
        build: () => Promise.resolve({ snapshot, json: serializeSnapshot(snapshot) }),
      });

      await publisher.onTip(TIP);
      for (const sink of sinks) await sink.close();

      // THE FILE SINK, WHICH IS `required: yes` (SNAPSHOT.md section 8.5).
      const onDisk = snapshotV1Schema.parse(JSON.parse(readFileSync(file, "utf8")));
      expect(onDisk.height).toBe(TIP.height);

      // THE REDIS SINK, READ BACK THROUGH A SEPARATE CLIENT. Reading through the
      // writer's own connection would prove the value was held in a buffer;
      // a second client proves it reached the server.
      const reader = new Redis(LOCAL_REDIS);
      try {
        const raw = await reader.get(snapshotKeyForHeight(TIP.height));
        expect(raw, "the height-keyed snapshot must be on the server").not.toBeNull();
        const readBack = snapshotV1Schema.parse(JSON.parse(raw ?? "null"));

        expect(readBack.height).toBe(TIP.height);
        expect(readBack.hash).toBe(TIP.hash);
        expect(readBack.pools).toHaveLength(5);
        expect(readBack.pools[0]?.lane).toBe("transparent");

        // THE WHOLE CLAIM, ON THE FAR SIDE OF A SERIALISER AND A SERVER. Three
        // absences and one measurement - checked HERE rather than only on the
        // in-memory document, because a null that survives `JSON.stringify` and
        // comes back as a null is the property this rung actually needs, and a
        // `0` substituted anywhere in that path would be a fabricated
        // measurement (LEDGER-11's seam rule: make one side actually produce the
        // value and hand it to the other).
        for (const panel of DATABASE_DERIVED) {
          expect(readBack[panel], `${panel} must survive the round trip as null`).toBeNull();
        }
        expect(readBack.residual).not.toBeNull();
        expect(readBack.residual?.supplyZat).toBe(LIVE_SHAPED_INFO.chainSupply.chainValueZat);

        // NOT A ZERO ANYWHERE IN THE JSON. The raw text is checked rather than
        // the parsed object, because the failure this guards against is a
        // serialiser writing `0` where the document holds null.
        expect(raw).toContain('"drain":null');
        expect(raw).toContain('"migrationHist":null');
        expect(raw).toContain('"neffSeries":null');
      } finally {
        reader.disconnect();
      }

      // THE PUBLISH WAS LOGGED, AND BOTH SINKS ANSWERED. Asserted on the captured
      // stream rather than assumed: a publisher that wrote the file, failed the
      // redis sink and logged the failure would otherwise pass every check above
      // except the `reader.get`, and the log is where a reader learns which sink
      // it was.
      const logged = lines.join("\n");
      expect(logged).toContain(String(TIP.height));
      expect(logged).not.toContain("sink_failed");
    },
  );
});

/* -------------------------------------------------------------------------- */
/* A1 FAIL SIDE, by DATA - the same code against a real database with rows     */
/* -------------------------------------------------------------------------- */

const DEFAULT_DB = "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";
const dbUrl = process.env["DATABASE_URL"] ?? DEFAULT_DB;
const testSchema = process.env["ZR_TEST_SCHEMA"];
const connectionOptions =
  testSchema === undefined || testSchema === ""
    ? {}
    : { connection: { search_path: `"${testSchema}", public` } };

async function pgReachable(): Promise<boolean> {
  let p: Sql | null = null;
  try {
    p = postgres(dbUrl, { max: 1, connect_timeout: 1, idle_timeout: 0, ...connectionOptions });
    await p`SELECT 1 FROM blocks LIMIT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await p?.end({ timeout: 1 }).catch(() => undefined);
  }
}

const pgUp = await pgReachable();

describe("A1 FAIL SIDE - the same three panels, MEASURED, against a real database", () => {
  it.runIf(!pgUp)(
    "A1 FAIL SIDE SKIPPED, WITH ITS REASON: no reachable Postgres, so the fail side did not discriminate",
    () => {
      expect(pgUp).toBe(false);
    },
  );
});

describe.skipIf(!pgUp)("A1 FAIL SIDE - measured against a real database", () => {
  const sql = postgres(dbUrl, { max: 2, idle_timeout: 5, ...connectionOptions });

  beforeEach(async () => {
    // NO SCHEMA, NO TRUNCATE - the refusal `_setup.ts` makes and the reason
    // `snapshot-inputs.integration.test.ts` states: a missing `globalSetup` line
    // leaves `search_path` at `public` and this would wipe the shared tables.
    if (!mayTruncate(testSchema, process.env["ZR_ALLOW_PUBLIC_TRUNCATE"])) {
      throw new Error(
        "refused to TRUNCATE: ZR_TEST_SCHEMA is unset, so `search_path` is `public` and this " +
          "would wipe the shared tables. This package's vitest config must declare " +
          '`globalSetup: ["../indexer/test/global-setup.ts"]`.',
      );
    }
    await sql.unsafe(
      "TRUNCATE pool_snapshots, blocks, pool_nullifiers, pool_anchors, migrations_zip318 RESTART IDENTITY",
    );

    // ENOUGH ROWS THAT EACH OF THE THREE PANELS HAS SOMETHING TO MEASURE. The
    // point is not the values - `snapshot-inputs.integration.test.ts` pins those
    // against the real queries - it is that the same code, one variable changed,
    // publishes measurements where the RPC-only document publishes absences.
    const samples: Array<[number, bigint, number, number]> = [
      [BASELINE_HEIGHT - 10, 900_000n, BASE_TIME_S - 3600 * 30, BASE_WRITE_S],
      [TIP_HEIGHT - 48, 709_841n, BASE_TIME_S - 3600, BASE_WRITE_S + 3],
      [TIP_HEIGHT, 708_841n, BASE_TIME_S, BASE_WRITE_S + 4],
    ];
    for (const [height, zec, timeS, writeS] of samples) {
      await sql`INSERT INTO blocks (height, time_s, hash) VALUES (${height}, ${timeS}, ${hashFor(height)})`;
      await sql`
        INSERT INTO pool_snapshots (pool, height, balance_zat, commitment_count, nullifier_count, anchor_count, ts)
        VALUES ('orchard', ${height}, ${(zec * ZAT_PER_ZEC).toString()}, 0, 0, 0, to_timestamp(${writeS}))
      `;
    }

    await sql`
      INSERT INTO migrations_zip318 (txid, height, amount_zat, denom_n, denom_k, canonical)
      VALUES (${"ab".repeat(32)}, ${TIP_HEIGHT - 3}, ${(100n * ZAT_PER_ZEC).toString()}, 1, 2, true)
    `;

    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('ironwood', ${"ee".repeat(32)}, ${TIP_HEIGHT - 20}, '4090')
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"11".repeat(32)}, ${"aa".repeat(32)}, ${IRONWOOD_LOW + 5}, ${"ee".repeat(32)})
    `;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("the three panels the RPC-only document leaves null come back MEASURED", async () => {
    // THE COMPOSITION ROOT'S OWN BRANCH, not a hand-built dependency bag. This
    // is the member of A1's exclusion set: a `DATABASE_URL` pointed at a live
    // database with rows.
    const cfg = loadConfig({ DATABASE_URL: dbUrl });
    const access = chainAccessFor(cfg, (url) =>
      postgres(url, { max: 2, idle_timeout: 5, ...connectionOptions }),
    );
    expect(access.sql, "a URL means a client").not.toBeNull();

    try {
      const inputs = await readSnapshotInputs(
        {
          readChainInfo: () => Promise.resolve(LIVE_SHAPED_INFO),
          ...access.queries,
          cfg,
          labelsVersion: "labels-14-2026-09-03",
          now: () => (BASE_TIME_S + 10) * 1000,
        },
        { height: TIP_HEIGHT, hash: hashFor(TIP_HEIGHT), timeMs: BASE_TIME_S * 1000 },
      );
      const measured = buildSnapshot(inputs, REAL_INSTRUMENTS);

      for (const panel of DATABASE_DERIVED) {
        expect(
          measured[panel],
          `${panel} is null in RPC-only mode and MEASURED here - that difference is A1`,
        ).not.toBeNull();
      }
      // `residual` is measured on BOTH sides, which is A1b's whole point: it is
      // the panel the database does not decide.
      expect(measured.residual).not.toBeNull();
    } finally {
      await access.sql?.end({ timeout: 5 });
    }
  });
});
