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

## One prefix. `/v2` is the API, and `/api` answers 410

Every read route is served under **`/v2/*`** and nothing else.

**What this resolves.** HANDOFF-05 mounted every route under BOTH `/api` and
`/v2`, because its own spec named `/api/...` while `apps/web`'s `HttpApi` -
written and shipped by HANDOFF-04 - requests `/v2/...`. Serving only one would
have broken the other at the cutover, so both were served from one registration
and the disagreement was raised as LEDGER-05 Q1.

**L2 ruled, and the argument is about what the word means:** "`/api` is not a
version, it is a category, and the moment a v3 exists the name lies." HANDOFF-11
deletes it.

**A request to any path under `/api` answers `410 Gone`, never 404.** A 404 says
the route never existed; a client still sending `/api` needs to be told where
the API went rather than left to guess at a network fault. 410 is permanent,
cacheable by default where 404 is not, and distinguishes a retired path from a
typo - which is the distinction a caller has to act on.

```
GET /api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo
410 Gone

{
  "error": "the /api prefix is gone; this API is /v2",
  "detail": "GET /api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
  "moved": "/v2/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo"
}
```

`moved` is built from the path the caller sent, so it names the exact request
they should have made. **The query string is dropped from both `detail` and
`moved`**, on the same rule as the 404 branch beside it: a viewing key that
arrives as `?q=` must be neither logged nor echoed, and a new branch in that
handler is precisely where the leak it closed would come back.

A path that was never served is still a **404**. Saying `410` about one would
be as false as saying `404` about a path that was retired.

## Conventions

| | |
|---|---|
| **Zatoshi** | Always a **decimal string**, never a JSON number. JSON has no bigint, and whether a given ZEC decimal survives a double is a property of that decimal rather than of the conversion: `78183.4093 * 1e8` is exactly `7818340930000`, but `163.17 * 1e8` is `16316999999.999998` — two zatoshi short. `zatSchema` in `packages/zec-types` parses the string straight back to `bigint`, so an amount is never a double at either end. |
| **Heights and counts** | JSON numbers. |
| **Hex** | Lowercase, no `0x`, validated at the RPC boundary. |
| **Dates** | A `Stamp`: `text` renders, `sortMs` sorts, `precision` says how much of the timestamp is real. A record known only to the day never renders a time (LEDGER-02 Q3). |
| **Validation** | Every 2xx body is parsed through a Zod DTO **before** it is sent. A response that does not satisfy its own contract is a 500, not a malformed 200. Most come from `packages/zec-types`; `/v2/search` and `/v2/pools/balances` are not views the Tracking pages render, so their shapes are declared beside their routes rather than being the two 200s that leave unchecked. `/healthz` carries no data. |
| **CORS** | `GATEWAY_CORS_ORIGIN`, a comma-separated allow list or `*`. `*` is accepted: this is a read-only public API and some deployments legitimately want it. |
| **Rate limit** | `GATEWAY_RATE_LIMIT_MAX` requests per `GATEWAY_RATE_LIMIT_WINDOW_MS` (default 100 / 10 s), keyed on `req.ip`. Over it: `429`, with `x-ratelimit-*` and `retry-after` headers. **Per reader only if `GATEWAY_TRUSTED_PROXIES` names the proxy** — behind a tunnel with it unset, every reader shares one bucket. |
| **Request id** | Echoed as `x-request-id` on every response. A caller-supplied one is honoured, so a trace can span the tunnel between the site and the VPS — the one hop nobody can watch from either end. |
| **Logging** | The request serialiser writes the method, the request id and the **path**. The query string is dropped entirely and any viewing-key-shaped run is replaced, in the path and in error messages alike. `authorization` and `cookie` headers are removed rather than censored: a censored line still records that a credential was presented and how long it was. |

### Status codes, and the distinction that matters

