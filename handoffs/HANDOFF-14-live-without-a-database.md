---
handoff: 14
title: Live without a database - the publisher on RPC alone (rung 1 of three)
status: closed
branch: the session-designated branch (name it `feat/v2-14-live-without-a-database` if you may choose)
track: Integration
depends_on: 12
written_by: L2 (Cowork) · 2 Sep 2026, re-verified 3 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-14 — Live without a database: the publisher on RPC alone (rung 1 of three)

**THE SITE IS RENDERING A TWELVE-DAY-OLD FIXTURE AND IT DOES NOT HAVE TO BE.** `zcuck.xyz` shows
`source: fixture` at block **3,456,227** (`apps/web/src/lib/api/fixtures/pools.ts:7`); mainnet was at
**3,470,402** when this handoff was written, measured against the live endpoint on 3 Sep 2026. That is
**14,175 blocks**, about **12.3 days** at 75 s. **And the site reports that gap as `snapshot age: 0
blocks`** — which is deliverable 4, and the reason it is in this handoff rather than a later one.
This handoff ends that, **with no database, no node, no VPS and no sync** — because the code already
supports it and only the wiring is missing.

**THIS IS RUNG 1 OF THREE.** HANDOFF-15 adds live transactions; HANDOFF-16 adds crossings. Each rung
ships alone and each makes the site more alive. Do not reach up the ladder.

---

## §1 SCOPE

Make the publisher run **against RPC alone, with no `DATABASE_URL`**, publishing a snapshot whose
chain figures are live and whose analysis panels are stated absences.

**The input layer was designed for this and nobody wired it.** `apps/publisher/src/sources/chain-inputs.ts`
declares `ChainInputsDeps` with four database queries typed `| null`, each carrying the same comment —
*"or null when there is no database"* — while `readChainInfo` (`getblockchaininfo`, already parsed) is
the one required dependency. `readSnapshotInputs` therefore already returns a full `SnapshotInputs`
with null panels when the queries are absent. `apps/publisher/src/index.ts:97` nonetheless opens
`postgres(cfg.DATABASE_URL)` unconditionally and passes `makeChainQueries(sql)`.

**So this is a config path, not an architecture change.** L2's measurements, offered as hypotheses to
check rather than as a brief:

| what | measured |
|---|---|
| publisher RPC cost | **two calls per tip** — `getBlockchainInfoFull` + `getBlockHeader` ≈ 1.6/min at 75 s blocks |
| keyless endpoint ceiling | 5 requests/minute, hard, shared across Tatum's three hostnames — **this rung fits inside it** |
| where the five lanes come from | `valuePools` + `chainSupply` on `getblockchaininfo` (`sources/chain-inputs.ts:57`) — RPC, not the database |
| what the four panels need | the database. `SnapshotV1` makes every panel nullable *"precisely so"* a null renders as an absence (`chain-inputs.ts:42`) — **and this row is WRONG about `residual`; see the correction below** |
| what the plane does with a null `migrationHist` | no marks, "not measured" — `lib/plane.ts:283,287`. Already correct |
| **the snapshot field is `pools`** | not `lanes`. `Object.keys` on a built snapshot: `schema, height, hash, time, publishedAt, pools, residual, drain, migrationHist, neffSeries, lastReports, labelsVersion` |

**L2 EXECUTED THIS RUNG BEFORE WRITING THE HANDOFF.** `readSnapshotInputs` and `buildSnapshot` were
driven against the live public endpoint with all four queries `null`, and produced a real `SnapshotV1`:

```
=== LIVE MAINNET SNAPSHOT, BUILT WITH NO DATABASE ===
height 3469371   hash 00000000007abe588988...
  --- the five lanes, from the node's own valuePools ---
  transparent       11988412.32 ZEC   share 71.15%
  sprout               22591.46 ZEC   share 0.13%
  sapling             524431.21 ZEC   share 3.11%
  orchard             465369.40 ZEC   share 2.76%
  ironwood           3849163.52 ZEC   share 22.84%
  --- analysis panels (database-derived) ---
  migrationHist  null - NOT MEASURED
  neffSeries     null - NOT MEASURED
  residual       PRESENT
  drain          null - NOT MEASURED
```

