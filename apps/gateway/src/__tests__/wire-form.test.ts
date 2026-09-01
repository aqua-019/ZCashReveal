/**
 * The wire form, and the 500 that was live on `GET /v2/mempool`.
 *
 * `apps/indexer` writes a `LeakReport` to `zcashreveal:mempool:live` and to the
 * `zcashreveal:mempool` channel through a `bigint -> string` replacer, because
 * `JSON.stringify` throws on a `bigint`. The gateway read it back with
 * `JSON.parse(raw) as LeakReport` - a CAST, which asserts a shape rather than
 * producing one - and handed it to `buildMempoolView`, whose first arithmetic
 * on a zatoshi is `abs % ZAT_PER_ZEC`. Mixing a string with a bigint throws.
 *
 * SO EVERY NON-EMPTY MEMPOOL ANSWERED 500 ON A LIVE STACK, and no test saw it,
 * because every suite here built its reports with real `bigint`s and none had
 * ever sent one through the form the indexer actually stores. Found while
 * wiring the WebSocket relay through the same projection.
 */
import { describe, expect, it } from "vitest";

import { reviveWireZatoshi, type LeakReport } from "@zcashreveal/types";

import { buildMempoolView } from "../views/mempool.js";
import { NOW, TIP, report, type Shape } from "./leak-report-fixture.js";

/** Exactly what `apps/indexer`'s `serializeReport` produces. */
function onTheWire(r: LeakReport): unknown {
  return JSON.parse(JSON.stringify(r, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)));
}

/**
 * The shapes to round-trip.
 *
 * ITERATED RATHER THAN HAND-PICKED, over the same builder every other suite
 * uses, so a zatoshi field added to `LeakReport` later is covered by whichever
 * of these shapes populates it rather than by somebody remembering to extend a
 * list. Each names a different combination of pools, because the zatoshi live
 * on the per-pool deltas and the value flow as well as on the fee.
 */
const SHAPES: ReadonlyArray<[string, Shape]> = [
  ["a shield into orchard", { txid: "aa", vin: 1, orchardActions: 2, perPoolZat: [{ pool: "orchard", deltaZat: 100_000_000n }] }],
  ["an unshield out of sapling", { txid: "bb", vout: 1, saplingSpends: 1, perPoolZat: [{ pool: "sapling", deltaZat: -250_000_000n }] }],
  [
    "an orchard to ironwood migration",
    {
      txid: "cc",
      orchardActions: 1,
      ironwoodActions: 1,
      perPoolZat: [
        { pool: "orchard", deltaZat: -500_000_000n },
        { pool: "ironwood", deltaZat: 500_000_000n },
      ],
    },
  ],
  ["a purely transparent transfer", { txid: "dd", vin: 2, vout: 2 }],
  ["a sprout movement, whose balance is a JoinSplit sum", { txid: "ee", perPoolZat: [{ pool: "sprout", deltaZat: -1_000_000n }] }],
];

describe("the wire form round-trips", () => {
  for (const [name, shape] of SHAPES) {
    it(`PASS STATE: ${name} survives serialise-then-revive unchanged`, () => {
      const original = report(shape);
      const revived = reviveWireZatoshi<LeakReport>(onTheWire(original));
      // DEEP EQUALITY WITH THE ORIGINAL, which is what makes the `Zat`-suffix
      // convention checkable rather than assumed: a zatoshi the reviver missed
      // comes back a string and fails here, and a non-zatoshi it converted by
      // mistake comes back a bigint and fails here too.
      expect(revived).toEqual(original);
    });
  }

  it("FAIL STATE, BY DATA: the exact value the indexer stores throws before the reviver and does not after", () => {
    const original = report({ txid: "ff", vin: 1, orchardActions: 2, perPoolZat: [{ pool: "orchard", deltaZat: 100_000_000n }] });

    // Control: with real bigints the view has always worked, which is why every
    // suite here was green.
    expect(() => buildMempoolView([original], TIP, NOW)).not.toThrow();

    // The member of the excluded set: a report as `zcashreveal:mempool:live`
    // actually holds it, cast rather than revived. This is the reproduction of
    // the live 500.
    expect(() => buildMempoolView([onTheWire(original) as LeakReport], TIP, NOW)).toThrow(/Cannot mix BigInt/);

    // And the same value, revived, does not throw and produces the same row.
    const revived = reviveWireZatoshi<LeakReport>(onTheWire(original));
    expect(buildMempoolView([revived], TIP, NOW)).toEqual(buildMempoolView([original], TIP, NOW));
  });

  it("FAIL STATE, BY DATA: a string under a Zat key that is not a decimal integer is LEFT ALONE, not coerced", () => {
    // `BigInt("")` is `0n` and `BigInt("1.5")` throws. Turning an unparseable
    // value into a zero is how `feeZat` came to be `0n` for every transaction
    // this project ever analysed - a fabricated measurement that every test
    // passed over.
    const revived = reviveWireZatoshi<Record<string, unknown>>({ feeZat: "", deltaZat: "1.5", otherZat: "not a number" });
    expect(revived["feeZat"]).toBe("");
    expect(revived["deltaZat"]).toBe("1.5");
    expect(revived["otherZat"]).toBe("not a number");
  });

  it("null under a Zat key stays null, because unknown is neither true nor false", () => {
    // `feeZat` is `Zatoshi | null` since HANDOFF-06, and the null means the fee
    // could not be computed.
    expect(reviveWireZatoshi<Record<string, unknown>>({ feeZat: null })["feeZat"]).toBeNull();
  });

  it("a key that does not end in Zat is untouched even when it looks like one", () => {
    const revived = reviveWireZatoshi<Record<string, unknown>>({ height: "3456227", txid: "00", valueBalanceText: "-1.0 ZEC" });
    expect(revived["height"]).toBe("3456227");
    expect(revived["valueBalanceText"]).toBe("-1.0 ZEC");
  });
});