| Code | Means |
|---|---|
| `200` | The answer. |
| `400` | The request is malformed. The body carries `error` and a Zod-shaped `issues` list. |
| `404` | **The chain does not have it.** A real answer, which `HttpApi` turns into `null` and a page renders as a stated gap. |
| `413` | A bound was exceeded — see `GATEWAY_MAX_FUNDING_LOOKUPS`. The body names the bound. |
| `429` | Rate limited. |
| `500` | The gateway's own defect, including a DTO violation. |
| `501` | Understood and not implemented yet. **No route returns this any more** — `/v2/snapshot` was the only one and HANDOFF-09 implemented it. The row stays because the code is still meaningful for a future stub; a route that returns it is claiming it has no implementation at all. |
| `502` / `504` | **The node refused, or did not answer.** Never a 404: a gateway that answered 404 for an unreachable node would have every page quietly reporting that the chain is empty. |
| `503` | The resource exists but its content is not produced yet (`/pools`, `/snapshot`). The body names what is missing: for `/pools` the blocks and where each is routed, for `/snapshot` a `reason` of `absent`, `unreadable`, `malformed` or `invalid`. |

No error body carries a node URL, a credential or an internal hostname. That is
assertion A7, and it is checked on failing responses as well as successful ones,
because a message is where one would leak.

A `404` for an unmatched route names the method and the **path only**. Fastify's
default not-found body is `Route ${method}:${request.url} not found` with the URL
verbatim, query string included, so `GET /v2/nope?q=uview1...` returned the
viewing key in the body — the same leak `/v2/search` is built to avoid,
reachable by a typo.

---

## `GET /healthz`

```json
{ "ok": true, "ts": 1787493630483 }
```

## `GET /v2/search?q=`

What a query string is, by shape alone. No network call, and no database lookup.

> **A viewing key must never reach this endpoint.**
> `ZecApi.searchKind` is synchronous and local precisely so that recognising a
> viewing key involves no network at all, and `apps/web` classifies in the
> browser and never calls this. The endpoint exists for non-browser consumers.
> A key that arrives here anyway is not echoed in the response and is not
> written to the log: the request serialiser records the method and the PATH,
> drops the query string entirely, and replaces any key-shaped run anywhere in
> what remains. That is assertion A9, checked on the body, the headers and every
> emitted log line, with the fail side restoring Fastify's default serialiser to
> prove the assertion can fail.
>
> **Two things this cannot do.** It cannot un-send the key: it is already in the
> client's history and its referrer headers. And it cannot reach a reverse proxy
> — `cloudflared`, nginx and every load balancer log full URLs by default, which
> is a third copy of the exposure that belongs to the VPS runbook (HANDOFF-10).
> **No client of this site should ever call this endpoint with a viewing key.**

```
GET /v2/search?q=t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo -> 200
{ "kind": "transparent", "href": "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo" }

GET /v2/search?q=3456227 -> 200
{ "kind": "height", "href": "/block/3456227" }
```

`kind` is one of `transparent | shielded | viewing-key | txid | height |
unknown`. A viewing key resolves to `/reveal` with **no query string and no
fragment**: a URL carrying a key would be written to history and to every
subsequent referrer header.

An empty or absent `q` is a `400`.

## `GET /v2/address/:addr`

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

**`netToPoolZat` is what CROSSED, not what the address spent.** A shield that
spends a 120,552.69 output to put 30,000 into a pool takes 90,552.69 straight
back as change; summing the gross debit would report the larger figure and
overstate a headline number four-fold. The quantity is the pools' own value
balance, negated.

