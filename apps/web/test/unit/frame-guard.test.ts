/**
 * The cheap guard and the authoritative schema must agree.
 *
 * `asFrame` in src/lib/api/stream.ts is a hand-written narrowing check, and it
 * exists for one reason: importing `zecFrameSchema` into the client bundle cost
 * 15 kB on /track. A hand-written check that drifts from the schema it stands
 * in for is worse than the 15 kB, so this file holds the two to the same verdict
 * on every frame the fixture stream emits and on a table of malformed ones.
 *
 * This test imports zod. The browser does not - that is the whole arrangement.
 */
import { describe, expect, it } from "vitest";

import { zecFrameSchema, type ZecFrame } from "@zcashreveal/types";

import { asFrame } from "@/lib/api/stream";
import { MEMPOOL_VIEW } from "@/lib/api/fixtures/mempool";

/** The wire form: JSON cannot carry a bigint, so it travels as a decimal string. */
function overWire(frame: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(frame, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
}

/** The first mempool row, over the wire. The corpus always has one. */
const ROW = (): Record<string, unknown> => overWire(MEMPOOL_VIEW.entries[0] ?? {});

/** Every frame the fixture stream actually emits, in the order it emits them. */
const REAL: readonly unknown[] = [
  { type: "hello", tipHeight: MEMPOOL_VIEW.tipHeight },
  { type: "snapshot", view: MEMPOOL_VIEW },
  ...MEMPOOL_VIEW.entries.map((entry) => ({ type: "tx_added", entry: { ...entry, ageSeconds: 0 } })),
  { type: "tx_removed", txid: MEMPOOL_VIEW.entries[0]?.txid, reason: "confirmed" },
  { type: "tip", height: MEMPOOL_VIEW.tipHeight + 1, hash: "0".repeat(63) + "e" },
];

const MALFORMED: readonly (readonly [string, unknown])[] = [
  ["null", null],
  ["a string", "hello"],
  ["a number", 42],
  ["an array", []],
  ["no type", { tipHeight: 1 }],
  ["an unknown type", { type: "banana", tipHeight: 1 }],
  ["hello with a float height", { type: "hello", tipHeight: 1.5 }],
  ["hello with a negative height", { type: "hello", tipHeight: -1 }],
  ["hello with a string height", { type: "hello", tipHeight: "1" }],
  ["tip with a short hash", { type: "tip", height: 1, hash: "abc" }],
  ["tip with an uppercase hash", { type: "tip", height: 1, hash: "A".repeat(64) }],
  ["tx_removed with a bad reason", { type: "tx_removed", txid: "a".repeat(64), reason: "vanished" }],
  ["tx_added with no entry", { type: "tx_added" }],
  ["tx_added with an entry missing its fee", { type: "tx_added", entry: { ...ROW(), feeZat: undefined } }],
  ["tx_added with a float zatoshi fee", { type: "tx_added", entry: { ...ROW(), feeZat: "1.5" } }],
  ["tx_added with an unknown lane", { type: "tx_added", entry: { ...ROW(), lanes: ["bitcoin"] } }],
  ["tx_added with an unknown severity", { type: "tx_added", entry: { ...ROW(), severity: "CRITICAL" } }],
  ["tx_added with empty reasoning", { type: "tx_added", entry: { ...ROW(), reasoning: [] } }],
  ["snapshot with no view", { type: "snapshot" }],
  ["snapshot with a broken row", { type: "snapshot", view: { ...overWire(MEMPOOL_VIEW), entries: [{ txid: "nope" }] } }],
  ["snapshot with a missing summary", { type: "snapshot", view: { tipHeight: 1, entries: [] } }],
];

describe("the guard accepts every frame the stream emits", () => {
  for (const [i, frame] of REAL.entries()) {
    const wire = overWire(frame);
    const type = (frame as { type: string }).type;

    it(`frame ${i} (${type}): the guard accepts it`, () => {
      expect(asFrame(wire), `guard rejected a real ${type} frame`).not.toBeNull();
    });

    it(`frame ${i} (${type}): the schema accepts it too`, () => {
      expect(zecFrameSchema.safeParse(wire).success, `schema rejected a real ${type} frame`).toBe(true);
    });

    it(`frame ${i} (${type}): the two produce the same value`, () => {
      const byGuard = asFrame(wire) as ZecFrame;
      const bySchema = zecFrameSchema.parse(wire);
      // Compared through JSON with bigints stringified, because a bigint and a
      // bigint are equal but `toEqual` on two objects containing them is the
      // clearest way to see WHICH field diverged when they are not.
      expect(overWire(byGuard)).toEqual(overWire(bySchema));
    });
  }
});

describe("the guard rejects everything the schema rejects", () => {
  for (const [name, frame] of MALFORMED) {
    it(`${name}: both refuse it`, () => {
      expect(asFrame(frame), `the guard accepted ${name}`).toBeNull();
      expect(zecFrameSchema.safeParse(frame).success, `the schema accepted ${name}`).toBe(false);
    });
  }
});

describe("a zatoshi never arrives as a float", () => {
  it("the guard refuses a decimal string, rather than rounding it", () => {
    const frame = { type: "tx_added", entry: { ...ROW(), feeZat: "10000.5" } };
    expect(asFrame(frame)).toBeNull();
  });

  it("the guard refuses a JSON number, which is a double", () => {
    const frame = { type: "tx_added", entry: { ...ROW(), feeZat: 10_000 } };
    expect(asFrame(frame)).toBeNull();
  });

  it("and accepts the decimal-integer string the wire format actually uses", () => {
    const frame = { type: "tx_added", entry: { ...ROW(), feeZat: "10000" } };
    const out = asFrame(frame);
    expect(out?.type).toBe("tx_added");
    expect(out?.type === "tx_added" ? out.entry.feeZat : 0n).toBe(10_000n);
  });
});
