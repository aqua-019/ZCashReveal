---
handoff: 09
title: Turnstile accounting, migration lens, Ironwood birth, snapshot publisher
status: closed
branch: the session-designated branch (name it `feat/v2-09-instruments-snapshot` if you may choose)
track: Data
depends_on: 06, 08
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-09 — Turnstile accounting, migration lens, Ironwood birth, snapshot publisher

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

The pool-level instruments (Unprovable Residual, drain, migration lens, Ironwood-birth N_eff series) and `apps/publisher`, which writes `snapshot.json` every block so the public site can never render empty.

**Out of scope:** No web wiring (HANDOFF-11).

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- Plan §3.1–3.5 and §4 decision 2
- `apps/indexer/src/index.ts`, `state/value-pool.ts`, `apps/gateway/src/ws-broker.ts`
- `migrations_zip318`, `pool_snapshots` from HANDOFF-06
- *(added by LEDGER-10 fold 8.)* **The eleven static guards `pnpm check` runs**, because this handoff is the first to add a `FilterApplication` variant since two of them started enforcing rules about exactly that: `scripts/check-no-emoji.sh`, `check-vercel-config.mjs`, `check-redis-safety.mjs`, `check-pool-union.mjs`, `check-corpus-citations.mjs`, `check-audit-consumers.mjs`, `check-finding-sites.mjs`, `check-compose.mjs`, `check-zebrad-config.mjs`, `check-infra-docs.mjs`, `check-ledger-structure.mjs`. Read at least the headers of `check-audit-consumers.mjs` (a variant gaining a FIELD, which `assertNever` cannot see) and `check-redis-safety.mjs` (which scans every file in this repository, including the publisher's, and whose `NAMING_ALLOWED` list does not include `apps/publisher/**` - so no source file, comment, test name or fixture there may spell a forbidden command, not even in order to forbid it).

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `analysis/turnstile-accounting.ts`: per-pool `Bal`, in/out per window, `U_h = Bal_sprout + Bal_orchard`, `V_h = 1 − U_h/Supply_h`, drain `D_h = 1 − Bal_orchard,h / Bal_orchard,NU6.3` and velocity (24 h / 7 d). Supply from `getblockchaininfo` `valuePools`/issuance — document the source.
- `analysis/migration-lens.ts`: denomination histograms per block/window; session bounds (note-count lower bound `⌈B/10,000⌉`, wallet upper bound = denomination runs); stranded-dust estimate — distributions only. **DIVERGED, SPEC-WAS-AMBIGUOUS, gate round 1:** the wallet bound shipped is plan §3.4's `≤ Σ counts`, not the run count this line and TRACKING-MATH §3.9 give, because the run count is falsified by two wallets crossing one denomination in adjacent blocks and tightens as evidence accumulates. The run count ships beside it as `denominationRuns`, which is not a bound. See §7 and the LEDGER §8 block; TRACKING-MATH §3.9 carries the correction.
- `analysis/ironwood-birth.ts`: `N_eff` series for Ironwood spends since `3_428_143` and the share per claim level.
- `apps/publisher`: writes `snapshot.json` `{height, hash, time, pools, residual, drain, migrationHist, neffSeries, lastReports (≤ 50), labelsVersion}` on every tip to **every configured sink**; schema `SnapshotV1` in `packages/zec-types`. Sinks: `file` (`SNAPSHOT_FILE`, dev + the gateway's local copy), `redis` (`SNAPSHOT_REDIS_KV_URL` or `SNAPSHOT_REDIS_REDIS_URL`, a `rediss://` URL — the Vercel-managed store, already connected; the publisher is its only writer), optional `blob` (`SNAPSHOT_BLOB_URL`/token; stub allowed). Sinks are independent: a failing sink is logged as `{sink, err}` and the others still write; the process never exits on a sink failure.
- Redis sink keys (one `MULTI` per tip): `zecreveal:snapshot:latest` (JSON, no TTL), `zecreveal:snapshot:<height>` (JSON, TTL 86,400 s), `zecreveal:snapshot:height` (integer string). **Never** write per-mempool-transaction data to the managed store (that stays on the VPS Redis).
- **THE MANAGED STORE IS SHARED WITH AN UNRELATED PRODUCTION PROJECT** (established by the operator in the Vercel UI, 23 Aug 2026; recorded in `docs/2.0/SNAPSHOT.md`, which this handoff must read before writing a line of the publisher and may not weaken). Every key begins `zecreveal:` — no scratch keys, no health-check key outside it. `FLUSHDB`, `FLUSHALL`, `SWAPDB` and `SCRIPT FLUSH` are forbidden; `KEYS` is forbidden outright; `SCAN` only with `MATCH zecreveal:*`; no `DEL` by pattern. Tests never point at this store. **The CI `redis:7` service does not exist yet** — this handoff's deliverable 1 adds it, and until then there is no local substitute in CI, so nothing should be written as though the mitigation were already in place. Local development and builds are covered the same way: `apps/web`'s Playwright config blanks all five `SNAPSHOT_REDIS_*` names for the build it starts. `scripts/check-redis-safety.mjs` enforces the command list in CI.
- Budget: 3 commands per block, ~1,150 blocks/day → ≈ 3.5 k/day, ≈ 105 k/month, which is **≈ 21% of a 500 k monthly allowance shared with the other project** — not "far inside any managed tier", which is what this line said before the sharing was known. The publisher therefore logs a monthly running command count and **refuses to start** if `SNAPSHOT_REDIS_MONTHLY_BUDGET` (default 150000) would be exceeded, so this project can never be the reason the other one is rate limited. **That counter lives in a file on a named VPS volume, keyed by `YYYY-MM`, read at startup and flushed after each tip — never in the managed store**: putting it there would add a fourth command per tip and break A10, and holding it only in memory would reset it on every restart and make the ceiling vacuous. And the write budget is only half the picture — `apps/web`'s reads are commands too, they are the unbounded half, and `docs/2.0/SNAPSHOT.md` §5 assigns bounding them to HANDOFF-11.
- Gateway: `GET /api/snapshot` serves the latest; WS sends a `snapshot` frame on connect.
- *(added by LEDGER-10 fold 8.)* **A NEW `FilterApplication` VARIANT REGISTERS ITS `params` WITH `check-audit-consumers.mjs`'S EXPECTATIONS IN THE SAME COMMIT THAT INTRODUCES IT.** Not the next commit and not the gate round: the same one. This handoff adds instruments, instruments emit audit records, and it is the first handoff after that guard exists which will create one. The guard's rule is that a case block reading ANY field of `params` must read EVERY field, and a deliberate omission is recorded in `ACKNOWLEDGED` **with its field list** - so a variant later gaining a field defeats every acknowledgement at once, which is the property that makes the guard worth more than the rule it replaces. Two mechanical constraints the variant itself must satisfy or the guard's parser will not see it: the `filter` name is lowercase and underscores only, and the `params` object's closing brace sits at exactly six spaces of indentation. A new name also has to enter `filterNameSchema` in `packages/zec-types/src/views.ts`, which is a CLOSED zod enum - that is `tsc` doing the other half, and `views.ts` itself rules that a member nothing emits is a defect, so do not add a name speculatively.

## §4 DELIVERABLES

1. Three analysis modules + tests; `apps/publisher` (Dockerfile included) with the `file` + `redis` sinks; gateway snapshot route/frame; `.github/workflows/ci.yml` gains a `redis:7` service for the sink test; `docs/2.0/SNAPSHOT.md` — which **already exists**: HANDOFF-05 wrote its safety half (the sharing, the namespace rule, the forbidden commands, the budget and the exit condition) because the store was connected before this handoff opened. This handoff adds the schema, the cadence and the sink list to the section that says they are owed, and may not weaken §§1–6. The two-Redis topology and the operator's connect steps are already there; the TCP URL goes in the VPS `.env`, never git.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** Residual: with fixture balances sprout 22,621, orchard 708,841, supply 16,889,987 → `U = 731,462`, `V = 0.95669 ± 1e-5` (unit test).
- **A2.** Drain: `Bal_orchard` 3,660,000 at NU6.3 and 708,841 now → `D = 0.8063 ± 1e-4`; velocity over a 24 h fixture window equals (Δbalance / 24) within 1e-6.
- **A3.** Migration lens: a fixture of 847 crossings yields a histogram whose bucket counts sum to 847 and whose amounts are all canonical *(fail side: inject a 499.5 ZEC crossing → flagged non-canonical and counted separately)*.
- **A4.** Ironwood birth: a fixture of spends with N_eff values {5, 50, 500, 5000} produces shares 25/25/25/25 across the four claim levels.
- **A5.** `snapshot.json` produced by a dev run validates against `SnapshotV1` (Executed: the validation output pasted in §7).
- **A6.** Publisher writes exactly once per new tip (fake tip stream of 5 heights with one duplicate → 5 writes; unit test).
- **A7.** Redis sink against the CI `redis:7` service: after one publish, `GET zecreveal:snapshot:latest` parses and validates as `SnapshotV1`, `GET zecreveal:snapshot:height` equals the tip, and `TTL zecreveal:snapshot:<height>` is in (0, 86400] (integration test) *(fail side: point `SNAPSHOT_REDIS_KV_URL` at a closed port → the file sink still writes, the process stays up, and the log line carries `sink=redis`)*.
- **A8.** `grep -rn 'rediss\?://[^$"]' apps/publisher docker-compose*.yml .env.example` matches only the `.env.example` placeholder — no real Redis URL or password is committed.
- **A9.** `GET /api/snapshot` returns the latest file with `Cache-Control: max-age=60`; the WS `snapshot` frame is the first frame a new client receives (test).
- **A10.** *(added by HANDOFF-05 from the operator's shared-store note.)* **One tip produces exactly three managed-store commands.** Count them — a spy on the client, not a reading of the code — across a fake tip stream, and assert the total is `3 × tips` *(fail side: add a fourth command, e.g. a `GET` to check what is already there, and watch the count assert)*. Counting is the only honest way to assert "exactly three"; the gateway's Redis connection count is pinned the same way and for the same reason.
- **A11.** *(same source.)* **Every key the publisher writes begins `zecreveal:`.** Capture every key argument the spy sees and assert the prefix on all of them, including any key written on a failure or shutdown path *(fail side: write one key without the prefix → the assertion names it)*. A key outside the namespace lands in the other project's keyspace.
- **A12.** *(same source.)* **The publisher refuses to start over budget.** With a recorded monthly count at or above `SNAPSHOT_REDIS_MONTHLY_BUDGET`, the process exits non-zero with a message naming the ceiling and writes nothing to the managed store; the `file` sink is unaffected *(fail side: one command under the ceiling → it starts and publishes normally)*.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `chain-integrator` (Sonnet) for the accounting math; `backend-api` (Haiku) builds the publisher from a written contract after PREFLIGHT; `test-engineer` (Haiku) for §5.
- director-quality: `devops-deployer` verifies the publisher container builds and the CI redis service; `security-auditor` confirms the TCP URL (it carries a password) only ever comes from env, that the managed store receives `zecreveal:`-prefixed snapshot keys only, and that no forbidden command reaches it — the store is shared with another production project, so this is the highest-consequence review in the handoff.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/new-session-e2vovd (harness-named; the convention name would be
  feat/v2-09-instruments-snapshot) - PR #44, "HANDOFF-09: turnstile accounting,
  migration lens, Ironwood birth, snapshot publisher". Stopped at opened.
  NOTE FOR THE OPERATOR: #44 was taken OUT of draft at 12:47 UTC on 30 Aug, before
  this write-back existed. That was not this session and it has not been undone.

SPAWN MODE: workflows and subagents both available, proven by tool attempt at
  session start. Concurrency measured at 4 CPUs, so both fan-outs ran in waves of
  roughly two agents rather than in one pass; each wave's output was committed
  path-scoped, with a mutation-marker grep over the staged diff before every
  commit.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  director-build (fan-out 1, in-process subagents): chain-integrator x3 for the
    three estimators; backend-api x2 for the publisher after PREFLIGHT;
    test-engineer x2 for section 5; researcher x1 for the ZIP 318 / ZIP 258
    reading. director-build (fan-out 2): backend-api for the gateway route and
    the WS frame; devops-deployer for the CI redis service and the Dockerfiles.
  director-quality (gate round 1): design-reviewer, security-auditor,
    devops-deployer, docs-scribe, plus three refuters per finding.
  POST-FAN-OUT SWEEP RUN AFTER EACH FAN-OUT, per CLAUDE.md. Fan-out 1 returned a
  clean `git status --porcelain` against the intended paths. Fan-out 2's gate
  returned one stray write - a reviewer scoped read-only edited a file in the
  tree, the THIRD occurrence in this project's history after HANDOFF-04 and
  HANDOFF-06. Reverted with `git checkout --`, re-verified, and the correction it
  had made was re-made deliberately by the lead. Nothing that worker wrote was
  carried into a commit.

FILES (created / modified / moved): 79 files, +10,323 / -171, across 22 commits.
  Created: packages/zec-types/src/snapshot.ts; packages/zebra-rpc/src/version-floor.ts;
    apps/indexer/src/analysis/{turnstile-accounting,migration-lens,ironwood-birth}.ts
    and their four test files; the whole of apps/publisher (config, budget, logger,
    instruments, labels-version, publisher, snapshot-builder, index, sinks/{sink,
    file,redis,managed-store}, sources/tip-source, five test files);
    scripts/redis-keys.mjs.
  Modified: packages/zec-types/src/{analysis,views,index}.ts; apps/indexer/src/
    analysis/index.ts; apps/gateway/src/{index.ts,ws-broker.ts,server.ts,
    snapshot-source.ts,routes/snapshot.ts,views/pools.ts} and tests; docker-compose.yml;
    .github/workflows/ci.yml; apps/{indexer,gateway}/Dockerfile; apps/publisher/Dockerfile;
    scripts/{check-redis-safety,check-compose,check-finding-sites}.mjs;
    legacy/dashboard/src/components/CandidatesPanel.tsx; docs/2.0/{SNAPSHOT,API,
    RUNBOOK-VPS,TRACKING-MATH,ZECREVEAL-2.0-PLAN}.md; CLAUDE.md; README.md;
    .env.example; handoffs/{README,LEDGER,LOG}.md and HANDOFF-{09,10,11,13}.

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance):

  A1 residual - EXECUTED. PASS: "sprout 22,621 and orchard 708,841 against supply
    16,889,987 give U = 731,462 ZEC and V = 0.95669". Derived independently by the
    lead before reading the worker's code, then compared. FAIL: four separate
    refusals executed - supply 0 throws rather than producing Infinity; an absent
    sprout or orchard balance throws rather than counting as zero; a negative pool
    balance throws (ZIP 209); a residual larger than supply throws rather than
    publishing a negative verified share.

  A2 drain - EXECUTED. PASS: "baseline 3,660,000 ZEC and 708,841 ZEC now give
    D = 0.8063"; "velocity over a 24 h fixture window equals delta balance over 24".
    FAIL: baseline 0 throws; a one-sample window gives a NULL velocity, not a zero
    one; two samples sharing a timestamp give null, not Infinity; a series with
    nothing at or below atHeight throws rather than reporting a drain it never read.

  A3 migration lens - EXECUTED. PASS: "847 crossings, bucket counts sum to 847,
    every amount canonical". FAIL: "a 499.5 ZEC crossing is flagged non-canonical
    and counted separately". Plus a property over 300 random windows WITH ITS
    WORKED CASE EXECUTED BY NAME (LEDGER-08 fold 3): "a 499.5 ZEC crossing silently
    absorbed into the 500 bar", and the law's own second half, "the law fires when
    a crossing IS in the wrong bar".

  A4 Ironwood birth - EXECUTED. PASS: "N_eff {5, 50, 500, 5000} produces shares
    25/25/25/25". FAIL: "5000 becomes 500 and the shares become 25/25/50/0".
    Plus: the empty series gives all-zero shares and a NULL minNEff, never NaN, and
    the empty case is shown REACHABLE so that a NaN share would be caught.

  A5 snapshot validates - EXECUTED. PASS: "serialize -> write -> read ->
    snapshotV1Schema.parse succeeds", and "every panel null still validates - an
    unmeasured publisher is a legal one". FAIL: a document missing `schema` is
    rejected and the parse names the field; a zatoshi written as a JSON number with
    a decimal point is rejected.

  A6 one write per new tip - EXECUTED. PASS: "a stream of 5 heights containing one
    duplicate produces 5 writes, not 6". FAIL: "the duplicate is refused by NAME,
    so the outcome says which rule fired". Plus: a reorg at the same height IS
    published, because the hash is part of the identity.

  A7 redis sink - EXECUTED AGAINST A REAL REDIS. A local server on
    127.0.0.1:6379 is reachable in this container (probed: REACHABLE), so the
    integration half RAN rather than skipping. PASS: "latest parses as SnapshotV1,
    height equals the tip, TTL is in (0, 86400]", and `latest` carries TTL -1, no
    expiry. FAIL: "a closed port - the file sink still writes, the process stays
    up, the log carries sink=redis". The suite still carries the reachability gate
    and its own skip marker, so it reports honestly on a machine with no Redis.
    CI now runs it against a `redis:7` service.

  A8 no committed credential - EXECUTED, AND THE ASSERTION'S LITERAL FORM DOES NOT
    HOLD WHILE ITS SUBSTANCE DOES. The grep as written -
    `grep -rn 'rediss\?://[^$"]' apps/publisher docker-compose*.yml .env.example` -
    returns 40 lines, not one. Every one of them is a docblock, a test fixture on
    `.example.test`, a `127.0.0.1` port, or the `PLACEHOLDER-NOT-A-REAL-TOKEN`
    line: no real host, no real password, nothing that authenticates anywhere.
    `git grep -l 'rediss://'` names nine tracked files for the same reason. The
    `.env.example` comment that claimed to be "the only `rediss://` string this
    repository commits" was FALSE when it was written and was corrected in commit
    29dfbe6 - in the very commit whose message said otherwise, which is the
    LEDGER-03 Q3 shape caught on its own branch.

  A9 snapshot route and first WS frame - EXECUTED. PASS: "the published document is
    served with max-age=60, and it is a V1"; "the body is the file on disk and not a
    constant - a second height serves that height"; "frame 1 is the SnapshotV1
    document, frame 2 is the mempool snapshot"; "the frame and GET /api/snapshot
    carry the identical document". FAIL: no snapshot file gives 503 and NEVER an
    empty 200; a document with no `hash` is a 503 naming the field; an unknown
    version is a 503 rather than a best-effort 200; a half-written file is a 503
    with reason `malformed` and the parser's own words are NOT echoed to the client.

  A10 exactly three commands - EXECUTED, AND THE CLAIM IS NARROWER THAN ITS NAME.
    PASS: "4 new tips produce 3 x 4 = 12 commands, counted on the client";
    "a duplicate tip spends nothing at all"; "the three are one SET with no TTL,
    one with EX 86400, and the height". Three is the WRITE count. `MULTI` and
    `EXEC` put five commands on the wire, and whether Upstash's meter bills the
    envelope is a fact about their billing that NO SESSION CAN READ - egress to
    upstash.com is refused by the container's proxy (EGRESS_BLOCKED, executed).
    Both numbers are now measured and pinned - `COMMANDS_PER_TIP` 3,
    `WIRE_COMMANDS_PER_TIP` 5 - and the gap is stated in three places rather than
    resolved by guess. The charge stays at three deliberately: five costs about
    172,500 a month against a 150,000 ceiling, so charging it on a guess would trip
    the gate around day 26 and run the publisher file-only, buying nothing against
    a 500,000 allowance that is a third spent either way. Reading the console for
    one month is now a named operator task in handoffs/README.md.

  A11 every key is `zecreveal:` - EXECUTED, AND ITS FAIL SIDE WAS A PROBE THAT
    COULD NOT FAIL UNTIL THE GATE. PASS: every key argument across three tips
    carries the prefix; the failure path writes no key outside it and adds no
    fourth; the shutdown path writes nothing at all; the one builder produces all
    three and only owned keys. THE ORIGINAL FAIL SIDE asserted
    `/not a block height/` - which is `snapshotKeyForHeight` refusing an impossible
    height ONE FUNCTION EARLIER. `assertOwnedNamespace` never ran, and the test's
    own comment admitted it needed "a height whose key builder cannot be trusted".
    A guard nothing can trip is indistinguishable from a guard that does nothing.
    `RedisSinkOptions.keysFor` now makes that builder injectable, so the probe
    hands the sink a `zcashreveal:` key - the one-letter transposition rule 1
    exists for - and the guard refuses it before `EXEC` with nothing committed and
    one queued `set`. The guard is also exercised directly in both polarities, and
    the height case is kept as its own test. FAIL SIDE OF THE FIX: unwiring
    `assertOwnedNamespace` from the middle `SET` makes the probe resolve instead of
    rejecting.

  A12 refuses to start over budget - EXECUTED, AS A REAL PROCESS. PASS: "the real
    process exits non-zero, names the ceiling, and leaves the file alone"; and at
    the ceiling a RUNNING publisher spends nothing and still writes the file.
    FAIL: "one command under the ceiling, the same process starts" (6.0s, a real
    spawn), and one under the ceiling the same running publisher spends its three.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED — reason):
  1. CORRECTED - L2's fold 1 reason. The ruling said Zebra 6.3.0 adds the
     funding-stream recipient ADDRESSES and that on 6.2.3 the LEDGER-08 Q1 fold
     "cannot be executed". Executed against Zebra's source at both tags:
     `zebra-rpc/src/methods/types/subsidy.rs` is byte-identical between v6.2.3 and
     v6.3.0 with `FundingStream.address` in both; the whole 6.3.0 change is
     `is_nu6 = current == Nu6` becoming `is_post_nu6 = current >= Nu6`, and the
     CHANGELOG says it outright - "recipient names and specification URLs [...]
     Amounts and addresses were never affected" (PR #11172). The DECISION survives
     and the reason is stronger: what 6.2.3 gets wrong after NU6 is the recipient's
     NAME and the specification URL, and this project displays the labeller and the
     method beside every label. Corrected in place rather than copied.
  2. CORRECTED - fold 3 as specified was rejected by its own guard.
     `scripts/redis-keys.mjs` enumerates, and `check-redis-safety` flagged it, as it
     should. Resolved with a narrow PROOF-based exemption: a `SCAN` bounded by
     `VPS_KEY_PREFIX`, in a non-`.md` file that CALLS `assertNotManagedStore` with
     an array literal. Nothing is inferred about which server a line reaches, which
     is what LEDGER-10 Q2 forbade. The guard also correctly rejected the lead's
     first draft, for holding the MATCH bound in a variable.
  3. ACCEPTED - the publisher mirrors the estimators' signatures structurally
     rather than importing `@zcashreveal/indexer`. A worker refused an instruction
     to import it and was right: the indexer's Dockerfile ships no dist the
     publisher image copies, `zeromq@6` is a native addon the publisher's image
     carries no compiler for, and the indexer's entry imports the ZMQ subscriber.
     The mirror types were verified against the real signatures through a temporary
     composition root, in both polarities, which was then deleted.
  4. ACCEPTED - `velocity24hZecPerHour` is a `number` (ZEC/hour), not a bigint.
     It is a RATE, not a zatoshi amount; the convention governs amounts.
  5. CORRECTED - A8's literal grep. See A8 above.
  6. DEFERRED - whether the managed store's meter bills `MULTI`/`EXEC`. See A10;
     it is in section 8 and is a named operator task.

THE PRINCIPAL DEFERRED ITEM, stated before NOTICED because it is not an aside:
  THE PUBLISHER DOES NOT REACH THE INSTRUMENTS. `apps/publisher/src/index.ts`
  passes `NO_INSTRUMENTS` to `buildSnapshot`, so `residual`, `drain`,
  `migrationHist` and `neffSeries` publish as `null` on every tip. That is LEGAL
  under `SnapshotV1` - every panel is nullable by design, and null means "not
  measured" rather than zero, which is the distinction section 8.2 of SNAPSHOT.md
  exists to keep - and it is not what the handoff is for. The three instruments
  this handoff built are exercised only by their own tests.

  IT IS A PACKAGING PROBLEM, NOT AN OVERSIGHT, and the shape is worth stating
  because it decides who fixes it. The estimators live in
  `apps/indexer/src/analysis/`, where section 4 of this handoff puts them. The
  publisher's image STRUCTURALLY cannot contain them: its Dockerfile copies no
  indexer dist, `@zcashreveal/indexer` depends on `zeromq@6` (a native addon the
  publisher's image carries no compiler for, deliberately - see that Dockerfile's
  header), and the indexer's entry point imports the ZMQ subscriber, so importing
  the package at all pulls a socket layer into a process that has no business
  opening one. A worker refused an instruction to import it and was right.

  THE REPAIR IS A PACKAGE MOVE - the three estimators into a dependency-free
  workspace package both apps can import - and it is NOT taken here. It touches
  the indexer's imports, both Dockerfiles and the workspace layout, it is an
  architectural decision this handoff's section 3 does not authorise, and taking
  it unilaterally at write-back time is exactly the widening the gate exists to
  refuse. `instruments.ts` is written so that the move is the only change needed:
  its `Instruments` type is the seam, `NO_INSTRUMENTS` is the null implementation,
  and a composition root that has the functions needs no other edit. Routed to L2
  in section 8 as a question, with HANDOFF-11 (which wires `apps/web` to the
  snapshot) as the obvious owner, since a page rendering four null panels is where
  this stops being invisible.

NOTICED (outside scope, not acted on):
  - `apps/web` has no `migrationHist` consumer yet, so the `denominationRuns` split
    below reaches no page. HANDOFF-11's wiring is where it becomes visible.
  - `POOLS_VIEW_GAPS`'s `owner` field decays silently and nothing checks it. This
    session corrected all four values and pinned them in a test, but a handoff that
    ships without closing its block will leave another true-looking prediction on a
    live API. The instrument would have to read `handoffs/HANDOFF-NN-*.md`'s
    `status:` from a static guard. Named in section 8 as the design question.
  - `check-redis-safety` reads METHOD NAMES. Four ioredis spellings are covered now;
    a new alias, or a different client library, is invisible until someone adds it.
    Recorded in SNAPSHOT.md section 7 as a stated bound rather than a hidden one.
  - `legacy/dashboard` still has no test runner, so `check-audit-consumers.mjs`
    remains the only thing asserting its rendered captions. LEDGER-08 Q7(d).

UNVERIFIED (labelled):
  - `docker build -f apps/publisher/Dockerfile .` HAS NEVER RUN. There is no Docker
    daemon in this container (`/var/run/docker.sock` absent, executed). What HAS
    been executed outside a container is both of that file's RUN lines:
    `pnpm install --frozen-lockfile --filter @zcashreveal/publisher...` (exit 0,
    "Lockfile is up to date", 4 of 9 projects) and
    `pnpm --filter @zcashreveal/publisher... build` (exit 0, four `tsc -b`,
    `dist/index.js` present). The base-image pull, the layer copies and the `node`
    user are NOT covered. The Dockerfile now says exactly this instead of the
    "THIS IMAGE DOES NOT BUILD YET" header it shipped with.
  - No preview host, no VPS, no live gateway was reached. The container is the only
    environment this session had (CLAUDE.md's Lighthouse rule, same wall).
  - Whether Upstash bills `MULTI`/`EXEC`. See A10.

GATE ROUNDS: 1 · VERIFICATION BUDGET STATED FIRST (LEDGER-05 Q5): every finding
  the round returned was carried through verification; none was logged unread.
  Round 1 returned 47 raw findings across four reviewers; three refuters per
  finding killed 12 as unreproducible; 35 were CONFIRMED and every one of them was
  dispositioned. Fingerprints, file · rule · severity:
    docker-compose.yml · gateway mounts no snapshot volume · HIGH (fixed, 5517b86,
      and guarded: `check-compose.mjs` gained `scanSnapshotFilePairing` with named
      writer/reader roles and six self-test fixtures. THE FIRST VERSION OF THAT
      DETECTOR COULD NOT CATCH THE DEFECT IT WAS WRITTEN FOR - it examined only
      services that SET `SNAPSHOT_FILE`, and the defect was a reader setting
      nothing. Caught by the fail-side probe staying green.)
    apps/indexer/src/analysis/migration-lens.ts · `maxWallets` is falsifiable by two
      wallets · MEDIUM, user-visible (fixed, 44f4673; see SPEC-WAS-AMBIGUOUS)
    apps/publisher/src/logger.ts · redaction leaks a `/` or `@` in a password ·
      MEDIUM (fixed, 013e842; and the fix was quadratic, a11b296)
    apps/publisher/src/__tests__/publisher.test.ts · A11's fail side never reaches
      the guard · MEDIUM (fixed, 013e842)
    scripts/check-redis-safety.mjs · `.scanStream(` unmatched · MEDIUM (fixed)
    apps/gateway/src/views/pools.ts · `owner` names shipped handoffs · MEDIUM,
      user-visible on a live 503 (fixed)
    docs/2.0/API.md · documents a 501 stub and the old owners · MEDIUM (fixed)
    CLAUDE.md, README.md, .github/workflows/ci.yml · "seven static guards" · MEDIUM
      (fixed, and R4-GUARDS retargeted so the next widening fails at the missed site)
    docs/2.0/RUNBOOK-VPS.md, docs/2.0/ZECREVEAL-2.0-PLAN.md · stale Zebra pin · LOW
      (fixed; the two dated records left alone, with the reason stated)
    apps/publisher/Dockerfile · "THIS IMAGE DOES NOT BUILD YET" · LOW (fixed)
    apps/publisher/src/budget.ts · three-vs-five on the wire · LOW (recorded, not
      resolved - see A10)
    ... plus 24 findings fixed inside the same commits, none of which changed
    behaviour a user could see.

  STOPPING (LEDGER-07 Q6, all three parts, and the lead states the extrapolation
  rather than claiming convergence):
    (i) The round's last pass returned no finding a user could see and no finding
        whose fix changes behaviour.
    (ii) THE FIX COMMITS WERE REVIEWED AS THEIR OWN COMMITS, and that review found
        a real defect: the redaction fix reached the last `@` with a lazy class and
        a lookahead, which is QUADRATIC - 39ms at 10k characters, 978ms at 50k,
        16.4 SECONDS at 200k, on a function that runs on error messages. The greedy
        form gives identical output on every case and runs 500k in 1.2ms. Fixed in
        a11b296 with a regression test whose budget is a hundred times the measured
        figure, so it fails on a complexity class and not on a slow machine. This is
        the third session running in which the fix commit carried the round's most
        interesting defect.
    (iii) EXTRAPOLATION: a second round would probably find one or two more, of the
        reach of the Dockerfile header and the stale pin - documentation that
        describes a state the branch has already left. It would be unlikely to find
        another falsifiable published claim, because the three instruments' bounds
        have now each been read against both specs. What it might find is another
        guard whose method-name list is incomplete, since that shape has now
        appeared twice in one round (`scanStream`, and the compose detector that
        could not see a reader).

PREVIEW URL: none reachable. A session cannot reach a preview host - Deployment
  Protection returns 302 to SSO and the egress proxy refuses the CONNECT tunnel
  with 403 before that (LEDGER-04 Q3). The container gate is what is reported
  above.

FINAL VERIFICATION, all executed on a11b296:
  pnpm -r test    1137 passed, 1 skipped (indexer 460/61 skipped, web 368,
                  gateway 136/7 skipped, content 67, zebra-rpc 50, publisher 56/1,
                  zec-types 0 files - types are checked by tsc)
  pnpm typecheck  11/11 successful
  pnpm lint       eslint, 0 findings
  pnpm --filter @zcashreveal/content validate   OK, 190 cited / 138 uncited refs
  pnpm check      eleven guards, all OK, each self-tested in both directions
  pnpm build      8/8 successful, including `next build`
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
