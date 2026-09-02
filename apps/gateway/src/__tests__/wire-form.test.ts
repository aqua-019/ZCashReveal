/**
 * The wire form, the 500 that was live on `GET /v2/mempool`, and the seam A3
 * would have shipped.
 *
 * FIRST DEFECT (HANDOFF-11). `apps/indexer` writes a `LeakReport` to
 * `zcashreveal:mempool:live` and to the `zcashreveal:mempool` channel through a
 * bigint-aware replacer, because `JSON.stringify` throws on a `bigint`. The
 * gateway read it back with `JSON.parse(raw) as LeakReport` - a CAST, which
 * asserts a shape rather than producing one - and handed it to
 * `buildMempoolView`, whose first arithmetic on a zatoshi is `abs % ZAT_PER_ZEC`.
 * Mixing a string with a bigint throws. SO EVERY NON-EMPTY MEMPOOL ANSWERED 500
 * ON A LIVE STACK, and no test saw it, because every suite here built its
 * reports with real `bigint`s and none had ever sent one through the form the
 * indexer actually stores.
 *
 * SECOND DEFECT (HANDOFF-12, A3), LATENT IN THE FIX FOR THE FIRST. The reviver
 * HANDOFF-11 added revived BY KEY - a decimal string under a key ending in
 * `Zat` - and the round trip below covered five real shapes, none of which
 * populated an assessment. `ClaimAssessment.rawCount`, `effectiveSetSize` and
 * every filter's `countIn`/`countOut` are bigints with no `Zat` suffix, because
 * they are counts. Executed through the real producer and the real reviver,
 * four of five came back `string` where the type said `bigint`. The fix moves
 * the convention from the key to the VALUE: `serializeWire` tags every bigint
 * as `{ "$bigint": "<decimal>" }` and `reviveWire` untags exactly that, so the
 * two agree on the whole domain by construction. See realtime.ts.
 *
 * THIS FILE USES THE REAL PRODUCER. It used to carry its own copy of the
 * indexer's replacer ("exactly what serializeReport produces"), which is a test
 * building its own input - the seam shape CLAUDE.md records - and it could not
 * have noticed the indexer's form changing underneath it.
 */
import { describe, expect, it } from "vitest";

import {
  reviveWire,
  serializeWire,
  type ClaimAssessment,
  type LeakReport,
  type LinkRecord,
  type SpendAnnotation,
} from "@zcashreveal/types";

import { buildMempoolView } from "../views/mempool.js";
import { hex, NOW, report, saplingSpend, TIP, type Shape } from "./leak-report-fixture.js";

/**
 * The form an indexer BEFORE HANDOFF-12 wrote: every bigint stringified by
 * value, untagged. Kept here as DATA - a member of A3's exclusion set - and
 * never as a second reader of the wire.
 */
function legacyWire(r: LeakReport): unknown {
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

/**
 * An assessment with two applied filters, which is the shape the live path
 * attaches to a link: `time_window` then `amount_match`. Every bigint here is a
 * COUNT or a POSITION except the three `*Zat` params - the family A3 is about.
 */
function assessment(): ClaimAssessment<"sapling"> {
  return {
    pool: "sapling",
    anchorRoot: hex("22"),
    rawCount: 73_944_725n,
    effectiveSetSize: 57n,
    entropyBits: 5.83289001416474,
    claimLevel: "small_heuristic_set",
    appliedFilters: [
      {
        filter: "time_window",
        params: { windowBlocks: 1_000, lowHeight: 3_443_837, highHeight: 3_444_837 },
        countIn: 73_944_725n,
        countOut: 1_234n,
      },
      {
        filter: "amount_match",
        params: {
          matchedDepositTxid: hex("ab"),
          matchedDepositHeight: 3_444_100,
          matchedDepositAmountZat: 250_000_000n,
          withdrawalAmountZat: 249_990_000n,
          toleranceZat: 160_000n,
          matchKind: "FEE_TOLERANT",
        },
        countIn: 1_234n,
        countOut: 57n,
      },
    ],
  };
}

/** The named worked case: an unshield whose spend AND whose link both carry an assessment. */
function assessedReport(): LeakReport {
  const base = report({ txid: "ff", vout: 1, saplingSpends: 1, perPoolZat: [{ pool: "sapling", deltaZat: 249_990_000n }] });
  const spend: SpendAnnotation = {
    pool: "sapling",
    index: 0,
    nullifier: saplingSpend(0).nullifier,
    anchor: saplingSpend(0).anchor,
    anchorHeight: 3_444_837,
    anchorDepthBlocks: 17,
    isRecentAnchor: true,
    severity: "MEDIUM",
    assessment: assessment(),
  };
  const link: LinkRecord = {
    shieldingTxid: hex("ab"),
    unshieldingTxid: base.txid,
    senderAddress: null,
    recipientAddress: "t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe",
    amountZat: 249_990_000n,
    timeDeltaMs: 1_800_000,
    matchKind: "FEE_TOLERANT",
    poolPath: "sapling",
    confidence: "MEDIUM",
    assessment: assessment(),
  };
  return { ...base, spends: [spend], links: [link] };
}

/** Every path in a value at which a bigint lives, so the two sides can be compared field by field. */
function bigintPaths(value: unknown, path = ""): string[] {
  if (typeof value === "bigint") return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => bigintPaths(v, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => bigintPaths(v, path === "" ? k : `${path}.${k}`));
  }
  return [];
}

