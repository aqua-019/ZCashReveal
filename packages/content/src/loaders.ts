/**
 * Typed loaders over `data/`.
 *
 * Every loader parses through the zod schema on first use and memoises the
 * result, so a malformed seed fails loudly at the first read rather than
 * rendering as a half-formed claim. The raw JSON is never handed out.
 *
 * The JSON is imported statically, not read with `fs`, so the package works
 * unchanged under Node, vitest and a bundler.
 */
import beware from "../data/beware.json" with { type: "json" };
import cases from "../data/cases.json" with { type: "json" };
import contradictions from "../data/contradictions.json" with { type: "json" };
import labels from "../data/labels.json" with { type: "json" };
import network from "../data/network.json" with { type: "json" };
import phrases from "../data/phrases.json" with { type: "json" };
import sources from "../data/sources.json" with { type: "json" };
import stats from "../data/stats.json" with { type: "json" };
import timeline from "../data/timeline.json" with { type: "json" };
import unverified from "../data/unverified.json" with { type: "json" };

import {
  bewareFileSchema,
  casesFileSchema,
  contradictionsFileSchema,
  labelsFileSchema,
  networkSchema,
  phrasesFileSchema,
  sourcesFileSchema,
  statsSchema,
  timelineFileSchema,
  unverifiedFileSchema,
  type AddressLabel,
  type BewareEntry,
  type Case,
  type Contradiction,
  type Network,
  type Phrase,
  type Source,
  type SourceRef,
  type Stats,
  type TimelineCategory,
  type TimelineEvent,
  type Unverified,
} from "./schema.js";

/** Parse once, on first read, and keep the result. */
function once<T>(parse: () => T): () => T {
  let value: T | undefined;
  let done = false;
  return () => {
    if (!done) {
      value = parse();
      done = true;
    }
    return value as T;
  };
}

const readBeware = once(() => bewareFileSchema.parse(beware));
const readContradictions = once(() => contradictionsFileSchema.parse(contradictions));
const readTimeline = once(() => {
  const events = timelineFileSchema.parse(timeline);
  // One stable order for every consumer: chronological, then by id so that
  // same-day rows never reshuffle between renders.
  return [...events].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
});
const readNetwork = once(() => networkSchema.parse(network));
const readPhrases = once(() => phrasesFileSchema.parse(phrases));
const readLabels = once(() => labelsFileSchema.parse(labels));
const readCases = once(() => casesFileSchema.parse(cases));
const readUnverified = once(() => unverifiedFileSchema.parse(unverified));
const readSources = once(() => sourcesFileSchema.parse(sources));
const readStats = once(() => statsSchema.parse(stats));

const sourceIndex = once(() => new Map(readSources().map((s) => [s.id, s])));

/* -------------------------------------------------------------------------- */
/* Loaders                                                                    */
/* -------------------------------------------------------------------------- */

/** The fourteen-entry exploit ledger, B1..B14, in id order. */
export function getBeware(): readonly BewareEntry[] {
  return readBeware();
}

/** The sixteen marketing-against-chain contradictions, C1..C16. */
export function getContradictions(): readonly Contradiction[] {
  return readContradictions();
}

/**
 * The timeline in chronological order. `category` filters on the primary
 * category only: a row the corpus writes "TECH / EXPLOIT" is a TECH row that
 * also carries `secondaryCategory: "EXPLOIT"`.
 */
export function getTimeline(options: { category?: TimelineCategory } = {}): readonly TimelineEvent[] {
  const events = readTimeline();
  const { category } = options;
  return category === undefined ? events : events.filter((e) => e.category === category);
}

/** Entities and the disclosed edges between them. */
export function getNetwork(): Network {
  return readNetwork();
}

/** The narrative phrase catalogue, minus the three the dossier could not verify. */
export function getPhrases(): readonly Phrase[] {
  return readPhrases();
}

/** Address labels, strongest labeller first (consensus > owner filing > exchange > analyst > behaviour). */
export function getLabels(): readonly AddressLabel[] {
  return readLabels();
}

/** Every reconstructed case. */
export function getCases(): readonly Case[] {
  return readCases();
}

/** One reconstructed case by id, or undefined. */
export function getCase(id: string): Case | undefined {
  return readCases().find((c) => c.id === id);
}

/** The quarantine: claims that are not publishable as fact. */
export function getUnverified(): readonly Unverified[] {
  return readUnverified();
}

/** Every source, de-duplicated by URL. */
export function getSources(): readonly Source[] {
  return readSources();
}

/** One source by id, or undefined. */
export function getSource(ref: SourceRef): Source | undefined {
  return sourceIndex().get(ref);
}

/** Resolve a claim's `sources[]` into full records, in the order the claim lists them. */
export function resolveSources(refs: readonly SourceRef[]): readonly Source[] {
  const index = sourceIndex();
  const out: Source[] = [];
  for (const ref of refs) {
    const source = index.get(ref);
    if (source !== undefined) out.push(source);
  }
  return out;
}

/** Pool balances and market figures as of the dossier's compile date. */
export function getStats(): Stats {
  return readStats();
}

/* -------------------------------------------------------------------------- */
/* Permalinks                                                                 */
/* -------------------------------------------------------------------------- */

/** Which Record page owns each id prefix. */
const ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^B([1-9]|1[0-4])$/, "/beware"],
  [/^C([1-9]|1[0-6])$/, "/contradictions"],
  [/^T\d{4}-\d{2}-\d{2}(-\d+)?$/, "/timeline"],
  [/^N-/, "/network"],
  [/^P-/, "/network"],
  [/^L-/, "/flows"],
  [/^K-/, "/flows"],
  // Corrected by the HANDOFF-03 session: this said "/sources". The quarantine
  // renders on /flows - HANDOFF-03 deliverable 8 lists the unverified list
  // there, next to the allegations it refuses - so a U- permalink pointed at a
  // page the claim is not on. A permalink that resolves to the wrong surface is
  // worse than none: it tells a reader the claim was not found. Recorded in the
  // section 8 ledger.
  [/^U-/, "/flows"],
  [/^S-/, "/sources"],
];

/**
 * The canonical location of a claim: `permalink("B2")` is `/beware#B2`.
 *
 * Pass `base` to get an absolute URL for a citation popover. Without it the
 * result is site-relative, which is what an anchor tag wants.
 */
export function permalink(id: string, options: { base?: string } = {}): string {
  const route = ROUTES.find(([pattern]) => pattern.test(id))?.[1];
  if (route === undefined) throw new Error(`permalink: unrecognised claim id "${id}"`);
  const path = `${route}#${id}`;
  const { base } = options;
  return base === undefined ? path : `${base.replace(/\/+$/, "")}${path}`;
}
