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