describe("the wire form round-trips", () => {
  for (const [name, shape] of SHAPES) {
    it(`PASS STATE: ${name} survives serialise-then-revive unchanged`, () => {
      const original = report(shape);
      const revived = reviveWire<LeakReport>(serializeWire(original));
      // DEEP EQUALITY WITH THE ORIGINAL: a bigint the reviver missed comes back
      // a string and fails here, and a non-bigint it converted by mistake comes
      // back a bigint and fails here too.
      expect(revived).toEqual(original);
    });
  }

  it("PASS STATE (A3): a report carrying a spend assessment and a link assessment survives unchanged, every bigint a bigint", () => {
    const original = assessedReport();
    const paths = bigintPaths(original);
    // The worked case has to REACH the family it is about, or a green run here
    // is evidence about nothing: nine bigints live in each of the two
    // assessments - rawCount, effectiveSetSize, two counts on each of the two
    // filters, and the three `*Zat` params of the amount match.
    expect(paths.filter((p) => p.includes("assessment")).length).toBe(18);
    expect(paths.some((p) => p.endsWith("rawCount"))).toBe(true);
    expect(paths.some((p) => p.endsWith("countOut"))).toBe(true);

    const revived = reviveWire<LeakReport>(serializeWire(original));
    expect(revived).toEqual(original);
    // Field by field as well as deep-equal, because `toEqual` says WHETHER and
    // this says WHERE: every bigint path on the producer side is a bigint on
    // the consumer side.
    expect(bigintPaths(revived).sort()).toEqual(paths.sort());
  });

  it("FAIL STATE, BY DATA (A3): the untagged form an older indexer wrote leaves the assessment's counts as strings - the member the exclusion set names", () => {
    // The member of A3's excluded set, exactly as measured before the fix:
    // `assessment.rawCount` arriving as a string. A reviver keyed on `Zat`
    // recovered `valueZat` and never this. The value-tagged reviver does not
    // pretend to recover it either - the untagged form is simply not the wire
    // form any more - so the asymmetry is VISIBLE as a type mismatch rather
    // than hidden by a partial revival.
    const original = assessedReport();
    const legacy = reviveWire<LeakReport>(legacyWire(original));
    expect(legacy).not.toEqual(original);
    expect(typeof legacy.spends[0]?.assessment?.rawCount).toBe("string");
    expect(typeof legacy.spends[0]?.assessment?.appliedFilters[0]?.countOut).toBe("string");
    expect(typeof legacy.links[0]?.assessment?.effectiveSetSize).toBe("string");
    // And the same report through the real producer has none of that.
    expect(typeof reviveWire<LeakReport>(serializeWire(original)).spends[0]?.assessment?.rawCount).toBe("bigint");
  });

  it("FAIL STATE, BY DATA: the exact value the indexer stores throws before the reviver and does not after", () => {
    const original = report({ txid: "ff", vin: 1, orchardActions: 2, perPoolZat: [{ pool: "orchard", deltaZat: 100_000_000n }] });

    // Control: with real bigints the view has always worked, which is why every
    // suite here was green.
    expect(() => buildMempoolView([original], TIP, NOW)).not.toThrow();

    // The member of the excluded set: a report as `zcashreveal:mempool:live`
    // actually holds it, cast rather than revived. A tagged bigint is an
    // OBJECT where the view expects a bigint, and mixing it into arithmetic
    // throws exactly as the string did in HANDOFF-11. This is the reproduction
    // of the live 500, on the current wire form.
    expect(() => buildMempoolView([serializeWire(original) as LeakReport], TIP, NOW)).toThrow(/Cannot mix BigInt/);

    // And the same value, revived, does not throw and produces the same row.
    const revived = reviveWire<LeakReport>(serializeWire(original));
    expect(buildMempoolView([revived], TIP, NOW)).toEqual(buildMempoolView([original], TIP, NOW));
  });

  it("FAIL STATE, BY DATA: a tag whose payload is not a decimal integer is LEFT ALONE, not coerced", () => {
    // `BigInt("")` is `0n` and `BigInt("1.5")` throws. Turning an unparseable
    // value into a zero is how `feeZat` came to be `0n` for every transaction
    // this project ever analysed - a fabricated measurement that every test
    // passed over.
    const revived = reviveWire<Record<string, unknown>>({
      feeZat: { $bigint: "" },
      deltaZat: { $bigint: "1.5" },
      otherZat: { $bigint: "not a number" },
    });
    expect(revived["feeZat"]).toEqual({ $bigint: "" });
    expect(revived["deltaZat"]).toEqual({ $bigint: "1.5" });
    expect(revived["otherZat"]).toEqual({ $bigint: "not a number" });
  });

  it("a decimal string is a string, whatever its key: the key rule is gone, not merely widened", () => {
    // Under the key rule `feeZat: "5000"` became `5000n`. Under the value rule
    // it stays a string, because a string is what was sent - the producer
    // tags what it means as a bigint, and a consumer that guessed from the key
    // would be the old defect with a new alphabet.
    const revived = reviveWire<Record<string, unknown>>({ feeZat: "5000", height: "3456227", rawCount: "12" });
    expect(revived["feeZat"]).toBe("5000");
    expect(revived["height"]).toBe("3456227");
    expect(revived["rawCount"]).toBe("12");
  });

  it("null under any key stays null, because unknown is neither true nor false", () => {
    // `feeZat` is `Zatoshi | null` since HANDOFF-06, and the null means the fee
    // could not be computed.
    expect(reviveWire<Record<string, unknown>>(serializeWire({ feeZat: null }))["feeZat"]).toBeNull();
  });
});
