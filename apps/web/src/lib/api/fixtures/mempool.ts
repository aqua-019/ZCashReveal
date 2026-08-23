/**
 * The mempool fixture: twelve unconfirmed transactions.
 *
 * Deliverable 6. The twelve rows are the mockup's, and the summary above them
 * is derived from those rows rather than transcribed beside them - which is
 * what turns up the one place the mockup's own arithmetic does not close.
 *
 * THE FEE COUNT. The mockup's summary says nine of twelve carry a conventional
 * fee. ZIP 317 makes a conventional fee 5,000 zatoshi times max(2, L), and by
 * that rule eleven of these twelve do: the only exception is the mining-pool
 * payout at 5,000 zatoshi with L = 1, where the floor of two logical actions
 * means the conventional fee is 10,000. The mockup separately labels the
 * 0b7c2d19 shield "unknown - nonstandard fee" while giving it 10,000 zatoshi at
 * L = 2, which is conventional exactly. The wallet guess there is kept - an
 * unrecognised fingerprint is a real observation - and the words "nonstandard
 * fee" are dropped, because they contradict the fee in the same row. The count
 * is computed from the rows, so it cannot drift from them again.
 *
 * WHAT THE REASONING PANEL IS FOR. Each row carries the reasoning for its
 * CLASS, not for its individual contents: a deshield gets the candidate-set
 * chain, a shield gets the exit watch, a migration gets the ZIP 318 note, a
 * transparent transaction gets the clustering note, and an intra-pool transfer
 * gets the shortest one on the site, because there is almost nothing to say
 * about it and saying more would be an invention.
 */
import type { MempoolRow, MempoolView } from "@zcashreveal/types";

import { zec } from "./units";

/** Reasoning per class. The same words every time, because it is the same reasoning every time. */
const REASONING: Readonly<Record<MempoolRow["class"], readonly string[]>> = {
  deshield: [
    "Cand_0 from the anchor; spent-count subtraction; time window W = 576 blocks.",
    "Amount echo against in-window shields: exact, relative at epsilon = 1e-4, fee-tolerant at 160,000 zatoshi, and subset sums up to k = 3.",
    "Posterior to N_eff to claim level. The sender stays unnamed by construction, whatever the claim level turns out to be.",
  ],
  shield: [
    "The transparent inputs are exact, and so is the amount entering the pool.",
    "An exit watch is armed: any deshield within W blocks whose amount matches is graded and attached to this transaction.",
  ],
  migration: [
    "ZIP 318: one Orchard note becomes one Ironwood output, the amount is public, and the denomination is canonical.",
    "Counted into the migration lens as a distribution. Never attributed to a wallet - a denomination is not a fingerprint.",
  ],
  transparent: [
    "Fully public. Common-input ownership and the change heuristic update the cluster graph, both with their weights.",
  ],
  shielded: [
    "Intra-pool. The public fields are nullifiers, commitments, anchor and fee. No amounts, no endpoints, and no estimate to make.",
  ],
};

interface Row {
  readonly txid: string;
  readonly ageSeconds: number;
  readonly version: "v4" | "v5" | "v6";
  readonly flow: string;
  readonly lanes: MempoolRow["lanes"];
  readonly valueBalanceText: string;
  readonly feeZat: bigint;
  readonly logicalActions: number;
  readonly walletGuess: string;
  readonly finding: string;
  readonly severity: MempoolRow["severity"];
  readonly cls: MempoolRow["class"];
  /** Signed ZEC crossing a boundary, for the summary. Empty for intra-pool and transparent. */
  readonly crossing?: { readonly kind: "t-to-z" | "z-to-t" | "o-to-i"; readonly zec: string };
}

