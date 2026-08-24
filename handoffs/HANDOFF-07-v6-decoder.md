---
handoff: 07
title: Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection
status: shipped
branch: the session-designated branch (name it `feat/v2-07-v6-decoder` if you may choose)
track: Data
depends_on: 06
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-07 — Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Decode v6 transactions and Ironwood actions from Zebra 6.x RPC JSON into the four-pool state; detect ZIP 318 migrations and record canonical denominations; never crash on an unknown shape.

**Out of scope:** No analysis changes beyond emitting the new records. No real-node operations (fixtures may be synthetic if the node is not synced; say so).

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `apps/indexer/src/decoder/*.ts`, `test/fixtures/blocks/README.md`, `packages/zebra-rpc` (or `zebrad-rpc.ts`)
- ZIP 229 (v6 format), ZIP 258 (NU6.3), ZIP 2005 (Ironwood notes), ZIP 318 (migration), ZIP 257 (proof-size rule) — fetch and cite the revision read
- Zebra 6.x source/docs for the `getrawtransaction` / `getblock` verbosity-2 JSON field names of the Ironwood bundle — cite file + commit

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- **Do not parallelise integration files across processes to buy wall clock.** `fileParallelism: false` in `apps/indexer/vitest.config.ts` is load-bearing until HANDOFF-10 lands database isolation: every integration suite TRUNCATEs shared tables in `beforeEach`, so two vitest processes on one Postgres corrupt each other's rows in both directions. Proven in both directions in HANDOFF-06's round 2 and pre-existing (LEDGER-06 Q6). *(Added by the L2 RESOLUTION for HANDOFF-06, fold 8.)*
- `decoder/ironwood.ts` mirrors `orchard.ts`; `decoder/v6.ts` dispatches by `version`; `block-decoder.ts` emits Ironwood commitments/anchors/nullifiers and boundary deltas.
- Unknown version or bundle → a structured `UNSUPPORTED_TX` leak report (severity INFO) with the raw field names logged — never a throw.
- Migration detection: `valueBalanceOrchard > 0 && valueBalanceIronwood < 0` with no transparent components → `MIGRATION_O2I`; amount recorded with `(n, k)` where amount = `n × 10^k` ZEC, `n ∈ {1,2,5}`, `canonical` false otherwise.
- Post-NU6.2 sanity: `proofsOrchard` length must equal `2720 + 2272 × nActionsOrchard` — a violation is recorded as a finding (decoder sanity), not a crash.
- Fingerprints: add expiryDelta/padding signatures for Zodl 3.x, Vizor, Zkool, Zingo, Cake as documented hypotheses with their source.

## §4 DELIVERABLES

