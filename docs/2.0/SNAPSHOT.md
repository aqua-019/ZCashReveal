# SNAPSHOT.md — the managed Redis, and the rules that come with sharing it

**Status: the safety half of this document exists; the schema half does not yet.**
HANDOFF-09 owns `SnapshotV1`, the publish cadence and the sink list, and adds them below.
What is written here is the part that could not wait for HANDOFF-09, because the store is
already connected and already shared.

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
| publisher writes, per day | ~3,450 |
| publisher writes, per month | ~103,500 |
| **`apps/web` reads, per month** | **see below — not yet bounded** |
| publisher's share of the 500K allowance | ~21%, **before reads and before the other project's usage** |

**READS ARE COMMANDS TOO, AND THEY ARE THE UNBOUNDED HALF.** The arithmetic above counts only
what the publisher writes. Every server-side render in `apps/web` that resolves to the `redis-rest`
source issues at least one `GET`, and that side scales with traffic, with the number of Vercel
regions serving the page, and with how often the page revalidates — none of which the publisher
controls. One `GET` per 60-second revalidation in three regions is already ~4,300/day, which is
MORE than the publisher's whole budget. Two rules follow, and HANDOFF-11 owns both: the snapshot is
fetched **once per render at module scope, never once per component or once per request**, and the
resolution order must prefer a cached value over a fresh `GET` whenever the cached one is inside
its staleness window. Until HANDOFF-11 states a measured figure here, the combined share is
**unknown and larger than 21%** — which is the honest answer and the reason this row says so
rather than carrying a number nobody has measured.

Four consequences, none optional:

- **A section 5 assertion, wherever the publisher lands:** one tip produces exactly 3
  managed-store commands. Fail side: a change that adds a fourth is caught by the count, not by
  review. Counting commands is the only honest way to assert "exactly three" — the same reason
  the gateway's Redis connection count is asserted by counting constructions.
- **The publisher logs a monthly running command count and refuses to start** if a configured
  ceiling (`SNAPSHOT_REDIS_MONTHLY_BUDGET`, default `150000`) would be exceeded. This project can
  never be the reason the other one gets rate limited. The default leaves the design about 45%
  headroom over its expected ~103,500 and still stops well short of the shared allowance.
- **Per-mempool-transaction data never goes to the managed store.** That stays on the VPS Redis.
  The whole reason 3-per-block fits is that it is 3 per block; anything per-transaction is three
  to four orders of magnitude more traffic and would exhaust a shared allowance in days. The same
  bar applies to anything else per-request: a rate limiter, a session store, a cache. If a design
  wants a Redis for one of those, it wants the VPS Redis or its own database.
- **The monthly counter lives on the VPS, in a file, and never in the managed store.** Keyed by
  `YYYY-MM` on a named volume, read at startup and flushed after each tip. Stating this is not
  pedantry: putting the counter in the store it is counting would add a fourth command per tip and
  break the assertion that says there are exactly three, and holding it only in memory would reset
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
words and the `client.script('FLUSH')` call shape); `KEYS` as a method call, a quoted command
argument and a `redis-cli` line; `SCAN` unbounded by `zecreveal:`; the `redis-cli` enumeration
flags; `DEL` and `UNLINK` by glob or by a non-literal first argument; and the cross-tenant
readers. It scans every file in the repository except vendor and build directories, lockfiles and
binary extensions — Dockerfiles, `.json`, compose files and extensionless scripts included.

**Not covered, and stated so nobody reads the list above as complete:**

- **Rule 1, the `zecreveal:` key namespace, is not mechanically enforced.** No code in this
  repository speaks to the managed store today, so there is nothing yet to check. It lands with
  HANDOFF-09's A11: one module builds every key, and a test asserts no other module constructs
  one.
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

## 8. Still owed to this document

HANDOFF-09 adds: the `SnapshotV1` schema, the publish cadence, the sink list (`file`, `redis`,
optional `blob`) and their independent-failure behaviour, and how the operator connects the store.
HANDOFF-11 adds: `apps/web`'s `SnapshotStore` resolution order and the staleness indicator.

Neither may weaken §§1–6.
