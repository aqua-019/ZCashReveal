/**
 * Module 8B - the transparent side (TRACKING-MATH section 1).
 *
 * Common-input-ownership clustering, change detection with `p_change`, and the
 * two exchange shapes section 1.4 names. Everything here is about the
 * TRANSPARENT side, which is the half of Zcash where the chain really does say
 * who paid whom - so this module is the one place in the analysis layer that
 * deals in exact facts, and the one where over-claiming is easiest.
 *
 * THE P2SH FLAG IS NOT A DETAIL. Section 1.2: "P2SH multisig (the ZIP 271
 * lockbox is a 2-of-3 held by three organisations - a cluster of *signers*, not
 * one owner)". Common-input-ownership says the inputs of a transaction were
 * signed by one key-holder; for a multisig that key-holder is a QUORUM, and
 * merging a multisig's cluster with a personal wallet's would assert that three
 * organisations and an individual are the same entity. Every cluster carries
 * `containsMultisig`, and the lockbox is the address this project exists to
 * track, so the flag fires on the case that matters most.
 *
 * CHANGE IS SOFT MEMBERSHIP AND STAYS SOFT. Section 1.3 gives change a
 * probability and says change outputs extend a cluster "with weight `p_change`
 * (soft membership), never as fact". So `union()` and `changeOf()` are separate
 * functions with separate outputs, and nothing here folds a change output into
 * the union-find structure. A caller that wants the soft edge reads
 * `ChangeGuess` and decides; it cannot get one by accident.
 */

/* ============================================================================
   Section 1.2 - common-input-ownership
   ========================================================================== */

/**
 * `p_change`, section 1.3's calibrated probability that the fresh output of a
 * two-output transparent transaction is change.
 *
 * IT IS THE BITCOIN LITERATURE'S NUMBER AND THIS PROJECT HAS NOT CALIBRATED IT.
 * Section 1.3 says "Bitcoin literature gives 0.8-0.9; we calibrate on Zcash and
 * print the number", and the calibration has not happened - it needs a corpus of
 * Zcash transactions with known change, which arrives with HANDOFF-10's captured
 * blocks at the earliest. 0.8 is the CONSERVATIVE end of the literature's range,
 * chosen deliberately over 0.9 so the uncalibrated number under-claims rather
 * than over-claims, and every `ChangeGuess` carries `calibrated: false` so the
 * UI can say so rather than printing a borrowed constant as a measurement. This
 * is the same standard the wallet fingerprints are now held to.
 */
export const P_CHANGE_UNCALIBRATED = 0.8;

/** A transparent input as the clusterer needs it. */
export interface ClusterInput {
  readonly address: string | null;
  readonly coinbase: boolean;
  /** "p2pkh" | "p2sh" | "tex" | anything the decoder reported. */
  readonly scriptType?: string;
}

/** A transparent output as the clusterer needs it. */
export interface ClusterOutput {
  readonly index: number;
  readonly valueZat: bigint;
  readonly addresses: ReadonlyArray<string>;
  readonly scriptType: string;
}

/** One transparent transaction, reduced to what sections 1.2 to 1.4 read. */
export interface ClusterTx {
  readonly txid: string;
  readonly vin: ReadonlyArray<ClusterInput>;
  readonly vout: ReadonlyArray<ClusterOutput>;
}

/** A set of addresses believed to be spent by one key-holder. */
export interface Cluster {
  readonly addresses: ReadonlyArray<string>;
  /**
   * True when any address in this cluster is P2SH.
   *
   * A CLUSTER OF SIGNERS IS NOT AN OWNER. See the module docblock. A caller
   * rendering a cluster with this flag set must say "signers", not "owner".
   */
  readonly containsMultisig: boolean;
  /** The txids whose common inputs produced this cluster, for the audit line. */
  readonly evidence: ReadonlyArray<string>;
}

/**
 * Union-find over transparent input scripts: all inputs of one transaction are
 * spent by one key-holder, so they join a cluster.
 *
 * A COINBASE INPUT JOINS NOTHING. It has no prior owner and no address, so
 * including it would merge every miner's payout into one cluster through the
 * coinbase transaction. Excluded explicitly rather than falling out of the null
 * address check, so the reason is visible.
 *
 * SINGLE-INPUT TRANSACTIONS PRODUCE NO EDGE, only a singleton cluster. That is
 * not an optimisation: common-input-ownership is a claim about two addresses
 * being co-spent, and one input is no such claim.
 *
 * Pure: builds and returns new structures, and does not mutate `txs`.
 */
