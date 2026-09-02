# Mode A - viewing-key decryption in the browser

**Status: PLAN ONLY. Nothing here is built. The operator approves before any of it is written.**

Written by the HANDOFF-13 session, 2 September 2026, against `main` at `98e87a0`.
Every version number, size and rate below was fetched or executed during that session and
carries its source in section 10. Where a number could not be established it is labelled
UNVERIFIED rather than estimated, and where a rate is quoted it carries its sample size.

---

## 0. What this document is, and the three things it corrects

Mode A is the only way a shielded balance is ever shown on this site. `TRACKING-MATH.md`
section 5 states it and `/reveal` already renders the ceremony with the gate closed: the
field validates a viewing key by prefix, says what that key would and would not reveal, and
its Reveal button is disabled with the reason on it. This document plans what fills that
button, and it stops there.

**It is a plan and not a start.** The approval gate exists because Mode A is the one surface
in this project where a mistake costs a user their privacy rather than a rerun. A session
that arrived at a design and then began `packages/wasm-keys` would have removed the gate,
not moved faster.

Three premises this project held were checked against primary sources and are wrong. They
are here first because each changes a decision downstream.

**(a) The gateway endpoint is `/v2/compact/...`, not `/api/compact/...`.** HANDOFF-13 section
4 names `/api/compact/:range`. HANDOFF-11 deleted `/api` from this gateway: `API_PREFIXES` is
`["/v2"]` and every path under `/api` answers **410 with a body naming `/v2`**
(`apps/gateway/src/routes/index.ts:49`). An endpoint written to the handoff's spelling would
be dead on arrival, answering 410 to its own client.

**(b) `zcash_keys` + `zcash_note_encryption` is not the crate set, and the set is not on
crates.io for a browser build.** `TRACKING-MATH.md` section 5 names two crates. The trial
decryption a UFVK needs reaches at least `zcash_keys`, `zcash_note_encryption`,
`sapling-crypto`, `orchard`, `zcash_primitives`, `zcash_protocol` and `zcash_address`, and
the only working browser build of that graph in existence - ChainSafe's WebZjs - does not
build from crates.io at all. It pins a **fork**, `ChainSafe/librustzcash-nu61` branch
`feat/snap-nu61`. Upstream `librustzcash` CI has **no `wasm32-unknown-unknown` job**; its only
wasm target is `wasm32-wasip1`. Whether upstream compiles for the browser today is UNVERIFIED
and is the single largest unknown in this plan.

**(c) Ironwood notes do not decrypt with Orchard's note plaintext parser.** ZIP 2005
("Ironwood Quantum Recoverability", Proposed) gives an Ironwood note plaintext the **lead byte
`0x03`**, where an Orchard note carries `0x02`. The compact format reuses the message -
`CompactTx.ironwoodActions` is field 9 and is typed `repeated CompactOrchardAction` - so the
*transport* is shared and the *plaintext* is not. Any design that treats "Ironwood is Orchard
with a different tree" will trial-decrypt every Ironwood note to a failure and report the user
has no Ironwood balance, silently and plausibly.

That last one is the seam shape this project has now recorded five times (LEDGER-11, and
LEDGER-12 Q6 for the configuration variant): two sides, each with tests, each building its own
input. Section 7.3 says what a Mode A assertion has to do about it.

---

## 1. Architecture

### 1.1 The shape

```
  browser tab (apps/web, /reveal)
  ┌──────────────────────────────────────────────────────────────┐
  │  RevealKey.tsx        the field. Uncontrolled, no <form>,     │
  │                       no fetch. Unchanged.                    │
  │        │ postMessage(key)  - never a URL, never storage       │
  │        ▼                                                      │
  │  Web Worker           packages/wasm-keys glue                 │
  │   ┌──────────────────────────────────────────────────┐        │
  │   │ wasm module   parse UFVK/FVK/IVK (bech32m, F4J)   │        │
  │   │               derive ivk/ovk/nk                   │        │
  │   │               trial-decrypt compact outputs       │        │
  │   │               nullifier derivation (FVK only)     │        │
  │   └──────────────────────────────────────────────────┘        │
  │        │ fetch (worker, same-origin or gateway origin)         │
  └────────┼──────────────────────────────────────────────────────┘
           ▼
     gateway  GET /v2/compact/:from/:to      compact outputs only
              (never the key, never a query naming an address)
           ▲
           │
     indexer Postgres  +  Zebra RPC          section 3.2 decides which
```

Four properties this shape exists to have, in the order they constrain the design:

1. **The key crosses one boundary and it is in-process.** `postMessage` to a same-origin
   worker is a structured clone inside the same agent cluster; it is not a network call and
   no CSP directive governs it. The key reaches the wasm linear memory and nothing else.
2. **The network path carries no user-identifying query.** The worker asks for a *block
   range*, which is the same request every viewer of that range makes. It never asks for an
   address, a key, or anything derived from one. This is what makes the gateway's logs
   uninteresting and is the property a server-side scan cannot have (section 5.5).
3. **Trial decryption is the work that cannot be delegated.** ChainSafe's own benchmark says
   so, and it is also this project's editorial position: a site arguing that shielded data is
   unrecoverable from public inputs cannot then ask a user to post their viewing key to a
   server.
4. **`RevealKey.tsx` does not change shape.** It already holds no key in React state, is not
   in a form, and has no fetch. Mode A adds a worker handle and a result panel; it does not
   revisit those decisions, which HANDOFF-04's gate already paid for.

### 1.2 Crate and version table

Every version below is the latest published release read on 2 September 2026.

| Crate | Latest | Published | Role in Mode A |
|---|---|---|---|
| `zcash_keys` | 0.16.1 | 2026-07-29 (CHANGELOG: 07-28) | UFVK parse and decode; `UnifiedFullViewingKey`; per-pool key extraction |
| `zcash_note_encryption` | 0.4.2 | 2026-07-11 | the generic trial-decryption traits both pools implement |
| `sapling-crypto` | 0.7.0 | 2026-04-21 | Sapling note decryption, `nk`, nullifier derivation |
| `orchard` | 0.15.5 | 2026-08-03 (CHANGELOG: 08-02) | Orchard action decryption; the Ironwood transport shares this message |
| `zcash_primitives` | 0.30.1 | 2026-08-19 (CHANGELOG: 08-18) | transaction and consensus primitives |
| `zcash_protocol` | 0.10.5 | 2026-08-19 (CHANGELOG: 08-18) | network constants, pool identifiers |
| `zcash_address` | 0.13.0 | in the workspace manifest | unified address decode for the receiver display |
| `zcash_client_backend` | 0.24.0 | in the workspace manifest | **evaluate, do not assume** - see 1.2.1 |
| `zcash_proofs` | 0.30.0 | in the workspace manifest | **not needed for Mode A** - see 1.2.1 |

**1.2.1 Two crates to keep out, and why that is a size decision.**
`zcash_proofs`' `bundled-prover` feature is documented upstream as adding roughly **50 MiB**.
Mode A never constructs a transaction, so it never proves anything: it decrypts. Excluding
`zcash_proofs` is therefore free and is the difference between a plausible bundle and an
impossible one. `zcash_client_backend` brings a sync engine, a wallet database abstraction and
a `time` dependency whose default features break on `wasm32-unknown-unknown` (section 2.1); it
may be worth its weight for `scan_block`-shaped helpers and it may not, and that is a build
decision rather than a plan one. **The plan's position: start without it, and add it only if a
named function is needed that reimplementing would get wrong.**

Upstream `librustzcash`'s own MSRV is **Rust 1.88**, and the workspace is still on the
`rand 0.8` / `rand_core 0.6` line - deliberately, with `proptest` pinned below 1.7 to avoid
`rand 0.9`. That is why `getrandom` **0.2** and not 0.3 is the version that governs a Zcash
wasm build today (section 2.1).

### 1.3 The decision that dominates everything: threads or no threads

This is the first thing the operator has to decide, because every other cost follows from it.

**What was measured.** The published Zcash wasm artifacts are *all* shared-memory builds. The
wasm import sections were decoded from the npm tarballs: `@bytezhang/webzjs-wallet`
0.1.0-alpha.23 imports a memory with limits flag `0x03` (has-max **and shared**), max 65,536
pages = 4 GiB; `@chainsafe/webzjs-keys` 0.1.0 imports a shared memory with max 16,384 pages =
1 GiB. A shared memory import cannot be satisfied without `WebAssembly.Memory({shared:true})`,
which means `SharedArrayBuffer`, which means **cross-origin isolation is mandatory**. There is
no published single-threaded Zcash wasm artifact.

| | Single-threaded build | Parallel build (`wasm-bindgen-rayon`) |
|---|---|---|
| Toolchain | stable Rust | **pinned nightly** + `rust-src` + `-Z build-std=panic_abort,std` |
| Target features | none special | `+atomics,+bulk-memory,+mutable-globals` |
| Headers required | none beyond today's | **COOP `same-origin` + COEP `require-corp`** |
| What COEP breaks | nothing | every cross-origin no-cors subresource without a CORP header |
| Precedent | none published | WebZjs, and it is the only one |
| Speed | UNVERIFIED - no measured single-threaded figure exists | ~7,700 blocks/sec, 4 threads, n=1 machine |
| Measured size | UNVERIFIED | keys-only 2,147,533 bytes raw / 1,530,941 gzip -9 |

