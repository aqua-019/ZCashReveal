import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { asHex } from "@zcashreveal/types";
import { getCase, getLabels } from "@zcashreveal/content";

import {
  P_CHANGE_UNCALIBRATED,
  clusterByCommonInput,
  detectExchangeShapes,
  guessChange,
  isRoundAmount,
  type ClusterTx,
} from "../clustering.js";
import {
  UNSOURCED_CONSENSUS_LABELS,
  isConsensusLabel,
  labelsFor,
  sortByPrecedence,
  strongestLabel,
  texLabel,
  type RankedLabel,
} from "../labels.js";
import {
  amountLikelihood,
  computePosterior,
  fingerprintLikelihood,
  shannonBits,
  timeLikelihood,
  type PosteriorCandidate,
} from "../posterior.js";
import { MAX_TAINT_HOPS, TAINT_CUT_P, estimateTaint, type TaintEdge } from "../taint.js";
import { RELATIVE_EPSILON, matchEcho, type BoundaryEvent, type EchoMatch } from "../echo.js";
import { enforceConservation, violatesConservation } from "../conservation.js";

const ZATOSHI_PER_ZEC = 100_000_000n;
function zec(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > 8) throw new Error(`more than 8 decimal places: ${amount}`);
  return BigInt(whole!) * ZATOSHI_PER_ZEC + BigInt(frac.padEnd(8, "0"));
}
const hx = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/* ==========================================================================
   A4 - golden 4: an unshielding with no candidate is aggregate_only
   ========================================================================== */

describe("A4 - golden 4: the 202,076.207 unshielding has no in-window origin", () => {
  // Case K-2026-01-02 step 4: "The single largest unshielding of the period,
  // from a transaction with zero transparent inputs. It did not go to an
  // exchange: the address has never spent and still holds exactly this balance."
  const UNSHIELD = zec("202076.207");
  const withdrawal: BoundaryEvent = {
    txid: asHex("e179e5b0f9fec1c6a9718b1dbe8cedddf1d8e494db276fe72c047a153365a163"),
    amountZat: UNSHIELD,
    seenAt: 1_767_368_714_000,
    height: 3_190_907,
    pool: "orchard",
    address: "t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V",
  };

  /** Every in-window shield, all far below 100,000 ZEC. */
  const smallShields: BoundaryEvent[] = [
    { txid: hx(1), amountZat: zec("1200"), seenAt: withdrawal.seenAt - 3_600_000, height: 3_190_800, pool: "orchard", address: null },
    { txid: hx(2), amountZat: zec("50.5"), seenAt: withdrawal.seenAt - 7_200_000, height: 3_190_700, pool: "orchard", address: null },
    { txid: hx(3), amountZat: zec("9800"), seenAt: withdrawal.seenAt - 900_000, height: 3_190_880, pool: "orchard", address: null },
  ];

  /**
   * A STAND-IN FOR `Cand_0`, NOT A MEASUREMENT OF IT.
   *
   * When the echo names nobody, the posterior is uniform over the anchor-bounded
   * candidate set (section 3.1), and its real size for this transaction is a
   * number no session in this project can produce - it needs a note commitment
   * tree at the spend's anchor, which arrives with HANDOFF-10's captured block
   * at the earliest. 4,096 is chosen because `log2` of it is exactly 12, so the
   * entropy assertion below tests the arithmetic rather than a rounding, and
   * because it is over the 1,000 threshold `aggregate_only` needs.
   */
  const CAND_0 = 4_096n;

  it("PASS STATE: no echo, so the claim is aggregate_only and N_eff is the whole set", () => {
    expect(smallShields.every((s) => s.amountZat < zec("100000"))).toBe(true);
    const echoes = matchEcho(withdrawal, smallShields, { includePartial: true });
    expect(echoes).toEqual([]);

    const p = computePosterior({ candidates: [], unresolvedCount: CAND_0 });
    expect(p.claimLevel).toBe("aggregate_only");
    expect(p.effectiveSetSize).toBeGreaterThan(1000);
    expect(p.candidateCount).toBe(CAND_0);
    expect(p.top).toEqual([]);
    // The assumption sentence says WHY, in the reader's words, rather than
    // leaving "aggregate_only" to be interpreted.
    expect(p.assumptions.join(" ")).toContain("uniform over the whole anchor-bounded candidate set");
  });

  it("PASS STATE: N_eff equals the candidate set exactly, not an approximation of it", () => {
    const p = computePosterior({ candidates: [], unresolvedCount: CAND_0 });
    expect(p.entropyBits).toBeCloseTo(12, 10); // log2(4096)
    expect(p.effectiveSetSize).toBeCloseTo(4096, 6);
  });

  it("FAIL STATE: an in-window shield that DOES echo collapses the claim", () => {
    // The discriminating half. Without it, "aggregate_only" is satisfied by any
    // posterior that ignores its input.
    const echoing: BoundaryEvent = {
      ...smallShields[0]!,
      txid: hx(9),
      amountZat: UNSHIELD + zec("0.4"),
    };
    const echoes = matchEcho(withdrawal, [...smallShields, echoing]);
    expect(echoes).toHaveLength(1);

    const p = computePosterior({
      candidates: [
        {
          txid: echoing.txid,
          what: "a shielding deposit 1 hour earlier",
          likelihoods: {
            amount: amountLikelihood(echoing.amountZat, UNSHIELD, RELATIVE_EPSILON),
            time: timeLikelihood(3_600_000),
            fingerprint: 1,
            structure: 1,
          },
        },
      ],
      unresolvedCount: CAND_0,
    });
    expect(p.claimLevel).toBe("requires_disclosure");
    expect(p.effectiveSetSize).toBeLessThan(2);
  });

  it("a posterior with NO candidates and NO Cand_0 does not claim certainty", () => {
    // THE BACKWARDS ANSWER THIS GUARDS AGAINST: an empty candidate list with
    // N_eff = 0 classifies `requires_disclosure`, the STRONGEST claim level, for
    // the transaction the project knows least about. `unresolvedCount` being
    // required at the type level is the structural half of the defence; this is
    // the behavioural half, for a caller who genuinely has nothing.
    const p = computePosterior({ candidates: [], unresolvedCount: 0n });
    expect(p.effectiveSetSize).toBe(1); // 2^0
    expect(p.claimLevel).toBe("requires_disclosure");
    // ...and the assumption sentence says the set was empty, so a reader is not
    // told a strong claim without being told it rests on nothing.
    expect(p.assumptions.join(" ")).toContain("(0 notes)");
  });
});

/* ==========================================================================
   A6 - clustering: the three December 2025 withdrawals
   ========================================================================== */