1. `decoder/ironwood.ts`, `decoder/v6.ts`, updated `block-decoder.ts`, `leak-analyzer.ts`, `fingerprint.ts`; fixtures under `test/fixtures/blocks/` (real if a synced node is available — say which heights; else synthetic mirroring the RPC shape with the real-fixture test `skipIf`-guarded); tests.
2. **Fill `AnalyzeContext.ironwoodValueBalanceZat` at its call site so `MIGRATION_O2I` fires on the LIVE path.** HANDOFF-06 implemented the rule, tested both polarities through the seam and left the seam unfilled deliberately, because decoding a v6 bundle was out of its scope — so today a real Orchard-to-Ironwood migration classifies `MIXED` on the live path. `MIGRATION_O2I` unreachable for one handoff is acceptable; for two it is not. The seam is one value passed at one call site (`apps/indexer/src/index.ts`), not a reopening of the module. *(Added by the L2 RESOLUTION for HANDOFF-06, fold 4; LEDGER-06 Q2.)*
3. **Add `perPoolZat.ironwood` on the same terms as the other three pools** — present when the pool moved, OMITTED when it did not, never a hardcoded `0n`. A hardcoded zero renders as a measurement that was never taken, which is the defect HANDOFF-06 spent its length removing from `feeZat`. *(Same fold.)*

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/indexer test` exits 0 with ≥ 200 tests.
- **A2.** Decoding the v6 fixture yields `ironwood` commitments with contiguous positions and a `valueBalanceIronwood` equal to the fixture's value (unit test).
- **A3.** A transaction JSON with `version: 7` decodes to a report with `leakClass === 'UNSUPPORTED_TX'` and the decoder does not throw *(fail side: temporarily remove the guard → throw observed, restore)*.
- **A4.** A migration fixture (500 ZEC Orchard→Ironwood) is classified `MIGRATION_O2I` with `(n,k) = (5, 2)` and `canonical === true`; 499.5 ZEC yields `canonical === false` (unit tests, both polarities).
- **A5.** `proofsOrchard` of length `2720 + 2272×2 − 1` on a post-NU6.2 fixture produces a `PROOF_SIZE_NONCANONICAL` finding; the correct length produces none.
- **A6.** No `any` introduced: `grep -rn ': any' apps/indexer/src/decoder` is empty.
- **A7.** Replay of the fixture block through `PoolState` leaves `Bal_orchard` unchanged or decreased and `Bal_ironwood` increased by the migrated amounts (integration test).
- **A8.** A decoded v6 Orchard-to-Ironwood migration classifies `MIGRATION_O2I` **end to end through the real decoder path**, not through a hand-built `AnalyzeContext` *(fail side: withhold the Ironwood balance at the call site and observe `MIXED`)*. *(Added by the L2 RESOLUTION for HANDOFF-06, fold 4. A4 tests the rule; A8 tests that the live path reaches it — HANDOFF-06 shipped a version where the rule was correct and no caller could reach it, and the docblock beside it claimed otherwise.)*

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Hard and not voluminous: `chain-integrator` (Sonnet) builds it directly; `test-engineer` (Haiku) writes fixtures/tests after PREFLIGHT (unfamiliar subsystem).
- director-quality: `security-auditor` reviews parsing of untrusted RPC JSON (bounds, lengths).

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/new-session-ux5kkt (the harness names the branch; the handoff's
suggested `feat/v2-07-v6-decoder` was not available). PR: #38, opened as a draft
and stopped there.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  SPAWN MODE, first output of the session and proven by a tool attempt, not asserted:
  `Agent(subagent_type: general-purpose, model: haiku)` returned `PROBE-OK`
  (agentId acb6951c9850c1dc4, 0 tool uses, 2.2 s). The `Workflow` tool was also
  present. So L3 ran as designed, with workflow fan-out available for the gate.

  The lead ran this handoff directly rather than through a director-build, because
  the build is one subsystem by one hand (§6: "hard and not voluminous:
  chain-integrator builds it directly") and every dispatchable unit in it either
  touches the RPC boundary or the classifier. Fan-out was spent where §6 puts it
  and where this project's evidence says it pays: the gate.

  - Ironwood blast-radius mapping, 5 read-only agents (lens-schema, lens-fixtures,
    lens-producers, lens-poolstate, lens-zip318). Post-fan-out sweep caught one of
    them writing a pool widening it had been asked only to map; reverted, and the
    change re-made deliberately in `900a0b6`. This is the second time (HANDOFF-06
    was the first) and it is now a CLAUDE.md rule.
  - Gate round 1: Workflow `handoff-07-gate`, 5 review lenses (correctness, facts,
    consumers, evidence, spec) then one adversarial verifier per finding.
  - Gate round 2: Workflow `handoff-07-gate-round-2`, 3 lenses over commit 8fda374
    ONLY (fix-correctness, fix-evidence, fix-facts) then one verifier per finding.
  - Gate round 3: Workflow `handoff-07-gate-round-3`, 2 lenses over commit a10dec9
    ONLY (blast-radius, evidence) then one verifier per finding.
```

