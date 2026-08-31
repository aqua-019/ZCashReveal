---
handoff: 09a
title: The estimator package move - three instruments into a dependency-free workspace package
status: closed
branch: the session-designated branch (name it `feat/v2-09a-estimator-package` if you may choose)
track: Data
depends_on: 09
written_by: L3, from the §1 SCOPE in the L2 RESOLUTION for HANDOFF-09 · 31 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-09a — The estimator package move

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript and a mutation. The gate is bounded per finding, not per round; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

> **Provenance of this file, which is unusual and worth stating once.** Every other handoff in this
> directory was written by L2 and executed by an L3 session. This one was written by the L3 session
> that executes it, from the `§1 SCOPE for HANDOFF-09a` block inside the L2 RESOLUTION for
> HANDOFF-09 (archived verbatim at `handoffs/prompts/PROMPT-09a.md`). §1 below is L2's scope
> paragraph, quoted rather than paraphrased, so the record shows what was specified separately from
> what was inferred. §2 to §6 are this session's, written before any code moved, and they are
> INFERRED in the ledger's sense: they are how this session read a four-sentence scope, not
> something L2 said.

## §1 SCOPE

Quoted verbatim from the L2 RESOLUTION for HANDOFF-09, answer Q4:

> Move `turnstile-accounting`, `migration-lens` and `ironwood-birth` out of
> `apps/indexer/src/analysis/` into a new dependency-free workspace package
> (`packages/zec-instruments` unless you have a better name), imported by BOTH `apps/indexer`
> and `apps/publisher`. No `zeromq`, no socket layer, no indexer entry point in its
> dependency graph — that constraint is the whole reason the package exists and it wants a
> guard, not a comment. Compose the real functions into the publisher at its composition root
> so `NO_INSTRUMENTS` stops being what ships.
>
> OUT OF SCOPE: any change to what the estimators compute. This is a move. A diff that also
> improves one is a diff whose gate cannot tell a move defect from an estimator defect.
>
> §5 wants at minimum: the four panels are non-null on a published snapshot with a two-polarity
> transcript; `pnpm -r test` unchanged in COUNT as well as colour, because a move that loses a
> test looks identical to a move that passes; and a guard that the new package's dependency
> graph contains neither `zeromq` nor `@zcashreveal/indexer`, self-tested in both directions
> like the other eleven.

**Why this is a handoff rather than a sub-task of HANDOFF-11** (L2's reasoning, recorded because a
future reader will otherwise re-derive it): `SnapshotV1`'s `null` is the honest TYPE and it does not
make a null PANEL honest on a production page — the LEDGER-05 Q2 precedent, where `/api/pools`
answers 503 naming the four blocks it cannot serve rather than serving four empty ones. So
HANDOFF-11 cannot ship the cutover with the four analysis panels null, which makes this move a
PREREQUISITE rather than a sub-task, and a prerequisite folded into the handoff it blocks is a
prerequisite that gets cut when the gate runs long. It costs nothing on the critical path because
HANDOFF-11's cutover is already blocked on operator hardware.

**Out of scope:** every change to what the estimators compute; any web wiring (HANDOFF-11); any
production promotion.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `handoffs/LEDGER.md`, and the HANDOFF-09 block in particular — Q4 is this handoff's origin, and
  its INFERRED list already records why the publisher mirrors the estimators structurally
- `docs/2.0/SNAPSHOT.md` — this handoff touches the publisher, so it is mandatory reading under
  CLAUDE.md's first paragraph even though it changes no Redis behaviour
- `apps/publisher/src/instruments.ts` — the seam. Its header is a 60-line argument for why the
  publisher does not depend on `@zcashreveal/indexer`, and every one of its four reasons survives
  this move; what changes is that a package now exists which satisfies all four
- `apps/publisher/src/snapshot-builder.ts` and `src/index.ts` — the consumer and the composition root
- `apps/indexer/src/analysis/{turnstile-accounting,migration-lens,ironwood-birth}.ts` and their
  transitive imports. There are three: `claim-classifier.ts`, `entropy.ts` and
  `decoder/activation-heights.ts`