describe("A6 - clustering: the Dec 2025 withdrawals are an exchange-withdrawal shape", () => {
  // Straight out of `packages/content/data/cases.json`, case K-2026-01-02.
  const HOT = "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ";
  const FRESH = "t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK";

  /**
   * The three withdrawals, with the amounts the case states.
   *
   * ONLY STEP 1 HAS A SOURCED CHANGE AMOUNT, AND THE OTHER TWO NOW SAY SO.
   * Step 1's note gives the full mechanics - "Input 120,552.69 ZEC in,
   * 29,999.99 out, 90,552.70 change back to itself: textbook
   * exchange-withdrawal mechanics" - and steps 2 and 3 give an amount out and
   * nothing else. This fixture used to carry `88552.70` and `70552.70` for
   * them, which are in the corpus nowhere: they were arrived at by subtracting
   * the outputs from step 1's change, and even that arithmetic gives
   * 88,552.71 and 70,552.72, because 90,552.70 - 1,999.99 does not end in a
   * zero. Two chain-shaped figures, wrong in the last place, attributed to a
   * named exchange's wallet by sitting in a fixture headed "straight out of
   * cases.json".
   *
   * They are gone rather than corrected, because the corrected numbers would
   * still be inferences printed as transcriptions - the corpus does not say
   * these transactions spent step 1's change, and every one of them paid a fee
   * this project has not measured. `detectExchangeShapes` reads the SHAPE and
   * never the amounts, so the value was doing no work in the test either.
   */
  const WITHDRAWALS = [
    { txid: "f45ded5d44452c405d92e66d69d760a5a7d01f94aab937b96ecd1f666edb4712", out: "29999.99", change: "90552.70" },
    { txid: "b39aa107d41d7d65f962a9662a8cedf893cb1de1485f797736d79489323c9853", out: "1999.99", change: null },
    { txid: "a05e75fe19e9b6d957d32e81c58427fd557401a3583ccbf475f46338ff4af6b3", out: "17999.99", change: null },
  ];

  /**
   * What the change output is worth when the corpus does not say.
   *
   * Deliberately not a plausible balance: a reader who sees 1 ZEC in a change
   * output beside a 17,999.99 withdrawal knows immediately that it is a
   * placeholder, where 70,552.70 reads as a measurement. The shape detector
   * ignores it.
   */
  const UNSOURCED_CHANGE = zec("1");

  function withdrawalTx(w: (typeof WITHDRAWALS)[number]): ClusterTx {
    return {
      txid: w.txid,
      vin: [{ address: HOT, coinbase: false, scriptType: "p2pkh" }],
      vout: [
        { index: 0, valueZat: zec(w.out), addresses: [FRESH], scriptType: "pubkeyhash" },
        {
          index: 1,
          valueZat: w.change === null ? UNSOURCED_CHANGE : zec(w.change),
          addresses: [HOT],
          scriptType: "pubkeyhash",
        },
      ],
    };
  }

  it("the fixture is the case, not a paraphrase of it", () => {
    // Pins the test data to `cases.json` so a change there is a failure here
    // rather than a silent divergence between the Record and the analysis.
    const kase = getCase("K-2026-01-02");
    expect(kase).toBeDefined();
    const steps = kase!.steps.filter((s) => s.from === HOT && s.to === FRESH);
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.txid)).toEqual(WITHDRAWALS.map((w) => w.txid));
    expect(steps.map((s) => s.amount)).toEqual(WITHDRAWALS.map((w) => w.out));
  });

  it("PASS STATE: each is flagged exchange-withdrawal-shape with the change output identified", () => {
    for (const w of WITHDRAWALS) {
      const findings = detectExchangeShapes(withdrawalTx(w));
      expect(findings, w.txid).toHaveLength(1);
      expect(findings[0]!.shape).toBe("exchange-withdrawal-shape");
      // The change is output 1 - the one paying the SPENDING address back.
      expect(findings[0]!.changeToSelfIndex).toBe(1);
      // And it says what it does and does not establish.
      expect(findings[0]!.what).toContain("no evidence at all of WHICH exchange");
    }
  });

  it("PASS STATE: common-input-ownership puts all three in one cluster", () => {
    // Each has a single input, so no EDGE is created - the three are one cluster
    // because they share the one spending address, not because of any merge.
    const clusters = clusterByCommonInput(WITHDRAWALS.map(withdrawalTx));
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.addresses).toEqual([HOT]);
    expect(clusters[0]!.containsMultisig).toBe(false);
  });

  it("FAIL STATE: change to a DIFFERENT address is not the withdrawal shape", () => {
    const noSelfReturn: ClusterTx = {
      ...withdrawalTx(WITHDRAWALS[0]!),
      vout: [
        { index: 0, valueZat: zec("29999.99"), addresses: [FRESH], scriptType: "pubkeyhash" },
        { index: 1, valueZat: zec("90552.70"), addresses: ["t1Ym8XWvN2joxENB2Nc4TVg1M9PxKfWshc5"], scriptType: "pubkeyhash" },
      ],
    };
    expect(detectExchangeShapes(noSelfReturn)).toEqual([]);
  });

  it("the many-to-one sweep is the OTHER shape section 1.4 names", () => {
    // Case step 9: "A classic many-to-one deposit sweep, which supports the
    // hot-wallet reading independently of any third-party label."
    const sweep: ClusterTx = {
      txid: "ad6a3c3df9e0d8aff307506334761e9c130cb00d94498477d36f9059fa5a134b",
      vin: [
        { address: hx(11), coinbase: false, scriptType: "p2pkh" },
        { address: hx(12), coinbase: false, scriptType: "p2pkh" },
        { address: hx(13), coinbase: false, scriptType: "p2pkh" },
        { address: hx(14), coinbase: false, scriptType: "p2pkh" },
      ],
      vout: [{ index: 0, valueZat: zec("1293.9321"), addresses: [HOT], scriptType: "pubkeyhash" }],
    };
    const findings = detectExchangeShapes(sweep);
    expect(findings.map((f) => f.shape)).toEqual(["many-to-one-sweep"]);

    // FAIL SIDE: two inputs is an ordinary payment funded from two UTXOs, not a
    // sweep, so the threshold is doing work rather than decorating the rule.
    const twoInputs: ClusterTx = { ...sweep, vin: sweep.vin.slice(0, 2) };
    expect(detectExchangeShapes(twoInputs)).toEqual([]);
  });

  it("common-input-ownership merges the sweep's inputs, and flags a P2SH quorum", () => {
    const sweep: ClusterTx = {
      txid: "ad6a3c3d",
      vin: [
        { address: "t1aaa", coinbase: false, scriptType: "p2pkh" },
        { address: "t1bbb", coinbase: false, scriptType: "p2pkh" },
        { address: "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo", coinbase: false, scriptType: "p2sh" },
      ],
      vout: [{ index: 0, valueZat: 1n, addresses: ["t1ccc"], scriptType: "pubkeyhash" }],
    };
    const clusters = clusterByCommonInput([sweep]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.addresses).toHaveLength(3);
    // THE FLAG THAT KEEPS A CLUSTER OF SIGNERS FROM READING AS AN OWNER. The
    // ZIP 271 lockbox is 2-of-3 across three organisations; a cluster containing
    // it is a cluster of signers, and section 1.2 says so in as many words.
    expect(clusters[0]!.containsMultisig).toBe(true);
    expect(clusters[0]!.evidence).toEqual(["ad6a3c3d"]);
  });

  it("a coinbase input joins nothing", () => {
    // Without this, every miner's payout would merge into one cluster through
    // the coinbase transaction.
    const coinbase: ClusterTx = {
      txid: "cb",
      vin: [
        { address: null, coinbase: true },
        { address: "t1miner", coinbase: false, scriptType: "p2pkh" },
      ],
      vout: [{ index: 0, valueZat: 1n, addresses: ["t1pool"], scriptType: "pubkeyhash" }],
    };
    const clusters = clusterByCommonInput([coinbase]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.addresses).toEqual(["t1miner"]);
  });

  it("change detection names the SAME output section 1.4 does, not the opposite one", () => {
    // THIS TEST PINNED THE DEFECT UNTIL HANDOFF-08's GATE. It asserted
    // `changeIndex === 0` - the FRESH output - because that is what section
    // 1.3's rule says in isolation, and it is the exact opposite of what
    // section 1.4 says about this very transaction: "one payout + change back
    // to the *same* address ... 120,552.69 -> 29,999.99 + 90,552.70". Output 1
    // is the change. `detectExchangeShapes`, four assertions above, already said
    // so, so the module answered one transaction two contradictory ways and the
    // test locked in the wrong one.
    //
    // The consequence is not cosmetic. A change output extends the cluster with
    // weight `p_change`, so naming output 0 as change soft-merges the
    // WITHDRAWING CUSTOMER's address into the exchange's cluster - a claim that
    // two different parties are one, which is the class of claim this project
    // exists not to make.
    const seen = new Set([HOT]);
    const g = guessChange(withdrawalTx(WITHDRAWALS[0]!), seen);
    expect(g.changeIndex).toBe(1);
    expect(g.pChange).toBe(P_CHANGE_UNCALIBRATED);
    expect(g.calibrated).toBe(false);
    expect(g.reason).toContain("NOT calibrated on Zcash");
    expect(g.reason).toContain("Section 1.4");

    // The two functions now agree, which is the property that was broken.
    const shape = detectExchangeShapes(withdrawalTx(WITHDRAWALS[0]!));
    expect(shape[0]!.changeToSelfIndex).toBe(g.changeIndex);

    // 29,999.99 is NOT a round amount, which is the right answer: an amount that
    // looks round and is fee-adjusted must not be treated as one, or the
    // heuristic identifies the wrong output as change on section 1.4's own
    // example.
    expect(isRoundAmount(zec("29999.99"))).toBe(false);
    expect(isRoundAmount(zec("30000"))).toBe(true);
  });

  it("FAIL STATE: with no output paying an input address, the fresh-address rule is what runs", () => {
    // The discriminating half. Without it, "the change is the reused output" is
    // satisfied by a function that returns the reused output unconditionally,
    // and section 1.3 would have been deleted rather than ordered beneath 1.4.
    const noSelfReturn: ClusterTx = {
      txid: "x",
      vin: [{ address: HOT, coinbase: false, scriptType: "p2pkh" }],
      vout: [
        { index: 0, valueZat: zec("5"), addresses: ["t1fresh"], scriptType: "pubkeyhash" },
        { index: 1, valueZat: zec("7"), addresses: [FRESH], scriptType: "pubkeyhash" },
      ],
    };
    const g = guessChange(noSelfReturn, new Set([HOT, FRESH]));
    expect(g.changeIndex).toBe(0);
    expect(g.reason).not.toContain("Section 1.4");
  });

  it("with BOTH outputs fresh the module abstains, and roundness does not break the tie", () => {
    // THIS TEST ASSERTED THE OPPOSITE FOR ONE COMMIT, AND THE OPPOSITE WAS A
    // CLAIM ABOUT A THIRD PARTY. Gate round 1 found `isRoundAmount` unable to
    // decide anything on the one-fresh path - for an addressed output, "not
    // fresh" already entails "reused" - and the repair made it decide here
    // instead: both outputs fresh, one amount round, name the OTHER change.
    //
    // Gate round 2 ran that on a batched payment, which is what it really is:
    // Alice pays 1.0 ZEC to Bob and 0.37 ZEC to Carol. The rule named CAROL's
    // address as Alice's change at p_change = 0.8 and soft-merged a stranger
    // into Alice's cluster, where the code before it abstained. A branch is not
    // made honest by being made reachable.
    const batchedPayment: ClusterTx = {
      txid: "batched",
      vin: [{ address: "t1alice", coinbase: false, scriptType: "p2pkh" }],
      vout: [
        { index: 0, valueZat: zec("1"), addresses: ["t1bob"], scriptType: "pubkeyhash" },
        { index: 1, valueZat: zec("0.37"), addresses: ["t1carol"], scriptType: "pubkeyhash" },
      ],
    };
    const g = guessChange(batchedPayment, new Set(["t1alice"]));
    expect(g.changeIndex).toBeNull();
    expect(g.pChange).toBe(0);
    expect(g.reason).toContain("Roundness alone");

    // ...and roundness is still a real predicate, used where it cannot invent a
    // membership claim: the corpus's own 29,999.99 is not round, which is what
    // keeps the one-fresh path off the wrong output on section 1.4's example.
    expect(isRoundAmount(zec("29999.99"))).toBe(false);
    expect(isRoundAmount(zec("1"))).toBe(true);
  });

  it("a co-spend of ONE address with itself is not evidence of a cluster", () => {
    // Common-input-ownership is a claim that address X and address Y were spent
    // by one key-holder. A consolidation of three UTXOs of one address makes no
    // such claim, and recording its txid as `evidence` put a justification under
    // a cluster it did not widen. Consolidations are the commonest transparent
    // shape, so this attached most of the chain's txids to singleton clusters.
    const selfConsolidation: ClusterTx = {
      txid: "consolidation",
      vin: [
        { address: HOT, coinbase: false, scriptType: "p2pkh" },
        { address: HOT, coinbase: false, scriptType: "p2pkh" },
        { address: HOT, coinbase: false, scriptType: "p2pkh" },
      ],
      vout: [{ index: 0, valueZat: zec("3"), addresses: [HOT], scriptType: "pubkeyhash" }],
    };
    const clusters = clusterByCommonInput([selfConsolidation]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.addresses).toEqual([HOT]);
    expect(clusters[0]!.evidence).toEqual([]);

    // FAIL STATE: two DISTINCT addresses in one transaction IS the claim, and
    // the txid is recorded - so the guard above is not "record nothing".
    const realCoSpend: ClusterTx = {
      ...selfConsolidation,
      txid: "cospend",
      vin: [
        { address: HOT, coinbase: false, scriptType: "p2pkh" },
        { address: FRESH, coinbase: false, scriptType: "p2pkh" },
      ],
    };
    const merged = clusterByCommonInput([realCoSpend]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.addresses).toEqual([FRESH, HOT].sort());
    expect(merged[0]!.evidence).toEqual(["cospend"]);
  });

  it("change detection REFUSES a shape section 1.3 does not cover", () => {
    const threeOutputs: ClusterTx = {
      txid: "x",
      vin: [{ address: HOT, coinbase: false, scriptType: "p2pkh" }],
      vout: [
        { index: 0, valueZat: 1n, addresses: ["t1a"], scriptType: "pubkeyhash" },
        { index: 1, valueZat: 2n, addresses: ["t1b"], scriptType: "pubkeyhash" },
        { index: 2, valueZat: 3n, addresses: [HOT], scriptType: "pubkeyhash" },
      ],
    };
    const g = guessChange(threeOutputs, new Set([HOT]));
    expect(g.changeIndex).toBeNull();
    expect(g.pChange).toBe(0);
    expect(g.reason).toContain("two-output transaction");
  });
});

