# ZECReveal — Research Dossier, August 2026 (site-ready synthesis)

**Compiled:** Saturday, 22 August 2026 · **Method:** three parallel research passes (~300 searches, ~240 primary/secondary fetches), then an independent spot-verification of the load-bearing claims against primary sources (ZIP 257, ZIP 258, Shielded Labs disclosure, GHSA-ww9q-8r59-xv46, SEC 8-K of 21 Aug 2026, Cypherpunk Q2 2026 results, CoinDesk 8 Jan 2026, ZODL disclosures, zcashd EOL page, Bankless 26 Jan 2026). Raw dossiers with full source lists: `research/01-contemporary-zcash.md`, `research/02-promotion-network.md`, `research/03-history-exploits-governance.md`.
**Confidence:** `high` = primary source or ≥2 independent secondaries · `med` = one reputable secondary · `low` = single weak source / inference. Anything in §G is **not** publishable as fact.

---

## A. The ten facts the site stands on (all `high` unless marked)

1. **Two unsound-circuit windows, ~6 of ~9.8 years.** Sprout/BCTV14 (CVE-2019-7167): live 28 Oct 2016 → 28 Oct 2018. Orchard/halo2 (CVE-2026-54496, CVSS 9.3): live 31 May 2022 → 1–2 Jun 2026. Neither can be retroactively cleared; both remedies are turnstiles that only resolve when the pool empties — and Sprout (~22–25k ZEC) has **never** emptied in eight years.
2. **The Orchard bug was one missing constraint.** `halo2_gadgets/src/ecc/chip/mul/incomplete.rs` L309–310 used `assign_advice()` where `copy_advice()` was required; the double-and-add loop's base was never tied to the real base point. Found by **Taylor Hornby** (engaged by Shielded Labs in April 2026) on **29 May 2026, 23:53**, with **Anthropic's Claude Opus 4.8** (released 28 May). He built a working exploit in regtest that "generated unlimited, undetectable counterfeit ZEC" (Shielded Labs, quoted by The Block).
3. **Patched before told.** Soft fork at height **3,363,426** (~02:00 UTC 2 Jun) set `nActionsOrchard = 0` network-wide; **NU6.2** at **3,364,600** (3 Jun) shipped the fixed circuit; public disclosure **4 Jun**; GHSA/CVE **15 Jun**. In 2019 the gap between fix and disclosure was 341 days; in 2026 it was ~48 hours — a real improvement, and still an information asymmetry window.
4. **Unprovable, officially.** Shielded Labs: *"there is no definitive way to determine using only cryptography whether such exploitation occurred."* ZODL: "no evidence that the vulnerability was exploited" — which is not evidence of no exploitation; inside a shielded pool the absence of evidence is structural. Arthur Hayes exited his entire position on 5 Jun because it could not be "cryptographically proven impossible".
5. **ZIP 209 capped the damage to theft, not inflation.** Aggregate supply could not exceed what entered the pool; forged notes would instead have consumed *other users'* legitimate Orchard ZEC. "Unlimited counterfeit" and "supply was safe" are both true at different layers.
6. **Ironwood (NU6.3, height 3,428,143, 28 Jul 2026)** is a new pool with the *same* Pallas/Halo 2 cryptography and the fixed, formally-verified circuit, v6 transactions (ZIP 229), quantum-recoverable notes (ZIP 2005, *not* quantum security), and **Orchard made exit-only** (ZIP 2006 — whose substantive text is still unpublished, status "Reserved"). Migration (ZIP 318) **reveals every crossing amount on-chain**, quantised to n×10^k; dust under 0.01 ZEC is stranded forever.
7. **Three quarters of ZEC is as transparent as Bitcoin.** 22 Aug 2026 (CipherScan, block 3,456,227): transparent **12,500,223 ZEC (74.0%)**, Ironwood 3,129,287, Orchard 708,841 (exit-only), Sapling 529,015, Sprout 22,621 → shielded **25.9%** (ZECStats reads 26.8%; cite as ~26–27%). Coin Metrics: shielded growth was "driven primarily by shielding/deshielding activity", fully shielded z→z transfers "remain a small share". Peak shielded-transaction share 59.3% (Feb 2026).
8. **zcashd is dead; Zebra is alone.** zcashd auto-halted at 3,417,100 on 18 Jul 2026 (ten days before NU6.3); `zcash/zcash` archived 19 Jul. Zebra published **41 advisories in five months (12 Critical)**, including Critical consensus fixes that had to be re-fixed. No advisory exists in `zcash/orchard` or `zcash/halo2`, the repos containing the defective line.
9. **Governance ruptured in January 2026.** The entire ECC engineering/product team resigned on 7–8 Jan 2026 (Swihart: "constructively discharged", "malicious governance"; Bootstrap: protecting "mission-owned assets from private capture"); ZEC −14%. The team became **ZODL**, raised **>$25M** (Paradigm, a16z crypto, Winklevoss Capital, Coinbase Ventures, **Cypherpunk Technologies**, Chapter One, Balaji Srinivasan) on 9 Mar 2026 and wrote **~82%** of the Ironwood changes. ECC's blog has been silent since 4 Dec 2025. The bug bounty had closed days before Hornby's find; his $750k→$1.5M award went through retroactive grants.
10. **The promotion lattice is documented and undisclosed at the point of speech.** Winklevoss Capital seeded Cypherpunk ($58.888M, 12 Nov 2025) → Cypherpunk holds **323,394.38 ZEC (~1.92%)** at $341.83 avg (30 Jun 10-Q), targets 5%, invested $5M in ZODL, and bought an ~18%-of-hashrate mining fleet **from Winklevoss affiliates for $33.33M in equity** (18 Aug 2026) → Zooko Wilcox (Shielded Labs CPO) and Josh Swihart (ZODL) are **paid Cypherpunk advisors** → Gemini lists ZEC and issues a ZEC rewards card → the Winklevosses donated 3,221 ZEC to Shielded Labs. Zooko on Bankless, 26 Jan 2026: *"encrypted Bitcoin is the winning meme because it's only two words."*

