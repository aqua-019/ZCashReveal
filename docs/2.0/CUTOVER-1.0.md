# CUTOVER-1.0 — fixture to live, all three rungs

**Sections 0 to 8 are RUNG 1** and are unchanged: `zcuck.xyz` showing the chain's
real height and the five real lane balances, updating every block, with no
database, no node of your own, no VPS and no sync. **Sections 9 and 10 are rungs
2 and 3** - live transactions, and crossings on the turnstile plane. Each rung
builds on the one below and none of them throws the last one away.

**What rung 1 does not get you.** Three analysis panels stay absent - the drain,
the migration histogram and the N_eff series - because each reads a table and
there is no table. They render as named absences, which is what `SnapshotV1`'s
`null` means (`SNAPSHOT.md` section 8.1). The mempool stays empty; that is rung
2 (section 9). Live crossings are rung 3 (section 10).

**AND RUNG 3 IS THE ONE THAT NEEDS A DATABASE, WHICH IS NOT WHAT ITS OWN BRIEF
SAID.** HANDOFF-16 was written expecting crossings to reach the page from the
indexer alone. They cannot, and section 10 says why in detail: the publisher is a
**separate process** and `migrationHist` comes from a Postgres query it runs
itself. Measured, by executing `readSnapshotInputs` with no database - `crossings`
comes back `[]` and `migrationWindow` `null`, so the panel publishes as a stated
absence and the plane draws nothing. It is still no node, no VPS and no sync;
it is one small Postgres.

This is a **different document from `CUTOVER.md`**, which is HANDOFF-11's full
cutover: a provisioned VPS, a synced `zebrad`, an indexer, a gateway, a tunnel
and three migrations. That one is still the destination. This one is the step you
can take today, and taking it does not make that one harder - every variable
below is one `CUTOVER.md` also sets.

Read `docs/2.0/SNAPSHOT.md` before you touch the managed store. It is **shared
with an unrelated production project** and the rules there are not this
document's to relax.

---

## 0. Preconditions

- [ ] A machine that can run one Node process continuously. A `$5` VPS, a
      Raspberry Pi, an always-on laptop. It needs **no** Postgres, **no**
      `zebrad`, and about 100 MB of RAM.
- [ ] A local Redis on that machine. The publisher subscribes to a tip channel
      on it. `apt install redis-server` is enough; it never leaves the box.
- [ ] The `zecreveal` Vercel project, already connected to the managed store
      under the `SNAPSHOT_REDIS` prefix. Done 23 Aug 2026 - nothing to do here,
      and **do not copy those variables by hand** (`SNAPSHOT.md` section 3: the
      integration rotates them and hand-made copies do not rotate with it).
- [ ] An RPC endpoint that serves `getblockchaininfo` and `getblockheader`.
      A keyless public gateway is enough at this rung: the publisher makes
      **two calls per tip**, about 1.6 a minute at the 75-second block target.

## 1. Point the publisher at a node

On the machine, in the repository:

```bash
cp .env.example .env
```

Then set exactly these, and leave `DATABASE_URL` out:

```bash
ZEBRAD_RPC_URL=https://<your-endpoint>/
ZEBRAD_RPC_USER=            # leave empty for a keyless public endpoint
ZEBRAD_RPC_PASSWORD=
REDIS_URL=redis://127.0.0.1:6379
SNAPSHOT_FILE=/var/lib/zecreveal/snapshot.json
# DATABASE_URL is DELIBERATELY ABSENT. That is what selects RPC-only mode.
```

**`DATABASE_URL=` set to nothing is the same as omitting it.** Either spelling
selects RPC-only mode.

## 2. Check the mode before you check anything else

```bash
pnpm --filter @zcashreveal/publisher build
node apps/publisher/dist/index.js
```

The first `info` lines name the mode. You want:

```
no DATABASE_URL: publishing on RPC alone, with the three database-derived panels as stated absences
```

If instead you see `DATABASE_URL set: publishing every panel this node and
database can measure`, a `DATABASE_URL` is reaching the process from somewhere -
a shell export, a systemd unit, an inherited environment - and it will try to
open a connection that is not there. Fix that before going on.

## 3. Confirm the document is real

The publisher writes on every new tip. After one block (75 seconds or so):

```bash
node -e 'const s=require("/var/lib/zecreveal/snapshot.json");
  console.log("height", s.height);
  for (const p of s.pools) console.log(" ", p.lane, (Number(p.balanceZat)/1e8).toFixed(2), "ZEC");
  for (const k of ["residual","drain","migrationHist","neffSeries"])
    console.log(" ", k, s[k]===null?"null - NOT MEASURED":"measured");'
```

