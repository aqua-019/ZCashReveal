---
handoff: 06
title: Indexer: four pools + migration 003 + post-NU6.3 invariants
status: closed
branch: the session-designated branch (name it `feat/v2-06-four-pools` if you may choose)
track: Data
depends_on: 00
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-06 — Indexer: four pools + migration 003 + post-NU6.3 invariants

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Widen the pool model to `sprout | sapling | orchard | ironwood` across types, state machine, persistence and analysis without regressing the 171 tests; add activation heights through NU6.3; enforce the exit-only Orchard invariant; make the migration runner transactional.

**Out of scope:** No decoding of v6 transactions (HANDOFF-07). No new estimators (HANDOFF-08).

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `packages/zec-types/src/{analysis,shielded,leaks,realtime}.ts`
- `apps/indexer/src/state/*`, `persistence/*`, `migrations/001,002`, `migrate.ts`, `decoder/activation-heights.ts`, `analysis/round-trip.ts`
- Plan §3.1 (turnstile invariants) and docs/RESEARCH-v0.2.md (state tuple)
- **Gates fetch `origin/main` before fanning out** (L2 RESOLUTION for HANDOFF-05, fold 8). HANDOFF-05's round-2 gate reviewed the whole project as its diff because the local base was stale, which is most of why it cost 14 agents and 29 minutes. A gate whose diff is the whole tree is not a gate on this change.

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `ShieldedPool` is the single source of truth for the union; `Pool = ShieldedPool`; every exhaustive `switch` updated; generics `<P extends Pool>` preserved.
- Migration `003_four_pools.sql`: widen `CHECK (pool IN (...))` on `pool_commitments`, `pool_anchors`, `pool_nullifiers`, `pool_boundary_flows`; add `pool_snapshots(height, pool, balance_zat, commitment_count, nullifier_count, anchor_count, ts)` and `migrations_zip318(txid, height, amount_zat, denom_n, denom_k, canonical, ts)`. Runner becomes transactional per migration.
- `activation-heights.ts` adds mainnet NU6 `2_726_400`, NU6.1 `3_146_400`, ORCHARD_MITIGATION `3_363_426`, NU6_2 `3_364_600`, NU6_3 `3_428_143`; testnet `4_048_500`, `4_052_000`, `4_134_000`; `poolsActiveAt(height)`.
- `ValuePool`/`PoolState`: `Bal ≥ 0` for all pools; for heights ≥ NU6_3, `deltaV_orchard ≥ 0` — violation throws a typed error (our decoder is wrong, never the chain).
- `LeakClass` gains `MIGRATION_O2I` and Ironwood variants; `poolPath` gains `orchard→ironwood`; `RoundTripIndex` handles four pools.

## §4 DELIVERABLES

1. Type, state, persistence and analysis changes; migration 003; `poolsActiveAt`; updated tests; a fast-check property test that replay/rollback conserves every pool balance.

2. **`pnpm --filter @zcashreveal/indexer migrate` works on a clean checkout** (L2 RESOLUTION for HANDOFF-05, fold 1, finding F-05-1). On a fresh worktree, after `pnpm install` and before any build, the documented migrate command dies: `Cannot find module '.../packages/zec-types/dist/index.js' imported from apps/indexer/src/config.ts`. This is F-02-1's shape in a place fold 1 of the HANDOFF-04 resolution did not reach: turbo's `test: dependsOn ^build` fixed the test task, and `migrate` is not a turbo task. It does not affect CI, whose order is Install, Build, then migrate. It DOES affect the operator, because HANDOFF-10's runbook will tell a human to run migrations on a VPS from a fresh clone, and this is the command they will run. Fix it with a `premigrate`, or by routing the task through turbo with `dependsOn: ["^build"]`.

3. **Correct ZIP 317 in `docs/2.0/TRACKING-MATH.md` §3.5 and the `/method` component that renders it** (L2 RESOLUTION for HANDOFF-05, fold 4, LEDGER-05 Q3). State ZIP 317's exact transparent term `max(ceil(inSize/150), ceil(outSize/34))`, cite Zebra `zebra-chain/src/transaction/unmined/zip317.rs:160-173`, and keep the count form beside it labelled as the P2PKH-only simplification it is. Add the worked lockbox case: two 2-of-3 P2SH inputs give `L = 4` and a 20,000 zatoshi conventional fee, against the count form's `L = 2` and 10,000. This is not pedantry - the ZIP 271 lockbox is a 2-of-3 P2SH multisig, the divergence lands exactly there, and "the lockbox did not pay the conventional fee" is a false statement about the one address this project exists to track. Sweep every restatement of the count form in the tree in the same commit, per CLAUDE.md's corrected-fact rule.

