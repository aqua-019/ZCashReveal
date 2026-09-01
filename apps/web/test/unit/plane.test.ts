/**
 * ASSERTIONS A1, A8, A9, A11 AND A12 - the turnstile plane, as arithmetic.
 *
 * The plane is a pure function of a snapshot, which is what makes these
 * checkable without a browser at all. The e2e half (test/e2e/legibility.spec.ts)
 * checks that the rendered page agrees with what this file computes; this file
 * checks that what it computes is honest.
 *
 * THE ONE THING THIS FILE IS REALLY ABOUT is the line between a measurement and
 * an absence. `SnapshotV1` carries ONE crossing count - the ZIP 318 migration
 * lens, Orchard to Ironwood - and no per-crossing amount, time or confirmation
 * state at all. Every assertion below is a way of saying that the picture may
 * not claim more than that:
 *
 *   A8  - a lane outside the measured relation says "not measured", never "0".
 *   A9  - a capped board states the count it measured, not the count it drew.
 *   A11 - every mark is the same weight, because nothing distinguishes them.
 *   A12 - the plane is a function of the document and of nothing else.
 *   A1  - the four renderings of the crossing count are one derivation.
 */
import { snapshotV1Schema, type SnapshotV1 } from "@zcashreveal/types";
import { describe, expect, it } from "vitest";

import { fixtureSnapshot } from "@/lib/api/fixtures/snapshot";

import {
  LANE_ORDER,
  MEASURED_CROSSINGS,
  SPLASH_N_MAX,
  buildPlane,
  trafficByLane,
  trafficLine,
} from "@/lib/plane";

/**
 * `JSON.stringify` throws on a `bigint`, and a plane carries one per node
 * (`balanceZat`). Serialising through a replacer rather than stripping the
 * field, because the balances are part of what determinism is a claim about.
 */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

/** A snapshot with the fields under test overridden, still schema-valid. */
function withHist(over: Partial<SnapshotV1>): SnapshotV1 {
  return snapshotV1Schema.parse({ ...fixtureSnapshot(), ...over });
}

const BASE = fixtureSnapshot();
const HIST = BASE.migrationHist;
if (HIST === null) throw new Error("the fixture snapshot must carry a migrationHist for these tests to mean anything");
const COUNTED = HIST.canonicalCount + HIST.nonCanonicalCount;

describe("the fixture the assertions run against", () => {
  it("carries a crossing count larger than the board holds", () => {
    // Every capped-board assertion below is vacuous if this is false, so it is
    // checked rather than assumed.
    expect(COUNTED).toBeGreaterThan(SPLASH_N_MAX);
  });

  it("carries all five lanes", () => {
    expect(BASE.pools.map((p) => p.lane).sort()).toEqual([...LANE_ORDER].sort());
  });

  it("measures exactly one crossing relation", () => {
    // The whole honesty argument rests on this being one, so a second entry
    // arriving without a field to back it fails here first.
    expect(MEASURED_CROSSINGS).toHaveLength(1);
    expect(MEASURED_CROSSINGS[0]).toEqual(["orchard", "ironwood"]);
  });
});

/* -------------------------------------------------------------------- A8 */