**THREE PANELS ARE NULL, NOT FOUR — `residual` COMES BACK MEASURED.** It derives from the node's own
`chainSupply` against the pool sum, so it needs no database at all. This rung therefore ships the
unprovable-supply figure live as well, which L2 did not expect and which the handoff should say
plainly rather than discover.

**THE CORRECTION IS APPLIED IN §4 AND §5 RATHER THAN LEFT AS A NOTE, AND LEDGER-11 Q5(a) IS WHY.**
The prompt's own §4 deliverable 2 said "four panels null" and its §5 A1 said "whose four analysis
panels are null", two paragraphs after the transcript that shows three. An exclusion-set member is
checked against the shipped object before it is written: an assertion stating a property the object
does not exhibit does not commission a test, it misfiles a reading of the object. `residual`'s
non-nullity in RPC-only mode is a PROPERTY OF THIS RUNG, so §5 asserts it positively (A1b) instead of
asserting it away. Executed independently by the executing session before §5 was written, against
`REAL_INSTRUMENTS` with all four queries null:

```
top-level keys: schema, height, hash, time, publishedAt, pools, residual, drain, migrationHist, neffSeries, lastReports, labelsVersion
  migrationHist  null - NOT MEASURED
  neffSeries     null - NOT MEASURED
  residual       PRESENT
  drain          null - NOT MEASURED
  pools length: 5
```

The proof harness is delivered as `proof-rung1.test.ts` beside the session prompt (archived in
`handoffs/prompts/PROMPT-14.md`). It is a THROWAWAY: it calls a live endpoint and does not belong in
the suite. Use it to re-confirm, then write the real tests §5 asks for.

**AND ONE LESSON FROM WRITING IT, WHICH §5's A6 IS ABOUT.** L2's first harness did not check the HTTP
status. A 429 returned no `result`, the helper returned `undefined`, and the failure surfaced three
frames later as `Cannot read properties of undefined (reading 'time')`. **A rate-limited call that
looks like a missing field is the shape rung 2 is entirely about.** Check the status.

**Out of scope:** the mempool (rung 2); crossings (rung 3); Mode A; the address index; self-hosting
`zebrad`.

## §2 READING

`CLAUDE.md` · **`docs/2.0/SNAPSHOT.md` in full before anything touches Redis — the managed store is
shared with an unrelated production project** · `apps/publisher/src/{index,config}.ts` ·
`apps/publisher/src/sources/chain-inputs.ts` · `apps/web/src/lib/snapshot/{store,source}.ts` ·
`lib/plane.ts`.

## §3 CONTRACT

- **A null panel is a stated absence and never a zero.** `chain-inputs.ts:42` is the rule and this
  rung makes it load-bearing on a live document for the first time. A panel that renders `0` where it
  means "not measured" is a fabricated measurement.
- **An absent database is a CONFIGURATION, not a failure.** No warning storm, no degraded-mode banner
  that reads like breakage. The snapshot says which panels are absent and the site already knows how
  to render that.
- **Do not point anything but production at the managed store.** `SNAPSHOT.md` rule 5.
- **The RPC endpoint is untrusted infrastructure.** Keep `checkZebraVersionFloor`'s posture: three
  outcomes, and `unparsed` is not a pass.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **`DATABASE_URL` becomes optional in `apps/publisher`.** Absent, the composition root passes `null`
   for all four queries and never opens a connection. Present, nothing changes. The config's own
   docblock states which panels each mode publishes.
