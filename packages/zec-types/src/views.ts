/**
 * View DTOs — the wire shapes the Tracking suite renders.
 *
 * HANDOFF-04 section 3: "DTOs live in `packages/zec-types` as Zod schemas +
 * inferred types; `apps/web` never defines its own wire types." Everything the
 * tracking UI displays is described here, once, and both ends of the eventual
 * HTTP boundary read the same definition — `FixtureApi` builds these objects
 * today and HANDOFF-05's gateway serialises them tomorrow. The schemas are not
 * decoration: `HttpApi` parses every response through them, so a gateway that
 * drifts from this file fails at the boundary rather than three components
 * later.
 *
 * WHY ZOD HERE AND TYPES EVERYWHERE ELSE. The rest of this package is
 * type-only, because it describes what the decoder has already validated
 * against consensus rules. These types describe what arrives over a network,
 * which is a different trust problem. `Hex` is branded and validated at the RPC
 * boundary (CLAUDE.md); these schemas are the same discipline at the HTTP
 * boundary.
 *
 * CONVENTIONS, all from CLAUDE.md and enforced below rather than trusted:
 *   - `bigint` for zatoshi, never a float. `zatSchema` accepts a bigint or a
 *     decimal-integer STRING (what JSON can carry) and rejects anything with a
 *     decimal point, so a zatoshi cannot arrive having been through a double.
 *   - `number` for heights and counts.
 *   - lowercase hex, no `0x`.
 *   - every estimate carries its audit trail and its claim level; nothing here
 *     can express an identity claim, because no view has a field for one.
 *   - every rendered date prints its own text (LEDGER-02 Q3, LEDGER-03 fold 2).
 *     `Stamp` is what makes that structural: `text` renders, `sortMs` sorts,
 *     and a `precision` coarser than `day` has no day to render.
 */
import { z } from "zod";

import type { FilterApplication } from "./analysis.js";

/* ============================================================================
   Primitives
   ========================================================================== */

/** Lowercase hex, no `0x`, even length. Not branded: branding is the decoder's job. */
export const hexSchema = z.string().regex(/^[0-9a-f]*$/, "hex is lowercase and carries no 0x prefix");

/** A transaction id: 64 lowercase hex characters. */
export const txidSchema = z.string().regex(/^[0-9a-f]{64}$/, "txids are 64 lowercase hex characters");

/** A block hash: 64 lowercase hex characters. The mockup's literal is 65 and is wrong. */
export const blockHashSchema = txidSchema;

/**
 * Zatoshi. A bigint, or the decimal-integer string JSON has to use to carry
 * one. A value with a decimal point is rejected rather than rounded: the whole
 * reason this project counts in zatoshi is that 50,000.5541 ZEC does not
 * survive a double.
 */
export const zatSchema = z
  .union([z.bigint(), z.string().regex(/^-?\d+$/, "a zatoshi amount is an integer, not a decimal")])
  .transform((v) => (typeof v === "bigint" ? v : BigInt(v)));

/** A block height. A count, so `number`. */
export const heightSchema = z.number().int().nonnegative();

/** A count of anything. */
export const countSchema = z.number().int().nonnegative();

/**
 * The four shielded pools, per CLAUDE.md.
 *
 * NOT the same union as `Pool` in analysis.ts, which is still the v0.2 pair
 * (`sapling | orchard`) because widening it breaks the indexer's exhaustive
 * state machines - HANDOFF-06 owns that widening and its migration 003. Until
 * it lands the two coexist, and this is the one the display layer uses.
 * Recorded in the section 8 ledger.
 */
export const poolNameSchema = z.enum(["sprout", "sapling", "orchard", "ironwood"]);
export type PoolName = z.infer<typeof poolNameSchema>;

/**
 * The five lanes the site draws value moving between. Transparent is not a
 * pool - it is the absence of one - but it is a lane on every Sankey and every
 * balance table, so it needs a name that is not "pool".
 */
export const ledgerSchema = z.enum(["transparent", "sprout", "sapling", "orchard", "ironwood"]);
export type LedgerLane = z.infer<typeof ledgerSchema>;

/** Claim level, by the v0.2 N_eff thresholds. Mirrors `ClaimLevel` in analysis.ts. */
export const claimLevelSchema = z.enum([
  "aggregate_only",
  "broad_candidate_set",
  "small_heuristic_set",
  "requires_disclosure",
]);

