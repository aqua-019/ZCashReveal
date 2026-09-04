# PROMPT-16 — the messages that steered the HANDOFF-16 session

Archived verbatim under Revolution protocol step 5. One file per handoff, each message under a
heading naming what it is and when it arrived. This first message lands in the same commit as
RECONCILE (LEDGER-02 Q7); anything that arrives mid-session is appended in the next commit.

**THIS PROMPT CARRIES AN `L2 RESOLUTION` BLOCK, SO REVOLUTION PROTOCOL STEP 2 APPLIES.** The block
is headed `# L2 RESOLUTION - HANDOFF-15 (PR #57)` and is appended verbatim to `handoffs/LEDGER.md`
beneath the HANDOFF-15 ledger block. It returns a MERGE verdict on PR #57, rules on the three open
section 8 questions, adopts F-57-1 as a new rule, amends stopping-rule clause (c) to name a
design-justifying docblock as the site to look at first, and records one defect of L2's own in the
HANDOFF-15 brief plus one false alarm in L2's own gate harness. Those folds are applied to
`CLAUDE.md` in the same commit as the append.

## Message 1 — the session kickoff, carrying the L2 RESOLUTION for HANDOFF-15 and §1-§6 of a handoff that did not exist yet (4 Sep 2026, session start)

Arrived as the opening user turn with one attached file, `PROMPT16.md`, whose contents are the whole
of the message. The turn carries the kickoff line, the fork-point proof obligation against
`640865a`, the L2 RESOLUTION for HANDOFF-15 (PR #57), DELIVERABLE 0 (write the handoff), and §1
through §6 of HANDOFF-16. Reproduced below in full, from its first line to its last, byte for byte.

---

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Report spawn mode first. Stop at PR opened.

**Fork from the head of `main`, and prove it before you touch anything:** `git merge-base --is-ancestor 640865a origin/main` must exit 0 - `640865a` is HANDOFF-15's post-PR e2e record and its presence is how you know PR #57 landed whole. If it exits 1, STOP. Record the SHA you forked from in section 7.

---

# L2 RESOLUTION - HANDOFF-15 (PR #57)

**VERDICT: MERGE.** No changes requested. One finding recorded below for rung 3, measured live; it does not block. Verified independently on a clean worktree at `6ec7735`.

## What L2 executed

```
INSTALL_RC=0  TEST_RC=0  TYPECHECK_RC=0  LINT_RC=0  CHECK_RC=0  BUILD_RC=0
1597 passed | 5 skipped        git status --porcelain empty
```

**An exact match to section 7's healthy figures.** Postgres and Redis were up for this run.

**AND A FALSE ALARM OF L2's OWN, RECORDED BECAUSE IT IS THE FOURTH OF ITS KIND.** L2's first pass returned `TYPECHECK_RC=2` with fifteen errors - `Module '@zcashreveal/zebra-rpc' has no exported member 'RateGate'`. **That was L2's harness, not this branch:** the harness runs `build` LAST, so `zebra-rpc/dist` was still the artefact from the PR #56 checkout and the indexer typechecked against a stale package boundary. `pnpm --filter @zcashreveal/zebra-rpc build` then `pnpm -r typecheck` exits 0. **A cross-package export added in the same PR that consumes it is invisible until the producing package is rebuilt**, and a gate whose build step runs last cannot see it. HANDOFF-16 should build before it typechecks.

## THE SEVENTH GATE, RUN BY L2 TOO - AND THE ORDER-DEPENDENT TEST DID NOT REPRODUCE

`640865a` landed after the head L2 gated and is DOCUMENTATION ONLY - +52 lines across two handoff files, no product code, no test code - so the verdict on `6ec7735` stands unchanged. What it records is a seventh gate the session ran after opening the PR, and one failure in it. L2 ran the same gate on merged `main` at `f976477`:

```
pnpm --filter @zcashreveal/web test:e2e      192 passed (6.7m)   E2E_RC=0
legibility.spec.ts:718  (HANDOFF-04a A1 fail side)               PASSED
```

**Full-suite parallelism, same conditions, and it did not reproduce.** The count is now n=1 failure against **n=3 isolated passes, n=1 CI pass, and n=1 independent full-suite pass in a different container**. That is still not a diagnosis and it is still not enough to call it a flake - the session was right to record it rather than fix it, and right to refuse to widen the PR into HANDOFF-04a's spec on one observation. It stays recorded, with L2's data point added.

## Three adversarial mutations

| mutation | result |
|---|---|
| remove the `res.status === 429` early throw (reverts S1) | **10 failed** in `zebra-rpc` |
| force the mock's refusal content-type to JSON for every shape | **0 failed - CORRECTLY** |
| neuter `#publishRefusal` so a refused tick publishes nothing (reverts S2) | **1 failed** - *"expected [...] to have a length of 2 but got 1"* |

The middle row is a null result and it is the right one: once the status decides before the body, the body's content-type cannot change the outcome, which is the entire point of the S1 fix. The three-body loop is not thereby vacuous - row one proves it discriminates.

## THE FINDING: THE REAL ENDPOINT SENDS A FOURTH 429 SHAPE, AND THE MOCK EMITS THREE

L2 reached the live endpoint (container-scoped wall, as section 7 records) and captured an actual refusal:

```
--- 429 headers ---            --- 429 body ---
  retry-after: 60              {"statusCode": 429, "message": "You have exceeded your limit
  content-type: application/json    of 5 requests per minute. To increase this limit, upgrade
  x-ttm-plan: anonymous             to a Paid plan with 200 requests per second..."}
```

Driven through **this repository's own `envelopeSchema`**:

| body | parses | reaches the error-object branch |
|---|---|---|
| **REAL Tatum 429, measured 4 Sep** | **true** | **false** |
| the mock's `envelope` | true | true |
| the mock's old string-error | false | false |

**It parses and it takes NEITHER branch.** `result` absent, `error` absent, `.passthrough()` admits it. That is a *third* escape route from the pre-fix ordering, distinct from both the HTML page and the JSON-RPC-wrapped limiter that round 3 found - and it is the one the production endpoint actually sends.

**THE SHIPPED FIX COVERS IT.** `res.status === 429` throws before the body is read at all, so the branch is unreachable. Nothing here is broken and nothing needs changing to merge.

**What it does is settle Q1 by measurement.** The proposed clause is not a reasonable-sounding generalisation; it is already violated by the mock one commit after being proposed, and only the status-first fix hides it. Add the shape in rung 3, three lines.

## Two things this settles that section 8 marked open

- **`Retry-After` IS sent on a real refusal** - `retry-after: 60`, so the code that reads it is reading something that exists.
- **No `X-RateLimit-*` headers on either a 200 or a 429.** Only `x-ttm-plan: anonymous`. **The deferral in section 8 is correct and can now be closed as measured rather than assumed.**
- And the ceiling is confirmed by the provider's own words: *"your limit of 5 requests per minute"*, matching L2's burst measurement of exactly five.

## Ruling on the section 8 questions

**Q1 - "a fail side's input must be one a real producer can emit, and where several can, the mock emits all of them". ADOPTED as F-57-1.** The existing wording genuinely would not have caught it: `{error: "rate limited"}` IS a data mutation from inside the exclusion set "a 429 response" - it is just the one member no real endpoint sends. **The clause earns adoption on measurement, not on argument:** L2 captured the production body above and the mock does not emit it, so the rule has a live counter-example on the day it was proposed. **F-57-1: an exclusion-set member must be a shape a real producer emits. Where a producer emits several, the mock emits all of them, and the set is closed by CAPTURE from the real producer rather than by enumeration from memory.** The last clause is the operational half and it is what this finding demonstrates.

**Q3 - should clause (c) say WHERE to look first? ADOPTED.** Yes, and the session has already named the site precisely: **a docblock that gives a REASON for a design is asserting the reason, and the reason is usually the untested half.** All three of this session's true-of-nothing sentences had that shape - "no TTL, *because* the gateway renders a stopped indexer differently"; "the mempool view is now aging"; "degrades to stated absences, *never* to zeros". Each described a behaviour the author intended and then did not write, which is why reading the code against the comment finds agreement in intent and disagreement in fact. **Clause (c) now reads: execute the sentence, and start with docblocks that justify a design decision by asserting a behaviour elsewhere in the system.**

**Q5 - the origin count from LEDGER-09b Q3 does not move. ACCEPTED, and the practice half is the right answer.** Running the CI-only guard locally before the push is what kept the count at five. The structural half - that a session still has to know to run it by hand - stays open; it is not rung 3's subject and should not be smuggled in.

**The INFERRED reading is correct.** The confirmed-block follower not starting without a database is a configuration, not a regression. Section 1 put confirmed blocks out of scope, and running it on `MemoryChainStore` would be rung 3's work done quietly inside rung 2. Rung 3 is where it belongs and it is below.

## L2's own defect, and it is the second in two handoffs

PROMPT-15 section 1 asserted: *"The mempool path is already RPC-only by construction: nothing in that loop reads Postgres."* **Read against `c12826a`, it reads Postgres and writes it.** L2 confirms all three sites independently:

```
apps/indexer/src/decoder/anchor-depth.ts:57   SELECT height FROM anchors
apps/indexer/src/index.ts:254                 persistLeakReport(sql, d.report)
apps/indexer/src/index.ts:61                  createDb(cfg.DATABASE_URL), unconditional
apps/indexer/src/config.ts:12                 a localhost default, so the URL is never absent
```

and the mempool path reaches the first through `analyze` at `index.ts:209` by way of `AnchorRegistry`. **"No database" was work, not a description**, and the session was right to promote it to deliverable 6 under LEDGER-11 Q5(a) rather than footnote it.

**This is F-56-1 violated by the author of F-56-1, in the same file that adopted it.** L2 wrote a premise about `apps/indexer/src/index.ts` without reading `apps/indexer/src/index.ts`. The rule is sound; the failure is that L2 applied it to the session's probes and not to its own briefs. **The correction is that F-56-1 binds the brief as well as the probe: a section 1 claim about a module is a claim, and it gets read first or it gets labelled UNVERIFIED.** Section 1 below marks its own unread claims accordingly.

---

# HANDOFF-16 BRIEF

**YOUR HANDOFF DOES NOT EXIST YET. WRITING IT IS DELIVERABLE 0.** Create `handoffs/HANDOFF-16-crossings-forward.md` from §1–§6 below, `status: in-progress`, track `Integration`, `depends_on: 12, 15`, `written_by: L2 (Cowork) · 2 Sep 2026`.

**RUNG 3 OF THREE, AND THE ONE THAT FILLS THE PLANE.** 14 put live balances on the site; 15 put live transactions on it. This puts **crossings** on it — the marks on the turnstile plane, which today draws from a fixture.

**AND IT STILL NEEDS NO SYNC.** `runtime/startup.ts:23` — `INDEXER_START_HEIGHT` is *"the first block to index on a COLD store"*, and `chainBaseFromBlock` opens the base by the block's own figures. The runtime was built in HANDOFF-12 to start at a recent height and follow forward. Nothing here backfills history.

---

## §1 SCOPE

Run the confirmed-block driver against a **third-party RPC endpoint**, opening at a recent height, so `migrationHist` accumulates real ZIP 318 crossings from that height forward and the plane draws measured marks.

L2's measurements — check them, and say in §7 where they were wrong:

| what | measured |
|---|---|
| confirmed-block cost | ~1 `getblock` per 75 s ≈ **0.8/min** — inside even the keyless 5/min ceiling |
| history required | **none.** Open the base at a recent height |
| the seven methods this stack calls | `getBlock`, `getBlockHeader`, `getBlockchainInfo`, `getBlockchainInfoFull`, `getRawMempool`, `getRawTransaction`, **`getTreestate`** |
| **`z_gettreestate` on the keyless endpoint** | **`Method not found`.** Six of seven served; this one is not. **UNVERIFIED AS OF 4 SEP - L2 measured this on 1 SEP and has NOT re-probed it.** Deliverable 1 settles it; do not carry it as fact |
| what that costs | the Ironwood anchor never forms. The driver writes the block, logs the notice and records **no anchor** — never a fabricated root, as §4 requires. Every later spend citing it is `UNKNOWN_ANCHOR` **permanently**, because there is no backfill (LEDGER-12 Q2) |
| the address index | three of the nine methods, one file — `apps/gateway/src/views/address.ts`. Not needed |

**So `z_gettreestate` availability is this rung's gating fact, and an operator must learn it before the driver runs, not weeks later from a query.** That is what deliverable 1 is for.

**AND TWO THINGS ARRIVE FROM RUNG 2, BOTH SMALL, BOTH MEASURED BY L2 ON 4 SEP:**

1. **`MockRpcEndpoint` gains a fourth refusal body, and it is the one production sends.** Captured live:
   `{"statusCode": 429, "message": "You have exceeded your limit of 5 requests per minute..."}` - it PARSES and reaches NEITHER the error-object branch nor the parse-failure branch, a third escape route from the pre-fix ordering that round 3 did not find because no mock emitted it. **The shipped status-first fix already covers it**, so this is closing the exclusion set, not fixing a defect. Add it beside `envelope`/`bare`/`html`, drive it through the same loop, and **capture it rather than transcribing it from this prompt** - that is F-57-1's operational half.
2. **The rate-limit deferral in LEDGER-15 can be CLOSED, not carried.** L2 dumped the real headers on both a 200 and a 429: `retry-after: 60` is present, and there is **no `X-RateLimit-*` header of any kind** - only `x-ttm-plan: anonymous`. The session's judgement was right; record it as MEASURED and stop deferring it.

**AND BUILD BEFORE YOU TYPECHECK.** L2's own gate reported fifteen phantom type errors on this PR because it ran `build` last and the indexer typechecked against a stale `zebra-rpc/dist`. A cross-package export added in the same PR that consumes it is invisible until the producing package is rebuilt.

**`legibility.spec.ts:718` IS OUT OF SCOPE AND THAT IS A RULING, NOT AN OVERSIGHT.** HANDOFF-15 recorded it failing once locally under full-suite parallelism with the plant confirmed landed, against 3 of 3 isolated passes and a green CI run on the same head, and correctly refused to call it a flake or widen the PR into HANDOFF-04a's spec. **L2 agrees and adds its own n** - see the resolution above. If it fails for you too, record the observation with its n and leave it; if the count ever reaches the point where the fail side is shown to be non-discriminating at random, that is LEDGER-05 fold 7 and it earns its OWN handoff, because a fail side that passes at random means HANDOFF-04a's A1 never tested anything.

**Out of scope:** backfilling history; the address index; Mode A; self-hosting `zebrad`. **And the confirmed-block follower on `MemoryChainStore` IS in scope here** - LEDGER-15's INFERRED reading correctly kept it out of rung 2, and L2's resolution puts it here.

## §2 READING

`CLAUDE.md` · `apps/indexer/src/runtime/` **entire** · `docs/2.0/RUNTIME.md` · `packages/zebra-rpc/src/{client,version-floor}.ts` · **LEDGER-12 Q2 (the backfill gap) and Q3 (the version ceiling)** · the HANDOFF-12 blocks and both L2 resolutions for PR #50 and #52.

## §3 CONTRACT

- **A missing method is a NAMED ABSENCE at startup, never a silent degradation at the first Ironwood block.** See §1's `z_gettreestate` row: the failure is permanent and invisible, which is the worst combination this project recognises.
- **A 429 mid-block must not corrupt chain state.** `applyConfirmedBlock`'s external call happens ABOVE every mutation precisely so a transient failure is retryable — that was the worst of HANDOFF-12's twelve defects (`c53f2ba`). A third-party endpoint makes transient failure the normal case rather than the rare one.
- **The plane draws measured marks or it draws none.** One mark per counted crossing, uniform weight, capped at `SPLASH_N_MAX = 42`. **The adaptive retention window stays deferred whole** (LEDGER-04a Q2) — without per-crossing ordering there is no "newest N", and a board of arbitrary marks labelled a recent window is the defect that deferral exists to prevent. If this rung makes ordering available, say so in §8 and let L2 rule; do not build it here.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **`scripts/preflight-rpc.mjs`.** Takes an RPC URL and answers, by execution: which of the seven methods it serves; its `subversion` against both the floor and the ceiling; and the request rate it sustains before refusing. A table an operator reads in ten seconds, and a non-zero exit when the endpoint cannot carry the stack.
   **Three outcomes per method and the third is the point:** SERVED, ABSENT, and *could not be determined*. A method erroring for a reason unrelated to availability — `getRawTransaction` on a fake txid answers "No such mempool or main chain transaction", which means it WORKS — is not an absence, and a preflight counting it as one would reject good endpoints.
   **Measure the rate; do not read it from a marketing page.** L2 found the documented 5/min was exact and shared across three hostnames, and finding that took one burst of sixteen requests.
2. **Third-party mode for the confirmed-block driver**: the endpoint config, the start height, 429 back-off, and a startup check that names every missing method before the first block.
3. **`docs/2.0/CUTOVER-1.0.md` completed** — the full operator path across all three rungs, ending at a site whose plane draws measured crossings. Say plainly what the plane shows with `z_gettreestate` and what it shows without.
4. **THE GATE LIST GAINS `test:e2e`, AND THIS IS DELIVERABLE 1b - DO IT FIRST, IT IS FOUR LINES.**
   `CLAUDE.md` line 78 names SIX gates. `pnpm --filter @zcashreveal/web test:e2e` is not one of them, so HANDOFF-15 opened its PR without having run it - **and so did L2, whose own verification gate mirrors that same list of six and therefore missed it on BOTH #56 and #57.**
   **THAT LINE DOCUMENTS ITS OWN HOLE:** it already says *"Each of the last two was added after a session satisfied this list exactly and shipped something the list did not cover."* `pnpm build` was added that way after HANDOFF-07; `assert-no-skipped-integration` was recorded and NOT added (LEDGER-14 Q5); the e2e suite is the third. **A shape at three instances is one the stopping rule says gets mechanised, not recorded again.** Add `test:e2e` to the list, and add `assert-no-skipped-integration` while the line is open - it has been waiting one handoff. Say in section 7 how long the e2e run took and what it returned.

5. **ROUND 4 ON `62c4e77`** (**F-52-2**). Round 3's own fix commit has never been reviewed and the stopping rule says a fix commit earns a round. The pattern is why: round 1 found six, round 2 found two *inside round 1's fix*, round 3 found four with *three* in that same fix — twelve, with the yield following the repairs. This rung is where that runtime first meets real chain data. **Two people estimated this surface and both were low: L2 said a first round would find "one or two" and it found six; the session said a third would find "one or two" and it found four. Do not estimate. Run the round.**
6. **`docs/2.0/CUTOVER.md` section 1 corrected.** It still lists the mainnet block fixture under "not a prerequisite" because *"the cutover ships with that test still skipped"* and calls the capture a standing operator task needing a synced node. **Four captures landed in PR #51 from a public endpoint and the decoder suite runs 11/11 with zero skips.** The row describes an obstacle that no longer exists, in the document an operator reads AT cutover.

## §5 ASSERTIONS — each needs both polarities

- **A1.** The preflight reports `z_gettreestate` ABSENT against the keyless Tatum endpoint and SERVED against one that serves it. *If no second endpoint is reachable, drive the second polarity against a local mock and say so — a guard driven in one direction is half a guard.*
- **A2.** The preflight's rate figure is MEASURED, its transcript showing the last success and the first refusal.
- **A3.** A missing `z_gettreestate` is named at startup, not at the first Ironwood block. *Fail side by DATA: a mock that 404s that one method.*
- **A4.** A 429 mid-`applyConfirmedBlock` retries cleanly — no `CommitmentAlreadyExistsError`, no advanced tip. *Fail side: the mock 429s once mid-apply; the block applies on retry.*
- **A5.** Opening at a recent height produces a base whose `maxPosition` equals the block's own reported tree size minus one, and marks appear on the plane once crossings accrue. *Fail side: withhold the treestate and observe no anchor and a logged finding, never a fabricated root.*
- **A6.** Round 4's findings each carry a failing-then-passing transcript, and **if round 4's fix commit exists, round 5 ran over it.** *Fail side: a §7 reporting round 4's fixes with no round over them is exactly the gap F-52-2 files.*
- **A7. F-57-1 applied to this rung's own mock.** The preflight's ABSENT verdict and the driver's 429 handling are both driven by shapes **captured from a real endpoint**, not enumerated from memory - the four 429 bodies now on record, and whatever `z_gettreestate` actually answers rather than what this prompt says it answers. *Fail side: a mock emitting only the shapes a previous session imagined.*
- **A8.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe (**F-53-1**), **with `build` run BEFORE `typecheck`**, and the passed AND skipped counts both stated with every skip named - a run with Postgres or Redis down exits 0 while silently skipping the integration halves, and only the counts discriminate (HANDOFF-15 section 7 drove both polarities: 1597/5 healthy, 1465/111 degraded, identical exit code).

## §6 DISPATCH HINTS

Two independent bodies of work: the preflight and third-party mode (one fan-out, one worker per method plus one on rate), and round 4 (a separate fan-out, one worker per failure path, each with an adversarial refuter). Do not merge them — round 4 is a review and reviews do not share a worker with the thing being built.

---

**One operator action no session can take.** The keyless endpoint is short on both counts — six of seven methods, and 5 requests/minute. A **free-tier API key** from a provider serving the full set at a workable rate clears both; creating that account is the operator's, because L2 cannot create accounts or handle credentials. The preflight exists so that a candidate URL is answered in ten seconds rather than by an `UNKNOWN_ANCHOR` weeks later.
