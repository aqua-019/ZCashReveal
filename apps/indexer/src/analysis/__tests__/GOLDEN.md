# Golden cases — what each one is, where it came from, and what it is evidence of

HANDOFF-08 deliverable 1. TRACKING-MATH §6 names **three** golden cases from the
chain — the 2 January 2026 round trip, the lockbox disbursement, and the
202,076.207 unshield. This file builds **four** from them: Golden 2 is Golden 1
run under the v0.2 rule, which is not a fourth transaction but the fail-side
polarity of the first, and it is numbered rather than buried because a rule that
is never shown missing has never been shown to do anything. The file says which
transactions each case is built from, which assertion it answers, and — for two
of them — what it is **not** evidence of.

Every amount below is transcribed from `packages/content/data/cases.json`, which
the research pass states it verified against Blockchair on 2026-08-22 and marks
`[verified]`. **Three different cases**, and which one matters: Goldens 1, 2 and
4 and the A5/A6 fixtures come from `K-2026-01-02`, Golden 3 from
`K-zip271-lockbox`, and Golden 4's verdict text from `K-202076-unshield`. This
paragraph named `K-2026-01-02` alone, which put the lockbox's amounts under a
case that does not contain them. The txids are the real ones. Nothing here was
captured from a node: **no session in this project has ever reached one** —
`zips.z.cash`, the VPS and the preview host are all refused by the container's
egress proxy — so the provenance of every figure is the corpus, and the corpus
says where it got them.

## Why these cases and not a generated corpus

A golden case is only worth its cost if it would have caught something. §6's
three were chosen because each breaks a rule that looked fine in isolation, and
the fourth here is the second polarity of the first:

- Golden 1 breaks the **absolute** fee tolerance, by a factor of 254.
- Golden 2 is Golden 1 under the old rule, so the pair is a two-polarity proof
  that the new rule is doing work rather than agreeing with the old one.
- Golden 3 breaks **every** tolerance, including the new one, and still has to
  produce something rather than nothing.
- Golden 4 has no candidate at all, which is the case an estimator is most
  likely to get backwards.

---

## Golden 1 — the 2 January 2026 round trip (A1)

| | |
|---|---|
| **Shield** | `a79347138b88b5a0405c643964c8ef308240fa5ea1058f6e35e40789f4b621c0` |
| | 50,000.96 ZEC, 2026-01-02 18:01:43Z, height 3,191,017, from `t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK` |
| **Unshield** | `7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c` |
| | 50,000.5541 ZEC, 2026-01-02 18:53:18Z, height 3,191,051, to `t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e` |
| **Residual** | 0.4059 ZEC, computed by the test rather than restated |
| **Relative** | 8.1178 × 10⁻⁶ |
| **Gap** | 52 minutes |
| **Expected** | `matchKind: RELATIVE`, grade `MEDIUM`, audit `filter: "amount_echo"` |

`cases.json` describes the shield as spending "all four of its UTXOs into a
transaction with zero transparent outputs", and the unshield as "a transaction
with zero transparent inputs" creating "a single output 0.4059 ZEC smaller".

**What it is evidence of.** That the relative rule catches a residual the
absolute one cannot, and that a single candidate grades `MEDIUM` rather than
`HIGH` — an inexact match is never `HIGH` however alone it is.

**What it is not evidence of.** That the two transactions are the same money.
`cases.json` says it in its own words: "The alignment is four-fold and the link
is unprovable by design." The `labels.json` record for the destination says the
same thing from the other end: "The 0.4059 ZEC difference is an alignment, not a
link: the pool is designed so that an output cannot be tied to an input."

**Fail side.** A second candidate at the same distance drops the grade to `LOW`;
moving the shield outside the window removes the match entirely.

## Golden 2 — the same pair under the v0.2 rule (A2)

The same two transactions, with the relative tolerance set to zero — which is
exactly the v0.2 rule, exact-or-within-`FEE_TOLERANCE_ZAT`, and nothing else.
No match.