/**
 * How strong a round-trip link is, per TRACKING-MATH section 3.4.
 *   HIGH   - exact amount, single candidate
 *   MEDIUM - relative <= epsilon or within fee tolerance, single candidate
 *   LOW    - multiple candidates, or relative <= 10 epsilon, or a split match
 */
export const linkGradeSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type LinkGrade = z.infer<typeof linkGradeSchema>;

/**
 * What kind of answer a number is. The whole site turns on this distinction and
 * every figure the tracking UI renders carries one.
 *   exact     - the chain says so
 *   bounded   - an estimate, with its assumptions printed beside it
 *   undefined - not an on-chain object at all (a shielded address's balance)
 */
export const exactnessSchema = z.enum(["exact", "bounded", "undefined"]);
export type Exactness = z.infer<typeof exactnessSchema>;

/** Severity, as the mempool table and the leak classifier use it. */
export const severitySchema = z.enum(["INFO", "LOW", "MED", "HIGH"]);

/** Confidence on a stated reason. */
export const confidenceSchema = z.enum(["high", "med", "low"]);

/**
 * Who applied a label, in precedence order. Mirrors `labellerSchema` in
 * packages/content, and `LABELLER_RANK` below is the precedence CLAUDE.md
 * requires to be displayed with every label.
 */
export const labellerSchema = z.enum(["consensus", "owner-filing", "exchange", "analyst", "behaviour"]);
export type Labeller = z.infer<typeof labellerSchema>;

/** Lower is stronger. Rendered beside every label; never inferred from the text. */
export const LABELLER_RANK: Readonly<Record<Labeller, number>> = {
  consensus: 1,
  "owner-filing": 2,
  exchange: 3,
  analyst: 4,
  behaviour: 5,
};

/**
 * A rendered date.
 *
 * `text` is what a reader sees, always, verbatim - LEDGER-02 Q3 established
 * that for the timeline and LEDGER-03 fold 2 binds it here. `sortMs` exists
 * only to order rows and is never formatted for display. `precision` says how
 * much of the timestamp is real, so a record known only to the month cannot
 * render a day: the site's entire argument is about not fabricating precision,
 * and a date is the easiest place to fabricate it by accident.
 */
export const stampSchema = z.object({
  text: z.string().min(1),
  precision: z.enum(["second", "minute", "day", "month", "year"]),
  sortMs: z.number().int(),
});
export type Stamp = z.infer<typeof stampSchema>;

/* ============================================================================
   The estimate and its audit trail
   ========================================================================== */

/**
 * The estimators, by the names TRACKING-MATH section 3 gives them. The first
 * two are the v0.2 filters that already ship in `FilterApplication`; the rest
 * are section 3's remaining toolkit. A UI that renders an unknown filter name
 * would be rendering an estimator nobody wrote down, so the set is closed.
 */
export const filterNameSchema = z.enum([
  "anchor_bound",
  "spent_count",
  "time_window",
  "amount_match",
  "subset_sum",
  "fee_actions",
  "fingerprint",
  "anchor_recency",
  "pool_payout",
  "migration_lens",
  "conservation",
]);
export type FilterName = z.infer<typeof filterNameSchema>;

/**
 * One filter's audit record: the v0.2 `FilterApplication` contract kept
 * verbatim (`filter`, `params`, `countIn`, `countOut`) so the inference chain
 * renders it unchanged, widened in exactly two ways.
 *
 * First, `filter` spans TRACKING-MATH's whole toolkit rather than the two
 * filters v0.2 shipped. Second, `params` is a flat bag of printable scalars
 * rather than a per-variant typed shape, because the UI's only use for it is to
 * print the assumption beside the number, and a closed per-variant union here
 * would have to be re-widened by every handoff that adds an estimator.
 *
 * `label` is the estimator's own words for what it did, rendered as the step's
 * caption. It is required: a step of an inference chain that cannot say what it
 * removed is not an audit record.
 *
 * A v0.2 `FilterApplication` satisfies this shape as-is - see
 * `assertAuditRecordIsEstimateFilter` at the foot of this file, which is a
 * compile-time check, not a comment.
 */
export const estimateFilterSchema = z.object({
  filter: filterNameSchema,
  label: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  countIn: zatSchema,
  countOut: zatSchema,
});
export type EstimateFilter = z.infer<typeof estimateFilterSchema>;

