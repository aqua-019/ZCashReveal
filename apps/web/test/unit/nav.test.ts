/**
 * The screen table is the single source for the system bar, the route set, the
 * page metadata and the assertion A7 route walk. A duplicate href or a stray
 * index would desynchronise all four at once, so the shape is asserted here
 * rather than trusted.
 */
import { describe, expect, it } from "vitest";

import { ROUTES, SCREENS, isActive, screenByHref } from "@/lib/nav";

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

describe("ROUTES", () => {
  it("is exactly the SCREENS hrefs, in order", () => {
    expect(ROUTES).toEqual(SCREENS.map((s) => s.href));
  });

  it("covers the nine routes the scaffold ships", () => {
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

  it("lights exactly one nav entry for every shipped route", () => {
    for (const pathname of ROUTES) {
      const lit = ROUTES.filter((href) => isActive(pathname, href));
      expect(lit, `${pathname} lit ${lit.join(", ")}`).toEqual([pathname]);
    }
  });
});
