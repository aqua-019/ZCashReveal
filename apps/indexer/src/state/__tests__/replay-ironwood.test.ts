/**
 * A7 - replaying a decoded v6 block into PoolState.
 *
 * WHAT "INTEGRATION TEST" MEANS HERE, BECAUSE IT DOES NOT MEAN POSTGRES. A7
 * calls for an integration test, and the integration that matters is
 * decoder-to-state: whether the projection `decodeBlock` produces actually
 * drives the four-pool state machine. Everything under
 * `persistence/__tests__/integration/` is wrapped in `describe.skipIf(!reachable)`
 * against a live database, so an A7 written there would report green having
 * executed nothing in a container with no Postgres - the shape of HANDOFF-04's
 * reused Playwright server. This file is in-memory and cannot skip.
 *
 * THE DELTAS COME OUT OF SHIPPED CODE, NOT OUT OF THIS FILE. `boundaryDeltasOf`
 * lives in `block-decoder.ts` rather than here on purpose: nothing in this
 * repository drives `PoolState` from a decoded block yet - HANDOFF-12 owns the
 * confirmed-block driver - so a mapping written inside this test would be
 * certified by a green run while existing nowhere that ships. That is the
 * Sprout defect relocated into the test suite. What this file supplies is the
 * loop and the seeding; the projection is the decoder's.
 *
 * THE FIXTURE IS SYNTHETIC AND ITS `ironwood` FIELD NAME IS INFERRED. See
 * `ironwood-v6.test.ts` for what that limits: this suite proves the replay is
 * arithmetically sound, not that Zebra spells the bundle the way it is spelled
 * here.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { rpcBlockSchema } from "@zcashreveal/zebra-rpc";
import type { RpcBlock } from "@zcashreveal/zebra-rpc";
import { asHex, type Hex, type RpcTransaction } from "@zcashreveal/types";

import { boundaryDeltasOf, decodeBlock, type DecodedBlock } from "../../decoder/block-decoder.js";
import { NU6_3_ACTIVATION_MAINNET } from "@zcashreveal/instruments";
import { PoolState } from "../pool-state.js";
import { ExitOnlyViolation } from "../errors.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  HERE,
  "../../../test/fixtures/blocks/synthetic-v6-ironwood-3430000.json",
);

const ZEC = 100_000_000n;

function loadBlock(): RpcBlock {
  const parsed = rpcBlockSchema.parse(JSON.parse(readFileSync(FIXTURE, "utf8")));
  const tx: RpcTransaction[] = [];
  for (const entry of parsed.tx) {
    if (typeof entry === "string") throw new Error("fixture must be verbosity 2");
    tx.push(entry);
  }
  return {
    hash: parsed.hash,
    height: parsed.height as number,
    time: parsed.time as number,
    tx,
    ...(parsed.trees === undefined ? {} : { trees: parsed.trees }),
  };
}

/**
 * A fresh pair of pool states, with Orchard already holding value.
 *
 * SEEDING IS NOT SETUP CONVENIENCE, IT IS THE ONLY WAY THE ASSERTION IS
 * SATISFIABLE. `ValuePool` starts at zero and refuses any apply that would push
 * a balance negative, and a migration's Orchard leg is POSITIVE - value leaving
 * - so replaying into a fresh `PoolState<"orchard">` throws
 * `NegativeBalanceError` before it touches anything. The tempting repair is to
 * negate the delta, which would make the test green while inverting the
 * direction of the migration this project exists to measure. So the opening
 * balance is deposited first, at a height strictly BELOW NU6.3, because after
 * that height value entering Orchard is itself a consensus violation.
 */
function seeded(openingZec: bigint): {
  orchard: PoolState<"orchard">;
  ironwood: PoolState<"ironwood">;
  opening: bigint;
} {
  const orchard = new PoolState<"orchard">("orchard");
  const ironwood = new PoolState<"ironwood">("ironwood");
  const opening = openingZec * ZEC;
  orchard.value.apply({
    pool: "orchard",
    txid: asHex("5eed") as Hex,
    height: NU6_3_ACTIVATION_MAINNET - 1,
    deltaZat: -opening,
  });
  return { orchard, ironwood, opening };
}

/** Apply a decoded block's boundary deltas to the two states. */
function replay(block: DecodedBlock, states: ReturnType<typeof seeded>): void {
  for (const delta of boundaryDeltasOf(block)) {
    if (delta.pool === "orchard") states.orchard.value.apply({ ...delta, pool: "orchard" });
    if (delta.pool === "ironwood") states.ironwood.value.apply({ ...delta, pool: "ironwood" });
  }
}

