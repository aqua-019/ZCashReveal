---
handoff: 16
title: Crossings forward - the confirmed-block driver on a third-party endpoint (rung 3 of three)
status: in-progress
branch: the session-designated branch (name it `feat/v2-16-crossings-forward` if you may choose)
track: Integration
depends_on: 12, 15
written_by: L2 (Cowork) · 2 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-16 — Crossings forward: the confirmed-block driver on a third-party endpoint (rung 3 of three)

**RUNG 3 OF THREE, AND THE ONE THAT FILLS THE PLANE.** 14 put live balances on the site; 15 put
live transactions on it. This puts **crossings** on it — the marks on the turnstile plane, which
today draws from a fixture.

**AND IT STILL NEEDS NO SYNC.** `runtime/startup.ts:23` — `INDEXER_START_HEIGHT` is *"the first
block to index on a COLD store"*, and `chainBaseFromBlock` opens the base by the block's own
figures. The runtime was built in HANDOFF-12 to start at a recent height and follow forward.
Nothing here backfills history.

---

## §1 SCOPE

Run the confirmed-block driver against a **third-party RPC endpoint**, opening at a recent height,
so `migrationHist` accumulates real ZIP 318 crossings from that height forward and the plane draws
measured marks.

L2's measurements — check them, and say in §7 where they were wrong:

| what | measured |
|---|---|
| confirmed-block cost | ~1 `getblock` per 75 s ≈ **0.8/min** — inside even the keyless 5/min ceiling |
| history required | **none.** Open the base at a recent height |
| the seven methods this stack calls | `getBlock`, `getBlockHeader`, `getBlockchainInfo`, `getBlockchainInfoFull`, `getRawMempool`, `getRawTransaction`, **`getTreestate`** |
| **`z_gettreestate` on the keyless endpoint** | **`Method not found`.** Six of seven served; this one is not. **UNVERIFIED AS OF 4 SEP - L2 measured this on 1 SEP and has NOT re-probed it.** Deliverable 1 settles it; do not carry it as fact |
| what that costs | the Ironwood anchor never forms. The driver writes the block, logs the notice and records **no anchor** — never a fabricated root, as §4 requires. Every later spend citing it is `UNKNOWN_ANCHOR` **permanently**, because there is no backfill (LEDGER-12 Q2) |
| the address index | three of the nine methods, one file — `apps/gateway/src/views/address.ts`. Not needed |

**So `z_gettreestate` availability is this rung's gating fact, and an operator must learn it before
the driver runs, not weeks later from a query.** That is what deliverable 1 is for.

**AND TWO THINGS ARRIVE FROM RUNG 2, BOTH SMALL, BOTH MEASURED BY L2 ON 4 SEP:**

1. **`MockRpcEndpoint` gains a fourth refusal body, and it is the one production sends.** Captured
   live: `{"statusCode": 429, "message": "You have exceeded your limit of 5 requests per
   minute..."}` - it PARSES and reaches NEITHER the error-object branch nor the parse-failure
   branch, a third escape route from the pre-fix ordering that round 3 did not find because no mock
   emitted it. **The shipped status-first fix already covers it**, so this is closing the exclusion
   set, not fixing a defect. Add it beside `envelope`/`bare`/`html`, drive it through the same loop,
   and **capture it rather than transcribing it from this prompt** - that is F-57-1's operational
   half.
2. **The rate-limit deferral in LEDGER-15 can be CLOSED, not carried.** L2 dumped the real headers
   on both a 200 and a 429: `retry-after: 60` is present, and there is **no `X-RateLimit-*` header
   of any kind** - only `x-ttm-plan: anonymous`. The session's judgement was right; record it as
   MEASURED and stop deferring it.

**AND BUILD BEFORE YOU TYPECHECK.** L2's own gate reported fifteen phantom type errors on this PR
because it ran `build` last and the indexer typechecked against a stale `zebra-rpc/dist`. A
cross-package export added in the same PR that consumes it is invisible until the producing package
is rebuilt.

**`legibility.spec.ts:718` IS OUT OF SCOPE AND THAT IS A RULING, NOT AN OVERSIGHT.** HANDOFF-15
recorded it failing once locally under full-suite parallelism with the plant confirmed landed,
against 3 of 3 isolated passes and a green CI run on the same head, and correctly refused to call it
a flake or widen the PR into HANDOFF-04a's spec. **L2 agrees and adds its own n** - a full-suite
pass in a different container on merged `main`. If it fails for you too, record the observation with
its n and leave it; if the count ever reaches the point where the fail side is shown to be
non-discriminating at random, that is LEDGER-05 fold 7 and it earns its OWN handoff, because a fail
side that passes at random means HANDOFF-04a's A1 never tested anything.

