/**
 * Zod schemas for every claim type the Record renders.
 *
 * Two rules run through all of them, and both come from CLAUDE.md rather than
 * from any one page:
 *
 *   1. Every claim carries `sources[]` (at least one), a `confidence` from the
 *      dossier's own ladder, and a `lastVerified` date. A claim that cannot
 *      name a source is not publishable, so the schema refuses to parse it.
 *   2. Nothing here asserts identity from chain data. `AddressLabel` records
 *      who did the labelling and by what method, and the precedence order is
 *      part of the type, so a page can never render a label without also being
 *      able to render its provenance.
 *
 * Dates that the corpus states precisely are ISO (`YYYY-MM-DD`). Dates the
 * corpus states loosely ("Apr-Jun 2018", "pre-launch", "ongoing") stay verbatim
 * strings: inventing a day the research does not have would be fabrication, and
 * the whole package exists to make fabrication visible.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/** high = primary source or >= 2 independent secondaries; med = one reputable secondary; low = single weak source or inference. */
export const confidenceSchema = z.enum(["high", "med", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date the corpus states to the day. */
export const isoDateSchema = z.string().regex(ISO_DATE, "expected an ISO date, YYYY-MM-DD");

/** A date the corpus states loosely. Kept verbatim; never normalised into false precision. */
export const looseDateSchema = z.string().min(3).max(120);

/** Transparent Zcash address: t1 / t2 (testnet) / t3, then 33 base58 characters. */
const ADDRESS = /^t[123][1-9A-HJ-NP-Za-km-z]{33}$/;
export const addressSchema = z.string().regex(ADDRESS, "expected a transparent Zcash address");

/**
 * The five supply buckets the Record accounts for. This is deliberately NOT
 * `Pool` from @zcashreveal/types: that union is still the v0.2 pair and
 * HANDOFF-06 owns widening it. `transparent` is not a pool at all -- it is the
 * absence of one -- but supply accounting needs all five in one axis.
 */
export const supplyBucketSchema = z.enum(["transparent", "sprout", "sapling", "orchard", "ironwood"]);
export type SupplyBucket = z.infer<typeof supplyBucketSchema>;

/** An exact decimal ZEC amount, kept as a string so no rounding happens in transit. */
export const zecAmountSchema = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/, "expected a decimal ZEC amount");

/**
 * Zatoshi. JSON has no integer type wide enough, so the seed stores a digit
 * string and the schema widens it: everything downstream of `.parse()` holds a
 * bigint, which is what CLAUDE.md requires of every zatoshi value.
 */
export const zatoshiSchema = z
  .string()
  .regex(/^\d{1,20}$/, "expected an integer zatoshi count")
  .transform((digits) => BigInt(digits));

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

/** A reference to an entry in sources.json. Every one is resolved by the validator. */
export const sourceRefSchema = z.string().regex(/^S-[a-z0-9-]+$/, "expected a source id, S-<slug>");
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const sourceSchema = z
  .object({
    id: sourceRefSchema,
    title: z.string().min(1),
    url: z.string().url(),
    publisher: z.string().min(1),
    /** Publication date where the corpus gives one; null where it does not. */
    date: isoDateSchema.nullable(),
    /** The date the research pass fetched it. */
    accessed: isoDateSchema,
  })
  .strict();
export type Source = z.infer<typeof sourceSchema>;

/* -------------------------------------------------------------------------- */
/* The claim base                                                             */
/* -------------------------------------------------------------------------- */

const claimBase = {
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1).optional(),
  sources: z.array(sourceRefSchema).min(1, "every claim needs at least one source"),
  confidence: confidenceSchema,
  lastVerified: isoDateSchema,
  tags: z.array(z.string().min(1)),
};

export const claimSchema = z.object(claimBase).strict();
export type Claim = z.infer<typeof claimSchema>;

/* -------------------------------------------------------------------------- */
/* Beware -- the exploit ledger                                               */
/* -------------------------------------------------------------------------- */

/** Whether the flaw could be detected from the chain at all. Two of the fourteen cannot. */
export const detectableSchema = z.enum(["yes", "no", "partial", "n/a"]);
export const severitySchema = z.enum(["crit", "high", "mid"]);