describe("A7 - Bal_orchard falls by what left it and Bal_ironwood rises by what arrived", () => {
  it("replays the fixture and the two balances account for each other", () => {
    const block = loadBlock();
    const decoded = decodeBlock(block);
    const states = seeded(1_000n);

    const deltas = boundaryDeltasOf(decoded);
    const leftOrchard = deltas
      .filter((d) => d.pool === "orchard")
      .reduce((a, d) => a + d.deltaZat, 0n);
    const enteredIronwood = deltas
      .filter((d) => d.pool === "ironwood")
      .reduce((a, d) => a - d.deltaZat, 0n);

    // COVERAGE GUARD. A7's Orchard clause as written - "unchanged or decreased"
    // - is satisfied by applying nothing at all, which is exactly the defect
    // this whole handoff is about: a decoder that emitted no Orchard delta
    // would pass it. So the amounts are asserted to be real before anything is
    // asserted about the balances.
    expect(leftOrchard).toBeGreaterThan(0n);
    expect(enteredIronwood).toBeGreaterThan(0n);
    expect(decoded.height).toBeGreaterThanOrEqual(NU6_3_ACTIVATION_MAINNET);

    replay(decoded, states);

    // EQUALITY, NOT "unchanged or decreased". The weaker clause cannot tell a
    // correct replay from an empty one.
    expect(states.orchard.value.balance()).toBe(states.opening - leftOrchard);
    expect(states.ironwood.value.balance()).toBe(enteredIronwood);

    // Conservation, which is the one assertion that catches a sign error on
    // either half: what left Orchard either arrived in Ironwood or was paid as
    // a fee, and the fee is the only difference between the two sides.
    const fees = leftOrchard - enteredIronwood;
    expect(fees).toBeGreaterThan(0n);
    expect(states.orchard.value.balance() + states.ironwood.value.balance() + fees).toBe(
      states.opening,
    );
  });

  it("the per-transaction deltas were really applied, not skipped", () => {
    // A loop that iterates zero times passes every balance assertion above if
    // the opening balance happens to be zero, and passes the conservation one
    // trivially. `deltasFor` is the record of what `apply` actually saw.
    const decoded = decodeBlock(loadBlock());
    const states = seeded(1_000n);
    replay(decoded, states);

    const migrations = decoded.txs.filter((t) => t.orchardValueBalanceZat > 0n);
    expect(migrations.length).toBe(2);
    for (const tx of migrations) {
      expect(states.orchard.value.deltasFor(tx.txid).map((d) => d.deltaZat)).toEqual([
        tx.orchardValueBalanceZat,
      ]);
      expect(states.ironwood.value.deltasFor(tx.txid).map((d) => d.deltaZat)).toEqual([
        tx.ironwoodValueBalanceZat,
      ]);
    }
  });

  it("FAIL SIDE 1: withholding the Ironwood half leaves Orchard drained into nothing", () => {
    // The mirror of A8's fail side, at the state layer. If the Ironwood deltas
    // never arrive, Orchard still falls and Ironwood stays at zero - which is
    // precisely the state the project was in before this handoff, and which the
    // assertion above must be able to tell apart from the correct one.
    const decoded = decodeBlock(loadBlock());
    const states = seeded(1_000n);

    for (const delta of boundaryDeltasOf(decoded)) {
      if (delta.pool === "orchard") states.orchard.value.apply({ ...delta, pool: "orchard" });
    }

    expect(states.orchard.value.balance()).toBeLessThan(states.opening);
    expect(states.ironwood.value.balance()).toBe(0n);
  });

  it("FAIL SIDE 2: flipping the Orchard sign trips ExitOnlyViolation, which proves the height", () => {
    // THE ONLY PROBE THAT PROVES THE FIXTURE IS REALLY POST-NU6.3 rather than
    // merely claimed to be. `ValuePool` refuses value ENTERING Orchard from
    // NU6.3 onward (ZIP 2006), so a negated Orchard delta must throw at this
    // height and would not throw at a lower one. If this probe ever stops
    // throwing, the fixture has drifted below activation and every assertion in
    // this file is about a chain that does not exist - which is a finding in
    // itself, not something to repair quietly.
    const decoded = decodeBlock(loadBlock());
    const states = seeded(1_000n);
    const orchardDelta = boundaryDeltasOf(decoded).find((d) => d.pool === "orchard");
    expect(orchardDelta).toBeDefined();

    expect(() =>
      states.orchard.value.apply({
        pool: "orchard",
        txid: orchardDelta?.txid as Hex,
        height: decoded.height,
        deltaZat: -(orchardDelta?.deltaZat ?? 0n),
      }),
    ).toThrow(ExitOnlyViolation);

    // And the same delta below activation is accepted, so the throw is the
    // height's doing and not the sign's alone.
    expect(() =>
      states.orchard.value.apply({
        pool: "orchard",
        txid: orchardDelta?.txid as Hex,
        height: NU6_3_ACTIVATION_MAINNET - 1,
        deltaZat: -(orchardDelta?.deltaZat ?? 0n),
      }),
    ).not.toThrow();
  });

  it("the Ironwood commitment tree grows contiguously across the whole block", () => {
    // A2 asserts contiguity WITHIN a bundle; this is the block-level property
    // that matters to an anchor. `CommitmentIndex` assigns positions on append,
    // so the check is on the append order rather than on the index: the day
    // anyone filters or de-duplicates an action list between the decoder and
    // here, every commitment after the gap is recorded at the wrong tree
    // position and the anchor it belongs to will never match.
    const decoded = decodeBlock(loadBlock());
    const ironwood = new PoolState<"ironwood">("ironwood");

    const positions: bigint[] = [];
    for (const tx of decoded.txs) {
      for (const action of tx.ironwoodActions) {
        positions.push(
          ironwood.commitments.append({
            pool: "ironwood",
            cmId: action.cmx,
            txid: tx.txid,
            height: decoded.height,
          }),
        );
      }
    }

    expect(positions.length).toBeGreaterThan(2);
    expect(positions).toEqual(positions.map((_p, i) => BigInt(i)));
    expect(ironwood.commitments.size()).toBe(BigInt(positions.length));

    // THE BLOCK-LEVEL ANCHOR CANNOT COME FROM `decodeBlock`, AND THAT IS THE
    // POINT OF THIS BLOCK OF ASSERTIONS SINCE HANDOFF-08. `getblock` carries no
    // Ironwood root under any name (LEDGER-07 Q5), so what this fixture proves
    // is the half the response DOES carry - the tree size, which is the
    // anchor's `maxPosition` - and that the decoder says the root is still
    // owed. HANDOFF-12 supplies it from `z_gettreestate`.
    expect(decoded.ironwoodAnchorPendingTreestate).toBe(true);
    expect(decoded.ironwoodTreeSize).toBe(ironwood.commitments.size());

    // With the root supplied from that other RPC - modelled here as a literal,
    // because this suite has no node - the anchor records cleanly, because its
    // maxPosition references a commitment that exists. Recording it before the
    // appends would throw AnchorOutOfBoundsError, the cross-index invariant.
    const rootFromTreestate = "ee".repeat(32) as Hex;
    expect(() =>
      ironwood.recordAnchor({
        pool: "ironwood",
        root: rootFromTreestate,
        heightCreated: decoded.height,
        // `size - 1`, taken from the decoder's own reading of the block rather
        // than from the index, so a disagreement between the two is a failure
        // rather than a tautology.
        maxPosition: (decoded.ironwoodTreeSize as bigint) - 1n,
      }),
    ).not.toThrow();
    expect(ironwood.anchors.snapshot().anchorCount).toBe(1);
  });

  it("each replay uses a fresh PoolState, because there is no rollback", () => {
    // `CommitmentIndex` throws on a repeated cmId and `ValuePool` has no
    // `unapply`, so replaying one block twice into one state is an error rather
    // than an idempotent no-op. The natural repair - catching the throw, or
    // dropping the duplicate check - would remove the only defence the
    // commitment index has against double-counting a reorged block, so the
    // property is pinned here instead.
    const decoded = decodeBlock(loadBlock());
    const ironwood = new PoolState<"ironwood">("ironwood");
    const first = decoded.txs.flatMap((t) =>
      t.ironwoodActions.map((a) => ({ tx: t.txid, cmx: a.cmx })),
    );
    for (const c of first) {
      ironwood.commitments.append({
        pool: "ironwood",
        cmId: c.cmx,
        txid: c.tx,
        height: decoded.height,
      });
    }
    expect(() =>
      ironwood.commitments.append({
        pool: "ironwood",
        cmId: first[0]?.cmx as Hex,
        txid: first[0]?.tx as Hex,
        height: decoded.height,
      }),
    ).toThrow();
  });
});
