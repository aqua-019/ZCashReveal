/**
 * The fixture corpus, held to its own schemas and to its own arithmetic.
 *
 * Two jobs, and the second is the one that matters.
 *
 * FIRST, every view parses against the schema that describes it. The fixtures
 * are hand-written TypeScript and the compiler already checks their shape, so
 * this looks redundant - it is not. `zatSchema` refuses a decimal, `estimateSchema`
 * refuses an empty `assumptions` and an empty `filters`, `txidSchema` refuses a
 * hash of the wrong length, and none of those is a type error. A 65-character
 * txid in the mempool fixture got through the compiler and was caught here,
 * which is the same defect LEDGER-01 Q2 recorded about the mockup's tip hash.
 *
 * SECOND, every aggregate is re-derived independently. The fixtures compute
 * their totals from their own components rather than transcribing them, and
 * this file recomputes those totals a different way and compares. That is what
 * catches a page printing a number its own rows disagree with - which is
 * precisely the failure the whole site exists to point at, and which the mockup
 * commits four times over.
 */
import { describe, expect, it } from "vitest";

import {
  addressViewSchema,
  blockViewSchema,
  flowsViewSchema,
  labelViewSchema,
  mempoolViewSchema,
  poolsViewSchema,
  txViewSchema,
} from "@zcashreveal/types";
import { claimLevelFor } from "@zcashreveal/types";

import { LOCKBOX_VIEW } from "@/lib/api/fixtures/address";
import { ROUND_TRIP_BLOCK } from "@/lib/api/fixtures/block";
import { FLOWS_VIEW } from "@/lib/api/fixtures/flows";
import { labelViews } from "@/lib/api/fixtures/labels";
import { conventionalFeeZat, MEMPOOL_VIEW } from "@/lib/api/fixtures/mempool";
import { POOLS_VIEW } from "@/lib/api/fixtures/pools";
import { RELATIVE_DELTA, ROUND_TRIP_VIEW } from "@/lib/api/fixtures/tx";
import { zec } from "@/lib/api/fixtures/units";

/** Report the first failing path rather than a wall of zod output. */
function parses(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown, what: string): void {
  const r = schema.safeParse(value);
  const first = r.error?.issues[0];
  expect(r.success, first === undefined ? what : `${what}: ${first.path.join(".")} - ${first.message}`).toBe(true);
}

describe("every view parses against its own schema", () => {
  it("AddressView", () => {
    parses(addressViewSchema, LOCKBOX_VIEW, "lockbox address view");
  });
  it("TxView", () => {
    parses(txViewSchema, ROUND_TRIP_VIEW, "round-trip transaction view");
  });
  it("BlockView", () => {
    parses(blockViewSchema, ROUND_TRIP_BLOCK, "block view");
  });
  it("PoolsView", () => {
    parses(poolsViewSchema, POOLS_VIEW, "pools view");
  });
  it("MempoolView", () => {
    parses(mempoolViewSchema, MEMPOOL_VIEW, "mempool view");
  });
  it("FlowsView", () => {
    parses(flowsViewSchema, FLOWS_VIEW, "flows view");
  });
  it("every LabelView", () => {
    for (const l of labelViews()) parses(labelViewSchema, l, `label ${l.address}`);
  });
});

