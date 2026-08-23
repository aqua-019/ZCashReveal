---
handoff: 05
title: Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)
status: closed
branch: the session-designated branch (name it `feat/v2-05-gateway-api` if you may choose)
track: Data
depends_on: 00 (uses the DTOs from 04 if merged; otherwise defines them)
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-05 — Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Extend the existing Fastify gateway with the read API the Tracking UI needs, backed by Zebra 6.x address-index RPCs cached in Postgres for the transparent side and by the indexer tables for shielded metadata; add rate limiting and a WebSocket connection cap; move the Zebra RPC client into a shared package.

**Out of scope:** No historical full-chain index (deferred; see plan §9). No changes to the indexer's analysis.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `apps/gateway/src/index.ts`, `ws-broker.ts`, `config.ts`, `src/__tests__/ws-broker.test.ts`
- `apps/indexer/src/zebrad-rpc.ts` (to be moved), `apps/indexer/migrations/*.sql`
- Zebra 6.x RPC documentation for `getaddressbalance`, `getaddresstxids`, `getaddressutxos`, `getrawtransaction` (verbosity 1), `getblock` (verbosity 2), `getblockchaininfo` — cite the doc/source version read
- `packages/zec-types` DTOs (from HANDOFF-04) or the contract below

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Endpoints: `GET /api/search?q=`, `GET /api/address/:addr`, `GET /api/tx/:txid`, `GET /api/block/:height`, `GET /api/pools`, `GET /api/labels`, `GET /api/cases`, `GET /api/snapshot` (stub until HANDOFF-09). All responses validated against the Zod DTOs before sending.
- `packages/zebra-rpc`: typed client with retries/timeouts; JSON shapes validated with Zod; no `any`.
- Cache tables via migration `003a_gateway_cache.sql` in `apps/indexer/migrations`: `tx_cache(txid, height, json, refreshed_at)`, `address_cache(addr, balance_zat, received_zat, spent_zat, utxo_count, first_seen, last_seen, refreshed_at)`; cache-aside with TTL (config).
- Hardening: `@fastify/rate-limit` per IP (config), WsBroker connection cap (default 500) closing with code 1013, request-id logging, CORS from config. Existing 7 WS tests stay green.
- Redis topology (two instances, never confused): the gateway keeps the **VPS-local** Redis (`REDIS_URL`) for pub/sub and `zcashreveal:mempool:live`; the rate limiter uses the in-memory store unless `RATE_LIMIT_REDIS_URL` is set (then an `ioredis` store on that URL). The **Vercel-managed** Redis (`SNAPSHOT_REDIS_*`, HANDOFF-09/11) is never on the gateway hot path — no per-transaction traffic leaves the VPS.

## §4 DELIVERABLES

