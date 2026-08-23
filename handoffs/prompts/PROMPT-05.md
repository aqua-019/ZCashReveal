# PROMPT-05 — the messages that steered the HANDOFF-05 session

Archived under the revolution protocol, step 5: every message that steered this session, verbatim,
under a heading naming what it is and when it arrived. One file per handoff, not one per message.

## 1. Session kickoff — the message that opened the session (23 Aug 2026)

Reproduced byte-for-byte, including the fenced `L2 RESOLUTION` block that the protocol's step 2
consumes. The block was appended verbatim to `handoffs/LEDGER.md` beneath the HANDOFF-04 ledger
block, and its six folds were applied in the RECONCILE commit.

```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-05-gateway-api.md. It is the Data track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.
L2 RESOLUTION
L2 RESOLUTION — HANDOFF-04 (Cowork, 23 Aug 2026)
VERIFY (Executed by L2 on a clean worktree of 4ee1c1f, not relayed): pnpm install --frozen-lockfile rc=0 · pnpm typecheck rc=0 · pnpm lint 0 errors, 1 pre-existing warning · check-no-emoji rc=0 · check-vercel-config rc=0 · Playwright 127 passed in 3.3 m · cold `pnpm -r test` with dist AND tsbuildinfo deleted: content 62, gateway 7, indexer 133 / 38 skipped, web 346, rc=0 - the tsbuildinfo move holds under exactly the condition it was written for. THE VERCEL FIX IS CONFIRMED FROM THE DEPLOYMENT RECORD: `pnpm turbo run build --filter=@zcashreveal/web` builds on Vercel. dpl_J5ryna, dpl_7H8zRa and dpl_2oH5aQ (the head, 4ee1c1f) are all READY. The branch went from ERROR to READY on the commit that changed the build command, and stayed READY for three consecutive deployments. THE KEY PROMISE, BROKEN ON PURPOSE BY L2. I did not accept the A11 suite on its own evidence. I planted the exact regression it exists to catch - added `value={probe}` with a `useState` echo, making the field controlled again - rebuilt from clean, and re-ran: test 2 of 14, "the key is in no attribute of any element in the serialised DOM", FAILED, and the other thirteen passed. Reverted, rebuilt, 14 passed. The suite detects the regression, it detects the RIGHT one, and it does not fire spuriously. That is the strongest evidence available short of a formal proof, and it is now on the record. The CSP was read rather than assumed: `connect-src 'self'` in fixture mode, `form-action 'none'`, `base-uri 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, `font-src 'self'`. Between the uncontrolled field, `connect-src` and `form-action`, the promise is enforced by the browser and not only by the author. Verdict: every assertion holds. One gate round, 36 findings, converged. NO FINDINGS FROM L2.
ANSWERS to the ledger questions: Q1 THE FOURTH GOLD JOB — you read the finding correctly and I agree with both of your calls. A consensus label is a claim about third parties, not the system's furniture: ink, with the precedence rank in words, is right. (a) The hover borders: gold is not a hover verb. Both `.entry:hover` and `.tk-examples a:hover` move to `--ink-dim`; the reviewer was right that the second followed precedent, and the precedent was the defect. Fold 1. (b) The unprovable-residual figure stays INK. Your reason is the correct one and I want it in the rule: gold marks a boundary crossing, not a magnitude, and a large gold number on a figure about unprovability reads as an accusation the site does not make. Fold 2 writes that sentence into CLAUDE.md so the next reader does not have to re-derive it. Q2 /address AT 94 — leave the assumptions in. An estimate that renders a claim chip without the assumptions that qualify it is the one thing this site cannot ship, and trading two tenths of a second of LCP for it is not a close call. Do not make the disclosure lazy. 94 stands under fold 3's container allowance, with this as the recorded reason. Q3 THE MEASUREMENT IS BLOCKED TWICE — this is the most useful thing in the ledger and it changes my instruction to the operator. I had been asking for Deployment Protection to come off; you have shown that would not be enough, because the session's own egress proxy refuses the CONNECT tunnel to the preview host with a 403 before SSO is ever reached. I reproduced the same class of refusal from L2's side. So the deployed measurement is not a thing a session can take at all, whatever the operator toggles. Ruling: the deployed Lighthouse number is the OPERATOR'S measurement, taken in a browser and pasted into the ledger, not a handoff deliverable; the container number remains the gate. Fold 4 rewrites the assertion accordingly, and HANDOFF-11 must plan for the same wall between a session and a live gateway - a session will never reach the VPS, so every live check there is either the operator's or it does not happen. Q4 `Unverified.surface` WITH 24 OF 32 RENDERING NOWHERE — make it nullable and have `permalink()` refuse rather than emit a dead anchor. A link that resolves to a page instead of the claim is a worse lie than no link. The editorial question - whether the other 24 should render at all - is mine and my answer is yes, eventually: a quarantine nobody can read is indistinguishable from suppression, which is precisely the failure this site documents in others. But it is a page, not a field, and it belongs to a later Web handoff. Fold 5 does the nullable half now and records the page as owed. Q5 `script-src 'unsafe-inline'` — ACCEPTED for now, on your reasoning, and I am ruling on it early exactly as you asked. A site with no user input, no database and no third-party script has little for an injected script to do, and the per-request nonce would cost the prerendering that the whole performance argument rests on. But your instinct about HANDOFF-13 is right and I am binding it now rather than leaving it to be rediscovered: when WASM decryption puts real note data in that tab, `unsafe-inline` is no longer acceptable, because the thing an injected script could then read is the user's own transaction history. Fold 6 writes that condition into HANDOFF-13 as a precondition of the plan. Q6 THE HEIGHT CORRECTION — accepted, and thank you for putting it in the right place rather than editing an append-only file. Three heights, three meanings, all three stated on /pools is the correct resolution.
FOLDS (apply in the RECONCILE commit):

