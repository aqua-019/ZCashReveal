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
  it("PASS STATE: a real-shaped response yields a real expiry delta", async () => {
    const tx = throughBoundary(loadRaw());
    // 3,456,240 - 3,456,200 = 40. That is the delta TRACKING-MATH §3.6 sources
    // for Zashi/Zodl, and it is the value the fixture was built around when it
    // was also the middle of Ywallet's 35-50 band.
    expect(tx.expiryHeight).toBe(3_456_240);
    expect(tx.versionGroupId).toBe("26a7270a");

    const report = await analyze(tx, context(3_456_200));
    expect(report.fingerprint.expiryDelta).toBe(40);

    // THE WALLET NAME IS NO LONGER THE DISCRIMINATOR HERE, AND SAYING SO IS THE
    // POINT. This assertion read `toBe("YWALLET")` until HANDOFF-08 withdrew
    // that signature (F-07-1: the 35-50 band was hardcoded at HANDOFF-00 and
    // never cited). Under the new rule the fixture answers `UNKNOWN_UNPRICED`
    // in BOTH polarities of this pair, because this suite has no prevout
    // resolver and an unknown fee is neither of the two verdicts about one.
    //
    // Per CLAUDE.md's rule, a fail-side probe that stops failing is itself
    // reported rather than quietly repaired: the wallet half of this pair no
    // longer discriminates, the expiry-delta half above still does and is what
    // this suite is actually for, and the wallet rules that DO still turn on a
    // delta are exercised in `wallet signatures the expiry fix revived` below.
    // The assertion is kept in both states rather than deleted, so a future
    // change that makes a name reappear here is visible.
    expect(report.fingerprint.likelyWallet).toBe("UNKNOWN_UNPRICED");
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
    // UNKNOWN_UNPRICED, not UNKNOWN_NONSTANDARD. This suite has no prevout
    // resolver, so the fee is null - and the two NONSTANDARD/BUT_STANDARD
    // answers are both claims ABOUT the fee, which is why neither is available
    // without one. The assertion said NONSTANDARD until a gate round found that
    // it was pinning the conflation rather than the blindness this test is
    // about: the expiry delta is what is missing here, and the wallet answer
    // must not smuggle in a verdict on a fee nobody computed.
    expect(report.fingerprint.likelyWallet).toBe("UNKNOWN_UNPRICED");
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
   * Two of the five became live with the casing fix and two needed a second
   * repair of the same kind - so naming them here is the point of this block
   * rather than an aside.
   *
   * WHEN THIS BLOCK WAS WRITTEN, `leak-analyzer.ts` read `tx.feeZat`. Zebra's
   * `TransactionObject` carries no fee field at all (types/transaction.rs:268-429
   * scanned in full), and neither does zcashd's `getrawtransaction`: a fee is a
   * property of the outputs a transaction spends, and those are not in the
   * response. So `feeZat` was `undefined` on the wire exactly as `expiryHeight`
   * was, the analyser coalesced it to `0n`, and `isZip317Conventional(0n,
   * actions)` was false for every transaction, because the conventional fee has
   * a floor of two logical actions at 5,000 zatoshi.
   *
   * HANDOFF-06 CLOSED THAT SECOND GAP: `computeFeeZat` sums the outputs a
   * transaction spends through an injected resolver, and returns `null` rather
   * than `0n` when it cannot. So the fee-gated signatures are reachable from
   * real data now, given a resolver - what they still cannot do is fire on an
   * unknown fee, which is the behaviour the `feeZat: 0n` rows below pin. The
   * titles of the last two cases say what they pin rather than what was once
   * true of the analyser; the assertions are unchanged.
   *
   * `logicalActions` is passed rather than derived here since HANDOFF-06, and
   * each value below is ZIP 317's L for the counts its own row declares:
   * `transparent + 2*joinsplits + max(saplingSpends, saplingOutputs) + orchard`.
   * For `base` that is 0 + 0 + 0 + 2 = 2, whose conventional fee is the grace
   * floor of 10,000 zatoshi - which is why 10,000 tests as conventional below.
   */
  const base = {
    txVersion: 5,
    vinCount: 0,
    voutCount: 0,
    saplingSpendCount: 0,
    saplingOutputCount: 0,
    orchardActionCount: 2,
    logicalActions: 2,
    feeZat: 0n,
    hasOrchardBundle: true,
    hasSaplingBundle: false,
    // No Ironwood by default. HANDOFF-07 made this a real input rather than an
    // absent one. It gated YWALLET until HANDOFF-08 withdrew that signature;
    // it now gates ZODL, which is the one delta rule this repository can cite.
    hasIronwoodBundle: false,
    ironwoodActionCount: 0,
  };

  it("an expiry delta in 35-50 names NO wallet - the band was never sourced", () => {
    // FOLD 1 / F-07-1. `guessWallet` returned "YWALLET" for any Orchard-only
    // transaction with two or more actions and an expiry delta in [35, 50].
    // That band was hardcoded at HANDOFF-00 and has never carried a citation:
    // `docs/2.0/TRACKING-MATH.md` §3.6 is the only line in this repository that
    // gives any delta, and it says "zcashd 20, Zashi/Zodl 40, others vary" -
    // "others vary" being the corpus DECLINING to state one for Ywallet. The
    // value was rendered to users beside a txid, so it was a named product
    // published on nothing.
    //
    // Every point in the closed band, including both endpoints, and the shape
    // the old rule required. None of them may produce a product name.
    const named = ["ZCASHD_RUST", "ZECWALLET_LITE", "NIGHTHAWK", "EDGE", "ZODL"];
    for (const expiryDelta of [35, 36, 40, 45, 49, 50]) {
      const guess = guessWallet({ ...base, expiryDelta });
      expect(named, `delta ${expiryDelta} must not name a product`).not.toContain(guess);
      // base carries feeZat 0n - a KNOWN fee, non-conventional against the
      // 10,000 grace floor - so the honest answer is a verdict about the fee
      // and nothing about the wallet.
      expect(guess, `delta ${expiryDelta}`).toBe("UNKNOWN_NONSTANDARD");
    }
    // Just outside the old band, for symmetry: the answer is the same, which is
    // what "the band carried no information" means.
    expect(guessWallet({ ...base, expiryDelta: 34 })).toBe("UNKNOWN_NONSTANDARD");
    expect(guessWallet({ ...base, expiryDelta: 51 })).toBe("UNKNOWN_NONSTANDARD");
    expect(guessWallet({ ...base, expiryDelta: null })).toBe("UNKNOWN_NONSTANDARD");
  });

  it("ZODL needs BOTH its sourced conjuncts, and 40 alone is not one of them", () => {
    // TRACKING-MATH §3.6 gives Zashi/Zodl an expiry delta of 40; the corpus
    // gives Zodl 3.8.0 Ironwood support and Ywallet 1.15.3 "will not be updated
    // for Ironwood" (§2.6, `med`). Both halves are sourced, and the rule
    // requires both - which matters more now than it did as a tiebreaker,
    // because the band it used to break the tie against is gone.
    const withIronwood = { ...base, hasIronwoodBundle: true, ironwoodActionCount: 2 };
    expect(guessWallet({ ...withIronwood, expiryDelta: 40 })).toBe("ZODL");

    // FAIL SIDE, EACH CONJUNCT SEPARATELY. Drop the Ironwood bundle and 40 is
    // no longer Zodl - and, since HANDOFF-08, no longer anything else either.
    // Keep the bundle and move the delta off 40 and it is not Zodl, because
    // Zodl's tell is a point value rather than a band.
    expect(guessWallet({ ...base, expiryDelta: 40 })).not.toBe("ZODL");
    expect(guessWallet({ ...withIronwood, expiryDelta: 41 })).not.toBe("ZODL");
  });

  it("ZECWALLET_LITE is now reachable, and was not before", () => {
    // One Sapling output on top of base's two Orchard actions: L = 1 + 2 = 3,
    // whose conventional fee is 15,000 - so the 0n rows below are non-conventional
    // for the right arithmetic reason and not by accident of the grace floor.
    const lite = {
      ...base,
      hasSaplingBundle: true,
      saplingOutputCount: 1,
      logicalActions: 3,
    };
    expect(guessWallet({ ...lite, expiryDelta: 20 })).toBe("ZECWALLET_LITE");
    expect(guessWallet({ ...lite, expiryDelta: null })).toBe("UNKNOWN_NONSTANDARD");
  });

  it("NIGHTHAWK cannot fire on an unknown fee, and does fire on a computed one", () => {
    // THE UNKNOWN FEE IS `null`, NOT `0n`. This assertion passed `0n` and was
    // titled as if it tested the unknown case - a gate round showed the two are
    // not the same test at all, because `0n` is a KNOWN fee that happens to be
    // non-conventional, which is the very value HANDOFF-06 exists to abolish.
    // Swapping one for the other left the file green, so the old assertion was
    // not evidence for its own title.
    //
    // Three states, three answers. Expiry delta of 90 satisfies NIGHTHAWK's own
    // gate throughout; only the fee differs.
    expect(guessWallet({ ...base, expiryDelta: 90, feeZat: null })).toBe("UNKNOWN_UNPRICED");
    expect(guessWallet({ ...base, expiryDelta: 90, feeZat: 1n })).toBe("UNKNOWN_NONSTANDARD");
    // With the fee `computeFeeZat` now supplies, it fires - so the signature
    // itself is sound and it was only ever its input that was missing.
    expect(guessWallet({ ...base, expiryDelta: 90, feeZat: 10_000n })).toBe("NIGHTHAWK");
  });

  it("ZCASHD_RUST behaves the same way, for the same reason", () => {
    // Two Sapling outputs, no Orchard: L = max(0, 2) = 2, conventional fee 10,000.
    const zcashd = {
      ...base,
      hasSaplingBundle: true,
      saplingOutputCount: 2,
      orchardActionCount: 0,
      hasOrchardBundle: false,
      logicalActions: 2,
    };
    expect(guessWallet({ ...zcashd, expiryDelta: 40, feeZat: null })).toBe("UNKNOWN_UNPRICED");
    expect(guessWallet({ ...zcashd, expiryDelta: 40, feeZat: 1n })).toBe("UNKNOWN_NONSTANDARD");
    expect(guessWallet({ ...zcashd, expiryDelta: 40, feeZat: 10_000n })).toBe("ZCASHD_RUST");
  });
});
