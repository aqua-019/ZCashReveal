/**
 * A11 - the smoke test: does the node this stack is talking to clear the floor?
 *
 * WHAT WAS ALREADY BUILT AND WHAT WAS NOT. `version-floor.ts` and its unit test
 * landed in HANDOFF-09 with LEDGER-10 Q1 fold 2: the constant, the parser, the
 * comparison and the checker, covered on the pass side, the below-floor side
 * and the unparsed side. What remained genuinely unbuilt is the leg that calls
 * `getinfo` against a LIVE NODE and passes the answer to the checker, which is
 * this file.
 *
 * A PIN STATES AN INTENT; ONLY THIS NOTICES WHEN THE BOX IS RUNNING SOMETHING
 * ELSE. `docker-compose.yml` binds the image an operator brings up on the day
 * they run `up -d` and says nothing about the node a gateway is talking to
 * after a manual pull, a rollback, a second box, or a `ZEBRAD_RPC_URL` pointed
 * elsewhere. All three reasons for the floor are silent when unmet: an older
 * node answers, the schemas `.passthrough()`, the tests pass and the numbers
 * are wrong.
 *
 * IT LIVES HERE BECAUSE OF WHERE VITEST LOOKS. This package's config sets
 * `include: ["src/**\/__tests__/**\/*.test.ts"]`, so a smoke test written to
 * `packages/zebra-rpc/test/` or to a `scripts/` directory would never be
 * collected and `vitest run` would report a green pass having executed only the
 * three files that were already here. That is the same defect deliverable 0
 * found for `apps/web/e2e`, one package over, and it is worth naming twice.
 *
 * THE LIVE LEG IS THE OPERATOR'S. No session can reach a synced node: the RPC
 * port is published nowhere - compose exposes only Zebra's P2P port - and CI
 * has no zebrad service. So the two fail-side legs and the parser run
 * everywhere, and the live leg runs only where a node answers, exactly as A6
 * treats the gateway. When it does not run it SAYS SO with its reason, rather
 * than disappearing from the output.
 */
import { describe, expect, it } from "vitest";

import {
  ZEBRA_MIN_VERSION_STRING,
  checkZebraVersionFloor,
  describeVersionFloorVerdict,
  parseZebraVersion,
} from "../version-floor.js";

/** Where a live node would be, if one were reachable. */
const RPC_URL = process.env.ZEBRAD_RPC_URL ?? "";

/**
 * Ask the node for its `subversion`, or say why not.
 *
 * A BARE `fetch` RATHER THAN THE TYPED CLIENT, deliberately. The client
 * validates `getinfo` against a schema, and a node OLD ENOUGH TO FAIL THE FLOOR
 * is exactly the node whose answer might not satisfy that schema - so routing
 * this through the client would report a below-floor node as a schema error and
 * lose the one distinction the assertion exists to make.
 */
async function liveSubversion(): Promise<{ ok: true; subversion: string } | { ok: false; reason: string }> {
  if (RPC_URL === "") return { ok: false, reason: "ZEBRAD_RPC_URL is unset, so no node was asked" };
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "floor", method: "getinfo", params: [] }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return { ok: false, reason: `the node answered ${res.status}` };
    const body = (await res.json()) as { result?: { subversion?: unknown } };
    const subversion = body.result?.subversion;
    if (typeof subversion !== "string" || subversion === "") {
      // A FOURTH OUTCOME, NOT A THIRD. "The node answered and named no version"
      // is not "the node is below the floor" and is not "no node" - conflating
      // any pair reintroduces the silence the floor exists to remove.
      return { ok: false, reason: "the node answered with no readable subversion" };
    }
    return { ok: true, subversion };
  } catch (err) {
    return { ok: false, reason: `the node did not answer (${err instanceof Error ? err.name : "unknown"})` };
  }
}

const live = await liveSubversion();

describe("A11 - the connected node clears the version floor packages/zebra-rpc declares", () => {
  it.runIf(!live.ok)("A11 LIVE LEG SKIPPED, WITH ITS REASON: no node answered, so this leg is UNVERIFIED", () => {
    // A green run that silently skipped this would report coverage it does not
    // have. The reason is asserted non-empty so the skip cannot be produced by
    // a probe that failed to run at all.
    expect(live.ok).toBe(false);
    expect(live.ok ? "" : live.reason).not.toBe("");
     
    console.warn(`A11 live leg skipped: ${live.ok ? "" : live.reason}`);
  });

  it.skipIf(!live.ok)("A11 PASS STATE: the live node's subversion clears the floor", () => {
    const subversion = live.ok ? live.subversion : "";
    const verdict = checkZebraVersionFloor(subversion);
     
    console.warn(`A11 live subversion: ${subversion} -> ${describeVersionFloorVerdict(verdict)}`);
    expect(verdict.ok, describeVersionFloorVerdict(verdict)).toBe(true);
  });

  it("A11 FAIL STATE, BY DATA: the tag this repository pinned until LEDGER-10 Q1 is BELOW the floor", () => {
    // A value drawn from the set the predicate rejects, by name: `/Zebra:6.2.3/`
    // is what `docker-compose.yml` bound before the ruling.
    const verdict = checkZebraVersionFloor("/Zebra:6.2.3/");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? "" : verdict.reason).toBe("below-floor");
  });

  it("A11 FAIL STATE, BY DATA: a string the parser cannot read is `unparsed`, never a pass", () => {
    // "I could not read the string" must not be reported as a pass, which is
    // the whole reason the verdict has three states rather than a boolean.
    const verdict = checkZebraVersionFloor("/MagicBean:5.4.2/");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? "" : verdict.reason).toBe("unparsed");
  });

  it("the compose pin clears the floor, and clears it with NO headroom", () => {
    // The pin is `zfnd/zebra:6.3.0` and the floor is 6.3.0, inclusive. This
    // states the fact rather than guarding it: any compose edit moving the tag
    // down by one patch fails the floor, and nothing in `pnpm check` would
    // catch that today. Recorded in section 8 as a named exposure.
    //
    // AND THE TAG IS NOT A SUBVERSION. Feeding `zfnd/zebra:6.3.0` to the parser
    // yields `unparsed`, so a guard written the naive way would report a
    // correct pin as unreadable forever and be indistinguishable from one that
    // checks nothing.
    expect(parseZebraVersion("zfnd/zebra:6.3.0")).toBeNull();
    const asSubversion = checkZebraVersionFloor("/Zebra:6.3.0/");
    expect(asSubversion.ok).toBe(true);
    expect(ZEBRA_MIN_VERSION_STRING).toBe("6.3.0");
    // One patch below the pin fails, which is what "no headroom" means.
    expect(checkZebraVersionFloor("/Zebra:6.2.9/").ok).toBe(false);
  });
});
