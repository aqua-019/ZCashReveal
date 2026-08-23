import { describe, expect, it } from "vitest";
import {
  asHex,
  mempoolViewSchema,
  type DecodedIronwoodAction,
  DecodedOrchardAction,
  type DecodedSaplingOutput,
  type DecodedSaplingSpend,
  type Hex,
  type LeakReport,
  type ShieldedPool,
  type TransparentInput,
  type TransparentOutput,
  type ValueBalanceAnnotation,
  type Zatoshi,
} from "@zcashreveal/types";

import { buildMempoolView } from "../views/mempool.js";
import { zecText } from "../views/units.js";

/**
 * `buildMempoolView` - the class, the flow label and the crossing tile.
 *
 * THIS FILE EXISTS BECAUSE NOTHING COVERED `mempoolRow` AT ALL. The route
 * assertions in `routes.test.ts` drive `/api/mempool` with an EMPTY mempool -
 * there is no Redis in that harness, so `readLiveReports` returns `[]` and
 * every row-level branch is unexercised. That is how two defects lived in this
 * function through a green suite:
 *
 *   (a) the class ternary tested `direction` FIRST. Every transaction that
 *       moves a pool has a direction of DEPOSIT or WITHDRAWAL, so the
 *       `movedPools.length > 1` branch under it was unreachable for every
 *       input: `summary.migrations` was permanently zero and a Sapling to
 *       Orchard migration was published as `class: "shield"`, `flow: "t to z"`
 *       - a transparent-side claim about a transaction with no transparent
 *       side.
 *   (b) `migrationFlowText` read the label off the ORDER of `perPoolZat`,
 *       which the analyser builds in canonical pool order regardless of which
 *       side of the crossing each pool is on. An Orchard-into-Sapling
 *       migration therefore printed "S to O" - backwards.
 *
 * Both are fixed; these tests are what stops them coming back. Each rule is
 * pinned from both sides, because a test that only ever sees the passing state
 * cannot tell a working rule from an absent one: the migration cases are
 * mirror images of each other, and shield and deshield each appear with and
 * without the transparent half they name.
 *
 * The reports are BUILT rather than borrowed. `ws-broker.test.ts` casts a bare
 * `{ txid }` to `LeakReport`, which is sound there - the broker copies the
 * payload verbatim - and useless here, where every assertion reads
 * `valueFlow`. `report()` below constructs the whole record, and derives
 * `direction` by the analyser's own rule so that no case can state a
 * combination the indexer would never produce.
 */

const NOW = 1_756_000_000_000;
const TIP = 3_456_854;
const ZEC = 100_000_000n;
/** ZIP 317's conventional fee at the grace floor of two logical actions. */
const FEE = 10_000n;

const hex = (seed: string): Hex => asHex(seed.repeat(32).slice(0, 64));

const times = <T>(n: number, make: (index: number) => T): T[] =>
  Array.from({ length: n }, (_unused, index) => make(index));

const transparentInput = (index: number): TransparentInput => ({
  index,
  coinbase: false,
  prevTxid: hex("bc"),
  prevVout: index,
  address: "t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe",
  sequence: 0xffff_ffff,
});

const transparentOutput = (index: number): TransparentOutput => ({
  index,
  valueZat: ZEC,
  addresses: ["t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe"],
  scriptType: "pubkeyhash",
});

const saplingSpend = (index: number): DecodedSaplingSpend => ({
  pool: "sapling",
  index,
  nullifier: hex("11"),
  anchor: hex("22"),
  cv: hex("33"),
  rk: hex("44"),
});

const saplingOutput = (index: number): DecodedSaplingOutput => ({
  pool: "sapling",
  index,
  cmu: hex("55"),
  cv: hex("66"),
  ephemeralKey: hex("77"),
  encCiphertextSize: 580,
  outCiphertextSize: 80,
});

const orchardAction = (index: number): DecodedOrchardAction => ({
  pool: "orchard",
  index,
  nullifier: hex("88"),
  cmx: hex("99"),
  cv: hex("aa"),
  rk: hex("bb"),
  ephemeralKey: hex("cc"),
  encCiphertextSize: 580,
  outCiphertextSize: 80,
});

/** The same shape with `pool: "ironwood"`, which is the only thing that differs. */
const ironwoodAction = (index: number): DecodedIronwoodAction => ({
  pool: "ironwood",
  index,
  nullifier: hex("77"),
  cmx: hex("66"),
  cv: hex("55"),
  rk: hex("44"),
  ephemeralKey: hex("33"),
  encCiphertextSize: 580,
  outCiphertextSize: 80,
});