export const bewareEntrySchema = z
  .object({
    ...claimBase,
    id: z.string().regex(/^B([1-9]|1[0-4])$/, "beware ids run B1..B14"),
    discovered: looseDateSchema,
    disclosed: looseDateSchema,
    fixed: looseDateSchema,
    discoverer: z.string().min(1),
    rootCause: z.string().min(1),
    detectable: detectableSchema,
    window: z.object({ from: looseDateSchema, to: looseDateSchema }).strict(),
    severity: severitySchema,
    /** CVE / GHSA identifiers where the entry has them. */
    cve: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type BewareEntry = z.infer<typeof bewareEntrySchema>;

/* -------------------------------------------------------------------------- */
/* Contradictions -- marketing against the chain                              */
/* -------------------------------------------------------------------------- */

export const contradictionSchema = z
  .object({
    ...claimBase,
    id: z.string().regex(/^C([1-9]|1[0-6])$/, "contradiction ids run C1..C16"),
    /** The marketing claim, as close to verbatim as the corpus records it. */
    claim: z.string().min(1),
    /** What the chain or the filings show instead. */
    reality: z.string().min(1),
  })
  .strict();
export type Contradiction = z.infer<typeof contradictionSchema>;

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export const timelineCategorySchema = z.enum([
  "LAUNCH",
  "FUND",
  "GOV",
  "LEAD",
  "EXPLOIT",
  "TECH",
  "MARKET",
  "REG",
  "NET",
]);
export type TimelineCategory = z.infer<typeof timelineCategorySchema>;

/**
 * How much of `date` the corpus actually establishes. A row dated "2013" sorts
 * as 2013-01-01 and renders as "2013"; the precision field is what stops the
 * sort key from being read as a fact.
 */
export const datePrecisionSchema = z.enum(["day", "month", "year", "range"]);

export const timelineEventSchema = z
  .object({
    ...claimBase,
    id: z.string().regex(/^T\d{4}-\d{2}-\d{2}(-\d+)?$/, "timeline ids are T<ISO-date>[-n]"),
    /** Sort key. For loose dates this is the earliest day consistent with the corpus. */
    date: isoDateSchema,
    datePrecision: datePrecisionSchema,
    /** What the corpus itself prints, e.g. "Apr-Jun 2018". Rendered in preference to `date`. */
    dateText: z.string().min(1),
    /** End of a range, where `datePrecision` is "range". */
    dateEnd: isoDateSchema.optional(),
    category: timelineCategorySchema,
    /** The corpus writes some rows "TECH / EXPLOIT". The first is primary; the second lands here. */
    secondaryCategory: timelineCategorySchema.optional(),
    height: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((e) => e.id.slice(1, 11) === e.date, {
    message: "a timeline id must carry its own date",
    path: ["id"],
  })
  .refine((e) => e.datePrecision !== "range" || e.dateEnd !== undefined, {
    message: "a range needs a dateEnd",
    path: ["dateEnd"],
  });
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/* -------------------------------------------------------------------------- */
/* Network -- entities and the edges between them                             */
/* -------------------------------------------------------------------------- */

export const entityKindSchema = z.enum([
  "person",
  "company",
  "fund",
  "foundation",
  "exchange",
  "media",
  "vehicle",
  "protocol",
]);

export const networkEntitySchema = z
  .object({
    ...claimBase,
    id: z.string().regex(/^N-[a-z0-9-]+$/, "entity ids are N-<slug>"),
    kind: entityKindSchema,
    role: z.string().min(1),
    /** Disclosed exposure, verbatim from the filing or the disclosure. null where none is disclosed. */
    exposure: z.string().min(1).nullable(),
  })
  .strict();
export type NetworkEntity = z.infer<typeof networkEntitySchema>;

export const networkEdgeSchema = z
  .object({
    id: z.string().regex(/^N-edge-[a-z0-9-]+$/, "edge ids are N-edge-<slug>"),
    from: z.string().regex(/^N-[a-z0-9-]+$/),
    to: z.string().regex(/^N-[a-z0-9-]+$/),
    what: z.string().min(1),
    /** Verbatim as disclosed, e.g. "$58.888M" or "3,221 ZEC". */
    amount: z.string().min(1).optional(),
    date: looseDateSchema,
    sources: z.array(sourceRefSchema).min(1),
    confidence: confidenceSchema,
    lastVerified: isoDateSchema,
  })
  .strict();
export type NetworkEdge = z.infer<typeof networkEdgeSchema>;

export const networkSchema = z
  .object({
    entities: z.array(networkEntitySchema).min(1),
    edges: z.array(networkEdgeSchema).min(1),
  })
  .strict();
export type Network = z.infer<typeof networkSchema>;

/* -------------------------------------------------------------------------- */
/* Phrases                                                                    */
/* -------------------------------------------------------------------------- */

export const phraseSchema = z
  .object({
    id: z.string().regex(/^P-[a-z0-9-]+$/, "phrase ids are P-<slug>"),
    text: z.string().min(1),
    origin: z.string().min(1),
    date: looseDateSchema,
    amplifiers: z.array(z.string().min(1)),
    /** What the chain or the record says against the phrase. */
    tension: z.string().min(1),
    confidence: confidenceSchema,
    sources: z.array(sourceRefSchema).min(1),
    lastVerified: isoDateSchema,
  })
  .strict();
export type Phrase = z.infer<typeof phraseSchema>;

/* -------------------------------------------------------------------------- */
/* Address labels                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Label precedence, always displayed (TRACKING-MATH section 1.5):
 * consensus > owner-filing > exchange > analyst > behaviour.
 */
export const labellerSchema = z.enum(["consensus", "owner-filing", "exchange", "analyst", "behaviour"]);
export type Labeller = z.infer<typeof labellerSchema>;

/** Lower index wins. Exported so a page cannot invent its own ordering. */
export const LABELLER_PRECEDENCE: readonly Labeller[] = [
  "consensus",
  "owner-filing",
  "exchange",
  "analyst",
  "behaviour",
];

export const addressLabelSchema = z
  .object({
    id: z.string().regex(/^L-t[123][1-9A-HJ-NP-Za-km-z]{33}$/, "label ids are L-<address>"),
    address: addressSchema,
    network: z.enum(["mainnet", "testnet"]),
    label: z.string().min(1),
    labeller: labellerSchema,
    /** How the labeller arrived at it. Rendered next to the label, never omitted. */
    method: z.string().min(1),
    confidence: confidenceSchema,
    lastVerified: isoDateSchema,
    sources: z.array(sourceRefSchema).min(1),
    /** Balance as of lastVerified. null where the corpus does not state one. */
    balanceZec: zecAmountSchema.nullable(),
    notes: z.string().min(1).optional(),
  })
  .strict()
  .refine((l) => l.id === `L-${l.address}`, {
    message: "a label id must be L- plus its own address",
    path: ["id"],
  });
export type AddressLabel = z.infer<typeof addressLabelSchema>;

/* -------------------------------------------------------------------------- */
/* Cases -- reconstructed on-chain events                                     */
/* -------------------------------------------------------------------------- */

export const caseStepSchema = z
  .object({
    /** UTC, as precise as the chain records it. */
    time: z.string().min(4),
    height: z.number().int().positive().optional(),
    from: z.string().min(1),
    to: z.string().min(1),
    amount: zecAmountSchema,
    note: z.string().min(1),
    /** Transaction id, lowercase hex, no 0x. */
    txid: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "txids are 64 lowercase hex characters")
      .optional(),
  })
  .strict();
export type CaseStep = z.infer<typeof caseStepSchema>;

export const caseSchema = z
  .object({
    id: z.string().regex(/^K-[a-z0-9-]+$/, "case ids are K-<slug>"),
    title: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(caseStepSchema).min(1),
    /** What the steps do and do not establish. Never an identity claim. */
    verdict: z.string().min(1),
    confidence: confidenceSchema,
    sources: z.array(sourceRefSchema).min(1),
    lastVerified: isoDateSchema,
  })
  .strict();
export type Case = z.infer<typeof caseSchema>;

/* -------------------------------------------------------------------------- */
/* Unverified -- the quarantine                                               */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately NOT a Claim: these have no sources to carry, which is the point.
 * The validator enforces that no `claim` string here appears in any other data
 * file, so an unverified item cannot leak into the Record as fact.
 */
export const unverifiedStatusSchema = z.enum([
  "not-verified",
  "contradicted",
  "single-source",
  "speculation",
  "unlocatable",
]);

/**
 * Where a quarantined record renders, or `null` where it renders nowhere.
 *
 * The quarantine is the one id family whose route is a property of the SUBJECT
 * rather than of the prefix: an unverified claim is shown beside the finding it
 * qualifies, so the promotion-network ones belong on `/network` and the flows
 * ones on `/flows`. `permalink()` maps a prefix to a route and cannot express
 * that, so HANDOFF-03 had to keep the split in a module inside `apps/web` -
 * which meant two files had to agree about a fact neither of them owned, and a
 * unit test existed only to keep them agreeing. LEDGER-03 Q4 moved the fact
 * into the seed, which is this field.
 *
 * WHY IT IS NULLABLE (LEDGER-04 Q4, fold 5). HANDOFF-04 shipped it required,
 * and the consequence was that every one of the 32 records asserted a surface
 * while most of them appear on no page: `permalink()` then returned an anchor
 * that resolves to a page rather than to an element, which is a worse answer
 * than no link. L2's ruling: make it nullable and have `permalink()` refuse.
 * A record carries a surface when, and only when, that page renders an element
 * whose `id` is the record's id.
 *
 * THE PARTITION, MEASURED RATHER THAN ASSERTED. Ten of the 32 are anchored -
 * six on `/flows` (four in the quarantine list, plus the TechLeaks24 theory and
 * the unlocated Arkham post, which own their rows in the allegations table) and
 * four on `/network`. The other 22 carry `null`. LEDGER-03 Q4 stated the split
 * as four and four with 24 unrendered, and LEDGER-04 Q4 repeated the 24; the
 * figures here are counted from the prerendered HTML of a production build
 * rather than from either ledger, and the two allegations rows are what the
 * earlier count missed. The correction is recorded in HANDOFF-05 section 7.
 *
 * A page for the 22 is owed to a later Web handoff: L2 has ruled that a
 * quarantine nobody can read is indistinguishable from suppression, which is
 * precisely the failure this site documents in others. Until that page exists,
 * `null` is the honest value - it says the record is held and not shown, rather
 * than pointing at a page that does not carry it.
 */
export const unverifiedSurfaceSchema = z.enum(["/flows", "/network"]);
export type UnverifiedSurface = z.infer<typeof unverifiedSurfaceSchema>;

export const unverifiedSchema = z
  .object({
    id: z.string().regex(/^U-[a-z0-9-]+$/, "unverified ids are U-<slug>"),
    claim: z.string().min(1),
    status: unverifiedStatusSchema,
    why: z.string().min(1),
    /** May be empty: an unlocatable claim has nothing to cite. */
    sources: z.array(sourceRefSchema),
    /**
     * Which surface renders this record, or `null` where none does.
     * See `unverifiedSurfaceSchema`.
     */
    surface: unverifiedSurfaceSchema.nullable(),
    lastVerified: isoDateSchema,
  })
  .strict();
export type Unverified = z.infer<typeof unverifiedSchema>;

/* -------------------------------------------------------------------------- */
/* Stats -- the Splash metrics until the snapshot exists                      */
/* -------------------------------------------------------------------------- */

export const poolStatSchema = z
  .object({
    bucket: supplyBucketSchema,
    zec: zecAmountSchema,
    zatoshi: zatoshiSchema,
    sharePct: z.number().min(0).max(100),
  })
  .strict();
export type PoolStat = z.infer<typeof poolStatSchema>;

/** A figure the corpus gives as a range rather than a point. Both ends are published. */
export const rangeSchema = z.object({ low: z.number(), high: z.number() }).strict();

export const statsSchema = z
  .object({
    asOf: isoDateSchema,
    height: z.number().int().positive(),
    pools: z.array(poolStatSchema).length(5),
    shieldedSharePct: rangeSchema,
    shieldedShareNote: z.string().min(1),
    priceUsd: rangeSchema,
    marketCapUsd: rangeSchema,
    openInterestUsd: z.number().positive(),
    sources: z.array(sourceRefSchema).min(1),
    confidence: confidenceSchema,
    lastVerified: isoDateSchema,
  })
  .strict();
export type Stats = z.infer<typeof statsSchema>;

/* -------------------------------------------------------------------------- */
/* File-level schemas                                                         */
/* -------------------------------------------------------------------------- */

export const sourcesFileSchema = z.array(sourceSchema).min(1);
export const bewareFileSchema = z.array(bewareEntrySchema);
export const contradictionsFileSchema = z.array(contradictionSchema);
export const timelineFileSchema = z.array(timelineEventSchema);
export const phrasesFileSchema = z.array(phraseSchema);
export const labelsFileSchema = z.array(addressLabelSchema);
export const casesFileSchema = z.array(caseSchema);
export const unverifiedFileSchema = z.array(unverifiedSchema);
