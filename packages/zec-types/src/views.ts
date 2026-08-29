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
import type { ShieldedPool } from "./shielded.js";

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
 * THE SAME FOUR AS `Pool` IN analysis.ts SINCE HANDOFF-06. This docblock used
 * to say the two unions differed - that `Pool` was "still the v0.2 pair" and
 * that HANDOFF-06 owned the widening. That handoff has landed and the two now
 * agree member for member, so this schema is the zod MIRROR of the union rather
 * than a display-layer parallel to it.
 *
 * They stay two declarations because a zod enum is a runtime value and
 * `ShieldedPool` is a type, and neither can be derived from the other without
 * losing what makes it useful. What keeps them in step is the assertion below,
 * which is a compile-time check rather than a test: a test can be skipped, and
 * this one would have to be remembered by whoever adds a fifth pool, which is
 * exactly the person who will not be thinking about it.
 */
export const poolNameSchema = z.enum(["sprout", "sapling", "orchard", "ironwood"]);
export type PoolName = z.infer<typeof poolNameSchema>;

/**
 * `PoolName` and `ShieldedPool` are the same union, enforced by the compiler.
 *
 * Assignability is checked in BOTH directions on purpose. One direction alone
 * passes when one union is a strict subset of the other, which is precisely the
 * state this project was in before HANDOFF-06 - `PoolName` had four members and
 * `Pool` had two - and is the state a half-finished widening would leave it in
 * again. Adding a member to either declaration without the other now fails
 * `tsc`, naming this line.
 */
type Expect<T extends true> = T;
type Covers<A, B> = [A] extends [B] ? true : false;

