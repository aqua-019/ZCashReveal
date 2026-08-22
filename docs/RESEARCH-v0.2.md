# RESEARCH

The mathematical foundations behind ZCashReveal's leak-detection model. This document is the canonical reference for the state machine, the candidate-set construction, the entropy-based anonymity-set sizing, and the claim-level mapping. Code modules (especially `apps/indexer/src/state/` and the Module 5 link engine that replaces `link-engine.ts`) cite this document directly; if anything here changes, downstream code changes with it.

---

## Framing: report uncertainty, not identity

Public chain data does not deanonymize Zcash shielded transactions. It bounds the set of possibilities. The job of this system is to measure, with calibrated honesty, *how large that bound is* for any given shielded action — and to translate that bound into a claim level that a human reader can interpret without overstating it.

The whole engine is a function from public observables to anonymity-set sizes and confidence ranges. There is no claim of who-sent-what-to-whom. There are claims about the *information surface* exposed by transactions: how many candidate notes could have produced a given nullifier, how recently an anchor was committed, whether a fee or padding pattern fingerprints a wallet, and what the public boundary flows are between transparent and shielded pools.

Every output of the pipeline must be auditable against this framing. If a finding implies identity, it is wrong by construction.

---

## The per-pool state machine

For each shielded pool `p ∈ {sapling, orchard}` and each block height `h`, we maintain a tuple:

```
S^p_h = (T^p_h, Roots^p_h, NFSet^p_h, Bal^p_h)
```

This tuple is the complete public state of pool `p` as of height `h`. Each component is independent in operation but cross-referenced when building candidate sets.

### T^p_h — the append-only commitment tree

`T^p_h` is the sequence of all note commitments added to pool `p` up to and including height `h`. Commitments are appended in Note Commitment Tree (NCT) order. Each commitment occupies a position `pos(cm) ∈ {0, 1, 2, ...}` that never changes and is never reused. Positions are monotonic and contiguous: if a commitment exists at position `k > 0`, a commitment also exists at every position `0, 1, ..., k-1`.

The tree is append-only. There is no in-place modification. Reorgs (handled in Module 2) are modeled as truncation back to a known-good height followed by re-application of the new branch's commitments.

In code: `CommitmentIndex<P>` with `append`, `atPosition`, `byCmId`, `size`.

### Roots^p_h — the set of valid anchors

`Roots^p_h` is the set of NCT roots that have been published in `p` by height `h`. Every shielded spend in `p` references one such root as its anchor. An anchor commits the prover to "I am spending a note whose commitment lies somewhere within the tree state captured by this root."

Each anchor implicitly upper-bounds the set of candidate commitments. We denote the maximum NCT position visible under anchor `A` as `maxPos(A)`. Any spend bearing anchor `A` could only refer to a commitment whose position is `≤ maxPos(A)`. This is the single most important constraint for candidate-set construction.

Anchors are idempotent: re-recording the same `(root, maxPosition, heightCreated)` triple is a no-op. Recording a known root with different supporting data is an error (it would corrupt downstream anonymity-set sizing).

In code: `AnchorIndex<P>` with `record`, `maxPositionFor`, `hasRoot`.

### NFSet^p_h — the spent nullifier set

`NFSet^p_h` is the set of all nullifiers published in `p` by height `h`. A published nullifier means "some commitment in `T^p` has been spent." Critically, the public chain does **not** reveal *which* commitment a nullifier corresponds to — that mapping is computed from the spending wallet's private spend authority and is never on-chain.

This asymmetry is the central source of Zcash's privacy. NFSet tells us the *cardinality* of spent notes, not their identity within `T^p`.

NFSet supports `O(1)` membership: "has this nullifier been seen?" and "in what transaction and at what height was it spent?" It does **not** support reverse lookup ("what commitment did this nullifier come from?") — that lookup does not exist as a public operation.

In code: `NullifierIndex<P>` with `record`, `isSpent`, `spendingTx`.

### Bal^p_h — the pool balance via turnstile

`Bal^p_h` is the running sum of all public value changes into pool `p` up to height `h`, computed exclusively from the turnstile boundary flows. Shielded-to-shielded internal flows contribute zero by construction (their value balances are zero). Only transactions that cross the `t ↔ z` boundary, or migrate between Sapling and Orchard, register a nonzero delta.

We define the per-tx delta `deltaV^p(tx)` such that:

- `deltaV^p(tx) > 0` means value is *leaving* pool `p` (an unshielding withdrawal).
- `deltaV^p(tx) < 0` means value is *entering* pool `p` (a shielding deposit).
- `deltaV^p(tx) = 0` means no net public exchange with pool `p`.

