// @vitest-environment jsdom
/**
 * A3 - the web side, handed the document RPC-only mode actually publishes.
 *
 * WHAT IS NEW HERE, GIVEN THAT `plane.test.ts` ALREADY COVERS NULL AGAINST A
 * MEASURED ZERO. That suite drives one panel at a time out of the fixture
 * snapshot, which carries every panel measured. Nothing in this repository had
 * ever handed the web side the SHAPE the publisher now emits: three panels null
 * TOGETHER, `residual` measured, and the whole thing validated by
 * `snapshotV1Schema` rather than hand-built to be convenient.
 *
 * THAT DISTINCTION IS LEDGER-11's SEAM RULE. Two suites can be exhaustive about
 * a type and both wrong about the wire, because each builds its own input. The
 * document below is built the way the publisher builds one - every
 * database-derived panel null at once, `residual` present, five lanes from a
 * node - and then put through the real schema, so a shape the publisher can emit
 * and the site cannot render fails HERE rather than on the page.
 *
 * THE ADVERSARIAL QUESTION THROUGHOUT IS SECTION 6's: does this render an
 * absence, or a zero?
 */
import { cleanup, render } from "@testing-library/react";
import { snapshotV1Schema, type SnapshotV1 } from "@zcashreveal/types";
import { afterEach, describe, expect, it } from "vitest";

import { EpochClock } from "@/components/ui/EpochClock";
import { NotMeasured } from "@/components/ui/NotMeasured";
import { fixtureSnapshot } from "@/lib/api/fixtures/snapshot";
import { tipFromSnapshot } from "@/lib/chain";
import { buildPlane, trafficLine } from "@/lib/plane";
import { SNAPSHOT_SOURCES } from "@/lib/snapshot/source";

afterEach(cleanup);

/** The three panels that read a table, and are therefore absent on RPC alone. */
const DATABASE_DERIVED = ["drain", "migrationHist", "neffSeries"] as const;

/**
 * `residual` AS RPC-ONLY MODE PUBLISHES IT, AND IT IS SET RATHER THAN INHERITED.
 *
 * THE COMMITTED FIXTURE CARRIES `residual: null` (`lib/api/fixtures/snapshot.ts`
 * line 93), which is worth stating plainly because it means the panel this rung
 * turns ON is a panel `zcuck.xyz` renders as an absence TODAY. A first draft of
 * this file built the RPC-only document by nulling three panels out of the
 * fixture and asserting the fourth was measured; it failed, correctly, because
 * the fourth was already null and nothing had set it.
 *
 * The figures are `turnstileResidual`'s own arithmetic over the fixture's lanes:
 * `U = Bal^sprout + Bal^orchard`, and a supply the node reported. Written out
 * rather than computed here, because a test that recomputes the estimator is
 * asserting its own arithmetic rather than the document's shape.
 */
const RPC_ONLY_RESIDUAL = {
  unprovableZat: 48_796_086_000_000n,
  supplyZat: 1_699_996_891_000_000n,
  supplySource: "getblockchaininfo chainSupply at height 3469371",
  unprovableShare: 0.0287,
  verifiedShare: 0.9713,
};

/**
 * The document RPC-only mode publishes, through the real schema.
 *
 * BUILT FROM THE FIXTURE, so the fields RPC-only mode does NOT change - the
 * lanes, the hash, the timestamps - are the ones already pinned elsewhere and
 * this file is about the three that go null and the one that becomes present.
 */
function rpcOnlyDocument(over: Partial<SnapshotV1> = {}): SnapshotV1 {
  return snapshotV1Schema.parse({
    ...fixtureSnapshot(),
    residual: RPC_ONLY_RESIDUAL,
    drain: null,
    migrationHist: null,
    neffSeries: null,
    ...over,
  });
}