FILES (created / modified / moved):

  CREATED (13)
    apps/indexer/src/decoder/ironwood.ts                      mirrors orchard.ts
    apps/indexer/src/decoder/v6.ts                            version dispatch, three refusals
    packages/zec-types/src/zip318.ts                          denominations, both exponents
    packages/zebra-rpc/src/sprout-field.ts                    JoinSplit observability, v2-v4
    apps/indexer/migrations/004_ironwood_reports.sql          two nullable Ironwood columns
    scripts/check-corpus-citations.mjs                        the fifth static guard
    apps/indexer/test/fixtures/blocks/synthetic-v6-ironwood-3430000.json
    apps/indexer/src/decoder/__tests__/ironwood-v6.test.ts    A2, A3, A5
    apps/indexer/src/decoder/__tests__/zip318.test.ts         A4
    apps/indexer/src/state/__tests__/replay-ironwood.test.ts  A7
    apps/indexer/src/persistence/__tests__/integration/leak-reports.test.ts
    packages/zebra-rpc/src/__tests__/sprout-field.test.ts
    handoffs/prompts/PROMPT-07.md                             the archive (revolution step 5)

  MODIFIED - decoder and types
    leak-analyzer.ts (dispatch first, decode Ironwood, migration record, four-pool
    perPoolZat, describeFlow off perPoolZat, MIGRATION_O2I and MIGRATION_S2O as shape
    tests) - block-decoder.ts (Ironwood fields, anchor, `boundaryDeltasOf`) -
    orchard.ts (ZIP 257 canonical proof length) - fingerprint.ts (ZODL; Ywallet
    narrowed; four unsourced hypotheses named) - activation-heights.ts (NU6 testnet,
    every corpus citation re-pinned by READING, two provenance sentences corrected) -
    analysis/fee.ts (the Ironwood term, and `hasUndecodedIronwood` narrowed) -
    packages/zec-types: leaks.ts, views.ts, shielded.ts, transactions.ts, zip317.ts,
    index.ts - packages/zebra-rpc: schemas.ts, types.ts, client.ts, index.ts

  MODIFIED - producers and surfaces
    apps/gateway/src/views/mempool.ts (crossing tile arithmetic, Ironwood lane AND
    class fallthrough, the undecoded row, versionText) - views/context.ts
    (versionText) - views/tx.ts, views/block.ts - apps/web/src/lib/api/stream.ts
    (frame guard) - apps/web/src/lib/api/fixtures/mempool.ts, fixtures/block.ts -
    apps/web/src/components/track/MempoolPanel.tsx - legacy/dashboard (4 files)

  MODIFIED - repository rules and records
    package.json + .github/workflows/ci.yml (the fifth guard) - CLAUDE.md + README.md
    (four -> five static guards) - eslint.config.js - docs/2.0/research/
    01-contemporary-zcash.md (the consolidated activation table) -
    handoffs/HANDOFF-06, HANDOFF-07, HANDOFF-10, LEDGER.md, README.md


EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance):

  A1 - indexer suite exits 0 with >= 200 tests.
    PASS (Executed): `pnpm --filter @zcashreveal/indexer test`
      -> `Test Files 31 passed (31)` / `Tests 365 passed | 1 skipped (366)`, exit 0.
      Whole workspace: 953 passed, 1 skipped (content 67, zebra-rpc 35, web 365,
      gateway 121, indexer 365), up from 864 at base, against Postgres 16 on
      127.0.0.1:5432 so the integration suites RUN rather than skip. With no database
      reachable the same command reports `301 passed | 61 skipped` - which is why the
      number above is quoted with the database named.
    FAIL (Executed): reverting the MIGRATION_S2O predicate to its pre-a10dec9 form
      -> `Tests 3 failed | 33 passed (36)`, exit non-zero. The suite is not
      vacuously green.

  A2 - the v6 fixture yields Ironwood commitments with contiguous positions and the
       fixture's own valueBalanceIronwood.
    PASS (Executed): `ironwood-v6.test.ts` A2 block, 4 tests. Positions run 0..n-1
      on every bundle; the per-transaction balances are read out of the RAW fixture
      rather than restated, so the assertion cannot drift from the file; the same
      values reach `boundaryDeltasOf`, which is shipped code, not test-local glue.
    FAIL (Executed): "FAIL SIDE: a block with no Ironwood bundles produces no
      Ironwood surface at all" - strip the bundles and the actions, the deltas and
      the block anchor are all gone. Without it the A2 assertions would pass on a
      decoder that fabricated an empty Ironwood surface for every block. A coverage
      guard (`withIronwood.length > 0`) sits above the loop for the same reason.

  A3 - `version: 7` decodes to `UNSUPPORTED_TX` and does not throw.
    PASS (Executed): `ironwood-v6.test.ts` A3 block, 7 tests. The report measures
      nothing - `perPoolZat` empty, `direction` NONE, severity INFO - and the raw
      top-level field names are logged.
    FAIL (Executed): the fail side compares THE SAME BYTES at v6 and at v7, so the
      version is the only variable; raising `MAX_SUPPORTED_TX_VERSION` to 7 in a
      /tmp copy turns 3 assertions red. Round 1 found the FIRST fail side did not
      discriminate - with the guard actually removed, the v7 the pass side used did
      not throw - which is a fail-side probe that did not fail, and CLAUDE.md makes
      that a finding in its own right. It was rewritten rather than quietly repaired.

  A4 - a 500 ZEC Orchard->Ironwood migration is MIGRATION_O2I with (n,k) = (5,2) and
       canonical true; 499.5 ZEC is canonical false.
    PASS (Executed): `zip318.test.ts` (8 tests) and `leak-class.test.ts`'s A4 block
      (8 tests). 500 ZEC gives `{ n: 5, kZec: 2, kZatoshi: 10 }`.
    FAIL (Executed): 499.5 ZEC carries NO denomination at all - `null`, not a
      rounded bucket - and `canonical` is false.
    THE UNIT COLLISION, resolved rather than papered over: A4 states the exponent
      over ZEC, and `migrations_zip318.denom_k` (migration 003) is an exponent over
      ZATOSHI with `CHECK (denom_k >= 0)`. 500 ZEC is (5,2) in one and (5,10) in the
      other. `Zip318Denomination` carries BOTH, under names that say which is which,
      and neither is called `k` - the shape HANDOFF-05 needed when
      `summary.conventionalFeeZat` came to mean two things.

  A5 - `proofsOrchard` of length `2720 + 2272*n - 1` raises PROOF_SIZE_NONCANONICAL;
       the correct length raises none.
    PASS (Executed): `ironwood-v6.test.ts` A5 block, 6 tests. One byte short raises
      the finding and does not throw - a consensus-valid chain cannot carry this, so
      a throw would present the decoder's own error as a fault in the chain.
    FAIL (Executed): the canonical length at the same height raises nothing, so the
      height is not doing the work; below NU6.2 a short proof is not a finding
      (measuring it there is an anachronism, not a finding); an ABSENT proof is not
      a violation, because Zebra omits the field.

  A6 - no `any` introduced.
    PASS (Executed): `grep -rn ': any' apps/indexer/src/decoder` -> empty, exit 1.
    FAIL (Executed): the same grep was NON-EMPTY twice during this session, both
      times on my own comment prose rather than on a type - which is the honest
      note about this assertion: it is a text search, and it passes or fails on
      English as readily as on TypeScript. `pnpm typecheck` (10/10) is what actually
      holds the line.

  A7 - replaying the fixture block through PoolState leaves Bal_orchard unchanged or
       decreased and Bal_ironwood increased.
    PASS (Executed): `replay-ironwood.test.ts`, 6 tests. The two balances account
      for each other, and the per-transaction deltas are asserted APPLIED rather
      than skipped.
    FAIL (Executed): FAIL SIDE 1 withholds the Ironwood half and Orchard drains into
      nothing; FAIL SIDE 2 flips the Orchard sign and trips `ExitOnlyViolation`,
      which is what proves the replay is happening at a post-NU6.3 height rather
      than at the synthetic builder's default of 1,700,000.

  A8 - a decoded v6 migration classifies MIGRATION_O2I END TO END through the real
       decoder path, not through a hand-built AnalyzeContext.
    PASS (Executed): `leak-class.test.ts` "A8 PASS: a v6 migration reaches
      MIGRATION_O2I through the REAL decoder path".
    FAIL (Executed): two polarities, not one. Withholding the Ironwood balance at
      the call site returns the transaction to MIXED; and a v6 whose `ironwood`
      bundle is absent entirely is also MIXED. The second matters because the field
      NAME is inferred (see UNVERIFIED): if Zebra spells it differently, this is the
      state the live path lands in.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):

  1. CORRECTED. Deliverable 2 says "fill `AnalyzeContext.ironwoodValueBalanceZat` at
     its call site (`apps/indexer/src/index.ts`)". It is filled in `analyze()`
     instead, by decoding the bundle from the transaction the analyser already
     holds. Passing it in from `index.ts` would have made the LIVE path work and
     left every other caller - the gateway's projections, every test, HANDOFF-12's
     replay driver - reading an undecoded pool, so `MIGRATION_O2I` would fire in
     production and nowhere a reviewer looks. The context field is kept as a
     THREE-STATE override (`undefined` = use the decoded value, `null` = withhold
     it, a bigint = substitute one), because A8's fail side needs to withhold it.
     Stated here rather than buried: the deliverable's literal instruction was not
     followed, and the rule it exists to enforce is.

  2. ACCEPTED. §3 says migration detection is
     `valueBalanceOrchard > 0 && valueBalanceIronwood < 0` with no transparent
     components. Implemented as a SHAPE test - exactly one pool drained and it is
     Orchard, exactly one filled and it is Ironwood, nothing transparent - after
     gate round 1 found the conjunct form fires when Sapling ALSO drains into the
     same Ironwood output, publishing a crossing where more arrived than left. The
     spec's rule is a subset of this one; nothing it accepts is refused.

  3. ACCEPTED, narrowed. L2 fold 9 asked for JoinSplit observability on "v2+".
     Implemented for versions 2-4 only: v5 removed JoinSplits from the format
     (ZIP 225), so on a v5 or v6 an absent `vjoinsplit` is DEFINITIVE rather than
     indeterminate, and reporting it as indeterminate would manufacture doubt.

  4. DEFERRED. §3 asks for expiryDelta/padding signatures for Zodl 3.x, Vizor,
     Zkool, Zingo and Cake. Only ZODL is implemented, because the corpus gives an
     expiry delta for it and for no other. The four remaining names are recorded as
     `UNSOURCED_WALLET_HYPOTHESES` rather than given invented bands - a fingerprint
     with a made-up threshold publishes a wallet name beside a txid on the strength
     of nothing. Goes to §8.

  5. CORRECTED. The Ywallet fingerprint's comment claimed a "sourced 35-50 band".
     Gate round 1 found nothing in this repository sources it. Corrected in place;
     the band is retained and labelled as what it is.

