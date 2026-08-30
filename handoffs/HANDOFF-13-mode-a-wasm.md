---
handoff: 13
title: Mode A — viewing-key decryption in the browser (2.1; PLAN ONLY, stop for approval)
status: queued
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

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `docs/2.0/MODE-A-PLAN.md` exists, cites ≥ 5 upstream sources with versions, and contains sections Architecture / Threat model / Build pipeline / Gateway needs / Open questions / Proposed §5.
- **A2.** `git diff --stat main..HEAD -- apps packages` is empty (plan only). Deliverable 2 is inside `docs/2.0/MODE-A-PLAN.md` and this file, both outside `apps` and `packages`, so it does not weaken this assertion.
- **A3.** The §7 report lists every assumption with a disposition.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `researcher` (Haiku) collects cited facts; `chain-integrator` (Sonnet) writes the plan; `security-auditor` reviews the threat model before the PR opens. The lead stops for operator approval.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE | DONE-WITH-ASSUMPTIONS | BLOCKED | OUT-OF-DEPTH | NOT CONVERGING
BRANCH / PR:
DIRECTORS SPAWNED (lead names each + spawn mode proven):
FILES (created / modified / moved):
EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED):
ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED — reason):
NOTICED (outside scope, not acted on):
UNVERIFIED (labelled):
GATE ROUNDS: n · fingerprints (file · rule · severity) per round
PREVIEW URL (if any):
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
