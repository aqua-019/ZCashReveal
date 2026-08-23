# PROMPT-06 — the messages that steered the HANDOFF-06 session

Archived under the revolution protocol, step 5: every message that steered this session, verbatim,
under a heading naming what it is and when it arrived. One file per handoff, not one per message.

## 1. Session kickoff — the message that opened the session (23 Aug 2026)

Reproduced byte-for-byte from the uploaded file, including the fenced `L2 RESOLUTION` block that the
protocol's step 2 consumes. The block was appended verbatim to `handoffs/LEDGER.md` beneath the
HANDOFF-05 ledger block and its addendum, and its eight folds were applied in the RECONCILE commit.

```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-06-four-pools.md. It is the Data track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-05 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of bba3775, with a REAL PostgreSQL 16, not relayed):
  pnpm install rc=0 · pnpm build rc=0, 7 packages · migrations 001, 002 and 003a apply through the
  real runner · `pnpm -r test` with DATABASE_URL set: content 67, zebra-rpc 23, web 346, gateway
  95, indexer **178 passed / 1 skipped (179)**. The only skip is the mainnet block fixture that
  HANDOFF-10 owns. Every Postgres-gated test ran.
  ADVERSARIAL CHECKS, three, each by breaking the thing rather than reading it:
  (a) `scripts/check-redis-safety.mjs` rc=0 clean, 20 self-tested detectors. I planted
      `await r.flushdb()` in a new gateway file: rc=1, "FLUSHDB is forbidden against the shared
      store (rule 2)", naming file and line. Removed, rc=0. The guard on the other project's data
      is real.
  (b) Log redaction: the suite is 9 tests and passes. I disabled the redaction itself - replaced
      the body of `redactKeys` with a passthrough - and FOUR tests failed, including both the pass
      state and the path-not-just-query fail state. Restored, 9 pass. The A9 assertion discriminates.
  (c) The A1 coverage gap you found and fixed: I planted the exact defect you described, a 10x
      error in `views/units.ts` (100_000_000n to 1_000_000_000n). FIVE tests failed. Restored, 95
      pass. The gap is closed, and closed against the specific mutation that used to slip through.
  The `expiryheight` work is the best thing in this PR. `rpc-casing.test.ts` does not merely assert
  the field maps: it names which wallet tells were dead and are now reachable - YWALLET and
  ZECWALLET_LITE go from `UNKNOWN_NONSTANDARD` to their real values once `expiryDelta` is non-null -
  and it is honest that NIGHTHAWK and ZCASHD_RUST stay unreachable for a different missing input.
  That is exactly the "if none change, that is itself a finding" case, answered with evidence.
  Verdict: every assertion holds. Three gate rounds. ONE FINDING, below.

FINDING F-05-1 (Executed) - `pnpm --filter @zcashreveal/indexer migrate` fails on a clean checkout.
  On a fresh worktree, after `pnpm install` and before any build, the documented migrate command
  dies: "Cannot find module '.../packages/zec-types/dist/index.js' imported from
  apps/indexer/src/config.ts". `pnpm build` first, then it applies 001, 002 and 003a cleanly.
  This is F-02-1's shape in a place fold 1 did not reach: turbo's `test: dependsOn ^build` fixed the
  test task, and `migrate` is not a turbo task. It does not affect CI, whose order is Install, Build,
  then migrate. It DOES affect the operator, because HANDOFF-10's runbook will tell a human to run
  migrations on a VPS from a fresh clone, and this is the command they will run. Fold 1 fixes it.

ANSWERS to the ledger questions:
  Q1 THE API PREFIX — `/v2` survives, `/api` is deleted. Your reasoning is right and I will add the
     part that settles it: `/api` is not a version, it is a category, and the moment a v3 exists the
     name lies. Mounting both to avoid a cutover break was the correct call for one handoff and is
     the wrong state to keep. Fold 2 deletes `/api` in HANDOFF-11 and makes the redirect explicit.
  Q2 `/api/pools` ANSWERING 503 — keep the refusal, and I want the reasoning recorded because it is
     the site's own thesis applied to itself. A page that serves four empty blocks is claiming to
     have looked and found nothing; a 503 naming each missing block and the handoff that owns it is
     the truth. Serving the real half separately at `/pools/balances` is right. Fold 3 puts the 503
     and its body shape into HANDOFF-11's cutover checklist so it is expected rather than triaged.
  Q3 ZIP 317 — CORRECT THE DOCUMENT. The gateway is right to follow the protocol, and you were
     right not to edit another track's specification silently. `TRACKING-MATH.md` §3.5 gets the
     exact rule, `max(ceil(inSize/150), ceil(outSize/34))`, with the count form kept beside it and
     labelled as the P2PKH-only simplification it is. This is not pedantry: the lockbox is a 2-of-3
     P2SH multisig, the divergence lands exactly there, and "the lockbox did not pay the conventional
     fee" is a false statement about the one address this project exists to track. Fold 4.
  Q4 THE FEE IS NOT ON THE WIRE — accepted, and this is now a blocker on HANDOFF-08, not a note.
     A fee is a property of the inputs a transaction spends, so it must be computed by summing the
     spent outputs, which is the indexer's job and not the boundary's. Two wallet signatures and
     every `isZip317Conventional` call are blind until it exists. Fold 5 makes fee computation an
     explicit HANDOFF-06 deliverable and makes HANDOFF-08's golden cases depend on it, for the same
     reason the fingerprint fix had to precede them: a baseline captured over an analyser that
     cannot see fees freezes the blindness into the record of correct behaviour.
  Q5 THE GATE THAT CAPPED VERIFICATION SILENTLY — you are right, and this becomes a rule. Reading
     the 19 unverified findings rather than shipping the 7 confirmed ones is the single best
     judgement call in this revolution: two were live and one was a DTO field carrying different
     quantities under a label describing only one. Fold 6 writes it into CLAUDE.md: a gate states
     its verification budget in its first line, unverified findings are reported as WORK and not as
     a footnote, and a round that ends with unread findings is not a round that converged.
  Q6 THE QUARANTINE COUNT — thank you for measuring it from the prerendered HTML instead of
     repeating my number. Ten anchor, twenty-two do not; my 24 and the four/four split were both
     wrong and the correction belongs where you put it. The page for the 22 stays owed.

FOLDS (apply in the RECONCILE commit):
  1. HANDOFF-06 §4 - make `pnpm --filter @zcashreveal/indexer migrate` work on a clean checkout
     (a `premigrate`, or route it through turbo with `dependsOn: ["^build"]`). §5 assertion: on a
     tree with `packages/*/dist` deleted, `pnpm install && pnpm --filter @zcashreveal/indexer
     migrate` exits 0 *(fail side: revert, same command, observe the resolve error)*. F-05-1.
  2. HANDOFF-11 §4 - delete the `/api` prefix; `/v2` is the API. Any remaining `/api` path answers
     410 with a body naming `/v2`, rather than 404 (LEDGER-05 Q1).
  3. HANDOFF-11 §2 - the cutover checklist expects `/v2/pools` to answer 503 with a body naming the
     four missing blocks until 06, 07, 08 and 09 have landed, and expects `/v2/pools/balances` to
     answer 200 throughout. A 503 there is the design, not an incident (LEDGER-05 Q2).
  4. HANDOFF-06 §4 - correct `docs/2.0/TRACKING-MATH.md` §3.5 and the `/method` component that
     renders it: state ZIP 317's exact transparent term `max(ceil(inSize/150), ceil(outSize/34))`,
     cite Zebra `zebra-chain/src/transaction/unmined/zip317.rs:160-173`, and keep the count form
     beside it labelled as the P2PKH-only simplification. Add the worked lockbox case, two 2-of-3
     P2SH inputs giving L=4 and 20,000 zatoshi against the count form's L=2 and 10,000 (LEDGER-05 Q3).
  5. HANDOFF-06 §4 - add a deliverable: compute the transaction fee by summing the outputs a
     transaction spends, and carry it on the analysis path so `feeZat` is real rather than `0n`.
     §8 must record that HANDOFF-08's golden cases depend on this AND on the `expiryheight` fix
     being merged, and may not be captured before both (LEDGER-05 Q4).
  6. CLAUDE.md, revolution protocol - add to the gate: a gate states its verification budget in the
     FIRST line of its return. Findings it did not verify are reported as work, listed with the
     others, never as a trailing log line. A round that ends with unread findings has not converged,
     and the lead reads them before deciding whether to ship (LEDGER-05 Q5).
  7. CLAUDE.md, revolution protocol - add: a fail-side probe that does not fail is itself a finding
     and is reported as one. Two-polarity evidence is worthless when the negative case does not
     discriminate; repairing it quietly hides that the positive result was never evidence. This has
     now happened twice, in HANDOFF-04 (a reused Playwright server) and HANDOFF-05 (the zatoshi
     conversion), and both times the session caught it. Make it a rule so the third time is caught
     by the rule rather than by luck.
  8. HANDOFF-06 §2 - add to the reading: gates fetch `origin/main` before fanning out. HANDOFF-05's
     round-2 gate reviewed the whole project as its diff because the local base was stale, which is
     most of why it cost 14 agents and 29 minutes (LEDGER-05, noticed).

OPERATOR CLICKS OUTSTANDING: delete the stale remote branches per `docs/2.0/BRANCH-CLEANUP.md`.
The shared Upstash store is connected and its guard script is proven; nothing else is needed there
until the publisher exists at HANDOFF-09.
```

## 2. Mid-session direction - the post-fan-out sweep and assertion A9 (23 Aug 2026, arrived while gate round 1 was running, before the PR was opened)

Both items were applied in commit `b7658d2`: the sweep rule went into CLAUDE.md's revolution
protocol and its results are reported in §7; A9 went into the handoff's §5 with its own test
block and a fail-side transcript. The gate then found the A9 rule broken in three more places
than the one it had been raised against, which is recorded in LEDGER-06 Q4.

```
Two additions before the PR opens, both small.

1. A READ-ONLY WORKER WROTE TO THE TREE, AND THIS IS THE SECOND OCCURRENCE. You caught your mapping agent writing despite a read-only scope and reverted it, which was right. HANDOFF-04's log records the same class: "a gate verifier has written a scratch test into the repo." Two handoffs, two different workflows, caught both times by the lead noticing rather than by a check. Record it in §8 as a repeat, citing both, and add a rule to CLAUDE.md's revolution protocol: after ANY workflow or subagent fan-out returns, the lead runs `git status --porcelain` before its next commit and reverts every path it did not intend to change; a file a worker wrote is never carried into a commit on the assumption it is harmless. If a stray write turns out to be a good idea, it is re-made deliberately by the lead, as you did here. A §5 assertion is not needed - the rule is procedural - but the §7 report should state that the check was run after each fan-out and what it returned.

2. THE Z_TO_T MISCLASSIFICATION DESERVES A NAMED ASSERTION, NOT JUST A FIX. "A real migration is affirmatively classified Z_TO_T - value went transparent - when nothing transparent received it" is not an ordinary bug: it is the site publishing a false statement about shielded value leaving the pool, which is the exact claim class the whole project exists to make carefully. Give it its own §5 entry with both polarities: a migration with no transparent output classifies as MIGRATION_O2I and never as any transparent-naming class, and a transaction that genuinely pays a transparent output still classifies Z_TO_T. Fail side: revert the requirement that a transparent-naming class needs a transparent recipient and watch the migration fixture flip. Name it in §7 rather than folding it into a gate-round list, so a later reader can find the one assertion that protects the site's central claim.
```
