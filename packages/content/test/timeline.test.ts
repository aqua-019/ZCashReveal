/**
 * Assertion A7, and the invariants the timeline's id scheme depends on.
 */
import { describe, expect, it } from "vitest";

import { getTimeline } from "../src/loaders.js";
import { timelineCategorySchema } from "../src/schema.js";

describe("A7 -- the exploit filter", () => {
  it("returns at least twenty events", () => {
    expect(getTimeline({ category: "EXPLOIT" }).length).toBeGreaterThanOrEqual(20);
  });

  it("returns only events whose primary category is EXPLOIT", () => {
    for (const event of getTimeline({ category: "EXPLOIT" })) {
      expect(event.category, `${event.id} is ${event.category}`).toBe("EXPLOIT");
    }
  });

  it("returns a strict subset of the unfiltered timeline", () => {
    const all = getTimeline();
    const exploits = getTimeline({ category: "EXPLOIT" });
    expect(exploits.length).toBeLessThan(all.length);
    for (const event of exploits) expect(all).toContain(event);
  });
});

describe("the timeline", () => {
  it("has at least a hundred events", () => {
    expect(getTimeline().length).toBeGreaterThanOrEqual(100);
  });

  it("is in chronological order", () => {
    const dates = getTimeline().map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("gives every event a unique id that carries its own date", () => {
    const seen = new Set<string>();
    for (const event of getTimeline()) {
      expect(seen.has(event.id), `duplicate id ${event.id}`).toBe(false);
      seen.add(event.id);
      expect(event.id.slice(1, 11)).toBe(event.date);
    }
  });

  it("uses only categories in the union, and never repeats one as its own secondary", () => {
    for (const event of getTimeline()) {
      expect(timelineCategorySchema.safeParse(event.category).success).toBe(true);
      if (event.secondaryCategory !== undefined) {
        expect(event.secondaryCategory).not.toBe(event.category);
      }
    }
  });

  it("marks every range with an end date that is not before its start", () => {
    for (const event of getTimeline()) {
      if (event.datePrecision === "range") {
        expect(event.dateEnd, `${event.id} is a range with no end`).toBeDefined();
        expect(event.dateEnd! >= event.date, `${event.id} ends before it starts`).toBe(true);
      }
    }
  });

  it("covers every category the Record renders a filter for", () => {
    const present = new Set(getTimeline().map((e) => e.category));
    for (const category of ["EXPLOIT", "GOV", "TECH", "MARKET", "FUND", "LEAD", "REG"] as const) {
      expect(present.has(category), `no timeline event is ${category}`).toBe(true);
    }
  });
});
