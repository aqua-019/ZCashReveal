# SNAPSHOT.md — the managed Redis, and the rules that come with sharing it

**Status: complete for HANDOFF-09.** The safety half (sections 1 to 7) was written by HANDOFF-05
because the store was connected before HANDOFF-09 opened. The schema half - `SnapshotV1`, the
publish cadence, the sink list and their independent-failure behaviour - is section 8, written by
HANDOFF-09. Sections 1 to 6 were not weakened by that addition and may not be weakened by any
later one. What is still owed is HANDOFF-11's half, which is named at the foot of section 8.

Provenance: the connection facts were established by the operator (L2) in the Vercel UI on
23 August 2026 and delivered to the HANDOFF-05 session as a written note. They are read from
the Vercel project, not inferred from an integration's documentation.

---

## 1. The constraint that governs everything else

**The managed Redis store is not ours alone. It also holds the live data of an unrelated
production project.**

The operator accepted that trade deliberately, on the free tier, until the 500,000 commands per
month allowance is reached. Every rule in this document exists because a mistake against this
store damages **someone else's production data**, not ours. That is a different failure mode from
every other rule in this repository: a wrong number on a page is a wrong number on a page, and a
`FLUSHDB` here is an outage for a project that never agreed to run alongside us.

There is no circumstance in this project where a destructive or enumerating command is correct
against this store. Not in a test, not in a fixture, not in a runbook step, not "just this once
to clear a bad snapshot".

## 2. Two servers, never confused

|  | VPS Redis | Vercel-managed Redis |
| --- | --- | --- |
| Variable | `REDIS_URL` | `SNAPSHOT_REDIS_*` (see §3) |
| Where | the VPS, alongside the indexer and gateway | Upstash, reached over the network |
| Key namespace | `zcashreveal:` **(with the `a`)** | `zecreveal:` **(no `a`)** |
| Holds | pub/sub, `zcashreveal:mempool:live`, the anchor registry | ours: `zecreveal:snapshot:*` and nothing else. Theirs: whatever the other tenant keeps there |
| Traffic | per transaction, hot path | 3 writes per new block, plus `apps/web`'s reads (§5) |
| Shared with anyone | no | **yes — an unrelated production project** |
| Written by | the indexer | `apps/publisher`, and nothing else |
| Read by | the gateway | `apps/web`, server-side, read-only token |

The two key prefixes differ by one letter and mean different servers. `zcashreveal:` on the
managed store, or `zecreveal:` on the VPS, is a defect in either direction.

An unprefixed Vercel integration injects a bare `REDIS_URL`, which is the name this repository
already uses for the VPS Redis. That is why the connection carries the custom variable prefix
`SNAPSHOT_REDIS`: without it, connecting the store would have silently redefined the hot path's
variable name.

## 3. The variable names, as Vercel actually injects them

The store `upstash-kv-blue-garden` (Upstash ID `230ab52f-21d9-4a63-950e-ad265cc75902`, Free plan)
is connected to the `zecreveal` project for **Production and Preview** with the custom variable
prefix `SNAPSHOT_REDIS`. The names injected are exactly:

| Injected name | What it is | Who may use it |
| --- | --- | --- |
| `SNAPSHOT_REDIS_KV_REST_API_URL` | REST endpoint | `apps/web`, server-side |
| `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` | read-only bearer token | `apps/web`, server-side — **this one** |
| `SNAPSHOT_REDIS_KV_REST_API_TOKEN` | read-write bearer token | nothing on Vercel. The publisher only, and it does not run on Vercel |
| `SNAPSHOT_REDIS_KV_URL` | TCP URL, `rediss://` | `apps/publisher` |
| `SNAPSHOT_REDIS_REDIS_URL` | TCP URL, `rediss://` (Upstash injects both spellings) | `apps/publisher` |