2. **A no-database publish path, proven end to end** against a real public RPC endpoint: real tip,
   real five-lane balances, **three panels null and `residual` measured** (corrected from "four panels
   null" per §1), written to a **local** Redis and read back.
3. **`docs/2.0/RUNTIME.md` gains "RPC-only mode"** — the env set, the two calls per tip, what the
   reader sees and does not see, and the one-line reason it is honest rather than degraded.
4. **The `snapshot age` defect.** The site renders `snapshot age: 0 blocks · source: fixture`. The age
   computes against "whatever the page knows to be current", which with no tip frame is the document's
   own height, so a fixture ten days stale reports zero (`lib/snapshot/source.ts:87`). Each field is
   true; together they tell a reader the data is current. **When the source is `fixture` and no tip
   frame has arrived, the age is UNKNOWN and renders as unknown.** This is the "stale site that
   renders and reports no fault" shape, in the gap A13 does not cover.
5. **`docs/2.0/CUTOVER-1.0.md`** — the operator's steps from fixture to live for THIS rung only,
   ending at a site showing live balances.

## §5 ASSERTIONS — each needs both polarities

Every assertion states its EXCLUSION SET, and the fail side names WHICH MEMBER it used (LEDGER-09a
Q2). At least one fail side per assertion is a DATA mutation — a value drawn from the set the
predicate claims to exclude — except where the assertion is type-level and says so (LEDGER-11 Q5(c)).

- **A1.** With `DATABASE_URL` unset, the publisher publishes a snapshot whose tip and five lanes are
  the node's own figures and whose three **database-derived** analysis panels — `migrationHist`,
  `drain`, `neffSeries` — are null.
  *Exclusion set:* any RPC-only document carrying a non-null `migrationHist`, `drain` or
  `neffSeries`, and any RPC-only document whose `pools` is not the node's own five lanes.
  *Fail side names:* a `DATABASE_URL` pointed at a live Postgres with rows in `migrations_zip318`,
  `pool_snapshots`, `blocks`, `pool_nullifiers` and `pool_anchors`, producing the same three panels
  NON-null — drawn from inside the set, since a non-null `migrationHist` is exactly what the RPC-only
  predicate rejects.
- **A1b.** In the same RPC-only document `residual` is **measured, not null** — it derives from the
  node's own `chainSupply` against the pool sum and needs no database — and its `supplySource` names
  `getblockchaininfo`.
  *Exclusion set:* a null `residual` in RPC-only mode, a `residual` whose `supplySource` does not name
  its RPC origin, and an `unprovableShare` outside [0, 1].
  *Fail side names:* a `getblockchaininfo` reading with no `chainSupply` at all — drawn from inside
  the set, since it is the one input whose absence legitimately costs this panel, and it must produce
  a NULL residual rather than a zero one.
- **A2.** No `postgres()` client is constructed when `DATABASE_URL` is unset.
  *Exclusion set:* any RPC-only run in which the `postgres` factory is invoked at all, with any
  argument.
  *Fail side names:* the same composition root run with `DATABASE_URL` SET, where the spy records
  exactly one call — the discriminating half, since a spy that records zero in both modes proves the
  factory is unreachable rather than that the branch works.
- **A3.** The site renders that snapshot with `source:` naming the resolved rung and every null panel
  as a NAMED absence — no zeros.
  *Exclusion set:* any null panel rendered as `0`, as an empty bar, or as any glyph a reader could
  read as a measurement.
  *Fail side names:* a snapshot carrying a MEASURED zero `migrationHist` — `canonicalCount: 0`,
  `nonCanonicalCount: 0`, a real window — which must render DIFFERENTLY from a null one; drawn from
  inside the set, because a measured zero is the value most easily confused with the absence.
- **A4.** `snapshot age` reads UNKNOWN for a fixture-sourced document with no tip frame, and a number
  once a tip frame arrives.
  *Exclusion set:* `snapshot age: 0 blocks` on a fixture-sourced document that has received no tip
  frame, and `unknown` on any document whose age is actually known.
  *Fail side names:* the fixture document at height 3,456,227 with no tip frame — the exact value on
  `zcuck.xyz` today, drawn from inside the set, since it is the input that produces the false zero
  this deliverable exists to remove. Both polarities in one test.
- **A5.** Nothing in the suite or any new script reaches the managed store.
  *Exclusion set:* any `SNAPSHOT_REDIS_*` variable read, any Upstash host, and any member of the
  forbidden command set `SNAPSHOT.md` rule 2 and rule 3 name — spelled there and deliberately not
  here — appearing in a test, a fixture, a script or a runbook step this handoff adds.
  *Fail side names:* `check-redis-safety.mjs`' own self-test, which iterates the rule's data
  structure and drives every detector over a line drawn from inside the set, including the
  "destructive command named in prose" case this handoff's own first draft of `CUTOVER-1.0.md`
  tripped; grep in both directions.
- **A6.** `pnpm -r test` green with a **real** exit code — captured directly, never through a pipe
  (**F-53-1**: L2's own harness read `tail`'s status for four PRs).
  *Exclusion set:* any exit code read from a process other than the one under test — `tail`'s,
  `grep`'s, or any pipeline's last stage.
  *Fail side names:* the same command deliberately piped to `tail`, showing `$?` report 0 while the
  test process exited non-zero — drawn from inside the set, since that is precisely the substitution
  F-53-1 records.

## §6 DISPATCH HINTS

This is small and mostly deletion — the composition root stops doing something it should never have
done unconditionally. One worker on the publisher path, one on the web-side absence rendering, one on
the `snapshot age` fix. The adversarial question throughout: *does this render an absence, or a zero?*

**L2's note.** L2 spent three exchanges saying a VPS gated this. It does not, and the file that proves
it — `ChainInputsDeps`, four nullable queries with the comment written four times — was in the
repository the whole time. The operator was right and pushed twice. Check §1's table the same way.

## §7 REPORT

```
STATUS: DONE-WITH-ASSUMPTIONS

Nothing here is a partial build. Every deliverable is in the tree and every
assertion carries a two-polarity transcript. The one thing this session could
not execute is the LIVE half of deliverable 2 - a reading from a real public
RPC endpoint - because no session in this environment can reach one. That half
is shipped as `scripts/prove-rpc-only.mjs`, driven in four directions against a
local stand-in node, and it is the operator's to run.

SPAWN MODE: subagents available, proven by a tool attempt before any work -
one Haiku worker returned `SPAWN-PROOF-OK` (agentId a4e464258d56eabed).
NO FAN-OUT WAS USED. This handoff is small and mostly deletion, as section 6
said; one lead did the publisher path, the web absence rendering and the age
fix in sequence. The post-fan-out sweep rule therefore has nothing to report
for a fan-out, and the sweep it mandates was run anyway before every commit:
`git status --porcelain` was read before each of the six, and once caught a
live mutation left in the tree (below).

FORK POINT: 04237c5, recorded as section 7 requires.
  `git merge-base --is-ancestor 4e622ff origin/main` -> exit 0 (Executed).
  HEAD and origin/main were the same commit at fork, 04237c5f44e98cb.
```

### Deliverables

**0. HANDOFF-14 written from the prompt's sections 1-6.** *Executed* (commit
`8f8b0e0`). Written as given with ONE correction applied rather than footnoted,
and the prompt archived verbatim in `handoffs/prompts/PROMPT-14.md`.