1. `apps/web` - `.entry:hover` and `.tk-examples a:hover` use `--ink-dim`, not `--gold-dim`. Gold is not a hover verb (LEDGER-04 Q1a).
2. CLAUDE.md, design system - append to the gold rule: "Gold marks a boundary crossing, never a magnitude. A large figure is not gold because it is large; a figure about unprovability is never gold, because size in the accent colour reads as an accusation this site does not make." (LEDGER-04 Q1b)
3. CLAUDE.md, revolution protocol - append to the Lighthouse line: the deployed measurement is the operator's, taken in a browser and pasted into the ledger. A session cannot reach a preview host: Deployment Protection returns 302 to SSO, and the session egress proxy refuses the CONNECT tunnel with 403 before that. The container number is the gate (LEDGER-04 Q3).
4. HANDOFF-11 §2 - add to the reading: a session cannot reach the VPS, the gateway or a preview host from inside its container. Every live check in that handoff is either the operator's, taken and pasted, or it is not taken. Plan the cutover checklist on that basis rather than discovering it at cutover (LEDGER-04 Q3).
5. HANDOFF-05 §4 - add a deliverable: make `Unverified.surface` nullable in `packages/content` and have `permalink()` return null rather than a dead anchor when it is absent; callers render plain text where they would have rendered a link. Record in §8 that a page for the 24 unrendered quarantine records is owed to a later Web handoff (LEDGER-04 Q4).
6. HANDOFF-13 §3 - add a precondition: Mode A may not ship while `script-src` carries `'unsafe-inline'`. Decrypted note data in the tab changes what an injected script could read, and the plan must cost the nonce-plus-middleware path against the prerendering it removes (LEDGER-04 Q5).

NOTE ON TRACK ORDER: 02, 03 and 04 have closed the Web track's first pass. HANDOFF-05 (Data) is the open handoff and this session owns it. HANDOFF-10 (Infra) is also open and unclaimed; if Aqua wants the Infra track running in parallel it needs its own session, told it owns HANDOFF-10.
OPERATOR CLICKS OUTSTANDING: delete the stale remote branches per `docs/2.0/BRANCH-CLEANUP.md`. Deployment Protection is no longer worth toggling for L2's benefit (see Q3) - leave it as you prefer. If you want a deployed Lighthouse number on the record, take it in your own browser on `zecreveal-git-main-aquatic-17b9f112.vercel.app/beware` and paste the two figures; a session cannot.
```

## 2. Mid-session direction - the expiryheight finding, verified by L2 on main (23 Aug 2026, arrived while `packages/zebra-rpc` was being written, before the PR was opened)

Arrived after the boundary fix had landed but before any of it was reported. It confirms the
finding independently, and adds two requirements: an account in section 7 of which fingerprint
tests change behaviour plus a fixture in the wire's casing, and a note in section 8 binding
HANDOFF-08 and HANDOFF-10.

```
Two consequences of the expiryheight finding, verified independently by L2 on main. The finding is right: RpcTransaction declares expiryHeight (transactions.ts:98), the lowercase expiryheight/versiongroupid Zebra emits appear nowhere in the repo, leak-analyzer.ts:114 turns the absence into null, and fingerprint.ts gates at least three wallet signatures on `expiryDelta !== null` with ranges 35-50 and 15-25. So the fingerprint has not been degraded since v0.2 - it has been INERT on every real RPC transaction, while reporting that it found nothing. Fixing it at the boundary is correct.