The pool balance never goes negative — this is a hard consensus invariant. A negative balance in `Bal^p_h` indicates corrupted state or a bug, and the system throws.

In code: `ValuePool<P>` with `apply`, `balance`, `deltasFor`.

---

## Candidate set construction

Given a nullifier `nf` with anchor `A(nf)`, the **raw candidate set** is:

```
Cand_0(nf) = { cm ∈ T^p : pos(cm) ≤ maxPos(A(nf)) }
```

That is, every commitment in the pool whose position is bounded above by what the anchor committed to. This is the largest possible anonymity set for `nf`. It is purely a function of `T^p` and the anchor, and requires no other information.

For older anchors at deep heights, `Cand_0` can run into the hundreds of thousands of commitments. For recent anchors (a fresh root committed only a few blocks ago), `Cand_0` may shrink to a few hundred or fewer — which is why recent anchors are flagged: they materially narrow the window of who-could-have-spent.

---

## The filter stack

`Cand_0` is the starting point. From there, a stack of filters runs in sequence, each producing a smaller candidate set. Order matters: filters that depend on prior filters must run later.

### Anchor membership

The hard upper bound. Any `cm` with `pos(cm) > maxPos(A(nf))` is excluded. This is already baked into `Cand_0`'s definition but is listed explicitly because it is the *only* universally-correct filter — every other filter introduces an assumption.

### Pool separation

Sapling and Orchard are distinct privacy domains. A Sapling nullifier can only correspond to a Sapling commitment, and vice versa. The two trees do not share commitments and there is no cross-pool spending. Pool separation is enforced at the type level (`PoolState<"sapling">` and `PoolState<"orchard">` are not assignable to each other) so that no filter can accidentally pull a candidate from the wrong pool.

### Time and amount heuristics

When public boundary flows or mempool ordering establish constraints, we can shrink the candidate set further — *but only with explicit assumptions logged*. For example: "if we assume this withdrawal of 1.5 ZEC corresponds to a deposit of 1.5 ZEC plus ZIP-317 fees within the last 7 days, the candidate window narrows to N notes."

The assumption is part of the output. A reader sees both the narrowed set and the heuristic that produced it, and can decide whether to trust the heuristic. The Kappos-style boundary-flow match is one such heuristic; it is informative but not conclusive.

### Nullifier uniqueness (a crucial subtlety)

When some other nullifier `nf' ≠ nf` has been published, we know *some* commitment in `T^p` has been spent — but we do not know *which* commitment. **We do not remove a commitment from `Cand_0(nf)` just because some unrelated nullifier exists in `NFSet`.** Different nullifiers spend different notes, but the mapping is private.

What `NFSet` does give us is a *count*: among the commitments in `Cand_0(nf)`, the number that are still unspent at the moment `nf` is observed is bounded above by `|Cand_0(nf)| - |spent-before(nf, A(nf))|`. This shrinks the *effective size* of the anonymity set without identifying *which* candidates were removed. The uncertainty is preserved; only the cardinality changes.

This is the constraint-and-uncertainty model. It is strictly weaker than identity claims and strictly stronger than "all commitments in the tree are equally likely" — which is the right place for a public-data analyzer to live.

---

## Effective anonymity set

Once the filter stack has produced a filtered candidate set with a posterior probability distribution `P(cm | nf)` over its members, we summarize the set's size with Shannon entropy:

```
H(nf) = -∑_cm P(cm | nf) · log₂ P(cm | nf)
```

and define the **effective anonymity set size**:

```
N_eff = 2^H(nf)
```

`N_eff` is the size of a uniform distribution that would carry the same Shannon entropy as the actual posterior. If all `N` candidates are equally likely, `N_eff = N`. If one candidate dominates the posterior (e.g., heuristic narrowing strongly), `N_eff` collapses toward 1.

`N_eff` is the headline number for every shielded action. It is what a reader actually wants to know: "how identifiable is the sender of this spend, in bits?"

---

## Claim levels

`N_eff` maps to one of four claim levels. The mapping is deliberately coarse so that small estimation errors don't bump a finding across categories:

```
N_eff > 1000          → aggregate_only
N_eff ∈ [100, 1000]   → broad_candidate_set
N_eff ∈ [10, 100]     → small_heuristic_set
N_eff ≤ 10            → requires_disclosure
```

`aggregate_only`: the anonymity set is large enough that the action is essentially private under standard threat models. No useful narrowing is possible from public data alone.

`broad_candidate_set`: a meaningful but still wide window. Common for typical shielded transfers with moderate-age anchors.

`small_heuristic_set`: heuristic filters have narrowed the set considerably. Findings at this level should always cite which heuristics were applied so the reader can evaluate the assumptions.