interface Shape {
  readonly txid: string;
  /**
   * The pool deltas, in the canonical order `classifyValueFlow` emits them -
   * sprout, sapling, orchard - because that ORDER is what defect (b) read the
   * flow label off. A case that sorted its own deltas source-first would pass
   * against the broken implementation and prove nothing.
   *
   * Sign convention is the annotation's own: POSITIVE means value LEFT the
   * pool, NEGATIVE means it entered.
   */
  readonly perPoolZat?: ReadonlyArray<{ readonly pool: ShieldedPool; readonly deltaZat: Zatoshi }>;
  readonly vin?: number;
  readonly vout?: number;
  readonly saplingSpends?: number;
  readonly saplingOutputs?: number;
  readonly orchardActions?: number;
  readonly ironwoodActions?: number;
}

const deltaOf = (deltas: Shape["perPoolZat"], pool: ShieldedPool): Zatoshi =>
  (deltas ?? []).find((d) => d.pool === pool)?.deltaZat ?? 0n;

function report(shape: Shape): LeakReport {
  const perPoolZat = shape.perPoolZat ?? [];
  const vin = times(shape.vin ?? 0, transparentInput);
  const vout = times(shape.vout ?? 0, transparentOutput);
  const saplingSpends = times(shape.saplingSpends ?? 0, saplingSpend);
  const saplingOutputs = times(shape.saplingOutputs ?? 0, saplingOutput);
  const orchardActions = times(shape.orchardActions ?? 0, orchardAction);
  const ironwoodActions = times(shape.ironwoodActions ?? 0, ironwoodAction);

  const sproutValueBalanceZat = deltaOf(perPoolZat, "sprout");
  const hasShieldedAny =
    saplingSpends.length + saplingOutputs.length + orchardActions.length + ironwoodActions.length >
      0 || sproutValueBalanceZat !== 0n;

  // The analyser's rule, copied deliberately (`leak-analyzer.ts`,
  // `classifyValueFlow`): a pool that GAINED value makes the transaction a
  // DEPOSIT. Every migration is therefore a DEPOSIT, which is precisely why
  // testing `direction` before the pool count hid the migration class.
  const direction: ValueBalanceAnnotation["direction"] = !hasShieldedAny
    ? "NONE"
    : perPoolZat.length === 0
      ? "INTRA_POOL"
      : perPoolZat.some((d) => d.deltaZat < 0n)
        ? "DEPOSIT"
        : "WITHDRAWAL";

  return {
    txid: asHex(shape.txid.repeat(64).slice(0, 64)),
    seenAt: NOW - 30_000,
    tipHeightAtSeen: TIP,
    txVersion: 5,
    // Never read by the view: the row recomputes the class from the value flow
    // so that /tx and /track cannot state two different things about one
    // transaction. Present because `LeakReport` requires it.
    leakClass: "MIXED",
    overallSeverity: "LOW",
    bundle: {
      saplingSpends,
      saplingOutputs,
      saplingValueBalanceZat: deltaOf(perPoolZat, "sapling"),
      orchardActions,
      orchardValueBalanceZat: deltaOf(perPoolZat, "orchard"),
      orchardAnchor: orchardActions.length > 0 ? hex("de") : null,
      orchardFlags: null,
      ironwoodActions,
      ironwoodValueBalanceZat: deltaOf(perPoolZat, "ironwood"),
      ironwoodAnchor: ironwoodActions.length > 0 ? hex("df") : null,
      ironwoodFlags: null,
    },
    transparent: { vin, vout },
    identity: {
      sender: { transparentAddresses: [], nullifiers: [], commitments: [] },
      recipient: { transparentAddresses: [], nullifiers: [], commitments: [] },
    },
    spends: [],
    outputs: [],
    valueFlow: {
      sproutValueBalanceZat,
      saplingValueBalanceZat: deltaOf(perPoolZat, "sapling"),
      orchardValueBalanceZat: deltaOf(perPoolZat, "orchard"),
      ironwoodValueBalanceZat: deltaOf(perPoolZat, "ironwood"),
      perPoolZat,
      netTransparentInflowZat: 0n,
      isPureShielded: perPoolZat.length === 0 && hasShieldedAny,
      crossesPoolBoundary: perPoolZat.length > 0,
      direction,
    },
    fingerprint: {
      outputCount:
        vout.length + saplingOutputs.length + orchardActions.length + ironwoodActions.length,
      spendCount:
        vin.length + saplingSpends.length + orchardActions.length + ironwoodActions.length,
      outputPadded: false,
      feeZat: FEE,
      isZip317ConventionalFee: true,
      logicalActions: 2,
      expiryDelta: 40,
      hasMemo: false,
      likelyWallet: "ZCASHD_RUST",
    },
    findings: [],
    links: [],
  };
}