**Recommendation: build single-threaded first, and treat threads as a later, separately
approved change.** Four reasons, in order of weight:

1. **COEP `require-corp` is a site-wide change made for one route.** It is set on the
   document, and every cross-origin no-cors subresource then needs a CORP header or it is
   blocked. This site vendors its fonts under `src/fonts` and serves images from `'self'`, so
   it is *plausibly* unaffected - but "plausibly" is the word that precedes an outage, and the
   blast radius is the whole Record, not `/reveal`.
2. **A pinned nightly is a supply-chain and reproducibility cost** that this project has
   nowhere else. WebZjs pins `nightly-2025-01-07`; its own README still says
   `nightly-2024-08-07`, so its documentation and its toolchain file already disagree.
3. **The workload may not need it.** Section 3.3 measures the Ironwood-era compact volume; the
   Sapling-era range is the expensive one and section 1.5 argues it should not be scanned at
   all by default.
4. **`crossOriginIsolated` is feature-detectable in both the page and the worker**, so a later
   parallel build can be added behind a runtime check rather than a rebuild - the single-
   threaded path stays the floor and the parallel path becomes an upgrade.
5. **And the reason that turned out to be the strongest, found while writing section 5 rather
   than this one: a shared linear memory weakens the containment boundary the key relies on.**
   `WebAssembly.Memory.prototype.buffer` hands the whole linear memory to JS as an ArrayBuffer,
   so what keeps the key out of page-realm script is that the module runs in a **worker**, a
   separate realm. A *shared* memory is precisely the kind of object that can cross that
   boundary. The threaded build therefore trades away part of M7 (section 5.1) to buy speed,
   and the single-threaded build does not. This reason was not available when the list above
   was written and it outranks the four before it.

**The argument that cuts the other way is in 5.2.2 and the operator should read it before
deciding Q1**: cross-origin isolation is not only a cost, it is the defence against a
Spectre-class reader sharing a process with this page. The recommendation stands because the
secret lives in a worker whose realm the shared memory would reopen - but it is a trade, not a
free choice, and 1.3 said "cost" before section 5 was written.

**The honest cost of that recommendation, stated rather than buried:** no measured single-
threaded trial-decryption rate exists, for this project or anyone else. If the single-threaded
build turns out to be four times slower than ChainSafe's four-thread figure, a full Ironwood-era
scan moves from about 2 seconds to about 9 - still fine. If it is *forty* times slower, the
design is unchanged but the progress UI stops being optional. **The build handoff measures this
before it commits to a UI**, which is section 7's A6.

### 1.4 The Ironwood lead byte

ZIP 2005 gives Ironwood note plaintexts lead byte `0x03`; Orchard's is `0x02`. `CompactTx`
carries `ironwoodActions` as field 9 with the *same* `CompactOrchardAction` message type as
field 6's `actions`, and `ChainMetadata` carries `ironwoodCommitmentTreeSize` at field 3
alongside Sapling (1) and Orchard (2). So:

- the **wire** is shared and a decoder that reads field 6 and ignores field 9 silently loses
  every Ironwood note;
- the **plaintext** is not shared, and a decryptor that hands an Ironwood ciphertext to
  Orchard's plaintext parser gets a lead-byte mismatch, which presents as *decryption failed*,
  which presents as *you have no notes*;
- **both failures are indistinguishable from a correct empty result**, which is why section
  7's A4 is a fixture with a known Ironwood note and a known balance rather than a property.

Whether the `orchard` crate at 0.15.5 already handles `0x03` is UNVERIFIED. ZIP 2005 is
Proposed, not Final. This is the second largest unknown in the plan and the build handoff's
first task is to answer it against the crate source.

### 1.5 The birthday problem, and what this site should scan

A viewing key does not say when its account was created. Wallets solve this with a *birthday
height* the user supplies; without one, a correct scan starts at Sapling activation and reads
about 3.4 million blocks.

At ChainSafe's measured 7,700 blocks/sec (4 threads, n=1 machine) that is roughly **7.4
minutes**, and their own longer run - 755,635 blocks from Orchard activation to tip - took
3,353,402.88 ms, about 56 minutes, because block density through the DoS-attack period is much
higher than the average. Those are the only published figures and they are one machine, one
browser, one thread count.

**The plan's position: Mode A scans the Ironwood era by default and asks for a birthday for
anything earlier.** The default range is NU6.3 activation (**3,428,143**, ZIP 258, and the
constant this repository already carries) to tip, which is about 16,700 blocks at the time of
writing - two orders of magnitude smaller than a full scan and the range this site is actually
about. Sapling and Orchard history is offered behind an explicit second action that states the
time cost before it starts, with a birthday field. This is also the honest framing: a forensics
site that decrypts *the new pool* is doing what it says on the tin, and one that silently reads
eight years of a stranger's history because the default was convenient is not.

### 1.6 What the page renders, and what it must never render

- **Received notes**, with value, memo, txid, height, and the pool. This is what an IVK gives.
- **Spent/unspent and therefore an exact balance** - **only** when the key is an FVK or UFVK,
  because that needs `nk` for nullifier derivation. An IVK result must say *total received*,
  never *balance*, and the existing `RevealKey` copy already draws that distinction correctly.
- **Outgoing transfers** - only with an OVK, from `out_ciphertext`.
- **Never** a balance for a key that cannot produce one. Never a partial scan reported as a
  total. Never a result that outlives the tab.

---

## 2. Build pipeline

### 2.1 What a `wasm32-unknown-unknown` build actually needs

Four blockers, each with the fix that a real Zcash browser build uses:

| Blocker | Fix | Note |
|---|---|---|
| RNG | `getrandom` **0.2** feature `js` | *not* `wasm_js`, *not* a RUSTFLAG. `wasm_js` is the 0.3+ spelling; upstream librustzcash is on the `rand 0.8`/`rand_core 0.6` line, which pulls `getrandom` 0.2 |
| Clock | `time` crate feature `wasm-bindgen` | reroutes `OffsetDateTime::now_utc()` from `SystemTime::now()` to `js_sys::Date`. Reached through `zcash_client_backend`'s default features |
| Threads | none, if single-threaded | `std::thread::spawn` **panics** on this target; `std::fs` always errors and `println!` does nothing. Tier 2, large parts of std stubbed |
| Async | avoid `tokio` proper | it reaches `mio`. WebZjs substitutes `tokio_with_wasm` for `rt`, `sync`, `macros`, `time` |

**A measured note on the `getrandom` version split, because it is the thing most likely to be
got wrong from memory.** A real Zcash browser build resolves **both** `getrandom` 0.2.17 and
0.3.4 into one graph: the cryptographic path (`rand_core` 0.6.4, and `ring` 0.17.14) takes
0.2.17, and the 0.3.4 copy enters only through `tempfile` and `uuid`. Accordingly the only
`getrandom` feature WebZjs sets is the 0.2 `js` feature, and there is no `wasm_js` declaration
and no `--cfg getrandom_backend` anywhere in that repository. (For completeness: on
`getrandom` 0.3.0-0.3.3 the RUSTFLAG `--cfg getrandom_backend="wasm_js"` was mandatory
alongside the feature; **0.3.4, released 2025-10-14, removed that requirement**. The current
line is 0.4.x. None of that applies to the crypto path today, and it is written down so the
next reader does not apply it anyway.)

### 2.2 Toolchain and tooling versions

`wasm-bindgen` latest is **0.2.127** (2026-08-08); the project has moved out of the `rustwasm`
org and its repository is now `github.com/wasm-bindgen/wasm-bindgen`. `wasm-pack` latest is
**0.15.0** (2026-05-15) - note the 15-month gap between 0.13.1 (2024-10-29) and 0.14.0
(2026-01-21), which is a maintenance signal without a maintenance statement; no successor tool
is named anywhere the session could read.

**The only Zcash wasm consumer in existence is 27 patch releases behind**: WebZjs pins
`wasm-bindgen` to exactly 0.2.100 and `js-sys`/`web-sys` to exactly 0.3.77. A build on current
`wasm-bindgen` is therefore unexplored territory for this crate graph, not a well-trodden path.

### 2.3 Size budget

Measured, from the published artifacts:

| Artifact | Raw | gzip -9 | Files |
|---|---|---|---|
| `@chainsafe/webzjs-keys` 0.1.0 (keys only) | 2,147,533 B | 1,530,941 B | 4 |
| `@bytezhang/webzjs-wallet` 0.1.0-alpha.23 | 8,044,208 B | 3,595,538 B | 8 |
| `@chainsafe/webzjs-zcash-snap` 0.3.0 | 3,113,926 B unpacked | - | 5 |

A keys-only bundle costs about a quarter of a full wallet bundle. **Mode A is between the two**
- more than key parsing, less than a wallet, and with no prover - so a first estimate of 2-4 MB
raw is defensible and is *an estimate, not a measurement*. Two cautions that must not be lost:

- there is an unresolved tension in the source numbers: WebZjs's wallet crate declares
  `zcash_proofs` with `bundled-prover`, upstream says that feature adds ~50 MiB, and the
  published artifact is 8 MB. Either the fork dropped the feature or the parameters are fetched
  at runtime. **The 8 MB figure must not be assumed to include proving parameters.**
