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
  getUnverifiedFor,
  permalink,
  requirePermalink,
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
    // The quarantine is the one family whose surface is a property of the
    // RECORD, not of the prefix: an unverified claim renders beside the finding
    // it qualifies. HANDOFF-03 first sent U- to /sources, which renders no U-
    // id at all, then to /flows, which is a page that carries only six of them.
    // Since HANDOFF-04 deliverable 9 the seed says, and permalink reads it
    // (LEDGER-03 Q4). These two are anchored records, so they resolve.
    expect(permalink("U-korean-exchange-dominance")).toBe("/network#U-korean-exchange-dominance");
    expect(permalink("U-zooko-sold-for-taxes")).toBe("/flows#U-zooko-sold-for-taxes");
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

  it("throws on a U- id that is not in the quarantine, rather than guessing a surface", () => {
    // The prefix rule used to answer "/flows" for any U- string at all, which
    // is a link to a page that has no such element. A citation to a claim the
    // quarantine does not hold is a broken citation and should say so.
    expect(() => permalink("U-not-a-real-record")).toThrow(/unrecognised/);
  });

  it("partitions the quarantine by the field permalink reads, so the two cannot disagree", () => {
    const onNetwork = getUnverifiedFor("/network");
    const onFlows = getUnverifiedFor("/flows");
    const unrendered = getUnverified().filter((u) => u.surface === null);
    expect(onNetwork.length + onFlows.length + unrendered.length).toBe(getUnverified().length);
    for (const u of onNetwork) expect(permalink(u.id)).toBe(`/network#${u.id}`);
    for (const u of onFlows) expect(permalink(u.id)).toBe(`/flows#${u.id}`);
  });

  /* -- LEDGER-04 Q4, fold 5: the quarantine's null surface -- */

  it("returns null, not a dead anchor, for a quarantined record that renders nowhere", () => {
    // The whole point of the fold. Before it, this id answered "/flows#..." -
    // an anchor to a page that carries no such element, which resolves to the
    // top of /flows and tells the reader the claim is there when it is not.
    const record = getUnverified().find((u) => u.id === "U-powers-of-tau-2022");
    expect(record?.surface).toBe(null);
    expect(permalink("U-powers-of-tau-2022")).toBe(null);
    expect(permalink("U-powers-of-tau-2022", { base: "https://zecreveal.com" })).toBe(null);
  });

  it("returns null for every unrendered record and a path for every rendered one", () => {
    for (const u of getUnverified()) {
      if (u.surface === null) expect(permalink(u.id)).toBe(null);
      else expect(permalink(u.id)).toBe(`${u.surface}#${u.id}`);
    }
  });

  it("keeps 'not in the quarantine' distinct from 'in it and rendered nowhere'", () => {
    // Both are absences and they mean opposite things. A broken citation must
    // not be able to hide inside the honest one.
    expect(permalink("U-powers-of-tau-2022")).toBe(null);
    expect(() => permalink("U-not-a-real-record")).toThrow(/unrecognised/);
  });

  it("requirePermalink throws where permalink returns null, and passes everything else through", () => {
    expect(requirePermalink("B2")).toBe("/beware#B2");
    expect(requirePermalink("U-zooko-sold-for-taxes")).toBe("/flows#U-zooko-sold-for-taxes");
    expect(() => requirePermalink("U-powers-of-tau-2022")).toThrow(/renders on no page/);
    expect(() => requirePermalink("U-not-a-real-record")).toThrow(/unrecognised/);
  });

  it("the anchored partition is six on /flows and four on /network", () => {
    // Counted from the prerendered HTML of a production build, not asserted
    // from a ledger: LEDGER-03 Q4 and LEDGER-04 Q4 both state four and four
    // with 24 unrendered, and the two allegations rows on /flows that own
    // their anchors are what that count missed. See HANDOFF-05 section 7.
    expect(getUnverifiedFor("/flows").map((u) => u.id).sort()).toEqual([
      "U-arkham-174m-position-post",
      "U-fr-withdrawals-linkable-headline",
      "U-grayscale-published-zec-address",
      "U-nu6-lockbox-current-balance",
      "U-techleaks24-exploiter-migration-theory",
      "U-zooko-sold-for-taxes",
    ]);
    expect(getUnverifiedFor("/network").map((u) => u.id).sort()).toEqual([
      "U-21shares-zec-etp",
      "U-bot-networks-pumping-zec",
      "U-ecc-zf-layoffs-2023-24",
      "U-korean-exchange-dominance",
    ]);
    expect(getUnverified().filter((u) => u.surface === null)).toHaveLength(22);
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
