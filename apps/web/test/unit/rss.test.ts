/**
 * ASSERTION A8 - `/beware.xml` validates as RSS 2.0, with at least 14 items.
 *
 * The route handler is a pure function of the content package, so this runs it
 * directly rather than over HTTP. That is not a shortcut: it means the feed is
 * checked on every `vitest run`, which is in CI, rather than only in the
 * Playwright job, which is not (LEDGER-01 Q3, deferred to HANDOFF-10).
 *
 * BOTH POLARITIES. The pass state is the feed as shipped. The fail state
 * re-parses the same document with a required element removed and asserts the
 * check notices - without that half, "the parser did not throw" would be
 * satisfied by a parser that never validates anything, and the assertion would
 * be vacuous.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import { getBeware } from "@zcashreveal/content";

import { GET } from "@/app/beware.xml/route";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

async function feed(): Promise<string> {
  return GET().text();
}

/** RSS 2.0 requires title, link and description on the channel and on every item. */
interface RssItem {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly pubDate: string;
  readonly guid: { readonly "#text": string; readonly "@isPermaLink": string };
  readonly category: string;
}

interface RssDoc {
  readonly rss: {
    readonly "@version": string;
    readonly channel: {
      readonly title: string;
      readonly link: string;
      readonly description: string;
      readonly lastBuildDate: string;
      readonly item: readonly RssItem[];
    };
  };
}

describe("A8 pass state - /beware.xml is RSS 2.0", () => {
  it("is well-formed XML", async () => {
    const body = await feed();
    const verdict = XMLValidator.validate(body);
    expect(verdict, `not well-formed: ${JSON.stringify(verdict)}`).toBe(true);
  });

  it("declares version 2.0 and carries a complete channel", async () => {
    const doc = parser.parse(await feed()) as RssDoc;
    expect(doc.rss["@version"]).toBe("2.0");
    const channel = doc.rss.channel;
    // The three elements RSS 2.0 requires of a channel.
    expect(channel.title.length).toBeGreaterThan(0);
    expect(channel.link).toMatch(/^https:/);
    expect(channel.description.length).toBeGreaterThan(0);
  });

  it("carries at least 14 items, one per ledger entry", async () => {
    const doc = parser.parse(await feed()) as RssDoc;
    const items = doc.rss.channel.item;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(14);
    expect(items).toHaveLength(getBeware().length);
  });

  it("gives every item the three required elements, a stable guid and an RFC 822 date", async () => {
    const doc = parser.parse(await feed()) as RssDoc;
    const ids = new Set(getBeware().map((e) => e.id));

    for (const item of doc.rss.channel.item) {
      expect(item.title.length, "an item has no title").toBeGreaterThan(0);
      expect(item.link, `${item.title} has a relative link`).toMatch(/^https:[/][/][^/]+[/]beware#B[0-9]+$/);
      expect(item.description.length, `${item.title} has no description`).toBeGreaterThan(0);

      // The guid is the claim id, not the URL: the id is stable across
      // re-verification, so a reader's client does not re-announce an entry
      // every time its lastVerified moves.
      expect(item.guid["@isPermaLink"]).toBe("false");
      expect(ids.has(item.guid["#text"]), `guid ${item.guid["#text"]} is not a ledger id`).toBe(true);

      // RFC 822, which is what pubDate requires - not ISO 8601.
      expect(item.pubDate, `${item.title} has a non-RFC-822 pubDate`).toMatch(
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/,
      );
      expect(Number.isNaN(Date.parse(item.pubDate))).toBe(false);
    }
  });

  it("escapes the reserved characters rather than emitting them raw", async () => {
    const body = await feed();
    // A bare ampersand that does not open an entity is the classic feed-breaker,
    // and it is the one the ledger's copy is most likely to produce.
    expect(body).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#[0-9]+);)/);
  });

  it("serves the RSS content type", () => {
    expect(GET().headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
  });
});

describe("A8 fail state - the same checks reject a broken feed", () => {
  it("the validator rejects a document whose channel element is unclosed", async () => {
    const broken = (await feed()).replace("</channel>", "");
    expect(XMLValidator.validate(broken)).not.toBe(true);
  });

  it("the item count check fails when the items are removed", async () => {
    const broken = (await feed()).replace(/<item>[\s\S]*<[/]item>/, "");
    const doc = parser.parse(broken) as { rss: { channel: { item?: readonly RssItem[] } } };
    expect(doc.rss.channel.item ?? []).toHaveLength(0);
  });

  it("the escaping check fires on a raw ampersand", async () => {
    const broken = (await feed()).replace("<language>en</language>", "<language>en & raw</language>");
    expect(broken).toMatch(/&(?!(amp|lt|gt|quot|apos|#[0-9]+);)/);
  });
});
