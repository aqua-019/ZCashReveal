# ZEC Tracking — the mathematics of the explorer (v2.0 spec)

**Status:** design spec for `apps/web` (Tracking suite) + `apps/indexer` (new analysis modules). Extends `RESEARCH.md` (v0.2). Written 22 Aug 2026.
**Mantra, unchanged:** report uncertainty, not identity. Every number the explorer shows is either **exact and public**, or a **bound/posterior with its assumptions printed beside it**.

---

## 0. What an address query can honestly return

| Query | What the chain contains | What ZECReveal returns | Exactness |
|---|---|---|---|
| **Transparent address** (`t1…` P2PKH, `t3…` P2SH) | Every UTXO, every spend, every counterparty, every amount, every fee | Balance, full history, counterparties, cluster membership, **boundary events** (this address shielding / being paid from the pool) each with a **pool-side estimate** | Transparent side **exact**; pool side **bounded** |
| **Shielded address** (`zs1…`, `zc…`, or the shielded receivers of a `u1…` unified address) | **Nothing.** The address is never serialised on chain; notes are commitments + ciphertexts; spends are nullifiers | **Mode A (viewing key):** exact balance + history via trial decryption in the browser. **Mode B (no key):** the honest statement that the address is not an on-chain object, plus the pool-level context and a route into tx/transparent queries | Mode A **exact**; Mode B **undefined by construction** |
| **Transaction id** | Version, pools touched, `valueBalance` per pool, nullifiers, anchors, commitments, transparent in/out, fee, expiry, action counts | Leak class, per-spend candidate set `Cand_0`, `N_eff`, claim level, round-trip links, wallet fingerprint, what-this-tx-publishes | Public fields **exact**; inferences **bounded** |
| **Block / height** | Everything above per tx; coinbase; funding-stream outputs | Per-pool deltas, migrations, turnstile ledger | **Exact** |

**Never returned:** a sender or recipient *inside* the shielded pool, a shielded balance without a key, or an owner for any address that is not named by consensus rules or by the owner's own filing.

---

## 1. Transparent side — exact, plus clustering (deterministic)

1.1 **Balance and history.** `bal(a) = Σ_{u ∈ UTXO(a)} v(u)`; history = all txs with an input or output script paying `a`. Counterparties = the other scripts in those txs. Fees = Σin − Σout − `valueBalance` terms (a tx with shielded components has its fee split across pools; we show the ZIP-317 conventional fee and the implied logical-action count `L = fee / 5000`, see §3.5).

1.2 **Common-input-ownership (CIO).** All transparent inputs of one tx are spent by one key-holder ⇒ union-find over input scripts → clusters `C(a)`. Exceptions flagged: coinjoin-like shapes (rare on Zcash), P2SH multisig (the ZIP 271 lockbox is a 2-of-3 held by three organisations — a cluster of *signers*, not one owner).

1.3 **Change detection.** In a 2-output transparent tx where one output pays a never-seen-before address of the same script type and the other is a "round" amount or a reused address, the fresh one is change with probability `p_change` (calibrated from the chain; Bitcoin literature gives 0.8–0.9; we calibrate on Zcash and print the number). Change outputs extend the cluster with weight `p_change` (soft membership), never as fact.

1.4 **Exchange-withdrawal shape.** One large input → one payout + change back to the *same* address (`t1PKBiv7…` on 24 Dec 2025: 120,552.69 → 29,999.99 + 90,552.70) and many-to-one deposit sweeps are **behavioural** exchange signatures. They justify the label "exchange hot wallet" (high) but *not* "which exchange" — that needs a confirmation or a vendor label, and the label's provenance is always printed.

1.5 **Consensus-defined labels (the only labels with certainty).** ZIP 271 lockbox multisig `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo`; the ZIP 1014/1015/1016 funding-stream recipient addresses (ECC, ZF, ZCG — enumerated in consensus code per height); Founders' Reward addresses (historic, enumerated in the original chainparams); TEX addresses (ZIP 320, transparent-source-only receivers — an exchange-deposit tell). Label precedence, always displayed: **consensus > owner's own filing/announcement > exchange confirmation > independent analyst (Lookonchain/EmberCN/Arkham) > behaviour only**.

---

## 2. Boundary events — where the transparent world meets the pool

For each tx `T` and pool `p`, the public delta is `deltaV^p(T)` (positive = leaving the pool, negative = entering). A transparent address `a` has:

- **Shield events** `S(a) = { (T, X, h) : a ∈ inputs(T), deltaV^p(T) = −X }` — `a` put `X` ZEC into pool `p` at height `h`. Exact.
- **Deshield events** `D(a) = { (T, Y, h) : a ∈ outputs(T), deltaV^p(T) = +Y }` — `a` received `Y` ZEC from pool `p` at `h`. Exact.

Everything from here on is an **estimate** attached to these exact events.

---

## 3. Process-of-elimination toolkit (the estimators)

Each estimator is a pure function producing (a) a narrowed candidate set or a likelihood weight and (b) an **audit record** `{filter, params, countIn, countOut}` — the v0.2 `FilterApplication` contract, kept verbatim so the UI's inference chain renders it.

3.1 **Anchor bound (hard).** For a spend with nullifier `nf` and anchor `A`: `Cand_0(nf) = {cm : pos(cm) ≤ maxPos(A)}`. The only universally correct filter (v0.2 `rawCandidateRange`).

3.2 **Spent-count subtraction (hard, cardinality only).** `|unspent ∩ Cand_0| ≤ |Cand_0| − |{nf′ published before T with anchor ≤ A}|`. Shrinks the effective size without naming candidates (RESEARCH.md §nullifier-uniqueness).

3.3 **Time-window prior (soft).** Note received within `W` blocks of `heightCreated(A)`; default `W = 576` (~12 h at 75 s). Posterior weight `w_t(cm) = exp(−ln2 · age(cm)/τ)` with half-life `τ` (default 2 days) when the weighted mode is on; uniform-in-window when off. The prior is printed.

3.4 **Amount echo (Kappos round-trip), three tolerances.**
 - *Exact:* `Y = X`.
 - *Fee-tolerant (absolute):* `|X − Y| ≤ 5,000 zat × max(2, L) × hops`, v0.2 constant `FEE_TOLERANCE_ZAT = 160,000`.
 - *Relative (new, calibrated):* `|X − Y| / X ≤ ε`, default `ε = 10⁻⁴`. **Calibration case:** on 2 Jan 2026 `t1XKfb…` shielded **50,000.960 ZEC** and **50,000.5541 ZEC** was unshielded to a fresh address **52 min later** — `Δ = 0.4059 ZEC = 8.1 × 10⁻⁶` relative. The v0.2 absolute tolerance (0.0016 ZEC) would have **missed** this; the relative rule catches it. Larger residuals are common when a wallet leaves change in the pool, so the UI shows the residual, the relative error and the time gap, and grades the link: `HIGH` = exact, single candidate · `MEDIUM` = relative ≤ ε or absolute within fee tolerance, single candidate · `LOW` = multiple candidates, or relative ≤ 10·ε.
 - *Subset-sum (new):* one shield may exit as `k ≤ 3` deshields (or `k` shields enter as one deshield) within the window: find subsets `{Y_i}` with `|X − ΣY_i| ≤ tol`. Amounts quantised to 10⁴ zat; DP over the window's events (bounded by window size × 3). The 2 Jan case: `50,000.5541 + 24,000.9781 = 74,001.5322` vs the 74,001.9317 consolidation — a *transparent-side* sum, exact to 0.3995 (the second tranche's own residual). Split matches are graded `LOW` unless timing is tight (< 1 h) and the split count is 2.

3.5 **Fee → logical actions (hard).** ZIP 317: `fee = 5,000 zat × max(2, L)`, and the transparent term of `L` is measured in serialised **bytes**, not in counts:

`L = max(⌈inSize/150⌉, ⌈outSize/34⌉) + 2·nJoinSplit + max(nSpendsSapling, nOutputsSapling) + nActionsOrchard + nActionsIronwood`