4. **Compute the transaction fee by summing the outputs a transaction spends, and carry it on the analysis path so `feeZat` is real rather than `0n`** (L2 RESOLUTION for HANDOFF-05, fold 5, LEDGER-05 Q4). A fee is a property of the inputs a transaction spends, so it must be computed by summing the spent outputs, which is the indexer's job and not the boundary's: no node sends a fee field, Zebra's `TransactionObject` has none and neither does zcashd's `getrawtransaction`. Two wallet signatures (NIGHTHAWK, ZCASHD_RUST) and every `isZip317Conventional` call are blind until it exists. §8 MUST record that HANDOFF-08's golden cases depend on this AND on the `expiryheight` fix being merged, and may not be captured before both - for the same reason the fingerprint fix had to precede them: a baseline captured over an analyser that cannot see fees freezes the blindness into the record of correct behaviour.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/indexer test` passes with >= 171 tests and **no Postgres-gated test skipped** when a migrated database is reachable — assert with `node scripts/assert-no-skipped-integration.mjs`, not with a raw skip count: one test (`block-decoder.test.ts`, real mainnet fixture) stays skipped until HANDOFF-10 captures the fixture.
- **A2.** Applying migrations on a fresh DB and on a DB migrated through 001→002 both succeed; re-running is idempotent (integration test).
- **A3.** A `pool_commitments` insert with `pool='ironwood'` succeeds and with `pool='tachyon'` fails the CHECK (integration test, both polarities).
- **A4.** `poolsActiveAt(3_428_142)` excludes `ironwood`; `poolsActiveAt(3_428_143)` includes it (unit test).
- **A5.** Applying a `BoundaryDelta` with `pool='orchard'`, `height=3_428_200`, `deltaZat=-1n` throws `ExitOnlyViolation`; the same delta at `height=3_428_100` is accepted (unit test, both polarities).
- **A6.** Property test: for any sequence of deltas across four pools followed by rollback to height h, balances equal the replayed prefix (fast-check, ≥ 200 runs).
- **A7.** `grep -rn "'sapling' | 'orchard'" packages apps/indexer/src` returns only the `ShieldedPool` definition site (no stale two-pool unions).
- **A8.** On a tree with `packages/*/dist` deleted, `pnpm install && pnpm --filter @zcashreveal/indexer migrate` exits 0 *(fail side: revert the fix, run the same command, observe the module-resolution error)*. F-05-1, L2 RESOLUTION for HANDOFF-05 fold 1.
- **A9. A CLASS THAT NAMES THE TRANSPARENT SIDE IS NEVER APPLIED TO A TRANSACTION THAT HAS NO TRANSPARENT SIDE.** Added mid-session by the operator, and it is not an ordinary correctness assertion: "shielded value left the pool for the transparent side" is the exact claim class this project exists to make carefully, and the analyser was making it about every NU6.3 migration. Pass state, both halves: an Orchard-to-Ironwood migration with no transparent output classifies as `MIGRATION_O2I` when the Ironwood balance is supplied, and never as `Z_TO_T`, `T_TO_Z` or any other transparent-naming class with it withheld; and a transaction that genuinely pays a transparent output still classifies `Z_TO_T`. *(Fail side: revert the requirement that a transparent-naming class needs a transparent recipient, and watch the migration fixture flip to `Z_TO_T` while the same report carries `netTransparentInflowZat: 0n`.)*

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `chain-integrator` (Sonnet) owns the type widening and invariants; `backend-api` (Haiku) writes migration 003 from a written spec after PREFLIGHT (mechanical-rule dispatch); `test-engineer` (Haiku) the property test.
- director-quality: `security-auditor` reviews the migration runner transaction handling.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/new-session-s4er6f (harness-designated) -> PR #37, opened as a draft
and stopped there.
Four commits: dfc926a RECONCILE + folds · ac7af6e the widening · b7658d2 A9 and the
post-fan-out rule · 42e94cd two gate rounds.

DIRECTORS SPAWNED (lead names each + spawn mode proven):

SPAWN MODE PROVEN FIRST, BY TOOL ATTEMPT, before any reading: a general-purpose
subagent returned PROBE-OK with 0 tool uses in 2.6 s.