**This corrects the repository.** Until this document, thirteen places across `CLAUDE.md`,
`DEPLOY-2.0.md`, four handoffs and two `.env.example` files stated the names as
`SNAPSHOT_REDIS_URL`, `SNAPSHOT_REDIS_REST_URL` and `SNAPSHOT_REDIS_REST_TOKEN`. Those three
names are **not injected by anything**. Code written against them would read `undefined` in
production and fall through to whatever its fallback is — which, for `apps/web`'s planned
`SnapshotStore` resolution order, is a silent downgrade to the gateway or the bundled fixture:
the site would render, stale, and nothing would report a fault.

`DEPLOY-2.0.md` previously instructed the operator to "map them onto the three names above rather
than teaching the code a second spelling". That instruction is withdrawn, for a reason worth
keeping: on Vercel, "mapping" means the operator adds three more variables by hand holding copies
of the integration's secrets. The integration owns and rotates its own variables; the hand-made
copies do not rotate with them, and a rotation would leave a site reading a token that used to
work. **The injected names are canonical and the code reads them.** The one place a name is ours
to choose is the VPS `.env`, where the operator writes it by hand — and it uses the injected
spelling anyway, so that a value copied out of the Vercel UI lands under the name it came with.

## 4. The rules

1. **Every key** this project writes, reads or deletes begins `zecreveal:`. No exceptions: no
   convenience keys, no scratch keys, no health-check key outside the namespace.
2. **`FLUSHDB`, `FLUSHALL`, `SWAPDB` and `SCRIPT FLUSH` are forbidden** — in code, in tests, in
   fixtures, in scripts, in documentation as a suggested command, and in any runbook step.
3. **`KEYS` is forbidden outright.** `SCAN` is permitted only with `MATCH zecreveal:*`. A bare
   scan enumerates the other project's keyspace. The `redis-cli` **flags** count as the same
   thing: `--scan` only when bounded by `--pattern 'zecreveal:*'`, and `--bigkeys`, `--hotkeys`,
   `--memkeys` and `--rdb` never, because they sample or dump the whole keyspace and cannot be
   bounded.
4. **No `DEL` — or `UNLINK` — by pattern.** Delete only keys this project wrote, by exact key.
   `UNLINK` is named explicitly because it is `DEL` under another name, and a rule that says only
   `DEL` is defeated by a one-word substitution.
5. **Tests, local development and BUILDS never point at this store.** Integration tests use a
   local Redis or a fake. A test that needs the managed store does not run in CI. Build time is
   named separately because it is the one context where the credentials are certainly present and
   a read certainly happens: `apps/web`'s Playwright config neutralises all five variables in its
   `webServer.env` so a local or CI build resolves to the bundled fixture and cannot reach the
   store by inheriting an ambient environment.
6. **The publisher is the only writer.** `apps/web` reads with
   `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` and never the read-write token.
7. **Never issue a command whose result is not scoped to a `zecreveal:` key.** Rules 1 to 6 are
   all about keys, which left a gap: `MONITOR`, `RANDOMKEY`, `DBSIZE`, `INFO keyspace` and
   `--bigkeys` name no key at all and report on the other tenant anyway — their live command
   traffic, one of their key names, how many they hold. **Sharing a database is a confidentiality
   problem in both directions.** The store exposes their data to us as surely as it exposes ours
   to a mistake of ours, and nothing about the arrangement entitles us to look.

Rules 2, 3, 4 and 7 are enforced mechanically by `scripts/check-redis-safety.mjs`, which CI runs
alongside the emoji and Vercel-config checks and which `pnpm check` runs locally. The guard is a
text scan: it catches the commands being written down, which is the way they would actually
arrive. §7 states exactly what it does and does not cover.

## 5. The budget is a shared budget

500,000 commands per month, per database, **shared with the other project**.

The snapshot design is **3 commands per new tip**, in one `MULTI`:

```
SET zecreveal:snapshot:latest    <json>
SET zecreveal:snapshot:<height>  <json>   EX 86400
SET zecreveal:snapshot:height    <height>
```

At roughly 1,150 blocks a day (the 75-second target interval gives 1,152):

