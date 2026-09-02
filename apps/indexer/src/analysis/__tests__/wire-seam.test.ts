/**
 * The wire seam between the indexer and the gateway, stated as a property.
 *
 * CLAUDE.md's seam rule: two suites can be exhaustive about a TYPE and both
 * wrong about the WIRE, because each builds its own input. HANDOFF-12 found
 * the fourth instance before it shipped - a `ClaimAssessment`'s counts came
 * back as strings through the real serialiser and the real reviver, because
 * the reviver keyed on `/Zat$/` and a count is not a zatoshi. The fix tags
 * every bigint BY VALUE (`serializeWire`) and untags exactly that shape
 * (`reviveWire`), so the round trip can be stated over the whole domain:
 *
 *   for every JSON-shaped tree with bigints at ANY keys,
 *     reviveWire(JSON.parse(JSON.stringify(serializeWire(x)))) deep-equals x,
 *     bigint for bigint, string for string.
 *
 * The one shape excluded from the domain is the tag itself: an object that is
 * exactly `{ "$bigint": "<decimal>" }` is reserved for the wire and cannot
 * arise from any typed value in this repository, so the generator never emits
 * it as a plain object. That exclusion is the whole of the reviver's
 * assumption, and it is stated here rather than left implicit.
 *
 * A PROPERTY TEST IS VERIFIED BY EXECUTING THE CONCRETE SCENARIO IT EXISTS TO
 * FORBID (CLAUDE.md, LEDGER-08 fold 3), so the named worked case sits beside
 * it: the report shape that broke - assessments on a spend and on a link, with
 * `rawCount`, `effectiveSetSize`, `countIn` and `countOut` - through the same
 * two functions, and the untagged form an older indexer wrote as the fail side
 * by DATA, drawn from A3's own exclusion set.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  asHex,
  reviveWire,
  serializeWire,
  WIRE_BIGINT_TAG,
  type ClaimAssessment,
  type LeakReport,
} from "@zcashreveal/types";

/** Keys drawn from the names the report types actually use, `Zat`-suffixed and not, plus a few that look like nothing. */
const KEYS = [
  "rawCount", "effectiveSetSize", "countIn", "countOut", "minPosition", "maxPosition", "position",
  "valueZat", "deltaZat", "feeZat", "amountZat", "toleranceZat", "height", "txid", "pool", "params",
  "appliedFilters", "assessment", "spends", "links", "value", "n", "$bigint_not_the_tag", "$", "",
];

/** A JSON-shaped tree with bigints anywhere, never an object that IS the tag. */
const tree = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.bigInt({ min: -(2n ** 70n), max: 2n ** 70n }),
    fc.string(),
    // Finite, and never -0: JSON has no -0 and the property is about bigints.
    fc.double({ noNaN: true, noDefaultInfinity: true }).filter((x) => !Object.is(x, -0)),
    fc.boolean(),
    fc.constant(null),
  ),
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    tie("leaf"),
    fc.array(tie("node"), { maxLength: 4 }),
    fc
      .dictionary(fc.constantFrom(...KEYS), tie("node"), { maxKeys: 5 })
      .filter((o) => !(Object.keys(o).length === 1 && Object.keys(o)[0] === WIRE_BIGINT_TAG)),
  ),
})).node;

/** Every path at which a bigint lives, so the two sides can be compared field by field. */
function bigintPaths(value: unknown, path = ""): string[] {
  if (typeof value === "bigint") return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => bigintPaths(v, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      bigintPaths(v, path === "" ? k : `${path}.${k}`),
    );
  }
  return [];
}

/** Exactly the seam: the producer's function, the bytes, the consumer's function. */
function roundTrip<T>(x: T): T {
  return reviveWire<T>(JSON.parse(JSON.stringify(serializeWire(x))));
}

describe("the wire seam, as a property", () => {
  it("round-trips every JSON-shaped tree with bigints at any key, bigint for bigint", () => {
    fc.assert(
      fc.property(tree, (x) => {
        const back = roundTrip(x);
        expect(back).toEqual(x);
        expect(bigintPaths(back).sort()).toEqual(bigintPaths(x).sort());
      }),
      { numRuns: 500 },
    );
  });

  it("FAIL STATE, BY DATA: the untagged form is NOT the wire form, and the property says so on its first bigint", () => {
    // The generator's leaves include bigints; the legacy producer stringified
    // them by value. Run the property against THAT producer and it must fail
    // on the first tree that carries a bigint - which is what proves the
    // property discriminates rather than being satisfied by any pair of
    // functions that agree with each other.
    const legacy = (x: unknown): unknown =>
      JSON.parse(JSON.stringify(x, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)));
    const withABigint = tree.filter((x) => bigintPaths(x).length > 0);
    expect(() =>
      fc.assert(
        fc.property(withABigint, (x) => {
          expect(reviveWire(legacy(x))).toEqual(x);
        }),
        { numRuns: 50 },
      ),
    ).toThrow();
  });
});

