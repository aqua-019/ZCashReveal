/**
 * HANDOFF-09a's assertions A1 and A6: the analysis panels are non-null on a
 * published snapshot, and the composition root is what makes them so.
 *
 * WHAT THIS SUITE IS FOR, AND WHY IT IS NOT THE SAME AS THE BUILDER'S OWN TESTS.
 * `snapshot-builder.test.ts` proves the BUILDER carries a number through, using
 * the stand-in instruments in `harness.ts` - each of which returns a literal, so
 * the assertion is about plumbing and deliberately says nothing about an
 * estimator. This suite proves the other half: that the REAL estimators, the ones
 * in `@zcashreveal/instruments`, reach the document, and that the process which
 * ships passes them. HANDOFF-09 had a green builder suite for a whole handoff
 * while all four of these panels published as `null`, which is precisely the
 * failure a stand-in cannot see.
 *
 * THE FINDING THIS SUITE EXISTS TO PIN, AND IT IS THE REASON THE PRODUCTION-PATH
 * TEST BELOW IS SEPARATE FROM THE OTHERS. HANDOFF-09a's scope asks for "the four
 * panels are non-null on a published snapshot". Wiring the real estimators
 * achieves that for the INSTRUMENT side - given inputs, all four are computed and
 * all four are published. It does NOT achieve it on the path the publisher
 * actually runs, and the gap is not packaging. `readSnapshotInputs` hard-codes
 * `drainBaseline: null` and `ironwoodSpends: null`, for two documented reasons
 * that have nothing to do with where the estimators live:
 *
 *   drain       `pool_snapshots.ts` is a TIMESTAMPTZ DEFAULT NOW() - the time the
 *               indexer WROTE the row, not the block's time. Plan section 3.3's
 *               velocity is "from block timestamps", and substituting a write
 *               time would publish a rate measured against the indexer's own
 *               scheduling: right to within seconds at the tip, arbitrarily wrong
 *               across a catch-up sync, and indistinguishable from the real thing
 *               on the page. The repair is a block-time column, i.e. a migration.
 *
 *   neffSeries  the Ironwood spends and their Cand_0 bounds live in the indexer's
 *               candidate analysis, not in any table this process reads.
 *
 * So after this handoff the production snapshot carries `residual` and
 * `migrationHist` as measurements and `drain` and `neffSeries` as stated
 * absences. That is a real improvement on four absences and it is NOT what
 * "the four panels are non-null" claims, so the third test below asserts the
 * true state by name. It is written as an assertion rather than a comment
 * because HANDOFF-11 may not ship a null analysis panel (LEDGER-09 Q4), and a
 * session that reads only the first test would discover these two at the
 * cutover.
 *
 * THE FAIL SIDE IS THE EVIDENCE, not a formality. "The panels are non-null" is
 * worth nothing on its own - a builder that ignored its instruments and returned
 * four literals would satisfy it. What makes it evidence is that withholding the
 * functions makes all four go null over the same inputs.
 */

import { describe, expect, it } from "vitest";

import { asHex, snapshotV1Schema } from "@zcashreveal/types";

import { NO_INSTRUMENTS, REAL_INSTRUMENTS, type PoolBalanceSample } from "../instruments.js";
import { buildSnapshot, type SnapshotInputs } from "../snapshot-builder.js";
import { fixtureInputs, fixtureTimeMs, hashFor, ZAT_PER_ZEC } from "./harness.js";
import { readSnapshotInputs } from "../sources/chain-inputs.js";
import { loadConfig } from "../config.js";

/** The four panels HANDOFF-09 published as null on every tip. */
const PANELS = ["residual", "drain", "migrationHist", "neffSeries"] as const;

const HEIGHT = 3_800_000;

/**
 * An Orchard balance series the REAL `orchardDrain` accepts.
 *
 * `harness.ts`'s `fixtureInputs` carries `orchardSeries: []` because the STAND-IN
 * drain ignored its series and returned a literal. The real one does not: it
 * throws a `RangeError` when no sample sits at or below `atHeight`, on the
 * argument that "a drain of 0 would be a reading this call never took". So a
 * suite that wires the real estimators has to supply a real series, and that
 * difference is itself the point - see the last test in this file.
 */
