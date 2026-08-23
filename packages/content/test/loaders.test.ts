/**
 * The loader surface HANDOFF-03 renders from, and the citation guarantee the
 * whole package exists to provide.
 */
import { describe, expect, it } from "vitest";

import {
  getBeware,
  getContradictions,
  getLabels,
  getNetwork,
  getPhrases,
  getSource,
  getSources,
  getStats,
  getTimeline,
  getUnverified,
  permalink,
  resolveSources,
} from "../src/loaders.js";

describe("permalink", () => {
  it("routes each id family to the page that owns it", () => {
    expect(permalink("B2")).toBe("/beware#B2");
    expect(permalink("C16")).toBe("/contradictions#C16");
    expect(permalink("T2026-06-04")).toBe("/timeline#T2026-06-04");
    expect(permalink("T2026-06-04-2")).toBe("/timeline#T2026-06-04-2");
    expect(permalink("N-cypherpunk-technologies")).toBe("/network#N-cypherpunk-technologies");
    expect(permalink("P-encrypted-bitcoin")).toBe("/network#P-encrypted-bitcoin");
    expect(permalink("K-2026-01-02")).toBe("/flows#K-2026-01-02");
    // The quarantine renders on /flows, beside the allegations it refuses, so
    // that is where a U- permalink must land. HANDOFF-03 corrected this from
    // "/sources", which pointed at a page the claim is not on.
    expect(permalink("U-korean-exchange-dominance")).toBe("/flows#U-korean-exchange-dominance");
    expect(permalink("L-t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo")).toBe(
      "/flows#L-t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
    );
  });

  it("takes a base for the citation popover's canonical url", () => {
    expect(permalink("B2", { base: "https://zecreveal.com" })).toBe("https://zecreveal.com/beware#B2");
    expect(permalink("B2", { base: "https://zecreveal.com/" })).toBe("https://zecreveal.com/beware#B2");
  });

  it("throws on an id no page owns, rather than emitting a dead link", () => {
    expect(() => permalink("B15")).toThrow(/unrecognised/);
    expect(() => permalink("nonsense")).toThrow(/unrecognised/);
  });
});

describe("citations", () => {
  it("resolves every source a claim cites", () => {
    for (const claim of [...getBeware(), ...getContradictions(), ...getTimeline()]) {
      const resolved = resolveSources(claim.sources);
      expect(resolved, `${claim.id} lost a citation`).toHaveLength(claim.sources.length);
    }
  });

  it("gives every source a title, a publisher and an accessed date", () => {
    for (const source of getSources()) {
      expect(source.title.length).toBeGreaterThan(3);
      expect(source.publisher.length).toBeGreaterThan(1);
      expect(source.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("returns undefined for a source id that does not exist", () => {
    expect(getSource("S-does-not-exist")).toBeUndefined();
  });
});

describe("the network graph", () => {
  it("points every edge at an entity that exists", () => {
    const { entities, edges } = getNetwork();
    const ids = new Set(entities.map((e) => e.id));
    for (const edge of edges) {
      expect(ids.has(edge.from), `${edge.id} has no from`).toBe(true);
      expect(ids.has(edge.to), `${edge.id} has no to`).toBe(true);
    }
  });

  it("states exposure or states null, never an estimate", () => {
    for (const entity of getNetwork().entities) {
      expect(entity.exposure === null || entity.exposure.length > 0).toBe(true);
    }
  });
});

describe("the quarantine", () => {
  it("holds at least fifteen items", () => {
    expect(getUnverified().length).toBeGreaterThanOrEqual(15);
  });

  it("keeps the three unverified phrases out of the phrase catalogue", () => {
    const catalogue = JSON.stringify(getPhrases()).toLowerCase();
    for (const banned of ["zectothemoon", "privacy layer of the internet", "only true private cryptocurrency"]) {
      expect(catalogue.includes(banned), `"${banned}" leaked into phrases`).toBe(false);
    }
  });

  it("states why for every item", () => {
    for (const item of getUnverified()) expect(item.why.length).toBeGreaterThan(20);
  });
});

describe("stats", () => {
  it("accounts for all five supply buckets and sums to a hundred percent", () => {
    const stats = getStats();
    expect(new Set(stats.pools.map((p) => p.bucket)).size).toBe(5);
    const total = stats.pools.reduce((sum, p) => sum + p.sharePct, 0);
    expect(total).toBeGreaterThan(99.9);
    expect(total).toBeLessThan(100.1);
  });

  it("hands out zatoshi as bigint, consistent with the ZEC figure it reports", () => {
    for (const pool of getStats().pools) {
      expect(typeof pool.zatoshi).toBe("bigint");
      expect(pool.zatoshi).toBe(BigInt(Math.round(Number(pool.zec) * 1e8)));
    }
  });

  it("publishes the shielded share as a range, because two sources disagree", () => {
    const { shieldedSharePct } = getStats();
    expect(shieldedSharePct.low).toBeLessThan(shieldedSharePct.high);
    expect(shieldedSharePct.low).toBeGreaterThan(24);
    expect(shieldedSharePct.high).toBeLessThan(28);
  });
});

describe("labels are loadable alongside everything else", () => {
  it("loads without throwing", () => {
    expect(getLabels().length).toBeGreaterThan(0);
  });
});