`requires_disclosure`: the public surface alone narrows to a small handful of candidates. This does not deanonymize — it means that even small additional disclosures (a wallet revealing one note, a known exchange withdrawal, an off-chain timing signal) could collapse the set to one. The label is intentionally cautionary: it flags actions where the wallet is one external signal away from being identified, *not* actions where the wallet is already identified.

The thresholds are not magic numbers. They are the rough breakpoints at which the threat model qualitatively changes — from "private under any practical adversary" to "private only under a passive observer" to "narrow enough that targeted analysis pays off" to "single external leak is fatal."

---

## Turnstile boundary flows

Public value movement between transparent and shielded is observable, and it is the only fully-public flow this system reasons about. For each transaction `tx` and pool `p`, the pool-side flow is:

```
In_p(tx)  = max(-deltaV^p(tx), 0)
Out_p(tx) = max( deltaV^p(tx), 0)
```

A shielding deposit increases `In_p`, an unshielding withdrawal increases `Out_p`. A purely intra-pool shielded transfer has both at zero. A Sapling→Orchard migration has `Out_sapling > 0` and `In_orchard > 0` simultaneously, and the system recognizes this as a distinct leak class (`MIGRATION_S2O`) rather than mistaking it for two unrelated boundary crossings.

The turnstile is the only public window into shielded value movement. All amount-based heuristics that touch shielded transactions ultimately ground out in turnstile deltas — the amounts of internal shielded transfers are never available.

---

## Orchard action ambiguity

Orchard transactions report an *action count*. An action is simultaneously a spend and an output structurally, but the action count is not the real spend count or the real output count. Wallets pad with **dummy actions** to obscure the actual number of real spends and outputs in a transaction. A typical Orchard transaction with two real spends and two real outputs may report two, three, or four actions depending on padding strategy.

The system therefore must never infer arity from the action count. The action count is useful for fingerprinting (specific wallets prefer specific action counts and padding patterns — see `wallet-fingerprint.ts`) but is not a count of real spends. Sapling has the equivalent issue: dummy spends and outputs are possible, though less common in practice.

The state machine accordingly does not try to map actions to spends one-to-one. Each published nullifier becomes a spend in `NFSet`. Each published commitment becomes an entry in `T^p`. Dummy actions contribute nothing observable to either set — they are zero-knowledge by design.

---

## Pool separation, formally

The system enforces pool separation at the type level. `CommitmentIndex<"sapling">` is not assignable to `CommitmentIndex<"orchard">`. A `Commitment<"sapling">` cannot be appended to an Orchard index. This is checked at compile time, not at runtime, so the cost is zero and the guarantee is total.

The reason this matters: a single bug that crossed Sapling and Orchard commitments would silently corrupt every downstream anonymity-set calculation. By making the violation impossible to express, we eliminate the entire bug class rather than guarding against it with runtime checks.

---

## Reorgs (Module 2 concern, noted here)

The state machine is purely in-memory in Module 1. Module 2 adds a Postgres persistence layer and a reorg-replay mechanism. When a reorg invalidates blocks above height `h_split`, the state is rewound by replaying all transactions in the new branch starting from `h_split + 1`. The append-only structure of `T^p` makes this tractable: rewind = truncate-to-position, replay = append-from-position. Anchors and nullifiers behave the same way (set removal then re-record). Pool balance is the trickiest: it must be reconstructed by re-applying every boundary delta in order. `ValuePool.deltasFor(txid)` exists specifically to support this replay.

The Module 1 state foundation is shaped to make Module 2's persistence layer thin and to make reorg replay correct by construction. None of that mechanism lives in Module 1 itself — only the data structures it will operate on.

---

## Module map

This document maps to code as follows:

- `T^p_h` → `apps/indexer/src/state/commitment-index.ts`
- `Roots^p_h` → `apps/indexer/src/state/anchor-index.ts`
- `NFSet^p_h` → `apps/indexer/src/state/nullifier-index.ts`
- `Bal^p_h` → `apps/indexer/src/state/value-pool.ts`
- `S^p_h` (the composition) → `apps/indexer/src/state/pool-state.ts`
- Cand_0, filter stack, entropy/N_eff, claim levels → Module 5 (replaces `apps/indexer/src/decoder/link-engine.ts`)
- Persistence and reorg replay → Module 2
- Pool fingerprinting and wallet attribution → `apps/indexer/src/decoder/fingerprint.ts`
- Turnstile leak classification → `apps/indexer/src/decoder/leak-analyzer.ts`

---

## The mantra

**Report uncertainty, not identity.**

Every line of analysis code, every finding, every published number must be defensible under that mantra. If a finding implies identity from public data alone, it is wrong by construction, and the fix is not better data — it is a more honest description of the bound.