describe("A8: four honest states, and no unmeasured zero", () => {
  it("state 1 - crossings measured: the relation's two lanes carry counts", () => {
    const plane = buildPlane(BASE);
    const orchard = plane.nodes.find((n) => n.lane === "orchard");
    const ironwood = plane.nodes.find((n) => n.lane === "ironwood");
    expect(orchard?.traffic).toEqual({ kind: "measured", out: COUNTED, in: 0 });
    expect(ironwood?.traffic).toEqual({ kind: "measured", out: 0, in: COUNTED });
  });

  it("state 2 - a null migrationHist draws nothing and states its condition", () => {
    const plane = buildPlane(withHist({ migrationHist: null }));
    expect(plane.marks).toHaveLength(0);
    expect(plane.reading).toBeNull();
    expect(plane.absence).not.toBeNull();
    expect(plane.absence?.condition).toMatch(/no migration window was read/);
    // The condition, and no owner. SNAPSHOT.md section 8.1.
    expect(plane.absence?.condition).not.toMatch(/HANDOFF|publisher|indexer|gateway/i);
  });

  it("state 3 - a window whose count is zero is a MEASURED zero and says so", () => {
    const plane = buildPlane(
      withHist({ migrationHist: { ...HIST, canonicalCount: 0, nonCanonicalCount: 0 } }),
    );
    expect(plane.marks).toHaveLength(0);
    expect(plane.reading?.countedCrossings).toBe(0);
    const orchard = plane.nodes.find((n) => n.lane === "orchard");
    expect(orchard?.traffic.kind).toBe("measured-zero");
    expect(trafficLine(orchard!.traffic)).toBe("closed - 0 crossings in window");
    // And the reading still states the window, so a reader can tell "nothing
    // crossed in a day" from "nothing crossed in a block".
    expect(plane.reading?.windowBlocks).toBeGreaterThan(0);
  });

  it("state 4 - a lane outside the relation is NOT MEASURED, and never zero", () => {
    const plane = buildPlane(BASE);
    for (const lane of ["transparent", "sprout", "sapling"] as const) {
      const n = plane.nodes.find((x) => x.lane === lane);
      expect(n?.traffic.kind, `${lane} traffic kind`).toBe("not-measured");
      const line = trafficLine(n!.traffic);
      expect(line, `${lane} line`).toMatch(/not measured/);
      // THE LOAD-BEARING HALF. "0 crossings" and "not measured" look alike on a
      // screen and are opposite claims. This lane's boundary is not in the
      // document at all, so a zero here would be a measurement the instrument
      // never took.
      expect(line, `${lane} rendered a zero for a boundary nothing measured`).not.toMatch(/\b0\b/);
    }
  });

  it("no state renders an unmeasured quantity as a zero, over every state at once", () => {
    // Stated as a sweep rather than four separate checks, because the defect is
    // a property of the whole rendering and not of any one branch.
    const states: readonly (readonly [string, SnapshotV1])[] = [
      ["measured", BASE],
      ["null hist", withHist({ migrationHist: null })],
      ["zero count", withHist({ migrationHist: { ...HIST, canonicalCount: 0, nonCanonicalCount: 0 } })],
    ];
    for (const [name, snap] of states) {
      for (const n of buildPlane(snap).nodes) {
        const line = trafficLine(n.traffic);
        if (n.traffic.kind === "not-measured") {
          expect(line, `${name}/${n.lane}`).not.toMatch(/\b0\b/);
        }
      }
    }
  });

  it("the fail side: the study's own rendering is a member of the exclusion set", () => {
    // A DATA MUTATION drawn from the specification rather than invented. The
    // approved study prints "closed - 0 crossings in window" under `sprout`,
    // whose EDGES table contains no sprout edge - a measured zero for a
    // relation it never had, two lines under its own comment saying "a pair
    // that cannot occur is absent, never drawn at zero". If `trafficLine` gave
    // that answer for a `not-measured` lane, this build would carry the same
    // defect, and this is the check that would see it.
    const asStudyRenders = "closed - 0 crossings in window";
    expect(trafficLine({ kind: "measured-zero" })).toBe(asStudyRenders);
    expect(trafficLine({ kind: "not-measured" })).not.toBe(asStudyRenders);
  });

  it("a lane the document omits is not drawn at all, rather than drawn empty", () => {
    const plane = buildPlane(withHist({ pools: BASE.pools.filter((p) => p.lane !== "sprout") }));
    expect(plane.nodes.map((n) => n.lane)).not.toContain("sprout");
    expect(plane.nodes).toHaveLength(4);
  });
});

/* -------------------------------------------------------------------- A9 */

describe("A9: a capped board states the count it measured, not the count it drew", () => {
  it("caps the marks at N_MAX", () => {
    const plane = buildPlane(BASE);
    expect(plane.marks).toHaveLength(SPLASH_N_MAX);
    expect(plane.reading?.drawnMarks).toBe(SPLASH_N_MAX);
  });

  it("keeps the measured count on the reading, unchanged by the cap", () => {
    const plane = buildPlane(BASE);
    expect(plane.reading?.countedCrossings).toBe(COUNTED);
    expect(plane.reading?.capped).toBe(true);
    // The two are different numbers and both are on the reading. That is the
    // whole assertion: a header that carried only `drawnMarks` would report 42
    // for a chain that did 1,284, and a board holding 42 marks would look
    // identical at either rate.
    expect(plane.reading?.drawnMarks).not.toBe(plane.reading?.countedCrossings);
  });

  it("says, in words, that what is drawn is a sample", () => {
    const plane = buildPlane(BASE);
    expect(plane.capNote).not.toBeNull();
    expect(plane.capNote).toContain(COUNTED.toLocaleString("en"));
    expect(plane.capNote).toContain(String(SPLASH_N_MAX));
  });

  it("does not claim a cap when there is none", () => {
    const small = withHist({ migrationHist: { ...HIST, canonicalCount: 9, nonCanonicalCount: 0 } });
    const plane = buildPlane(small);
    expect(plane.marks).toHaveLength(9);
    expect(plane.reading?.capped).toBe(false);
    expect(plane.reading?.countedCrossings).toBe(9);
    expect(plane.capNote).toBeNull();
  });

  it("the fail side: the drawn count substituted for the measured one", () => {
    // The exclusion set names the pair "marks capped, header reports only the
    // number drawn". This is that member, constructed: if the reading's two
    // fields were the same value at a rate where they must differ, the header
    // could not tell a busy chain from a quiet one. The check is that they are
    // independent, so the substitution is visible.
    const busy = buildPlane(BASE);
    const quiet = buildPlane(withHist({ migrationHist: { ...HIST, canonicalCount: 42, nonCanonicalCount: 0 } }));
    expect(busy.marks.length, "two very different chains drew the same number of marks").toBe(quiet.marks.length);
    expect(
      busy.reading?.countedCrossings,
      "and the reading is the only thing that tells them apart, so it must differ",
    ).not.toBe(quiet.reading?.countedCrossings);
  });

  it("states the window in blocks, inclusive of both ends", () => {
    const plane = buildPlane(BASE);
    expect(plane.reading?.windowBlocks).toBe(HIST.highHeight - HIST.lowHeight + 1);
    // A one-block window is one block, not zero. The off-by-one here would be
    // invisible on a 1,152-block window and wrong on every short one.
    const oneBlock = withHist({ migrationHist: { ...HIST, lowHeight: 3_456_227, highHeight: 3_456_227 } });
    expect(buildPlane(oneBlock).reading?.windowBlocks).toBe(1);
  });
});

