/**
 * HANDOFF-18 - THE SEAM BETWEEN THE PRODUCER AND THE PLANE, RUN AS A ROUND TRIP.
 *
 * ============================================================================
 * WHY IT LIVES IN `apps/web` AND REACHES ACROSS, WHICH IS DELIBERATE
 * ============================================================================
 * `markFor` decides which way a live mark points by parsing `MempoolRow.flow`,
 * a string this file's own `mempoolRow` writes. That is a seam between two
 * processes, and CLAUDE.md's LEDGER-11 records four defects of exactly this
 * shape - each covered by tests on BOTH sides, each invisible, because every
 * test BUILT ITS OWN INPUT rather than taking the other side's output.
 *
 * The instrument that finds them is to make one side ACTUALLY PRODUCE the value
 * and hand it to the other: the real `mempoolRow` builds the row and the real
 * `markFor` reads it.
 *
 * THE FIRST DRAFT PUT THIS IN `apps/gateway/src/__tests__/` AND `pnpm build`
 * REFUSED IT: that package sets `rootDir: "./src"` and `composite: true`, so a
 * file under it may not import `apps/web`. `apps/web` sets no `rootDir` and
 * `noEmit`, and `next build` never compiles `test/`, so the reach is legal in
 * this direction and only in this direction. Caught by `pnpm build`, which runs
 * BEFORE `pnpm typecheck` for exactly this class of thing (LEDGER-15) - vitest
 * had resolved it happily.
 *
 * The coupling is TEST-ONLY and is stated rather than hidden: no module under
 * `apps/web/src` imports `apps/gateway`, and nothing shipped to a browser does.
 *
 * ============================================================================
 * WHAT IT CAUGHT, AND WHY THE COMMENT ALONE WAS NOT ENOUGH
 * ============================================================================
 * HANDOFF-17 fixed a `migration` drawing the wrong ARC by requiring the row to
 * name orchard and ironwood. That closed the PAIR and left the DIRECTION open,
 * because `lanes` is an unordered SET: driven through this producer, BOTH
 * directions of the ZIP 318 crossing emit `lanes: ["orchard","ironwood"]` - the
 * same array, in the same canonical order - and differ only in `flow`. So a
 * reversed row drew orchard-to-ironwood beside a cell reading "I to O".
 *
 * HANDOFF-18 quoted that capture in a docblock and hand-built every test row
 * from a local helper, which a gate reviewer noted is a comment rather than a
 * check. This file is the check.
 */
import { describe, expect, it } from "vitest";

import { markFor } from "@/lib/live-plane";

import { mempoolRow } from "../../../gateway/src/views/mempool.js";
import { FEE, NOW, ZEC, report } from "../../../gateway/src/__tests__/leak-report-fixture.js";

/** Positive means value LEFT the pool, so `from` is the source. */
function crossing(from: "sprout" | "sapling" | "orchard" | "ironwood", to: "sprout" | "sapling" | "orchard" | "ironwood") {
  // HEX, because `report` runs the txid through `asHex` and "oi" is not a hex
  // string. The first draft of this helper keyed the txid off the pool initials
  // and every case died in the fixture rather than in the code under test - a
  // probe failing for its own reasons, recorded rather than quietly repaired.
  const HEX: Readonly<Record<string, string>> = { sprout: "a", sapling: "b", orchard: "c", ironwood: "d" };
  return report({
    txid: `${HEX[from] ?? "e"}${HEX[to] ?? "f"}`,
    perPoolZat: [
      { pool: from, deltaZat: ZEC },
      { pool: to, deltaZat: -(ZEC - FEE) },
    ],
    // The decoded bundles have to light the same lanes the deltas name, or the
    // row would contradict itself before it reached the plane.
    ...(from === "sapling" || to === "sapling" ? { saplingSpends: 1 } : {}),
    ...(from === "orchard" || to === "orchard" ? { orchardActions: 1 } : {}),
    ...(from === "ironwood" || to === "ironwood" ? { ironwoodActions: 1 } : {}),
  });
}

const POOLS = ["sapling", "orchard", "ironwood"] as const;

describe("the producer's row, read by the plane, draws the pair the producer named", () => {
  it("BOTH directions of the ZIP 318 crossing emit the IDENTICAL lane set", () => {
    // THE MEASUREMENT THE WHOLE R2-1 FIX RESTS ON, executed rather than quoted.
    // If these two ever differ, a reader of `lanes` could tell them apart and
    // the argument for parsing `flow` weakens; today it cannot.
    const forward = mempoolRow(crossing("orchard", "ironwood"), NOW);
    const reversed = mempoolRow(crossing("ironwood", "orchard"), NOW);

    expect(forward.class).toBe("migration");
    expect(reversed.class).toBe("migration");
    expect(forward.lanes).toStrictEqual(reversed.lanes);
    expect(forward.flow).toBe("O to I");
    expect(reversed.flow).toBe("I to O");
  });

  it("and the plane draws each one the way its own cell reads", () => {
    expect(markFor(mempoolRow(crossing("orchard", "ironwood"), NOW))).toStrictEqual({
      kind: "crossing",
      from: "orchard",
      to: "ironwood",
    });
    expect(markFor(mempoolRow(crossing("ironwood", "orchard"), NOW))).toStrictEqual({
      kind: "crossing",
      from: "ironwood",
      to: "orchard",
    });
  });

  it("every ordered pair the producer can emit round-trips to the pair it named", () => {
    // ITERATING THE PAIRS RATHER THAN SAMPLING TWO, so a new pool cannot arrive
    // with a letter the browser's parser silently declines - which would draw
    // nothing for a crossing the producer described.
    for (const from of POOLS) {
      for (const to of POOLS) {
        if (from === to) continue;
        const wire = mempoolRow(crossing(from, to), NOW);
        expect(wire.class, `${from}->${to} class`).toBe("migration");
        expect(markFor(wire), `${from}->${to} flow=${wire.flow}`).toStrictEqual({
          kind: "crossing",
          from,
          to,
        });
      }
    }
  });

  it("the drawn arc never contradicts the cell printed beside it", () => {
    // The property in the form a reader would state it: whatever the plane
    // draws, the flow cell says the same thing. This is what R2-1 violated.
    for (const from of POOLS) {
      for (const to of POOLS) {
        if (from === to) continue;
        const wire = mempoolRow(crossing(from, to), NOW);
        const shape = markFor(wire);
        if ("undrawn" in shape || shape.kind !== "crossing") throw new Error(`no crossing for ${wire.flow}`);
        const initial = { sprout: "P", sapling: "S", orchard: "O", ironwood: "I" } as const;
        expect(wire.flow).toBe(`${initial[shape.from as keyof typeof initial]} to ${initial[shape.to as keyof typeof initial]}`);
      }
    }
  });
});