- no brotli figure was measured (brotli was not available in the session). Vercel serves brotli;
  the real over-the-wire number will be below the gzip column.

**A 2-4 MB module is not loaded on `/reveal`'s first paint.** It is fetched when the user asks
to decrypt, which is a deliberate act that already justifies a wait, and never on any other
route. That keeps the Record's Lighthouse numbers - the gate this project reports on - out of
the blast radius entirely.

### 2.4 Reproducibility and supply chain

This is the part of the build pipeline that is a *threat model* item and is written here
because it is decided at build time:

- **the artifact is committed or built in CI, and either way its hash is recorded.** A wasm
  module that decrypts a user's notes must not be a floating npm dependency: the three
  ChainSafe-adjacent npm packages a search returns include third-party forks
  (`@bytezhang/*`, `zprotocol-webzjs-wallet`, several rebadged snaps), and the package the
  WebZjs README tells you to import - `@chainsafe/webzjs-wallet` - **is not published at all**
  (the registry answers 404).
- **the crate source is pinned by revision, not by range.** If the fork turns out to be
  necessary, it is pinned to a commit and the diff against upstream is read and recorded before
  it is used. "ChainSafe's fork works" is not a review.
- **Subresource Integrity DOES reach the module, and the usual claim that it does not is
  wrong.** SRI's *element* coverage is a closed list - `<script>`, and `<link>` with `rel`
  `stylesheet`, `preload` or `modulepreload` - and a `.wasm` is none of those. But
  **`fetch()` carries integrity metadata through the `integrity` option on the `Request`
  constructor**, so `fetch(url, { integrity: "sha384-..." })` is integrity-checked and fails
  closed on mismatch, exactly like an element-level check. `WebAssembly.instantiateStreaming`
  takes a `Response` - typically that very `fetch()` - and documents no verification of its
  own, so **the integrity is entirely the caller's to set and entirely available to set.**
  (Import maps now also carry an `integrity` key for dynamically imported modules, so the
  "dynamic imports are outside SRI" line is stale too; its browser-support baseline was not
  established here.) `Integrity-Policy` / `Integrity-Policy-Report-Only` can additionally
  *require* integrity metadata on loaded subresources, though its supported destinations are
  script and style. **The plan's position: `fetch(url, {integrity})` with a build-time hash,
  and A10 asserts it.** No hand-rolled hash-then-instantiate is needed.
- **Four dated precedents for why this matters, all npm-registry compromises**, because that is
  the attack that has actually happened repeatedly: `@solana/web3.js` 1.95.6 and 1.95.7,
  published with private-key-exfiltrating malware and live for about five hours on 3 December
  2024 (CVE-2024-54134); `prebid.js` 10.9.2, briefly published with a crypto drainer
  (CVE-2025-59038, Sept 2025); `ua-parser-js` 0.7.29 / 0.8.0 / 1.0.0, account compromise with
  embedded malware (CVE-2021-4229, CVSS 9.8, Oct 2021); and `event-stream` 3.3.6, which gained
  a malicious `flatmap-stream` **transitive** dependency (GHSA-mh6f-8j2x-4483, Nov 2018) - the
  canonical demonstration that pinning your own direct dependencies is not enough.
  **Stated honestly: the session could not source a dated incident of a browser wallet leaking
  keys specifically through XSS or a compromised CDN.** All four it could date are npm. That is
  an argument about where to spend the effort, not a reason to relax the CSP precondition.

### 2.5 Where `packages/wasm-keys` sits

A workspace package with a **hard dependency rule of the same kind
`packages/zec-instruments` already has**, enforced the same way: `scripts/check-instrument-deps.mjs`
fails if `zeromq` or `@zcashreveal/indexer` enters that package's graph, and that constraint is
why the package exists. `packages/wasm-keys` needs the mirror rule - **nothing from `apps/`,
nothing that can reach a network client, and no dependency that reads storage** - because the
package's whole claim is about what it cannot do. Section 7's A7 makes it an assertion and
section 9 asks whether the existing guard is widened or a sibling is added.

---

## 3. Gateway needs

### 3.1 The endpoint

```
GET /v2/compact/:from/:to        from, to: block heights, inclusive, to - from <= MAX_RANGE
```

Answers the compact outputs for that range and nothing else. Never the key. Never a parameter
naming an address, a receiver or anything derived from one. **`/v2`, not `/api`** - see 0(a).

The response shape is the plan's one genuinely open API question and section 9 asks it: the
protobuf `CompactBlock` wire form is what every other client speaks and what the Rust side can
decode natively, and a JSON DTO is what this gateway does everywhere else and what its existing
schemas, revivers and tests are built for. They are not equally good here, and the argument is
in 9 Q3 rather than settled by habit.

### 3.2 Where the bytes come from - three sources, and the first is not available

**What a compact output is.** From `compact_formats.proto` (which has **moved** to
`zcash/lightwallet-protocol`; the path in the brief is now a pointer, not a file):

- `CompactSaplingOutput`: `cmu`, `ephemeralKey`, `ciphertext` - 32 + 32 + 52 = **116 bytes of
  payload**, 122 protobuf-encoded, **124 including its slot** in `CompactTx`.
- `CompactOrchardAction`: `nullifier`, `cmx`, `ephemeralKey`, `ciphertext` - 32 + 32 + 32 + 52
  = **148 bytes of payload**, 156 encoded, **159 including its slot** (a 156-byte length needs
  a two-byte varint). Ironwood reuses this message.

The 52-byte ciphertext is a *prefix* of the 580-byte `encCiphertext` that ZIP 225 fixes on
chain - enough to recover a note, not enough to recover the memo.

**Source A - the indexer's Postgres. Not available today, and this is a schema fact.**
`pool_commitments` (migration 002, pool CHECK widened by 003) carries `pool`, `cm_id`,
`position`, `txid`, `block_height`, `inserted_at`. **There is no `ephemeral_key` column and no
ciphertext column.** So the store the gateway already reads cannot serve a compact output at
all. Making it able to is migration 006 and is a real cost: the indexer already decodes every
block and has the bytes in hand, so it is a write path and a backfill rather than new
decoding - but it is a `NOT NULL`-free widening of a hot table and, per this project's own
rule, dropping or adding nullable columns runs every branch the old shape kept unreachable.

**Source B - Zebra `getrawtransaction` / `getblock` verbosity 2.** Zebra's `getblock` takes
verbosity 0, 1 or 2 (2 = a JSON object with transaction data) and `getrawtransaction`'s
`verbose=0` returns full raw hex, which contains the whole 580-byte `encCiphertext` for the
gateway to slice to 52. No schema change; the cost is one RPC round trip per block per request
and a lot of bytes discarded at the gateway.