export function clusterByCommonInput(txs: ReadonlyArray<ClusterTx>): ReadonlyArray<Cluster> {
  const parent = new Map<string, string>();
  const multisig = new Set<string>();
  const evidence = new Map<string, Set<string>>();

  function find(a: string): string {
    let root = a;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression, iteratively - a recursive walk over a long chain of
    // consolidation inputs is a stack this process does not need to spend.
    let cursor = a;
    while (parent.get(cursor) !== undefined && parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  function add(address: string, scriptType: string | undefined): void {
    if (parent.get(address) === undefined) parent.set(address, address);
    if (scriptType === "p2sh") multisig.add(address);
  }

  for (const tx of txs) {
    const spendable = tx.vin.filter(
      (v): v is ClusterInput & { address: string } => !v.coinbase && v.address !== null,
    );
    for (const v of spendable) add(v.address, v.scriptType);
    if (spendable.length < 2) continue;

    const first = spendable[0]!.address;
    for (const v of spendable.slice(1)) {
      const a = find(first);
      const b = find(v.address);
      if (a !== b) parent.set(b, a);
    }
    const root = find(first);
    const seen = evidence.get(root) ?? new Set<string>();
    seen.add(tx.txid);
    evidence.set(root, seen);
  }

  const members = new Map<string, string[]>();
  for (const address of parent.keys()) {
    const root = find(address);
    const list = members.get(root) ?? [];
    list.push(address);
    members.set(root, list);
  }

  const out: Cluster[] = [];
  for (const [root, addresses] of members) {
    // Evidence was recorded against whatever the root was at merge time, which
    // path compression may have moved. Gather across every member so a cluster
    // never loses the txids that justify it.
    const txids = new Set<string>();
    for (const a of addresses) for (const t of evidence.get(a) ?? []) txids.add(t);
    for (const t of evidence.get(root) ?? []) txids.add(t);

    out.push({
      addresses: [...addresses].sort(),
      containsMultisig: addresses.some((a) => multisig.has(a)),
      evidence: [...txids].sort(),
    });
  }
  return out.sort((a, b) => (a.addresses[0] ?? "").localeCompare(b.addresses[0] ?? ""));
}

/* ============================================================================
   Section 1.3 - change detection
   ========================================================================== */

export interface ChangeGuess {
  /** The output index believed to be change, or `null` when none is. */
  readonly changeIndex: number | null;
  readonly pChange: number;
  /** Always `false` until section 1.3's Zcash calibration happens. */
  readonly calibrated: boolean;
  readonly reason: string;
}

/**
 * Section 1.3's change heuristic, for a two-output transparent transaction.
 *
 * THE PRECONDITIONS ARE PART OF THE RULE. Section 1.3 is stated for "a 2-output
 * transparent tx where one output pays a never-seen-before address of the same
 * script type and the other is a 'round' amount or a reused address". Three or
 * more outputs is a different shape with a different literature, and this
 * function returns `null` for it rather than guessing - the same refusal the
 * wallet fingerprints now make.
 *
 * `seenAddresses` is the caller's view of what the chain has seen before. It has
 * to be passed in rather than derived, because "never seen before" is a property
 * of the whole chain up to this height and this module is pure.
 */
export function guessChange(
  tx: ClusterTx,
  seenAddresses: ReadonlySet<string>,
): ChangeGuess {
  const none = (reason: string): ChangeGuess => ({
    changeIndex: null,
    pChange: 0,
    calibrated: false,
    reason,
  });

  if (tx.vout.length !== 2) {
    return none(
      `Section 1.3's change heuristic is stated for a two-output transaction; this has ${tx.vout.length}.`,
    );
  }

  const [a, b] = tx.vout as [ClusterOutput, ClusterOutput];
  if (a.scriptType !== b.scriptType) {
    return none("The two outputs are different script types, so neither is the 'same script type' the rule requires.");
  }

  const fresh = (o: ClusterOutput) =>
    o.addresses.length > 0 && o.addresses.every((x) => !seenAddresses.has(x));
  const aFresh = fresh(a);
  const bFresh = fresh(b);

  if (aFresh === bFresh) {
    return none(
      aFresh
        ? "Both outputs pay addresses never seen before, so freshness does not distinguish them."
        : "Neither output pays a fresh address, so there is no change candidate under this rule.",
    );
  }

  const change = aFresh ? a : b;
  const payment = aFresh ? b : a;

  // The second conjunct: the OTHER output must be round or reused. A reused
  // address is already established by `fresh` being false for it, so only
  // roundness is checked here, and either satisfies the rule.
  const reused = payment.addresses.some((x) => seenAddresses.has(x));
  if (!reused && !isRoundAmount(payment.valueZat)) {
    return none(
      "The non-fresh output is neither a round amount nor a reused address, so the rule's second conjunct fails.",
    );
  }

  return {
    changeIndex: change.index,
    pChange: P_CHANGE_UNCALIBRATED,
    calibrated: false,
    reason: `Output ${change.index} pays a never-seen address of the same script type while output ${payment.index} ${reused ? "reuses a known address" : "is a round amount"}. p_change = ${P_CHANGE_UNCALIBRATED} from the Bitcoin literature's conservative end; NOT calibrated on Zcash (TRACKING-MATH section 1.3).`,
  };
}

/**
 * Whether an amount is "round" in section 1.3's sense.
 *
 * DEFINED AS A WHOLE NUMBER OF ZEC OR BETTER, which is a judgement the section
 * does not make for us and is recorded as an assumption. A payment of exactly
 * 30,000 ZEC is round; 29,999.99 - the actual first withdrawal in case
 * K-2026-01-02 - is NOT, which is the right answer: that amount is round in
 * appearance and is a fee-adjusted payment, and treating it as round would make
 * the heuristic identify the wrong output as change on the very case section 1.4
 * uses as its example.
 */
export function isRoundAmount(valueZat: bigint): boolean {
  const ZATOSHI_PER_ZEC = 100_000_000n;
  return valueZat > 0n && valueZat % ZATOSHI_PER_ZEC === 0n;
}

/* ============================================================================
   Section 1.4 - exchange shapes
   ========================================================================== */

export type ExchangeShape = "exchange-withdrawal-shape" | "many-to-one-sweep";

export interface ShapeFinding {
  readonly shape: ExchangeShape;
  readonly txid: string;
  /** The output index that returns to the spending address, when there is one. */
  readonly changeToSelfIndex: number | null;
  readonly what: string;
}

/**
 * Section 1.4's two behavioural exchange signatures.
 *
 *   exchange-withdrawal-shape: one input address, one payout, and change back to
 *                              the SAME address.
 *   many-to-one-sweep:         many input addresses consolidated into one output.
 *
 * BEHAVIOURAL, AND THAT IS THE CEILING. Section 1.4: these "justify the label
 * 'exchange hot wallet' (high) but *not* 'which exchange' - that needs a
 * confirmation or a vendor label". So this function returns a SHAPE and never a
 * name, and `labels.ts` is where the difference between "an exchange" and "this
 * exchange" is enforced by the precedence rule. Nothing here reads
 * `labels.json`; a shape detector that knew about vendor labels could not help
 * being influenced by them.
 */
export function detectExchangeShapes(tx: ClusterTx): ReadonlyArray<ShapeFinding> {
  const out: ShapeFinding[] = [];
  const spendable = tx.vin.filter(
    (v): v is ClusterInput & { address: string } => !v.coinbase && v.address !== null,
  );
  const inputAddresses = new Set(spendable.map((v) => v.address));

  // Withdrawal shape: exactly one spending address, exactly two outputs, and one
  // of them pays that same address back.
  if (inputAddresses.size === 1 && tx.vout.length === 2) {
    const self = [...inputAddresses][0]!;
    const back = tx.vout.find((o) => o.addresses.includes(self));
    const payout = tx.vout.find((o) => !o.addresses.includes(self));
    if (back !== undefined && payout !== undefined) {
      out.push({
        shape: "exchange-withdrawal-shape",
        txid: tx.txid,
        changeToSelfIndex: back.index,
        what: `One spending address, one payout at output ${payout.index}, and change back to the same address at output ${back.index}. Section 1.4's exchange-withdrawal shape: behavioural evidence of a hot wallet, and no evidence at all of WHICH exchange.`,
      });
    }
  }

  // Sweep shape: many distinct spending addresses into a single output. The
  // threshold of three is section 1.4's "many-to-one" read conservatively - two
  // inputs is an ordinary payment funded from two UTXOs.
  if (inputAddresses.size >= 3 && tx.vout.length === 1) {
    out.push({
      shape: "many-to-one-sweep",
      txid: tx.txid,
      changeToSelfIndex: null,
      what: `${inputAddresses.size} distinct spending addresses consolidated into one output. Section 1.4's many-to-one deposit sweep: behavioural evidence of a hot wallet, and no evidence of which exchange.`,
    });
  }

  return out;
}
