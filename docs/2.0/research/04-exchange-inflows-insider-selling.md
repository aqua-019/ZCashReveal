# 04 — Exchange Inflows & "Insider Selling": What the Chain Shows vs. What Is Claimed

**Research date:** 22 August 2026
**Chain state at time of research:** Zcash block 3,456,938 (2026-08-22 16:52:51 UTC); ZEC ≈ $818.44 (Blockchair); ≈ $785–810 (ZEC Stats / CoinGecko intraday range)
**Method:** Public web sources + independent verification against the Blockchair Zcash API (`api.blockchair.com/zcash`) and SEC EDGAR (`data.sec.gov`). All on-chain figures below were pulled directly and are reproducible.

**Standing epistemic rule for this document:** every claim is split into
**(a) what the chain shows** — deterministic, reproducible from public block data;
**(b) who labelled it and how** — the named third party asserting an identity, and their method;
**(c) inference vs. fact** — explicitly separated;
**(d) confidence** — High / Medium / Low, with the reason.

**No identity in this document is asserted from public chain data alone.** Where an entity name appears next to an address, it is *someone else's label*, attributed to them, and the confidence rating reflects the strength of *their* evidence, not ours.

---

## 1. Executive summary

**1.1 — Zcash is now substantially indexed by a commercial surveillance firm, but only on the transparent side.** Arkham Intelligence launched Zcash coverage on **8 December 2025**, claiming 53% of Zcash transactions labelled, $420B of volume attributed, and 37% of balances labelled ($2.5B). Arkham's own research page concedes the boundary: shielded z→z transactions are "fully private. The only piece of data visible on-chain is the transaction fee." The launch framing was publicly criticised as misleading by Helius CEO Mert Mumtaz and — notably — by **Zooko Wilcox**, who said Arkham is "just tracking wallets that opted into public transparency." Arkham subsequently clarified that shielded transactions "are not accounted for in the 50% of Zcash transactions labeled."

**1.2 — The January 2026 "200,000 ZEC unshielded / 74,002 ZEC to Binance" story is real, but the published narrative is materially incomplete.** We reconstructed the full event from raw block data. **All of it happened on a single day — 2 January 2026 — not "the first week of January."** Three unshielding events totalling **276,077.74 ZEC** hit transparent addresses within 3h46m. Only **74,001.93 ZEC (26.8%)** was subsequently sent to the high-throughput address that Lookonchain labels "Binance." The largest tranche — **202,076.207 ZEC (~$165M today)** — went to `t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V` and **has never moved since**. It is still sitting there, untouched, 7½ months later. The press framing of the event as an exit/sell-off is not supported by the destination of 73% of the coins.

**1.3 — Roughly two-thirds of the "74,002 ZEC whale deposit to Binance" appears to be a round-trip of coins that came *out of* the same exchange address eight days earlier.** On 24–25 December 2025 the hot wallet `t1PKBiv7…` paid out 49,999.97 ZEC in three tranches to a fresh address `t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK` (this is the withdrawal Lookonchain reported on 25 Dec as "30,000 ZEC withdrawn from Binance"). On 2 January 2026 at 18:01:43 that address shielded its **entire** balance of 50,000.96 ZEC. Fifty-two minutes later, **50,000.5541 ZEC** emerged from the shielded pool. That output, plus a second 24,000.9781 ZEC unshielding, was consolidated and sent back to `t1PKBiv7…`. **Net new inflow attributable to that flow is therefore at most ~24,001 ZEC, not 74,002.** (Confidence: Medium-High — the shielded pool deliberately breaks the link; the inference rests on a 0.4059 ZEC amount delta and a 52-minute gap. See §5.3 for the full caveat.)

**1.4 — The ZIP 271 / NU6.1 lockbox disbursement has barely been touched, and what has moved is untraceable by design.** 78,750 ZEC was minted in the NU6.1 activation coinbase (block 3,146,400, 2025-11-24 19:56:42 UTC) as ten equal 7,875 ZEC outputs to the 2-of-3 P2SH multisig `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo`, whose keys are held by the **Zcash Foundation, Electric Coin Company and Shielded Labs**. As of today, **78,183.4093 ZEC (99.28%) remains unspent in that address**. Only **566.5907 ZEC (0.72%)** has net left it — and it left into *shielded outputs*, exactly as ZIP 271 mandates ("MUST spend each chunk … completely into a shielded output"). **Dev-fund disbursement is architecturally untraceable to any exchange after the first hop.** This is a design property, not a cover-up, but it means "did the dev fund sell?" is unanswerable from chain data alone.

**1.5 — Institutional custody is documented; institutional *on-chain addresses* are not.** Two custodial relationships are established from primary SEC filings: **Grayscale Zcash Trust → Coinbase Custody Trust Company, LLC** (388,673.68 ZEC as of 30 June 2026), and **Cypherpunk Technologies → Gemini Space Station** (323,394.38 ZEC). **Neither publishes on-chain addresses or proof-of-reserves for ZEC.** No public rich list applies exchange or custodian labels to any Zcash address. The largest transparent holders on-chain today are entirely unattributed in public data.

**1.6 — The one hard, disclosed, recurring institutional ZEC outflow is Grayscale's Sponsor's Fee**, paid in kind: 4,848.65 ZEC in H1 2026 and 4,883.12 ZEC in H1 2025 (≈9,700 ZEC/year, ≈$7.9M/yr at current prices), withdrawn from the Trust and transferred to the Sponsor. Filings do not say whether the Sponsor then sells it.

**1.7 — "Insider selling" allegations circulating in 2026 are not evidenced.** The most prominent (TechLeaks24, 8 Aug 2026) argues ZEC "should be considered fraudulent until proven otherwise" on the theory a VC with early AI-model access might have exploited the Orchard bug. It cites **no addresses, no transactions, and no supply audit**. ZachXBT's "exit liquidity" critique of Arthur Hayes is a conduct critique with **no ZEC on-chain evidence attached**. Barry Silbert's Form 144 sales are real and documented — but they are **ZCSH trust shares sold on OTCQX**, which move no ZEC on-chain.

**1.8 — Whale Alert does not appear to cover Zcash.** Its FAQ lists supported chains as "Bitcoin, Ethereum, Tron, Dogecoin, Algorand, Solana, Polygon, Litecoin, Cardano, Bitcoin Cash, Plasma, Tempo and Hyperliquid" — **Zcash is not among them.** Headlines reading "ZEC Whale Alert" on aggregator sites are editorial phrasing, not @whale_alert output. The real reporting accounts for ZEC flows are **Lookonchain** and **EmberCN**.

---

## 2. Dated table of large ZEC transfers

Amounts and timestamps below marked **[verified]** were pulled directly from the Blockchair Zcash API on 2026-08-22 and are reproducible. Times are UTC.