where `inSize` and `outSize` are the summed serialised sizes of the transparent inputs and of the transparent outputs, and 150 and 34 are the sizes ZIP 317 fixes for a standard P2PKH input and output — 150 being the constant the protocol rounds *against* rather than a measurement of one, since such an input really serialises to **148** bytes (32 + 4 + 1 + 107 + 4), which is exactly why the count form below is exact while the counts stay small and falls behind from 75 inputs. Taken from the canonical implementation rather than from a summary of it: Zebra `zebra-chain/src/transaction/unmined/zip317.rs:160-173`. With the transparent side public, `L` bounds the shielded arity exactly; a non-conventional fee is itself a wallet fingerprint (v0.2 `isZip317ConventionalFee`).

 - *The count form, kept beside it as the approximation it is.* Through HANDOFF-05 this section gave `L_p2pkh = max(t_in, t_out) + 2·nJoinSplit + max(nSpendsSapling, nOutputsSapling) + nActionsOrchard (+ nActionsIronwood)` — the same rule with its transparent term replaced by **counts**. It is exact while every transparent input and output is a standard P2PKH (148 and 34 bytes) **and the counts stay small**, which covers nearly every transaction on the chain and is why the divergence stayed invisible for so long. It is not an exact equivalence even there: ZIP 317 rounds each side up against a standard *size*, and a standard P2PKH input is 148 bytes against a standard of 150, so from 75 such inputs the byte form falls behind — `ceil(75 x 148 / 150) = 74` against the count form's 75. Seventy-five inputs is an ordinary exchange consolidation, so the approximation over-credits itself on a shape the chain really carries. It survives in the code as `zip317LogicalActionsP2pkhApproximation` (`packages/zec-types/src/zip317.ts`), so `/method` can show a reader both forms, and it is never used to decide whether a fee was conventional.
 - *Worked case — the lockbox, which is exactly where the two disagree.* The largest script this site discusses is the ZIP 271 lockbox (§1.5), a 2-of-3 P2SH multisig. One of its inputs serialises at **297 bytes**: 32 (prevout txid) + 4 (index) + 3 (compact-size) + 254 (scriptSig — `OP_0`, two 73-byte signature pushes, and the 105-byte redeem script under `OP_PUSHDATA1`) + 4 (sequence). Two such inputs paying one P2PKH output give the protocol `max(⌈594/150⌉, ⌈34/34⌉) = 4` and a conventional fee of **20,000 zat**; the count form sees two inputs and one output, `max(2, 1) = 2`, and **10,000**. A disbursement that paid 20,000 therefore tests as conventional under the protocol and as *not* conventional under the count form. Saying that a lockbox disbursement did not pay the conventional fee, when by the protocol it did, is a false statement about the one address this project exists to track — which is why the byte form is what this section states.

3.6 **Dummy-padding policy (soft, wallet table).** Orchard/Ironwood action counts are padded (≥ 2; some wallets pad to even counts or fixed sizes). The observed `nActions`, `nSpends`/`nOutputs` for Sapling, `expiryDelta = nExpiryHeight − height`, version group and anchor age are matched against a **fingerprint table**. Output: `likelyWallet` with a likelihood ratio; never an identity.

 - *Which entries in that table have a sourced number, and which are hypotheses.* This section used to name nine wallets as if the table held nine rules. It holds **two expiry deltas**, and the parenthesis that carried them — "(zcashd 20, Zashi/Zodl 40, others vary)" — was doing more work than it looked: "others vary" is this corpus declining to state a delta, and it was read for a whole handoff as licence to keep one that had been hardcoded without a citation. The table is therefore split, and the split is the artefact rather than the list:

| Wallet | Expiry delta | Provenance | Implemented as a signature |
|---|---|---|---|
| zcashd / Zallet | 20 | this section, `high` | yes, via `ZCASHD_RUST` (which gates on a Sapling shape and a ZIP 317 conventional fee, not on the delta) |
| Zashi / Zodl | 40 | this section, `high`; Ironwood support at 3.8.0 from `research/01-contemporary-zcash.md` §2.6, `med` | yes — `ZODL`, and it requires BOTH conjuncts, the delta of 40 **and** an Ironwood bundle |
| Ywallet ≤ 1.15.3 | **none** | the 35–50 band shipped in `fingerprint.ts` from HANDOFF-00 to HANDOFF-07 was **uncited**; the only sourced fact about Ywallet here is the negative one, that 1.15.3 "will not be updated for Ironwood" (§2.6, `med`) | **no — withdrawn in HANDOFF-08** (L2 finding F-07-1, LEDGER-07 fold 1) |
| Vizor · Zkool · Zingo · Cake | **none** | L2 searched for a public default delta for each and found none; the corpus gives a version and a migration-quality phrase, neither of which is a transaction-level tell | no — `UNSOURCED_WALLET_HYPOTHESES` |
| NozyWallet · Keystone | **none** | the SAME case as the row above, not a weaker one: both are in the corpus, at `research/01-contemporary-zcash.md` §2.6's wallet table — NozyWallet 2.4.2 (30 Jul, "CLI only"), Keystone firmware 3.0.2 (27 Jul) — with a version and a platform note and no transaction-level tell | no |
| Ledger | **none** | in the corpus at the SAME place as the row above, and this cell said the opposite for one commit: `research/01-contemporary-zcash.md` §2.6, under **Without Ironwood support** - "PCZT v2 merged 27 Jul but **pending Ledger review**" (`med`) - plus the Nov 2025 v1-support removal at `research/03` and a published Record, `beware.json` B12. A review status and an exploit entry, and no transaction-level tell. It reaches the fingerprint table only through the v2.0 **mockups** (`docs/2.0/mockups/zecreveal-2.0-mockups-v2.html`, the §3.6 estimator row); the plan does not name it - the plan's only "Ledger" is the Turnstile Ledger, an unrelated surface | no |

 A wallet in the bottom four rows is one this project can **name** and cannot **fingerprint**, and the distinction is load-bearing: `likelyWallet` renders beside a txid, so publishing a product name on an invented band is exactly the identity claim §4's closing paragraph refuses. To move a row upward takes one measured number — a delta from the wallet's own source or release notes, or a padding rule observed over a sample of its transactions. HANDOFF-10's captured mainnet block is where the first real observations arrive.