| | commands |
| --- | --- |
| publisher writes, per tip | 3 |
| publisher commands **on the wire**, per tip | 5 (`MULTI` + 3 x `SET` + `EXEC`) |
| publisher commands charged, per day | ~5,750 |
| publisher commands charged, per month | ~172,500 |
| **`apps/web` reads, per month** | **see below — not yet bounded** |
| publisher's share of the 500K allowance | ~35%, **before reads and before the other project's usage** |

The counter is charged the **wire** count of five, not the write count of three — see §8.6. The
write count stays in the table because A10 asserts it by counting `SET` calls, and because the two
numbers measure different things.

**READS ARE COMMANDS TOO, AND THEY ARE THE UNBOUNDED HALF.** The arithmetic above counts only
what the publisher writes. Every server-side render in `apps/web` that resolves to the `redis-rest`
source issues at least one `GET`, and that side scales with traffic, with the number of Vercel
regions serving the page, and with how often the page revalidates — none of which the publisher
controls. One `GET` per 60-second revalidation in three regions is already ~4,320/day — about three
quarters of everything the publisher spends in a day (~5,750), and unlike the publisher's side it is
bounded by nothing. *(That sentence read "MORE than the publisher's whole budget" until 31 Aug 2026,
which was true while the publisher was charged 3 commands per tip and became false when it began
charging the wire count of 5. LEDGER-09 Q2, fold 2.)* Two rules follow, and HANDOFF-11 owns both: the snapshot is
fetched **once per render at module scope, never once per component or once per request**, and the
resolution order must prefer a cached value over a fresh `GET` whenever the cached one is inside
its staleness window. Until HANDOFF-11 states a measured figure here, the combined share is
**unknown and larger than 35%** — the publisher's own charged share, from the table above — which is
the honest answer and the reason that row says so rather than carrying a number nobody has measured.

Four consequences, none optional:

- **A section 5 assertion, wherever the publisher lands:** one tip produces exactly 3
  managed-store WRITES and puts exactly 5 commands on the wire. Fail side: a change that adds a
  fourth write is caught by the count, not by review. Counting commands is the only honest way to
  assert an exact number — the same reason the gateway's Redis connection count is asserted by
  counting constructions.
- **The publisher logs a monthly running command count and refuses to start** if a configured
  ceiling (`SNAPSHOT_REDIS_MONTHLY_BUDGET`, default `200000`) would be exceeded. This project can
  never be the reason the other one gets rate limited. The default leaves the design about 16%
  headroom over its expected ~172,500 and still spends a minority share of the shared allowance.
- **Per-mempool-transaction data never goes to the managed store.** That stays on the VPS Redis.
  The whole reason 3-per-block fits is that it is 3 per block; anything per-transaction is three
  to four orders of magnitude more traffic and would exhaust a shared allowance in days. The same
  bar applies to anything else per-request: a rate limiter, a session store, a cache. If a design
  wants a Redis for one of those, it wants the VPS Redis or its own database.
- **The monthly counter lives on the VPS, in a file, and never in the managed store.** Keyed by
  `YYYY-MM` on a named volume, read at startup and flushed after each tip. Stating this is not
  pedantry: putting the counter in the store it is counting would add a fourth WRITE - a sixth
  command on the wire - per tip and break the assertion that says there are exactly three writes,
  and holding it only in memory would reset
  it on every restart and make the ceiling vacuous.

## 6. The exit condition

The operator's stated exit condition is the 500K/month allowance. When the shared total
approaches it, ZECReveal moves to its **own** database. The Upstash free plan allows up to 10
databases per account, each with its own 256 MB and its own 500K commands, so the move costs
nothing but the reconnect and a variable change.

Until then, the sharing is a deliberate, accepted trade — not an accident to be tidied up, and
not a licence to treat the store as ours.

## 7. What the guard covers, and what it does not

`scripts/check-redis-safety.mjs` runs in CI and under `pnpm check`. It self-tests its detectors on
every run against fixtures in four directions — strings it must catch and strings it
must not — and exits 2 rather than 0 if either direction has broken, so it cannot degrade into a
scan that reports a clean tree having detected nothing.

