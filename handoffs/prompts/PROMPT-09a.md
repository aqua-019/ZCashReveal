# PROMPT-09a — the messages that steered the HANDOFF-09a session

Archived under the revolution protocol, step 5: every message that steered this session,
verbatim, under a heading naming what it is and when it arrived. One file per handoff, not one
per message.

---

## 1. Session kickoff — HANDOFF-09a, with the L2 RESOLUTION for HANDOFF-09 / PR #44 (31 Aug 2026, uploaded as PROMPT09a.md)

The kickoff line, followed by an `L2 RESOLUTION` block carrying L2's verification of PR #44, the
rulings for LEDGER-09's four questions, and six folds. This is the first kickoff in the project's
history that asks the session to WRITE its own handoff before executing it: LEDGER-09 Q4 asked who
moves the estimators and when, L2 ruled "its own handoff, and it goes BEFORE HANDOFF-11", and the
§1 SCOPE for that handoff is inside the resolution block rather than in a file. Reproduced
verbatim, including the fenced block.

````markdown
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff is NEW and is written below as HANDOFF-09a — the estimator package move that LEDGER-09 Q4 asks about. Write it into `handoffs/HANDOFF-09a-estimator-package.md` from §1 SCOPE here, set the index and LOG accordingly, then execute it. Report spawn mode first. Stop at PR opened. HANDOFF-11 does NOT start until this lands — see Q4.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-09, PR #44 (Cowork, 30 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of **94ea20b**, with a REAL PostgreSQL 16 AND a REAL
local Redis — not relayed):
  I installed and started `redis-server` on 6379 before running anything, because A7's integration
  half depends on it and a self-skipping green suite is the failure mode I walked into myself two
  revolutions ago. Clean tree, no `dist`, no build step:
    content 67 · zebra-rpc 50 · web 368 · gateway 143 · publisher 56 (+1) · indexer 520 (+1)
    **1204 passed, 2 skipped**, rc=0
  Eleven guards rc=0. typecheck 10/10. lint 0/0. PR correctly still a DRAFT.
  A7's integration half RAN, and the design deserves saying out loud: the skip is itself a test.
  `it.runIf(!reachable)` records the reason and `it.skipIf(!reachable)` is the real one, so a
  missing Redis shows up as a named skipped assertion instead of as silence. With Redis up:
    skipped  A7 SKIPPED, WITH ITS REASON: no local Redis...   (the marker, correctly skipped)
    passed   A7 PASS STATE: latest parses as SnapshotV1, height equals the tip, TTL in (0, 86400]
    passed   A7 FAIL STATE: a closed port - the file sink still writes, the process stays up
  I misread that list on first pass and thought A7 had skipped. Checking which of the two skipped
  is what corrected me, and it is the eighth time this session my first reading was wrong.

  THE CREDENTIAL REDACTION, PROBED AS A FUNCTION rather than through its tests, because this is the
  one finding in the branch with a real-world blast radius — the token it protects is the SHARED
  Upstash credential.
    base64 token with /     rediss://default:AbC/d12+34=@host  ->  rediss://[redacted]@host
    password containing @   rediss://default:p@ssword@host     ->  rediss://[redacted]@host
    two URLs in one line    both redacted, bare address untouched
  Not linear-ish, linear: 10k 0.02ms · 50k 0.07ms · 200k 0.28ms · 500k 0.57ms. Your quadratic form
  measured 16.4 SECONDS at 200k. The ReDoS you caught reviewing your own fix commit was real and
  the greedy rewrite is correct.
  Mutation: password class back to `[^/\s@]*` -> **3 tests fail**, including
  `expected '...' not to contain 'ssword'` receiving `rediss://[redacted]@ssword@host:6379` — the
  half-redacted line that reads as safe. Restored, clean.
  I also checked the tree for an actual leaked secret rather than assuming the finding's title:
  no credentialled URL outside tests. Nothing to rotate.

  A11 mutation: disable the namespace refusal -> "A11 FAIL STATE: a key outside the namespace is
  refused BY THE GUARD before it is sent" fails. The defence that protects another project's
  keyspace discriminates.
  Verdict: every assertion I probed holds. **NO FINDINGS.**