**Out of scope:** backfilling history; the address index; Mode A; self-hosting `zebrad`. **And the
confirmed-block follower on `MemoryChainStore` IS in scope here** - LEDGER-15's INFERRED reading
correctly kept it out of rung 2, and L2's resolution puts it here.

## §2 READING

`CLAUDE.md` · `apps/indexer/src/runtime/` **entire** · `docs/2.0/RUNTIME.md` ·
`packages/zebra-rpc/src/{client,version-floor}.ts` · **LEDGER-12 Q2 (the backfill gap) and Q3 (the
version ceiling)** · the HANDOFF-12 blocks and both L2 resolutions for PR #50 and #52.

## §3 CONTRACT

- **A missing method is a NAMED ABSENCE at startup, never a silent degradation at the first Ironwood
  block.** See §1's `z_gettreestate` row: the failure is permanent and invisible, which is the worst
  combination this project recognises.
- **A 429 mid-block must not corrupt chain state.** `applyConfirmedBlock`'s external call happens
  ABOVE every mutation precisely so a transient failure is retryable — that was the worst of
  HANDOFF-12's twelve defects (`c53f2ba`). A third-party endpoint makes transient failure the normal
  case rather than the rare one.
- **The plane draws measured marks or it draws none.** One mark per counted crossing, uniform
  weight, capped at `SPLASH_N_MAX = 42`. **The adaptive retention window stays deferred whole**
  (LEDGER-04a Q2) — without per-crossing ordering there is no "newest N", and a board of arbitrary
  marks labelled a recent window is the defect that deferral exists to prevent. If this rung makes
  ordering available, say so in §8 and let L2 rule; do not build it here.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **`scripts/preflight-rpc.mjs`.** Takes an RPC URL and answers, by execution: which of the seven
   methods it serves; its `subversion` against both the floor and the ceiling; and the request rate
   it sustains before refusing. A table an operator reads in ten seconds, and a non-zero exit when
   the endpoint cannot carry the stack.
   **Three outcomes per method and the third is the point:** SERVED, ABSENT, and *could not be
   determined*. A method erroring for a reason unrelated to availability — `getRawTransaction` on a
   fake txid answers "No such mempool or main chain transaction", which means it WORKS — is not an
   absence, and a preflight counting it as one would reject good endpoints.
   **Measure the rate; do not read it from a marketing page.** L2 found the documented 5/min was
   exact and shared across three hostnames, and finding that took one burst of sixteen requests.
1b. **THE GATE LIST GAINS `test:e2e`, AND IT IS DONE FIRST — IT IS FOUR LINES.**
   `CLAUDE.md`'s Workflow section names SIX gates. `pnpm --filter @zcashreveal/web test:e2e` is not
   one of them, so HANDOFF-15 opened its PR without having run it - **and so did L2, whose own
   verification gate mirrors that same list of six and therefore missed it on BOTH #56 and #57.**
   **THAT LINE DOCUMENTS ITS OWN HOLE:** it already says *"Each of the last two was added after a
   session satisfied this list exactly and shipped something the list did not cover."* `pnpm build`
   was added that way after HANDOFF-07; `assert-no-skipped-integration` was recorded and NOT added
   (LEDGER-14 Q5); the e2e suite is the third. **A shape at three instances is one the stopping rule
   says gets mechanised, not recorded again.** Add `test:e2e` to the list, and add
   `assert-no-skipped-integration` while the line is open - it has been waiting one handoff. Say in
   §7 how long the e2e run took and what it returned.
2. **Third-party mode for the confirmed-block driver**: the endpoint config, the start height, 429
   back-off, and a startup check that names every missing method before the first block.
3. **`docs/2.0/CUTOVER-1.0.md` completed** — the full operator path across all three rungs, ending
   at a site whose plane draws measured crossings. Say plainly what the plane shows with
   `z_gettreestate` and what it shows without.
4. **ROUND 4 ON `62c4e77`** (**F-52-2**). Round 3's own fix commit has never been reviewed and the
   stopping rule says a fix commit earns a round. The pattern is why: round 1 found six, round 2
   found two *inside round 1's fix*, round 3 found four with *three* in that same fix — twelve, with
   the yield following the repairs. This rung is where that runtime first meets real chain data.
   **Two people estimated this surface and both were low: L2 said a first round would find "one or
   two" and it found six; the session said a third would find "one or two" and it found four. Do not
   estimate. Run the round.**
