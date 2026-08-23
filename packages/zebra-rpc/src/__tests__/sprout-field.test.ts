/**
 * "The node did not say" is not "the answer is zero".
 *
 * `sproutValueBalanceZat` in the indexer returns `0n` for a transaction with no
 * `vjoinsplit`, and Zebra serialises that field only from
 * ZcashFoundation/zebra PR #9805 (merged 22 Aug 2025). So on an older node
 * every Sprout term in this project is `0n` with every test green - the same
 * shape as `expiryheight` (HANDOFF-05) and `tx.feeZat` (HANDOFF-06), both of
 * which were found by someone looking rather than by a failing assertion.
 *
 * These tests pin the three-way distinction the boundary can actually make, and
 * they are written against JSON in the casing a node emits, parsed through the
 * real schema, so a fixture cannot agree with the interface while disagreeing
 * with the wire.
 */

import { describe, expect, it } from "vitest";

import { rpcTransactionSchema } from "../schemas.js";
import {
  JOINSPLIT_MAX_TX_VERSION,
  JOINSPLIT_MIN_TX_VERSION,
  joinSplitObservability,
  sproutBalanceIsObserved,
} from "../sprout-field.js";

const TXID = "a".repeat(64);
const HASH = "b".repeat(64);

/** A minimal transaction in the shape Zebra serialises, at the given version. */
function raw(version: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    txid: TXID,
    version,
    locktime: 0,
    vin: [{ txid: HASH, vout: 0, sequence: 4294967295 }],
    vout: [
      {
        value: 1,
        valueZat: 100000000,
        n: 0,
        scriptPubKey: { asm: "", hex: "76a914", type: "pubkeyhash" },
      },
    ],
    ...extra,
  };
}

/** Parse through the RPC boundary, exactly as the client does. */
function throughBoundary(input: Record<string, unknown>) {
  return rpcTransactionSchema.parse(input);
}

describe("joinSplitObservability", () => {
  it("reports OBSERVED when the node sent the field, even empty", () => {
    // An empty array is an ANSWER: this node speaks the field and this
    // transaction has no JoinSplits. It is the case that must not be lumped in
    // with absence, and the only one a truthiness check would get wrong.
    const tx = throughBoundary(raw(4, { vjoinsplit: [] }));
    expect(tx.vjoinsplit).toEqual([]);
    expect(joinSplitObservability(tx)).toBe("OBSERVED");
    expect(sproutBalanceIsObserved(tx)).toBe(true);
  });

  it("reports OBSERVED when the node sent a populated field, and the values survive the boundary", () => {
    const tx = throughBoundary(
      raw(4, {
        vjoinsplit: [
          { vpub_old: 0, vpub_new: 1.5, vpub_oldZat: 0, vpub_newZat: 150000000 },
        ],
      }),
    );
    expect(joinSplitObservability(tx)).toBe("OBSERVED");
    // The integer field is what any arithmetic reads; the float beside it is
    // wrong by a factor of 100,000,000 and is declared only so that reading it
    // is a type error rather than a silent one.
    expect(tx.vjoinsplit?.[0]?.vpub_newZat).toBe(150000000);
  });

  it.each([2, 3, 4])(
    "reports ABSENT_INDETERMINATE on a v%i transaction with no field",
    (version) => {
      const tx = throughBoundary(raw(version));
      expect(tx.vjoinsplit).toBeUndefined();
      expect(joinSplitObservability(tx)).toBe("ABSENT_INDETERMINATE");
      expect(sproutBalanceIsObserved(tx)).toBe(false);
    },
  );

  it.each([5, 6])(
    "reports ABSENT_DEFINITIVE on a v%i transaction, because the format cannot carry a JoinSplit",
    (version) => {
      // THIS IS THE CASE THAT KEEPS THE FINDING HONEST. v5 (ZIP 225) removed
      // JoinSplits and v6 (ZIP 229) did not bring them back, so absence here is
      // a fact about the format. Reporting it as indeterminate would put a
      // finding on substantially every transaction on the chain today, and each
      // one would be false.
      const tx = throughBoundary(raw(version));
      expect(joinSplitObservability(tx)).toBe("ABSENT_DEFINITIVE");
      expect(sproutBalanceIsObserved(tx)).toBe(true);
    },
  );

  it("reports ABSENT_DEFINITIVE on v1, which predates JoinSplits", () => {
    // `vJoinSplit` is serialised only when `nVersion >= 2`.
    expect(joinSplitObservability(throughBoundary(raw(1)))).toBe("ABSENT_DEFINITIVE");
  });

  it("declines to raise an indeterminacy about a version this project does not model", () => {
    // A version outside the modelled range is reported definitive rather than
    // indeterminate: the conservative answer is to say nothing about a format
    // nobody here has read, not to imply the node is broken.
    expect(joinSplitObservability(throughBoundary(raw(0)))).toBe("ABSENT_DEFINITIVE");
    expect(joinSplitObservability(throughBoundary(raw(99)))).toBe("ABSENT_DEFINITIVE");
  });

  it("bounds the JoinSplit-carrying window at exactly versions 2 to 4", () => {
    expect(JOINSPLIT_MIN_TX_VERSION).toBe(2);
    expect(JOINSPLIT_MAX_TX_VERSION).toBe(4);
  });
});

describe("the schema no longer stays silent about vjoinsplit", () => {
  it("validates the array rather than passing it through unchecked", () => {
    // Before this schema declared the field, `passthrough` carried whatever
    // arrived and nothing checked its shape - so "the schema does not mention
    // it" and "the node did not send it" were the same observable.
    expect(() =>
      throughBoundary(raw(4, { vjoinsplit: [{ vpub_newZat: "not a number" }] })),
    ).toThrow();
  });

  it("accepts a JoinSplit that omits the proof-carrying members", () => {
    // Every member is optional on purpose. A JoinSplit this schema rejected
    // would take the whole transaction down with it, which is the opposite of
    // the point: the field's job here is to make PRESENCE observable.
    const tx = throughBoundary(raw(4, { vjoinsplit: [{ vpub_oldZat: 0, vpub_newZat: 0 }] }));
    expect(joinSplitObservability(tx)).toBe("OBSERVED");
  });
});