/** One candidate origin and its posterior weight. Never an address, never a name. */
export const candidateSchema = z.object({
  /** What the candidate IS - a shield event, by its public txid. */
  txid: txidSchema.nullable(),
  /** The reader-facing description of the candidate. */
  what: z.string().min(1),
  /** Posterior probability, normalised across the candidate set. */
  p: z.number().min(0).max(1),
});
export type Candidate = z.infer<typeof candidateSchema>;

/**
 * A bounded claim about a shielded-side origin or destination.
 *
 * `candidates` is the count remaining after every filter - the number the claim
 * level is computed from - and `top` is the handful the UI prints with their
 * weights. `assumptions` is not optional and not allowed to be empty: an
 * estimate whose assumptions are not printed is exactly the thing this site
 * exists to argue against, and the schema is where that stops being a habit and
 * starts being a constraint.
 */
export const estimateSchema = z.object({
  candidates: zatSchema,
  top: z.array(candidateSchema).default([]),
  filters: z.array(estimateFilterSchema).min(1, "an estimate renders its audit trail or it is not an estimate"),
  nEff: z.number().nonnegative(),
  entropyBits: z.number().nonnegative(),
  claim: claimLevelSchema,
  grade: linkGradeSchema.nullable(),
  assumptions: z.array(z.string().min(1)).min(1, "an estimate prints its assumptions"),
});
export type Estimate = z.infer<typeof estimateSchema>;

/**
 * The v0.2 thresholds, in one place. `/method` renders the ladder from the same
 * union this returns rather than restating it (LEDGER-03 fold 1).
 *
 *   N_eff > 1000        aggregate_only
 *   100 < N_eff <= 1000 broad_candidate_set
 *   10  < N_eff <= 100  small_heuristic_set
 *   N_eff <= 10         requires_disclosure
 */
export function claimLevelFor(nEff: number): z.infer<typeof claimLevelSchema> {
  if (nEff > 1000) return "aggregate_only";
  if (nEff > 100) return "broad_candidate_set";
  if (nEff > 10) return "small_heuristic_set";
  return "requires_disclosure";
}

/* ============================================================================
   Labels and cases - the Record's two seeds, as the Instrument reads them
   ========================================================================== */

/**
 * An address label with its provenance. `labeller` and `rank` are both present
 * and both rendered: CLAUDE.md requires the precedence to be displayed, and a
 * label whose labeller is not printed beside it is an identity claim.
 */
export const labelViewSchema = z.object({
  address: z.string().min(1),
  network: z.enum(["mainnet", "testnet"]),
  label: z.string().min(1),
  labeller: labellerSchema,
  rank: z.number().int().min(1).max(5),
  method: z.string().min(1),
  confidence: confidenceSchema,
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.string().min(1)),
  balanceZat: zatSchema.nullable(),
  notes: z.string().min(1).optional(),
});
export type LabelView = z.infer<typeof labelViewSchema>;

/** One documented movement inside a case. Amount is a signed zatoshi. */
export const caseStepViewSchema = z.object({
  stamp: stampSchema,
  height: heightSchema.nullable(),
  from: z.string().min(1),
  to: z.string().min(1),
  amountZat: zatSchema,
  note: z.string().min(1),
  txid: txidSchema.nullable(),
});
export type CaseStepView = z.infer<typeof caseStepViewSchema>;

