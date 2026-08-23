/**
 * The JSON exports (HANDOFF-03 deliverable 9).
 *
 * The route handler is a pure function of the content package, so it runs
 * directly here rather than over HTTP - which puts these checks in CI's
 * `vitest run` rather than only in the Playwright job.
 *
 * The property that matters most is the bigint one. Zatoshi are `bigint` after
 * the schema parses them, and `JSON.stringify` THROWS on a bigint rather than
 * guessing a representation. An export that forgot the replacer would not
 * produce a slightly wrong number, it would produce a 500, and nothing else in
 * the workspace would notice.
 */
import { describe, expect, it } from "vitest";

import { getBeware, getSources, getTimeline } from "@zcashreveal/content";

import { COLLECTION_NAMES, GET, generateStaticParams } from "@/app/api/content/[collection]/route";

function params(collection: string): { params: Promise<{ collection: string }> } {
  return { params: Promise.resolve({ collection }) };
}

async function fetchCollection(name: string): Promise<{ status: number; body: unknown; type: string | null }> {
  const res = await GET(new Request(`https://example.invalid/api/content/${name}`), params(name));
  return { status: res.status, body: (await res.json()) as unknown, type: res.headers.get("content-type") };
}

describe("JSON exports - pass state", () => {
  it("prerenders one path per collection, each ending .json", () => {
    const paths = generateStaticParams().map((p) => p.collection);
    expect(paths).toHaveLength(COLLECTION_NAMES.length);
    for (const p of paths) expect(p.endsWith(".json")).toBe(true);
  });

  it("serves every collection as JSON", async () => {
    for (const name of COLLECTION_NAMES) {
      const { status, type } = await fetchCollection(`${name}.json`);
      expect(status, `${name} did not answer 200`).toBe(200);
      expect(type).toBe("application/json; charset=utf-8");
    }
  });

  it("exports the same objects the pages render", async () => {
    const beware = (await fetchCollection("beware.json")).body as readonly { id: string }[];
    expect(beware).toHaveLength(getBeware().length);
    expect(beware[0]?.id).toBe(getBeware()[0]?.id);

    const timeline = (await fetchCollection("timeline.json")).body as readonly unknown[];
    expect(timeline).toHaveLength(getTimeline().length);

    const sources = (await fetchCollection("sources.json")).body as readonly unknown[];
    expect(sources).toHaveLength(getSources().length);
  });

  it("emits zatoshi as decimal strings, which is the only lossless JSON form", async () => {
    const stats = (await fetchCollection("stats.json")).body as {
      readonly pools: readonly { readonly bucket: string; readonly zatoshi: unknown }[];
    };
    expect(stats.pools).toHaveLength(5);
    for (const p of stats.pools) {
      expect(typeof p.zatoshi, `${p.bucket} zatoshi is not a string`).toBe("string");
      // A number would silently lose the low digits of a large zatoshi count
      // to a double; the string must be digits only.
      expect(String(p.zatoshi)).toMatch(/^[0-9]+$/);
    }
    const transparent = stats.pools.find((p) => p.bucket === "transparent");
    expect(BigInt(String(transparent?.zatoshi)) > 0n).toBe(true);
  });

  it("names the alternatives when a collection does not exist", async () => {
    const { status, body } = await fetchCollection("not-a-collection.json");
    expect(status).toBe(404);
    const payload = body as { readonly error: string; readonly available: readonly string[] };
    expect(payload.error).toBe("unknown collection");
    expect(payload.available).toHaveLength(COLLECTION_NAMES.length);
  });
});

describe("JSON exports - fail state", () => {
  it("a plain stringify of the same payload throws on the bigint", async () => {
    // This is what the export would do without its replacer, and it is why the
    // replacer is not a nicety.
    const { getStats } = await import("@zcashreveal/content");
    expect(() => JSON.stringify(getStats())).toThrow(TypeError);
  });
});
