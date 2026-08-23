/**
 * The schema's refusals. Each of these is the fail state of a rule the Record
 * depends on, exercised directly rather than only through the validator.
 */
import { describe, expect, it } from "vitest";

import {
  addressLabelSchema,
  bewareEntrySchema,
  claimSchema,
  sourceSchema,
  timelineEventSchema,
  unverifiedSchema,
} from "../src/schema.js";

const claim = {
  id: "B1",
  title: "A claim",
  summary: "A claim with a source.",
  sources: ["S-example"],
  confidence: "high",
  lastVerified: "2026-08-22",
  tags: ["example"],
};

describe("a claim must carry provenance", () => {
  it("accepts a claim with one source", () => {
    expect(claimSchema.safeParse(claim).success).toBe(true);
  });

  it("refuses a claim with no sources", () => {
    const result = claimSchema.safeParse({ ...claim, sources: [] });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("at least one source");
  });

  it("refuses a source id that is not an S- slug", () => {
    expect(claimSchema.safeParse({ ...claim, sources: ["electriccoin.co"] }).success).toBe(false);
  });

  it("refuses a lastVerified that is not an ISO date", () => {
    expect(claimSchema.safeParse({ ...claim, lastVerified: "22 Aug 2026" }).success).toBe(false);
  });

  it("refuses a confidence outside the dossier's ladder", () => {
    expect(claimSchema.safeParse({ ...claim, confidence: "certain" }).success).toBe(false);
  });

  it("refuses an unknown key rather than silently dropping it", () => {
    expect(claimSchema.safeParse({ ...claim, severity: "crit" }).success).toBe(false);
  });
});

describe("beware ids are bounded", () => {
  const entry = {
    ...claim,
    discovered: "1 Mar 2018",
    disclosed: "5 Feb 2019",
    fixed: "28 Oct 2018",
    discoverer: "Ariel Gabizon",
    rootCause: "BCTV14 key generation emitted extra bypass elements.",
    detectable: "no",
    window: { from: "28 Oct 2016", to: "28 Oct 2018" },
    severity: "crit",
  };

  it("accepts B1 through B14", () => {
    expect(bewareEntrySchema.safeParse({ ...entry, id: "B14" }).success).toBe(true);
  });

  it("refuses B15", () => {
    expect(bewareEntrySchema.safeParse({ ...entry, id: "B15" }).success).toBe(false);
  });

  it("refuses B0", () => {
    expect(bewareEntrySchema.safeParse({ ...entry, id: "B0" }).success).toBe(false);
  });
});

describe("a timeline id must carry its own date", () => {
  const event = {
    ...claim,
    id: "T2026-06-04",
    date: "2026-06-04",
    datePrecision: "day",
    dateText: "4 Jun 2026",
    category: "EXPLOIT",
  };

  it("accepts an id that matches its date", () => {
    expect(timelineEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts a -n suffix for a second event on the same day", () => {
    expect(timelineEventSchema.safeParse({ ...event, id: "T2026-06-04-2" }).success).toBe(true);
  });

  it("refuses an id whose date disagrees with the date field", () => {
    const result = timelineEventSchema.safeParse({ ...event, id: "T2026-06-05" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("carry its own date");
  });

  it("refuses a range with no end", () => {
    expect(timelineEventSchema.safeParse({ ...event, datePrecision: "range" }).success).toBe(false);
  });
});

describe("a label id must carry its own address", () => {
  const label = {
    id: "L-t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
    address: "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
    network: "mainnet",
    label: "ZIP 271 lockbox disbursement multisig",
    labeller: "consensus",
    method: "ZIP 271 writes this address into the consensus rules.",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-example"],
    balanceZec: "78183.4093",
  };

  it("accepts a matching pair", () => {
    expect(addressLabelSchema.safeParse(label).success).toBe(true);
  });

  it("refuses a label whose id is not its address", () => {
    expect(addressLabelSchema.safeParse({ ...label, id: "L-t3someOtherAddress" }).success).toBe(false);
  });

  it("refuses a labeller outside the precedence order", () => {
    expect(addressLabelSchema.safeParse({ ...label, labeller: "twitter" }).success).toBe(false);
  });

  it("refuses something that is not a transparent address", () => {
    expect(
      addressLabelSchema.safeParse({ ...label, id: "L-zs1abc", address: "zs1abc" }).success,
    ).toBe(false);
  });
});

describe("the quarantine needs no sources", () => {
  it("accepts an unlocatable claim with an empty sources array", () => {
    const result = unverifiedSchema.safeParse({
      id: "U-example",
      claim: "An artefact that was searched for and never found anywhere.",
      status: "unlocatable",
      why: "Searched the publisher, the archive and the citing article; nothing exists.",
      sources: [],
      lastVerified: "2026-08-22",
    });
    expect(result.success).toBe(true);
  });
});

describe("a source needs a real url", () => {
  const source = {
    id: "S-example",
    title: "An example source",
    url: "https://electriccoin.co/blog/",
    publisher: "Electric Coin Company",
    date: null,
    accessed: "2026-08-22",
  };

  it("accepts a source with a null date", () => {
    expect(sourceSchema.safeParse(source).success).toBe(true);
  });

  it("refuses a bare hostname", () => {
    expect(sourceSchema.safeParse({ ...source, url: "electriccoin.co" }).success).toBe(false);
  });
});
