# RUNBOOK-VPS - operating the ZECReveal 2.0 origin server

Every command in this file is run by a **human**, on the VPS, as the operator.
No agent starts a container, provisions a host, changes DNS or creates a tunnel;
HANDOFF-10 §1 says so and this document is the artefact that respects it.

The other half of the deployment - the Vercel project that serves `apps/web` -
is `docs/2.0/DEPLOY-2.0.md`. This file owns everything on the box.

> **BEFORE YOU TOUCH THE MANAGED REDIS, READ `docs/2.0/SNAPSHOT.md` §§1 and 4.**
> The Vercel-managed store is **shared with an unrelated production project**. Its
> namespace rule, its forbidden-command list and its shared monthly allowance are
> not this runbook's to restate loosely or to weaken. Nothing in this file clears
> or enumerates that store, and that is deliberate: a runbook is exactly where a
> "just clear the bad snapshot" one-liner gets written down, and
> `scripts/check-redis-safety.mjs` fails CI if one appears here.
>
> The **VPS Redis** (`REDIS_URL`, the `redis` service below) is ours alone and
> none of those constraints apply to it. The two are one letter apart in their key
> prefixes - `zcashreveal:` on the box, `zecreveal:` in the managed store - which
> is the reason this paragraph exists.

---

## 1. Sizing and provisioning

| Resource | Minimum | Why |
|---|---|---|
| vCPU | 4 | Zebra reserves 4 in `docker-compose.yml`; verification is CPU-bound during sync |
| RAM | 16 GB | Zebra 8 GB reserved, plus Postgres, Redis and three Node processes |
| Disk | 500 GB NVMe | Mainnet state grows continuously; NVMe rather than spinning or network storage, because sync is IOPS-bound |
| OS | Debian 13 or Ubuntu 24.04 LTS | Matches the images; anything with a current Docker Engine works |

Provision the host, then:

```bash
# Docker Engine and the compose plugin, from Docker's own repository rather
# than the distribution's, which lags.
curl -fsSL https://get.docker.com | sh

# The repository, and the environment file it reads.
git clone https://github.com/aqua-019/ZCashReveal.git /opt/zecreveal
cd /opt/zecreveal
cp .env.example .env

# Fill in the THREE variables that have no default. The stack REFUSES TO START
# without them rather than defaulting to something wrong in production - and it
# refuses on ANY compose command, including `config`, because compose
# interpolates the whole file before deciding what to start:
#   POSTGRES_PASSWORD   openssl rand -hex 32
#                       HEX, NOT base64. The password is interpolated into a
#                       DATABASE_URL, and base64's +, / and = are reserved in a
#                       URL userinfo field - a generated password containing one
#                       makes every Node service fail to parse its own
#                       connection string, intermittently, depending on which
#                       characters that run happened to produce. Hex has no
#                       reserved characters and 32 bytes is the same entropy.
#   GATEWAY_CORS_ORIGIN the Vercel origin, e.g. https://zecreveal.vercel.app
#                       The value shipped in .env.example is a v0.2 localhost
#                       origin; it must be replaced, not kept.
#   TUNNEL_TOKEN        section 2 creates the tunnel and prints it
${EDITOR:-nano} .env
chmod 600 .env
```

> **THE THREE REQUIRED VARIABLES MUST ALL BE SET BEFORE THE FIRST COMPOSE
> COMMAND, INCLUDING `config`.** Compose interpolates the entire file before it
> decides what to start, so a missing `TUNNEL_TOKEN` fails `docker compose config`
> and even `docker compose up -d zebrad`, which touch no tunnel at all. That is
> why section 2 below creates the tunnel FIRST and syncs second: the first draft
> of this runbook deferred the token to section 6 and was circular, and the gate
> caught it.
>
> `GATEWAY_TRUSTED_PROXIES` is deliberately NOT required - it defaults to the
> RFC 1918 block Docker allocates compose networks from, which is correct for
> this topology and knowable before anything runs. Section 6.1 narrows it.

**Do not run any `docker compose` command yet** - not even `config`. TUNNEL_TOKEN
is still empty, and compose interpolates the whole file before it does anything.
Section 2.0 fills it, and section 2.0a is where the stack is first parsed.

---

## 2. The tunnel, then the first sync

### 2.0 Create the tunnel first

It comes first because of the interpolation rule above, not because the tunnel is
urgent - nothing serves traffic for days yet. Full ingress and hardening are in
section 6.

```bash
# cloudflared is not installed by section 1. On Debian/Ubuntu:
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

cloudflared tunnel login
cloudflared tunnel create zecreveal-gateway
cloudflared tunnel token zecreveal-gateway   # paste into .env as TUNNEL_TOKEN
```

### 2.0a First compose command