**Correct output is five lanes, `residual` measured, and the other three null.**
Compare `height` against a block explorer. If it is within a block or two of the
chain tip, this rung is working.

A `0` where one of those three should be `null` is a defect, not a quiet
network: report it rather than shipping it, because a zero on that page reads as
a measurement nobody took.

## 4. Give the publisher the managed store

Paste **one** of the store's TCP URLs from the Vercel UI into the `.env`, under
the name it carried there:

```bash
SNAPSHOT_REDIS_KV_URL=rediss://...
```

Use a **TCP** URL (`SNAPSHOT_REDIS_KV_URL` or `SNAPSHOT_REDIS_REDIS_URL`), never
the REST pair - those belong to `apps/web`, server-side, with the
`SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN`. **The publisher is the only
writer** (`SNAPSHOT.md` rule 6), and it does not run on Vercel.

Restart it. The startup line now lists both sinks:

```
publisher started   sinks: file redis
```

Then confirm the write arrived, **by exact key**:

```bash
redis-cli -u "$SNAPSHOT_REDIS_KV_URL" --no-raw GET zecreveal:snapshot:latest | head -c 200
```

Every key this project touches begins `zecreveal:` and you address them by exact
name. **`KEYS` is forbidden outright here and `SCAN` only with `MATCH
zecreveal:*`** (`SNAPSHOT.md` rule 3) - the store holds another project's live
data, and enumerating their keyspace is a confidentiality problem in both
directions even when it breaks nothing.

## 5. Run it as a service

```bash
sudo tee /etc/systemd/system/zecreveal-publisher.service >/dev/null <<'UNIT'
[Unit]
Description=ZECReveal snapshot publisher (RPC-only)
After=network-online.target redis-server.service

[Service]
Type=simple
WorkingDirectory=/opt/zecreveal
EnvironmentFile=/opt/zecreveal/.env
ExecStart=/usr/bin/node apps/publisher/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl enable --now zecreveal-publisher
journalctl -u zecreveal-publisher -f
```

## 6. Point the site at it

Nothing to deploy for this: `apps/web` already resolves the managed store first
(`SNAPSHOT.md` section 3's order - REST endpoint, TCP URL, gateway, bundled
document). Once the store holds a document, the next request reads it.

Trigger a fresh deployment so the site picks up this branch's build, then
**Promote to Production** in the Vercel UI. That click is yours; no agent makes
it.

## 7. Verify on the live site

Open `zcuck.xyz` and read the system bar:

- [ ] `source: redis-rest` — the managed store answered. If it still says
      `source: fixture`, the resolution fell through; the bar names every
      configured rung that did not answer, right there in the same line.
- [ ] The height matches a block explorer, within a block or two.
- [ ] `snapshot age: 0 blocks`, and it grows and resets as blocks arrive.
      **On a fixture-sourced page this reads `snapshot age: unknown`** — that is
      HANDOFF-14 deliverable 4, and seeing `unknown` here means you are still on
      the bundled document.
- [ ] `/pools` shows five lanes whose balances match the explorer.
- [ ] The unprovable-supply figure is present and live.
- [ ] The drain, the migration histogram and the N_eff series each say **not
      measured**. Not zero, not an empty chart with axes: a named absence.

## 8. Rollback

