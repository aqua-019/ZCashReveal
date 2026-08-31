# PROMPT-09b — the messages that steered the HANDOFF-09b session

Archived under the revolution protocol, step 5: every message that steered this session,
verbatim, under a heading naming what it is and when it arrived. One file per handoff, not one
per message.

---

## 1. Session kickoff — HANDOFF-09b, with the L2 RESOLUTION for HANDOFF-09a / PR #45 (31 Aug 2026, uploaded as PROMPT09b.md)

The kickoff line, followed by an `L2 RESOLUTION` block carrying L2's verification of PR #45 against
a real PostgreSQL 16 and a real local Redis, two findings, the rulings for LEDGER-09a's three
questions, six folds, and the §1 SCOPE for HANDOFF-09b. This is the second kickoff running that
asks the session to WRITE its own handoff before executing it, for the same reason as the first:
LEDGER-09a Q1 asked whether the block-time migration becomes its own handoff or is carried by
HANDOFF-11, and L2 ruled "HANDOFF-09b", on a cost argument about a COLD database rather than on
panel honesty. Reproduced verbatim, including the fenced block.

````markdown
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff is NEW and is written below as HANDOFF-09b — the two missing input sources that HANDOFF-09a's principal finding exposed. Write it into `handoffs/HANDOFF-09b-snapshot-inputs.md` from §1 SCOPE here, set the index and LOG accordingly, then execute it. Report spawn mode first. Stop at PR opened. HANDOFF-11 does NOT start until this lands — see Q1.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-09a, PR #45 (Cowork, 31 Aug 2026)

VERDICT: MERGE. This is the cleanest branch of the nine I have gated.

VERIFY (Executed by L2 on a clean worktree of **14b5e98**, main at `1f6e6dc`, 8 commits,
83 files, +2898 / -393, with a REAL PostgreSQL 16 AND a REAL local Redis — not relayed):

  All five migrations applied. `pnpm -r test`:
    content 67 · zebra-rpc 50 · **zec-instruments 98** · web 368 · gateway 143 ·
    publisher 66 +1 skipped · indexer 426 +1 skipped
    **1218 passed, 2 skipped, 1220 total**, rc=0
  Your §7 split table is correct ROW FOR ROW against my measurement, including the two you had
  to predict — publisher 57 -> 67 and indexer 521 -> 427. A2 holds: 1206 -> 1220, larger, and the
  move is visible AS a move rather than as a wash. That is the first §7 numeric table in this
  project that has reproduced exactly on my machine without a single correction.

  BOTH SKIPS NAMED, because a count is not evidence until the skips are:
    publisher  "A7 SKIPPED, WITH ITS REASON: no local Redis" — the `runIf` marker, correctly
               skipped BECAUSE Redis was up; A7's two real assertions both PASSED.
    indexer    "decodeBlock — real mainnet fixture decodes a captured post-NU5 mainnet block" —
               the operator's capture, now six handoffs old. Honest.
  Twelve guards rc=0. typecheck 0. lint 0. `pnpm build` 0. `content validate` 0.

  THE GUARD, PROBED AS A GUARD rather than read, four ways, each restored after:
    delete `zeromq` from BANNED_DEPENDENCIES  -> SELF-TEST FAIL: "R1 did not fire on a path to
                                                 zeromq that avoids @zcashreveal/indexer", rc=2.
                                                 Hole 1 is closed and closed with the right message.
    semicolon-less `import "node:net"` in a real source file, followed by a real import
                                              -> R2 fires. Hole 12 is closed.
    `const x = await import("zeromq")`        -> R2 fires.
    instruments -> zebra-rpc -> indexer       -> R1 fires and NAMES THE PATH, which is the half
                                                 that makes a finding actionable.
  Eleven holes found by execution and none by reading is the correct ratio and you should keep it.

  Q1'S FACTUAL PREMISE, VERIFIED INDEPENDENTLY, because it is the load-bearing claim in the
  branch and it changes what the next two handoffs are:
    `pool_snapshots.ts` is `TIMESTAMPTZ NOT NULL DEFAULT NOW()` — confirmed, migration 003 line 156.
    There is **no `blocks` table in any of the five migrations.** I enumerated every CREATE TABLE:
      leak_reports, anchors, nullifiers, commitments, pool_commitments, pool_anchors,
      pool_nullifiers, pool_boundary_flows, pool_snapshots, migrations_zip318, tx_cache,
      address_cache. There is no height -> block-time mapping ANYWHERE in Postgres, so this is
      not a join the publisher failed to write. Your diagnosis understates itself.
    The publisher reads exactly one table: `migrations_zip318`. It has never read `pool_snapshots`.
    `pool_nullifiers` CHECKs `pool IN ('sapling','orchard')` — Ironwood is excluded by a CHECK
      constraint from the one table that could carry a spend — and no table anywhere carries
      `candidateCount`, the anchor bound `IronwoodSpend` needs.
  So both null panels are missing a SOURCE, not a query. Q1 is right and it is right for a
  stronger reason than it gives.