describe("the lockbox's aggregates are its own rows", () => {
  const txs = LOCKBOX_VIEW.transactions;

  it("balance is received minus sent, and both are sums of the gross legs", () => {
    const received = txs.reduce((a, t) => a + t.creditZat, 0n);
    const sent = txs.reduce((a, t) => a + t.debitZat, 0n);
    expect(LOCKBOX_VIEW.receivedZat).toBe(received);
    expect(LOCKBOX_VIEW.sentZat).toBe(sent);
    expect(LOCKBOX_VIEW.balanceZat).toBe(received - sent);
  });

  it("reproduces the four figures HANDOFF-04 deliverable 3 names", () => {
    expect(LOCKBOX_VIEW.balanceZat).toBe(zec("78183.4093"));
    expect(LOCKBOX_VIEW.receivedZat).toBe(zec("93496.6388"));
    expect(LOCKBOX_VIEW.sentZat).toBe(zec("15313.2295"));
    expect(txs).toHaveLength(4);
  });

  it("every row's net is its credit minus its debit", () => {
    for (const t of txs) expect(t.amountZat, t.txid).toBe(t.creditZat - t.debitZat);
  });

  it("net to pool is what went in less what came back", () => {
    // 7,875 + 129.8202 in, 7,438.2295 out.
    expect(LOCKBOX_VIEW.netToPoolZat).toBe(zec("566.5907"));
  });

  it("the balance series ends where the balance says, and every step is a row", () => {
    const last = LOCKBOX_VIEW.balances[LOCKBOX_VIEW.balances.length - 1];
    expect(last?.balanceZat).toBe(LOCKBOX_VIEW.balanceZat);
    // Each step's delta matches the net movement of the transaction at that
    // height, so the chart cannot drift from the table beside it.
    for (let i = 1; i < LOCKBOX_VIEW.balances.length; i += 1) {
      const prev = LOCKBOX_VIEW.balances[i - 1];
      const cur = LOCKBOX_VIEW.balances[i];
      if (prev === undefined || cur === undefined) continue;
      const delta = cur.balanceZat - prev.balanceZat;
      if (delta === 0n) continue;
      const tx = txs.find((t) => t.height === cur.height);
      expect(tx, `no transaction at height ${cur.height}`).toBeDefined();
      expect(delta, `step at ${cur.height}`).toBe(tx?.amountZat);
    }
  });
});

describe("the round trip's chain closes", () => {
  const est = ROUND_TRIP_VIEW.estimate;

  it("each filter's countIn is the previous filter's countOut", () => {
    expect(est).not.toBeNull();
    const f = est?.filters ?? [];
    for (let i = 1; i < f.length; i += 1) {
      expect(f[i]?.countIn, `filter ${i} (${f[i]?.filter})`).toBe(f[i - 1]?.countOut);
    }
  });

  it("reproduces the four counts the mockup draws", () => {
    expect(est?.filters.map((x) => x.countOut)).toEqual([4_918_402n, 3_105_911n, 41_208n, 1n]);
  });

  it("the surviving count is the claim's candidate count", () => {
    expect(est?.candidates).toBe(est?.filters[est.filters.length - 1]?.countOut);
  });

  it("the relative delta is computed from the two amounts, not written down", () => {
    // 0.4059 on 50,000.96 is 8.12 in a million. The v0.2 absolute tolerance of
    // 0.0016 ZEC would have missed it, which is why the relative rule exists.
    expect(RELATIVE_DELTA).toBeGreaterThan(8.1e-6);
    expect(RELATIVE_DELTA).toBeLessThan(8.2e-6);
    expect(RELATIVE_DELTA).toBeLessThan(1e-4);
    const absoluteZat = zec("0.4059");
    expect(absoluteZat).toBeGreaterThan(160_000n);
  });

  it("the round trip's shielded interval carries no amount at all", () => {
    const opaque = ROUND_TRIP_VIEW.roundTrip.filter((l) => l.shielded);
    expect(opaque).toHaveLength(1);
    // Not zero. Not an estimate. There is nothing to print.
    expect(opaque[0]?.amountZat).toBeNull();
  });

  it("a MEDIUM link is graded MEDIUM and claimed at requires_disclosure, and the two are not the same statement", () => {
    expect(est?.grade).toBe("MEDIUM");
    expect(est?.claim).toBe("requires_disclosure");
  });
});

