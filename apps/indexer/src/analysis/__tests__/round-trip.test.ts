import { describe, it, expect } from "vitest";
import {
  asHex,
  type Hex,
  type LeakReport,
  type ShieldedPool,
  type Zatoshi,
} from "@zcashreveal/types";
import { RoundTripIndex } from "../round-trip.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/**
 * Minimal LeakReport builder for round-trip tests. Only the fields
 * RoundTripIndex reads are configurable; everything else is filled with
 * inert defaults.
 *
 * RoundTripIndex reads: txid, seenAt, tipHeightAtSeen,
 *   valueFlow.perPoolZat,
 *   identity.sender.transparentAddresses[0],
 *   identity.recipient.transparentAddresses[0].
 *
 * THE PER-POOL LIST IS DERIVED HERE, NOT WRITTEN OUT ALONGSIDE THE BALANCES,
 * and that is the whole repair. `ingest()` stopped reading
 * `bundle.{sapling,orchard}ValueBalanceZat` by name in HANDOFF-06 and now loops
 * over `valueFlow.perPoolZat`, so a fixture that set only the bundle balances
 * would typecheck, run, and produce ZERO links - every assertion in this file
 * would fail against code that is correct. Deriving both from one set of
 * numbers means the fixture cannot describe a report the analyser could not
 * build.
 *
 * Sprout and Ironwood are accepted as well as Sapling and Orchard, because the
 * four-pool widening is what this suite now has to cover. Only Sprout, Sapling
 * and Orchard have a named field on `ValueBalanceAnnotation`; Ironwood reaches
 * the index solely through `perPoolZat`, which is exactly why that array exists
 * rather than three fields plus a fourth to be added later.
 */