**Source C - Zebra's own `CompactTxStreamer`, and there is a trap here this repository has
already been caught by once.** Zebra's RPC `Config` carries a `lightwalletd_listen_addr:
Option<SocketAddr>` field, read from the source rather than the book. **Whether the published
`zfnd/zebra:6.3.0` image starts that server is UNVERIFIED**, and the precedent for doubting it
is in this repository's own `infra/zebrad/zebrad.toml`, about the sibling field:

> `indexer_listen_addr`. This is NOT the address index. It is Zebra's internal gRPC indexer
> service, it requires a build with the `indexer` feature, and `default-release-binaries` -
> what the published image is built with - does not include it. Setting it here would be a key
> that parses and a server that never starts.

Confirmed against `zebrad/Cargo.toml`: `default-release-binaries` is
`["release_max_level_info", "progress-bar", "prometheus", "sentry", "opentelemetry"]`, and
`indexer = ["zebra-state/indexer"]` is not in it. The only lightwalletd-named feature is
`lightwalletd-grpc-tests`, which is a **test** feature. So the shape of the trap is proven for
the sibling and unproven for this field, which is exactly when a plan should say so.
**Additionally, a browser cannot speak gRPC**: every existing Zcash browser wallet - WebZjs,
Zecwallet Web - puts a grpc-web proxy in front of lightwalletd, and this project would be
adding a proxy to reach a service it has not confirmed exists.

**Recommendation: Source B for the first build, Source A when the range grows.** B needs no
migration and no new process, so it gets Mode A working against the real chain; A is the one
that scales and is a Data-track handoff of its own once B has proven the endpoint's shape.
Source C is not recommended until someone has run `zfnd/zebra:6.3.0` with
`lightwalletd_listen_addr` set and watched a port open.

### 3.3 Volume, measured, with its n

Counted from the four committed mainnet captures in `apps/indexer/test/fixtures/blocks`:

| Height | nTx | Sapling outputs | Sapling spends | Orchard actions |
|---|---|---|---|---|
| 3,432,130 | 5 | 2 | 0 | 2 |
| 3,441,955 | 10 | 2 | 2 | 2 |
| 3,444,836 | 2 | 0 | 0 | 0 |
| 3,444,837 | 6 | 2 | 0 | 2 |

**n = 4 blocks, 23 transactions**: 1.50 Sapling outputs and 1.50 Orchard actions per block,
which at 124 and 159 bytes per slot is about **425 compact bytes per block**. Over the
Ironwood era so far (3,428,143 to 3,444,837, about 16,700 blocks) that is roughly **7 MB**;
over a year of blocks, roughly **89 MB**.

**Three cautions, because a rate without them is not a measurement.** n is four. All four
blocks lie within 12,707 heights of each other and all are post-NU6.3. And the fixture
README's selection criteria bias toward blocks *with* shielded activity, so this sample is not
random with respect to the thing it measures - it is more likely to over-state than
under-state. The number is good enough to say "the Ironwood era is single-digit megabytes and
not gigabytes"; it is not good enough to size a cache.

### 3.4 Rate limits, caching, and what the gateway must not do

- **The range is capped** and the cap is stated in the 400 body, not silently truncated. A
  truncated range that reads as a complete scan is the "silent cap" this project's own workflow
  rules forbid.
- **The response is cacheable and should be**, because it is identical for every caller: a
  range of compact outputs is public chain data. That is also the privacy argument - a cache
  hit means the gateway learned nothing at all about the request.
- **The gateway must not log the range in a way that reconstructs a session.** A sequence of
  range requests from one IP is a scan, and a scan's *start* is a birthday, which is a weak
  identifier. Logging discipline here is a real requirement, not hygiene.
- **The endpoint must not gain a filter.** "Give me only the outputs matching this `ivk`" is
  the one feature request that destroys the entire property, and it will be proposed, because
  it is obviously faster. It belongs in the plan as a named refusal so that the refusal has a
  citation later.

---

## 4. CSP, and the LEDGER-04 Q5 precondition

**The precondition, restated: Mode A may not ship while `script-src` carries
`'unsafe-inline'`.** HANDOFF-04 shipped that directive deliberately, reasoning that a site with
no user input, no database and no third-party script gives an injected script little to do.
Decrypted note data in the tab is exactly the thing that reasoning assumed absent, so it
expires here. `apps/web/next.config.ts` carries the current policy and states the trade-off in
its own docblock, honestly, which is why this section can be short about the history and long
about the cost.

### 4.1 What WebAssembly needs

`script-src` must carry **`'wasm-unsafe-eval'`**: with a CSP present and that source absent,
WebAssembly is blocked from loading and executing. `'unsafe-eval'` is broader and also permits
wasm compilation, and where present it overrides `'wasm-unsafe-eval'` - so `'unsafe-eval'` is
*not* needed for wasm, only for JS `eval`. Browser support for `'wasm-unsafe-eval'`, from MDN
browser-compat-data 8.0.13 (generated 2026-08-27, n = 14 runtime entries): Chrome 97, Edge 97,
Firefox 102, Safari 16, Safari iOS 16, Opera 83.

Two things could not be established and both matter:

- **whether a Web Worker inherits the document's CSP for wasm instantiation**, or whether the
  worker's own response CSP governs. If the latter, the header has to be set on the worker
  script's response too.
- **whether `'wasm-unsafe-eval'` alone covers every instantiation path** - `instantiateStreaming`
  from a fetched `.wasm` versus `instantiate` from an ArrayBuffer, plus wasm-bindgen's generated
  glue. No page enumerating the gated APIs was reachable.

Both are cheap to settle by executing, and section 7's A5 says to settle them that way rather
than by reading.

### 4.2 The nonce path, and its cost stated as the docs state it

The Next.js CSP guide is unambiguous: **a fresh nonce per page view means dynamic rendering**,
and **dynamic pages cannot be cached at the edge by default**. The documented way to opt a page
in is `await connection()`. So the cost is real and is the one HANDOFF-04 named.

Three corrections to how that cost is usually described here:

1. **The file is `proxy.ts` in Next.js 16, not `middleware.ts`.** Next 16 deprecates the
   middleware filename and the named `middleware` export. This repository pins **`next`
   15.5.23**, where `middleware.ts` is still correct - so a plan written for today and a plan
   written for the next major disagree, and the build handoff must state which it targets.
   Also: the proxy runtime is Node and cannot be configured to edge.
2. **The nonce does not have to cost the whole site its prerendering.** `next.config`'s
   `headers()` does path matching on `source`, and a proxy takes a `matcher`. A policy that
   applies `'wasm-unsafe-eval'` and a nonce **to `/reveal` only**, while every other route keeps
   today's static policy and its prerendering, is expressible with the tools that exist. That
   is the shape this plan recommends, and it turns "Mode A costs the site its prerendering"
   into "Mode A costs `/reveal` its prerendering", which is a route that already does client
   work.
3. **A nonce does not get you off `'unsafe-inline'` for styles.** Next.js still emits inline
   styles a nonce-only `style-src` rejects - vercel/next.js issue **#74319** was open at fetch
   time against built-in pages, and **#83764** reports the route-announcer emitting a style
   *attribute*. `style-src` covers attributes as well as elements and a nonce cannot attach to
   an attribute; `style-src-attr` with `'unsafe-hashes'` is the mechanism if one is needed.
   **So the honest target is `script-src` without `'unsafe-inline'`, and `style-src` unchanged
   for now**, with the reason recorded. Claiming a clean policy and shipping one with
   `style-src 'unsafe-inline'` would be worse than stating the split.

One thing could not be established that the recommendation leans on: **whether Vercel's edge
network runs proxy/middleware before or after the CDN cache lookup** for a statically
prerendered route. If it runs after, a cached HTML body could be served alongside a freshly
generated, non-matching nonce header - which fails closed (scripts blocked) rather than open,
but fails. Route-scoping the nonce to `/reveal` limits that question to one route; settling it
is A5's job.

### 4.3 If threads are ever enabled

`SharedArrayBuffer` requires **both** COOP `same-origin` and COEP `require-corp` (or
`credentialless`), plus a secure context. COEP `require-corp` blocks any cross-origin resource
requested in no-cors mode unless it carries a `Cross-Origin-Resource-Policy` header;
`credentialless` is the escape hatch, loading such resources without credentials. `crossOriginIsolated`
is readable at runtime in both the page and the worker, which is what makes a feature-detected
upgrade possible. This site already sets COOP `same-origin`; **COEP is the new one and it is
the site-wide risk**, which is section 1.3's argument for not taking it yet.

### 4.4 Recommended target policy for `/reveal`

```
script-src 'self' 'nonce-{n}' 'strict-dynamic' 'wasm-unsafe-eval'
style-src  'self' 'unsafe-inline'          # see 4.2(3); tightening is its own change
connect-src 'self' {gateway}               # unchanged; the worker's fetch goes here
worker-src 'self'
form-action 'none'  base-uri 'none'  object-src 'none'  frame-ancestors 'none'
```

Everything else keeps today's policy on today's routes.

---

## 5. Threat model

### 5.1 "The key never leaves the tab" is a claim, and here are its mechanisms

The claim needs mechanisms, and this build already has four. Mode A adds two and must not
weaken any:

| # | Mechanism | Status today | What Mode A changes |
|---|---|---|---|
| M1 | the field is **uncontrolled**, so React never writes the key into the `value` **attribute** and it is never serialised into the DOM | shipped, and it was a gate finding: the first draft was controlled and the key appeared in `document.documentElement.outerHTML` | unchanged |
| M2 | no `<form>`, no `fetch`, no `sendBeacon` in the component | shipped | the worker handle is added; the component still has no network call |
| M3 | CSP `connect-src` is `'self'` plus the gateway, `form-action` is `'none'`, `base-uri` is `'none'` | shipped | `connect-src` unchanged; the worker inherits it |
| M4 | `Referrer-Policy: no-referrer`, so no URL this site produces is transmitted | shipped | unchanged |
| M5 | the key crosses **one** boundary, `postMessage` to a same-origin worker, which is an in-process structured clone | new | this is the new boundary and A2 tests it |
| M6 | the wasm module has **no imported host function that can perform I/O** | new | strong, and narrower than it first looks - see below |
| M7 | the module runs in a **dedicated worker**, so its `WebAssembly.Memory` is in a realm page-realm script cannot reach | new | this is the mechanism M6 does not provide, and it is why the worker is not merely a performance choice |

**M6 is real and it is narrower than it first looks, and getting that wrong would have been the
most dangerous sentence in this document.** A wasm module can only do what its imports let it
do, so a module importing no `fetch`, no `XMLHttpRequest`, no storage accessor and no channel
but a typed result is a module that cannot itself exfiltrate - and that is checkable by a
script, from the built `.wasm`'s import section, on every build, without reading any Rust. It is
the same artefact this session decoded to prove the shared-memory constraint in 1.3.

**What M6 does not do is hide the key from JavaScript.**
`WebAssembly.Memory.prototype.buffer` hands the **entire linear memory** to JS as an ordinary
`ArrayBuffer`. Anything in the same realm holding a reference to that `Memory` object can read
every byte the module has, including the key, whatever the import section says. So M6 closes
*the module exfiltrates* and leaves *the page exfiltrates* wide open.

**M7 is what closes it, as far as it can be closed.** A dedicated worker is a separate realm:
page-realm script has no handle to the worker's `WebAssembly.Memory` and cannot read its buffer.
That turns the worker from a performance decision into a containment boundary, and it has a
direct consequence for section 1.3 - **a shared linear memory is exactly the kind of object that
can be handed across that boundary**, so the threaded build weakens M7 in a way the
single-threaded build does not. That was not the reason 1.3 recommended single-threaded, and it
is now the strongest one.

**Neither M6 nor M7 survives XSS in the worker's own script**, and no mechanism here claims to.
That is what the precondition is for.

### 5.2 What would have to be true for the claim to be false

Stated as failure conditions, because that is the form that can be tested:

1. **An imported host function can do I/O.** Closed by M6, checkable from the import section.
2. **Page-realm script reads the module's linear memory.** Closed by M7 and by nothing else;
   weakened by a shared memory. See 5.1.
3. **The glue leaks it.** `wasm-bindgen` generates JS; a `console.log` of a key argument, or an
   error path that stringifies it into an exception message an error reporter catches, defeats
   everything above. This site has no error reporter today, and adding one becomes a
   Mode-A-relevant decision.
4. **The key is written to storage.** Closed by convention today and by nothing else. Section
   5.4.
5. **XSS.** `'unsafe-inline'` on `script-src` is the standing hole and is exactly what the
   precondition removes. This is the whole reason LEDGER-04 Q5 exists.
6. **A browser extension.** More precisely than it is usually stated: an extension content
   script runs in an **isolated world** by default and therefore cannot see variables held in a
   page script's closure - so the default case is better than "an extension sees everything".
   But that isolation is the extension's to discard: injecting with `ExecutionWorld MAIN` runs
   in the page's own execution environment with no isolation at all, and `host_permissions` for
   this origin is what grants it. **No page-side mechanism prevents this**, and the session
   could find no document claiming one does. State it; do not defend against it.
7. **The bytes are not the bytes.** A compromised dependency, a rebuilt artifact, an npm fork.
   Section 2.4.
8. **The key is still in memory after the scan.** It is, and nothing available can promise
   otherwise - 5.2.1.

### 5.2.1 Why "we erase the key afterwards" is not on the list of mechanisms

Because it cannot be made true, and the canonical crate says so about itself. `zeroize` -
the Rust crate this would be built on - scopes its guarantee to **compiler optimisation only**
and explicitly disclaims: microarchitectural (Spectre-class) leakage of already-zeroized
secrets; **stack spilling**, where the optimiser leaves temporary copies of a heap-held secret
on the stack that the crate does not clear; **reallocation**, where a `Vec` or `String` backing
buffer was already copied elsewhere before the current one was cleared; and **CPU registers**,
which it states are unsolvable at crate level and need inline assembly or compiler support -
neither available to wasm in a browser. `mlock`/`mprotect` are out of scope for the crate and
are in any case not exposed to WebAssembly or JavaScript at all, so no page can pin a secret
out of swap.

On the JavaScript side the position is the same: **there is no way to force reclamation of
memory holding a secret**, because garbage collection cannot be triggered programmatically.

And the API that looks like it should help does not. WebCrypto's `extractable: false` is an
**export-prevention flag, not a memory-protection or erasure guarantee**, and the W3C Web
Cryptography specification places no normative requirement on implementations to zeroize key
material at all - it says key material may remain in device memory or storage after every
`CryptoKey` reference is gone. It is moot regardless: WebCrypto's algorithm set is closed
(RSASSA-PKCS1-v1_5, RSA-PSS, ECDSA, Ed25519, HMAC, RSA-OAEP, AES-CTR/CBC/GCM/KW, SHA-1/256/384/512,
ECDH, X25519, HKDF, PBKDF2) and **a Zcash viewing key is an application-defined type over Jubjub
and Pallas that appears nowhere in it**, so it cannot be imported as a `CryptoKey` in the first
place and non-extractability is unavailable by construction.

**So the copy must not promise erasure.** What it can honestly promise is that the key is never
persisted, never transmitted and lives in a realm the page cannot read - which is M5, M7 and 5.4,
and which is a smaller claim than "we wipe it" and has the advantage of being true.

### 5.2.2 The one argument that cuts the other way on COEP

Section 1.3 treats cross-origin isolation as a **cost**. It is also a **defence**: without the
isolation headers a browser may place a more-sensitive application in the same process as a
less-sensitive one, which is the Spectre exposure the headers exist to remove - and shared
memory and high-resolution timers were disabled across browsers in early 2018 for exactly that
reason, with `SharedArrayBuffer` re-gated behind a secure context plus COOP and COEP.

So the honest framing is a **trade**, not a cost: COOP `same-origin` (already set here) plus
COEP `require-corp` buys process isolation against a Spectre-class reader and costs every
cross-origin no-cors subresource a CORP header. It is worth noting that
`Origin-Agent-Cluster` is **not** the cheap substitute it looks like - it is explicitly not a
security feature, browsers may ignore it, and may satisfy it with separate threads rather than
separate processes.

The recommendation in 1.3 does not change, because the threaded build's shared memory weakens
M7 (5.1) and that is a larger loss than the Spectre hardening is a gain for a page whose secret
lives in a worker. But the operator deciding Q1 should see both halves.

### 5.3 The seam family, named in advance

This project has recorded five instances of one shape: **a boundary between two processes where
both sides have tests and each test builds its own input**. The WS envelope, `/v2/mempool`'s
wire form, `TipChannelPayload`'s discriminator, `ClaimAssessment`'s unsuffixed bigints, and
(as configuration rather than processes) the network-dependent default LEDGER-12 Q6 records.

**A WASM boundary is that shape twice over**, and it is worth being exact about where:

- **JS builds a fixture, Rust asserts on it.** A TypeScript test that constructs a compact
  output object and a Rust test that constructs one can both be exhaustive and both be wrong
  about the wire, because neither took the other's output.
- **The gateway serialises and the wasm deserialises.** Same shape, one layer out.
- **And a third that is specific to wasm**: numbers. A `u64` value in zatoshi crossing into JS
  through `wasm-bindgen` is a `BigInt` or a `number` depending on the binding, and this project
  has *already* been bitten by a bigint that survived a type declaration and not a round trip -
  `ClaimAssessment`'s four unsuffixed bigint fields came back as `string` where the declared
  type said `bigint`, and the `as T` cast meant the compiler never objected.

**The instrument is the one that found the fourth instance before it shipped: make one side
actually produce the value and hand it to the other.** Not a fixture that resembles one. For
Mode A that means a test where the **gateway's real serialiser** emits a range, the **real wasm
module** consumes it, and the assertion is on a decrypted note with a **known value** - and, in
the other direction, the wasm's real output crosses into JS and is asserted with `typeof`, not
with a declared type. Section 7's A3 is that assertion and section 7 says why a property test
cannot substitute for it.

### 5.4 Storage, and the anti-pattern with a name

**Nothing Mode A produces is stored. Not the key, not the notes, not a cache of the scan.**

The reason to state it as a rule rather than a default is that the ecosystem has a live
counter-example. `LeakIX/zcash-web-wallet` persists wallet records **and every decrypted note**
to `localStorage` as plain JSON with no encryption: txid, pool, output index, value,
commitment, nullifier, memo, address and spend height. That is the complete deanonymised view
of a user's shielded activity, in a bucket any injected script can read, on the same origin
that runs the code. (That project's own README says it is AI-generated experimental code, so it
is a behavioural precedent rather than an engineering one - but the storage shape is the shape.)

The contrast worth citing is WebZjs, which gets the *key* boundary right and the *data*
boundary less so: its unified full viewing key is memory-only, re-requested from the MetaMask
snap on demand and never written to `localStorage`, `sessionStorage` or IndexedDB - while the
serialised wallet database it *does* write to IndexedDB is an unencrypted `encode()` that holds
imported unified full viewing keys.

**A scan cache is the feature that will erode this**, because a rescan is slow and caching is
the obvious fix. Section 1.5's default range is partly a way to make the cache unnecessary.

### 5.5 Precedents, and what each one is evidence for

| Precedent | What it shows | What it warns |
|---|---|---|
| **ChainSafe WebZjs** | in-tab sync and trial decryption is real and has been measured | no audit (README says so), no tagged release, last commit 16 Apr 2026, builds from a librustzcash fork, needs a grpc-web proxy, ships **no CSP at all** |
| **ChainSafe MetaMask snap 0.3.0** | the exact key boundary Mode A needs: `getViewingKey` derives the spending key *inside* the sandbox and returns only the encoded **full viewing key**, after a dialog naming the requesting origin. Signing is by PCZT, never by key export | a Hacken audit dated May 2025 reportedly found 7 issues (0 critical, 0 high, 4 medium, 2 low, 1 observation) - **search-index snippet, page egress-blocked, not opened** |
| **Zecwallet Web** | a browser wallet that states its risks plainly: unaudited, browser compromise equals key loss, IP exposure enabling transaction linkage, single-threaded wasm slowness, a custom librustzcash fork as added risk surface | the upstream project is sunset and the fork is dormant; cite the warnings, not the code |
| **ZecHub "Turnstile"** | the closest analogue to a viewing-key forensics tool, and it **splits the work**: a 76 KB wasm parses and validates the UFVK in the browser (F4Jumble, bech32m, checksum, typed receivers) and refuses spending keys before anything leaves the machine | its scan is **server-side** - the key is posted to a Next.js API route that drives a zingolib scanner. That is the design Mode A exists to not be, and it is instructive that a 2026 project chose it |
| **LedgerHQ wasm** | the narrowest published precedent: a module whose only job is `decrypt_tx(raw hex, viewing key)` | no security or audit statement |
| **Zingo / zingolib** | - | **no browser or wasm target at all**, across 45 repositories in the org. There is no Zingo web precedent to cite, and this plan says so rather than implying one |

**Turnstile is the most important row**, because it is the honest alternative. A server-side
scan is faster to build, has no wasm, no CSP change, no COEP question and no bundle. It also
requires the user to post their viewing key to a server, and this site's entire argument is
that shielded data should not have to be trusted to anyone. **The plan's position: the
client-side cost is the point, and if it proves infeasible the answer is to ship no Mode A
rather than to ship Turnstile's shape under Mode A's copy.**

### 5.6 Residual risks, ranked

1. **XSS while `'unsafe-inline'` stands** - the precondition, and the only one rated high.
2. **A leak through generated glue or an error path** - low likelihood, total impact, and the
   cheapest to close by testing (A2).
3. **Supply chain on the wasm artifact** - medium, closed by pinning and hashing (2.4).
4. **A browser extension reading the page** - out of the site's control; stated, not defended.
5. **Traffic analysis on the range requests** - a scan's start height is a weak identifier.
   Mitigated by caching, by a fixed default range, and by never parameterising on anything
   user-specific.
6. **The user is on a machine they do not control** - out of scope, and the copy should not
   pretend otherwise.

---

## 6. What the ceremony must state - a design deliverable, not a copy task

HANDOFF-04a's diagnosis of these pages was that a reader gets "vibes, cryptographic
terminology, vibes, huge number, tiny explanation". The register 04a established is **claim,
explanation, evidence, visualisation** - and a screen that decrypts with a viewing key is the
single place on this site where that register matters most, because it is the one place a
reader is asked to *do* something irreversible-feeling with a secret.

Four things the screen must state, in the reader's language, before the key field is usable:

1. **What this does.** "Your key stays in this tab. The page downloads public chain data and
   tries to open each note with your key, here." Concrete verbs, no "cryptographic".
2. **What it reveals, keyed to the key type.** The existing `RevealKey` copy already does this
   well and should be kept nearly verbatim: an IVK gives *received*, an FVK gives *spent and
   therefore balance*, an OVK gives *what you sent*. The distinction between "total received"
   and "balance" is the single most important sentence on the screen and it is already written.
3. **What it does not reveal, and what it cannot protect against.** It does not reveal who sent
   to you - the sender is not in the note. It cannot protect against a compromised browser or a
   browser extension. Saying the second is not a disclaimer; it is the difference between this
   page and every wallet that implies otherwise.
4. **What the range is and what it is not.** If the default scan is the Ironwood era, the
   screen says so *before* the result, and a result reads "no notes **in blocks 3,428,143 to
   {tip}**", never "no notes". An unscanned range reported as an empty result is this project's
   own named-absence rule, on the surface where getting it wrong is worst.

Two rules from the design system apply and are worth naming so they are not rediscovered:

- **Gold is a boundary crossing, never a magnitude.** A decrypted balance is a large number and
  must not be gold for being large. If gold appears on this screen it marks the primary action
  or the moment a value crosses a pool boundary, and nothing else.
- **The result is a named absence when there is nothing.** Not an empty panel and not a zero.

---

## 7. Proposed section 5 for the build handoff

Each assertion states its **exclusion set** - the set of values the predicate claims to reject -
so a fail-side transcript can name **which member** it used, per LEDGER-09a Q2. At least one
fail side per assertion is a DATA mutation drawn from that set; where no field can hold an
excluded value the assertion is type-level and its fail side is a `@ts-expect-error`.

**A1 - the module's import section can perform no I/O.**
A script reads the built `.wasm`'s import section and fails if it names any host function
outside a declared allow-list.
*Exclusion set:* any import whose name matches a network, storage or navigation capability.
*Fail side, by data:* add one `fetch` import to a fixture module; the check fails naming it.
*Why a script and not a review:* the import section is the artefact, and this session already
decoded one to prove the shared-memory constraint, so the technique is known to work.

**A2 - no request the page makes carries any fragment of the key, across a full decrypt.**
Extends `test/e2e/reveal-key.spec.ts`, which already types a real key into a real production
build and records every request. The extension is that it now types a key **and runs a
decryption to completion** against a stubbed gateway.
*Exclusion set:* any request whose URL, headers or body contains any 24-character window of the
key. *Fail side, by data:* a build with one `fetch(url + key)` added; the spec fails naming the
request.

**A3 - the compact-output seam is proven by round trip, not by fixture.**
The **gateway's real serialiser** produces a range; the **real wasm module** consumes it and
decrypts a note whose value is known; the assertion is on that value.
*Exclusion set:* any encoding the gateway can emit that the module cannot read.
*Fail side, by data:* change one field number in the gateway's encoder; the round trip fails.
*Why not a property test:* a property over "any compact output round-trips" quantifies over
inputs *the test itself builds*, which is precisely the shape that has been green and wrong four
times here. The worked case is the instrument.

**A4 - an Ironwood note decrypts, and its lead byte is 0x03.**
A fixture carrying a known Ironwood action and a known viewing key; the decrypted note's value
matches, and the plaintext lead byte is asserted to be `0x03`.
*Exclusion set:* a decoder that reads `CompactTx.actions` (field 6) and not `ironwoodActions`
(field 9); a plaintext parser that accepts only `0x02`.
*Fail side, by data:* feed the Ironwood action to the Orchard-only path; decryption fails and
the test says so, rather than reporting an empty result.
*Why this is a fixture and not a property:* both failure modes present as "no notes", which is
indistinguishable from a correct empty result. Only a known-answer case discriminates.

**A5 - the CSP permits the module and forbids everything else, checked by executing it.**
A production build is served with the target policy and the module instantiates; the same build
with `'wasm-unsafe-eval'` removed fails to instantiate, and the console carries the violation.
*Exclusion set:* any policy under which the module runs while `script-src` still carries
`'unsafe-inline'`. *Fail side, by data:* the policy with `'unsafe-inline'` restored; the
assertion fails.
*This assertion also settles the two open CSP questions* - worker CSP inheritance, and which
instantiation paths the directive gates - because it settles them by execution, which is what
CLAUDE.md requires of a sentence making a checkable claim about runtime behaviour.

**A6 - the measured scan rate is reported with its n, before any progress UI is designed.**
Trial decryption over a named range, on a named machine and browser, single-threaded, with the
block count stated.
*Exclusion set:* a rate quoted without its sample. *Fail side:* none - this is a measurement
assertion, and its failure mode is a missing number, which the write-back check catches.

**A7 - `packages/wasm-keys` has no dependency that can reach a network or storage.**
The mirror of `check-instrument-deps.mjs`, over the new package's graph.
*Exclusion set:* any transitive dependency importing a fetch, socket or storage API.
*Fail side, by data:* add such a dependency; the guard fails naming the edge that introduced it.

**A8 - nothing is written to any storage during a full decrypt.**
The e2e spec asserts `localStorage`, `sessionStorage` and IndexedDB are empty after a
decryption completes.
*Exclusion set:* any key written to any of the three. *Fail side, by data:* a build that caches
the scan; the assertion fails naming the key.

**A9 - a partial or failed scan never renders as a completed one.**
*Exclusion set:* any render of "no notes" that does not name the height range scanned.
*Fail side, by data:* abort the scan at half the range; the panel must say so.

**A10 - the wasm artifact is fetched with SRI metadata and fails closed on mismatch.**
`fetch(url, { integrity })` with a build-time hash, handed to
`WebAssembly.instantiateStreaming`. Not a hand-rolled hash-then-instantiate: the platform
check already exists on the `Request` constructor and fails closed.
*Exclusion set:* a module instantiated from a response fetched without integrity metadata, or
from bytes whose hash does not match.
*Fail side, by data:* alter one byte of the artifact; the fetch rejects and instantiation never
runs. Second fail side, by code: remove the `integrity` option; a guard reading the call site
fails.

**A11 - the key is not readable from the page realm.**
After a decryption, page-realm script has no reference to the worker's `WebAssembly.Memory` and
no scan of any page-realm `ArrayBuffer` contains a 24-character window of the key.
*Exclusion set:* any page-realm object transitively holding the module's linear memory.
*Fail side, by data:* instantiate the module in the page realm instead of the worker and expose
its `Memory`; the assertion finds the key in `memory.buffer` and fails. That fail side is the
whole reason M7 is a mechanism and not a preference.

---

## 8. What this plan does not answer

Stated so the build handoff does not mistake a gap for a decision:

- **Whether upstream `librustzcash` compiles for `wasm32-unknown-unknown` today.** Its CI does
  not cover the target. The one existing browser build uses a fork whose diff was not read.
- **Whether `orchard` 0.15.5 handles the Ironwood `0x03` lead byte.** ZIP 2005 is Proposed.
- **Whether `zfnd/zebra:6.3.0` starts a `CompactTxStreamer` when `lightwalletd_listen_addr` is
  set.** The sibling field's server is feature-gated out of the published image; this one's
  status is unknown.
- **Any single-threaded trial-decryption rate.** No such figure exists anywhere the session
  could reach. The only measurements are ChainSafe's, at 4 threads, n=1 machine.
- **Whether a Web Worker inherits the document CSP for wasm.**
- **Whether Vercel runs proxy/middleware before or after the CDN cache lookup.**
- **The real bundle size.** 2-4 MB is an interpolation between two measured artifacts, not a
  measurement.

---

## 9. Open questions for section 8

**Q1. Threads: never, later, or now?** Section 1.3 recommends single-threaded first and names
COEP `require-corp` as a site-wide cost taken for one route. The counter-argument is that
building twice is worse than building once. The operator decides whether COEP is acceptable
site-wide.

**Q2. Fork or upstream?** If upstream `librustzcash` does not build for the browser, Mode A
either waits, uses ChainSafe's fork, or carries its own. Each is a different risk and none is
obviously right. A fourth option is worth costing: contribute the wasm CI job upstream.

**Q3. Protobuf or JSON on `/v2/compact`?** Protobuf is what every other Zcash client speaks and
what the Rust side decodes natively; JSON is what this gateway does everywhere else and what
its schemas, its `reviveWireZatoshi` convention and its tests are built for. Choosing JSON adds
an encoder on one side and a decoder on the other - which is *precisely* the seam this project
keeps getting wrong. Choosing protobuf adds a dependency and an opaque response. **The plan
leans protobuf, on the seam argument**, and asks rather than decides.

**Q4. Does the Zebra tag ceiling grow a runtime reader?** Deliverable 0a declares the ceiling in
`scripts/check-compose-zebra-tag.mjs` because it has one reader. A11 checks a *live* node's
subversion against the floor and would be the natural second reader for the ceiling - an
operator who pulls a newer image by hand is exactly the case a tag pin cannot see. Moving the
ceiling into `packages/zebra-rpc/src/version-floor.ts` makes that possible and makes the value
a two-reader quantity, which is when this project's own rule says it must be read rather than
restated.

**Q5. Does `check-instrument-deps.mjs` widen, or does `packages/wasm-keys` get a sibling?**
The two rules are the same shape - a package whose reason to exist is what its graph excludes -
and the guard already parameterises over one package. Widening risks a guard that says less
about each; a sibling risks two guards drifting. This is the origin LEDGER-09b Q3 counts, and
the count does not reset because a guard shipped.

**Q6. Is the false attribution in the `UNKNOWN_ANCHOR` diagnostic corrected, and by whom?**
Section 0 established that Zebra #10461 does not reverse the transaction-side anchor byte
order. Five live sites say it does: `packages/zec-types/src/leaks.ts:537`,
`packages/zebra-rpc/src/schemas.ts:654`, `apps/indexer/src/decoder/leak-analyzer.ts:894` and
`:904` (the latter is a **user-visible finding message**), and `docs/2.0/RUNTIME.md:215`. The
byte-reversal *detector* remains correct and useful - a node whose transaction-side anchor
spelling disagrees with the recorded roots is a real condition. What is wrong is the
attribution. **This handoff did not fix it**, because every site is under `apps/` or
`packages/` and A2 forbids this plan-only branch from touching either; correcting it inside a
handoff whose whole point is to not build would have removed the approval gate to fix a comment.
It belongs to the Integration track, which already owes round 4 on `62c4e77` (F-52-2).

**Q7. Is `/v2/compact` a Data-track handoff before Mode A, or part of the Mode A build?**
Section 3.2 recommends Source B first, which needs no migration - so it could be either. If it
is separate, the seam in A3 has to be asserted across two handoffs, and this project's record
on cross-handoff seams is the reason to ask.

---

## 10. Sources

Every URL below was fetched during the HANDOFF-13 session on 2 September 2026. Where a claim in
this document rests on a search snippet rather than a fetched page it says so at the point of
use (there is exactly one: the Hacken audit in 5.5).

**Zcash crates and protocol**
1. `https://crates.io/api/v1/crates/zcash_keys` - 0.16.1, published 2026-07-29
2. `https://crates.io/api/v1/crates/zcash_note_encryption` - 0.4.2, published 2026-07-11
3. `https://crates.io/api/v1/crates/orchard` - 0.15.5, published 2026-08-03
4. `https://crates.io/api/v1/crates/sapling-crypto` - 0.7.0, published 2026-04-21
5. `https://crates.io/api/v1/crates/zcash_primitives` - 0.30.1, published 2026-08-19
6. `https://raw.githubusercontent.com/zcash/librustzcash/main/Cargo.toml` - workspace versions, MSRV 1.88, the `rand 0.8` line
7. `https://raw.githubusercontent.com/zcash/librustzcash/main/zcash_proofs/Cargo.toml` - `bundled-prover` ~50 MiB
8. ZIP 258, "Deployment of the NU6.3 Network Upgrade" - mainnet activation 3,428,143; Draft, created 2026-06-19
9. ZIP 2005, "Ironwood Quantum Recoverability" - note-plaintext lead byte `0x03`; Proposed, created 2025-03-31
10. ZIP 225 - Sapling Output Description and Orchard Action Description field sizes
11. `compact_formats.proto`, now in `zcash/lightwallet-protocol` - `CompactTx.ironwoodActions` field 9, `ChainMetadata.ironwoodCommitmentTreeSize` field 3