- `apps/publisher/Dockerfile` and `apps/indexer/Dockerfile`
- The eleven guards in `scripts/`, and `check-ledger-structure.mjs` in particular as the model for
  a guard whose self-test drives the REAL rule function rather than a copy of it

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights and
  counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- **This is a move.** A file that moves keeps its bytes. Where a moved file's content must change at
  all, the change is confined to an import specifier or to a docblock sentence that would otherwise
  state something false about its new location, and §7 lists every such change one by one. A moved
  estimator whose arithmetic differs by one character is out of scope, and the gate is entitled to
  treat any such difference as a finding without weighing whether it is an improvement.
- **The dependency constraint is the reason the package exists, so it is a guard and not a comment.**
  The new package's resolved dependency graph must contain neither `zeromq` nor
  `@zcashreveal/indexer`, and neither may reach it transitively. The guard runs in `pnpm check` and
  in CI, and self-tests in both directions on every run like the other eleven.
- The publisher's image constraints are unchanged and still binding: its build stage copies
  `packages` and `apps/publisher` and nothing else, its runtime stage copies named workspace dists,
  and its install stages carry no compiler. A new package under `packages/` is inside what that
  Dockerfile already copies — but the runtime stage names its dists one by one, so the Dockerfile
  is part of this diff and a build that resolves at `tsc` and fails in the image is the failure
  this handoff is most exposed to.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) /
  UNVERIFIED (labelled).
- The PR stops at **opened**. No merge, no deploy, no Vercel env changes, no branch deletion.

## §4 DELIVERABLES

1. `packages/zec-instruments` — a new workspace package, `@zcashreveal/instruments`, holding the
   three estimators and the pure leaves they need, with its own `package.json`, `tsconfig.json`,
   `vitest.config.ts` and barrel.
2. The three estimators' tests moved with them, so the suite's total count is preserved rather than
   restored.
3. `apps/indexer` imports the package instead of holding the modules; every existing import site
   inside the indexer resolves to the same symbols it resolved to before.
4. `apps/publisher` depends on the package, and its composition root passes the real five functions
   instead of `NO_INSTRUMENTS`.
5. `scripts/check-instrument-deps.mjs` — the twelfth guard, wired into `pnpm check` and `ci.yml`.
6. Both Dockerfiles updated for the new workspace member.
7. `docs/2.0/SNAPSHOT.md` §8.1 corrected where it describes the four panels as structurally
   unmeasurable, since after this handoff they are measured.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** **The four panels are non-null on a published snapshot.** Build a snapshot through the
  publisher's real `buildSnapshot` with the real instruments composed in, and assert that
  `residual`, `drain`, `migrationHist` and `neffSeries` are each non-null and each parse under
  `snapshotV1Schema` *(fail side: pass `NO_INSTRUMENTS` and watch all four assert as null)*.
- **A2.** **`pnpm -r test` is unchanged in COUNT as well as colour.** The total is 1206 tests
  (1204 passed, 2 skipped) at `1f6e6dc` with a real Postgres 16 and a real local Redis, which is
  the count L2 measured on a clean worktree of `94ea20b`. After the move the total is the same
  number or larger, and §7 states the per-package split both before and after so a test that moved
  between packages is visible as a move rather than as a wash *(fail side: delete one moved test
  file and watch the total drop)*.
- **A3.** **The new package's dependency graph contains neither `zeromq` nor
  `@zcashreveal/indexer`.** A guard, not a reading: it resolves the package's declared dependencies
  transitively through the workspace and fails naming the path it found *(fail side: add
  `@zcashreveal/indexer` to the package's dependencies and watch the guard name the edge; and
  again with a transitive edge, since a direct-only check would pass the case that matters)*.
- **A4.** **No moved estimator's behaviour changed.** For each of the three modules, the moved file
  is byte-identical to its pre-move content except for import specifiers and docblock text, shown
  as a `diff` in §7 *(fail side: perturb one arithmetic constant and watch the moved tests fail)*.