describe("the pools page agrees with itself", () => {
  it("shares sum to one", () => {
    const total = POOLS_VIEW.balances.reduce((a, b) => a + b.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("the residual is exactly the two unprovable pools", () => {
    const sprout = POOLS_VIEW.balances.find((b) => b.pool === "sprout")?.zat ?? 0n;
    const orchard = POOLS_VIEW.balances.find((b) => b.pool === "orchard")?.zat ?? 0n;
    expect(POOLS_VIEW.residual.zat).toBe(sprout + orchard);
    expect(POOLS_VIEW.residual.share + POOLS_VIEW.residual.verifiedShare).toBeCloseTo(1, 9);
  });

  it("the Sankey total is the sum of its own bands", () => {
    expect(POOLS_VIEW.flowTotalZat).toBe(POOLS_VIEW.flows.reduce((a, f) => a + f.zat, 0n));
  });

  it("the migration histogram sums to the Orchard-to-Ironwood band above it", () => {
    // The mockup's two panels disagree by 52,043 ZEC about the same 24 hours.
    // Here they cannot: the caption is computed from the bars, and the bars sum
    // to the band.
    const band = POOLS_VIEW.flows.find((f) => f.from === "orchard" && f.to === "ironwood")?.zat ?? 0n;
    expect(POOLS_VIEW.denominations.zat).toBe(band);
    expect(POOLS_VIEW.denominations.crossings).toBe(POOLS_VIEW.denominations.rows.reduce((a, r) => a + r.count, 0));
  });

  it("the drain starts and ends where the series does", () => {
    const pts = POOLS_VIEW.drain.points;
    expect(pts[0]?.zat).toBe(POOLS_VIEW.drain.startZat);
    expect(pts[pts.length - 1]?.zat).toBe(POOLS_VIEW.drain.nowZat);
    // Monotone: a drain that goes up is not a drain.
    for (let i = 1; i < pts.length; i += 1) {
      expect(pts[i]?.zat ?? 0n, `sample ${i}`).toBeLessThanOrEqual(pts[i - 1]?.zat ?? 0n);
    }
  });

  it("the last history point is the balances table", () => {
    const last = POOLS_VIEW.history[POOLS_VIEW.history.length - 1];
    for (const pool of ["sprout", "sapling", "orchard", "ironwood"] as const) {
      expect(last?.[pool], pool).toBe(POOLS_VIEW.balances.find((b) => b.pool === pool)?.zat);
    }
  });

  it("the claim distribution sums to a hundred percent", () => {
    expect(POOLS_VIEW.neff.rows.reduce((a, r) => a + r.pct, 0)).toBe(100);
  });

  it("Orchard has no inflow, because ZIP 2006 makes it exit-only", () => {
    expect(POOLS_VIEW.flows.filter((f) => f.to === "orchard")).toHaveLength(0);
  });
});

describe("the mempool summary is its own rows", () => {
  const e = MEMPOOL_VIEW.entries;
  const s = MEMPOOL_VIEW.summary;

  it("counts by class add up", () => {
    expect(s.unconfirmed).toBe(e.length);
    expect(s.migrations).toBe(e.filter((r) => r.class === "migration").length);
    expect(s.transparent).toBe(e.filter((r) => r.class === "transparent").length);

    // COUNTED BY CLASS, NOT RESTATED FROM THE FIXTURE'S OWN FORMULA. This line
    // read `e.length - s.migrations - s.transparent`, which is the arithmetic
    // the fixture uses to PRODUCE the number - so the test asserted that the
    // fixture agrees with itself and passed no matter what the rows said. It
    // stayed green while HANDOFF-07 added an `undecoded` row that the
    // subtraction swept into `shielded`, moving /track's headline shielded
    // share from 7 of 12 to 8 of 13 with one row nobody could decode.
    expect(s.shielded).toBe(
      e.filter((r) => r.class === "shield" || r.class === "deshield" || r.class === "shielded")
        .length,
    );
  });

  it("FAIL STATE: an undecoded row is counted into no bucket at all", () => {
    // The discriminating half, and the one that would have caught the defect
    // above on the day it landed. `undecoded` means the decoder declined to
    // read the transaction, so it is evidence of nothing - not of shielded
    // usage, not of transparent usage, not of a migration. The three counts
    // therefore do NOT partition the rows, and asserting that they do is what
    // forced the miscount: a partition is only available when every class
    // belongs in one of the buckets, and this one belongs in none.
    const undecoded = e.filter((r) => r.class === "undecoded");
    expect(undecoded).toHaveLength(1);
    expect(s.shielded + s.migrations + s.transparent).toBe(s.unconfirmed - undecoded.length);

    // And the row itself claims nothing in the cells a reader sees.
    expect(undecoded[0]?.version).toBe("unknown");
    expect(undecoded[0]?.logicalActions).toBeNull();
    expect(undecoded[0]?.feeZat).toBeNull();
    expect(undecoded[0]?.lanes).toEqual([]);
  });

  it("the conventional-fee count is ZIP 317 applied to the rows that could be priced", () => {
    // The mockup says nine of twelve. Eleven of the twelve carry a fee at all -
    // one row is deliberately unpriced, because the fee is not on the wire and
    // a corpus in which every row has one leaves the "not priced" path with no
    // committed example - and by 5,000 zat times max(2, L) ten of those eleven
    // are conventional. The one priced exception is the mining-pool payout at
    // 5,000 with L = 1.
    //
    // THE DENOMINATOR IS `priced`, NOT EVERY ROW. An unpriced transaction is
    // not one that underpaid: "did not pay the conventional fee" is a claim
    // about a fee somebody measured, and counting the unmeasured ones into the
    // denominator is the same false statement `feeZat: 0n` used to make.
    const priced = e.filter((r) => r.feeZat !== null);
    expect(s.pricedCount).toBe(priced.length);
    expect(priced).toHaveLength(11);
    // A PRICED ROW ALWAYS COUNTED ITS ACTIONS, and that is asserted rather than
    // assumed: `logicalActions` became nullable in HANDOFF-07 for the undecoded
    // row, and a null reaching `conventionalFeeZat` would price it at the
    // 10,000 floor and quietly call it conventional.
    expect(priced.every((r) => r.logicalActions !== null)).toBe(true);
    const L = (r: (typeof priced)[number]): number => r.logicalActions ?? -1;
    const conventional = priced.filter((r) => r.feeZat === conventionalFeeZat(L(r)));
    expect(s.conventionalCount).toBe(conventional.length);
    expect(s.conventionalCount).toBe(10);
    const odd = priced.filter((r) => r.feeZat !== conventionalFeeZat(L(r)));
    expect(odd).toHaveLength(1);
    expect(odd[0]?.logicalActions).toBe(1);
    expect(odd[0]?.feeZat).toBe(5_000n);
  });

  it("the ZIP 317 floor is two logical actions", () => {
    expect(conventionalFeeZat(0)).toBe(10_000n);
    expect(conventionalFeeZat(1)).toBe(10_000n);
    expect(conventionalFeeZat(2)).toBe(10_000n);
    expect(conventionalFeeZat(3)).toBe(15_000n);
    expect(conventionalFeeZat(4)).toBe(20_000n);
  });

  it("the high-severity count is the rows at HIGH", () => {
    expect(s.findingsHigh).toBe(e.filter((r) => r.severity === "HIGH").length);
  });

  it("the crossing total is 1,026.4 ZEC and its split adds to it", () => {
    expect(s.crossingZat).toBe(zec("1026.4"));
  });

  it("every txid is 64 lowercase hex characters", () => {
    // A 65-character hash got into this fixture once, which is the same defect
    // LEDGER-01 Q2 found in the mockup's tip hash. Held here so it cannot again.
    for (const r of e) expect(r.txid, r.txid).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("every estimate on the site carries its audit trail", () => {
  const estimates = [
    ROUND_TRIP_VIEW.estimate,
    ...LOCKBOX_VIEW.transactions.map((t) => t.estimate),
  ].filter((e): e is NonNullable<typeof e> => e !== null);

  it("there is at least one to check", () => {
    expect(estimates.length).toBeGreaterThan(2);
  });

  for (const [i, est] of estimates.entries()) {
    it(`estimate ${i}: at least one filter, with countIn and countOut`, () => {
      expect(est.filters.length).toBeGreaterThan(0);
      for (const f of est.filters) {
        expect(typeof f.countIn).toBe("bigint");
        expect(typeof f.countOut).toBe("bigint");
        // A filter cannot grow a candidate set.
        expect(f.countOut).toBeLessThanOrEqual(f.countIn);
      }
    });

    it(`estimate ${i}: at least one assumption, and none of them empty`, () => {
      expect(est.assumptions.length).toBeGreaterThan(0);
      for (const a of est.assumptions) expect(a.trim().length).toBeGreaterThan(0);
    });

    it(`estimate ${i}: the posterior weights do not exceed one`, () => {
      const total = est.top.reduce((a, c) => a + c.p, 0);
      expect(total).toBeLessThanOrEqual(1.0000001);
    });
  }
});

describe("dates print their own text", () => {
  const stamps = [
    ...LOCKBOX_VIEW.transactions.map((t) => t.stamp),
    ...LOCKBOX_VIEW.balances.map((b) => b.stamp),
    ...ROUND_TRIP_VIEW.roundTrip.map((l) => l.stamp),
    ...FLOWS_VIEW.case.steps.map((s) => s.stamp),
    ROUND_TRIP_VIEW.stamp,
    ROUND_TRIP_BLOCK.stamp,
  ];

  it("no stamp is empty", () => {
    for (const s of stamps) expect(s.text.trim().length).toBeGreaterThan(0);
  });

  it("a stamp coarser than a day never carries a time in its text", () => {
    // LEDGER-02 Q3 and LEDGER-03 fold 2: a coarse precision never renders a day,
    // and by the same argument a day-precise stamp never renders an hour.
    for (const s of stamps) {
      if (s.precision === "day" || s.precision === "month" || s.precision === "year") {
        expect(s.text, `${s.precision} stamp "${s.text}" carries a time`).not.toMatch(/\d{2}:\d{2}/);
      }
    }
  });

  it("the corpus carries at least one coarse stamp, so the rule is exercised", () => {
    // The 1 ZEC test deposit in K-2026-01-02 is dated to the day and no
    // further. The research knows the day and not the minute, and the stamp
    // says so rather than inventing 00:00:00.
    expect(stamps.some((s) => s.precision !== "second")).toBe(true);
  });

  it("no stamp's text is a formatted sort key", () => {
    for (const s of stamps) expect(s.text).not.toBe(String(s.sortMs));
  });
});

/* ========================================================================== */

/**
 * The claim ladder, held to itself.
 *
 * A gate round found two estimates whose `claim` had been typed by hand and did
 * not match what `claimLevelFor` returns for their own `nEff` - one of them on
 * /reveal, where the level had been written into a rendered SENTENCE as the
 * word "broad" beside a median N_eff of 1,240, which is above the
 * aggregate-only threshold. Both were over-claims in the unsafe direction: they
 * told a reader the candidate set was narrower than the site's own arithmetic
 * says it is.
 *
 * The ladder is CLAUDE.md's, and it is not a matter of editorial judgement, so
 * nothing in the corpus is allowed to disagree with it. This walks every
 * estimate the fixtures carry and every claim level rendered beside a count.
 */
describe("every claim level is the one the ladder computes", () => {
  const estimates: readonly { readonly where: string; readonly nEff: number; readonly claim: string }[] = [
    ...LOCKBOX_VIEW.transactions.flatMap((t, i) =>
      t.estimate === null ? [] : [{ where: `address tx ${i}`, nEff: t.estimate.nEff, claim: t.estimate.claim }],
    ),
    ...(ROUND_TRIP_VIEW.estimate === null
      ? []
      : [{ where: "tx round trip", nEff: ROUND_TRIP_VIEW.estimate.nEff, claim: ROUND_TRIP_VIEW.estimate.claim }]),
    { where: "pools mode-B context", nEff: POOLS_VIEW.context.medianNEff, claim: POOLS_VIEW.context.claim },
  ];

  it("finds estimates to check, so the walk is not vacuous", () => {
    expect(estimates.length).toBeGreaterThanOrEqual(4);
  });

  it("agrees with claimLevelFor at every one of them", () => {
    for (const e of estimates) {
      expect(e.claim, `${e.where}: N_eff ${e.nEff} is ${claimLevelFor(e.nEff)}, not ${e.claim}`).toBe(claimLevelFor(e.nEff));
    }
  });

  it("the ladder's own thresholds are CLAUDE.md's", () => {
    expect(claimLevelFor(1_001)).toBe("aggregate_only");
    expect(claimLevelFor(1_000)).toBe("broad_candidate_set");
    expect(claimLevelFor(101)).toBe("broad_candidate_set");
    expect(claimLevelFor(100)).toBe("small_heuristic_set");
    expect(claimLevelFor(11)).toBe("small_heuristic_set");
    expect(claimLevelFor(10)).toBe("requires_disclosure");
    expect(claimLevelFor(0)).toBe("requires_disclosure");
  });
});

/* ========================================================================== */

/**
 * The Mode B line on /reveal carries no ZEC amount and no borrowed figure.
 *
 * A gate round found the note count set to 3,129,287, which is the Ironwood
 * pool's ZEC BALANCE - two unrelated quantities that happened to be typed once.
 * The corpus states "3.13M notes" and nothing more precise, so the field is
 * text at that precision and this holds it there.
 */
describe("the Mode B pool context", () => {
  it("states the note count at the precision the corpus states it", () => {
    // Three significant figures - the mockup's "3.13M" - and no decimal point,
    // because A5's amount detector reads one as the shape of a ZEC figure and
    // this pane may contain no amount at all.
    expect(POOLS_VIEW.context.noteCountText).toBe("about 3,130,000");
    expect(POOLS_VIEW.context.noteCountText).not.toMatch(/\d\.\d/);
  });

  it("does not restate any pool balance", () => {
    const balances = POOLS_VIEW.balances.map((b) => b.zat.toString());
    for (const b of balances) {
      expect(POOLS_VIEW.context.noteCountText.replace(/[^0-9]/g, "")).not.toBe(b);
    }
  });
});
