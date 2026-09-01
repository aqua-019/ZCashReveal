/**
 * The screen table is the single source for the system bar, the route set, the
 * page metadata and the assertion A7 route walk. A duplicate href or a stray
 * index would desynchronise all four at once, so the shape is asserted here
 * rather than trusted.
 */
import { describe, expect, it } from "vitest";

import {
  NAV_ENTRIES,
  NAV_GROUPS,
  ROUTES,
  SCREENS,
  UNNUMBERED,
  VIEWS,
  isActive,
  screenByHref,
} from "@/lib/nav";

describe("SCREENS", () => {
  it("has the nine shipped screens", () => {
    expect(SCREENS).toHaveLength(9);
  });

  it("gives every screen a unique href", () => {
    const hrefs = SCREENS.map((s) => s.href);
    expect(new Set(hrefs).size, `duplicate href in ${hrefs.join(", ")}`).toBe(hrefs.length);
  });

  it("gives every screen a unique two-digit index", () => {
    const idxs = SCREENS.map((s) => s.idx);
    expect(new Set(idxs).size, `duplicate idx in ${idxs.join(", ")}`).toBe(idxs.length);
    for (const idx of idxs) {
      expect(idx, `idx ${idx} is not two digits`).toMatch(/^[0-9]{2}$/);
    }
  });

  it("numbers the screens consecutively from 00 in nav order", () => {
    expect(SCREENS.map((s) => s.idx)).toEqual(["00", "01", "02", "03", "04", "05", "06", "07", "08"]);
  });

  it("roots every href at /", () => {
    for (const s of SCREENS) {
      expect(s.href.startsWith("/"), `href ${s.href} is not rooted`).toBe(true);
      expect(s.href, `href ${s.href} has a trailing slash`).not.toMatch(/.\/$/);
    }
  });

  it("gives every screen a non-empty label, title and dek", () => {
    for (const s of SCREENS) {
      expect(s.label.length, `${s.href} label`).toBeGreaterThan(0);
      expect(s.title.length, `${s.href} title`).toBeGreaterThan(0);
      expect(s.dek.length, `${s.href} dek`).toBeGreaterThan(0);
    }
  });

  it("assigns each screen to the Record or the Instrument", () => {
    for (const s of SCREENS) {
      expect(["record", "instrument"], `${s.href} half`).toContain(s.half);
    }
    expect(SCREENS.filter((s) => s.half === "instrument").map((s) => s.href)).toEqual([
      "/track",
      "/flows",
    ]);
  });

  it("starts at the splash route", () => {
    expect(SCREENS[0]?.href).toBe("/");
    expect(SCREENS[0]?.idx).toBe("00");
  });
});

/**
 * HANDOFF-04a, F-04a-3. `/pools` and `/reveal` are top-level user-facing pages
 * that had no nav entry while this file's docblock claimed "a route can never
 * exist without a nav entry". They now have entries, outside the numbered
 * sequence, and `scripts/check-nav-routes.mjs` is what keeps the claim true for
 * the next page somebody adds.
 */
describe("VIEWS - the unnumbered instrument views", () => {
  it("carries the two routes that had no nav entry", () => {
    expect(VIEWS.map((v) => v.href)).toEqual(["/pools", "/reveal"]);
  });

  it("marks them unnumbered rather than giving them a place in the sequence", () => {
    for (const v of VIEWS) {
      expect(v.idx, `${v.href} idx`).toBe(UNNUMBERED);
      expect(v.idx, `${v.href} idx must not read as a two-digit index`).not.toMatch(/^[0-9]{2}$/);
    }
  });

  it("puts both on the Instrument side", () => {
    for (const v of VIEWS) expect(v.half, v.href).toBe("instrument");
  });

  it("gives each a non-empty label, title and dek, like any other entry", () => {
    for (const v of VIEWS) {
      expect(v.label.length, `${v.href} label`).toBeGreaterThan(0);
      expect(v.title.length, `${v.href} title`).toBeGreaterThan(0);
      expect(v.dek.length, `${v.href} dek`).toBeGreaterThan(0);
    }
  });

  it("leaves the numbered sequence untouched", () => {
    // The load-bearing half of the two-list split: adding these as SCREENS
    // members would have made "unique two-digit index" false, and the honest
    // repair for that is a second list rather than a weaker assertion.
    expect(SCREENS).toHaveLength(9);
    expect(SCREENS.map((s) => s.idx)).toEqual(["00", "01", "02", "03", "04", "05", "06", "07", "08"]);
  });
});

