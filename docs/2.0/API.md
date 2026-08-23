# Gateway read API v2

HANDOFF-05, deliverable 4. Every endpoint the Tracking suite reads, with an
example response.

**The examples are output, not prose.** They were captured by
`apps/gateway/scripts/capture-examples.mts`, which boots the real server against
a scripted node and prints what the routes actually return. Re-run it after
changing a projection:

```
pnpm --filter @zcashreveal/gateway exec tsx scripts/capture-examples.mts
```

A hand-written example drifts from the code the day after it is written, and
this project has already paid four gate rounds for the difference between a
transcript and a description.

---

## Two prefixes, and why

Every read route is served under **both `/api/*` and `/v2/*`**, registered once
so they cannot drift.

HANDOFF-05 §3 names the endpoints `/api/address/:addr`, `/api/tx/:txid` and so
on, and HANDOFF-11 §3 reads `${NEXT_PUBLIC_API_URL}/api/snapshot`. But
`apps/web`'s `HttpApi` — written and shipped by HANDOFF-04 — requests
`/v2/address/…`, `/v2/tx/…`, `/v2/pools`, `/v2/mempool`, `/v2/flows` and
`/v2/labels`. Serving only `/api` would mean the client that exists cannot reach
the gateway that exists; renaming the client's paths would be editing another
track's shipped code to match a sentence in this one's spec.

`/api` is the documented contract. `/v2` is the alias the shipped client already
uses. The disagreement is recorded in the §8 ledger for L2 to rule on, and
whichever survives, one line in `src/routes/index.ts` removes the other.

## Conventions

| | |
|---|---|
| **Zatoshi** | Always a **decimal string**, never a JSON number. JSON has no bigint, and `78183.4093 * 1e8` is `7818340929999.999` in IEEE 754. `zatSchema` in `packages/zec-types` parses the string straight back to `bigint`, so an amount is never a double at either end. |
| **Heights and counts** | JSON numbers. |
| **Hex** | Lowercase, no `0x`, validated at the RPC boundary. |
| **Dates** | A `Stamp`: `text` renders, `sortMs` sorts, `precision` says how much of the timestamp is real. A record known only to the day never renders a time (LEDGER-02 Q3). |
| **Validation** | Every 2xx body is parsed through its Zod DTO from `packages/zec-types` **before** it is sent. A response that does not satisfy its own contract is a 500, not a malformed 200. |
| **CORS** | `GATEWAY_CORS_ORIGIN`, a comma-separated allow list or `*`. `*` is accepted: this is a read-only public API and some deployments legitimately want it. |
| **Rate limit** | Per IP, `GATEWAY_RATE_LIMIT_MAX` requests per `GATEWAY_RATE_LIMIT_WINDOW_MS` (default 100 / 10 s). Over it: `429`, with `x-ratelimit-*` and `retry-after` headers. |
| **Request id** | Echoed as `x-request-id` on every response. A caller-supplied one is honoured, so a trace can span the tunnel between the site and the VPS — the one hop nobody can watch from either end. |

### Status codes, and the distinction that matters

| Code | Means |
|---|---|
| `200` | The answer. |
| `400` | The request is malformed. The body carries `error` and a Zod-shaped `issues` list. |
| `404` | **The chain does not have it.** A real answer, which `HttpApi` turns into `null` and a page renders as a stated gap. |
| `413` | A bound was exceeded — see `GATEWAY_MAX_FUNDING_LOOKUPS`. The body names the bound. |
| `429` | Rate limited. |
| `500` | The gateway's own defect, including a DTO violation. |
| `501` | Understood and not implemented yet (`/snapshot`). |
| `502` / `504` | **The node refused, or did not answer.** Never a 404: a gateway that answered 404 for an unreachable node would have every page quietly reporting that the chain is empty. |
| `503` | The resource exists but part of its content is not produced yet (`/pools`). The body names what is missing and which handoff owns it. |

No error body carries a node URL, a credential or an internal hostname. That is
assertion A7, and it is checked on failing responses as well as successful ones,
because a message is where one would leak.

---

## `GET /healthz`

```json
{ "ok": true, "ts": 1787493630483 }
```

## `GET /api/search?q=`

What a query string is, by shape alone. No network call, and no database lookup.

> **A viewing key must never reach this endpoint.**
> `ZecApi.searchKind` is synchronous and local precisely so that recognising a
> viewing key involves no network at all, and `apps/web` classifies in the
> browser and never calls this. The endpoint exists for non-browser consumers.
> A key that arrives here anyway is never logged (`q` is redacted in the logger
> config, unconditionally, not per-route) and is never echoed in the response —
> but nothing can un-send it: it is already in the client's history and in any
> proxy's access log. **No client of this site should ever call this endpoint
> with a viewing key.**