**THE CORRECTION, AND IT IS LEDGER-11 Q5(a) DOING ITS WORK.** The prompt's
section 4 deliverable 2 said "four panels null" and its section 5 A1 said "whose
four analysis panels are null" - two paragraphs after its own executed transcript
showing THREE. An exclusion-set member is checked against the shipped object
before it is written, and an assertion stating a property the object does not
exhibit misfiles a reading of the object as a test to write. Re-executed here
against `REAL_INSTRUMENTS` with all four queries null, before section 5 was
written (*Executed*):

```
top-level keys: schema, height, hash, time, publishedAt, pools, residual,
                drain, migrationHist, neffSeries, lastReports, labelsVersion
  migrationHist  null - NOT MEASURED
  neffSeries     null - NOT MEASURED
  residual       PRESENT
  drain          null - NOT MEASURED
  pools length: 5
```

A1 now asserts the three database-derived panels are null; **A1b asserts
`residual` is MEASURED, positively**, because that is a property of this rung
rather than an accident.

**1. `DATABASE_URL` optional in `apps/publisher`.** *Executed* (`d76b82a`).
`config.ts` loses the localhost default and gains `databaseUrl(cfg)`, which
decides empty-is-absent in one place on `managedStoreUrl`'s precedent.
`queries.ts` splits `ChainQueries` (nullable, what the composition root holds)
from `BoundChainQueries` (what a connection yields, never null) and adds
`NO_CHAIN_QUERIES`. `index.ts` replaces the unconditional `postgres(...)` at
line 97 with `chainAccessFor(cfg, connect)`. The config docblock states which
panels each mode publishes. One `info` line at startup names the mode.

**2. The no-database publish path, proven end to end.** *Executed* for every
link a session can reach; *UNVERIFIED* for one, labelled.
`rpc-only.integration.test.ts` builds the document with all four queries null,
publishes it through the real `SnapshotPublisher` to a **local** Redis
(`127.0.0.1:6379`) and the file sink, and reads it back **through a separate
client** - a second connection, so the assertion proves the value reached the
server rather than a buffer. The three absences are checked on the far side of
`JSON.stringify` and the server, and in the RAW TEXT (`"drain":null`), because
the failure guarded against is a serialiser writing `0` where the document holds
null.