| Date / time (UTC) | Amount ZEC | From (label / conf.) | To (label / conf.) | Source | What it proves / does NOT prove |
|---|---|---|---|---|---|
| 2025-11-24 19:56:42<br>block 3,146,400 | **78,750.000** | Protocol — NU6.1 activation coinbase, lockbox value pool (**Fact**, High) | `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` — ZIP 271 2-of-3 P2SH multisig, keys held by **Zcash Foundation + ECC + Shielded Labs** (**Fact** — address is written into the ZIP spec, High) | ZIP 271 §"ZIP271DisbursementAmount"; tx `525f4402…` **[verified]** | **Proves:** the entire deferred dev-fund lockbox was disbursed in one coinbase tx as 10 × 7,875 ZEC outputs to a named, spec-published multisig. **Does not prove:** anything about intent to sell. |
| 2025-12-20 (claimed) | 202,077 | "Binance" (per aggregator) | unnamed address | blockchain.news flash news, attributing **@EmberCN** | **Unverified / date conflict.** No address was published. The only on-chain 202,07x ZEC event we can find is a **shielded-pool exit on 2026-01-02**, not a Binance withdrawal on 2025-12-20. Treat the aggregator's date and direction as unconfirmed. |
| 2025-12-24 19:32:46 | **29,999.99** | `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` — high-throughput hot wallet, labelled **"Binance"** by Lookonchain (**Label**, Medium-High) | `t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK` — fresh address (**Fact**: first activity 2025-12-24) | Lookonchain via blockchain.news; tx `f45ded5d…` **[verified]** | **Proves:** a 30,000 ZEC payout from a wallet with textbook exchange-withdrawal mechanics (input 120,552.69 → 29,999.99 out + 90,552.70 change back to itself). **Does not prove:** the wallet is Binance — that is Lookonchain's label. |
| 2025-12-25 06:20:32 | **1,999.99** | same `t1PKBiv7…` | same `t1XKfb…` | tx `b39aa107…` **[verified]** | Same cluster, not separately reported in press. |
| 2025-12-25 06:22:23 | **17,999.99** | same `t1PKBiv7…` | same `t1XKfb…` | tx `a05e75fe…` **[verified]** | Brings the total withdrawn to `t1XKfb…` to **49,999.97 ZEC**. Press reported only the first 30,000. |
| 2026-01-02 15:45:14<br>block 3,190,907 | **202,076.207** | **Shielded pool** (tx has zero transparent inputs) (**Fact**, High) | `t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V` — unattributed (**No label from any source**) | tx `e179e5b0…` **[verified]** | **Proves:** the single largest unshielding of the period. **Proves it did NOT go to an exchange:** the address has never spent; balance is still exactly 202,076.207 ZEC today. **Does not prove:** who owns it, or why. |
| 2026-01-02 18:01:43<br>block 3,191,017 | **50,000.96** | `t1XKfb…` — spends all 4 UTXOs, all originally from `t1PKBiv7…` (**Fact**, High) | **Shielded pool** (zero transparent outputs) (**Fact**, High) | tx `a79347138b88…` **[verified]** | **Proves:** coins withdrawn from the presumed-Binance wallet on 24–25 Dec were fully shielded on 2 Jan. |
| 2026-01-02 18:53:18<br>block 3,191,051 | **50,000.5541** | **Shielded pool** (**Fact**, High) | `t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e` — single-use (**Fact**, High) | tx `7ae85864…` **[verified]** | **Inference (Medium-High):** this is the 50,000.96 from 52 min earlier, minus 0.4059. **Not provable** — shielded pools are designed to prevent exactly this linkage. |
| 2026-01-02 19:31:34<br>block 3,191,091 | **24,000.9781** | **Shielded pool** (**Fact**, High) | `t1U1NE8w5KRwnxCZAaxVidW6MchFky97m4V` — single-use (**Fact**, High) | tx `6db13a92…` **[verified]** | Second unshielding tranche. Origin inside the pool is unknown. |
| 2026-01-02 20:35:38<br>block 3,191,134 | **74,001.9317** | `t1Ym8XWvN2joxENB2Nc4TVg1M9PxKfWshc5` — consolidates both tranches (**Fact**, High) | `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` — labelled **"Binance"** by Lookonchain (**Label**, Medium-High) | Lookonchain via blockchain.news / BeInCrypto / Yahoo; tx `ba078381…` **[verified]** | **Proves:** 74,001.93 ZEC entered a major exchange hot wallet. **Does not prove:** it was sold; and ~50,000 of it plausibly originated *from that same wallet* 8 days earlier (§5.3). Press reported "74,002 ZEC" and dated it 3 or 5 Jan — on-chain it is **2 Jan**. |
| 2026-01-02 22:36:40 | 1,293.9321 | ~20+ small addresses (**Fact**) | `t1PKBiv7…` (**Label**: Binance, Medium-High) | tx `ad6a3c3d…` **[verified]** | **Behavioural evidence:** classic many-to-one exchange deposit sweep. Supports "this is an exchange hot wallet" independently of any third-party label. |
| 2026-02-03 23:09:40<br>block 3,227,947 | **7,875.000** | ZIP 271 multisig `t3ev37Q2…` (**Fact**, High) | **Shielded pool** (zero transparent outputs) (**Fact**, High) | tx `eaedfddd…` **[verified]** | **Proves:** first and only lockbox chunk ever spent — shielded, per ZIP 271 mandate. **After this hop the funds are untraceable.** Note: Blockchair mislabels the whole 7,875 ZEC as "fee" (~$2.32M) — it is not a fee; it is shielded value. |
| 2026-02-03 23:29:23<br>block 3,227,959 | **7,438.2295** | **Shielded pool** (**Fact**, High) | back to ZIP 271 multisig `t3ev37Q2…` (**Fact**, High) | tx `1f6099a4…` **[verified]** | **Proves:** 94.5% of the shielded chunk returned to the multisig 20 min later. **Net retained/disbursed in that operation: 436.7705 ZEC.** |
| 2026-04-14 21:24:25<br>block 3,308,125 | 7,438.2295 → 7,308.4093 | ZIP 271 multisig (**Fact**) | ZIP 271 multisig, minus **129.8202 ZEC** to shielded (**Fact**) | tx `8a937240…` **[verified]** | Second, much smaller shielded disbursement. **Cumulative net out of the lockbox multisig: 566.5907 ZEC = 0.72%.** |
| 2026-06-05 | not on-chain | **Arthur Hayes / Maelstrom** — self-disclosed (**Self-disclosure**, High for the fact of sale) | unspecified venue | CoinDesk 2026-06-05 | **Proves:** Hayes said he liquidated his entire ZEC position after the Orchard vulnerability ("I had to take profit on the entire position"). **Does not prove:** venue, size, or any on-chain footprint — CoinDesk names no exchange, address or amount. |
| 2026-06-05 (reported) | $174M position | unnamed holder (**Arkham label**, Low — entity never named publicly) | unspecified | Arkham via CoinDesk 2026-06-05 | Arkham said a major investor lost >half the value of a $174M ZEC position and "hasn't sold ZEC for 6 months. Ouch." **This is a different party from Hayes.** We could not locate the original Arkham post; no entity, exchange or address was published. |

### 2.1 — Reconstructed timeline of the 2 January 2026 event (all verified on-chain)