**One narrow, checked exemption, added 30 Aug 2026 (LEDGER-10 Q2), and it does not weaken §§1-6.**
A `SCAN` line bounded by the VPS prefix is permitted in a non-Markdown file that itself CALLS
`assertNotManagedStore` with a candidate array. Both halves are required and neither is inferred: the
call is the same one the indexer and the gateway make at boot, and it throws if the URL it is handed
is this store by hostname or by an exact value match against any `SNAPSHOT_REDIS_*` variable. The file
proves its target at runtime and the guard reads the proof. It exists for one tool,
`scripts/redis-keys.mjs` (`pnpm redis:keys`), which is how `RUNBOOK-VPS.md` section 11 enumerates the
VPS Redis without putting an enumerating `redis-cli` line on a copy-paste surface. Rule 3 is unchanged
for this store: a file that refuses to connect to it cannot scan it. `KEYS`, the `redis-cli`
enumeration flags, the destructive commands and the cross-tenant readers are untouched by the
exemption in every file. Self-tested in four directions: the exemption applies where it must, it does
not widen to an unbounded scan or to any other rule, the same two lines are still findings in a file
without the proof, and a mere mention of `assertNotManagedStore` in a comment or an import is not a
proof.

**The exemption's own bound:** the proof is per FILE, not per CLIENT. A file that asserts on one URL
and scans a different client would buy the exemption for both. Nothing here does that, and a review
that sees it should treat it as a finding on its own - the same treatment this section gives a command
assembled at runtime.

**Covered.** Rules 2, 3, 4 and 7: `FLUSHDB`, `FLUSHALL`, `SWAPDB`, `SCRIPT FLUSH` (both the bare
words and the `client.script('FLUSH')` call shape); `KEYS` as a method call (`keys` and
`keysBuffer`), a quoted command argument and a `redis-cli` line; `SCAN` unbounded by `zecreveal:`,
in all three ioredis spellings (`scan`, `scanBuffer`, `scanStream`); the `redis-cli` enumeration
flags; `DEL` and `UNLINK` by glob or by a non-literal first argument; and the cross-tenant
readers. It scans every file in the repository except vendor and build directories, lockfiles and
binary extensions — Dockerfiles, `.json`, compose files and extensionless scripts included.

**Not covered, and stated so nobody reads the list above as complete:**

- **Rule 1, the `zecreveal:` key namespace, is not enforced by THIS guard.** It is enforced at
  runtime instead, by HANDOFF-09's `assertOwnedNamespace` in `apps/publisher/src/sinks/redis.ts`:
  every key the sink issues passes through it while the `MULTI` is built, so a key outside the
  namespace throws before `EXEC` and nothing is committed. A11 pins both polarities, and it pins
  them by INJECTING an untrusted key builder — its first version reached a different throw one
  function earlier and never ran the guard at all, which is a fail-side probe that does not fail.
- **The guard reads METHOD NAMES, so a client library's alias is a hole until it is named.** Found
  in HANDOFF-09's gate: `redis.scanStream({})` is an unbounded enumeration of the whole keyspace
  and passed this guard, because the rule matched `.scan(` and ioredis's streaming helper is
  `.scanStream(`. `scanBuffer` and `keysBuffer` were the same shape. All four spellings are named
  now, and the general bound stands: a NEW alias, or another client library with different method
  names, is invisible to a text scan until someone adds it. What is not a hole is the bounding
  check — it looks for `zecreveal:` anywhere on the line, so it covers a new spelling for free the
  moment the method name is recognised.
- **Rule 5 is enforced only at the one place it currently bites** — `apps/web`'s Playwright
  config, which blanks the five variables for the build it starts. Nothing stops a future test
  file from reading them directly.
- **Rule 6, the read-only token, is not enforced by this guard.** It lands with HANDOFF-11's
  assertion that `apps/web` reads `..._READ_ONLY_TOKEN` and that the read-write name appears
  nowhere under `apps/web/src`.
