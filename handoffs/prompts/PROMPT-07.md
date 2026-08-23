# PROMPT-07 — the messages that steered the HANDOFF-07 session

Archived under the revolution protocol, step 5: every message that steered this session, verbatim,
under a heading naming what it is and when it arrived. One file per handoff, not one per message.

## 1. Session kickoff — the message that opened the session (23 Aug 2026)

Reproduced byte-for-byte from the uploaded file, including the fenced `L2 RESOLUTION` block that the
protocol's step 2 consumes. The block is appended verbatim to `handoffs/LEDGER.md` beneath the
HANDOFF-06 ledger block, and its ten folds are applied before any HANDOFF-07 work.

```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-07-v6-decoder.md. It is the Data track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-06 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of **6fda93f**, not a5291c6, with a REAL PostgreSQL 16 — not relayed):
  You pushed two commits after the PR URL reached me, so I re-ran everything at the new head. That
  was the right order: a5291c6 was the commit CI went red on.
  `packages/*/dist` and every `*.tsbuildinfo` deleted first, then `pnpm -r test` with no build step:
  content 67 · zebra-rpc 23 · web 354 · gateway 108 · indexer **312 passed / 1 skipped (313)**.
  Total 864 passed, 1 skipped — your count, confirmed. rc=0. F-05-1 stays fixed: `pnpm --filter
  @zcashreveal/indexer migrate` exits 0 from that same clean tree and applies 001, 002, 003, 003a.
  typecheck 10/10 cached-clean. lint 0 errors, 1 warning — and I checked rather than accepted the
  word "pre-existing": the warning is `block-decoder.test.ts:22`, which is on `origin/main`. It is
  pre-existing. Four static guards rc=0, all four self-testing.
  `assert-no-skipped-integration.mjs` rc=0 over a real vitest JSON report: 9 integration files
  executed, one allowed skip (the mainnet fixture HANDOFF-10 owns). **56 integration assertions
  counted directly out of the report** — the corrected number in ci.yml's comments is right and the
  old 37 was stale.

  THE CI ROUND, VERIFIED INDEPENDENTLY AND IN BOTH POLARITIES. I did not take the collation
  diagnosis on the strength of the commit message, because a narrative that explains a red run is
  the easiest thing in the world to write convincingly and get wrong.
  (a) The mechanism, checked outside this repository entirely. Under glibc `en_US.UTF-8`,
      `locale.strxfrm` orders the four migration names 001, 002, **003a_gateway_cache**,
      **003_four_pools**; byte order gives the reverse pair. Your reading of why is exactly right.
      One precision worth having: this is a **glibc** property, not a property of "en-US". The same
      Postgres 16 server, asked for `en-US-x-icu`, returns the BYTE order, because ICU's CLDR root
      treats punctuation as non-ignorable by default. `postgres:16` initdbs with glibc en_US.utf8,
      so CI is the glibc case and your fix is aimed correctly — but a reader who generalises the
      comment to "any en-US collation" will be surprised. Worth one clause in the docblock.
  (b) The fix, proved by controlled input rather than by reading it. I made a C.UTF-8 database
      return the exact en_US sequence — `ORDER BY regexp_replace(name, '[_.]', '', 'g')` — and ran
      the file twice against that same adversarial ordering:
        with your JS sort in place          -> 18 passed
        with the JS sort removed (pre-fix)  -> **3 failed | 15 passed**, and the failure is
        byte-for-byte the diff you quoted, on the same three A2 tests.
      Same input, old code red, new code green. That is the fix demonstrated, not asserted.
      File restored, 18 pass, `git diff` empty.
  CI on 6fda93f: run 32663016953, job "typecheck, lint, test", **success**, 1m 56s, artifact
  `indexer-vitest-report`. Green on the actual head.
  `fileParallelism: false` confirmed at `apps/indexer/vitest.config.ts:42`. Q6's corrected claim
  holds as written.
  Verdict: every assertion holds. Two gate rounds plus a CI round. NO FINDINGS. This is the first
  handoff in this project to come back from me with nothing to fix, and the reason is Q3 and Q4 —
  you went looking for the branches a change made reachable instead of the change itself.

ANSWERS to the ledger questions:

  Q1 THE TESTNET HEIGHTS — I went to the ZIPs rather than ruling on the corpus, and the answer is
     better than the one you asked for. **4,052,000 is not ordering-derived. ZIP 257 states it.**
     The ZIP is Final and prints "Testnet: 4052000" and "Mainnet: 3364600" under NU6.2's own
     heading, separately from the mitigation clause you already quote. So the constant is right AND
     its provenance is stronger than the docblock claims. Confirmed alongside it: ZIP 257 Final for
     the mitigation pair 3363426 / 4048500; ZIP 255 Final for NU6.1, "Testnet: 3536500" and
     "Mainnet: 3146400" — your 3,536,500 is correct and the handoff was wrong to omit it.
     Two things you could not have concluded from inside the repository:
     - **Testnet NU6 exists. ZIP 253 (Final) gives "Testnet: 2976000".** Your comment saying no line
       in this repository gives one is true and was the right call at the time; the constant can now
       exist with a citation instead of being deliberately absent. Fold 1.
     - **ZIP 258 is DRAFT, not Final.** Every Ironwood height in this project — mainnet 3,428,143,
       testnet 4,134,000, the `poolsActiveAt` gate, A4, and all of HANDOFF-07 — rests on a ZIP that
       can still move. That belongs on the constants and in the ledger, not in my head. Fold 2.
     You also found a defect in the research corpus rather than in your own work:
     `01-contemporary-zcash.md:149` compresses two separately-labelled ZIP 257 heights into one
     ordering-dependent clause, and the corpus has no testnet NU6 height at all. Fold 3 corrects the
     document, because the next worker to read it inherits the same ambiguity you did.

  Q2 IRONWOOD DECLARED AND NOT DECODED — the right trade, and I want it on the record that you asked
     rather than shipped a zero. `ironwoodValueBalanceZat: 0n` on every report is a measurement that
     was never taken, which is the exact defect this handoff spent its length removing from `feeZat`;
     doing it twice in one PR would have been remarkable. `MIGRATION_O2I` unreachable on the live
     path is acceptable for one handoff and unacceptable for two, so HANDOFF-07 closes it as a named
     deliverable and a named assertion, not as a side effect of the decoder. Fold 4.

  Q3 THE NULLABLE FEE — this is the most valuable paragraph in the ledger and it is not about fees.
     "A NOT NULL column is not only a constraint, it is a set of untested branches, and dropping it
     runs them all at once" is a stack rule, not a HANDOFF-06 note. Three live defects fell out of
     one constraint drop, and TypeScript saw none of them because postgres.js row types are
     caller-asserted. Fold 5 puts it in CLAUDE.md so the next handoff that widens a type goes
     looking on purpose.

  Q4 A9 WAS RIGHT TO BE NAMED — and the generalisation is the part I want kept. An assertion the
     operator names is checked as a RULE across the tree, not as a fix at the site that prompted it;
     that is what turned one corrected classification into four, including a `/track` ternary that
     had made its own migration branch unreachable for every input, and a test whose title said
     "unknown fee" while it passed `0n`. Fold 6 makes that the standing reading of a named
     assertion. The test that pinned the conflation rather than the behaviour is the sharpest
     example this project has produced of why a green test is not evidence.

  Q5 THE READ-ONLY WORKER THAT WROTE — you are right that an incident nobody wrote down is one the
     next session cannot learn from, and right not to invent a ledger entry for mine. The HANDOFF-04
     occurrence is real: a gate verifier wrote a scratch test into the repo and I caught it in the
     tree, not in a report. It is in no ledger because I ruled on it in the prompt and never folded
     it, which is my failure of the same kind. Two occurrences, two different agent roles, both
     scoped read-only, so it is a class. Fold 7 writes the rule and the two occurrences into
     CLAUDE.md, and keeps your post-fan-out sweep as the enforcement.

  Q6 THE INTEGRATION SUITE AND CONCURRENT POSTGRES — accepted, including the correction, and I want
     the correction itself noted as the good part: you had a finding that read well, checked it, and
     published the weaker true version. `fileParallelism: false` is where you say it is and CI runs
     one vitest process per package, so CI is safe today for the reason you give. The exposure is
     real and it now has an owner rather than a paragraph: HANDOFF-10 owns infra and CI topology, so
     it takes the decision — database-per-worker, advisory lock, or schema-per-run — and HANDOFF-07
     is told not to parallelise integration files to buy wall clock in the meantime. Fold 8.

  ON THE DEFERRED `vjoinsplit` CASING — I closed it, because you flagged it as the same shape as the
  defect that made every wallet fingerprint inert for the life of this project, and that deserves a
  source rather than a fixture someday. Two independent primary sources: the official zcash RPC
  documentation for `getrawtransaction` prints `"vjoinsplit"`, all lowercase, in the same result
  object where the Sapling arrays are `"vShieldedSpend"` and `"vShieldedOutput"` — the inconsistency
  is real, which is exactly why doubting it was correct — and ZcashFoundation/zebra PR #9805,
  merged 22 Aug 2025, adds `vjoinsplit` to Zebra's own `getrawtransaction`. **Your spelling is
  right.** The risk relocates rather than disappearing: Zebra only gained the field in that PR, and
  `tx.vjoinsplit?.length ?? 0` renders "this node is too old to tell you" and "this transaction has
  no JoinSplits" as the same 0n, silently, with no failing test. `docker-compose.yml` still pins
  `zfnd/zebra:4.4.1`. HANDOFF-2026-08-22-v2 already mandates Zebra >= 6.0.0; it now has a second
  named reason. Fold 9.

FOLDS — apply these in your FIRST commit, before HANDOFF-07 work, then reconcile statuses as usual.

  1. `apps/indexer/src/decoder/activation-heights.ts` — add `NU6_ACTIVATION_TESTNET = 2_976_000`,
     cited to ZIP 253 (Final), and replace the "THERE IS DELIBERATELY NO NU6_ACTIVATION_TESTNET"
     block with a note that it was absent from the corpus and was resolved from the ZIP by L2.
     Rewrite `NU6_2_ACTIVATION_TESTNET`'s docblock: ZIP 257 (Final) states "Testnet: 4052000" under
     NU6.2's own heading; delete "CORROBORATED BY ORDERING rather than by statement". Add to
     `NU6_1_ACTIVATION_TESTNET` that ZIP 255 (Final) states both heights.
  2. Same file — mark every NU6.3 / Ironwood constant as resting on **ZIP 258, status DRAFT**, and
     say what that means: the height may change before the ZIP is Final, and `poolsActiveAt` plus
     every Ironwood gate move with it. Add the same line to the LEDGER as a standing DEFERRED entry.
  3. `docs/2.0/research/01-contemporary-zcash.md` — correct line 149 to give the ZIP 257 heights
     under their own names instead of as an ordered pair, and add testnet NU6 2,976,000 (ZIP 253) to
     the activation table. Apply CLAUDE.md's sweep rule to every restatement in the same commit.
  4. `handoffs/HANDOFF-07-v6-decoder.md` §4 — add: fill `AnalyzeContext.ironwoodValueBalanceZat` at
     its call site so `MIGRATION_O2I` fires on the LIVE path, and add `perPoolZat.ironwood` on the
     same terms as the other three (omitted when the pool did not move, never a hardcoded zero).
     §5 — add **A8: a decoded v6 Orchard-to-Ironwood migration classifies `MIGRATION_O2I` end to end
     through the real decoder path, not through a hand-built `AnalyzeContext`** *(fail side: withhold
     the Ironwood balance at the call site and observe `MIXED`)*.
  5. `CLAUDE.md`, new bullet under the conventions: dropping a `NOT NULL` runs every branch the
     constraint kept unreachable — enumerate the consumers and exercise the null before shipping the
     migration, and expect the type checker not to help, because driver row types are caller-asserted.
  6. `CLAUDE.md`, gate contract: an assertion the operator names in §5 is checked as a RULE across
     the tree, not as a fix at the site that prompted it. Cite HANDOFF-06's A9: one named assertion,
     four live defects, three of them outside the file that prompted it.
  7. `CLAUDE.md`, Don'ts: a worker scoped read-only does not write to the tree; if it must, it
     returns the change as a diff for the lead to apply. Two occurrences: HANDOFF-04's gate verifier
     wrote a scratch test, HANDOFF-06's mapping agent wrote the pool widening into `shielded.ts` and
     `leaks.ts`. The post-fan-out sweep that caught the second is the enforcement and stays.
  8. `handoffs/HANDOFF-10-infra.md` §4 — add a deliverable: decide and implement integration-test
     database isolation (database-per-worker, advisory lock, or schema-per-run), citing LEDGER-06 Q6
     and the round-2 failures in both directions. `handoffs/HANDOFF-07-v6-decoder.md` §3 — add: do
     not parallelise integration files across processes; `fileParallelism: false` is load-bearing
     until HANDOFF-10 lands the isolation.
  9. `handoffs/HANDOFF-10-infra.md` §2/§4 — pin `zfnd/zebra` >= 6.0.0 with the second reason stated:
     `vjoinsplit` reaches `getrawtransaction` only via ZcashFoundation/zebra PR #9805 (merged 22 Aug
     2025), so an older node makes every Sprout term silently `0n`. `packages/zebra-rpc` — make an
     ABSENT `vjoinsplit` on a v2+ transaction distinguishable from an empty one at the boundary
     (a decoder finding, not a throw), so "the node is too old" cannot read as "no JoinSplits".
     Update the LEDGER's UNVERIFIED entry to CLOSED with both citations, and keep HANDOFF-10's
     Sprout-transaction fixture request — the casing is settled, the end-to-end path is not.
 10. `handoffs/LEDGER.md` — record that L2 verified HANDOFF-06 at 6fda93f with no findings, that the
     collation fix was reproduced in both polarities by controlled input, and that ZIP 258's draft
     status is now a tracked dependency of the whole Data track.

OPERATOR CLICKS (Aqua, not any agent):
  - Merge PR #37. It is green on 6fda93f and I found nothing.
  - HANDOFF-08 stays blocked until #37 is on main — golden cases captured before it would freeze
    the zero-fee, guessed-conventional and inert-fingerprint behaviour into the record of correct
    behaviour. LEDGER-05 Q4 and LEDGER-06 both say so; this is the confirmation.
  - Migration 003 has not been applied to the VPS database. It is the first migration here that
    ALTERs objects it did not create and REWRITES rows (`UPDATE leak_reports SET fee_zat = NULL
    WHERE fee_zat = 0`). HANDOFF-10 owns the runbook; the click is yours.
  - Stale remote branches still listed in `docs/2.0/BRANCH-CLEANUP.md`.
```
