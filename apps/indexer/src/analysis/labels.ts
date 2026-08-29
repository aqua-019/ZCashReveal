/**
 * Module 8C - address labels and their precedence (TRACKING-MATH section 1.5).
 *
 * Section 1.5 calls consensus labels "the only labels with certainty", and the
 * precedence CLAUDE.md requires to be displayed with every label is
 * `consensus > owner filing > exchange confirmation > analyst > behaviour`.
 * This module answers "what is known about this address, and who says so",
 * strongest first, and it refuses to answer anything else.
 *
 * WHAT SECTION 1.5 ASKS FOR AND WHAT THIS REPOSITORY CAN SOURCE. Section 1.5
 * names four families of consensus label. Two of them cannot be built here, and
 * saying so is the deliverable rather than a gap in it:
 *
 *   ZIP 271 lockbox multisig  - SOURCED. Mainnet and testnet, both in
 *                               `labels.json` at `labeller: "consensus"`,
 *                               `confidence: "high"`, with their ZIP citation.
 *   TEX addresses (ZIP 320)   - SOURCED as a STRUCTURAL rule. A TEX address is
 *                               recognisable from its own encoding, so no list
 *                               is needed. See {@link texLabel}.
 *   ZIP 1014/1015/1016
 *   funding-stream recipients - NOT IN THIS REPOSITORY. See
 *                               {@link UNSOURCED_CONSENSUS_LABELS}.
 *   Founders' Reward          - NOT IN THIS REPOSITORY. Same.
 *
 * The two that are missing are missing in a specific way: this repository has
 * the PERCENTAGES and the ACTIVATION HEIGHTS for every funding stream, and not
 * one address. Writing addresses from recall would have produced strings that
 * look exactly like the sourced ones and carry the strongest label this project
 * issues. `docs/2.0/API.md` records that HANDOFF-04's gate already caught a
 * hardcoded coinbase split "the corpus contradicted by a factor of 3.3", which
 * is the same failure one step less dangerous, because a wrong percentage is
 * visibly a number and a wrong address is indistinguishable from a right one.
 *
 * NOTHING HERE INFERS A LABEL FROM CHAIN DATA. The behavioural shapes
 * `clustering.ts` detects justify "an exchange hot wallet" and never "which
 * exchange" (section 1.4), so they do not enter this module at all: a label is
 * something a LABELLER said, and the labeller travels with it.
 */

import { getLabels, type AddressLabel } from "@zcashreveal/content";
import { LABELLER_RANK, type Labeller } from "@zcashreveal/types";

/**
 * The consensus label families section 1.5 names that this repository cannot
 * supply, and exactly what each would need.
 *
 * THE SAME ARTEFACT AS `UNSOURCED_WALLET_HYPOTHESES` IN `fingerprint.ts`, and
 * for the same reason. HANDOFF-07 refused to invent expiry deltas for four
 * wallets; HANDOFF-08 withdrew a fifth that had been invented at HANDOFF-00.
 * The standard is now this project's own, so it applies here without needing to
 * be argued again: a consensus label is the strongest claim this site makes
 * about an address, and an invented one is indistinguishable from a sourced one
 * to every later reader.
 *
 * What each would need to become real:
 *
 *   FUNDING_STREAMS - the recipient addresses per height, from ZIP 1014, ZIP
 *     1015 and ZIP 1016, or from a node's consensus parameters (Zebra's
 *     `zebra-consensus` funding-stream tables, or zcashd's chainparams). This
 *     repository has neither, and a session cannot fetch a ZIP: `zips.z.cash`
 *     is refused by the egress proxy with `CONNECT tunnel failed, response 403`
 *     (recorded at `activation-heights.ts` and LEDGER-07 Q5).
 *     Note that ECC's and ZF's streams ENDED at NU6, block 2,726,400 - Swihart:
 *     "Our wallet address will no longer be codified in the protocol" - so a
 *     complete implementation is historical for two of the three recipients and
 *     current only for ZCG.
 *
 *   FOUNDERS_REWARD - the historic address list from the original chainparams.
 *     Absent. `docs/2.0/research/04-exchange-inflows-insider-selling.md` states
 *     in as many words that no founders' address list was extracted.
 *     What this repository DOES have is Kappos et al.'s amount fingerprint -
 *     "Any z-to-t transaction carrying 250.0001 ZEC in value is done by the founders",
 *     1,953 such withdrawals, 99.5 per cent also matching a 6-10 block
 *     proximity pattern. That is an AMOUNT heuristic and not an address list,
 *     so it belongs in `echo.ts`'s territory rather than here, and it would be a
 *     `behaviour`-tier signal rather than a consensus one.
 */