**THE LIVE ENDPOINT IS UNREACHABLE FROM ANY SESSION HERE, MEASURED TWICE**
(*Executed*):

```
curl ... https://zcash-mainnet-zebrad.gateway.tatum.io/  -> CONNECT tunnel failed, response 403
curl ... https://mainnet.lightwalletd.com/               -> CONNECT tunnel failed, response 403

$HTTPS_PROXY/__agentproxy/status recentRelayFailures:
  connect_rejected zcash-mainnet-zebrad.gateway.tatum.io:443
    - gateway answered 403 to CONNECT (policy denial or upstream failure)
  connect_rejected mainnet.lightwalletd.com:443
    - gateway answered 403 to CONNECT (policy denial or upstream failure)
```

Two different hosts, so the wall is not host-specific. It is the same class of
refusal CLAUDE.md already records between a session and a Vercel preview, the
VPS, a live gateway and `upstash.com`, and the proxy README's instruction is to
report a policy denial rather than route around it. So the live half ships as
`scripts/prove-rpc-only.mjs`, driven in four directions (*Executed*):

```
no url                            exit 2, usage
complete stand-in node            exit 0, five lanes, residual measured, 3 absent
first call 429, then answers      exit 0, "rate limited, waiting 14s", then the tip
no chainSupply, no ironwood lane  exit 1, BOTH reasons named
the real endpoint                 exit 1, "getblockchaininfo: HTTP 403 Forbidden"
```

The 429 case is the one L2's first harness got wrong; this one checks the status
before the body, so a rate limit cannot arrive disguised as a missing field.

**3. `docs/2.0/RUNTIME.md` section 7, "RPC-only mode".** *Executed* (`c2ddbe6`).
The env set, the two calls per tip with their call sites, the panel table, why it
is honest rather than degraded, and how to check it from the outside.

**4. The `snapshot age` defect.** *Executed* (`c2ddbe6`). `SnapshotAge` is a
discriminated result; `snapshotAge()` decides; `fmtSnapshotAge` renders
`unknown` with no digit at all; `EpochClock` tracks `sawTipFrame` as its own
state and carries `data-age`. **The narrowing is deliberate and asserted**: only
a `fixture` document with no frame is unknown, because on a published document
the publisher's height IS the page's best evidence of the tip.

**5. `docs/2.0/CUTOVER-1.0.md`.** *Executed* (`c2ddbe6`, corrected `120723f`).
The operator's path for this rung only, ending at a site showing live balances.

### Section 5 assertions - two-polarity transcripts

**A1.** *Executed.* Pass: `rpc-only.integration.test.ts` - five lanes equal to
the node's own `valuePools` by value, the lockbox excluded (six pools in, five
lanes out), `migrationHist`/`drain`/`neffSeries` all null.
**Fail side, DATA, from inside the exclusion set:** the same code with
`DATABASE_URL` pointed at a live Postgres holding rows in `migrations_zip318`,
`pool_snapshots`, `blocks`, `pool_nullifiers` and `pool_anchors`, through
`chainAccessFor`'s own branch - all three panels come back NON-null. Both halves
ran; the "no reachable Postgres" marker is the one that skipped.

**A1b.** *Executed.* Pass: `residual` measured, `supplySource` names
`getblockchaininfo`, `unprovableZat` equals `sprout + orchard` - and is asserted
NOT to equal every-shielded-lane-summed, because that was this session's own
first wrong reading. **Fail side, DATA:** a node reporting no supply from either
source gives a NULL residual and `supplySource` "not reported by the node" - and
is asserted not to be `{unprovableZat: 0n}` by name.

**A2.** *Executed.* Pass: zero calls to the injected factory in RPC-only mode,
`sql` null, all four queries null. **Fail side:** the SAME spy with
`DATABASE_URL` set records exactly one call - the discriminating half, since a
spy reading zero in both modes proves the factory is unreachable rather than that
the branch works. Third case: `DATABASE_URL=""` also constructs nothing.
**Mutation (Executed):** `chainAccessFor`'s null branch changed to open a
connection anyway -> A2 fails, "the factory must not be reached in RPC-only
mode"; restored, 109 pass.