/** A golden case, as the Instrument renders it. Mirrors `Case` in packages/content. */
export const caseViewSchema = z.object({
  id: z.string().regex(/^K-[a-z0-9-]+$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  steps: z.array(caseStepViewSchema).min(1),
  verdict: z.string().min(1),
  confidence: confidenceSchema,
  sources: z.array(z.string().min(1)),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CaseView = z.infer<typeof caseViewSchema>;

/* ============================================================================
   Address
   ========================================================================== */

/** What a query string turned out to be. The Instrument routes on this. */
export const searchKindSchema = z.enum(["transparent", "shielded", "viewing-key", "txid", "height", "unknown"]);
export type SearchKind = z.infer<typeof searchKindSchema>;

/** The direction of a transaction as seen from one address. */
export const directionSchema = z.enum(["t-to-z", "z-to-t", "t-to-t", "coinbase", "migration"]);
export type Direction = z.infer<typeof directionSchema>;

/** One row of an address's history. */
export const addressTxSchema = z.object({
  txid: txidSchema,
  height: heightSchema,
  stamp: stampSchema,
  direction: directionSchema,
  /** The direction as the table prints it, e.g. "t to z - partial". */
  directionText: z.string().min(1),
  /**
   * Signed net movement for this address: negative leaves it. This is what the
   * amount column prints.
   */
  amountZat: zatSchema,
  /**
   * Gross value paid TO this address by this transaction, and gross value spent
   * FROM it. Both non-negative, and `amountZat` is their difference.
   *
   * A single transaction can be both: the lockbox's April spend puts 129.8202
   * ZEC into the pool by spending a 7,438.2295 UTXO and taking 7,308.4093 back
   * as change. An explorer's "received" and "sent" totals are sums of these
   * gross legs, not of the net movement, which is why they are separate fields
   * rather than a sign convention - deriving `received` from `amountZat` alone
   * understates it by every change output the address ever took.
   */
  creditZat: zatSchema,
  debitZat: zatSchema,
  /** An aside the amount needs, e.g. the change split. Optional. */
  amountNote: z.string().min(1).optional(),
  counterparty: z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
    /** Set when the counterparty is an address this site can link to. */
    address: z.string().min(1).nullable(),
  }),
  /** Present on boundary events only. A transparent-to-transparent row has nothing to estimate. */
  estimate: estimateSchema.nullable(),
  /** What the pool-side cell says when there is no estimate to make. */
  poolNote: z.string().min(1),
  exactness: exactnessSchema,
});
export type AddressTx = z.infer<typeof addressTxSchema>;

/** One step of the "why we can say what we say" panel. */
export const reasonStepSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  confidence: confidenceSchema.nullable(),
});
export type ReasonStep = z.infer<typeof reasonStepSchema>;

/** A point on the balance step chart. */
export const balancePointSchema = z.object({
  height: heightSchema,
  stamp: stampSchema,
  balanceZat: zatSchema,
  /** The event that moved it, or null for the opening and closing points. */
  event: z.string().min(1).nullable(),
});

/** One edge of the interaction graph. */
export const interactionSchema = z.object({
  kind: z.enum(["coinbase", "pool", "transparent"]),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1),
  valueZat: zatSchema,
});

export const addressViewSchema = z.object({
  address: z.string().min(1),
  network: z.enum(["mainnet", "testnet"]),
  /** P2PKH, P2SH, TEX, or a shielded receiver that is not on chain at all. */
  script: z.enum(["p2pkh", "p2sh", "tex", "shielded"]),
  scriptText: z.string().min(1),
  label: labelViewSchema.nullable(),
  balanceZat: zatSchema,
  receivedZat: zatSchema,
  sentZat: zatSchema,
  /** Net value this address has put into shielded pools and not seen come back. */
  netToPoolZat: zatSchema,
  balanceNote: z.string().min(1),
  receivedNote: z.string().min(1),
  sentNote: z.string().min(1),
  netToPoolNote: z.string().min(1),
  balances: z.array(balancePointSchema).min(2),
  interactions: z.array(interactionSchema),
  interactionNote: z.string().min(1),
  transactions: z.array(addressTxSchema),
  reasoning: z.array(reasonStepSchema).min(1),
  /** The explorer note under the table, when one is warranted. */
  note: z.string().min(1).nullable(),
  exactness: exactnessSchema,
});
export type AddressView = z.infer<typeof addressViewSchema>;

/* ============================================================================
   Transaction
   ========================================================================== */

/** One line of a round-trip ledger. `amountZat` is null for the opaque interval. */
export const ledgerLineSchema = z.object({
  stamp: stampSchema,
  height: heightSchema.nullable(),
  description: z.string().min(1),
  amountZat: zatSchema.nullable(),
  /** True for the line that stands for time spent inside the pool. */
  shielded: z.boolean(),
  txid: txidSchema.nullable(),
});
export type LedgerLine = z.infer<typeof ledgerLineSchema>;

/** A per-pool public delta. Positive leaves the pool; negative enters it. */
export const poolDeltaSchema = z.object({
  pool: ledgerSchema,
  deltaZat: zatSchema,
});