/* ------------------------------------------------------------------- A11 */

describe("A11: uniform weight - nothing varies with a quantity the document lacks", () => {
  it("gives every mark the same geometry-independent weight", () => {
    const plane = buildPlane(BASE);
    // The marks carry no width, amount or pending field at all: the type has
    // nowhere to put one. This is the structural half of the assertion - what
    // cannot be rendered cannot be manufactured.
    for (const m of plane.marks) {
      expect(Object.keys(m).sort()).toEqual(["age", "arrow", "d", "depth", "from", "opacity", "to"]);
    }
  });

  it("varies opacity ONLY with position in the window, never with a clock", () => {
    const plane = buildPlane(BASE);
    const byAge = [...plane.marks].sort((a, b) => a.age - b.age);
    // Opacity is a strictly decreasing function of age, and age runs 0..1 over
    // the drawn marks. Both ends are pinned so a constant would fail.
    expect(byAge[0]?.age).toBe(0);
    expect(byAge[byAge.length - 1]?.age).toBe(1);
    for (let i = 1; i < byAge.length; i += 1) {
      expect(byAge[i]!.opacity).toBeLessThan(byAge[i - 1]!.opacity);
    }
  });

  it("draws every mark between the two lanes the document measures", () => {
    for (const m of buildPlane(BASE).marks) {
      expect([m.from, m.to]).toEqual(["orchard", "ironwood"]);
    }
  });

  it("the fail side: a per-mark amount is a member of the exclusion set", () => {
    // If the marks carried an `amount`, a renderer could scale a stroke by it
    // and the picture would state a measurement the snapshot does not hold.
    // The type is the guard, so the probe is over the values: no field on a
    // mark varies except the two that are functions of POSITION.
    const marks = buildPlane(BASE).marks;
    // The four that are functions of POSITION in the window, plus `arrow`,
    // which is `age <= 0.72` and so is one too - the arrowhead drops off the
    // oldest quarter. Everything else must be constant across the board.
    const varying = ["age", "opacity", "d", "depth", "arrow"];
    for (const key of Object.keys(marks[0] ?? {})) {
      if (varying.includes(key)) continue;
      const values = new Set(marks.map((m) => JSON.stringify(m[key as keyof typeof m])));
      expect(values.size, `mark field ${key} varies between marks; only position may`).toBe(1);
    }
  });
});

/* ------------------------------------------------------------------- A12 */

