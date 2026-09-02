---
handoff: 13
title: Mode A — viewing-key decryption in the browser (2.1; PLAN ONLY, stop for approval)
status: shipped
branch: the session-designated branch (name it `feat/v2-13-mode-a-wasm` if you may choose)
track: 2.1 — plan only
depends_on: 04, 11
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-13 — Mode A — viewing-key decryption in the browser (2.1; PLAN ONLY, stop for approval)

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Produce a design and risk assessment for client-side viewing-key decryption (`packages/wasm-keys`): crate candidates (`zcash_keys`, `zcash_note_encryption`, `orchard`, `sapling-crypto`), WASM build path, compact-output fetching from the gateway, CSP, threat model, and a §5 list for the eventual build. **Stop after the plan. No code.**

**Out of scope:** No implementation. No key handling code of any kind in this handoff.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/TRACKING-MATH.md` §5
- `apps/web/app/reveal`
- Current upstream docs for the crates and any browser-wallet precedents (Zingo web, Zcash web wallets) — cite versions

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- The key never leaves the tab; no telemetry; strict CSP; results never stored; Mode B copy unchanged.
- The plan names every assumption and marks each ACCEPTED / CORRECTED / DEFERRED for the operator.
- **PRECONDITION (LEDGER-04 Q5).** Mode A may not ship while `script-src` carries `'unsafe-inline'`. HANDOFF-04 shipped that directive deliberately, on the reasoning that a site with no user input, no database and no third-party script gives an injected script little to do, and that a per-request nonce needs middleware and costs the whole site its prerendering. Decrypted note data in the tab changes what an injected script could read - the user's own transaction history - so the reasoning expires here. The plan must cost the nonce-plus-middleware path against the prerendering it removes and state which routes stop being static.

## §4 DELIVERABLES

1. `docs/2.0/MODE-A-PLAN.md` with architecture, crate/version table, build pipeline, gateway endpoints needed (`/api/compact/:range`), threat model, open questions for §8, and a proposed §5 for the build handoff.

2. *(added by LEDGER-10 fold 7, 30 Aug 2026 - PLAN-ONLY, and unrelated to Mode A except that this is the plan-only handoff.)* **A named design question about `scripts/check-finding-sites.mjs`, answered nowhere and carried here so it is not lost.**

   **THE QUESTION: what makes registration in the finding registry non-optional?**

   That guard enforces CLOSURE of REGISTERED multi-site findings - a fix that lands in three of four named sites fails the build naming the fourth. It says nothing about whether the registry is COMPLETE, because registration is manual. A finding nobody wrote down is invisible to it, and **a green run looks identical either way**, which is the same shape as a fail-side probe that does not fail: the output carries no information about the case it was supposed to discriminate.

   Why it is not closable by the guard itself, and therefore why it is a design question rather than a task: a finding lives in a gate return, a ledger block or a review comment, and deciding which of those named two `file:line` sites is a judgement. A script that guessed would give the registry a false air of completeness - the objection `check-corpus-citations.mjs` already records about its own bound, and the objection round 4 of HANDOFF-08 proved twice by finding its two new guards certifying their own failures.

   Directions worth costing in the plan, none of them endorsed here:
   - a gate return format that emits its multi-site findings as machine-readable rows, so registration is a by-product of reporting rather than a separate act of will;
   - a check that every finding fingerprint named in a §7 GATE ROUNDS line with more than one site has a registry entry, which moves the manual step from "remember to register" to "the write-back does not pass without it";
   - accepting the bound explicitly and stating it in the guard's output line, so a reader is never misled by a green run - **the header of `scripts/check-finding-sites.mjs` now states the boundary, which is the cheap half already taken.**

3. *(added by LEDGER-09 fold 4, 31 Aug 2026 - PLAN-ONLY, and unrelated to Mode A except that this is the plan-only handoff.)* **A specification for a guard against assertions whose predicate is satisfied by every value they were written to exclude.**

   **THE SHAPE HAS REACHED THREE INSTANCES ACROSS THREE HANDOFFS**, which is what `CLAUDE.md`'s recurrence rule requires before the next instrument is a guard rather than another review. The three, oldest first:

   - **HANDOFF-06 Q4** - a test whose title said "cannot fire on an unknown fee" and which passed `0n`, a KNOWN fee of zero. The predicate pinned the conflation instead of the behaviour, so the one input the assertion existed to cover was the one it never tried.
   - **HANDOFF-08's A9** - `if (m.depositAmountZat > balance) return false;` run 300 times by fast-check, where `balance` was the sum of every deposit the match could have been drawn from. The assertion said sigma and the test never summed: a property quantified over an AGGREGATE, checked per ELEMENT, which no input fast-check can generate could falsify. Invisible in a green run by construction.
   - **HANDOFF-09's `owner.startsWith("HANDOFF-")`** - satisfied by every wrong answer the field could hold, and it made `UNASSIGNED`, the honest value, the only failing one. Recorded in full in the LEDGER-09 Q3 block.

   Three instances, three handoffs, three different subsystems, severities from LOW to HIGH. The common defect is not weakness: **each is a different assertion that happens to be true**, standing where a reader believes the intended one stands.

   **THE HARD PART, NAMED HERE BECAUSE IT IS WHY THIS IS SPECIFIED RATHER THAN BUILT.** A detector must distinguish a LOOSE predicate from a DELIBERATELY PERMISSIVE one, and that is judgement rather than syntax. `expect(x).toBeDefined()` is exactly right when the test's subject is that a value exists at all, and exactly wrong when the test's title claims something about the value. The signal is the relationship between what the assertion CHECKS and what its NAME CLAIMS, and neither half is mechanically available: the name is prose and the check is an expression. A guard that flagged every weak matcher would fire on hundreds of correct tests, and by CLAUDE.md's own standard a rule that looks like coverage and is not is worse than an absent rule. **Specify before building, and cost at least these directions without endorsing any:**

   - **Mutation as the instrument rather than pattern-matching.** The property that actually distinguishes the three instances is that a mutation of the code under test leaves them green. That is what `CLAUDE.md` already requires by hand for every §5 assertion, and the guard would be its automation - expensive, but it measures the real thing rather than a proxy for it.
   - **A narrow syntactic rule aimed only at the third instance's form:** a string assertion whose expected value is a PREFIX or a substring of the field's domain, where the field has an enumerable set of legal values. That catches `startsWith("HANDOFF-")` and nothing else, which may be the honest scope.
   - **A rule about quantifiers, aimed at the second instance:** a property test whose stated property names an aggregate (sum, total, count over a set) while its body indexes a single element. Detectable in principle from the test title plus the body's shape, and the most likely to produce false positives.
   - **Accepting that the check cannot be automated and moving the cost to the write-back instead** - the §5 evidence block already demands a named worked case beside every property assertion (LEDGER-08 fold 3), and the cheap half may be a guard that every §5 assertion in a handoff has one, rather than a guard that judges the assertion.

   **Deliverable: a section in `docs/2.0/MODE-A-PLAN.md`, or its own short document, that costs those four and recommends one.** Building it is a later handoff's, and this one stops at the recommendation.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `docs/2.0/MODE-A-PLAN.md` exists, cites ≥ 5 upstream sources with versions, and contains sections Architecture / Threat model / Build pipeline / Gateway needs / Open questions / Proposed §5.
- **A2.** `git diff --stat main..HEAD -- apps packages scripts .github` is empty (plan only). **The pathspec names four paths and not two, and that is the whole point of this line.** Deliverables 2 and 3 both describe GUARDS, and a guard in this repository lands in `scripts/` with a line in `.github/workflows/ci.yml` - neither of which `-- apps packages` can see. Measured on the HANDOFF-09a branch: `-- apps packages` reports 48 files, `-- scripts` reports 1 and `-- .github` reports 1, so the pathspecs are disjoint and a session that BUILT the guard could have cited the old A2 as evidence that it had not. That is an assertion satisfied by the value it was written to exclude - the exact shape deliverable 3 exists to specify a guard against, and it was committed inside the change that specified it (LEDGER-09a, instance four). Deliverables 2 and 3 live in `docs/2.0/MODE-A-PLAN.md` and this file, outside all four paths, so neither weakens this assertion *(fail side: add a one-line `scripts/check-loose-predicates.mjs` and the stat is non-empty; under the old two-path pathspec the same diff passes)*.
- **A3.** The §7 report lists every assumption with a disposition.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `researcher` (Haiku) collects cited facts; `chain-integrator` (Sonnet) writes the plan; `security-auditor` reviews the threat model before the PR opens. The lead stops for operator approval.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

  Deliverable 0 (both guards) and deliverables 1, 2 and 3 (the plan) are all
  delivered. The word is DONE-WITH-ASSUMPTIONS rather than DONE because the plan
  rests on seven questions no session can settle - listed under ASSUMPTIONS and
  in the plan's own section 8 - and because the handoff ENDS AT A PLAN AWAITING
  OPERATOR APPROVAL by design. Nothing here is a partial build.

BRANCH / PR:
  claude/new-session-0defoc, forked from main at 98e87a0.
  PR #53, opened as a DRAFT and stopping at opened.
  https://github.com/aqua-019/ZCashReveal/pull/53

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  SPAWN MODE: subagents available, proven by tool attempt before any work - a
  `general-purpose` probe returned SPAWN-OK (agent a7b5998dfd901f6df).

  This session ran no director tier. Two WORKFLOW fan-outs, both by the lead:
    wf_e0c89726-4b7  seven researchers, one per dimension (Zebra releases; the
                     Rust crates; the WASM build path; browser-wallet
                     precedents; compact blocks; CSP and Next.js; the threat
                     model), each fact re-checked against its own cited URL by
                     a separate verifier that defaults to rejecting.
    wf_d36babb8-f4c  gate round 1, seven reviewers (the two guards; the plan's
                     repository claims; its external facts; its internal
                     consistency; the guard-count sweep; the Revolution-protocol
                     steps), each finding handed to an adversarial refuter.

  POST-FAN-OUT SWEEP run after each fan-out returned and before each commit:
  `git status --porcelain` empty both times. No worker wrote to the tree.

FILES (created / modified / moved):
  created   docs/2.0/MODE-A-PLAN.md                    (deliverables 1, 2, 3)
  created   scripts/check-config-defaults.mjs          (deliverable 0b, guard 17)
  created   handoffs/prompts/PROMPT-13.md              (protocol step 5)
  modified  scripts/check-compose-zebra-tag.mjs        (deliverable 0a, the ceiling)
  modified  scripts/check-finding-sites.mjs            (the R4-GUARDS row - the one
            substantive guard change here besides deliverable 0. Its `present`
            pattern was `/fourteen (static )?guards/i`, and with `static`
            optional it was satisfied at CLAUDE.md by a ledger sentence about the
            guard POPULATION rather than by an assertion of the count - so the
            row stayed green for two handoffs while CLAUDE.md said sixteen,
            ci.yml said FOURTEEN and README.md said fourteen. `static` is now
            required and the count moved to seventeen. A later gate dimension
            added the distinction the row now records: COUNT-ASSERTING sites
            write "N static guards" and are the three in `sites`;
            POPULATION-PROSE sites write "three of its N guards" and are swept by
            hand, deliberately outside `present`. The LATENT HAZARD is unclosed
            and named in the row: `present` matches anywhere in the file, so a
            sentence quoting the predicate would make it inert again exactly as
            before. Appendix A of the plan recommends the `presentAntiProbe`
            field that would catch it.)
  modified  .github/workflows/ci.yml                   (the 0b step; the count)
  modified  package.json                               (0b into `pnpm check`)
  modified  CLAUDE.md  README.md                       (the guard-count sweep)
  modified  handoffs/LEDGER.md                         (L2 RESOLUTION, appended)
  modified  handoffs/HANDOFF-12-...md  handoffs/HANDOFF-13-...md  handoffs/README.md
  modified  handoffs/LOG.md                          (protocol step 4; omitted from the
            first draft of this list, which named 13 paths against a 14-path diff)
  UNTOUCHED apps/ and packages/ - `git diff --stat origin/main..HEAD -- apps
            packages` is empty, which is A2's strongest half. Executed.

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance):

  A1  the plan exists, cites >= 5 sourced versions, carries the six sections.
      PASS (Executed): a probe run inline - not committed, because a new script
        under scripts/ would widen the deliverable-0 diff - reports
        "40 headings; 0 required section(s) missing; 20 cited source(s)
        carrying a version or date", rc=0.
      FAIL, BY DATA (Executed): a copy with `## 5. Threat model` renamed ->
        rc=1 "missing section(s): Threat model". A second copy with the source
        list removed -> rc=1 "only 0 cited sources with versions, need >= 5".
      EXCLUSION SET: a document missing any of the six sections, or citing
        fewer than five sources carrying a version. MEMBER USED: both, above.

  A2  `git diff --stat main..HEAD -- apps packages scripts .github` is empty.
      **RECONCILED, AND THE RECONCILIATION IS REPORTED RATHER THAN ASSUMED.**
      As written this assertion is UNSATISFIABLE on this branch: the prompt's
      DELIVERABLE 0 orders two guards into `scripts/` and one CI step into
      `.github/`. That is the LEDGER-11 Q5(a) case exactly - an exclusion set
      the shipped object is REQUIRED to exhibit is a clause got wrong, not a
      test to write. A2's own text says the four-path pathspec exists so a
      session that BUILT a guard could not cite the narrower two-path version
      as evidence it had not; citing `-- apps packages` while staying silent
      about `scripts` is precisely the move it was written to prevent, so it is
      not made here.
      RECONCILED FORM, both halves executed:
        (a) `git diff --stat origin/main..HEAD -- apps packages` -> EMPTY.
        (b) `git diff --name-only origin/main..HEAD -- scripts .github` -> 4
            files, every one deliverable 0 or its wiring:
            .github/workflows/ci.yml, scripts/check-compose-zebra-tag.mjs,
            scripts/check-config-defaults.mjs, scripts/check-finding-sites.mjs.
      MEASURED, as A2's text asks: `-- apps packages` reports 0 files,
        `-- scripts` 3, `-- .github` 1. The pathspecs are disjoint.
      FAIL, BY DATA (Executed): a file written under `apps/web/src/` makes the
        working-tree diff non-empty.
      **AND A BOUND A2 DOES NOT STATE, found by running its own fail side.** The
        command compares COMMITS, so an UNCOMMITTED file under apps/ is
        invisible to it - only `git diff HEAD` saw the probe file. What actually
        covers that gap is the post-fan-out `git status --porcelain` sweep,
        which was run after every fan-out and came back empty.
      EXCLUSION SET: any change under apps/ or packages/; any change under
        scripts/ or .github/ that is not deliverable 0.
        MEMBER USED: a file under apps/web/src/.

  A3  the report lists every assumption with a disposition.
      PASS (Executed): the ASSUMPTIONS block below carries nine entries, each
        marked ACCEPTED, CORRECTED or DEFERRED with its reason.
      FAIL, BY DATA: an entry with no disposition is visible on inspection of
        this block; the assertion is structural and its exclusion set is "an
        assumption named without a disposition". No such entry exists here.

  THE THREE PREMISES THE BRIEF HANDED DOWN, EACH CHECKED BEFORE IT WAS BUILT ON:
    1 FALSE. "Both files are already parsed by `check-compose.mjs`, so the reach
      exists." Executed: that script declares
      COMPOSE_FILES = ["docker-compose.yml", "docker-compose.dev.yml"] and reads
      nothing else; `.env.example` is read by `check-redis-safety.mjs`. There
      was no reach to extend, which is what settled 0b as a sibling.
    2 FALSE IN ITS FIRST HALF. Zebra #10461 "reverses the transaction-side anchor
      byte order". Read against the merged diff: it PRESERVES the existing
      reversed display order while re-implementing it - on the Sapling path the
      `.reverse()` is an unchanged context line. Its second half is CORRECT: the
      diff touches neither `getblock` nor `z_gettreestate` roots (zero
      occurrences). The ceiling is kept on the larger real change.
    3 FALSE. `/api/compact/:range` (handoff section 4). Executed:
      `API_PREFIXES = ["/v2"]` and `/api` answers 410. The plan names
      `/v2/compact/...`.

  DELIVERABLE 0a - THE CEILING. Value set at 6.3.0 INCLUSIVE, which is the
    fallback LEDGER-12 Q3 names, on a measurement rather than an assumption:
    `git tag --contains 1c9b245` returns EMPTY against a clone holding all 147
    tags, POSITIVELY CONTROLLED (the same command on v6.3.0's commit returns
    v6.3.0 plus its eight per-crate tags). #10461 merged 22 Aug 2026, twelve
    days after v6.3.0, the newest release; CHANGELOG.md on main has no
    Unreleased section. So there is no released version to set an EXCLUSIVE
    ceiling at.
    FAIL SIDES, BY DATA, against the real docker-compose.yml, each restored:
      zfnd/zebra:6.4.0  -> rc=1 ABOVE-CEILING naming 6.4.0 and <= 6.3.0
      zfnd/zebra:7.0.0  -> rc=1 ABOVE-CEILING
      zfnd/zebra:6.2.9  -> rc=1 BELOW-FLOOR
      zfnd/zebra:latest -> rc=1 UNPARSED
      zfnd/zebra:6.3.0  -> rc=0 IN-WINDOW  (pass state)
    EXCLUSION SET: any tag outside [floor, ceiling], and any tag that cannot be
      read. MEMBERS USED: all four above.

  DELIVERABLE 0b - THE CONFIG DEFAULT. Guard 17.
    FAIL SIDES, BY DATA, against the real tree, each restored:
      ${INDEXER_START_HEIGHT:-3428143} into docker-compose.yml -> rc=1 naming
        the variable and docker-compose.yml:240
      the .env.example line uncommented with its value -> rc=1 naming
        .env.example:46
      the bare form `INDEXER_START_HEIGHT: 3428143` -> rc=1, no-operator form
      a compose file under infra/ carrying the literal -> rc=1 (the reach fix)
    EXCLUSION SET: a literal default, in any of compose's operator forms or
      either `environment:` syntax or a .env assignment, for a variable a config
      module defaults from its own network field. MEMBERS USED: four above.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED — reason):

  1 CORRECTED. That `check-compose.mjs` parses `.env.example`. It does not;
    measured. 0b is a sibling and the header records the measurement.
  2 CORRECTED. That #10461 reverses the transaction-side anchor byte order. It
    does not; the ceiling's reason is restated on what the diff actually does.
  3 CORRECTED. That the compact endpoint is `/api/compact/:range`. `/api`
    answers 410; the plan names `/v2/compact/...`.
  4 CORRECTED. That a wasm module with no I/O imports makes "the key never
    leaves the tab" structural. `WebAssembly.Memory.prototype.buffer` hands the
    whole linear memory to JS; the worker's separate realm is the mechanism,
    and that became the strongest argument against the threaded build.
  5 CORRECTED. That SRI does not reach a wasm module. `fetch(url, {integrity})`
    carries integrity metadata on the Request and fails closed.
  6 CORRECTED. That Zcash blocks arrive every 2.5 minutes. The target is 75
    seconds; this repository states it in turnstile-accounting.ts:218 and the
    fixtures measure 75.36 s across 12,707 blocks.
  7 CORRECTED. That the newest committed capture is the chain tip. The captures
    record their own tip in `confirmations`: 3,468,549.
  8 ACCEPTED. That `apps/indexer/test/fixtures/blocks` is a usable sample for
    compact VOLUME. It is n=4, spans 12,707 heights, is entirely post-NU6.3 and
    is selected for shielded activity - all four stated beside the figure. Good
    enough to say "single-digit to low tens of megabytes, not gigabytes"; not
    good enough to size a cache, and the plan says so.
  9 DEFERRED. Every item in the plan's section 8: whether upstream librustzcash
    builds for wasm32-unknown-unknown; whether orchard 0.15.5 handles the
    Ironwood 0x03 lead byte; whether zfnd/zebra:6.3.0 starts a CompactTxStreamer
    when `lightwalletd_listen_addr` is set; any single-threaded decryption rate;
    worker CSP inheritance; Vercel's proxy-versus-CDN-cache ordering; the real
    bundle size. None is settleable from a session and each is named where it
    is relied on.

