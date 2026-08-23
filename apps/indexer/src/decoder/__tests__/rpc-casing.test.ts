import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { rpcTransactionSchema } from "@zcashreveal/zebra-rpc";
import type { RpcTransaction } from "@zcashreveal/types";

import { AnchorRegistry } from "../anchor-depth.js";
import { guessWallet } from "../fingerprint.js";
import { analyze, type AnalyzeContext } from "../leak-analyzer.js";

/**
 * THE WIRE'S CASING, AND THE THREE WALLET SIGNATURES IT SILENTLY DISABLED.
 *
 * `RpcTransaction` declares `expiryHeight`. zcashd and Zebra serialise
 * `expiryheight`. Nothing in this repository ever set either name in a fixture,
 * so `leak-analyzer.ts` computed `expiryDelta = null` for every transaction it
 * had ever seen - from a real node because the property did not exist, and in
 * every test because no fixture supplied it. `fingerprint.ts` gates three of
 * its five signatures on `expiryDelta !== null`.
 *
 * So the fingerprint was not degraded. It was INERT, and it reported that it
 * found nothing while being unable to see. The existing tests passed, and they
 * passed vacuously: they asserted the answer the analyser gives when blind.
 *
 * These tests exist so that cannot recur. Every one of them starts from JSON in
 * the casing a node emits and parses it through the real boundary schema, so a
 * fixture cannot agree with the interface while disagreeing with the wire.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "../../../test/fixtures/transactions/ywallet-orchard-only.json");

function loadRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
}

/** Parse through the RPC boundary, exactly as the client does. */
function throughBoundary(raw: unknown): RpcTransaction {
  return rpcTransactionSchema.parse(raw) as unknown as RpcTransaction;
}

/**
 * An anchor registry that answers "unknown" without a database.
 *
 * The anchor depth is not what these tests are about, and every branch below
 * behaves identically whichever height it returns.
 */
function offlineRegistry(): AnchorRegistry {
  return { getHeightForAnchor: () => Promise.resolve(null) } as unknown as AnchorRegistry;
}

function context(tipHeight: number): AnalyzeContext {
  return { tipHeight, seenAt: 1_755_900_000, anchorRegistry: offlineRegistry(), recentAnchorThreshold: 100 };
}

describe("the RPC boundary maps the wire's casing onto the names the decoder reads", () => {
  it("PASS STATE: a real-shaped response yields a real expiry delta and a wallet tell", async () => {
    const tx = throughBoundary(loadRaw());
    // 3,456,240 - 3,456,200 = 40, inside the y-wallet window of 35 to 50.
    expect(tx.expiryHeight).toBe(3_456_240);
    expect(tx.versionGroupId).toBe("26a7270a");

    const report = await analyze(tx, context(3_456_200));
    expect(report.fingerprint.expiryDelta).toBe(40);
    expect(report.fingerprint.likelyWallet).toBe("YWALLET");
  });

  it("FAIL STATE: the same response without the field is blind, and says UNKNOWN", async () => {
    // This is what EVERY transaction looked like before the boundary mapped the
    // name - not because nodes omit the field, but because the client read a
    // property the wire never carried.
    const raw = loadRaw();
    delete raw["expiryheight"];
    const tx = throughBoundary(raw);
    expect(tx.expiryHeight).toBeUndefined();

    const report = await analyze(tx, context(3_456_200));
    expect(report.fingerprint.expiryDelta).toBeNull();
    expect(report.fingerprint.likelyWallet).toBe("UNKNOWN_NONSTANDARD");
  });

  it("the mapping is ADDITIVE, and a camelCase key would survive - which is why the casing is linted", async () => {
    // The boundary schema passes unknown keys through, deliberately: stripping
    // them would mean a decoder that cannot see an Ironwood bundle on a chain
    // that has one. The consequence is that a hand-written fixture using the
    // interface's casing WOULD satisfy the analyser and would therefore look
    // correct while describing a node that does not exist.
    //
    // The boundary is the wrong place to catch that - it cannot tell a fixture
    // from a node. `casing of the transaction fixtures` below is the right
    // place, and it is what stops the defect recurring.
    const raw = loadRaw();
    delete raw["expiryheight"];
    raw["expiryHeight"] = 3_456_240;
    const tx = throughBoundary(raw);
    const report = await analyze(tx, context(3_456_200));
    expect(report.fingerprint.expiryDelta).toBe(40);
  });
});