The residual is **253.7 times** `FEE_TOLERANCE_ZAT` (160,000 zat). That ratio is
asserted rather than a bare "greater than", because "greater than" would also be
true at 160,001 zat and the size of the miss is the point: an absolute tolerance
is a statement about **fees**, and this residual is not a fee, it is change left
in the pool.

**Fail side.** Restoring the calibrated epsilon finds it again — without which,
"no match" is satisfied by an estimator that never matches anything.

## Golden 3 — the lockbox partial echo (A3)

From case **`K-zip271-lockbox`**, not `K-2026-01-02` — steps 2 and 3 of the
lockbox's only spent CHUNK. Not its only spend: `cases.json` step 4 is a
second, smaller disbursement of 129.8202 ZEC on 14 April 2026, and the case's
verdict sums both (436.7705 + 129.8202 = 566.5907 ZEC moved). The case's own
wording is "the first and only chunk ever spent", which is the defensible form.

| | |
|---|---|
| **Out** | `eaedfddd…` 7,875 ZEC to the pool |
| **Back** | `1f6099a4…` 7,438.2295 ZEC, 20 minutes later, to the **same** address |
| **Residual** | 436.7705 ZEC |
| **Relative** | 5.5463 × 10⁻² |
| **Expected** | `matchKind: PARTIAL`, grade `LOW`, `partial: true` — **never** `MEDIUM` or `HIGH` |

The address is the ZIP 271 lockbox disbursement multisig,
`t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo`, whose `labels.json` record notes it
"Received 93,496.64 ZEC lifetime, more than the 78,750 disbursement, because a
7,438.2295 return re-entered the same address."

**Why `PARTIAL` is its own kind rather than a widened tolerance.** 5.5 × 10⁻² is
**554 times** epsilon and 55 times the `10ε` LOW band. An epsilon that admitted
this case would admit almost any pair of amounts on the chain — so the tolerance
stays where it was calibrated and the case gets a named rule with a fixed grade.
Stretching a tolerance to fit one case is how a calibrated number quietly becomes
a fitted one.

**The shared address is the whole evidential content.** Without it, "a smaller
amount left the pool after a larger one entered it" is true of most pairs of
events on the chain. The test asserts the fail side: change the address and there
is no partial echo at all.

**Fail sides.** A different address, a larger withdrawal, and the default (the
rule is off unless the caller asks for it).

## Golden 4 — the 202,076.207 unshielding (A4)

Step 4 of `K-2026-01-02`; case `K-202076-unshield` is the Record built on the
same transaction and is where the "never moved" verdict comes from.

| | |
|---|---|
| **Unshield** | `e179e5b0f9fec1c6a9718b1dbe8cedddf1d8e494db276fe72c047a153365a163` |
| | 202,076.207 ZEC, 2026-01-02 15:45:14Z, height 3,190,907, to `t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V` |
| **In-window shields** | none at or above 100,000 ZEC |
| **Expected** | `claimLevel: "aggregate_only"`, `N_eff > 1000` |

`cases.json`: "The single largest unshielding of the period, from a transaction
with zero transparent inputs. It did not go to an exchange: the address has never
spent and still holds exactly this balance."

**This is the case an estimator is most likely to get backwards, which is why it
is a golden case.** With no candidates, the tempting output is an empty candidate
list and `N_eff = 0` — which classifies `requires_disclosure`, the **strongest**
claim level, for the transaction the project knows least about. `posterior.ts`
takes `unresolvedCount` as a **required** input for exactly this reason: with no
echo, the honest posterior is uniform over the whole anchor-bounded candidate
set, and the claim level follows from its size.

**Fail side.** Add one in-window shield that does echo, and the claim collapses
to `requires_disclosure` with `N_eff < 2` — so `aggregate_only` is not what this
module says about everything.

---

## The three that are not in §6

### A5 — subset-sum