1. THE EXISTING TESTS PASSED VACUOUSLY, AND THAT IS THE THING TO RECORD. No test fixture in the repo sets expiryHeight in either casing, so the fingerprint tests have been exercising the null branch and asserting the answer it gives when it cannot see. Do not treat their continued passing as evidence the fix is safe. Say in §7 which fingerprint tests change behaviour once the boundary maps the field, and add at least one fixture carrying the real lowercase RPC shape so the non-null branch is exercised at all. If none change, that is itself a finding worth stating, because it would mean the ranges never match real data either.

2. HANDOFF-08's GOLDEN CASES MUST NOT BE CAPTURED BEFORE THIS LANDS. 08 is the analysis toolkit and its golden baselines are the record of correct behaviour. A baseline captured while the fingerprint is inert freezes the bug into the thing that is supposed to detect it. Note in §8 that HANDOFF-08 depends on this fix being merged first, and that HANDOFF-10's mainnet block fixture must be captured from a real RPC response rather than hand-written, so the casing in the fixture is the casing production sees.
```


## 3. Mid-session direction - the log is the third copy of the viewing-key exposure (23 Aug 2026, arrived after the 404 handler was fixed, before the PR was opened)

A follow-on to a finding this session made and reported: the 404 handler echoed the query string
back to the caller. L2 verified the fix against main and pointed out that it is incomplete,
because stopping the echo does not stop the write to disk. It adds an assertion to section 5.

```
Follow-on to your own 404 finding, verified by L2 against main. The fix to the 404 body is correct and incomplete.

apps/gateway/src/index.ts constructs Fastify({ loggerInstance: log }) with a pino instance that sets no `redact` and no custom `req` serializer. Fastify's default serializer logs req.url including the query string on every request, and again on the error path. So the exact scenario your 404 finding describes - a viewing key reaching the gateway in a path or query - still writes that key to the gateway log, where it persists on VPS disk and in anything the logs are shipped to. Stopping the echo to the caller does not stop the write to disk, and the log is the worse of the two because it is durable and is read by people who are not the caller.

Add to this handoff:
- A pino `serializers.req` that logs method, request id and the PATH ONLY with the query string dropped, and that replaces any run matching the viewing-key prefixes (uview1, zxviews1, zivks1, secret-extended-key, and the unified full/incoming forms) with "[redacted]" before the line is written. Same treatment on the error serializer. Add `redact` for req.headers.authorization and req.headers.cookie with remove: true while you are there.
- A §5 assertion, both polarities: issue a request whose path and query contain a well-formed viewing key, capture the pino output stream in-process, and assert no fragment of the key appears in any emitted log line, nor in the response body, nor in the response headers. Fail side: restore the default serializer and watch the same assertion fail. The A11 suite in apps/web proves the key never leaves the browser; this is the same promise on the other side of the wire, and right now nothing tests it.
- Note in §8 that reverse-proxy access logs are the third copy of this exposure. cloudflared and anything in front of the gateway log full URLs by default, and that belongs to HANDOFF-10's runbook rather than here.
```
## 4. L2 NOTE - the managed Redis is connected, and it is SHARED (23 Aug 2026, arrived as a file after PR #36 was opened, applied to this branch under the note's own instruction)

Delivered as an uploaded file rather than as a prompt. It is the answer to the question
HANDOFF-10 section 3 told a future session to go and ask - "read the variable names the
integration injected and record the result as an ASSUMPTION" - and the answer contradicts the
names this repository states in thirteen places. It also adds a constraint nothing in the tree
anticipated: the store is shared with an unrelated production project. Its own instruction is
"apply this in your next commit if you are mid-session", and this session was, so it is applied
here rather than carried to HANDOFF-09.

```
L2 NOTE — the managed Redis is connected, and it is SHARED. Read before writing any Redis code.

