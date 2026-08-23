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

/** The whole view, over the wire, with its summary reachable as an object. */
const VIEW = (): Record<string, unknown> & { readonly summary: Record<string, unknown> } =>
  overWire(MEMPOOL_VIEW) as Record<string, unknown> & { readonly summary: Record<string, unknown> };

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
  ["tx_added with a fee that is not a number at all", { type: "tx_added", entry: { ...ROW(), feeZat: "abc" } }],
  ["tx_added with an unknown lane", { type: "tx_added", entry: { ...ROW(), lanes: ["bitcoin"] } }],
  ["tx_added with an unknown severity", { type: "tx_added", entry: { ...ROW(), severity: "CRITICAL" } }],
  ["tx_added with empty reasoning", { type: "tx_added", entry: { ...ROW(), reasoning: [] } }],
  ["snapshot with no view", { type: "snapshot" }],
  ["snapshot with a broken row", { type: "snapshot", view: { ...overWire(MEMPOOL_VIEW), entries: [{ txid: "nope" }] } }],
  ["snapshot with a missing summary", { type: "snapshot", view: { tipHeight: 1, entries: [] } }],
  ["snapshot with a summary missing its priced count", { type: "snapshot", view: { ...VIEW(), summary: { ...VIEW().summary, pricedCount: undefined } } }],
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

/**
 * AN UNPRICED ROW IS DATA. IT IS NOT A MALFORMED ONE.
 *
 * The fee is not on the wire - it is the difference between the outputs a
 * transaction spends and what it pays out, and an input whose parent the node
 * does not hold leaves that sum unfinished - so `feeZat` is nullable since
 * HANDOFF-06 and `asRow` reads a null fee as a row to KEEP.
 *
 * It did not always. The guard's zatoshi helper collapsed "the field was null"
 * and "the field was rubbish" onto the same answer, and `feeZat === null` is
 * how `asRow` says reject, so every transaction the producer could not price
 * would have been dropped from the live panel rather than shown without a fee.
 * A dropped row does not look like a bug from the outside; it looks like a
 * quiet mempool. `asNullableZat` fixed that and nothing in this repository
 * asserted it, which is why this block exists.
 *
 * Both polarities, because one of them alone is not evidence: null is kept AND
 * kept null, and anything in that field which is not a decimal-integer string
 * is still refused.
 */
describe("a fee that could not be computed is an answer, not a broken row", () => {
  const nullFee = (): Record<string, unknown> => ({ type: "tx_added", entry: { ...ROW(), feeZat: null } });

  it("the guard accepts the row, and leaves the fee null", () => {
    const out = asFrame(nullFee());
    expect(out, "the guard dropped a row whose fee could not be computed").not.toBeNull();
    expect(out?.type).toBe("tx_added");
    expect(out?.type === "tx_added" ? out.entry.feeZat : 0n, "a null fee arrived as something other than null").toBeNull();
  });

  it("the schema accepts it too, and the two produce the same row", () => {
    expect(zecFrameSchema.safeParse(nullFee()).success, "the schema rejected a null fee").toBe(true);
    expect(overWire(asFrame(nullFee()) as ZecFrame)).toEqual(overWire(zecFrameSchema.parse(nullFee())));
  });

  it("but rubbish in the same field is still refused, by both", () => {
    const bad: readonly (readonly [string, unknown])[] = [
      ["a decimal string", "1.5"],
      ["a word", "abc"],
      ["an empty string", ""],
      ["nothing at all", undefined],
    ];
    for (const [what, feeZat] of bad) {
      const frame = { type: "tx_added", entry: { ...ROW(), feeZat } };
      expect(asFrame(frame), `the guard accepted ${what} as a fee`).toBeNull();
      expect(zecFrameSchema.safeParse(frame).success, `the schema accepted ${what} as a fee`).toBe(false);
    }
  });

  it("and the committed corpus carries one, so the stream exercises this without help", () => {
    // Without this the three checks above are all synthetic frames, and the
    // "not priced" cell would still be a render path nobody has ever seen.
    const unpriced = MEMPOOL_VIEW.entries.filter((r) => r.feeZat === null);
    expect(unpriced.length, "no fixture row is unpriced").toBeGreaterThan(0);
  });
});

/**
 * `pricedCount` is a DENOMINATOR, and a guard that let it through absent would
 * hand the tile on /track a hole to divide by.
 *
 * The field was added to the summary in HANDOFF-06: /track renders
 * "N of M priced pay it", where M is how many transactions could be priced at
 * all rather than how many are waiting - "N of 12" would be a claim about the
 * transactions nobody priced. It is required, so a summary without it is not a
 * summary, and the malformed table above holds both the guard and the schema to
 * refusing one. This is the other polarity: the guard carries the real value
 * through rather than dropping the field on the floor.
 */
describe("the summary's priced count reaches the panel", () => {
  it("the guard carries it through, unchanged", () => {
    const out = asFrame(overWire({ type: "snapshot", view: MEMPOOL_VIEW }));
    expect(out?.type).toBe("snapshot");
    expect(out?.type === "snapshot" ? out.view.summary.pricedCount : -1).toBe(MEMPOOL_VIEW.summary.pricedCount);
  });

  it("and the count it carries is the corpus's own rows, not its row count", () => {
    const priced = MEMPOOL_VIEW.entries.filter((r) => r.feeZat !== null).length;
    expect(MEMPOOL_VIEW.summary.pricedCount).toBe(priced);
    expect(MEMPOOL_VIEW.summary.pricedCount, "every row is priced, so the denominator is untested").toBeLessThan(
      MEMPOOL_VIEW.entries.length,
    );
  });
});