```
2025-12-24 19:32:46   -29,999.99 ZEC   t1PKBiv7 (hot wallet) --> t1XKfb
2025-12-25 06:20:32    -1,999.99 ZEC   t1PKBiv7 (hot wallet) --> t1XKfb
2025-12-25 06:22:23   -17,999.99 ZEC   t1PKBiv7 (hot wallet) --> t1XKfb
                      ------------------------------------------------
                       49,999.97 ZEC   total withdrawn to t1XKfb

2026-01-02 15:45:14  +202,076.207 ZEC  SHIELDED POOL --> t1gGCYpy   [never moved since]
2026-01-02 18:01:43   -50,000.960 ZEC  t1XKfb --> SHIELDED POOL     [full balance shielded]
2026-01-02 18:53:18   +50,000.554 ZEC  SHIELDED POOL --> t1dP1MJw   [Δ = 0.4059, 52 min later]
2026-01-02 19:31:34   +24,000.978 ZEC  SHIELDED POOL --> t1U1NE8w
2026-01-02 20:35:38    74,001.932 ZEC  t1Ym8XWv --> t1PKBiv7 (hot wallet)
2026-01-02 22:36:40     1,293.932 ZEC  ~20 addresses --> t1PKBiv7 (deposit sweep)
```
Total unshielded on 2 Jan 2026: **276,077.739 ZEC** (~1.63% of the then-circulating supply — higher than the "1.2% / >200,000 ZEC" figure reported by BeInCrypto/Yahoo, because the press counted only the largest tranche).
Fraction reaching the presumed exchange wallet: **26.8%.** Fraction still parked and unmoved: **73.2%.**

---

## 3. Labelled / candidate institutional addresses

### 3.1 — Addresses with a documented, primary-source identity

| Address | Label | Labeller & method | Balance (2026-08-22) | Confidence |
|---|---|---|---|---|
| `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` | **ZIP 271 lockbox disbursement multisig** — 2-of-3 P2SH, keys held by Zcash Foundation, Electric Coin Company, Shielded Labs | **Zcash protocol specification** (ZIP 271), address written verbatim into consensus rules | **78,183.4093 ZEC** (received 93,496.64; spent 15,313.23) | **High** — this is the only ZEC address in existence whose owner is defined by consensus code rather than by a labelling vendor. |
| `t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8` | Same, **Testnet** | ZIP 271 | n/a | **High** |

### 3.2 — Addresses with a third-party label only (identity NOT established by chain data)

| Address | Label | Labeller & method | On-chain profile | Confidence |
|---|---|---|---|---|
| `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` | **"Binance"** | **Lookonchain** (X posts, relayed via blockchain.news, BeInCrypto, Yahoo). Methodology undisclosed. Corroborated by **two independent Lookonchain reports** — a 25 Dec 2025 withdrawal *from* it and a 2/3 Jan 2026 deposit *to* it. | 554,064,601 ZEC lifetime received across **407,365 outputs**; continuously active 2021-12-27 → **right now** (last spend 2026-08-22 16:52:51, current block); balance 74,881 ZEC; textbook change-back-to-self withdrawal pattern; many-to-one deposit sweeps | **Exchange hot wallet: High** (behaviour alone is conclusive). **Binance specifically: Medium-High** (rests entirely on Lookonchain; no exchange confirmation, no Arkham/Blockchair tag). |
| `t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V` | *(none)* — press implied "institutional accumulation" | EmberCN reportedly published a destination address for a 202,077 ZEC move; the aggregator relaying it did not print the address | Received 202,076.207 ZEC direct from shielded pool 2026-01-02 15:45; **never spent**; +1.0 ZEC test deposit 2025-12-24 | **Unattributed. Do not name an owner.** The only defensible statement: a single entity moved ~$165M of ZEC out of shielding and has held it transparently for 7½ months. |
| `t1Ym8XWvN2joxENB2Nc4TVg1M9PxKfWshc5` | "the whale" (74,002 ZEC deposit) | Lookonchain; address printed by blockchain.news — **we independently verified it is real and matches to 0.07 ZEC** (74,001.932 received) | Single-day life: 2026-01-02 18:25–22:36; zero balance now | **Address correctness: High.** **Owner: unknown.** |
| `t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK` | "newly created wallet" (30,000 ZEC withdrawal) | Lookonchain; address printed by blockchain.news — **verified real**, received 50,000.96 total | Created 2025-12-24; shielded entire balance 2026-01-02; zero now | **Address correctness: High.** **Owner: unknown.** |

### 3.3 — Largest transparent holders today (live Blockchair rich list, 2026-08-22) — **all unattributed**

| # | Address | Balance ZEC | Type | Behavioural read (inference only) |
|---|---|---|---|---|
| 1 | `t3aPMe94jMKyrgkbH5SSukimvdMFJ59EFhP` | 438,920.90 | P2SH | Active 2023-04 → 2026-08; 100 outputs, 1,319,834 received. Large, long-lived, multisig-shaped. **No public label.** |
| 2 | `t1gsBrGZGMyDGZw2icGnMpVBuEGVWip5kH8` | 400,001.01 | P2PKH | 4,650,001 ZEC lifetime across only 20 outputs — very large round-number movements. First seen 2025-11-13. **No public label.** |
| 3 | `t1cpC3SS8okUsMQwTqWgzyA1k237B3WCeco` | 386,846.32 | P2PKH | Steady accumulation since 2026-02-09; 107 outputs; still receiving (last 2026-08-13). **No public label.** |
| 4 | `t3hdTwzcVVGEqDdNKJTBfWvWyaFYNJv7KkA` | 341,937.19 | P2SH | First seen 2025-10-23; 18 outputs. **No public label.** |
| 5 | `t1Lyq3AcqVcXkBTPHgNsDYoSyRDpugdSkE7` | 230,100.45 | P2PKH | **One single receipt**, 2025-11-20, never spent. Pure cold storage. **No public label.** |
| 6 | `t1VxyLUKaK2tvj5iMRQagued6qpxPNvRkk7` | 220,000.00 | P2PKH | Round number. **No public label.** |
| 7 | `t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V` | 202,076.21 | P2PKH | The 2 Jan 2026 unshielding destination (§2.1). **No public label.** |
| … | … | … | | |
| 24 | `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` | 78,183.41 | P2SH | **ZIP 271 lockbox** — the only spec-identified address in the top 25. |
| 25 | `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` | 74,881.26 | P2PKH | Presumed Binance hot wallet (§3.2). |

> **⚠ Explicit warning against a tempting false inference.** Entry #3 (386,846.32 ZEC) sits close to Grayscale Zcash Trust's disclosed 388,673.68 ZEC, and entry #4 (341,937.19) is in the neighbourhood of Cypherpunk's 323,394.38 ZEC. **These proximities are not evidence.** Neither figure matches. More importantly, both Coinbase Custody and Gemini are omnibus custodians that commingle client assets — there is **no reason to expect any single address to equal any single client's balance**, and every reason to expect it not to. **Do not publish these as identifications.** They are listed here only so the site can pre-empt the inference if a reader raises it.

### 3.4 — What public labelling infrastructure actually exists for Zcash

| Source | Rich list? | Entity labels? | Verified state | URL |
|---|---|---|---|---|
| **Blockchair** | Yes, live & accurate | **No** — address objects carry no tag/label field for ZEC | Verified via API 2026-08-22 | blockchair.com/zcash |
| **CoinCarp** | Yes | **No** — every row "None listed" | **Badly stale.** Lists `t1RyCw14…` at 1,414,573 ZEC; actual live balance is **160,205.10 ZEC**. Rows 2 and 3 show 325,149 and 247,080 ZEC; both are **zero** on-chain. | coincarp.com/currencies/zcash/richlist/ |
| **CoinCarp "exchange wallets"** | — | Purports to | **Empty table, and it is BEP20-wrapped ZEC on BNB Chain, not native Zcash.** Not usable. | coincarp.com/currencies/zcash/exchange-wallets/ |
| **BitInfoCharts** | Yes | No labels surfaced | Table did not render for extraction | bitinfocharts.com/top-100-richest-zcash-addresses.html |
| **CipherScan** (by "Kenbak", Zcash-community grant project) | Yes (rich list feature exists; `/richlist` 404s) | Not evidenced | Offers Privacy Score, Risk Scanner, Blend Check, shielded-pool analytics | cipherscan.app |
| **ZEC Stats** | No | No | Strong network/pool data; **explicitly no exchange reserves, no entity labels** | zecstats.com |
| **Arkham** | Yes (paywalled/JS) | **Yes — the only meaningful ZEC labeller** | Public pages render only via JS; entity list not extractable without an account | intel.arkm.com / arkm.com |
| **Whale Alert** | — | — | **Zcash not in supported-chain list** | whale-alert.io/faq.html |