**WASM toolchain**
12. `https://raw.githubusercontent.com/rust-random/getrandom/v0.2.17/src/lib.rs` - the `js` feature is the 0.2 browser opt-in
13. `https://raw.githubusercontent.com/rust-random/getrandom/master/CHANGELOG.md` - 0.3.4 (2025-10-14) removed the RUSTFLAG requirement
14. `https://github.com/rustwasm/wasm-bindgen/releases.atom` - 0.2.127, 2026-08-08
15. `https://github.com/rustwasm/wasm-pack/releases.atom` - 0.15.0, 2026-05-15
16. `https://raw.githubusercontent.com/rust-lang/rust/master/src/doc/rustc/src/platform-support/wasm32-unknown-unknown.md` - Tier 2; `std::thread::spawn` panics
17. `https://raw.githubusercontent.com/time-rs/time/main/time/Cargo.toml` - the `wasm-bindgen` feature is `dep:js-sys`

**Browser precedents**
18. `https://raw.githubusercontent.com/ChainSafe/WebZjs/main/Cargo.toml` - the `librustzcash-nu61` fork pin; `wasm-bindgen` 0.2.100
19. `https://raw.githubusercontent.com/ChainSafe/WebZjs/main/rust-toolchain.toml` - `nightly-2025-01-07`
20. `https://raw.githubusercontent.com/ChainSafe/WebZjs/main/justfile` - the exact `wasm-pack` invocation
21. `https://raw.githubusercontent.com/ChainSafe/WebZjs/main/packages/web-wallet/server.js` - COOP/COEP/CORP; no CSP
22. `https://registry.npmjs.org/@chainsafe/webzjs-keys/-/webzjs-keys-0.1.0.tgz` - measured 2,147,533 B; shared memory import
23. `https://registry.npmjs.org/@bytezhang/webzjs-wallet/-/webzjs-wallet-0.1.0-alpha.23.tgz` - measured 8,044,208 B; shared memory import
24. `https://registry.npmjs.org/@chainsafe/webzjs-wallet` - **404, the README's own import target is unpublished**