/* ==========================================================================
   A7 - labels and precedence
   ========================================================================== */

describe("A7 - labels: consensus, none, and the precedence order", () => {
  const LOCKBOX = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";

  it("PASS STATE: the ZIP 271 lockbox is consensus", () => {
    const l = strongestLabel(LOCKBOX);
    expect(l).not.toBeNull();
    expect(l!.labeller).toBe("consensus");
    expect(l!.rank).toBe(1);
    expect(isConsensusLabel(l!)).toBe(true);
    expect(l!.label).toContain("ZIP 271");
    // The method travels with the label. Section 1.5 requires the provenance to
    // be displayed, so a label that could not say how it was arrived at would be
    // unpublishable.
    expect(l!.method.length).toBeGreaterThan(0);
    expect(l!.sources.length).toBeGreaterThan(0);
  });

  it("PASS STATE: an unknown address has NO label, not a manufactured behavioural one", () => {
    // "Never guesses: an unlabelled address is unlabelled." Returning a
    // `behaviour`-tier row for every unknown address would put a label on every
    // address on the chain.
    expect(labelsFor("t1ThisAddressIsNotInTheCorpusAtAll")).toEqual([]);
    expect(strongestLabel("t1ThisAddressIsNotInTheCorpusAtAll")).toBeNull();
  });

  it("PASS STATE: precedence sorts consensus above analyst", () => {
    const rows: RankedLabel[] = [
      { address: "t1x", label: "an analyst's label", labeller: "analyst", rank: 4, method: "m", confidence: "med", sources: [], network: "mainnet" },
      { address: "t1x", label: "a consensus label", labeller: "consensus", rank: 1, method: "m", confidence: "high", sources: [], network: "mainnet" },
      { address: "t1x", label: "a behavioural label", labeller: "behaviour", rank: 5, method: "m", confidence: "high", sources: [], network: "mainnet" },
      { address: "t1x", label: "the owner's own filing", labeller: "owner-filing", rank: 2, method: "m", confidence: "high", sources: [], network: "mainnet" },
    ];
    expect(sortByPrecedence(rows).map((r) => r.labeller)).toEqual([
      "consensus",
      "owner-filing",
      "analyst",
      "behaviour",
    ]);
  });

  it("FAIL STATE: an analyst label is NOT consensus, however confident", () => {
    // t1PKBiv7 is labelled "Binance" by Lookonchain at `analyst` tier. The whole
    // precedence ladder exists so that a confident analyst claim does not read
    // as a consensus one.
    const l = strongestLabel("t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ");
    expect(l).not.toBeNull();
    expect(l!.labeller).toBe("analyst");
    expect(isConsensusLabel(l!)).toBe(false);
    expect(l!.rank).toBeGreaterThan(1);
  });

  it("ties break on confidence and then on text, so the order is total", () => {
    const rows: RankedLabel[] = [
      { address: "t1x", label: "b", labeller: "analyst", rank: 4, method: "m", confidence: "low", sources: [], network: "mainnet" },
      { address: "t1x", label: "a", labeller: "analyst", rank: 4, method: "m", confidence: "low", sources: [], network: "mainnet" },
      { address: "t1x", label: "c", labeller: "analyst", rank: 4, method: "m", confidence: "high", sources: [], network: "mainnet" },
    ];
    expect(sortByPrecedence(rows).map((r) => r.label)).toEqual(["c", "a", "b"]);
  });

  it("a TEX address is recognised from its encoding, on both networks", () => {
    const mainnet = texLabel("tex1qyqszqgpqyqszqgpqyqszqgpqyqszqgpjnp72x");
    expect(mainnet).not.toBeNull();
    expect(mainnet!.labeller).toBe("consensus");
    expect(mainnet!.network).toBe("mainnet");
    expect(mainnet!.label).toContain("ZIP 320");
    // `med` rather than `high`, because the checksum is validated at the
    // boundary and not here. The confidence is the honest statement of what this
    // structural check establishes.
    expect(mainnet!.confidence).toBe("med");

    const testnet = texLabel("textest1qyqszqgpqyqszqgpqyqszqgpqyqszqgpjnp72x");
    expect(testnet?.network).toBe("testnet");

    // FAIL SIDE, three ways.
    expect(texLabel("t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ")).toBeNull();
    expect(texLabel("zs1qqqqqq")).toBeNull();
    // bech32m forbids mixed case outright, so an uppercase-mixed string is not a
    // TEX address rather than being normalised into one.
    expect(texLabel("TeX1qyqszqgpqyqszqgp")).toBeNull();
  });

  it("the consensus families this repository CANNOT source are named, not invented", () => {
    // The same artefact as `UNSOURCED_WALLET_HYPOTHESES`. Nothing in this
    // repository carries a funding-stream or Founders' Reward address, so
    // neither family is implemented, and the constant is what stops the next
    // reader assuming they were forgotten.
    expect([...UNSOURCED_CONSENSUS_LABELS]).toEqual(["FUNDING_STREAMS", "FOUNDERS_REWARD"]);

    // And the negative fact it rests on, asserted rather than assumed: the
    // corpus's only consensus-tier labels are the two ZIP 271 lockboxes.
    const consensus = getLabels().filter((l) => l.labeller === "consensus");
    expect(consensus).toHaveLength(2);
    expect(consensus.every((l) => l.label.includes("ZIP 271"))).toBe(true);
  });
});