export const txViewSchema = z.object({
  txid: txidSchema,
  version: z.enum(["v4", "v5", "v6"]),
  height: heightSchema,
  stamp: stampSchema,
  leakClass: z.string().min(1),
  severity: severitySchema,
  /** The one-line description under the txid. */
  summary: z.string().min(1),
  deltas: z.array(poolDeltaSchema),
  /** The four headline tiles, each already worded. */
  metrics: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        note: z.string().min(1),
        accent: z.boolean(),
      }),
    )
    .min(1),
  /** The "what this transaction publishes" panel, in order. */
  publishes: z.array(z.object({ k: z.string().min(1), v: z.string().min(1), muted: z.boolean() })).min(1),
  /** The inference chain. Every transaction that touches a pool has one. */
  estimate: estimateSchema.nullable(),
  /** The round trip, when this transaction is one leg of a documented one. */
  roundTrip: z.array(ledgerLineSchema),
  roundTripNote: z.string().min(1).nullable(),
  feeZat: zatSchema,
  logicalActions: countSchema,
  conventionalFee: z.boolean(),
});
export type TxView = z.infer<typeof txViewSchema>;

/* ============================================================================
   Block
   ========================================================================== */

export const blockViewSchema = z.object({
  height: heightSchema,
  hash: blockHashSchema,
  stamp: stampSchema,
  txCount: countSchema,
  sizeBytes: countSchema,
  deltas: z.array(poolDeltaSchema),
  /** Coinbase value and where ZIP 1014/1015/1016 sends it. */
  coinbase: z.object({
    totalZat: zatSchema,
    lines: z.array(z.object({ k: z.string().min(1), v: z.string().min(1), muted: z.boolean() })),
  }),
  transactions: z.array(
    z.object({
      txid: txidSchema,
      version: z.enum(["v4", "v5", "v6"]),
      flow: z.string().min(1),
      valueText: z.string().min(1),
      severity: severitySchema,
    }),
  ),
  note: z.string().min(1),
});
export type BlockView = z.infer<typeof blockViewSchema>;

/* ============================================================================
   Pools
   ========================================================================== */

export const poolBalanceSchema = z.object({
  pool: ledgerSchema,
  label: z.string().min(1),
  zat: zatSchema,
  /** Share of total supply, as a fraction in [0, 1]. */
  share: z.number().min(0).max(1),
  rule: z.string().min(1),
});

export const poolFlowSchema = z.object({
  from: ledgerSchema,
  to: ledgerSchema,
  zat: zatSchema,
});

export const poolHistoryPointSchema = z.object({
  /** Decimal year, matching lib/series.ts's convention for a long series. */
  t: z.number(),
  when: z.string().min(1),
  sprout: zatSchema,
  sapling: zatSchema,
  orchard: zatSchema,
  ironwood: zatSchema,
});

export const poolsViewSchema = z.object({
  atHeight: heightSchema,
  source: z.string().min(1),
  balances: z.array(poolBalanceSchema).length(5),
  flows: z.array(poolFlowSchema).min(1),
  flowWindow: z.string().min(1),
  flowTotalZat: zatSchema,
  flowNote: z.string().min(1),
  residual: z.object({
    zat: zatSchema,
    /** Fraction of supply that cannot be proven sound. */
    share: z.number().min(0).max(1),
    verifiedShare: z.number().min(0).max(1),
    note: z.string().min(1),
  }),
  history: z.array(poolHistoryPointSchema).min(2),
  /** The windows in which a pool's soundness rested on a broken proof system. */
  unsoundBands: z.array(z.object({ from: z.number(), to: z.number(), label: z.string().min(1) })),
  drain: z.object({
    startZat: zatSchema,
    nowZat: zatSchema,
    points: z.array(z.object({ i: z.number().int().nonnegative(), zat: zatSchema })).min(2),
    marks: z.array(z.object({ i: z.number().int().nonnegative(), text: z.string().min(1) })),
    note: z.string().min(1),
  }),
  denominations: z.object({
    rows: z.array(z.object({ label: z.string().min(1), count: countSchema })).min(1),
    crossings: countSchema,
    zat: zatSchema,
    strandedNote: z.string().min(1),
  }),
  neff: z.object({
    rows: z.array(z.object({ claim: claimLevelSchema, label: z.string().min(1), pct: z.number().min(0).max(100) })).min(1),
    note: z.string().min(1),
  }),
});
export type PoolsView = z.infer<typeof poolsViewSchema>;

/* ============================================================================
   Mempool
   ========================================================================== */

/**
 * One row of the mempool table.
 *
 * Named `MempoolRow` rather than `MempoolEntry` because transactions.ts already
 * exports a `MempoolEntry`, which is the RPC-side record (txid, seenAt, raw
 * transaction) - a different thing at a different layer, and the two must not
 * be confused by a reader or merged by a barrel export.
 */
