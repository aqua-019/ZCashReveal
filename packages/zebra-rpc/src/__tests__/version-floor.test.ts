/**
 * The version floor, in both polarities and at the boundary.
 *
 * WHAT THIS FILE IS GUARDING AGAINST, stated so a later reader does not read it
 * as a parser test. A floor that only ever passes is the same defect as a
 * healthcheck that cannot fail (`apps/publisher/docker-healthcheck.mjs` carries
 * the same note) and as a fail-side probe that does not fail (CLAUDE.md makes
 * that a finding in its own right). So every case below that asserts a pass has
 * a sibling that asserts the corresponding failure, and the two most important
 * cases are the ones that are neither:
 *
 *   - `6.2.3` must FAIL. It is the tag this repository pinned until LEDGER-10
 *     Q1 and it is the nearest thing to the floor that is below it. A floor
 *     that admits the version it was written to exclude is decoration.
 *   - a string this parser cannot read must be UNPARSED, not `false` and
 *     certainly not `true`. "I could not tell" is a third outcome.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ZEBRA_MAX_VERSION,
  ZEBRA_MAX_VERSION_STRING,
  ZEBRA_MIN_VERSION,
  ZEBRA_MIN_VERSION_STRING,
  checkZebraVersionFloor,
  compareZebraVersion,
  describeVersionFloorVerdict,
  parseZebraVersion,
} from "../version-floor.js";

describe("parseZebraVersion", () => {
  it("reads the shape a real node emits", () => {
    // `/Zebra:{release_version}/` - zebrad/src/application.rs:160-162 at v6.3.0,
    // handed to getinfo's `subversion` verbatim.
    expect(parseZebraVersion("/Zebra:6.3.0/")).toEqual({ major: 6, minor: 3, patch: 0 });
  });

  it("reads the tolerated spellings", () => {
    expect(parseZebraVersion("Zebra:6.3.1")).toEqual({ major: 6, minor: 3, patch: 1 });
    expect(parseZebraVersion("/Zebra: v6.4.2/")).toEqual({ major: 6, minor: 4, patch: 2 });
    expect(parseZebraVersion("6.3.0")).toEqual({ major: 6, minor: 3, patch: 0 });
    expect(parseZebraVersion("v6.3.0")).toEqual({ major: 6, minor: 3, patch: 0 });
  });

  it("returns null rather than guessing", () => {
    expect(parseZebraVersion("/MagicBean:5.4.2/")).toBeNull();
    expect(parseZebraVersion("")).toBeNull();
    expect(parseZebraVersion("Zebra")).toBeNull();
    expect(parseZebraVersion("/Zebra:6.3/")).toBeNull();
  });
});

describe("compareZebraVersion", () => {
  it("orders by field and not lexicographically", () => {
    // The case a string comparison gets wrong, and the one this project will
    // actually reach: "6.10.0" < "6.9.0" is true of strings.
    const ten = { major: 6, minor: 10, patch: 0 };
    const nine = { major: 6, minor: 9, patch: 0 };
    expect(compareZebraVersion(ten, nine)).toBeGreaterThan(0);
    expect("6.10.0" < "6.9.0").toBe(true);
  });

  it("is zero on equality and signed on each field", () => {
    expect(compareZebraVersion(ZEBRA_MIN_VERSION, { major: 6, minor: 3, patch: 0 })).toBe(0);
    expect(compareZebraVersion({ major: 5, minor: 9, patch: 9 }, ZEBRA_MIN_VERSION)).toBeLessThan(0);
    expect(compareZebraVersion({ major: 6, minor: 3, patch: 1 }, ZEBRA_MIN_VERSION)).toBeGreaterThan(0);
  });
});

describe("checkZebraVersionFloor", () => {
  it("PASS SIDE: the pinned node clears the floor", () => {
    const v = checkZebraVersionFloor("/Zebra:6.3.0/");
    expect(v.ok).toBe(true);
    expect(v.version).toEqual({ major: 6, minor: 3, patch: 0 });
    expect(describeVersionFloorVerdict(v)).toContain("at or above");
  });

  it("PASS SIDE: a newer node clears it", () => {
    expect(checkZebraVersionFloor("/Zebra:6.4.0/").ok).toBe(true);
    expect(checkZebraVersionFloor("/Zebra:7.0.0/").ok).toBe(true);
  });

  it("FAIL SIDE: 6.2.3 - the tag this repository pinned until LEDGER-10 Q1 - is below the floor", () => {
    const v = checkZebraVersionFloor("/Zebra:6.2.3/");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe("below-floor");
    expect(describeVersionFloorVerdict(v)).toContain("BELOW");
    expect(describeVersionFloorVerdict(v)).toContain(ZEBRA_MIN_VERSION_STRING);
  });

  it("FAIL SIDE: 4.4.1, the tag compose carried before HANDOFF-10, is below the floor", () => {
    const v = checkZebraVersionFloor("/Zebra:4.4.1/");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe("below-floor");
  });

  it("THIRD OUTCOME: an unreadable subversion is UNPARSED, never a silent pass", () => {
    const v = checkZebraVersionFloor("/MagicBean:5.4.2/");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe("unparsed");
    expect(v.version).toBeNull();
    expect(describeVersionFloorVerdict(v)).toContain("UNVERIFIED");
    expect(describeVersionFloorVerdict(v)).toContain("not a pass");
  });

  it("the boundary is inclusive, and one patch below it is not", () => {
    expect(checkZebraVersionFloor("/Zebra:6.3.0/").ok).toBe(true);
    expect(checkZebraVersionFloor("/Zebra:6.2.999/").ok).toBe(false);
  });

  it("an explicit floor overrides the declared one, both ways", () => {
    const strict = { major: 7, minor: 0, patch: 0 };
    expect(checkZebraVersionFloor("/Zebra:6.3.0/", strict).ok).toBe(false);
    expect(checkZebraVersionFloor("/Zebra:6.3.0/", { major: 6, minor: 0, patch: 0 }).ok).toBe(true);
  });
});

describe("ROUND 5: each bound is ONE declaration, so the static and runtime readers cannot drift", () => {
  /**
   * THE SPLIT RAN DOWN THE READER BOUNDARY. The version object and its string
   * were independent literals: the runtime comparators read the OBJECT and both
   * static gates - `check-compose-zebra-tag.mjs` and `scripts/preflight-rpc.mjs`
   * - parse the STRING out of the source file. A hand edit to one and not the
   * other gives a compose pin the guard passes and a live node the runtime
   * refuses, with every check green. Two gate reviewers also MISREAD the pair,
   * both reporting the object as 6.9.0 when it was 6.3.0, which is its own
   * evidence that two declarations of one number is a shape readers get wrong.
   * The objects are derived now, and this pins the derivation.
   */
  const render = (v: { major: number; minor: number; patch: number }) => `${v.major}.${v.minor}.${v.patch}`;

  it("the floor object renders back to the floor string, exactly", () => {
    expect(render(ZEBRA_MIN_VERSION)).toBe(ZEBRA_MIN_VERSION_STRING);
  });

  it("the ceiling object renders back to the ceiling string, exactly", () => {
    expect(render(ZEBRA_MAX_VERSION)).toBe(ZEBRA_MAX_VERSION_STRING);
  });

  it("what the STATIC readers parse out of the source is what the RUNTIME compares", () => {
    // The static readers' own regex, run against the real file, compared with
    // the values the module exports. This is the drift the derivation removes,
    // asserted end to end rather than argued.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../version-floor.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const lo = /^export const ZEBRA_MIN_VERSION_STRING\s*=\s*"(\d+\.\d+\.\d+)"/m.exec(src);
    const hi = /^export const ZEBRA_MAX_VERSION_STRING\s*=\s*"(\d+\.\d+\.\d+)"/m.exec(src);
    expect(lo?.[1]).toBe(render(ZEBRA_MIN_VERSION));
    expect(hi?.[1]).toBe(render(ZEBRA_MAX_VERSION));
  });
});
