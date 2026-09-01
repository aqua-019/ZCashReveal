# PROMPT-12 — the messages that steered the HANDOFF-12 session

Archived verbatim under Revolution protocol step 5. One file per handoff; each message
under a heading naming what it is and when it arrived.

## Message 1 — the session kickoff, with the L2 RESOLUTION for HANDOFF-11 embedded (1 Sep 2026, session start)

Arrived as the opening user turn. It carries five things: the kickoff line, the standing
instruction that §5 is reconciled before any wiring, the two mainnet block captures and
their routes, the `L2 RESOLUTION - HANDOFF-11, PR #49` block that Revolution protocol
step 2 requires appended to `handoffs/LEDGER.md`, and ten folds. Reproduced in full,
including the Appendix A source, because the appendix is a deliverable and code travels
as text.

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff ALREADY EXISTS: `handoffs/HANDOFF-12-runtime-poolstate.md`, status `open`. You do not write it — you RECONCILE it, apply the L2 RESOLUTION below, and execute it. Report spawn mode first. Stop at PR opened. Fork from `main` at `fa696a6` (PR #49 merged; HANDOFF-11 closed).

HANDOFF-12 WAS WRITTEN ON 22 AUGUST, THE SAME DAY AS HANDOFF-11, AND HANDOFF-11 HAS SINCE SHIPPED 125 FILES. Reconciling §5 against the tree is deliverable 0, before any wiring — the same rule that found seven stale assertions last time, three of which were green and proved nothing. L2 has already reconnoitred four of the five assertions and the results are below. They are a head start, not the answer: check each against the tree yourself, because the last two handoffs both found that L2's reconnaissance was incomplete in exactly the place L2 was most confident.

TWO CAPTURED MAINNET BLOCKS REACH YOU AS FILES — `mainnet-3432130-000000.json` and `mainnet-3441955-000000.json` — either attached to this prompt or committed at `docs/2.0/capture/`. Check both routes, the same way `docs/2.0/mockups/` carried HANDOFF-04a's design reference. Copy them into `apps/indexer/test/fixtures/blocks/` on your branch, and `cp` them — do not read them into context to retype them. They are 88 KB and 169 KB of evidence and a retyped byte is a fabricated one. If neither route produced them, say so and stop rather than reconstructing them; they cannot be regenerated from this prompt. The guard that checks them is Appendix A, as source, because code travels as text and data does not.

They are deliberately NOT already on `main`: `apps/indexer/test/fixtures/blocks/mainnet-*.json` is globbed by `block-decoder.test.ts`, so a file landing there flips a skipped CI test to executing. That belongs inside your PR with a gate run behind it, not in a web upload to `main`. Fold 8 is that work.

L2 RESOLUTION — HANDOFF-11, PR #49 (Cowork, 1 Sep 2026)

Append this block verbatim to `handoffs/LEDGER.md` beneath the HANDOFF-11 ledger block, under Revolution protocol step 2. It is reproduced in full in the delivered file `L2-RESOLUTION-11.md`; if that file is attached to this session, prefer it byte for byte over any summary.

VERDICT: MERGE (applied — #49 is merged at `fa696a6`).

Verified independently on a clean worktree of `adca738`: 1409 passed / 4 skipped / 1413 total, `TEST_RC=0 CHECK_RC=0 TYPECHECK_RC=0 LINT_RC=0 BUILD_RC=0 VALIDATE_RC=0`. Fold 6 held. The WS envelope defect and the `/v2/mempool` 500 were both reproduced on merged `main` rather than taken from the report, and `reviveWireZatoshi`'s round-trip-over-five-real-shapes design is accepted for its shape: a convention asserted rather than trusted is a schema by other means.

The seven stale §5 items are recorded as seven defects in L2's own August work, not as this project's. Three were green against the tree and proved nothing; three more were names written from memory of a tree rather than read out of it.

The five §8 rulings, in short — the full text is in `L2-RESOLUTION-11.md`

* Q1 — trade accepted. Do not buy the e2e leg back, and specifically do NOT commit a second `include` entry: a `<distDir>/types` entry for a directory that only exists after someone runs the e2e suite is a stale validator by construction, and tsc's verdict would then depend on the order a contributor ran two commands. Building in a temporary copy of the workspace is the only sound purchase and is recorded as available, not owed.
* Q2 — THE PREMISE IS FALSE. Filed as F-49-2. `apps/web/tsconfig.json` has carried a committed `include` (with `.next/types/**/*.ts`) since `dd2395a`, is byte-identical on `origin/main`, has exactly one commit in its history, and a full production build in L2's worktree left `git status --porcelain` EMPTY. Next writes that entry only when it is MISSING — which is exactly why Q1's custom-`distDir` run triggers it. Q1 is right; Q2 states the same fact about the wrong object, and its own block refutes it four paragraphs earlier.
* Q3 — guard wanted, extraction spelled out. `parseZebraVersion("zfnd/zebra:6.3.0")` returns `null` by design. The guard must extract the tag FIRST: reject any ref containing `@`; take the substring after the last `:` that follows the last `/`; require `^\s*v?(\d+)\.(\d+)\.(\d+)\s*$` anchored at both ends. Three outcomes, and UNPARSED fails — `:latest` must not pass. Verified against seven reference shapes.
* Q4 — move `revalidate` to 120 on `/` and `/pools`, and rewrite `SNAPSHOT.md` §5 to 64,800 warm / 129,600 cold, combined 237,300 (47%) / 302,100 (60%). Add the five-region row (388,500, 78%): the point of the change is the multiplier nobody can read, and a table showing only three regions hides it.
* Q5 — confirmed on all three clauses, and two are defects in how L2 authors §5. New rule: an exclusion-set member must be checked against the SHIPPED object before it is written; one the object already exhibits is a defect being filed or a clause got wrong, never a test to write. And the fourth amendment to the two-polarity rule: when no field can hold an excluded value, the assertion is TYPE-LEVEL and its fail side is a `@ts-expect-error` on the construction, not a data mutation — an assertion with an empty exclusion set at every level is deleted, not dressed.

F-49-1 — the A11 live-node skip is invisible to the skip guard, twice over

Instance four of "a green CI is not evidence a package ran", and instance one was also `packages/zebra-rpc`. Measured: `version-floor-smoke.test.ts` skips its live leg on every runner, and its `fullName` is exactly

```
A11 - the connected node clears the version floor packages/zebra-rpc declares A11 PASS STATE: the live node's subversion clears the floor
```

`ci.yml:327` runs that package with no `--reporter=json`, and `ci.yml:300` feeds the guard only `indexer-results.json publisher-results.json`. Separately, the file matches neither alternative of `INTEGRATION_FILE`. So the fix is two edits that must land together — add the JSON reporter and the report path, AND add that `fullName` to `ALLOWED_SKIPS` verbatim — because wiring the report in alone turns CI red on every correctly configured runner.

FOLDS FOR HANDOFF-12 — apply in a `docs(handoffs)` commit before any wiring, and record each

1. F-49-2. Correct LEDGER-11 Q2 in place with the measurement above. State that Q1's mechanism is unaffected and is the reason the default build is clean.
2. F-49-1. The two CI edits, together. Then drive the guard: with the report wired in and the title not yet in `ALLOWED_SKIPS`, it must go rc=1 naming the A11 title; with the title added, rc=0. That is the data-mutation fail side and it costs one run.
3. Q3's compose-tag guard. Extraction as spelled out, three outcomes, UNPARSED failing. Two fixture compose files for the fail sides: one pinning `6.2.9`, one pinning `latest`.
4. Q4. `export const revalidate = 120` at `apps/web/src/app/page.tsx:125` and `apps/web/src/app/pools/page.tsx:31`, and `SNAPSHOT.md` §5 rewritten with the five-region row. Keep the measured fact (two pages in one 60 s window are ONE GET) labelled measured and the region count labelled assumed.
5. Q5(a) and Q5(c). Both rules into `CLAUDE.md`, as stated above.
6. The three seam defects — the WS envelope, the wire-form 500, `TipChannelPayload`'s missing `type` — get one paragraph in `CLAUDE.md` under the name the HANDOFF-11 session gave them, because the instrument generalises: each was a seam between two processes, each was covered by tests on both sides, and each test built its own input rather than taking the other side's output. The instrument is to make one side actually produce the value and hand it to the other. A5 below is the fourth instance of that shape and it is still open.
7. §5 IS RECONCILED FIRST. L2's reconnaissance of HANDOFF-12's five assertions, against `fa696a6`, all Read-provenance — verify each:

* A1 IS NOT EXECUTABLE AS WRITTEN AND THIS IS THE BIG ONE. It asks for "a 1,000-block fixture range" reproducing per-pool balances "equal to the fixture's reference values (source cited)". No such fixture exists, and it cannot: a captured verbosity-2 block runs 90 KB–2.4 MB, so a thousand of them is tens to hundreds of megabytes. But the reference value A1 wants is IN EVERY BLOCK, from the node itself. A verbosity-2 `getblock` carries `valuePools[]` with, per pool, `chainValueZat` (cumulative) AND `valueDeltaZat` (this block's signed delta). Measured on the staged capture at height 3,432,130:

```
transparent  chainValueZat=1248509325451838   valueDeltaZat=-1115298068
sprout       chainValueZat=2263726786698      valueDeltaZat=0
sapling      chainValueZat=54117970980192     valueDeltaZat=1252813068
orchard      chainValueZat=309484135850351    valueDeltaZat=-5015000
lockbox      chainValueZat=5357456250000      valueDeltaZat=18750000
ironwood     chainValueZat=65500994985401     valueDeltaZat=5000000
```

THE CONSERVATION LAW IS EXECUTABLE PER BLOCK AND L2 EXECUTED IT: the six deltas SUM TO 156,250,000 zat — 1.5625 ZEC, the block subsidy — on both staged captures, exactly. That is TRACKING-MATH §3.11 made checkable against a node-sourced figure, once per block, and it is the invariant any replay must satisfy.

A narrower claim, with its precondition stated, because L2 got this wrong first. In 3,432,130 the orchard delta is −5,015,000 and ironwood +5,000,000, and the 15,000 difference is that crossing's fee — but only because exactly ONE transaction in that block touches orchard or ironwood, so the pool deltas are attributable to it. In 3,441,955 two transactions do, and the same subtraction yields −264,225,000, which is a net of unrelated movements and not a fee. L2 wrote the general form of this claim into an earlier draft of this prompt and it was false on the second block. Per-transaction attribution from pool deltas requires that exactly one transaction touch those pools; assert the precondition or do not make the claim.

Restate A1 against this: a replay's computed per-pool deltas equal the block's own `valueDeltaZat`, and its cumulative balances equal `chainValueZat`, over however many captured blocks exist. That is a NODE-SOURCED reference rather than "an explorer's figures", it needs no thousand-block fixture, and its fail side is a data mutation (alter one delta by one zat). Record in §7 that A1 was restated and why — do not quietly satisfy the old wording.

Note `valuePools` carries six entries and `schemas.ts:146` already says so, correctly, and says the site's `LedgerLane` has five and that mapping six onto five is the gateway's job. L2 confirmed the six and their fixed order against a live node. Do not "fix" this.

* A2 IS SOUND. `zmq.start()` is live at `apps/indexer/src/index.ts:95`, with a poll-loop fallback at `:99`. `replayInto` exists at `apps/indexer/src/persistence/replay.ts:36` and is never called from `index.ts` — so the ordering assertion is about code this handoff writes, which is correct, not stale.
* A3 depends on `assessRaw` (`analysis/assessment.ts:63`) and `assessFiltered` (`:87`), both present. `AnalyzeContext.chainState` does not exist yet. Check whether HANDOFF-11's `reviveWireZatoshi` changes what "every `LeakReport` emitted on the live path" now means — the live path was rewired under you.
* A4 — no reconnaissance done. Yours.
* A5 IS LIVE, AND IT IS THE FOURTH INSTANCE OF FOLD 6's SHAPE. `apps/indexer/src/index.ts:146` publishes to the literal string `"zcashreveal:links"`. `apps/gateway/src/server.ts:140` subscribes to `REDIS_CHANNELS.mempool` and `REDIS_CHANNELS.tip` — two channels, and `links` is not among them. `REDIS_CHANNELS` does not declare a `links` key at all, so the indexer publishes to a string no constant names and no process reads. A producer with no consumer, which is the WS-envelope defect with the consumer removed entirely. Decide it and record the reason in §8; if you subscribe it, it needs a constant and a WS test, and if you remove it, the grep must agree in both apps.

8. THE MAINNET BLOCK FIXTURES — and they close LEDGER-10 Q4.

TWO real verbosity-2 mainnet blocks arrive with this prompt, both captured 1 Sep 2026. Copy both into `apps/indexer/test/fixtures/blocks/` and let the gate run.

```
mainnet-3432130-000000.json   87.6 KB    5 tx   sap 2  orch 2  iron 1   crossing
mainnet-3441955-000000.json  169.0 KB   10 tx   sap 4  orch 2  iron 6   crossing
both from /Zebra:6.2.1/ via https://zcash-mainnet-zebrad.gateway.tatum.io/  (getnetworkinfo)
hashes 000000000009eb351a746b531aac6125982b93161529b5e68821d74034230ddd
       000000000054b709857869a65b4db13bbc723123584b18edd4637ae3d3780791
```

Both meet every blocking criterion of README §2, measured rather than eyeballed, and in 3,432,130 transaction #3 is `v6, vin 0, vout 0, orchard.actions 2, ironwood.actions 1` — a fully shielded ZIP 318 crossing, the transaction shape this project exists to measure and one no fixture has ever held.

TWO RATHER THAN ONE ON PURPOSE. `block-decoder.test.ts` globs every `mainnet-*.json` and loops over all of them inside a single `it` — the loop HANDOFF-07 wrote after finding `.sort()[0]` would have silently dropped an Ironwood capture. That loop has never executed with more than zero captures. Landing two exercises it for the first time. Note while you are there that the suite count does NOT distinguish one capture from two — both give `11 passed`, because the loop is inside the `it` and `expect(fixturePaths.length).toBeGreaterThan(0)` only checks for non-zero. So nothing in the test output would notice a second capture failing to load. Fold 9's guard is the only thing that reports how many captures were actually examined, which is an argument for wiring it into `pnpm check` rather than leaving it a manual tool.

L2 measured both polarities: fixtures absent → `10 passed | 1 skipped`; present → `11 passed`; full indexer suite `449 passed / 0 pending` with either one or both (was 448 + 1); `assert-no-skipped-integration.mjs` rc=0 with the mainnet-fixture entry gone from its skip list because the test now runs.

THE NODE IS BELOW THE 6.3.0 FLOOR AND YOU MUST NOT SKIP THIS PARAGRAPH. `checkZebraVersionFloor("/Zebra:6.2.1/")` returns `below-floor`. L2 first called that disqualifying and was wrong: `version-floor.ts` and A11 govern the node the running stack talks to; the fixtures README asks that a capture's `subversion` be RECORDED and warns how to read an older capture. Applying a live-operation rule to a historical artifact is the same family as three of L2's own §5 defects.

What 6.2.1 actually risks was read from Zebra's source, not from release notes. `zebra-rpc/src/methods/types/transaction.rs` is byte-identical at v6.2.1 and v6.3.0. `methods.rs` has 16 hunks, five of them one fix — ZcashFoundation/zebra issue #10550, where `get_block` re-resolved the caller's hash-or-height and could "mix block A's header with block B's contents" or return a Sapling tree from a different block at the same height, and hardcoded `in_active_chain: true`. Measured across four tags: v6.2.1 has it; v6.2.2, v6.2.3 and v6.3.0 do not. Of every public node available, this is the one version in range that carries it.

So it was checked rather than assumed, and a block carries its own checksum:

```
merkleroot  header 073420ea…9a5d   recomputed from the 5 txids 073420ea…9a5d   MATCH
trees delta vs height 3,432,129:  sapling +2 = 2 vShieldedOutput   MATCH
                                  orchard +2 = 2 orchard.actions   MATCH
                                  ironwood +1 = 1 ironwood.actions MATCH
previousblockhash == the 3,432,129 block's hash                    OK
in_active_chain true; confirmations 36,084 >= 0, so true is CORRECT OK
```

Every field #10550 could corrupt is clean, and the transactions were serialised by byte-identical code. Do not take that on L2's word — fold 9 makes it reproducible.

Record in `RUNBOOK-VPS.md` per the README: height, hash, endpoint, date, `subversion`, and the #10550 note with this evidence, so the version is a fact a reader can act on rather than a footnote. Add to §8 that re-capturing height 3,432,130 from a 6.3.x node later and diffing settles it permanently — identical closes the question, different is itself a finding.

9. THE CAPTURE-CONSISTENCY GUARD — source in Appendix A.

Write it to `scripts/check-capture-consistency.mjs`, wire it into `pnpm check` as the fifteenth guard, and drive it rather than trust it — it is L2's code and it has not been through your gate. It recomputes each capture's merkle root from its txids, checks `nTx`, per-transaction blockhash and height, the best-chain flag, and — when the previous block is also present — the three note-commitment tree deltas against the block's own outputs and actions. Three outcomes, and the third is named: pass, fail, and could not be run, which is never counted as a pass. Its OK line reports how many delta checks actually ran, because a line that does not say what it did is how a guard comes to certify its own hole (LEDGER-09b round 6).

L2 drove it in five polarities, all by DATA mutation — reproduce them, and add any you think it is missing:

```
both blocks present    rc=0  "2 capture(s) … 3 note-commitment tree delta(s) checked", 1 NOT RUN
candidate only         rc=0  "1 capture(s) … 0 delta(s) checked", 1 reported NOT RUN
one txid altered       rc=1  "merkleroot MISMATCH … header and transaction list are from DIFFERENT BLOCKS"
trees.ironwood +7      rc=1  "moved 13639 -> 13647 (delta 8) but this block's transactions carry 1 actions"
empty directory        rc=0  "driven by the self-test alone"
```

Its self-test has a fail side for each arm, deliberately: the merkle arm firing says nothing about whether the delta arm is wired, and the delta arm only runs when a previous block happens to be present — so it is the arm most likely to be silently inert. The rule it encodes is the reason it exists: a capture from a floor-clearing node is not automatically consistent, and one from an older node is not automatically wrong. The question is answerable, so it is answered.

Adopt it or rewrite it, your call — but the five transcripts must reproduce either way, and if you rewrite it say in §7 what you changed and why. Note the one thing L2 knows it does not check: with only the two captures committed and no height-3,432,129 or -3,441,954 block beside them, the `trees` delta arm reports NOT RUN for both. L2 ran that arm out-of-tree against both predecessors and all six deltas matched; that evidence is not reproducible from the repository, so it is labelled UNVERIFIED-in-tree here rather than quoted as though a contributor could re-run it. Committing the two predecessor blocks would make it reproducible at a cost of 549 KB and 305 KB, which is a trade for §8, not a decision L2 is making for you.

10. Record the survey, so nobody repeats L2's mistake. L2 scanned 130 post-Ironwood blocks (heights 3,428,200 → 3,445,099) scoring each against README §2. Four conformed — 3% — at heights 3,432,130 · 3,441,955 · 3,444,837 · 3,444,968, and all four carry a crossing. Failure rates at n=130: `sapling` 77%, `txcount` 69%, `orchard` 55%, `ironwood` 52%, `size` 28%, `v6` 13%, `cleanCoinbase` 2%, `height` 0%. Crossings in 45/130; Sprout JoinSplits in 0/130.

Two corrections L2 owes, and a third about how it reported them. §2 is satisfiable, just uncommon — an earlier claim that it "describes a block that does not occur" was an over-generalisation from a sparse sample of 30 spread across 26,000 heights, mostly late, where Sapling is dead. The 200 KB ceiling is NOT the binding constraint, Sapling activity is. And L2 stated the conforming count three times before the sample finished — one, then two, then four — so the rule it takes away, and which belongs in `CLAUDE.md` beside the "executed or labelled" rule, is that a rate quoted without its n is not a measurement, and a rate quoted while the sample is still running is not one either.

Two blocks in the sample (3,437,632 and 3,438,287) carry a shielded coinbase, which is why `cleanCoinbase` is 2% rather than 0%. README §2 excludes those deliberately — "keep the coinbase transparent so the fixture isolates user-shielded activity from miner behavior" — and the criterion is still satisfiable, but the phenomenon exists on post-Ironwood mainnet and the README speaks of it as though it did not. Add to §8 that HANDOFF-10's standing Sprout-JoinSplit request will not be met by sampling recent heights — the pool holds 22,591 ZEC and is dormant; finding one needs a targeted historical search, which is a different job.

Three smaller findings for §8, none of them this handoff's to fix:

* `version-floor.ts`'s three stated reasons (Ironwood support, `vjoinsplit`, `getblocksubsidy` labels) do not mention `get_block`, the method this project calls most. The floor excludes #10550 only incidentally, because 6.2.2 < 6.3.0. A list of reasons for a floor is not a list of everything the floor protects against, and the docblock reads as though it were.
* The fixtures README's short-hash rule ("first 6 hex characters of `block.hash`") is degenerate on modern mainnet: difficulty puts ten or more leading zeros on every hash, so heights 3,432,129, 3,432,130 and 3,468,000 all produce `mainnet-<height>-000000.json`. The README's own `0000ab` example is from a lower-difficulty era.
* `tx.hex` is 45% of a capture (70.6 KB of 156.0 KB on block 3,468,000) and nothing reads it — `RpcTransaction` does not declare it, and the only `.hex` reads are `vin.scriptSig.hex` and `vout.scriptPubKey.hex`. L2 did not strip it and recommends not stripping it: a capture edited to fit a budget is a synthetic with extra steps, and a future question about what a node sends for `hex` would get a wrong answer from a stripped file. Recorded so the trade is visible if the ceiling ever binds.

Scope note. This is a large handoff: ten folds plus §4's runtime wiring and Ironwood anchor path. Folds 1–6 are small mechanical edits; folds 7–10 are the reconcile and the capture. If the gate is at risk of not converging, land folds 1–10 and the §4 runtime work in separate commits in that order, so a partial branch still carries the closed findings. Do not drop the reconcile to make room — it is deliverable 0 for the reason the last two handoffs demonstrated.

Appendix A — `scripts/check-capture-consistency.mjs`

```javascript
#!/usr/bin/env node
/**
 * Every `mainnet-*.json` capture is internally consistent.
 *
 * WHY THIS EXISTS, and it is not a general-purpose sanity check. A capture is
 * the one artifact in this repository that the suite treats as GROUND TRUTH:
 * `block-decoder.test.ts` asserts the decoder against it, so a capture that is
 * quietly wrong makes every assertion built on it quietly wrong in the same
 * direction. Nothing else in the tree can notice, because there is nothing to
 * compare a capture against - that is what makes it evidence.
 *
 * EXCEPT THAT A BLOCK CARRIES ITS OWN CHECKSUM. The header's `merkleroot` is
 * the Merkle root over the block's own transaction ids, so a header taken from
 * one block and a transaction list taken from another CANNOT agree. And the
 * three note-commitment tree sizes in `trees` are cumulative, so the delta
 * against the previous block must equal the number of outputs and actions this
 * block's own transactions contain. Both are computable from the files alone.
 *
 * THE DEFECT THIS WAS WRITTEN AGAINST IS REAL AND HAS A NUMBER.
 * ZcashFoundation/zebra issue #10550, fixed in 6.2.2: `getblock` resolved the
 * caller-supplied hash-or-height a SECOND time for `get_block_header`, and
 * bound the SaplingTree and Depth reads to it as well, so a reorg or tip
 * advance between those reads could mix block A's header with block B's
 * contents, or return a Sapling tree from a different block at the same height.
 * The same release stopped hardcoding `in_active_chain: true` on every
 * transaction in the verbosity-2 path. A capture taken from a node below 6.2.2
 * can therefore be internally inconsistent, and NOTHING IN THE FILE SAYS SO.
 *
 * So the rule this enforces is: a capture's version is RECORDED (README), and
 * its consistency is CHECKED HERE rather than inferred from the version. That
 * ordering matters - a capture from a floor-clearing node is not automatically
 * consistent, and a capture from an older node is not automatically wrong. The
 * question is answerable, so it is answered.
 *
 * THREE OUTCOMES, and the third is the one that matters. A check that passes,
 * a check that fails, and a check that COULD NOT BE RUN - the `trees` delta
 * needs the previous block, which a capture set may not contain. "Not checked"
 * is reported as not checked. It is never counted as a pass.
 *
 * Usage:  node scripts/check-capture-consistency.mjs [dir]
 *         (default dir: apps/indexer/test/fixtures/blocks)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "apps/indexer/test/fixtures/blocks";
const sha256d = (b) => createHash("sha256").update(createHash("sha256").update(b).digest()).digest();
const n = (x) => (Array.isArray(x) ? x.length : 0);

/**
 * Bitcoin/Zcash Merkle root over displayed txids.
 *
 * Txids are DISPLAYED big-endian and hashed little-endian, so each is reversed
 * on the way in and the root is reversed on the way out. An odd row duplicates
 * its last element. Getting either convention wrong yields a root that never
 * matches, which is a false alarm rather than a false pass - but it is still
 * wrong, so the self-test below drives a known block.
 */
function merkleRoot(txids) {
  let level = txids.map((h) => Buffer.from(h, "hex").reverse());
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256d(Buffer.concat([level[i], level[i + 1] ?? level[i]])));
    }
    level = next;
  }
  return Buffer.from(level[0]).reverse().toString("hex");
}

function checkOne(block, prev) {
  const findings = [];
  const notChecked = [];
  let treesDeltaRan = 0;
  const txids = block.tx.map((t) => t.txid);

  const computed = merkleRoot(txids);
  if (computed !== block.merkleroot) {
    findings.push(
      `merkleroot MISMATCH: header says ${block.merkleroot}, the ${txids.length} txids in this file give ${computed}. ` +
        `The header and the transaction list are from DIFFERENT BLOCKS (zebra #10550).`,
    );
  }
  if (block.nTx !== block.tx.length) {
    findings.push(`nTx is ${block.nTx} but the tx array holds ${block.tx.length}`);
  }
  for (const t of block.tx) {
    if (t.blockhash !== undefined && t.blockhash !== block.hash) {
      findings.push(`tx ${t.txid} names blockhash ${t.blockhash}, not ${block.hash}`);
    }
    if (t.height !== undefined && t.height !== block.height) {
      findings.push(`tx ${t.txid} names height ${t.height}, not ${block.height}`);
    }
  }
  // `in_active_chain` was hardcoded `true` below 6.2.2. `true` is the CORRECT
  // value for a block on the best chain, so this is a check for the case where
  // it is not - not a check for the node's version.
  if (block.confirmations !== undefined && block.confirmations < 0) {
    const claimed = block.tx.filter((t) => t.in_active_chain === true);
    if (claimed.length > 0) {
      findings.push(
        `confirmations is ${block.confirmations} (not on the best chain) but ${claimed.length} tx claim in_active_chain: true`,
      );
    }
  }

  if (prev === null) {
    notChecked.push(
      `trees deltas: no capture of height ${block.height - 1} in this directory, so the cumulative ` +
        `note-commitment sizes could not be checked against this block's own outputs and actions`,
    );
  } else if (prev.hash !== block.previousblockhash) {
    findings.push(`previousblockhash ${block.previousblockhash} does not match the height-${prev.height} capture's hash ${prev.hash}`);
  } else {
    const expected = {
      sapling: block.tx.reduce((a, t) => a + n(t.vShieldedOutput), 0),
      orchard: block.tx.reduce((a, t) => a + n(t.orchard?.actions), 0),
      ironwood: block.tx.reduce((a, t) => a + n(t.ironwood?.actions), 0),
    };
    for (const pool of Object.keys(expected)) {
      const cur = block.trees?.[pool]?.size, pre = prev.trees?.[pool]?.size;
      if (cur === undefined || pre === undefined) { notChecked.push(`trees.${pool}.size absent on one of the two blocks`); continue; }
      treesDeltaRan++;
      if (cur - pre !== expected[pool]) {
        findings.push(
          `trees.${pool}.size moved ${pre} -> ${cur} (delta ${cur - pre}) but this block's transactions ` +
            `carry ${expected[pool]} ${pool === "sapling" ? "shielded outputs" : "actions"} (zebra #10550)`,
        );
      }
    }
  }
  return { findings, notChecked, treesDeltaRan };
}

// ── self-test: the check must FAIL on a block it should reject ──────────
// A guard that has never been seen to fire is indistinguishable from one that
// checks nothing. Driven by a DATA mutation - one txid altered - not by
// disabling anything.
function selfTest() {
  const b = {
    hash: "aa", height: 2, nTx: 2, confirmations: 10,
    merkleroot: merkleRoot(["11".repeat(32), "22".repeat(32)]),
    tx: [{ txid: "11".repeat(32) }, { txid: "22".repeat(32) }],
  };
  if (checkOne(b, null).findings.length !== 0) return "the self-test's VALID block was rejected";
  const mutated = structuredClone(b);
  mutated.tx[1].txid = "33".repeat(32);
  const f = checkOne(mutated, null).findings;
  if (f.length === 0 || !f[0].includes("merkleroot MISMATCH")) return "the self-test's MUTATED block was accepted";

  // THE DELTA ARM NEEDS ITS OWN FAIL SIDE. The merkle arm firing says nothing
  // about whether the `trees` comparison is wired, and the delta arm is the one
  // that only runs when a previous block happens to be present - so it is the
  // arm most likely to be silently inert.
  const prev = { hash: "pp", height: 1, trees: { sapling: { size: 10 }, orchard: { size: 20 }, ironwood: { size: 30 } } };
  const cur = {
    hash: "cc", height: 2, nTx: 1, confirmations: 5, previousblockhash: "pp",
    merkleroot: merkleRoot(["11".repeat(32)]),
    trees: { sapling: { size: 11 }, orchard: { size: 20 }, ironwood: { size: 30 } },
    tx: [{ txid: "11".repeat(32), vShieldedOutput: [{}] }],
  };
  const good = checkOne(cur, prev);
  if (good.findings.length !== 0) return "the self-test's VALID delta block was rejected";
  if (good.treesDeltaRan !== 3) return `the delta arm ran ${good.treesDeltaRan} times, expected 3`;
  const badDelta = structuredClone(cur);
  badDelta.trees.sapling.size = 99;              // a size the block's own outputs cannot explain
  const df = checkOne(badDelta, prev).findings;
  if (df.length === 0 || !df[0].includes("trees.sapling.size")) return "the self-test's MUTATED delta was accepted";
  return null;
}

const selfTestFailure = selfTest();
if (selfTestFailure !== null) {
  console.error(`[capture-consistency] SELF-TEST FAILED: ${selfTestFailure}`);
  process.exit(1);
}

if (!existsSync(DIR)) {
  console.log(`[capture-consistency] OK: ${DIR} does not exist, so there are 0 captures to check. Self-test passed.`);
  process.exit(0);
}
const names = readdirSync(DIR).filter((f) => /^mainnet-.*\.json$/.test(f));
const byHeight = new Map();
for (const f of names) {
  const b = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  byHeight.set(b.height, b);
}

let failed = false, checked = 0, deltasRan = 0;
const unchecked = [];
for (const [height, block] of [...byHeight].sort((a, b) => a[0] - b[0])) {
  const { findings, notChecked, treesDeltaRan } = checkOne(block, byHeight.get(height - 1) ?? null);
  checked++;
  deltasRan += treesDeltaRan;
  for (const f of findings) { console.error(`[capture-consistency] FAIL height ${height}: ${f}`); failed = true; }
  for (const u of notChecked) unchecked.push(`height ${height}: ${u}`);
}

for (const u of unchecked) console.log(`[capture-consistency] NOT CHECKED - ${u}`);
if (failed) { console.error(`[capture-consistency] rc=1 over ${checked} capture(s).`); process.exit(1); }
console.log(
  `[capture-consistency] OK: ${checked} capture(s) in ${DIR} are internally consistent ` +
    `(merkle root recomputed from txids; nTx; per-tx blockhash and height; best-chain flag; ` +
    `${deltasRan} note-commitment tree delta(s) checked against the blocks' own outputs and actions)` +
    `${unchecked.length > 0 ? `, with ${unchecked.length} check(s) reported above as NOT RUN` : ", every check ran"}` +
    `${checked === 0 ? " - with no captures present it is driven by the self-test alone" : ""}.`,
);
```