With all three required variables now set, the stack can be parsed. This is the
first `docker compose` invocation of the whole runbook, and its position is the
point: an earlier draft put it in section 1, which failed on the token that
section 2.0 had not yet produced.

```bash
docker compose -f docker-compose.yml config >/dev/null && echo "compose OK"
```

### 2.1 Build the images

Nothing pulls these - they are built from this repository, and no step before
this one builds them.

```bash
docker compose build indexer gateway
```

### 2.2 First sync

Zebra syncs mainnet from scratch. **Expect two to four days** on the sizing
above, and expect it to be the longest step by an order of magnitude.

```bash
# Start ONLY the node. The indexer and gateway wait on healthy dependencies
# anyway, but starting them now just fills logs with retries for two days.
docker compose up -d zebrad

# Progress. Zebra logs a sync percentage; this follows it without the peer noise.
docker compose logs -f zebrad | grep -Ei "sync|checkpoint|tip"
```

**Checkpoints are on by default and are why this takes days rather than weeks.**
Zebra verifies the chain up to its most recent bundled checkpoint by hash rather
than re-verifying every signature, then does full verification after it. There is
nothing to enable; `[consensus] checkpoint_sync` defaults to true. Do not turn it
off unless you are deliberately auditing consensus, in which case budget weeks.

The node has two HTTP endpoints, and the difference between them is the whole
readiness question:

```bash
# Liveness - the process is up and has peers. This is what the container
# healthcheck uses, because /ready is false for the entire first sync and a
# check that is red for three days teaches an operator to ignore it.
docker compose exec zebrad curl -sf http://127.0.0.1:8080/healthy && echo " healthy"

# READINESS - up, near the chain tip, and the tip is recent. THIS is the gate
# for starting the indexer. Do not skip it: an indexer reading a node that is
# 400,000 blocks behind will happily write 400,000 blocks of stale analysis.
docker compose exec zebrad curl -sf http://127.0.0.1:8080/ready && echo " ready"
```

When `/ready` answers, bring up the rest:

```bash
# Apply migrations FIRST. See section 4 - 003 is not an ordinary migration.
docker compose up -d postgres redis
docker compose run --rm indexer node dist/migrate.js   # or see section 4
docker compose up -d indexer gateway
# The five services started so far. `cloudflared` is section 6 and `publisher`
# is behind a profile until HANDOFF-09 ships, so neither appears here.
docker compose ps zebrad postgres redis indexer gateway
```

---

## 3. What the indexer is actually doing, and it is not what the variable says

`ZEBRAD_ZMQ_URL` is set, `docker-compose.yml` passes it, and **it does nothing.**

Zebrad exposes no ZMQ socket. Not disabled, not unconfigured - there is no zmq
section in `ZebradConfig` at any version. ZMQ was zcashd's mechanism.

(Precisely: Zebra 6.x can supervise a **zcashd sidecar** under `[zcashd_compat]`,
and that zcashd does speak ZMQ. This stack does not run it - the setting is
absent from `infra/zebrad/zebrad.toml` and the indexer points `ZEBRAD_ZMQ_URL` at
the `zebrad` service - so nothing below changes. The distinction is recorded
because the first draft said "Zebra has no ZMQ at any version", which is a
stronger claim than the evidence supports.)
`apps/indexer/src/index.ts` constructs a subscriber, fails to connect, logs

```
zmq unavailable — falling back to polling only
```

once at WARN, and then polls every `INDEXER_POLL_INTERVAL_MS` forever. That is
the only mode this stack has ever run in against Zebra, and it works; it is
written down here because one WARN line at boot two days ago is not where an
operator should have to learn how their system gets its data.

Zebra's equivalent is `[notify] block_notify_command` in
`infra/zebrad/zebrad.toml` - a shell command run on every tip change, mirroring
zcashd's `-blocknotify`. It is left commented out because choosing what the
command does is HANDOFF-12's decision, not this runbook's.

To confirm the polling path is live:

```bash
docker compose logs indexer | grep -i "zmq unavailable"     # expected, once
docker compose logs indexer | tail -20                      # tip heights advancing
```

---

## 4. Migrations - and 003 is not an ordinary one

```bash
# From the repository on the box.
docker compose run --rm indexer node dist/migrate.js

# Or, if you have Node and the workspace installed on the host:
DATABASE_URL="postgres://zcashreveal:<password>@127.0.0.1:5433/zcashreveal" \
  pnpm --filter @zcashreveal/indexer migrate
```

> **MIGRATIONS 003, 004 AND 005 HAVE NEVER BEEN APPLIED TO THE VPS DATABASE.**
> As of this writing the box is still on 002. That is a standing item, it is the
> operator's click, and it is the reason for the paragraph below.
>
> **ALL THREE IN ONE RUN, AND DOING IT BEFORE THE CUTOVER IS WHAT KEEPS IT
> FREE.** The command above applies whatever is missing in filename order, each
> inside its own transaction. On a database that has never had them - which this
> one has not, because nothing has ever written to it - that is one command and
> zero downtime. The same three applied after the cutover are a maintenance
> window on a live public site, because 005 adds a table and a column the
> publisher reads on every tip. This is the whole reason HANDOFF-09b was ordered
> ahead of HANDOFF-11 (LEDGER-09a Q1), on a cost argument rather than on any
> rule about what the site may render.