```
GET /api/search?q=t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo -> 200
{ "kind": "transparent", "href": "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo" }

GET /api/search?q=3456227 -> 200
{ "kind": "height", "href": "/block/3456227" }
```

`kind` is one of `transparent | shielded | viewing-key | txid | height |
unknown`. A viewing key resolves to `/reveal` with **no query string and no
fragment**: a URL carrying a key would be written to history and to every
subsequent referrer header.

An empty or absent `q` is a `400`.

## `GET /api/address/:addr`

`AddressView`, from Zebra's address index.

**What it can say:** the balance, the total received and the total spent,
exactly, for the whole history — `getaddressbalance` answers over the node's
index, not over the window the view pages through. The UTXO count, exactly. And,
for the transactions in the window, each one's gross credit and debit for this
address, its direction, and whether it crossed the shielded boundary.

**What it cannot:** anything about the shielded side beyond the fact that value
crossed. Every boundary transaction's `estimate` is `null` until HANDOFF-08
ships the estimators, and `poolNote` says so. The DTO makes an estimate carry its
filters, its `nEff` and its assumptions precisely so that one cannot be invented.

**The window is stated, never hidden.** `getaddresstxids` returns every txid an
address ever touched and the lockbox has thousands. The view reads the most
recent `GATEWAY_ADDRESS_TX_LIMIT` (default 50) and `note` says so; every total
above the table is for the whole history.

```json
{
  "address": "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
  "network": "mainnet",
  "script": "p2sh",
  "scriptText": "P2SH - pay to script hash",
  "label": {
    "label": "ZIP 271 lockbox disbursement multisig",
    "labeller": "consensus",
    "rank": 1,
    "method": "ZIP 271 writes this address verbatim into the consensus rules ...",
    "confidence": "high",
    "lastVerified": "2026-08-22",
    "sources": ["S-zcash-improvement-proposals-zip-0271", "..."],
    "balanceZat": "7818340930000"
  },
  "balanceZat": "7818340930000",
  "receivedZat": "7818340930000",
  "sentZat": "0",
  "netToPoolZat": "0",
  "balanceNote": "Unspent output total across 1 UTXO, read from the node's address index.",
  "sentNote": "Received less balance. Derived, not summed from the window below.",
  "balances": [ { "height": 3455999, "balanceZat": "0", "event": null, "crossing": false }, "..." ],
  "transactions": [ "..." ],
  "reasoning": [
    { "title": "The address was decoded, not pattern-matched", "confidence": "high", "body": "..." },
    { "title": "Nothing here is a claim about who controls this address", "body": "..." },
    { "title": "The pool side is not estimated here", "confidence": null, "body": "..." }
  ],
  "note": null,
  "exactness": "exact"
}
```

Every label carries its `labeller` and its precedence `rank` (1 = consensus,
5 = behaviour). CLAUDE.md requires the precedence to be displayed; a label
without it is an identity claim.

**Addresses are decoded, not pattern-matched** — base58check or bech32m, with the
checksum verified and the version bytes read. That yields two different
rejections for two different questions:

```
GET /api/address/t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8 -> 400
{
  "error": "not on this network",
  "issues": [{ "path": "addr", "message": "this is a testnet address and this gateway reads mainnet" }]
}
```

The same address is served with `200` by a gateway with
`GATEWAY_NETWORK=testnet`, which is what makes the rejection about the network
rather than about the string. An address whose checksum does not verify gets
`"error": "not a transparent address"` instead.

## `GET /api/tx/:txid`

`TxView`. Public fields from the node; `leakClass`, `severity` and the wallet
tell from the indexer's `leak_reports` row where it has one, and
`"NOT_CLASSIFIED"` where it does not — never a class computed down a second code
path.

**The fee is computed.** No node sends one on `getrawtransaction`: Zebra's
`TransactionObject` has no such field and neither does zcashd's, because a fee is
the difference between the value a transaction consumes and the value it
produces, and the consumed value lives in the outputs it spends. So a fee costs
one lookup per distinct funding transaction, bounded by
`GATEWAY_MAX_FUNDING_LOOKUPS` (default 256). Where a funding transaction cannot
be resolved — a pruned node — the metric's note says the figure is a **lower
bound** rather than reporting a number computed from a subset.