/* ----------------------------------------------------------------------------
   The named worked case: the shape that broke.
   ------------------------------------------------------------------------- */

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

function assessment(pool: "sapling"): ClaimAssessment<"sapling"> {
  return {
    pool,
    anchorRoot: h(0x22),
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
          matchedDepositTxid: h(0xab),
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

/** The smallest `LeakReport` that carries both an assessed spend and an assessed link. */
function assessedReport(): LeakReport {
  return {
    txid: h(0xff),
    seenAt: 1_756_000_000_000,
    tipHeightAtSeen: 3_444_854,
    txVersion: 5,
    leakClass: "Z_TO_T",
    overallSeverity: "MEDIUM",
    bundle: {
      saplingSpends: [{ pool: "sapling", index: 0, nullifier: h(0x11), anchor: h(0x22), cv: h(0x33), rk: h(0x44) }],
      saplingOutputs: [],
      saplingValueBalanceZat: 249_990_000n,
      orchardActions: [],
      orchardValueBalanceZat: 0n,
      orchardAnchor: null,
      orchardFlags: null,
      ironwoodActions: [],
      ironwoodValueBalanceZat: 0n,
      ironwoodAnchor: null,
      ironwoodFlags: null,
    },
    transparent: {
      vin: [],
      vout: [{ index: 0, valueZat: 249_980_000n, addresses: ["t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe"], scriptType: "pubkeyhash" }],
    },
    identity: {
      sender: { transparentAddresses: [], nullifiers: [{ pool: "sapling", value: h(0x11) }], commitments: [] },
      recipient: { transparentAddresses: ["t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe"], nullifiers: [], commitments: [] },
    },
    spends: [
      {
        pool: "sapling",
        index: 0,
        nullifier: h(0x11),
        anchor: h(0x22),
        anchorHeight: 3_444_837,
        anchorDepthBlocks: 17,
        isRecentAnchor: true,
        severity: "MEDIUM",
        assessment: assessment("sapling"),
      },
    ],
    outputs: [],
    valueFlow: {
      sproutValueBalanceZat: 0n,
      saplingValueBalanceZat: 249_990_000n,
      orchardValueBalanceZat: 0n,
      ironwoodValueBalanceZat: 0n,
      perPoolZat: [{ pool: "sapling", deltaZat: 249_990_000n }],
      netTransparentInflowZat: -249_980_000n,
      isPureShielded: false,
      crossesPoolBoundary: true,
      direction: "WITHDRAWAL",
    },
    fingerprint: {
      outputCount: 1,
      spendCount: 1,
      outputPadded: false,
      feeZat: 10_000n,
      isZip317ConventionalFee: true,
      logicalActions: 2,
      expiryDelta: 40,
      hasMemo: false,
      likelyWallet: "ZCASHD_RUST",
    },
    findings: [],
    links: [
      {
        shieldingTxid: h(0xab),
        unshieldingTxid: h(0xff),
        senderAddress: null,
        recipientAddress: "t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe",
        amountZat: 249_990_000n,
        timeDeltaMs: 1_800_000,
        matchKind: "FEE_TOLERANT",
        poolPath: "sapling",
        confidence: "MEDIUM",
        assessment: assessment("sapling"),
      },
    ],
  };
}

describe("the wire seam, the named worked case (A3)", () => {
  it("PASS STATE: a report carrying a spend assessment and a link assessment round-trips, every one of its bigints a bigint", () => {
    const original = assessedReport();
    const paths = bigintPaths(original);
    // The case must REACH the family it is about: rawCount, effectiveSetSize,
    // and countIn/countOut on both filters, on both assessments.
    for (const name of ["rawCount", "effectiveSetSize", "countIn", "countOut"]) {
      expect(paths.filter((p) => p.endsWith(name)).length, name).toBeGreaterThanOrEqual(2);
    }
    const back = roundTrip(original);
    expect(back).toEqual(original);
    expect(bigintPaths(back).sort()).toEqual(paths.sort());
  });

  it("FAIL STATE, BY DATA: the untagged form leaves rawCount, effectiveSetSize, countIn and countOut as strings", () => {
    // The member of A3's exclusion set, measured live in PR #50: four of five
    // fields string where the type says bigint. Same report, the producer an
    // indexer before HANDOFF-12 was.
    const original = assessedReport();
    const legacy = reviveWire<LeakReport>(
      JSON.parse(JSON.stringify(original, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))),
    );
    const a = legacy.spends[0]?.assessment;
    expect(typeof a?.rawCount).toBe("string");
    expect(typeof a?.effectiveSetSize).toBe("string");
    expect(typeof a?.appliedFilters[0]?.countIn).toBe("string");
    expect(typeof a?.appliedFilters[1]?.countOut).toBe("string");
    expect(legacy).not.toEqual(original);
  });
});
