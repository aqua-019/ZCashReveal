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

/**
 * A coinbase input, which is what the harness could not express until gate
 * round 2. `report()` builds vin from `transparentInput` alone, so the fix that
 * stopped a ZIP 213 coinbase being called a `shield` had no test that could
 * fail - `grep -rn coinbase` over this directory returned nothing.
 */
const coinbaseInput = (index: number): TransparentInput => ({
  index,
  coinbase: true,
  address: null,
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
  /** Build the vin from COINBASE inputs. See `coinbaseInput`. */
  readonly coinbaseVin?: boolean;
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
  // `coinbaseVin` builds the vin from coinbase inputs instead of ordinary ones.
  // Added in gate round 2: the harness could not express a coinbase at all, so
  // the rule that a coinbase is not a transparent source had no test that could
  // fail.
  const vin = times(shape.vin ?? 0, shape.coinbaseVin === true ? coinbaseInput : transparentInput);
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

  it("a pool crossing that ALSO pays a transparent address is not a migration on this surface either", () => {
    // THE CLASSIFIER LEARNED THIS AND THE ROW PRODUCER DID NOT, for one gate
    // round. `movedPools.length > 1` alone published `class: "migration"` and
    // `flow: "S to O"` for a transfer paying a public recipient, on the surface
    // a reader actually sees, while `analyze()` had just been taught to answer
    // MIXED for the same transaction - so /tx and /track disagreed about one
    // txid, which the docblock above the ternary rules out as a consequence of
    // applying HANDOFF-06's ASSERTION A9 in both places.
    const built = view({ ...saplingIntoOrchard, transparent: { vin: [], vout: [transparentOutput(0)] } });
    expect(built.entries[0]?.class).not.toBe("migration");
    expect(built.summary.migrations).toBe(0);
  });

  it("a crossing that is not called a migration is still COUNTED as a crossing", () => {
    // THE TILE AND ITS OWN CAPTION HAVE TO COUNT THE SAME SET, and narrowing
    // the migration class in a different file separated them again. `crossings`
    // filtered on three CLASS names while `crossingZat` summed `crossingOf`
    // over every report, so this transaction - a real Sapling-to-Orchard
    // crossing that also pays a transparent address - contributed 1 ZEC to the
    // figure and nothing to the count. /track rendered a gold-accented
    // "1.0000 ZEC" above the caption "Nothing in the mempool crosses a pool
    // boundary." Both are now derived from `crossingOf`, so a class rename
    // cannot separate them a third time.
    const built = view({ ...saplingIntoOrchard, transparent: { vin: [], vout: [transparentOutput(0)] } });
    expect(built.summary.crossingZat).toBeGreaterThan(0n);
    expect(built.summary.crossingSplit).not.toBe("Nothing in the mempool crosses a pool boundary.");
    expect(built.summary.crossingSplit).toContain("across 1 transaction");
  });

  it("FAIL SIDE: a mempool that really crosses nothing still says so", () => {
    // The discriminating half. The fix must not be "always claim a crossing":
    // a purely transparent transaction moves no pool, so the caption is the
    // true one and the figure is zero.
    const built = view(report({ txid: "ed", vin: 1, vout: 1 }));
    expect(built.summary.crossingZat).toBe(0n);
    expect(built.summary.crossingSplit).toBe("Nothing in the mempool crosses a pool boundary.");
  });

  it("a ZIP 213 coinbase paying into the pool is NOT a shield", () => {
    // ONE RULE, TWO ANSWERS, AND THIS IS THE TEST THAT WAS MISSING. A coinbase
    // input has no prior owner: the value is issuance, not somebody's
    // transparent funds entering the pool, which is why `round-trip.ts` has
    // always written `vin.some(v => !v.coinbase)`. Here the test was
    // `vin.length > 0`, so a coinbase paying a shielded recipient published
    // `class: "shield"`, `flow: "t to z"` - a transparent sender for a
    // transaction that has none. Gate round 2 reverted the fix and the whole
    // suite stayed green.
    //
    // ONE POOL, NOT TWO. The first version of this test used a two-pool fixture,
    // which `mixed` claims before the `shield` test is ever reached - so it
    // asserted a class the mutation could not change, and the mutation survived
    // it. A coinbase paying into a SINGLE pool is the shape that reaches the
    // branch under test.
    const built = view(
      report({ txid: "cb", vin: 1, coinbaseVin: true, orchardActions: 2,
               perPoolZat: [{ pool: "orchard", deltaZat: -ZEC }] }),
    );
    expect(built.entries[0]?.class).not.toBe("shield");
    expect(built.entries[0]?.flow).not.toBe("t to z");
    // ...and the lane swatch does not assert one either. A missing lane says
    // the transaction did not touch that pool, so a present one says it did.
    expect(built.entries[0]?.lanes).not.toContain("transparent");
  });

  it("the coinbase rule reaches the MIGRATION test too, not only the shield test", () => {
    // BOTH GATE LENSES FOUND THIS INDEPENDENTLY. The fix derived
    // `hasTransparentSource` and used it for `shield` while
    // `crossesWithNoPublicSide` two lines above kept `vin.length === 0` - so a
    // coinbase moving two pools was denied `migration` on the strength of a vin
    // the very next predicate refused to count, and published flow "S/O + t",
    // asserting a transparent side the same expression says it has not. One
    // rule with two answers, now inside one function, in the expression whose
    // docblock spends four paragraphs arguing against exactly that.
    const built = view(
      report({
        txid: "cd", vin: 1, coinbaseVin: true, saplingSpends: 1, orchardActions: 2,
        perPoolZat: [
          { pool: "sapling", deltaZat: ZEC },
          { pool: "orchard", deltaZat: -ZEC },
        ],
      }),
    );
    expect(built.entries[0]?.class).toBe("migration");
    expect(built.entries[0]?.flow).not.toContain("+ t");

    // FAIL SIDE: an ORDINARY transparent input on the same shape is a real
    // public side, so it is NOT a migration - the rule still discriminates.
    const funded = view(
      report({
        txid: "ce", vin: 1, saplingSpends: 1, orchardActions: 2,
        perPoolZat: [
          { pool: "sapling", deltaZat: ZEC },
          { pool: "orchard", deltaZat: -ZEC },
        ],
      }),
    );
    expect(funded.entries[0]?.class).not.toBe("migration");
  });

  it("FAIL SIDE: an ORDINARY transparent input still makes it a shield", () => {
    // The discriminating half. The fix must not be "no transaction is ever a
    // shield": a real transparent input is a real transparent source, and a
    // miner's payout OUTPUT still lights the transparent lane.
    const shield = view(
      report({ txid: "ba", vin: 1, orchardActions: 2,
               perPoolZat: [{ pool: "orchard", deltaZat: -ZEC }] }),
    );
    expect(shield.entries[0]?.class).toBe("shield");
    expect(shield.entries[0]?.lanes).toContain("transparent");

    const payout = view({
      ...saplingIntoOrchard,
      transparent: { vin: [coinbaseInput(0)], vout: [transparentOutput(0)] },
    });
    expect(payout.entries[0]?.lanes).toContain("transparent");
  });

  it("a pool crossing FUNDED from a transparent input is not a migration either", () => {
    // The mirror clause. A public funding address is the same fact as a public
    // recipient, arriving on the other side of the transaction.
    const built = view({ ...saplingIntoOrchard, transparent: { vin: [transparentInput(0)], vout: [] } });
    expect(built.entries[0]?.class).not.toBe("migration");
    expect(built.summary.migrations).toBe(0);
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
});

describe("A13 - a pool crossing with a PUBLIC SIDE is `mixed`, not the residual", () => {
  /**
   * A Sapling-to-Orchard transfer that also pays a transparent address.
   *
   * NONE OF THE OTHER SIX CLASSES FITS IT, which is what HANDOFF-07 escalated
   * (LEDGER-07 Q2). It is not a `migration` - a public recipient stands in it,
   * and the gateway stopped calling it one. It is not `shield` or `deshield` -
   * those name the direction of a transparent side it has on one end only. It
   * fell to the residual `shielded` while `analyze()` answered MIXED, so /tx and
   * /track said different things about one transaction.
   */
  const crossingWithPublicSide = () =>
    report({
      txid: "f1",
      perPoolZat: [
        { pool: "sapling", deltaZat: 120n * 100_000_000n },
        { pool: "orchard", deltaZat: -(120n * 100_000_000n - 15_000n) },
      ],
      saplingSpends: 1,
      orchardActions: 2,
      vin: 1,
      vout: 1,
    });

  it("PASS STATE: the class is `mixed`", () => {
    const built = view(crossingWithPublicSide());
    expect(built.entries[0]?.class).toBe("mixed");
    // Explicitly NOT the two classes it used to be mistaken for.
    expect(built.entries[0]?.class).not.toBe("shielded");
    expect(built.entries[0]?.class).not.toBe("migration");
  });

  it("PASS STATE: the flow caption names both halves, and never 't to t'", () => {
    // The old ternary chain ended `: "t to t"`, so a class it did not name got a
    // transparent-to-transparent caption beside two pool lane swatches. That is
    // a false statement rather than a missing one, and it is the same defect the
    // Ironwood case above records being fixed.
    const built = view(crossingWithPublicSide());
    expect(built.entries[0]?.flow).not.toBe("t to t");
    expect(built.entries[0]?.flow).toContain("+ t");
    // AND IT ASSERTS NO DIRECTION BETWEEN THE POOLS. A gate lens found the first
    // version calling `migrationFlowText`, which reads direction off the sign of
    // each leg - sound only when there is no transparent side. For a
    // transparent-funded two-pool shield it printed the literal word
    // "migration"; here it would have asserted a Sapling-to-Orchard crossing
    // that the chain does not show.
    expect(built.entries[0]?.flow).toBe("S/O + t");
    expect(built.entries[0]?.flow).not.toContain("migration");
    expect(built.entries[0]?.flow).not.toContain(" to ");
    expect(built.entries[0]?.lanes).toContain("sapling");
    expect(built.entries[0]?.lanes).toContain("orchard");
  });

  it("PASS STATE: it is counted, and the four figures still account for every row", () => {
    // THE CONSUMER SWEEP, ASSERTED RATHER THAN DESCRIBED. `mixed` in the
    // denominator and in no numerator is the failure this checks for: the four
    // counts /track prints beside each other would then account for less than
    // the mempool with nothing saying so.
    const built = view(crossingWithPublicSide(), report({ txid: "f2", vin: 1, vout: 1 }));
    expect(built.summary.shielded).toBe(1);
    expect(built.summary.transparent).toBe(1);
    expect(built.summary.migrations).toBe(0);
    expect(built.summary.decodedCount).toBe(2);
    expect(
      built.summary.shielded + built.summary.migrations + built.summary.transparent,
    ).toBe(built.summary.decodedCount);
  });

  it("FAIL SIDE: remove the public side and the SAME crossing is a migration", () => {
    // The discriminating half, and it isolates exactly one variable: the same
    // pool legs with no `vin` and no `vout`. If `mixed` were reachable for any
    // multi-pool transaction rather than for one with a public side, this would
    // also be `mixed`.
    const built = view(
      report({
        txid: "f3",
        perPoolZat: [
          { pool: "sapling", deltaZat: 120n * 100_000_000n },
          { pool: "orchard", deltaZat: -(120n * 100_000_000n - 15_000n) },
        ],
        saplingSpends: 1,
        orchardActions: 2,
      }),
    );
    expect(built.entries[0]?.class).toBe("migration");
    expect(built.summary.migrations).toBe(1);
    expect(built.summary.shielded).toBe(0);
  });

  it("a transparent-funded shield into TWO pools does not print the word migration", () => {
    // The case the first `mixed` caption got wrong: both legs NEGATIVE, so
    // `migrationFlowText`'s "no source" guard returned the literal "migration"
    // and the row read "migration + t" for a transaction that migrated nothing.
    const built = view(
      report({
        txid: "f6",
        perPoolZat: [
          { pool: "sapling", deltaZat: -(1n * 100_000_000n) },
          { pool: "orchard", deltaZat: -(1n * 100_000_000n) },
        ],
        saplingOutputs: 1,
        orchardActions: 2,
        vin: 1,
      }),
    );
    expect(built.entries[0]?.class).toBe("mixed");
    expect(built.entries[0]?.flow).toBe("S/O + t");
    expect(built.entries[0]?.flow).not.toContain("migration");
  });

  it("FAIL SIDE: a SINGLE-pool transaction with a public side is not `mixed`", () => {
    // The other variable, isolated the other way. One pool plus a transparent
    // side is a shield or a deshield, which are the classes that name a
    // direction - so `mixed` must not swallow them.
    const shield = view(
      report({
        txid: "f4",
        perPoolZat: [{ pool: "orchard", deltaZat: -(100n * 100_000_000n) }],
        orchardActions: 2,
        vin: 1,
      }),
    );
    expect(shield.entries[0]?.class).toBe("shield");

    const deshield = view(
      report({
        txid: "f5",
        perPoolZat: [{ pool: "orchard", deltaZat: 100n * 100_000_000n }],
        orchardActions: 2,
        vout: 1,
      }),
    );
    expect(deshield.entries[0]?.class).toBe("deshield");
  });

  it("the row parses as its own DTO, so the enum really carries the member", () => {
    // The widening has to reach `mempoolRowSchema` too, or the gateway would
    // build a row its own `respond()` refuses to serialise.
    const built = view(crossingWithPublicSide());
    expect(() => mempoolViewSchema.parse(built)).not.toThrow();
  });

  it("an undecodable transaction gets a row that claims nothing, and it parses as a DTO", () => {
    // The `UNSUPPORTED_TX` path had no test at all, and every field on the row
    // is recomputed from a value flow that such a report leaves empty - so
    // without the early return it would have published class "transparent",
    // flow "t to t", "no net crossing" and "Nothing this transaction publishes
    // distinguishes it from any other of its shape". Four confident statements
    // about a transaction nobody could decode.
    // `txVersion` AND `unsupported.version` MUST AGREE, and the first draft of
    // this test set them to 5 and 7. `analyze()` cannot produce that pair -
    // `unsupportedReport` builds `unsupported.version` from `tx.version` - and
    // the mismatch was not cosmetic: it hid a defect. The row derives its
    // version cell from `txVersion`, so a test pinning that field at 5 asserted
    // "claims nothing" over a row that read `v5` correctly, while the real
    // shape published `v6` for a version-7 transaction. A gate round found it.
    const undecodable: LeakReport = {
      ...report({ txid: "e7" }),
      txVersion: 7,
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
    // THE VERSION AND THE ACTION COUNT ARE ABSENCES TOO, and both were values
    // until a gate round read them. The producer clamped the version into the
    // three-member enum, so this row said `v6` two cells left of its own
    // finding "transaction version 7 is outside the range this decoder models
    // (1 to 6)"; and it supplied `logicalActions: 0`, which the panel renders
    // as "not priced - L = 0" - a measurement of zero logical actions, a value
    // ZIP 317's `max(2, L)` puts outside the quantity's range entirely.
    expect(built.entries[0]?.version).toBe("unknown");
    expect(built.entries[0]?.logicalActions).toBeNull();
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

  it("`summary.shielded` counts every row that touched a pool without crossing to the public side", () => {
    // TWO PRODUCERS OF THIS FIELD MEANT DIFFERENT THINGS BY IT AND /track
    // RENDERED WHICHEVER MODE IT WAS IN. This counted the residual class
    // `shielded` alone while the fixture corpus counted `shield | deshield |
    // shielded`; on the same three rows that is 1 against 3, published as the
    // same header string and the same headline tile. A `shield` transaction
    // moved value INTO a pool, so leaving it out of this number puts it in no
    // bucket at all.
    const built = view(
      report({ txid: "f1", perPoolZat: [{ pool: "orchard", deltaZat: -ZEC }], vin: 2, orchardActions: 2 }),
      report({ txid: "f2", perPoolZat: [{ pool: "orchard", deltaZat: ZEC }], vout: 2, orchardActions: 2 }),
      report({ txid: "f3", ironwoodActions: 2 }),
    );
    expect(built.entries.map((e) => e.class)).toEqual(["shield", "deshield", "shielded"]);
    expect(built.summary.shielded).toBe(3);
    // FAIL SIDE: the residual-class-only reading, named so a regression reads
    // as a regression rather than as an arbitrary number.
    expect(built.summary.shielded).not.toBe(1);
  });

  it("`summary.decodedCount` is the denominator, and it leaves out the row nobody decoded", () => {
    // A SHARE OF THE MEMPOOL DIVIDED BY EVERY ROW COUNTS AN UNREADABLE
    // TRANSACTION AS EVIDENCE AGAINST WHATEVER IS BEING MEASURED. /track's
    // shielded-share tile did exactly that in both directions across two gate
    // rounds - "8 of 13" while the undecoded row was miscounted into the
    // numerator, "7 of 13" once it was taken out, where the honest figure over
    // the rows anyone could read is 7 of 12.
    const undecodable: LeakReport = {
      ...report({ txid: "f4" }),
      txVersion: 7,
      leakClass: "UNSUPPORTED_TX",
      unsupported: { version: 7, reason: "version 7 is outside the modelled range", rawFieldNames: ["txid"] },
    };
    const built = view(report({ txid: "f5", ironwoodActions: 2 }), undecodable);

    expect(built.summary.unconfirmed).toBe(2);
    expect(built.summary.decodedCount).toBe(1);
    expect(built.summary.shielded).toBe(1);
    // FAIL SIDE: the two must not be the same number here, which is the whole
    // point of having both.
    expect(built.summary.decodedCount).not.toBe(built.summary.unconfirmed);
  });

  it("FAIL SIDE: with nothing undecodable, the denominator IS every row", () => {
    // The discriminating half. `decodedCount` must not be "unconfirmed minus
    // one" or a constant: on a mempool the decoder read in full it equals the
    // row count exactly, so the tile does not quietly under-report.
    const built = view(report({ txid: "f6", ironwoodActions: 2 }), report({ txid: "f7", vin: 1, vout: 1 }));
    expect(built.summary.decodedCount).toBe(2);
    expect(built.summary.decodedCount).toBe(built.summary.unconfirmed);
  });

  it("FAIL SIDE: a decodable transaction still names its version and counts its actions", () => {
    // The discriminating half of the two assertions above. The fix must not be
    // "never state a version": a v5 the decoder read is a v5, and its logical
    // actions were counted. Without this, `version: "unknown"` everywhere and
    // `logicalActions: null` everywhere would pass the test above.
    const built = view(report({ txid: "e8", vin: 1, vout: 1 }));
    expect(built.entries[0]?.version).toBe("v5");
    expect(built.entries[0]?.logicalActions).not.toBeNull();
    expect(built.entries[0]?.class).not.toBe("undecoded");
  });

  it("a version this build does not model is `unknown` at BOTH ends of the range, not the nearest member", () => {
    // The clamp was `>= 6 ? "v6" : === 5 ? "v5" : "v4"`, so it was wrong in two
    // directions at once and only one of them involved an undecodable
    // transaction. Zcash shipped v1, v2 and v3 before Overwinter; every one of
    // them was published here as `v4`, a version this site states as fact
    // beside a txid a reader can check in ten seconds.
    expect(view({ ...report({ txid: "e9" }), txVersion: 7 }).entries[0]?.version).toBe("unknown");
    expect(view({ ...report({ txid: "ea" }), txVersion: 2 }).entries[0]?.version).toBe("unknown");
    expect(view({ ...report({ txid: "eb" }), txVersion: 4 }).entries[0]?.version).toBe("v4");
    expect(view({ ...report({ txid: "ec" }), txVersion: 6 }).entries[0]?.version).toBe("v6");
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