NO DIRECTORS WERE SPAWNED, and §6's routing did not happen as written. This is the
same divergence HANDOFF-05 recorded and it is stated rather than glossed: the session
ran the lead plus four Workflow fan-outs, each worker scoped to a disjoint FILE LIST
rather than to a crew role, so those three role names
do not appear below, and Loop 1's PREFLIGHT and Loop 3's spec-author review did not occur
as separate steps - the spec author and the executor were the lead in both cases. The
22 workers are named here instead:

  MAP, 4, read-only by intent: map:types · map:indexer · map:gatewayweb · map:facts.
    Produced the blast-radius map and corroborated every activation height against
    docs/2.0/research/ line by line.
  BUILD, 4: build:migration (003, the transactional runner, premigrate) ·
    build:unittests (A4, A5, the fee and leak-class and zip317 suites) ·
    build:property (A6) · build:zip317docs (fold 4 and the gateway consolidation).
  GATE ROUND 1, 10: review:{correctness,facts,security,spec,design} then
    verify:{same five}, each verifier instructed to REFUTE its lens's findings and to
    default to REFUTED where it could not reproduce one.
  GATE ROUND 2, 4: fix:a2a3tests · fix:coverage · fix:webcopy · fix:polish.

POST-FAN-OUT SWEEP (CLAUDE.md, new this session), run after each of the four fan-outs:
  after MAP    - NOT CLEAN. `packages/zec-types/src/{shielded,leaks}.ts` were modified
                 by a mapping agent scoped to read-only. Reverted with `git checkout --`
                 and re-made deliberately later. This is the incident that produced the
                 rule; see §8.
  after BUILD  - clean; every path belonged to a worker's declared scope.
  after GATE 1 - clean at the time of the sweep. Five probe files
                 (`__probe_f1.test.ts`, `__adv_f1.ts`, `__probe_f3/f4/f5`) were present
                 mid-run and were removed by their own agents before the run ended.
  after GATE 2 - clean; the only untracked paths were the two test files two workers
                 had been asked to create.

FILES (created / modified / moved):

CREATED (10)
  packages/zec-types/src/zip317.ts                 the canonical ZIP 317, from Zebra
  apps/indexer/migrations/003_four_pools.sql       the widening + two tables + the backfill
  apps/indexer/src/analysis/fee.ts                 computeFeeZat and its refusals
  apps/indexer/src/analysis/prevout-cache.ts       the resolver that makes the fee real
  apps/indexer/src/decoder/sprout.ts               the JoinSplit sum
  scripts/check-pool-union.mjs                     A7 as a guard, in CI and pnpm check
  apps/indexer/src/decoder/__tests__/activation-heights.test.ts   A4
  apps/indexer/src/decoder/__tests__/leak-class.test.ts           MIGRATION_O2I + A9
  apps/indexer/src/decoder/__tests__/zip317.test.ts               the lockbox case
  apps/indexer/src/analysis/__tests__/fee.test.ts                 fold 5
  apps/indexer/src/state/__tests__/exit-only.test.ts              A5
  apps/indexer/src/persistence/__tests__/integration/conservation.test.ts   A6
  apps/indexer/src/persistence/__tests__/integration/migrations.test.ts     A2, A3
  apps/gateway/src/__tests__/mempool-view.test.ts                 the /track class and flow

MODIFIED, by what they are
  the union            packages/zec-types/src/{shielded,analysis,leaks,views,transactions}.ts
  the state machine    apps/indexer/src/state/{value-pool,pool-state,errors}.ts
  the analyser         apps/indexer/src/decoder/{leak-analyzer,fingerprint,activation-heights}.ts
  persistence          apps/indexer/src/persistence/{leak-reports,replay}.ts, migrate.ts
  the live path        apps/indexer/src/index.ts, apps/indexer/src/analysis/{round-trip,constants}.ts, config.ts
  the gateway          apps/gateway/src/views/{context,tx,mempool}.ts, routes/tx.ts
  the site             apps/web/src/{app/tx/[txid]/page.tsx, app/track/page.tsx,
                       components/record/MethodEstimators.tsx, components/track/MempoolPanel.tsx,
                       lib/api/stream.ts, lib/api/fixtures/mempool.ts}
  documents            docs/2.0/{TRACKING-MATH.md, API.md}, README.md, packages/content/README.md,
                       packages/content/src/schema.ts
  guards and CI        package.json, .github/workflows/ci.yml, CLAUDE.md
  compile-only         legacy/dashboard/src/lib/tokens.ts (three Record<LeakClass,...> maps)

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED):

