# PROMPT-10 — the messages that steered the HANDOFF-10 session

Archived under the revolution protocol, step 5: every message that steered this session,
verbatim, under a heading naming what it is and when it arrived. One file per handoff, not one
per message.

**This session was told to execute HANDOFF-10 only by its THIRD message.** The first two aimed it
at HANDOFF-08 and were withdrawn. They are archived here in full anyway, because the work they
caused and the work they cancelled are both part of how this handoff came to be executed, and
because a prompt archive that keeps only the instructions that survived is not an archive.

---

## 1. Session kickoff — HANDOFF-08's write-back (29 Aug 2026), SUPERSEDED

Aimed this session at completing HANDOFF-08's write-back on
`claude/handoff-08-analysis-toolkit-bjvz3i`, PR #39, and carried an `L2 RESOLUTION` block with
five folds.

**One fact in it was already stale on arrival, and one more went stale during it.** Block A opens
"DO NOT MERGE #39 YET" and says "the PR is already open"; PR #39 had in fact been merged as
`4386e98` at 14:54 UTC, before this session started, and this session's branch was cut from that
merge commit. Message 3 then withdrew the whole instruction.

Work done under it and later discarded: a reconcile commit, a sixth static guard
(`check-ci-coverage.mjs`, written and probed in four directions), a CLAUDE.md fold, and §5
spec-defect records. All of it was reverted to `4386e98` under message 3 and none of it reached
the remote. `git status --porcelain` was empty afterwards.

```
================================================================================ BLOCK A — PASTE THIS FIRST, into the HANDOFF-08 session (or a new one told to check out `claude/handoff-08-analysis-toolkit-bjvz3i`). DO NOT MERGE #39 YET.
Aqua Stack v4.1. You are on `claude/handoff-08-analysis-toolkit-bjvz3i`, PR #39. HANDOFF-08's WRITE-BACK did not happen: `handoffs/HANDOFF-08-analysis-toolkit.md` is still `status: in-progress` with §7 as the empty template, `handoffs/LOG.md` has no row for 08, and `handoffs/LEDGER.md` has no HANDOFF-08 §8 block. Complete step 4 of the Revolution protocol on this branch, before the PR is merged. Append the L2 RESOLUTION below to LEDGER.md verbatim and apply its folds in the same commit. Stop at pushed; the PR is already open.

[The full L2 RESOLUTION — HANDOFF-08 (Cowork, 29 Aug 2026) block, its VERIFY paragraph, its five
adversarial probes, finding F-08-1, the owned spec defects against A8 and A10, the CI-gap note,
and folds 1 through 5 — is reproduced verbatim in handoffs/prompts/PROMPT-08.md section 2, which
this session wrote before the instruction was withdrawn. It is not duplicated here.]

================================================================================ BLOCK B — PASTE THIS ONLY AFTER #39 IS MERGED WITH ITS WRITE-BACK.
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-09-instruments-snapshot.md. It is the Data track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.
```

---

## 2. "CORRECTION IN FLIGHT" — HANDOFF-08's A9 (29 Aug 2026), NOT THIS SESSION'S

Arrived mid-turn. It told this session that PR #39 had been merged ten minutes after `6797113`
was pushed and while four gate lenses were still out, that its own uncommitted work held the only
copy of gate round 1's fixes, and that A9 was a tautology with a live conservation defect on
`main`. It carried an `L2 CORRECTION — HANDOFF-08, A9` block and five folds.

**Its premise did not hold for this session.** This session is not the one that built HANDOFF-08:
it was started after the merge, from the merge commit, and had no gate fixes and no
`conservation.ts` in its tree. Message 3 confirmed this and withdrew the message as
misaddressed.

The substance is real and belongs to the other session: A9's property test checked each match
individually where the assertion quantifies over the aggregate, so 300 runs of a condition that
cannot fail, and one deposit matched by three withdrawals claims three times the pool balance.
Recorded here only so the archive shows what arrived; the ledger entry for it is HANDOFF-08's to
write, not this one's.