**STOPPING THE PUBLISHER DOES NOT ROLL THE SITE BACK, AND AN EARLIER DRAFT OF
THIS SECTION SAID IT DID.** `zecreveal:snapshot:latest` and
`zecreveal:snapshot:height` carry **no TTL** — deliberately, because a store that
expires the latest snapshot produces the empty dashboard the whole fallback
design exists to prevent (`apps/publisher/src/sinks/redis.ts`, and
`redis-topology.ts`'s "The current snapshot. No TTL."). Only the per-height copy
expires, at 24 hours, and the SITE never reads that one — `apps/web` reads
`SNAPSHOT_KEYS.latest` and nothing else, so the untimed key is the one that
matters here.

So a stopped publisher leaves the site serving its **last document, frozen, for
ever**, with `source: redis-rest` and an age that grows once a tip frame arrives.
That is not a fault in the design — it is what keeps the page alive through an
outage — but it means stopping the process is a pause, not a rollback.

**Stop the publisher when you want to pause publishing:**

```bash
sudo systemctl stop zecreveal-publisher
```

**To actually roll back to the bundled fixture, choose one of these two:**

1. **Preferred — disconnect and redeploy.** Remove the managed-store variables
   from the `zecreveal` Vercel project and redeploy. The resolution order then
   finds nothing configured at the first two rungs, falls through to the bundled
   document, and the bar reads `source: fixture` with `snapshot age: unknown`.
   Nothing is written to or deleted from a store shared with another project.

2. **Or delete the two untimed keys, by exact name.** Never by pattern, and never
   with any of the four whole-database commands `SNAPSHOT.md` rule 2 forbids.
   This document does not spell those four, on purpose: naming one in a runbook
   is what rule 2 forbids, `scripts/check-redis-safety.mjs` treats a runbook that
   names one as a hit, and that guard was right to stop this paragraph's first
   draft.

```bash
redis-cli -u "$SNAPSHOT_REDIS_KV_URL" DEL zecreveal:snapshot:latest
redis-cli -u "$SNAPSHOT_REDIS_KV_URL" DEL zecreveal:snapshot:height
```

Both keys, because `height` is the one that says which block `latest` describes
and a `latest` deleted without it leaves the pair disagreeing.

## What this costs

**Rung 1 only.** Rungs 2 and 3 add the mempool tick and the follower; both are
metered by `INDEXER_RPC_MAX_RPM`, and the follower reserves its share of that
ceiling before the mempool tick is planned against what is left, so the total
stays inside whatever the preflight measured.

| | |
|---|---|
| RPC | ~1.6 requests/minute, two calls per tip |
| Managed store | 5 commands per tip on the wire, ~172,500/month, against a default ceiling of 200,000 and a **shared** allowance of 500,000 |
| The machine | one Node process, no Postgres, no node, no sync |
| Vercel | unchanged |

## What comes next

`CUTOVER.md` remains the full path - your own `zebrad`, the indexer, the gateway
and the tunnel - and every variable set above is one it also sets, so nothing
here is thrown away when you take it. Rungs 2 and 3 are sections 9 and 10 below.

---

## 9. Rung 2 - live transactions

**What it adds: the mempool.** `/track` stops being empty and starts showing
transactions as they arrive, each analysed, with a stated completeness - "4 of 9
analysed" rather than a number that pretends to be all of them.

**What it needs beyond rung 1:** the same endpoint, and one variable.

### 9.1 Measure the endpoint before you set anything

```bash
node scripts/preflight-rpc.mjs "$ZEBRAD_RPC_URL"
```

It prints one row per method this stack sends and one line for the rate, and it
exits non-zero when the endpoint cannot carry the stack. **Read the rate line.**
On a keyless public gateway it says something like `5 succeeded, request 6
refused, n=8`. That five is the number the next step needs, and it is measured
rather than read off a pricing page - the two have disagreed before.

### 9.2 Set the ceiling

In the indexer's `.env`:

```bash
INDEXER_RPC_MAX_RPM=5        # the number the preflight measured, not a guess
```

**Leave it UNSET for a `zebrad` you run yourself.** Unset means unmetered, and
metering a loopback node makes it slower for nothing.

What the ceiling does: a `RateGate` on the RPC client enforces it as an
invariant, and `planMempoolPoll` derives the tick interval and a per-tick
transaction budget from it. At five a minute that is one tick a minute and about
three transactions - which the site then STATES rather than hides. The
completeness notice on `/track` is that number made visible.

### 9.3 What you will see

- [ ] `/track` lists mempool transactions, each with a severity and a claim level.
- [ ] The completeness notice reads "N of M analysed" with N below M on a busy
      mempool. **That is correct, not a fault** - it is the ceiling, stated.
- [ ] A `429` in the indexer log is a normal event at this rate, not an error to
      chase. What is not normal is the log saying "retrying after the poll
      interval" repeatedly on the SAME height; see section 10.4.

---

## 10. Rung 3 - crossings on the turnstile plane

**What it adds: the marks on the plane are measured.** Until this rung the
turnstile plane on `/` draws from a fixture. After it, one mark per counted ZIP
318 crossing, from your start height forward.

### 10.1 Read this before you plan the rung

**THE PUBLISHER NEEDS A DATABASE FOR THIS, AND THE INDEXER'S IN-MEMORY MODE DOES
NOT SUBSTITUTE FOR IT.** These are two processes. The indexer follows the chain
and writes blocks; the publisher builds the snapshot the site reads, and it gets
`migrationHist` from its own Postgres query
(`apps/publisher/src/sources/queries.ts`, `makeChainQueries`). With no
`DATABASE_URL` the publisher uses `NO_CHAIN_QUERIES`, `readSnapshotInputs`
returns `crossings: []` and `migrationWindow: null`, and the panel publishes as a
stated absence. Executed, on this branch, against the real function: `crossings =
[]`, `migrationWindow = null`.

So there are two shapes of rung 3 and they get different things:

| | indexer store | publisher database | what the plane draws |
|---|---|---|---|
| **3a - crossings on the page** | Postgres | Postgres (the same one) | measured marks |
| **3b - no database at all** | `INDEXER_CHAIN_STORE=memory` | none | **nothing.** `migrationHist` stays a named absence |

**3b is still worth running** - the confirmed-block follower, the four pools'
state and reorg handling all work, which is what the gateway's live views read -
but it does not put a mark on the plane, and a document that implied it did would
be the "renders and reports no fault" shape this project keeps finding. Choose 3a
if the plane is what you are here for.

### 10.2 There is still no sync

`INDEXER_START_HEIGHT` is *"the first block to index on a COLD store"*, and
`chainBaseFromBlock` opens the base from that block's own figures. Set it to a
**recent** height - anything within the last day - and the runtime opens there and
follows forward. Nothing backfills, and nothing needs to.

```bash
INDEXER_START_HEIGHT=3470000      # a recent height. NOT the genesis of anything
DATABASE_URL=postgres://...       # 3a. Omit for 3b and set INDEXER_CHAIN_STORE=memory
```

Then, for 3a, apply the migrations once:

```bash
pnpm --filter @zcashreveal/indexer migrate
```

### 10.3 What `z_gettreestate` decides, and it is not the plane

**The plane draws measured marks either way.** Crossings are counted from the
blocks themselves; the treestate is not in that path.

What `z_gettreestate` decides is **anchor depth on Ironwood spends**. It is the
only source of an Ironwood root (`getblock` carries the tree SIZE and never the
root), so an endpoint without it records no Ironwood anchor, and every later
spend citing one of those anchors reads `UNKNOWN_ANCHOR` - **permanently**,
because nothing in this project backfills.

| | the plane | Ironwood anchor depth |
|---|---|---|
| endpoint serves `z_gettreestate` | measured marks | measured |
| endpoint does not | **measured marks, unchanged** | `UNKNOWN_ANCHOR`, for ever, on every spend from every block indexed while the method was absent |

The preflight tells you which you have in ten seconds, and the indexer says it
again at startup rather than at the first Ironwood block.

### 10.4 The failure this rung has, and how to recognise it

**An endpoint missing `z_gettreestate` used to STALL the follower rather than
degrade it, and the symptom is one log line per poll interval.** The RPC error
for "method not found" is not a consensus disagreement, so the loop treats it as
transient and re-fetches the SAME block, for ever. The tip stops moving and
nothing says why beyond a repeated `confirmed-block step failed; retrying after
the poll interval` naming one height.

This is fixed - the startup probe learns the absence once and the driver is
handed a source that records the absence per block instead - but the symptom is
worth knowing, because it is what a NEW missing method would look like:

```bash
# the same height, over and over, in the indexer log
grep "confirmed-block step failed" /var/log/zecreveal-indexer.log | tail -20
```

If every line names one height, the endpoint is refusing something the driver
needs. Run the preflight against it.

### 10.5 What you will see

- [ ] The indexer logs `block applied` with a height that increases.
- [ ] Its startup log names any method the endpoint does not serve. **Nothing
      named means every method this stack sends is there** - that line is a
      measurement, not a default.
- [ ] On 3a: the turnstile plane draws marks, and the migration histogram panel
      stops saying "not measured". It takes a few hours to accrue enough
      crossings to look like anything; a plane with two marks on it is not a
      fault.
- [ ] On 3b: the plane still says nothing was measured, which is correct and is
      what the table in 10.1 said would happen.
- [ ] `INDEXER_CHAIN_STORE=memory` loses every block on restart. If you restart
      the indexer, the base reopens at `INDEXER_START_HEIGHT` and the crossings
      counted before are gone. On 3a the database keeps them.

### 10.6 Rolling rung 3 back

Rung 3 rolls back to rung 2 by **unsetting `DATABASE_URL` (3a) or
`INDEXER_CHAIN_STORE` (3b) and restarting the indexer**. The follower does not
start, the mempool path continues, and `migrationHist` returns to a stated
absence. Nothing is deleted and no store is touched.

Rolling the SITE back to the bundled fixture is section 8, unchanged, and its
first sentence applies to every rung: **stopping a process is a pause, not a
rollback.**
