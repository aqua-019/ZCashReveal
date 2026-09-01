/**
 * A1 - THE NODE'S OWN PER-POOL ACCOUNTING, AND THE CONSERVATION LAW OVER IT.
 *
 * A1 was written on 22 August asking that "replaying a 1,000-block fixture
 * range reproduces per-pool balances equal to the fixture's reference values".
 * No such fixture exists and none can: a verbosity-2 block runs 90 KB to 2.4 MB,
 * so a thousand are tens to hundreds of megabytes. The reference value is in
 * EVERY BLOCK instead - `valuePools[]` carries a cumulative `chainValueZat` and
 * this block's signed `valueDeltaZat`, per pool, from the node itself.
 *
 * THE CLIENT BOUNDARY IS ASSERTED HERE AND NOT ASSUMED, because that is where
 * A1 was blocked. `rpcBlockSchema` has parsed both fields since HANDOFF-06, but
 * `RpcBlock` declared neither and `asRpcBlock` forwarded neither, so the
 * reference value was parsed and then dropped one line before the indexer could
 * read it. So this suite pushes a real capture through the REAL client - a
 * scripted transport returning the file's bytes, `rpc.getBlock()` doing the
 * parse and the mapping - rather than constructing an `RpcBlock` by hand. A test
 * that builds its own input is exactly what let three seam defects ship in
 * HANDOFF-11 (CLAUDE.md, the seam rule): make one side ACTUALLY PRODUCE the
 * value and hand it to the other.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZebraRpc, type FetchLike } from "@zcashreveal/zebra-rpc";

const FIXTURES = join(import.meta.dirname, "../../../test/fixtures/blocks");
const CAPTURES = ["mainnet-3432130-000000.json", "mainnet-3441955-000000.json"] as const;

/**
 * The block subsidy at these heights. The six pool deltas sum to exactly this,
 * because the only way total value across all pools changes is issuance - fees
 * move between pools rather than leaving them.
 */
const BLOCK_SUBSIDY_ZAT = 156_250_000n;

/** The six entries a 6.3.0 node sends, in the fixed order it sends them. */
const WIRE_POOLS = ["transparent", "sprout", "sapling", "orchard", "lockbox", "ironwood"] as const;

/** The five the site renders. The ZIP 271 lockbox is not a pool lane. */
const SITE_LANES = ["transparent", "sprout", "sapling", "orchard", "ironwood"] as const;

function readCapture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, unknown>;
}

/** A transport that answers one `getblock` with the bytes of a real capture. */
function clientReturning(result: unknown) {
  const fetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ result, error: null, id: 1 }),
    text: () => Promise.resolve(JSON.stringify({ result, error: null, id: 1 })),
  });
  return new ZebraRpc({ url: "http://127.0.0.1:8232", fetch, sleep: () => Promise.resolve() });
}

describe("A1 - valuePools survives the client boundary", () => {
  for (const name of CAPTURES) {
    it(`${name}: getBlock() forwards all six valuePools entries with their deltas`, async () => {
      const raw = readCapture(name);
      const block = await clientReturning(raw).getBlock({ height: raw["height"] as number });

      // THE FAIL SIDE OF THIS ASSERTION IS THE TREE AS IT STOOD AT 4515825:
      // asRpcBlock built an object literal that forwarded `trees` and not
      // `valuePools`, so this was `undefined` for every block ever fetched.
      expect(block.valuePools, `${name}: valuePools was dropped at the client boundary`).toBeDefined();
      expect(block.valuePools?.map((p) => p.id)).toEqual([...WIRE_POOLS]);
      for (const entry of block.valuePools ?? []) {
        expect(typeof entry.chainValueZat, `${entry.id ?? "?"}.chainValueZat`).toBe("bigint");
        expect(typeof entry.valueDeltaZat, `${entry.id ?? "?"}.valueDeltaZat`).toBe("bigint");
      }
      expect(block.chainSupply, `${name}: chainSupply was dropped at the client boundary`).toBeDefined();
    });
  }
});

describe("A1 - the conservation law, per block, against a node-sourced reference", () => {
  for (const name of CAPTURES) {
    it(`${name}: the six pool deltas sum to the block subsidy`, async () => {
      const raw = readCapture(name);
      const block = await clientReturning(raw).getBlock({ height: raw["height"] as number });
      const sum = (block.valuePools ?? []).reduce((a, p) => a + (p.valueDeltaZat ?? 0n), 0n);
      expect(sum, `${name}: TRACKING-MATH 3.11 over the node's own figures`).toBe(BLOCK_SUBSIDY_ZAT);
    });

    it(`${name}: altering ONE delta by ONE zatoshi breaks the sum`, async () => {
      // THE FAIL SIDE, AND IT IS A DATA MUTATION drawn from the set A1's
      // predicate excludes: a per-pool delta differing from the node's by any
      // non-zero amount. One zatoshi is the smallest member of that set.
      const raw = readCapture(name);
      const pools = raw["valuePools"] as { id?: string; valueDeltaZat: number }[];
      const orchard = pools.find((p) => p.id === "orchard");
      expect(orchard, "the capture carries an orchard entry").toBeDefined();
      orchard!.valueDeltaZat += 1;

      const block = await clientReturning(raw).getBlock({ height: raw["height"] as number });
      const sum = (block.valuePools ?? []).reduce((a, p) => a + (p.valueDeltaZat ?? 0n), 0n);
      expect(sum).toBe(BLOCK_SUBSIDY_ZAT + 1n);
      expect(sum).not.toBe(BLOCK_SUBSIDY_ZAT);
    });

    it(`${name}: the SITE's five lanes do NOT balance, and miss by exactly the lockbox`, async () => {
      // The precision that makes the law usable. LedgerLane has five members
      // because the ZIP 271 lockbox is not a pool lane, and a conservation check
      // written over those five rather than the six wire entries is off by the
      // lockbox delta every time. Stated as a test so nobody rediscovers it by
      // watching a balance fail to close.
      const raw = readCapture(name);
      const block = await clientReturning(raw).getBlock({ height: raw["height"] as number });
      const entries = block.valuePools ?? [];
      const fiveLaneSum = entries
        .filter((p) => (SITE_LANES as readonly string[]).includes(p.id ?? ""))
        .reduce((a, p) => a + (p.valueDeltaZat ?? 0n), 0n);
      const lockbox = entries.find((p) => p.id === "lockbox")?.valueDeltaZat ?? 0n;

      expect(lockbox, "the lockbox moved in this block, so the shortfall is observable").not.toBe(0n);
      expect(fiveLaneSum).toBe(BLOCK_SUBSIDY_ZAT - lockbox);
      expect(fiveLaneSum).not.toBe(BLOCK_SUBSIDY_ZAT);
    });
  }
});