**A3.** *Executed.* Pass: `rpc-only-document.test.tsx` puts the RPC-only SHAPE
through the real `snapshotV1Schema` and the plane renders a named absence with a
condition and no `\b0\b` on any lane. **Fail side, DATA:** the same document with
a MEASURED zero `migrationHist` - both draw no marks, which is why the marks
cannot be the discriminator and the test reads the READING: null against
`countedCrossings: 0` with a real window, and `not-measured` against
`measured-zero`.

**A4.** *Executed.* Both polarities in one test: the fixture document with no
frame reads `data-age="unknown"` and does NOT match
`/snapshot age: [\d,]+ blocks?/`; a frame naming +14,175 blocks makes it
`data-age="14175"`. Two more cases: a frame naming the SAME height gives a
known `0` (the case a height comparison cannot see, which is why `sawTipFrame`
is its own state), and `redis-rest`/`redis`/`gateway` all read `0` with no
frame. **Pre-fix mutation (Executed):** `snapshotAge` reverted to always-known
-> `expected '0' to be 'unknown'`, twice; restored, 15 pass.

**A5.** *Executed*, both directions over the 19 files this branch changed.
Direction one: **no added file READS a `SNAPSHOT_REDIS_*` variable** - every hit
is prose in a docblock or a handoff. Direction two: every endpoint the added
tests and scripts dial is `127.0.0.1` or `localhost`
(`redis://127.0.0.1:6379`, `postgres://...@localhost:5432/...`,
`http://127.0.0.1:8899`). `check-redis-safety.mjs` exits 0 over the whole tree
and its 53 fixtures self-test in four directions.

**A6.** *Executed*, and the exit codes are `$?` read directly from each `pnpm`
process, never through a pipe:

```
TEST_RC=0  TYPECHECK_RC=0  LINT_RC=0  VALIDATE_RC=0  CHECK_RC=0  BUILD_RC=0

packages/content         67 passed
packages/zebra-rpc       59 passed | 1 skipped
packages/zec-instruments 98 passed
apps/web                495 passed
apps/gateway            163 passed
apps/publisher          109 passed | 4 skipped
apps/indexer            534 passed
                       ----
                       1525 passed | 5 skipped | 1530 total
zero "no Postgres reachable" lines
```

**ALL FIVE SKIPS ARE THE INVERSE MARKERS**, named individually: four are the
"no local Redis / no reachable Postgres" cases, which skip precisely BECAUSE
both were up and the real integration halves ran; the fifth is
`version-floor-smoke`, which needs a live node and is the operator's standing
capture task. An earlier run of this suite returned 93 passed / 20 skipped and
exit 0 - a green run reporting coverage it did not have - because a `pkill`
of this session's stand-in RPC servers had killed Postgres and Redis with them.
Caught by reading the counts rather than the exit code, services restarted, and
the figures above are from the complete environment.

### Provenance of every claim above

*Executed* (output shown) for all six deliverables, all six assertions, both
mutations and the six gates. *Read* (file + commit) for: the two RPC call sites
in `index.ts`; `redis-topology.ts`'s "The current snapshot. No TTL.";
`sinks/redis.ts`'s `SNAPSHOT_TTL_SECONDS` docblock; `turnstileResidual`'s
`U = Bal^sprout + Bal^orchard`. *UNVERIFIED*, labelled: that a real public
endpoint returns the figures L2 measured, and the "5 requests/minute keyless
ceiling" in section 1's table - neither is reachable from here, and
`prove-rpc-only.mjs` is what settles both.

### Assumptions, dispositioned

- **CORRECTED.** "Four analysis panels are null in RPC-only mode." Three are;
  `residual` is measured. Applied to sections 4 and 5 rather than noted.
- **CORRECTED.** "Removing `chainSupply` gives a null residual." It does not -
  `readChainValues` has a documented `valuePools` sum fallback (`fromNode ??
  fromPools`). The probe was wrong and the code was right; the behaviour it
  accidentally found is now pinned as its own test.
- **CORRECTED.** "`U` is every shielded lane." It is `sprout + orchard`.
- **CORRECTED.** "Stopping the publisher rolls the site back." It does not;
  `latest` and `height` carry no TTL. Gate round 1.