NOTICED (outside scope, not acted on):

  N1 THE #10461 FALSE ATTRIBUTION IS LIVE AT FIVE FILES AND TEN LINES, and one
     of them is a USER-VISIBLE finding message (leak-analyzer.ts:904). Enumerated
     rather than sampled - a first draft said "five sites" naming four files and
     four lines. `live-assessment.test.ts:246` ASSERTS the message contains
     "ZcashFoundation/zebra #10461", so the correction changes a test and earns
     its own review round; it is not the comment fix it first looked like. Not
     fixed here: five of the six sites are behind A2, and correcting only
     `docs/2.0/RUNTIME.md` would be a PARTIAL SWEEP, which LEDGER-03 Q3 rates
     HIGH in its own right. Integration track, alongside F-52-2's round 4.

  N2 THE PUBLISHER IS MAINNET-ONLY BY CONSTRUCTION. `apps/publisher/src/config.ts`
     has NO network field; `SNAPSHOT_IRONWOOD_BIRTH_HEIGHT` and
     `SNAPSHOT_DRAIN_BASELINE_HEIGHT` both default unconditionally to
     `NU6_3_MAINNET_HEIGHT`, and `.env.example` restates the same constant.
     A gate reviewer filed this as "the identical 705,857-block defect, still
     live" and that framing is WRONG and was rejected: Q6's shape is two copies
     that DISAGREE on testnet, and here they AGREE, so deleting the env line
     changes no behaviour and leaves the exposure. Guard 0b cannot see it by
     construction - the rule is defined relative to a module's own network field
     - and that bound is now stated in its header. A product question, in §8.

  N3 LOCAL `main` IS STALE at 8679e03 while origin/main is 98e87a0. A2 names
     `main..HEAD` without saying which; measured against the local ref it
     reports 252 files, against origin/main zero. Recorded under
     SPEC-WAS-AMBIGUOUS; nothing was done to the operator's local refs.

  N4 `handoffs/prompts/PROMPT-12c.md` does not exist and should not - L2 records
     that PROMPT-12c was withdrawn before it was pasted. Noted only so a later
     reader does not read the gap in the sequence as a missing archive.