function makeReport(opts: {
  txid: Hex;
  seenAt: number;
  tipHeightAtSeen?: number;
  sproutValueBalanceZat?: bigint;
  saplingValueBalanceZat?: bigint;
  orchardValueBalanceZat?: bigint;
  ironwoodValueBalanceZat?: bigint;
  senderAddress?: string;
  recipientAddress?: string;
  /**
   * Override the derived transparent side. Only the fixtures that are ABOUT the
   * transparent side pass these; everything else takes the derivation below,
   * which is what makes each fixture describe a transaction that could exist.
   */
  transparentIn?: boolean;
  transparentOut?: boolean;
  /** Make the single transparent input a coinbase. See the coinbase rule. */
  coinbaseInput?: boolean;
}): LeakReport {
  const sproutValueBalanceZat = opts.sproutValueBalanceZat ?? 0n;
  const saplingValueBalanceZat = opts.saplingValueBalanceZat ?? 0n;
  const orchardValueBalanceZat = opts.orchardValueBalanceZat ?? 0n;
  const ironwoodValueBalanceZat = opts.ironwoodValueBalanceZat ?? 0n;

  // A pool that did not move does not appear, matching `classifyValueFlow`.
  // Filtering on `!== 0n` rather than emitting four entries is not tidiness: a
  // zero entry is neither a deposit nor a withdrawal to `ingest()`, but it
  // would let a fixture assert a pool was "seen" when nothing moved in it.
  const perPoolZat: ReadonlyArray<{ readonly pool: ShieldedPool; readonly deltaZat: Zatoshi }> = (
    [
      ["sprout", sproutValueBalanceZat],
      ["sapling", saplingValueBalanceZat],
      ["orchard", orchardValueBalanceZat],
      ["ironwood", ironwoodValueBalanceZat],
    ] as ReadonlyArray<readonly [ShieldedPool, Zatoshi]>
  )
    .filter(([, deltaZat]) => deltaZat !== 0n)
    .map(([pool, deltaZat]) => ({ pool, deltaZat }));

  const crossesPoolBoundary = perPoolZat.length > 0;

  // THE TRANSPARENT SIDE IS DERIVED FROM THE DIRECTION, AND THAT IS THE WHOLE
  // REPAIR HANDOFF-08 MADE HERE.
  //
  // Every fixture in this file used to carry `transparent: { vin: [], vout: [] }`
  // - no transparent side at all - while asserting that shields and unshields
  // linked. Under `RoundTripIndex`'s wide rule (a deposit requires a transparent
  // input, a withdrawal a transparent output) exactly 13 of the 17 tests here
  // went red, and L2's ruling is the right reading of that: they are not 13
  // regressions, they are 13 fixtures that were asserting the defect. A report
  // that shields value with no transparent input describes a transaction that
  // cannot exist.
  //
  // The derivation says what each shape really is, straight from
  // `cases.json`'s own descriptions of the 2 Jan 2026 transactions:
  //   value only ENTERS pools  -> a shield: "spends all four of its UTXOs into a
  //                               transaction with zero transparent outputs"
  //   value only LEAVES pools  -> an unshield: "a transaction with zero
  //                               transparent inputs creates a single output"
  //   value does BOTH          -> a pool-to-pool crossing, which has NEITHER.
  //                               This is the case that manufactured the false
  //                               links, and under the derivation a migration
  //                               fixture gets no transparent side without any
  //                               test having to remember to ask for that.
  //   value moves NEITHER way  -> nothing to give it.
  //
  // A real transaction can of course have both ends - that is a `mixed`
  // transaction - and the fixtures that need one say so explicitly.
  const movesIn = perPoolZat.some((p) => p.deltaZat < 0n);
  const movesOut = perPoolZat.some((p) => p.deltaZat > 0n);
  const transparentIn = opts.transparentIn ?? (movesIn && !movesOut);
  const transparentOut = opts.transparentOut ?? (movesOut && !movesIn);

  const vin = transparentIn
    ? [
        {
          index: 0,
          coinbase: opts.coinbaseInput ?? false,
          address: opts.senderAddress ?? null,
          sequence: 0xffff_ffff,
        },
      ]
    : [];
  const vout = transparentOut
    ? [
        {
          index: 0,
          valueZat: 0n as Zatoshi,
          addresses: opts.recipientAddress ? [opts.recipientAddress] : [],
          scriptType: "pubkeyhash",
        },
      ]
    : [];

  return {
    txid: opts.txid,
    seenAt: opts.seenAt,
    tipHeightAtSeen: opts.tipHeightAtSeen ?? 1_000_000,
    txVersion: 5,
    leakClass: "PURE_SHIELDED",
    overallSeverity: "INFO",
    bundle: {
      saplingSpends: [],
      saplingOutputs: [],
      saplingValueBalanceZat,
      orchardActions: [],
      orchardValueBalanceZat,
      orchardAnchor: null,
      orchardFlags: null,
      ironwoodActions: [],
      ironwoodValueBalanceZat: 0n,
      ironwoodAnchor: null,
      ironwoodFlags: null,
    },
    transparent: { vin, vout },
    identity: {
      sender: {
        transparentAddresses: opts.senderAddress ? [opts.senderAddress] : [],
        nullifiers: [],
        commitments: [],
      },
      recipient: {
        transparentAddresses: opts.recipientAddress
          ? [opts.recipientAddress]
          : [],
        nullifiers: [],
        commitments: [],
      },
    },
    spends: [],
    outputs: [],
    valueFlow: {
      sproutValueBalanceZat,
      saplingValueBalanceZat,
      orchardValueBalanceZat,
      ironwoodValueBalanceZat: 0n,
      perPoolZat,
      netTransparentInflowZat: 0n,
      isPureShielded: false,
      crossesPoolBoundary,
      direction: !crossesPoolBoundary
        ? "NONE"
        : perPoolZat.some((p) => p.deltaZat < 0n)
          ? "DEPOSIT"
          : "WITHDRAWAL",
    },
    fingerprint: {
      outputCount: 0,
      spendCount: 0,
      outputPadded: false,
      // The protocol figure, carried on the report since HANDOFF-06 so the view
      // layer does not fall back to the count approximation. RoundTripIndex
      // does not read it; it is here because the type requires it.
      logicalActions: 2,
      // Null, not 0n. HANDOFF-06 made the fee nullable precisely because 0n was
      // the value every transaction carried while the analyser read a field no
      // node sends; a fixture that keeps writing 0n keeps that shape alive.
      // `RoundTripIndex` reads neither field.
      feeZat: null,
      isZip317ConventionalFee: null,
      expiryDelta: null,
      hasMemo: false,
      likelyWallet: "UNKNOWN_BUT_STANDARD",
    },
    findings: [],
    links: [],
  };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("RoundTripIndex — basic behaviour", () => {
  it("empty deposit pool: a withdrawal produces no links", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    const links = rti.ingest(
      makeReport({
        txid: h(1),
        seenAt: 0,
        saplingValueBalanceZat: 100n,
        recipientAddress: "t1...",
      }),
    );
    expect(links).toEqual([]);
  });

  it("empty withdrawal pool: a deposit produces no links", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    const links = rti.ingest(
      makeReport({
        txid: h(2),
        seenAt: 0,
        saplingValueBalanceZat: -100n,
        senderAddress: "t1...",
      }),
    );
    expect(links).toEqual([]);
  });
});

