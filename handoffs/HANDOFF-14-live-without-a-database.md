---
handoff: 14
title: Live without a database - the publisher on RPC alone (rung 1 of three)
status: in-progress
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

*Filled by the executing session before the PR opens.*

## §8 LEDGER

*Appended to `handoffs/LEDGER.md`, append-only.*
