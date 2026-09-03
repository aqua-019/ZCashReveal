// @vitest-environment jsdom
/**
 * A12 and A13 - the three status affordances, rendered.
 *
 * WHERE EACH GOES IS FOLD 2 OF THE L2 RESOLUTION FOR HANDOFF-04b, which is
 * binding because of what it was written to prevent: HANDOFF-11 adds three
 * status affordances to a surface a reader already could not read, so 04a was
 * ordered ahead of it to build the hierarchy that says WHERE a status chip
 * goes. Putting them anywhere else adds to the exact problem 04a was
 * commissioned to fix.
 *
 *   staleness indicator -> the system bar, beside the epoch clock. A property
 *     of the DOCUMENT, not of any panel, and the bar is the one surface every
 *     route carries.
 *   `source:` chip -> inside the disclosure carrying the derivation, next to
 *     the count in the `<summary>`. Never floating beside a value.
 *   `UNVERIFIED` chip -> the chip row beside the claim, and it NEVER collapses.
 *
 * THE RENDERED FAULT IS HERE RATHER THAN IN PLAYWRIGHT, and the reason is
 * economy rather than preference: proving it end to end would need a third
 * production build whose managed-store URL points at a closed port, and the
 * condition is a prop. The e2e suite covers placement and the regex against a
 * real build; this covers the branch that fires when a configured rung fails.
 */
import { act, cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EpochClock } from "@/components/ui/EpochClock";
import { NotMeasured } from "@/components/ui/NotMeasured";
import { Unverified } from "@/components/ui/Unverified";
import { publishTipForTest } from "@/lib/api/tip-bus";
import { FIXTURE_TIP } from "@/lib/chain";
import { SNAPSHOT_FALLBACK_MARKER, type SnapshotFault } from "@/lib/snapshot/source";

afterEach(cleanup);

const CLEAN = { source: "fixture" as const, faults: [] as readonly SnapshotFault[] };