ANSWERS to the ledger questions:

  Q1 THE WALLET BOUND — you are right, take Sigma counts, and AMEND THE DOCUMENT. An upper bound
     that can be BELOW the truth is not an upper bound, and your falsification is airtight:
     two wallets, one 100 ZEC note each at adjacent heights, one run, and the record would publish
     "at most 1 wallet" about a window that held 2. "At most N" where N can be less than the real
     count is a false statement about the chain, which is the one thing this project does not ship.
     Amend `docs/2.0/TRACKING-MATH.md` §3.9 rather than only overriding it in code — the LEDGER-10
     Q5 precedent: a rule that is only corrected at the call site is one the next reader of the
     document re-implements wrongly. Keep the run count, relabelled as you have it, as a SHAPE
     observation; your own INFERRED note that it is order-dependent is the second reason it can
     never be the published bound. Fold 1.

  Q2 THREE COMMANDS OR FIVE — **charge five and raise the ceiling.** I could reach Upstash and you
     could not, and the answer is partial rather than clean, so here is exactly what I have.
     Upstash's pricing page publishes an EXEMPTION LIST: "Operational commands like AUTH, HELLO,
     SELECT, COMMAND, CONFIG, INFO, PING, RESET, and QUIT are not charged." `MULTI` and `EXEC` are
     NOT on it. The docs do not state the transaction case explicitly, so this is evidence rather
     than proof — but it is evidence pointing at five, and a published list of what is free that
     omits your two commands is the strongest signal available short of a bill.
     WHERE I THINK YOUR DISPOSITION HAS THE ASYMMETRY BACKWARDS. You argued charging five "buys
     nothing" and costs "a predictable outage of our own fallback". The first half is right and it
     is the reason to do it: at five you spend about 172,500 of a 500,000 allowance, still a
     minority share, so the true cost of over-charging is nil. The second half misplaces whose
     resource is at risk. The 150,000 ceiling is OURS and it is adjustable; the 500,000 is SHARED
     with a production project that never agreed to run alongside us. A budget calibrated on an
     undercount protects neither: it does not stop us before their meter matters, and it trips our
     fallback for a reason that is not the real one. Raise A12's default to cover the five case
     (200,000 is the round number above 172,500), keep both constants pinned as you have them, and
     charge `WIRE_COMMANDS_PER_TIP`. When the uncertainty is about someone else's quota, take the
     conservative side. Fold 2.

  Q3 GUARDING `owner` FIELDS — do not build the twelfth guard, and you applied my own rule to
     yourself correctly: CLAUDE.md warrants a guard by recurrence across three rounds and this is
     instance one. Recording it so instance two is recognised as a second is exactly right. Fold 3
     keeps that record where the next session will hit it.
     BUT THERE IS A SECOND SHAPE INSIDE Q3 THAT HAS ALREADY REACHED THREE, and it is the one worth
     acting on. The test that failed here asserted `owner.startsWith("HANDOFF-")` — satisfied by
     every wrong answer, and it made `UNASSIGNED`, the honest value, the only failing one. That is
     the same shape as HANDOFF-08's A9 (a property quantified over an aggregate, checked per
     element, unfalsifiable) and HANDOFF-06 Q4's "cannot fire on an unknown fee" test that passed
     `0n`, a KNOWN fee. Three instances, three handoffs: an assertion whose predicate is satisfied
     by every value it was written to exclude. Under the amended stopping rule that is a guard, and
     it is a more general one than a freshness check. Fold 4 asks HANDOFF-13 to specify it rather
     than build it here, because the detector is genuinely hard: it needs to distinguish "loose
     predicate" from "deliberately permissive", which is judgement. Naming the three instances is
     what makes it specifiable at all.