**CSP, Next.js, browser platform**
25. `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/content-security-policy/script-src/index.md` - `'wasm-unsafe-eval'`
26. `https://raw.githubusercontent.com/w3c/webappsec-csp/main/index.bs` - `EnsureCSPDoesNotBlockWasmByteCompilation`
27. `https://registry.npmjs.org/@mdn/browser-compat-data/-/browser-compat-data-8.0.13.tgz` - support matrix, n = 14 runtime entries
28. `https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/content-security-policy.mdx` - the nonce forces dynamic rendering
29. `https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/02-guides/upgrading/version-16.mdx` - `middleware` renamed to `proxy`
30. `https://github.com/vercel/next.js/issues/74319` and `https://github.com/vercel/next.js/issues/83764` - un-nonced inline styles
31. `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/cross-origin-embedder-policy/index.md` - COEP `require-corp` and `credentialless`
32. `https://registry.npmjs.org/-/package/next/dist-tags` - stable 16.3.4 (this repository pins 15.5.23)

**Zebra**
33. `https://raw.githubusercontent.com/ZcashFoundation/zebra/main/zebrad/Cargo.toml` - `default-release-binaries`; `indexer` not in it
34. `https://raw.githubusercontent.com/ZcashFoundation/zebra/main/zebra-rpc/src/config/rpc.rs` - `lightwalletd_listen_addr` exists as a field
35. `https://raw.githubusercontent.com/ZcashFoundation/zebra/main/CHANGELOG.md` - 6.3.0, 2026-08-10, the newest release
36. `git tag --contains 1c9b245` over a full clone - PR #10461 is in no released tag

