---
handoff: 09a
title: The estimator package move - three instruments into a dependency-free workspace package
status: in-progress
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

*Filled at write-back.*

## §8 LEDGER — appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

*Filled at write-back.*