---

## 4. Exchange-reserve trends for ZEC

**Bottom line: there is no free, public, verifiable "ZEC exchange reserve" time series.** This is a genuine data gap and the site should say so plainly rather than reprint percentages from aggregators.

| Provider | ZEC exchange-reserve series? | What we could verify |
|---|---|---|
| **CryptoQuant** | A URL exists at `cryptoquant.com/asset/zec/chart/exchange-flows/exchange-reserve` and its page metadata describes an exchange-reserve chart | **Could not read values** — Cloudflare interstitial; API requires a key. Existence of the endpoint is suggestive but the series may be empty. |
| **Glassnode** | `distribution/balance_exchanges` exists as a metric | **ZEC coverage unconfirmed** — endpoint list requires auth (HTTP 401). |
| **CoinGlass** | Exchange-balance tracker at `/Balance` | **ZEC not present** on that page. CoinGlass ZEC coverage is derivatives/liquidations/funding only. |
| **Nansen** | Cited as the chart source in a Jan 2026 article | Not independently verifiable; Nansen ZEC coverage not documented publicly. |
| **ZEC Stats** | **No** | Confirmed — publishes pool/supply/derivatives data, explicitly no exchange reserves. |
| **IntoTheBlock** | Not found | No ZEC exchange-flow product located. |

**The one widely-circulated number, and why it should not be used:** a 27 January 2026 article (Yahoo/AMBCrypto syndication) headlined "Exchanges' ZEC Balance Falls 44%," with body text citing **Nansen** and stating "ZEC held on exchanges dropping by roughly 48% during this period," where "this period" is **the past 24 hours**. The headline says 44%, the body says 48%, no absolute ZEC figures are given, and a ~46% single-day collapse in aggregate exchange balances is not a plausible physical event. **Flag as unreliable; do not cite the percentage.**

**What *can* be said with confidence about supply distribution (verified 2026-08-22):**
- **4,530,445 ZEC (26.8% of all ZEC, ≈$3.6B) sits in shielded pools** — ZEC Stats, 2026-08-22.
- Total ZEC issued: **16,890,961** of the 21M cap (ZEC Stats). Market cap ≈ $13.8B (Blockchair).
- The single largest *identified* transparent institutional position is Grayscale's **388,673.68 ZEC** — ~2.30% of supply, consistent with the S-3/A statement of "approximately 2.3% of circulating ZEC" as of 30 June 2026.
- Because 26.8% of supply is shielded and both Gemini and Binance issue **transparent** deposit addresses (Gemini support doc: "The Zcash deposit addresses issued on the Gemini platform are transparent (t-addresses) and start with a 't'"), *exchange* balances are in principle observable — but nobody publishes the address sets needed to compute them.

**Caveat on explorer arithmetic:** Blockchair's `/zcash/stats` endpoint currently returns a **negative** `circulation` value (−4,638,503.75 ZEC). Naive UTXO accounting cannot handle shielded value pools. Treat any ZEC supply/flow figure derived from a generic multi-chain explorer with suspicion unless it is address-level transparent data.

---

## 5. Dev-fund and insider *disclosed* sales

### 5.1 — The ZIP 271 lockbox: near-total inaction, then untraceability

**(a) What the chain shows** — verified, reproducible:

| Event | Date (UTC) | Amount | Effect |
|---|---|---|---|
| Disbursement (coinbase tx `525f4402…`, block 3,146,400) | 2025-11-24 19:56:42 | **78,750.000 ZEC** in 10 × 7,875 outputs | Minted to `t3ev37Q2…` |
| Chunk 1 shielded (`eaedfddd…`) | 2026-02-03 23:09:40 | −7,875.000 | Into shielded pool |
| Partial return (`1f6099a4…`) | 2026-02-03 23:29:23 | +7,438.2295 | Back to multisig, 20 min later |
| Second shielding (`8a937240…`) | 2026-04-14 21:24:25 | −129.8202 | Into shielded pool |
| **Net removed to date** | | **566.5907 ZEC (0.72%)** | |
| **Remaining unspent** | as of 2026-08-22 | **78,183.4093 ZEC (99.28%)** | 9 of 10 chunks completely untouched |

Note the multisig has received **93,496.64 ZEC** lifetime — more than the 78,750 disbursement — because the 7,438.2295 return re-entered the same address.

**(b) Who labelled it** — the **Zcash protocol itself**. ZIP 271 names the address in consensus rules and names the key-holders: "a 2-of-3 P2SH multisig with keys held by the following 'Key-Holder Organizations': Zcash Foundation, the Electric Coin Company, and Shielded Labs."

**(c) Inference vs fact** — **Fact:** 99.28% of the lockbox is still sitting in the multisig. **Fact:** what has moved, moved into shielded outputs. **Inference:** the 436.77 ZEC net-retained in Feb and 129.82 ZEC in April are consistent with grant disbursements under ZIP 1016. **Not knowable:** whether any recipient sold. ZIP 271 *requires* shielding ("MUST spend each chunk of the one-time disbursement completely into a shielded output"), so the trail terminates by design at the first hop.

**(d) Confidence** — **High** on all on-chain facts. **Zero** on downstream destination — and this should be stated as a structural limit, not a research failure.

### 5.2 — Zcash Foundation, ECC/Bootstrap, ZCG

| Entity | Disclosed position | Disclosed *sales*? | Source |
|---|---|---|---|
| **Zcash Foundation** | Q1 2026 (as of 2026-03-31): **$36.69M liquid** — $21M ZEC, $12.6M cash, $0.506M USDC, $2.85M BTC, $25,299 ETH. Q1 expenses $817k. SEC investigation (Aug 2023 subpoena) closed with no enforcement recommended. | **Not disclosed at transaction level.** The existence of $12.6M cash against a ZEC-denominated income stream necessarily implies historical conversion, but **no amounts, dates, venues or counterparties are published.** | ZF Q1 2026 report (2026-05-20), via AMBCrypto / CryptoTimes / Yahoo. Direct PDF blocked by Cloudflare. |
| **ECC / Bootstrap** | Received **7,656 ZEC/month** from Dec 2020 to Nov 2024 (≈367,000 ZEC cumulative). Held **~112,000 ZEC and ~$806K USD** at end of Q3 2024. | **No.** Report states gains/losses recognised "at the point of a subsequent sale" but **discloses no quantities, venues or methods.** The ~255,000 ZEC gap between received and held is the implied disposal, but it is not itemised. **ECC's public transparency-report series appears to stop at Q4 2023 (published July 2024)** — no 2025 or 2026 reports are listed. | ECC Transparency Report Q3 2024 PDF; ECC blog transparency tag. |
| **Zcash Community Grants** | OpenZcash mirrors ZCG/FPF grant accounting: named recipients, USD amounts, status (e.g. QEDIT $227,500; Least Authority $186,420.24; Zingo Labs $70,400; security bounties $18,750–$225,000). | **Accounting is USD-denominated with no transaction IDs, no addresses, and no timestamps.** Grant flows cannot be tied to chain activity. | openzcash.org/zcg/disbursements |