**Threat model**
44. `https://raw.githubusercontent.com/RustCrypto/utils/master/zeroize/src/lib.rs` - the crate's own disclaimers: registers, stack spilling, realloc, no mlock
45. `https://raw.githubusercontent.com/w3c/webcrypto/main/spec/Overview.html` - no normative zeroization requirement; `extractable` is export-prevention
46. `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/subtlecrypto/index.md` - the closed algorithm set, which contains no Jubjub or Pallas curve
47. MDN, `WebAssembly.Memory.prototype.buffer` - the whole linear memory as an ArrayBuffer
48. MDN, `Cross-Origin-Opener-Policy` - without isolation headers a browser may co-locate a more-sensitive app with a less-sensitive one
49. MDN, `Origin-Agent-Cluster` - explicitly not a security feature
50. MDN, WebExtensions `content_scripts` and `scripting.ExecutionWorld` - isolated by default, `MAIN` defeats it, `host_permissions` grants it
51. MDN, `Request.integrity` and Subresource Integrity - `fetch(url, {integrity})` is integrity-checked; SRI's element list is closed
52. GitHub advisory database: GHSA-jcxm-7... (CVE-2024-54134, `@solana/web3.js`), CVE-2025-59038 (`prebid.js`), CVE-2021-4229 (`ua-parser-js`), GHSA-mh6f-8j2x-4483 (`event-stream`/`flatmap-stream`)