FINDINGS: one MEDIUM, one note. Neither reopens the gate under the stopping rule — no finding a
user could see, and no finding whose fix changes behaviour today.

  F-45-1 (MEDIUM) — R1'S PROBE SET IS NOT GENERATED FROM THE RULE'S DATA, WHILE R2'S IS, AND THIS
  IS HOLE 8'S OWN SHAPE SURVIVING INSIDE THE GUARD THAT CLOSED IT. Your comment at the R2 loop
  says it exactly: "generated from the array so a future entry cannot arrive untested (hole 8)."
  R1 has no such loop. Its zeromq coverage is one hand-written `toAddon` map naming `zeromq` as a
  literal. Executed:
      BANNED_DEPENDENCIES = ["zeromq", "@zcashreveal/indexer", "better-sqlite3"]
      -> self-test GREEN, rc=0. R2 gained 8 probes automatically. R1 gained ZERO.
      -> and the clean-run summary then prints "reaches none of zeromq, @zcashreveal/indexer,
         better-sqlite3 through 9 workspace manifest(s)" — asserting the rule for a name whose
         manifest-side detector was never once shown to fire.
  The list has two members today and both are covered, so there is no live defect. The defect is
  that the third member arrives untested and the summary line vouches for it anyway. Fold 1.

  F-45-2 (note, not a finding) — CI COVERAGE IS CORRECT TODAY AND UNGUARDED. I enumerated all nine
  workspace manifests: seven declare a `test` script and all seven are named in `ci.yml`;
  `zec-types` and `dashboard` declare none. Your round-1 HIGH was instance TWO of this shape
  (`zebra-rpc` was instance one, three handoffs unenumerated). Clause (b) of the stopping rule
  triggers at three. I am not asking for the guard now. I am recording the count so instance three
  is RECOGNISED rather than re-derived, and so the next session does not have to re-establish that
  a green CI is not evidence a package ran.

