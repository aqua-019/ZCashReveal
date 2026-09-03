# CUTOVER-1.0 — fixture to live, rung 1

**What this gets you: `zcuck.xyz` showing the chain's real height and the five
real lane balances, updating every block, with no database, no node of your own,
no VPS and no sync.** It ends at a site whose system bar reads `source:
redis-rest` beside a height that moves.

**What it does not get you.** Three analysis panels stay absent - the drain, the
migration histogram and the N_eff series - because each reads a table and there
is no table. They render as named absences, which is what `SnapshotV1`'s `null`
means (`SNAPSHOT.md` section 8.1). The mempool stays empty; that is rung 2. Live
crossings are rung 3.

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

| | |
|---|---|
| RPC | ~1.6 requests/minute, two calls per tip |
| Managed store | 5 commands per tip on the wire, ~172,500/month, against a default ceiling of 200,000 and a **shared** allowance of 500,000 |
| The machine | one Node process, no Postgres, no node, no sync |
| Vercel | unchanged |

## What comes next

Rung 2 (HANDOFF-15) adds live transactions and the mempool. Rung 3 (HANDOFF-16)
adds crossings, which is the first panel here that needs a table. `CUTOVER.md`
remains the full path - your own `zebrad`, the indexer, the gateway and the
tunnel - and every variable set above is one it also sets, so nothing here is
thrown away when you take it.