- **A5.** **The publisher's image can still be built from what its Dockerfile copies.** The
  publisher's `tsc -b` resolves the package from the workspace dists its runtime stage names, and
  the Dockerfile names the new dist *(fail side: remove the new package's `COPY` line and watch the
  resolution fail)*. Executed outside a container, because there is no Docker daemon here; the
  container build itself stays UNVERIFIED and is the operator's, exactly as HANDOFF-09 left it.
- **A6.** **`NO_INSTRUMENTS` is no longer what the composition root ships.** A guard-grade
  assertion on the real entry point, not a reading of it: the composition root's `buildSnapshot`
  call receives a bundle whose five members are all functions *(fail side: revert the root to
  `NO_INSTRUMENTS` and watch it assert)*. `NO_INSTRUMENTS` itself stays exported — it is the null
  implementation the tests use for A1's fail side, and deleting it would remove the only honest way
  to express "not measured".
- **A7.** **Every symbol the indexer previously imported from the three modules still resolves.**
  The indexer's `analysis/index.ts` barrel exports the same names after the move as before, compared
  as sorted lists rather than by eye *(fail side: drop one re-export and watch the comparison name it)*.
- **A8.** **The eleven existing guards, `typecheck`, `lint`, `content validate` and `pnpm build`
  are all green**, and `pnpm build` in particular, because it is the only one that resolves an
  `apps/web` import the way webpack does and the only one that runs `next build`.

## §6 DISPATCH HINTS

- The move itself is mechanical and wants one worker with the whole picture rather than a fan-out;
  the risk is in the transitive leaves, not in the three named files.
- `test-engineer` for §5; `devops-deployer` for the two Dockerfiles and `ci.yml`.
- The gate's highest-value target is not the three estimators — it is the set of files that
  imported them and the two Dockerfiles, because a move's defects land in its consumers.
- Loop 1 PREFLIGHT before any Haiku touches the publisher or a Dockerfile.

## §7 REPORT — written by L3 before the PR opens

**SPAWN MODE: subagents.** Proven by a tool attempt before any work: an `Explore` agent dispatched and returned `SPAWN OK`. Five workers across the branch, all named below. The `Workflow` tool exists in this session and was not opted into, so the gate ran as direct subagent fan-out.

