/**
 * Mock data generator.
 *
 * Produces realistic-looking LeakReports covering every leak class.
 * Used when the dashboard is deployed without a live backend.
 *
 * Toggle via env: VITE_MOCK_MODE=true
 */

import type { RawAssessment, RawReport } from "../hooks/useMempool";
import type { PoolStateSummary } from "../components/PoolStatePanel";

function randomHex(bytes: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < bytes * 2; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

const T_ADDRESSES = [
  "t1JjV9p5JxKZBYjzGz3rN6vy8wSqEqDzNgX",
  "t1aZ7B92ifJM3xKxQ4nCpRzL4M9pVgRkVnH",
  "t1eUyN9CKGFkBwQEN6vk9JpvWQ8ApFqXxYL",
  "t3VZsg5LkAGzbk89wQ9XzFmCpvBwH2tQ2RD",
  "t1gMxK7Bm4dFrTpZh3JwYDqPnL5jXcVtKsA",
  "t1Qd9pYZkW4hG3xKpRnL7tFvCmJ8aNbWeRJ",
];

const SAMPLE_TXIDS = [
  "a3f8c421b95e6d028f17e3c5d4928a1bef0245c7d83a6e4f1c5b2d9a8e7f3a1c",
  "7b4e2a91c83d56f0182a4e9c5b6d3a7e8f129d4a5b6c7d8e9f0a1b2c3d4e5f60",
  "1d9c8b7a6f5e4d3c2b1a0987654321fedcba9876543210abcdef0123456789ab",
  "c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
  "9f8e7d6c5b4a3928170615040302010fedcba98765432100123456789abcdef0",
  "5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
];

function makeBaseReport(
  txid: string,
  leakClass: string,
  overallSeverity: string,
  ageSeconds: number,
): Omit<
  RawReport,
  "bundle" | "transparent" | "identity" | "spends" | "outputs" | "valueFlow" | "fingerprint" | "findings"
> {
  return {
    txid,
    seenAt: Date.now() - ageSeconds * 1000,
    tipHeightAtSeen: 2_840_512 + Math.floor(Math.random() * 10),
    txVersion: 5,
    leakClass,
    overallSeverity,
    links: [],
  };
}

function mkOrchardAction(index: number) {
  return {
    pool: "orchard" as const,
    index,
    nullifier: randomHex(32),
    cmx: randomHex(32),
    cv: randomHex(32),
    rk: randomHex(32),
    ephemeralKey: randomHex(32),
    encCiphertextSize: 580,
    outCiphertextSize: 80,
  };
}

function mkSaplingSpend(index: number) {
  return {
    pool: "sapling" as const,
    index,
    nullifier: randomHex(32),
    anchor: randomHex(32),
    cv: randomHex(32),
    rk: randomHex(32),
  };
}

function mkSpendAnnotation(
  pool: "sapling" | "orchard",
  index: number,
  depth: number,
  isRecent: boolean,
  severity: string,
  assessment?: RawAssessment,
) {
  return {
    pool,
    index,
    nullifier: randomHex(32),
    anchor: randomHex(32),
    anchorHeight: 2_840_512 - depth,
    anchorDepthBlocks: depth,
    isRecentAnchor: isRecent,
    severity,
    ...(assessment !== undefined ? { assessment } : {}),
  };
}

/**
 * Build a small_heuristic_set assessment: one time_window filter
 * narrowing from rawCount → countOut. Used by pureShielded and mixed.
 */
function mkAssessmentTimeWindow(opts: {
  pool: "sapling" | "orchard";
  rawCount: string;
  effectiveSetSize: string;
  entropyBits: number;
  claimLevel: RawAssessment["claimLevel"];
  windowBlocks: number;
  highHeight: number;
}): RawAssessment {
  return {
    pool: opts.pool,
    anchorRoot: randomHex(32),
    rawCount: opts.rawCount,
    effectiveSetSize: opts.effectiveSetSize,
    entropyBits: opts.entropyBits,
    claimLevel: opts.claimLevel,
    appliedFilters: [
      {
        filter: "time_window",
        params: {
          windowBlocks: opts.windowBlocks,
          lowHeight: opts.highHeight - opts.windowBlocks,
          highHeight: opts.highHeight,
        },
        countIn: opts.rawCount,
        countOut: opts.effectiveSetSize,
      },
    ],
  };
}

/**
 * Build a requires_disclosure assessment with two filters:
 * time_window narrows rawCount → afterTime, then amount_match narrows
 * afterTime → effectiveSetSize. Used by zToT's spends and the link.
 */
function mkAssessmentTimeAndAmount(opts: {
  pool: "sapling" | "orchard";
  rawCount: string;
  afterTime: string;
  effectiveSetSize: string;
  entropyBits: number;
  windowBlocks: number;
  highHeight: number;
  matchedDepositTxid: string;
  matchedDepositHeight: number;
  matchedDepositAmountZat: string;
  withdrawalAmountZat: string;
  toleranceZat: string;
  matchKind: "EXACT" | "FEE_TOLERANT";
}): RawAssessment {
  return {
    pool: opts.pool,
    anchorRoot: randomHex(32),
    rawCount: opts.rawCount,
    effectiveSetSize: opts.effectiveSetSize,
    entropyBits: opts.entropyBits,
    claimLevel: "requires_disclosure",
    appliedFilters: [
      {
        filter: "time_window",
        params: {
          windowBlocks: opts.windowBlocks,
          lowHeight: opts.highHeight - opts.windowBlocks,
          highHeight: opts.highHeight,
        },
        countIn: opts.rawCount,
        countOut: opts.afterTime,
      },
      {
        filter: "amount_match",
        params: {
          matchedDepositTxid: opts.matchedDepositTxid,
          matchedDepositHeight: opts.matchedDepositHeight,
          matchedDepositAmountZat: opts.matchedDepositAmountZat,
          withdrawalAmountZat: opts.withdrawalAmountZat,
          toleranceZat: opts.toleranceZat,
          matchKind: opts.matchKind,
        },
        countIn: opts.afterTime,
        countOut: opts.effectiveSetSize,
      },
    ],
  };
}

/* ============================== SCENARIOS ============================== */

const pureShielded: RawReport = {
  ...makeBaseReport(SAMPLE_TXIDS[0]!, "PURE_SHIELDED", "MEDIUM", 8),
  bundle: {
    saplingSpends: [],
    saplingOutputs: [],
    saplingValueBalanceZat: "0",
    orchardActions: [mkOrchardAction(0), mkOrchardAction(1), mkOrchardAction(2)],
    orchardValueBalanceZat: "0",
    orchardAnchor: randomHex(32),
    orchardFlags: { enableSpends: true, enableOutputs: true },
  },
  transparent: { vin: [], vout: [] },
  identity: {
    sender: {
      transparentAddresses: [],
      nullifiers: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
      commitments: [],
    },
    recipient: {
      transparentAddresses: [],
      nullifiers: [],
      commitments: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
    },
  },
  spends: [
    mkSpendAnnotation("orchard", 0, 23, true, "MEDIUM",
      mkAssessmentTimeWindow({
        pool: "orchard", rawCount: "1000", effectiveSetSize: "60",
        entropyBits: 5.91, claimLevel: "small_heuristic_set",
        windowBlocks: 576, highHeight: 2_840_489,
      }),
    ),
    mkSpendAnnotation("orchard", 1, 23, true, "MEDIUM",
      mkAssessmentTimeWindow({
        pool: "orchard", rawCount: "1000", effectiveSetSize: "60",
        entropyBits: 5.91, claimLevel: "small_heuristic_set",
        windowBlocks: 576, highHeight: 2_840_489,
      }),
    ),
    mkSpendAnnotation("orchard", 2, 23, true, "MEDIUM",
      mkAssessmentTimeWindow({
        pool: "orchard", rawCount: "1000", effectiveSetSize: "60",
        entropyBits: 5.91, claimLevel: "small_heuristic_set",
        windowBlocks: 576, highHeight: 2_840_489,
      }),
    ),
  ],
  outputs: [
    { pool: "orchard", index: 0, commitment: randomHex(32) },
    { pool: "orchard", index: 1, commitment: randomHex(32) },
    { pool: "orchard", index: 2, commitment: randomHex(32) },
  ],
  valueFlow: {
    saplingValueBalanceZat: "0",
    orchardValueBalanceZat: "0",
    netTransparentInflowZat: "0",
    isPureShielded: true,
    crossesPoolBoundary: false,
    direction: "INTRA_POOL",
  },
  fingerprint: {
    outputCount: 3,
    spendCount: 3,
    outputPadded: true,
    feeZat: "30000",
    isZip317ConventionalFee: true,
    expiryDelta: 40,
    hasMemo: false,
    likelyWallet: "UNKNOWN_BUT_STANDARD",
  },
  findings: [
    { code: "RECENT_ANCHOR", severity: "MEDIUM", message: "Orchard bundle anchor depth: 23 blocks — narrows note receive window to ~1h", field: "anchor" },
  ],
};

const tToZ: RawReport = {
  ...makeBaseReport(SAMPLE_TXIDS[1]!, "T_TO_Z", "HIGH", 22),
  bundle: {
    saplingSpends: [],
    saplingOutputs: [],
    saplingValueBalanceZat: "0",
    orchardActions: [mkOrchardAction(0), mkOrchardAction(1)],
    orchardValueBalanceZat: "-150000000",
    orchardAnchor: randomHex(32),
    orchardFlags: { enableSpends: false, enableOutputs: true },
  },
  transparent: {
    vin: [
      { index: 0, coinbase: false, prevTxid: randomHex(32), prevVout: 0, address: T_ADDRESSES[0]!, sequence: 4294967295 },
    ],
    vout: [],
  },
  identity: {
    sender: { transparentAddresses: [T_ADDRESSES[0]!], nullifiers: [], commitments: [] },
    recipient: {
      transparentAddresses: [],
      nullifiers: [],
      commitments: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
    },
  },
  spends: [],
  outputs: [
    { pool: "orchard", index: 0, commitment: randomHex(32) },
    { pool: "orchard", index: 1, commitment: randomHex(32) },
  ],
  valueFlow: {
    saplingValueBalanceZat: "0",
    orchardValueBalanceZat: "-150000000",
    netTransparentInflowZat: "150000000",
    isPureShielded: false,
    crossesPoolBoundary: true,
    direction: "DEPOSIT",
  },
  fingerprint: {
    outputCount: 2,
    spendCount: 1,
    outputPadded: true,
    feeZat: "10000",
    isZip317ConventionalFee: true,
    expiryDelta: 80,
    hasMemo: false,
    likelyWallet: "NIGHTHAWK",
  },
  findings: [
    { code: "VALUE_BALANCE_NONZERO", severity: "HIGH", message: "Tx crosses t↔z boundary: Orchard -150000000 zat (1.5 ZEC entering pool from transparent)", field: "valueBalance" },
    { code: "WALLET_FINGERPRINT", severity: "LOW", message: "Wallet signature matches: NIGHTHAWK", field: "fingerprint" },
  ],
  links: [
    {
      shieldingTxid: SAMPLE_TXIDS[1]!,
      unshieldingTxid: SAMPLE_TXIDS[2]!,
      senderAddress: T_ADDRESSES[0]!,
      recipientAddress: T_ADDRESSES[1]!,
      amountZat: "150000000",
      timeDeltaMs: (47 - 22) * 1000,
      matchKind: "FEE_TOLERANT",
      poolPath: "orchard",
      confidence: "HIGH",
    },
  ],
};

const zToT: RawReport = {
  ...makeBaseReport(SAMPLE_TXIDS[2]!, "Z_TO_T", "CRITICAL", 47),
  bundle: {
    saplingSpends: [],
    saplingOutputs: [],
    saplingValueBalanceZat: "0",
    orchardActions: [mkOrchardAction(0), mkOrchardAction(1), mkOrchardAction(2)],
    orchardValueBalanceZat: "149990000",
    orchardAnchor: randomHex(32),
    orchardFlags: { enableSpends: true, enableOutputs: true },
  },
  transparent: {
    vin: [],
    vout: [{ index: 0, valueZat: "149990000", addresses: [T_ADDRESSES[1]!], scriptType: "pubkeyhash" }],
  },
  identity: {
    sender: {
      transparentAddresses: [],
      nullifiers: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
      commitments: [],
    },
    recipient: {
      transparentAddresses: [T_ADDRESSES[1]!],
      nullifiers: [],
      commitments: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
    },
  },
  spends: [
    mkSpendAnnotation("orchard", 0, 8, true, "MEDIUM",
      mkAssessmentTimeAndAmount({
        pool: "orchard", rawCount: "500", afterTime: "20", effectiveSetSize: "3",
        entropyBits: 1.58, windowBlocks: 96, highHeight: 2_840_504,
        matchedDepositTxid: SAMPLE_TXIDS[1]!, matchedDepositHeight: 2_840_490,
        matchedDepositAmountZat: "150000000", withdrawalAmountZat: "149990000",
        toleranceZat: "160000", matchKind: "FEE_TOLERANT",
      }),
    ),
    mkSpendAnnotation("orchard", 1, 8, true, "MEDIUM",
      mkAssessmentTimeAndAmount({
        pool: "orchard", rawCount: "500", afterTime: "20", effectiveSetSize: "3",
        entropyBits: 1.58, windowBlocks: 96, highHeight: 2_840_504,
        matchedDepositTxid: SAMPLE_TXIDS[1]!, matchedDepositHeight: 2_840_490,
        matchedDepositAmountZat: "150000000", withdrawalAmountZat: "149990000",
        toleranceZat: "160000", matchKind: "FEE_TOLERANT",
      }),
    ),
    mkSpendAnnotation("orchard", 2, 8, true, "MEDIUM",
      mkAssessmentTimeAndAmount({
        pool: "orchard", rawCount: "500", afterTime: "20", effectiveSetSize: "3",
        entropyBits: 1.58, windowBlocks: 96, highHeight: 2_840_504,
        matchedDepositTxid: SAMPLE_TXIDS[1]!, matchedDepositHeight: 2_840_490,
        matchedDepositAmountZat: "150000000", withdrawalAmountZat: "149990000",
        toleranceZat: "160000", matchKind: "FEE_TOLERANT",
      }),
    ),
  ],
  outputs: [
    { pool: "orchard", index: 0, commitment: randomHex(32) },
    { pool: "orchard", index: 1, commitment: randomHex(32) },
    { pool: "orchard", index: 2, commitment: randomHex(32) },
  ],
  valueFlow: {
    saplingValueBalanceZat: "0",
    orchardValueBalanceZat: "149990000",
    netTransparentInflowZat: "149990000",
    isPureShielded: false,
    crossesPoolBoundary: true,
    direction: "WITHDRAWAL",
  },
  fingerprint: {
    outputCount: 4,
    spendCount: 3,
    outputPadded: true,
    feeZat: "20000",
    isZip317ConventionalFee: true,
    expiryDelta: 40,
    hasMemo: false,
    likelyWallet: "ZCASHD_RUST",
  },
  findings: [
    { code: "VALUE_BALANCE_NONZERO", severity: "HIGH", message: "Tx crosses t↔z boundary: Orchard +149990000 zat (1.4999 ZEC leaving pool to transparent)", field: "valueBalance" },
    { code: "RECENT_ANCHOR", severity: "MEDIUM", message: "Orchard bundle anchor depth: 8 blocks — narrows note receive window to <30min", field: "anchor" },
    { code: "WALLET_FINGERPRINT", severity: "LOW", message: "Wallet signature matches: ZCASHD_RUST — likely exchange or zcashd built-in wallet", field: "fingerprint" },
  ],
  links: [
    {
      shieldingTxid: SAMPLE_TXIDS[1]!,
      unshieldingTxid: SAMPLE_TXIDS[2]!,
      senderAddress: T_ADDRESSES[0]!,
      recipientAddress: T_ADDRESSES[1]!,
      amountZat: "150000000",
      timeDeltaMs: (47 - 22) * 1000,
      matchKind: "FEE_TOLERANT",
      poolPath: "orchard",
      confidence: "HIGH",
      assessment: mkAssessmentTimeAndAmount({
        pool: "orchard", rawCount: "500", afterTime: "20", effectiveSetSize: "3",
        entropyBits: 1.58, windowBlocks: 96, highHeight: 2_840_504,
        matchedDepositTxid: SAMPLE_TXIDS[1]!, matchedDepositHeight: 2_840_490,
        matchedDepositAmountZat: "150000000", withdrawalAmountZat: "149990000",
        toleranceZat: "160000", matchKind: "FEE_TOLERANT",
      }),
    },
  ],
};

const migration: RawReport = {
  ...makeBaseReport(SAMPLE_TXIDS[3]!, "MIGRATION_S2O", "MEDIUM", 91),
  bundle: {
    saplingSpends: [mkSaplingSpend(0), mkSaplingSpend(1)],
    saplingOutputs: [],
    saplingValueBalanceZat: "500000000",
    orchardActions: [mkOrchardAction(0), mkOrchardAction(1)],
    orchardValueBalanceZat: "-500000000",
    orchardAnchor: randomHex(32),
    orchardFlags: { enableSpends: false, enableOutputs: true },
  },
  transparent: { vin: [], vout: [] },
  identity: {
    sender: {
      transparentAddresses: [],
      nullifiers: [
        { pool: "sapling", value: randomHex(32) },
        { pool: "sapling", value: randomHex(32) },
      ],
      commitments: [],
    },
    recipient: {
      transparentAddresses: [],
      nullifiers: [],
      commitments: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
    },
  },
  spends: [
    // Spend 0: aggregate_only — deep anchor, no filter narrowing applies.
    mkSpendAnnotation("sapling", 0, 4250, false, "INFO", {
      pool: "sapling",
      anchorRoot: randomHex(32),
      rawCount: "5000000",
      effectiveSetSize: "5000000",
      entropyBits: 22.25,
      claimLevel: "aggregate_only",
      appliedFilters: [],
    }),
    // Spend 1: broad_candidate_set — time_window narrows from 5M to 800.
    mkSpendAnnotation("sapling", 1, 4250, false, "INFO",
      mkAssessmentTimeWindow({
        pool: "sapling", rawCount: "5000000", effectiveSetSize: "800",
        entropyBits: 9.64, claimLevel: "broad_candidate_set",
        windowBlocks: 576, highHeight: 2_836_262,
      }),
    ),
  ],
  outputs: [
    { pool: "orchard", index: 0, commitment: randomHex(32) },
    { pool: "orchard", index: 1, commitment: randomHex(32) },
  ],
  valueFlow: {
    saplingValueBalanceZat: "500000000",
    orchardValueBalanceZat: "-500000000",
    netTransparentInflowZat: "0",
    isPureShielded: false,
    crossesPoolBoundary: true,
    direction: "DEPOSIT",
  },
  fingerprint: {
    outputCount: 2,
    spendCount: 2,
    outputPadded: true,
    feeZat: "20000",
    isZip317ConventionalFee: true,
    expiryDelta: 20,
    hasMemo: false,
    likelyWallet: "ZECWALLET_LITE",
  },
  findings: [
    { code: "MIGRATION_PATTERN", severity: "MEDIUM", message: "Textbook Sapling→Orchard migration: 2 Sapling spends paired with 2 Orchard outputs, exact value match (5 ZEC)" },
    { code: "MIXED_POOLS", severity: "MEDIUM", message: "Both Sapling and Orchard pools touched — wallet bridges both pools" },
  ],
};

const mixed: RawReport = {
  ...makeBaseReport(SAMPLE_TXIDS[4]!, "MIXED", "HIGH", 134),
  bundle: {
    saplingSpends: [],
    saplingOutputs: [],
    saplingValueBalanceZat: "0",
    orchardActions: [mkOrchardAction(0), mkOrchardAction(1), mkOrchardAction(2)],
    orchardValueBalanceZat: "-25000000",
    orchardAnchor: randomHex(32),
    orchardFlags: { enableSpends: true, enableOutputs: true },
  },
  transparent: {
    vin: [
      { index: 0, coinbase: false, prevTxid: randomHex(32), prevVout: 1, address: T_ADDRESSES[2]!, sequence: 4294967295 },
    ],
    vout: [{ index: 0, valueZat: "10000000", addresses: [T_ADDRESSES[3]!], scriptType: "scripthash" }],
  },
  identity: {
    sender: {
      transparentAddresses: [T_ADDRESSES[2]!],
      nullifiers: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
      commitments: [],
    },
    recipient: {
      transparentAddresses: [T_ADDRESSES[3]!],
      nullifiers: [],
      commitments: [
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
        { pool: "orchard", value: randomHex(32) },
      ],
    },
  },
  spends: [
    mkSpendAnnotation("orchard", 0, 15, true, "MEDIUM",
      mkAssessmentTimeWindow({
        pool: "orchard", rawCount: "2000", effectiveSetSize: "45",
        entropyBits: 5.49, claimLevel: "small_heuristic_set",
        windowBlocks: 576, highHeight: 2_840_497,
      }),
    ),
    mkSpendAnnotation("orchard", 1, 15, true, "MEDIUM",
      mkAssessmentTimeWindow({
        pool: "orchard", rawCount: "2000", effectiveSetSize: "45",
        entropyBits: 5.49, claimLevel: "small_heuristic_set",
        windowBlocks: 576, highHeight: 2_840_497,
      }),
    ),
    mkSpendAnnotation("orchard", 2, 15, true, "MEDIUM",
      mkAssessmentTimeWindow({
        pool: "orchard", rawCount: "2000", effectiveSetSize: "45",
        entropyBits: 5.49, claimLevel: "small_heuristic_set",
        windowBlocks: 576, highHeight: 2_840_497,
      }),
    ),
  ],
  outputs: [
    { pool: "orchard", index: 0, commitment: randomHex(32) },
    { pool: "orchard", index: 1, commitment: randomHex(32) },
    { pool: "orchard", index: 2, commitment: randomHex(32) },
  ],
  valueFlow: {
    saplingValueBalanceZat: "0",
    orchardValueBalanceZat: "-25000000",
    netTransparentInflowZat: "10000000",
    isPureShielded: false,
    crossesPoolBoundary: true,
    direction: "DEPOSIT",
  },
  fingerprint: {
    outputCount: 4,
    spendCount: 4,
    outputPadded: true,
    feeZat: "20000",
    isZip317ConventionalFee: true,
    expiryDelta: 40,
    hasMemo: false,
    likelyWallet: "UNKNOWN_BUT_STANDARD",
  },
  findings: [
    { code: "VALUE_BALANCE_NONZERO", severity: "HIGH", message: "Tx crosses t↔z boundary: mixed transparent + shielded inputs and outputs", field: "valueBalance" },
    { code: "RECENT_ANCHOR", severity: "MEDIUM", message: "Orchard bundle anchor depth: 15 blocks — narrows note receive window to ~40min", field: "anchor" },
  ],
};

const transparent: RawReport = {
  ...makeBaseReport(SAMPLE_TXIDS[5]!, "FULLY_TRANSPARENT", "CRITICAL", 203),
  bundle: {
    saplingSpends: [],
    saplingOutputs: [],
    saplingValueBalanceZat: "0",
    orchardActions: [],
    orchardValueBalanceZat: "0",
    orchardAnchor: null,
    orchardFlags: null,
  },
  transparent: {
    vin: [
      { index: 0, coinbase: false, prevTxid: randomHex(32), prevVout: 0, address: T_ADDRESSES[4]!, sequence: 4294967295 },
    ],
    vout: [
      { index: 0, valueZat: "250000000", addresses: [T_ADDRESSES[5]!], scriptType: "pubkeyhash" },
      { index: 1, valueZat: "49980000", addresses: [T_ADDRESSES[4]!], scriptType: "pubkeyhash" },
    ],
  },
  identity: {
    sender: { transparentAddresses: [T_ADDRESSES[4]!], nullifiers: [], commitments: [] },
    recipient: { transparentAddresses: [T_ADDRESSES[5]!, T_ADDRESSES[4]!], nullifiers: [], commitments: [] },
  },
  spends: [],
  outputs: [],
  valueFlow: {
    saplingValueBalanceZat: "0",
    orchardValueBalanceZat: "0",
    netTransparentInflowZat: "300000000",
    isPureShielded: false,
    crossesPoolBoundary: false,
    direction: "NONE",
  },
  fingerprint: {
    outputCount: 2,
    spendCount: 1,
    outputPadded: false,
    feeZat: "20000",
    isZip317ConventionalFee: false,
    expiryDelta: null,
    hasMemo: false,
    likelyWallet: "UNKNOWN_NONSTANDARD",
  },
  findings: [
    { code: "FULL_TRANSPARENT", severity: "CRITICAL", message: "Fully transparent tx — no shielded components. All amounts and addresses public." },
    { code: "FEE_OUTLIER", severity: "LOW", message: "Non-ZIP-317 fee — likely older wallet or custom transaction", field: "fingerprint" },
  ],
};

export const MOCK_REPORTS: RawReport[] = [
  pureShielded,
  tToZ,
  zToT,
  migration,
  mixed,
  transparent,
];

export const MOCK_TIP_HEIGHT = 2_840_522;

/**
 * Per-pool state snapshot, illustrative historical-scale values.
 * Sapling: ~8M commitments since activation Oct 2018, ~1.9M anchors
 * (≈ blocks since activation), ~6.2M nullifiers (≈ accumulated spends).
 * Orchard: ~328k commitments since NU5 May 2022, ~1.4M anchors, ~94k nullifiers.
 * Both pools' latest anchor is 10 blocks behind the chain tip — typical
 * mempool-vs-tip lag.
 */
export const MOCK_POOL_SNAPSHOT: {
  sapling: PoolStateSummary;
  orchard: PoolStateSummary;
} = {
  sapling: {
    pool: "sapling",
    commitmentCount: 8_403_217n,
    anchorCount: 1_924_508,
    nullifierCount: 6_187_442,
    lastAnchorHeightCreated: 2_840_512,
    balanceZat: 0n,
  },
  orchard: {
    pool: "orchard",
    commitmentCount: 327_891n,
    anchorCount: 1_412_086,
    nullifierCount: 94_173,
    lastAnchorHeightCreated: 2_840_512,
    balanceZat: 0n,
  },
};