describe("A12: determinism - the plane is a function of the document and nothing else", () => {
  it("builds byte-identical geometry twice from the same snapshot", () => {
    const a = buildPlane(fixtureSnapshot());
    const b = buildPlane(fixtureSnapshot());
    expect(stable(a)).toBe(stable(b));
  });

  it("builds a DIFFERENT plane from a different tip hash", () => {
    // The discriminating half. A `buildPlane` that ignored its input entirely
    // would satisfy the equality above, so the seed has to be shown to reach
    // the geometry.
    const other = withHist({ hash: "0000000005f3a9e7c1b2d4f8a6e3c0d9b7f5a2e4c8d1b6f3a9e7c1b2d4f8ffff" });
    expect(stable(buildPlane(other).marks)).not.toBe(stable(buildPlane(BASE).marks));
  });

  it("does not read the clock", () => {
    // A DATA MUTATION over the environment rather than over the document: if
    // anything in the plane reached for `Date.now`, moving the clock would move
    // the picture. Restored in a finally, so a failure here cannot leak.
    const realNow = Date.now;
    const realDate = globalThis.Date;
    const before = stable(buildPlane(BASE));
    try {
      Date.now = () => 4_102_444_800_000;
      const after = stable(buildPlane(BASE));
      expect(after, "the plane moved when the clock did").toBe(before);
    } finally {
      Date.now = realNow;
      globalThis.Date = realDate;
    }
  });

  it("does not reach for the platform generator", () => {
    // The eslint rule bans the platform generator in source; this proves the
    // ban is not merely unenforced at runtime. It is replaced with a thrower,
    // so a single call is a FAILED TEST rather than a different picture.
    //
    // THE DISABLES BELOW ARE DELIBERATE AND ARE THE POINT OF THE TEST. The
    // rule is `no-restricted-properties` on `Math.random`, and a check that
    // the plane never calls it has to name it. The alternative - reaching it
    // through an alias so the linter cannot see it - is how a guard gets
    // quietly evaded, and this project rates that as a defect in its own
    // right. Three disables, each on the line it excuses, visible in review.
    /* eslint-disable no-restricted-properties */
    const real = Math.random;
    try {
      Math.random = () => {
        throw new Error("the plane called the platform generator");
      };
      expect(() => buildPlane(BASE)).not.toThrow();
    } finally {
      Math.random = real;
    }
    /* eslint-enable no-restricted-properties */
  });
});

/* -------------------------------------------------------------------- A1 */

describe("A1: one source per quantity", () => {
  it("derives the legend, the traffic lines and the reading from one count", () => {
    const plane = buildPlane(BASE);
    const reading = plane.reading;
    expect(reading).not.toBeNull();

    // Sum of every lane's OUT over the whole board. It must equal the count on
    // the reading exactly: the legend renders these, the header renders that,
    // and a reader sees both at once.
    const totalOut = plane.nodes.reduce((a, n) => a + (n.traffic.kind === "measured" ? n.traffic.out : 0), 0);
    const totalIn = plane.nodes.reduce((a, n) => a + (n.traffic.kind === "measured" ? n.traffic.in : 0), 0);
    expect(totalOut).toBe(reading?.countedCrossings);
    expect(totalIn).toBe(reading?.countedCrossings);
  });

  it("keeps the traffic lines and the reading in step at every count", () => {
    // Over a range rather than at one value, because a pair that agrees at the
    // fixture's count and nowhere else is the shape F-04a-7(b) actually took.
    for (const count of [0, 1, 17, 41, 42, 43, 1_284, 5_200]) {
      const plane = buildPlane(withHist({ migrationHist: { ...HIST, canonicalCount: count, nonCanonicalCount: 0 } }));
      const totalOut = plane.nodes.reduce((a, n) => a + (n.traffic.kind === "measured" ? n.traffic.out : 0), 0);
      expect(totalOut, `count ${String(count)}`).toBe(plane.reading?.countedCrossings);
      expect(plane.marks.length, `count ${String(count)} drew the wrong number of marks`).toBe(
        Math.min(count, SPLASH_N_MAX),
      );
      expect(plane.reading?.drawnMarks, `count ${String(count)} reading`).toBe(plane.marks.length);
    }
  });

  it("counts non-canonical crossings, which are a measurement and not an error count", () => {
    // `zip318.ts` calls a crossing outside the canonical ladder "a finding,
    // never a rejection - the chain is the authority on what happened".
    // Dropping it would under-report the traffic the instrument saw.
    const plane = buildPlane(BASE);
    expect(plane.reading?.countedCrossings).toBe(HIST.canonicalCount + HIST.nonCanonicalCount);
    expect(HIST.nonCanonicalCount, "the fixture must carry some, or this check is vacuous").toBeGreaterThan(0);
  });

  it("the fail side: a legend fed from a second source disagrees, and the sum shows it", () => {
    // A DATA MUTATION from inside the exclusion set - "any pair of renderings
    // of one quantity that can disagree". The legend is recomputed from a
    // STALE count, exactly as F-04a-7(b) did, and the sum-against-reading
    // comparison must name the pair rather than pass.
    const plane = buildPlane(BASE);
    const staleTraffic = trafficByLane(17);
    const staleTotalOut = LANE_ORDER.reduce((a, lane) => {
      const t = staleTraffic[lane];
      return a + (t.kind === "measured" ? t.out : 0);
    }, 0);
    expect(staleTotalOut).toBe(17);
    expect(
      staleTotalOut,
      "a legend built from the fixture beside a board built from the document must not agree",
    ).not.toBe(plane.reading?.countedCrossings);
  });
});