3.7 **Anchor recency (soft).** `depth(A) = tip − heightCreated(A)`: a depth of 0–3 blocks means the wallet synced immediately before spending; deep anchors imply a stale-state wallet. Both are timing signals that combine with 3.3.

3.8 **Mining-pool flows (hard shape, soft attribution).** ZIP 213 forces coinbase through the pool; pools then unshield payouts as many-output z→t transactions on a schedule. Biryukov–Feher's heuristic identifies them by periodicity + fan-out; we label such txs "pool-payout shape" and attribute only when a pool publishes its payout address.

3.9 **Migration lens (ZIP 318, hard amounts / soft sessions).** Each Orchard→Ironwood migration spends one Orchard note into one Ironwood output with the net amount public and quantised to `n × 10^k, n ∈ {1,2,5}`, dust < 0.01 ZEC stranded.

 - *`DENOM_CAP` is 10,000 ZEC **plus the canonical fee**, and the largest crossing is 10,000 ZEC. Both numbers are correct and they measure different quantities.* This section gave a flat "cap 10,000 ZEC" while `research/01-contemporary-zcash.md` §2.7 gave "10,000 ZEC plus canonical fee", and the two were read as a contradiction for two handoffs (LEDGER-07 Q3). They are not. ZIP 318 states `DENOM_CAP` as 10,000 ZEC plus the canonical fee and then says what that bound is over: it caps the **funding note** produced by note preparation, whose value is the denomination *plus* the fee that will be paid out of it. Subtract the fee and 10,000 ZEC is the largest **pool-crossing denomination** — which is the quantity this project measures, because the crossing is the public event. The constant in `packages/zec-types/src/zip318.ts` is named for the crossing it tests (`ZIP318_MAX_CROSSING_ZAT`) rather than for `DENOM_CAP`, which it is not; its docblock carries both quantities. **ZIP 318 is status Draft**, so both numbers rest on a document that may still be edited — the same standing exposure `IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP` records for ZIP 258.
 - A crossing over that bound is a **finding, never a rejection**: the chain is the authority on what happened, and a rule that refuses to record something the chain did destroys the evidence instead of raising it. A wallet's balance `B` decomposes canonically, so a migration **session** (a burst of canonical denominations within a scheduling window) bounds the *number of notes* (`≥ ⌈B/10,000⌉`) and the *set of wallets* (`≤ Σ counts`, the number of crossings in the window). Reported as distributions and counts per window — **never** as "wallet W migrated B". *This sentence read `≤ number of denomination runs` until 31 Aug 2026; the run count is unsound as a bound and the next bullet is the falsification.*
 - *Why the bound above is `≤ Σ counts` and not the denomination-run count.* (HANDOFF-09 gate round 1 shipped `Σ counts` and annotated this section; **L2 ruled on 30 Aug 2026 that the sentence be amended at source rather than only overridden in code**, on the LEDGER-10 Q5 precedent that a rule corrected only at the call site is one the next reader of the document re-implements wrongly. LEDGER-09 Q1, fold 1.) `Σ counts` holds by construction — a wallet that migrated in the window contributed at least one crossing, so the crossings cannot be fewer than the wallets. **The run count does not hold, and falsifying it needs two wallets and no coordination:** wallet A crosses one 100 ZEC note at height `h` and wallet B crosses one 100 ZEC note at `h+1`; same denomination key, adjacent in any height order, so **one run** — and the record would have claimed "at most 1 wallet" about a window that held 2. It also moves the wrong way with evidence: 847 identical adjacent crossings are still one run, so the more the window holds the *tighter* and the more identity-shaped the claim becomes, which is the exact direction this section's own closing rule ("never as 'wallet W migrated B'") exists to refuse. **And it is order-dependent, which is the second and independent reason it can never be the published bound:** `Crossing` carries no position within a block, so the run count is computed over a `(height, txid, amount)` ordering that is not chain order within one block — two orderings of the same window can give two different run counts, and a published bound may not depend on how its input was sorted. So `migration-lens.ts` publishes `maxWallets = Σ counts` and carries the run count beside it as `denominationRuns` — a **shape observation about the window, not a bound in either direction**, which no consumer may render as a wallet count.