const ROWS: readonly Row[] = [
  {
    txid: "c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
    ageSeconds: 12,
    version: "v6",
    flow: "O to I",
    lanes: ["orchard", "ironwood"],
    valueBalanceText: "+500.0000 Orchard - 499.9950 Ironwood",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "Zodl 3.8",
    finding: "migration - canonical 500 - anchor depth 3",
    severity: "MED",
    cls: "migration",
    crossing: { kind: "o-to-i", zec: "500.0" },
  },
  {
    txid: "a3f8c4211d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d67f3a1",
    ageSeconds: 31,
    version: "v6",
    flow: "z to z",
    lanes: ["ironwood"],
    valueBalanceText: "0 - intra-pool",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "Vizor",
    finding: "recent anchor - depth 1",
    severity: "LOW",
    cls: "shielded",
  },
  {
    txid: "7b4e2a91c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b34e5f6012",
    ageSeconds: 48,
    version: "v5",
    flow: "t to z",
    lanes: ["transparent", "ironwood"],
    valueBalanceText: "-311.2000 Ironwood",
    feeZat: 15_000n,
    logicalActions: 3,
    walletGuess: "Zkool",
    finding: "shield from t1Qw...rY - exit candidates 0",
    severity: "LOW",
    cls: "shield",
    crossing: { kind: "t-to-z", zec: "311.2" },
  },
  {
    txid: "1d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a26789ab0",
    ageSeconds: 64,
    version: "v5",
    flow: "z to t",
    lanes: ["sapling", "transparent"],
    valueBalanceText: "+12.4000 Sapling",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "Ywallet 1.15",
    finding: "amount echo - fee-tolerant - 4.5 h gap - N_eff 17",
    severity: "HIGH",
    cls: "deshield",
    crossing: { kind: "z-to-t", zec: "12.4" },
  },
  {
    txid: "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1bcdef00",
    ageSeconds: 130,
    version: "v6",
    flow: "mixed",
    lanes: ["transparent", "orchard", "ironwood"],
    valueBalanceText: "+2.8000 Orchard - 2.7950 Ironwood",
    feeZat: 20_000n,
    logicalActions: 4,
    walletGuess: "Cake 6.4",
    finding: "orchard exit and ironwood entry in one transaction",
    severity: "MED",
    cls: "migration",
  },
  {
    txid: "5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d34f5a6b1",
    ageSeconds: 182,
    version: "v4",
    flow: "t to t",
    lanes: ["transparent"],
    valueBalanceText: "no pool component",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "zcashd-style",
    finding: "common-input cluster 0x41 - change to a fresh address",
    severity: "INFO",
    cls: "transparent",
  },
  {
    txid: "ee0119443c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c3344b2",
    ageSeconds: 220,
    version: "v6",
    flow: "z to z",
    lanes: ["ironwood"],
    valueBalanceText: "0 - intra-pool",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "Zodl 3.8",
    finding: "none",
    severity: "INFO",
    cls: "shielded",
  },
  {
    txid: "0b7c2d19e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e490aa14",
    ageSeconds: 252,
    version: "v5",
    flow: "t to z",
    lanes: ["transparent", "sapling"],
    valueBalanceText: "-200.0000 Sapling",
    feeZat: 10_000n,
    logicalActions: 2,
    // The mockup reads "unknown - nonstandard fee". The fee in this row is
    // 10,000 zatoshi at L = 2, which is ZIP 317 conventional exactly, so the
    // second half of that guess contradicts the row it is written on. The
    // unrecognised fingerprint stays; the claim about the fee goes.
    walletGuess: "unrecognised fingerprint",
    finding: "round amount - exit watch armed",
    severity: "LOW",
    cls: "shield",
    crossing: { kind: "t-to-z", zec: "200.0" },
  },
  {
    txid: "3e9af0c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7c77d0e",
    ageSeconds: 331,
    version: "v6",
    flow: "z to t",
    lanes: ["ironwood", "transparent"],
    valueBalanceText: "+2.8000 Ironwood",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "Zingo 2.0",
    finding: "echo candidates 3 - N_eff 2.4 - requires disclosure",
    severity: "HIGH",
    cls: "deshield",
    crossing: { kind: "z-to-t", zec: "2.8" },
  },
  {
    txid: "77d1e04bf3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f91c2b9f",
    ageSeconds: 365,
    version: "v4",
    flow: "t to t",
    lanes: ["transparent"],
    valueBalanceText: "no pool component",
    feeZat: 5_000n,
    logicalActions: 1,
    walletGuess: "mining-pool payout shape",
    finding: "fan-out across 214 outputs - periodic - pool-payout pattern",
    severity: "INFO",
    cls: "transparent",
  },
  {
    txid: "c0ffee12d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8deb0",
    ageSeconds: 468,
    version: "v6",
    flow: "z to z",
    lanes: ["ironwood"],
    valueBalanceText: "0 - intra-pool",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "Keystone",
    finding: "none",
    severity: "INFO",
    cls: "shielded",
  },
  {
    txid: "41ab9cd3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e855e6a7",
    ageSeconds: 500,
    version: "v4",
    flow: "t to t",
    lanes: ["transparent"],
    valueBalanceText: "no pool component",
    feeZat: 10_000n,
    logicalActions: 2,
    walletGuess: "exchange sweep shape",
    finding: "many-to-one into t1PKBiv7... - the hot wallet Lookonchain labels Binance",
    severity: "LOW",
    cls: "transparent",
  },
];