function orchardSeries(): PoolBalanceSample[] {
  return [
    { height: 3_428_143, timeMs: Date.UTC(2026, 0, 1), balanceZat: 3_660_000n * ZAT_PER_ZEC },
    { height: HEIGHT - 1, timeMs: Date.UTC(2026, 7, 29, 12), balanceZat: 709_000n * ZAT_PER_ZEC },
    { height: HEIGHT, timeMs: Date.UTC(2026, 7, 30, 12), balanceZat: 708_841n * ZAT_PER_ZEC },
  ];
}

/** Fixture inputs with every panel's input supplied - the instrument-side case. */
function fullyFedInputs(): SnapshotInputs {
  return fixtureInputs(HEIGHT, { orchardSeries: orchardSeries() });
}

describe("A1 - the analysis panels are non-null on a published snapshot", () => {
  it("A1 PASS STATE: with the real estimators and inputs for all four, all four panels are present and the document validates", () => {
    const snapshot = buildSnapshot(fullyFedInputs(), REAL_INSTRUMENTS);

    for (const panel of PANELS) {
      expect(snapshot[panel], `${panel} published as null with the real estimators wired`).not.toBeNull();
    }

    // Non-null is not enough: a panel must also be SHAPED like the schema,
    // because the publisher serialises through `snapshotV1Schema` and a panel
    // that is present and malformed fails at the sink rather than here.
    const parsed = snapshotV1Schema.safeParse(JSON.parse(JSON.stringify(snapshot, bigintReplacer)));
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 4))).toBe(true);
  });

  it("A1 FAIL STATE: withhold the estimators and all four panels go null, on the same inputs", () => {
    const snapshot = buildSnapshot(fullyFedInputs(), NO_INSTRUMENTS);

    for (const panel of PANELS) {
      expect(
        snapshot[panel],
        `${panel} was non-null with NO_INSTRUMENTS, so A1's pass state proves nothing`,
      ).toBeNull();
    }
  });

  it("A1 the panels carry the REAL estimators' arithmetic, not a builder default", () => {
    // The residual is the one panel checkable by hand from the fixture, which is
    // what makes it the right one to pin. The fixture balances are sprout 22,621
    // ZEC and orchard 708,841 ZEC against a supply of 16,889,987 ZEC - HANDOFF-09's
    // own A1 fixture - so the real `turnstileResidual` must produce
    // U = 731,462 ZEC and V = 0.95669. A stand-in returning a literal would have
    // to return exactly this to pass, which is the property that makes it a check
    // on the estimator rather than on the wiring.
    const snapshot = buildSnapshot(fullyFedInputs(), REAL_INSTRUMENTS);
    const residual = snapshot.residual;
    if (residual === null) throw new Error("residual is null; A1's pass state should have caught this");

    expect(residual.unprovableZat).toBe(731_462n * ZAT_PER_ZEC);
    expect(residual.verifiedShare).toBeCloseTo(0.95669, 5);

    // And the migration lens publishes plan 3.4's bound rather than TRACKING-MATH
    // 3.9's run count - the correction LEDGER-09 Q1 made and fold 1 amended at
    // source.
    //
    // TWO CROSSINGS OF ONE DENOMINATION IN ADJACENT BLOCKS, which is the
    // docblock's own counterexample and the ONLY shape in which the two bounds
    // differ. The first draft of this assertion used the single-crossing fixture
    // and read `expect(hist.maxWallets).toBe(1)` - and with one crossing
    // `maxWallets`, `denominationRuns`, `canonicalCount` and `minNotes` are ALL
    // 1, so a lens that published the run count as the bound, the exact defect
    // named two lines up, passed it. That is instance five of the shape
    // LEDGER-09 fold 4 asks HANDOFF-13 to specify a guard for, written by the
    // session that recorded the fold, and it is left on the record rather than
    // quietly replaced.
    const twoSameDenomination = buildSnapshot(
      fixtureInputs(HEIGHT, {
        orchardSeries: orchardSeries(),
        crossings: [
          { txid: asHex("aa".repeat(32)), height: HEIGHT - 1, amountZat: 100n * ZAT_PER_ZEC },
          { txid: asHex("bb".repeat(32)), height: HEIGHT, amountZat: 100n * ZAT_PER_ZEC },
        ],
      }),
      REAL_INSTRUMENTS,
    );
    const hist = twoSameDenomination.migrationHist;
    if (hist === null) throw new Error("migrationHist is null; A1's pass state should have caught this");
    expect(hist.maxWallets).toBe(2);
    expect(hist.denominationRuns).toBe(1);
  });

  it("A1 THE PRODUCTION PATH PUBLISHES TWO OF THE FOUR, and the two absences are the INPUT layer rather than the package move", async () => {
    // DRIVEN THROUGH THE REAL `readSnapshotInputs`, NOT A HAND-WRITTEN COPY OF
    // ITS OUTPUT (gate round 1, M5). The first draft wrote the three shapes out
    // as a literal and justified it by claiming the copy would "fail when that
    // module changes" - which is exactly backwards. A literal is coupled to
    // nothing: the day a handoff adds the block-time migration and starts
    // supplying a `drainBaseline`, a copy keeps asserting `drain === null` about
    // its own literal and stays green, telling the next reader the trap is armed
    // when it is not.
    const inputs = await readSnapshotInputs(
      {
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
        queryMigrations: () =>
          Promise.resolve([{ txid: "bb".repeat(32), height: HEIGHT - 100, amount_zat: "100000000" }]),
        cfg: loadConfig({}),
        labelsVersion: "labels-9-2026-08-22",
        now: () => fixtureTimeMs(HEIGHT) + 4_000,
      },
      { height: HEIGHT, hash: hashFor(HEIGHT), timeMs: fixtureTimeMs(HEIGHT) },
    );
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS);

    // Un-nulled by this handoff.
    expect(snapshot.residual, "residual should be measured on the production path").not.toBeNull();
    expect(snapshot.migrationHist, "migrationHist should be measured on the production path").not.toBeNull();

    // STILL ABSENT, and not because of where the estimators live. `drain` needs a
    // block-time column on `pool_snapshots` (a migration); `neffSeries` needs the
    // indexer's candidate analysis, which no table this process reads carries.
    // HANDOFF-11 may not ship a null analysis panel (LEDGER-09 Q4), so these two
    // are its work and this assertion is where it will meet them.
    expect(snapshot.drain, "drain became measurable without a block-time column - re-read this test").toBeNull();
    expect(snapshot.neffSeries, "neffSeries became measurable without an Ironwood spend source").toBeNull();
  });

  it("A1 A PANEL WHOSE ESTIMATOR REFUSES ITS INPUTS IS AN ABSENCE, NOT A LOST DOCUMENT", () => {
    // GATE ROUND 1, H1. This assertion used to read `.toThrow(/no sample at or
    // below/)`, which is what the builder then did: the estimator's refusal
    // escaped `buildSnapshot`, `SnapshotPublisher` caught it as a build failure,
    // and the tip published NOTHING - not a missing panel, no document, so
    // `pools`, `residual` and `lastReports` went with it. The live case needed
    // no unusual input at all: `migrations_zip318` is `CHECK (amount_zat >= 0)`
    // and `migrationLens` refuses `amountZat <= 0n`, so one zero row froze every
    // tip in its 1,152-block window - about a day of the public site stuck at a
    // stale height.
    const faults: string[] = [];
    const baselineWithoutSeries = fixtureInputs(HEIGHT, { orchardSeries: [] });
    expect(baselineWithoutSeries.drainBaseline).not.toBeNull();

    const snapshot = buildSnapshot(baselineWithoutSeries, REAL_INSTRUMENTS, (panel) => faults.push(panel));

    // The panel is an absence and the reason was reported...
    expect(snapshot.drain).toBeNull();
    expect(faults).toContain("drain");
    // ...and the rest of the document survived, which is the whole point.
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.migrationHist).not.toBeNull();
    expect(snapshot.pools).toHaveLength(5);
  });

  it("A1 the live case: one zero-amount migration row costs its panel and nothing else", () => {
    // `CHECK (amount_zat >= 0)` permits this row; `migrationLens` refuses it.
    const faults: string[] = [];
    const withZeroCrossing = fixtureInputs(HEIGHT, {
      orchardSeries: orchardSeries(),
      crossings: [
        { txid: asHex("aa".repeat(32)), height: HEIGHT - 500, amountZat: 0n },
        { txid: asHex("bb".repeat(32)), height: HEIGHT, amountZat: 100n * ZAT_PER_ZEC },
      ],
    });
    const snapshot = buildSnapshot(withZeroCrossing, REAL_INSTRUMENTS, (panel) => faults.push(panel));

    expect(snapshot.migrationHist).toBeNull();
    expect(faults).toEqual(["migrationHist"]);
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.drain).not.toBeNull();
    expect(snapshot.neffSeries).not.toBeNull();
  });

  it("A1 a `drained` outside [0, 1] is refused rather than written to the shared store", () => {
    // The one precondition in this family that does NOT throw in the estimator:
    // a baseline BELOW the current balance gives a negative `drained`, which
    // `snapshotDrainSchema` forbids. `serializeSnapshot` is a bare
    // `JSON.stringify` and validates nothing, so before this check the invalid
    // document reached the file sink AND the managed store shared with another
    // project, and died in the gateway's `safeParse` taking every other panel
    // with it - while this process logged `snapshot published`.
    const faults: string[] = [];
    const risingPool = fixtureInputs(HEIGHT, {
      orchardSeries: orchardSeries(),
      drainBaseline: { height: 3_428_143, zat: 1n * ZAT_PER_ZEC },
    });
    const snapshot = buildSnapshot(risingPool, REAL_INSTRUMENTS, (panel) => faults.push(panel));

    expect(snapshot.drain).toBeNull();
    expect(faults).toContain("drain");
    const parsed = snapshotV1Schema.safeParse(JSON.parse(JSON.stringify(snapshot, bigintReplacer)));
    expect(parsed.success, "the published document must validate even when a panel was refused").toBe(true);
  });
});

