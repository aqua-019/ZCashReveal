import {
  getBeware,
  getCases,
  getContradictions,
  getLabels,
  getNetwork,
  getPhrases,
  getSources,
  getStats,
  getTimeline,
  getUnverified,
} from "@zcashreveal/content";

/**
 * `/api/content/<collection>.json` - the Record as data (HANDOFF-03
 * deliverable 9).
 *
 * The site's claim is that its material is checkable. A reader who wants to
 * check it at scale - recompute a count, diff two revisions, feed the ledger
 * into their own tooling - should not have to scrape HTML for it. These are the
 * same objects the pages render, parsed through the same zod schemas, so an
 * export can never disagree with the page above it.
 *
 * The `.json` is part of the path segment rather than a content negotiation
 * header, because a URL that ends in `.json` is one a person can paste into a
 * browser and read.
 *
 * Every route is prerendered. There is no request-dependent behaviour here at
 * all, and a static file is the right shape for a document that changes when
 * the repository does.
 */

export const dynamic = "force-static";

/**
 * Zatoshi are `bigint` after the schema parses them (CLAUDE.md: bigint for
 * zatoshi, always), and `JSON.stringify` throws on a bigint rather than
 * guessing. Emitting them as decimal strings is the same thing the seed files
 * do, and it is the only representation that survives a JSON round trip
 * without losing the low digits to a double.
 */
function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

const COLLECTIONS = {
  beware: () => getBeware(),
  contradictions: () => getContradictions(),
  timeline: () => getTimeline(),
  network: () => getNetwork(),
  phrases: () => getPhrases(),
  labels: () => getLabels(),
  cases: () => getCases(),
  unverified: () => getUnverified(),
  sources: () => getSources(),
  stats: () => getStats(),
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as readonly CollectionName[];

export function generateStaticParams(): { collection: string }[] {
  return COLLECTION_NAMES.map((name) => ({ collection: `${name}.json` }));
}

export async function GET(_request: Request, ctx: { params: Promise<{ collection: string }> }): Promise<Response> {
  const { collection } = await ctx.params;
  const name = collection.endsWith(".json") ? collection.slice(0, -".json".length) : collection;

  if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, name)) {
    return Response.json(
      {
        error: "unknown collection",
        // Naming the alternatives turns a 404 into documentation. Someone who
        // guessed the URL is one line away from the one they wanted.
        available: COLLECTION_NAMES.map((n) => `/api/content/${n}.json`),
      },
      { status: 404 },
    );
  }

  const payload = COLLECTIONS[name as CollectionName]();
  return new Response(`${JSON.stringify(payload, bigintSafe, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      // The Record is public and meant to be re-used. Saying so in a header
      // saves everyone a mail asking whether it is allowed.
      "access-control-allow-origin": "*",
    },
  });
}
