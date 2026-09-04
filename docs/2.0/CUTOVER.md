# CUTOVER - moving the public site onto `apps/web`, live

**HANDOFF-11, deliverable 1.** Everything below is the OPERATOR's. No agent runs
any of it: L4 promotion is a human click, and nothing in this repository may set
a Vercel environment variable or start a container.

**Read this whole page before starting.** It is written so that someone who has
the box in front of them on the day can execute it top to bottom without asking
a question. Where a step could not be executed by the session that wrote it, it
says **UNVERIFIED** and says why - never "done".

---

## 0. What the cutover is now, and what it stopped being

It is smaller than the name suggests. The operator deleted both v0.2 Vercel
projects (`z-cash-reveal-dashboard` and `z-cash-reveal-dashboard2`) on 23 August
2026, so `zecreveal` with Root Directory `apps/web` is the only project on the
account and has been serving previews since. **What is left is pointing a domain
at it and promoting to Production.** `legacy/dashboard` is gone from the tree
entirely as of HANDOFF-11; there is nothing left to migrate off.

## 1. What does NOT block this

Three things are named here because each has been mistaken for a prerequisite.
The first is now a HISTORICAL note rather than a live caveat, and it is corrected
in place rather than deleted, because the sentence it replaces was still telling
an operator at cutover that a capture nobody could take was outstanding.

| not a prerequisite | why |
| --- | --- |
| **the mainnet block fixture** | **CLOSED, AND THIS ROW NOW DESCRIBES AN OBSTACLE THAT NO LONGER EXISTS - kept, corrected, because it is read AT the cutover.** It used to say the cutover "ships with that test still skipped, or it does not ship", and that the capture was a standing operator task needing a synced node. Four captures landed in PR #51 from a PUBLIC endpoint - `apps/indexer/test/fixtures/blocks/mainnet-3432130-9eb351.json`, `-3441955-54b709`, `-3444836-1e5057`, `-3444837-274151` - and the decoder suite runs **11 of 11 with zero skips** (executed on this branch: `vitest run src/decoder/__tests__/block-decoder.test.ts`, 11 passed). LEDGER-10 Q4's ruling still stands as a ruling - the cutover never depended on it - but the thing it was ruling about is done, and it did not need a synced node in the end. |
| **per-crossing amounts, ordering or confirmation state** | `SnapshotV1` has no field for any of them, and the turnstile plane is built on that fact: one mark per counted crossing, uniform weight. The confirmed-block driver is HANDOFF-12's. The plane is correct today and stays as HANDOFF-04a built it. |
| **all four analysis panels being non-null** | The rule is that the cutover may not RENDER AN UNMEASURED PANEL AS A MEASUREMENT, not that every panel must be measured. A named absence stating its CONDITION is permitted and is what `SNAPSHOT.md` section 8.1 specifies. As of HANDOFF-09b all four are measurements on the production path anyway. |

## 2. Preconditions, in order

Each is a link rather than a copy, because a duplicated command is a command
that goes stale in one of its two homes.

1. **The VPS is provisioned and the stack is up** - `RUNBOOK-VPS.md` sections 1
   and 2. Zebra must have finished its initial sync; section 2 says how to tell.
2. **Migrations 003, 004 and 005 are applied** - `RUNBOOK-VPS.md` section 4.
   **This is one cold run and doing it before the cutover is what keeps it
   free.** That database has never had 003 or 004, so all three apply in one
   `pnpm --filter @zcashreveal/indexer migrate`, in filename order, each in its
   own transaction, with zero downtime. The same three applied AFTER the cutover
   are a maintenance window on a live public site, because 005 adds a table and
   a column the publisher reads on every tip.
3. **The Cloudflare tunnel exists and the gateway answers through it** -
   `RUNBOOK-VPS.md` section 6.
4. **The publisher is running and has written at least one snapshot** - check
   `GET https://<gateway-host>/v2/snapshot` answers **200**. While it answers
   503 the site still renders, from the bundled document, and the system bar
   says `source: fixture` - which is the design, not a fault.

## 3. The Vercel side is already done, and this is what it looks like

**Do not add these by hand.** The Marketplace Redis store
`upstash-kv-blue-garden` is connected to the `zecreveal` project for Production
and Preview with the variable prefix `SNAPSHOT_REDIS`, so Vercel injects five
names automatically:

| injected name | who reads it |
| --- | --- |
| `SNAPSHOT_REDIS_KV_REST_API_URL` | `apps/web`, server-side |
| `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` | `apps/web`, server-side - **this one** |
| `SNAPSHOT_REDIS_KV_REST_API_TOKEN` | **nothing on Vercel.** The read-write token. `apps/web` must never read it, and `apps/web/test/unit/client-graph.test.ts` fails if any module under `src` does |
| `SNAPSHOT_REDIS_KV_URL` | `apps/publisher`, on the VPS |
| `SNAPSHOT_REDIS_REDIS_URL` | `apps/publisher`, on the VPS (Upstash injects both spellings) |

**The integration owns and rotates these.** Copying them into hand-made
variables would produce copies that do not rotate with them, and a rotation
would leave the site reading a token that used to work.