export const UNSOURCED_CONSENSUS_LABELS = ["FUNDING_STREAMS", "FOUNDERS_REWARD"] as const;

/** A label plus the precedence rank the UI must display beside it. */
export interface RankedLabel {
  readonly address: string;
  readonly label: string;
  readonly labeller: Labeller;
  readonly rank: number;
  /** How the labeller arrived at it. Never omitted; section 1.5's requirement. */
  readonly method: string;
  readonly confidence: "high" | "med" | "low";
  readonly sources: ReadonlyArray<string>;
  readonly network: "mainnet" | "testnet";
}

/**
 * ZIP 320's transparent-source-only receiver, recognised from its own encoding.
 *
 * A STRUCTURAL LABEL, WHICH IS WHY IT NEEDS NO LIST. Every other consensus label
 * is an enumeration - these specific addresses are the lockbox - but a TEX
 * address announces itself: it is bech32m with the human-readable part `tex` on
 * mainnet and `textest` on testnet, over a 20-byte payload. So the rule is the
 * label, and it cannot go stale.
 *
 * ITS PROVENANCE, WHICH IS WEAKER THAN THE RANK IT CARRIES. This is a
 * `consensus` label, the strongest thing this project issues, and the encoding
 * rule behind it - bech32m, HRP `tex`/`textest`, 20-byte payload - is not
 * quoted anywhere in this repository's corpus. The corpus knows TEX addresses
 * only as a POLICY event (`research/03-history-exploits-governance.md` line 278:
 * proposed in January 2024 to avoid a Binance delisting). The encoding itself is
 * asserted in-tree by `apps/gateway/src/address.ts` ALONE. Section 1.5 NAMES TEX
 * addresses and ZIP 320 - "transparent-source-only receivers, an exchange-deposit
 * tell" - and states no bech32m, no human-readable part and no payload length, so
 * it is a pointer to the rule and not a source for it; this docblock cited it as
 * one for a commit. Neither site cites a line of ZIP 320, which no session can
 * fetch -
 * `zips.z.cash` is refused by the egress proxy with `CONNECT tunnel failed,
 * response 403`. So `sources` carries the ZIP publisher the corpus does register
 * and `confidence` is `med` rather than `high`, and the difference between this
 * and the lockbox row - which quotes ZIP 271 through a corpus source at
 * `confidence: "high"` - is the difference between a fact this repository holds
 * and one it has only ever restated. An EMPTY `sources` array here would have
 * been worse than a weak one: it is the shape CLAUDE.md forbids outright, and on
 * the highest rank in the ladder.
 *
 * THIS CHECKS THE PREFIX AND NOT THE CHECKSUM, DELIBERATELY. The full bech32m
 * decode - charset, checksum, mixed-case rejection, 20-byte payload - already
 * exists at `apps/gateway/src/address.ts`, which is the RPC/HTTP boundary where
 * CLAUDE.md says a `Hex` or an address is validated. Reimplementing it here
 * would put a second bech32m implementation in the tree, and this project has
 * spent two handoffs removing second implementations of ZIP 317. So the contract
 * is: the boundary validates, this module classifies what the boundary admitted.
 * A caller passing an unvalidated string gets a structural guess, and the return
 * value says `confidence: "med"` rather than `high` for exactly that reason.
 */