/* ==========================================================================
   A8 - the posterior
   ========================================================================== */

describe("A8 - posterior: three candidates at 0.8/0.1/0.1", () => {
  /** Weights that normalise to exactly 0.8, 0.1, 0.1. */
  const candidates: PosteriorCandidate[] = [
    { txid: hx(1), what: "a shielding deposit 20 minutes earlier", likelihoods: { amount: 0.8, time: 1, fingerprint: 1, structure: 1 } },
    { txid: hx(2), what: "a shielding deposit 2 hours earlier", likelihoods: { amount: 0.1, time: 1, fingerprint: 1, structure: 1 } },
    { txid: hx(3), what: "a shielding deposit 6 hours earlier", likelihoods: { amount: 0.1, time: 1, fingerprint: 1, structure: 1 } },
  ];

  /**
   * A8'S STATED TOLERANCE IS NOT SATISFIABLE BY THE CORRECT ANSWER, AND THIS IS
   * REPORTED RATHER THAN QUIETLY WIDENED.
   *
   * A8 says "H ~ 0.92 bits, N_eff ~ 1.9 ... with tolerance 1e-3". The exact
   * values for a posterior of 0.8/0.1/0.1 are:
   *
   *   H     = -(0.8*log2(0.8) + 2*0.1*log2(0.1)) = 0.9219280948873623
   *   N_eff = 2^H                                = 1.8946457081379975
   *
   * so |H - 0.92| = 1.93e-3, which is nearly twice the stated tolerance, and
   * |N_eff - 1.9| = 5.35e-3, which is over five times it. The assertion's 0.92
   * and 1.9 are two-significant-figure roundings and 1e-3 is a tolerance for
   * three; the two halves of the assertion were written to different precisions.
   *
   * The wrong repairs, both available and both rejected: loosen the tolerance
   * silently until it passes, or "fix" the module until it produces 0.92, which
   * would mean breaking the entropy formula to satisfy a rounded literal. The
   * right one is to assert the EXACT value at full float precision - which is a
   * strictly STRONGER test than the assertion asked for, since it pins every
   * digit rather than three - and to assert the rounded figures at the tolerance
   * a two-figure rounding actually implies. Recorded in section 8 as
   * SPEC-WAS-AMBIGUOUS.
   *
   * NO ORDINAL, DELIBERATELY. This said "the fifth section 5 assertion in this
   * project not to survive literal execution", and the ledger already put the
   * count past that: LEDGER-03 records "the fourth section 5 assertion in three
   * handoffs that does not survive literal execution", and HANDOFF-04's A3
   * probe, HANDOFF-06's Q4 test and HANDOFF-07's A4 unit collision each came
   * after it. A running tally nobody can recount from the file it sits in is a
   * number that decays silently and understates the pattern it exists to name -
   * which for this particular pattern is the worst direction to be wrong in. The
   * enumerated form is the one that holds: see `analysis-purity.test.ts`, which
   * names its three predecessors rather than counting them.
   */
  it("PASS STATE: H is 0.92 bits, N_eff is 1.9, claim is requires_disclosure", () => {
    const p = computePosterior({ candidates, unresolvedCount: 100_000n });

    expect(p.top.map((c) => c.p)).toEqual([
      expect.closeTo(0.8, 10),
      expect.closeTo(0.1, 10),
      expect.closeTo(0.1, 10),
    ]);
    // The stated figures, at the precision they were stated to.
    expect(p.entropyBits.toFixed(2)).toBe("0.92");
    expect(p.effectiveSetSize.toFixed(1)).toBe("1.9");
    expect(p.claimLevel).toBe("requires_disclosure");
    expect(p.candidateCount).toBe(3n);
  });

  it("PASS STATE: the exact values, which is stronger than A8's stated tolerance", () => {
    const p = computePosterior({ candidates, unresolvedCount: 100_000n });
    // -(0.8*log2(0.8) + 2*0.1*log2(0.1))
    expect(p.entropyBits).toBeCloseTo(0.9219280948873623, 15);
    expect(p.effectiveSetSize).toBeCloseTo(1.8946457081379975, 15);

    // And the distances from A8's rounded figures, asserted so the discrepancy
    // is a fact in the suite rather than a claim in a report.
    expect(Math.abs(p.entropyBits - 0.92)).toBeCloseTo(0.0019280948873622, 12);
    expect(Math.abs(p.effectiveSetSize - 1.9)).toBeCloseTo(0.005354291862002, 12);
  });

  it("FAIL STATE: a UNIFORM three-candidate posterior is a different number", () => {
    // Three candidates either way. If the module were counting candidates rather
    // than measuring the distribution, these two would be identical - which is
    // the whole reason N_eff exists rather than a candidate count.
    const uniform = candidates.map((c) => ({ ...c, likelihoods: { ...c.likelihoods, amount: 1 } }));
    const p = computePosterior({ candidates: uniform, unresolvedCount: 100_000n });
    expect(p.candidateCount).toBe(3n);
    expect(p.entropyBits).toBeCloseTo(Math.log2(3), 12);
    expect(p.effectiveSetSize).toBeCloseTo(3, 10);
    expect(p.entropyBits).not.toBeCloseTo(0.92, 2);
  });

  it("shannonBits skips zero terms rather than returning NaN", () => {
    expect(shannonBits([1])).toBe(0);
    expect(shannonBits([0.5, 0.5])).toBeCloseTo(1, 12);
    expect(shannonBits([0.5, 0.5, 0])).toBeCloseTo(1, 12);
    expect(Number.isNaN(shannonBits([0, 0]))).toBe(false);
  });

  it("the four likelihood terms behave as section 4 states", () => {
    // L_amount: 1 for exact, exp(-(relative)/epsilon) otherwise.
    expect(amountLikelihood(100n, 100n, RELATIVE_EPSILON)).toBe(1);
    // At exactly epsilon the weight is exp(-1); at 10*epsilon it is exp(-10).
    const atEpsilon = amountLikelihood(1_000_000n, 1_000_000n - 100n, RELATIVE_EPSILON);
    expect(atEpsilon).toBeCloseTo(Math.exp(-1), 6);
    const atTen = amountLikelihood(1_000_000n, 1_000_000n - 1_000n, RELATIVE_EPSILON);
    expect(atTen).toBeCloseTo(Math.exp(-10), 6);

    // L_time: a half-life kernel, so one half-life is exactly 0.5.
    expect(timeLikelihood(0)).toBe(1);
    expect(timeLikelihood(2 * 24 * 60 * 60 * 1000)).toBeCloseTo(0.5, 12);
    // A candidate AFTER the withdrawal weighs nothing, rather than more than 1.
    expect(timeLikelihood(-1)).toBe(0);

    // L_fp: 1 when they agree, 0.5 when they disagree, and 1 when either side
    // does not know - because an unknown is not a disagreement, which is the
    // distinction HANDOFF-06 spent its length restoring to `likelyWallet`.
    expect(fingerprintLikelihood("ZODL", "ZODL")).toBe(1);
    expect(fingerprintLikelihood("ZODL", "NIGHTHAWK")).toBe(0.5);
    expect(fingerprintLikelihood(null, "ZODL")).toBe(1);
    expect(fingerprintLikelihood("UNKNOWN_UNPRICED", "ZODL")).toBe(1);
    expect(fingerprintLikelihood("UNKNOWN_NONSTANDARD", "UNKNOWN_BUT_STANDARD")).toBe(1);
  });
});