**The store is shared with an unrelated production project.** Read
`SNAPSHOT.md` section 4 before touching it by hand: it lists the forbidden
commands, the enumeration rule and the `zecreveal:` namespace, and it is the one
place they are written down. They are NOT restated here, for the reason section
2 gives about the runbook: a duplicated rule is a rule that goes stale in one of
its two homes. `scripts/check-redis-safety.mjs` enforces the command list across
the tree and treats this document like any other - which is how the first draft
of this paragraph, which did restate them, was caught.

What you DO set, under Settings -> Environment Variables, Production:

| variable | value | why |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | `live` | `snapshot` renders from the published document and never upgrades; `live` adds the WebSocket. Either is safe - the snapshot is the baseline in both. |
| `NEXT_PUBLIC_API_URL` | `https://<gateway-host>` | no trailing slash. The gateway through the tunnel. |
| `NEXT_PUBLIC_WS_URL` | `wss://<gateway-host>/stream` | required for `live`; leave unset for `snapshot`. |

**Both `NEXT_PUBLIC_API_URL` and a non-fixture `NEXT_PUBLIC_DATA_MODE` are
needed before the site calls the gateway at all.** The selection fails closed:
a mode without a URL is a deployment that forgot a variable, and the honest
answer to that is committed values with the fixture disclosure switched ON
rather than a page of failed requests.

## 4. Promote

1. Push to `main`, or open the Deployments tab and pick the build you want.
2. **Promote to Production.** This is the click. Nothing before this point makes
   the site public and nothing in this repository can perform it.
3. Point the domain at the `zecreveal` project (Settings -> Domains).

## 5. Verify, on the deployed site, in a browser

**Every check in this section is UNVERIFIED in this repository.** No session can
reach a preview or production host: Deployment Protection answers 302 to the SSO
endpoint, and the session's own egress proxy refuses the CONNECT tunnel with 403
before that (LEDGER-04 Q3). These are yours to run and to paste into the ledger.

| # | check | what a pass looks like | what a failure means |
| --- | --- | --- | --- |
| 1 | load `/` | the system bar reads `snapshot age: N blocks - source: redis-rest` | any other `source:` means the managed-store rung did not answer; see 5a |
| 2 | read the bar again | **no `did not answer` text** | a configured rung failed. The text names which and why. The site is rendering, and it is rendering something older than it should be |
| 3 | load `/pools` | the balances table shows five lanes, and the derivation disclosure's summary reads `source: redis-rest` | a `source: fixture` here means the site is serving the bundled document to the public |
| 4 | load `/track` | the mempool table has rows and the state badge reads `live` | `stopped` means the WebSocket never connected - check `NEXT_PUBLIC_WS_URL` and the tunnel |
| 5 | watch `/track` for two minutes | a row arrives, or the block height advances | the socket is connected and receiving. A badge reading `live` with nothing arriving is the failure HANDOFF-11 fixed at the gateway; if it recurs, capture a frame |
| 6 | load any Record page | claims render with their confidence and source count | |
| 7 | `curl https://<gateway-host>/v2/pools` | **503**, with a body naming the missing blocks | **this is the design, not an incident** (LEDGER-05 Q2). A page that serves four empty blocks is claiming to have looked and found nothing |
| 8 | `curl https://<gateway-host>/v2/pools/balances` | **200** | this one is chain-derived and must always answer |
| 9 | `curl https://<gateway-host>/api/pools` | **410**, with a body naming `/v2` | the `/api` prefix is gone as of HANDOFF-11. A 404 here means an older gateway is deployed |
| 10 | view source, or open devtools | the string `zr:snapshot-fallback:v1` is in the JavaScript | the snapshot fallback did not ship. The post-deploy CI job checks this too |
| 11 | view source | **no `SNAPSHOT_REDIS` anywhere** | a credential name reached the browser. Stop and rotate the token |

### 5a. If the bar reads `source: gateway` or `source: fixture`

The resolution order is `redis-rest` -> `redis` -> `gateway` -> `fixture`, and a
rung that was CONFIGURED and failed is NAMED in the bar. So:

- **`source: fixture` with no fault text** - nothing was configured. The Vercel
  variables are not on this deployment. Check you promoted a build made after
  they were set: `NEXT_PUBLIC_*` values are inlined at BUILD time.
- **`source: fixture` with `redis-rest did not answer`** - the credentials are
  there and the store refused. The text carries the status or the errno.
- **`source: gateway`** - the managed store failed and the VPS answered. The
  site is correct and the redundancy that exists for a VPS outage is spent.

## 6. Roll back

Vercel keeps every deployment. Promote the previous one from the Deployments
tab; it is the same click. Nothing about the cutover writes to the VPS or to the
managed store, so there is no data to undo - **the publisher is the only writer
to the managed store, and it runs on the VPS, not on Vercel.**

## 7. After a month of publishing

`handoffs/README.md`'s click list carries this and it stays there: read the
managed store's actual monthly command count in the Upstash console and compare
it against the tips published. Do not overwrite `COMMANDS_PER_TIP` (3) or
`WIRE_COMMANDS_PER_TIP` (5) with it - both are measured facts about what the
code does and both are pinned by tests. What a bill can change is the CHARGE.
`SNAPSHOT.md` section 5 carries the arithmetic and the reads figure this handoff
measured.