5. **`docs/2.0/CUTOVER.md` section 1 corrected.** It still lists the mainnet block fixture under "not
   a prerequisite" because *"the cutover ships with that test still skipped"* and calls the capture a
   standing operator task needing a synced node. **Four captures landed in PR #51 from a public
   endpoint and the decoder suite runs 11/11 with zero skips.** The row describes an obstacle that no
   longer exists, in the document an operator reads AT cutover.
6. **`MockRpcEndpoint` gains the fourth refusal body**, captured from the real endpoint rather than
   transcribed, and driven through the same three-body loop (§1 item 1, F-57-1).
7. **LEDGER-15's rate-limit deferral closed as MEASURED** rather than carried (§1 item 2).

## §5 ASSERTIONS — each needs both polarities, and each states its EXCLUSION SET

- **A1.** The preflight reports `z_gettreestate` ABSENT against the keyless Tatum endpoint and SERVED
  against one that serves it. *If no second endpoint is reachable, drive the second polarity against
  a local mock and say so — a guard driven in one direction is half a guard.*
  **EXCLUSION SET:** a verdict that does not discriminate — ABSENT returned for an endpoint that
  serves the method, or SERVED returned for one that answers `Method not found`.
- **A2.** The preflight's rate figure is MEASURED, its transcript showing the last success and the
  first refusal.
  **EXCLUSION SET:** a rate figure not derived from an observed refusal — a constant, a value read
  from documentation, or a figure emitted when no request was refused at all.
- **A3.** A missing `z_gettreestate` is named at startup, not at the first Ironwood block. *Fail side
  by DATA: a mock that 404s that one method.*
  **EXCLUSION SET:** an endpoint missing a required method that the runtime starts against silently.
- **A4.** A 429 mid-`applyConfirmedBlock` retries cleanly — no `CommitmentAlreadyExistsError`, no
  advanced tip. *Fail side: the mock 429s once mid-apply; the block applies on retry.*
  **EXCLUSION SET:** a state in which a refused external call has already mutated chain state — a
  duplicated commitment, a tip advanced past a block that did not apply, an anchor recorded for a
  block whose treestate never arrived.
- **A5.** Opening at a recent height produces a base whose `maxPosition` equals the block's own
  reported tree size minus one, and marks appear on the plane once crossings accrue. *Fail side:
  withhold the treestate and observe no anchor and a logged finding, never a fabricated root.*
  **EXCLUSION SET:** an anchor root the node never sent — a zero root, a placeholder, a root computed
  locally — recorded as if measured.
- **A6.** Round 4's findings each carry a failing-then-passing transcript, and **if round 4's fix
  commit exists, round 5 ran over it.**
  **EXCLUSION SET:** a §7 reporting round 4's fixes with no round over them — exactly the gap F-52-2
  files.
- **A7. F-57-1 applied to this rung's own mock.** The preflight's ABSENT verdict and the driver's 429
  handling are both driven by shapes **captured from a real endpoint**, not enumerated from memory -
  the four 429 bodies now on record, and whatever `z_gettreestate` actually answers rather than what
  this prompt says it answers.
  **EXCLUSION SET:** a refusal or absence shape no real producer emits — a mock emitting only the
  shapes a previous session imagined.
- **A8.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe
  (**F-53-1**), **with `build` run BEFORE `typecheck`**, and the passed AND skipped counts both
  stated with every skip named - a run with Postgres or Redis down exits 0 while silently skipping
  the integration halves, and only the counts discriminate (HANDOFF-15 §7 drove both polarities:
  1597/5 healthy, 1465/111 degraded, identical exit code).
  **EXCLUSION SET:** a green claim whose evidence cannot distinguish a healthy run from a degraded
  one — an exit code read through a pipe, or a pass count quoted without its skip count.

## §6 DISPATCH HINTS

Two independent bodies of work: the preflight and third-party mode (one fan-out, one worker per
method plus one on rate), and round 4 (a separate fan-out, one worker per failure path, each with an
adversarial refuter). Do not merge them — round 4 is a review and reviews do not share a worker with
the thing being built.

---

**One operator action no session can take.** The keyless endpoint is short on both counts — six of
seven methods, and 5 requests/minute. A **free-tier API key** from a provider serving the full set at
a workable rate clears both; creating that account is the operator's, because L2 cannot create
accounts or handle credentials. The preflight exists so that a candidate URL is answered in ten
seconds rather than by an `UNKNOWN_ANCHOR` weeks later.

## §7 REPORT

```
STATUS: (pending - filled at write-back)
```

## §8 LEDGER BLOCK

Appended to `handoffs/LEDGER.md` at write-back.
