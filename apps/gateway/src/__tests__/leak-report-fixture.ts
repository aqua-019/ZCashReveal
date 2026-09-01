/**
 * The `LeakReport` builder, shared by every gateway suite that needs one.
 *
 * EXTRACTED IN HANDOFF-11, AND THE REASON IS A DEFECT IT ALREADY CAUSED.
 * `ws-broker.test.ts` used `{ txid } as unknown as LeakReport` - sound while
 * the relay copied its payload verbatim, because a pass-through needs no
 * fields, and exactly wrong once the relay PROJECTS the report through
 * `mempoolRow`. The first rewrite of that suite hand-rolled a second report,
 * left `valueFlow` off it, and threw inside the projection: a probe wrong in a
 * way that looks like a defect in the code under test.
 *
 * One builder, so a field added to `LeakReport` is added in one place and every
 * suite that constructs one gets it. Nothing here is new - it is
 * `mempool-view.test.ts`'s own harness, moved without a change to its logic, so
 * the suite it came from must still produce the same rows it did before.
 *
 * NOT A `.test.ts` FILE: vitest would collect it, find no test in it, and a
 * file of helpers is not a suite. Importing a `.test.ts` from another
 * `.test.ts` would run its cases twice.
 */
import {
  asHex,
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

export const NOW = 1_756_000_000_000;
export const TIP = 3_456_854;
export const ZEC = 100_000_000n;
/** ZIP 317's conventional fee at the grace floor of two logical actions. */
export const FEE = 10_000n;

export const hex = (seed: string): Hex => asHex(seed.repeat(32).slice(0, 64));

export const times = <T>(n: number, make: (index: number) => T): T[] =>
  Array.from({ length: n }, (_unused, index) => make(index));

export const transparentInput = (index: number): TransparentInput => ({
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
export const coinbaseInput = (index: number): TransparentInput => ({
  index,
  coinbase: true,
  address: null,
  sequence: 0xffff_ffff,
});

export const transparentOutput = (index: number): TransparentOutput => ({
  index,
  valueZat: ZEC,
  addresses: ["t1KtLcMzUgvcd6NqBnPvSvcYnJqbXvJmvVe"],
  scriptType: "pubkeyhash",
});

export const saplingSpend = (index: number): DecodedSaplingSpend => ({
  pool: "sapling",
  index,
  nullifier: hex("11"),
  anchor: hex("22"),
  cv: hex("33"),
  rk: hex("44"),
});

export const saplingOutput = (index: number): DecodedSaplingOutput => ({
  pool: "sapling",
  index,
  cmu: hex("55"),
  cv: hex("66"),
  ephemeralKey: hex("77"),
  encCiphertextSize: 580,
  outCiphertextSize: 80,
});

export const orchardAction = (index: number): DecodedOrchardAction => ({
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
export const ironwoodAction = (index: number): DecodedIronwoodAction => ({
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

export interface Shape {
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

export const deltaOf = (deltas: Shape["perPoolZat"], pool: ShieldedPool): Zatoshi =>
  (deltas ?? []).find((d) => d.pool === pool)?.deltaZat ?? 0n;

export function report(shape: Shape): LeakReport {
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