describe("A6 - NO_INSTRUMENTS is no longer what the composition root ships", () => {
  it("A6 PASS STATE: REAL_INSTRUMENTS carries five functions and no nulls", () => {
    const members = Object.entries(REAL_INSTRUMENTS);
    expect(members).toHaveLength(5);
    for (const [name, fn] of members) {
      expect(typeof fn, `REAL_INSTRUMENTS.${name} is ${String(fn)}, not a function`).toBe("function");
    }
  });

  it("A6 FAIL STATE: the same assertion over NO_INSTRUMENTS names every null", () => {
    // SORTED, so the assertion is about WHICH members are null and not about the
    // order the object literal happens to declare them in. The first draft
    // compared against a positional array, so reordering five keys - a
    // formatting change with no behavioural content - failed it.
    const nulls = Object.entries(NO_INSTRUMENTS)
      .filter(([, fn]) => typeof fn !== "function")
      .map(([name]) => name)
      .sort();
    expect(nulls).toEqual(
      ["turnstileResidual", "selectWindow", "orchardDrain", "migrationLens", "ironwoodBirth"].sort(),
    );
  });

  it("A6 the entry point passes REAL_INSTRUMENTS - read from the source, not from a re-export", async () => {
    // WHY THE SOURCE IS READ RATHER THAN THE MODULE IMPORTED. `src/index.ts` is
    // the composition root: importing it opens Postgres, a Redis subscriber and
    // the node, which is what its own `import.meta.url` guard exists to prevent a
    // test from doing. So the assertion is over the text, and it is narrow on
    // purpose - it pins the ARGUMENT at the call site, which is the one token
    // deciding whether those panels ship as numbers or as absences.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");

    // The bundle must be the SECOND argument; a third (the panel-fault sink) is
    // allowed and is asserted separately below. The first draft of this regex
    // required a closing paren straight after `REAL_INSTRUMENTS` and broke the
    // moment the fault callback was added - a test pinned to punctuation rather
    // than to the claim.
    expect(source).toMatch(/buildSnapshot\(\s*inputs,\s*REAL_INSTRUMENTS\b/);
    expect(source).not.toMatch(/buildSnapshot\(\s*inputs,\s*NO_INSTRUMENTS\b/);
    // And the fault sink is wired, or a refused panel would publish as an
    // absence with no recorded reason (gate round 1, H1).
    expect(source).toMatch(/analysis panel refused its inputs/);
  });
});

/** `JSON.stringify` throws on a bigint; the schema parses the serialised form. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
