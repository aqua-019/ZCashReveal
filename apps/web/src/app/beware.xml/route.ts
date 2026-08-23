import { getBeware, requirePermalink, resolveSources } from "@zcashreveal/content";

import { SITE_URL, absolute } from "@/lib/site";

/**
 * `/beware.xml` - the exploit ledger as RSS 2.0 (HANDOFF-03 deliverable 9,
 * assertion A8).
 *
 * The Record's argument is that this material is checkable and that it changes.
 * A feed is how someone follows the second half without having to poll a page:
 * when an entry's `lastVerified` moves, or an entry is added, a reader who
 * subscribed a year ago finds out.
 *
 * One item per ledger entry, newest verification first. `guid` is the claim id
 * with `isPermaLink="false"` - the id is stable across re-verification, so a
 * reader's client does not re-announce an entry every time its date moves,
 * which would make the feed noise. The link is the claim's own permalink, so an
 * item resolves to the paragraph it describes rather than to the page.
 *
 * Written by hand rather than by a library: the document is forty lines of
 * fixed structure, and a dependency that renders it would still need every
 * string escaped by us.
 */

export const dynamic = "force-static";

/** The five characters XML reserves. Attribute values need the quotes too. */
function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * RFC 822, which is what RSS 2.0's `pubDate` requires - not ISO 8601. Built
 * from UTC parts rather than `toUTCString()` so the output cannot follow the
 * build machine's locale.
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function rfc822(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = DAYS[d.getUTCDay()] ?? "Mon";
  const month = MONTHS[d.getUTCMonth()] ?? "Jan";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${day}, ${dd} ${month} ${d.getUTCFullYear()} 00:00:00 GMT`;
}

export function GET(): Response {
  // Newest verification first, then by ledger number. The tiebreak is numeric
  // rather than lexicographic: every entry currently carries the same
  // `lastVerified`, and a string sort would file B10 between B1 and B2.
  const ordinal = (id: string): number => Number.parseInt(id.slice(1), 10);
  const entries = [...getBeware()].sort((a, b) =>
    a.lastVerified === b.lastVerified ? ordinal(a.id) - ordinal(b.id) : b.lastVerified.localeCompare(a.lastVerified),
  );

  const items = entries.map((e) => {
    const link = absolute(requirePermalink(e.id));
    const sources = resolveSources(e.sources);
    // The description is the claim, its window, whether it was ever detectable
    // and what it is sourced to - enough that a reader deciding whether to open
    // the link has the substance, not a teaser.
    const description = [
      e.summary,
      `Window: ${e.window.from} to ${e.window.to}.`,
      `Discovered by ${e.discoverer}.`,
      `Detectable from chain data: ${e.detectable}.`,
      `Confidence: ${e.confidence}. Last verified ${e.lastVerified}.`,
      `Sources: ${sources.map((s) => s.url).join(" ")}`,
    ].join(" ");
    return [
      "    <item>",
      `      <title>${xml(`${e.id} ${e.title}`)}</title>`,
      `      <link>${xml(link)}</link>`,
      `      <guid isPermaLink="false">${xml(e.id)}</guid>`,
      `      <pubDate>${rfc822(e.lastVerified)}</pubDate>`,
      `      <category>${xml(e.severity)}</category>`,
      `      <description>${xml(description)}</description>`,
      "    </item>",
    ].join("\n");
  });

  const latest = entries[0]?.lastVerified ?? "2026-08-22";

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>ZCashReveal - Beware, the exploit ledger</title>",
    `    <link>${xml(absolute("/beware"))}</link>`,
    "    <description>Every disclosed soundness and consensus failure in Zcash, with the window it stayed open, whether it was ever detectable from chain data, and the sources for each. Changes to the ledger appear here.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${rfc822(latest)}</lastBuildDate>`,
    `    <atom:link href="${xml(absolute("/beware.xml"))}" rel="self" type="application/rss+xml"/>`,
    `    <docs>${xml(`${SITE_URL}/method`)}</docs>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