- **A command assembled at runtime** — `client[cmd](...)` with `cmd` from a variable — passes a
  text scan. Nothing here needs to do that against the managed store, and a review that sees it
  should treat it as a finding on its own.
- **The other project's own traffic is invisible to us.** The ceiling in §5 protects our share; it
  cannot say how much of the shared allowance is already spent. Only the operator can read that,
  and only in the Upstash console.

## 8. The schema, the cadence and the sinks

Written by HANDOFF-09. §§1-6 are unchanged by it.

### 8.1 What the document is for

Plan decision 2, verbatim: the publisher "writes `snapshot.json` every block ... The site renders
from it at build/ISR time; the WS layer upgrades it live. **Empty dashboards become structurally
impossible.**"

That last sentence is the design goal and it decides the shape. A snapshot that refuses to parse is
an empty dashboard, so **four fields are required and every panel is nullable**:

| required | why |
| --- | --- |
| `schema` | the literal `1`. See §8.2. |
| `height` | a page must never print a number with no height beside it |
| `hash` | which block, unambiguously, across a reorg |
| `time` | the block's own timestamp, so staleness is measured against the chain |

Everything else — `pools`, `residual`, `drain`, `migrationHist`, `neffSeries`, `lastReports`,
`labelsVersion` — is a panel that can say "not measured". An indexer that has not reached NU6.3 has
no drain; one with an empty mempool has no reports. **A `null` renders as an absence and a zero
renders as a measurement**, which is the same rule `sprout-field.ts` applies to a missing
`vjoinsplit` and `zip318.ts` applies to a non-canonical denomination.

The schema is `packages/zec-types/src/snapshot.ts`. It is a zod schema, so the assertion that a
published document conforms is a parse and not a review.

**WHICH OF THOSE PANELS THE PUBLISHER ACTUALLY FILLS, as of HANDOFF-09a (31 Aug 2026), because
"can say not measured" is a property of the type and says nothing about what ships.** HANDOFF-09
published `residual`, `drain`, `migrationHist` and `neffSeries` as `null` on **every** tip, for a
reason that was structural: the three estimators lived in `apps/indexer/src/analysis/`, and this
image cannot contain `apps/indexer` — its dependency tree carries `zeromq`, a native addon this
image has no compiler for, and its entry point opens a ZMQ subscriber. HANDOFF-09a moved them into
`packages/zec-instruments`, a workspace package that depends on `@zcashreveal/types` and nothing
else, and the publisher's composition root now passes the real functions. The state after that move
was **two of the four**, and the remaining two were the INPUT layer rather than the packaging. HANDOFF-09b supplied both sources, so the production path now publishes all four; the table records what each one reads and what closed it:

| panel | published | why |
| --- | --- | --- |
| `residual` | **measured** | supply and lane balances both come from `getblockchaininfo` |
| `migrationHist` | **measured** | crossings come from `migrations_zip318`, whose three columns are `Crossing`'s three fields |
| `drain` | **measured** since HANDOFF-09b | it was `null` because `pool_snapshots.ts` is `TIMESTAMPTZ DEFAULT NOW()` — the time the indexer **wrote** the row, not the block's — and §3.3's velocity is "from block timestamps". Migration 005 adds a `blocks` table (`height`, `time_s`, `hash`), one row per height rather than a column stored four times per height, and the series joins it. A snapshot whose height has no block row is dropped rather than timestamped from a fallback. |
| `neffSeries` | **measured** since HANDOFF-09b | it was `null` because no table carried the (nullifier → anchor) edge. `pool_anchors.max_position` already held the Cand_0 bound; migration 005 adds `pool_nullifiers.anchor_root` so a spend can name the anchor that bounds it, and `candidateCount` is derived as `max_position + 1` rather than stored. |