describe("casing of the transaction fixtures", () => {
  it("every fixture spells its fields the way a node does, not the way the interface does", () => {
    // The guard that makes the defect non-recurring. A fixture written against
    // `RpcTransaction` can only ever agree with `RpcTransaction`; it cannot
    // disagree with the wire, and the disagreement is the whole bug.
    const dir = join(HERE, "../../../test/fixtures/transactions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length, "no transaction fixture to check").toBeGreaterThan(0);

    const WIRE: Readonly<Record<string, string>> = {
      expiryHeight: "expiryheight",
      versionGroupId: "versiongroupid",
      valueBalanceZat: "valueBalanceZat",
    };
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
      for (const [wrong, right] of Object.entries(WIRE)) {
        if (wrong === right) continue;
        expect(Object.hasOwn(raw, wrong), `${file} spells ${wrong} the interface's way; a node sends ${right}`).toBe(
          false,
        );
      }
      expect(Object.hasOwn(raw, "expiryheight"), `${file} carries no expiryheight, so it cannot exercise the fix`).toBe(
        true,
      );
    }
  });
});

describe("which wallet signatures the fix actually revives, and which stay inert", () => {
  /**
   * Two of the five become live and two do not, and the two that do not fail
   * for a SECOND reason of the same kind - so naming them here is the point of
   * this block rather than an aside.
   *
   * `leak-analyzer.ts:112` reads `tx.feeZat`. Zebra's `TransactionObject`
   * carries no fee field at all (types/transaction.rs:268-429 scanned in full),
   * and neither does zcashd's `getrawtransaction`: a fee is a property of the
   * outputs a transaction spends, and those are not in the response. So
   * `feeZat` is `undefined` on the wire exactly as `expiryHeight` was, the
   * analyser coalesces it to `0n`, and `isZip317Conventional(0n, actions)` is
   * false for every transaction, because the conventional fee has a floor of
   * two logical actions at 5,000 zatoshi.
   *
   * Both fee-gated signatures are therefore still unreachable from real data
   * after this fix. Repairing that means COMPUTING the fee, which is analysis
   * and belongs to HANDOFF-06/07/08, not to a boundary. It is recorded in the
   * section 8 ledger as a deferred assumption rather than left for HANDOFF-08's
   * golden cases to freeze.
   */
  const base = {
    txVersion: 5,
    vinCount: 0,
    voutCount: 0,
    saplingSpendCount: 0,
    saplingOutputCount: 0,
    orchardActionCount: 2,
    feeZat: 0n,
    hasOrchardBundle: true,
    hasSaplingBundle: false,
  };

  it("YWALLET is now reachable, and was not before", () => {
    expect(guessWallet({ ...base, expiryDelta: 40 })).toBe("YWALLET");
    expect(guessWallet({ ...base, expiryDelta: null })).toBe("UNKNOWN_NONSTANDARD");
  });

  it("ZECWALLET_LITE is now reachable, and was not before", () => {
    const lite = { ...base, hasSaplingBundle: true, saplingOutputCount: 1 };
    expect(guessWallet({ ...lite, expiryDelta: 20 })).toBe("ZECWALLET_LITE");
    expect(guessWallet({ ...lite, expiryDelta: null })).toBe("UNKNOWN_NONSTANDARD");
  });

  it("NIGHTHAWK stays unreachable from real data, because it also needs a fee the wire omits", () => {
    // Expiry delta of 70 satisfies its own gate; the conventional-fee gate is
    // what still refuses, and it refuses for every real transaction.
    expect(guessWallet({ ...base, expiryDelta: 90, feeZat: 0n })).toBe("UNKNOWN_NONSTANDARD");
    // With a fee that a computed one WOULD supply, it fires - so the signature
    // itself is sound and only its input is missing.
    expect(guessWallet({ ...base, expiryDelta: 90, feeZat: 10_000n })).toBe("NIGHTHAWK");
  });

  it("ZCASHD_RUST stays unreachable from real data, for the same reason", () => {
    const zcashd = { ...base, hasSaplingBundle: true, saplingOutputCount: 2, orchardActionCount: 0, hasOrchardBundle: false };
    expect(guessWallet({ ...zcashd, expiryDelta: 40, feeZat: 0n })).toBe("UNKNOWN_NONSTANDARD");
    expect(guessWallet({ ...zcashd, expiryDelta: 40, feeZat: 10_000n })).toBe("ZCASHD_RUST");
  });
});