**A balance the transactions do not account for is SHOWN, not absorbed.** The
opening point of the balance chart is worked backwards from the current balance
less every movement in the window - it has to be, because the window holds the
most recent transactions and there is no way to read what came before it. When
the window *is* the whole history that opening balance must be zero, and when it
is not, the node and the arithmetic disagree about this address. The chart says
so in the point's `event` rather than drawing the difference as a starting
balance.

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
  "netToPoolNote": "No transaction in the window moved value across a pool boundary.",
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
GET /v2/address/t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8 -> 400
{
  "error": "not on this network",
  "issues": [{ "path": "addr", "message": "this is a testnet address and this gateway reads mainnet" }]
}
```

The same address is served with `200` by a gateway with
`GATEWAY_NETWORK=testnet`, which is what makes the rejection about the network
rather than about the string. An address whose checksum does not verify gets
`"error": "not a transparent address"` instead.

## `GET /v2/tx/:txid`

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
  "txid": "2222...2222",
  "version": "v5",
  "height": 3456000,
  "stamp": { "text": "2025-08-22 22:00:00", "precision": "second", "sortMs": 1755900000000 },
  "leakClass": "NOT_CLASSIFIED",
  "severity": "INFO",
  "summary": "30,000.0000 ZEC entered orchard.",
  "deltas": [
    { "pool": "transparent", "deltaZat": "3000000000000" },
    { "pool": "orchard",     "deltaZat": "-3000000000000" }
  ],
  "metrics": [
    { "label": "fee", "value": "0.00015000 ZEC", "accent": false,
      "note": "Computed from the outputs this transaction spends. No node reports a fee on getrawtransaction." },
    { "label": "logical actions", "value": "3", "accent": false,
      "note": "ZIP 317: the greater of the serialised input bytes over 150 and the serialised output bytes over 34, each rounded up, plus twice the joinsplits, plus the greater of the Sapling spends and outputs, plus every Orchard and Ironwood action." },
    { "label": "conventional fee", "value": "yes", "accent": false,
      "note": "ZIP 317 would price this at 0.00015000 ZEC." },
    { "label": "across the boundary", "value": "30,000.0000 ZEC", "accent": true,
      "note": "Value entered a shielded pool." }
  ],
  "publishes": [ { "k": "expiry height", "v": "3,456,040", "muted": false }, "..." ],
  "estimate": null,
  "roundTrip": [],
  "feeZat": "15000",
  "logicalActions": 3,
  "conventionalFee": true
}
```

**`feeZat` AND `conventionalFee` ARE BOTH NULLABLE, and this example is the case
where they are known.** No node reports a fee: it is the difference between the
outputs a transaction spends and what it pays out, and the spent outputs are not
in the response. The gateway resolves them, and that resolution can fail - an
unsynced node, a parent still propagating, a v6 bundle this build cannot decode.
When it does, `feeZat` is `null`, `conventionalFee` is `null`, and the two
metric tiles read "not priced" and "cannot say".

A client must render an absence rather than a zero. This example used to show
`"feeZat": "0"` with `"conventionalFee": false`, annotated as a computed figure,
and it was neither: ZIP 317's conventional fee has a floor of 10,000 zatoshi, so
a transaction that genuinely paid nothing would be remarkable rather than
routine, and `false` there was a verdict derived from a measurement never taken.
The example now shows a transaction that paid the conventional fee for its three
logical actions.

**The two deltas mirror each other.** `poolDeltaSchema` fixes the sign as
"positive leaves the pool", so a shield shows the transparent lane losing what
the orchard lane gains. An earlier version computed the transparent delta as
`outputs - inputs`, which rendered both lanes NEGATIVE for a shield and both
POSITIVE for a deshield - two pools each receiving, or each losing, the same
30,000 ZEC in a transaction that moved it from one to the other. The fee is not
in this figure: it leaves the transparent lane for a miner without crossing a
pool boundary, and it is its own metric.

**`logicalActions` is ZIP 317's definition, taken from Zebra's implementation
of it** (`zebra-chain/src/transaction/unmined/zip317.rs`), not a count of inputs
and outputs. Sapling contributes the *maximum* of its spends and outputs, not
their sum; joinsplits count double; and the transparent side is measured in
bytes against a standard size, so a P2SH multisig input costs more than one
action. `apps/indexer/src/decoder/fingerprint.ts` computes it a fourth way and
the two disagree for any transaction with more than one input or output -
correcting the indexer is HANDOFF-08's, and the divergence is in the §8 ledger.

`accent: true` appears on exactly one metric and only when value actually crossed
a pool boundary — gold's third licensed job. A magnitude that crossed nothing is
not it (LEDGER-04 Q1b).

```
GET /v2/tx/<62 hex characters> -> 400
{ "error": "not a transaction id",
  "issues": [{ "path": "txid", "message": "a txid is 64 hex characters with no 0x prefix" }] }
```

A well-formed txid the chain does not have is a `404`. "There is no such
transaction" and "that is not a transaction id" are different statements, and
only one of them is about the chain.

## `GET /v2/block/:height`