```json
{
  "txid": "abab...abab",
  "version": "v5",
  "height": 3456000,
  "stamp": { "text": "2025-08-22 22:00:00", "precision": "second", "sortMs": 1755900000000 },
  "leakClass": "NOT_CLASSIFIED",
  "severity": "INFO",
  "summary": "Coinbase at height 3,456,000. Protocol issuance and the ZIP 1014 and ZIP 271 splits, crossing no pool boundary.",
  "deltas": [{ "pool": "transparent", "deltaZat": "7818340930000" }],
  "metrics": [
    { "label": "fee", "value": "0.00000000 ZEC", "accent": false,
      "note": "A coinbase pays no fee. Its outputs are created by issuance rather than by spending, so there is no input total to take a difference from." },
    { "label": "logical actions", "value": "1", "accent": false, "note": "ZIP 317: ..." },
    { "label": "conventional fee", "value": "not priced", "accent": false,
      "note": "ZIP 317 prices the transactions a wallet builds. A coinbase is built by the consensus rules and pays nothing." },
    { "label": "across the boundary", "value": "none", "accent": false, "note": "..." }
  ],
  "publishes": [ { "k": "expiry height", "v": "3,456,040", "muted": false }, "..." ],
  "estimate": null,
  "roundTrip": [],
  "feeZat": "0",
  "logicalActions": 1,
  "conventionalFee": false
}
```

`accent: true` appears on exactly one metric and only when value actually crossed
a pool boundary — gold's third licensed job. A magnitude that crossed nothing is
not it (LEDGER-04 Q1b).

```
GET /api/tx/<62 hex characters> -> 400
{ "error": "not a transaction id",
  "issues": [{ "path": "txid", "message": "a txid is 64 hex characters with no 0x prefix" }] }
```

A well-formed txid the chain does not have is a `404`. "There is no such
transaction" and "that is not a transaction id" are different statements, and
only one of them is about the chain.

## `GET /api/block/:height`

`BlockView`, from one `getblock` verbosity-2 call — at verbosity 2 the `tx` array
is full transaction objects, so every row is read from the same response rather
than fetched one at a time.

**The coinbase split is read, not assumed.** ZIP 1014, ZIP 1015 and ZIP 271 each
changed where the block subsidy goes, and HANDOFF-04's gate caught a hardcoded
split the corpus contradicted by a factor of 3.3. The `coinbase.lines` are the
coinbase's actual outputs with their actual values, labelled where the Record
labels the destination.

```
GET /api/block/-1 -> 400
{ "error": "not a block height",
  "issues": [{ "path": "height", "message": "a block height is not negative" }] }
```

A height above the tip is a `404`, because that **is** a statement about the
chain: the node answers `-8`, and the gateway maps it.

## `GET /api/pools/balances`

Live per-pool balances, and the one endpoint HANDOFF-09's publisher will read.

**Six pools on the wire, five lanes on the site.** Zebra 6.3.0's `valuePools` is
a fixed array of six — transparent, sprout, sapling, orchard, **lockbox**,
ironwood — and `LedgerLane` has five. The ZIP 271 lockbox is not a pool: it is
the protocol's own reserve, and folding it into "transparent" would overstate the
transparent supply while hiding a balance this site has an argument about. It is
carried separately and named. An unrecognised pool id is a `500`, not a silent
drop: a future network upgrade adding a pool must not vanish from a page whose
entire subject is where the value is.

```json
{
  "atHeight": 3456227,
  "source": "zebra getblockchaininfo valuePools, read at the height above",
  "lanes": [
    { "lane": "transparent", "zat": "1250022300000000", "share": 0.736686, "rule": "Public. Every balance and every movement is readable by anyone." },
    { "lane": "sprout",      "zat": "2262100000000",    "share": 0.001333, "rule": "The original shielded pool. Its soundness rested on BCTV14 ..." },
    { "lane": "sapling",     "zat": "52901500000000",   "share": 0.031176, "rule": "Shielded. Balances are not readable; the value entering and leaving the pool is." },
    { "lane": "orchard",     "zat": "70884100000000",   "share": 0.041774, "rule": "Shielded, and the pool the 2026 inflation bug was found in." },
    { "lane": "ironwood",    "zat": "312928700000000",  "share": 0.184421, "rule": "Shielded, from NU6.3. Orchard value migrates into it and does not migrate back." }
  ],
  "lockboxZat": "7818340930000",
  "totalZat": "1696817040930000",
  "note": "Read from the node at height 3,456,227. The ZIP 271 lockbox holds 78,183.4093 ZEC and is reported separately ..."
}
```

`share` is floating point and exists only for display. The zatoshi figure beside
it is the exact one, and nothing is derived from the share.

## `GET /api/pools` — 503 until HANDOFF-09