A1 - Executed by the lead, both polarities.
  PASS  [assert] total=313 passed=312 failed=0 skipped=1
        [assert] integration files with executed tests: 9
        [assert] skipped (allowed): decodeBlock - real mainnet fixture ...
        [assert] OK: every Postgres integration test executed.      rc=0
  FAIL  the same run with DATABASE_URL pointed at port 5433. VITEST STAYS GREEN AND
        rc=0 while 38 Postgres tests skip themselves; the assert script goes rc=1 and
        names all 38, the new A6 conservation test among them. That is the exact silent
        downgrade the script exists for, and it is why the assertion is written against
        the script rather than against a skip count.

A2 - Executed by the lead, and now covered by a test (see the finding below it).
  PASS  fresh database: apply 001, 002, 003, 003a, rc=0. Second run: all four skip.
        A database migrated only through 001 and 002: 003 applies, and re-applying its
        body directly with psql exits 0 with NOTICE-level output only.
  FAIL  a planted migration whose bookkeeping row violates a CHECK leaves NO object and
        NO schema_migrations row. With `sql.begin` stripped from a copy of the runner:
        `expected 'migtest_bookkeeping_probe' to be null` - the object survives.
  A FAIL-SIDE PROBE THAT DID NOT FAIL, reported as a finding per LEDGER-05 fold 7 rather
  than repaired quietly: the first transactional probe broke the migration BODY, and it
  passed with `sql.begin` removed. postgres.js sends a parameterless `unsafe()` as one
  simple-query message and Postgres wraps that in an implicit transaction, so the body
  always rolled itself back. That probe was never evidence of transactionality. It is
  kept, relabelled in-file as a regression guard on the one-simple-query property, and a
  second probe that does discriminate was added beside it.

A3 - Executed by the lead against the live database, both polarities, then given a test.
  PASS  INSERT INTO pool_commitments ... 'ironwood' -> INSERT 0 1  (and 'sprout')
  FAIL  ... 'tachyon' -> ERROR: new row for relation "pool_commitments" violates check
        constraint "pool_commitments_pool_check"
  All five tables read back from pg_constraint carry
        CHECK ((pool = ANY (ARRAY['sprout','sapling','orchard','ironwood'])))
  The test asserts SQLSTATE 23514 AND the constraint name, because "it threw" also
  passes on a NOT NULL or unique violation.

A4 - Executed by the lead.
  PASS  poolsActiveAt(3_428_142) = [sprout, sapling, orchard]
        poolsActiveAt(3_428_143) = [sprout, sapling, orchard, ironwood]
        testnet 4_133_999 excludes ironwood, 4_134_000 includes it; genesis = [sprout]
  FAIL  Executed by the gate: `>=` changed to `>` turns 7 tests red; and a surgical
        `ironwood: NU6_3 - 1` turns exactly ONE red - the negative half, "block 3,428,142
        has three, and Ironwood is not among them". The negative half is load-bearing.

A5 - Executed by the lead, six ways.
  PASS  orchard -1n @ 3_428_200 -> ExitOnlyViolation, balance unchanged at 0n
        orchard -1n @ 3_428_100 -> ACCEPTED, balance 1n
        orchard -1n @ 3_428_143 -> ExitOnlyViolation (activation is inclusive)
        sapling and ironwood -1n @ 3_428_200 -> ACCEPTED (the guard is orchard-only)
        orchard -1n @ 3_428_200 on TESTNET -> ACCEPTED (testnet activates at 4_134_000)
  FAIL  Executed by the gate, three-way: guard deleted -> 8 red; sign inverted
        (`< 0n` to `> 0n`) -> 11 red, including "a POSITIVE Orchard delta after the
        boundary is accepted: exits are the point"; the pool test dropped -> 2 red,
        "negative deltas on Sprout, Sapling and Ironwood after NU6.3 are accepted".