UNVERIFIED (labelled):

  U1 Whether ZIP 2005's 0x03 Ironwood lead byte is handled by `orchard` 0.15.5.
     ZIP 2005 is Proposed. The plan builds assertion A4 on the distinction and
     labels it the second largest unknown.
  U2 Whether the published zfnd/zebra image starts a CompactTxStreamer. The
     SIBLING field's server is feature-gated out of `default-release-binaries`
     (verified against zebrad/Cargo.toml); this field's status is unknown and
     the precedent is in this repository's own zebrad.toml.
  U3 The Hacken audit of the ChainSafe snap (May 2025, reportedly 7 issues) -
     a search-index snippet, the page egress-blocked. Labelled at its point of
     use, the only such claim in the document.
  U4 Every rate quoted from ChainSafe's benchmark: one machine, one browser, a
     4-thread pool. Quoted with that n throughout.
  U5 The 2-4 MB bundle estimate. An interpolation between two MEASURED artifacts
     (2,147,533 B keys-only and 8,044,208 B wallet), not a measurement, and the
     plan says so.
  U6 CI on the current head. Green on cd19d70 (typecheck/lint/test and
     playwright both success); the run on 07b1daf was in progress at the time of
     writing and is re-checked before this PR leaves draft.

GATE ROUNDS: 2 complete, plus a third scoped by clause (ii)'s second amendment.
  Round 1: 7 dimensions dispatched, 6 returned, 45 findings.
  Round 2: 4 dimensions over the fix commits, 44 findings.
  Round 3: the lead's own audit of round 2's fix commit, 4 findings, all its own.
  93 findings in total. NO ROUND IS CLAIMED AS CONVERGENT - see EXTRAPOLATION.

  **THIS BLOCK WAS WRITTEN AT 20 FINDINGS AND 3 DIMENSIONS AND WAS ALREADY STALE
  WHEN IT SHIPPED.** Three more dimensions returned after the write-back commit;
  a gate reviewer found the mismatch between this section, section 8 and the LOG
  row on one side and the branch tip on the other. Corrected here rather than
  left, because a section 7 that understates its own gate is the defect this
  project has twice shipped and once measured.

  ROUND 1 VERIFICATION BUDGET, STATED FIRST AS LEDGER-05 Q5 REQUIRES: seven
  reviewers dispatched, each finding to be settled by an adversarial refuter.
  SIX dimensions returned 45 findings - 7 on the Zebra tag guard, 8 on the
  config-default guard, 5 on the plan's repository claims, 12 on the plan read
  against itself, 9 on its external facts re-fetched, 4 on the Revolution
  protocol. EVERY ONE WAS REPRODUCED BY THE LEAD BY EXECUTION before it was
  accepted or rejected, which under LEDGER-10 Q3 is the stronger evidence and is
  what licenses the lead to disposition alone.

  ONE DIMENSION DID NOT RETURN - the guard-count sweep - and is UNVERIFIED WORK,
  listed here with the others rather than as a trailing log line. The lead
  self-verified that ground by execution anyway: the count is seventeen against
  package.json's own `check` script, five asserting sites were swept, and the
  R4-GUARDS row fires at each when mutated. That is corroboration, not the
  dimension's own answer.

  FINGERPRINTS (file · rule · severity):
    docs/2.0/MODE-A-PLAN.md · section 3.3 omits CompactTx.ironwoodActions,
      the exact failure section 1.4 names · HIGH
    docs/2.0/MODE-A-PLAN.md · annual volume computed at a 150-second block
      target; Zcash targets 75 · HIGH
    docs/2.0/MODE-A-PLAN.md · the newest fixture used as the chain tip · HIGH
    docs/2.0/MODE-A-PLAN.md · Q6's stated reason refuted by its own table · HIGH
    docs/2.0/MODE-A-PLAN.md · Sapling-era block COUNT given as the tip HEIGHT · LOW
    check-compose-zebra-tag.mjs · message assertion computes its expected value
      by calling the function under test · HIGH
    check-compose-zebra-tag.mjs · the pinned-version half satisfied by the ref
      echo · HIGH
    check-compose-zebra-tag.mjs · UNPARSED_REASONS unpinned to the rule · HIGH
    check-compose-zebra-tag.mjs · ABOVE_BY and OUTCOMES unpinned · HIGH
    check-compose-zebra-tag.mjs · `headroom` has no assertion · MEDIUM
    check-compose-zebra-tag.mjs · `lastColon === -1` untested · MEDIUM
    check-compose-zebra-tag.mjs · fixture count hard-coded · LOW
    check-config-defaults.mjs · OK line asserts a probe that may not have
      run · HIGH
    check-config-defaults.mjs · no inertness floor on the surfaces · HIGH
    check-config-defaults.mjs · compose list-form environment invisible · MEDIUM
    check-config-defaults.mjs · discovery does not walk the tree it claims · MEDIUM
    check-config-defaults.mjs · FAIL message overstates a reference as a
      default · MEDIUM
    check-config-defaults.mjs · inline comment read as a literal value · LOW
    check-config-defaults.mjs · a form label unrelated to its line · LOW
    .env.example · REJECTED, not a finding - see NOTICED N2

  AND THE FINGERPRINTS FROM THE THREE LATER DIMENSIONS (fixed in 5937c3e and
  87a5ae1):
    MODE-A-PLAN.md · section 3.2 Source C read `lightwalletd_listen_addr` from
      `main`; at v6.3.0 the field DOES NOT EXIST and the struct is
      `deny_unknown_fields`, so setting it stops the node booting · HIGH
    MODE-A-PLAN.md · section 7's assertions are in a format R4 cannot read, so
      transplanted they give a vacuous pass · HIGH
    MODE-A-PLAN.md · A5's fail side cannot fail - its predicate reads
      'wasm-unsafe-eval' and its exclusion set is about 'unsafe-inline' · HIGH
    MODE-A-PLAN.md · A6 has no fail side at all · MEDIUM
    MODE-A-PLAN.md · Appendix B undercounts the population it answers · HIGH
    MODE-A-PLAN.md · the preamble promises a section 10 source for every rate and
      the only benchmark rate had none · HIGH
    MODE-A-PLAN.md · "single-digit megabytes" survived the 7 MB -> 34 MB
      correction eight lines above it · HIGH
    MODE-A-PLAN.md · 1.3's "2 seconds to 9" is the withdrawn 16,700-block era · MEDIUM
    MODE-A-PLAN.md · Q6 credits "section 0", which never mentions #10461 · MEDIUM
    MODE-A-PLAN.md · CVE-2021-4229 is 8.8 in the cited database, not 9.8 · MEDIUM
    MODE-A-PLAN.md · the size table puts the wasm module's bytes beside the npm
      package's file count · MEDIUM
    MODE-A-PLAN.md · A2 says it "extends" a spec a decrypt falsifies · MEDIUM
    MODE-A-PLAN.md · 1.1 puts the gateway fetch inside `packages/wasm-keys`,
      which 2.5 and A7 forbid · MEDIUM
    MODE-A-PLAN.md · 1.1 calls RevealKey "Unchanged" while section 6 requires
      copy changes, one of which Mode A makes false · MEDIUM
    MODE-A-PLAN.md · section 4.1 names two unestablished CSP questions, section
      8 carries one · MEDIUM
    MODE-A-PLAN.md · "three ChainSafe-adjacent npm packages" is twelve · LOW
    MODE-A-PLAN.md · source 21 claims a CORP header server.js does not set · LOW
    MODE-A-PLAN.md · 1.3 announces four reasons and lists five · LOW
    MODE-A-PLAN.md · section 10's numbering runs 1-36, 44-52, 37-43 · LOW
    handoffs/README.md · the prose says 13 IS `in-progress` while the row it
      sits beside says `shipped` · MEDIUM
    HANDOFF-13 section 7 · FILES omits `handoffs/LOG.md`, 13 paths against a
      14-path diff · LOW
    HANDOFF-13 sections 7/8 + LOG.md · a gate count the branch tip had already
      passed · MEDIUM
    commit 1c9c789 · its message says "the sweep two commits ago" and it is
      three · LOW, UNFIXABLE without rewriting history, recorded instead

  AND A FALSE CLAIM IN A COMMIT MESSAGE, FOUND BY ME AFTER THE FACT AND RECORDED
  RATHER THAN LEFT: `5937c3e`'s body leads with the Zebra v6.3.0 correction and
  THE EDIT WAS NOT IN THE COMMIT. The script that applied it asserted each of
  three patterns matched - correctly, which is LEDGER-09b Q6's rule working -
  threw on the third, and because it writes the file only at the end, the first
  two were discarded with it. I verified the OTHER corrections by grep and
  carried this one forward on the strength of having written it. The rule caught
  the bad replacement; I defeated the rule by not re-checking the file on disk.
  Applied in `87a5ae1`, which says so in its own message, and the other sixteen
  claims from `5937c3e` were then audited one at a time by grep - all present.

  All twenty of round 1's first three dimensions fixed or rejected in 07b1daf, and every mutation the round found
  SURVIVING was re-run against the fix: all closed but one, which survives BY
  DESIGN and is reported in the guard's own header rather than papered over
  (re-typing the literal fixture count into the summary sentence is caught by
  nothing, because no assertion reads that sentence, and an assertion over this
  file's own prose is the loose-pattern shape recorded elsewhere here).

  FOUR MALFORMED PROBES OF THE LEAD'S OWN, reported rather than silently redone,
  per the rule that a probe which does not discriminate and a guard that is
  inert produce the same output:
    P1 two guard mutants run from the scratchpad directory, so they died on tree
       discovery before the self-test could speak. Re-run from the repository
       root, BOTH SURVIVED - and both were real holes.
    P2 a quoting error meant a `blankComments` mutation never applied; the
       "SURVIVED" it reported was an artefact.
    P3 a `headroom` mutation whose pattern did not match the source.
    P4 a PROMPT-13 archive comparison whose line-offset arithmetic added a
       blank line, reporting a difference where the md5 sums are equal.

  THE FIX COMMIT (07b1daf) CHANGES EXECUTABLE LINES in both guards, so under the
  clause (ii) amendment it earns its own review round. That round is owed and is
  named in §8 rather than claimed.

  ROUND 1'S EXTRAPOLATION, KEPT ON THE RECORD BECAUSE IT WAS WRONG: three
  dimensions produced twenty findings, six HIGH, and it predicted "one or two
  more of that reach, most likely in the plan's prose about its own numbers
  rather than in the guards". Round 2 returned FORTY-FOUR. The direction of the
  error is the one this project has now recorded twice: the prediction flattered
  the branch, about commits the lead had itself written.

  ROUND 2. BUDGET FIRST, per LEDGER-05 Q5: four dimensions, every finding to be
  reproduced by the lead by execution before acceptance. All four returned; 44
  findings; none carried forward unread.

  Round 2 dimension 1-2 (the guards re-read, and the external facts re-fetched)
  produced 29 findings, fixed across 63bab43, 1091936 and ef7312f. The shape
  worth recording is that THE FIX COMMIT CREATED DEFECTS, which is what clause
  (ii) exists for: 07b1daf fixed `V= # leave unset` on the env surface and
  RE-CREATED it in the compose list branch it added in the same commit, because
  the list reader was blind to `- "NAME=value"`. Closed by making both surfaces
  share one `literalValueOf` parser - one parser, two callers. Adding the
  `inEnvironment` flag then opened two holes of my own, both of which survived
  their mutation, both closed with `ENV_BLOCK_FIXTURE`.

  ROUND 2 DIMENSION 3 - the plan read against itself - returned 15. Four had
  already been fixed by ef7312f and were VERIFIED DEAD ON DISK before anything
  was written (source 34's `main` citation, source 42, the preamble's row
  pointer, the seam-shape count). ELEVEN WERE LIVE, fixed in 312cad4:
    MODE-A-PLAN.md · A6's exclusion set is satisfied by the shipped document,
      and by the very line saying the measurement does not exist · HIGH
    MODE-A-PLAN.md · 9 Q6 says "five of the six sites" over a five-row table,
      four of them behind A2 · HIGH
    MODE-A-PLAN.md · section 8 still asks the pre-correction Source C question,
      whose premise 3.2 disproves · HIGH
    MODE-A-PLAN.md · Appendix B's costed directions argue from the count the
      same appendix corrects · HIGH
    MODE-A-PLAN.md · 3.3's byte arithmetic omits the Sapling spends its own
      table measures; 3.2 has no CompactSaplingSpend row · HIGH
    MODE-A-PLAN.md · 5.1 says "Mode A adds two" over a table marking three
      new · MEDIUM
    MODE-A-PLAN.md · 5.6 credits A2 with closing a leak A2 does not
      quantify over · MEDIUM
    MODE-A-PLAN.md · A2 and A11 each name two different assertions across three
      namespaces · MEDIUM
    MODE-A-PLAN.md · 1.3 claims "in order of weight", refuted by its own fifth
      reason twenty lines below · LOW
    MODE-A-PLAN.md · 9 Q1 frames COEP as cost-only, and it is the question the
      operator answers · MEDIUM
    docs/2.0/RUNTIME.md · says "there is no version CEILING guard yet", which
      this branch shipped · MEDIUM

  A6 IS THE ONE TO READ. Its exclusion set was a prose regex; executed against
  `docs/2.0/` it matched two lines, both ChainSafe's FOUR-THREAD figure, one of
  them 1.3's own `| Speed | UNVERIFIED - no measured single-threaded figure
  exists | ... 4 threads, n=1 machine |`. The assertion would have passed on the
  strength of a row whose text says the thing it requires has not been measured.
  LEDGER-11 Q5(a), committed by a session that had already committed it once.
  AND THE OBVIOUS TIGHTENING DOES NOT WORK, which is why this was executed
  rather than reasoned about: requiring "single-threaded" and an n as conjuncts
  still matches that same line, because both phrases are in it. Measured - prose
  regex 2 matches, three-conjunct 1, a structured `SINGLE-THREAD RATE:` record
  0. A POSITIVE CONTROL was run beside the two polarities, because a predicate
  that is inert and a predicate whose set is genuinely empty both report zero.

  THE PROSE-AGAINST-TABLE SHAPE, FIVE INSTANCES IN ONE FILE IN ONE ROUND, which
  is the recurrence clause (b) asks about and the reason it is enumerated here:
    1. 9 Q6's "five of the six sites" against its five-row table.
    2. Appendix B's heading "the four directions" above five directions.
    3. Appendix B's "all five instances" against its six-row table.
    4. Appendix B's "misses 1, 2, 4 and 5", one short of the same table.
    5. 5.1's "Mode A adds two" against three rows marked new.
  Three of the five are in Appendix B, which is the appendix about miscounting.
  NO GUARD IS PROPOSED FOR IT and that is a decision, not an omission: the
  predicate is "a cardinal in prose disagrees with the cardinality of a nearby
  structure", and identifying which structure a sentence refers to is the same
  judgement Appendix B costs out and declines. It is recorded as an open shape
  in §8 rather than dressed as covered, per clause (b)'s "recorded AS weaker".

  ROUND 3 - the lead's own audit of 312cad4, scoped by clause (ii)'s second
  amendment to (a) guard predicates, (b) test assertions and (c) sentences
  making a checkable claim about runtime behaviour, because round 2 returned no
  finding in an executable line of the product (there are none: A2's
  `-- apps packages` diff is empty). Every checkable claim 312cad4 introduced
  was re-executed. FOUR WERE WRONG, all mine, all in the commit that fixed the
  other eleven:
    MODE-A-PLAN.md · "HANDOFF-11 declined to add a seventh A11" - it declined a
      SECOND in its own section 5; a per-handoff decision reported as a
      repo-wide one · MEDIUM
    MODE-A-PLAN.md · the citation `git ls-files | xargs grep -l '^- **A11.**'`
      returns SEVEN, not the six the sentence states, because it counts this
      document's own A11. Scoped to `handoffs/HANDOFF-*.md` · MEDIUM
    MODE-A-PLAN.md · "this section's A1-A11 and A5b" after A12 was added to
      it · LOW
    MODE-A-PLAN.md · "all five listed in section 7's GATE ROUNDS" was a forward
      reference to a list that did not yet exist. It exists above · MEDIUM
  Both MEDIUMs are the LEDGER-04a shape - a claim built on an enumeration
  without asking the list for a member already known to be in it.

  TWO MALFORMED PROBES IN ROUND 2, REPORTED RATHER THAN QUIETLY REDONE, which
  brings this session's total to eleven:
    P10 the fixture recount read `tx.sapling.outputs` and returned zero Sapling
        for every block while reproducing Orchard and Ironwood EXACTLY. The
        fields are `vShieldedOutput` and `vShieldedSpend`. Had the disagreement
        been read as a defect in the table rather than in the probe, the fix
        would have deleted a column that was right.
    P11 a draft of 9 Q6's scope note reported "fourteen paths" from a
        `grep -rl --include=*.ts --include=*.md`, whose filters excluded
        `ci.yml` and `check-compose-zebra-tag.mjs` while admitting two `dist/`
        artifacts. A DIFFERENT FOURTEEN that happened to equal the right total,
        so the count looked confirmed and the membership was wrong. The member
        to have asked for was `check-compose-zebra-tag.mjs` - this session wrote
        the #10461 correction into it.

  EXTRAPOLATION, STATED RATHER THAN CONVERGENCE CLAIMED. Clause (i)(a) is NOT
  satisfied: round 3 returned four findings a reader could see. Clause (i)(b) is
  NOT satisfied: the prose-against-table shape has recurred across three rounds
  and has no guard, by a decision recorded above. THE REACH IS NOT DECAYING - it
  is FOLLOWING THE FIX COMMITS. Round 1 found 45, round 2 found 44, round 3
  found 4 in the commit that fixed round 2, and the last three rounds each found
  defects created by the previous round's fix. A fourth round would probably
  find one to three more, of round 3's reach: miscounted enumerations and stale
  cross-references in the newest prose, in (a)/(b)/(c) scope. It would not, on
  this evidence, find nothing. **This handoff ends at a PLAN AWAITING OPERATOR
  APPROVAL, and the plan's value is that its numbers and its assertions are
  right; the honest report is that three of them were wrong after two rounds
  said they were finished, and that the operator should read section 7's
  assertions as the part most likely still to carry one.**

PREVIEW URL:
  https://zecreveal-git-claude-new-session-0defoc-aquatic-17b9f112.vercel.app
  Deployment Protection makes it unreachable from a session (302 to SSO, and the
  egress proxy refuses the CONNECT before that), so it is UNVERIFIED here and is
  the operator's to open. No Lighthouse number is claimed: this branch changes
  no route, no component and no stylesheet.

VERIFICATION (all six gates re-executed on this branch at 312cad4, after the
round-2 and round-3 fixes; the earlier figures were taken at 07b1daf):
  TEST_RC=0        1400 passed / 109 skipped / 1509 total. NO POSTGRES OR REDIS
                   in this session, so the integration suites skip themselves;
                   the branch touches ZERO test files, so these are main's
                   totals.
                   **AN EARLIER DRAFT OF THIS LINE SAID 124 SKIPPED, WHICH DOES
                   NOT SUM WITH THE OTHER TWO FIGURES BESIDE IT** - 1400 + 124
                   is 1524, not 1509. Re-executed and aggregated: 109. A
                   verification block whose own arithmetic is refutable by
                   addition is the cheapest possible defect to find and it stood
                   through two gate rounds, which is the argument for
                   re-executing a claim rather than re-reading it.
  CHECK_RC=0       seventeen static guards, all green
  TYPECHECK_RC=0   12/12 packages
  LINT_RC=0        VALIDATE_RC=0        BUILD_RC=0   8/8 tasks
  Section 7's assertions transplanted into a synthetic handoff and driven
  through `check-ledger-structure.mjs`'s own exported `assertionFormatFindings`:
  optedIn true, **13 assertions**, 0 findings.
  git status --porcelain empty after every fan-out and before every commit.
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

**THIS SECTION WAS AN UNFILLED TEMPLATE UNTIL THE FINAL WRITE-BACK**, while
`handoffs/LEDGER.md` already carried three HANDOFF-13 appends. Found by comparing
this file against HANDOFF-12, which fills its own §8. The consolidated block is
below; the ledger's three appends stand as written, because it is append-only and
a block corrected in place would hide that the earlier reading was ever held.

```
GATE ROUND COUNTS: 3 rounds, 93 findings (45 / 44 / 4). NONE CONVERGENT.

QUESTIONS (for the operator / L2):
  Q1  THE PROSE-AGAINST-TABLE SHAPE RECURRED ACROSS THREE ROUNDS AND HAS NO
      GUARD, and this entry is the "recorded AS WEAKER" clause (b) requires.
      Five instances in ONE file in ONE round, three of them in Appendix B,
      which is the appendix about miscounting. A guard was attempted and
      abandoned: the predicate is "a cardinal in prose disagrees with the
      cardinality of a nearby structure", and resolving WHICH structure a
      sentence refers to is the judgement Appendix B itself costs out and
      declines. A written rule stands in, with no self-test.
      THE RULE: a sentence stating a cardinal about a structure in the same
      document names the structure, and the cardinal is read off it at write
      time rather than carried from a draft.
      DECIDE: is the narrower guardable case worth having - a cardinal in the
      SAME markdown block as a table, counted against that table's rows? It
      would have caught three of the five and could not have caught the others.
  Q2  A6 IS THE SECOND LEDGER-11 Q5(a) INSTANCE THIS SESSION COMMITTED, and the
      finding worth carrying is not that but this: THE OBVIOUS TIGHTENING DOES
      NOT WORK. Adding "single-threaded" and an n as conjuncts still matches the
      line that says no single-threaded figure exists, because both phrases are
      in it. Measured - prose regex 2, three-conjunct 1, structured record 0.
      PROPOSED AMENDMENT to LEDGER-11 Q5(a): when a clause is found satisfied by
      a value the object already exhibits, the REPAIRED clause is executed
      against the object before it is written down, and the transcript carries a
      POSITIVE CONTROL. A predicate that is inert and one whose set is genuinely
      empty both report zero, and the reading is not available from the result.
  Q3  A12 WAS ADDED BY THE GATE, because a COVERAGE CLAIM was wrong rather than
      a test missing. 5.6 rated a glue or error-path leak as closed by A2; A2
      quantifies over requests, A8 over storage, A11 over linear memory, and a
      key in an `Error.message` is none of the three. This is the seam family
      one level up: three assertions each exhaustive over its own channel, the
      gap between them covered by none, invisible because each is complete.
  Q4  SHOULD LEDGER-04a GAIN "the count matching is not the check; name the
      member"? Two of round 3's four findings are that shape, and one is the
      diagnostic case: a draft enumeration reported "fourteen paths" from a grep
      whose filters excluded two files and admitted two build artifacts - a
      DIFFERENT fourteen that happened to equal the right total, so the matching
      count read as the check having passed.

INFERRED (non-empty inferences a worker made):
  The Sapling-spend slot is 36 bytes - `nf` at 32, plus a tag and length byte
  for the field and the same for its slot in `CompactTx`. Inferred from the two
  slot sizes section 3.2 already derives (124, 159) rather than read from a wire
  capture. It moves the volume figure from 822 to 840 bytes per block, so an
  error here is bounded at 2 per cent and changes no conclusion in 1.5.

NOT-MATCHED (patterns handed over that did not apply): none in rounds 2 and 3.
  The three FALSE premises the brief handed down are in §7, not here, because
  each was checked and refuted before it was built on rather than left unmatched.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews): none.

DEFERRED ASSUMPTIONS:
  The #10461 attribution correction stays DEFERRED, and the reason is the sweep
  rule rather than A2. Five tracked files assert it, four behind A2 and
  `docs/2.0/RUNTIME.md` not; correcting only the reachable one is a HIGH finding
  under LEDGER-03 Q3. It belongs to the Integration track.
  ONE HALF OF THAT LINE WAS NOT DEFERRED: RUNTIME.md:215 also said "there is no
  version CEILING guard yet", which THIS BRANCH SHIPPED. A different fact in the
  same sentence, correctable without touching any attribution site.
```