describe("RoundTripIndex — EXACT match", () => {
  it("single EXACT candidate → confidence HIGH", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(1),
        seenAt: 0,
        saplingValueBalanceZat: -100n,
        senderAddress: "t-sender",
      }),
    );
    const links = rti.ingest(
      makeReport({
        txid: h(2),
        seenAt: HOUR,
        saplingValueBalanceZat: 100n,
        recipientAddress: "t-recipient",
      }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.matchKind).toBe("EXACT");
    expect(links[0]?.confidence).toBe("HIGH");
    expect(links[0]?.shieldingTxid).toBe(h(1));
    expect(links[0]?.unshieldingTxid).toBe(h(2));
    expect(links[0]?.senderAddress).toBe("t-sender");
    expect(links[0]?.recipientAddress).toBe("t-recipient");
    expect(links[0]?.amountZat).toBe(100n);
    expect(links[0]?.timeDeltaMs).toBe(HOUR);
    expect(links[0]?.poolPath).toBe("sapling");
  });

  it("two EXACT candidate deposits → confidence MEDIUM on both links", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(1),
        seenAt: 0,
        saplingValueBalanceZat: -100n,
      }),
    );
    rti.ingest(
      makeReport({
        txid: h(2),
        seenAt: HOUR,
        saplingValueBalanceZat: -100n,
      }),
    );
    const links = rti.ingest(
      makeReport({
        txid: h(3),
        seenAt: 2 * HOUR,
        saplingValueBalanceZat: 100n,
      }),
    );
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.matchKind === "EXACT")).toBe(true);
    expect(links.every((l) => l.confidence === "MEDIUM")).toBe(true);
  });
});

describe("RoundTripIndex — FEE_TOLERANT match", () => {
  it("single FEE_TOLERANT candidate within tolerance → confidence MEDIUM", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(1),
        seenAt: 0,
        saplingValueBalanceZat: -100_000n,
      }),
    );
    // Withdrawal of 99_950 zat is within the default 160_000 tolerance.
    const links = rti.ingest(
      makeReport({
        txid: h(2),
        seenAt: HOUR,
        saplingValueBalanceZat: 99_950n,
      }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.matchKind).toBe("FEE_TOLERANT");
    expect(links[0]?.confidence).toBe("MEDIUM");
  });

  it("multiple FEE_TOLERANT candidates → confidence LOW", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100_000n }));
    rti.ingest(makeReport({ txid: h(2), seenAt: HOUR, saplingValueBalanceZat: -100_050n }));
    const links = rti.ingest(
      makeReport({ txid: h(3), seenAt: 2 * HOUR, saplingValueBalanceZat: 99_950n }),
    );
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.matchKind === "FEE_TOLERANT")).toBe(true);
    expect(links.every((l) => l.confidence === "LOW")).toBe(true);
  });

  it("EXACT and FEE_TOLERANT both available → only EXACT links emitted (precedence)", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100_000n }));   // EXACT candidate
    rti.ingest(makeReport({ txid: h(2), seenAt: HOUR, saplingValueBalanceZat: -100_050n })); // FEE_TOLERANT
    const links = rti.ingest(
      makeReport({ txid: h(3), seenAt: 2 * HOUR, saplingValueBalanceZat: 100_000n }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.matchKind).toBe("EXACT");
    expect(links[0]?.shieldingTxid).toBe(h(1));
  });
});