/** Every `PoolName` is a `ShieldedPool`. Fails `tsc` here if a member is added to only one. */
export type PoolNameIsShieldedPool = Expect<Covers<PoolName, ShieldedPool>>;
/** Every `ShieldedPool` is a `PoolName`. The other direction, which a subset would pass. */
export type ShieldedPoolIsPoolName = Expect<Covers<ShieldedPool, PoolName>>;

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
  /**
   * TRACKING-MATH section 3.4's amount echo. Added in HANDOFF-08 with the
   * estimator that emits it, and it had to be: `auditRecordToEstimateFilter` at
   * the foot of this file assigns a `FilterApplication`'s `filter` into this
   * enum, so widening the union without widening this fails `tsc`. That is the
   * compile-time proof this file already carried, doing its job.
   *
   * `subset_sum` below is NOT what a split echo emits. A subset-sum match is one
   * of section 3.4's four tolerances of the SAME estimator, so it carries
   * `amount_echo` with `params.matchKind: "SUBSET_SUM"`; splitting it out would
   * put one estimator under two step names in the inference chain.
   */
  "amount_echo",
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
  /**
   * Whether that event moved value ACROSS A POOL BOUNDARY.
   *
   * A field rather than an inference, because the balance chart marks the
   * crossings in gold and gold's third licensed job is exactly this. A gate
   * round found the chart keying the colour off whether the balance went up,
   * which painted the NU6.1 activation coinbase - protocol issuance, crossing
   * nothing - in the accent, and left a genuine crossing in a pool hue.
   */
  crossing: z.boolean(),
});
export type BalancePoint = z.infer<typeof balancePointSchema>;

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
  /**
   * P2PKH, P2SH or TEX. THERE IS NO SHIELDED MEMBER, and that is assertion A5
   * expressed in the type rather than in care.
   *
   * `balanceZat` below is required and not nullable, so any `AddressView` is
   * obliged to carry a numeric balance and `/address` renders one for every
   * view it is given. If `shielded` were an accepted script, a gateway
   * returning `{script: "shielded", balanceZat: "..."}` would validate cleanly
   * at the HANDOFF-11 cutover and the address page would render a balance tile
   * for a shielded address. Dropping the member makes that unrepresentable:
   * such a response now fails `addressViewSchema` at the boundary and the page
   * renders the stated gap instead.
   *
   * A gate round caught the earlier form, where the enum admitted `shielded`
   * while /reveal's docblock claimed no such view could exist.
   */
  script: z.enum(["p2pkh", "p2sh", "tex"]),
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
  /** See `mempoolRowSchema.version`: `unknown` rather than a clamp. */
  version: z.enum(["v4", "v5", "v6", "unknown"]),
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
  /**
   * The fee, or `null` when it could not be computed. THE CONTRACT NOTE FOR
   * BOTH VIEWS THAT CARRY A FEE - `mempoolRowSchema.feeZat` points here.
   *
   * NULLABLE SINCE HANDOFF-06 BECAUSE THE FEE IS NOT ON THE WIRE. No node sends
   * one - the fee is the difference between the outputs a transaction spends
   * and what it pays out, and the spent outputs are not in the response - so it
   * is computed by resolving them, and that computation can fail: an unsynced
   * node, a parent still propagating, a v6 bundle this build cannot decode.
   *
   * A NON-NULLABLE FIELD FORCED THE PRODUCER TO INVENT A NUMBER, and it did:
   * every transaction this project ever analysed was recorded as paying `0n`.
   * A renderer must therefore print an absence here rather than a zero - "not
   * priced", not "0 zat" - because ZIP 317's conventional fee has a floor of
   * 10,000 zatoshi and a transaction that truly paid nothing would be
   * remarkable rather than routine.
   */
  feeZat: zatSchema.nullable(),
  logicalActions: countSchema,
  /** `null` when the fee is unknown: unknown is not the same claim as false. */
  conventionalFee: z.boolean().nullable(),
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
      /** See `mempoolRowSchema.version`: `unknown` rather than a clamp. */
      version: z.enum(["v4", "v5", "v6", "unknown"]),
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
  /**
   * Pool context for a shielded address that has no answer of its own.
   *
   * Deliberately COUNTS and never a value. `/reveal`'s Mode B pane is the one
   * surface that renders something beside a shielded address, and assertion A5
   * requires that pane to contain no ZEC amount at all - so what it is given is
   * the size of the commitment tree and the median claim level of a spend in
   * it, both of which are properties of the POOL and would read identically for
   * every other shielded address on the chain. That is what makes them
   * publishable, and what makes them not an answer about the address in the
   * URL.
   */
  context: z.object({
    pool: poolNameSchema,
    /**
     * The commitment tree's size, AT THE PRECISION THE CORPUS STATES IT.
     *
     * Text rather than a count, because the only sourced figure is the
     * mockup's "3.13M" - three significant figures - and a `number` here
     * invites four more digits that nothing supports. Text also lets the pane
     * write the rounding out in a form that carries no decimal point, which
     * A5's amount detector reads as the shape of a ZEC figure. A gate round caught exactly that: the first draft
     * carried 3,129,287, which is the Ironwood pool's ZEC BALANCE reused as a
     * note count - two unrelated quantities that happened to be typed once.
     */
    noteCountText: z.string().min(1),
    /** Median N_eff for a spend in this pool now. */
    medianNEff: countSchema,
    /**
     * The claim level for `medianNEff`, and never a word written by hand.
     * `/reveal` renders this through the same lookup the estimate chips use,
     * so the pane cannot drift from `claimLevelFor` the way it once did.
     */
    claim: claimLevelSchema,
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
  /**
   * The transaction version as the table prints it.
   *
   * `"unknown"` IS NEW IN HANDOFF-07 AND IT IS THE ONLY HONEST ANSWER FOR A ROW
   * THE DECODER REFUSED. The three-member enum forced the producer to name a
   * version for every transaction, and the producer obliged with a clamp -
   * `>= 6 ? "v6" : === 5 ? "v5" : "v4"` - so a version-7 transaction was
   * published as `v6` in the cell two columns left of its own finding,
   * "transaction version 7 is outside the range this decoder models (1 to 6)".
   * A gate round reproduced it at both ends: version 7 printed `v6`, version 0
   * printed `v4`.
   *
   * The clamp is false about real transactions as well as refused ones. Zcash
   * shipped v1, v2 and v3 before Overwinter, and every one of them printed
   * `v4` here - a version this site states as fact beside a txid a reader can
   * look up. `versionText` now answers `unknown` outside 4-6 rather than
   * rounding into the nearest member, which is the same rule the `undecoded`
   * class states one field over: an absence is not a value.
   */
  version: z.enum(["v4", "v5", "v6", "unknown"]),
  /** "t to z", "z to t", "O to I", "mixed" - the flow as the table prints it. */
  flow: z.string().min(1),
  /**
   * The lanes this transaction touched.
   *
   * EMPTY IS LEGAL SINCE HANDOFF-07 AND MEANS "NO LANE CAN BE CLAIMED". It was
   * `.min(1)`, which sounds harmless and forced the producer to name a lane for
   * every transaction including ones it had not decoded - so an `UNSUPPORTED_TX`
   * report, whose bundles were never examined, fell through the producer's
   * `if (lanes.length === 0) lanes.push("transparent")` and was drawn with a
   * transparent swatch. A missing lane is a strong claim in this UI ("the
   * transaction did not touch that pool") and a transparent swatch on an
   * undecodable transaction is a stronger one, so the schema has to be able to
   * express the third state: nothing is claimed.
   */
  lanes: z.array(ledgerSchema),
  valueBalanceText: z.string().min(1),
  /**
   * The fee, or `null` when it could not be computed.
   *
   * THE REASONING IS ON `txViewSchema.feeZat` ABOVE AND IS NOT REPEATED HERE.
   * It was, word for word, in both places - and two copies of one contract are
   * how the two come to disagree, which on this field would mean /tx and
   * /track telling a reader different things about the same absent fee. The
   * rule a renderer needs, in one line: print an absence, never a zero.
   */
  feeZat: zatSchema.nullable(),
  /**
   * ZIP 317's logical action count, or `null` when nothing counted them.
   *
   * NULLABLE SINCE HANDOFF-07, FOR THE REASON `feeZat` ABOVE IS. The producer's
   * unsupported branch had to supply a number and supplied `0`, which the panel
   * renders as "not priced - L = 0" - a stated measurement of zero logical
   * actions for a transaction nobody decoded. No transaction has L = 0: ZIP
   * 317's own floor is `max(2, L)`, so zero is not merely unlikely here, it is
   * outside the quantity's range. The row that says "not decoded" in four other
   * cells must be able to say it in this one.
   */
  logicalActions: countSchema.nullable(),
  walletGuess: z.string().min(1),
  finding: z.string().min(1),
  severity: severitySchema,
  /**
   * What the row says this transaction is.
   *
   * `undecoded` IS NEW IN HANDOFF-07 AND IT IS NOT A KIND OF FLOW. It is the
   * row's way of saying the decoder declined to read the transaction's shape,
   * which the other five members cannot express: every one of them asserts
   * something about where value went, and the producer recomputes them from a
   * value flow that an `UNSUPPORTED_TX` report leaves empty. Without this
   * member such a transaction was published as `transparent` / `t to t` /
   * "no net crossing" / "Nothing this transaction publishes distinguishes it
   * from any other of its shape" - four statements, all false, about a
   * transaction nobody could decode.
   *
   * `mixed` IS NEW IN HANDOFF-08 AND IT IS THE MEMBER THE ENUM WAS MISSING.
   * A transfer between two shielded pools that ALSO pays a transparent address
   * is none of the other six: it is not a `migration`, because a public
   * recipient stands in it and the gateway stopped calling it one; and
   * `shield`/`deshield` name a direction of transparent flow it has on one end
   * only. It fell to the residual `shielded` while `analyze()` answered `MIXED`,
   * so /tx and /track said different things about one transaction - the
   * divergence assertion A9 forbids. HANDOFF-07 declined to widen the enum
   * unreviewed and asked (LEDGER-07 Q2); L2 ruled for the member and for the
   * consumer sweep being the deliverable rather than the member.
   *
   * THE SWEEP IS WHY THIS DOCBLOCK IS LONG. Widening a type produced the defect
   * in each of the last four sessions, and never at the declaration - always in
   * a consumer nobody enumerated. The consumers of this enum that a compiler
   * CANNOT catch: `summary.shielded` and `summary.decodedCount` below (positive
   * and negative filters that would leave `mixed` in a denominator and no
   * numerator), the gateway's flow-label chain (whose trailing `: "t to t"`
   * would print a transparent flow beside two pool lanes),
   * `apps/web/src/lib/api/stream.ts`'s hand-copied `CLASSES` set (which would
   * reject the row, and `asView` then returns null for the WHOLE snapshot - one
   * `mixed` transaction would empty /track), and `mempool-summary.ts`'s tile and
   * header. All were swept in the same commit; the fixture corpus gained a
   * `mixed` row so the partition assertions actually exercise it.
   */
  class: z.enum([
    "shield",
    "deshield",
    "shielded",
    "mixed",
    "migration",
    "transparent",
    "undecoded",
  ]),
  reasoning: z.array(z.string().min(1)).min(1),
});
export type MempoolRow = z.infer<typeof mempoolRowSchema>;

