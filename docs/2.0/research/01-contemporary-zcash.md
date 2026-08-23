# ZECReveal Research Dossier 01 — The Contemporary Zcash Scene

**Compiled:** Saturday 22 August 2026
**Scope:** Protocol, security, market and governance developments, late 2025 → 22 Aug 2026
**Standard of proof:** Every claim carries a source URL and a confidence rating. Where sources conflict, both are shown. Items that could not be confirmed are listed explicitly in §8.

> **Reading note on confidence.**
> `high` = stated in a primary source (ZIP text, SEC filing, node release notes, chain data, first-party org post) or corroborated by ≥2 independent secondary sources.
> `med` = single reputable secondary source, or primary source read through an extraction layer.
> `low` = single low-tier source, contested, or inference.

---

## Key dated facts table

| Date | Event | Source | Confidence |
|---|---|---|---|
| 2016-10-28 | Zcash mainnet launch | [coindesk.com](https://www.coindesk.com/price/zcash) | high |
| 2018-03-01 | Ariel Gabizon discovers BCTV14 counterfeiting flaw (later CVE-2019-7167) | [electriccoin.co](https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/) | high |
| 2018-10-28 | Sapling activates (block 419,200), silently fixing the BCTV14 flaw | [electriccoin.co](https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/) | high |
| 2019-02-05 | Public disclosure of the 2018 counterfeiting vulnerability, ~11 months after discovery | [electriccoin.co](https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/) | high |
| 2019-05 (early) | Turnstile enforcement (ZIP 209) ships in zcashd v2.0.5 on mainnet | [electriccoin.co](https://electriccoin.co/blog/turnstile-enforcement-against-counterfeiting/) | high |
| 2022-05-31 | NU5 activates; Orchard pool goes live — start of the 4-year exposure window | [theblock.co](https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million) | high |
| 2024-11-23 | Second Zcash halving at block 2,726,400; reward 3.125 → 1.5625 ZEC | [coindataflow.com](https://coindataflow.com/en/zcash-halving-countdown) | med |
| 2025-08-26 | 52-week low: **$39.75** | CoinGecko API | high |
| 2025-11-07 18:00 UTC | **Cycle high $723.43** (hourly series) | CoinGecko API | high |
| 2025-11-26 | Grayscale files Form S-3 to convert Zcash Trust (CIK 0001720265) | [SEC EDGAR](https://data.sec.gov/submissions/CIK0001720265.json) | high |
| ~2025-11 | NU6.1 activates at mainnet height **3,146,400** (ZIP 255; deploys ZIP 271 + ZIP 1016) | [zips.z.cash/zip-0255](https://zips.z.cash/zip-0255) | high |
| 2026-01 | Entire ECC engineering + product team resigns after clash with Bootstrap board | [theblock.co](https://www.theblock.co/post/384737/zcash-developers-form-new-company) | high |
| 2026-01-15 | SEC investigation closed with no enforcement action recommended | [coincodex.com](https://coincodex.com/article/87367/zcash-etf/) | low |
| 2026-03-09 | ZODL (Zcash Open Development Lab) announces >$25M seed (Paradigm, a16z crypto, Winklevoss Capital, Coinbase Ventures, Cypherpunk Technologies, Chapter One, Balaji Srinivasan) | [coindesk.com](https://www.coindesk.com/business/2026/03/09/josh-swihart-s-zcash-open-development-lab-raises-usd25-million-in-seed-funding) | high |
| 2026-05-28 | Anthropic releases **Claude Opus 4.8** | [unchainedcrypto.com](https://unchainedcrypto.com/ai-assisted-audit-uncovers-critical-zcash-orchard-vulnerability-that-could-have-minted-unlimited-counterfeit-zec/) | med |
| **2026-05-29 23:53** | **Taylor Hornby discovers the Orchard soundness bug and discloses to ZODL** | [zodl.com](https://zodl.com/orchard-vulnerability-successfully-remediated), [zips.z.cash/zip-0257](https://zips.z.cash/zip-0257) | high |
| 2026-05-30 (early) | Daira-Emma Hopwood, Kris Nuttycombe, Jack Grigg confirm the bug | [zodl.com](https://zodl.com/orchard-vulnerability-successfully-remediated) | med |
| 2026-05-31 (eve) | Private coordination with miners and exchanges begins | [zodl.com](https://zodl.com/orchard-vulnerability-successfully-remediated) | med |
| **2026-06-02 ~02:00 UTC** | **Emergency soft fork activates at height 3,363,426** — all Orchard Actions banned (`nActionsOrchard = 0`) | [zips.z.cash/zip-0257](https://zips.z.cash/zip-0257) | high |
| 2026-06-02 | Zebra **4.5.3** (soft fork) and Zebra **5.0.0** (NU6.2) released | [zfnd.org](https://zfnd.org/zebra-4-5-3-and-5-0-0-emergency-soft-fork-and-nu6-2-activation/) | high |
| **2026-06-03 00:05 EDT** | **NU6.2 activates at mainnet height 3,364,600**; fixed Orchard circuit re-enables shielded actions | [zips.z.cash/zip-0257](https://zips.z.cash/zip-0257) | high |
| 2026-06-03 | Chain halts >4 hours after the upgrade; last block 05:27 UTC | [bitcoinfoundation.org](https://bitcoinfoundation.org/news/blockchain-news/zcash-blockchain-outage/) | med |
| 2026-06-04 | Shielded Labs publishes "The Orchard Counterfeiting Vulnerability" — public disclosure | [shieldedlabs.net](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/) | high |
| **2026-06-05** | **ZEC crashes.** Daily series $620.93 (6/4) → $389.97 (6/6). Intraday reports: $630 → ~$250 | CoinGecko API; [theblock.co](https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million) | high / med |
| 2026-06-05 | $116M+ liquidated in 24h (≈$72M longs, ≈$45M shorts), 19,160 traders | [theblock.co](https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million) | med |
| 2026-06-05 | **Arthur Hayes liquidates his entire ZEC position** | [coindesk.com](https://www.coindesk.com/markets/2026/06/05/arthur-hayes-dumps-zcash-holdings-after-orchard-pool-vulnerability-revealed) | high |
| 2026-06-12 | Blockstream publishes critique of shielded verifiable supply | [blog.blockstream.com](https://blog.blockstream.com/what-the-zcash-orchard-bug-reveals-about-verifiable-supply/) | high |
| 2026-06-12 | Zooko: follow-up Anthropic audit found no further serious bugs | [cryptobriefing.com](https://cryptobriefing.com/zcash-anthropic-audit-no-serious-bugs/) | med |
| 2026-07-07 | Project Tachyon publishes "Detecting Counterfeiting after Zcash's Ironwood" | [tachyon.z.cash](https://tachyon.z.cash/blog/detecting-counterfeiting-in-zcash/) | high |
| 2026-07-10 | Zebra **6.0.0** released — first stable NU6.3/Ironwood support | [zfnd.org](https://zfnd.org/zebra-6-0-0-release/) | high |
| **2026-07-18** | **zcashd end-of-life** at height 3,417,100; all zcashd 6.20.0 nodes auto-halt | [zcash.github.io](https://zcash.github.io/zcash/user/end-of-life.html) | high |
| **2026-07-28** | **NU6.3 "Ironwood" activates at mainnet height 3,428,143** (~13:00 UTC) | [zips.z.cash/zip-0258](https://zips.z.cash/zip-0258), [zfnd.org](https://zfnd.org/zebra-6-0-0-release/) | high |
| 2026-07-29 | ~176k–182k ZEC (~$80M) crosses into Ironwood on day one | [coindesk.com](https://www.coindesk.com/tech/2026/07/29/about-usd80-million-zec-crosses-into-zcash-s-new-ironwood-pool-in-the-first-day) | med |
| 2026-07-29 | Zooko: node-verified chain supply snapshot **16,848,458 ZEC** (80.23% of 21M) | [kucoin.com](https://www.kucoin.com/blog/es-zcash-ironwood-upgrade-zec-supply-verification) | med |
| 2026-08-09 | Ironwood passes Orchard: 1,976,378 ZEC (> $1B) | [kucoin.com](https://www.kucoin.com/news/flash/ironwood-surpasses-orchard-as-largest-shielded-pool-on-zcash-locks-over-1-billion-in-zec) | low |
| 2026-08-14 | Jason McGee nominates a **$750k bonus grant** for Hornby, doubling his $750k request to **$1.5M** | [forum.zcashcommunity.com](https://forum.zcashcommunity.com/t/taylor-hornby-bonus-grant-for-orchard-counterfeiting-vulnerability-bug-bounty/57025) | med |
| **2026-08-21** | **Grayscale 8-K: ZCSH to uplist to NYSE Arca "on or about 25 Aug 2026"; Trust to be renamed "The Zcash ETF"** | [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1720265/000119312526361075/zcsh-20260821.htm) | high |
| 2026-08-21 | Grayscale files S-3/A Amendment No. 5 | [SEC EDGAR](https://data.sec.gov/submissions/CIK0001720265.json) | high |
| **2026-08-22** | **ZEC ~$784–$821, +23% to +40% in 24h; mkt cap ~$13.3–13.8B; block 3,456,854** | CoinGecko / [Blockchair](https://api.blockchair.com/zcash/stats) / [coindesk.com](https://www.coindesk.com/price/zcash) | high |

---

## Network-upgrade activation heights

Consolidated from the ZIP texts. The heights themselves are scattered across §1.4 (the mitigation and NU6.2), §2.1 (NU6.3) and §7.2 (NU6.1); this table is the one place that carries all of them with both networks named, because `apps/indexer/src/decoder/activation-heights.ts` needs to cite each height individually and reading a pair out of a sentence is how testnet NU6.2 came to be recorded as ordering-derived (§1.4).

| Upgrade | Mainnet height | Testnet height | ZIP | ZIP status |
|---|---|---|---|---|
| Sapling (NU1) | 419,200 | 280,000 | — | — |
| NU5 (Orchard) | 1,687,104 | 1,842,420 | — | — |
| NU6 | 2,726,400 | **2,976,000** | [ZIP 253](https://zips.z.cash/zip-0253) | Final |
| NU6.1 | 3,146,400 | 3,536,500 | [ZIP 255](https://zips.z.cash/zip-0255) | Final |
| Orchard mitigation soft fork | 3,363,426 | 4,048,500 | [ZIP 257](https://zips.z.cash/zip-0257) | Final |
| NU6.2 | 3,364,600 | 4,052,000 | [ZIP 257](https://zips.z.cash/zip-0257) | Final |
| NU6.3 "Ironwood" | 3,428,143 | 4,134,000 | [ZIP 258](https://zips.z.cash/zip-0258) | **Draft** |

Notes on this table, because two of its cells are not like the others:

- **Testnet NU6, 2,976,000, is new to this corpus and appears in no other line of it.** ZIP 253 (Final) states it; L2 read the ZIP and relayed the height in the HANDOFF-06 resolution. Until then the repository had no testnet NU6 height at all, and `activation-heights.ts` deliberately carried a comment explaining its absence rather than a plausible number. `high`.
- **ZIP 258 is Draft, and was Draft when NU6.3 activated** (§2.1). Both Ironwood heights, and with them `poolsActiveAt`, `orchardExitOnlyFrom` and every Orchard-exit-only gate in this project, rest on a document that may still be edited. Tracked as a standing deferred entry in `handoffs/LEDGER.md`. `high`.
- The four pre-NU6 heights carry no ZIP citation here because none was located in this corpus; they come from the Zcash protocol specification and `zcashd` chainparams, and `activation-heights.ts` says so at each constant rather than letting them pass as corroborated.

---

## 1. The Orchard soundness exploit (May–June 2026)

### 1.1 Disclosure timeline

The chronology below is reconciled from ZIP 257 (consensus-level primary source), the Zcash Foundation release post, ZODL's remediation post, and Shielded Labs' disclosure.

| Time (2026) | Event |
|---|---|
| May 28 | Anthropic releases Claude Opus 4.8 [[unchained](https://unchainedcrypto.com/ai-assisted-audit-uncovers-critical-zcash-orchard-vulnerability-that-could-have-minted-unlimited-counterfeit-zec/)] `med` |
| **May 29, 23:53** | Taylor Hornby discovers the bug and discloses it to ZODL engineers [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)] `high` |
| May 30, early | Hopwood, Nuttycombe and Grigg confirm [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)] `med` |
| May 31, evening | Private coordination with miners and exchanges [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)] `med` |
| June 1, 22:00 EDT | Soft-fork activation targeted; slipped ~2h on coordination [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)] `med` |
| **June 2, ~02:00 UTC** | Soft fork live at height **3,363,426** [[ZIP 257](https://zips.z.cash/zip-0257)] `high` |
| **June 3, 00:05 EDT** | NU6.2 hard fork at height **3,364,600** [[ZIP 257](https://zips.z.cash/zip-0257)] `high` |
| June 4 | Shielded Labs publishes the disclosure [[shieldedlabs](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/)] `high` |
| June 5 | Market discovers it; ZEC crashes; Hayes exits [[coindesk](https://www.coindesk.com/markets/2026/06/05/arthur-hayes-dumps-zcash-holdings-after-orchard-pool-vulnerability-revealed)] `high` |

**Total exposure window:** Orchard activated with NU5 on 2022-05-31 and the mitigation landed 2026-06-01/02 — The Block computes **4 years, 1 day, 10 hours** [[theblock](https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million)] `med`. Time from discovery to patch: ~4 days 10 hours.

**Forensic note.** The network was patched *before* the public knew. The soft fork on June 2 disabled all Orchard actions with no public explanation of why — a deliberate information-asymmetry window of roughly 48 hours between consensus change and disclosure. Compare the 2019 precedent, where disclosure trailed the fix by ~11 months (§3.2). `high` (inference from dated primary sources)

### 1.2 Technical root cause

The bug was **not** in the Orchard *statement* (the protocol spec) but in the *circuit implementation* — specifically the halo2 gadget library. ZIP 257 states the flaw was in the variable-base scalar multiplication gadget, "affecting only the circuit implementation rather than the underlying statement specification," and the fix "involved adding copy constraints to restore soundness" [[ZIP 257](https://zips.z.cash/zip-0257)] `high`.

**The precise defect**, per BlockSec's analysis [[blocksec](https://blocksec.com/blog/web3-security-zcash-orchard-soundness-bug-analysis)] `med`:

- **File:** `halo2_gadgets/src/ecc/chip/mul/incomplete.rs`, lines ~309–310
- Two calls used `region.assign_advice()` where `region.copy_advice()` was required:

```rust
region.assign_advice(|| "x_p", self.double_and_add.x_p, row + offset, || x_p)?;
region.assign_advice(|| "y_p", self.y_p,                 row + offset, || y_p)?;
```

- `assign_advice()` writes a witness value **without** creating an equality (copy) constraint. The circuit therefore never bound the loop's internal base point to the externally supplied base point.

ZODL's own phrasing corroborates and names the selector the task asked about: *"the incomplete double-and-add loop in `ecc::chip::mul` kept the per-iteration base constant across loop rows via `q_mul_2`, but never tied it to the real base"* [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)] `high`.

So: `q_mul_2` enforced *internal consistency* — the same base across every iteration of the double-and-add ladder — but nothing anchored that base to `g_d`. The base point was **free**.

**Why a free base breaks the money.** Orchard binds a note's diversified transmission key by `pk_d = [ivk]·g_d`. With a free base, a malicious prover can substitute an arbitrary point and satisfy the multiplication check for *forged* `ivk` values — and, critically, for forged **nullifier deriving keys** `nk`. Because the nullifier is

```
nf = Extract_P( [ (F_nk(ρ) + ψ) mod p ] · G + cm )
```

a different `nk` yields a **different nullifier for the same note**. Consensus only rejects *repeated* nullifiers; a fresh forged nullifier validates. The same note can therefore be spent indefinitely [[blocksec](https://blocksec.com/blog/web3-security-zcash-orchard-soundness-bug-analysis)] `med`.

**The fix** adds the missing anchor on the first row:

```rust
if row == 0 {
    region.copy_advice(|| "base", self.base, 0, self.double_and_add.x_p, row)?;
}
```

The existing inter-iteration constraints then propagate the anchor through the ladder [[blocksec](https://blocksec.com/blog/web3-security-zcash-orchard-soundness-bug-analysis)] `med`.

**Independent corroboration.** Ledger CTO Charles Guillemet described it identically in public: *"Two lines in halo2's variable-base scalar multiplication gadget used `assign_advice()` where `copy_advice()` was required. As a result, the diversified-address integrity check `pk_d = [ivk]·g_d` could b[e]…"* [[x.com/P3b7_](https://x.com/P3b7_/status/2062807526463205876)] `med` — the post is truncated in the search snippet and could not be fetched in full (robots.txt blocks the mirror).

**Conflict in framing.** Sources describe the impact differently and this matters:
- Shielded Labs and most press: **counterfeiting / unlimited undetectable minting** [[shieldedlabs](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/)] `high`
- The community-forum rendering of the ZF post: **double-spending within Orchard**, with the turnstile preventing total-supply inflation [[forum](https://forum.zcashcommunity.com/t/zebra-4-5-3-and-5-0-0-emergency-soft-fork-and-nu6-2-activation/55981)] `med`
- ZIP 257 (most conservative, most authoritative): *"could have allowed balance violation and theft of funds"* [[ZIP 257](https://zips.z.cash/zip-0257)] `high`

**These are reconcilable, and the reconciliation is the story.** ZIP 209 forbids any chain value pool balance going negative, so no more ZEC can ever *exit* Orchard than entered it — the 21M cap was never at risk at the consensus layer. But *inside* the pool, forged notes are indistinguishable from real ones. A counterfeiter drains **other users' legitimate ZEC**, not the network's cap. Shielded Labs states this plainly: *"If counterfeit funds were withdrawn before legitimate funds, a user would be unable to recover some or all of their legitimate Orchard funds"* [[shieldedlabs](https://shieldedlabs.net/four-questions-about-the-orchard-vulnerability/)] `high`. Headlines saying "unlimited counterfeit ZEC" and node operators saying "supply was safe" are both true at different layers.

### 1.3 Affected and fixed software

| Component | Vulnerable | Fixed |
|---|---|---|
| `halo2_gadgets` | < 0.5.0 | 0.5.0 |
| `orchard` | < 0.14.0 | 0.14.0 |
| `zcash_primitives` | < 0.28.0 | 0.28.0 |
| `zcashd` | 5.0.0 – 6.12.3 | 6.20.0 |
| `zebrad` | < 4.5.1 | 5.0.0 |

Sources: [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)], [[forum/zfnd](https://forum.zcashcommunity.com/t/zebra-4-5-3-and-5-0-0-emergency-soft-fork-and-nu6-2-activation/55981)] `high`. **No CVE had been assigned** as of ZODL's post `med`. No public advisory exists in the `zcash/halo2` GitHub Security Advisories tab as of 22 Aug 2026 [[github](https://github.com/zcash/halo2/security/advisories)] `high` — a documentation gap worth flagging.

### 1.4 The consensus mitigation

ZIP 257 (Final), author Daira-Emma Hopwood, "Deployment of the Orchard Temporary Vulnerability Mitigation and NU6.2 Network Upgrade":

> "From block height 3363426 (Mainnet) or 4048500 (Testnet) onward, until the activation of NU6.2 on each network, v5 and later transactions MUST NOT contain any Orchard Action descriptions"

i.e. `nActionsOrchard = 0` — Orchard was **switched off entirely** for ~1,174 blocks (≈24 hours). NU6.2 then replaced the Orchard Action verifying key and added a canonical-length rule: `proofsOrchard` MUST be exactly `2720 + 2272 · nActionsOrchard` bytes [[ZIP 257](https://zips.z.cash/zip-0257)] `high`.

Activation heights, each under its own name rather than as an ordered pair — the mitigation soft fork at **mainnet 3,363,426** and **testnet 4,048,500** (the two the clause above names together), and NU6.2 itself at **mainnet 3,364,600** and **testnet 4,052,000**, which ZIP 257 prints under NU6.2's own heading [[ZIP 257](https://zips.z.cash/zip-0257)] `high`. **This confirms the height given in the research brief (3,364,600) and the date (3 June 2026).**

> **Why this sentence is written out four times instead of twice.** It previously read "testnet 4,048,500 and 4,052,000", which is true and, taken alone, does not say WHICH is which — the mapping had to be recovered from the order of the mainnet pair before it. HANDOFF-06 read it that way, correctly refused to claim more than the corpus supported, and recorded testnet NU6.2 as corroborated by ordering rather than by statement. L2 then read ZIP 257: the height is stated. The constant never changed; only its provenance did. Corrected here so the next reader inherits the statement rather than the inference (LEDGER, L2 RESOLUTION — HANDOFF-06, fold 3).

### 1.5 The AI angle — verified

- **Researcher:** Taylor Hornby, hired by **Shielded Labs in April 2026** [[unchained](https://unchainedcrypto.com/ai-assisted-audit-uncovers-critical-zcash-orchard-vulnerability-that-could-have-minted-unlimited-counterfeit-zec/)] `high`. Long-standing Zcash-ecosystem auditor (ZecSec/defuse.ca).
- **Model:** **Anthropic Claude Opus 4.8**, released 28 May 2026 — one day before discovery — used inside Hornby's own auditing framework [[shieldedlabs](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/)], [[decrypt](https://decrypt.co/370232/frontier-ai-models-find-crypto-bugs-industry-isnt-ready)] `high`. **The brief's claim of "Claude Opus 4.8" and "May 29, 2026" is confirmed by multiple sources including the discovering organisation.**
- **Proof of concept:** Hornby built a working exploit. Shielded Labs: *"If he had run the same tool on Zcash mainnet it would have generated unlimited, undetectable counterfeit ZEC in his mainnet Zcash wallet"* [[shieldedlabs](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/)] `high`.
- **Follow-up audit:** Zooko said an Anthropic-run audit found no further serious bugs (12 Jun 2026) [[cryptobriefing](https://cryptobriefing.com/zcash-anthropic-audit-no-serious-bugs/)] `med`. The model here is named inconsistently — Shielded Labs and Cointribune say **"Mythos"** / "Claude Mythos" [[shieldedlabs](https://shieldedlabs.net/four-questions-about-the-orchard-vulnerability/)], [[cointribune](https://www.cointribune.com/en/zcash-anthropics-claude-mythos-detects-no-major-flaw-after-requested-audit/)] while Cryptobriefing says Opus 4.8 "in collaboration with Mythos". **Treat the "Mythos" product name as `low` confidence.**
- **Anthropic's own position:** **No Anthropic statement or spokesperson quote was located.** Decrypt explicitly notes Anthropic's involvement was limited to Claude Opus 4.8 being the tool used [[decrypt](https://decrypt.co/370232/frontier-ai-models-find-crypto-bugs-industry-isnt-ready)] `high` (as a negative finding).
- **Bounty:** Zcash's bug bounty programme had **closed days before Hornby found the bug**; the retroactive-grants route was used instead. Hornby requested $750k; Jason McGee proposed doubling it to **$1.5M** on 14 Aug 2026, arguing the original was 0.033% of ~**$2.3B** at risk versus industry norms of 0.24%+. Status: "Ready For Vote." Sean Bowe (ebfull) commented that the disclosure *"almost certainly saved Zcash"* [[forum](https://forum.zcashcommunity.com/t/taylor-hornby-bonus-grant-for-orchard-counterfeiting-vulnerability-bug-bounty/57025)] `med`.

### 1.6 Was counterfeit ZEC ever detected? — the official position

**No. No detection of counterfeit ZEC has ever been claimed by anyone.** The official position, stated by Shielded Labs, is that exploitation is **cryptographically unprovable either way**:

> "Due to the privacy properties of Orchard and the nature of the bug, there is no definitive way to determine using only cryptography whether such exploitation occurred." [[shieldedlabs](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/)] `high`

Their three arguments that exploitation is *unlikely*: the flaw survived years of expert review; finding it took deliberate state-of-the-art effort; and exploits are normally monetised fast and leave traces — *"If this vulnerability had been exploited before it was remediated, we would expect evidence to have emerged by now"* [[shieldedlabs](https://shieldedlabs.net/four-questions-about-the-orchard-vulnerability/)] `high`.

Zooko's public framing: the bug *"could have been exploited to create an unlimited amount of counterfeit ZEC in Orchard undetectably"* [[cointribune](https://www.cointribune.com/en/zcash-anthropics-claude-mythos-detects-no-major-flaw-after-requested-audit/)] `med`.

ZODL is more assertive than Shielded Labs: *"There is no evidence that the vulnerability was exploited. User funds remained safe throughout"* [[zodl](https://zodl.com/orchard-vulnerability-successfully-remediated)] `med`. **Note the rhetorical gap: "no evidence of exploitation" is not "evidence of no exploitation," and in a shielded pool the absence of evidence is structurally guaranteed.** This distinction is the core of ZECReveal's thesis.

**Independent forensics.** Bitquery examined the full chain to early June 2026 [[bitquery](https://bitquery.io/blog/was-zcash-counterfeited-orchard-bug)] `med`:
- Total issuance ~16.75M ZEC, on schedule, well under the 21M cap
- Orchard reached ~5M ZEC near its April 2026 peak and **kept filling** rather than draining
- During the May 28 – June 2 practical-exploitation window, daily flows were unremarkable; the pool *gained* ~11,000 ZEC
- **Stated limits:** minted notes that never left the pool are invisible by design, and withdrawals of **50,000–100,000 ZEC "would blend into that noise"**

### 1.7 Market reaction

| Metric | Value | Source |
|---|---|---|
| Daily close 2026-06-04 | $620.93 | CoinGecko API `high` |
| Daily close 2026-06-05 | $459.17 | CoinGecko API `high` |
| Daily close 2026-06-06 | $389.99 | CoinGecko API `high` |
| Peak → trough (daily) | **−37.2%** in 2 days | computed `high` |
| Intraday (The Block) | $630 → ~$250, "50–60%" | [theblock](https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million) `med` |
| Intraday (BitMEX) | June 4 high $624 → June 5 low $309 | [bitmex](https://www.bitmex.com/blog/zec-crash-2026) `med` |
| 24h liquidations | $116M+ (~$72M long / ~$45M short), 19,160 traders, 3.72× 7-day avg | [theblock](https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million) `med` |
| Volume spike 6/5 | +68% vs 30-day average | [bitmex](https://www.bitmex.com/blog/zec-crash-2026) `med` |

**Sources conflict materially on the crash low** ($250 vs $309 vs a $389.99 daily close). Exchange-specific wicks and index methodology explain the spread; ZECReveal should cite the range, not a point.

**Arthur Hayes** liquidated his entire position on 5 June [[coindesk](https://www.coindesk.com/markets/2026/06/05/arthur-hayes-dumps-zcash-holdings-after-orchard-pool-vulnerability-revealed)] `high`:

> "I read about the exploit yesterday, and didn't appreciate how it violated my narrative mental map. The 30% dump made me rethink, and I had to take profit on the entire position."

He conceded minting was "extremely unlikely" but not "cryptographically proven impossible" — **an explicit statement that unprovability, not probability, drove the exit.** Position size was not disclosed. Arkham separately reported one holder losing over half the value of a **$174M** ZEC position [[coindesk](https://www.coindesk.com/markets/2026/06/05/arthur-hayes-dumps-zcash-holdings-after-orchard-pool-vulnerability-revealed)] `med`.

ZachXBT publicly accused Hayes of using followers as exit liquidity on HYPE, ZEC and WLD [[kucoin](https://www.kucoin.com/blog/zachxbt-accuses-arthur-hayes-exit-liquidity)] `low` — allegation only, unverified.

### 1.8 Aftermath

- **Follow-up audits:** Multiple teams (Shielded Labs, AI-assisted analysis) searched for further counterfeiting flaws and found none to date [[shieldedlabs](https://shieldedlabs.net/four-questions-about-the-orchard-vulnerability/)] `high`. Anthropic-run audit reported clean, 12 Jun 2026 [[cryptobriefing](https://cryptobriefing.com/zcash-anthropic-audit-no-serious-bugs/)] `med`.
- **Formal verification:** The Orchard/Ironwood circuit was put through formal verification — Valar Group is credited with that workstream [[theblock](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability)] `med`.
- **Structural response:** Ironwood (§2) — the only real remedy.
- **Hornby's own write-up: NOT FOUND.** No post on the Orchard bug exists on defuse.ca or the ZecSec index, whose newest entry is dated January 2024 [[defuse.ca/zecsec.htm](https://defuse.ca/zecsec.htm)] `high` (negative finding). Hornby has since added **Monero** to his audit queue, which moved XMR down ~10% [[beincrypto](https://beincrypto.com/researcher-zcash-bug-monero-audit/)] `low`.
- **Sean Bowe** on the outcome: *"Soundness of our zk-SNARK would have been great on its own. But a cross-team collaboration has just changed Zcash's history forever"* [[theblock](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability)] `med`.

---

## 2. NU6.3 "Ironwood"

### 2.1 Activation

- **Mainnet height 3,428,143**, 28 July 2026, ~13:00 UTC [[ZIP 258](https://zips.z.cash/zip-0258)], [[zfnd](https://zfnd.org/zebra-6-0-0-release/)] `high`
- **Testnet height 4,134,000** [[ZIP 258](https://zips.z.cash/zip-0258)] `high`

**The brief's height (3,428,143) and date (~28 July 2026) are confirmed by ZIP text.** Note ZIP 258 remains **Draft** status even post-activation — a governance-hygiene observation.

### 2.2 The new pool: name and cryptography

The pool is called **Ironwood** — the same name as the upgrade [[ZIP 258](https://zips.z.cash/zip-0258)] `high`.

**It is not a new proof system and not a new curve.** It reuses Orchard's cryptography with the circuit bug fixed:
- **Proof system:** Halo 2, reusing the corrected Orchard circuit [[theblock](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability)] `med`; ZODL: Ironwood *"uses the existing Orchard protocol but backed by formal verification and additional independent audits"* [[zodl](https://zodl.com/ironwood-a-new-shielded-pool-for-zcash/)] `high`
- **Curve:** **Pallas**, as in Orchard [[ZIP 2005](https://zips.z.cash/zip-2005)] `high`
- **Hashes:** BLAKE2b-512 for randomness derivation, **BLAKE3** for quantum key derivation, Sinsemilla commitments (modified for the post-quantum setting) [[ZIP 2005](https://zips.z.cash/zip-2005)] `high`
- **Structure:** its own note commitment tree, nullifier set and chain value pool [[crypto.news](https://crypto.news/zcash-ironwood-upgrade-whats-changed-after-the-orchard-bug/)] `med`
- **Transaction format:** **v6**, per ZIP 229 [[ZIP 258](https://zips.z.cash/zip-0258)] `high`

**Tachyon relationship:** Ironwood is **not** Tachyon. Project Tachyon contributed to the Ironwood effort as an organisation [[shieldedlabs](https://shieldedlabs.net/ironwood/)] `high`, and ZIP 2005 is deliberately agnostic about the eventual proof system precisely so a Tachyon-style PCD system can be adopted later without re-specifying the pool — *"[proof system] undefined intentionally; allows future flexibility in choosing post-quantum alternatives"* [[ZIP 2005](https://zips.z.cash/zip-2005)] `high`.

**What is genuinely new: quantum recoverability.** ZIP 2005 ("Ironwood Quantum Recoverability", authors Daira-Emma Hopwood and Jack Grigg, status Proposed, created 2025-03-31) `high`:
- Every Ironwood output note uses the quantum-recoverable note plaintext format, **lead byte `0x03`** (Orchard non-recoverable notes keep `0x02`)
- The note randomness commitment is re-derived as `rcm = H^rcm_rseed(g*_d, pk*_d, v, ρ, ψ)` with `pre_rcm = [0x0B] || encode(noterepr)`, folding **all** note fields into the commitment. This makes the commitment binding **even against a discrete-log-breaking adversary**, when checked inside a future recovery protocol.
- Two key-derivation paths: a legacy path (`use_qsk = false`) deriving from the spending key, and a quantum path (`use_qsk = true`) using a quantum spending key `qsk` + intermediate key `qk`, which supports **FROST threshold multisignatures** and hardware-wallet key separation
- **Important caveat, stated in the ZIP itself:** this *"does not make Zcash immediately quantum-secure"* — it establishes recovery infrastructure. Marketing that calls Ironwood "quantum-resistant" overstates it. `high`
- Funds in Sprout, Sapling and legacy Orchard are **not** recoverable and would need migration if discrete log ever breaks

### 2.3 ZIPs in NU6.3

Consensus: ZIP 200, 204, **209** (extended to cover the Ironwood pool balance), 213, 221, **229** (v6 transaction format), **2005** (Ironwood Quantum Recoverability), **2006** (Restricting Transfers into the Orchard Pool).
Wallet: ZIP 317 (proportional fees), **318** (Orchard→Ironwood Migration), **326** (NU6.3 Consequences for Wallets).
Source: [[ZIP 258](https://zips.z.cash/zip-0258)] `high`.

Status note: 2005 = Proposed, **2006 = Reserved** (its substantive text was not published at the URL — a real transparency gap for the ZIP that actually seals Orchard), 229/258/318/326 = Draft [[zips.z.cash](https://zips.z.cash/)] `high`.

ZIP 318 authors: Schell Carl Scivally, Pacu Gindre, Kris Nuttycombe `high`.

### 2.4 Who built it

A five-organisation coalition: **ZODL** (Zcash Open Development Lab), **Project Tachyon**, **Valar Group**, the **Zcash Foundation**, and **Shielded Labs** [[shieldedlabs](https://shieldedlabs.net/ironwood/)], [[crypto.news](https://crypto.news/zcash-ironwood-upgrade-whats-changed-after-the-orchard-bug/)] `high`. The Block reports **ZODL engineers accounted for 82% of merged protocol and wallet repository changes** [[theblock](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability)] `med` — a striking concentration for a "decentralised" protocol, and note ZODL is a venture-funded company less than a year old (§7.1).

### 2.5 Node software — zcashd is dead

**zcashd reached end-of-life on 18 July 2026 at block height 3,417,100**, when every zcashd 6.20.0 node hit its automatic end-of-support halt and shut down [[zcash.github.io](https://zcash.github.io/zcash/user/end-of-life.html)] `high`. This was **ten days before** Ironwood activated — i.e. the C++ implementation was retired *before* the upgrade it could not support. The docs tie the accelerated timeline directly to the Orchard disclosure and to security risk in the C++ codebase `high`.

Replacements — the **Z3 stack**: **Zebra** (node), **Zaino** (indexer), **Zallet** (wallet), plus **Zakura**:

| Component | Version | Date |
|---|---|---|
| Zebra | 6.0.0 (first stable NU6.3) | 2026-07-10 |
| Zebra | 6.2.3 ("Peer Connectivity Hardening") | 2026-07-28 |
| Zallet | 0.1.0-beta.2 | 2026-07-28 |
| Zaino | 0.6.0 | 2026-07-13 |
| Zakura | 1.0.5 | 2026-07-28 |
| lightwalletd | 0.5.1 | 2026-07-27 |

Sources: [[zfnd](https://zfnd.org/zebra-6-0-0-release/)], [[forum](https://forum.zcashcommunity.com/t/ironwood-is-here-updated-wallets-libraries-july-30/56557)], [[forum ZF eng update](https://forum.zcashcommunity.com/t/zf-engineering-update-27th-july-to-9th-august-2026/56966)] `high/med`. Zebra 6.0.0 bumped the state DB format to 28.0.0 (in-place migration, no resync, **downgrade unsupported**) `high`.

**Note the brief's premise:** it asked about "Zebra 6.0.0 / zcashd status." Confirmed — Zebra 6.0.0 is the NU6.3 release, and zcashd is **fully EOL, not merely deprecated**. Zebra is now effectively mandatory.

### 2.6 Wallet support (as of 30 Jul – 1 Aug 2026)

**With Ironwood support** [[forum](https://forum.zcashcommunity.com/t/ironwood-is-here-updated-wallets-libraries-july-30/56557)] `med`:

| Wallet | Version | Migration quality |
|---|---|---|
| Zodl (ex-Zashi, iOS/Android) | 3.8.0 (Jul 27) | basic migration |
| Vizor (iOS + desktop) | 0.0.20 (Jul 30) | **full ZIP 318** |
| Cake Wallet | 6.4.0 (Jul 27) | mostly ZIP 318 compliant |
| Zkool (mobile + desktop) | 6.25.1 (Jul 28) | private migration flow |
| Zingo! | 2.0.21 (Jul 30) | basic |
| Zingo-PC | 2.0.22 (Jul 30) | — |
| NozyWallet | 2.4.2 (Jul 30) | CLI only |
| Keystone (hardware) | firmware 3.0.2 (Jul 27) | — |
| Gem Wallet | — | transparent only |

**Without Ironwood support:**
- **Ywallet** — last release 1.15.3 (Jun 4) and *"will not be updated for Ironwood"* `med`. A long-standing wallet abandoning the migration is a real user-funds risk.
- **Ledger** — PCZT v2 merged 27 Jul but **pending Ledger review** `med`. Ledger users may still lack a native migration path.
- **Trezor** — no mention.

**Wallet naming:** ECC's **Zashi** was rebranded **Zodl** after the team moved to ZODL [[coindesk](https://www.coindesk.com/business/2026/03/09/josh-swihart-s-zcash-open-development-lab-raises-usd25-million-in-seed-funding)] `med`.

### 2.7 Migration and turnstile rules between pools

- **Orchard is exit-only.** ZIP 258: after activation *"no new value may enter the Orchard pool"* [[ZIP 258](https://zips.z.cash/zip-0258)] `high`. Ordinary payments inside Orchard are disabled; only change and outward migration remain [[ZIP 318](https://zips.z.cash/zip-0318)] `high`.
- **Orchard is not "sealed shut."** ~3.6M ZEC remained withdrawable at activation; migration is **voluntary with no deadline** [[theblock](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability)], [[phemex](https://phemex.com/blogs/zcash-shielded-pool-1-billion-ironwood-upgrade)] `med`.
- **Ironwood started at zero ZEC** [[coindesk](https://www.coindesk.com/tech/2026/07/28/zcash-seals-usd1-7-billion-shielded-pool-as-ironwood-upgrade-activates)] `med`.
- **ZIP 318 migration mechanics** [[ZIP 318](https://zips.z.cash/zip-0318)] `high`:
  - Two phases: (1) wallet quantises balance into canonical denominations via internal send-to-self; (2) pre-signed pool-crossing transfers broadcast on a schedule
  - Each migration tx spends exactly one Orchard note → exactly one Ironwood output
  - **Denominations follow n × 10^k with n ∈ {1, 2, 5}** (0.5, 1, 2, 5, 10, 20, 50, 100…)
  - `MAX_RESIDUAL_VALUE` = **0.01 ZEC** — dust below this is **stranded in Orchard permanently**
  - `DENOM_CAP` = **10,000 ZEC** plus canonical fee
  - **"The net amount crossing between the pools is revealed on-chain"** — the amount is public; the wallet identity is not. Denomination bucketing and scheduling are the privacy defence, and they are *heuristic*, not cryptographic.

**Forensic point for ZECReveal:** the turnstile that restores supply auditability does so by **making every pool-crossing amount public**. Auditability and privacy trade off directly here, and the trade is being paid by users migrating today.

---

## 3. Turnstiles and the "turnstile bug catcher"

### 3.1 What a turnstile is

A turnstile is a consensus rule tracking a **chain value pool balance** for each shielded pool — the running total of value that has entered minus value that has left. Because ZEC can only enter or exit a shielded pool *by transparently revealing the transfer amount*, that balance is publicly computable by every node [[electriccoin.co](https://electriccoin.co/blog/turnstile-enforcement-against-counterfeiting/)] `high`.

**ZIP 209**, now titled *"Prohibit Out-of-Range Chain Value Pool Balances"* (Final), states:

> "If the chain value pool balance for any of the *Sprout*, *Sapling*, *Orchard*, *Ironwood*, *transparent*, or *deferred development fund pools* would become negative in the block chain created as a result of accepting a block, then all nodes MUST reject the block as invalid." [[ZIP 209](https://zips.z.cash/zip-0209)] `high`

The Ironwood pool was added to that list at NU6.3; before activation its balance was defined as zero `high`.

### 3.2 Why turnstiles are the *only* counterfeiting detector in a shielded pool

Inside a shielded pool every note is a commitment and every spend a zero-knowledge proof. If the circuit is unsound, a forged note is **mathematically indistinguishable** from a real one — there is no observable to compare against. Supply auditing is therefore impossible *within* the pool.

The pool **boundary** is the only place where value becomes visible. A turnstile converts an invisible internal invariant ("no forged notes exist") into a visible external one ("no more value left than entered"). ECC's own framing: the rule catches counterfeiting *"through tracking whether more ZEC exits a shielded pool than entered it"* but *"cannot directly detect counterfeiting within shielded pools themselves due to privacy protections"* [[electriccoin.co](https://electriccoin.co/blog/turnstile-enforcement-against-counterfeiting/)] `high`.

### 3.3 The three hard limits

1. **A turnstile detects only *aggregate over-withdrawal*, never theft.** If a counterfeiter mints 100,000 fake ZEC and withdraws it while 3.6M legitimate ZEC remain, the balance never goes negative and no rule fires. The loss lands on the last legitimate holders who try to exit — Shielded Labs concedes exactly this [[shieldedlabs](https://shieldedlabs.net/four-questions-about-the-orchard-vulnerability/)] `high`.
2. **It is a lagging indicator.** The violation surfaces only when the pool is drained past its balance — potentially years after the fraud, and only if enough honest users try to exit. This is why Ironwood **disables ordinary payments in Orchard**: forcing exits is the only way to make the accounting resolve. Tachyon: *"payments within the old Orchard pool will be disabled to provide an upper bound on the supply of circulating ZEC"* [[tachyon](https://tachyon.z.cash/blog/detecting-counterfeiting-in-zcash/)] `high`.
3. **It can never be conclusive while funds remain.** Tachyon is explicit: *"we seemingly found them all before they were ever exploited, yet we cannot definitively claim this until evidence is gathered through the turnstile"* `high`. The proof depends on **voluntary** migration with **no deadline** — so it may never complete. Roughly 708,841 ZEC still sit in Orchard (§6), and 0.01-ZEC dust is permanently stranded by ZIP 318's design.

So the "turnstile bug catcher" is real but **weak, slow, aggregate-only, and — for Orchard — possibly never-resolving.**

### 3.4 Historical precedent: Sprout → Sapling (CVE-2019-7167)

| Fact | Detail |
|---|---|
| Discovered | 1 March 2018, by **Ariel Gabizon** at the Financial Cryptography conference; confirmed with Sean Bowe |
| Root cause | **BCTV14** zk-SNARK construction: key generation emitted extra polynomial-evaluation elements, mistakenly included, that let a cheating prover bypass a consistency check. These "bypass elements" were present in the MPC ceremony transcript. |
| Fixed | **Sapling activation, 28 October 2018, block 419,200** — new Sprout circuit on Groth16 with new parameters |
| CVE assigned | 29 January 2019 |
| Disclosed | **5 February 2019** — ~11 months after discovery |
| Exploited? | *"no evidence that counterfeiting has occurred"*, based on monitoring shielded pool totals |
| Turnstile shipped | zcashd **v2.0.5**, mainnet early **May 2019** (tested on testnet in v2.0.4) — i.e. **after** the fix and disclosure |

Source: [[electriccoin.co](https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/)], [[electriccoin.co turnstile](https://electriccoin.co/blog/turnstile-enforcement-against-counterfeiting/)] `high`.

**What the Sprout→Sapling turnstile actually found: nothing.** No turnstile violation has ever been reported on Zcash. That is the honest answer — and it is genuinely ambiguous, because a turnstile that never fires is consistent both with "no counterfeiting" and with "counterfeiting that stayed under the pool balance."

**The structural parallel ZECReveal should press:** in 2018 the fix shipped silently 11 months before disclosure; in 2026 the fix shipped ~48 hours before disclosure. Both times the answer to "was it exploited?" was *"we believe not, and we cannot prove it."* Twice in eight years, the money supply of a $13B asset has depended on an unprovable belief.

### 3.5 Status of the Orchard turnstile proposal

- **Proposed** by Shielded Labs immediately after disclosure: deploy a new shielded pool and *"enforc[e] turnstile accounting on all coins from the Orchard pool"* [[shieldedlabs](https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/)] `high`
- **Shipped** as NU6.3/Ironwood on 28 July 2026 — roughly **eight weeks** from proposal to mainnet `high`
- **The governing ZIP is ZIP 2006, "Restricting Transfers into the Orchard Pool" — status Reserved, and its substantive consensus text is not published** at zips.z.cash [[ZIP 2006](https://zips.z.cash/zip-2006)] `high`. **This is the single largest documentation gap found in this research:** the rule that seals a $1.7B pool has no published specification text, only a placeholder and a GitHub discussion reference (issue #1305).
- **Mechanism as described:** the turnstile *"prevents more ZEC from exiting the pool than legitimately entered it"* [[shieldedlabs](https://shieldedlabs.net/ironwood/)]; *"the turnstile rejects any attempt to move out more ZEC than entered [so] users gain an immediate, trustless guarantee that no more than the correct amount of ZEC can be circulating"* [[zodl](https://zodl.com/ironwood-a-new-shielded-pool-for-zcash/)] `high`

### 3.6 Criticisms

- **Blockstream (12 Jun 2026)** [[blog.blockstream.com](https://blog.blockstream.com/what-the-zcash-orchard-bug-reveals-about-verifiable-supply/)] `high`: *"when supply verification depends entirely on a complex cryptographic system, institutions inherit risks that cannot be independently audited after the fact."* Notes the turnstile remedy *"does not exist yet, and rolling it out will require a network upgrade, custody migration, and time."* Contrasts Bitcoin (a minting bug shows up as an immediate visible violation) and Liquid (Pedersen commitments hide amounts while keeping public balance enforcement). Conclusion: Zcash traded verifiable supply for transaction-level privacy and left itself an unrecoverable audit position.
- **Grayscale's own risk framing** and Hayes's exit both turn on unprovability rather than probability — institutional capital priced the epistemics, not the odds. `high`
- **Speculative critique (flagged as such).** TechLeaks24, 8 Aug 2026 [[techleaks24](https://techleaks24.substack.com/p/why-zcash-should-be-considered-fraudulent)] `low`: argues ~1.9M ZEC migrating within two weeks is suspiciously fast and consistent with an exploiter exiting. It also alleges VCs had early Claude Opus access before Hornby. **No evidence is offered for either claim, and the migration pace is equally explained by exit-only Orchard forcing everyone to move.** Its factual scaffolding (Hornby's date, Multicoin's ZEC position, Kyle Samani's Feb 2026 departure from Multicoin) is largely correct; its inferences are not supported. Cite only with a clear speculation label.

---

## 4. The Zcash ETF

### 4.1 Grayscale — the only live US filing (primary sources)

**Entity:** Grayscale Zcash Trust (ZEC), CIK **0001720265**, Delaware statutory trust, Commission File 000-56433 [[EDGAR](https://data.sec.gov/submissions/CIK0001720265.json)] `high`.
**Ticker: `ZCSH`** (currently OTC) — **not** an S-1. Because the Trust is already an Exchange Act reporting company, the conversion runs through **Form S-3** shelf registration, file no. **333-291800** `high`.

**Complete filing history (EDGAR, authoritative):**

| Date | Form | Note |
|---|---|---|
| 2025-11-26 | **S-3** | Initial conversion filing (+3 FWPs same day) |
| 2025-12-03 | 8-K | Item 8.01 |
| 2025-12-23 | 8-K | Item 8.01 |
| 2026-01-30 | S-3/A | Amendment 1 |
| 2026-02-02 / 02-12 | PRE 14A / DEF 14A | Proxy — trust agreement amendment |
| 2026-03-10 | 8-K | Items 1.01, 5.07, 9.01 — Second A&R Trust Agreement dated 2026-03-09 |
| 2026-03-12 | 10-K | FY2025 |
| 2026-04-02 | S-3/A | Amendment 2 |
| 2026-05-08 | 10-Q | Q1 2026 |
| 2026-07-02 | 8-K | Item 5.02 |
| 2026-07-31 | S-3/A | Amendment 3 |
| 2026-08-04 | 10-Q | Q2 2026 |
| 2026-08-18 | S-3/A | Amendment 4 |
| **2026-08-21** | **S-3/A** | **Amendment 5** |
| **2026-08-21** | **8-K** | **Item 8.01 — NYSE Arca listing + name change** |

**The 21 August 2026 8-K (verbatim substance)** [[SEC](https://www.sec.gov/Archives/edgar/data/1720265/000119312526361075/zcsh-20260821.htm)] `high`:
- Shares *"anticipated to begin trading on NYSE Arca Inc. on or about **August 25, 2026** … under the trading symbol '**ZCSH**,' subject to the receipt of certain regulatory approvals"*
- The Sponsor intends to **rename the Trust "The Zcash ETF"**, effective on or about 25 August 2026
- Explicit hedge: *"No assurance can be given that the Shares of the Trust will list and trade on the Sponsor's anticipated timeline, or at all."*
- Signed by Kathryn Masci, Interim CFO of Grayscale Investments Sponsors, LLC

**Terms from S-3/A Amendment 5** [[SEC](https://www.sec.gov/Archives/edgar/data/1720265/000119312526361067/zec_s-3_amendment_5.htm)] `high`:
- **Sponsor's Fee: 2.5% annual** of NAV Fee Basis Amount, accruing daily — very high versus spot BTC/ETH ETFs
- Trustee: Delaware Trust Company. Transfer agent + administrator: **BNY Mellon**. Prime broker: **Coinbase, Inc.** Custodian: **Coinbase Custody Trust Company, LLC**
- Baskets of **10,000 Shares**; cash orders plus **in-kind creations**; **in-kind redemptions NOT permitted** as of the prospectus date
- **DCG contribution:** the Sponsor is in discussions with **DCG International Investments Ltd.** (indirect wholly-owned DCG subsidiary) to acquire Contribution Shares in exchange for **~200,000 ZEC** — explicitly **non-binding**, "not binding agreements or commitments"
- Prospectus flags competition from *"competing spot ZEC exchange-traded products"* charging lower fees — implying Grayscale expects rivals, though none were located on EDGAR

**Holdings (primary):** the Q2 2026 10-Q reports **393,522.33134026 ZEC**; total assets **$155,252k ($155.25M)** at 30 Jun 2026, down from **$200,441k ($200.4M)** at 31 Dec 2025 [[SEC 10-Q](https://www.sec.gov/Archives/edgar/data/1720265/000172026526000006/zcsh-20260630.htm)] `high`. That is ~**2.3% of circulating ZEC** as of 30 Jun 2026 [[stocktitan](https://www.stocktitan.net/sec-filings/ZCSH/s-3-a-grayscale-zcash-trust-zec-amended-shelf-registration-statement-46cd7cb6a529.html)] `med`. Cryptobriefing cites *"over $260 million"* as of 21 Aug [[cryptobriefing](https://cryptobriefing.com/zcash-zcash-etf-sec-filing/)] `med`; at 393,522 ZEC that implies ~$660/ZEC, consistent with pre-spike pricing. At the 22 Aug price (~$790) the same holdings are worth **~$311M**. `high` (computed)

> **CORRECTION (HANDOFF-03 session, 23 Aug 2026 - LEDGER-02 Q5).** The pairing in the paragraph above is
> wrong, and the error is in this file rather than in the filing. **393,522.33134026 ZEC** is the
> **31 Dec 2025** line of the EDGAR table reproduced in
> [`04-exchange-inflows-insider-selling.md`](04-exchange-inflows-insider-selling.md), where it sits against
> total assets of **$200,441k**. The **$155,252k** figure quoted above is the **30 Jun 2026** line, whose
> ZEC holding is **388,673.68359943** - which is also what section 1.5 and the rich-list warning in that same
> file use, and what the S-3/A's "approximately 2.3% of circulating ZEC as of 30 June 2026" is consistent
> with. `packages/content` ships the June figure as the headline with the December figure carried alongside,
> both dated. Anything derived from the sentence above should be re-derived from the June line.

**Premium/discount history** (Oct 2021 – Jun 2026) [[stocktitan](https://www.stocktitan.net/sec-filings/ZCSH/s-3-a-grayscale-zcash-trust-zec-amended-shelf-registration-statement-46cd7cb6a529.html)] `med`:
- Max premium **+240%**; max discount **−55%**; average premium 53%; average discount 19%; **700 days** trading at a discount
- 30 Jun 2026: **−17%** discount; 12 Aug 2026: **−7%** discount, close $36.60
- The Block's tracker shows ZCSH at $54.29, status "pending" [[theblock](https://www.theblock.co/other-etf-live-chart/380611/grayscale-zcash-trust-etf-zcsh)] `low`

**Ticker conflict — resolved.** The Block and Coincodex say **ZCSH**; Cryptobriefing says **ZCH** [[cryptobriefing](https://cryptobriefing.com/zcash-zcash-etf-sec-filing/)]. **The SEC 8-K and S-3/A both say ZCSH. Use ZCSH.** `high`

### 4.2 Other issuers — mostly unconfirmed

- **Bitwise** reportedly filed for a Zcash ETF among 11 altcoin ETFs on ~2 Jan 2026 [[dailyhodl](https://dailyhodl.com/2026/01/02/crypto-giant-bitwise-files-for-zcash-aave-sui-and-eight-additional-altcoin-etfs-with-sec/)] `low` — **not independently verified against EDGAR in this pass.**
- **21Shares, VanEck, Canary:** **no Zcash ETF filing was located.** 21Shares' European product page contains **no ZEC product at all** [[21shares](https://www.21shares.com/en-eu/product)] `high` (negative finding). **The brief's "21Shares AZEC" could not be confirmed and should not be asserted.**
- **No 19b-4 filing was located for any Zcash product.** The Grayscale route appears to run on generic listing standards plus S-3 effectiveness rather than a bespoke rule change — consistent with the 8-K's "certain regulatory approvals" phrasing, but **not confirmed.** `low`
- Coincodex reports an SEC investigation (subject unspecified) closed **15 Jan 2026** with no enforcement recommended [[coincodex](https://coincodex.com/article/87367/zcash-etf/)] `low`.

### 4.3 Bottom line

**As of 22 August 2026 no Zcash ETF has launched anywhere.** Grayscale's ZCSH is the sole US vehicle with a concrete, filing-backed listing date — **on or about 25 August 2026 on NYSE Arca** — and that date is explicitly conditional. This filing is the direct cause of the current price spike (§5.4).

---

## 5. Price action and market structure

### 5.1 Verified price series (CoinGecko API, daily)

| Date | Close |
|---|---|
| 2025-08-26 | **$39.75** (52-wk low) |
| 2025-09-01 | $40.57 |
| 2025-10-01 | $74.11 |
| 2025-10-15 | $247.97 |
| 2025-11-01 | $404.76 |
| **2025-11-07 18:00** | **$723.43 (cycle high, hourly)** |
| 2025-11-15 | $608.20 |
| 2025-12-01 | $428.76 |
| 2026-01-01 | $511.13 |
| 2026-02-01 | $302.82 |
| 2026-03-01 | $220.33 (cycle trough) |
| 2026-04-01 | $247.43 |
| 2026-05-01 | $350.46 |
| 2026-05-28 | $541.26 |
| 2026-06-03 | $608.64 |
| **2026-06-04** | **$620.93** |
| **2026-06-05** | **$459.17** |
| **2026-06-06** | **$389.99** |
| 2026-07-01 | $399.32 |
| 2026-07-27 | $508.58 |
| **2026-07-28 (Ironwood)** | **$477.77** |
| 2026-08-01 | $458.62 |
| 2026-08-20 | $565.40 |
| 2026-08-21 | $568.03 |
| **2026-08-22** | **$784.00** |

`high` — direct API pull, 366 daily points.

### 5.2 The Q4 2025 rally

**The brief's framing is confirmed and if anything understated.** ZEC ran from **$39.75 (26 Aug 2025)** to **$723.43 (7 Nov 2025)** — **+1,720% in ~10 weeks**. Cryptobriefing describes a *"more than 1,400% gain from lows"* [[cryptobriefing](https://cryptobriefing.com/zcash-surges-42-percent-past-800-grayscale-etf/)] `med`.

**Date conflict on the cycle high:** BitMEX says **17 Nov 2025, $723** [[bitmex](https://www.bitmex.com/blog/zec-crash-2026)]; the CoinGecko hourly series puts $723.43 at **7 Nov 2025 18:00 UTC**. Prices agree to within a dollar; the dates differ by ten days. **Prefer 7 Nov (direct data), note BitMEX's 17 Nov.**

**Coin Metrics (18 Nov 2025)** argued the rally had genuine fundamentals: shielded supply rose from 11% to 30% of supply over 2025 and *"began rising well before the rally, supported by faster proofs, better wallet UX"* — crediting Orchard (2022), Zashi (2024) and NEAR Intents. But it also found growth was *"driven primarily by shielding/deshielding activity rather than fully private transfers,"* with fully shielded transfers *"a small share"* of activity [[coinmetrics](https://coinmetrics.substack.com/p/state-of-the-network-issue-338)] `high`. **That caveat is central to §6.**

### 5.3 ATH and drawdowns

- **Nominal all-time high: $3,191.93 on 28 October 2016** — launch day, on near-zero float. Current price is 75.6% below it [[coingecko](https://www.coingecko.com/en/coins/zcash)] `high`. This figure is an artefact and should be labelled as such.
- **Modern cycle high: $723.43 (7 Nov 2025)** `high`
- **All-time low: $16.08, 4 July 2024** `high`
- **Drawdowns:** Nov 2025 high → Mar 2026 trough ($220.33) = **−69.5%**. June exploit crash = **−37.2%** on daily closes, up to ~**−50–60%** intraday. `high/med`

### 5.4 Current state — 22 August 2026

| Metric | Value | Source |
|---|---|---|
| Price | **$784.00** / $791.53 / $820.65 | CoinGecko / Blockchair / CoinDesk `high` |
| 24h change | **+23.2% to +39.6%** | Blockchair / CoinDesk `high` |
| 7-day change | **+60.4%** | CoinGecko `med` |
| Market cap | **$13.34B – $13.81B** (rank #12) | CoinGecko / Blockchair / CoinDesk `high` |
| 24h volume | **$2.41B – $3.77B** (rank #6) | CoinGecko / CoinDesk `high` |
| Circulating supply | **16.83M – 16.89M ZEC** | CoinGecko / CoinDesk `high` |
| Block height | **3,456,854** @ 14:58:01 UTC | Blockchair `high` |
| Hashrate | ~24.7–25.1 GH/s | Blockchair / CoinDesk `high` |
| Nodes | 978 | Blockchair `med` |
| Futures open interest | **$1.66B** | [coinglass](https://www.coinglass.com/currencies/ZEC) `med` |
| 24h futures liquidations | **$66.76M** | coinglass `med` |
| Intraday peak reported | **$805.52** | [cryptobriefing](https://cryptobriefing.com/zcash-surges-42-percent-past-800-grayscale-etf/) `med` |

**Driver: the Grayscale NYSE Arca uplisting 8-K of 21 August (§4.1).** Cryptobriefing's read — *"not price discovery, it is compression of weeks of sentiment into hours"* — and its note that ZEC's 30%+ single-day gains are frequently followed by similar corrections within days, are worth quoting `med`.

Precedent: a **Multicoin Capital** disclosure in May 2026 sparked a 30%+ single-day rally [[cryptobriefing](https://cryptobriefing.com/zcash-surges-42-percent-past-800-grayscale-etf/)] `med`; BitMEX refers to a "$540–$560 Multicoin squeeze zone" `med`. Multicoin's position was first disclosed **February 2026** per TechLeaks24 `low`.

### 5.5 Exchange composition — the inorganic-volume question

CoinGecko lists **82 ZEC ticker pairs across 48 venues**, totalling **~$2.53B** in 24h converted volume. Top venues:

| Rank | Venue | Pair | 24h USD volume | Share |
|---|---|---|---|---|
| 1 | **Bitrue** | ZEC/USDC | **$528.6M** | 20.9% |
| 2 | **Binance** | ZEC/USDT | $526.2M | 20.8% |
| 3 | Coinbase Exchange | ZEC/USD | $262.1M | 10.4% |
| 4 | **Toobit** | ZEC/USDT | $163.8M | 6.5% |
| 5 | **Poloniex** | ZEC/USDT | $118.9M | 4.7% |
| 6 | KuCoin | ZEC/USDT | $90.9M | 3.6% |
| 7 | OKX | ZEC/USDT | $90.9M | 3.6% |
| 8 | Kraken | ZEC/USD | $88.6M | 3.5% |
| 9 | Gemini | ZEC/USD | $82.5M | 3.3% |
| 10 | XT.COM | ZEC/USDT | $76.5M | 3.0% |

Source: CoinGecko `/coins/zcash/tickers` API, 22 Aug 2026 `high`.

**Findings ZECReveal can use:**
1. **The single largest ZEC market on earth is Bitrue's ZEC/USDC pair (~21%), narrowly exceeding Binance's flagship ZEC/USDT.** Bitrue is a second-tier venue. That is anomalous and is the classic signature of incentivised or wash volume. **This is a red flag, not proof** — no independent wash-trading study of ZEC was located (§8). `high` for the data, `low` for the interpretation.
2. **Only ~46.3% of reported ZEC volume comes from tier-1 venues** (Binance, Coinbase, Kraken, Gemini, OKX, Bitget, Gate). Toobit, Poloniex, Niza.io, Hibt, WEEX, BitDelta, Vindax and similar make up a large tail. `high` (computed)
3. **Major listings confirmed active:** Binance (USDT/USDC/BTC), Coinbase, Kraken, Gemini, OKX, Bitget, Gate, KuCoin, HTX, Bitfinex, Crypto.com absent from top-25, Binance US present. **No delisting of ZEC by a tier-1 venue was found for 2025–26.** Binance ran a delisting *vote* including ZEC in April 2025 and ZEC survived it [[mitrade](https://www.mitrade.com/insights/news/live-news/article-3-761018-20250415)] `low`.
4. **Korean exchange dominance: NOT SUPPORTED — and the opposite is true.** **Zero KRW pairs and zero Korean venues (Upbit, Bithumb, Coinone, Korbit, Gopax) appear anywhere in the 82-ticker set.** `high` (negative finding). Korean exchanges delisted privacy coins years ago and ZEC is not traded there. The 21 Aug 2026 Upbit volume story that surfaces in searches [[theblock](https://www.theblock.co/news/markets/2026-08-21-upbit-trading-volume-spikes-412435)] is about Bitcoin, not ZEC. **The brief's premise here is wrong and should be corrected on the site.**
5. **Funding rates and per-exchange OI could not be retrieved** — Coinglass renders them client-side (§8).

### 5.6 Exchange operational events

- Deposits and withdrawals were **paused across major exchanges** ahead of the NU6.2 mainnet upgrade [[cryptobriefing](https://cryptobriefing.com/zcash-paused-nu6-2-mainnet-upgrade/)] `med`
- The **>4-hour chain halt on 3 June 2026** (last block 05:27 UTC) froze deposits on major exchanges; some explorers showed wrong data because they were on un-upgraded nodes. ZODL promised a full post-mortem [[bitcoinfoundation](https://bitcoinfoundation.org/news/blockchain-news/zcash-blockchain-outage/)], [[coincentral](https://coincentral.com/zcash-block-halt-freezes-deposits-on-major-exchanges/)] `med`. **Whether that post-mortem was published could not be confirmed** (§8).
- Infrastructure operators migrated zcashd → Z3 in the run-up to 18 July `high`

---

## 6. Shielded pool statistics

### 6.1 Live pool balances

From CipherScan's Ironwood tracker at **block #3,456,227** (≈22 Aug 2026; chain tip was 3,456,854 at 14:58 UTC) [[cipherscan.app/ironwood](https://cipherscan.app/ironwood)] `med`:

| Pool | ZEC | % of supply |
|---|---|---|
| **Transparent** | **12,500,223** | **74.0%** |
| **Ironwood** | 3,129,287 | 18.5% |
| **Orchard** (exit-only) | 708,841 | 4.2% |
| **Sapling** | 529,015 | 3.1% |
| **Sprout** | 22,621 | 0.1% |
| **Total shielded** | **4,389,764** | **25.9%** |

Tracker also reports **80.6% of Orchard migrated**, ~5,603 ZEC/hour migration velocity, and "95.8% turnstile-verified, no inflation."

**Cross-check:** the five pools sum to **16,889,987 ZEC**, matching CoinGecko's 16.89M circulating supply to four significant figures — a strong internal consistency signal. `high` (computed)

Corroborating points: Zooko's node-verified chain supply of **16,848,458 ZEC** (80.23% of 21M) on 29 Jul [[kucoin](https://www.kucoin.com/blog/es-zcash-ironwood-upgrade-zec-supply-verification)] `med`; Phemex's dashboard reading of **4,361,120 ZEC shielded / 25.85%** on 10 Aug 03:21 UTC [[phemex](https://phemex.com/blogs/zcash-shielded-pool-1-billion-ironwood-upgrade)] `med` — within 0.7% of CipherScan twelve days later.

### 6.2 Migration trajectory

| Date | Ironwood balance | Source |
|---|---|---|
| 2026-07-28 (activation) | 0 ZEC | [coindesk](https://www.coindesk.com/tech/2026/07/28/zcash-seals-usd1-7-billion-shielded-pool-as-ironwood-upgrade-activates) `med` |
| 2026-07-28 (same day) | 1,500 → 40,207 ZEC | coindesk / [theblock](https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability) `med` |
| 2026-07-29 (day 1) | ~176,000–182,000 ZEC (~$80M, ~5% of Orchard) | [coindesk](https://www.coindesk.com/tech/2026/07/29/about-usd80-million-zec-crosses-into-zcash-s-new-ironwood-pool-in-the-first-day) `med` |
| 2026-08-09 | 1,976,378 ZEC (>$1B), overtakes Orchard | [kucoin](https://www.kucoin.com/news/flash/ironwood-surpasses-orchard-as-largest-shielded-pool-on-zcash-locks-over-1-billion-in-zec) `low` |
| 2026-08-22 | 3,129,287 ZEC | cipherscan `med` |

Orchard held ~**3.66M ZEC (~$1.7B)** when it was sealed `med`.

### 6.3 The shielding trend

| Period | Shielded % of supply | Source |
|---|---|---|
| Early 2024 | 8% | [crypto.news](https://crypto.news/why-30-of-zcash-supply-is-now-in-the-shielded-pool/) `med` |
| Start of 2025 | 11% | [coinmetrics](https://coinmetrics.substack.com/p/state-of-the-network-issue-338) `high` |
| Oct 2025 | 18% | crypto.news `med` |
| Nov 2025 | 23% → 30% | crypto.news / coinmetrics `med` |
| May 2026 | 30% (Sprout 25,591; Sapling 635,812; Orchard 4.2M) | crypto.news `med` |
| **Aug 2026** | **25.9%** | cipherscan `med` |

**The shielded share has fallen from ~30% (May 2026) to ~25.9% (Aug 2026)** — a net de-shielding of roughly 4 points across the exploit and the forced migration. Whether this is exploit-driven flight, migration friction, or profit-taking into the rally is **not established**. Flagging the decline is defensible; attributing a cause is not. `med` for the numbers, `low` for any causal reading.

### 6.4 Transactions: shielded vs transparent — the marketing gap

This is where ZECReveal's thesis has the strongest verified support.

- **Peak shielded transaction adoption: 59.3%, February 2026 all-time high** [[crypto.news](https://crypto.news/why-30-of-zcash-supply-is-now-in-the-shielded-pool/)], [[bingx](https://bingx.com/en/news/post/zcash-privacy-push-shielded-transactions-reach-and-post-quantum-plans-expand)] `med`
- **Public transactions: ~8,500/day, flat** `med`
- **Coin Metrics' crucial caveat:** the growth was *"driven primarily by shielding/deshielding activity rather than fully private transfers"*, and **fully shielded transfers "remain a small share" of total activity** [[coinmetrics](https://coinmetrics.substack.com/p/state-of-the-network-issue-338)] `high`

**Why this matters.** A "shielded transaction" in the headline metric includes **t→z shields and z→t deshields** — transactions with a *transparent leg*, where the amount is public and one endpoint is a visible address. Those are exactly the transactions a chain-analysis firm can work with. A **fully shielded z→z transfer** is the only genuinely private case, and by the industry's own most rigorous public measurement it is a small minority.

**The load-bearing fact: 74.0% of all ZEC sits in transparent addresses** (§6.1) — fully public, fully traceable, indistinguishable from Bitcoin in privacy terms. `med`

**"Encrypted Bitcoin" is therefore accurate for at most about a quarter of the supply and a minority of transfers.** A no-precedent-needed formulation for the site: *by Zcash's own on-chain data, three quarters of ZEC is as transparent as Bitcoin, and the privacy that exists is opt-in, unevenly used, and — for the last four years in the Orchard pool — was resting on an unsound circuit.*

Additional structural leakage worth noting: **ZIP 318 makes every Orchard→Ironwood crossing amount public on-chain** (§2.7) `high`. The entire migration is a publicly-quantified event.

### 6.5 Shielded-by-default push

Confirmed only in general terms: Zashi/Zodl shipped unified addresses in 2024 and is credited with driving shielded adoption [[coinmetrics](https://coinmetrics.substack.com/p/state-of-the-network-issue-338)] `med`. **No specific "shielded by default" campaign, date or policy document was located** (§8).

---

## 7. Other 2025–2026 protocol and governance events

### 7.1 The ECC → ZODL rupture (the biggest untold governance story)

- **January 2026:** the **entire ECC engineering and product team resigned** after a governance clash with **Bootstrap**, ECC's nonprofit parent board. ZEC fell ~14% on the news [[coindesk](https://www.coindesk.com/tech/2026/01/08/zcash-developer-team-behind-ecc-quits-after-governance-clash-with-bootstrap-board)], [[theblock](https://www.theblock.co/post/384737/zcash-developers-form-new-company)] `high`
- **9 March 2026:** the departed team, led by former ECC CEO **Josh Swihart**, announced **ZODL (Zcash Open Development Lab)** with **>$25M seed** from **Paradigm, a16z crypto, Winklevoss Capital, Coinbase Ventures, Cypherpunk Technologies, Chapter One, Balaji Srinivasan** and angels [[coindesk](https://www.coindesk.com/business/2026/03/09/josh-swihart-s-zcash-open-development-lab-raises-usd25-million-in-seed-funding)] `high`
- **ECC remains under Bootstrap but appears dormant: its blog's most recent post is "Zashi 2.4.9 Is Faster!" dated 4 December 2025, with nothing on the Orchard vulnerability, NU6.2, NU6.3 or Ironwood** [[electriccoin.co/blog](https://electriccoin.co/blog/)] `high` (negative finding — a striking silence from the company that created Zcash, through the worst crisis in its history)
- **Zashi → Zodl** wallet rebrand `med`
- **Concentration risk:** ZODL engineers produced **82% of merged protocol and wallet changes** for Ironwood (§2.4) `med`. Zcash's core development is now controlled by a <1-year-old VC-backed company whose investors also hold ZEC.

### 7.2 NU6.1 and coinholder funding

- **NU6.1: ZIP 255 (Final), mainnet height 3,146,400, testnet 3,536,500** [[ZIP 255](https://zips.z.cash/zip-0255)] `high`. Deployed **ZIP 271** (Deferred Dev Fund Lockbox Disbursement) and **ZIP 1016** `high`. **The brief's "Nov 2025" timing is consistent** with ZIP 1016's stated activation trigger (expiry of the ZCG stream in November 2025) `med` — **the precise activation date was not independently confirmed** (§8).
- **ZIP 1016 "Community and Coinholder Funding Model"**, author **Josh Swihart**, status **Proposed** [[ZIP 1016](https://zips.z.cash/zip-1016)] `high`:
  - **8% of block rewards → Zcash Community Grants**
  - **12% of block rewards → a coinholder-directed fund**
  - Existing Deferred Dev Fund Lockbox seeds the Coinholder-Controlled Fund
  - **Quarterly coinholder votes**; approval needs **≥420,000 ZEC (2% of total supply)** voting in favour plus simple majority
  - **Key-Holder Organizations can veto** grants on legal or principled grounds
  - Runs until the **third halving (Nov 2028)**
  - **Governance critique available:** the ZIP that hands 12% of issuance to coinholder votes was authored by the person who then left ECC and founded the VC-funded entity now writing 82% of the code. Stating the sequence is fair; alleging intent is not. `high` for facts.

### 7.3 Zcash Community Grants

- **Still operating** as of 22 Aug 2026 — accepting applications, meeting minutes published through **17 Aug 2026** [[zcashcommunitygrants.org](https://zcashcommunitygrants.org/)], [[forum](https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-8-17-2026/57119)] `high`
- Five-person elected committee; funded from the Major Grants slice of the Dev Fund via ZIPs 1014/1015/1016, **through the third halving (Nov 2028)**; ~100,000 ZEC in resources (valued ~$11M at $110/ZEC when written — that same 100k ZEC is worth **~$79M** at today's $790) `med`
- **The bug bounty programme had closed days before Hornby's discovery**, forcing the $1.5M award through retroactive grants [[forum](https://forum.zcashcommunity.com/t/taylor-hornby-bonus-grant-for-orchard-counterfeiting-vulnerability-bug-bounty/57025)] `med`. **A protocol securing $13B had no live bug bounty at the moment its worst bug was found.** That is a legitimate, sourced criticism.
- **No specific ZCG scandal or dissolution was found** — reports of "ZCG closing" refer to the bug bounty, not the grants programme. `high` (correction of a plausible misreading)

### 7.4 NU7, ZSA, Tachyon, Crosslink

**NU7 (planned, post-Ironwood).** Note the roadmap **shifted**: as of 22 May 2026 NU7 was billed as Tachyon + FROST v3 + *Orchard* Quantum Recoverability targeting a "300% speed boost" [[crypto.news](https://crypto.news/zcash-upgrade-trio-targets-300pecnt-speed-boost-in-nu7/)] `med`, and Zebra 5.1.1 (12 Jun 2026) still referenced "NU7 expected late July 2026" `med`. **Quantum recoverability was pulled forward into NU6.3 and renamed Ironwood; what remains in NU7 is Tachyon, ZSA and the sustainability mechanism.** `med` (inference from dated sources)

Draft NU7-candidate ZIPs [[zips.z.cash](https://zips.z.cash/)] `high`:
- **ZIP 226** Transfer and Burn of Zcash Shielded Assets — Draft
- **ZIP 227** Issuance of Zcash Shielded Assets — Draft
- **ZIP 228** Asset Swaps for ZSAs — Draft
- **ZIP 218** 25-second Block Target Spacing — Draft (from 75s)
- **ZIP 231** Memo Bundles — Draft
- **ZIP 233/234/235** Network Sustainability Mechanism (fee burning, issuance smoothing, remove 60% of fees from circulation) — Draft
- **ZIP 2002** Explicit Fees, **ZIP 2003** Disallow v4 transactions — Draft
- **ZIP 230** "Version 6 Transaction Format" — **Withdrawn** (superseded by ZIP 229)

**ZSA** is built with **QEDIT** [[qed-it.com/zsa-hub](https://qed-it.com/zsa-hub/)] `med`. **No NU7 activation height or date exists.** `high`

**Project Tachyon** (Sean Bowe) [[tachyon.z.cash](https://tachyon.z.cash/overview/)], [[seanbowe.com](https://seanbowe.com/blog/tachyon-scaling-zcash-oblivious-synchronization/)] `high`:
- **Proof-Carrying Data (PCD)** — continual proof compression across steps, letting block producers aggregate shielded transactions without user coordination
- **Oblivious synchronization** — a remote service proves your funds are unspent while *"never learn[ing] your actual nullifiers"*, via periodic unlinkable nullifier evolution
- Preserves ledger indistinguishability and backward compatibility with existing cryptography and hardware wallets
- Decouples the wallet payment protocol from the on-chain shielded protocol, removing quantum-vulnerable privacy assumptions from the chain layer
- **Status: "a proposed Zcash upgrade actively developed by community members."** No activation target. `high`
- >90% support in ZCAP/coinholder polling for Tachyon and quantum recoverability as NU7 priorities `med`

**Crosslink (Shielded Labs)** — hybrid PoW/PoS bringing transaction finality and staking incentives, notable for its "Bounded Availability" finality notion. **No 2026 status update, ZIP number, or timeline was found.** Appears to have been **deprioritised** while Shielded Labs handled the Orchard crisis. `low`

### 7.5 Halving

- **Second halving: 23 November 2024, block 2,726,400**, reward 3.125 → **1.5625 ZEC** `med`
- **Third halving: ~November 2028, block 4,406,400**, → 0.78125 ZEC `med`
- **Interval: 1,680,000 blocks** (set by Blossom, Dec 2019, when block time went 150s → 75s) `med`
- Source: [[coindataflow](https://coindataflow.com/en/zcash-halving-countdown)]. Note ZIP 218 would cut block time to 25s, which would require another interval adjustment. Nov 2028 also bounds the Dev Fund and ZIP 1016 (§7.2–7.3) — **a single cliff date for emissions and all protocol funding.**

### 7.6 Cross-chain

- **NEAR Intents** — swap native ETH, BTC, SOL, USDC, USDT and 100+ assets across 30+ chains into native ZEC, no CEX. Credited by Coin Metrics as a genuine driver of shielded adoption [[coinmetrics](https://coinmetrics.substack.com/p/state-of-the-network-issue-338)], [[NEAR on X](https://x.com/NEARProtocol/status/2052030080394703230)] `med`
- **THORChain** — added native ZEC swaps in phased rollout [[cryptonews.net](https://cryptonews.net/news/defi/32758544/)] `low`; a **THORChain integration delay** was reported alongside the Orchard bug news [[coinpaprika](https://coinpaprika.com/news/ai-audit-finds-zcash-orchard-bug-thorchain/)] `low`
- **SwapKit** — Zcash cross-chain swap integration [[swapkit.dev](https://swapkit.dev/blog/swapkit-zcash-integration/)] `low`
- **Maya Protocol** — **not confirmed**; no source located `low`
- **Zcash on Solana / zZEC** — **Zorion**, a bidirectional Solana↔Zcash bridge minting **zZEC** as an SPL token 1:1. Currently **MVP** with a "threshold-secured federation" posting signed attestations, plus proof-of-reserves; Phase 2 plans ZK proof verification on Solana. GitHub attributed to "jesse473." **No launch date, no TVL, no institutional backing** [[zorion.network](https://zorion.network/)] `low`. **This is a small, early, trusted-federation project — do not describe it as a major integration.**

---

## 8. What could NOT be verified

Listed explicitly, per the brief's instruction.

1. **Taylor Hornby's own technical write-up.** No post about the Orchard bug exists on defuse.ca or the ZecSec index (newest entry: January 2024) [[defuse.ca/zecsec.htm](https://defuse.ca/zecsec.htm)]. If a write-up exists it is elsewhere and was not located.
2. **Any Anthropic statement, blog post, or spokesperson comment** on the Zcash discovery. Decrypt notes involvement was limited to the model being the tool used.
3. **The "Mythos" model.** Named as an Anthropic model by Shielded Labs and Cointribune; Cryptobriefing describes it as a collaborator alongside Opus 4.8. Product identity unresolved.
4. **A CVE for the 2026 Orchard bug.** ZODL said none was assigned; none found. **No GitHub Security Advisory exists in `zcash/halo2`.**
5. **ZIP 2006's substantive text** — status "Reserved," consensus rules unpublished at zips.z.cash. The rule sealing a $1.7B pool has no public spec.
6. **21Shares "AZEC" or any European Zcash ETP.** 21Shares' product page contains no ZEC product. The brief's premise appears incorrect.
7. **Bitwise, VanEck, Canary Zcash ETF filings.** Bitwise's Jan 2026 filing is reported by one low-tier source only and was not verified on EDGAR. No 19b-4 located for any Zcash product.
8. **Korean exchange dominance — actively contradicted.** Zero KRW pairs and zero Korean venues in CoinGecko's 82-ticker ZEC set.
9. **Any published wash-trading or inorganic-volume study of ZEC.** The Bitrue anomaly (§5.5) is my own computation from ticker data, not a cited analysis.
10. **Per-exchange funding rates and OI breakdown** — Coinglass renders these client-side; only aggregate OI ($1.66B) and 24h liquidations ($66.76M) were retrievable.
11. **The promised post-mortem for the 3 June 2026 chain halt.** Committed to by the team; publication not confirmed.
12. **NU6.1's exact activation date.** Height 3,146,400 is confirmed from ZIP 255; the calendar date was not independently confirmed. z.cash/upgrade/nu6-1/ returned empty on repeated fetches.
13. **Maya Protocol ZEC integration.**
14. **Any "shielded by default" campaign** as a named initiative with dates.
15. **Whether Hornby's $1.5M grant was actually approved and paid** — status was "Ready For Vote" on 14 Aug 2026.
16. **Grayscale's ZCSH holdings after 30 June 2026.** The 393,522.33 ZEC figure is from the Q2 10-Q; the "$260M+" figure is secondary.
17. **Whether ZCSH actually listed on NYSE Arca.** The 8-K says "on or about August 25, 2026" — that is **three days after this dossier's date**. It had not happened as of 22 Aug 2026.
18. **The exact June 5 crash low.** Sources give $250 (The Block), $309 (BitMEX), $389.99 (CoinGecko daily close). Cite the range.
19. **The cycle-high date.** CoinGecko hourly: 7 Nov 2025. BitMEX: 17 Nov 2025.
20. **Cypherpunk Technologies' ZEC treasury holdings.** Appears as a ZODL investor and is referenced as a NASDAQ-listed entity in a Benzinga opinion piece; holdings not verified. Search budget was exhausted before this could be pursued.

---

## 9. Editorial notes for ZECReveal

Claims that are **verified and defensible**:
- 74% of ZEC supply is transparent; only ~25.9% shielded — with a citable, internally-consistent breakdown
- Fully shielded z→z transfers are a minority of "shielded" activity, per Coin Metrics
- A four-year soundness hole in the Orchard circuit, fixed 48 hours before the public was told
- Exploitation is cryptographically unprovable — stated by Shielded Labs in those words
- A $13B protocol had no live bug bounty when its worst bug was found
- ECC has published nothing since 4 December 2025; its entire dev team left in January 2026
- One VC-backed company under a year old wrote 82% of the Ironwood changes
- The turnstile makes every migration amount public — auditability bought with privacy
- ZIP 2006, which seals the Orchard pool, has no published specification text

Claims to **avoid or heavily caveat**:
- "Counterfeit ZEC was detected" — **nobody has ever claimed this**
- "Supply was inflated" — ZIP 209 makes aggregate inflation consensus-impossible; the real risk is intra-pool theft
- "Korean exchanges dominate ZEC" — **false**
- "21Shares has a Zcash ETP" — **unverified, likely false**
- "The Zcash ETF launched" — it had not, as of 22 Aug 2026
- Any claim that the fast Ironwood migration implies an exploiter exiting — Orchard is exit-only, so everyone must move

---

## Sources

**Primary — protocol specifications (zips.z.cash)**
- ZIP 209, Prohibit Out-of-Range Chain Value Pool Balances — https://zips.z.cash/zip-0209
- ZIP 255, Deployment of the NU6.1 Network Upgrade — https://zips.z.cash/zip-0255
- ZIP 257, Deployment of the Orchard Temporary Vulnerability Mitigation and NU6.2 Network Upgrade — https://zips.z.cash/zip-0257
- ZIP 258, Deployment of the NU6.3 Network Upgrade — https://zips.z.cash/zip-0258
- ZIP 318, Orchard to Ironwood Migration — https://zips.z.cash/zip-0318
- ZIP 1016, Community and Coinholder Funding Model — https://zips.z.cash/zip-1016
- ZIP 2005, Ironwood Quantum Recoverability — https://zips.z.cash/zip-2005
- ZIP 2006, Restricting Transfers into the Orchard Pool — https://zips.z.cash/zip-2006
- ZIP index — https://zips.z.cash/

**Primary — SEC EDGAR**
- Grayscale Zcash Trust submissions (CIK 0001720265) — https://data.sec.gov/submissions/CIK0001720265.json
- 8-K, 21 Aug 2026 (NYSE Arca listing, name change) — https://www.sec.gov/Archives/edgar/data/1720265/000119312526361075/zcsh-20260821.htm
- S-3/A Amendment 5, 21 Aug 2026 — https://www.sec.gov/Archives/edgar/data/1720265/000119312526361067/zec_s-3_amendment_5.htm
- 10-Q Q2 2026, 4 Aug 2026 — https://www.sec.gov/Archives/edgar/data/1720265/000172026526000006/zcsh-20260630.htm

**Primary — organisations**
- Shielded Labs, The Orchard Counterfeiting Vulnerability — https://shieldedlabs.net/the-orchard-counterfeiting-vulnerability/
- Shielded Labs, Four Questions About the Orchard Vulnerability — https://shieldedlabs.net/four-questions-about-the-orchard-vulnerability/
- Shielded Labs, Ironwood — https://shieldedlabs.net/ironwood/
- ZODL, Orchard Vulnerability Successfully Remediated — https://zodl.com/orchard-vulnerability-successfully-remediated
- ZODL, Ironwood: A New Shielded Pool for Zcash — https://zodl.com/ironwood-a-new-shielded-pool-for-zcash/
- Zcash Foundation, Zebra 4.5.3 and 5.0.0 — https://zfnd.org/zebra-4-5-3-and-5-0-0-emergency-soft-fork-and-nu6-2-activation/
- Zcash Foundation, Zebra 6.0.0 Release — https://zfnd.org/zebra-6-0-0-release/
- ECC, Zcash Counterfeiting Vulnerability Successfully Remediated (2019) — https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/
- ECC, Turnstile Enforcement Against Counterfeiting — https://electriccoin.co/blog/turnstile-enforcement-against-counterfeiting/
- ECC blog index (dormant since Dec 2025) — https://electriccoin.co/blog/
- Project Tachyon, Overview — https://tachyon.z.cash/overview/
- Project Tachyon, Detecting Counterfeiting after Zcash's Ironwood — https://tachyon.z.cash/blog/detecting-counterfeiting-in-zcash/
- Sean Bowe, Tachyon: Scaling Zcash with Oblivious Synchronization — https://seanbowe.com/blog/tachyon-scaling-zcash-oblivious-synchronization/
- zcashd Book, End of Life — https://zcash.github.io/zcash/user/end-of-life.html
- Zcash Community Grants — https://zcashcommunitygrants.org/
- QEDIT ZSA Hub — https://qed-it.com/zsa-hub/
- zcash/halo2 security advisories (empty) — https://github.com/zcash/halo2/security/advisories
- ZecSec / defuse.ca (no Orchard post) — https://defuse.ca/zecsec.htm

**Primary — community forum**
- Zebra 4.5.3 / 5.0.0 thread — https://forum.zcashcommunity.com/t/zebra-4-5-3-and-5-0-0-emergency-soft-fork-and-nu6-2-activation/55981
- Ironwood is Here! Updated Wallets, Libraries — https://forum.zcashcommunity.com/t/ironwood-is-here-updated-wallets-libraries-july-30/56557
- Taylor Hornby bonus grant — https://forum.zcashcommunity.com/t/taylor-hornby-bonus-grant-for-orchard-counterfeiting-vulnerability-bug-bounty/57025
- ZF Engineering Update 27 Jul – 9 Aug 2026 — https://forum.zcashcommunity.com/t/zf-engineering-update-27th-july-to-9th-august-2026/56966
- ZCG minutes 17 Aug 2026 — https://forum.zcashcommunity.com/t/zcash-community-grants-meeting-minutes-8-17-2026/57119

**Technical analysis**
- BlockSec, Zcash Orchard Soundness Bug Analysis — https://blocksec.com/blog/web3-security-zcash-orchard-soundness-bug-analysis
- Blockstream, What the Zcash Orchard Bug Reveals About Verifiable Supply — https://blog.blockstream.com/what-the-zcash-orchard-bug-reveals-about-verifiable-supply/
- Bitquery, A Bug Could Have Printed Unlimited Zcash For Four Years. Did Anyone? — https://bitquery.io/blog/was-zcash-counterfeited-orchard-bug
- Coin Metrics, State of the Network #338 — https://coinmetrics.substack.com/p/state-of-the-network-issue-338
- Charles Guillemet (Ledger CTO) thread — https://x.com/P3b7_/status/2062807526463205876

**News**
- The Block, Zcash selloff extends past 50% — https://www.theblock.co/post/403791/zcash-selloff-extends-past-50-amid-bug-disclosure-as-liquidations-top-100-million
- The Block, Zcash activates Ironwood upgrade — https://www.theblock.co/post/409934/zcash-ironwood-upgrade-launching-new-shielded-pool-after-orchard-vulnerability
- The Block, Grayscale moves closer to launching first Zcash ETF — https://www.theblock.co/news/regulation/2026-08-21-grayscale-moves-closer-launching-first-zcash-etf-in-us-sec-amended-filing-412517
- The Block, Grayscale Zcash Trust ETF (ZCSH) tracker — https://www.theblock.co/other-etf-live-chart/380611/grayscale-zcash-trust-etf-zcsh
- The Block, Zcash developers quit, form new company — https://www.theblock.co/post/384737/zcash-developers-form-new-company
- CoinDesk, Arthur Hayes dumps zcash holdings — https://www.coindesk.com/markets/2026/06/05/arthur-hayes-dumps-zcash-holdings-after-orchard-pool-vulnerability-revealed
- CoinDesk, Zcash plummets 38% as Shielded Labs reveals a major bug — https://www.coindesk.com/markets/2026/06/05/zcash-plummets-30-as-developer-reveals-a-major-bug-that-went-undetected-for-four-years
- CoinDesk, Zcash seals $1.7B shielded pool as Ironwood activates — https://www.coindesk.com/tech/2026/07/28/zcash-seals-usd1-7-billion-shielded-pool-as-ironwood-upgrade-activates
- CoinDesk, About $80M ZEC crosses into Ironwood in first day — https://www.coindesk.com/tech/2026/07/29/about-usd80-million-zec-crosses-into-zcash-s-new-ironwood-pool-in-the-first-day
- CoinDesk, ZODL raises $25M seed — https://www.coindesk.com/business/2026/03/09/josh-swihart-s-zcash-open-development-lab-raises-usd25-million-in-seed-funding
- CoinDesk, Zcash developer team behind ECC quits — https://www.coindesk.com/tech/2026/01/08/zcash-developer-team-behind-ecc-quits-after-governance-clash-with-bootstrap-board
- Unchained, AI-Assisted Audit Uncovers Critical Zcash Orchard Vulnerability — https://unchainedcrypto.com/ai-assisted-audit-uncovers-critical-zcash-orchard-vulnerability-that-could-have-minted-unlimited-counterfeit-zec/
- Decrypt, Frontier AI Models Can Find Crypto's Biggest Bugs — https://decrypt.co/370232/frontier-ai-models-find-crypto-bugs-industry-isnt-ready
- Decrypt, ZEC Crashes 38% as Zcash Discloses 'Critical Counterfeiting Vulnerability' — https://decrypt.co/370105/zec-crashes-38-as-zcash-discloses-critical-counterfeiting-vulnerability
- Cryptobriefing, Grayscale files fifth SEC amendment — https://cryptobriefing.com/zcash-zcash-etf-sec-filing/
- Cryptobriefing, Zcash surges 42% past $800 — https://cryptobriefing.com/zcash-surges-42-percent-past-800-grayscale-etf/
- Cryptobriefing, Zcash audit by Anthropic finds no serious bugs — https://cryptobriefing.com/zcash-anthropic-audit-no-serious-bugs/
- Cryptobriefing, Zcash deposits and withdrawals paused ahead of NU6.2 — https://cryptobriefing.com/zcash-paused-nu6-2-mainnet-upgrade/
- crypto.news, Zcash Ironwood upgrade: What's changed after the Orchard bug? — https://crypto.news/zcash-ironwood-upgrade-whats-changed-after-the-orchard-bug/
- crypto.news, Why 30% of Zcash supply is now in the shielded pool — https://crypto.news/why-30-of-zcash-supply-is-now-in-the-shielded-pool/
- crypto.news, Zcash upgrade trio targets 300% speed boost via NU7 — https://crypto.news/zcash-upgrade-trio-targets-300pecnt-speed-boost-in-nu7/
- BitMEX Blog, Why Zcash Crashed Nearly 50% in 48 Hours — https://www.bitmex.com/blog/zec-crash-2026
- Cointribune, Anthropic's Claude Mythos detects no major flaw — https://www.cointribune.com/en/zcash-anthropics-claude-mythos-detects-no-major-flaw-after-requested-audit/
- Crypto Times, Zcash Activates Ironwood NU6.3 — https://www.cryptotimes.io/2026/07/28/zcash-activates-ironwood-nu6-3-to-boost-shielded-security-zec-slides/
- Bitcoin Foundation, Zcash Blockchain Down for Over 4 Hours — https://bitcoinfoundation.org/news/blockchain-news/zcash-blockchain-outage/
- CoinCentral, Zcash Block Halt Freezes Deposits — https://coincentral.com/zcash-block-halt-freezes-deposits-on-major-exchanges/
- KuCoin, Ironwood surpasses Orchard — https://www.kucoin.com/news/flash/ironwood-surpasses-orchard-as-largest-shielded-pool-on-zcash-locks-over-1-billion-in-zec
- KuCoin, Zooko says ZEC supply is verifiable — https://www.kucoin.com/blog/es-zcash-ironwood-upgrade-zec-supply-verification
- Phemex, Zcash Shielded Pool Tops $1 Billion — https://phemex.com/blogs/zcash-shielded-pool-1-billion-ironwood-upgrade
- Coincodex, When Is the First Zcash ETF Launching in the U.S.? — https://coincodex.com/article/87367/zcash-etf/
- BeInCrypto, Researcher Who Found Zcash Bug Adds Monero to Audit Queue — https://beincrypto.com/researcher-zcash-bug-monero-audit/
- Daily Hodl, Bitwise files for Zcash and 10 other altcoin ETFs — https://dailyhodl.com/2026/01/02/crypto-giant-bitwise-files-for-zcash-aave-sui-and-eight-additional-altcoin-etfs-with-sec/

**Market data**
- CoinGecko ZEC — https://www.coingecko.com/en/coins/zcash
- CoinGecko API: `/coins/zcash/market_chart` (365d daily), `/coins/zcash/market_chart/range` (hourly), `/coins/zcash/tickers`
- Blockchair Zcash stats API — https://api.blockchair.com/zcash/stats
- CoinDesk ZEC price page — https://www.coindesk.com/price/zcash
- Coinglass ZEC derivatives — https://www.coinglass.com/currencies/ZEC
- CipherScan Ironwood migration tracker — https://cipherscan.app/ironwood
- StockTitan ZCSH filings summaries — https://www.stocktitan.net/sec-filings/ZCSH/

**Critical / adversarial (labelled)**
- TechLeaks24, Why Zcash Should Be Considered Fraudulent (speculative) — https://techleaks24.substack.com/p/why-zcash-should-be-considered-fraudulent
- KuCoin, ZachXBT accuses Arthur Hayes of using followers as exit liquidity (allegation) — https://www.kucoin.com/blog/zachxbt-accuses-arthur-hayes-exit-liquidity
- Zorion Solana↔Zcash bridge (early MVP) — https://zorion.network/