/** Sapling drains into Orchard: Sapling loses (positive), Orchard gains (negative). */
const saplingIntoOrchard = report({
  txid: "a1",
  perPoolZat: [
    { pool: "sapling", deltaZat: ZEC },
    { pool: "orchard", deltaZat: -(ZEC - FEE) },
  ],
  saplingSpends: 1,
  orchardActions: 1,
});

/** The mirror image, in the SAME canonical order: Orchard loses, Sapling gains. */
const orchardIntoSapling = report({
  txid: "b2",
  perPoolZat: [
    { pool: "sapling", deltaZat: -(ZEC - FEE) },
    { pool: "orchard", deltaZat: ZEC },
  ],
  saplingOutputs: 1,
  orchardActions: 1,
});

const view = (...reports: readonly LeakReport[]) => buildMempoolView(reports, TIP, NOW);

describe("mempoolRow class - a migration is a migration, whichever direction it runs", () => {
  it("a Sapling-into-Orchard migration is class migration, and the summary counts it", () => {
    const built = view(saplingIntoOrchard);
    expect(built.entries[0]?.class).toBe("migration");
    expect(built.summary.migrations).toBe(1);
    // The two claims defect (a) published instead, named so a regression is
    // recognisable rather than merely red.
    expect(built.entries[0]?.class).not.toBe("shield");
    expect(built.entries[0]?.flow).not.toBe("t to z");
  });

  it("an Orchard-into-Sapling migration is counted the same way", () => {
    const built = view(orchardIntoSapling);
    expect(built.entries[0]?.class).toBe("migration");
    expect(built.summary.migrations).toBe(1);
  });

  it("a single-pool DEPOSIT with a transparent input is still a shield", () => {
    // The fail side of the ordering rule. Moving the migration test to the
    // front must not swallow the crossings that are not migrations: this
    // transaction moves ONE pool, so it takes the shield branch below it.
    const built = view(
      report({ txid: "c3", perPoolZat: [{ pool: "orchard", deltaZat: -ZEC }], vin: 2, orchardActions: 2 }),
    );
    expect(built.entries[0]?.class).toBe("shield");
    expect(built.entries[0]?.flow).toBe("t to z");
    expect(built.summary.migrations).toBe(0);
  });

  it("a DEPOSIT with NO transparent input is not a shield, because there is no transparent side", () => {
    // Assertion A9's rule on the row /track renders: a class naming the
    // transparent side requires one.
    const built = view(report({ txid: "d4", perPoolZat: [{ pool: "orchard", deltaZat: -ZEC }], orchardActions: 2 }));
    expect(built.entries[0]?.class).toBe("shielded");
    expect(built.entries[0]?.flow).toBe("shielded");
  });

  it("a single-pool WITHDRAWAL with a transparent output is still a deshield", () => {
    const built = view(
      report({ txid: "e5", perPoolZat: [{ pool: "sapling", deltaZat: ZEC }], vout: 1, saplingSpends: 1 }),
    );
    expect(built.entries[0]?.class).toBe("deshield");
    expect(built.entries[0]?.flow).toBe("z to t");
  });

  it("a WITHDRAWAL with NO transparent output is not a deshield", () => {
    const built = view(report({ txid: "f6", perPoolZat: [{ pool: "sapling", deltaZat: ZEC }], saplingSpends: 1 }));
    expect(built.entries[0]?.class).toBe("shielded");
    expect(built.entries[0]?.flow).not.toBe("z to t");
  });
});