describe("RoundTripIndex — pruning", () => {
  it("deposit older than window is pruned before matching", () => {
    let mockTime = 0;
    const rti = new RoundTripIndex({ now: () => mockTime });

    // Ingest a deposit at t=0
    mockTime = 0;
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100n }));
    expect(rti.snapshot().depositCount).toBe(1);

    // Advance clock past the 7-day window, then ingest a matching withdrawal.
    // Pruning at the start of ingest() drops the deposit before matching.
    mockTime = 10 * DAY;
    const links = rti.ingest(
      makeReport({ txid: h(2), seenAt: 10 * DAY, saplingValueBalanceZat: 100n }),
    );
    expect(links).toEqual([]);
    expect(rti.snapshot().depositCount).toBe(0);
  });

  it("injectable clock + custom window: prunes deterministically", () => {
    let mockTime = 0;
    const rti = new RoundTripIndex({
      now: () => mockTime,
      windowMs: HOUR, // narrow 1-hour window for the test
    });

    // Ingest a deposit at t=0.
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100n }));
    expect(rti.snapshot().depositCount).toBe(1);

    // 30 minutes later: advance clock, trigger prune via a noop-balance report.
    // Deposit at seenAt=0 is at cutoff = HOUR/2 - HOUR = -HOUR/2; 0 >= -HOUR/2 holds, so it survives.
    mockTime = HOUR / 2;
    rti.ingest(makeReport({ txid: h(99), seenAt: HOUR / 2 }));
    expect(rti.snapshot().depositCount).toBe(1);

    // 2 hours later: cutoff = HOUR. Deposit at seenAt=0 fails 0 >= HOUR → pruned.
    mockTime = 2 * HOUR;
    rti.ingest(makeReport({ txid: h(2), seenAt: 2 * HOUR }));
    expect(rti.snapshot().depositCount).toBe(0);
  });
});