A6 - Executed by the property worker and re-verified by the gate.
  PASS  200 runs exactly, instrumented rather than read off the config. All four pools
        carry substantial non-zero rows.
  FAIL  three independent mutations: `rollbackAllToHeight` `>` to `>=` fails after 3
        tests with a shrunk counterexample; dropping `WHERE pool =` from the boundary-flow
        read fails after 1 with `expected 1n to be 0n` - the BALANCE half, not the delete
        count; negating the sign on read fails after 1.
  A GATE FINDING AGAINST IT, fixed: the coverage guard counted ROWS at or above the
  exit-only height, and a suppressed step writes a zero-delta row, so the guard passed
  with ZERO real Orchard movement in the region it claimed to cover. It counts non-zero
  exits now, over a generator with a third band: 0 of 1000 seeds fall below threshold,
  against 171 of 1000 before.

A7 - Executed by the lead, both polarities, on the real tree.
  PASS  [pool-union] OK: no stale two-pool unions in packages, apps
              (detector self-tested in both directions).
  FAIL  one field in leaks.ts reverted to the old pair ->
        [pool-union] FAIL: 1 stale two-pool union(s).
          packages/zec-types/src/leaks.ts:40  pool: "sapling" | "orchard";
  THE ASSERTION AS WRITTEN COULD NOT HAVE TESTED THIS. A7 names
  `grep -rn "'sapling' | 'orchard'" packages apps/indexer/src`, and that command is
  vacuous twice over: this tree is prettier-formatted with DOUBLE quotes, so the
  single-quoted pattern never matched a line of it even before the widening. A guard
  that passes because it searched for a string that cannot occur is worse than none, so
  the assertion was implemented rather than the command. The detector self-tests in both
  directions on every run and exits 2 if either direction breaks - and it caught a flaw
  in ITSELF on its first run, matching the pair inside the four-member definition site.
  The gate then found two more holes, both closed: it used `git ls-files`, so it was
  blind to exactly the untracked file being written, and it never read `.sql` - the
  format the pool CHECK constraints actually live in. Migration 002's four are
  allowlisted by file AND line, because an applied migration is a record and 003 is the
  fix.