Both remaining absences are **HANDOFF-09b's** (LEDGER-09a Q1), not HANDOFF-11's, and both are the
INPUT layer: `drain` needs a block-time source and `neffSeries` needs an Ironwood spend source.
They are pinned by an executing assertion rather than by this paragraph:
`apps/publisher/src/__tests__/instruments-wired.test.ts` asserts the two measured panels are
non-null and the two absent ones are null on the production input shape, so a session that makes
either measurable is told to re-read this table.

#### The rendering contract for an unmeasured panel

**A `null` renders as an absence and a zero renders as a measurement** is the rule this file has
carried since HANDOFF-09, and it is a rule about the DOCUMENT. This section states the other half,
which is a rule about the PAGE, because the two came apart and nobody noticed until LEDGER-09a Q1.

HANDOFF-11's contract line used to read "the cutover may not ship a null analysis panel". L2
restated it on the right quantity: **the cutover may not RENDER AN UNMEASURED PANEL AS A
MEASUREMENT.** As first written the rule turned on the COUNT — four panels of four — which is why
un-nulling two of them felt like it changed the answer, and it should not have. The dishonesty in
an empty panel is not that it is empty. It is that **an empty chart renders as a measurement of
zero**: a flat drain line reads to every visitor as "the pool is not draining", which is a claim
this site has not made and cannot support, and a zero-height `neffSeries` reads as "no Ironwood
spend has ever been anonymous enough to measure".

So a renderer receiving `null` for a panel MUST NOT draw the panel's chrome around no data — no
empty axes, no zero-height bars, no flat line at the baseline, no "0" in a figure slot. It renders
a **named absence carrying its owner**:

| panel | what the site displays while unmeasured |
| --- | --- |
| `drain` | `drain: not measured — needs a block-time source (HANDOFF-09b)` |
| `neffSeries` | `N_eff series: not measured — needs an Ironwood spend source (HANDOFF-09b)` |

**And a rule for `neffSeries` when it IS measured, because a panel can be present and still make a claim it cannot support.** Its `shares` are computed over `spendCount` — the spends whose anchor resolved — and `windowSpendCount` is how many Ironwood spends there were in the window. **A renderer must show the pair, never a share alone.** Four of five spends unbounded publishes `requires_disclosure: 1` over a single spend, and rendered as "100% require disclosure" that is a measurement of the window it was not taken over. `N_eff over 2 of 4 spends in the window` is the honest form; a bare percentage is not.
| `residual` | `unprovable residual: not measured — the node reported no supply` |
| `migrationHist` | `migration histogram: not measured — no migration window was read` |

The first two name a HANDOFF because the absence is a gap in this project's pipeline that a
numbered handoff owns and closes. The second two name a CONDITION instead, because their inputs
exist and the absence is a node or a database that did not answer on this tip — naming a handoff
there would promise a fix for something that is not broken.

**This is the LEDGER-05 Q2 precedent applied exactly**: `/api/pools` answers 503 naming the four
blocks it cannot serve rather than serving four empty ones, because a page that serves four empty
blocks is claiming to have looked and found nothing. A named absence is that same answer in a
panel's shape.

**And note what the correction costs, because that is what shows it is not a convenience.** The
corrected rule is count-independent, so it **no longer blocks the cutover**: if the operator wants
HANDOFF-11 before 09b, the honesty rule permits it provided both panels render as named absences
with their owner. 09b is still ordered first, on a cost argument that has nothing to do with panel
honesty — migrations 003 and 004 have never been applied to the VPS, so that database is COLD, and
a 005 landing before the cutover is one free run where a 005 landing after it is a maintenance
window on a live public site. That is a cost ruling the operator may overrule. The honesty ruling
is not one L2 will trade, and it is a floor rather than a ceiling: no later handoff may weaken it,
under the same rule as §4.

### 8.2 Why there is a `schema` field the handoff did not ask for

HANDOFF-09 §3 names ten fields and this document carries eleven. A type called `SnapshotV1` that
carries no version cannot tell a reader it is a V1, and `apps/web`'s resolution order (HANDOFF-11)
has to distinguish two cases that a bare parse failure conflates:

- **a snapshot I do not understand** — fall through to the next source, quietly. This is what a V2
  looks like to a V1 reader, and it is not a fault.
- **not a snapshot** — the store answered with something else entirely. That IS a fault and should
  be reported rather than silently downgraded.

`z.literal(1)` makes the difference a parse result rather than a guess.

### 8.3 Zatoshi on the wire

`JSON.stringify` throws on a `bigint`. The throw is the good case; the bad case is a caller reaching
for `Number(...)` to get past it and losing precision without a symptom.

So **every zatoshi crosses the wire as a decimal string** and comes back as a `bigint` through
`zatSchema`, which is the contract `views.ts` already used for every other DTO in this project.
`serializeSnapshot` in `packages/zec-types/src/snapshot.ts` is the single function that writes them,
and every sink goes through it, so there is exactly one answer to "how does a zatoshi appear in the
file".

**One field deliberately leaves that rule: drain velocity, which is ZEC per hour as a float.** Plan
§3.3 names the unit, and a rate is a quotient — the elapsed time comes from block timestamps and is
not a whole number of hours. A `bigint` there would have to round a rate to the nearest
zatoshi-per-hour and claim a precision the measurement does not have.

### 8.4 The cadence

**One publish per NEW tip.** The publisher de-duplicates by height: a repeated tip writes nothing,
to any sink. At the 75-second target interval that is ~1,152 publishes a day.

A tip that arrives while a publish is in flight does not start a second one; the newer height is
published on the next turn. The snapshot is a *latest-wins* document and skipping an intermediate
height loses nothing a reader can observe, whereas two concurrent `MULTI`s against a shared store
could interleave `latest` and `height` and leave the two disagreeing.

### 8.5 The sinks, and what "independent" means

| sink | destination | configured by | required |
| --- | --- | --- | --- |
| `file` | `snapshot.json` on the local filesystem | `SNAPSHOT_FILE` | yes — this is what the gateway serves and what a dev run produces |
| `redis` | the Vercel-managed store | `SNAPSHOT_REDIS_KV_URL` or `SNAPSHOT_REDIS_REDIS_URL` | no — absent both, the sink is not constructed |
| `blob` | object storage | `SNAPSHOT_BLOB_URL` | no — stub |

**SINKS ARE INDEPENDENT AND THE PROCESS NEVER EXITS ON A SINK FAILURE.** A failing sink is logged as
`{sink, err}` and the others still write. The reason is the whole point of the design: the snapshot
exists so the public site renders when the VPS or the tunnel is down, and a publisher that dies
because the managed store was briefly unreachable would take the file sink — the gateway's own copy
— down with it, converting a partial outage into a total one.

The redis sink is the only writer this project has against the managed store, per rule 6.

### 8.6 The three commands, and why it is exactly three

Per new tip, in one `MULTI`:

```
SET zecreveal:snapshot:latest    <json>
SET zecreveal:snapshot:<height>  <json>   EX 86400
SET zecreveal:snapshot:height    <height>
```

The keys are built by `SNAPSHOT_KEYS` and `snapshotKeyForHeight()` in
`packages/zec-types/src/redis-topology.ts`. **The prefix is never retyped**, here or anywhere: it
differs from the VPS prefix by one letter.

`zecreveal:snapshot:latest` carries no TTL, because a store that expires the latest snapshot
produces the empty dashboard this design exists to prevent. The per-height copy carries 86,400
seconds so the keyspace does not grow without bound; `zecreveal:snapshot:height` is an integer string
a reader can fetch without parsing the document.

The count is asserted by **counting**, not by reading the code — HANDOFF-09 A10, with a spy on the
client, across a fake tip stream, asserting `3 x tips`. §5 gives the reason: "counting commands is
the only honest way to assert an exact number". A10's fail side adds a fourth write and watches the
count assert.