Apply this in your next commit if you are mid-session; otherwise carry it into the handoff that
first touches the managed store. It changes no scope. It adds constraints that are not optional.

WHAT IS TRUE NOW (Executed by L2 in the Vercel UI, 23 Aug 2026)
The Upstash-for-Redis store `upstash-kv-blue-garden` (Upstash ID
230ab52f-21d9-4a63-950e-ad265cc75902, Free plan) is connected to the `zecreveal` project,
Production and Preview, with the custom variable prefix `SNAPSHOT_REDIS`. The injected names are:
  SNAPSHOT_REDIS_KV_REST_API_URL
  SNAPSHOT_REDIS_KV_REST_API_TOKEN
  SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN
  SNAPSHOT_REDIS_KV_URL
  SNAPSHOT_REDIS_REDIS_URL
The prefix is deliberate: an unprefixed connect injects a bare `REDIS_URL`, which is the name this
repository already uses for the VPS Redis. Those are two different servers and must never be
conflated. `REDIS_URL` = the VPS Redis, hot path, pub/sub, mempool:live, anchors. `SNAPSHOT_REDIS_*`
= the managed store, snapshots only.

THE CONSTRAINT THAT IS NEW AND NON-NEGOTIABLE
**This store is not ours alone. It also holds the live data of an unrelated production project.**
The operator has accepted that trade deliberately, on the free tier, until the 500K commands per
month allowance is reached. Every rule below exists because a mistake here damages someone else's
project, not ours.

1. EVERY key this project writes, reads or deletes begins `zecreveal:`. No exceptions, no
   convenience keys, no scratch keys, no health-check key outside the namespace.
2. `FLUSHDB`, `FLUSHALL`, `SWAPDB` and `SCRIPT FLUSH` are FORBIDDEN in code, in tests, in fixtures,
   in scripts, in docs as suggested commands, and in any runbook step. There is no circumstance in
   this project where they are correct against this store.
3. `KEYS` is forbidden outright. `SCAN` is permitted only with `MATCH zecreveal:*`. A bare scan
   enumerates the other project's keyspace.
4. No `DEL` by pattern. Delete only keys this project wrote, by exact key.
5. Tests and local development NEVER point at this store. Integration tests use a local Redis or a
   fake. If a test needs the managed store it does not run in CI.
6. The publisher is the only writer. `apps/web` reads with
   `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` and never the read-write token.

THE BUDGET IS NOW A SHARED BUDGET
500K commands per month, per database, shared with the other project. The snapshot design is 3
commands per new tip (`MULTI`: `SET zecreveal:snapshot:latest`, `SET zecreveal:snapshot:<height>`
with a 24 h TTL, `SET zecreveal:snapshot:height`). At roughly 1,150 blocks a day that is about
3.5K/day, about 105K/month, about 21% of the allowance before the other project's usage is counted.
Therefore:
  - A §5 assertion, wherever the publisher lands: one tip produces exactly 3 managed-store commands.
    Fail side: a change that adds a fourth is caught by the count, not by review.
  - The publisher logs a monthly running command count and refuses to start if a configured ceiling
    (`SNAPSHOT_REDIS_MONTHLY_BUDGET`, default 150000) would be exceeded, so this project can never be
    the reason the other one gets rate limited.
  - Per-mempool-transaction data NEVER goes to the managed store. That stays on the VPS Redis. The
    whole reason 3-per-block fits is that it is 3 per block.

WRITE IT DOWN
Record the two-server topology, the `zecreveal:` namespace rule, the forbidden-command list and the
shared-budget ceiling in `docs/2.0/SNAPSHOT.md` and in `CLAUDE.md` under the stack section, so a
later session cannot rediscover this by breaking it. Note in §8 that the operator's stated exit
condition is the 500K/month allowance: when the shared total approaches it, ZECReveal moves to its
own database (the Upstash free plan allows up to 10 databases per account, each with its own 256MB
and 500K commands, so the move costs nothing).

NOTHING ELSE CHANGES. Do not touch the other project, its keys, its variables or its connection.
```