ANSWERS to the ledger questions:

  Q1 THE BLOCK-TIME MIGRATION BECOMES **HANDOFF-09b**, AND MY LEDGER-09 Q4 DIAGNOSIS WAS HALF
     RIGHT — I OWN THAT BEFORE I RULE ON IT. I wrote that the null panels were "a PACKAGING
     problem". They were a packaging problem AND two missing input sources, and 09a removed only
     the first. You found that by executing against the real `readSnapshotInputs` instead of
     accepting the handoff's own framing, which is the behaviour this stack exists to produce, and
     the correction is worth more than the move.

     THE ORDERING RULING RESTS ON A COST ARGUMENT THAT HAS NOTHING TO DO WITH PANEL HONESTY, and
     I put it first deliberately so it is not mistaken for a rule I am flexing:

     (i) MIGRATIONS 003 AND 004 HAVE NEVER BEEN APPLIED TO THE VPS DATABASE. That database is
         COLD. A 005 landing before the cutover is applied in the same first `migrate` run the
         operator has already owed for three handoffs — three migrations, one cold run, zero
         downtime. A 005 landing after the cutover is a maintenance window on a live public site
         holding real state. Applying a migration to a cold database is free and applying it to a
         live one never is. This alone settles the order.
     (ii) HANDOFF-11 IS ALREADY BLOCKED ON OPERATOR HARDWARE — VPS unprovisioned, runbook not
         executed, tunnel not built, mainnet fixture uncaptured. Inserting 09b costs zero wall
         clock. That is the identical argument I used to take the package move out of 11, and it
         is stronger now because the queue in front of 11 has not moved since.
     (iii) IT IS A DATA PIPELINE, NOT A CUTOVER STEP. A cutover gate that also carries a migration
         and two indexer write paths cannot tell a wiring defect from a pipeline defect, and the
         cutover is the one gate where that distinction is worth the most. Same argument, third
         time, and it has been right twice.

     AND A CORRECTION TO MY OWN RULE, because the premise under it changed and a rule left
     standing on a dead premise is one the next session obeys for the wrong reason.
     HANDOFF-11's contract says "THE CUTOVER MAY NOT SHIP A NULL ANALYSIS PANEL." That rule is
     stated on the wrong quantity. LEDGER-05 Q2's remedy was never "fill the blocks" — it was
     **503 naming each missing block and the handoff that owns it**. The dishonesty in an empty
     block is not that it is empty. It is that an empty chart RENDERS AS A MEASUREMENT OF ZERO,
     and a flat drain line is read by every visitor as "the pool is not draining". So:

       THE CUTOVER MAY NOT RENDER AN UNMEASURED PANEL AS A MEASUREMENT.
       A named absence carrying its owner ("drain: not measured — needs a block-time source,
       HANDOFF-09b") is the LEDGER-05 Q2 precedent applied exactly, and it is permitted.

     As I wrote it the rule turned on the COUNT — four of four — which is why 09a un-nulling two
     felt like it changed the answer. It should not have. The corrected rule turns on the
     RENDERING and is count-independent. Note what this costs me: **the corrected rule no longer
     blocks the cutover.** If the operator wants 11 before 09b, the honesty rule now permits it
     provided both panels render as named absences with their owner. I am still ordering 09b
     first, on (i) alone. That is a cost ruling and the operator may overrule it; the honesty
     ruling is not one I will trade. Fold 2 amends HANDOFF-11's contract line and Fold 3 gives the
     two panels their absence copy so the option is real rather than rhetorical.

  Q2 CLAUSE (b) AND FOLD 4 DO NOT ACTUALLY CONFLICT — THE SHAPE IS TWO SHAPES UNDER ONE NAME, AND
     YOU WERE RIGHT NOT TO RESOLVE IT ON YOUR OWN AUTHORITY. Reading your six instances:

       MECHANICALLY DECIDABLE, no judgement required:
         (4) HANDOFF-13's A2 pathspec — does the assertion's search scope intersect the
             deliverable's path? A set intersection. You measured it yourself: 48 files under
             apps/packages, 1 under scripts, disjoint.
         (5) `maxWallets).toBe(1)` on a one-crossing fixture — does the fixture make distinct
             quantities equal? Vary the fixture until they differ; the assertion must still
             discriminate.
         (6) a fault-sink assertion satisfied by a comment — delete the executable body, leave the
             prose, does the assertion still pass? You proved it exactly this way.

       JUDGEMENT REQUIRED:
         (1) HANDOFF-06 Q4's `0n` fee test, (2) HANDOFF-08's A9, (3) `owner.startsWith` — a
             predicate that is a tautology over its domain. Distinguishing that from a
             deliberately permissive one is reading intent, which is fold 4's reason and it holds.

     So fold 4's premise is TRUE for the second group and FALSE for the first, and the conflict is
     an artefact of six instances sharing one name. Split it.

     NOW THE INSTRUMENT, and it is not the guard. Every one of those six shipped WITH a fail-side
     transcript — the two-polarity rule was OBEYED and did not catch them. That is the fact worth
     more than the taxonomy, so here is why it failed:

       THE FAIL SIDE WAS CHOSEN TO FAIL. A9's was a code change. Had it been drawn from the
       assertion's own stated exclusion set — "a match claiming more than the pool holds" — it
       would have PASSED, and the passing would have been the finding. I know this because I ran
       exactly that mutation on merged main and got 3 HIGH matches claiming 300 ZEC against a
       100 ZEC pool.

     RULE, effective now: **at least one fail side per assertion must be a DATA mutation — a value
     drawn from the set the predicate claims to exclude — and not a CODE mutation.** Deleting a
     callback, throwing from a barrel, perturbing a constant, removing a COPY line: all code
     mutations. They prove the assertion is WIRED. They do not prove it DISCRIMINATES. Those are
     different properties and this project has been proving the first while claiming the second.
     A code mutation is still welcome; it is no longer sufficient alone.

     AND A STRUCTURAL REQUIREMENT so the defect is visible in the artefact instead of re-derived:
     **§5 states each assertion's EXCLUSION SET** — the values the predicate is written to reject —
     and §7's fail-side transcript NAMES WHICH MEMBER it used. A reader then sees at a glance
     whether the fail side came from inside the set or from outside it. `check-ledger-structure.mjs`
     can check that the clause is PRESENT; it cannot check that it is correct, and I am saying so
     rather than letting a structural check be mistaken for a semantic one.

     CLAUSE (b) IS AMENDED, and the amendment is a restriction on me rather than a licence:
       A shape is covered when a GUARD is shown to fail on it. Where no guard is possible, a
       structural requirement plus a written rule may stand in — but it is explicitly WEAKER,
       it must be recorded AS weaker in the ledger, and it is chosen only after a guard has been
       attempted and shown to be impossible. A rule does not silently become a guard. Three of
       this project's twelve guards shipped certifying a hole; a rule has no self-test at all.

     FOLD 4 STANDS UNCHANGED for the judgement half. HANDOFF-13 SPECIFIES that guard, does not
     build it. Fold 4 was right and it was right for the reason it gave.

  Q3 IT IS ABOUT GUARDS, NOT ABOUT THIS SESSION — AND IT IS Q2'S DEFECT ON A DIFFERENT SURFACE.
     A guard's self-test IS a fail-side transcript for the guard. Its probes were hand-written
     from the author's model of what the guard catches, which is "chosen to fail" again. Your two
     candidates are not alternatives to each other and the third is not an alternative to either:

       ADOPT BOTH. **Every guard's self-test derives its probe set by ITERATING the rule's own
       data structure**, so a new member cannot arrive untested — this prevents a probe set that
       UNDER-COVERS the rule. **And every detector is driven at least once over the REAL tree,
       not only over a fixture** — this prevents a probe that passes against a synthetic fixture
       and would not against reality, which is your hole 9, the directory rename that produced a
       silent vacuous pass. Neither subsumes the other; they answer different failure modes.
       Your first candidate ("every banned value reached by a path containing no other banned
       value") is a special case of the first standard, correct for R1 specifically, and it falls
       out of iterating the list rather than needing to be stated.

     THE EVIDENCE IS INSIDE THE ARTEFACT THE QUESTION IS ABOUT, which is why this is a measurement
     and not an opinion: R2 already meets the first standard and R1 does not, and the half that
     does not have the hole is exactly the half that has the hole. That is F-45-1. The standard
     you are asking whether to adopt is already half-implemented in your own guard, and the
     unimplemented half is where the defect is. Adopt it, and retrofit R1 as fold 1.

     Three of twelve certifying a hole is a fact about guards. So is eleven found by execution and
     none by reading. Both go in CLAUDE.md.

FOLDS — apply these in a `docs(handoffs)` commit BEFORE you start HANDOFF-09b's work, and record
each application in the ledger:

  1. `scripts/check-instrument-deps.mjs` — R1's probe set is generated by iterating
     `BANNED_DEPENDENCIES`, one path-that-contains-no-other-banned-name per member, the way R2
     iterates `BANNED_MODULES`. Verify by the probe that found it: append a third member, the
     self-test must go RED. F-45-1.
  2. `handoffs/HANDOFF-11-live-wiring.md` §3 — replace "THE CUTOVER MAY NOT SHIP A NULL ANALYSIS
     PANEL" with "THE CUTOVER MAY NOT RENDER AN UNMEASURED PANEL AS A MEASUREMENT", carrying
     Q1's reasoning and the LEDGER-05 Q2 lineage, and stating that a named absence with its owner
     is permitted. Do not delete the old line's history — amend it in place with the correction
     visible, per the LEDGER-10 Q5 precedent.
  3. `docs/2.0/SNAPSHOT.md` §8.1 — a null panel's RENDERING contract: what the site displays for
     `drain` and `neffSeries` while they are unmeasured, naming HANDOFF-09b as the owner. This is
     what makes Q1's third option real rather than rhetorical.
  4. `CLAUDE.md` — three rules, stated as rules and not as anecdotes:
     (a) at least one fail side per assertion is a DATA mutation drawn from the predicate's
         exclusion set; a code mutation proves wiring, not discrimination;
     (b) every guard self-test iterates the rule's own data structure AND drives every detector
         over the real tree at least once;
     (c) clause (b) of the stopping rule as amended above, including that a rule standing in for
         a guard is recorded as weaker.
  5. `handoffs/HANDOFF-13-mode-a-wasm.md` §5 A2 — the pathspec is widened to include `scripts/`
     and `.github/`, or the assertion is restated so its scope is derived from the deliverable
     list rather than hardcoded. This is instance 4 from Q2 and it is the mechanical half, so fix
     it; do not wait for the guard fold 4 defers.
  6. Handoff §5 format — every assertion states its EXCLUSION SET, and §7 names which member the
     fail side used. Apply to HANDOFF-09b's own §5 first, then extend `check-ledger-structure.mjs`
     to check the clause is PRESENT. The guard checks presence, never correctness; say so in its
     header so nobody later reads a green run as semantic.

  §1 SCOPE for HANDOFF-09b, which you write and then execute:

    HANDOFF-09b — the two missing snapshot input sources
    depends_on: 06, 07, 09, 09a
    blocks: 11

    The publisher composes real instruments and still publishes two of four analysis panels as
    null, and HANDOFF-09a proved the reason is a missing SOURCE rather than a missing query.
    This handoff supplies both sources. It is a data pipeline, not a cutover step, and it is
    ordered before HANDOFF-11 because the VPS database is COLD: migrations 003 and 004 have never
    been applied there, so a 005 landing now costs one cold run and a 005 landing after the
    cutover costs a maintenance window on a live site.

    IN SCOPE:
      1. A BLOCK-TIME SOURCE. `pool_snapshots.ts` is the indexer's write clock and there is no
         `blocks` table anywhere in the five migrations, so no height -> time mapping exists in
         Postgres at all. Migration 005 supplies one. DECIDE AND JUSTIFY WHICH SHAPE in the
         ledger: a `block_time TIMESTAMPTZ` column on `pool_snapshots`, or a `blocks (height,
         time_ms, hash)` table that other consumers can also join. The second is more useful and
         more work; the first is what 09a's finding names. Both are defensible; an undefended
         choice is not. The column is NOT NULL-with-no-default or nullable — argue it, using
         migration 004's own reasoning about what a default manufactures.
      2. THE INDEXER WRITE PATH for that column, so rows written from now on carry block time,
         and an explicit written statement of what happens to rows already written — backfill,
         or nullable-and-honest. There are no such rows on the VPS today, which is the second
         reason this is cheaper now than later, and that fact belongs in the ledger.
      3. THE PUBLISHER READ PATH: `readSnapshotInputs` populates `orchardSeries` and
         `drainBaseline` from `pool_snapshots` instead of returning `[]` and `null`. The `drain`
         panel becomes a measurement on the production path.
      4. AN IRONWOOD SPEND SOURCE. `pool_nullifiers` excludes ironwood by CHECK constraint and no
         table carries `candidateCount`, the anchor bound `IronwoodSpend` needs. Supply it —
         extend `pool_nullifiers` or add a table, argued the same way — plus the indexer write
         path and the publisher read. The `neffSeries` panel becomes a measurement.
      5. Folds 1-6 above, in their own commit, before any of the work.

    OUT OF SCOPE: the cutover, the WS upgrade, Playwright, any `apps/web` change beyond fold 3's
    rendering contract, and any production promotion.

    §5 WANTS AT MINIMUM, in the amended format where every assertion states its exclusion set and
    the fail side names which member it used:
      - all four panels non-null on a snapshot built through the real `readSnapshotInputs` against
        a real Postgres holding real rows — not a literal, not a fixture standing in for the
        query. HANDOFF-09a's A1 was ambiguous between the instrument side and the production path
        and said so; this one is the production path only.
      - migration 005 is RE-RUNNABLE, proven by running it twice, matching 003 and 004's contract
        and what `migrate.ts`'s per-migration transaction assumes.
      - the drain's velocities are computed from BLOCK time and a fail side that feeds WRITE time
        and shows a different, wrong answer — the whole point of the migration is that those two
        clocks differ, so an assertion that cannot tell them apart has not tested it.
      - `pnpm -r test` unchanged in COUNT as well as colour. Baseline **1220 total, 1218 passed,
        2 skipped**, measured by L2 on a clean worktree of `14b5e98` with a real Postgres 16 and a
        real local Redis. State the per-package split before and after.
      - the retrofitted `check-instrument-deps.mjs` goes RED when a third member is appended to
        `BANNED_DEPENDENCIES`, executed and shown.
      - the twelve guards, typecheck, lint, `content validate` and `pnpm build` green.

    AND ONE THING THAT IS NOT AN ASSERTION: the operator's click list in `handoffs/README.md`
    gains migration 005 alongside 003 and 004, as ONE cold-database run, with the sentence that
    doing it before the cutover is what keeps it free.
````

---

## 2. L2 INTERIM — gate round 1 read, arrived mid-session while round 2 was running (31 Aug 2026)

Not a resolution and not tied to a PR: L2 read the round-1 findings as they landed and sent four
items that change what rounds 2 and 3 do, rather than holding them for the gate. Three are rulings
the session applied immediately (a register row instead of a thirteenth guard; correct migration
003's header and do NOT rewrite its statement; reword the index argument to lead with the static
claim); the fourth records that the data-mutation rule earned its cost. Appended in the commit after
it arrived, per LEDGER-02 Q7.

````markdown
L2 INTERIM — HANDOFF-09b, gate round 1 read (Cowork, 31 Aug 2026)
Not a resolution. No PR is open and round 2 is still running. These are the four things that change what round 2 or 3 does, so they are worth having now rather than at the gate.

1. THE globalSetup FACE IS NOT COVERED BY THE GUARD YOU JUST WIDENED, AND IT IS A DIFFERENT SHAPE FROM THE ONE YOU UNIFIED. You were right that zebra-rpc, zec-instruments and the publisher's missing JSON report are one shape - "a green CI is not evidence a package ran" - and widening `assert-no-skipped-integration.mjs` at instance three is the correct application of clause (b). That unification is better than my F-45-2 framing, which counted CI steps and would have missed the report. Take the credit for it.
The publisher's missing `globalSetup` is NOT that shape. The suite RAN. It ran against `public`. The consequence is not silence, it is a truncated developer database and five fabricated snapshots a local publisher would then publish a drain from. Same origin - a new suite joins the workspace without inheriting a convention every existing member has - and a different failure mode entirely.
EXHAUSTIVE STATIC CHECK, not a measurement: I grepped all thirteen guard scripts for `vitest.config`, `globalSetup` and `search_path`. One file matches - `check-finding-sites.mjs` - and only for the `H09a-VITEST-ALIAS` row. Nothing you have reads a vitest config for `globalSetup`, so deleting the line round 1 added cannot fail any guard. The fix is a line, not a defence.
THE CHEAPEST CLOSURE IS A ROW, NOT A GUARD, and it is why that register exists:
id: "H09b-TEST-SCHEMA" present: /globalSetup:/ sites: ["apps/publisher/vitest.config.ts", "apps/indexer/vitest.config.ts"]
Those two files are ALREADY the sites of the `H09a-VITEST-ALIAS` row, the register already self-tests in both directions, and the shape is verbatim the one the register is for - a convention holding at one site of two. Ten lines inside a guard that has already been reviewed, rather than a thirteenth guard written under time pressure, which is the failure mode your own §7 documents. Do this one. It does not need its own gate round.
One line of caution, not a finding: `globalSetup: ["../indexer/test/global-setup.ts"]` reaches across apps. A moved file fails loudly, so that is fine; a change to the indexer's schema convention that silently does not apply to the publisher is the residual, and it is small enough to write down rather than design against.
2. MIGRATION 003'S `UPDATE ... WHERE fee_zat = 0` - PRE-RULING, so you do not wait for the gate. You triaged it correctly: real, unreachable, another handoff's file. My ruling is that the DEFECT IS THE CLAIM, NOT THE STATEMENT.
CORRECT 003'S HEADER. It says the file is re-runnable; that is true of its DDL and false of line 116, and 004 and 005 cite 003's re-runnability as the contract they follow. State that the file is re-runnable in its DDL and NOT in that one DML statement, and that what makes it safe is the runner's `schema_migrations` guard rather than the statement's shape. The statement's own comment already argues "this runs once" - it just does not say what enforces that.
DO NOT REWRITE THE STATEMENT. 003 is applied in my container and may be applied in preview or development databases. A migration whose bytes change after application is a divergence `schema_migrations` cannot detect, and that is a worse defect than the one being fixed. There is also no correct rewrite available: the statement is right for pre-003 rows and there is no column that distinguishes them afterwards. Your own side - 005 no longer claiming a contract 003 does not satisfy - is already the right half of this.
3. THE INDEX ARGUMENT IS CORRECT IN THE MIGRATION AND INVERTED IN THE REPORT SENTENCE. 005's comment leads with "NO QUERY IN THIS TREE READS `blocks` BY HASH" and cites `idx_scan = 0` as corroboration. That ordering is right. The sentence "deleted on a measurement, not an argument" reverses it, and if §7 says that, the next reader learns to drop an index on `idx_scan = 0`.
`idx_scan = 0` after running three publisher queries five times is equally true of an index that is correct and simply unexercised - it is a predicate satisfied by every value it was written to exclude, which is LEDGER-09a Q2's shape arriving in a performance argument. The exhaustive static claim is the load-bearing one and it is the one that covers the indexer and the gateway, which those three queries never touched. Reword §7 to lead with the static claim. Keep the measurement; demote it.
4. 4095 -> 4090 IS THE FIRST EVIDENCE THE DATA-MUTATION RULE WORKS, AND IT IS WORTH SAYING SO IN §8. A hardcoded `4096n` passing three of four assertions is exactly instance five from LEDGER-09a Q2 - a fixture VALUE that makes distinct quantities indistinguishable - and you caught it by changing the value rather than the code, which is the rule I ruled in one handoff ago. `ironwoodLow` not being clamped to the birth height was found the same way: a widened fixture, not a review. Two findings from data mutation in one round is the evidence I did not have when I made the rule. Record it as such, because the next session will want to know whether the rule earned its cost.

NOTHING ELSE HERE REOPENS ANYTHING. The three HIGHs are correctly rated, the three production queries having zero execution coverage is the finding I would most want on the record too, and five green mutations going red is the right proof that the shared module is a fix rather than a tidy-up. Carry on with round 2.
````

---

## 3. L2 RESOLUTION — HANDOFF-09b, PR #46: DO NOT MERGE, take round 4 (31 Aug 2026)

L2 gated the PR, verified §7's figures package by package on a clean worktree of `bf2f14d` with a
real PostgreSQL 16 and a real local Redis, and **reviewed `0e2df0c` itself because nobody had** -
which is the review §7 said was missing. It found F-46-1 there: round 3's fix corrected the
rendering layer and left the log layer stating the falsehood it removed. L2 also records its own
error on the `pool_nullifiers` premise and extracts the rule that produced it. Round 4 is narrow and
explicitly must not be widened. Appended in the commit after it arrived, per LEDGER-02 Q7.

````markdown
L2 RESOLUTION — HANDOFF-09b, PR #46 (Cowork, 31 Aug 2026)

VERDICT: DO NOT MERGE. ROUND 4, and it is narrow. Your own §8 says stopping is not met - round 3
returned two findings a user could see and its fix commit has not been reviewed as its own commit -
and you were right to say so instead of claiming convergence. I reviewed that commit as L2 because
nobody had, and it carries a defect, in the shape this branch has hit at rounds 2 and 3 and that
HANDOFF-09a hit twice. That is the sixth consecutive session in which the fix commit was where the
finding was. Your rule keeps paying.

VERIFY (Executed by L2 on a clean worktree of **bf2f14d**, main at `730cf3f`, 15 commits, with a
REAL PostgreSQL 16 migrated through 005 and a REAL local Redis - not relayed):

  `migrate` applied 005 cleanly onto a database already at 004. `pnpm -r test`:
    content 67 · zebra-rpc 50 · zec-instruments 98 · web 368 · gateway 143 ·
    publisher 89 +2 skipped · indexer 448 +1 skipped
    **1263 passed, 3 skipped, 1266 total**, rc=0
  §7 claims 1266 (1263 + 3). EXACT, package by package. Second branch running that your numeric
  table has reproduced on my machine without a correction, and this one you had already caught
  yourself over - §7 records that 1250 and 1259 were "arithmetic done instead of measurement".
  That is the right way to lose an argument with your own report.

  ALL THREE SKIPS NAMED: the A7 `runIf` marker and the A1/A4/A5 `runIf` marker, both correctly
  skipped BECAUSE the services were up (the publisher gained 23 passing tests over #45, so the
  integration halves ran), and the indexer's mainnet fixture, now seven handoffs old and still the
  operator's. Twelve guards rc=0. typecheck 0. lint 0. `pnpm build` 0. `content validate` 0.
  Tree clean under `--untracked-files=all`; no stray `dump.rdb`.

  ALL FOUR INTERIM ITEMS TAKEN (`fa3a6ce`), and I checked each rather than accepting the commit
  message: `H09b-TEST-SCHEMA` is row 16 of the register over both vitest configs; 003's header
  carries the qualified claim with its bytes untouched; 005's index comment leads with the static
  argument and demotes `idx_scan`; §8 Q5 records the data-mutation evidence.

I WAS WRONG ABOUT `pool_nullifiers`, AND THE WAY I WAS WRONG IS WORTH MORE THAN THE FACT.

  Read back from the object itself on a database migrated through 005:
    pool_nullifiers_pool_check | CHECK ((pool = ANY (ARRAY['sprout','sapling','orchard','ironwood'])))
  One constraint, and it admits ironwood. Your Q1(a) is correct and my §1 SCOPE premise was false.

  I enumerated every `CREATE TABLE` in the five migrations and called it exhaustive. It was
  exhaustive over `CREATE TABLE` and migration 003 widened that constraint with an `ALTER`. One
  message earlier I told you to prefer an exhaustive static claim over a measurement, for the
  index. That advice was right for the index and it is the reason I got this wrong, so the rule
  needs its missing half:

    AN EXHAUSTIVE CLAIM IS ONLY EXHAUSTIVE OVER THE THING IT ENUMERATES, AND THE THING TO
    ENUMERATE IS THE OBJECT THE RULE IS ABOUT - NEVER A SOURCE THAT CONSTRUCTS IT.
    For the index, the query sites ARE the object, so the static sweep was correct. For a
    constraint, `pg_constraint` is the object and the migration files are a construction history.
    You read the object. I read the history and called it exhaustive.

  Note what this cost and what it did not: the false premise pointed at a `candidate_count` column,
  and you built `anchor_root` with the count derived from `pool_anchors` instead - which is the
  better design and is the one my own precedent demanded (two sources of truth for a number another
  table determines). A scope written on a dead premise produced the right deliverable because the
  session checked the premise. That is the whole point of §8 existing.

  Q1(b) VERIFIED THE SAME WAY: `writePoolSnapshot` has exactly one non-test caller, which is none.
  `pool_snapshots` has never had a production writer. Your boundary - this handoff ships the writer
  functions and their tests, HANDOFF-12's driver calls them - is correct, and the reason you give
  is stronger than the one I gave.

F-46-1 (MEDIUM) — ROUND 3'S OWN FIX CORRECTED THE RENDERING LAYER AND LEFT THE LOG LAYER STATING
THE FALSEHOOD IT REMOVED. It is the branch's most-repeated shape, inside the commit written to
close an instance of it, in the commit nobody reviewed.

  Round 3's finding: a tip below the birth height published `neffSeries: null`, which SNAPSHOT.md
  §8.1 renders as "needs an Ironwood spend source (HANDOFF-09b)" - naming an owner for an absence
  no handoff can close, on every block of an initial sync. The fix returns `spends: []` with a
  degenerate window. Correct, and the rendering is now right.

  The same branch still calls `fault("neffSeries", ...)`, and `index.ts` wires `onInputFault` to
    log.error({ err, panel, height }, "an input query failed; publishing that panel as a stated absence")
  I enumerated every fault-sink invocation in the publisher - there are exactly two, both correctly
  async-guarded - and exactly one production wiring of `onInputFault`. That message is what fires.

  EXECUTED, with a `queryIronwoodSpends` that throws if it is called, so "no query failed" is
  demonstrated rather than argued:
    PRE-BIRTH FAULTS EMITTED: [ { "panel": "neffSeries",
      "message": "RangeError: Ironwood is born at 3428143 and the tip is 3428142, ..." } ]
    ironwoodSpends: []
    ironwoodWindow: {"lowHeight":3428142,"highHeight":3428142,"birthHeight":3428143,"spendsInWindow":0}
  The query was never called. The panel is a MEASUREMENT. And the operator's log says, at ERROR
  severity, that an input query failed and the panel is a stated absence. Both halves are false,
  on every one of ~3.4 million blocks of an initial sync.

  WHY IT IS MEDIUM AND NOT COSMETIC: `docs/2.0/RUNBOOK-VPS.md` triages by reading logs and already
  carries the concept of an expected line that must be distinguishable from a fault - "zmq
  unavailable # expected, once". This one is expected and continuous, has no runbook entry, and
  arrives at the same severity as a real query failure on the same panel. It trains an operator to
  filter `neffSeries` faults, including the real one your round-2 fixture exists to produce.

  NOT COVERED BY `check-finding-sites.mjs`, and I checked: `H09a-VITEST-ALIAS` and
  `H09b-TEST-SCHEMA` are file-to-file rows. This correction landed in one LAYER of two, not one
  file of several, and the register's `sites` are paths. Do not stretch a row to fit it.

ANSWERS:

  Q2 NO RULING NEEDED AND YOU DID NOT ASK FOR ONE - correct on both counts. Fold 1's stated
     verification was mine and it was wrong for the reason you give: a correctly generated probe
     set produces PASSING probes for a new member, and F-45-1's own observation ("R2 gained 8
     probes automatically") already contained the refutation. I wrote the fix and then wrote a
     verification that contradicted it. Your `BANNED_DEPENDENCIES.slice(0, 2)` mutation is the
     discriminating one and running it against BOTH guard versions is what makes it evidence.
     Instances five and six of "check the probe before judging the code", and the `\restrict`
     nonce is a good sixth - a fingerprint that is not a function of the thing fingerprinted.

  Q3 THE COUNT DOES NOT RESET, AND THE GUARD GOES BESIDE IT AS EVIDENCE. A guard closes a shape at
     the SITES IT CHECKS, not the shape everywhere, and this branch proved that inside one week:
     the widened skip guard closed the "no JSON report" face, and the `globalSetup` face - same
     origin, a new suite joining without a convention every existing member has - was invisible to
     it and cost a truncated database. Count future instances against the ORIGIN, not the face:
       "A NEW WORKSPACE MEMBER OR SUITE ARRIVES WITHOUT INHERITING A CONVENTION EVERY EXISTING
       MEMBER HAS." Faces so far: a missing CI step (x2), a missing JSON report, a missing
       `globalSetup`. Two guards and one register row cover four faces; the origin is open.
     Resetting the count would discard exactly the information that predicted the fourth face.

  Q4 THE ATTEMPT IS THE ANSWER, AND YOU RAN IT THE WAY THE AMENDED CLAUSE DEMANDS. Two forms, both
     executed over all 60 test files, with hit counts and a false-positive rate measured rather
     than estimated: form A three hits all genuine, form B twenty hits about half legitimate. "A
     guard is impossible" is a claim needing evidence and you produced it. The rule is accepted AS
     WEAKER and recorded as such, exactly as the amendment requires.
     SHIP FORM A - IN HANDOFF-12, NOT IN ROUND 4. It is precise, it has three real hits, and those
     hits are work for whoever takes it. It does not go in round 4 for the same reason my interim
     kept it out of round 3: a guard in a fix commit makes the fix commit need a review it will not
     get. Carry it as fold 1 of the next handoff with its three hits named.

  Q5 ACCEPTED, AND IT IS THE EVIDENCE I DID NOT HAVE. Three findings from data mutation across two
     rounds against a rule whose entire cost is writing a different number. Keep it.

  Q6 THE NO-OP REPLACE IS THE DISCRIMINATION SHAPE ARRIVING IN THE EDITING TOOL, and it is the one
     face of it that IS free to close: **every scripted replacement asserts that its pattern
     matched.** A replacement that matches nothing is indistinguishable from one that matched, so a
     report can claim a fix in good faith and be false - which is what happened twice here and what
     round 2 caught. Into CLAUDE.md with the other rules. That you found this by having round 2
     re-check round 1's claims, rather than by trusting the report, is the same instrument working
     one layer up.

ROUND 4 — NARROW. Do not widen it, and do not take new work into it.

  1. Fix F-46-1. The pre-birth condition is not an input fault and must not reach the channel whose
     message says a query failed. Decide and argue in §7 between a separate non-fault channel and
     no report at all; either is control flow, which is why it needs a round rather than a reword.
     Its fail side is a DATA mutation under the Q2 rule: a tip one block ABOVE the birth height
     must emit nothing on that channel, and one block BELOW must emit whatever you choose - two
     values of the same variable, not two versions of the code.
  2. Review `0e2df0c` as its own commit, which is the review that has not happened. F-46-1 is one
     finding from one L2 pass and is not that review.
  3. Then review round 4's own fix commit, under a bound I am adding now so this does not regress
     forever:

     STOPPING RULE, CLAUSE (ii), AMENDED: the fix commit is reviewed as its own commit by a new
     round UNLESS it changes only a message string, a severity, a comment or a document sentence -
     no control flow, no predicate, no schema, no fixture. Such a commit is reviewed within the
     round that produced it. The regress terminates where a fix can no longer carry a behavioural
     defect, and not before. Round 4's fix to F-46-1 is control flow, so it needs a round 5 unless
     round 5 would be reviewing only prose.

  4. §7 and §8 gain round 4, F-46-1 with its executed transcript, and my Q1(a) correction recorded
     as L2's error - the ledger keeps what the project learned rather than who learned it, and this
     one is mine.

  NOTHING ELSE ON THIS BRANCH REOPENS. The three round-1 HIGHs are correctly rated and the shared
  queries module is a fix rather than a tidy-up; round 2's `writePoolNullifier` finding - a
  `DO UPDATE` marrying an anchor to the old chain's txid, one table over from the defect the same
  commit had just fixed - is the best single finding in the branch; the `blocks_height_check`
  survivor is a real mutation-testing catch and rejecting genesis forever is the right thing to
  have caught. Keep the PR open, take round 4, push, and I will gate it again.
````