```
Aqua Stack v4.1 — CORRECTION IN FLIGHT. Do not discard your working tree; it holds the only copy of the gate-round-1 fixes.
WHAT CHANGED UNDER YOU: PR #39 was merged at 14:54 UTC as `4386e98`, ten minutes after you pushed `6797113` and while your four lenses were still out. `origin/main` now carries HANDOFF-08 WITHOUT your gate fixes and WITHOUT the write-back. Your branch head is unchanged at `6797113`, which is now an ancestor of main, so nothing you pushed was lost and nothing you have not pushed is on main.
WHAT TO DO: keep going exactly as you are, then land the work as a FOLLOW-UP PR instead of on the closed one.
1. Finish gate round 1's fixes and the A9 rewrite. Do not restart the gate; you are mid-round, and the round is converging.
2. Branch from current `origin/main` (`4386e98`), carry your uncommitted work across, and open a NEW PR titled `HANDOFF-08 follow-up: gate round 1, the conservation law, and the write-back`. Same handoff, same ledger entry — this is HANDOFF-08 finishing, not HANDOFF-08 again.
3. The write-back goes in THAT PR: §7 filled, §8 in LEDGER.md, the LOG.md row, `status: shipped`, README index. Everything from PROMPT-09 Block A still applies, with fold 1's target being the follow-up branch.
4. Append this correction to LEDGER.md verbatim, above the L2 RESOLUTION you were already given.

L2 CORRECTION — HANDOFF-08, A9 (Cowork, 29 Aug 2026)
L2's HANDOFF-08 verification said "every one of the thirteen assertions holds". THAT SENTENCE IS FALSE AND MUST NOT ENTER THE LEDGER UNCORRECTED. A9 did not hold. It was a tautology, this session found it, and L2 did not — for a reason worth recording, because it is the exact failure this project's verification discipline exists to prevent.
L2 VERIFIED A9 BY READING IT. Twelve of the thirteen assertions got a mutation probe. A9 got `grep numRuns` (300, as specified) and a read of its `describe` block, and was passed on that basis. A property test's run count is not evidence that the property is the right one. Breaking twelve things and reading the thirteenth is how the thirteenth is the one that was wrong.
THE VIOLATION, REPRODUCED BY L2 ON `main` AT 4386e98: one 100 ZEC Orchard deposit, three 100 ZEC withdrawals in window -> matches = 3, grades HIGH/HIGH/HIGH, pool balance 100 ZEC, sum of claimed 300 ZEC. TRACKING-MATH §3.11 says "for every pool and window, sum estimated exits <= Bal^p", and this is a direct contradiction of it, live on main.
WHY A9 COULD NOT SEE IT: A9's property tests each match individually - `if (m.depositAmountZat > balance) return false;` - where `balance` is the sum of ALL deposits in the window. One match's claim can never exceed the sum of everything it could have been drawn from, so the condition is vacuously true for every input fast-check can generate. THE ASSERTION SAYS SIGMA AND THE TEST NEVER SUMS.
This is the fourth member of a family this project keeps finding: `expiryheight` casing, `tx.feeZat`, the "unknown fee" test that passed `0n`, and now A9. Every one of them was green. Green is the symptom, not the reassurance.
FOLDS — into this handoff's follow-up commit.
1. A9's replacement is verified by THE SCENARIO IT WAS WRITTEN TO FORBID, not by its run count: the one-deposit/three-withdrawal case becomes a named, non-property regression test beside the property, asserting the SUM across all matches in the window against the pool balance.
2. `conservation.ts` is the right move and its API should make the tautology unrepresentable: the function that answers §3.11 takes the SET of matches and the pool balance, so a caller cannot ask the question one match at a time.
3. `CLAUDE.md`, gate contract — add: a property test is verified by executing the concrete scenario it exists to forbid, and by watching that scenario fail against the pre-fix code. `numRuns` is a budget, not evidence.
4. `CLAUDE.md` — every §5 assertion gets a mutation, property tests included; an assertion verified by reading is an assertion not verified. L2 broke twelve and read one, and the one it read is the one that was wrong.
5. §7 records that PR #39 was merged mid-gate, and §8 asks the question that follows from it.
FOR §8, THE QUESTION THIS RAISES ABOUT THE LOOP RATHER THAN THE CODE: the PR opened before the gate finished, was marked ready for review by the operator, was read by L2 as a finished branch and verified as one, and was merged while four lenses were still out. Every tier behaved reasonably in isolation. The loop has no signal for "this branch is not ready to be read yet" that survives contact with a green CI badge. Propose one: L2 suggests the PR stays a DRAFT until the write-back commit lands, and that L2 declines to verify any branch whose handoff front matter is not `status: shipped`. Both halves are needed — the first is a signal, the second is L2 agreeing to read it.
OPERATOR NOTE (Aqua): `main` currently carries the conservation defect. The follow-up PR is not optional cleanup; it is the fix for a HIGH finding that is live. Nothing downstream should capture golden cases or build on the analysis toolkit until it lands.
```

