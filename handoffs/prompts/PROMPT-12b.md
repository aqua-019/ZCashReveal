# PROMPT-12b — the messages that steered the second HANDOFF-12 session

Archived verbatim under Revolution protocol step 5. One file per handoff is the rule; this
is the second SESSION on HANDOFF-12 - PR #50 merged the handoff PARTIAL, so it returned to
`open` (F-50-4) and was picked up again - and L2's own commit `09b034d` on `main` names this
prompt PROMPT-12b, so it is filed under that name beside `PROMPT-12.md` rather than appended
to it. Each message under a heading naming what it is and when it arrived.

## Message 1 — the session kickoff, with the L2 RESOLUTION for HANDOFF-12 (PR #50) embedded (1 Sep 2026, session start)

Arrived as the opening user turn. It carries the kickoff line, the F-50-4 instruction that
overrides Revolution protocol step 1 for this handoff, the `L2 RESOLUTION — HANDOFF-12, PR #50`
block that step 2 requires appended to `handoffs/LEDGER.md`, its five folds, and the weighting
for §4. Reproduced in full.

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Report spawn mode first. Stop at PR opened. Fork from `main` at `4a77951` (PR #50 merged).
READ THIS BEFORE YOUR RECONCILE COMMIT. THE PROTOCOL'S OWN STEP 1 WILL DESTROY THIS HANDOFF IF YOU FOLLOW IT LITERALLY.
CLAUDE.md step 1 says: "Set every handoff whose PR is merged into main to `status: closed`." HANDOFF-12's PR is merged — and a third of HANDOFF-12 was never built. PR #50 delivered deliverable 0 and folds 1–10; §4 deliverables 1, 2 and 3 are NOT STARTED, which its own §7 states as `STATUS: PARTIAL`.
So: `handoffs/HANDOFF-12-runtime-poolstate.md` goes to `status: open`, NOT `closed`, and it is the handoff you execute. Record the exception and its reason in your reconcile commit message. Right now the file reads `status: shipped`, which is the state step 4 leaves it in and which the routing rule in CLAUDE.md line 6 does not match — so a session following the standing kickoff line ("execute the lowest-numbered `status: open` handoff") skips 12 and goes to 13, and §4 is silently orphaned. This is filed as F-50-4 below; you are the session that closes it.
Two consequences to get right in the same commit: the Integration track (11–12) must have exactly one open handoff and it is 12; and `handoffs/README.md`'s table must say the same thing the front matter says. The table already carries the honest prose — ``shipped` (PR #50 opened, draft; §4 deliverables 1-3 not delivered)` — which is a human-readable caveat sitting beside a machine-readable field that contradicts it. That is this project's most-recorded defect shape and it is currently live in its own index.
DO NOT REDO DELIVERABLE 0. §5 is already reconciled against the tree and all five assertions carry exclusion sets and named fail-side members. That work is landed and correct. Your handoff is §4 and the folds below.
NOTHING IS ATTACHED TO THIS PROMPT. Fold 2 needs two blocks and you fetch them yourself — the values to verify them against are in fold 2, so you never have to trust this document about their contents.
L2 RESOLUTION — HANDOFF-12, PR #50 (Cowork, 1 Sep 2026)
Append verbatim to `handoffs/LEDGER.md` beneath the HANDOFF-12 block, under Revolution protocol step 2. This is the resolution in full — nothing is attached and nothing is withheld.
VERDICT: MERGE (applied — #50 is merged at `4a77951`).
Verified independently on a clean worktree of `695ce81` with Postgres and Redis up: 1418 passed / 3 skipped / 1421 total, `TEST_RC=0 CHECK_RC=0 TYPECHECK_RC=0 LINT_RC=0 BUILD_RC=0`, sixteen guards. The skip count is the headline — #49 was 1409/4/1413, and 1413 + 8 = 1421, 4 − 1 = 3: the mainnet-fixture test now RUNS. Both new guards were driven by data mutation rather than read: the compose guard fires on `6.2.9`, `:latest`, a digest pin and a tagless ref; the capture guard on an altered txid and a wrong `nTx`.
This session found more in L2's work than L2 found in its. Recorded as F-50-1 (three defects in L2's Appendix A, all found by executing it — a self-test covering two of seven arms, a `merkleRoot([])` crash that is a fourth outcome the header denied, and a circular self-test that stayed green under two broken conventions), F-50-2 (two of L2's five polarity transcripts do not reproduce — the F-49-2 shape, committed in the document that filed it), and F-50-3 (F-49-1 named two CI edits and a third, the step ordering, was necessary). The pattern across all three: every defect was in the part of L2's work L2 was most confident about.
The five §8 rulings, in short. Q1 — remove the links publish; checked first that `persistLeakReport` and the report's own `links` field are separate egresses, so the channel is redundant rather than load-bearing. Q2 — do not commit the two 549 KB / 305 KB predecessors; a conforming block whose predecessor is small costs 143 KB instead of 854 KB, and fold 2 below names that pair with the values to verify it. Q3 — leave `SNAPSHOT_TTL_MS` at 60,000: the Q4 decision rested on the cold figure, which assumes no memo and is unaffected. Q4 — keep the six-onto-five conservation as a test, not a guard, and point `schemas.ts` at it by name. Q5 — zero gate rounds stated plainly is accepted and is more useful than a green round would have been; the operator item is that a verifier died on the account's weekly usage limit.
FOLDS — apply in a `docs(handoffs)` or `chore` commit before §4, and record each
0. F-50-4, THE STATUS FIELD. As above: HANDOFF-12 to `status: open`, the README table rewritten to agree, the exception noted in the reconcile commit message. And add one sentence to CLAUDE.md's step 1, because the rule as written is wrong in a way that will recur: a merged PR closes a handoff only when its §7 STATUS is DONE; a handoff whose PR merged PARTIAL returns to `open`. Without that sentence the next partial merge loses its remainder the same way.
1. Q1 — remove the `zcashreveal:links` publish at `apps/indexer/src/index.ts:146` and its guarded block. Confirm the egress ordering at the edit site rather than taking L2's line for it — L2 read two call sites, not the whole path. The grep must then agree in both apps, which is what A5 asks for. Record the decision and its reason in §8, including the counter-case: link records having no path to the SITE is a real product question and does not become a wiring question by being answered with a channel nobody reads.
2. Q2 — THE CONSECUTIVE PAIR, WHICH YOU CAPTURE YOURSELF. The delta arm of `check-capture-consistency.mjs` reports NOT RUN for both committed captures because they are 9,825 blocks apart and neither has its predecessor. A consecutive pair closes it for 143 KB instead of the 854 KB §8 Q2 proposed.
Fetch both, at verbosity 2, from the endpoint the fixtures README records — `https://zcash-mainnet-zebrad.gateway.tatum.io/`, keyless, hard-limited to 5 requests per minute across all its hostnames, so pace at ≥13 s or you get 429s:

```
{"jsonrpc":"1.0","id":"capture","method":"getblock","params":["3444837",2]}

```

Strip the JSON-RPC envelope to the inner `result` (README capture procedure), write to `apps/indexer/test/fixtures/blocks/`, and write the bytes straight to disk — never through your context, where a large block can silently truncate.
VERIFY WHAT YOU FETCHED AGAINST THESE, which L2 measured; they are consensus facts, so any correct node reproduces them and a mismatch means you did not get what L2 got:

```
height 3444836  nTx 2   compact 8,301 bytes
  hash        00000000001e5057e71a7656ac40e3117c6944e770f71144fbdd23c8aa4ac8b1
  merkleroot  17629a315e66a8380362110bbc19bbdd603d00ddd6a264f9b2d10f7b2f6b02ee
  trees       sapling 73944723  orchard 50363095  ironwood 48467

height 3444837  nTx 6   compact 130,085 bytes   CONFORMS on every §2 blocking criterion, carries a crossing
  hash        0000000000274151cfae6e6d498f95afe06c8a5b5ee3b4540a0888f4bbbcbcfb
  merkleroot  19228028d1f79944817b22b3186ecabd3fb435071e5630be4ead7c61715e575c
  trees       sapling 73944725  orchard 50363097  ironwood 48470
  previousblockhash == 3444836's hash

expected deltas 3444836 -> 3444837:  sapling +2  orchard +2  ironwood +3

```

Then run the merged guard over the fixtures directory. L2 measured `"2 capture(s) ... 3 note-commitment tree delta(s) checked"`, rc=0 on this pair alone — the delta arm runs. With all four captures present expect 3 deltas checked and two NOT RUN lines, for 3,432,130 and 3,441,955.
IF THE ENDPOINT IS UNREACHABLE FROM YOUR ENVIRONMENT, RECORD FOLD 2 AS DEFERRED IN §8 WITH THAT REASON AND MOVE ON. Do not reconstruct a block from the values above — they are a checksum, not a source, and a fabricated capture filed where the suite treats it as ground truth is worse than the NOT RUN the guard honestly reports today.
Add a sentence to the fixtures README saying what a predecessor capture is for and that §2 does not govern it: §2 is selection guidance for choosing a fixture worth having, not a validity rule every file in the directory must satisfy, and nothing enforces it. Otherwise the next reader takes a 2-tx block as a §2 failure that slipped through.
AND FIX THE NAMING RULE WHILE YOU ARE IN THAT README — it is no longer cosmetic. L2 filed the degenerate short-hash as a documentation nit (`first 6 hex characters of block.hash` yields `000000` for every modern mainnet block, because difficulty puts ten-plus leading zeros on every hash). It has since caused a real operator error: four captures whose filenames differ only in the height digits were mistaken for each other, and a decision was nearly taken on the wrong pair. Change the rule to the first 6 characters AFTER the leading zeros, rename the existing captures to match, and say in the README why the old rule failed. L2 measured the four names that rule produces, and they are distinct:

```
mainnet-3432130-9eb351.json    mainnet-3441955-54b709.json
mainnet-3444836-1e5057.json    mainnet-3444837-274151.json

```

`git mv` the two committed captures; the decoder globs `^mainnet-.*\.json$` so no test changes, and `check-capture-consistency.mjs` keys on the height inside each file rather than on the filename — confirm that second claim before you rely on it.
3. THE STAGING COPIES ARE STILL THERE AND ARE NOW A SECOND SOURCE OF TRUTH. `docs/2.0/capture/mainnet-3432130-000000.json` and `mainnet-3441955-000000.json` survive on `main` beside the copies in the fixtures directory — PR #50 copied rather than moved. Nothing reads the staging pair and no test would notice the two diverging, which is the "two renderings of one quantity that do not share a source" shape this project made a §5 assertion out of. Delete the staging copies once the new pair has landed in the fixtures directory, and delete `docs/2.0/capture/` with them.
4. Q4 — one sentence in `packages/zebra-rpc/src/schemas.ts`'s existing six-onto-five note, pointing at `value-pools-conservation.test.ts` by name, so the next person to write a conservation check over `LedgerLane`'s five lanes meets the counter-example before they write it rather than after.
§4 — THE REMAINING HANDOFF
Deliverables 1, 2 and 3 under §1–§6, against the §5 that PR #50 reconciled. Nothing below replaces §4; it is what L2 wants weighted.
A3'S SEAM IS A BLOCKING ITEM AND IT IS THE BEST THING ON PR #50. `ClaimAssessment` carries `rawCount`, `effectiveSetSize`, `countIn` and `countOut` as bigints with no `Zat` suffix; `reviveWireZatoshi` keys on `/Zat$/`; and `SpendAnnotation.assessment` and `LinkRecord.assessment` are already optional fields of a `LeakReport`. L2 reproduced it independently: the round trip breaks on 4 of 5 fields, string in and string out, while the declared type says `bigint` on every one and the `as T` cast means the compiler never objects. `analysis.ts` declares 37 bigint fields of which 15 are Zat-suffixed, so the exposure is a family and not a field.
This is a hole in something L2 approved. The HANDOFF-11 resolution accepted `reviveWireZatoshi` with "a convention that is asserted rather than trusted is a schema by other means." That holds only if the assertion covers the convention's DOMAIN. The round trip covers five `LeakReport` shapes, none of which populates an assessment, while the convention claims every zatoshi in a `LeakReport` and everything it contains. A round trip over the shapes that exist cannot detect a violation in a field no shape populates — it is a sample, and L2 described it as a proof. The defect is LATENT AND SHIPPED, not future: a `LeakReport` with a populated assessment is type-legal on `main` today and nothing constructs one yet.
Fix the convention's checkability, not the four field names. Renaming them to `*Zat` would be WRONG — they are counts, not zatoshi, and the suffix means zatoshi. A3 is not complete until the round trip is symmetric over a report that carries an assessment.
Three more things §7 of PR #50 established that you should not re-derive:

* A2's test must not live in the Postgres gate. `replayInto`'s only callers are two Postgres-gated integration files, so a spy-order test placed there passes vacuously on a runner without a database.
* `UNKNOWN_ANCHOR` exists nowhere but A3's own sentence, and the handoff does not say whether it is a `FindingCode` union member — which pulls in `check-audit-consumers.mjs` — or a log string. That choice decides whether A3's fail side is observable in the report at all, which is what "both polarities tested" turns on. Decide it before writing the test and record the decision.
* `h_split` is this document's vocabulary, not an identifier. It appears nowhere in source. §5 now carries the named worked case the property-test rule requires; use it.

One extrapolation, stated rather than hidden. PR #50 ran zero gate rounds and said so. L2 agrees with its own extrapolation: a first real round over that branch would probably find one or two more defects of the reach its NOTICED list shows, and `check-capture-consistency.mjs` and `check-compose-zebra-tag.mjs` are both new surface that L2 drove but did not review line by line. If your gate finds something in either script, that is the round doing its job and not a regression you caused — file it as a finding against PR #50 rather than fixing it silently.

## Mid-session messages, verbatim (Revolution protocol step 5)

Four arrived after the kickoff. None changed the scope; they are archived because
the rule is every message that steered the session, not every message that
redirected it.

**1 - after the context window rolled, 2 Sep 2026 (the session was mid-commit E, the
live-path assessments):**

```
Continue from where you left off.
```

**2 - during the runtime build:**

```
continue
```

**3 - after the four gate reviewers were dispatched and two had returned:**

```
resume
```

**4 - a scheduled check-in this session armed for itself, fired 02:57 UTC, delivered as
a user turn (it is the session's own text, archived because it steered what happened
next - the PR re-read that found the merge):**

```
Scheduled check-in on aqua-019/ZCashReveal#51 (HANDOFF-12, branch claude/handoff-12-reconcile-2becu3). Re-read the PR's current head: merge state, CI check runs on the latest commit, open review threads, and the Claude Approvals check run if the repo runs it. Act on anything actionable per the drive-to-green rules (fix and push, or one standing-down comment naming the blocker). If the write-back (section 7, section 8, LOG row, README table, status shipped) has not landed yet because the four gate reviewers had not returned, check whether they have now and finish it. If nothing changed, re-arm this check-in silently for another hour without messaging the user or commenting on the PR. Stop re-arming once the PR is merged or closed.
```
