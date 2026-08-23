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
  type UnverifiedSurface,
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
  // U- is deliberately ABSENT from this table. The quarantine is the one family
  // whose surface is a property of the record rather than of its prefix, and
  // `permalink()` reads `surface` off the seed for it - see below. HANDOFF-03
  // had this pointing at "/sources", which rendered no U- id at all, so every
  // quarantine citation dead-ended; the fix then was to point it at "/flows".
  // LEDGER-03 Q4 gives the true partition and rules that the seed should say
  // it: four records anchor on /flows, four on /network, and the remaining 24
  // render nowhere at all. So the blanket "/flows" was right for at most five
  // (the four plus U-arkham-174m-position-post, anchored in the allegations
  // table) - a gate round corrected an earlier version of this comment, which
  // claimed it was right for 28 of the 32. The `surface` field records where a
  // record IS anchored; it does not make an unrendered record render, and a
  // citation to one still resolves to a page rather than to an element.
  [/^S-/, "/sources"],
];

/**
 * The quarantine's surfaces, indexed by id, read once from the seed.
 *
 * `permalink()` has to stay synchronous and total, and it is called from render
 * paths that already hold the loaded corpus, so this memoises the lookup rather
 * than re-parsing 32 records per citation.
 */
const quarantineSurface = once<ReadonlyMap<string, string>>(() =>
  new Map(getUnverified().map((u) => [u.id, u.surface] as const)),
);

/**
 * The canonical location of a claim: `permalink("B2")` is `/beware#B2`.
 *
 * Pass `base` to get an absolute URL for a citation popover. Without it the
 * result is site-relative, which is what an anchor tag wants.
 */
export function permalink(id: string, options: { base?: string } = {}): string {
  // A quarantined record says where it renders; every other family is a prefix
  // rule. An unknown U- id falls through to the throw below rather than
  // guessing a surface, which is the honest answer: a citation to a claim that
  // is not in the quarantine is a broken citation, not a claim on /flows.
  const route = id.startsWith("U-") ? quarantineSurface().get(id) : ROUTES.find(([pattern]) => pattern.test(id))?.[1];
  if (route === undefined) throw new Error(`permalink: unrecognised claim id "${id}"`);
  const path = `${route}#${id}`;
  const { base } = options;
  return base === undefined ? path : `${base.replace(/\/+$/, "")}${path}`;
}

/**
 * The quarantined records a given surface is responsible for rendering.
 *
 * This replaces `quarantineFor()` in `apps/web/src/lib/quarantine.ts`, which
 * held a hand-maintained list of four ids that a unit test existed to keep in
 * step with a second copy in `app/network/page.tsx`. Both are retired: the
 * partition is now derived from the same field `permalink()` reads, so the two
 * cannot disagree (LEDGER-03 Q4).
 */
export function getUnverifiedFor(surface: UnverifiedSurface): readonly Unverified[] {
  return getUnverified().filter((u) => u.surface === surface);
}