describe("A2/A13 - the staleness indicator in the system bar", () => {
  it("PASS STATE: it renders the age with a DIGIT and names the resolved source", () => {
    render(<EpochClock tip={FIXTURE_TIP} status={{ source: "redis-rest", faults: [] }} />);
    const stale = document.querySelector('[data-ui="staleness"]');
    expect(stale).not.toBeNull();
    expect(stale?.textContent).toMatch(/snapshot age: [\d,]+ blocks?/);
    expect(stale?.textContent).toContain("source: redis-rest");
    expect(stale?.getAttribute("data-source")).toBe("redis-rest");
  });

  it("PASS STATE: it carries the fallback marker A8 greps for out of the built bundle", () => {
    render(<EpochClock tip={FIXTURE_TIP} status={CLEAN} />);
    expect(document.querySelector('[data-ui="staleness"]')?.getAttribute("data-marker")).toBe(
      SNAPSHOT_FALLBACK_MARKER,
    );
    expect(SNAPSHOT_FALLBACK_MARKER).toBe("zr:snapshot-fallback:v1");
  });

  it("PASS STATE, AND THIS IS A13: a CONFIGURED rung that did not answer is NAMED, not swallowed", () => {
    // Section 3's rule: "An assertion here must fail when the FIRST source is
    // unreachable, not merely when the last one is." A resolution that walked
    // past a configured managed store and rendered `source: fixture` with no
    // further word is a stale site that renders and reports no fault.
    const faults: readonly SnapshotFault[] = [
      { rung: "redis-rest", reason: "the managed store did not answer (timed out)" },
    ];
    render(<EpochClock tip={FIXTURE_TIP} status={{ source: "fixture", faults }} />);
    const stale = document.querySelector('[data-ui="staleness"]');
    expect(stale?.getAttribute("data-faults")).toBe("1");
    expect(stale?.textContent).toContain("redis-rest");
    expect(stale?.textContent).toContain("did not answer");
    // AND IT STILL RENDERS THE PAGE. Never a blank panel: the site falls
    // through to the bundled document and says that it did.
    expect(stale?.textContent).toContain("source: fixture");
  });

  it("FAIL STATE, BY DATA: `source: fixture` with NO fault is indistinguishable from a clean fixture build, which is why the fault count is an attribute", () => {
    // The member of the exclusion set A13 names: a resolution that fell through
    // from a configured rung must not render the same string as one where
    // nothing was configured. The text alone cannot carry that - both say
    // `source: fixture` - so the discriminating value is `data-faults`, and
    // this case is what proves the two are distinguishable at all.
    render(<EpochClock tip={FIXTURE_TIP} status={CLEAN} />);
    const clean = document.querySelector('[data-ui="staleness"]');
    expect(clean?.getAttribute("data-faults")).toBe("0");
    expect(clean?.textContent).not.toContain("did not answer");
    cleanup();

    render(
      <EpochClock
        tip={FIXTURE_TIP}
        status={{ source: "fixture", faults: [{ rung: "redis-rest", reason: "the managed store answered 500" }] }}
      />,
    );
    const degraded = document.querySelector('[data-ui="staleness"]');
    expect(degraded?.getAttribute("data-faults")).toBe("1");
    expect(degraded?.textContent).toContain("500");
  });

  it("A4, BOTH POLARITIES IN ONE TEST: a fixture with no tip frame reads UNKNOWN, and a number once a frame arrives", () => {
    // THE DEFECT THIS CLOSES WAS LIVE ON `zcuck.xyz`. The bundled document names
    // height 3,456,227; mainnet was at 3,470,402 on 3 September 2026; the
    // fixture stream emits no `tip` frame at all, so the "tip the page knows"
    // was the document's own height and the bar read `snapshot age: 0 blocks -
    // source: fixture` beside data 14,175 blocks old. Both fields were true.
    // Together they told the reader the page was current.
    render(<EpochClock tip={FIXTURE_TIP} status={CLEAN} />);
    const stale = () => document.querySelector('[data-ui="staleness"]');

    // POLARITY ONE - no frame. The page cannot know the age and says so.
    expect(stale()?.getAttribute("data-age")).toBe("unknown");
    expect(stale()?.textContent).toContain("snapshot age: unknown");
    // AND NOT A ZERO, WHICH IS THE MEMBER OF A4's EXCLUSION SET. Asserted as a
    // string the element must not contain, so the check discriminates on the
    // rendered VALUE rather than on the element existing.
    expect(stale()?.textContent).not.toContain("snapshot age: 0 blocks");
    expect(stale()?.textContent).not.toMatch(/snapshot age: [\d,]+ blocks?/);

    // POLARITY TWO - a frame arrives, naming a later block. Now the page has a
    // second height to difference against, and the age is a measurement.
    act(() => {
      publishTipForTest({ height: FIXTURE_TIP.height + 14_175, hash: FIXTURE_TIP.hash });
    });
    expect(stale()?.getAttribute("data-age")).toBe("14175");
    expect(stale()?.textContent).toContain("snapshot age: 14,175 blocks");
    expect(stale()?.textContent).toMatch(/snapshot age: [\d,]+ blocks?/);
  });

  it("A4: a frame naming the SAME height still makes the age known, and it is zero", () => {
    // THE CASE A HEIGHT COMPARISON CANNOT SEE, and the reason `sawTipFrame` is
    // its own state rather than `height > tip.height`. A frame naming the height
    // the document already carries is evidence the chain is where the document
    // said it was - a TRUE zero - and inferring "saw a frame" from a height
    // increase would suppress it, replacing a false zero with a false unknown.
    render(<EpochClock tip={FIXTURE_TIP} status={CLEAN} />);
    const stale = () => document.querySelector('[data-ui="staleness"]');
    expect(stale()?.getAttribute("data-age")).toBe("unknown");

    act(() => {
      publishTipForTest({ height: FIXTURE_TIP.height, hash: FIXTURE_TIP.hash });
    });
    expect(stale()?.getAttribute("data-age")).toBe("0");
    expect(stale()?.textContent).toContain("snapshot age: 0 blocks");
  });

  it("A4: only the FIXTURE is unknown - a live-sourced document with no frame still reads a number", () => {
    // THE NARROWING, ASSERTED RATHER THAN LEFT TO THE COMMENT. On a document the
    // publisher wrote, its height IS the page's best evidence of the tip, so
    // `0 blocks` before any frame is a true statement that becomes truer.
    // Widening the unknown to those rungs would replace a measurement with a
    // refusal to make one, on every route, for every reader.
    for (const source of ["redis-rest", "redis", "gateway"] as const) {
      render(<EpochClock tip={FIXTURE_TIP} status={{ source, faults: [] }} />);
      const stale = document.querySelector('[data-ui="staleness"]');
      expect(stale?.getAttribute("data-age"), source).toBe("0");
      expect(stale?.textContent, source).toContain("snapshot age: 0 blocks");
      cleanup();
    }
  });

  it("the indicator is INSIDE the clock, which is what 'beside the epoch clock' means in the bar", () => {
    render(<EpochClock tip={FIXTURE_TIP} status={CLEAN} />);
    const clock = document.querySelector('[data-ui="epochclock"]');
    expect(clock).not.toBeNull();
    expect(within(clock as HTMLElement).getByText(/snapshot age:/)).toBeTruthy();
  });

  it("the height carries aria-live, which the component's own comment promised 'once the event is real'", () => {
    render(<EpochClock tip={FIXTURE_TIP} status={CLEAN} />);
    expect(document.querySelector('[data-testid="epoch-height"]')?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("A12 - the UNVERIFIED chip is reachable without opening a disclosure", () => {
  it("PASS STATE: it renders in the open and carries its reason", () => {
    render(<Unverified reason="gateway returned an unexpected shape for /v2/pools" />);
    const chip = document.querySelector('[data-ui="unverified"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("UNVERIFIED");
    expect(chip?.textContent).toContain("/v2/pools");
  });

  it("PASS STATE: it is not inside a <details>, which is the collapse rule fold 2 names by name", () => {
    render(<Unverified reason="the gateway did not answer" />);
    const chip = document.querySelector('[data-ui="unverified"]');
    expect(chip?.closest("details")).toBeNull();
  });

  it("FAIL STATE, BY DATA: the same chip placed inside a closed <details> is NOT reachable, which is what the rule forbids", () => {
    // The member of the exclusion set: an `UNVERIFIED` chip inside a `<details>`
    // body. Rendered here so the assertion discriminates on the placement
    // rather than on the component - the chip is identical in both cases and
    // only where it sits differs.
    render(
      <details>
        <summary>1 note</summary>
        <Unverified reason="hidden" />
      </details>,
    );
    const chip = document.querySelector('[data-ui="unverified"]');
    expect(chip?.closest("details")).not.toBeNull();
    // `open` is absent, so a reader sees the summary and nothing else.
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  it("the tone is `warn`, never `danger` and never gold", () => {
    // `danger` is reserved for Beware severity and nothing else, and gold has
    // four licensed jobs, none of which is this. An unverified panel is a
    // statement about what this page could check, not a finding about Zcash.
    render(<Unverified reason="x" />);
    const tone = document.querySelector('[data-primitive="Chip"]')?.getAttribute("data-tone");
    expect(tone).toBe("warn");
    expect(tone).not.toBe("danger");
    expect(tone).not.toBe("gold");
  });
});

describe("a named absence states its CONDITION and has nowhere to put an owner", () => {
  it("PASS STATE: it renders the panel name and the condition", () => {
    render(<NotMeasured panel="drain" condition="no block time or no baseline for this height" />);
    const el = document.querySelector('[data-ui="not-measured"]');
    expect(el?.textContent).toContain("drain: not measured");
    expect(el?.textContent).toContain("no block time or no baseline");
  });

  it("it draws no chart chrome - no axis, no zero, no bar", () => {
    // `docs/2.0/SNAPSHOT.md` section 8.1: "no empty axes, no zero-height bars,
    // no flat line at the baseline, no `0` in a figure slot", because an empty
    // chart renders as a MEASUREMENT OF ZERO and a flat drain line reads as
    // "the pool is not draining".
    render(<NotMeasured panel="N_eff series" condition="no Ironwood spend in the window could be bounded" />);
    const el = document.querySelector('[data-ui="not-measured"]');
    expect(el?.querySelector("svg")).toBeNull();
    expect(el?.textContent).not.toMatch(/\b0\b/);
  });
});