- **ACCEPTED.** Section 1's "two calls per tip" and the `pools`-not-`lanes`
  field name - both re-checked against the tree.
- **DEFERRED to section 8.** Whether the keyless endpoint's 5/minute ceiling is
  real, and whether the site should read the endpoint's rate-limit headers -
  rung 2's subject.

### Gate

**Budget, stated in the first line as LEDGER-05 Q5 requires: this gate ran ONE
round, by the lead, over the whole diff, with every finding verified by
execution and none carried forward unread.**

Round 1 returned **one finding**, and it was in clause (c) - a sentence making a
checkable claim about runtime behaviour. Four such sentences in the two new
documents were checked by EXECUTING them; three held (the `node -e` snippet
runs, `dist/index.js` is the real entry point, the two quoted log strings match
`index.ts` byte for byte) and one was false: CUTOVER-1.0's rollback section said
the site reverts on its own when the publisher stops. Fixed in `120723f`, and
the corrected fact swept - two other hits, both correct as written and left
alone (DEPLOY-2.0's build-preset fallback, RUNTIME.md line 179's VPS anchor hot
tier, which is a different key that genuinely has a 24-hour TTL).

**No finding in an executable line of the product.** The fix commit changes only
document sentences - no control flow, no predicate, no schema, no fixture - so
by clause (ii) as amended it is reviewed WITHIN this round rather than earning a
new one, and it was.

**THE POST-FAN-OUT SWEEP CAUGHT SOMETHING EVEN WITH NO FAN-OUT.** A2's mutation
was left in `index.ts` when the restoring `cp` failed - the shell's working
directory had moved mid-command, so the copy targeted a path that did not exist.
`git status --porcelain` before the next commit is what found it;
`git checkout --` restored it and the suite went back to 109 passed. Recorded
because it is the rule working in the case it was not written for.

**ROUND 2 WAS RUN BY CI, AND IT FOUND A DEFECT ALL SIX LOCAL GATES ARE BLIND
TO.** `scripts/assert-no-skipped-integration.mjs` failed on the PR head: the two
`runIf` markers in `rpc-only.integration.test.ts` were not on its `ALLOWED_SKIPS`
list, so the guard read them as integration coverage silently lost. **Every test
passed** - 707 total, 702 passed, 0 failed, 5 skipped - and the job was red on
the guard alone.

The guard is right and the suite was wrong. Its header says a new marker must be
"a deliberate edit and not an accident", and naming the two is exactly the edit
it asks for. **This is the fifth face of LEDGER-09b Q3's origin** - a new suite
arriving without inheriting a convention every existing member has - and the
count does not reset because a guard shipped.

Reproduced, fixed and discriminated, all *Executed*:

```
guard before the fix, same reports CI used   exit 1, both markers named UNEXPECTED
guard after naming the two markers            exit 0, "every integration test executed"
guard with Redis GENUINELY DOWN               exit 1, and it names the REAL test -
  "deliverable 2 ... writes the three keys and reads back a document that
   validates, with three absences" - not the marker
```

That third line is the fix's own fail side: the allowlist names the MARKER
titles, never the real ones, so a genuine loss of integration coverage still
turns the guard red.

**AND THE SECOND FINDING IS WHY IT REACHED CI AT ALL: NO LOCAL COMMAND RUNS THAT
GUARD.** It needs vitest JSON reports, which only `ci.yml` asks for, so
`pnpm check` and `pnpm -r test` are both blind to it. That is the second time in
this project a gate has existed only in CI - the first was `pnpm build`,
HANDOFF-07, and CLAUDE.md's workflow section records it as the reason `pnpm
build` was added to the required list. Recorded rather than fixed here:
restructuring the test pipeline to emit JSON locally is a change to every
package's test invocation and would widen this PR well past its scope. It is
LEDGER-14's Q5.

**EXTRAPOLATION, not a claim of convergence.** A third round would probably
find one more of round 1's kind - a sentence in `RUNTIME.md` section 7 or
`CUTOVER-1.0.md` asserting something about the publisher that has not been
executed against it. The product surface here is small and mostly deletion; the
prose surface is 300 new lines of operator instruction, and that is where round
1's finding was and where the next one would be.

## §8 LEDGER

Appended to `handoffs/LEDGER.md`, append-only, as `§8 HANDOFF-14`.