describe("the flow label follows the SIGN of each delta, not the order of the list", () => {
  it("Sapling into Orchard reads S to O", () => {
    expect(view(saplingIntoOrchard).entries[0]?.flow).toBe("S to O");
  });

  it("Orchard into Sapling reads O to S - the reverse, from the same canonical order", () => {
    // THIS IS THE ASSERTION THAT CATCHES DEFECT (b). Both migrations present
    // their deltas as [sapling, orchard]; only the signs differ. An
    // implementation that reads the label off the list order answers "S to O"
    // here, which would tell a reader the value went the other way.
    const flow = view(orchardIntoSapling).entries[0]?.flow;
    expect(flow).toBe("O to S");
    expect(flow).not.toBe("S to O");
  });

  it("Sprout is P and Sapling is S, so the two S pools are distinguishable", () => {
    // The initials are `apps/web`'s mempool fixture's, which writes the set
    // down as "O, I, S, P for Orchard, Ironwood, Sapling and Sprout". A label
    // of "S to S" for this transaction would name one pool twice.
    const built = view(
      report({
        txid: "07",
        perPoolZat: [
          { pool: "sprout", deltaZat: ZEC },
          { pool: "sapling", deltaZat: -(ZEC - FEE) },
        ],
        saplingOutputs: 1,
      }),
    );
    expect(built.entries[0]?.flow).toBe("P to S");
    // And the Sprout lane is drawn, which is the swatch a reader sees first.
    expect(built.entries[0]?.lanes).toContain("sprout");
  });

  it("more pools than a two-sided label can describe says the number instead", () => {
    const built = view(
      report({
        txid: "18",
        perPoolZat: [
          { pool: "sprout", deltaZat: ZEC },
          { pool: "sapling", deltaZat: ZEC },
          { pool: "orchard", deltaZat: -(2n * ZEC - FEE) },
        ],
        saplingSpends: 1,
        orchardActions: 1,
      }),
    );
    expect(built.entries[0]?.flow).toBe("3 pools");
  });
});

describe("the four-pool row, and the two places Ironwood was half-added", () => {
  it("an intra-Ironwood transfer is class shielded, not transparent", () => {
    // A GATE FINDING, AND IT IS THE SPROUT DEFECT ONE POOL LATER. `hasIronwood`
    // was added to the lane list and not to the class ternary below it, so an
    // ordinary z-to-z transfer inside Ironwood - which is most shielded traffic
    // after NU6.3 - fell past every test and landed on "transparent". The row
    // then printed flow "t to t" beside its own Ironwood lane swatch, counted
    // into `summary.transparent`, and contradicted /tx, whose classifier calls
    // the same transaction PURE_SHIELDED.
    const built = view(report({ txid: "e5", ironwoodActions: 2 }));

    expect(built.entries[0]?.class).toBe("shielded");
    expect(built.entries[0]?.class).not.toBe("transparent");
    expect(built.entries[0]?.flow).not.toBe("t to t");
    expect(built.entries[0]?.lanes).toContain("ironwood");
    expect(built.summary.shielded).toBe(1);
    expect(built.summary.transparent).toBe(0);
  });

  it("FAIL SIDE: a genuinely transparent transaction is still class transparent", () => {
    // The discriminating half. The fix must not be "never say transparent": a
    // transaction with a transparent input and output and no shielded component
    // is exactly what that class is for.
    const built = view(report({ txid: "e6", vin: 1, vout: 1 }));
    expect(built.entries[0]?.class).toBe("transparent");
    expect(built.summary.transparent).toBe(1);
  });

  it("an undecodable transaction gets a row that claims nothing, and it parses as a DTO", () => {
    // The `UNSUPPORTED_TX` path had no test at all, and every field on the row
    // is recomputed from a value flow that such a report leaves empty - so
    // without the early return it would have published class "transparent",
    // flow "t to t", "no net crossing" and "Nothing this transaction publishes
    // distinguishes it from any other of its shape". Four confident statements
    // about a transaction nobody could decode.
    const undecodable: LeakReport = {
      ...report({ txid: "e7" }),
      leakClass: "UNSUPPORTED_TX",
      unsupported: {
        version: 7,
        reason: "transaction version 7 is outside the range this decoder models (1 to 6)",
        rawFieldNames: ["orchard", "txid", "version"],
      },
    };
    const built = view(undecodable);

    expect(built.entries[0]?.class).toBe("undecoded");
    expect(built.entries[0]?.flow).toBe("not decoded");
    expect(built.entries[0]?.valueBalanceText).toBe("not measured");
    expect(built.entries[0]?.feeZat).toBeNull();
    // No lane is claimed. A swatch is a claim that the transaction touched that
    // lane, and nothing here can make one.
    expect(built.entries[0]?.lanes).toEqual([]);
    expect(built.entries[0]?.reasoning.join(" ")).toContain("version 7");

    // AND IT SURVIVES THE DTO. `lanes` was `.min(1)` and `class` had five
    // members before this handoff, so the row this branch produces would have
    // failed validation at the wire boundary - which no test would have caught,
    // because nothing validated an unsupported row.
    expect(() => mempoolViewSchema.parse(built)).not.toThrow();
  });
});

