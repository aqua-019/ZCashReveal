// @vitest-environment jsdom
/**
 * Estimate rendering, in a DOM.
 *
 * DELIVERABLE 8 names vitest, testing-library and jsdom, and a gate round found
 * two of the three absent: the estimate-rendering check existed only in
 * Playwright, against a production build. That is stronger evidence about the
 * shipped artefact and it stays - this file does not replace it. What a render
 * test adds is a check that runs in a second, so the contract line "every
 * estimate renders its assumptions and the claim chip" is held at the unit
 * level where a component edit is made rather than only in a suite that builds
 * first.
 *
 * It exists because of what the same gate round found next door: `EstimateCell`
 * rendered a count and a chip and no assumptions at all, and the e2e locator
 * that was supposed to catch that read `[data-estimate]` while the cell emits
 * `data-estimate-cell`. Both are fixed. This is the guard that fires without a
 * build.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EstimateCell, EstimatePanel } from "@/components/track/EstimatePanel";
import { LOCKBOX_VIEW } from "@/lib/api/fixtures/address";
import { ROUND_TRIP_VIEW } from "@/lib/api/fixtures/tx";

afterEach(cleanup);

/**
 * The round trip's estimate, narrowed once. `TxView.estimate` is nullable
 * because /block's kind of page has none; this fixture has one, and a corpus
 * that lost it should fail here loudly rather than skip the whole file.
 */
const TX_ESTIMATE = ROUND_TRIP_VIEW.estimate;
if (TX_ESTIMATE === null) throw new Error("the round-trip fixture carries no estimate");

/** Every estimate the corpus renders through one of the two components. */
const CELL_ESTIMATES = LOCKBOX_VIEW.transactions.flatMap((t, i) =>
  t.estimate === null ? [] : [{ where: `address tx ${i}`, estimate: t.estimate, note: t.poolNote }],
);

describe("EstimatePanel", () => {
  it("renders a filter row with countIn and countOut, a claim chip and every assumption", () => {
    render(<EstimatePanel estimate={TX_ESTIMATE} />);

    const rows = document.querySelectorAll("[data-filter]:not([data-filter='neff'])");
    expect(rows.length, "no filter row").toBeGreaterThanOrEqual(1);
    for (const r of Array.from(rows)) {
      expect(r.getAttribute("data-count-in")).not.toBeNull();
      expect(r.getAttribute("data-count-out")).not.toBeNull();
    }

    const neff = document.querySelector('[data-filter="neff"]');
    expect(neff, "no N_eff row").not.toBeNull();
    expect(neff?.querySelector('[data-primitive="Chip"]'), "no claim chip").not.toBeNull();

    const assumptions = document.querySelector("[data-assumptions]");
    expect(assumptions, "no assumptions block").not.toBeNull();
    expect(within(assumptions as HTMLElement).getAllByRole("listitem")).toHaveLength(
      TX_ESTIMATE.assumptions.length,
    );
  });
});

describe("EstimateCell", () => {
  it("finds estimates to render, so the walk is not vacuous", () => {
    expect(CELL_ESTIMATES.length).toBeGreaterThanOrEqual(3);
  });

  it.each(CELL_ESTIMATES.map((e) => [e.where, e] as const))("%s renders its assumptions and its claim chip", (_where, e) => {
    render(<EstimateCell estimate={e.estimate} note={e.note} />);

    const cell = document.querySelector("[data-estimate-cell]");
    expect(cell, "the cell rendered nothing").not.toBeNull();

    expect(cell?.querySelector('[data-primitive="Chip"]'), "no claim chip").not.toBeNull();

    // THE ASSUMPTION TEXT ITSELF, not just a container. The one that mattered
    // is the SHIELD_WATCH caveat: a single candidate at N_eff 1 is the
    // strongest claim level on the site, and the sentence saying the filter
    // that produced it is the weakest in the toolkit was on no page at all.
    const assumptions = cell?.querySelector("[data-assumptions]");
    expect(assumptions, "no assumptions block").not.toBeNull();
    const items = within(assumptions as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(e.estimate.assumptions.length);
    for (const a of e.estimate.assumptions) {
      expect(items.some((li) => li.textContent === a), `assumption missing: ${a.slice(0, 40)}...`).toBe(true);
    }

    // And the audit trail, which is what A8 asks of every estimate.
    expect(cell?.querySelector("[data-filter]:not([data-filter='neff'])"), "no filter row").not.toBeNull();
  });

  it("renders the stated gap and nothing else when there is no estimate", () => {
    render(<EstimateCell estimate={null} note="no estimate for this leg" />);
    expect(screen.getByText("no estimate for this leg")).toBeDefined();
    expect(document.querySelector("[data-estimate-cell]")).toBeNull();
  });
});

describe("the fail state - the render checks are not vacuous", () => {
  it("an estimate with its assumptions stripped fails the same check", () => {
    const stripped = { ...TX_ESTIMATE, assumptions: [] as string[] };
    render(<EstimateCell estimate={stripped} note="scratch" />);
    const assumptions = document.querySelector("[data-estimate-cell] [data-assumptions]");
    expect(within(assumptions as HTMLElement).queryAllByRole("listitem")).toHaveLength(0);
  });
});