describe("NAV_ENTRIES", () => {
  it("is the numbered screens followed by the unnumbered views", () => {
    expect(NAV_ENTRIES).toEqual([...SCREENS, ...VIEWS]);
  });

  it("gives every entry a unique href", () => {
    const hrefs = NAV_ENTRIES.map((s) => s.href);
    expect(new Set(hrefs).size, `duplicate href in ${hrefs.join(", ")}`).toBe(hrefs.length);
  });
});

describe("NAV_GROUPS", () => {
  it("is two groups, the Record then the Instrument", () => {
    expect(NAV_GROUPS.map((g) => g.half)).toEqual(["record", "instrument"]);
    expect(NAV_GROUPS.map((g) => g.heading)).toEqual(["The Record", "The Instrument"]);
  });

  it("partitions NAV_ENTRIES exactly - nothing dropped, nothing counted twice", () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.entries);
    expect(grouped).toHaveLength(NAV_ENTRIES.length);
    expect(new Set(grouped.map((s) => s.href))).toEqual(new Set(NAV_ENTRIES.map((s) => s.href)));
  });

  it("puts every entry in the group its own half names", () => {
    for (const g of NAV_GROUPS) {
      for (const e of g.entries) expect(e.half, `${e.href} is in the ${g.half} group`).toBe(g.half);
    }
  });

  it("leaves no group empty - an empty heading is a rendered lie", () => {
    for (const g of NAV_GROUPS) expect(g.entries.length, g.heading).toBeGreaterThan(0);
  });
});

describe("ROUTES", () => {
  it("is exactly the NAV_ENTRIES hrefs, in order", () => {
    expect(ROUTES).toEqual(NAV_ENTRIES.map((s) => s.href));
  });

  it("covers the eleven routes the bar carries", () => {
    expect([...ROUTES]).toEqual([
      "/",
      "/beware",
      "/contradictions",
      "/timeline",
      "/network",
      "/track",
      "/method",
      "/flows",
      "/sources",
      "/pools",
      "/reveal",
    ]);
  });
});

describe("screenByHref", () => {
  it("finds every route in the table", () => {
    for (const href of ROUTES) {
      expect(screenByHref(href)?.href, href).toBe(href);
    }
  });

  it("returns undefined for an unknown href", () => {
    expect(screenByHref("/nope")).toBeUndefined();
    expect(screenByHref("")).toBeUndefined();
    expect(screenByHref("/beware/")).toBeUndefined();
    // Dev-only surfaces are deliberately absent from the public screen table.
    expect(screenByHref("/dev/primitives")).toBeUndefined();
  });
});

describe("isActive", () => {
  it("matches / exactly and nothing else", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/beware", "/")).toBe(false);
    expect(isActive("/track/t1abc", "/")).toBe(false);
  });

  it("matches a section against itself", () => {
    expect(isActive("/beware", "/beware")).toBe(true);
  });

  it("matches a section subtree", () => {
    expect(isActive("/beware/x", "/beware")).toBe(true);
    expect(isActive("/beware/x/y", "/beware")).toBe(true);
    // The HANDOFF-04 case the matcher exists for.
    expect(isActive("/track/t1abcdef", "/track")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(isActive("/bewarex", "/beware")).toBe(false);
    expect(isActive("/beware-not", "/beware")).toBe(false);
  });

  it("does not match an unrelated section", () => {
    expect(isActive("/sources", "/beware")).toBe(false);
    expect(isActive("/", "/beware")).toBe(false);
  });

  it("lights the sub-views that have no entry of their own against /track", () => {
    // These three are dynamic segments - one page per value - so a bar cannot
    // carry them and /track stands in.
    expect(isActive("/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo", "/track")).toBe(true);
    expect(isActive("/tx/7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c", "/track")).toBe(true);
    expect(isActive("/block/3191051", "/track")).toBe(true);
  });

  it("stops lighting /track for the two routes that now have their own entry", () => {
    // HANDOFF-04a: /pools and /reveal left TRACK_FAMILY when they gained
    // entries. Leaving them in would light two rows at once - the view's own
    // and its former parent's - which is the defect the next test measures.
    expect(isActive("/pools", "/track")).toBe(false);
    expect(isActive("/reveal", "/track")).toBe(false);
    expect(isActive("/pools", "/pools")).toBe(true);
    expect(isActive("/reveal", "/reveal")).toBe(true);
  });

  it("lights exactly one nav entry for every shipped route", () => {
    for (const pathname of ROUTES) {
      const lit = ROUTES.filter((href) => isActive(pathname, href));
      expect(lit, `${pathname} lit ${lit.join(", ")}`).toEqual([pathname]);
    }
  });
});