3.10 **Sprout→Sapling migration (ZIP 308).** Same logic with `mantissa × 10^exponent` amounts, 5 txs per 500-block window, usable for the 2019–2026 Sprout residual analysis.

3.11 **Turnstile conservation (hard, global).** For every pool and window, `Σ estimated exits ≤ Bal^p` and `Bal^p ≥ 0`; post-NU6.3 `deltaV^orchard ≥ 0`. Any estimator output that violates conservation is rejected and logged — the conservation law is the sanity check for every heuristic above.

---

## 4. Combining estimators — the posterior, the entropy, the claim

For a deshield event `(T, Y, h)` with candidate origins `{S_j = (T_j, X_j, h_j)}` inside the window:

`w_j ∝ L_amount(Y | X_j) · L_time(h − h_j) · L_fp(T, T_j) · L_struct(T_j)`

where `L_amount` is 1 for exact, `exp(−(|X_j − Y|/X_j)/ε)` for relative, `L_time` is the half-life kernel, `L_fp` is 1.0 when wallet fingerprints agree / 0.5 when they disagree (tunable), and `L_struct` down-weights candidates already consumed by a `HIGH` link (one-to-one assignment, greedy by weight). Normalise `p_j = w_j / Σ w`.

`H = −Σ_j p_j log₂ p_j`, `N_eff = 2^H`, claim level by the v0.2 thresholds (`>1000 aggregate_only · 100–1000 broad · 10–100 small_heuristic · ≤10 requires_disclosure`). The UI prints: the candidate count before/after each filter, the top-3 candidates with `p_j`, `N_eff`, the claim chip, and the assumption sentences (`W`, `τ`, `ε`, fingerprint table version).

**Flow estimate over hops ("taint").** From a transparent address, follow value through `k ≤ 3` boundary crossings multiplying `p_j` along paths; display edges with opacity ∝ weight and a "mass unresolved in pool" residual bar. Cut when `p < 0.02`. The residual is shown as a first-class number because it is the honest answer most of the time.

**What this is not.** None of this identifies a person. It produces bounded, reproducible estimates from public data, with every assumption visible and every claim capped by the claim level.

---

## 5. Mode A — the viewing-key ceremony (exact, client-side)

- Accept a **UFVK / Sapling FVK / IVK** (and, for Sprout, a viewing key). Parse in the browser (WASM build of `zcash_keys` + `zcash_note_encryption`); **the key never leaves the browser** — the page fetches compact blocks / outputs from the gateway and decrypts locally.
- **IVK** ⇒ all received notes (value, memo, txid, height). **FVK** adds `nk` ⇒ nullifiers of received notes ⇒ spent/unspent ⇒ **exact balance**, and **OVK** ⇒ decryption of `out_ciphertext` ⇒ **recipients and values of the key-holder's own outgoing transfers**.
- UI is a ceremony (DGIGA D3642): the fog parts pane by pane while the page states what the key does and does not reveal; results are labelled **exact · decrypted locally** and are never stored.
- This is the only way a shielded balance is ever shown. Mode B never shows one.

---

## 6. Calibration and tests

- Golden cases from the chain: the **2 Jan 2026 round-trip** (`a7934713… → 7ae85864…`, Δ 0.4059, 52 min), the **lockbox disbursement** (`525f4402…`, 10 × 7,875; `eaedfddd…` 7,875 → shielded; `1f6099a4…` 7,438.2295 back 20 min later, Δ 436.7705 — a *partial* echo that must grade `LOW`), the **202,076.207 unshield** (`e179e5b0…`, origin `aggregate_only`).
- Unit tests per estimator; property tests for conservation (§3.11); regression tests that the v0.2 audit-record shape is unchanged.
- Calibrate `p_change`, `ε`, `τ` on 2025–26 blocks; print the calibration date in the UI footer.