A8 - Executed by the lead, both polarities, and the fail side was captured FIRST,
  before the fix existed.
  FAIL  (captured at session start, on a clean install with no dist)
        Error [ERR_MODULE_NOT_FOUND]: Cannot find module
        '.../packages/zec-types/dist/index.js' imported from apps/indexer/src/config.ts
        Exit status 1
  PASS  (after `premigrate`, with packages/*/dist and every tsbuildinfo deleted)
        > premigrate: pnpm --filter "@zcashreveal/indexer^..." build
        ../../packages/zec-types build: Done · ../../packages/zebra-rpc build: Done
        [migrate] done      rc=0

A9 - Executed by the lead, both polarities. ADDED MID-SESSION BY THE OPERATOR, and
  named here rather than folded into a gate-round list because it is the assertion that
  protects this site's central claim.
  WHAT IT GUARDS. `Z_TO_T` does not say "value moved"; it says shielded value crossed
  to the transparent side. An Orchard-to-Ironwood migration - Orchard positive, no
  transparent output at all - was classified `Z_TO_T` while the same report carried
  `netTransparentInflowZat: 0n`. That is a self-contradicting report and a false
  statement about every migration NU6.3 exists to produce.
  PASS  a migration with no transparent output is MIGRATION_O2I with the Ironwood
        balance supplied, and MIXED with it withheld - never Z_TO_T or T_TO_Z either way.
        A genuine deshield (one transparent output) is still Z_TO_T; a genuine shield
        (one transparent input) is still T_TO_Z.
  FAIL  the transparent-recipient requirement reverted: FOUR tests red, A9's own case
        among them, reporting
        `expected [ 'Z_TO_T', 'T_TO_Z' ] to not include 'Z_TO_T'`.
        Restored byte-identical, 25 passed.
  THE RULE HELD IN ONE PLACE AND NOWHERE ELSE, which the gate found: /track published
  `class: "shield"`, `flow: "t to z"` and `migrations: 0` for every migration, and
  `likelyWallet` published an unknown fee as `UNKNOWN_NONSTANDARD` - the same verdict as
  a fee measured and found non-conventional. Both are fixed and both now have tests.

SUITES, executed by the lead at HEAD, with Postgres 16 live and migrated:
  content 67 · zebra-rpc 23 · web 354 · gateway 108 · indexer 312 passed / 1 skipped
  = 864 passing, up from 704 at HANDOFF-05. The one skip is the mainnet block fixture
  HANDOFF-10 owns. pnpm typecheck 10/10. pnpm lint 0 errors, 1 pre-existing warning
  (`saplingSpend` in block-decoder.test.ts, recorded by every handoff since 00).
  pnpm check: all FOUR static guards. pnpm --filter @zcashreveal/content validate OK.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):

1. CORRECTED - THE HANDOFF'S TESTNET HEIGHTS ARE THREE NUMBERS FOR FIVE UPGRADES. §3
   supplies testnet 4,048,500 / 4,052,000 / 4,134,000 while naming NU6, NU6.1,
   ORCHARD_MITIGATION, NU6.2 and NU6.3. Spreading three values across five names
   positionally would have written constants that are simply wrong. Resolved from the
   repository instead: 4,048,500 is the mitigation (ZIP 257 names mainnet and testnet in
   one verbatim clause), 4,134,000 is NU6.3 (ZIP 258), 4,052,000 is NU6.2 - and testnet
   NU6.1 is 3,536,500, which is in the corpus and NOT in the handoff's list.
2. ACCEPTED - 4,052,000 is CORROBORATED BY ORDERING, NOT BY STATEMENT. The corpus gives
   "testnet 4,048,500 and 4,052,000" in the same order as the mainnet pair it follows and
   never writes "testnet NU6.2 =" in a sentence of its own. Labelled as such in the file.
   **CLOSED BY THE L2 RESOLUTION FOR HANDOFF-06, applied in HANDOFF-07.** ZIP 257 (Final)
   prints "Testnet: 4052000" under NU6.2's own heading, so the height is STATED. The
   constant never changed; only its provenance did, from weak to strong. The
   "CORROBORATED BY ORDERING" label was deleted from `activation-heights.ts` and the
   corpus line that compressed the two heights into one ordered clause was corrected, so
   both clauses above are now false about the tree. Left standing with this correction
   rather than rewritten, because a shipped handoff is a record of what was believed when
   it shipped - but an uncorrected record that the next session reads as current is the
   cross-file contradiction CLAUDE.md rates HIGH, which is why the correction is here and
   not only in the ledger.
3. ACCEPTED - THERE IS NO `NU6_ACTIVATION_TESTNET`, deliberately. No line in this
   repository gives one. A plausible number here would be indistinguishable from a
   sourced one to every later reader, and nothing needs it: poolsActiveAt turns on
   Sapling, NU5 and NU6.3 only, because NU6 and NU6.1 introduce no pool.
   **ALSO CLOSED, on the same terms.** ZIP 253 (Final) states "Testnet: 2976000"; L2 read
   the ZIP and relayed it. `NU6_ACTIVATION_TESTNET = 2_976_000` exists in
   `activation-heights.ts` and the height is in the corpus's activation table. The
   reasoning above was right for its moment and is the reason the constant could be
   added later with a citation instead of guessed earlier without one.
4. ACCEPTED - `denom_k` IS AN EXPONENT IN ZATOSHI, so it is non-negative. The corpus
   gives ZIP 318's denominations in ZEC (0.5, 1, 2, 5...), which would need a negative
   exponent; CLAUDE.md mandates integer zatoshi. 0.5 ZEC is 5 x 10^7 zat.
5. ACCEPTED - NO UPPER CHECK ON `amount_zat`. The corpus states DENOM_CAP two ways -
   "10,000 ZEC plus canonical fee" and a flat 10,000 - and a CHECK written to the second
   would REJECT a real chain observation under the first. A constraint that refuses to
   record something the chain did inverts this project's own rule that a violation means
   our decoder is wrong, never that the chain is.
6. ACCEPTED - "IRONWOOD VARIANTS", PLURAL, RESOLVED AS ONE MEMBER. Every LeakClass
   except a migration is pool-agnostic, so an `IRONWOOD_ONLY` would be the only
   pool-named non-migration class and would then owe a SAPLING_ONLY and an ORCHARD_ONLY.
   `MIGRATION_O2I` is the one the taxonomy needs.
7. CORRECTED - THE MIGRATION_O2I RULE WAS UNREACHABLE, and its docblock said the tests
   exercised it. `analyze()` passed a literal null and `classifyLeak` is module-private,
   so no transaction of any shape could reach the branch. That is the same defect this
   handoff exists to close, inside the fix. `AnalyzeContext.ironwoodValueBalanceZat` is
   the seam; both polarities are tested; HANDOFF-07 fills it rather than reopening the
   module.
8. CORRECTED - `sprout_value_balance_zat` IS NULLABLE, against a real counter-argument.
   001's sibling columns are NOT NULL DEFAULT 0 and a value balance of 0 IS a
   measurement, so the convention was defensible for rows written from now on. It decides
   the rows already written: those came from an analyser that could not see Sprout at
   all, so 0 there asserts something nobody looked for. The divergence is stated in the
   migration.
9. CORRECTED - the indexer's ZIP 317 was PULLED FORWARD from HANDOFF-08. LEDGER-05
   deferred it; CLAUDE.md's sweep rule requires every restatement of a corrected fact to
   move in the same commit, and `isZip317ConventionalFee` is computed from L, so a wrong
   L would publish a wrong answer through a newly-fixed field.
10. DEFERRED - no negative cache in `PrevOutCache`. An unresolvable parent is refetched
    on every analysis; 500 resolves of one missing parent issue 500 RPC calls. A TTL
    entry trades a cost problem for a freshness one and there is no unit suite over the
    class to hold it. The docblock now states the unbounded consequence rather than only
    the intent. -> §8.
11. DEFERRED - Ironwood is absent from `perPoolZat` and from `DecodedShieldedBundle`,
    because decoding a v6 bundle is HANDOFF-07's deliverable and is explicitly out of
    scope. An `ironwoodActions: []` that is always empty would be a hardcoded zero the
    site renders as a measurement. -> §8.

NOTICED (outside scope, not acted on):

- `apps/gateway/src/views/address.ts:190` can never assign `"migration"`, though its
  Direction union has the member and `DIRECTION_TEXT` has copy for it. Every migration
  row on /address prints "t to t - transparent throughout". Pre-existing; same family as
  the /track defect this session fixed, in a file no fold named.
- The integration suite is not safe against two concurrent vitest processes on one
  Postgres. `fileParallelism: false` orders files within a run, not across runs, and
  every suite TRUNCATEs shared tables in `beforeEach`. Two round-2 workers collided on it
  and produced failures in both directions. CI is safe as configured - it runs one
  `vitest run` per package - so this bites two agents or two developers working side by
  side, and would bite CI only if integration files were ever split across processes.
- The two migration rows in `apps/web`'s mempool fixture contradict their own fee: their
  value balances imply 500,000 zat where the row prints 10,000. Inherited from the
  mockup's arithmetic.
- `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html:1047` still states the count-based ZIP
  317 form unlabelled. One commit in its history, the HANDOFF-00 import; the live
  component derived from it is corrected. Left as a frozen design artifact.
- `apps/indexer/src/config.ts` no longer exposes ZIP317_MARGINAL_FEE_ZAT. It was a
  consensus constant settable per deployment, read by nothing.
- The migrate runner prints a postgres.js NOTICE object for
  `CREATE TABLE IF NOT EXISTS schema_migrations`. Executed against origin/main's runner
  unmodified: it does the same. Pre-existing, not introduced here.

UNVERIFIED (labelled):

- THE WIRE CASING OF `vjoinsplit` IS NOT CORROBORATED AGAINST A NODE, and this is the
  most important item in this section. Every Sprout term added here keys on lowercase
  `vjoinsplit`; no fixture in the repository contains a JoinSplit, and `rpc-casing.test.ts`
  does not cover it. This is the exact shape of the `expiryheight` defect HANDOFF-05
  found - if the spelling is wrong, every Sprout term is silently 0n with no failing
  test. It needs a node or a captured Sprout transaction.
- The ZIP 271 lockbox's 297-byte input is a synthetic construction. The arithmetic is
  internally consistent and identical in all four places it appears, but no real
  disbursement input was measured.
- Three Zebra source citations (`transaction.rs`, `zip317.rs:160-173`, the JoinSplit
  struct) are carried from what this repository already states. Zebra is not in this tree
  and was not fetched.
- No route, page or migration was exercised against a synced node, the VPS or a
  preview host. Per LEDGER-04 Q3 a session cannot reach any of them.
- No browser render. /method and /track were verified by source, tsc, lint and unit
  tests; the Lighthouse and visual checks are the operator's.

GATE ROUNDS: 2 · fingerprints (file · rule · severity) per round

ROUND 1 - 5 review lenses, then 5 verifiers instructed to REFUTE. 41 raw findings, every
one carrying an executed probe; every one read by the lead. Verification budget stated in
the first line of all ten returns, per LEDGER-05 Q5. Surviving fingerprints:
  gateway/views/mempool.ts        · migration-class-unreachable          · HIGH
  gateway/routes/tx.ts            · bigint-of-null-drops-leak-record     · HIGH
  gateway/views/tx.ts             · negative-fee-rendered                · HIGH
  indexer/decoder/fingerprint.ts  · unknown-fee-published-as-verdict     · HIGH
  decoder/__tests__/rpc-casing.ts · unknown-fee-test-passes-zero         · HIGH
  gateway/views/mempool.ts        · conventional-decided-by-approximation· HIGH (sweep)
  web/app/tx/page.tsx             · dek-says-the-fee-is-published        · MID (sweep)
  docs/2.0/API.md                 · worked-example-publishes-false-zero  · MID (sweep)
  README.md                       · three-static-guards                  · MID (sweep)
  web/app/track/page.tsx          · denominator-counts-unpriced-rows     · MID
  indexer/persistence/leak-reports· on-conflict-does-not-refresh-fee     · MID
  migrations/003                  · false-zero-rows-left-in-place        · MID
  migrations/003                  · sprout-column-default-zero           · MID
  indexer/analysis/fee.ts         · negative-fee-not-refused             · MID
  scripts/check-pool-union.mjs    · blind-to-untracked-and-sql           · MID
  indexer/analysis/prevout-cache  · bounded-by-count-not-size            · MID
  integration/conservation.test   · coverage-guard-counts-zero-rows      · MID
  handoff §5 A2, A3               · assertion-claims-a-test-that-is-absent· MID
  decoder/sprout.ts               · gateway-shipped-without-it           · MID (fact)
  decoder/activation-heights.ts   · cve-disclosure-dated-2018            · MID (fact)
  decoder/activation-heights.ts   · provenance-block-self-contradicts    · MID (fact)
  zec-types/zip317.ts             · divergence-condition-overstated      · LOW (fact)
  TRACKING-MATH §3.5, /method     · exact-iff-fails-from-75-inputs       · LOW (fact)
  web/components/MempoolPanel     · not-priced-to-2-not-a-sentence       · LOW
  zec-types/views.ts              · duplicate-16-line-docblock           · LOW
REFUTED by the verifiers, and NOT acted on: the /method 3.5 entry's length (the remedy
would have removed the worked lockbox case that fold 4 orders verbatim); the 3.5
refusal "changing subject" (it encodes L2's own rationale); "the one address this site
follows most closely" as an unsupported superlative (it is L2's binding phrasing);
`value_flow_direction` having other consumers (it is write-only); a missing height CHECK
(zero of eleven height columns has one, including 001's).

ROUND 2 - 4 workers, all fingerprints above closed. THREE OF THE FINDINGS WERE DEFECTS
THE ROUND-1 FIX CREATED, which is the part worth reading: making the fee nullable opened
the negative-fee and BigInt(null) paths that the NOT NULL column had kept unreachable,
and making the migration class reachable made a direction-blind label and a
self-contradicting crossing tile live. All three are fixed with both-polarity tests. No
finding reached a third round on itself, so Loop 4's per-finding cap was never
approached and nothing is NOT CONVERGING.

CI AFTER THE PR OPENED: red on the first run, and it was environment dependence rather
than flake. Three tests in `migrations.test.ts` compared `schema_migrations` read back
with a SQL `ORDER BY name` against `migrationFiles()`, which is the runner's own
JavaScript byte-order sort. Postgres orders by the DATABASE'S COLLATION: the development
container is C.UTF-8, where `_` (0x5F) precedes `a` (0x61), and the CI service container
is en_US.utf8, where punctuation is ignored at the primary level - so `003_four_pools`
and `003a_gateway_cache` swap places. The migrations themselves applied in the right
order, which the assertion over the runner's own `[migrate] apply` lines proved in the
same red run. Reproduced locally before fixing by ordering on `replace(name, '_', '')`
to make a C.UTF-8 server return the en_US sequence - identical diff, same three tests -
and the fixed file passes against that probe. Both sides now sort in the same language.

PREVIEW URL (if any): none. A session cannot reach a preview host - Deployment Protection
returns 302 to SSO and this container's egress proxy refuses the CONNECT tunnel with 403
before that (LEDGER-04 Q3). The deployed measurement is the operator's.
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):
INFERRED (non-empty inferences a worker made):
NOT-MATCHED (patterns handed over that did not apply):
SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):
GATE ROUND COUNTS:
DEFERRED ASSUMPTIONS:
```