**005 adds `blocks` and `pool_nullifiers.anchor_root`, and it is ordinary.**
Every statement is `IF NOT EXISTS`, it rewrites no rows, and it was proven
re-runnable by applying it twice against a real Postgres 16 and diffing the full
schema. Migration 005 is what makes the `drain` and `neffSeries` panels
measurements rather than stated absences: `blocks` carries the block header's own
timestamp, because `pool_snapshots.ts` is the time the indexer WROTE the row and
a velocity measured against that is arbitrarily wrong across a catch-up sync.

**Apply it from the merged tree, not from a branch checkout.** Re-runnability is
not delivery: a no-op includes not applying later corrections, and
`schema_migrations` keys on the filename, so a database that ran an earlier draft
cannot receive them by re-running the file - it needs those objects corrected by
hand.

**003 is the first migration in this project that ALTERs objects it did not
create and REWRITES rows that already exist.** It widens five CHECK constraints,
adds two tables and a Sprout balance column, drops `fee_zat`'s `NOT NULL DEFAULT
0`, and then runs

```sql
UPDATE leak_reports SET fee_zat = NULL WHERE fee_zat = 0;
```

which is a data change, not a schema change: it exists because every fee this
project ever recorded was a false zero, and leaving them as zero would mean the
new nullable column still could not distinguish "no fee" from "fee unknown".

**Take a backup first** (section 5). It is transactional per file - the runner
wraps each migration's body and its `schema_migrations` row in one transaction,
so a failure halfway through 003 rolls 003 back entirely and leaves 002 applied.
If that happens:

```bash
# What actually landed.
docker compose exec postgres psql -U zcashreveal -c "SELECT name, applied_at FROM schema_migrations ORDER BY name;"

# Read the error before rerunning. The runner is idempotent - it skips files
# already in schema_migrations - so a rerun after fixing the cause is safe.
docker compose logs --tail=100 indexer
```

Do not hand-edit `schema_migrations` to skip a file. A row there claims the
file's contents are on the database, and the next migration is written assuming
that claim is true.

---

## 5. Backups

```bash
# Postgres, compressed, dated. This is the only stateful thing on the box that
# cannot be rebuilt: Zebra's state resyncs from the network and Redis's contents
# are derived, but the indexer's analysis history is not reproducible.
docker compose exec -T postgres \
  pg_dump -U zcashreveal --format=custom zcashreveal \
  > /var/backups/zecreveal-$(date +%F).dump

# Restore. STOP THE WRITERS FIRST - `--clean` drops objects the indexer and the
# gateway hold open, and a restore racing a live writer half-succeeds.
docker compose stop indexer gateway
docker compose exec -T postgres \
  pg_restore -U zcashreveal --dbname=zcashreveal --clean --if-exists \
  < /var/backups/zecreveal-2026-08-29.dump
docker compose up -d indexer gateway
```

Keep at least the last seven, off the box. A backup on the same NVMe as the
database is a copy, not a backup.

Redis on the box is AOF-persistent (`--appendonly yes`), so it survives a
restart. It is not backed up, deliberately: the anchor registry and the live
mempool set are both derived from Postgres and the chain.

---

## 6. The Cloudflare tunnel

The gateway publishes **no host port**. The only way in is the tunnel, which
dials out to Cloudflare - so there is no origin address to scan and no listening
API socket on the public interface.

```bash
# One-time, on a machine logged into the Cloudflare account.
cloudflared tunnel login
cloudflared tunnel create zecreveal-gateway

# Route the hostname at the tunnel.
cloudflared tunnel route dns zecreveal-gateway api.zecreveal.example

# The token the compose service needs. Put it in .env as TUNNEL_TOKEN.
cloudflared tunnel token zecreveal-gateway

# Run it as part of the stack.
docker compose up -d cloudflared
docker compose exec cloudflared /bin/busybox wget -q -O - http://127.0.0.1:2000/ready
```

Ingress must point at **`gateway:8080` and nothing else**. Never at `zebrad:8232`:
that RPC runs unauthenticated (Zebra has no password auth, only a cookie that
rotates on restart), and it is safe solely because nothing outside the compose
network can reach it. Exposing it through the tunnel would hand the node's full
RPC surface to the internet.

**Configure ingress in the Cloudflare dashboard**, under this tunnel's public
hostnames. The YAML below is what that configuration is equivalent to, and is
shown so the intent is unambiguous - it is NOT a file this stack reads. A
token-run tunnel (`TUNNEL_TOKEN`, which is how the compose service runs) takes
its ingress from Cloudflare, not from a local config file, so dropping this into
`/etc/cloudflared/` would have no effect and would look like it had one.

```yaml
# Equivalent to the dashboard configuration. Not read by this stack.
ingress:
  - hostname: api.zecreveal.example
    service: http://gateway:8080
  - service: http_status:404