export const mempoolViewSchema = z.object({
  tipHeight: heightSchema,
  entries: z.array(mempoolRowSchema),
  summary: z.object({
    unconfirmed: countSchema,
    /**
     * How many transactions touched a shielded pool without being a migration:
     * `shield`, `deshield`, `shielded` and - since HANDOFF-08 - `mixed`.
     *
     * `mixed` JOINS THE NUMERATOR FOR THE SAME REASON `shield` DID. It moved
     * value between shielded pools; counting it out leaves it in no bucket at
     * all, while `decodedCount` below still counts it in the denominator, so the
     * four figures /track prints beside each other would account for less than
     * the mempool without saying so. That is the arbitration below, applied to
     * the new member rather than re-litigated.
     *
     * WRITTEN DOWN BECAUSE THE TWO PRODUCERS OF THIS FIELD DISAGREED ABOUT IT,
     * exactly as `conventionalFeeZat` below records for its own field. The
     * gateway counted the residual class `shielded` alone and the fixture
     * counted all three, so on thirteen rows one said 3 and the other said 7 -
     * and /track renders whichever `NEXT_PUBLIC_DATA_MODE` selects, under the
     * same header string and the same headline tile. A `shield` transaction
     * moved value INTO a shielded pool; counting it out of this number leaves
     * it in no bucket at all.
     */
    shielded: countSchema,
    migrations: countSchema,
    transparent: countSchema,
    /**
     * How many transactions the decoder actually read - the denominator any
     * share of the mempool is out of.
     *
     * NOT `unconfirmed`, for the reason `pricedCount` below is not `unconfirmed`
     * either. An `undecoded` row is a transaction whose shape this build
     * declined to read, so it is evidence of nothing; dividing by a total that
     * includes it turns it into evidence AGAINST whatever is being measured.
     * /track's shielded-share tile printed "8 of 13" while an undecoded row was
     * miscounted INTO the numerator and "7 of 13" once it was taken out - four
     * points of one statistic, manufactured twice from a single unreadable
     * transaction, in opposite directions. The honest figure is out of the
     * twelve anyone could read.
     */
    decodedCount: countSchema,
    bytes: countSchema,
    nextBlockSeconds: countSchema,
    /** Value crossing a boundary in the current mempool, split by direction. */
    crossingZat: zatSchema,
    crossingSplit: z.string().min(1),
    /**
     * ZIP 317's CONVENTIONAL FEE ITSELF, at the grace minimum of two logical
     * actions - not a total of the fees anyone paid.
     *
     * Stated because two producers of this view disagreed about it and nothing
     * here said which was right: the fixture emitted 10,000 and the gateway
     * emitted the sum of the fees of the conventional-paying transactions,
     * while /track printed whichever arrived under the subtitle "zat - ZIP 317
     * at 2 logical actions". The count beside it is the quantity that varies.
     */
    conventionalFeeZat: zatSchema,
    /**
     * How many transactions could be PRICED at all - the denominator
     * `conventionalCount` is out of.
     *
     * NOT `unconfirmed`. The fee is not on the wire and the gateway computes
     * it, and that computation can fail, so a mempool of twelve transactions
     * may have three with a known fee. `conventionalCount` counts within those
     * three. Rendering "3 of 12 conventional" would be a claim about nine
     * transactions nobody priced - the same shape of statement that made
     * `feeZat: 0n` a lie, moved into a denominator.
     */
    pricedCount: countSchema,
    /** How many of `pricedCount` pay the conventional fee for their own action count. */
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