**This repository, read at `98e87a0`**
37. `apps/gateway/src/routes/index.ts:49` - `API_PREFIXES = ["/v2"]`, `/api` answers 410
38. `apps/indexer/migrations/002_candidate_analysis.sql:12` - `pool_commitments` has no ciphertext column
39. `infra/zebrad/zebrad.toml:41` - the `indexer_listen_addr` precedent
40. `apps/web/next.config.ts` - the current CSP and its stated trade-off
41. `apps/web/src/components/track/RevealKey.tsx` - M1, M2; the uncontrolled-input gate finding
42. `apps/web/test/e2e/reveal-key.spec.ts` - the existing request recorder A2 extends
43. `apps/indexer/test/fixtures/blocks/*.json` - the n=4 compact-volume measurement in 3.3

---

## Appendix A - deliverable 2: what makes registration in the finding registry non-optional

`scripts/check-finding-sites.mjs` enforces **closure** of **registered** multi-site findings: a
fix that lands in three of four named sites fails the build naming the fourth. It says nothing
about whether the registry is **complete**, because registration is manual - and a green run
looks identical either way, which is the same shape as a fail-side probe that does not fail.

**This session produced a live instance of the failure mode, which changes the answer.** The
R4-GUARDS row's `present` pattern was `/fourteen (static )?guards/i`. With `static` optional it
was satisfied at `CLAUDE.md` by the ledger sentence *"three of its fourteen guards have shipped
with a self-test that certified a hole"* - **prose about the guard population, not an assertion
of the count**. So the row went green for two handoffs while `CLAUDE.md` asserted sixteen,
`ci.yml` asserted FOURTEEN and `README.md` asserted fourteen. The registry was complete; the
row was registered; and it still could not see a tree contradicting itself at three of four
asserting sites.

**That is a different defect from the one deliverable 2 asks about, and it is the more common
one.** The question was "how do we know a finding got registered". The measured answer is that
*registration is not the binding constraint* - a registered row with a loose pattern is worth
less than no row, because it also carries a green run that a reader takes as coverage.

The four directions, costed:

**(i) A gate return format that emits multi-site findings as machine-readable rows.** Makes
registration a by-product of reporting. *Cost:* every reviewer must emit the format, and a
reviewer that dies mid-run (which has happened twice here) emits nothing. *Verdict:* good, but
it closes the weaker half.

**(ii) A check that every fingerprint named in a section 7 GATE ROUNDS line with more than one
site has a registry entry.** Moves the manual step from "remember to register" to "the
write-back does not pass". *Cost:* it parses prose, and section 7's GATE ROUNDS format is not
enforced anywhere; a guard whose input is free text is the loose-pattern shape again.
*Verdict:* the most likely to look like coverage and not be.

**(iii) Accept the bound and state it in the guard's output line.** Already half-taken - the
header states the boundary. *Cost:* none. *Verdict:* necessary, insufficient.

**(iv) NEW, and what this session recommends: make the row's own patterns carry a
discrimination test.** Every row already needs a `probe` matched by `absent` and an `antiProbe`
that is not. **What no row has is evidence that its `present` pattern is not satisfied by text
that does not assert the corrected answer.** The fix is one more required field - a
`presentAntiProbe`: a string that mentions the subject but does not assert the answer, which
`present` must **not** match. For R4-GUARDS that string is the ledger sentence itself, and the
row would have failed on the day the pattern was written.

**Recommendation: (iv) plus (iii), and not (ii).** (iv) is a finite, mechanical addition to a
data structure that already exists, it is self-testable in both directions by the same loop
that already drives `probe` and `antiProbe`, and it attacks the failure this session actually
measured rather than the one that was hypothesised. (ii) is a guard over prose and this project
has a written rule against exactly that.

---

## Appendix B - deliverable 3: a guard against assertions satisfied by every value they exclude

The shape has now reached **five** instances across five handoffs, not the three HANDOFF-13
records - and the two new ones are from this session, which is itself evidence about the
instrument.

| # | Instance | Why it was invisible |
|---|---|---|
| 1 | HANDOFF-06 Q4 - a test titled "cannot fire on an unknown fee" that passed `0n`, a *known* fee of zero | the predicate pinned the conflation instead of the behaviour |
| 2 | HANDOFF-08 A9 - `if (m.depositAmountZat > balance) return false;` over 300 fast-check runs, where `balance` was the sum of every deposit the match could be drawn from | a property quantified over an **aggregate**, checked per **element**; no generated input can falsify it |
| 3 | HANDOFF-09 - `owner.startsWith("HANDOFF-")`, satisfied by every wrong answer the field could hold | it made `UNASSIGNED`, the honest value, the only failing one |
| 4 | **HANDOFF-13, this session** - the ABOVE-CEILING message check asserted the live message contained `show(CEILING.version)` = `"6.3.0"`, which also appears in it as the **floor** and inside the ceiling's own `reason` string | deleting the ceiling from the message left the assertion satisfied by an unrelated occurrence |
| 5 | **HANDOFF-13, this session** - `check-finding-sites.mjs`'s `present: /fourteen (static )?guards/i`, satisfied at `CLAUDE.md` by prose about the guard population | see Appendix A |

**The hard part is unchanged and is why this is specified rather than built.** A detector must
distinguish a **loose** predicate from a **deliberately permissive** one, and that is judgement
rather than syntax: `expect(x).toBeDefined()` is exactly right when the subject is existence and
exactly wrong when the title claims something about the value. The signal is the relationship
between what the assertion **checks** and what its **name claims**, and neither half is
mechanically available - the name is prose and the check is an expression.

The four directions, costed:

**(i) Mutation as the instrument.** The property that distinguishes all five instances is that a
mutation of the subject leaves them green. *Cost:* a mutation harness over the whole suite;
minutes to hours per run; a CI budget this project does not have. *Reach:* total - it measures
the real property. *Verdict:* correct and unaffordable as a gate. **But affordable as a
targeted tool** - see the recommendation.

**(ii) A narrow syntactic rule aimed at instance 3.** A string assertion whose expected value is
a prefix or substring of a field with an enumerable legal domain. *Cost:* small. *Reach:*
catches 3, misses 1, 2, 4 and 5. *Verdict:* honest but narrow, and it would not have caught
either of this session's.

**(iii) A quantifier rule aimed at instance 2.** A property test whose stated property names an
aggregate while its body indexes an element. *Cost:* parses the title as prose. *Reach:* 2
only, with false positives. *Verdict:* the worst ratio of the four.

**(iv) Move the cost to the write-back.** Every section 5 assertion already needs a named worked
case; the guard checks the case is present, not that the assertion is right. *Cost:* trivial.
*Reach:* structural only, and `check-ledger-structure.mjs`'s R4 already says in its own header
that it checks a clause is PRESENT and cannot check it is CORRECT. *Verdict:* already taken; not
an answer.

**(v) NEW, and what this session recommends, drawn from instances 4 and 5: the DISCRIMINATION
PROBE.** Both new instances share a form the other three do not: **the assertion's expected
value occurs in the subject for a reason unrelated to the assertion**. `"6.3.0"` was in the
message as the floor. `"fourteen guards"` was in `CLAUDE.md` as a measurement. In both cases the
fix was the same and it was cheap: **drive the assertion against a value that shares nothing
with the surrounding text** - a synthetic ceiling of `9.1.0`, a pattern requiring the word
`static`.

Generalised, that is a rule an author can follow and a reviewer can check by eye:

> **An assertion whose expected value could plausibly occur in its subject for another reason is
> driven against a value that could not.** Where the value is fixed by the domain, the assertion
> names why no other occurrence is possible.

**Recommendation: (v) as a written rule with a named worked case, plus (i) as a targeted tool
rather than a gate** - a script that mutates *one named function* and reports which assertions
stay green, run by hand when a section 5 assertion is written, not on every commit.

**And the recommendation explicitly declines to build a guard**, which under CLAUDE.md's clause
(b) requires saying so and saying it is weaker. A guard was attempted in the analysis above and
each of (ii), (iii) and (iv) was shown to miss most of the population; (i) measures the right
thing and cannot run as a gate. **So this is a rule standing in for a guard, it is weaker, and
it is recorded as weaker.** The evidence that a rule is not a guard is in this document twice
over: instances 4 and 5 were both committed by a session that had the rule in front of it, and
both were found by *executing a mutation*, not by reading.
