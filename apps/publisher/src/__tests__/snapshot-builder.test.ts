/**
 * A5 - a snapshot this builder produces validates against `snapshotV1Schema`,
 * through the file, the way a sink writes it.
 *
 * THE ROUND TRIP IS THE ASSERTION, NOT THE PARSE. Validating the in-memory
 * object would prove nothing about the thing that ships: `JSON.stringify` throws
 * on a `bigint`, `serializeSnapshot` is the one function that gets past that, and
 * `zatSchema` is what reads a decimal string back as a `bigint`. So the document
 * is serialised, written to a file, read back from disk, parsed, and the parsed
 * zatoshi are compared to the ones that went in.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serializeSnapshot, snapshotV1Schema, SNAPSHOT_MAX_REPORTS } from "@zcashreveal/types";
import { describe, expect, it } from "vitest";

import { NO_INSTRUMENTS } from "../instruments.js";
import { buildSnapshot, lanesWithShares, newestReports } from "../snapshot-builder.js";
import { fixtureInputs, fixtureInstruments, mempoolRow, ZAT_PER_ZEC } from "./harness.js";

function tempFile(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "zecreveal-snapshot-")), name);
}

describe("A5 - a published snapshot validates as SnapshotV1", () => {
  it("A5 PASS STATE: serialize -> write -> read -> snapshotV1Schema.parse succeeds", () => {
    const snapshot = buildSnapshot(fixtureInputs(3_500_000), fixtureInstruments());
    const path = tempFile("snapshot.json");
    writeFileSync(path, serializeSnapshot(snapshot), "utf8");

    const onDisk = readFileSync(path, "utf8");
    const parsed = snapshotV1Schema.parse(JSON.parse(onDisk));

    expect(parsed.schema).toBe(1);
    expect(parsed.height).toBe(3_500_000);
    expect(parsed.hash).toMatch(/^[0-9a-f]{64}$/);
    // Back as a `bigint`, not as a number and not as the string it travelled as.
    expect(typeof parsed.pools[1]?.balanceZat).toBe("bigint");
    expect(parsed.pools[1]?.balanceZat).toBe(22_621n * ZAT_PER_ZEC);
    expect(parsed.residual?.unprovableZat).toBe(731_462n * ZAT_PER_ZEC);
    expect(parsed.residual?.verifiedShare).toBeCloseTo(0.95669, 5);
    expect(parsed.drain?.velocity24hZecPerHour).toBe(-12.5);
    // Null is an absence and survives the round trip as one.
    expect(parsed.drain?.velocity7dZecPerHour).toBeNull();
    expect(parsed.migrationHist?.buckets).toHaveLength(1);
    expect(parsed.neffSeries?.shares.requires_disclosure).toBe(1);
    expect(parsed.lastReports).toHaveLength(2);
  });

  it("A5 PASS STATE: every panel null still validates - an unmeasured publisher is a legal one", () => {
    const snapshot = buildSnapshot(fixtureInputs(3_500_001), NO_INSTRUMENTS);
    const parsed = snapshotV1Schema.parse(JSON.parse(serializeSnapshot(snapshot)));

    expect(parsed.residual).toBeNull();
    expect(parsed.drain).toBeNull();
    expect(parsed.migrationHist).toBeNull();
    expect(parsed.neffSeries).toBeNull();
    expect(parsed.pools).toHaveLength(5);
  });

  it("A5 FAIL STATE: a document missing `schema` is rejected, and the parse names the field", () => {
    const snapshot = buildSnapshot(fixtureInputs(3_500_002), fixtureInstruments());
    const doc = JSON.parse(serializeSnapshot(snapshot)) as Record<string, unknown>;
    delete doc["schema"];

    const result = snapshotV1Schema.safeParse(doc);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("schema");
  });

  it("A5 FAIL STATE: a zatoshi written as a JSON number with a decimal point is rejected", () => {
    const snapshot = buildSnapshot(fixtureInputs(3_500_003), fixtureInstruments());
    const doc = JSON.parse(serializeSnapshot(snapshot)) as Record<string, unknown>;
    (doc["pools"] as { balanceZat: unknown }[])[0]!.balanceZat = "4000000.5";

    const result = snapshotV1Schema.safeParse(doc);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("integer");
  });
});

describe("the builder's own arithmetic", () => {
  /**
   * THE TOLERANCE IS MEASURED RATHER THAN GUESSED, and it is not float noise.
   * `ratioToNumber` scales by `10^12` and TRUNCATES the integer division, so each
   * share is at most `1e-12` below its true value and five of them are at most
   * `5e-12` below 1. The observed sum here is `0.999999999997`, a deficit of
   * `3.0e-12`, which is inside that bound and on the side the truncation
   * predicts. A tolerance of `1e-12` would fail on arithmetic that is behaving
   * exactly as the shared `RATIO_SCALE` in `@zcashreveal/instruments`' `turnstile-accounting.ts`
   * says it does.
   */
  it("the five lane shares sum to 1 within the 5e-12 the truncation allows", () => {
    const lanes = lanesWithShares(fixtureInputs(3_500_000).lanes);
    const total = lanes.reduce((sum, l) => sum + l.share, 0);
    expect(1 - total).toBeGreaterThanOrEqual(0);
    expect(1 - total).toBeLessThanOrEqual(5e-12);
  });

  it("a negative lane balance throws rather than publishing a negative share", () => {
    expect(() => lanesWithShares([{ lane: "sprout", balanceZat: -1n }])).toThrow(/ZIP 209/);
  });

  it("lastReports is capped at SNAPSHOT_MAX_REPORTS, newest first, without reordering the input", () => {
    const rows = Array.from({ length: SNAPSHOT_MAX_REPORTS + 10 }, (_, i) =>
      mempoolRow(i + 1, SNAPSHOT_MAX_REPORTS + 10 - i),
    );
    const before = rows.map((r) => r.txid);
    const out = newestReports(rows);

    expect(out).toHaveLength(SNAPSHOT_MAX_REPORTS);
    expect(out[0]?.ageSeconds).toBe(1);
    expect(rows.map((r) => r.txid)).toEqual(before);
  });

  it("a hash that is not 64 lowercase hex characters throws", () => {
    expect(() =>
      buildSnapshot(fixtureInputs(3_500_000, { hash: "AB".repeat(32) }), NO_INSTRUMENTS),
    ).toThrow(/not a block hash/);
  });

  it("publishedAt is the supplied time and never a clock reading", () => {
    const inputs = fixtureInputs(3_500_000, { publishedAtMs: Date.UTC(2026, 0, 2, 3, 4, 5) });
    const a = buildSnapshot(inputs, NO_INSTRUMENTS);
    const b = buildSnapshot(inputs, NO_INSTRUMENTS);
    expect(a.publishedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(a.publishedAt).toBe(b.publishedAt);
  });
});
