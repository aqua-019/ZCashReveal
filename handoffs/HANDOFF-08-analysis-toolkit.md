---
handoff: 08
title: Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)
status: shipped
branch: the session-designated branch (name it `feat/v2-08-analysis-toolkit` if you may choose)
track: Data
depends_on: 06
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-08 — Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Implement the process-of-elimination toolkit from TRACKING-MATH §1, §3, §4 as pure, audited modules keeping the v0.2 `FilterApplication` audit-record contract, with the golden-case tests from §6 and a conservation property test.

**Out of scope:** No wiring into the live indexer loop (HANDOFF-12). No UI.

## §2 READING (state before you start)

> **PRECONDITION FROM HANDOFF-05 (23 Aug 2026).** Do not capture a golden baseline until
> HANDOFF-05 is merged. Until then the wallet fingerprint is INERT rather than merely
> approximate: `RpcTransaction` declared `expiryHeight` while zcashd and Zebra serialise
> `expiryheight`, so `leak-analyzer.ts` computed `expiryDelta = null` for every transaction that
> ever came off a node, and `fingerprint.ts` gates three of its five signatures on
> `expiryDelta !== null`. A baseline captured in that state freezes the bug into the artefact
> that is supposed to detect it. HANDOFF-05 maps the wire spelling at the RPC boundary; two
> signatures (YWALLET, ZECWALLET_LITE) become reachable and two (NIGHTHAWK, ZCASHD_RUST) do not,
> because they also gate on a ZIP-317 conventional fee and the wire carries no fee field at all -
> computing that fee is this handoff's, and it must be done before those two are baselined.

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/TRACKING-MATH.md` (all)
- `apps/indexer/src/analysis/*.ts` + tests
- `packages/content/data/{cases,labels}.json`
- ZIP 317, ZIP 318, ZIP 320, ZIP 1014/1015/1016 (funding-stream addresses per height) — cite revisions

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `analysis/echo.ts`: exact / fee-tolerant (`FEE_TOLERANCE_ZAT`) / relative (`ε = 1e-4`) / subset-sum (`k ≤ 3`, window-bounded, amounts quantised to `1e4` zat) matchers; grades HIGH / MEDIUM / LOW per the spec; injectable clock; audit records.
- `analysis/clustering.ts`: common-input-ownership union-find; change heuristic with `pChange`; exchange-shape detectors (change-to-self withdrawal, many-to-one sweep); P2SH multisig flag.
- `analysis/labels.ts`: consensus labels (ZIP 271 multisig mainnet/testnet; funding-stream addresses from the ZIPs — cite; TEX detection) with precedence `consensus > owner-filing > exchange > analyst > behaviour`; loads `labels.json` for non-consensus tiers.
- `analysis/posterior.ts`: `w_j = L_amount · L_time · L_fp · L_struct`, normalisation, `H`, `N_eff`, claim via the existing classifier; returns top-k with `p_j` and assumption sentences.
- `analysis/taint.ts`: ≤ 3-hop flow estimate, cut `p < 0.02`, unresolved-mass residual.
- All modules pure (no I/O); audit records serialise to the wire shape the UI parses.

## §4 DELIVERABLES

1. Five modules + tests; `analysis/index.ts` exports; a `GOLDEN.md` in `apps/indexer/src/analysis/__tests__/` describing each golden case and its source transactions.

2. **`RoundTripIndex.ingest()` takes the WIDE rule** (added by LEDGER-07 fold 2, answering LEDGER-07 Q1). A **deposit requires a transparent input**; a **withdrawal requires a transparent output**. Today `ingest()` reads every `perPoolZat` leg as a deposit or a withdrawal, and a pool-to-pool crossing is neither - it did not come from the transparent side and it did not go there. One migration's arriving leg is filed as a deposit, a later unrelated migration's departing leg matches it on amount, and a `LinkRecord` is emitted whose two address fields are both `null`, because no transparent end exists. HANDOFF-07 reproduced it end to end in two polarities on committed code, one of them on pool legs byte-identical to base `eba5b03`, so the defect predates that handoff.

   The **narrow** guard L2 also considered (skip a report whose `perPoolZat` both gained and lost) is a symptom filter: it catches migrations because migrations happen to have that shape, and would keep letting through any future one-sided pool crossing. The wide rule is the definition of the thing. A round-trip is a claim about value entering and leaving the **transparent** side; a link between two addresses that do not exist is not a weak link, it is a category error, and a `LinkRecord` with two null address fields is the type system saying so.

   **ZIP 318 turns the collision from a coincidence into the expected case**, which is why this is not a tidy-up: quantising to `n x 10^k` is the entire migration scheme, so once Ironwood is live, two unrelated migrations of the same denomination are ordinary rather than rare.

3. **The 17 round-trip fixtures are rebuilt with a transparent side** (same fold). Deliverable 2 breaks 13 of the 17 existing round-trip tests, and they are **not 13 regressions - they are 13 fixtures that have been asserting the defect**, because every round-trip fixture in the tree has no transparent side at all. Give each the transparent end its assertion actually means: a shielding deposit gets a `vin` carrying an address, an unshielding withdrawal gets a `vout` carrying one. A fixture that keeps its null addresses after this deliverable is a fixture whose test is claiming something the wide rule forbids.

4. **`mixed` joins the `/track` row-class enum, and the SWEEP is the deliverable rather than the member** (LEDGER-07 fold 3, answering Q2). The enum is `shield | deshield | shielded | migration | transparent | undecoded`. A Sapling-to-Orchard transfer that also pays a transparent address is none of them: it is not a `migration` - a public recipient stands in it - and `shield`/`deshield` name a direction of transparent flow it has on one end only. It falls to the residual `shielded` while `analyze()` answers `MIXED`, which the enum cannot say.

   **Before widening it, enumerate every consumer of the enum and list them in §7** - producers, zod schemas, view builders, React components, fixtures, tests, and any `switch`, lookup table, CSS class map or sort order keyed on a member. This is the fourth session in a row in which widening a type produced the defect (HANDOFF-06's `Pool`, HANDOFF-07's `LeakClass` and `PoolPath`, and this), and in each the defect was in a consumer nobody swept, never in the widening. A consumer with a `default:` arm is not thereby swept: a default that silently absorbs a new member is how a wrong class renders without an error.

## §4b — SWEEP DISCIPLINE (applies to deliverables 2, 3 and 4)

Per CLAUDE.md's post-fan-out rule, `git status --porcelain` runs after every fan-out and before every commit, and §7 states what it returned. Per LEDGER-06 Q3, a widening or a narrowing runs every branch the old shape kept unreachable - enumerate the consumers and exercise the new member before shipping, and expect the type checker not to help wherever a value crosses a JSON, SQL or `zod` boundary.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** Golden 1: shield 50,000.960 at t, unshield 50,000.5541 at t+52 min in a window with no other candidates → grade `MEDIUM`, relative error `8.1e-6 ± 1e-7`, audit record `filter: 'amount_echo'`, `matchKind: 'RELATIVE'`.
- **A2.** Golden 2: the same pair under the v0.2 absolute tolerance only → no match (unit test proves the old rule misses it).
- **A3.** Golden 3: 7,875 → pool, 7,438.2295 back 20 min later, same address → grade `LOW` with `partial: true`; never `MEDIUM` or `HIGH`.
- **A4.** Golden 4: a 202,076.207 unshield with no in-window shield ≥ 100,000 → `claimLevel === 'aggregate_only'` and `N_eff > 1000`.
- **A5.** Subset-sum: shields {30,000, 20,000} and an unshield 49,999.98 within the window → a `k=2` split match graded `LOW` (and `MEDIUM` when the timing is < 1 h and the split count is 2 — test both).
- **A6.** Clustering: the three Dec 2025 withdrawals from `t1PKBiv7…` to `t1XKfbZY…` (inputs from one address, change back to self) are flagged `exchange-withdrawal-shape` with the change output identified (unit test from `cases.json`).
- **A7.** Labels: `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` → `consensus`; an unknown address → `behaviour`/none; precedence sorts `consensus` above `analyst` (unit tests).
- **A8.** Posterior: three candidates with weights 0.8/0.1/0.1 → `H ≈ 0.92 bits`, `N_eff ≈ 1.9`, claim `requires_disclosure` (unit test with tolerance 1e-3).
- **A9.** Property test: for random windows of shields/unshields, `Σ estimated exits ≤ Bal_pool` always holds and any estimator output violating it is rejected with a logged audit record (fast-check ≥ 300 runs).
- **A10.** `grep -rn 'fetch(\|postgres\|ioredis' apps/indexer/src/analysis` is empty (purity).
- **A11.** (LEDGER-07 fold 2, both polarities.) Two 500 ZEC Orchard-to-Ironwood migrations, ingested into one `RoundTripIndex` inside the window, produce **NO** `LinkRecord` *(fail side: revert `ingest()` to the pre-transparent rule and observe a link appear between strangers, with `senderAddress` and `recipientAddress` both `null`)*. **Corrected in execution, gate round 1:** the assertion said the link appears at `MEDIUM` / `FEE_TOLERANT`; the two legs carry the SAME amount, so the link is `HIGH` and `EXACT`. The grade named here would have been satisfied by an index that produced the wrong link at the right confidence, and it was written from the shape of the fee-tolerant case rather than from this one. **And the probe itself was a finding:** the test written for it (`round-trip.test.ts`) built a report that already had both transparent ends, so it passed with the wide rule in place AND with it reverted - a fail-side probe that does not fail, which CLAUDE.md makes a finding in its own right. It is now labelled a CONTROL, is built from the same legs as the pass state with one variable changed, and the discriminating pair is the control plus the two pass-state tests. The same must hold for the Orchard-to-Sapling pair HANDOFF-07 reproduced, whose pool legs are byte-identical to base `eba5b03`.
- **A12.** (LEDGER-07 fold 2.) A genuine shield/unshield pair **with** a transparent input on the deposit and a transparent output on the withdrawal still links, at the same grade it linked at before the wide rule *(fail side: strip the transparent side from the fixture and observe the link disappear)*. Without this, A11 is satisfiable by a `RoundTripIndex` that emits nothing at all.
- **A13.** (LEDGER-07 fold 3.) A transaction that moves value between two shielded pools **and** pays a transparent address renders as row class `mixed`, not as the residual `shielded` *(fail side: remove the `mixed` arm and observe it fall to another class, disagreeing with `analyze()`'s `MIXED`)*. **Corrected in execution:** the assertion said it falls to the residual `shielded`; it falls to **`shield`**. `valueFlow.direction` is `DEPOSIT` whenever ANY pool leg is negative, so a transaction with a transparent input satisfies the `shield` test and never reaches the residual - which is exactly why the `mixed` arm has to be tested BEFORE `shield` and `deshield` rather than after them, and is the substance of the member rather than a detail of it. The assertion's version was the milder failure; the real one publishes `flow: "t to z"` for a transaction whose transparent side is one end of three. Every consumer enumerated under deliverable 4 either handles `mixed` explicitly or is asserted to be unreachable for it.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Hard: `chain-integrator` (Sonnet) implements; `test-engineer` (Haiku) encodes §5 after PREFLIGHT (spec longer than a screen); `researcher` (Haiku) extracts the funding-stream addresses from the ZIPs with citations.
- director-quality re-judges every golden case against the code, not the test names.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/handoff-08-analysis-toolkit-bjvz3i
  PR #39  MERGED at 4386e98, 14:54Z 29 Aug, TEN MINUTES after its last push and
          while four gate lenses were still out. It carries the toolkit WITHOUT
          gate round 1's fixes and without this write-back.
  PR #40  the follow-up, and the one that matters. Same handoff, same ledger
          entry. Opened as a DRAFT deliberately - see the section 8 question.
  Commits in #39/main: c8ecfd5 reconcile - 5669b3a LEDGER-07's eight folds -
    de6b6f2 echo + wide rule - b746663 toolkit + `mixed` - fda4da1 A10 moved -
    6797113 the CI gap.
  Commits in #40: 8cf6597 L2's correction + gate rules - e45150e gate round 1 -
    cf69427 archive + status - (this write-back).

SPAWN MODE: proven by tool attempt at session start. Subagents available; six
  spawned in all, named below. No nesting.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  Gate round 1, four read-only lenses, all returned: correctness, spec,
    sweep, facts. ~65 findings between them.
  Gate round 2, two read-only lenses on the fix commit e45150e as its own
    commit: correctness, facts. BOTH RETURNED AFTER THE FIRST WRITE-BACK, and
    their findings landed as 23257e4. 32 findings, two HIGH from each lens,
    and every one of the four HIGHs is this branch's own work rather than
    something pre-existing - which is the whole argument for reviewing a fix
    commit as its own commit.
  Gate round 3, one read-only lens on 23257e4, the round-2 fix commit, for
    the same reason. Running at the time of writing.

FILES (created / modified / moved): 37 files, +1615 / -243 against 4386e98.
  CREATED
    apps/indexer/src/analysis/conservation.ts        TRACKING-MATH 3.11
  MODIFIED, the substantive ones
    analysis/{echo,clustering,labels,posterior,taint}.ts
    analysis/__tests__/{toolkit,echo,round-trip}.test.ts + GOLDEN.md
    apps/gateway/src/views/mempool.ts + its test
    packages/zec-types/src/{analysis,views,leaks}.ts
    packages/zebra-rpc/src/{schemas.ts,__tests__/client.test.ts}
    apps/web/src/lib/api/fixtures/{mempool,tx,address}.ts + three web tests
    legacy/dashboard/src/{lib/parsers.ts,hooks/useMempool.ts,
      components/CandidatesPanel.tsx,lib/mockData.ts}
    docs/2.0/{TRACKING-MATH.md,API.md} - CLAUDE.md - handoffs/{LEDGER,README}.md

EVIDENCE (per section 5 assertion: pass transcript + fail transcript,
provenance Executed/Read/UNVERIFIED). Every assertion got a MUTATION rather
than a reading (LEDGER-08 fold 4). Executed, test deaths per mutation:

  A1/A2  RELATIVE_EPSILON -> 0                          4 died
  A3     PARTIAL allowed to grade MEDIUM                 2 died
  A4     computePosterior renamed away                   4 died
  A5     MAX_SPLIT_COUNT -> 1                            4 died
  A6     detectExchangeShapes returns []                 3 died
  A7     labelsFor returns []                            2 died
  A8     shannonBits renamed away                        4 died
  A9     `if (true) return []` at matchEcho's head       4 died
  A9     double-claim guard disabled                     2 died
  A10    a `fetch(` added to an analysis module          1 died
  A11/12 the wide rule's two `continue`s disabled        5 died
  A13    the `mixed` arm removed                         3 died

  A9 IS THE ONE THAT MATTERS, and it is why this branch exists. Before the
  rewrite, `if (true) return []` at matchEcho's head killed NOTHING: the
  property checked `m.depositAmountZat > balance` per match, and
  `depositAmountZat` is a sum over a subset of the deposits whose total IS the
  balance. The assertion said sigma and the test never summed. Executed, on
  main at 4386e98: one 100 ZEC deposit and three 100 ZEC withdrawals in one
  window give 3 matches, grades HIGH/HIGH/HIGH, 30000000000 zat claimed
  against a 10000000000 zat pool. Now a named regression test beside the
  property, asserting the sum, and both rejection reasons run through
  production code.

  A11's FAIL SIDE WAS ITSELF A FINDING and is reported as one, not repaired
  quietly (CLAUDE.md, LEDGER-05 fold 7). It built a report that already had
  both transparent ends, so it passed with the wide rule in place AND with it
  reverted. Executed both ways. It is relabelled a CONTROL, built from the
  pass state's own legs with one variable changed; under the reverted rule the
  two A11 PASS tests die and the control stays green, and that pair is what
  discriminates. Third time this project has hit this shape.

  A8 could not be satisfied as stated - see section 8. Asserted at 15 digits
  instead, which is strictly stronger than the stated 1e-3.

  SEAM PROBE, Executed, beyond any assertion: the new `conservation` audit
  record and the `amount_echo` record both survive
  `auditRecordToEstimateFilter` and parse against `estimateFilterSchema`; a
  raw array or raw bigint left in `params` is REJECTED. The gateway validates
  every 2xx body before serialising, so an unflattened param is a 500 on /tx
  rather than a rendering oddity, and `flattenParam` is shown load-bearing in
  both polarities rather than sitting in front of a permissive schema.

  DELIVERABLE 4's CONSUMER ENUMERATION, as section 4 requires it be listed
  here. Every consumer of the row-class enum, and what each needed:
    packages/zec-types/src/views.ts    the zod enum          WIDENED
    apps/gateway/src/views/mempool.ts  the producer          `mixed` arm placed
      BEFORE shield/deshield, exhaustive switch + assertNeverClass, mixedFlowText
    apps/web/src/lib/api/stream.ts     hand-copied CLASSES   WIDENED (without it
      asView returns null for the WHOLE snapshot - one row empties /track)
    apps/web/src/lib/mempool-summary.ts tile + header        `mixed` counted into
      the shielded numerator; the remainder is named rather than dropped
    apps/web/src/lib/api/fixtures/mempool.ts  the corpus     gained a `mixed`
      row; row 9f8e7d6c reclassified from `migration`
    apps/web/src/components/track/MempoolPanel.tsx           renders it as text
    apps/web/src/app/track/page.tsx    a hardcoded "twelve"  now the real count
    legacy/dashboard/{parsers,useMempool,CandidatesPanel,mockData}  three
      switches gained `conservation` arms; the fourth implicit else fixed
    tests: gateway mempool-view, web fixtures + mempool-summary

GATE COMMANDS, all Executed and green on cf69427:
  pnpm -r test    1047 passed, 1 skipped   (953 + 1 at HANDOFF-07)
    content 67 - web 368 - zebra-rpc 38 - gateway 128 - indexer 445 + 1 skipped
  pnpm typecheck  10/10      pnpm lint  0
  pnpm --filter @zcashreveal/content validate  OK
  pnpm check      five guards OK
  pnpm build      OK, and the Vercel preview DEPLOYED on this branch
    ("Deployment has completed", 92ze7J1f3VmmCRgJkSfP3CfhsBrT) - the pnpm build
    half of the HANDOFF-07 lesson confirmed in the real build environment.
  CI on cf69427: "typecheck, lint, test" success, 15:35:01Z.

POST-FAN-OUT SWEEP (CLAUDE.md's rule, run after each fan-out and before each
commit): `git status --porcelain` returned only paths this session edited
deliberately, plus the one file it created (conservation.ts). No read-only
worker wrote to the tree in either round. Run again after the mutation sweep
and after the seam probe: clean both times; the probe lives in the scratchpad,
outside the repository.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):
  CORRECTED  section 1.3's fresh-address rule is NOT the whole change rule. On
    section 1.4's own worked case the two disagree and 1.4 is the one with a
    transaction under it. Ordered 1.4 first; `guessChange` and
    `detectExchangeShapes` now agree.
  CORRECTED  a coinbase vin is not a transparent source in the gateway either.
    An inference beyond L2's fold - see section 8.
  CORRECTED  `p_change` applies to the change-to-self output; that branch
    extends no cluster, because the address is already a member by 1.2.
  CORRECTED  section 3.4's heading says three tolerances and its body lists
    four. Implemented four and said so, rather than citing the section for a
    number it does not state.
  ACCEPTED   0.8 for `p_change`, the conservative end of the Bitcoin
    literature, every ChangeGuess carrying `calibrated: false`.
  ACCEPTED   greedy assignment in conservation.ts is not optimal, deliberately.
  DEFERRED   epsilon, tau and p_change are all uncalibrated on Zcash; the
    corpus that would calibrate them arrives with HANDOFF-10.
  DEFERRED   `Cand_0` in the A4 fixture is a stand-in (4,096, so log2 is exact)
    and not a measurement. The real one needs a note commitment tree.

NOTICED (outside scope, not acted on):
  - `apps/gateway/src/address.ts` states ZIP 320's bech32m encoding from
    recall; no corpus source carries it. Same class as the YWALLET delta this
    handoff withdrew, one step milder because an encoding is checkable.
  - `stream.ts`'s CLASSES is a hand-copied enum with no compile-time link -
    section 8.
  - The v0.2 count form of ZIP 317 over-credits from 75 inputs; recorded in
    TRACKING-MATH 3.5, untouched here.

UNVERIFIED (labelled):
  - No golden case has met chain data. Provenance is the corpus, which states
    it queried Blockchair on 2026-08-22. HANDOFF-10's captured block is the
    first point at which any of these figures meets a node.
  - No session can reach the preview host (CONNECT tunnel 403), so no
    Lighthouse number comes from here. The deployment READY state above is
    read from Vercel's commit status, not from fetching the page.
  - Gate round 2's two lenses had not returned. Their absence is the largest
    unverified thing in this report.

GATE ROUNDS: 2 (the second incomplete) - fingerprints (file - rule - severity)
  ROUND 1, four lenses, ~65 findings. The ones that changed behaviour:
    analysis/echo.ts            - one deposit answers many withdrawals - HIGH
    __tests__/toolkit.test.ts   - A9 is a tautology                    - HIGH
    __tests__/toolkit.test.ts   - A9's fail side asserts the test      - HIGH
    analysis/clustering.ts      - change guess inverted on 1.4's case  - HIGH
    analysis/clustering.ts      - self-consolidation recorded as evidence - MED
    analysis/taint.ts           - cut mass filed as a destination      - MED
    analysis/taint.ts           - non-finite weights propagate         - MED
    gateway/views/mempool.ts    - coinbase counted as transparent source - MED
    analysis/labels.ts          - consensus label with sources: []     - MED
    analysis/echo.ts            - EXACT with a rival graded MEDIUM     - MED
    echo.ts findSubsetSum       - re-check unreachable, untested       - MED
    round-trip.test.ts          - A11 fail side does not discriminate  - MED
    round-trip.test.ts          - Ironwood balance hardcoded 0n        - MED
    zebra-rpc/client.ts         - `trees` shipped with no test         - MED
    plus ~20 fact and citation corrections, swept across the tree.
  ROUND 2, the review of e45150e as ITS OWN COMMIT - not a gate round but
    part of shipping a fix, because three sessions running have had round N's
    fix create round N+1's defects (HANDOFF-07 measured three of five and
    three of seven). Two lenses, 32 findings. IT HAPPENED AGAIN, FOUR TIMES:
    conservation.ts        - one-to-one on the deposit side only     - HIGH
    conservation.ts        - sums deposits where 3.11 bounds exits   - HIGH
    TRACKING-MATH.md 3.6   - "Ledger absent from the corpus", false  - HIGH
    views.ts + gw test     - the A9 sweep left two sites stating it  - HIGH
    clustering.ts          - roundness branch merges a third party   - MED
    gateway/mempool.ts     - coinbase rule reaches shield not migration - MED
    gateway/mempool.ts     - the lane swatch keeps the coinbase vin  - MED
    conservation.ts        - "deterministic" false; tie not total    - MED
    conservation.ts        - two of four sort keys unverified        - MED
    taint.ts               - all three fixes revertible, green       - MED
    gateway/mempool.ts     - the coinbase fix had no test at all     - MED
    echo.ts + panel        - the grade sweep left two sites stating MEDIUM - MED
    taint.ts               - an invented float in a rigour argument  - MED
    labels.ts              - 1.5 cited as a source for the encoding  - MED
    echo.ts                - a third conjunct added, untested        - MED
    fixtures/mempool.ts    - six names changed, docblock said five   - MED
    mockData.ts            - FEE_OUTLIER over "fee is conventional"  - MED
    plus nine LOW, and eleven mutations that had survived now die.

  THE MEASUREMENT THIS SESSION ADDS TO THE PATTERN: round 1's fix commit
  introduced two HIGH defects and left nine mutations alive. Both HIGHs were
  in the module WRITTEN TO FIX A DEFECT OF EXACTLY THAT SHAPE - the
  conservation sieve enforced one-to-one on one side of the assignment and
  bounded the wrong quantity - and one of the fact HIGHs was a correction
  that repeated the error it was correcting, about a named company. Three
  sessions is a pattern; four is the rule this project already wrote down.

  ROUND 3, the review of 23257e4, for the same reason. One lens, running.

  THE EXTRAPOLATION, STATED RATHER THAN CONVERGENCE CLAIMED (LEDGER-07 Q6
  part iii), AND THE FIRST VERSION OF IT WAS WRONG, WHICH IS WORTH KEEPING.
  After round 1 this report predicted that a further round would find "one or
  two more, of round 1's LOWER reach - a wrong ordinal, a citation off by a
  section". Round 2 found four HIGHs, two of them arithmetic-and-logic defects
  in new production code and one a false statement about a named company. The
  prediction was wrong in the direction that flatters the branch, and it was
  made about a commit this session had written, which is the condition under
  which such a prediction is least reliable.

  So the revised extrapolation, with that on the record: round 3 probably
  finds one or two more findings of round 2's reach, not round 1's, and the
  likeliest sites are the ones round 2 changed rather than the ones it only
  read - `conservation.ts`, which has now been rewritten twice, and the
  gateway class ternary, which has three coinbase-dependent predicates where
  it had none. What no round should find again is another A9: that shape - an
  assertion quantifying over an aggregate and a test checking an element - is
  now a rule in CLAUDE.md rather than something a reviewer must notice.

PREVIEW URL: zecreveal-git-claude-handoff-08-analysi-9ef32e-aquatic-17b9f112
  .vercel.app - DEPLOYED, and unreachable from any session.
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):

 Q1. TWO OF SECTION 1.5's FOUR CONSENSUS LABEL FAMILIES ARE NOT IN THIS
     REPOSITORY, and are refused rather than invented. The ZIP 1014/1015/1016
     funding-stream recipient addresses and the Founders' Reward addresses: the
     repo holds every percentage and every activation height and not one
     address. Both are named in `UNSOURCED_CONSENSUS_LABELS`, the same artefact
     `fingerprint.ts` uses for the wallets whose deltas nobody can source.
     Writing either from recall would have produced strings indistinguishable
     from the sourced ones carrying `consensus`, the strongest label this site
     issues. To close: the recipient addresses per height from the ZIPs or from
     a node's consensus parameters (Zebra's funding-stream tables), and the
     historic Founders' list from the original chainparams. A session cannot
     fetch a ZIP - zips.z.cash is refused by the egress proxy with CONNECT
     tunnel 403. Note ECC's and ZF's streams ENDED at NU6 (block 2,726,400), so
     a complete implementation is historical for two of three recipients.

 Q2. A8's STATED TOLERANCE IS NOT SATISFIABLE BY THE CORRECT ANSWER.
     H(0.8, 0.1, 0.1) = 0.9219280948873623, which is 1.93e-3 from the stated
     0.92 against a stated tolerance of 1e-3; N_eff = 1.8946457081379975, which
     is 5.35e-3 from 1.9. The two halves of the assertion were written to
     different precisions: 0.92 and 1.9 are two-figure roundings and 1e-3 is a
     tolerance for three. Resolved by asserting the exact values at 15 digits -
     strictly stronger than asked - and the rounded figures at the precision a
     two-figure rounding implies. Neither wrong repair was taken: not loosening
     the tolerance silently, not "fixing" the module until it emits 0.92, which
     would mean breaking the entropy formula to satisfy a literal.

     AND A CORRECTION TO THIS QUESTION AS IT WAS FIRST WRITTEN, because it is
     an instance of its own subject. This session first recorded A8 as "the
     fifth section 5 assertion not to survive literal execution". THAT ORDINAL
     IS WRONG AND THE LEDGER ALREADY SAID SO: LEDGER-03 records "the fourth
     section 5 assertion in three handoffs that does not survive literal
     execution", and HANDOFF-04's A3 probe, HANDOFF-06's Q4 test and
     HANDOFF-07's A4 unit collision each came after it. A running tally nobody
     can recount from where it sits decays silently, and here it decayed in the
     direction that UNDERSTATES the pattern. The ordinal is struck rather than
     re-counted; `analysis-purity.test.ts` shows the form that holds, which
     names its three predecessors instead of counting them.

 Q3. THE COINBASE NARROWING IS AN INFERENCE BEYOND THE FOLD'S WORDING AND
     NEEDS A RULING. LEDGER-07 fold 2 gave the wide rule as "a deposit requires
     a transparent input; a withdrawal requires a transparent output".
     `round-trip.ts` implements the source half as `vin.some(v => !v.coinbase)`
     - a coinbase input has no prior owner, so it is not somebody's transparent
     funds entering the pool. The gateway's `shield` test did not, so a ZIP 213
     coinbase paying a shielded recipient published `class: "shield"`,
     `flow: "t to z"`, asserting a transparent sender for a transaction that
     has none. One rule with two answers across two files, which HANDOFF-06's
     A9 rules out. Aligned here, so such a transaction falls to the `shielded`
     residual. TWO THINGS TO RULE ON: whether "transparent input" in the fold
     was meant to exclude coinbase (this session read it as yes), and whether
     `shielded` is the right destination or whether the row-class enum wants a
     `coinbase` member - which would be another consumer sweep, so it is asked
     rather than done.

 Q4. `apps/web/src/lib/api/stream.ts`'s `CLASSES` SET IS A HAND-COPIED
     DUPLICATE OF THE ROW-CLASS ENUM WITH NO COMPILE-TIME LINK, and it has now
     had to be taught two members in two handoffs. When it lags, `asRow`
     rejects the row and `asView` returns null for the WHOLE snapshot - one
     unrecognised transaction empties /track, and the failure looks like a dead
     feed rather than a schema drift. The named fix is to derive it from
     `mempoolRowSchema` (`mempoolRowSchema.shape.class.options`) so the two
     cannot diverge. Not done here: it is a change to the live snapshot parser
     and this handoff had no assertion covering it, so it is proposed rather
     than taken.

 Q5. SECTION 1.3 AND SECTION 1.4 DISAGREE ABOUT WHICH OUTPUT IS CHANGE, ON
     1.4's OWN WORKED CASE, AND THIS SESSION ORDERED THEM. 1.3: "the fresh one
     is change". 1.4: an exchange withdrawal is "one payout + change back to
     the *same* address", with t1PKBiv7 on 24 Dec 2025 - 120,552.69 in,
     29,999.99 out, 90,552.70 back. There the change is the REUSED output.
     `guessChange` implemented 1.3 literally and therefore named the payout as
     change, while `detectExchangeShapes` four functions away named the other
     one; the module answered one transaction two contradictory ways and the
     test pinned the wrong answer. This is not cosmetic: a change output
     extends the cluster with weight p_change, so naming the payout as change
     soft-merges the WITHDRAWING CUSTOMER's address into the exchange's
     cluster - a claim that two different parties are one, about a named
     exchange's counterparty. Ordered 1.4 first, and that branch extends no
     cluster because the address is already a member by 1.2. RULING WANTED on
     the ordering, and on whether section 1.3 should be amended in
     TRACKING-MATH rather than only ordered beneath 1.4 in code.

 Q6. THE LOOP QUESTION, WHICH IS L2's AND IS RECORDED HERE AS ASKED. PR #39
     opened before the gate finished, was marked ready for review by the
     operator, was read by L2 as a finished branch and verified as one, and was
     merged while four lenses were still out. Every tier behaved reasonably in
     isolation. L2's finding F-08-1 said "the write-back did not happen", which
     was true of the tree and wrong about the cause: the write-back had not
     happened because the session was not finished, and `status: in-progress`
     in the front matter said so correctly. The loop has no signal for "this
     branch is not ready to be read yet" that survives contact with a green CI
     badge. L2 proposes two halves: the PR stays a DRAFT until the write-back
     commit lands, and L2 declines to verify any branch whose handoff front
     matter is not `status: shipped`. Both are needed - the first is a signal,
     the second is L2 agreeing to read it. PR #40 is opened as a draft as the
     first instance of the first half.

     L3's ADDITION, from having been the tier that was read too early: the
     draft flag fixes WHEN a branch is read and not WHAT the reader checks.
     A9 had a property test, 300 runs, a fail-side and a green badge - every
     surface signal a reader consults - and the condition could not fail.
     LEDGER-08 fold 3 is the half that addresses the second, and it is now in
     CLAUDE.md's gate contract: a property test is verified by executing the
     concrete scenario it exists to forbid, against the pre-fix code.

 Q7. FIVE THINGS GATE ROUND 2 RAISED THAT ARE OPEN RATHER THAN FIXED, listed
     so they are not lost between handoffs.
     (a) `EchoMatch` CARRIES NO POOL, so `enforceConservation` cannot partition
         by pool - and section 3.11 is stated "for every pool and window". A
         Sapling withdrawal can match an Orchard deposit and be charged against
         the Sapling balance. `matchEcho`'s pool-blindness predates HANDOFF-08;
         the new module claims a per-pool law it has no field to key on. The fix
         is to carry `pool` on `EchoMatch` (it is on both `BoundaryEvent`s) and
         either take a per-pool balance map or refuse a mixed-pool set. Not done
         here because it changes the estimator's public type and no assertion
         covers it.
     (b) NOTHING ON A PRODUCTION PATH CALLS THE NEW LAW. `enforceConservation`,
         `violatesConservation`, `guessChange` and `clusterByCommonInput` are
         referenced only by `index.ts` and by tests. Section 3.11 is therefore
         AVAILABLE, not ENFORCED, and this session's own commit message read as
         the latter. HANDOFF-12 is the wiring; until it lands, `main` shipping
         the estimator without the sieve is a live defect and shipping the sieve
         unwired is not yet a fix for any rendered page.
     (c) The section 1.4 override is unavailable when the caller could not
         resolve an input address - `spending` is built from vin entries that
         are neither coinbase nor null-addressed - so a transaction with an
         unresolved prevout still runs section 1.3's rule unguarded, which is
         the condition under which the mislabel it exists to prevent happens.
         Stated in the docblock; the fix is upstream.
     (d) `legacy/dashboard`'s `parseFilterApplication` cannot produce a
         `conservation` or an `amount_echo` record - it returns an inert
         `time_window` for anything it does not know - so the arms this branch
         added to `CandidatesPanel` are unreachable and such a step would render
         as a time-window narrowing that removed nothing. LOW only because
         `legacy/` is retired at the HANDOFF-11 cutover.
     (e) Section 3.11's second half, `Bal^p >= 0`, is quoted at the head of
         `conservation.ts` and not implemented: a negative balance is accepted
         and expressed only as "everything rejected for exceeding the balance",
         which is a different diagnosis from "the balance handed to this sieve is
         impossible".

 Q8. THE MEASUREMENT THIS HANDOFF ADDS TO THE FIX-COMMIT PATTERN, which is now
     four sessions old and is a property of this codebase rather than of any
     session. Round 1's fix commit introduced two HIGH defects and left nine
     mutations alive, and BOTH HIGHs were in the module written to fix a defect
     of exactly that shape: the conservation sieve enforced one-to-one on one
     side of the assignment and bounded the deposit side where section 3.11
     bounds exits. A third HIGH was a correction that repeated the error it was
     correcting - "Ledger is absent from the corpus", in the commit whose
     message says that row "was wrong in both halves" - and a fourth was a
     sweep that left two sites still stating the superseded claim.

     What that suggests about the instrument, offered rather than asserted: the
     dangerous commit is not the one that adds a feature, it is the one that
     fixes a defect, because the author has just proved they hold a wrong model
     of the thing they are editing. The rule already says to review it. This
     session's evidence is that the review should be POINTED AT THE FIXER'S
     STATED REASONING - each of the four HIGHs is visible in the fix commit's
     own message, phrased with more confidence than the code earned.

INFERRED (non-empty inferences a worker made):
  - That section 3.4's four bullets are four rules despite a heading saying
    three. Implemented four; `analysis.ts` quotes the heading verbatim so the
    two files do not silently disagree.
  - That "round" in section 1.3 means a whole number of ZEC or better. Recorded
    in `isRoundAmount`'s docblock. 29,999.99 is therefore NOT round, which is
    the answer that keeps the heuristic off the wrong output on 1.4's example.
  - That a TEX label's provenance is weaker than its rank: cited to the ZIP
    publisher the corpus registers, at `confidence: "med"`, with the docblock
    saying the ZIP text has not been read in this repository.
  - That greedy-by-grade is the available proxy for section 4's "greedy by
    weight" in conservation.ts, grade being what the echo emits.

NOT-MATCHED (patterns handed over that did not apply):
  - Deliverable 4's warning that "a consumer with a `default:` arm is not
    thereby swept" did not fire: no row-class consumer had a silent default.
    The one that bit was the opposite shape - `stream.ts`'s hand-copied set,
    which REJECTS rather than absorbing, and takes the whole snapshot with it.
  - LEDGER-06 Q3's "dropping a NOT NULL runs every branch the constraint kept
    unreachable" had no migration to apply to here. Its generalisation did
    apply, twice: `WalletGuess` NARROWING (YWALLET, EDGE) and the row-class
    enum WIDENING both needed the same consumer enumeration.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):
  - A8's tolerance, Q2 above.
  - Section 3.4's "three tolerances" heading over four bullets.
  - A11's fail side named MEDIUM/FEE_TOLERANT; the legs carry the same amount,
    so the link is HIGH/EXACT. The stated grade would have been satisfied by an
    index producing the WRONG link at the right confidence.
  - A13's fail side said the row falls to `shielded`; it falls to `shield`,
    because `direction` is DEPOSIT whenever any pool leg is negative. The
    assertion described the milder failure; the real one publishes
    `flow: "t to z"` for a transaction whose transparent side is one end of
    three - which is exactly why the `mixed` arm goes BEFORE shield/deshield.
  - A7's "an unknown address -> `behaviour`/none" reads as a choice. It is
    none: a behaviour-tier label still has to have been MADE by someone looking
    at behaviour, and manufacturing one would put a label on every address on
    the chain.

GATE ROUND COUNTS: round 1 four lenses, ~65 findings, 14 changed behaviour.
  Round 2 (the fix commit reviewed as its own commit) two lenses, NEITHER
  RETURNED at write-back; reported as work rather than as a clean round.
  Extrapolation stated in section 7 rather than convergence claimed.

DEFERRED ASSUMPTIONS:
  - epsilon, tau and p_change uncalibrated on Zcash; HANDOFF-10's captured
    blocks are the first corpus that could calibrate them.
  - `Cand_0` in the A4 fixture is a stand-in, not a measurement.
  - The ZIP 320 encoding rests on recall throughout the tree, including
    `apps/gateway/src/address.ts`, which decodes it.
  - The standing `IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP` exposure is unchanged.
```