/** ZIP 317: the conventional fee is 5,000 zatoshi times max(2, L). */
export function conventionalFeeZat(logicalActions: number): bigint {
  return 5_000n * BigInt(Math.max(2, logicalActions));
}

const ENTRIES: readonly MempoolRow[] = ROWS.map((r) => ({
  txid: r.txid,
  ageSeconds: r.ageSeconds,
  version: r.version,
  flow: r.flow,
  lanes: r.lanes,
  valueBalanceText: r.valueBalanceText,
  feeZat: r.feeZat,
  logicalActions: r.logicalActions,
  walletGuess: r.walletGuess,
  finding: r.finding,
  severity: r.severity,
  class: r.cls,
  reasoning: [...REASONING[r.cls]],
}));

/* -------------------------------------------------------------------------- */
/* The summary, derived from the rows above                                   */
/* -------------------------------------------------------------------------- */

const migrations = ROWS.filter((r) => r.cls === "migration").length;
const transparent = ROWS.filter((r) => r.cls === "transparent").length;
/** Anything that touches a shielded pool and is not a migration. */
const shielded = ROWS.length - migrations - transparent;
const conventional = ROWS.filter((r) => r.feeZat === conventionalFeeZat(r.logicalActions)).length;
const findingsHigh = ROWS.filter((r) => r.severity === "HIGH").length;

const crossingBy = (kind: "t-to-z" | "z-to-t" | "o-to-i"): bigint =>
  ROWS.filter((r) => r.crossing?.kind === kind).reduce((a, r) => a + zec(r.crossing?.zec ?? "0"), 0n);

const tToZ = crossingBy("t-to-z");
const zToT = crossingBy("z-to-t");
const oToI = crossingBy("o-to-i");

const fmt = (zat: bigint): string => {
  const whole = zat / 100_000_000n;
  const frac = (zat % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return frac === "" ? whole.toString() : `${whole.toString()}.${frac}`;
};

export const MEMPOOL_VIEW: MempoolView = {
  tipHeight: 3_456_854,
  entries: [...ENTRIES],
  summary: {
    unconfirmed: ROWS.length,
    shielded,
    migrations,
    transparent,
    bytes: 38_100,
    nextBlockSeconds: 41,
    crossingZat: tToZ + zToT + oToI,
    crossingSplit: `t to z ${fmt(tToZ)} - z to t ${fmt(zToT)} - Orchard to Ironwood ${fmt(oToI)}`,
    conventionalFeeZat: 10_000n,
    conventionalCount: conventional,
    findingsHigh,
    findingsNote: "both of them amount echoes",
    feeWeather: "calm",
  },
};