/* ==========================================================================
   Taint
   ========================================================================== */

describe("taint: three hops, a cut at 0.02, and a conserved residual", () => {
  const edge = (from: number, to: number, p: number): TaintEdge => ({
    from: hx(from),
    to: hx(to),
    p,
    what: `a ${p} link`,
  });

  it("mass is conserved exactly", () => {
    const est = estimateTaint(hx(1), [edge(1, 2, 0.6), edge(2, 3, 0.5), edge(3, 4, 0.5)]);
    expect(est.accountedMass).toBeCloseTo(1, 12);
    expect(
      est.unresolvedMass + est.resting.terminal + est.resting.hopLimit,
    ).toBeCloseTo(1, 12);
  });

  it("the unresolved share is the mass no link explains, and is NOT everything", () => {
    // THE DEFECT THE FIRST DRAFT OF THIS MODULE HAD: it drained the final
    // frontier into `unresolvedMass`, so the residual was 100 per cent on every
    // input - a number that always looks appropriately humble and is broken.
    const est = estimateTaint(hx(1), [edge(1, 2, 1.0)]);
    expect(est.unresolvedMass).toBeCloseTo(0, 12);
    expect(est.resting.terminal).toBeCloseTo(1, 12);
    expect(est.followed).toHaveLength(1);
  });

  it("an outgoing weight below 1 leaves the shortfall unresolved", () => {
    const est = estimateTaint(hx(1), [edge(1, 2, 0.3)]);
    expect(est.unresolvedBy.unexplained).toBeCloseTo(0.7, 12);
    expect(est.followed[0]!.mass).toBeCloseTo(0.3, 12);
    expect(est.resting.terminal).toBeCloseTo(0.3, 12);
    expect(est.accountedMass).toBeCloseTo(1, 12);
  });

  it("an edge below the cut is not followed, and its mass is unresolved", () => {
    const est = estimateTaint(hx(1), [edge(1, 2, TAINT_CUT_P - 0.001)]);
    expect(est.followed).toEqual([]);
    expect(est.unresolvedBy.belowCut).toBeGreaterThan(0);
    expect(est.nodes.map((n) => n.txid)).toEqual([hx(1)]);

    // FAIL SIDE: exactly at the cut it IS followed, so the boundary is where it
    // is stated to be rather than one epsilon away.
    const atCut = estimateTaint(hx(1), [edge(1, 2, TAINT_CUT_P)]);
    expect(atCut.followed).toHaveLength(1);
  });

  it("the cut is on the EDGE probability, not on the carried mass", () => {
    // A long chain of strong links carries tiny mass by hop 3. If the cut were
    // on carried mass, the same link would be shown for a large transfer and
    // hidden for a small one.
    const est = estimateTaint(hx(1), [edge(1, 2, 0.5), edge(2, 3, 0.5)], { startingMass: 0.001 });
    expect(est.followed).toHaveLength(2);
    expect(est.followed[1]!.mass).toBeLessThan(TAINT_CUT_P);
  });

  it("the walk stops at three hops and says so", () => {
    const chain = [edge(1, 2, 1), edge(2, 3, 1), edge(3, 4, 1), edge(4, 5, 1), edge(5, 6, 1)];
    const est = estimateTaint(hx(1), chain);
    expect(MAX_TAINT_HOPS).toBe(3);
    expect(est.followed).toHaveLength(3);
    expect(est.nodes.map((n) => n.hops).sort()).toEqual([0, 1, 2, 3]);
    // The mass rests at the hop limit with links still available, which is the
    // one the caller can do something about.
    expect(est.resting.hopLimit).toBeCloseTo(1, 12);
    expect(est.resting.terminal).toBeCloseTo(0, 12);
  });

  it("a cycle terminates and does not double-count", () => {
    const est = estimateTaint(hx(1), [edge(1, 2, 1), edge(2, 1, 1)]);
    expect(est.accountedMass).toBeCloseTo(1, 12);
    expect(est.followed).toHaveLength(3); // 1->2, 2->1, 1->2
    expect(est.nodes.find((n) => n.txid === hx(1))!.hops).toBe(0);
  });

  it("a trail CUT at the hop limit is unresolved, not a destination", () => {
    // EVERY TAINT CHANGE IN THE PREVIOUS COMMIT WAS UNTESTED, and gate round 2
    // reverted all three to green. This is the headline one: at the hop limit
    // a node whose only onward links are BELOW the cut was filed as
    // `resting.terminal` - "the value came to rest here", a destination - while
    // the same node one hop earlier was filed as unresolved. The cut is a link
    // this estimate refuses to draw, not a trail that ended, and the two are
    // different answers to a reader looking at the residual bar.
    const chain = [
      edge(1, 2, 1), edge(2, 3, 1), edge(3, 4, 1),
      // node 4 sits at the hop limit and its only way onward is below the cut
      edge(4, 5, TAINT_CUT_P - 0.001),
    ];
    const est = estimateTaint(hx(1), chain);
    expect(est.resting.terminal).toBeCloseTo(0, 12);
    expect(est.resting.hopLimit).toBeCloseTo(0, 12);
    expect(est.unresolvedBy.belowCut).toBeCloseTo(1, 12);
    expect(est.accountedMass).toBeCloseTo(1, 12);

    // FAIL SIDE: the same shape with the last link ABOVE the cut rests at the
    // hop limit instead - the knob the caller can turn - so this is not
    // "everything at the limit is unresolved".
    const reachable = estimateTaint(hx(1), [edge(1, 2, 1), edge(2, 3, 1), edge(3, 4, 1), edge(4, 5, 0.9)]);
    expect(reachable.resting.hopLimit).toBeCloseTo(1, 12);
    expect(reachable.unresolvedBy.belowCut).toBeCloseTo(0, 12);

    // ...and a node with NO onward link at all is still a destination.
    const ends = estimateTaint(hx(1), [edge(1, 2, 1)]);
    expect(ends.resting.terminal).toBeCloseTo(1, 12);
  });

  it("a weight that is not a finite number carries no mass, and never reaches the output", () => {
    // `NaN` compares false against every threshold, so nothing downstream would
    // have caught it: it would flow through the normalisation into the residual
    // bar, which is this module's headline result.
    const est = estimateTaint(hx(1), [
      { from: hx(1), to: hx(2), p: Number.NaN, what: "nan" },
      { from: hx(1), to: hx(3), p: Number.POSITIVE_INFINITY, what: "inf" },
      { from: hx(1), to: hx(4), p: 0.5, what: "real" },
    ]);
    expect(Number.isFinite(est.accountedMass)).toBe(true);
    expect(est.nodes.every((n) => Number.isFinite(n.mass))).toBe(true);
    expect(est.followed.every((e) => Number.isFinite(e.mass))).toBe(true);
    expect(est.accountedMass).toBeCloseTo(1, 12);
    // Only the real edge was followed, and it carries its own weight - the two
    // refused edges did not become mass and did not soak any up.
    expect(est.followed).toHaveLength(1);
    expect(est.followed[0]!.what).toBe("real");
    expect(est.followed[0]!.mass).toBeCloseTo(0.5, 12);
    expect(est.unresolvedBy.unexplained).toBeCloseTo(0.5, 12);
  });

  it("a starting mass the module REFUSES is said out loud, not printed as a measurement", () => {
    // The clamp turns a negative, NaN or Infinite mass into 0. Without the
    // sentence this asserts, the estimate then prints four confident figures -
    // "0.0 per cent unresolved ... 0.0 per cent rests at a transaction with no
    // onward link" - about a measurement that did not happen, and a caller
    // asserting `accountedMass ~= startingMass` fails on an input the module
    // chose to refuse. `posterior.ts` fixes this shape in the same branch.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const est = estimateTaint(hx(1), [edge(1, 2, 0.5)], { startingMass: bad });
      expect(est.accountedMass).toBe(0);
      expect(est.assumptions.join(" "), String(bad)).toContain("not a usable quantity");
    }
    // FAIL SIDE: a real starting mass says nothing of the kind.
    const good = estimateTaint(hx(1), [edge(1, 2, 0.5)], { startingMass: 2 });
    expect(good.assumptions.join(" ")).not.toContain("not a usable quantity");
    expect(good.accountedMass).toBeCloseTo(2, 12);
  });

  it("assumptions are printed, never empty", () => {
    const est = estimateTaint(hx(1), [edge(1, 2, 0.5)]);
    expect(est.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(est.assumptions.join(" ")).toContain("heuristic link");
  });
});

