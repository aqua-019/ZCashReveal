# PROMPT-09 — the messages that steered the HANDOFF-09 session

Archived under the revolution protocol, step 5: every message that steered this session,
verbatim, under a heading naming what it is and when it arrived. One file per handoff, not one
per message.

---

## 1. Session kickoff — HANDOFF-09, with the L2 RESOLUTION for HANDOFF-10 and HANDOFF-08 round 4 (30 Aug 2026, uploaded as PROMPT09.md)

The kickoff line, followed by an `L2 RESOLUTION` block carrying the rulings for LEDGER-10's four
questions and nine folds. Folds 6 to 8 are PROMPT-09's originals, which L2 records as never having
been pasted because PR #43 took priority. Reproduced verbatim, including the fenced block.

````markdown
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-09-instruments-snapshot.md. It is the Data track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-10 (PR #43, merged) and HANDOFF-08 round 4 (PR #42, merged)
Cowork, 30 Aug 2026. Both are closed; this carries the rulings neither has yet.

VERIFY — HANDOFF-10 at `a61330e` (Executed by L2 on a clean worktree, REAL PostgreSQL 16):
  1058 passed / 1 skipped, typecheck 10/10, lint 0/0, **eleven guards** green and wired in BOTH
  `ci.yml` and `pnpm check` — checked one by one against both files, not by count.
  F-43-2 fixed and the fix is guarded: I re-planted the exact defect and guard 11 caught both halves
  (R1 the missing blank line at the splice, R2 a §8 heading governing no fenced block). Every heading
  now governs matching content — I mapped all eight and their bodies: HANDOFF-08 blocks carry
  analysis markers and zero infra, HANDOFF-10 blocks carry 9, 20 and 7 infra markers and zero
  analysis. The crossover is gone.
  I ALSO CONFIRMED THE THIRD DEFECT I MISSED. At `56779f8` the two §8 blocks shared ONE fence pair
  spanning both — so fold 1 as I wrote it would have moved the heading and left the blocks
  concatenated. You mapped the region before touching it and I did not. That is the correct order.

ANSWERS to LEDGER-10's questions:

  Q1 6.2.3 vs 6.3.0 — **PIN 6.3.0, and amend §3. The reason is not the decoder.** I could read the
     release notes and the source, so this is settled rather than judged.
     Zebra 6.3.0 (10 Aug 2026) changes NOTHING on the RPCs this project decodes: no change to
     `getblock`, `getrawtransaction`, `z_gettreestate` or `getblockchaininfo`. Its only additions
     are a new `getdeprecationinfo` and NU6-era funding-stream metadata on `getblocksubsidy`. So
     your reasoning is right on its own terms — nothing the client REQUIRES arrived in 6.3.0, and
     `.passthrough()` means a 6.3.0-only field parses rather than throws. On the decoder alone,
     6.2.3 is safe and the contract wins.
     THE REASON TO PIN 6.3.0 IS THE LABELS, AND IT IS A FOLD I WROTE. LEDGER-08 Q1 asks for the ZIP
     1014/1015/1016 funding-stream recipient addresses, and I ruled they come "from the pinned
     node's own parameters" rather than from a relayed transcription. Zebra's `getblocksubsidy`
     returns exactly that:
         pub struct FundingStream {
             pub recipient: String,
             pub specification: String,
             pub value: Zec<NonNegative>,
             #[serde(rename = "valueZat")] pub value_zat: Amount<NonNegative>,
             #[serde(skip_serializing_if = "Option::is_none")]
             pub address: Option<transparent::Address>,   // the recipient's address
         }
     and the NU6-era metadata for NU6.1 and later is the 6.3.0 addition. On 6.2.3 the fold I wrote
     into HANDOFF-10 §4 cannot be executed for the upgrades this project actually cares about.
     So: pin 6.3.0, amend §3 to say "6.3.x, and why", AND take your second option as well rather
     than instead — HANDOFF-11's smoke test asserts the node's `subversion` against a floor the
     client declares. The pin states the intent; the assertion is what notices when the box is
     running something else. You were right that this is a decision rather than a default, and right
     not to take the newer tag silently; the deciding fact was one no session inside the container
     could reach.

  Q2 THE REDIS GUARD — your reading is right, keep it, and do NOT teach the guard the distinction.
     A guard that infers which server a `redis-cli` will reach is a guard that will be confidently
     wrong, and the failure it would enable is another project's outage. Your own argument is the
     one that settles it: a runbook is a COPY-PASTE SURFACE, the line pasted at 3am is the one most
     likely to carry the wrong `-u`, and `zcashreveal:` and `zecreveal:` differ by one letter.
     The cost you name — no enumeration command for the operator — is real and has a better answer
     than either option. Fold 3: a small script that dials `REDIS_URL` from the environment, runs
     `assertNotManagedStore` FIRST and refuses if it fails, then enumerates. The safety becomes a
     property of the tool rather than of the operator's paste, and the runbook line becomes
     `pnpm redis:keys` — which the guard has no reason to reject because it names no command.

  Q3 A VERIFY PHASE THAT DIES HALFWAY — your fallback was right, and the general rule is neither
     "re-run" nor "the lead reads them". It is: **partition the surviving findings by whether
     EXECUTION settles them.** A finding that can be reproduced by running something does not need
     a refuter — the reproduction is stronger evidence than any verifier's opinion, which is exactly
     why the migrations ENOENT, the circular runbook and the broken SQL were safe for you to
     disposition alone. A finding that can only be settled by ARGUMENT is precisely what the
     three-refuter design exists for, and those must be re-run or carried forward as unverified.
     Report the split in §7 as two counts. Fold 4. Your instinct was sound; what was missing was the
     line between the two kinds, and "I am the least impartial reader available" is true only for
     the second kind.

  Q4 THE MAINNET FIXTURE — nothing to decide, and that is now the problem. Four handoffs have
     carried it, no session can ever discharge it, and it is the single blocker on four separate
     open items. A standing note that survives four handoffs has stopped being a note. Fold 5 makes
     it an explicit operator task in `handoffs/README.md`'s click list with the four things it
     closes named beside it, and forbids HANDOFF-11's cutover from depending on it: the cutover
     ships with the fixture test still skipped, or it does not ship.

FOLDS — apply in your FIRST commit, before HANDOFF-09 work. Folds 6 to 8 are PROMPT-09's originals,
which were never pasted because #43 took priority; I have checked and none of the three is applied.

  1. `handoffs/HANDOFF-10-infra.md` §3 and `docker-compose.yml` — pin `zfnd/zebra:6.3.x` (exact tag
     cited), with the reason recorded as the funding-stream metadata rather than the decoder, and
     the note that 6.2.3 was correct for everything HANDOFF-05 to -08 built.
  2. `handoffs/HANDOFF-11-live-wiring.md` §5 — an assertion that the connected node's `subversion`
     meets a floor `packages/zebra-rpc` declares as a constant, in both polarities.
  3. `scripts/redis-keys.mjs` (or a `redis:keys` package script) — dials `REDIS_URL`, calls
     `assertNotManagedStore` before anything else, refuses on failure, then enumerates. Replace
     `RUNBOOK-VPS.md` §11's exact-key lines with it. Cite LEDGER-10 Q2.
  4. `CLAUDE.md`, gate contract — a truncated verify phase is reported as TWO counts: findings
     settled by execution (lead may disposition) and findings settled only by argument (re-run or
     carry as unverified). Cite LEDGER-10 Q3.
  5. `handoffs/README.md` click list — the mainnet fixture capture as a named operator task, with
     the four items it closes: the one skipped test, the `vjoinsplit` end-to-end path, the
     `trees.ironwood.size` observation, and the testnet half of the ZIP 258 exposure. HANDOFF-11's
     cutover may not depend on it.
  6. `CLAUDE.md`, stopping rule — the one-clause version is in the file; add clause (b). A gate round
     ends the gate when (a) it returns no finding a user could see AND (b) every defect SHAPE that
     has recurred across three or more rounds is covered by a guard shown to fail on that shape.
     Clause (b) is what lets a round stop while a behaviour-changing fix is in it. Cite HANDOFF-08's
     reach curve: round 2 four HIGHs, round 3 two, round 4 one plus three in the guards themselves.
  7. `scripts/check-finding-sites.mjs` header — state the boundary: this guard enforces closure of
     REGISTERED findings; registration is manual and nothing asserts the registry is complete. Add
     it to `handoffs/HANDOFF-13-*.md` as plan-only material with the design question named.
  8. `handoffs/HANDOFF-09-instruments-snapshot.md` §2 — add the eleven guards to the reading. §3 — a
     new `FilterApplication` variant registers its params with `check-audit-consumers.mjs`'s
     expectations in the SAME commit that introduces it. HANDOFF-09 adds instruments, instruments
     emit audit records, and this is the first handoff after that guard exists which will create one.
  9. Still open from LEDGER-08, carried in §8 rather than restated: Q7(a) `EchoMatch` carries no
     pool; Q7(b) the sieve is wired in the same commit that first makes a `LinkRecord` renderable
     (HANDOFF-12); Q4's `CLASSES` derivation; Q5's TRACKING-MATH §1.3 amendment.

ON MY OWN RELIABILITY, recorded because the ledger is where this project keeps what it learned.
  Across #42 and #43 I filed three findings. All three were real. My EXPLANATION was wrong in two of
  them and my prescription in one: F-43-1's worked example did not reproduce ("before migrating"
  does not contain "migrate"); F-43-2's mechanism was wrong (ATX headings DO interrupt paragraphs —
  I ran the reference parser and got `<h2>`); my proposed rule for guard 11 was measured against the
  real damaged file and rejected, missing the defect at both sites and firing on three correct
  blocks; and fold 3 was impossible as specified. Each time the session executed my claim before
  accepting it, and each time that made the finding better rather than smaller. The rule fold 4 of
  LEDGER-10 added to CLAUDE.md is the right one and is better written than my version. I detect
  reliably and I explain and prescribe unreliably when I do not execute first, and the fix is not
  for me to file fewer findings — it is for the claim inside a finding to be executed as carefully
  as the finding itself.

OPERATOR CLICKS (Aqua, not any agent):
  - HANDOFF-08 and HANDOFF-10 are both CLOSED. HANDOFF-09 opens on the Data track.
  - Migrations 003 and 004 still have not been applied to the VPS database. `RUNBOOK-VPS.md` §4 now
    carries the procedure and the 003 warning, and guard 11 plus the tightened doc guard will notice
    if either leaves.
  - The mainnet fixture capture is yours and is now four handoffs old. Fold 5 makes it a named task.
  - Stale remote branches per `docs/2.0/BRANCH-CLEANUP.md`, which now maps branch names to handoffs.
````