### 5.3 — The round-trip inference, stated precisely

This is the most consequential inference in this document, so its epistemics are set out in full.

**Facts (High confidence, verified):**
1. `t1XKfb…` received exactly 49,999.97 ZEC from `t1PKBiv7…` on 24–25 Dec 2025, plus 0.99 ZEC seed = 50,000.96 total.
2. On 2026-01-02 18:01:43 it spent **all four** UTXOs (50,000.96 ZEC) into a transaction with **zero transparent outputs** — i.e. fully into the shielded pool.
3. On 2026-01-02 18:53:18 — **52 minutes later** — a transaction with **zero transparent inputs** created a single output of **50,000.5541 ZEC**.
4. Delta: **0.4059 ZEC** (0.0008% of principal).
5. That output was consolidated with a 24,000.9781 ZEC unshielding and sent to `t1PKBiv7…`.

**Inference (Medium-High):** the same party shielded and immediately unshielded ~50,000 ZEC to break the transparent link before returning it to the exchange.

**Why not higher:** Zcash's shielded pool held ~4.9M ZEC at the time. The pool is *specifically engineered* so that an output cannot be linked to an input. A coincidental near-match is not impossible.

**Why not lower:** the amount agreement to four decimal places, the 52-minute proximity, the fact that `t1XKfb…` shielded its *entire* balance and never appeared again, and the fact that the emergent value was immediately routed to the same exchange wallet the coins came from — four independent alignments.

**How the site should phrase it:** *"On-chain records show ~50,000 ZEC leaving this exchange wallet in late December, being fully shielded on 2 January, and a near-identical amount emerging from shielding 52 minutes later and returning to the same wallet. Zcash's design means these cannot be proven to be the same coins. If they are, the widely-reported '74,002 ZEC whale deposit' represents at most ~24,000 ZEC of new inflow."*

### 5.4 — Grayscale Zcash Trust: the only fully-documented recurring institutional ZEC outflow

From SEC filings (primary, verified via EDGAR):

| Date | ZEC held | Cost basis | Fair value | Event |
|---|---|---|---|---|
| 2024-12-31 | 392,723.58934327 | — | $22,040k | |
| H1 2025 | | | | +4,888.23272520 contributed; **−4,883.12100169 distributed for Sponsor's Fee** |
| 2025-06-30 | 392,728.70106678 | — | $15,324k | |
| 2025-12-31 | 393,522.33134026 | $47,911k | $200,441k | |
| H1 2026 | | | | ZEC contributed: **nil**; **−4,848.64774083 distributed for Sponsor's Fee** |
| **2026-06-30** | **388,673.68359943** | **$47,320k** | **$155,252k** | NAV/share $32.15 (vs $41.51 at 2025-12-31); 4,829,300 shares outstanding |

- **Custodian: "Coinbase Custody Trust Company, LLC (the 'Custodian') … responsible for safeguarding the ZEC … and holding the private key(s)."** Prime broker: Coinbase, Inc. Private keys "held in the Vault Balance in an offline manner."
- Q2 2026 alone: "the withdrawal of approximately **2,430 ZEC** to pay the foregoing Sponsor's Fee."
- **≈9,700 ZEC/year (~$7.9M at current prices) leaves the Trust in kind.** Whether Grayscale sells it is **not disclosed**.
- **No on-chain addresses and no proof-of-reserves are published for ZEC** in the S-3, S-3/A or 10-Q. (Grayscale publishes addresses for some Bitcoin products; it does not do so here.)

### 5.5 — DCG / Silbert: real, documented, but *share* sales — not ZEC

**Verified from SEC EDGAR (CIK 0001720265, Grayscale Zcash Trust):** **148 Form 144 filings** — 84 in 2024, 64 in 2025 — spanning 2024-01-24 to 2025-11-06. Filers identified by CIK lookup:

| Filer CIK | Name |
|---|---|
| 0001652536 | **Digital Currency Group, Inc.** |
| 0001977454 | **DCG International Investments Ltd.** |
| 0001979086 | **Silbert Family Investments LLC** |
| 0001976415 | **Silbert Barry E.** |
| 0001144385 | **Lenihan Lawrence D Jr** |

The DCG entities filed in clustered consecutive-day runs (Jan, Feb, Apr–May, Jul–Aug 2025) — the signature of a programmatic Rule 144 disposal schedule.

The two November 2025 filings, read directly from EDGAR:

| Filed | Account | Broker | Shares | Aggregate market value | Sale date | Venue | Originally acquired |
|---|---|---|---|---|---|---|---|
| 2025-11-05 | **Silbert Family Investments LLC** | Canaccord Genuity Inc. | **9,753** | **$407,312.59** | 2025-11-05 | OTCQX | 2017-10-24, purchased from issuer, cash |
| 2025-11-06 | **Silbert Barry E.** | Capital Institutional Services, Inc. | **1,000** | **$47,250.00** | 2025-11-06 | OTCQX | 2018-07-11, privately negotiated, from issuer |

**Critical framing for the site:** these are **ZCSH trust shares traded on OTCQX between investors**. They move **no ZEC on-chain**, create **no exchange inflow**, and add **no ZEC sell pressure**. Reporting them as "insider ZEC selling" would be wrong. What they *do* show is DCG-side affiliates reducing ZCSH exposure across 2024–2025.

**The juxtaposition worth noting (fact, not accusation):** the same corporate family that filed dozens of Rule 144 notices to sell ZCSH shares through 2024–2025 is now, per the **S-3/A filed 2026-08-18/19**, in discussions for **DCG International Investments Ltd.** to contribute **~200,000 ZEC** (~$110M) to that Trust in exchange for shares, ahead of a proposed NYSE Arca listing under "ZCSH." The filing is explicit that "these discussions are not binding agreements or commitments to purchase" and "the Potential Investor could determine to purchase more, fewer or no Shares."

### 5.6 — Cypherpunk Technologies

- **Holdings:** 323,394.38 ZEC (10-Q, six months ended 2026-06-30); cost basis $110.5M, weighted average **$341.83/token**; fair value $129.4M at 2026-06-30.
- **Custodian: Gemini.** Verified from the 10-Q's own risk-factor language: *"risks related to the custody of our ZEC and our reliance on **Gemini Space Station** and its affiliates for trading and custody services."* **Not** Coinbase Prime, **not** Anchorage.
- **Gemini issues transparent addresses** ("The Zcash deposit addresses issued on the Gemini platform are transparent (t-addresses) and start with a 't'") — so Cypherpunk's ZEC is in principle on transparent addresses, but **no address has been published by anyone.**
- **Mining:** 18 August 2026 — launched 4.2 GSol/s Equihash, **~18% of network hashrate**, via a $33.33M equity transaction with Winklevoss Capital. Network-wide ~43,800 ZEC/month is awarded to miners, so an 18% share implies **~7,880 ZEC/month**.
- **Sell-or-hold:** **No statement of intent to sell.** CIO Will McEvoy framed mining as providing "financial and operational flexibility to fund future growth, the acquisition of additional ZEC, and new privacy-preserving technology investments." The company states a target of **5% of ZEC supply**. Head of Mining Kevin Zhang: "Zcash mining still out-earns AI colocation and Bitcoin mining at today's ZEC prices." **Inference (Medium):** stated strategy is accumulation, not distribution — but no lock-up, covenant or public commitment prevents sales, and no ZEC-denominated production disclosure exists yet.
- Zooko Wilcox joined Cypherpunk as an **advisor** (Decrypt / Yahoo) — relevant to any "insider" framing, though advisory roles carry no disclosed ZEC compensation in the filings reviewed.