`BlockView`, from one `getblock` verbosity-2 call — at verbosity 2 the `tx` array
is full transaction objects, so every row is read from the same response rather
than fetched one at a time.

**The coinbase split is read, not assumed.** ZIP 1014, ZIP 1015 and ZIP 271 each
changed where the block subsidy goes, and HANDOFF-04's gate caught a hardcoded
split the corpus contradicted by a factor of 3.3. The `coinbase.lines` are the
coinbase's actual outputs with their actual values, labelled where the Record
labels the destination.

```
GET /v2/block/-1 -> 400
{ "error": "not a block height",
  "issues": [{ "path": "height", "message": "a block height is not negative" }] }
```

A height above the tip is a `404`, because that **is** a statement about the
chain: the node answers `-8`, and the gateway maps it.

## `GET /v2/pools/balances`

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

## `GET /v2/pools` — 503 while four blocks have no producer

`poolsViewSchema` requires four structures no chain query can produce. Filling
them with plausible numbers is the one thing this project must not do, and
filling them with zeros would be a claim that the counts *are* zero.

So the endpoint answers `503` and names what is absent:

```json
{
  "error": "the full pools view needs blocks this gateway cannot compute yet",
  "detail": "The chain-derived half is served at /pools/balances and is included below. The rest arrives with the snapshot.",
  "missing": [
    { "block": "history",       "owner": "HANDOFF-12",  "why": "A long per-pool balance series ..." },
    { "block": "unsoundBands",  "owner": "UNASSIGNED",  "why": "The windows in which a pool's soundness rested on a broken proof system ..." },
    { "block": "denominations", "owner": "UNASSIGNED",  "why": "The Sprout residual's denomination histogram ..." },
    { "block": "neff",          "owner": "HANDOFF-11",  "why": "The distribution of claim levels across spends ..." }
  ],
  "balances": { "...": "the /pools/balances body, inline" }
}
```

**`owner` DECAYS AND THIS DOCUMENT IS WHERE IT WAS FIRST WRITTEN DOWN.** Until
HANDOFF-09's gate, two entries named HANDOFF-09 and two HANDOFF-08 — both long
shipped without closing them, so a live API was telling its callers that a
closed handoff owed them a field. A number here is a *prediction*, and a
prediction that outlives its subject reads as a fact. `UNASSIGNED` is now a legal
value and is the honest one wherever no open handoff's scope covers the block:
`unsoundBands` is a Record claim for `packages/content` and `denominations` needs
a Sprout note survey, and nothing open owns either. `history` needs the persisted
per-pool series HANDOFF-12's `PoolState` work produces — HANDOFF-09's snapshot
carries `pools` at the tip only. `neff`'s estimator now exists (HANDOFF-09's
`ironwood-birth.ts`, published as the snapshot's `neffSeries`); what is missing is
that this route reads the chain and not the snapshot, which is HANDOFF-11's
wiring.

## `GET /v2/mempool`

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

`summary.bytes` is summed from `getrawmempool` with `verbose=true`, one extra
call per request. It used to be a hardcoded `0`, which the site renders as
"0.0 kB" beside a table of transactions.

```json
{
  "tipHeight": 3456227,
  "entries": [],
  "summary": {
    "unconfirmed": 0, "shielded": 0, "migrations": 0, "transparent": 0,
    "decodedCount": 0,
    "bytes": 0,
    "nextBlockSeconds": 75,
    "crossingZat": "0",
    "crossingSplit": "Nothing in the mempool crosses a pool boundary.",
    "conventionalFeeZat": "10000",
    "pricedCount": 0,
    "conventionalCount": 0,
    "findingsHigh": 0,
    "findingsNote": "No finding in the current mempool is rated HIGH.",
    "feeWeather": "Nothing is waiting."
  }
}
```

`shielded` counts every transaction that touched a shielded pool without being
a migration - classes `shield`, `deshield`, `shielded` and, since HANDOFF-08,
`mixed`. Written down because the two producers of this field disagreed about it
until HANDOFF-07: the gateway counted the residual class `shielded` alone and the
fixture counted all three, so on thirteen rows one said 3 and the other said 7,
under the same header string and the same headline tile. A `shield` transaction
moved value INTO a pool, and counting it out of this number leaves it in no
bucket at all. `mixed` joins on the same argument rather than a new one.