**Branch** `claude/new-session-ovtyx4` (harness-named; the handoff's suggested `feat/v2-09a-estimator-package` was not available to choose). Seven commits, 82 files, +2628 / -393.

### The environment, stated first because every number below depends on it

Executed: `redis-server` started on 6379 and PostgreSQL 16 started, a `zcashreveal` role and database created, and all five migrations applied, BEFORE any measurement. That reproduces L2's verification environment exactly, and the baseline proves it: `pnpm -r test` at `1f6e6dc` gave **1204 passed / 2 skipped / 1206 total, rc=0** — L2's own figures for a clean worktree of `94ea20b`, package for package. Without those two services the same command gives 1137 passed / 69 skipped, and A7's integration half self-skips; the skip was checked by name rather than assumed (`A7 SKIPPED, WITH ITS REASON` correctly skipped, the two real assertions passed).

### §5 assertions — every one executed, in both polarities

| | assertion | pass state | fail state (executed) |
|---|---|---|---|
| **A1** | the panels are non-null on a published snapshot | all four non-null with `REAL_INSTRUMENTS` and inputs; document validates under `snapshotV1Schema` | `NO_INSTRUMENTS` on the same inputs → all four null |
| **A2** | `pnpm -r test` unchanged in COUNT | 1206 → **1220** (larger, never smaller); split below | deleting a moved test file drops the total |
| **A3** | the package's graph reaches neither `zeromq` nor `@zcashreveal/indexer` | guard green, 9 manifests | direct edge, transitive edge, alias (`npm:` and `workspace:`), peer, dev, `node:net`, bare `net`, `require()`, dynamic `import()`, a source-level `zeromq` import, a `.mts` file, and a semicolon-less bare import — **all rc=1, each re-probed against the real tree** |
| **A4** | no moved estimator's behaviour changed | 5 of 6 sources byte-identical, 1 differs by one import specifier; 4 of 6 tests byte-identical, 2 differ by one specifier | perturbing an arithmetic constant fails the moved tests |
| **A5** | the publisher's image can be built from what its Dockerfile copies | every workspace package `apps/publisher/dist` really imports is `COPY`d | removing the new `COPY` line → the check names `@zcashreveal/instruments` |
| **A6** | `NO_INSTRUMENTS` is no longer what ships | `REAL_INSTRUMENTS` is five functions; the root's call is anchored by regex | `NO_INSTRUMENTS` names five nulls; a doctored root fails the anchor |
| **A7** | every symbol the barrel exported still resolves | 11 value exports preserved, all callable | dropping one name → 2 tests fail; `export *` → names the 7 leaked `activation-heights` constants |
| **A8** | the guards, typecheck, lint, validate and build are green | **twelve** guards rc=0, typecheck 13/13, lint 0, content validate OK, `pnpm build` 9/9 | — |

**A2's split, before and after**, so a test that moved between packages is visible as a move rather than as a wash:

| package | before | after | delta |
|---|---|---|---|
| `packages/content` | 67 | 67 | — |
| `packages/zebra-rpc` | 50 | 50 | — |
| **`packages/zec-instruments`** | — | **98** | the moved suites |
| `apps/web` | 368 | 368 | — |
| `apps/gateway` | 143 | 143 | — |
| `apps/publisher` | 57 | 67 | +10 (A1, A6) |
| `apps/indexer` | 521 | 427 | −98 moved, +4 (A7) |
| **total** | **1206** | **1220** | |

### What the move actually achieved, which is not what §5 asked for

**THE PACKAGE MOVE UN-NULLS TWO OF THE FOUR PANELS, NOT FOUR.** This is the handoff's principal finding and it is a correction to its own §5. With the real estimators wired, `residual` and `migrationHist` become measurements on the production input path. `drain` and `neffSeries` stay `null`, and the reason is the INPUT layer rather than the packaging: `readSnapshotInputs` hard-codes `drainBaseline: null` because `pool_snapshots.ts` is a `TIMESTAMPTZ DEFAULT NOW()` — the indexer's WRITE time, not the block's, and plan §3.3's velocity is "from block timestamps" — and `ironwoodSpends: null` because the Ironwood spends live in the indexer's candidate analysis, which no table this process reads carries. Both reasons were documented in `chain-inputs.ts` and neither was connected to LEDGER-09 Q4. Executed against the real `readSnapshotInputs`, not a literal. **HANDOFF-11 may not ship a null analysis panel (LEDGER-09 Q4), so those two are its work, and they need a migration and an indexer read path rather than wiring.** Pinned by an executing assertion so a session meets it here rather than at the cutover.

> **Superseded 31 Aug 2026 by HANDOFF-09b, and left standing rather than rewritten** — this is a
> dated §7 report of what was measured at 09a, and rewriting a report to match a later state
> falsifies the record. Two things in the paragraph above are no longer operative. **The two panels
> are 09b's work, not HANDOFF-11's** (LEDGER-09a Q1): L2 ruled the sources into their own handoff on
> a cost argument — the VPS database is COLD, so migration 005 lands in the same first `migrate` run
> the operator already owes. **And "HANDOFF-11 may not ship a null analysis panel" was restated on
> the right quantity** as "may not RENDER AN UNMEASURED PANEL AS A MEASUREMENT", which is
> count-independent and permits a named absence stating the CONDITION that produced it. (L2 wrote
> "carrying its owner"; `docs/2.0/SNAPSHOT.md` §8.1 superseded that half in 09b's gate round 4,
> because an owner is a live statement on the wire and a prediction that outlives its subject reads
> as a fact. Corrected here in 09b's round 7 - this blockquote states what is operative now, so it
> is an assertion rather than a record.) The assertion this paragraph
> armed — `instruments-wired.test.ts` asserting `drain` and `neffSeries` are null — has been met and
> inverted by 09b, with values rather than a presence check.

### The gate: three rounds, five workers, and the fix commit reviewed as its own commit each time

**Round 1** (4 workers: move consumers, publisher seam, guard and infra, folds commit). Verification budget: each worker stated its own in its first line; 22, 27, 34 and 24 candidates examined, 14, 14, 30 and 11 verified by execution. No finding was logged unread.

**Round 1's HIGH, found by the lead outside the fan-out:** CI enumerates a test step per package and had no step for the new one, so 98 tests would have left CI while every enumerated step stayed green — and A2, which measures `pnpm -r test`, would still have been right. Second instance of a shape `ci.yml` itself records for `zebra-rpc`, whose 35 tests were unenumerated from HANDOFF-05 to HANDOFF-08 and were found by reading a green log.

**Round 2** was the deepest, and three HIGHs came out of it, two of them defects THIS HANDOFF CREATED — before the move, `NO_INSTRUMENTS` meant these estimators were never called, so none of them could fire:

- the publisher suite was resolving `@zcashreveal/instruments` to `dist`, so every A1 result in the preceding commit was evidence about a build artefact;
- one row `migrations_zip318` permits (`CHECK (amount_zat >= 0)`, and `migrationLens` refuses `<= 0n`) stopped the publisher publishing ANY document for the ~1,152 tips of its window — `pools`, `residual` and `lastReports` died with the panel;
- a node reporting `chainSupply` without `valuePools` published **"100 per cent of supply is verified" as a measurement**, because `readChainValues` pre-seeded every lane with `0n` and so defeated `turnstileResidual`'s deliberate "an absent balance is not a zero balance" refusal. `valuePools` is `.optional()` in the schema.

**The guard this handoff exists to deliver was the worst-reviewed artefact in the branch: eleven holes, and its self-test certified every one.** The most diagnostic is that it never exercised `zeromq` at all — its single "transitive path to zeromq" case went through `@zcashreveal/indexer`, itself banned, so the walk stopped at hop one; deleting `zeromq` from the banned list left the self-test green and the guard green. That is HANDOFF-08 round 4's shape, committed inside the guard written to answer it. The other ten: pnpm aliases evaded the walk; `peerDependencies` unread under `autoInstallPeers`; the `devDependencies` exclusion rested on a false premise (every Dockerfile installs without `--prod`); `net` unprefixed, `require()`, dynamic `import()` and a source-level banned-package import all missed; a directory rename produced a silent vacuous pass; `readWorkspace` and `sourceFiles` sat outside the self-test that claimed to drive the real functions; three of five banned builtins untested; `legacy/*` outside the workspace scan, with the hole printed on every clean run as "8 manifests" where pnpm resolves 9; and the negative probe did not discriminate, so a comment CONTAINING an import failed the guard while the header claimed it did not.

**Round 3** reviewed round 2's fix commit as its own commit, and both its HIGHs were round 2's fixes landing at one site of two or recommitting the shape they closed: the vitest alias was fixed in `apps/publisher` and not `apps/indexer`, and the rewritten guard's four spellings shared one `lastIndex`, so a semicolon-less `import "node:net"` was swallowed by the next statement's `from`. This repository has no prettier config and no `semi` rule, so nothing in the six-command gate would have seen that spelling; the self-test's four probes all ended in `;`, so it certified the hole.

**Two probes were malformed and are reported rather than silently redone**, per the rule that a probe reporting the code is wrong is checked before the code is judged. The Dockerfile-coverage probe matched `@zcashreveal/indexer` in preserved docblock PROSE in `apps/publisher/dist` and reported a dependency that does not exist. And round 3's own reviewer established H1 with a mutation (`unprovableZat`) that `audit-records.test.ts` never reads — its conclusion was right and its evidence did not support it; making the source barrel throw is what turned a right answer into a demonstrated one.

**Post-fan-out sweep run before every commit** (`git status --porcelain`, with `--untracked-files=all` after rounds 2 and 3). It returned only paths the lead had edited on every occasion; no worker wrote to the tree. One worker's probe residue was found in `packages/zec-instruments/dist` by another worker — `dist` is gitignored, and it was gone before the next commit.

### Fold 5's third clause was already satisfied, reported rather than acted on twice

It asks HANDOFF-11 §5 to gain the `subversion` floor assertion "from LEDGER-10 Q1, still unbuilt". The assertion is already there as `A11`, and `packages/zebra-rpc/src/version-floor.ts` already exports `ZEBRA_MIN_VERSION`, `parseZebraVersion`, `compareZebraVersion` and `checkZebraVersionFloor` with pass, below-floor and unparsed tests. A second `A11` would have been the first DELIBERATELY duplicated assertion ID in a section that already documents two accidental ones. What is genuinely unbuilt is the smoke test that calls the checker against a live node, which is what `A11` specifies and what HANDOFF-11 will do. **Fold 2's "`docs/2.0/SNAPSHOT.md` §4 gets the same numbers" is the other malformed instruction: §4 is the rules list and carries no numbers. Applied to §5 and §8.7, which is the right reading, and recorded here rather than quietly redone.**

### One correction to a commit message on this branch

`e023861`'s message says "Five of the six moved test files are byte-identical; two differ by an import specifier" — five and two over six. Measured: **four** identical (`migration-lens`, `claim-classifier`, `entropy`, `activation-heights`) and **two** differing (`turnstile-accounting`, `ironwood-birth`). The source-file claim in the same paragraph — five identical, one differing — is correct. The message is pushed and is not rewritten; the correction lives here, which is the record a later reader reads.

### Provenance

Everything above is **Executed** unless labelled. **UNVERIFIED, and carried forward:** `docker build` has still never run anywhere — there is no daemon in this container, so the three Dockerfiles' manifest and dist lines are verified by reading plus a resolution check over `apps/publisher/dist`'s real import specifiers, and the operator's first `docker compose build` is their first execution. The Vercel preview and the VPS remain unreachable from a session (LEDGER-04 Q3).

### The gate's stopping condition, stated in three parts rather than claimed as convergence

**(i)(a) The last round returned no finding a user could see.** The reach decayed steeply and measurably: round 2 found "the publisher stops publishing for a day" and "the site claims 100 per cent of supply is verified"; round 3 found a regex sharing a `lastIndex`, a docblock claiming five where four hold, and a log string that says "not reported" when the node reported a non-answer. None of round 3's findings is visible to a reader of the site.

**(i)(b) Two recurring shapes are covered by a guard shown to fail on them, and one is NOT.** Covered: *a correction landing at one site of several* — three instances this branch (the wallet bound's eighth site, the guard count's three sites, the vitest alias's two), now `H09-WALLET-BOUND` and `H09a-VITEST-ALIAS` in `check-finding-sites.mjs`, both RUN and shown to fail on the shape. Also covered: *a suite resolving a workspace package to `dist`* — two instances, same register row.

**NOT covered, and this is the honest gap:** *an assertion whose predicate is satisfied by every value it was written to exclude.* It reached instance three before this handoff (LEDGER-09 Q3) and this branch added three more — HANDOFF-13's `A2` pathspec, which could not see a guard built in `scripts/`; `expect(hist.maxWallets).toBe(1)`, where a one-crossing fixture makes four different quantities all equal 1; and a fault-sink assertion satisfied by a comment containing the log message. **Two of those three were written by the session that recorded the fold against them.** Clause (b) therefore says the next instrument is a guard — and fold 4 rules that HANDOFF-13 SPECIFIES that guard rather than building it, because distinguishing a loose predicate from a deliberately permissive one is judgement. Those two rules point in opposite directions and the operator should settle it; see §8, Q2. Nothing was built here on the lead's own authority.

**(ii) The fix commit was reviewed as its own commit every round**, and it is where both of round 3's HIGHs came from — the fourth session running that this rule has paid for itself.

**(iii) The extrapolation, rather than a claim of convergence.** A fourth round probably finds one or two more of round 3's reach: another docblock whose claim outran what it was measured against, or another spelling the guard's regexes do not cover. It is unlikely to find another live publisher defect, because the three input-layer preconditions (`amountZat <= 0n`, an absent pool balance, a non-positive supply) have each now been exercised and the fourth — `drained` outside [0, 1] — is the one that never threw and is now refused. What it would most likely find is a defect in the guards themselves, which is what round 3 mostly found and is a different condition from finding live defects in the estimator.

## §8 LEDGER — appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

*Filled at write-back.*