```

### 6.1 `GATEWAY_TRUSTED_PROXIES` is not optional here

The gateway's rate limiter keys on `req.ip`. Behind the tunnel every request
arrives from cloudflared's address, so:

* left **empty**, every reader in the world shares one bucket and the limiter
  throttles the whole site at once;
* set to **blanket trust**, any caller can forge `x-forwarded-for` and escape the
  limit entirely.

Neither is acceptable, so the correct value is the tunnel container's address on
the compose network:

The default is `172.16.0.0/12`, Docker's primary address pool. **Verify that it
actually contains the tunnel**, because if your daemon has a custom
`default-address-pools` - `10.0.0.0/8` is common on a host that already ran
Docker - the tunnel lands outside it, the setting matches nothing, and every
reader silently shares one bucket again. That failure has no error and no log
line, which is why this is a step rather than an assumption:

```bash
TUNNEL_IP=$(docker compose exec -T gateway getent hosts cloudflared | awk '{print $1}')
echo "tunnel is at $TUNNEL_IP"
python3 -c "import ipaddress,sys; print('COVERED' if ipaddress.ip_address('$TUNNEL_IP') in ipaddress.ip_network('172.16.0.0/12') else 'NOT COVERED - set GATEWAY_TRUSTED_PROXIES')"
```

If it prints NOT COVERED, or in any case if you want the tightest setting, put
the exact address in `.env` as `GATEWAY_TRUSTED_PROXIES` and restart the gateway:

```bash
docker compose up -d gateway
```

Re-check it after any `docker compose down`, which can renumber the network.

### 6.2 THE TUNNEL MUST NOT LOG QUERY STRINGS

This is the **third copy of the viewing-key exposure** (HANDOFF-05 A9), and it is
the copy that lives outside the application entirely.

The gateway already drops the query string before writing a log line, redacts
key-shaped runs from what remains, and refuses to echo either back to a caller.
**None of that reaches a reverse proxy.** cloudflared, nginx and every load
balancer log full URLs by default, so a viewing key that arrives at

```
https://api.zecreveal.example/v2/search?q=uview1...
```

is written to the proxy's access log whatever the application does. A viewing key
in a log file is the one secret this project exists to keep.

What to do, in order of how much it actually helps:

1. **Turn off Cloudflare's HTTP request logging for this hostname**, or exclude
   the query-string field from it. In the dashboard this is Logpush / Logs;
   the field is `ClientRequestURI`, which INCLUDES the query string.
   `ClientRequestPath` does not. If you log anything, log the path field.
2. **Do not run cloudflared at debug log level in production.** `--loglevel
   debug` logs full request URLs. The compose service does not set it; do not add
   it while diagnosing and then forget.
3. **Do not put nginx, Caddy or any other proxy in front of the tunnel** without
   re-doing this analysis. If you do, its access log format must omit the query
   string - for nginx that means a custom `log_format` using `$uri` and never
   `$request` or `$request_uri`.

A viewing key should never travel in a query string at all, and the client does
not put it there - `apps/web` keeps key material client-side and the fields that
accept it are uncontrolled inputs behind a CSP with `form-action 'none'`. This
section exists for the case where someone types one into a URL by hand, or a
future client regresses. Defence in depth is the point.

---

## 7. Monitoring: snapshot age

**The single alert that matters is snapshot age.** Everything else on this box
fails loudly; a stale snapshot fails silently, and the site keeps rendering
confident numbers about a chain it stopped watching.

Alert when the published snapshot is **more than 20 blocks behind the chain tip**.
At roughly 75 seconds per block that is about 25 minutes of staleness, which is
long enough not to page on a slow block and short enough that nobody reads an
hour-old number believing it is live.

**THE READER-SIDE VERSION OF THIS ALERT CANNOT BE WRITTEN YET, AND SAYING SO IS
THE POINT.** The right measurement is the height the public site is serving,
because a publisher that believes it is publishing and a store that is not
receiving look identical from the box. But `/v2/pools` answers **503** today -
deliberately, naming the handoffs that owe it data rather than fabricating any -
and there is no published snapshot to read until HANDOFF-09 ships the publisher.
An alert written against a field that does not exist would fire on day one,
every day, and be muted within a week. The first draft of this runbook had
exactly that, and the gate caught it.

Until the publisher ships, measure the INDEXER's progress against the node,
which is real today and is the same question one hop earlier:

```bash
# Chain tip according to the node.
TIP=$(docker compose exec -T zebrad curl -s http://127.0.0.1:8232 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getblockcount","params":[]}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"])')

# Highest block with a RECORDED SHIELDED-POOL CROSSING - which is NOT the same
# as the highest block the indexer has processed, and the difference is the
# bound on this measurement. `pool_boundary_flows` gains a row only when a block
# moves value across a pool boundary, so across a run of blocks with no shielded
# activity this number stalls while the indexer advances normally.
#
# TWO THINGS FOLLOW, both stated rather than papered over. It over-reports lag on
# a quiet chain, so treat a small reading as noise. And it is 0 on a fresh
# database, so this alert is RED FOR THE WHOLE FIRST SYNC - do not wire it to a
# pager until section 2 has finished.
#
# The table with the right shape is `pool_snapshots(pool, height)`, one row per
# pool per block. NOTHING WRITES IT YET: HANDOFF-12 owns the writer. When it
# lands, this query moves there and both caveats above disappear.
#
# The column is `block_height`, not `height` - checked against the live schema,
# because the first version of this query used `height` and psql then printed
# NOTHING to stdout, so the shell read an empty string as 0 and the alert fired
# on every run forever.
INDEXED=$(docker compose exec -T postgres \
  psql -U zcashreveal -d zcashreveal -tAc \
  "SELECT COALESCE(MAX(block_height), 0) FROM pool_boundary_flows;")

echo "tip=$TIP indexed=$INDEXED lag=$((TIP - INDEXED))"
[ $((TIP - INDEXED)) -gt 20 ] && echo "ALERT: the indexer is behind the node"
```

**WHEN HANDOFF-09 SHIPS THE PUBLISHER, MOVE THIS TO THE READER'S SIDE** - poll
the public site for the snapshot's height and compare that with the node - and
delete the version above. The one-hop-earlier measurement cannot see a publisher
that has stopped writing, which is the failure the reader-side one exists to
catch.

Container health is the cheap complement:

```bash
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
```

Note what each healthcheck does and does not mean. `zebrad` healthy means "up
with peers", not "synced". `indexer` and `publisher` healthy mean "can open a
socket to everything they are configured to dial", not "keeping up". `gateway`
healthy means `/healthz` answers with its own JSON shape. None of them measures
freshness - that is what snapshot age is for.

### 7.1 Publisher input faults

A panel is a second silent failure: the site keeps rendering, one chart says
"not measured", and nothing pages. The publisher logs each one, on TWO channels
with different messages, because a lost INPUT and a refused ESTIMATOR are
different faults:

```bash
docker compose logs publisher | grep "an input query failed"    # NOT expected
docker compose logs publisher | grep "analysis panel refused"   # NOT expected
```

**The second line was missing from this section until gate round 5, and the case
it carries is the one this runbook is about.** `buildDrain` on an empty Orchard
series - a database with `pool_snapshots` rows and no `blocks` rows, which is any
005 before a backfill - reaches ONLY that channel, and it is the condition
section 8.1 names for a null `drain`. The table below is the FIRST channel only.

**No line on either channel is an expected one** - there is nothing here to
filter, which is what makes the `grep` a triage step rather than a habit. But
READ THE MESSAGE, because its CONSTANT half ("publishing that panel as a stated
absence") is true of three of the four cases and false of the last. The line
carries a `panel` (`migrationHist`, `drain` or `neffSeries`) and a `height`, and
the panel is absent for three and present only for the fourth:

| what the message means | panel | published? |
| --- | --- | --- |
| the query threw or the connection dropped | any of the three | absent - the stated absence the message names |
| `... Ironwood spend(s) ... and none carries a resolvable anchor` | `neffSeries` | absent - the state of any database that applied 005 without a backfill |
| `drain baseline at height N is Z, not positive` | `drain` | absent - `buildDrain` returns null on a null baseline, so the WHOLE panel goes, series included; a ZIP 209 violation, escalate |
| `N of M Ironwood spend(s) carry no resolvable anchor` | `neffSeries` | **PUBLISHES**, over fewer spends than the window holds |

The last row is the only one that clause does not fit: the panel is not a
stated absence, it is a measurement over FEWER spends than the window holds, and
this log line is the only place that gap is stated - `buildNeffSeries` drops the
audit record, so no reader of the document can see it.

One caveat on "not expected", because the second row strains it: that row fires
once per block on any 005 database before a backfill, which is the continuous
kind of line this section's closing paragraph says trains an operator to filter.
It is here rather than suppressed because it names a real gap that a backfill
closes - unlike the pre-birth condition, which no work closes and which
therefore reaches no log at all.

Gate round 5 measured this table against the real modules and found the third row
INVERTED: it had said the series publishes without its baseline, and `buildDrain`
returns null the moment the baseline is null, so the panel goes entirely. The row
was written by enumerating the `fault()` CALL SITES without following what each
one returns - half a measurement, in the section that exists to warn against
reading half of one.

For the first row the fix follows from the panel: all three read the database
(section 4 - check the migrations are applied).

Contrast the one expected line this stack does have, in section 3: `zmq
unavailable` fires ONCE, at boot, and is triaged once. A line that fired per
block would train an operator to filter the panel and take the real fault with
it, which is why the publisher does not emit one for the Ironwood pool below its
birth height - that condition is a measurement, it is carried by the DOCUMENT
under `SNAPSHOT.md` section 8.1's rendering contract, and it reaches no log at
all (gate round 4, F-46-1).

---

## 8. Upgrading Zebra

**Within one major only.** Zebra's on-disk state format changes between majors
and a downgrade after an upgrade is not supported; going 6.x to 7.x is a
wipe-and-resync (section 9), not an upgrade.

```bash
# 1. Read the release notes for every version you are skipping. Check whether
#    the state format changed and whether any RPC this project reads moved.
# 2. Back Postgres up (section 5). Zebra's own state is disposable; the
#    indexer's analysis is not.
# 3. Edit the pin in docker-compose.yml. It is an exact tag on purpose:
#      image: zfnd/zebra:6.3.0
#    (6.2.3 until LEDGER-10 Q1 moved it on 30 Aug 2026; the reason is the
#     funding-stream recipient names and specification URLs `getblocksubsidy`
#     returns for NU6.1 and later, not the decoder, which did not change.)
# 4. Pull and recreate only the node.
docker compose pull zebrad
docker compose up -d zebrad

# 5. Watch it come back. A state-format migration can take a while and the
#    node is not ready until it finishes.
docker compose logs -f zebrad
docker compose exec zebrad curl -sf http://127.0.0.1:8080/ready && echo " ready"
```

**Never move below 6.0.0.** The floor is a correctness floor with two reasons:
below 6.0.0 there is no Ironwood support, and below ZcashFoundation/zebra PR
#9805 (merged 22 Aug 2025) `getrawtransaction` does not serialise `vjoinsplit`
at all - which makes every Sprout value term in this project silently zero, with
no failing test.

---

## 9. Wipe and resync

For a corrupted state directory, an unsupported downgrade, or a major upgrade.

```bash
# Stop AND REMOVE the containers that reference the volume. `stop` alone is not
# enough: a stopped container still holds a reference and `docker volume rm`
# fails with "volume is in use".
docker compose stop indexer gateway zebrad
docker compose rm -f zebrad

# Remove ONLY the Zebra state volume. Naming it explicitly matters: `down -v`
# would take Postgres and Redis with it, and the indexer's analysis history is
# the one thing on this box that cannot be rebuilt from the network.
# The name carries the compose project prefix, which is `zecreveal` (the `name:`
# key at the top of docker-compose.yml), not the directory name.
docker volume rm zecreveal_zebrad-data

docker compose up -d zebrad
# Then section 2 again, including the /ready gate before restarting the indexer.
```

Postgres does **not** need wiping alongside it. The indexer's state machine is
keyed by height and replays forward; it does not assume the node kept its state.

---

## 10. Capturing the mainnet block fixture

Deliverable 2 of HANDOFF-10, and it can only be done **here**, on a synced node.
No agent session can do it: a container has no Zebra, and this project's egress
proxy refuses external hosts.

```bash
# Verbosity 2 - it inlines the full transaction objects decodeBlock walks.
# Verbosity 0 (raw hex) and 1 (txids only) will not deserialize into RpcBlock.
HEIGHT=3430000
docker compose exec -T zebrad curl -s http://127.0.0.1:8232 \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getblock\",\"params\":[\"$HEIGHT\",2]}" \
  | python3 -c 'import sys,json; json.dump(json.load(sys.stdin)["result"], sys.stdout)' \
  > "apps/indexer/test/fixtures/blocks/mainnet-$HEIGHT-$SHORT.json"

# SHORT is the first six hex characters of the block hash. Set it before the
# command above; an unquoted <shorthash> placeholder is parsed by the shell as a
# redirection and the capture fails with a syntax error rather than a hint.
#   SHORT=$(docker compose exec -T zebrad curl -s http://127.0.0.1:8232 \
#     -H 'content-type: application/json' \
#     -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getblockhash\",\"params\":[$HEIGHT]}" \
#     | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"][:6])')
```

Selection criteria are in `apps/indexer/test/fixtures/blocks/README.md` and are
not repeated here. The two that are easiest to get wrong: the block must be
**post-NU6.3** (height >= 3,428,143) so all four pools exist, and it should carry
**a Sprout transaction with at least one JoinSplit** if one can be found - no
fixture in this repository has ever had one, so `sproutValueBalanceZat` has never
met bytes a node produced.

**Record the node version beside the capture.** A fixture proves what a node
sent; the version is what says WHICH node:

```bash
docker compose exec -T zebrad curl -s http://127.0.0.1:8232 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getinfo","params":[]}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["subversion"])'
```

### Capture log

Fill in a row per capture.

| Height | Block hash | `subversion` observed | `vjoinsplit` present | Captured |
|---|---|---|---|---|
| 3,432,130 | `000000000009eb351a746b531aac6125982b93161529b5e68821d74034230ddd` | `/Zebra:6.2.1/` | yes, empty on all 5 tx | 1 Sep 2026 |
| 3,441,955 | `000000000054b709857869a65b4db13bbc723123584b18edd4637ae3d3780791` | `/Zebra:6.2.1/` | yes, empty on all 10 tx | 1 Sep 2026 |

Both were taken by L2 (Cowork) against the public endpoint
`https://zcash-mainnet-zebrad.gateway.tatum.io/` rather than against this VPS,
because the VPS is not yet provisioned and the standing request had by then
survived four handoffs (LEDGER-10 Q4). The `subversion` is L2's reading of
`getnetworkinfo` at capture time and is **not** recoverable from the files -
a `getblock` result carries no node identity - so it is recorded here on L2's
report rather than as something a later reader can re-measure from the tree.
Everything else in these two rows was measured from the committed files.

**THE `vjoinsplit` COLUMN IS DELIVERABLE 2b AND THESE TWO CAPTURES CLOSE HALF
OF IT.** `packages/zebra-rpc/src/sprout-field.ts` reports the field's absence
as INDETERMINATE rather than as zero, and this table is where "indeterminate"
becomes "observed". Executed against both captures:

```
tx0(v6)=OBSERVED  tx1(v5)=OBSERVED  tx2(v5)=OBSERVED  tx3(v6)=OBSERVED  tx4(v5)=OBSERVED
tx0(v6)=OBSERVED  tx1(v4)=OBSERVED  tx2(v6)=OBSERVED  tx3(v4)=OBSERVED  tx4(v5)=OBSERVED
tx5(v4)=OBSERVED  tx6(v4)=OBSERVED  tx7(v6)=OBSERVED  tx8(v4)=OBSERVED  tx9(v6)=OBSERVED
control, a v4 tx with NO vjoinsplit key: ABSENT_INDETERMINATE
```

Every transaction carries the key, empty. The four **v4** transactions in
3,441,955 are what make that a result rather than a formality: v4 is a version
that COULD carry JoinSplits, so on a v4 the missing key is exactly the
`ABSENT_INDETERMINATE` the control shows - and this is the first time this
repository has held a node's answer for one. Zebra emits `vjoinsplit` on the
verbosity-2 `getblock` path.

**What is still open is the other half: a NON-EMPTY JoinSplit.** L2 scanned 130
post-Ironwood blocks (heights 3,428,200 to 3,445,099) and found Sprout
JoinSplits in 0 of 130. The pool holds about 22,591 ZEC and is dormant, so
sampling recent heights will not produce one at any sample size worth running;
finding one needs a targeted historical search, which is a different job.
`sproutValueBalanceZat` has still never met bytes a node produced.

### The node version, and why these captures are usable below the 6.3.0 floor

`checkZebraVersionFloor("/Zebra:6.2.1/")` returns `below-floor`. That is not
disqualifying here and the distinction is worth stating, because getting it
wrong in either direction is expensive: `version-floor.ts` and A11 govern **the
node the running stack talks to**, whereas a capture is a historical artifact
whose `subversion` this README asks to be RECORDED. Applying a live-operation
rule to an artifact would have thrown away two usable captures.

What 6.2.1 actually risks is ZcashFoundation/zebra issue **#10550**, fixed in
6.2.2: `getblock` resolved the caller's hash-or-height a second time for
`get_block_header` and bound the Sapling-tree and depth reads to it, so a reorg
or tip advance between those reads could mix one block's header with another's
contents, or return a Sapling tree from a different block at the same height.
The same release stopped hardcoding `in_active_chain: true`.

**So it is checked rather than assumed, and a block carries its own checksum.**
`scripts/check-capture-consistency.mjs` recomputes each capture's merkle root
from its own txids and compares it to the header - a header and a transaction
list from different blocks cannot agree - and checks `nTx`, per-transaction
blockhash and height, and the best-chain flag. It runs in `pnpm check` and in
CI. Every field #10550 could corrupt is clean on both captures:

```
[capture-consistency] OK: 2 capture(s) in apps/indexer/test/fixtures/blocks are
internally consistent (merkle root recomputed from txids; nTx; per-tx blockhash
and height; best-chain flag; 0 note-commitment tree delta(s) checked against the
blocks' own outputs and actions), with 2 check(s) reported above as NOT RUN.
```

**The two NOT RUN lines are the honest part and are not a pass.** The
note-commitment `trees` delta arm needs the block before the one it is
checking, and neither height 3,432,129 nor 3,441,954 is committed here, so that
arm did not run for either capture. It is reported as not run rather than
counted as checked. Committing the two predecessors would make it reproducible
at a cost of about 549 KB and 305 KB; that trade is recorded in LEDGER-12 and
is the operator's, not a session's - no session can fetch them.

**Re-capturing height 3,432,130 from a 6.3.x node and diffing settles the
version question permanently.** Byte-identical closes it; different is itself a
finding, and a more interesting one than the original doubt.

---

## 10a. Deploying a code change

Nothing here auto-updates. A `git pull` alone changes no running container,
and neither says so - the stack keeps serving the old image and looks healthy.

```bash
cd /opt/zecreveal
git pull

# Rebuild only what changed. `up -d` then recreates the containers whose image
# moved and leaves the rest alone.
# Rebuild everything this repository builds. `cloudflared` is built here too
# (infra/cloudflared/Dockerfile), and `up -d` does NOT rebuild an image that
# already exists - so omitting it leaves the tunnel on a stale image, which is
# the same silent no-op this section exists to prevent. Add `publisher` once
# HANDOFF-09 has landed.
docker compose build indexer gateway cloudflared

# MIGRATE BEFORE THE NEW CODE SERVES, not after. An earlier draft of this
# section ran `up -d` first and then migrated, so the new indexer and gateway
# ran against the old schema for as long as the migration took.
docker compose run --rm indexer node dist/migrate.js

docker compose up -d indexer gateway cloudflared

docker compose ps zebrad postgres redis indexer gateway
```

Zebra is not rebuilt by this: it is a pinned upstream image and its upgrade path
is section 8.

---

## 11. Routine operations

```bash
# Logs for one service, last hour.
docker compose logs --since 1h gateway

# The VPS Redis: liveness, then the whole namespace. See the note below.
docker compose exec redis redis-cli ping
pnpm redis:keys

# Postgres, interactively.
docker compose exec postgres psql -U zcashreveal zcashreveal

# Restart one service without disturbing the node.
docker compose restart gateway

# Stop everything, keeping all data.
docker compose stop

# The publisher arrives with HANDOFF-09. Until then it is behind a profile and
# `up -d` skips it; afterwards:
docker compose --profile publisher up -d publisher
```

**`docker compose down -v` is not in this runbook as a routine command.** It
removes the named volumes, which means Postgres, and the indexer's analysis
history is not reproducible from the chain. Section 9 removes the one volume
that is disposable, by name.

### Why the enumeration is a tool and not a `redis-cli` line

`pnpm redis:keys` (`scripts/redis-keys.mjs`) lists every key on the **VPS**
Redis with its type. It is a script rather than a pasteable command, and the
reason is the whole of this section.

`scripts/check-redis-safety.mjs` reads files, not intentions. It cannot see
which of the two Redis servers a `redis-cli` invocation will reach, so it treats
every enumeration and every keyspace report as if it were aimed at the shared
managed store. In most of the repository that conservatism costs nothing. **In a
runbook it is the point**, because a runbook is a copy-paste surface: the line an
operator pastes at 3am is the line most likely to be pointed at the wrong `-u`
URL, and the two prefixes differ by one letter (`zcashreveal:` here,
`zecreveal:` there).

LEDGER-10 Q2 ruled that the guard must **not** be taught to tell the two servers
apart - a guard that infers a `redis-cli` line's target is a guard that will be
confidently wrong, and the failure it would enable is an outage for another
project's production data. The cost of that ruling was that the operator had no
enumeration command at all. The answer is neither to loosen the guard nor to
accept the cost: the safety moves **inside the tool**.

- The URL comes from `REDIS_URL` in the environment. There is no `--url` flag
  and there will not be one. A flag is a paste.
- `assertNotManagedStore` runs **before a socket is opened**, and the tool exits
  non-zero if it throws. That is the same function the indexer and the gateway
  call at boot, and it refuses both by hostname and by an exact value match
  against every `SNAPSHOT_REDIS_*` variable in the environment.
- The scan is bounded by `VPS_KEY_PREFIX`, imported from `@zcashreveal/types`
  rather than typed here, and the bound is written at the call site so both a
  reader and the guard can see it.

So the runbook line names no Redis command, which gives the text guard nothing to
be wrong about, and the enumeration is safe because of what the tool does rather
than because of what the operator remembered.

**There is still no enumeration command for the managed store, and there will not
be one.** It holds three keys, this project wrote all of them, and
`docs/2.0/SNAPSHOT.md` rule 7 is about exactly the temptation to look.

If you need something `pnpm redis:keys` does not show, take it interactively with
`docker compose exec redis redis-cli` against a named key, and do not write the
result back into this file.
