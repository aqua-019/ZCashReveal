import { describe, it, expect } from "vitest";
import {
  asHex,
  type Hex,
  type LeakReport,
} from "@zcashreveal/types";
import { RoundTripIndex } from "../round-trip.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/**
 * Minimal LeakReport builder for round-trip tests. Only the fields
 * RoundTripIndex reads are configurable; everything else is filled with
 * inert defaults.
 *
 * RoundTripIndex reads: txid, seenAt, tipHeightAtSeen,
 *   bundle.{sapling,orchard}ValueBalanceZat,
 *   identity.sender.transparentAddresses[0],
 *   identity.recipient.transparentAddresses[0].
 */
function makeReport(opts: {
  txid: Hex;
  seenAt: number;
  tipHeightAtSeen?: number;
  saplingValueBalanceZat?: bigint;
  orchardValueBalanceZat?: bigint;
  senderAddress?: string;
  recipientAddress?: string;
}): LeakReport {
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
      saplingValueBalanceZat: opts.saplingValueBalanceZat ?? 0n,
      orchardActions: [],
      orchardValueBalanceZat: opts.orchardValueBalanceZat ?? 0n,
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
      saplingValueBalanceZat: 0n,
      orchardValueBalanceZat: 0n,
      netTransparentInflowZat: 0n,
      isPureShielded: false,
      crossesPoolBoundary: false,
      direction: "NONE",
    },
    fingerprint: {
      outputCount: 0,
      spendCount: 0,
      outputPadded: false,
      feeZat: 0n,
      isZip317ConventionalFee: false,
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