describe("RoundTripIndex — poolPath", () => {
  it("same-pool sapling → sapling", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100n }));
    const links = rti.ingest(
      makeReport({ txid: h(2), seenAt: HOUR, saplingValueBalanceZat: 100n }),
    );
    expect(links[0]?.poolPath).toBe("sapling");
  });

  it("cross-pool sapling deposit → orchard withdrawal yields poolPath 'sapling→orchard'", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100n }));
    const links = rti.ingest(
      makeReport({ txid: h(2), seenAt: HOUR, orchardValueBalanceZat: 100n }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.poolPath).toBe("sapling→orchard");
  });

  it("Sprout and Ironwood are matchable, which is what reading perPoolZat bought", () => {
    // PASS STATE for the four-pool widening. Neither of these pools has a
    // `valueBalance` field the old two-branch `ingest()` could have read -
    // Sprout is a JoinSplit sum and Ironwood is a v6 bundle - so before
    // HANDOFF-06 this pair produced no link, silently, with nothing logged.
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, sproutValueBalanceZat: -100n }));
    const links = rti.ingest(
      makeReport({ txid: h(2), seenAt: HOUR, ironwoodValueBalanceZat: 100n }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.poolPath).toBe("sprout→ironwood");
    expect(links[0]?.amountZat).toBe(100n);
  });

  it("FAIL STATE: a report whose pools did not move produces no deposit and no link", () => {
    // The discriminating half of the test above. If `makeReport` emitted a
    // `perPoolZat` entry per pool regardless of movement, this deposit-shaped
    // report with every balance at zero would register four deposits and the
    // withdrawal below would match one of them at an amount of nothing.
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0 }));
    expect(rti.snapshot().depositCount).toBe(0);
    const links = rti.ingest(
      makeReport({ txid: h(2), seenAt: HOUR, ironwoodValueBalanceZat: 100n }),
    );
    expect(links).toEqual([]);
  });

  it("one transaction moving two pools with a PUBLIC END on both yields both halves", () => {
    // WHAT THIS ASSERTION USED TO SAY, AND WHY IT CHANGED. HANDOFF-06 wrote it
    // as "one transaction moving two pools yields a deposit and a withdrawal",
    // over a fixture with no transparent side at all, and it was the assertion
    // HANDOFF-07 found itself unable to satisfy alongside the fix for the false
    // links (LEDGER-07 Q1). L2 ruled for the wide rule, so the general claim is
    // false and the narrower one below is what was actually true about the
    // mechanism it was written to protect.
    //
    // The mechanism is unchanged and is still what this tests: reading the
    // single `perPoolZat` list rather than two named balance fields is what lets
    // ONE report contribute BOTH halves without a second ingest. It just also
    // has to have somewhere for the value to come from and go to.
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(1),
        seenAt: 0,
        orchardValueBalanceZat: 100n,
        ironwoodValueBalanceZat: -100n,
        transparentIn: true,
        transparentOut: true,
      }),
    );
    const snap = rti.snapshot();
    expect(snap.depositCount).toBe(1);
    expect(snap.withdrawalCount).toBe(1);
  });
});