1. `packages/zebra-rpc` + removal of the duplicate client from the indexer (indexer imports the package).
2. Route modules under `apps/gateway/src/routes/` with Zod validation; labels/cases served from `packages/content`.
3. Migration `003a`; cache module with TTL; unit tests with a mocked RPC; one Postgres-gated integration test.
4. `docs/2.0/API.md` documenting every endpoint with example responses.
5. Fix the stale reference at `apps/gateway/src/ws-broker.ts:8` — it still points at `apps/dashboard/src/lib/ws.ts`, which moved to `legacy/dashboard/` in HANDOFF-00 (LEDGER-00 NOTICED; A8 there forbade touching it).
6. **(LEDGER-04 fold 5, Q4)** Make `Unverified.surface` nullable in `packages/content` and have `permalink()` return `null` rather than a dead anchor when it is absent; callers render plain text where they would have rendered a link. 24 of the 32 quarantined records render on no page, so a required `surface` had three quarters of the corpus asserting a surface it does not appear on. Record in §8 that a page for those 24 is owed to a later Web handoff. *(Executed count: 22, not 24. Six records anchor on `/flows` and four on `/network`, measured from the prerendered HTML of a production build - LEDGER-03 Q4 and LEDGER-04 Q4 both state four and four, and the two allegations rows on `/flows` that own their anchors are what that count missed. The fold's instruction is unchanged; only the figure is. See §7.)*

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/gateway test` exits 0 (≥ 7 + new tests); `pnpm --filter @zcashreveal/zebra-rpc test` exits 0.
- **A2.** `GET /api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` against a mocked RPC returning the known values responds with `balanceZat: "7818340930000"` and `label.labeller === 'consensus'` (route test). If a synced Zebra 6.x is reachable, the same request against it is Executed and the output pasted in §7; otherwise the live check is labelled UNVERIFIED.
- **A3.** Every route rejects a malformed input with 400 and a Zod issue list (tests for a 62-hex txid, a `t2` address on mainnet, a negative height).
- **A4.** Rate limiting: 120 requests in 10 s from one IP yield ≥ 1 response with status 429 (test with the plugin's test hooks); with `RATE_LIMIT_REDIS_URL` unset the gateway opens exactly two Redis connections — subscriber and reader — and no third (test spies the `ioredis` constructor) *(fail side: set `RATE_LIMIT_REDIS_URL` → a third connection is opened)*.
- **A5.** WS cap: with the cap set to 2, the third connection is closed with code 1013 (test).
- **A6.** Cache: a second `GET /api/address/...` within the TTL performs 0 RPC calls (mock call counter) *(fail side: set TTL to 0 → RPC called again)*.
- **A7.** No response leaks RPC credentials or internal hostnames (test greps serialised responses for `ZEBRAD_` values).
- **A8.** `grep -rn "from '../../indexer" apps/gateway` is empty — the gateway depends on packages, never on indexer sources.
- **A9.** *(added mid-session by the operator, 23 Aug 2026, following the 404 finding.)* A viewing key that reaches the gateway is written NOWHERE. Issue requests whose path and query carry a well-formed viewing key, capture the pino output stream in-process, and assert that no fragment of the key appears in any emitted log line, in any response body, or in any response header *(fail side: restore Fastify's default request serialiser and watch the same assertion fail)*. The log is the surface that matters most: a caller who sends a key already has it, and a log line persists on VPS disk and in anything the logs are shipped to. The `apps/web` A11 suite proves the key never leaves the browser; this is the same promise on the other side of the wire.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Two-hop: `chain-integrator` (Sonnet) writes the route contract + RPC client design; `backend-api` (Haiku) executes against the written contract after a PREFLIGHT (RPC/auth trigger). Loop 3 spec-author review applies.
- director-quality: `security-auditor` reviews rate limit, CORS, secret handling; `devops-deployer` runs the test matrix in CI.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/gateway-api-handoff-05-12ogr3 (the harness names the branch;
  the PR title carries HANDOFF-05, which is what LOG.md and LEDGER.md key on).
  PR #36, opened as a draft and stopped there:
  https://github.com/aqua-019/ZCashReveal/pull/36

SPAWN MODE (proven by tool attempt, reported first): BOTH tools answer in this
  session, and both were used.
  - Agent: probe `ae16bb17acf51c97d` was sent "Reply with exactly the string:
    SPAWN-OK" and did. One real crew worker followed: `chain-integrator`
    (`aacd581e7030dcca7`), read-only, 139 transcript records, returned DONE with
    the Zebra 6.3.0 wire contract read from the clone at
    /home/user/zcashfoundation/zebra, commit 1c9b2450349b53232e2787bef62dd0e21b10e041.
    Its first section is the one that mattered: four of Zebra's own doc comments
    contradict its serialisation code, and a client written against the comments
    mis-parses. `packages/zebra-rpc/src/schemas.ts` is written against the structs.
  - Workflow: the gate, run `wf_c693a51d-35d` / task `w5s72l954`. 14 agents,
    1,530,954 tokens, 346 tool calls. Four lenses - security, spec, facts, copy -
    all returned FAIL, 39 raw findings.
  - NO DIRECTOR WAS SPAWNED, so §6's shape happened in half. The
    `chain-integrator` hop is the half that did: it wrote the contract and the
    lead executed against it, rather than `backend-api` executing after a
    PREFLIGHT. That is a divergence from the dispatch hints and it is stated
    rather than glossed. The part of the shape that catches errors - an
    adversarial gate by reviewers who did not write the code - did happen, three
    times.

FILES

  created
    packages/zebra-rpc/ ............ package.json, tsconfig, vitest config, and
      src/{index,client,schemas,types,errors}.ts + src/__tests__/client.test.ts
    apps/gateway/src/server.ts ..... buildServer, every dependency injected
    apps/gateway/src/logger.ts ..... the request serialiser A9 rests on
    apps/gateway/src/{address,cache,serialize,search-kind}.ts
    apps/gateway/src/routes/ ....... index, deps, errors, address, tx, block,
      pools, search, labels, cases, flows, mempool, snapshot
    apps/gateway/src/views/ ........ units, stamp, labels, context, address, tx,
      block, pools, mempool, flows
    apps/gateway/src/__tests__/ .... harness.ts, routes.test.ts,
      hardening.test.ts, units.test.ts, log-redaction.test.ts,
      pg-cache.integration.test.ts
    apps/gateway/scripts/capture-examples.mts .. the examples in API.md
    apps/indexer/migrations/003a_gateway_cache.sql
    apps/indexer/src/decoder/__tests__/rpc-casing.test.ts
    apps/indexer/test/fixtures/transactions/ywallet-orchard-only.json + README.md
    docs/2.0/API.md
    apps/web/test/e2e/quarantine-anchors.spec.ts
    handoffs/prompts/PROMPT-05.md

  modified
    packages/zec-types/src/transactions.ts ... the wire shape, honestly optional
    packages/zec-types/src/views.ts .......... conventionalFeeZat given a meaning
    packages/content/src/{schema,loaders}.ts . nullable surface, permalink, and
      requirePermalink for the callers that must have one
    packages/content/data/unverified.json .... surface null where none exists
    apps/gateway/src/{index,config,ws-broker}.ts, tsconfig, vitest config
    apps/indexer/src/{index,config}.ts, decoder/{block-decoder,orchard}.ts
    apps/web/ ................................ the components that render a
      quarantine record now that permalink can be null, plus the units fixture
      swept for the false IEEE-754 claim
    CLAUDE.md, .env.example
    handoffs/{README,LEDGER,HANDOFF-04,HANDOFF-08,HANDOFF-10,HANDOFF-11,HANDOFF-13}

  deleted
    apps/indexer/src/zebrad-rpc.ts ... deliverable 1; the indexer imports the
      package now, and `grep -rn "zebrad-rpc" apps/indexer/src` is empty

  added after the PR opened, applying the L2 NOTE on the shared managed Redis
  (archived at handoffs/prompts/PROMPT-05.md section 4; the note's own instruction
  is to apply it in the next commit when a session is mid-flight, and this one was)

    created
      docs/2.0/SNAPSHOT.md ............... the topology, the `zecreveal:` namespace
        rule, the seven forbidden-command rules, the shared budget, the exit condition
      scripts/check-redis-safety.mjs ..... 20 detectors, self-tested both polarities
      packages/zec-types/src/redis-topology.ts .. both key prefixes as constants, the
        snapshot key builders, and `assertNotManagedStore`

    swept - the corrected fact is "the managed store holds only this project's data",
    which was false in seven places, and "the injected variable names are
    SNAPSHOT_REDIS_URL / _REST_URL / _REST_TOKEN", which was false in thirteen
      CLAUDE.md (both the stack section and the Don'ts), README.md,
      handoffs/README.md (the index paragraph and the operator click list),
      docs/2.0/{API.md, DEPLOY-2.0.md, SNAPSHOT.md}, apps/web/README.md,
      apps/gateway/src/config.ts, .env.example, apps/web/.env.example,
      handoffs/{HANDOFF-01, HANDOFF-09, HANDOFF-10, HANDOFF-11}
    HANDOFF-01 is closed, so its sentence is left standing with the correction
    APPENDED rather than substituted: the text is the record of what was specified
    at the time, and rewriting it would hide that the names ever entered here.

    also modified
      apps/gateway/src/config.ts, apps/indexer/src/config.ts .. refuse to start if a
        Redis URL they would dial is the managed store, by host and by exact value
      apps/gateway/src/__tests__/hardening.test.ts ... five tests for that guard
      apps/web/playwright.config.ts .. blanks all five variables for the build it starts
      .github/workflows/ci.yml ....... the three static guards move ABOVE install
      package.json ................... `pnpm check`
      .gitignore ..................... `.env*` with the examples excepted

EVIDENCE (Executed unless labelled otherwise. Every §5 assertion has its fail
state as a NAMED TEST in the suite rather than as a one-off manual mutation, so
one green run is a two-polarity transcript: a fail-state test that stopped
failing would itself go red. Where a mutation was the only honest way to prove a
suite is not vacuous - A1 and A8 - the mutation was executed and is transcribed.)

  Final run, this tree: 704 unit tests pass - packages/content 67,
  packages/zebra-rpc 23, apps/web 346, apps/gateway 90, apps/indexer 178 (1
  skipped). `pnpm typecheck` 10/10. `pnpm lint` 0 errors, 1 pre-existing warning
  (an unused binding in the indexer's decoder, untouched by this handoff).
  `pnpm --filter @zcashreveal/content validate` OK. No emoji in any file this
  branch touches (scan executed over the diff's 99 files: 0 hits).

  POSTGRES WAS STARTED SO THE GATED TEST WOULD RUN, rather than reported as a
  skip. `pg_isready` -> /var/run/postgresql:5432 - accepting connections, and
  `pg-cache.integration.test.ts` runs seven tests against migration 003a
  including a thirteen-digit zatoshi round-trip and a TTL evaluated against the
  database's own clock, not the test process's.

  A1  gateway and zebra-rpc suites exit 0.
      PASS  `pnpm --filter @zcashreveal/gateway test` -> Test Files 6 passed,
            Tests 90 passed, rc=0. `pnpm --filter @zcashreveal/zebra-rpc test`
            -> Test Files 1 passed, Tests 23 passed, rc=0.
      FAIL  The first fail-side probe FAILED TO FAIL and that is the finding.
            Planting a ten-fold error in the zatoshi conversion
            (ZAT_PER_ZEC 100,000,000 -> 10,000,000), which sits under every
            amount the Tracking pages render, left the suite green: 4 files, 56
            tests, all passing. `units.test.ts` was written for exactly that
            defect; the same mutation now gives
            `Tests 6 failed | 83 passed (89)`, rc=1, reverted after.

  A2  `/api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` -> balanceZat
      "7818340930000", label.labeller "consensus".
      PASS  routes.test.ts "PASS STATE: balanceZat is the exact zatoshi string
            and the label is consensus" - 4 tests in the block, all green.
      FAIL  "FAIL STATE: a different balance from the node produces a different
            string, so the test is not tautological" - the same route with a
            different mocked balance yields a different string, which is what
            stops the assertion passing by echoing a constant.
      UNVERIFIED  The live half. No synced Zebra 6.x is reachable from this
            container - the repository clone at /home/user/zcashfoundation/zebra
            is source, not a node - so the against-a-real-node run named in A2 is
            NOT executed and is labelled here rather than implied.

  A3  every route rejects malformed input with 400 and a Zod issue list.
      PASS+FAIL  10 tests. The three the assertion names (a 62-hex txid, a `t2`
            address on mainnet, a negative height) plus the case the gate found:
            `/api/block/:height` used `z.coerce`, which validates the RESULT of
            `Number()`, so "999999999999999999999" coerced to 1e21, passed
            `.int()`, and would have reached the node as "1e+21" - whose -8 came
            back as a 404 saying the chain does not have that height. A malformed
            request reported as a true statement about the chain. Eight malformed
            heights are now asserted never to reach the node at all.

  A4  rate limiting per IP, and exactly two Redis connections.
      PASS  hardening.test.ts "PASS STATE: 120 requests in the window from one IP
            yield at least one 429" - 100 x 200 and 20 x 429. "PASS STATE: with
            RATE_LIMIT_REDIS_URL unset, exactly two - subscriber and reader",
            counted by construction because `buildServer` takes the ioredis
            constructor as an argument; counting constructions is the only honest
            way to assert "exactly two".
      FAIL  "FAIL STATE: 120 requests from 120 DIFFERENT IPs yield none", which
            is what makes the pass state a statement about one client rather than
            a global counter; and "FAIL STATE: setting RATE_LIMIT_REDIS_URL opens
            a third, on that url" - the limiter's client is opened FIRST and on a
            different url, so it cannot pass by a duplicate.
      AND THE ONE THE GATE FOUND  the limiter was not per-reader at all behind a
            proxy. `@fastify/rate-limit` keys on `req.ip` and `trustProxy` was
            unset, so under the cloudflared tunnel HANDOFF-10 specifies, every
            reader shares ONE bucket and one client denies service to all.
            Reproduced: ten requests, ten distinct `x-forwarded-for`, one socket
            address, one bucket of five. `GATEWAY_TRUSTED_PROXIES` now names the
            hops to believe and defaults to NONE - blanket trust would be worse
            than a shared bucket, because any caller could then forge the header
            and remove the limit rather than coarsen it. Three tests cover the
            shared bucket, the ten buckets, and the untrusted sender that cannot
            forge its way out.
      AND  "neither url is the Vercel-managed snapshot store" asserts CLAUDE.md's
            two-Redis rule rather than trusting it.

  A5  WS cap: the third connection closed with 1013.
      PASS  "PASS STATE: with the cap at 2, the third connection is closed with
            1013" - and the refused socket is not in the fan-out set.
      FAIL  "FAIL STATE: with the cap at 3, the third connection is admitted and
            closed with nothing."
      The 7 pre-existing ws-broker tests stay green, as §3 requires.

  A6  a second address request within the TTL performs 0 RPC calls.
      PASS  "PASS STATE: a second address request within the TTL performs 0 RPC
            calls" - literally zero, by method counter.
      FAIL  "FAIL STATE: with the TTL at 0 the same second request goes back to
            the node for everything."
      CORRECTED MID-HANDOFF, and the correction is the point. The first version
      performed ONE call - `getaddresstxids` was deliberately uncached - and the
      comment justified it by saying a cached list would disagree with the
      balance above it on the page. That reasoning is BACKWARDS: the balance was
      already up to a TTL old, so refreshing only the list is exactly what made
      the two disagree. Both now live in one cache row written at one instant
      (003a carries a `txids JSONB` column), which satisfies A6 literally and
      makes the page internally consistent. Four §5 assertions across three
      revolutions have passed a charitable reading while failing literal
      execution; this one was not going to be the fifth.

  A7  no response leaks RPC credentials or internal hostnames.
      PASS  "PASS STATE: no successful response contains any of them" and, more
            to the point, "PASS STATE: nor does a FAILING response, which is
            where a message would leak one".
      FAIL  "FAIL STATE: the detector fires when a secret IS present, so it is
            not vacuous."
      The detector is a list of VALUES from `secretValues(cfg)`, not of names: a
      body containing the string "ZEBRAD_RPC_PASSWORD" is harmless and one
      containing the password is not.

  A8  `grep -rn "from '../../indexer" apps/gateway` is empty.
      PASS  rc=1 (no match).
      FAIL  A file importing `../../indexer/src/config.js` was planted at
            apps/gateway/src/__a8probe.ts; the same grep printed it and returned
            rc=0. Removed; rc=1 again. Transcribed because a grep that is empty
            because the pattern is wrong looks identical to one that is empty
            because the tree is clean.

  A9  (operator-added) a viewing key that reaches the gateway is written nowhere.
      PASS  log-redaction.test.ts "PASS STATE: no fragment of the key appears in
            any of the three" - the response body, every response header, and
            every line emitted on a pino stream captured in-process, for requests
            carrying a well-formed key in the query AND in a path segment.
      FAIL  "FAIL STATE: with Fastify's default serialiser, the key IS written" -
            the same assertion over a server built with the default `req`
            serialiser, which logs `req.url` verbatim.
      AND   "FAIL STATE: redacting only the query would still write a key in a
            PATH", which is why `safePath` does both halves. Blanket-redacting
            `req.url` was the first attempt and it works only by making every
            request identical - measured: six lines, three requests, three
            identical `"url":"[redacted]"`. A log nobody can read is a broken log
            that happens to be safe, and the next person who needs a route in a
            trace deletes it. `authorization` and `cookie` are REMOVED rather
            than censored: a censored line still records that a credential was
            presented and roughly how long it was.

ASSUMPTIONS

  ACCEPTED  Zebra 6.3.0 at commit 1c9b2450349b53232e2787bef62dd0e21b10e041 is the
    wire this gateway targets, read from the structs rather than the doc
    comments. §2 asks for the version to be cited; it is, in
    packages/zebra-rpc/src/schemas.ts beside each divergence.

  CORRECTED  Deliverable 6 says 24 of the 32 quarantined records render on no
    page. Measured from the prerendered HTML of a production build: 10 anchor
    (six on /flows, four on /network) and 22 do not. LEDGER-03 Q4 and LEDGER-04
    Q4 both say "four and four"; the two allegations rows on /flows that own
    their anchors are what that count missed. The fold's instruction is unchanged
    and was applied in full; only the figure is corrected, and it is corrected in
    §4 of this handoff as well as here so the two do not disagree.

  CORRECTED  The tree justified its string-zatoshi convention with
    "78183.4093 * 1e8 is 7818340929999.999 in IEEE 754". That product is exactly
    7,818,340,930,000. The convention is right; the reason published for it was
    false, stated as a computed fact in a shipped deliverable. Swept per
    CLAUDE.md's sweep rule across all six restatements in one commit -
    views/units.ts, views/labels.ts, two gateway tests, API.md twice, and
    apps/web/src/lib/api/fixtures/units.ts, which is HANDOFF-04's file and
    carried the same false claim about 50000.5541. A true counterexample -
    163.17 * 1e8 = 16,316,999,999.999998, two zatoshi short - is now pinned by a
    test so the reason cannot drift back to a fabricated one.

  CORRECTED  A first correction to the /flows custodian line named two companies.
    Only the Grayscale finding is a quarantine record; the Cypherpunk one is an
    entry in the Record's research-gaps list. The line names one issuer, three
    documents and the record id, and the view now RESOLVES that record from the
    corpus and throws if it is gone, so a withdrawal or a rename fails the build
    instead of leaving the site asserting something the corpus no longer supports.

  CORRECTED  §5 A2's fingerprint premise. `RpcTransaction` was missing `height`
    and `blocktime` and treated several Orchard bundle fields as required, so the
    indexer's wallet fingerprints were reading a shape the wire does not send.
    The existing fingerprint tests PASSED VACUOUSLY over hand-written fixtures.
    A fixture carrying the real lowercase RPC shape is now committed and the
    casing is linted; see §8 for which wallet tells the fix actually revives.

  CORRECTED  The managed Redis. The L2 NOTE established two things and only one of
    them was a constraint. The constraint: the store is SHARED with an unrelated
    production project, so a mistake there is an outage or a disclosure for someone
    who never agreed to run alongside us. The correction: the five variable names
    Vercel injects under the `SNAPSHOT_REDIS` prefix are not the three this
    repository stated. HANDOFF-11 keyed its entire SnapshotStore resolution order on
    two of the dead names, so code built to that spec would have read `undefined`,
    fallen through to the gateway or the bundled fixture, and rendered a stale site
    reporting no fault - the quiet failure, not the loud one. Both are swept above.

  CORRECTED  My own first pass at the guard, by an adversarial sweep (37 agents, four
    lenses plus a completeness critic) that I ran against the tree afterwards rather
    than trusting the work. Five real holes, each a class and not a typo, all now
    closed and enumerated in SNAPSHOT.md section 4: the delete rule named only one of
    the two commands that delete, so a one-word substitution defeated it; the
    enumeration rules matched command names while the flag forms - the ones a runbook
    actually uses - spelled no command name at all and passed; every rule was
    key-scoped, so the commands that report on the other tenant WITHOUT naming a key
    fell outside all of them (rule 7 now, because sharing a database is a
    confidentiality problem in both directions); a self-test fixture passed by
    matching its own explanatory comment rather than the call it claimed to certify,
    which is precisely the failure a self-test exists to make impossible; and the
    walker allowlisted extensions, so Dockerfiles - a HANDOFF-10 deliverable - were
    never opened. It is a denylist now.

    THIS FILE IS NOT ON THE GUARD'S ALLOWLIST, and the paragraph above was rewritten
    because the guard failed CI on the first draft of it. That is the right outcome:
    only the documents whose subject IS the prohibition may spell the commands, and a
    handoff report is not one of them. It is also the second time in this handoff the
    guard has bitten its own author - the first was the comment wiring it into
    ci.yml - which is the evidence that it is not vacuous.

  CORRECTED  The budget arithmetic in the note counts only what the publisher WRITES.
    `apps/web`'s reads are commands too and are the unbounded half. `SNAPSHOT.md` §5
    says so and declines to publish a combined figure nobody has measured; HANDOFF-11
    gains the two rules that bound it and an assertion that counts them.

  DEFERRED  `apps/indexer/src/decoder/fingerprint.ts` computes ZIP 317's logical
    actions a different way again (it sums transparent inputs and outputs, and
    sums Sapling spends and outputs). Correcting it is analysis and belongs to
    HANDOFF-08. Recorded in §8.

  DEFERRED  `docs/2.0/TRACKING-MATH.md` §3.5 and the /method page give a
    count-based L that diverges from ZIP 317 for oversized scripts - including
    the ZIP 271 lockbox, a 2-of-3 P2SH multisig. The gateway follows the
    protocol; changing a specification another track owns is not this handoff's
    to do. §8 question.

NOTICED (outside scope, not acted on)

  - `/api/pools` cannot be computed here. Four of its blocks - the turnstile
    ledger, the deployment history, the estimator panel and the supply
    reconciliation - are owned by HANDOFF-06, -07, -08 and -09 and no data source
    in this tree carries them. The route answers 503 NAMING the four blocks and
    their owning handoffs rather than fabricating a page, and the chain-derived
    half is served at `/api/pools/balances`. `/api/snapshot` answers 501 until
    HANDOFF-09 writes it.
  - Reverse-proxy access logs are the THIRD copy of the viewing-key exposure that
    A9 closes. cloudflared and everything else in front of this gateway log full
    URLs by default and nothing in this process can reach that. HANDOFF-10's
    runbook. In §8.
  - `docker-compose.yml` publishes the VPS Redis on every interface with no
    password, while this repository states as fact that that instance never leaves
    the box. HANDOFF-10 owns compose and the runbook, and the fix is a bind address
    plus a password in the same edit, so it is recorded rather than made here.
  - `apps/web/README.md` still describes the gold accent as "exactly three things".
    LEDGER-03 Q2 licensed a fourth. Unrelated to anything in this handoff and not
    swept with it.
  - `apps/web`'s /track page renders `summary.bytes`, which the gateway first
    emitted as a hardcoded 0 - "0.0 kB" beside a table of transactions. Fixed
    here from `getrawmempool` verbose, but the class of defect (a DTO field a
    producer cannot fill, rendered as though it could) is worth a sweep by whoever
    owns the remaining fixtures.

UNVERIFIED (labelled)

  - A2's live half: no synced Zebra 6.x node is reachable from this container.
    Every route test runs against a scripted RPC handler, not a node.
  - No route has been exercised against a real mempool. The Redis path is
    covered by the pre-existing ws-broker tests and by an empty-mempool route
    test; a populated one is not.
  - Migration 003a has been applied to a local PostgreSQL 16 and its behaviour
    asserted there. It has not been applied to the VPS database - that is an
    operator click, and HANDOFF-10 owns it.
  - The gate's round-2 run verified 10 of its 39 findings against an internal cap
    and returned 19 HIGH/MID unverified. Round 3 read all 19 and acted on the two
    that were still live; the rest had already been fixed in round 1 or round 2.
    The cap itself is recorded in §8 as a process finding: a review that silently
    stops verifying reads as complete coverage.

GATE ROUNDS: 3

  round 1 - lead review, 18 findings, executed probes against the running server
    before any reviewer reported. Fingerprints (file · rule · severity):
      views/tx.ts · zip317-actions-wrong-formula · HIGH
      views/tx.ts · pool-delta-sign-inverted · HIGH
      views/address.ts · net-figure-is-gross · HIGH
      views/mempool.ts · rendered-field-hardcoded-zero · HIGH
      server.ts · 404-echoes-query-string · HIGH
      views/address.ts + cache.ts + 003a · assertion-not-literally-met · HIGH
      apps/gateway tests · suite-misses-planted-defect · HIGH
      views/address.ts · opening-balance-absorbs-contradiction · MID
      views/units.ts · height-in-a-milliseconds-field · MID
      views/units.ts · nonzero-renders-as-zero · MID
      views/address.ts · input-matched-by-position-not-by-n · MID
      views/address.ts · empty-history-plots-genesis-twice · MID
      views/address.ts · note-claims-uncached-provenance · LOW
      views/address.ts · interactions-mix-gross-and-net · LOW
      views/address.ts · direction-known-but-not-said · LOW
      address.ts · quadratic-decode · LOW (REFUTED by execution: Fastify's
        `maxParamLength` caps a path parameter at 100 and a 120,000-character
        address 404s in 4 ms. An explicit guard went in anyway, with that default
        named as the reason it is defence in depth rather than the control.)
      capture-examples.mts · capture-covers-one-case-only · PROCESS
      views/mempool.ts · constant-is-correct-not-lazy · NOT-A-FINDING (recorded so
        it is not re-litigated: block arrival is Poisson, so the expected wait is
        the mean interval however long has elapsed)

  round 2 - Workflow gate, four lenses, all FAIL, 39 raw findings; 10 verified
    adversarially, 7 confirmed and 3 refuted. New findings only, so not a repeat
    round under Loop 4. Fingerprints:
      config.ts + server.ts · rate-limit-not-per-reader-behind-proxy · HIGH
      views/context.ts · sprout-joinsplit-omitted · HIGH
      views/mempool.ts · orchard-actions-double-counted · HIGH
      views/mempool.ts · claim-not-measured-by-its-source · HIGH
      views/address.ts · prose-describes-a-decode-that-did-not-happen · HIGH
      docs/2.0/API.md (+5 others) · false-numeric-claim · HIGH (the sweep)
      routes/block.ts · coerce-validates-the-result-not-the-input · MID
      docs/2.0/API.md · claims-examples-it-does-not-carry · MID
      views/block.ts · label-without-its-precedence · MID
      views/tx.ts · bounded-figure-rendered-as-exact · MID
      views/tx.ts · exact-figure-described-as-a-bound · MID
      views/units.ts · truncation-described-as-rounding · MID
      views/context.ts · 75s-attributed-to-the-wrong-upgrade · LOW
      views/address.ts · version-bytes-cited-to-the-wrong-document · LOW
      routes/search.ts + routes/pools.ts · response-not-validated · LOW
      address.ts · quadratic-decode · REFUTED (again, independently)

  round 3 - the two of the gate's 19 unverified findings that were still live
    after rounds 1 and 2. New findings, not repeats. Fingerprints:
      views/mempool.ts + views.ts · same-field-two-meanings · HIGH
      views/flows.ts · citation-not-checkable-by-the-build · MID

  NO FINDING REACHED A THIRD ROUND ON ITSELF, so Loop 4's per-finding cap was not
  approached and nothing is NOT CONVERGING.

PREVIEW URL: none. This handoff ships no web surface; `apps/web` is touched only
  where a nullable `permalink` changed a render, and that is covered by the 346
  existing unit tests plus a new e2e spec for the quarantine anchors.
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