/* ==========================================================================
   A9 - the conservation property
   ========================================================================== */

describe("A9 - property: estimated exits never exceed the pool balance", () => {
  /**
   * Section 3.11: "For every pool and window, `sum estimated exits <= Bal^p`
   * ... Any estimator output that violates conservation is rejected and logged."
   *
   * THE PROPERTY IS ABOUT THE ESTIMATOR, NOT ABOUT THE CHAIN, and getting that
   * backwards is the trap. The chain's own conservation is enforced by
   * `ValuePool` and by consensus. What section 3.11 asks THIS layer for is that
   * no heuristic ever attributes more value to exits than the pool held - which
   * is possible here in a way it is not on-chain, because a single deposit can
   * be matched by several withdrawals at once. Every match is a separate
   * hypothesis, and summing hypotheses is exactly how an estimator manufactures
   * value that never existed.
   *
   * WHAT THIS BLOCK LOOKED LIKE BEFORE HANDOFF-08's GATE, BECAUSE THE SHAPE
   * RECURS. It checked `match.depositAmountZat > balance` for each match
   * SEPARATELY - a per-match comparison standing in for a SUM - and
   * `depositAmountZat` is a total over a subset of the very deposits whose sum
   * IS the balance, so the condition was a tautology no input could falsify.
   * Its fail-side partner built a `violating` object and an `audit` object as
   * literals inside the test file and asserted things about them: no production
   * code ran, and half of section 3.11 - the rejection - was not implemented at
   * all. Inserting `if (true) return [];` at the head of `matchEcho` left every
   * assertion in the block green.
   *
   * So the block now (a) sums, (b) calls `enforceConservation` and
   * `violatesConservation` from `conservation.ts` rather than restating them,
   * and (c) counts the matches it saw, so an estimator that returns nothing
   * fails instead of passing vacuously.
   */
  function poolBalanceOf(deposits: ReadonlyArray<BoundaryEvent>): bigint {
    return deposits.reduce((acc, d) => acc + d.amountZat, 0n);
  }

  function sumClaimed(matches: ReadonlyArray<EchoMatch>): bigint {
    return matches.reduce((acc, m) => acc + m.depositAmountZat, 0n);
  }

  it("PASS STATE: over 300 random windows, the SIEVED matches conserve the pool", () => {
    const amount = fc.bigInt({ min: 1n, max: 10_000n * ZATOSHI_PER_ZEC });
    const event = fc
      .record({ amountZat: amount, offset: fc.integer({ min: 0, max: 6 * 24 * 60 * 60 * 1000 }) })
      .map((r, ...rest) => ({ ...r, rest }));

    // NON-VACUITY, COUNTED ACROSS THE WHOLE RUN. `fc.assert` is happy with a
    // property that is true because its quantifier is empty, and MUT-4 - `if
    // (true) return [];` at the head of `matchEcho` - is exactly that mutation.
    // The counter is asserted after the property, so the run has to have
    // produced real matches for the block to pass.
    let matchesSeen = 0;
    let acceptedSeen = 0;

    fc.assert(
      fc.property(
        fc.array(event, { minLength: 1, maxLength: 12 }),
        fc.array(event, { minLength: 1, maxLength: 12 }),
        (rawDeposits, rawWithdrawals) => {
          const T = 1_000_000_000_000;
          const deposits: BoundaryEvent[] = rawDeposits.map((d, i) => ({
            txid: hx(i + 1),
            amountZat: d.amountZat,
            seenAt: T + d.offset,
            height: 1_000_000,
            pool: "orchard",
            address: null,
          }));
          const balance = poolBalanceOf(deposits);
          const lastDeposit = Math.max(...deposits.map((d) => d.seenAt));

          // THE WINDOW, NOT ONE WITHDRAWAL. Section 3.11 quantifies over "every
          // pool and window", and the violation this exists to catch only
          // appears when the matches of DIFFERENT withdrawals are put beside
          // each other - `matchEcho` is per-withdrawal and pure, so it cannot
          // see a deposit another withdrawal already claimed. Testing one
          // withdrawal at a time is how the old block missed it.
          const all: EchoMatch[] = [];
          for (const [i, w] of rawWithdrawals.entries()) {
            const withdrawal: BoundaryEvent = {
              txid: hx(1000 + i),
              amountZat: w.amountZat,
              seenAt: lastDeposit + 1 + w.offset,
              height: 1_000_001,
              pool: "orchard",
              address: null,
            };
            all.push(...matchEcho(withdrawal, deposits));
          }
          matchesSeen += all.length;

          for (const m of all) {
            // Every deposit cited is a real one, so no match invents value.
            const cited = new Set(m.depositTxids);
            if (cited.size !== m.depositTxids.length) return false;
            for (const txid of cited) {
              if (!deposits.some((d) => d.txid === txid)) return false;
            }
            // The residual is exactly the arithmetic it claims to be.
            if (m.residualZat !== m.depositAmountZat - m.withdrawalAmountZat) return false;
            // A subset-sum match's own arithmetic closes.
            if (m.kind === "SUBSET_SUM") {
              const summed = m.depositTxids.reduce(
                (acc, t) => acc + (deposits.find((d) => d.txid === t)?.amountZat ?? 0n),
                0n,
              );
              if (summed !== m.depositAmountZat) return false;
            }
          }

          const result = enforceConservation(all, balance);
          acceptedSeen += result.accepted.length;

          // The law itself, over the sum, on the output the pipeline keeps.
          if (sumClaimed(result.accepted) > balance) return false;
          if (result.claimedZat !== sumClaimed(result.accepted)) return false;
          if (violatesConservation(result.accepted, balance)) return false;
          // Nothing is invented or lost by the sieve.
          if (result.accepted.length + result.rejected.length !== all.length) return false;
          if (result.audit.countIn !== BigInt(all.length)) return false;
          if (result.audit.countOut !== BigInt(result.accepted.length)) return false;
          // DETERMINISTIC: the same set in any order gives the same answer.
          const shuffled = enforceConservation([...all].reverse(), balance);
          if (shuffled.claimedZat !== result.claimedZat) return false;
          // DEPOSITS TOO, NOT JUST WITHDRAWALS. This compared withdrawal txids
          // alone, so two matches explaining one withdrawal from different
          // deposits looked identical to it - which is exactly the pair whose
          // comparator tie was not total, so the check could not see the
          // non-determinism it existed to catch.
          const shape = (ms: ReadonlyArray<EchoMatch>) =>
            ms.map((m) => `${m.withdrawalTxid}<-${m.depositTxids.join("+")}`).join();
          if (shape(shuffled.accepted) !== shape(result.accepted)) return false;
          return true;
        },
      ),
      { numRuns: 300 },
    );

    expect(matchesSeen, "the property never saw a match, so it proved nothing").toBeGreaterThan(0);
    expect(acceptedSeen, "the sieve accepted nothing, so the law was never tested").toBeGreaterThan(0);
  });

  it("REGRESSION, the scenario A9 was written to forbid: one deposit answering three withdrawals", () => {
    // THE VIOLATION, REPRODUCED FROM PRODUCTION CODE. Without this, the sieve
    // above is a filter nobody has shown to be necessary, and "the accepted
    // matches conserve" is satisfied by an estimator that never matched
    // anything. One 100 ZEC deposit and three 100 ZEC withdrawals in the same
    // window: `matchEcho` answers each withdrawal alone and is pure, so it
    // returns three EXACT matches at grade HIGH, each claiming the same
    // 100 ZEC - 300 ZEC of estimated exits against a pool that held 100.
    const deposit: BoundaryEvent = {
      txid: hx(1), amountZat: zec("100"), seenAt: 0, height: 1, pool: "orchard", address: null,
    };
    const balance = poolBalanceOf([deposit]);
    const raw: EchoMatch[] = [0, 1, 2].map((i) => {
      const found = matchEcho(
        { txid: hx(100 + i), amountZat: zec("100"), seenAt: 60_000 * (i + 1), height: 2, pool: "orchard", address: null },
        [deposit],
      );
      expect(found).toHaveLength(1);
      expect(found[0]!.kind).toBe("EXACT");
      expect(found[0]!.grade).toBe("HIGH");
      return found[0]!;
    });

    // L2's reproduction on main at 4386e98, assertion for assertion:
    //   matches = 3   grades = HIGH, HIGH, HIGH
    //   pool balance   = 100 ZEC   sum of claimed = 300 ZEC
    expect(raw).toHaveLength(3);
    expect(raw.map((m) => m.grade)).toEqual(["HIGH", "HIGH", "HIGH"]);
    expect(balance).toBe(10_000_000_000n);
    expect(sumClaimed(raw)).toBe(30_000_000_000n);
    expect(sumClaimed(raw)).toBe(zec("300"));
    expect(sumClaimed(raw) > balance).toBe(true);
    expect(violatesConservation(raw, balance)).toBe(true);

    // ...and section 3.11's second half: rejected AND logged, by production code.
    const result = enforceConservation(raw, balance);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "deposit_already_claimed",
      "deposit_already_claimed",
    ]);
    expect(result.claimedZat).toBe(zec("100"));
    expect(violatesConservation(result.accepted, balance)).toBe(false);

    // NARROWED ON THE DISCRIMINATOR, NOT CAST THROUGH IT. `FilterApplication`
    // is a union keyed on `filter`, so reading `params.rejectedForDoubleClaim`
    // only compiles once the record has been narrowed to the `conservation`
    // variant - which makes this assertion a compile-time check that the
    // estimator emits the right variant as well as a runtime one.
    const audit = result.audit;
    expect(audit.filter).toBe("conservation");
    if (audit.filter !== "conservation") throw new Error("not a conservation record");
    expect(audit.countIn).toBe(3n);
    expect(audit.countOut).toBe(1n);
    expect(audit.params.rejectedForDoubleClaim).toBe(2);
    expect(audit.params.poolBalanceZat).toBe(balance);
    expect(audit.params.claimedZat).toBe(zec("100"));
  });

  it("the OTHER rejection reason fires too - distinct deposits over the balance", () => {
    // `deposit_already_claimed` alone would leave `exceeds_pool_balance` a
    // branch nothing reaches. Two DIFFERENT deposits, each matched by its own
    // withdrawal, against a pool balance smaller than their sum - which is what
    // a window boundary looks like when a deposit entered before it.
    const deposits: BoundaryEvent[] = [
      { txid: hx(1), amountZat: zec("100"), seenAt: 0, height: 1, pool: "orchard", address: null },
      { txid: hx(2), amountZat: zec("60"), seenAt: 1_000, height: 1, pool: "orchard", address: null },
    ];
    const raw: EchoMatch[] = ["100", "60"].map((amt, i) => {
      const found = matchEcho(
        { txid: hx(200 + i), amountZat: zec(amt), seenAt: 60_000, height: 2, pool: "orchard", address: null },
        deposits,
      );
      expect(found).toHaveLength(1);
      return found[0]!;
    });
    expect(sumClaimed(raw)).toBe(zec("160"));

    const balance = zec("120");
    expect(violatesConservation(raw, balance)).toBe(true);

    const result = enforceConservation(raw, balance);
    expect(result.claimedZat).toBe(zec("100"));
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toBe("exceeds_pool_balance");
    expect(result.rejected[0]!.claimedBeforeZat).toBe(zec("100"));
    if (result.audit.filter !== "conservation") throw new Error("not a conservation record");
    expect(result.audit.params.rejectedForBalance).toBe(1);
  });

  it("REGRESSION, the mirror image: three deposits explaining ONE withdrawal", () => {
    // GATE ROUND 2 FOUND THE FIX HALF-DONE, WHICH IS WHY A FIX COMMIT IS
    // REVIEWED AS ITS OWN COMMIT. `enforceConservation` barred a DEPOSIT from
    // being claimed twice and left a WITHDRAWAL free to be explained three
    // times - the same defect with the two sides of the assignment swapped,
    // shipped in the module written to fix it. Section 4 says "one-to-one
    // assignment", and a one-to-one assignment constrains both vertex sets.
    const deposits: BoundaryEvent[] = [1, 2, 3].map((i) => ({
      txid: hx(i), amountZat: zec("100"), seenAt: i * 1_000, height: 1, pool: "orchard", address: null,
    }));
    const balance = deposits.reduce((a, d) => a + d.amountZat, 0n);
    expect(balance).toBe(zec("300"));

    const raw = matchEcho(
      { txid: hx(500), amountZat: zec("100"), seenAt: 60_000, height: 2, pool: "orchard", address: null },
      deposits,
    );
    expect(raw).toHaveLength(3);
    expect(new Set(raw.map((m) => m.withdrawalTxid)).size).toBe(1);

    // The raw estimator claims 300 ZEC of exits through a transaction that
    // moved 100. Only one deposit can be the true origin; three are published.
    expect(sumClaimed(raw)).toBe(zec("300"));
    expect(raw.reduce((a, m) => a + m.withdrawalAmountZat, 0n)).toBe(zec("300"));
    expect(violatesConservation(raw, balance)).toBe(true);

    const result = enforceConservation(raw, balance);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "withdrawal_already_explained",
      "withdrawal_already_explained",
    ]);
    expect(result.exitZat).toBe(zec("100"));
    expect(violatesConservation(result.accepted, balance)).toBe(false);
    if (result.audit.filter !== "conservation") throw new Error("not a conservation record");
    expect(result.audit.params.rejectedForRivalWithdrawal).toBe(2);
  });

  it("the law is bounded on EXITS, which is not the deposit side for an inexact match", () => {
    // Section 3.11 says `sum estimated exits <= Bal^p`. Both functions summed
    // `depositAmountZat`, and the two are equal only for an EXACT match, so the
    // module bounded a quantity the law does not name. One 100 ZEC deposit, one
    // 100.009 ZEC withdrawal - a RELATIVE match - against a pool of exactly 100:
    // the deposit side fits and the exits do not.
    const deposit: BoundaryEvent = {
      txid: hx(1), amountZat: zec("100"), seenAt: 0, height: 1, pool: "orchard", address: null,
    };
    const raw = matchEcho(
      { txid: hx(600), amountZat: zec("100.009"), seenAt: 60_000, height: 2, pool: "orchard", address: null },
      [deposit],
    );
    expect(raw).toHaveLength(1);
    expect(raw[0]!.kind).toBe("RELATIVE");

    const balance = zec("100");
    expect(sumClaimed(raw)).toBe(balance); // the deposit side fits exactly
    expect(raw[0]!.withdrawalAmountZat > balance).toBe(true); // the exits do not
    expect(violatesConservation(raw, balance)).toBe(true);
    expect(enforceConservation(raw, balance).accepted).toEqual([]);
  });

  it("the assignment keeps the BEST-evidenced claim, and the tightest residual breaks a grade tie", () => {
    // Two of `enforceConservation`'s four sort keys shipped unverified: gate
    // round 2 reversed GRADE_ORDER so the WEAKEST claim won the assignment, and
    // separately dropped the residual tie-break, and both mutations were green.
    // The module's central design sentence - "Strongest first, so the greedy
    // assignment keeps the best-evidenced claim" - was untested.
    //
    // Both cases are built so the BALANCE admits either match alone and not
    // both, which is what makes the SORT the deciding factor rather than the
    // arithmetic, and so the txid key would pick the wrong one if the key under
    // test were removed.
    const ev = (txid: number, amt: string, seenAt: number): BoundaryEvent => ({
      txid: hx(txid), amountZat: zec(amt), seenAt, height: 1, pool: "orchard", address: null,
    });

    // GRADE. One exact match alone (HIGH) against one of two exact rivals (LOW),
    // both 10 ZEC, against a 10 ZEC pool. The LOW carries the lower withdrawal
    // txid, so reversing GRADE_ORDER hands it the assignment.
    const high = matchEcho(ev(701, "10", 60_000), [ev(1, "10", 0)])[0]!;
    const low = matchEcho(ev(700, "10", 60_000), [ev(2, "10", 0), ev(3, "10", 0)])[0]!;
    expect(high.grade).toBe("HIGH");
    expect(low.grade).toBe("LOW");
    expect(low.withdrawalTxid < high.withdrawalTxid).toBe(true);
    const byGrade = enforceConservation([low, high], zec("10"));
    expect(byGrade.accepted).toHaveLength(1);
    expect(byGrade.accepted[0]!.grade).toBe("HIGH");

    // RESIDUAL. Two fee-tolerant matches at the same grade, 50,000 and 100,000
    // zat out. The looser one carries the lower withdrawal txid, so dropping
    // the residual key hands it the assignment.
    const near = matchEcho(ev(801, "30", 60_000), [ev(4, "30.0005", 0)])[0]!;
    const far = matchEcho(ev(800, "30", 60_000), [ev(5, "30.001", 0)])[0]!;
    expect(near.grade).toBe(far.grade);
    expect(near.residualZat).toBe(50_000n);
    expect(far.residualZat).toBe(100_000n);
    expect(far.withdrawalTxid < near.withdrawalTxid).toBe(true);
    const byResidual = enforceConservation([far, near], zec("30.001"));
    expect(byResidual.accepted).toHaveLength(1);
    expect(byResidual.accepted[0]!.depositTxids).toEqual(near.depositTxids);
  });

  it("FAIL STATE: a conserving set passes through the sieve untouched", () => {
    // THE PROBE THAT HAS TO NOT FIRE. Two of the three tests above assert that
    // `enforceConservation` REJECTS, and a function that rejected everything
    // would satisfy all of them. LEDGER-05's rule is that a fail-side probe
    // which does not discriminate is itself a finding, so the sieve is shown
    // keeping a set that never broke the law.
    const deposits: BoundaryEvent[] = [
      { txid: hx(1), amountZat: zec("100"), seenAt: 0, height: 1, pool: "orchard", address: null },
      { txid: hx(2), amountZat: zec("60"), seenAt: 1_000, height: 1, pool: "orchard", address: null },
    ];
    const balance = poolBalanceOf(deposits);
    expect(balance).toBe(zec("160"));

    const raw: EchoMatch[] = ["100", "60"].map((amt, i) => {
      const found = matchEcho(
        { txid: hx(300 + i), amountZat: zec(amt), seenAt: 60_000, height: 2, pool: "orchard", address: null },
        deposits,
      );
      expect(found).toHaveLength(1);
      return found[0]!;
    });

    expect(violatesConservation(raw, balance)).toBe(false);
    const result = enforceConservation(raw, balance);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2);
    expect(result.claimedZat).toBe(zec("160"));
    expect(result.audit.countIn).toBe(result.audit.countOut);
    if (result.audit.filter !== "conservation") throw new Error("not a conservation record");
    expect(result.audit.params.rejectedForDoubleClaim).toBe(0);
    expect(result.audit.params.rejectedForBalance).toBe(0);
  });

  it("PASS STATE: the entropy of any normalised posterior is bounded by log2(n)", () => {
    // The second conservation-shaped property, and the one that keeps a claim
    // level honest: N_eff can never exceed the candidate count, so a posterior
    // cannot report a larger anonymity set than it actually has candidates for.
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.001, max: 1000, noNaN: true }), { minLength: 1, maxLength: 20 }),
        (weights) => {
          const candidates: PosteriorCandidate[] = weights.map((w, i) => ({
            txid: hx(i + 1),
            what: `candidate ${i}`,
            likelihoods: { amount: w, time: 1, fingerprint: 1, structure: 1 },
          }));
          const p = computePosterior({ candidates, unresolvedCount: 1_000_000n, topK: 20 });
          // Floating-point slack of 1e-9 on the bound, not on the claim.
          return (
            p.entropyBits <= Math.log2(weights.length) + 1e-9 &&
            p.effectiveSetSize <= weights.length + 1e-9 &&
            p.effectiveSetSize >= 1 - 1e-9
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