`poolsViewSchema` requires four structures no chain query can produce. Two are
analysis (HANDOFF-08's estimators and note survey) and two are published through
the snapshot (HANDOFF-09's). Filling them with plausible numbers is the one thing
this project must not do, and filling them with zeros would be a claim that the
counts *are* zero.

So the endpoint answers `503` and names what is absent:

```json
{
  "error": "the full pools view needs blocks this gateway cannot compute yet",
  "detail": "The chain-derived half is served at /pools/balances and is included below. The rest arrives with the snapshot.",
  "missing": [
    { "block": "history",       "owner": "HANDOFF-09", "why": "A long per-pool balance series ..." },
    { "block": "unsoundBands",  "owner": "HANDOFF-09", "why": "The windows in which a pool's soundness rested on a broken proof system ..." },
    { "block": "denominations", "owner": "HANDOFF-08", "why": "The Sprout residual's denomination histogram ..." },
    { "block": "neff",          "owner": "HANDOFF-08", "why": "The distribution of claim levels across spends ..." }
  ],
  "balances": { "...": "the /pools/balances body, inline" }
}
```

This follows the handoff sequence rather than fighting it: HANDOFF-11, the
cutover, depends on 05, 09 and 10 together, so a `/pools` page that is complete
only after 09 is the order the plan asks for.

## `GET /api/mempool`

`MempoolView`, from `zcashreveal:mempool:live` on the **VPS-local** Redis — the
hash the indexer maintains as it watches the mempool — and not from
`getrawmempool`. The indexer has already decoded, classified and annotated each
transaction; re-deriving any of it here would mean two code paths that can
disagree about the same transaction on the same page.

Nothing on this path touches the Vercel-managed Redis. `zecreveal:snapshot:*`
lives there, is written only by the publisher, and per-transaction traffic must
never leave the VPS.

With no Redis configured the view is empty and the summary says so in words,
because an empty mempool and an unreachable indexer look the same to a reader.

## `GET /api/flows`

`FlowsView` — the Tracking side of the Record's `/flows`, as a **summary, not a
second copy**. The Record page holds the rich rows with their provenance;
HANDOFF-03's ledger records what happens when one fact lives in two files.

## `GET /api/labels`

Every address label from `packages/content`, filtered to `GATEWAY_NETWORK`, each
with its `labeller`, its precedence `rank`, its `method`, its `confidence`, its
`lastVerified` and its `sources`.

## `GET /api/cases`

The golden cases from `packages/content`, with each step's `amountZat` as an
exact zatoshi string. 29,999.99 ZEC is `"2999999000000"`; through a float it is
2999998999999.9995, which is why the conversion is string arithmetic.

## `GET /api/snapshot` — 501 until HANDOFF-09

```json
{
  "error": "the snapshot is not produced yet",
  "detail": "HANDOFF-09 adds the publisher that writes zecreveal:snapshot:* and this endpoint then serves it. Until it does, a client must fall through to its next source rather than treat this as an empty snapshot.",
  "owner": "HANDOFF-09"
}
```

`501`, deliberately. A `404` would be wrong — the resource exists and is planned
— and a `200` carrying an empty object would be worse: `apps/web`'s snapshot
store falls through four sources in order, and an empty `200` would satisfy the
gateway source and stop it falling through to the bundled fixture.

## `WS /stream`

Live mempool frames, in the `{ channel, payload }` envelope the v0.2 dashboard's
`WsClient` dispatches on. Each client gets a snapshot frame on connect.

Capped at `GATEWAY_WS_MAX_CONNECTIONS` (default 500). The connection that would
exceed the cap is closed with **1013, Try Again Later**, and never added to the
fan-out set — so a refused client costs one close frame and no ongoing work.
1013 rather than 1008 (policy violation) or 1011 (internal error): it tells a
client to back off and retry, and `apps/web`'s socket reconnects with a seeded
backoff, so a refusal is a delay rather than a dead panel.

HANDOFF-11 reconciles this envelope with the `ZecFrame` union `apps/web`'s
`ZecSocket` reads.

---

## The cache

Cache-aside over the two tables migration `003a_gateway_cache.sql` adds, in the
shared Postgres database.

| Table | Holds | TTL |
|---|---|---|
| `tx_cache` | A transaction body as JSONB, plus its height (`NULL` in the mempool — height 0 would read as genesis) | `GATEWAY_TX_CACHE_TTL_S`, default 3600 |
| `address_cache` | Balance, received, spent, UTXO count, first and last seen. Amounts are `NUMERIC(20,0)` and round-trip as strings, so a thirteen-digit zatoshi is exact | `GATEWAY_ADDRESS_CACHE_TTL_S`, default 60 |

**Invalidation is by age, not by event.** The gateway does not observe reorgs, so
the only honest guarantee is "at most TTL seconds old". A TTL of `0` disables the
cache entirely, and that is the documented way to turn it off.

**The txid list is deliberately not cached** alongside the balances. A cached
balance is at most one TTL stale; a cached txid list would silently drop a
transaction that arrived inside the TTL, and the table would then disagree with
the balance above it on the same page.

## Configuration

Every variable, with its default. Secrets only via the environment; the root
`.env.example` documents each one.

| Variable | Default | Notes |
|---|---|---|
| `GATEWAY_HOST` | `0.0.0.0` | |
| `GATEWAY_PORT` | `8080` | |
| `GATEWAY_CORS_ORIGIN` | `http://localhost:5173` | Comma-separated, or `*` |
| `GATEWAY_LOG_LEVEL` | `info` | |
| `GATEWAY_NETWORK` | `mainnet` | Decides which address prefixes are accepted |
| `ZEBRAD_RPC_URL` | `http://127.0.0.1:8232` | Loopback-bound in `docker-compose.yml` |
| `ZEBRAD_RPC_USER` / `ZEBRAD_RPC_PASSWORD` | `zcashreveal` / `changeme` | Ignored by a Zebra with `enable_cookie_auth=false` |
| `ZEBRAD_RPC_TIMEOUT_MS` | `10000` | Per attempt |
| `ZEBRAD_RPC_RETRIES` | `2` | Transport failures only — never a JSON-RPC error, never a schema failure |
| `DATABASE_URL` | local Postgres | `leak_reports` and the cache tables |
| `REDIS_URL` | `redis://localhost:6379` | **VPS-local**: pub/sub and `zcashreveal:mempool:live` |
| `RATE_LIMIT_REDIS_URL` | unset | Unset means an in-process store and exactly **two** Redis connections. Setting it opens a third, which is right for several processes sharing one budget and wrong for one |
| `GATEWAY_RATE_LIMIT_MAX` | `100` | Per IP |
| `GATEWAY_RATE_LIMIT_WINDOW_MS` | `10000` | |
| `GATEWAY_WS_MAX_CONNECTIONS` | `500` | Over it: close 1013 |
| `GATEWAY_ADDRESS_CACHE_TTL_S` | `60` | `0` disables |
| `GATEWAY_TX_CACHE_TTL_S` | `3600` | `0` disables |
| `GATEWAY_ADDRESS_TX_LIMIT` | `50` | Max 500 |
| `GATEWAY_MAX_FUNDING_LOOKUPS` | `256` | Beyond it, a `413` naming the bound rather than a fee computed from a subset |

`SNAPSHOT_REDIS_*` is **not** here and must never be. It addresses the
Vercel-managed Marketplace store, which holds `zecreveal:snapshot:*` only, is
written by the publisher and read by `apps/web`. Putting it on the gateway's hot
path would send per-transaction traffic off the VPS.

## The Zebra client

`packages/zebra-rpc`. Typed, Zod-validated, with per-attempt timeouts and a retry
policy that distinguishes three failures: a **transport** failure retries with a
doubling backoff; a **JSON-RPC error** does not, because "Transaction not found
in mempool or best chain" is a fact about the chain and retrying it turns a
correct instant 404 into a slow one; a **schema** failure does not, because the
shape is the shape.

Every schema was read from Zebra 6.3.0 at commit
`1c9b2450349b53232e2787bef62dd0e21b10e041` (2026-08-22) — the Rust source and the
`insta` snapshots, which are the actual serialised JSON. Four of Zebra's own doc
comments contradict its serialisation code; each is recorded at the schema it
affects. The four that matter to a client:

1. **`getaddressbalance` does return `received`.** Its doc comment says it does
   not. Both fields are zatoshi.
2. **`getblock`'s selector must be a JSON string, even for a height.**
   `hash_or_height` is typed `String`; a bare number fails to deserialise.
3. **`getrawtransaction`'s verbosity is `u8`, not `bool`.** A client sending
   `true` fails to deserialise. Send `1`.
4. **`getblock`'s `size` is present at verbosity 1 as well as 2.** In 6.3.0 the
   only structural difference between the two is the element type of `tx`.

And one that matters to this repository: the wire spells `expiryheight` and
`versiongroupid` all lowercase, while `RpcTransaction` declares `expiryHeight`
and `versionGroupId`. The client maps the wire spelling onto the declared name at
the boundary — see HANDOFF-05 §7 for what that repaired.
