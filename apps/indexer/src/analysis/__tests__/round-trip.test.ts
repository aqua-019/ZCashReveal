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
    },
    transparent: { vin: [], vout: [] },
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

  it("one transaction moving two pools yields a deposit and a withdrawal from a single report", () => {
    // A migration is one transaction draining one pool into another, so both
    // halves arrive on the same report. Reading a list rather than two named
    // fields is what lets the index see both without a second ingest.
    const rti = new RoundTripIndex({ now: () => 0 });
    rti.ingest(
      makeReport({
        txid: h(1),
        seenAt: 0,
        orchardValueBalanceZat: 100n,
        ironwoodValueBalanceZat: -100n,
      }),
    );
    const snap = rti.snapshot();
    expect(snap.depositCount).toBe(1);
    expect(snap.withdrawalCount).toBe(1);
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