---

## 6. Allegations vs. evidence

| # | Allegation | Who | Date | Evidence actually offered | Assessment |
|---|---|---|---|---|---|
| 1 | "Zcash should be considered fraudulent and a sophisticated inflation scam until proven otherwise" — a VC with early access to Claude Opus could have found and exploited the Orchard inflation bug before Taylor Hornby disclosed it (29 May 2026) | **TechLeaks24** (Substack) | 2026-08-08 | **No blockchain data. No addresses. No transactions. No supply audit.** Relies on: circumstantial VC connections (Multicoin ↔ Jane Street ↔ "PayPal Mafia"), timing correlations, Tushar Jain's 19 May 2026 Bankless disclosure that Multicoin accumulated ZEC in Feb 2026, Orchard balance falling ~5.2M → 4.4M by mid-July, ~1.9M ZEC migrating to Ironwood in two weeks | **Speculation.** The author frames it himself as risk assessment ("I *think* ZEC *should be considered* fraudulent *until proven otherwise*"). The Orchard→Ironwood migration is the **expected, announced consequence of the Ironwood upgrade (launched 28 July 2026)**, not evidence of exploitation. **Do not repeat as fact.** Report as an allegation and note the absent evidence. |
| 2 | Zcash supply is manipulated / inflated | Various, post-Orchard | 2026 | — | **Rejected by Zooko Wilcox.** Joint statement with Shielded Labs' Jason McGee (15 June 2026): *"We believe prior exploitation is unlikely and therefore that legitimate Orchard funds are recoverable and the current supply of Zcash is sound […] However, users cannot currently verify that the Zcash supply is sound, and they should not have to rely on our assessment—or anyone else's."* **This is the fairest available summary and is notable for conceding the verification gap.** Neither side has produced an audit. |
| 3 | Arthur Hayes used followers as exit liquidity on ZEC (and HYPE, WLD, NEAR) | **ZachXBT** | June 2026 | For ZEC: **none.** No wallet, no exchange, no amount, no transaction. The only address-level data ZachXBT/Lookonchain produced in that episode concerned **HYPE** (33,978 HYPE ≈ $2.09M) | **Conduct critique, not on-chain evidence.** Hayes' ZEC exit is established *only* by his own statement to CoinDesk. His response: he "sold to a willing buyer at a market price." **Confidence that Hayes sold: High (self-disclosure). Confidence in venue/size/route: Zero.** |
| 4 | Arkham can surveil Zcash / "53% of Zcash is tracked" | Arkham Intelligence marketing | 2025-12-08 | 53% of transactions labelled; $420B volume attributed; 48% of inputs/outputs attributed; 37% of balances labelled ($2.5B) | **Materially misleading as originally framed, and publicly corrected.** Mert Mumtaz (Helius): Arkham hasn't been able "to do jack all to shielded txns but you include in there for a few clicks." **Zooko Wilcox** agreed the language was misleading, noting Arkham is "just tracking wallets that opted into public transparency." Arkham later clarified shielded transactions "are not accounted for in the 50% of Zcash transactions labeled." **The underlying transparent-side coverage is real; the privacy-defeat implication is not.** |
| 5 | "202,077 ZEC withdrawn from Binance" on 2025-12-20 | blockchain.news, attributing **@EmberCN** | 2025-12-20 | No address printed by the aggregator | **Unverified, with a date conflict.** The only ~202,07x ZEC movement we can locate on-chain is a **shielded-pool exit on 2026-01-02 15:45:14** to `t1gGCYpy…` — which is not a Binance withdrawal and is 13 days later. Either the aggregator mis-dated/mis-described an event, or it refers to something we cannot find. **Do not cite.** |
| 6 | "Exchanges' ZEC balance fell 44%" | Yahoo/AMBCrypto syndication, sourcing **Nansen** | 2026-01-27 | Headline says 44%; body says 48% "during this period" = past 24 hours; no absolute values | **Internally inconsistent and physically implausible.** Do not cite. |
| 7 | ">200,000 ZEC (1.2% of supply) unshielded in the first week of January 2026, sparking sell-off concerns" | BeInCrypto → Yahoo, citing Arkham + zkp.baby + Lookonchain | 2026-01 | Directionally correct | **Substantially understated and mis-framed.** Actual verified figure: **276,077.74 ZEC in a single day (2 Jan 2026)**, ≈1.63% of supply. But **73.2% of it never went to an exchange** and is still parked. The "sell-off" framing is the part that fails. |
| 8 | Barry Silbert sold Zcash | multiple outlets, Nov 2025 | 2025-11 | Form 144 filings (real) | **Half-true and routinely misreported.** He sold **ZCSH trust shares on OTCQX** (1,000 shares / $47,250 personally; 9,753 shares / $407,312.59 via Silbert Family Investments LLC). **No ZEC moved on-chain.** |
| 9 | A holder lost half of a $174M ZEC position, per Arkham | Arkham via **CoinDesk** | 2026-06-05 | Arkham quote: "He hasn't sold ZEC for 6 months. Ouch." | **Real quote, unresolvable subject.** The entity is never named; no exchange, custodian or address is published; **we could not locate the original Arkham post or X thread.** Note also this is explicitly **not** Arthur Hayes. |

---

## 7. What could NOT be verified