**THREE IS THE WRITE COUNT. FIVE CROSS THE WIRE, AND FIVE IS WHAT THE COUNTER IS CHARGED.**
`MULTI` and `EXEC` are commands the client sends over RESP like the three `SET`s, so one tip is five
commands on the connection. Whether Upstash's monthly meter bills the transaction envelope is a fact
about their billing, not about this repository, and **no session can read it**: egress to
`upstash.com` is refused by the container's proxy, so it cannot be resolved from a document either.
Both numbers are therefore measured and pinned by A10 — `COMMANDS_PER_TIP` is 3 and
`WIRE_COMMANDS_PER_TIP` is 5, both in `apps/publisher/src/budget.ts` — and both stay visible,
because they measure different things.

**WHAT IS NEW SINCE 31 AUGUST 2026: the counter is charged the wire count** (LEDGER-09 Q2, fold 2).
HANDOFF-09 charged three and stated the gap. L2 could reach Upstash and this repository could not,
and the answer it brought back is partial rather than clean, so it is recorded here verbatim:

> "Operational commands like AUTH, HELLO, SELECT, COMMAND, CONFIG, INFO, PING, RESET, and QUIT are
> not charged."
> — Upstash's pricing page, read by L2 on 30 August 2026

`MULTI` and `EXEC` are **not** on that list. The docs do not state the transaction case explicitly,
so this is **evidence rather than proof** — but a published list of what is free that omits both of
our envelope commands is the strongest signal available short of a bill.

**The asymmetry, which HANDOFF-09 had backwards.** That session argued charging five "buys nothing"
against a 500,000 allowance and costs "a predictable outage of our own fallback". The first half is
right, and it is the reason to charge five: at five a month spends about **172,500**, still a
minority share, so the true cost of over-charging is nil. The second half misplaces whose resource
is at risk. **The ceiling is ours and adjustable; the 500,000 is shared with a production project
that never agreed to run alongside us.** A budget calibrated on an undercount protects neither — it
does not stop us before their meter matters, and it trips our own fallback for a reason that is not
the real one. When the uncertainty is about someone else's quota, take the conservative side. The
ceiling of §8.7 rose to 200,000 in the same change, which is the round number above 172,500.

**Confirming it against a real bill is still an operator task** (it is in `handoffs/README.md`'s
click list): read the command count the Upstash console reports for one full month against the
number of tips published in it. Whichever number the meter charged, `WIRE_COMMANDS_PER_TIP` and the
`redis` sink's `managedStoreCommandsPerWrite` become it, and §8.7's default ceiling is re-checked
against the new arithmetic.

### 8.7 The monthly ceiling

`SNAPSHOT_REDIS_MONTHLY_BUDGET` (default `200000`) is a hard refusal, not a warning: over the
ceiling, the publisher **exits non-zero with a message naming it, and writes nothing to the managed
store**. The file sink is unaffected, so a publisher that has run out of budget still keeps the
gateway's copy fresh.

The counter is a file on a named VPS volume, keyed `YYYY-MM`, read at startup and flushed after each
tip. §5 gives both halves of why it is not anywhere else: in the managed store it would be a sixth
command per tip and would break the assertion in §8.6, and in memory alone it would reset on every
restart and make the ceiling vacuous.

### 8.8 How the operator connects the store

Already done, 23 August 2026, and recorded in §3: the store `upstash-kv-blue-garden` is connected to
the `zecreveal` project for Production and Preview under the variable prefix `SNAPSHOT_REDIS`, so
Vercel injects the five names automatically. **Nothing is copied by hand on the Vercel side, and no
agent sets a Vercel environment variable.**

The one manual step that remains is the VPS: the operator pastes one of the two `rediss://` TCP URLs
into the VPS `.env`, under the name it carried in the Vercel UI, so a value copied out of that UI
lands under the name it came with. It never enters git — HANDOFF-09 A8 greps for exactly that.

### 8.9 Still owed

HANDOFF-11 adds: `apps/web`'s `SnapshotStore` resolution order, the staleness indicator, and the
measured read figure that replaces §5's row saying the combined share is unknown. It may not weaken
§§1-6, and it may not weaken this section either.