`mixed` IS NEW IN HANDOFF-08 AND IT IS THE CLASS THE ENUM WAS MISSING. The row
class is now `shield | deshield | shielded | mixed | migration | transparent |
undecoded`. A transfer between two shielded pools that ALSO pays a transparent
address is none of the other six: not a `migration`, because a public recipient
stands in it; not `shield` or `deshield`, because those name the direction of a
transparent side it has on one end only. It fell to the residual `shielded` while
`analyze()` answered `MIXED`, so `/tx` and `/track` stated different things about
one transaction - the divergence that follows from applying HANDOFF-06's
assertion A9 ("a class that names the transparent side is never applied to a
transaction that has no transparent side") in both places. A9's own text is
about a single classifier; that the two pages must agree is its consequence,
and this line used to attribute the consequence to A9 directly. LEDGER-07 Q2 asked for the
member and L2 ruled that the CONSUMER SWEEP was the deliverable rather than the
member: the classifier now tests multi-pool BEFORE `shield`/`deshield` (because
`direction` is `DEPOSIT` whenever any pool leg is negative, so a crossing with a
transparent input would otherwise have been published as `shield` / `t to z`),
the flow caption is an exhaustive switch instead of a ternary chain ending
`: "t to t"`, and `apps/web`'s hand-copied frame-guard class set was widened -
without which one `mixed` transaction would have emptied `/track` entirely, which
is verbatim the defect HANDOFF-07 shipped for `undecoded`.

`decodedCount` is HANDOFF-07's, and it is the DENOMINATOR for any share of the
mempool - not `unconfirmed`. A row of class `undecoded` is a transaction whose
shape this build declined to read, so it is evidence of nothing; dividing by a
total that includes it turns it into evidence AGAINST whatever is being
measured. /track's shielded-share tile printed "8 of 13" while an undecoded row
was miscounted into the numerator and "7 of 13" once it was taken out - four
points of one statistic, manufactured twice from one unreadable transaction, in
opposite directions. `pricedCount` below is the same rule, learned one handoff
earlier for the fee tile.

`conventionalFeeZat` is ZIP 317's conventional fee ITSELF, at the grace minimum
of two logical actions - not a total of the fees anyone paid. /track prints it
under the subtitle "zat - ZIP 317 at 2 logical actions", and the fixture the
page ships with emits the same 10,000, so the label is true whichever producer
is behind it. `conventionalCount` beside it is the quantity that varies: how
many of `pricedCount` - NOT of `unconfirmed` - pay the conventional fee for
their own action count, computed from the fee and the actions rather than from
the indexer's wallet guess. The denominator matters: the fee is not on the wire,
so a mempool of twelve may have three transactions with a known fee, and "3 of
12 conventional" would be a verdict on nine nobody priced.

`nextBlockSeconds` is the 75-second target interval, and that is the correct
answer to "how long until the next block" rather than a placeholder: block
arrival is a Poisson process, so the expected remaining wait is the mean however
long has already elapsed. The target has been 75 s since Blossom (ZIP 208).

`conventionalCount` is computed here from each report's fee and action counts.
It is **not** `fingerprint.isZip317ConventionalFee`, which the indexer sets from
the wallet guess — a page built on that field would tell a reader how many
transactions pay the conventional fee when what it counted was how many looked
like two particular wallets.

## `GET /v2/flows`

`FlowsView` — the Tracking side of the Record's `/flows`, as a **summary, not a
second copy**. The Record page holds the rich rows with their provenance;
HANDOFF-03's ledger records what happens when one fact lives in two files.

```json
{
  "headline": "The 2 January 2026 unshielding",
  "case": {
    "id": "K-2026-01-02",
    "title": "The 2 January 2026 unshielding",
    "summary": "Three withdrawals from a presumed exchange hot wallet in late December, then 276,077.739 ZEC leaving the shielded pool in a single afternoon ...",
    "steps": [
      {
        "stamp": { "text": "2025-12-24 19:32:46", "precision": "second", "sortMs": 1766604766000 },
        "height": null,
        "from": "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ",
        "to": "t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK",
        "amountZat": "2999999000000",
        "note": "Withdrawal from the hot wallet to a freshly created address ...",
        "txid": "f45ded5d44452c405d92e66d69d760a5a7d01f94aab937b96ecd1f666edb4712"
      },
      "... four more steps"
    ],
    "verdict": "...", "confidence": "high", "lastVerified": "2026-08-22", "sources": ["..."]
  },
  "outcome": [ { "k": "verdict", "v": "..." }, { "k": "steps documented", "v": "5" }, "..." ],
  "institutions": [
    { "k": "shielded share of supply", "v": "26 to 26.8 per cent, as of 2026-08-22" },
    { "k": "what the filings name", "v": "Custodians, not addresses. Grayscale's S-3, its S-3/A and its 10-Q were read directly ..." },
    "..."
  ],
  "notSupported": "No claim here attributes an address to a person or an institution ..."
}
```

## `GET /v2/labels`

Every address label from `packages/content`, filtered to `GATEWAY_NETWORK`, each
with its `labeller`, its precedence `rank`, its `method`, its `confidence`, its
`lastVerified` and its `sources`. Eight on mainnet; one testnet label is filtered
out.

```json
[
  {
    "address": "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
    "network": "mainnet",
    "label": "ZIP 271 lockbox disbursement multisig",
    "labeller": "consensus",
    "rank": 1,
    "method": "ZIP 271 writes this address verbatim into the consensus rules and names the key-holders ...",
    "confidence": "high",
    "lastVerified": "2026-08-22",
    "sources": ["S-zcash-improvement-proposals-zip-0271", "..."],
    "balanceZat": "7818340930000",
    "notes": "Received 93,496.64 ZEC lifetime, more than the 78,750 disbursement ..."
  },
  {
    "address": "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ",
    "label": "Exchange hot wallet, labelled \"Binance\" by Lookonchain",
    "labeller": "analyst",
    "rank": 4,
    "confidence": "med",
    "...": "six more"
  }
]
```

Rank 1 is consensus and rank 5 is behaviour. The difference between the two
entries above — a label written into the consensus rules and a label asserted by
one analyst — is the whole of this site's argument about labelling, which is why
the rank travels with every label everywhere it is rendered.

## `GET /v2/cases`

The golden cases from `packages/content`, with each step's `amountZat` as an
exact zatoshi string. 29,999.99 ZEC is `"2999999000000"` — which a double would
also get right; `163.17` is the kind it does not, and that is why the conversion
is string arithmetic for all of them.

```json
[
  {
    "id": "K-2026-01-02",
    "title": "The 2 January 2026 unshielding",
    "summary": "Three withdrawals from a presumed exchange hot wallet in late December ...",
    "steps": [
      {
        "stamp": { "text": "2025-12-24 19:32:46", "precision": "second", "sortMs": 1766604766000 },
        "height": null,
        "from": "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ",
        "to": "t1XKfbZYsdxR5HSnP25ee5VaAxgCNUtFkFK",
        "amountZat": "2999999000000",
        "note": "Withdrawal from the hot wallet to a freshly created address ...",
        "txid": "f45ded5d44452c405d92e66d69d760a5a7d01f94aab937b96ecd1f666edb4712"
      },
      "... four more steps"
    ],
    "verdict": "...",
    "confidence": "high",
    "lastVerified": "2026-08-22",
    "sources": ["..."]
  },
  "... two more cases"
]
```

A step's `height` is `null` where the corpus records the time but not the block,
which is most of them: the research read these movements from an explorer, and
inventing a height to fill the field would be fabricating a precision the source
does not have.

## `GET /v2/snapshot` — the published snapshot, or a stated absence

**Implemented by HANDOFF-09.** This section described a `501` stub until then;
what follows is the route as it now behaves.

`200` carries the `SnapshotV1` document the publisher wrote, read from
`SNAPSHOT_FILE` — the local copy the publisher's file sink writes onto a volume
this gateway mounts read-only. `Cache-Control: max-age=60` is roughly one block,
so a cached copy is at worst one tip behind and carries the height it was taken
at.

`503` is every way of having no snapshot, with the difference in the body rather
than in the status code:

```json
{
  "error": "no snapshot is available",
  "reason": "absent",
  "detail": "no snapshot has been published yet"
}
```

| `reason` | `detail` says | Means |
|---|---|---|
| `absent` | no snapshot has been published yet | Nothing has been published to this box yet. |
| `unreadable` | the snapshot file could not be read (`code`) | The file is there and this process cannot read it. |
| `malformed` | the snapshot file is not JSON | It is not JSON. |
| `invalid` | (the schema's own words) | It is JSON and not a `SnapshotV1`. Only this reason adds an `issues` array, in the same shape `ApiError.issues` carries elsewhere. |

`detail` is client-safe and never carries the file path: which file this gateway
reads is a fact about this box, and the path goes to the log instead. That is
assertion A7 applied to this route.

Four things to an operator, one thing to a client — "there is nothing to render,
try the next source" — so they share a status and differ in a field.

The `503` carries `Cache-Control: no-store`. A shared cache holding it for sixty
seconds would keep serving "there is no snapshot" for a minute after the first
one was published, turning a startup window into a minute of empty dashboard.

The stub's argument still binds and is why there is a failure branch at all: a
`404` would be wrong — the resource exists — and a `200` carrying an empty object
would be worse, because `apps/web`'s snapshot store falls through four sources in
order and an empty `200` would satisfy the gateway source and stop it falling
through to the bundled fixture. What changed is only the other half: `501` means
"understood and not implemented", and it is implemented.

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
| `GATEWAY_TRUSTED_PROXIES` | *(empty)* | Comma-separated addresses whose `x-forwarded-for` is believed. **The rate limit is only per-reader if this is set.** Empty means `req.ip` is the socket address, so behind a reverse proxy every reader shares one bucket — correct and safe, but coarse. Blanket trust would be worse: any caller could forge the header and mint a fresh bucket per request. Set it to the tunnel's address (HANDOFF-10) |
| `GATEWAY_ADDRESS_CACHE_TTL_S` | `60` | `0` disables |
| `GATEWAY_TX_CACHE_TTL_S` | `3600` | `0` disables |
| `GATEWAY_ADDRESS_TX_LIMIT` | `50` | Max 500 |
| `GATEWAY_MAX_FUNDING_LOOKUPS` | `256` | Beyond it, a `413` naming the bound rather than a fee computed from a subset |

`SNAPSHOT_REDIS_*` is **not** here and must never be. It addresses the
Vercel-managed Marketplace store, which is SHARED with an unrelated production
project and in which this repository owns only the `zecreveal:` namespace. It is
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
`insta` snapshots, which are the actual serialised JSON. Four facts matter to a
client, and they are **two of each kind**: two are doc comments that contradict
the code, and two are wire facts that a zcashd-shaped client simply gets wrong.
An earlier version of this section called all four "doc comments that contradict
the serialisation code", which was true of half of them.

**Doc comments that contradict the code:**

1. **`getaddressbalance` does return `received`.** Its doc comment says it does
   not. Both fields are zatoshi.
2. **`getblock`'s `size` is present at verbosity 1 as well as 2**, though the
   doc comment says verbosity 2 only. In 6.3.0 the only structural difference
   between the two is the element type of `tx`.

**Wire facts a zcashd-shaped client gets wrong** — the docs here are not
contradictory, they simply do not say it:

3. **`getblock`'s selector must be a JSON string, even for a height.**
   `hash_or_height` is typed `String`; a bare number fails to deserialise.
4. **`getrawtransaction`'s verbosity is `u8`, not `bool`.** A client sending
   `true` fails to deserialise. Send `1`. `getrawmempool`'s `verbose` *is* a
   bool, so the two are inconsistent with each other.

A fifth, which is a doc comment contradicting the code and matters wherever a
fee is read: **`getrawmempool` verbose's `fee` is a ZEC float**, documented as
"Transaction fee in zatoshi". `descendantfees` is the one field in that struct
that genuinely is zatoshi.

And one that matters to this repository: the wire spells `expiryheight` and
`versiongroupid` all lowercase, while `RpcTransaction` declares `expiryHeight`
and `versionGroupId`. The client maps the wire spelling onto the declared name at
the boundary — see HANDOFF-05 §7 for what that repaired.