describe("the crossing tile and its own caption count the same set", () => {
  it("a mempool of migrations reports the AMOUNT that crossed, not the fee the crossing left behind", () => {
    const built = view(saplingIntoOrchard, orchardIntoSapling);

    // THIS ASSERTION READ `2n * FEE` UNTIL HANDOFF-07, AND THE OLD NUMBER WAS
    // THE FEE. A migration's two legs nearly cancel - one ZEC leaves a pool and
    // one ZEC minus the fee enters another - so summing `perPoolZat` returns
    // the residue rather than the crossing. The tile is captioned as the value
    // crossing a boundary, and the design corpus settles which quantity that
    // is: `apps/web/src/lib/api/fixtures/mempool.ts` builds `crossingZat` from
    // its rows' `crossing.zec`, and its Orchard-to-Ironwood row contributes
    // `500.0` rather than its 0.0001 fee. Two ZEC of migrations therefore read
    // as two ZEC.
    //
    // The old behaviour was not merely a smaller number, it was a different
    // quantity wearing the same caption - and it was about to get worse:
    // decoding Ironwood adds the second leg to a crossing that previously had
    // only one, so a 500 ZEC pool migration would have been published as a
    // crossing of 0.005 ZEC with no arithmetic having changed.
    expect(built.summary.crossingZat).toBe(2n * ZEC);
    expect(built.summary.crossingZat).not.toBe(2n * FEE);

    // The fee is not lost, it is just not this number: it is the difference
    // between the two sides, and `fingerprint.feeZat` is where a fee lives.
    expect(built.summary.crossingSplit).toContain("between pools");
    expect(built.summary.crossingSplit).not.toBe("Nothing in the mempool crosses a pool boundary.");
    expect(built.summary.crossingSplit).toContain("2 transactions");
    expect(built.summary.migrations).toBe(2);
  });

  it("a shield and a deshield still split by direction, so the third term did not swallow the first two", () => {
    // THE FAIL SIDE FOR THE CHANGE ABOVE. A pool-to-pool crossing gets its own
    // term because it has no direction; a transaction with one leg still has
    // one, and must still be counted under it. Without this, "between pools"
    // could have absorbed everything and the two assertions above would still
    // pass.
    const shield = report({
      txid: "c3",
      perPoolZat: [{ pool: "orchard", deltaZat: -ZEC }],
      vin: 1,
      orchardActions: 1,
    });
    const deshield = report({
      txid: "d4",
      perPoolZat: [{ pool: "orchard", deltaZat: ZEC }],
      vout: 1,
      orchardActions: 1,
    });
    const built = view(shield, deshield);

    expect(built.summary.crossingZat).toBe(2n * ZEC);
    expect(built.summary.crossingSplit).toContain(`${zecText(ZEC)} in`);
    expect(built.summary.crossingSplit).toContain(`${zecText(ZEC)} out`);
    expect(built.summary.crossingSplit).toContain(`${zecText(0n)} between pools`);
  });

  it("a mempool with no crossing at all reports zero AND says nothing crosses", () => {
    // The other polarity, and the one that makes the sentence a measurement:
    // two fully transparent transactions move no pool, so both halves are
    // empty together.
    const built = view(report({ txid: "29", vin: 1, vout: 2 }), report({ txid: "3a", vin: 1, vout: 1 }));
    expect(built.summary.crossingZat).toBe(0n);
    expect(built.summary.crossingSplit).toBe("Nothing in the mempool crosses a pool boundary.");
    expect(built.summary.migrations).toBe(0);
    expect(built.entries.map((e) => e.class)).toEqual(["transparent", "transparent"]);
    expect(built.entries.map((e) => e.flow)).toEqual(["t to t", "t to t"]);
  });

  it("every row a migration produces still satisfies the DTO", () => {
    // The view is hand-built from three sources that know nothing about each
    // other, and `respond()` parses it before it leaves the gateway. Parsing
    // here means a row this file exercises is a row the route could serve.
    expect(() => mempoolViewSchema.parse(view(saplingIntoOrchard, orchardIntoSapling))).not.toThrow();
  });
});