---

## B. BEWARE — the exploit ledger (site content)

| ID | Name | Discovered → Disclosed → Fixed | Discoverer | Root cause | Detectable? | Window | Conf. |
|---|---|---|---|---|---|---|---|
| **B1** | **Sprout counterfeiting — BCTV14 soundness** (CVE-2019-7167) | 1 Mar 2018 → 5 Feb 2019 (341 days) → 28 Oct 2018 (Sapling, block 419,200, silently) | Ariel Gabizon (ECC); confirmed by Sean Bowe | BCTV14 key generation emitted extra "bypass" elements letting a cheating prover skip a consistency check → unlimited counterfeit shielded value | **No** — only via the Sprout turnstile when the pool empties; it never has (~22.6k ZEC remain) | 28 Oct 2016 → 28 Oct 2018 | high |
| **B2** | **Orchard Action circuit soundness** (CVE-2026-54496, CVSS 9.3) | 29 May 2026 23:53 → 4 Jun 2026 (GHSA 15 Jun) → soft fork 2 Jun (3,363,426), NU6.2 3 Jun (3,364,600) | Taylor Hornby + Claude Opus 4.8 (Shielded Labs engagement) | `assign_advice()` instead of `copy_advice()` for the base point in the incomplete double-and-add loop (`q_mul_2` kept the base constant but never bound it) → `pk_d = [ivk]·g_d` unenforced → forged nullifier keys, repeat spends, forged spend auths | **No** — forged nullifiers are indistinguishable from real ones; turnstile bounds aggregate outflow only | 31 May 2022 → 1 Jun 2026 (4 years, 1 day) | high |
| **B3** | **PING & REJECT remote side-channels** (CVE-2019-17048, CVE-2019-16930) | 2019 → 24 Sep 2019 → zcashd 2.0.7-3 | Tramèr, Boneh, Paterson (USENIX Security 2020) | Wallet trial-decryption inline with the network thread (timing oracle); unhandled exception drops the P2P connection → learn whether a node owns a shielded address; map z-addr → IP | **No** — traffic looks ordinary | Launch → Sep 2019 (Sprout + Sapling) | high |
| **B4** | **Sandblasting spam** ("Sapling Woodchipper", realised) | ~mid-Jun 2022 → public Oct 2022 → ZIP 317 (default Apr 2023); spam stopped ~Nov 2023 | unknown attacker | Flat 1,000-zatoshi fee regardless of size → ~1,100-output txs for ≈$10/day; chain ~30 GB → >100 GB; light wallets took ~12 months to recover | Yes (visible) | Jun 2022 → Nov 2023 | high |
| **B5** | **zcashd skipped Sprout proof verification for 5.7 years** | 23 Mar 2026 → 31 Mar 2026 → zcashd 6.12.0 | Alex "Scalar" Sol (AI-assisted) | `CBlock::fChecked` cache set on the first pass → `CheckBlock` returned early → Sprout proofs never verified (v3.1.0, 28 Jul 2020 → v6.11.x) | Partially — Zebra verified correctly, so exploitation would have forked the chain | Jul 2020 → Mar 2026 | high |
| **B6** | **Turnstile accounting bypass via duplicate block header** | 4 Apr 2026 → 17 Apr 2026 → zcashd 6.12.1 | Alex "Scalar" Sol | `SetChainPoolValues` called in `AcceptBlock` before the already-seen-header check → a duplicate header silently reset pool balances to `nullopt`, disabling turnstile enforcement | Unclear | zcashd v5.0.0 → v6.12.0 | high |
| **B7** | Orchard node crash via identity `rk`; identity-`epk` consensus gap; signed overflow in pool-balance accounting (three of the four Apr 2026 bugs) | 4 Apr → 17 Apr 2026 → zcashd 6.12.1 / Zebra 4.3.1 | Alex "Scalar" Sol | Panics on identity-point randomized key; zcashd failed to enforce `epk ≠ identity`; C++ UB on crafted blocks | Yes (crash / fork) | as above | high |
| **B8** | **Viewing-key leak via memo "Reply-To"** | Jul 2021 → 13 Jul 2021 → wallet updates | Nighthawk team | Wallets pasted the **full viewing key** (`zxview…`) into memos → recipients gained permanent read access to the sender's whole history; irrevocable on an immutable chain | Victim-only | ECC iOS ref wallet 0.3.7-105 / Nighthawk 1.9+ | high |
| **B9** | **Linkability research** — Quesnelle 2017 (31.5% of shielded coins in round-trips, 96% within 2h); Kappos et al. USENIX 2018 (anonymity set −69.1%; 0.3% of txs z→z; Founders' Reward withdrawals = exact 250.0001 ZEC, 1,943/1,953 also timing-matched); Biryukov & Feher 2019 (95.5% of txs potentially linkable via mining) | 2017–2019 | academia | Usage, not cryptography: round-trips, fixed amounts, mining-pool patterns | n/a | ongoing | high |
| **B10** | **The 2026 advisory wave** — 41 Zebra advisories in 5 months (12 Critical; sigop fix re-fixed twice; SIGHASH_SINGLE re-fixed), 9 zcashd advisories published after the code was archived | Mar–Aug 2026 | various | consensus divergence, DoS, chain-stall classes | yes | 2026 | high |
| **B11** | **ViaBTC 53% hashrate** | 15 Sep 2023 | Coinbase (response: 110 confirmations, limit-only) | single-pool majority | yes | Sep 2023 | high |
| **B12** | **Ledger drops v1 tx support** — pre-2018 ZEC unspendable on Ledger | 15–16 Nov 2025 → partial fix ~Jul 2026 | users | vendor removed support | yes | Nov 2025 → 2026 | med |
| **B13** | Pre-launch trio (26 Apr 2016): **InternalH collision** (Hornby — counterfeiting via 2^64 birthday attack), **Faerie Gold** (Zooko), proof error (Hopwood) | pre-launch | ECC | commitment scheme / nullifier trick / PRF assumption | never live | — | high |
| **B14** | **Trusted setups still load-bearing** — 2016 six-party Ceremony (Zooko, Miller, Van Valkenburgh, Hinch, Todd, **Snowden** as "John Dobbertin"); 2018 Powers of Tau (~90 parties) | 2016 / 2018 | — | 1-of-N honesty; Sprout's ~22k ZEC still sit under the 2016 parameters | n/a | ongoing | high |

Two detail panels the Beware page should carry verbatim (both `high`): ZF, 5 Feb 2019 — *"it's impossible to know if it's been exploited… until Sprout addresses are deprecated"*; Schneier, Jun 2026 — *"there's no way of knowing if anyone exploited the vulnerability to steal money."*

---

## C. CONTRADICTIONS — marketing vs. chain (site content)

| # | Claim | Reality | Conf. |
|---|---|---|---|
| C1 | "Encrypted Bitcoin" / "encrypted electronic cash" (z.cash tagline) | ~74% of supply sits in transparent addresses; 3.6% was shielded when Kappos measured (2018), 7.4% in 2021, ~26–27% today; z→z transfers are a small share of "shielded" activity | high |
| C2 | "Nobody can counterfeit ZEC / the 21M cap is math" | Two unlimited-counterfeiting windows (~6 years), neither provable clean; zcashd skipped Sprout proofs for 5.7 years; the turnstile itself was bypassable until Apr 2026 | high |
| C3 | "No trusted setup" | True for Orchard/Ironwood; Sprout (~22k ZEC) and Sapling (~529k ZEC) still rest on the 2016/2018 ceremonies; the Sprout audit can never conclude while the pool holds coins | high |
| C4 | "Decentralized" | 20% of every block for four years to a for-profit and 46 named stakeholders; then two orgs' addresses in consensus; then a 78,750-ZEC disbursement to a 2-of-3 multisig (ZF/ECC/Shielded Labs, `t3ev37…wYo`); trademark under a two-party veto | high |
| C5 | "Privacy is normal / shielded by default" | Gemini is the only exchange with shielded withdrawals (ECC's own Nov 2025 claim); Zcash designed TEX / "Traceable Unified Addresses" specifically to satisfy Binance in 2024; exchange ZEC lives in t-addrs | high |
| C6 | "Audited by leading firms" | 2018 audits ran while four ECC insiders sat on the live counterfeiting bug; 2022 NCC/QEDIT/Maller audits missed a one-line under-constraint that an LLM found in a day | high |
| C7 | "Responsible disclosure" | 2019: 341 days, four people, ZF told one day before the public, fix disguised as a performance upgrade, MPC transcript pulled offline; 2026: 6 days, but no advisory in `zcash/orchard` or `zcash/halo2` | high |
| C8 | "Community governance" | Jan 2026 mass resignation; `ecc-zbloc` governance ZIP marked Obsolete; ZIP 1016 (12% of issuance to coinholder votes) authored by the person who then founded the VC-funded lab writing 82% of the code | high |
| C9 | "Supply is verifiable" | Created 28 Jul 2026, prospective only; ~708,841 ZEC still in un-verifiable Orchard; Ironwood "95.8% turnstile-verified", not 100% | med (live) |
| C10 | "Encrypted money with provable correctness is unstoppable" (C. Winklevoss, 5 Jun 2026) | Posted the day ZEC fell >50% on four years of unprovable correctness | high |
| C11 | "Institutional privacy product" (the ETF) | Grayscale's trust/ETF custodies ZEC transparently at Coinbase Custody; shareholders get price exposure, not privacy; 2.5% sponsor fee | high |
| C12 | "Two independent implementations protect consensus" | zcashd killed 18 Jul 2026; single implementation entering NU6.3 after the densest Critical-advisory run in the project's history; Zakura is a Zebra fork | high/med |
| C13 | "Neutral founder" | Zooko: Founders' Reward 0.9% of supply (2,033 ZEC/month 2016–20), Shielded Labs CPO, paid Cypherpunk advisor, co-author of the June disclosure | high |
| C14 | "Independent advocates" | Naval Ravikant: 2015 ECC co-investor ($715k with Silbert/Ver) and founding ZF board member; Barry Silbert: seed investor, Grayscale chairman, sold Trust shares 6 Nov 2025 near the top, predicted 500x in Feb 2026 | high/med |
| C15 | "First regulated exchange with shielded withdrawals" | Claimed by Gemini in Sep 2020 and again via ECC in Nov 2025 — both cannot be firsts | high |
| C16 | "Founders' Reward ≠ premine" | It was the single most legible fingerprint on the chain: every withdrawal 250.0001 ZEC, 99.5% timing-matched (Kappos) | high |

---

## D. TIMELINE (site content — abridged; the full ~110-row table is in `research/03`, Part C)

| Date | Event | Cat. |
|---|---|---|
| 2013 · May 2014 | Zerocoin (Green, Miers, Garman) · Zerocash paper (Ben-Sasson, Chiesa, Garman, Green, Miers, Tromer, Virza) | LAUNCH |
| 2015 | Zerocoin Electric Coin Company founded; Zooko Wilcox CEO; Naval Ravikant among early investors | LAUNCH/FUND |
| 26 Apr 2016 | Pre-launch bugs disclosed: InternalH (Hornby), Faerie Gold (Zooko), proof error (Hopwood) | EXPLOIT |
| 23 Sep 2016 | $2M from 17 investors at $32M post (Roger Ver, DCG/Silbert, Fred Ehrsam, Fenbushi, ShapeShift/Voorhees, Li Xiaolai, Vlad Zamfir…); Founders' Reward = 10% of monetary base (5.72% founders/employees, 1.65% investors, 1.19% reserve, 1.44% ZF) | FUND |
| 23 Oct 2016 | The Ceremony (six parties incl. Snowden as "John Dobbertin") | LAUNCH |
| 28 Oct 2016 | Mainnet; Poloniex prints 1 ZEC ≈ 3,300 BTC intraday; CoinGecko ATH $3,191.93 (artefact) | LAUNCH/MARKET |
| 14 Feb 2017 | Zcash Foundation incorporated (board: Miller, Van Valkenburgh, Green, **Naval**) | GOV |
| 4 Dec 2017 | Quesnelle: 31.5% round-trip linkability | EXPLOIT |
| 1 Mar 2018 | Gabizon finds BCTV14 counterfeiting bug; kept to four people | EXPLOIT |
| 27 Mar 2018 | 2018 audits announced (26 days after the bug was found and withheld) | GOV |
| 13 Apr 2018 | Powers of Tau completes (~90 parties) | TECH |
| Apr–Jun 2018 | Japan FSA pressure; Coincheck delists ZEC | REG |
| 1 Jul 2018 | Zooko's FR: 2,033 ZEC/month ≈ $3.65M/yr (0.9% of supply) | FUND |
| Aug 2018 | Kappos et al. (USENIX) | EXPLOIT |
| 28 Oct 2018 | Sapling (419,200) silently fixes CVE-2019-7167 | TECH/EXPLOIT |
| 4–5 Feb 2019 | ZF told; public disclosure next day | EXPLOIT |
| Feb–May 2019 | Zcash Co → ECC; ZIP 209 turnstile shipped (v2.0.5) | GOV/TECH |
| 24 Sep 2019 | PING/REJECT fixed (2.0.7-3) | EXPLOIT |
| 20/30 Sep 2019 | Upbit delists ZEC (not a hack); OKEx Korea earlier | REG |
| 6–7 Nov 2019 | Trademark donated to ZF — two-party veto | GOV |
| 10 Nov 2019 | ZIP 1014 dev fund (35% ECC / 25% ZF / 40% Major Grants of the 20%) | FUND |
| 28 Jul 2020 | zcashd v3.1.0 introduces the Sprout-verification bypass (unnoticed until 2026) | EXPLOIT |
| 31 Jul 2020 | Josh Cincinnati resigns as ZF ED: "mutual trust was irreparably lost" | LEAD |
| 29 Sep 2020 | Gemini: shielded (Sapling) withdrawals — "first" | REG |
| 18 Nov 2020 | Canopy; first halving; FR ends; dev fund 8/7/5 | FUND/TECH |
| 2020 | ECC becomes a subsidiary of Bootstrap (501(c)(3)) | GOV |
| 13 Jul 2021 | Viewing-key leak (Nighthawk/ECC wallets) | EXPLOIT |
| Apr 2022 | Snowden revealed as Ceremony participant | GOV |
| 31 May 2022 | NU5 (1,687,104): Orchard, Halo 2 — CVE-2026-54496 goes live | TECH/EXPLOIT |
| Jun 2022 → Nov 2023 | Sandblasting | EXPLOIT |
| Dec 2022 | Shielded Labs founded (Jason McGee, Swiss association) | GOV |
| 31 Aug 2023 | SEC probe of ZF opens (SF-04569) | REG |
| 15 Sep 2023 | ViaBTC 53% hashrate | EXPLOIT |
| 18 Dec 2023 | Zooko steps down as ECC CEO; Josh Swihart CEO | LEAD |
| 12 Jan 2024 | Binance monitoring tag; TEX addresses proposed to avoid delisting | REG |
| 28 Mar 2024 | Zashi launches | TECH |
| 4 Jul 2024 | ATL $16.08 | MARKET |
| 5 Jul 2024 | Zooko leaves Bootstrap ED role/board | LEAD |
| 8 Aug 2024 | Forbes: "zombie blockchain", 9% shielded | MARKET |
| 3 Oct 2024 | Sean Bowe leaves ECC | LEAD |
| 23 Nov 2024 | NU6 (2,726,400) = second halving; ZIP 1015: 8% ZCG + 12% lockbox | FUND/TECH |
| 19 Feb 2025 | ZIP 1016 (Swihart) + ZIP 271 (78,750 ZEC to 2-of-3 multisig) | FUND/GOV |
| 4 Mar 2025 | Jack Gavigan steps down as ZF ED; Alex Bornstein (interim; permanent 1 Nov 2025) | LEAD |
| Apr 2025 | Project Tachyon (Bowe) | TECH |
| 26 Aug 2025 | 52-week low $39.75 | MARKET |
| ~1 Oct 2025 | Naval: ZEC as "insurance against Bitcoin" | NET |
| 18 Oct 2025 | Coinbase Institutional research (hedged) | NET |
| 24–26 Oct 2025 | Mert Mumtaz "fastest horse"; Arthur Hayes "$10k ZEC" → +30% in 24h | NET/MARKET |
| 3 Nov 2025 | CoinDesk Research "Encrypted Money at Planetary Scale" — **sponsored by "GenZcash"** (identity unknown) | NET |
| 4 Nov 2025 | Galaxy report: "encrypted Bitcoin", "spiritual successor" | NET |
| 6 Nov 2025 | Barry Silbert sells 9,753 Grayscale Zcash Trust shares (~$544/ZEC) | NET |
| 7 Nov 2025 | Cycle high $723.43 (CoinGecko hourly; BitMEX says 17 Nov) | MARKET |
| 10 Nov 2025 | Gemini enables Orchard withdrawals | REG |
| 12 Nov 2025 | **Cypherpunk Technologies** launches ($58.888M, Winklevoss Capital); 203,775 ZEC @ $245.37; Tyler: "If bitcoin is digital gold, Zcash is digital cash", "encrypted bitcoin" | NET/MARKET |
| ~Nov 2025 | NU6.1 (3,146,400): ZIP 271 + ZIP 1016 (date unverified) | FUND/TECH |
| 18 Nov · 30 Dec 2025 | Cypherpunk +29,869 @ ~$603 · +56,418 @ $514.02 | NET |
| 26 Nov 2025 | Grayscale files S-3 to convert the Zcash Trust | MARKET |
| 1 Dec 2025 | Bootstrap restructuring announced (trigger of the rupture) | GOV |
| 9 / 19 Dec 2025 | Zooko, then Swihart, become paid Cypherpunk advisors | NET |
| 7–8 Jan 2026 | **Entire ECC team resigns**; ZEC −14% | GOV/LEAD |
| 15 Jan 2026 | SEC closes ZF probe, no action | REG |
| 21 Jan 2026 | Winklevosses donate 3,221 ZEC to Shielded Labs | NET |
| 26 Jan 2026 | Zooko on Bankless: "encrypted Bitcoin is the winning meme" | NET |
| 29 Jan 2026 | Gemini Credit Card: Zcash Edition | NET |
| 16–17 Feb 2026 | Zashi → Zodl | GOV |
| 1 Mar 2026 | Cycle trough $220.33 | MARKET |
| 4 Mar 2026 | Nasdaq deficiency notice to CYPH (<$1) | NET |
| 9 Mar 2026 | **ZODL** raises >$25M (incl. $5M from Cypherpunk) | FUND/GOV |
| 23–31 Mar 2026 | Sprout-verification bypass disclosed/fixed | EXPLOIT |
| Apr 2026 | Hornby engaged by Shielded Labs | GOV |
| 4–17 Apr 2026 | Four-bug disclosure incl. turnstile bypass | EXPLOIT |
| 6 May 2026 | Multicoin discloses position → +30% | NET/MARKET |
| 28 May 2026 | Claude Opus 4.8 released | — |
| 29 May 2026 23:53 | **Orchard soundness bug found** | EXPLOIT |
| 2 Jun 2026 | Soft fork 3,363,426 — Orchard switched off | TECH |
| 3 Jun 2026 | NU6.2 3,364,600; >4h chain halt afterwards | TECH |
| 4–6 Jun 2026 | Disclosure; ZEC $620.93 → $389.99 daily closes (intraday $250–309); $116M liquidations; Hayes exits; Cypherpunk "Please stop the FUD" | EXPLOIT/MARKET |
| 12–15 Jun 2026 | Blockstream critique; Anthropic follow-up audit ("Mythos", reported) finds no further serious bugs; CVE published | — |
| 10 Jul 2026 | Zebra 6.0.0 | TECH |
| 18–19 Jul 2026 | zcashd EOL (3,417,100); repo archived | TECH |
| 28 Jul 2026 | **NU6.3 Ironwood** (3,428,143); Orchard exit-only | TECH |
| 29 Jul 2026 | ~176k ZEC migrates on day one | TECH |
| 12 Aug 2026 | Cypherpunk Q2: 323,394.38 ZEC, $341.83 avg; Dev Ojha (Valar) advisor | NET |
| 14 Aug 2026 | McGee proposes doubling Hornby's award to $1.5M | GOV |
| 18 Aug 2026 | Cypherpunk buys ~18% of hashrate from Winklevoss affiliates for $33.33M in equity | NET |
| 21 Aug 2026 | Grayscale 8-K: ZCSH to NYSE Arca "on or about 25 Aug"; renamed "The Zcash ETF"; 2.5% fee; DCG may contribute ~200k ZEC (non-binding) | MARKET |
| 22 Aug 2026 | ZEC ≈ $784–821 (+23–40%/24h), mcap ~$13.3–13.8B, OI ~$1.66B; tip 3,456,854; shielded ~26% | MARKET |

---

## E. THE NETWORK (site content)

**E.1 Cypherpunk Technologies (Nasdaq: CYPH)** — purchase ledger: 12 Nov 2025 203,775.27 @ $245.37 · 18–19 Nov 29,869 @ ~$603 · 30 Dec 56,418.09 @ $514.02 · 12 Mar 2026 ~4,680 @ ~$428 · 15 Apr 9,163.32 @ $234.63 · Apr–Jun ~19,488 undisclosed → **323,394.38 ZEC, $110.5M cost, $341.83 avg (30 Jun 10-Q)**. Shares +223% YoY; $200M Cantor ATM; 80.8M pre-funded warrants; CEO Douglas E. Onsi & CIO Will McEvoy (Winklevoss Capital principal) each granted 1,000,000 RSUs (2 Jul 2026). Stopped press-releasing purchases 15 Apr 2026. **Correction to the standard DAT critique:** CYPH trades at a *discount* on basic shares (~0.6× at $790 ZEC) — the story is dilution into a discount, not premium extraction.

**E.2 The loop (every leg disclosed somewhere, nowhere together):** Winklevoss Capital → Cypherpunk ($58.888M) → ZEC (1.92%) + ZODL ($5M) + mining fleet bought *from* Winklevoss affiliates ($33.33M equity); Winklevoss Capital → ZODL; Winklevoss twins → Shielded Labs (3,221 ZEC); Zooko (Shielded Labs CPO) & Swihart (ZODL CEO) → paid Cypherpunk advisors; Gemini → ZEC listing, shielded withdrawals, ZEC rewards card (volume +45%). Predates the rally: Gemini/Zooko interview 7 Oct 2020.

**E.3 Other holders/vehicles:** Grayscale Zcash Trust **393,522 ZEC** (Q2 10-Q; ~$311M at $790) → "The Zcash ETF" (ZCSH, NYSE Arca, 2.5% fee, Coinbase Custody, BNY Mellon); DCG ~200,000 ZEC contribution *non-binding*; Zcash Foundation 85,412 ZEC ($36.69M liquid assets, Q1 2026); Multicoin (undisclosed size, Feb 2026); Dragonfly (undisclosed); Maelstrom/Hayes (exited 5 Jun 2026; Arkham: a $174M position lost half its value); NU6 lockbox (12% of subsidy since Nov 2024; 78,750 ZEC disbursed to the ZF/ECC/Shielded Labs multisig). Disclosed entities ≈ 4.7% of supply.

**E.4 People, with exposure:** Zooko Wilcox (FR 0.9% of supply; Shielded Labs CPO; paid CYPH advisor) · Josh Swihart (ZODL CEO; paid CYPH advisor; ZIP 1016 author; "privacy is normal" author 2020) · Tyler & Cameron Winklevoss (Gemini; Winklevoss Capital; CYPH seed; ZODL; Shielded Labs donors) · Will McEvoy (CYPH CIO, 1M RSUs; "most mispriced asset in crypto") · Naval Ravikant (2015 investor; founding ZF board; "insurance against Bitcoin") · Barry Silbert/DCG (seed investor; Grayscale; sold Trust shares 6 Nov 2025; "500x") · Arthur Hayes ("$10k ZEC" 26 Oct 2025; "Butterfly Touch" 11 May 2026; exited 5 Jun 2026; ZachXBT exit-liquidity accusation — allegation) · Mert Mumtaz ("fastest horse"; no disclosed position) · Balaji Srinivasan (ZODL investor) · Tushar Jain/Multicoin (disclosure moved price +30%) · Paul Brigner (ZODL policy chief *and* ZCG committee member) · Taylor Hornby (found both InternalH 2016 and Orchard 2026; ZF board per zfnd.org — `med`).

**E.5 Paid content:** ZCG grant book $20.5M committed / 183 grants; explicitly promotional ≈ $3.5–3.8M (Zcash Media $600k — cancelled at 6/9 milestones; ZecHub 2026 $433k; Zcash Brazil 2026 $345k; Free2Z $333k; ZK AV Club $229k; conference marketing $9k–64k; Twitter ambassador $4.5k). CoinDesk Research 3 Nov 2025 **sponsored by "GenZcash"** (unidentified). ECC "Growth & Regulatory" ≈ 31% of spend (2023). ZF community comms ≈ $31.5k/quarter.

**E.6 Phrase catalogue:** "encrypted Bitcoin" (advocates; Tyler W. 12 Nov 2025; Zooko "the winning meme" 26 Jan 2026) · "privacy is normal" (Swihart, ECC, 21 Oct 2020) · "digital gold / digital cash" (Tyler W.) · "encrypted money at planetary scale" (sponsored CoinDesk report → Messari title) · "shielded by default" (wallet-level, not protocol-level) · "ZEC to $10k" (Hayes) · "fastest horse" (Mumtaz) · "insurance against Bitcoin" (Naval; ZEC correlates positively with BTC) · "most mispriced asset in crypto" (McEvoy) · "Finding a bug isn't a security failure. Not looking is" / "Please stop the FUD" (@cypherpunk, 5 Jun 2026). **Not verified, do not publish:** "#ZecToTheMoon", "the privacy layer of the internet", "the only true private cryptocurrency".

**E.7 Inorganic signals vs. counter-evidence (publish both):** Signals — OI <$50M → ~$306M in Oct 2025 (6×), now ~$1.66B with ~$9.45B/day futures turnover against a ~$13.3B cap; single-statement +30% jumps (Hayes, Multicoin) and +20–40% on the ETF 8-K; Delphi: "nothing to do with retail"; Bitrue's ZEC/USDC (~21%) narrowly the largest market on earth (anomalous, no wash study exists); sponsored research at the inflection; rally "tied to a single exchange's product launch" (Gemini card). Counter-evidence — a decade of shipped engineering (Orchard, Zashi, NEAR Intents, Ironwood); SEC probe closed; Hayes sold and said so; Vitalik opposed Naval publicly; the $600k media grant was cancelled; ~71% drawdown Nov→Mar and −50% in June are not what a functioning manipulation looks like; ~$3.5M of grants cannot move a $13B asset — if engineered, it was by balance sheets and derivatives, not content. **Korean-exchange dominance is false** (zero KRW pairs). **No bot-network study exists.**

---

## F. Corrections to the original brief (do not publish the left column)

| Brief said | Evidence says |
|---|---|
| Korean exchanges dominate ZEC volume | Zero KRW pairs / Korean venues in the 82-ticker set; Upbit delisted ZEC in 2019 |
| 21Shares AZEC / European ZEC ETP | None found |
| Ticker ZCH | **ZCSH** (SEC 8-K and S-3/A) |
| Jack Gavigan founded Shielded Labs (2023) | Founded **Dec 2022 by Jason McGee**; Gavigan was ZF ED 2021 → Mar 2025 |
| Swihart CEO Feb 2024 | Announced **18 Dec 2023** |
| "Will Wolf" / "Douglas Moore" at Cypherpunk | **Douglas E. Onsi** (CEO), **Will McEvoy** (CIO) |
| Powers of Tau 2022 | **13 Apr 2018** (Sapling); NU5 needed no ceremony |
| Upbit 2019 ZEC hack | A **delisting**; the Nov 2019 Upbit hack was ETH |
| ECC/ZF layoffs 2023–24 | No reporting; the Jan 2026 mass resignation is a different event |
| Pantera/Novogratz seed investors | Not in ECC's 17-name list |
| "99.x% of FR withdrawals linkable" | 1,943 of 1,953 **250.0001-ZEC** withdrawals also timing-matched — use the qualifier |
| Bot networks pumping ZEC | No study located — unverified |

## G. Unverified — keep off the site (or label explicitly)

Hornby's own write-up (none on defuse.ca); any Anthropic statement; the "Mythos" model's product identity (reported by Shielded Labs/Cointribune/Crypto Briefing — `med`); who "GenZcash" is; whether Messari's report was sponsored; Zooko's reported $250k/month (single source); NU6.1's calendar date (height 3,146,400 confirmed; ~22–24 Nov 2025 by arithmetic); the current lockbox balance; Grayscale's post-June ZEC count; whether ZCSH actually listed on 25 Aug (three days after this dossier); the exact June-5 low ($250 / $309 / $389.99 — cite the range); the cycle-high date (7 vs 17 Nov 2025); Bitwise/VanEck/Canary ZEC ETF filings (Bitwise: one low-tier source); the 3 Jun chain-halt post-mortem; ZIP 2006's text; any ZEC-specific SEC/FINRA action (the 200-firm DAT probe does not name Cypherpunk); TechLeaks24's "exploiter exiting via migration" theory (speculation — Orchard is exit-only, everyone must move).

## H. Editorial posture (carry into the site copy)

Nothing here evidences illegality. Holding and advocating is legal; grant-funded education is legitimate when disclosed. The defensible thesis is (1) a decade-old ecosystem's core participants became simultaneously and heavily exposed to the token in a 90-day window and then advocated without disclosure at the point of speech; (2) the slogans are, by an insider's own words, memes engineered for consensus; (3) the core claims are contradicted by the chain; (4) the price is driven by balance sheets and derivatives; and (5) the ecosystem also did real work and disclosed its own worst bug in six days. Report uncertainty, not identity — about transactions *and* about people.
