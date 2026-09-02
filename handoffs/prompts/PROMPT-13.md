# PROMPT-13 — the messages that steered the HANDOFF-13 session

Archived verbatim under Revolution protocol step 5. One file per handoff, each message under a
heading naming what it is and when it arrived. This first message lands in the same commit as
RECONCILE (LEDGER-02 Q7); anything that arrives mid-session is appended in the next commit.

## Message 1 — the session kickoff, with the L2 RESOLUTION for HANDOFF-12 (PR #52) embedded (2 Sep 2026, session start)

Arrived as the opening user turn, as an attached file (`PROMPT13.md`). It carries the kickoff
line, the PLAN-ONLY restatement, the `L2 RESOLUTION — HANDOFF-12 second session, PR #52` block
that Revolution protocol step 2 requires be appended to `handoffs/LEDGER.md`, DELIVERABLE 0 (the
two guards), and the three weightings L2 wants in the threat model. Reproduced below in full,
from its first line to its last, byte for byte.

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff ALREADY EXISTS: `handoffs/HANDOFF-13-mode-a-wasm.md`, status `open`. You do not write it — you RECONCILE it, apply the L2 RESOLUTION below, and execute it. Report spawn mode first. Stop at PR opened. Fork from `main` at `98e87a0` (PR #52 merged; HANDOFF-12 shipped).

**HANDOFF-13 IS PLAN ONLY AND THE PLAN IS WHERE YOU STOP.** §1 says it twice and it is the whole shape of this handoff: produce a design and risk assessment for client-side viewing-key decryption, and **write no implementation and no key-handling code of any kind.** The operator approves the plan before anything is built. A session that arrives at a plan and then starts building it has not done this handoff faster — it has removed the approval gate this handoff exists to create, on the one surface in this project where a mistake costs a user their privacy rather than a rerun.

Deliverable 0 below is the single exception and it is infrastructure, not Mode A: two guards that have no other home and one live risk each. Land them first, in their own commits, then research.

---

## L2 RESOLUTION — HANDOFF-12 second session, PR #52 (Cowork, 2 Sep 2026)

Append verbatim to `handoffs/LEDGER.md`.

**VERDICT: MERGE — applied, at `98e87a0`.**

Verified on a clean worktree of `d95213c` with Postgres and Redis up throughout: **1503 passed / 3 skipped / 1506 total**, `TEST_RC=0 CHECK_RC=0 TYPECHECK_RC=0 LINT_RC=0 BUILD_RC=0`, zero "no Postgres reachable" lines. Re-checked on merged main: indexer **534 passed / 0 skipped**.

**THE MERGE WAS URGENT AND THE REASON IS ON THE RECORD.** `main`'s second parent was `5a3893b` — PR #51's head at 01:55 UTC — merged at 10:30 while the session was still gating. `c53f2ba` was not an ancestor of main, measured rather than inferred, so six defects including two HIGH were live in production main for the intervening period. L2 verified one independently rather than reading it: in `runtime/confirmed-block.ts` on merged main the first state append was at line 152 and the first treestate call at line 270 — **mutation before fetch**, so the one external call `applyConfirmedBlock` makes, the call its own docblock promised was retryable, was not: a dropped RPC left commitments appended, the retry threw `CommitmentAlreadyExistsError`, and `isFatal` read that as consensus disagreement and stopped the process. `c53f2ba` is now in main.

### F-52-1 — L2's, and it would have destroyed real work

L2's F-51-1 said PR #51 "shipped with no write-back", that the session "stopped one step short", that "the session that held §8 is gone", and that §8 "cannot be reconstructed". **All four were false.** The timeline, measured: head `5a3893b` at 01:55; the operator merged the DRAFT at 10:30; round 1 at 10:33; round 2 at 10:43; the write-back, §7 and §8 both, at 10:45. The session was mid-gate, not finished.

PROMPT-12c, built on that diagnosis, instructed a session to write §8 as a permanent unrecoverable-absence — **it would have overwritten a real §8 carrying nine questions, citing this project's own evidence-versus-fabrication rule as the justification.** It was withdrawn before it was pasted. What L2 did wrong is narrower than the consequence: it enumerated `main` and concluded about the SESSION. Main is where a merge froze; the branch is where the session lived. One command settles it — whether the branch has commits past the merged head. It had three. And a DRAFT PR is by definition a claim that the session is not finished; L2 wrote "PR opened as draft" in its own PR #50 resolution and did not carry that word's meaning forward one document. Same family it has filed against itself all engagement, at its most expensive: **an exhaustive claim made over the wrong object.**

What worked: L2 read §7 BEFORE starting the gate, the rule it adopted one document earlier, and §7's third paragraph is what surfaced the mid-session merge and the live defects. Run the gate first and it would have found a green branch and reported a routine merge.

### F-52-2 — the runtime has not converged, and round 4 is owed

Three rounds ran on that branch and the reach did not decay:

```
round 1   6 defects, 2 HIGH
round 2   2 more, both inside round 1's own fix commit
round 3   4 more, THREE of them introduced by round 1's fix commit
```

Twelve in total, and the session's own words are the finding: *"the reach is not decaying across rounds on this branch, it is following the fix commits."* **Round 3's fix commit `62c4e77` has not itself been reviewed**, and the stopping rule is explicit that a fix commit earns a new round unless it changes only prose. `62c4e77` changes executable lines.

L2's extrapolations were low twice, and both are recorded rather than left standing: on PR #50 L2 predicted a first real round would find "one or two"; it found six. The session predicted a third would find "one or two"; it found four. **The runtime's failure paths are not a surface either of us has been estimating well**, and the common cause is that both estimates came from readers who had run the suite and never fault-injected.

This is NOT HANDOFF-13's to fix. It is recorded so that whoever provisions the VPS knows the confirmed-block runtime carries an unreviewed fix commit, and so the next Integration-track handoff opens with round 4 rather than discovering the debt.

### Rulings on §8, in brief — full text in this file's PR #52 block

Q1 posterior stays off `LinkRecord`. Q2 the anchor backfill is a maintenance item and wants a DETECTOR before a pass. **Q3 the tag guard grows a CEILING — deliverable 0 below.** Q4 link records remain a product question. Q5 do not pause the mempool path. **Q6's config-default guard — deliverable 0 below.** Q7 `migrations_zip318` has a reader and no writer, confirmed twice, and needs a decision next Integration handoff. Q8 fix the `ws-broker` uncaught throw if it is one line. Q9 **do not widen `check-redis-safety` rule 4** — declining to widen a safety guard to make your own cleanup convenient was the right call and is recorded as such.

---

## DELIVERABLE 0 — two guards, before any research, each in its own commit

Both are infrastructure. Neither touches Mode A, keys, or `apps/web`. They are here because HANDOFF-13 ends at a plan awaiting operator approval, which may be a long wait, and each of these is a live risk for the whole of it.

**0a. Q3 — `check-compose-zebra-tag.mjs` GROWS A CEILING.** It guards the 6.3.0 floor and nothing stops an upgrade. ZcashFoundation/zebra **#10461**, landed after 6.3.0, reverses the transaction-side anchor byte order and NOT `getblock`'s or `z_gettreestate`'s roots — so a node past it makes **every Orchard-shaped anchor unknown to this build**, silently, from ABOVE the floor. The runtime detector is the `UNKNOWN_ANCHOR` byte-reversed clause and it fires only after the operator has upgraded and resynced.

Set the ceiling EXCLUSIVE at the first released version carrying #10461. **If no such version is cut yet, pin the ceiling at the highest tag this build has been read against — today 6.3.0, inclusive** — so the guard fails on an UNEXAMINED upgrade rather than only on a known-bad one. That inverts the default from "new is fine until proven otherwise" to "new is unexamined until read", which is the posture this project takes everywhere else. Research the current Zebra releases before you pick the number and cite what you read.

Same three outcomes as the floor, same rule: **UNPARSED fails.** Fail sides BY DATA: a tag above the ceiling → rc=1 naming both versions; a tag inside the window → rc=0.

**0b. Q6 — the config-default guard, and the shape is the valuable part.** A default was written twice — once in `loadConfig` where it can read a sibling variable, once in `docker-compose.yml` and `.env.example` where it cannot — so a testnet deployment that touched neither opened its base **705,857 blocks before testnet's own NU6.3 activation**, silently, because `chainBaseFromBlock` legitimately accepts a pre-activation block. That is the seam family moved from two processes to two configuration surfaces, and no test would ever have caught it because every test runs on mainnet constants.

The rule: **every variable `loadConfig` gives a network-dependent default must not carry a literal default in `docker-compose.yml` or `.env.example`.** Both files are already parsed by `check-compose.mjs`, so the reach exists — extend it or add a sibling, your call, and say which and why. Fail side BY DATA: restore the literal to either file → rc=1 naming the variable and the file.

**Both guards' headers disclose their reach**, the way `check-svg-text-floor`'s R3 does. 0a proves a TAG is inside a window, never that the build is correct against that node. 0b proves a literal is ABSENT, never that the code's default is right.

---

## THEN HANDOFF-13, UNDER ITS OWN §1–§6

Research and a plan. `packages/wasm-keys` as a DESIGN: crate candidates (`zcash_keys`, `zcash_note_encryption`, `orchard`, `sapling-crypto`), the WASM build path, compact-output fetching from the gateway, CSP, the threat model, and the §5 assertion list the eventual build will be held to. **Research the current crate names, versions and WASM story before proposing anything** — §2 says so, and the last time this project trusted a remembered API surface it cost a handoff.

Three things L2 wants weighted in the threat model, because they are this project's own history rather than generic advice:

- **The key never leaves the tab is a claim, and a claim needs a mechanism.** Say which mechanism, and what would have to be true for it to be false. A sentence making a checkable claim about runtime behaviour is checked by executing it — that is a CLAUDE.md rule and it binds a plan's assertions as hard as a build's.
- **The seam family will appear here too and it is worth naming in advance.** Four instances so far, each a boundary between two processes where both sides had tests and each test built its own input. A WASM boundary is exactly that shape: JS builds a fixture, Rust asserts on it, and neither has ever taken the other's actual output. Say in §5 how a Mode A assertion avoids it.
- **What the ceremony UI must state is a design deliverable, not a copy task.** 04a's finding was that readers get "vibes, cryptographic terminology, vibes, huge number, tiny explanation". A screen that decrypts with a viewing key must say what is and is not revealed, in the register 04a established, and that wording belongs in the plan where it can be argued with.

**STOP AT THE PLAN.** §7 records it, §8 carries the questions, the PR opens, and the operator decides. Do not begin `packages/wasm-keys`.