export function texLabel(address: string): RankedLabel | null {
  const lower = address.toLowerCase();
  if (lower !== address) return null; // bech32m forbids mixed case outright.
  const network = lower.startsWith("tex1")
    ? ("mainnet" as const)
    : lower.startsWith("textest1")
      ? ("testnet" as const)
      : null;
  if (network === null) return null;

  return {
    address,
    label: "TEX address (ZIP 320): accepts transparent-source funds only",
    labeller: "consensus",
    rank: LABELLER_RANK.consensus,
    method:
      "ZIP 320 defines the TEX address encoding: bech32m with human-readable part 'tex' (mainnet) or 'textest' (testnet) over a 20-byte payload. Recognised from the encoding itself, so no address list is involved. The checksum is validated at the RPC/HTTP boundary, not here. The ZIP text has not been read inside this repository - zips.z.cash is refused by the egress proxy - so this rule is restated from apps/gateway/src/address.ts. TRACKING-MATH section 1.5 names TEX addresses and ZIP 320 but does not state the encoding, so it is a pointer and not a source for it. That is why the confidence is 'med' and not 'high'.",
    confidence: "med",
    sources: ["S-zcash-improvement-proposals-zips-z-cash"],
    network,
  };
}

/**
 * Every label this project holds for an address, strongest labeller first.
 *
 * `labels` is injectable so the module stays testable without the content
 * package's whole seed corpus, and defaults to it so section 3's "loads
 * `labels.json` for non-consensus tiers" is satisfied literally. The import is a
 * STATIC JSON import inside `@zcashreveal/content`, not a file read, so this
 * function is pure and A10's purity grep holds.
 *
 * AN UNLABELLED ADDRESS RETURNS AN EMPTY ARRAY, and that is the answer rather
 * than a failure. Section 1.5 admits five labellers and "behaviour only" is the
 * weakest of them, not a default: a behavioural label still has to have been
 * MADE by someone looking at behaviour. Returning a manufactured
 * `behaviour`-tier row for every unknown address would put a label on every
 * address on the chain.
 */
export function labelsFor(
  address: string,
  labels: ReadonlyArray<AddressLabel> = getLabels(),
): ReadonlyArray<RankedLabel> {
  const out: RankedLabel[] = labels
    .filter((l) => l.address === address)
    .map((l) => ({
      address: l.address,
      label: l.label,
      labeller: l.labeller,
      rank: LABELLER_RANK[l.labeller],
      method: l.method,
      confidence: l.confidence,
      sources: l.sources,
      network: l.network,
    }));

  const tex = texLabel(address);
  if (tex !== null) out.push(tex);

  return sortByPrecedence(out);
}

/**
 * Sort labels by section 1.5's precedence, strongest first.
 *
 * TIES BREAK ON CONFIDENCE, THEN ON THE LABEL TEXT, so the order is total and
 * deterministic. A sort that left ties in input order would make the rendered
 * order depend on the order of a JSON file, which is the kind of dependency that
 * survives a review and then changes silently.
 */
export function sortByPrecedence(
  labels: ReadonlyArray<RankedLabel>,
): ReadonlyArray<RankedLabel> {
  const confidenceRank = { high: 0, med: 1, low: 2 } as const;
  return [...labels].sort(
    (a, b) =>
      a.rank - b.rank ||
      confidenceRank[a.confidence] - confidenceRank[b.confidence] ||
      a.label.localeCompare(b.label),
  );
}

/**
 * The strongest label for an address, or `null`.
 *
 * `null` IS "NOBODY HAS LABELLED THIS", which is true of virtually every address
 * on the chain and is the answer a caller must render as such. The gateway's own
 * label view already states the rule this mirrors: "Never guesses: an unlabelled
 * address is unlabelled."
 */
export function strongestLabel(
  address: string,
  labels?: ReadonlyArray<AddressLabel>,
): RankedLabel | null {
  return labelsFor(address, labels)[0] ?? null;
}

/**
 * Whether a label is one section 1.5 calls certain.
 *
 * Only `consensus` qualifies. An owner's own filing is the next strongest and it
 * is still a claim by a party with an interest; the difference between "the
 * consensus rules name this address" and "the owner says this is theirs" is the
 * difference this whole precedence ladder exists to preserve.
 */
export function isConsensusLabel(l: RankedLabel): boolean {
  return l.labeller === "consensus";
}