Shields of 30,000 and 20,000 ZEC against an unshield of 49,999.98 ZEC. Residual
0.02 ZEC, which is 4 × 10⁻⁷ relative and **twelve times** the absolute
allowance — which is why `subsetSumTolerance` takes the looser of the absolute
and relative rules rather than one of them.

Graded `LOW` on loose timing and `MEDIUM` when the gap is under an hour **and**
the split is two, per §3.4 — and, in this implementation, **and** the split is
the only subset that satisfies the tolerance. That third conjunct is STRICTER
than §3.4, which names two: a split found among four equally good subsets is not
a tighter claim than one found alone, so it does not earn the promotion. All
three are tested; a three-way split inside the hour stays `LOW`, and so does a
two-way split inside the hour with a rival subset.

The shape is real. `cases.json` steps 6, 7 and 8 are the transparent-side version
of it: two unshieldings of 50,000.5541 and 24,000.9781 **sum to 74,001.5322**,
against a consolidation of **74,001.9317** in
`ba0783815529f9825d3d3a8c2d7f3dafe63468e4b5b60dcec61f7d54d1dee84c` — a residual
of 0.3995, which §3.4 identifies as the second tranche's own residual. This file
gave 74,001.9317 as the *sum*, which is the consolidation's amount and not what
the two addends make; the whole point of the case is that the two numbers differ.

### A6 — the three December 2025 withdrawals

`f45ded5d…` (29,999.99), `b39aa107…` (1,999.99) and `a05e75fe…` (17,999.99),
all from `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` to
`t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK`, each with change back to the spending
address. Step 1 gives the full mechanics: "Input 120,552.69 ZEC in, 29,999.99
out, 90,552.70 change back to itself: textbook exchange-withdrawal mechanics."

The test **reads `cases.json` and asserts the fixture matches it**, so a change
to the Record is a failure here rather than a silent divergence between what the
site says and what the analysis measures.

**The ceiling on this case is the interesting part.** §1.4: the shape justifies
"exchange hot wallet" (high) but *not* "which exchange". `labels.json` carries
that distinction explicitly — the address is `analyst` tier, not `exchange`,
because "That it is Binance specifically rests entirely on Lookonchain, with no
exchange confirmation and no Arkham or Blockchair tag."

Note also that **29,999.99 ZEC is not a round amount** under
`isRoundAmount`, and that is the right answer: it *looks* round and is a
fee-adjusted payment, and treating it as round would make the change heuristic
identify the wrong output as change on §1.4's own example.

### A7 — labels and precedence

`t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` → `consensus`, rank 1. An address the
corpus does not carry → **no label at all**, not a manufactured
`behaviour`-tier one. `t1PKBiv7…` → `analyst`, rank 4, however confident the
analyst was.

## What could not be built, and why that is in this file

`labels.ts` implements two of §1.5's four consensus families. The other two are
**not in this repository**:

- **ZIP 1014 / 1015 / 1016 funding-stream recipients.** The repository has every
  percentage and every activation height, and not one address.
- **Founders' Reward addresses.** Absent; `docs/2.0/research/04-…` states in as
  many words that no founders' address list was extracted.

Writing either from recall would have produced strings indistinguishable from
the sourced ones, carrying the strongest label this project issues. They are
named in `UNSOURCED_CONSENSUS_LABELS` instead, which is the same artefact
`fingerprint.ts` uses for the wallets whose expiry deltas nobody can source.

`docs/2.0/API.md` records that HANDOFF-04's gate already caught a hardcoded
coinbase split "the corpus contradicted by a factor of 3.3" — the same failure
one step less dangerous, because a wrong percentage is visibly a number and a
wrong address is not.

## Standing caveat on all of it

No golden case here has been checked against a node. The corpus states it queried
Blockchair on 2026-08-22 and marks each row verified, and that is the whole
provenance chain. HANDOFF-10's captured mainnet block is the first point at which
any of these figures meets chain data inside this repository.