1. **The original Arkham post/thread behind the $174M figure.** CoinDesk (2026-06-05) quotes Arkham, but the underlying Arkham post, the entity, and the custodian/exchange are all unlocated. Arkham's public pages (`intel.arkm.com`, `arkm.com`) render only via JavaScript; entity lists and balances are not extractable without an account.
2. **Any Arkham ZEC entity label for Coinbase Prime, Grayscale, Cypherpunk or DCG.** None found in any public Arkham page or press coverage. Arkham's own Zcash research page names only "the U.S. Government" (AlphaBay seizure) and anonymous traders. **No evidence Arkham publicly labels any ZEC address as Coinbase Prime or Coinbase Custody.**
3. **Any Grayscale-published ZEC address or proof-of-reserves.** Checked S-3 (2025-11-26), S-3/A (2026-08-18), 10-Q (2026-06-30). Custodian is named; addresses are not disclosed.
4. **Any Cypherpunk-published ZEC address.** 10-Q names Gemini as custodian; no addresses.
5. **Any report of "ZEC moved to Coinbase Prime."** Searched Whale Alert, Lookonchain, Arkham, Spot On Chain, EmberCN, PeckShield coverage. **Zero results.** All identifiable large-ZEC-flow reporting in 2025–2026 concerns **Binance**, via Lookonchain and EmberCN.
6. **Anchorage, BitGo or Copper holding ZEC.** No primary evidence located for any of the three.
7. **ZF, ECC or ZCG transaction-level sale disclosures.** ZF publishes aggregate balances only. ECC's transparency-report series appears to end at Q4 2023. ZCG accounting is USD-denominated with no txids. **No dev-fund coins were traced to any exchange, and — because ZIP 271 mandates shielding — they structurally cannot be.**
8. **Founders' Reward address tracing.** The ECC "Founders' Reward Transfers" blog post is blocked (robots). The Kappos et al. USENIX Security 2018 paper is available and is the canonical academic work on Zcash founder/miner address clustering, but we did not extract a founders' address list from it in this pass, and **no 2025–2026 tracing of Founders' Reward coins to exchanges was found anywhere.**
9. **Any public ZEC exchange-reserve time series with readable values** (§4).
10. **Zooko selling ZEC to pay taxes.** Searched specifically. **No source found.** The only surfaced Zooko/tax item is a 2017-era Cointelegraph piece about Snowden and tax *evasion* as a general property of privacy coins — unrelated. **Treat "Zooko sold ZEC to pay taxes" as unsourced until a primary quote is produced.**
11. **Owner identity for every address in §3.3.** Nine-figure ZEC positions sit in addresses that no public labeller has attributed. This is the single largest attribution gap in Zcash.
12. **Whether the January 2026 unshielder and the December 2025 withdrawer are the same party** — see §5.3.
13. **Mining-pool payout patterns (ViaBTC, F2Pool, Foundry) to exchanges.** No published analysis of ZEC pool payout → exchange routing was found.

---

## 8. Sources

**Primary — protocol / consensus**
- ZIP 271, Dev Fund Extension and One-Time Disbursement — https://zips.z.cash/zip-0271
- ZIP 255, Deployment of the NU6.1 Network Upgrade (Mainnet activation height 3,146,400) — https://zips.z.cash/zip-0255
- ZIP 1016, Community and Coinholder Funding Model — https://zips.z.cash/zip-1016
- ZIP 1015, Block Subsidy Allocation for Non-Direct Development Funding — https://zips.z.cash/zip-1015
- Zcash NU6.1 upgrade page — https://z.cash/upgrade/nu6-1/

**Primary — SEC EDGAR**
- Grayscale Zcash Trust submissions index (CIK 0001720265) — https://data.sec.gov/submissions/CIK0001720265.json
- Grayscale Zcash Trust 10-Q, period ended 2026-06-30 — https://www.sec.gov/Archives/edgar/data/1720265/000172026526000006/zcsh-20260630.htm
- Grayscale Zcash Trust S-3 (2025-11-26) — https://www.sec.gov/Archives/edgar/data/1720265/000119312525298561/zcsh-20251126.htm
- Form 144, Barry E. Silbert (2025-11-06) — https://www.sec.gov/Archives/edgar/data/1720265/000197641525000042/xsl144X01/primary_doc.xml
- Form 144, Silbert Family Investments LLC (2025-11-05) — https://www.sec.gov/Archives/edgar/data/1720265/000197908625000009/xsl144X01/primary_doc.xml
- Filer identity lookups — https://data.sec.gov/submissions/CIK0001652536.json (DCG), CIK0001977454 (DCG International Investments Ltd.), CIK0001979086 (Silbert Family Investments LLC), CIK0001976415 (Silbert Barry E.), CIK0001144385 (Lenihan Lawrence D Jr)
- Grayscale Zcash Trust S-3/A summary (2026-08-18) — https://www.stocktitan.net/sec-filings/ZCSH/s-3-a-grayscale-zcash-trust-zec-amended-shelf-registration-statement-46cd7cb6a529.html
- Cypherpunk Technologies 10-Q (six months ended 2026-06-30) — https://www.stocktitan.net/sec-filings/CYPH/10-q-cypherpunk-technologies-inc-quarterly-earnings-report-2d7997690ba4.html

**Primary — on-chain (Blockchair Zcash API, queried 2026-08-22)**
- Address dashboards: `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo`, `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ`, `t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V`, `t1Ym8XWvN2joxENB2Nc4TVg1M9PxKfWshc5`, `t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK`, `t1dP1MJwfYr9z7EwWxSpefP6s2p7ewaKx9e`, `t1U1NE8w5KRwnxCZAaxVidW6MchFky97m4V`, plus top-25 rich list — https://api.blockchair.com/zcash/dashboards/address/{addr} and https://api.blockchair.com/zcash/addresses?limit=25
- Transactions: `525f440283b4c9ec30fa04a5796f3ddfa4ba1e1e48657a8d6f32313f36cf1381`, `eaedfdddd569ef24eaeeae9642746aaa26959a0e7f35ccb32aef660277ade2a9`, `1f6099a47cac73924e53ad36b00f3d2bfa81820d526a87d866db4bc71faa663f`, `8a93724082fcc84bcd2c423c539214f1b3ec0802f11d25ec6021370a9e764c8a`, `e179e5b0f9fec1c6a9718b1dbe8cedddf1d8e494db276fe72c047a153365a163`, `a79347138b88b5a0405c643964c8ef308240fa5ea1058f6e35e40789f4b621c0`, `7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c`, `6db13a92f870a655e9a03d5914cad2dcc1be22be205ef781abce4eebf6ca6062`, `ba0783815529f9825d3d3a8c2d7f3dafe63468e4b5b60dcec61f7d54d1dee84c`, `ad6a3c3df9e0d8aff307506334761e9c130cb00d94498477d36f9059fa5a134b`, `f45ded5d44452c405d92e66d69d760a5a7d01f94aab937b96ecd1f666edb4712`, `a05e75fe19e9b6d957d32e81c58427fd557401a3583ccbf475f46338ff4af6b3`, `b39aa107d41d7d65f962a9662a8cedf893cb1de1485f797736d79489323c9853` — https://api.blockchair.com/zcash/dashboards/transaction/{hash}
- Alternate explorer cross-check — https://mainnet.zcashexplorer.app/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo

**Arkham**
- "Zcash Is Live On Arkham" (2025-12-08) — https://info.arkm.com/announcements/zcash-is-live-on-arkham
- "How To Track Zcash Transactions" — https://info.arkm.com/research/how-to-track-zcash-transactions
- Arkham Zcash explorer — https://intel.arkm.com/explorer/token/zcash (redirects to https://arkm.com/explorer/token/zcash; JS-gated)
- Criticism: "Arkham's 'Misleading' Zcash Tracking Claims Spark Outrage" — https://thedefiant.io/news/blockchains/arkham-zcash-activity-tracking
- "Zcash privacy tested as Arkham tracks 53% of ZEC" — https://crypto.news/zcash-privacy-tested-as-arkham-tracks-53percent-of-zec/
- "Arkham Reveals Top ZEC Holders" (2025-12-09) — https://www.fxempire.com/forecasts/article/zcash-price-news-arkham-reveals-top-zec-holders-privacy-crisis-1566416