---

## 3. "STAND DOWN, WRONG SESSION" — the message this session actually executed (29 Aug 2026)

Withdrew messages 1 and 2, confirmed that another session owns HANDOFF-08 and its follow-up, and
assigned this session HANDOFF-10 — the Infra track's handoff, `open` and unclaimed since
HANDOFF-00 because LEDGER-02 Q1 records that it needs its own session told it owns it.

Its `L2 RESOLUTION` carries eight items into HANDOFF-10 §2. Items 1, 2, 3, 4 and 6 are executed in
this branch; item 5 is the mainnet fixture and is BLOCKED on hardware (§8 Q4); item 7 is the other
session's guard, and this session's `ci.yml` changes were written to satisfy it in advance; item 8
is the verification discipline, applied to this handoff's own assertions.

```
Aqua Stack v4.1 — STAND DOWN, WRONG SESSION. The "CORRECTION IN FLIGHT" block you just received was addressed to a different session and was pasted here by mistake. None of it is yours.
ABORT THE HANDOFF-08 WORK NOW, before anything reaches the remote:
* Do not branch from `4386e98` for a HANDOFF-08 follow-up. Another session is doing that.
* Do not push, do not open a PR, do not write to `handoffs/LEDGER.md`, `handoffs/LOG.md`, `handoffs/HANDOFF-08-*`, or `apps/indexer/src/analysis/**`.
* Discard any local edits you made to those paths. `origin` is clean — no branch but `claude/handoff-08-analysis-toolkit-bjvz3i` and no commit past `4386e98` — so nothing has collided yet, and the recovery costs nothing if you stop here.
You have no uncommitted gate fixes and no `conservation.ts`; that work lives in the other session's tree. A ledger entry written from a report you did not produce is exactly the fabrication this project's provenance rules exist to prevent, and two sessions writing one §8 block is how a record becomes unreadable.
The PROMPT-09 you were given earlier is also void: its Block A is the work above, and its Block B (HANDOFF-09) is blocked, because HANDOFF-09's turnstile accounting builds on the analysis toolkit and `main` currently carries a live conservation defect in that layer.
WHAT YOU OWN INSTEAD
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-10-infra.md. It is the INFRA track's open handoff and it has been unclaimed on purpose since HANDOFF-00 — LEDGER-02 Q1 records that it needs its own session told it owns it. This is that session. Infra shares no files with the Data track, so you and the HANDOFF-08 session will not collide. Report spawn mode first. Stop at PR opened.
Its §1 is explicit: NO CONTAINERS ARE STARTED BY ANY AGENT. No `docker compose up`, no cloud provisioning, no DNS. `docker build` of the repo Dockerfiles is allowed. You produce files and a runbook a human executes.
L2 RESOLUTION — carried into HANDOFF-10 from LEDGER-05 through LEDGER-08. Read as part of §2.
1. THE ZEBRA VERSION FLOOR HAS TWO NAMED REASONS. `docker-compose.yml` still pins `zfnd/zebra:4.4.1`, off-consensus since 3 Jun 2026. Pin `>= 6.0.0`, a cited `6.2.x` tag. Below 6.0.0 there is no Ironwood support; below ZcashFoundation/zebra PR #9805 (merged 22 Aug 2025) `getrawtransaction` does not serialise `vjoinsplit` at all, which makes every Sprout value term silently `0n`. `packages/zebra-rpc/src/sprout-field.ts` already reports that as INDETERMINATE rather than zero — deliverable 2b is where "indeterminate" becomes "observed", by capturing a real transaction and recording the node's `subversion` beside the fixture.
2. THE IRONWOOD ANCHOR IS NOT ON `getblock`. Confirmed from Zebra source: `zebra-rpc/src/methods.rs` defines `finalsaplingroot` and `finalorchardroot` and no ironwood root under any spelling. PR #10888 (merged 2 Jul 2026) gives Ironwood a SIZE instead — `GetBlockTrees.ironwood: IronwoodTrees { size: u64 }` — with the block-level ROOT on `z_gettreestate` and subtrees on `z_getsubtreesbyindex` (`pool = "ironwood"`). Zebra 6.0.0, released 10 Jul 2026, names those three RPCs as the Ironwood tree surface. Your captured fixture must exercise `z_gettreestate`, not only `getblock`.
3. INTEGRATION-TEST DATABASE ISOLATION IS YOURS (LEDGER-06 Q6). The suite is not safe against two concurrent vitest processes on one Postgres — every integration suite TRUNCATEs shared tables in `beforeEach`, and HANDOFF-06's round 2 produced failures in BOTH directions when two workers ran side by side, including a corrupted conservation assertion. CI is safe only because it runs one vitest process per package and `apps/indexer/vitest.config.ts` sets `fileParallelism: false`. That is a configuration, not a property. Decide and implement one of database-per-worker, an advisory lock, or schema-per-run, and say which and why. Not hypothetical: two sessions are running against this repository today, which is how this instruction reached the wrong one.
4. MIGRATIONS 003 AND 004 HAVE NEVER BEEN APPLIED TO THE VPS DATABASE, and 003 is the first migration here that ALTERs objects it did not create and REWRITES existing rows (`UPDATE leak_reports SET fee_zat = NULL WHERE fee_zat = 0`). The runbook says so in those words, and says what a human does if it fails halfway.
5. THE CAPTURED MAINNET FIXTURE CLOSES FOUR OPEN ITEMS AT ONCE — the one skipped test in this repository (`block-decoder` real mainnet fixture), the `vjoinsplit` end-to-end path, the `trees.ironwood.size` observation, and the testnet half of the ZIP 258 draft-height exposure. Include a Sprout-carrying transaction deliberately: no fixture in the tree has one, which is why the Sprout terms have never met real bytes.
6. THE COLLATION TRAP, so your CI work does not re-create it. `postgres:16` initdbs with glibc `en_US.utf8`; a dev container is usually `C.UTF-8`. They disagree on exactly the migration filenames this project has (`003_four_pools` vs `003a_gateway_cache`), which cost HANDOFF-06 a red CI run. Any ordering assertion sorts in one language on both sides, and never in SQL.
7. A SIXTH STATIC GUARD LANDS IN THE HANDOFF-08 FOLLOW-UP, not here — `check-ci-coverage.mjs`, asserting that every workspace package with a `test` script has a CI step. It exists because `packages/zebra-rpc` went three handoffs and 35 tests without ever running in CI. If you change `.github/workflows/ci.yml`, expect that guard to arrive underneath you and write your changes to satisfy it.
8. VERIFICATION DISCIPLINE, tightened this round at L2's own expense. Every §5 assertion gets a MUTATION, property tests included; an assertion verified by reading is an assertion not verified. L2 broke twelve of HANDOFF-08's thirteen and read the thirteenth, and the one it read was a tautology — 300 property runs of a condition that could not fail. A property test is verified by executing the concrete scenario it exists to forbid and watching that scenario fail against the pre-fix code. `numRuns` is a budget, not evidence.
OPERATOR CLICKS (Aqua, not any agent): HANDOFF-10 ends at files and a runbook. Provisioning the VPS, running the runbook and creating the tunnel are the operator's, after this PR merges.
```

---

## 4. Usage-limit interruption (29 Aug 2026)

The gate's verify phase was ended by a usage limit; the session resumed after the reset with the
message below. No instruction changed.

```
I hit my usage limit while you were working, but it has reset now. Please continue from where you left off.
```

---

## 5. The rebase instruction and L2 RESOLUTION for PR #43 (29 Aug 2026, uploaded as PROMPT10REBASE.md)

Arrived after the PR was opened and after gate round 3 had been pushed. It supersedes the
section 7 gate numbers, carries L2's verification of c4488f1, one finding (F-43-1) and four
folds. Verbatim:

```
Aqua Stack v4.1 — HANDOFF-10, PR #43. You are two commits behind main. Catch up, re-gate, then the PR is ready. Stop at PR updated.

WHERE YOU ACTUALLY ARE, because you have already done most of this. `b8264c8` merged `origin/main` into your branch and kept both sessions' records, which resolved the ledger conflict that would have mangled HANDOFF-08's rounds 2 to 4. That was the right call and it is the half that mattered. Since then PR #42 merged, so `origin/main` is now `4ae0796` and you are behind by it.

L2 ran the merge against current main. Three files conflict and none of them is the ledger:

    .github/workflows/ci.yml
    handoffs/LOG.md
    package.json

All three are the same shape: #42 added two guards and you added three, and both edits are correct edits to the same lists. Nothing here is a disagreement about content.

WHAT TO DO
  1. Merge `origin/main` (`4ae0796`) into the branch again.
  2. Reconcile so that ALL TEN guards run in `ci.yml` and in `pnpm check`: the five that predate both
     of you, #42's `check-audit-consumers` and `check-finding-sites`, and your `check-compose`,
     `check-zebrad-config` and `check-infra-docs`. Union, not either side.
  3. `handoffs/LOG.md` — keep both rows. HANDOFF-08's row and yours are different handoffs.
  4. Re-run the six-command gate and put the NEW numbers in §7. Your `1036 passed, 1 skipped` was
     measured on the pre-#40 base and I confirmed exactly that figure at `c4488f1`, which is how the
     stale base was established rather than assumed. Current main is 1058 before your own tests.
  5. Re-open as **HANDOFF-10** rather than the branch's harness name, and note in
     `docs/2.0/BRANCH-CLEANUP.md` that `claude/handoff-08-completion-wngbjj` carries HANDOFF-10 work.

MY VERIFICATION IS ONE GATE ROUND STALE AND I AM SAYING SO. Everything below was measured at
`c4488f1`. You have since pushed `c698a3f` - gate round 3, "four of round 1's fixes had not landed
their property" - which I have not verified. The re-gate after the merge supersedes my numbers; the
finding and the folds below still stand, because they are about the guards rather than the counts.

L2 RESOLUTION — HANDOFF-10, PR #43 (Cowork, 29 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of **c4488f1**, with a REAL PostgreSQL 16 — not relayed):
  Your head moved twice while I worked, from `d8357a5` to `76dc849` to `c4488f1`; I re-ran at the
  last one. Third revolution running where the head moved under a verification.
  Clean tree, no `dist`: content 67 · zebra-rpc 35 · web 368 · gateway 127 · indexer 439 —
  **1036 passed, 1 skipped**, rc=0, which matches your report and is the pre-#40 total. typecheck
  10/10, lint 0/0, all eight guards on this branch rc=0.
  `docker compose config` I CANNOT RUN: there is no Docker in this container. That measurement stays
  the operator's, like the Lighthouse numbers and the preview host. Stated rather than glossed.

  THE ISOLATION DELIVERABLE, WHICH IS THE ONE I ASSIGNED THREE REVOLUTIONS AGO (LEDGER-06 Q6),
  VERIFIED PROPERLY. Two concurrent `vitest run` processes over the whole integration suite, against
  one Postgres:

      run A  10 files, 60 passed, rc=0
      run B  10 files, 60 passed, rc=0

  Disjoint schemas, no interference, both green. The hazard HANDOFF-06's round 2 reproduced in both
  directions is closed, and `search_path` at the connection level is the right mechanism — it leaves
  `truncateAll` and every test file untouched, which is why it did not cost a rewrite.

  I COULD NOT CONSTRUCT A FAIL SIDE, AND THAT IS A PROPERTY RATHER THAN A GAP. Three attempts:
    `ZR_TEST_SCHEMA=public` on both runs -> globalSetup overwrites it; both still isolated, both pass.
    `schemaName()` forced to a constant   -> the second run dies on `CREATE SCHEMA ... already exists`.
    constant name + `IF NOT EXISTS`       -> the second run dies on `duplicate key ... schema_migrations_pkey`.
  Every route to a shared schema errors LOUDLY at setup before the suites can interleave, so the
  mid-test corruption I was trying to reproduce is no longer reachable from outside. Your method was
  better than mine: reproducing it against the pre-fix code is the correct construction and mine was
  not. I am recording that I failed to reproduce it rather than implying I confirmed it.

  GUARDS, MUTATED:
    check-compose.mjs        delete the zebrad healthcheck block, byte-exact elsewhere
                             -> rc=1, "A4 service without a healthcheck: zebrad declares none, so
                                nothing can depend on it with condition: service_healthy"
    check-zebrad-config.mjs  append `[nonexistent_section]`
                             -> rc=1, "unknown section ... ZebradConfig has twelve sections and this
                                is not one of them; zebrad rejects the file rather than ignoring it"
  Both discriminate and both name the rule rather than the line.

  THREE OF MY PROBES THIS ROUND WERE MALFORMED, and I am listing them because a probe that does not
  discriminate and a guard that is inert produce the same output:
    - a crude line-delete on `docker-compose.yml` mangled the YAML, so `check-compose` fired on
      unrelated A8 rules. Redone with an exact line range.
    - `yaml.safe_dump` round-tripping the same file rewrote `${VAR:?...}` quoting and tripped a
      password rule. Discarded.
    - deleting the runbook's whole "## 4. Migrations" section did NOT trip `check-infra-docs`, and
      the guard was RIGHT: two `docker compose run --rm indexer node dist/migrate.js` invocations
      survive elsewhere in the file, so the topic really is still covered by a command.
  Two malformed probes at #42, three here. Fold 4 is about that.
  Verdict: the infra work is sound and the branch is not mergeable. **ONE FINDING.**

FINDING F-43-1 (Executed, LOW) — `check-infra-docs.mjs`'s migrations row is the one topic pattern
  that a SENTENCE can satisfy.
  Thirteen of the fourteen topics require a command shape: `/pg_dump/`, `/pg_restore/`,
  `/cloudflared\s+tunnel\s+create\s+\S+/`, `/docker\s+compose\s+pull\s+zebrad/`. The fourteenth is
  `{ topic: "migrations", re: /migrate/ }` — a bare substring that "before migrating" satisfies.
  Your own self-test fixture proves prose of that shape exists in this document family: line 163
  feeds the guard `"## 5. Backups\n\nTake a backup before migrating; keep seven off the box."` to
  prove the BACKUP topic fails on a sentence — and that same string would pass the MIGRATIONS topic.
  This is the shape you already fixed once in `check-audit-consumers`, where a field named in a
  comment counted as a field read. Same defect, different guard, and it is the loosest row in an
  otherwise strict table. Tighten it to a command — `/indexer\s+(node\s+dist\/)?migrate|--filter\s+@zcashreveal\/indexer\s+migrate/`
  or similar — and add the prose case to the self-test's negative fixtures.
  The stake is not hypothetical: section 4 is where **"MIGRATIONS 003 AND 004 HAVE NEVER BEEN
  APPLIED TO THE VPS DATABASE"** lives, along with the warning that 003 is the first migration here
  that ALTERs objects it did not create and REWRITES existing rows. That paragraph is the thing the
  operator most needs and the guard would not notice it leaving.

FOLDS — with the rebase, in the same PR.

  1. Tighten `check-infra-docs.mjs`'s migrations pattern to a command shape and extend the negative
     self-test with the prose case (F-43-1).
  2. `handoffs/HANDOFF-10-infra.md` §7 — the six-command gate numbers re-measured after the rebase,
     and a line stating that `docker compose config` and the base-image builds were verified by the
     operator or refused by the egress proxy, with which. A2 and A9's refusal transcripts stay.
  3. `docs/2.0/BRANCH-CLEANUP.md` — record that `claude/handoff-08-completion-wngbjj` carries
     HANDOFF-10, and that `claude/handoff-08-analysis-toolkit-bjvz3i` carried HANDOFF-08's four PRs.
     Branch names in this project are harness artefacts and the ledger should say so once.
  4. `CLAUDE.md`, verification contract — extend LEDGER-08 fold 8 with its converse, which is L2's
     rule about itself: a probe that does not discriminate must be checked BEFORE the code is judged,
     and a malformed probe is reported rather than silently redone. Five of L2's probes across #42
     and #43 were malformed; every one of them initially looked like a guard that was inert. Cite
     both: the object-literal probe that failed typecheck, and the runbook section whose commands
     survived elsewhere.

OPERATOR CLICKS (Aqua, not any agent):
  - Merge #42 first. It is verified, has no findings, and closes HANDOFF-08.
  - Then this branch, rebased and re-gated. Do not merge #43 in its current state: the merge
    conflicts on `handoffs/LEDGER.md` and `handoffs/LOG.md` today, and on `ci.yml` and `package.json`
    once #42 lands.
  - `docker compose config`, the base-image builds and the mainnet fixture capture are yours; the
    handoff records A2 and A9 as blocked with refusal transcripts, which is the correct state.
  - Migrations 003 and 004 still have not been applied to the VPS database. The runbook now has the
    procedure and the warning; the click is still yours.
```