describe("A11/A12 - the WIDE RULE: a round trip needs a transparent side", () => {
  const FIVE_HUNDRED_ZEC = 500n * 100_000_000n;

  /**
   * Two Orchard-to-Ironwood migrations of the same denomination, an hour apart.
   *
   * ZIP 318 MAKES THIS THE ORDINARY CASE RATHER THAN A CONTRIVANCE. Quantising
   * to `n x 10^k` is the whole migration scheme, so two unrelated wallets
   * migrating 500 ZEC in the same window is what the protocol is designed to
   * produce. That is why HANDOFF-07 escalated it instead of filing it as an
   * edge case.
   */
  // `ShieldedPool` RATHER THAN AN INLINE PAIR, because `check-pool-union.mjs`
  // is right to refuse one even in a test helper: a two-member pool union is
  // the shape that made Sprout and Ironwood invisible to this very index, and a
  // guard that exempted test files would miss the fixtures that pin the
  // behaviour. Caught by the guard on its first run over this file.
  function twoMigrations(pools: { from: ShieldedPool; to: ShieldedPool }) {
    const leg = (txid: Hex, seenAt: number) =>
      makeReport({
        txid,
        seenAt,
        ...(pools.from === "orchard"
          ? { orchardValueBalanceZat: FIVE_HUNDRED_ZEC }
          : { saplingValueBalanceZat: FIVE_HUNDRED_ZEC }),
        ...(pools.to === "ironwood"
          ? { ironwoodValueBalanceZat: -FIVE_HUNDRED_ZEC }
          : { saplingValueBalanceZat: -FIVE_HUNDRED_ZEC }),
      });
    return [leg(h(0xa1), 0), leg(h(0xa2), HOUR)] as const;
  }

  it("A11 PASS: two 500 ZEC Orchard-to-Ironwood migrations produce NO LinkRecord", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    const [first, second] = twoMigrations({ from: "orchard", to: "ironwood" });

    expect(rti.ingest(first)).toEqual([]);
    expect(rti.ingest(second)).toEqual([]);

    // And nothing was even recorded, so a later ordinary withdrawal cannot match
    // one of these legs either. A rule that merely suppressed the LINK while
    // still filing the deposit would leave the defect one ingest away.
    const snap = rti.snapshot();
    expect(snap.depositCount).toBe(0);
    expect(snap.withdrawalCount).toBe(0);
  });

  it("A11 PASS: the same holds for Orchard-to-Sapling, on legs that predate HANDOFF-07", () => {
    // HANDOFF-07 reproduced the defect twice, and this is the polarity that
    // proves it PRE-DATES that handoff: these pool legs are byte-identical to
    // base eba5b03, so nothing Ironwood-specific is involved.
    const rti = new RoundTripIndex({ now: () => 0 });
    const [first, second] = twoMigrations({ from: "orchard", to: "sapling" });
    expect(rti.ingest(first)).toEqual([]);
    expect(rti.ingest(second)).toEqual([]);
    expect(rti.snapshot().depositCount).toBe(0);
  });

  it("A11 FAIL SIDE: under the PRE-TRANSPARENT rule the same pair links strangers", () => {
    // THE PRE-FOLD BEHAVIOUR, REPRODUCED RATHER THAN DESCRIBED. `ingest()`'s
    // wide rule is two `continue`s; withholding them is what the old code did,
    // so this models the old code by feeding the same reports through a report
    // that DOES have both transparent ends. If the guard were removed, a
    // migration would look exactly like this to the index.
    const rti = new RoundTripIndex({ now: () => 0 });
    const asIfUnguarded = (txid: Hex, seenAt: number) =>
      makeReport({
        txid,
        seenAt,
        orchardValueBalanceZat: FIVE_HUNDRED_ZEC,
        ironwoodValueBalanceZat: -FIVE_HUNDRED_ZEC,
        transparentIn: true,
        transparentOut: true,
      });

    rti.ingest(asIfUnguarded(h(0xb1), 0));
    const links = rti.ingest(asIfUnguarded(h(0xb2), HOUR));

    // One link, between two transactions with no relationship whatsoever - and
    // the two null address fields are the type system saying so.
    expect(links).toHaveLength(1);
    expect(links[0]!.confidence).toBe("HIGH");
    expect(links[0]!.senderAddress).toBeNull();
    expect(links[0]!.recipientAddress).toBeNull();
  });

  it("A12 PASS: a GENUINE pair with both public ends still links, at its old grade", () => {
    // WITHOUT THIS, A11 IS SATISFIED BY AN INDEX THAT EMITS NOTHING AT ALL.
    // A fail-side probe that does not discriminate is itself a finding
    // (CLAUDE.md, LEDGER-05 fold 7), and "no links" is the easiest possible way
    // to pass an assertion whose subject is a missing link.
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(0xc1),
        seenAt: 0,
        saplingValueBalanceZat: -FIVE_HUNDRED_ZEC,
        senderAddress: "t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK",
      }),
    );
    const links = rti.ingest(
      makeReport({
        txid: h(0xc2),
        seenAt: HOUR,
        saplingValueBalanceZat: FIVE_HUNDRED_ZEC,
        recipientAddress: "t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e",
      }),
    );

    expect(links).toHaveLength(1);
    expect(links[0]!.matchKind).toBe("EXACT");
    expect(links[0]!.confidence).toBe("HIGH");
    // AND BOTH ADDRESSES ARE PRESENT, which is the difference that matters: a
    // link this project will publish names two real ends.
    expect(links[0]!.senderAddress).toBe("t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK");
    expect(links[0]!.recipientAddress).toBe("t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e");
  });

  it("A12 FAIL SIDE: stripping the transparent side from the same pair removes the link", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(0xd1),
        seenAt: 0,
        saplingValueBalanceZat: -FIVE_HUNDRED_ZEC,
        transparentIn: false,
      }),
    );
    const links = rti.ingest(
      makeReport({
        txid: h(0xd2),
        seenAt: HOUR,
        saplingValueBalanceZat: FIVE_HUNDRED_ZEC,
        transparentOut: false,
      }),
    );
    expect(links).toEqual([]);
    expect(rti.snapshot()).toMatchObject({ depositCount: 0, withdrawalCount: 0 });
  });

  it("each half is required SEPARATELY, not just one of the two", () => {
    // A guard that required only a transparent input would still file every
    // unshield, and vice versa. Both directions are checked one at a time.
    const depositOnly = new RoundTripIndex({ now: () => 0 });
    depositOnly.ingest(
      makeReport({ txid: h(0xe1), seenAt: 0, saplingValueBalanceZat: -100n, transparentIn: false }),
    );
    expect(depositOnly.snapshot().depositCount).toBe(0);

    const withdrawalOnly = new RoundTripIndex({ now: () => 0 });
    withdrawalOnly.ingest(
      makeReport({ txid: h(0xe2), seenAt: 0, saplingValueBalanceZat: 100n, transparentOut: false }),
    );
    expect(withdrawalOnly.snapshot().withdrawalCount).toBe(0);
  });

  it("a COINBASE input is not a transparent source, because it has no prior owner", () => {
    // ZIP 213 forces coinbase through a shielded pool, so a miner's issuance
    // really does enter the pool - but there is no transparent COUNTERPARTY to
    // link it to. TRACKING-MATH section 2 defines a shield event as
    // `a IN inputs(T)` for a transparent address `a`, and a coinbase input has
    // no `a`. Admitting it would file a deposit whose `senderAddress` is null,
    // which is the shape the wide rule exists to remove.
    //
    // NARROWER THAN THE FOLD'S WORDING, AND STATED RATHER THAN SLIPPED IN: L2's
    // rule says "a deposit requires a transparent input", and a coinbase input
    // is a transparent input by the type. This reading is recorded in section 8
    // as an inference.
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(0xf1),
        seenAt: 0,
        saplingValueBalanceZat: -100n,
        transparentIn: true,
        coinbaseInput: true,
      }),
    );
    expect(rti.snapshot().depositCount).toBe(0);

    // FAIL SIDE: the same report with an ordinary input IS a deposit, so the
    // exclusion is about the coinbase flag and not about the shape.
    const ordinary = new RoundTripIndex({ now: () => 0 });
    ordinary.ingest(
      makeReport({ txid: h(0xf2), seenAt: 0, saplingValueBalanceZat: -100n, transparentIn: true }),
    );
    expect(ordinary.snapshot().depositCount).toBe(1);
  });
});

describe("RoundTripIndex — assessment field (option (c) contract)", () => {
  it("LinkRecord.assessment is undefined under Module 5B (Module 7 will populate)", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100n }));
    const links = rti.ingest(
      makeReport({ txid: h(2), seenAt: HOUR, saplingValueBalanceZat: 100n }),
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.assessment).toBeUndefined();
  });
});

describe("RoundTripIndex — snapshot", () => {
  it("reports correct counts after a mixed sequence", () => {
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(makeReport({ txid: h(1), seenAt: 0, saplingValueBalanceZat: -100n }));
    rti.ingest(makeReport({ txid: h(2), seenAt: HOUR, saplingValueBalanceZat: -200n }));
    rti.ingest(makeReport({ txid: h(3), seenAt: 2 * HOUR, orchardValueBalanceZat: 50n }));
    const snap = rti.snapshot();
    expect(snap.depositCount).toBe(2);
    expect(snap.withdrawalCount).toBe(1);
    expect(snap.windowMs).toBe(7 * DAY); // default
  });

  it("snapshot.windowMs reflects the configured window", () => {
    const rti = new RoundTripIndex({ windowMs: HOUR });
    expect(rti.snapshot().windowMs).toBe(HOUR);
  });
});