export const mempoolRowSchema = z.object({
  txid: txidSchema,
  /** Seconds since the entry was first seen. A count, so `number`. */
  ageSeconds: countSchema,
  version: z.enum(["v4", "v5", "v6"]),
  /** "t to z", "z to t", "O to I", "mixed" - the flow as the table prints it. */
  flow: z.string().min(1),
  lanes: z.array(ledgerSchema).min(1),
  valueBalanceText: z.string().min(1),
  feeZat: zatSchema,
  logicalActions: countSchema,
  walletGuess: z.string().min(1),
  finding: z.string().min(1),
  severity: severitySchema,
  class: z.enum(["shield", "deshield", "shielded", "migration", "transparent"]),
  reasoning: z.array(z.string().min(1)).min(1),
});
export type MempoolRow = z.infer<typeof mempoolRowSchema>;

export const mempoolViewSchema = z.object({
  tipHeight: heightSchema,
  entries: z.array(mempoolRowSchema),
  summary: z.object({
    unconfirmed: countSchema,
    shielded: countSchema,
    migrations: countSchema,
    transparent: countSchema,
    bytes: countSchema,
    nextBlockSeconds: countSchema,
    /** Value crossing a boundary in the current mempool, split by direction. */
    crossingZat: zatSchema,
    crossingSplit: z.string().min(1),
    conventionalFeeZat: zatSchema,
    conventionalCount: countSchema,
    findingsHigh: countSchema,
    findingsNote: z.string().min(1),
    feeWeather: z.string().min(1),
  }),
});
export type MempoolView = z.infer<typeof mempoolViewSchema>;

/* ============================================================================
   Flows summary (the Tracking-side digest of the Record's /flows)
   ========================================================================== */

/**
 * The Tracking side of /flows: a summary, not a second copy.
 *
 * Deliverable 2 makes this "a summary linking to the Record `/flows`", and
 * there is deliberately no rich list here. The Record page holds those rows,
 * with their provenance and their unbound chip, and HANDOFF-03's own ledger
 * records what happens when one fact lives in two files - a correction lands in
 * one and the site then contradicts itself. So this view carries the case
 * ledger, the outcome, what is documented about institutions and what is not
 * supported, and everything else is a link.
 */
export const flowsViewSchema = z.object({
  headline: z.string().min(1),
  case: caseViewSchema,
  outcome: z.array(z.object({ k: z.string().min(1), v: z.string().min(1) })).min(1),
  institutions: z.array(z.object({ k: z.string().min(1), v: z.string().min(1) })).min(1),
  notSupported: z.string().min(1),
});
export type FlowsView = z.infer<typeof flowsViewSchema>;

/* ============================================================================
   Realtime frames
   ========================================================================== */

/**
 * What the mempool socket pushes. Deliberately a small closed union: the
 * fixture stream and HANDOFF-11's live socket emit the same frames, so the
 * client that consumes them never learns which one it is attached to.
 */
export const zecFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), tipHeight: heightSchema }),
  z.object({ type: z.literal("snapshot"), view: mempoolViewSchema }),
  z.object({ type: z.literal("tx_added"), entry: mempoolRowSchema }),
  z.object({ type: z.literal("tx_removed"), txid: txidSchema, reason: z.enum(["confirmed", "evicted", "replaced"]) }),
  z.object({ type: z.literal("tip"), height: heightSchema, hash: blockHashSchema }),
]);
export type ZecFrame = z.infer<typeof zecFrameSchema>;

/* ============================================================================
   The v0.2 audit record is an EstimateFilter
   ========================================================================== */

/**
 * A compile-time proof that widening `FilterApplication` did not fork it.
 *
 * TRACKING-MATH section 3 requires the v0.2 audit-record contract to be "kept
 * verbatim so the UI's inference chain renders it". This function is never
 * called; it exists so that a change to either shape which broke that promise
 * would fail `tsc` rather than pass review. It takes the v0.2 record's four
 * fields across unchanged and supplies the two the view adds.
 */
export function auditRecordToEstimateFilter(a: FilterApplication, label: string): EstimateFilter {
  const params: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(a.params)) {
    params[k] = typeof v === "bigint" ? v.toString() : (v as string | number | boolean);
  }
  return { filter: a.filter, label, params, countIn: a.countIn, countOut: a.countOut };
}