**January 2026 unshielding event**
- BeInCrypto, "Over 1% ZEC Unshielded, Are Investors Exiting Privacy Coins?" — https://beincrypto.com/zec-supply-unshielded-in-early-2026/
- Yahoo Finance syndication — https://finance.yahoo.com/news/over-1-zec-supply-unshielded-080545871.html
- blockchain.news, 74,002 ZEC to Binance (source of the `t1Ym8XWv…` address) — https://blockchain.news/flashnews/zec-whale-deposits-74-002-zec-worth-35-75m-to-binance-signaling-exchange-inflow
- blockchain.news, 30,000 ZEC withdrawal (source of the `t1XKfb…` address) — https://blockchain.news/flashnews/zec-whale-alert-newly-created-wallet-withdraws-30-000-zec-13-25m-from-binance-on-chain-data-shows
- blockchain.news, 202,077 ZEC claim (EmberCN, unverified) — https://blockchain.news/flashnews/zec-zcash-whale-alert-202-077-zec-withdrawn-from-binance-at-437-as-price-jumps-12-on-chain-address-and-trading-watch

**Institutional / corporate**
- The Block, DCG 200,000 ZEC discussions (2026-08-19) — https://www.theblock.co/news/markets/2026-08-19-grayscale-zcash-etf-amendment-dcg-discussions-contribute-200000-zec-fund-412232
- CryptoBriefing, Grayscale/DCG ZEC contribution — https://cryptobriefing.com/grayscale-zcash-etf-dcg-zec-contribution/
- Grayscale Zcash Trust product page — https://grayscale.com/products/grayscale-zcash-trust/ (403 to automated fetch)
- Cypherpunk mining fleet press release (2026-08-18) — https://www.manilatimes.net/2026/08/18/tmt-newswire/pr-newswire/cypherpunk-technologies-launches-worlds-largest-zcash-mining-fleet/2407485
- crypto.news, "Cypherpunk becomes largest Zcash miner in $33M deal" — https://crypto.news/cypherpunk-becomes-largest-zcash-miner-in-33m-deal/
- COINOTAG, Cypherpunk/Gemini custody — https://en.coinotag.com/winklevoss-backed-cypherpunk-accumulates-zcash-holdings-with-gemini-custody-support/
- Protos, "Winklevoss' Zcash company pivots to cancer drug after $37.8M loss" — https://protos.com/winklevoss-zcash-company-pivots-to-cancer-drug-after-37-8m-loss/
- Cryptonomist, Silbert ZCSH sale — https://en.cryptonomist.ch/2025/11/06/grayscale-zcash-silbert-sale/
- Decrypt, Zooko joins Cypherpunk — https://decrypt.co/351690/zcash-founder-zooko-wilcox-joins-zec-treasury-firm-privacy-coin-surges
- Gemini support, ZEC deposit address type — https://support.gemini.com/hc/en-us/articles/31670107364891-What-type-of-Zcash-deposit-address-does-Gemini-issue

**Dev fund / foundations**
- Zcash Foundation Q1 2026 report — https://zfnd.org/zcash-foundation-q1-2026-report/ (Cloudflare-blocked; figures via secondary)
- Zcash Foundation Q2 2026 report thread — https://forum.zcashcommunity.com/t/zcash-foundation-q2-2026-report/56917
- ZF quarterly reports archive — https://zfnd.org/category/transparency-reports/quarterly-reports/
- AMBCrypto on ZF Q1 2026 treasury — https://ambcrypto.com/zcash-foundation-reports-36-7mln-in-liquid-assets-why-21mln-in-zec-matters/
- CryptoTimes on ZF Q1 2026 — https://www.cryptotimes.io/2026/05/20/zcash-foundation-ends-q1-with-36-69m-treasury-as-crypto-spending-rises/
- ECC Transparency Report Q3 2024 — https://electriccoin.co/wp-content/uploads/2025/04/Transparency-Report-Mar-2025-V2.pdf
- ECC transparency tag index — https://electriccoin.co/blog/tag/transparency/
- OpenZcash ZCG disbursements — https://openzcash.org/zcg/disbursements
- ECC, "Zcash Halvening & NU6" — https://electriccoin.co/blog/zcash-halvening-nu6-embracing-the-new-dev-fund/

**Hayes / allegations**
- CoinDesk, "Arthur Hayes dumps zcash holdings after Orchard Pool vulnerability revealed" (2026-06-05) — https://www.coindesk.com/markets/2026/06/05/arthur-hayes-dumps-zcash-holdings-after-orchard-pool-vulnerability-revealed
- CoinDesk, "Bearish zcash bets hit record high" (2026-06-05) — https://www.coindesk.com/markets/2026/06/05/bearish-zcash-bets-hit-record-high-as-privacy-token-s-price-crashes
- CoinCentral, ZachXBT questions Hayes — https://coincentral.com/zachxbt-questions-arthur-hayes-over-wld-zec-hype-and-near-token-sales/
- KuCoin blog, ZachXBT exit-liquidity accusation — https://www.kucoin.com/blog/zachxbt-accuses-arthur-hayes-exit-liquidity
- TechLeaks24, "Why Zcash Should Be Considered Fraudulent…" (2026-08-08) — https://techleaks24.substack.com/p/why-zcash-should-be-considered-fraudulent
- Zooko/McGee statement on supply soundness (2026-06-15) — https://bitcoinfoundation.org/news/altcoins/zec-price-zcash-founder-says-exploit-was-unlikely/

**Data / labelling infrastructure**
- ZEC Stats — https://zecstats.com/
- CipherScan — https://cipherscan.app/ | source: https://github.com/ShieldedLabs/sl-cipherscan
- CoinCarp Zcash rich list (stale) — https://www.coincarp.com/currencies/zcash/richlist/
- CoinCarp Zcash "exchange wallets" (empty; BEP20) — https://www.coincarp.com/currencies/zcash/exchange-wallets/
- BitInfoCharts top-100 — https://bitinfocharts.com/top-100-richest-zcash-addresses.html
- Whale Alert FAQ (supported chains — no Zcash) — https://whale-alert.io/faq.html
- CryptoQuant ZEC exchange reserve (Cloudflare-blocked) — https://cryptoquant.com/asset/zec/chart/exchange-flows/exchange-reserve
- CoinGlass exchange balances (no ZEC) — https://www.coinglass.com/Balance
- Yahoo/AMBCrypto "Exchanges' ZEC Balance Falls 44%" (unreliable) — https://finance.yahoo.com/news/zcash-price-prepares-500-exchanges-173000972.html
- Blockworks Zcash analytics — https://blockworks.com/analytics/zcash/zcash-mining/zcash-block-reward-distribution
- Kappos et al., "An Empirical Analysis of Anonymity in Zcash," USENIX Security 2018 — https://www.usenix.org/system/files/conference/usenixsecurity18/sec18-kappos.pdf

---

## 9. Editorial guidance for publication

1. **Never write "Binance sent/received X ZEC."** Write: *"an address that Lookonchain identifies as Binance."* The chain does not carry exchange names.
2. **Always distinguish trust-share sales from coin sales.** The Silbert/DCG Form 144s are the most-misreported item in this dossier.
3. **State the shielded-pool limit up front and repeatedly.** 26.8% of ZEC is shielded; ZIP 271 *requires* dev-fund coins be shielded on first spend. Any "we traced the dev fund to an exchange" claim is false by construction.
4. **Lead with the correction, not the scandal.** The strongest original finding here is deflationary to the panic narrative: 73% of the January 2026 unshielding never went near an exchange and has not moved in 7½ months, and much of what *did* reach the exchange looks like a round-trip.
5. **Publish the address list and the txids.** Every on-chain claim above is reproducible against a public API. That reproducibility is the site's credibility.
6. **Do not repeat the CoinCarp rich list.** It is materially wrong — its #1 entry overstates a live balance by ~8.8x.