describe("A3 - the RPC-only document, as the site receives it", () => {
  it("validates against the real schema with three panels null and `residual` measured", () => {
    // THE SEAM, CHECKED FIRST. A document the publisher can emit and the schema
    // rejects would be a runtime fault on the page rather than a test failure,
    // and it is the one thing nothing else in this repository looks at.
    const doc = rpcOnlyDocument();
    for (const panel of DATABASE_DERIVED) {
      expect(doc[panel], `${panel} is absent on RPC alone`).toBeNull();
    }
    // NOT FOUR. `turnstileResidual` takes the pool balances and a supply figure,
    // and both arrive on `getblockchaininfo`, so this rung publishes the
    // unprovable-supply figure live.
    expect(doc.residual).not.toBeNull();
    expect(doc.residual?.supplySource).toContain("getblockchaininfo");
    expect(doc.pools).toHaveLength(5);

    // AND THE PANEL THIS RUNG TURNS ON IS ABSENT ON THE PAGE TODAY. The
    // committed fixture carries `residual: null`, so `zcuck.xyz` currently
    // renders the unprovable-supply figure as a stated absence. That is the
    // measurable difference this rung makes to a reader, and it is asserted
    // rather than described so it cannot quietly stop being true.
    expect(fixtureSnapshot().residual).toBeNull();
  });

  it("the plane renders a NAMED ABSENCE, with a condition and no zero anywhere", () => {
    const plane = buildPlane(rpcOnlyDocument());

    expect(plane.marks).toHaveLength(0);
    expect(plane.reading).toBeNull();
    expect(plane.absence).not.toBeNull();
    expect(plane.absence?.condition).toMatch(/no migration window was read/);
    // A CONDITION AND NEVER AN OWNER (`NotMeasured`'s own rule): an owner is a
    // live statement that decays, and a prediction outliving its subject reads
    // as a fact.
    expect(plane.absence?.condition).not.toMatch(/HANDOFF|publisher|indexer|gateway/i);

    // NO LANE RENDERS A ZERO FOR A BOUNDARY NOTHING MEASURED. "0 crossings" and
    // "not measured" look alike on a screen and are opposite claims.
    for (const node of plane.nodes) {
      const line = trafficLine(node.traffic);
      expect(node.traffic.kind, `${node.lane} on an RPC-only document`).toBe("not-measured");
      expect(line, `${node.lane} rendered a zero`).not.toMatch(/\b0\b/);
    }
  });

  it("A3 FAIL SIDE, by DATA: a MEASURED zero renders differently from the absence", () => {
    // THE MEMBER OF A3's EXCLUSION SET. A window that was read and held no
    // crossing is a MEASUREMENT of zero - "nothing crossed in a day" - and the
    // absence is "nobody looked". They must not render the same, or the fix for
    // one is indistinguishable from the other.
    const base = fixtureSnapshot().migrationHist;
    if (base === null) throw new Error("the fixture must carry a migrationHist for this fail side to exist");

    const absent = buildPlane(rpcOnlyDocument());
    const measuredZero = buildPlane(
      rpcOnlyDocument({ migrationHist: { ...base, canonicalCount: 0, nonCanonicalCount: 0 } }),
    );

    // Both draw no marks - which is exactly why the marks cannot be the
    // discriminator, and why this test reads the READING instead.
    expect(absent.marks).toHaveLength(0);
    expect(measuredZero.marks).toHaveLength(0);

    expect(absent.reading).toBeNull();
    expect(measuredZero.reading).not.toBeNull();
    expect(measuredZero.reading?.countedCrossings).toBe(0);
    // The measured zero still states its WINDOW, so a reader can tell "nothing
    // crossed in a day" from "nothing crossed in one block".
    expect(measuredZero.reading?.windowBlocks).toBeGreaterThan(0);

    // And the two lanes of the measured relation say measured-zero rather than
    // not-measured, which is the same distinction one layer down.
    const orchard = (p: ReturnType<typeof buildPlane>) => p.nodes.find((n) => n.lane === "orchard");
    expect(orchard(absent)?.traffic.kind).toBe("not-measured");
    expect(orchard(measuredZero)?.traffic.kind).toBe("measured-zero");
    expect(trafficLine(orchard(absent)!.traffic)).not.toBe(
      trafficLine(orchard(measuredZero)!.traffic),
    );
  });

  it("`NotMeasured` states the panel and the condition, and prints no figure", () => {
    // The three absences `/pools` renders for exactly this document. Asserted
    // through the component rather than by reading the page, so the rendered
    // TEXT is what carries the claim.
    for (const [panel, condition] of [
      ["drain", "no block time or no baseline for this height"],
      ["migration histogram", "no migration window was read"],
      ["N_eff series", "no Ironwood spend in the window could be bounded"],
    ] as const) {
      render(<NotMeasured panel={panel} condition={condition} />);
      const el = document.querySelector('[data-ui="not-measured"]');
      expect(el?.textContent, panel).toContain(`${panel}: not measured`);
      expect(el?.textContent, panel).toContain(condition);
      // NO DIGIT AT ALL. A "0" beside "not measured" is the fabrication this
      // component exists to prevent, and the check is on the rendered string
      // rather than on the props.
      expect(el?.textContent, `${panel} printed a figure`).not.toMatch(/\d/);
      cleanup();
    }
  });

  it("the system bar names the resolved rung, for every rung the order can answer with", () => {
    // A3's other half: `source:` names WHICH rung answered. Swept over the
    // type's own list rather than over a hand-written subset, so a fifth rung
    // cannot arrive without a case (LEDGER-09a Q3).
    const doc = rpcOnlyDocument();
    const tip = tipFromSnapshot({ height: doc.height, hash: doc.hash, time: doc.time });
    expect(SNAPSHOT_SOURCES).toHaveLength(4);

    for (const source of SNAPSHOT_SOURCES) {
      render(<EpochClock tip={tip} status={{ source, faults: [] }} />);
      const stale = document.querySelector('[data-ui="staleness"]');
      expect(stale?.getAttribute("data-source"), source).toBe(source);
      expect(stale?.textContent, source).toContain(`source: ${source}`);
      // AND THE AGE AGREES WITH THE RUNG, which is deliverable 4 seen from
      // here: only the bundled document is unknown.
      expect(stale?.getAttribute("data-age"), source).toBe(
        source === "fixture" ? "unknown" : "0",
      );
      cleanup();
    }
  });
});