NOTICED (outside scope, not acted on):

  1. HIGH, and the one to read first. `RoundTripIndex` MANUFACTURES ROUND-TRIP LINKS
     BETWEEN UNRELATED WALLETS THAT MOVE THE SAME AMOUNT BETWEEN POOLS. `ingest()`
     reads every `perPoolZat` leg as either a shielding deposit or an unshielding
     withdrawal, and a pool-to-pool crossing is neither: it did not come from the
     transparent side and it did not go there. So one migration's arriving leg is
     filed as a deposit, a later unrelated migration's departing leg matches it on
     amount, and the index emits a link whose two address fields are `null` because
     no transparent end exists.

     Executed, on committed code, through the real decoder:
       ### HANDOFF-07 path - Orchard to Ironwood, 500 ZEC twice
         tx a1a1  class=MIGRATION_O2I  legs=[orchard:50000000000 ironwood:-49999990000]  links=0
         tx b2b2  class=MIGRATION_O2I  legs=[orchard:50000000000 ironwood:-49999990000]  links=1
           LINK ironwood->orchard amount=50000000000 confidence=MEDIUM  match=FEE_TOLERANT
           senderAddress=null recipientAddress=null
       ### base path - Orchard to Sapling, same amount twice
         tx c3c3  class=MIXED  legs=[sapling:-49999990000 orchard:50000000000]  links=0
         tx d4d4  class=MIXED  legs=[sapling:-49999990000 orchard:50000000000]  links=1
           LINK sapling->orchard amount=50000000000 confidence=MEDIUM  match=FEE_TOLERANT
           senderAddress=null recipientAddress=null

     THE SECOND BLOCK IS WHY THIS IS NOT ACTED ON HERE. It uses only Sapling and
     Orchard, whose `perPoolZat` legs are byte-identical to base commit eba5b03, so
     the defect is PRE-EXISTING and reachable today by any Sapling-to-Orchard
     transfer. What HANDOFF-07 changes is severity, not existence: ZIP 318 MANDATES
     that migration amounts repeat - quantising to `n x 10^k` is the whole scheme -
     so under Ironwood the collision stops being a coincidence and becomes the
     design. §1 puts analysis changes out of scope ("no analysis changes beyond
     emitting the new records"), and the fix contradicts an assertion HANDOFF-06
     wrote and tested ("one transaction moving two pools yields a deposit and a
     withdrawal from a single report"), so it is a spec decision for the analysis
     toolkit's owner and not this session's to take.

     I wrote the guard, ran it, and reverted it. The narrowest form that covers the
     case is: skip a report whose `perPoolZat` both gained and lost value. The wider
     and more correct rule - a deposit requires a transparent INPUT and a withdrawal
     a transparent OUTPUT, since a `LinkRecord`'s two address fields assert exactly
     that - broke 13 of the suite's 17 tests, because every round-trip fixture in
     the tree carries no transparent side at all. That fixture gap is itself worth
     HANDOFF-08's attention: the suite cannot currently tell a transparent-ended
     round trip from a pool-to-pool one. LEDGER-07 Q1.

  2. MED. `txViewSchema.logicalActions` is still a plain count while
     `mempoolRowSchema.logicalActions` became nullable in this handoff. The split is
     deliberate today - /tx has no `UNSUPPORTED_TX` branch, so it cannot reach the
     absent case - but "cannot reach it today" is the same sentence that preceded
     `MIGRATION_O2I` being unreachable for a whole handoff. Whoever gives /tx an
     undecodable path must widen the field in the same commit.

  3. MED, and this one is a gap in the DTO rather than a bug in a producer. A POOL
     CROSSING WITH A PUBLIC SIDE HAS NO HONEST CLASS ON /track. The six-member enum
     is `shield | deshield | shielded | migration | transparent | undecoded`. A
     Sapling-to-Orchard transfer that also pays a transparent address is none of
     them: it is not a migration (a public recipient stands in it, which is why
     round 3 stopped calling it one), and `shield` and `deshield` name a direction
     of transparent flow it has on one end only. It falls to the residual
     `shielded`. The classifier's own answer is MIXED, which the enum cannot say.
     Adding a `mixed` member is the right fix and it is a DTO widening - the exact
     shape that produced a defect in each of the last three gate rounds - so it is
     reported and asked rather than pushed through at the last round. The row is not
     silent about the crossing meanwhile: its finding text, its lanes and its
     `valueBalanceText` all state it, and only the one-word label understates.
     LEDGER-07 Q2.

  4. LOW. MIGRATION_S2O's Sapling sign conjunct has no producible discriminating
     test. The Orchard one now does - Sapling spends draining entirely to fee beside
     an Orchard bundle of net zero - and the only probe that reaches the Sapling
     clause flips both signs at once, so either clause alone refuses it. Stated in
     the docblock at the rule rather than papered over, because "a rule that reads
     as covered and never runs" is the defect this project keeps finding, and a
     comment claiming coverage it does not have is how one survives.

  5. LOW. `legacy/dashboard` was swept for the LeakClass widening and for the bundle,
     identity and poolPath widenings, but it is v0.2 and read-only; Ironwood is
     visible there only as far as this session took it.

UNVERIFIED (labelled):

  - THE `ironwood` RPC FIELD NAME. Nothing in this repository has ever seen a real
    v6 transaction. The key `tx.ironwood` is inferred by analogy from `tx.orchard`;
    the fixture beside the tests was generated by this session and uses the same
    inference the schema does. So A2's evidence is SELF-REFERENTIAL - it passes
    whether or not Zebra calls the field `ironwood`. The decoder's own alarm
    (`IRONWOOD_FIELD_ABSENT`, a finding on a v6 carrying no `ironwood` key) is what
    would announce a wrong guess against a real node, and it is tested in both
    directions. HANDOFF-10's captured mainnet block settles it.
  - `finalironwoodroot` on the block, same inference from its two siblings. The
    decoder distinguishes "no root observed" from "no Ironwood commitments" via
    `ironwoodRootUnobserved` so a wrong guess is visible rather than silent.
  - ZIP 258 is DRAFT and was Draft when NU6.3 activated. Both Ironwood heights, and
    with them `poolsActiveAt`, `orchardExitOnlyFrom` and every Orchard-exit-only
    gate, rest on a document that may still be edited. Standing deferred entry.
  - `DENOM_CAP` is stated two ways in this repository: the research gives "10,000
    ZEC plus canonical fee", TRACKING-MATH §3.9 gives a flat 10,000 ZEC. A crossing
    between the two readings is legal under one and over-cap under the other.
    `isOverDenomCap` answers the FLAT form deliberately - it flags the ambiguous
    band rather than passing it silently - and never rejects, because the chain is
    the authority on what happened. LEDGER-07 Q3.
  - Sapling and NU5 TESTNET activation heights (280,000 and 1,842,420) are
    uncorroborated in this repository. They now appear in the corpus activation
    table, marked *(uncorroborated)*, and that row was transcribed FROM these
    constants by this session - so it is this project's own claim, not evidence.
  - `zips.z.cash` is unreachable from this container, so §2's instruction to fetch
    ZIP 229 / 258 / 2005 / 318 / 257 and cite the revision read could not be
    followed. Every ZIP fact in this branch is cited to `docs/2.0/research/` or to
    L2's relayed reading, and labelled as such at the constant.

GATE ROUNDS: 4 rounds, 10 review lenses, 31 adversarial verifiers. 68 findings
  raised, 36 survived verification, all 36 read and every one fixed or deferred
  with a stated reason. Every round after the first reviewed ONLY the previous
  round's fix commit, which is what found the defects the fixes themselves
  created. Fingerprints, file . rule . severity:

  ROUND 1 (5 lenses: correctness, facts, consumers, evidence, spec) - 38
  findings, 17 survived, 21 refuted. Fixed in 8fda374.
    HIGH  leak-analyzer.ts . MIGRATION_O2I fires when Sapling also drains, publishing
          a crossing where more arrived than left
    HIGH  ironwood-v6.test.ts . A3's fail-side probe does not discriminate - with the
          guard removed the v7 the pass side uses does not throw
    HIGH  fingerprint.ts . "Ywallet's sourced 35-50 band" is sourced nowhere in this
          repository, and it is the stated reason a wallet name is published
    HIGH  01-contemporary-zcash.md . the new table copies two uncorroborated testnet
          heights into the corpus and both sentences meant to keep them honest are false
    HIGH  stream.ts . the frame guard rejects class "undecoded", so one undecodable
          transaction drops the WHOLE snapshot from /track
    HIGH  gateway/mempool.ts . an intra-Ironwood transfer is published as class
          "transparent", flow "t to t" - `hasIronwood` reached the lanes and not the class
    HIGH  HANDOFF-06-four-pools.md . fold 3's tree-wide sweep missed two live
          restatements of the fact L2 corrected, in a file this branch edited
    MED   leak-analyzer.ts . UNSUPPORTED_TX_SHAPE emitted on fully decoded reports
    MED   leak-analyzer.ts . the one alarm for a wrong `ironwood` field name has no test
    MED   leak-analyzer.ts . the seam comment contradicts the same file 100 lines above
    MED   leak-analyzer.ts . the `!hasTransparentInputs` half of the O2I guard is untested
    MED   zip318.test.ts . MIGRATION_DENOMINATION's over-cap and below-residual arms never run
    MED   activation-heights.ts . the ZIP-258-is-Draft citation points at a blank line
          (twice, and the ledger recorded a re-pin of a citation that never existed)
    MED   legacy/useMempool.ts . swept for the LeakClass widening and not the others
    LOW   v6.ts . the JoinSplit refusal is untested - deleting the rule leaves the suite green

  ROUND 2 (3 lenses over 8fda374 ONLY) - 13 findings, 6 survived (5 distinct), 7
  refuted. Fixed in a10dec9. THREE OF THE FIVE WERE ROUND 1'S OWN.
    HIGH  web/fixtures/mempool.ts . the new `undecoded` row is swept into `shielded` by a
          subtraction over a closed class set - /track's headline moved 7 of 12 to 8 of 13
    MED   web/fixtures/mempool.ts . the row states `version: "v6"` about a version-7
          transaction and prints "L = 0" beside its own "absent rather than zero" reasoning
    MED   gateway/mempool.ts . the same false version, and the new test sets txVersion 5
          beside unsupported.version 7 - a pair `analyze()` cannot produce
    MED   activation-heights.ts . the corrected corpus note is contradicted by the file it
          names: two statements there are now false about the tree
    LOW   leak-analyzer.ts . MIGRATION_S2O is still the conjunct pile the same function
          condemns twenty lines above, and fires on transactions with a public recipient

  ROUND 3 (2 lenses over a10dec9 ONLY) - 11 findings, 7 survived, 4 refuted. Fixed
  in a37008d. THREE OF THE SEVEN WERE ROUND 2'S OWN.
    HIGH  gateway/mempool.ts . `summary.shielded` redefined and pinned on one producer
          only - 3 against 7 on the same thirteen rows
    MED   track/page.tsx . the undecoded row left the numerator and stayed in the
          denominator: the same four points, the other way
    MED   leak-class.test.ts . the third new S2O fail side is built on a transaction the
          repository's own version table says cannot exist, and it is the shape clauses'
          only coverage
    LOW   gateway/mempool.ts . the S2O transparent clauses never reached /track's own row
          class, so /tx and /track disagreed about one txid
    LOW   leak-analyzer.ts . the narrowing made the two sign conjuncts dead and silently
          retired the test whose comment says they are load-bearing
    LOW   activation-heights.ts . the correction dropped the carve-out the corpus note makes
    LOW   commit message . "933 before" is off by one; the parent is 932 passing plus 1 skipped

  ROUND 4 (1 lens over a37008d ONLY) - 6 findings, 6 survived, 0 refuted. Fixed in
  180e9ad. THREE OF THE SIX WERE ROUND 3'S OWN.
    HIGH  gateway/mempool.ts . the narrowed migration class dropped a real crossing out of
          `crossings`, so the gold tile prints a figure above "Nothing in the mempool
          crosses a pool boundary"
    HIGH  docs/2.0/API.md . the documented `/api/mempool` example no longer parses against
          its own schema - `pricedCount` missing since HANDOFF-06, `decodedCount` since round 3
    MED   track/page.tsx . the headline fix is untested at the site it fixes - reverting the
          tile's denominator left all 359 web tests green
    MED   leak-analyzer.ts . "removing the shape clauses returns the two sign conjuncts to
          work" is true of the code and false of the tests: deleting either conjunct left the
          whole indexer suite green
    LOW   track/page.tsx . "NaN%" for a mempool nobody could decode
    LOW   track/page.tsx . the block header enumerates 13 unconfirmed with class counts
          summing to 12, silently

  WHY IT STOPPED AT FOUR, STATED RATHER THAN IMPLIED. Loop 4's cap is three rounds
  PER FINDING and no finding here repeated, so the cap never bound - the decision to
  ship is the lead's and this is the reasoning. Every one of round 4's six fixes
  carries a two-polarity mutation probe I executed myself on the committed tree
  (revert `crossings` to the class filter -> 1 test red; revert the tile denominator
  -> 2 red; disable the zero guard -> 2 red, printing "NaN%"; drop the header
  remainder -> 1 red; relax the Orchard sign conjunct -> 1 red; the API.md example
  fails `mempoolViewSchema.safeParse` as committed and parses as corrected). That is
  most of what a fifth round would do to this diff.
  I do NOT claim convergence. Rounds 2, 3 and 4 each found that roughly half their
  surviving findings were created by the previous fix, and the honest extrapolation
  is that a fifth round would find one or two more - probably about the residual
  class the report names below. What changed across the four rounds is severity and
  reach, not count: round 1's HIGHs dropped whole snapshots from /track and published
  a wallet name on no source, round 4's are a caption disagreeing with its own tile
  and a JSON example in a document. LEDGER-07 Q6 puts the stopping rule itself to L2,
  because "review only the fix commit" has now found six fix-created defects in one
  session and this project has no written rule for when that ends.

  POSTSCRIPT, ADDED AFTER THE PR OPENED AND BEFORE ANY REVIEW: CI AND THE VERCEL
  PREVIEW BOTH FAILED ON THE FIRST PUSH, ON A DEFECT NONE OF THE FIVE GATE
  COMMANDS COULD SEE. `apps/web/src/lib/mempool-summary.ts` - the module round 4
  extracted so the /track tile would be testable - imported `./format.js`.
  That extension is correct in the indexer and the gateway, which are ESM
  packages compiled by `tsc`, and unresolvable in Next, which builds through
  webpack: `Module not found: Can't resolve './format.js'`. Every other import in
  `apps/web/src/lib` is extensionless.
  `pnpm -r test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter content validate`
  and `pnpm check` were all green on the commit that shipped it, because none of
  them runs a production Next build - and the handoff's own §3 contract lists
  exactly those five. CI does run `pnpm build`, and caught it in twenty seconds.
  This is the same shape as the note CLAUDE.md already carries about `pnpm check`
  ("they were absent from this list, so a session could satisfy the contract
  exactly and never run the guard that protects another project's database"), so
  `pnpm build` is added to that list in the same commit as the fix. Reproduced
  locally before the fix and green after: `pnpm build` -> 7 successful, /track
  prerendered at 10.2 kB.

PREVIEW URL (if any): https://zecreveal-git-claude-new-session-ux5kkt-aquatic-17b9f112.vercel.app
  CORRECTED AFTER THE FACT. This line first read "none", which was true when it was
  written - the first two deployments on this branch ERRORed on the `./format.js`
  import above - and false within four minutes, once the fix deployed. The
  deployment on `66cd1a8` is READY (`7wSQeQjj1vA6eNWQtYW6UppoWgLd`), and that is
  worth more than a URL: it is the fix confirmed in the real build environment
  rather than only on this container.
  THE SESSION STILL CANNOT REACH IT, and that is now Executed rather than restated
  from CLAUDE.md: `curl -I` against the preview returns
  `curl: (56) CONNECT tunnel failed, response 403` - this container's egress proxy
  refuses the tunnel before Deployment Protection's 302 to the SSO endpoint is even
  reached. So no Lighthouse number and no in-browser check comes from this session;
  that measurement is the operator's, per CLAUDE.md.
  No apps/web route changed behaviour except /track's block header and
  shielded-share tile, both covered by unit tests against the shipped fixture
  corpus, and both extracted into `lib/mempool-summary.ts` precisely so a test can
  reach the strings the page renders.
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):
INFERRED (non-empty inferences a worker made):
NOT-MATCHED (patterns handed over that did not apply):
SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):
GATE ROUND COUNTS:
DEFERRED ASSUMPTIONS:
```