ON YOUR NOT-MATCHED ENTRY, which I want on the record: **fold 3 of LEDGER-10 was rejected by its own
  guard, and the guard was right.** I specified `scripts/redis-keys.mjs` to enumerate keys, and
  `check-redis-safety` flagged it — correctly, because enumeration is what rule 7 forbids. Your
  resolution is better than my specification: a SCAN bounded by `VPS_KEY_PREFIX`, in a non-`.md`
  file that CALLS `assertNotManagedStore` with an array literal, which infers nothing about which
  server a line reaches and so honours LEDGER-10 Q2 rather than quietly breaking it. That the guard
  also rejected your first draft, for holding the MATCH bound in a variable, is the guard being
  right twice against two different authors. My fold was the fourth thing I have specified in three
  revolutions that did not survive execution.

  Q4 WHO MOVES THE ESTIMATORS, AND WHEN — **its own handoff, and it goes BEFORE HANDOFF-11, not
     inside it.** This is the most consequential question in the block and I am ruling against the
     option you proposed, so here is the whole reasoning.
     THE PRECEDENT IS ALREADY SET AND IT IS MINE. LEDGER-05 Q2: `/api/pools` answers 503 naming the
     four blocks it cannot serve, rather than serving four empty ones, because a page that serves
     four empty blocks is claiming to have looked and found nothing. Four null panels on a live
     cutover is that same claim in a different shape. `SnapshotV1`'s null is the honest TYPE and it
     does not make a null PANEL honest on a production page. So HANDOFF-11 cannot ship the cutover
     with them null — which makes the move a PREREQUISITE rather than a sub-task, and a
     prerequisite folded into the handoff it blocks is a prerequisite that gets cut when the gate
     runs long.
     YOUR OWN EVIDENCE SAYS IT IS A DIFFERENT KIND OF WORK. It touches the indexer's imports, both
     Dockerfiles and the workspace layout. HANDOFF-11's scope is wiring and a cutover checklist. A
     handoff carrying both a workspace restructure and a production promotion has two failure modes
     in one gate, and four sessions running have shown that a restructure's fix commit is where the
     next round's findings come from. I would rather that round happen against a small diff.
     AND IT COSTS NOTHING ON THE CRITICAL PATH, which is what settles it. HANDOFF-11's cutover is
     already blocked on operator hardware: the VPS is not provisioned, the runbook has not been
     run, the tunnel does not exist, and migrations 003 and 004 have never been applied. Inserting
     a small handoff ahead of a step that cannot complete anyway delays nothing.
     THE THIRD OPTION, REJECTED EXPLICITLY so nobody re-derives it: ship the cutover with null
     panels and a "not measured" surface. Tempting because the type already models it honestly. No
     — the cutover is the production promotion, and it is the one gate where "the next handoff
     fixes it" becomes "the public site says nothing about four of the things it exists to
     measure".
     You built the seam for this: `Instruments` as the interface and `NO_INSTRUMENTS` as the null
     implementation means the move is mechanically small even though it is structurally wide. That
     is an argument for giving it a clean handoff, not for burying it in one.

     §1 SCOPE for HANDOFF-09a, which you write and then execute:
       Move `turnstile-accounting`, `migration-lens` and `ironwood-birth` out of
       `apps/indexer/src/analysis/` into a new dependency-free workspace package
       (`packages/zec-instruments` unless you have a better name), imported by BOTH `apps/indexer`
       and `apps/publisher`. No `zeromq`, no socket layer, no indexer entry point in its
       dependency graph — that constraint is the whole reason the package exists and it wants a
       guard, not a comment. Compose the real functions into the publisher at its composition root
       so `NO_INSTRUMENTS` stops being what ships.
       OUT OF SCOPE: any change to what the estimators compute. This is a move. A diff that also
       improves one is a diff whose gate cannot tell a move defect from an estimator defect.
       §5 wants at minimum: the four panels are non-null on a published snapshot with a two-polarity
       transcript; `pnpm -r test` unchanged in COUNT as well as colour, because a move that loses a
       test looks identical to a move that passes; and a guard that the new package's dependency
       graph contains neither `zeromq` nor `@zcashreveal/indexer`, self-tested in both directions
       like the other eleven.

FOLDS — apply in your FIRST commit, before HANDOFF-11 work.

  1. `docs/2.0/TRACKING-MATH.md` §3.9 — the published wallet bound is `<= Sigma counts`. The run
     count is a shape observation and is order-dependent; state both, with LEDGER-09 Q1's
     two-wallet falsification beside it as the reason. Sweep every restatement in the same commit.
  2. `apps/publisher` — A12's default ceiling raised to cover five commands per tip (200,000), the
     budget charged at `WIRE_COMMANDS_PER_TIP`, and the docblock recording Upstash's exemption list
     verbatim with the note that the transaction case is evidence rather than proof. `docs/2.0/
     SNAPSHOT.md` §4 gets the same numbers. Keep the operator task: confirm against a real bill.
  3. `handoffs/LEDGER.md` — the `owner`-freshness item recorded as INSTANCE ONE, in the words that
     make a second recognisable.
  4. `handoffs/HANDOFF-13-*.md` — plan-only: a guard for assertions whose predicate is satisfied by
     every value they exclude, citing the three instances (HANDOFF-06 Q4's `0n` fee test,
     HANDOFF-08's A9, HANDOFF-09's `owner.startsWith`). Name the hard part: distinguishing a loose
     predicate from a deliberately permissive one is judgement, so specify before building.
  5. `handoffs/HANDOFF-11-live-wiring.md` — `depends_on` gains 09a; §5 gains the `subversion` floor
     assertion from LEDGER-10 Q1, still unbuilt; and §3 records that the cutover may NOT depend on
     the mainnet fixture (LEDGER-10 Q4) and may NOT ship a null analysis panel (LEDGER-09 Q4).
  6. Carried in §8 rather than restated: LEDGER-08 Q7(a) `EchoMatch` carries no pool; Q7(b) the
     sieve is wired in the same commit that first makes a `LinkRecord` renderable (HANDOFF-12);
     Q4's `CLASSES` derivation; the publisher publishes null panels (your own principal deferred).

OPERATOR CLICKS (Aqua, not any agent):
  - #44 merged. HANDOFF-09 is closed; HANDOFF-09a opens ahead of HANDOFF-11 per Q4.
  - I could not read CI's conclusion on `94ea20b` from here — the checks page has not rendered a
    verdict for me on the last three PRs. Confirm the tick yourself. Locally: 1204 passed / 2
    skipped, eleven guards, typecheck 10/10, lint 0/0.
  - Migrations 003 and 004 still have not been applied to the VPS database.
  - The mainnet fixture capture is five handoffs old and is now a named task in the click list.
````
