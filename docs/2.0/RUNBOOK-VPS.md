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

# Fill in the four variables that have no default. The stack REFUSES TO START
# without them rather than defaulting to something wrong in production:
#   POSTGRES_PASSWORD        openssl rand -base64 32
#   GATEWAY_CORS_ORIGIN      the Vercel origin, e.g. https://zecreveal.vercel.app
#   GATEWAY_TRUSTED_PROXIES  see section 6, after the tunnel is up
#   TUNNEL_TOKEN             see section 6
${EDITOR:-nano} .env
chmod 600 .env
```

Confirm the stack parses before starting anything:

```bash
docker compose -f docker-compose.yml config >/dev/null && echo "compose OK"
```

---

## 2. First sync

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
docker compose ps           # every service should read (healthy)
```

---

## 3. What the indexer is actually doing, and it is not what the variable says

`ZEBRAD_ZMQ_URL` is set, `docker-compose.yml` passes it, and **it does nothing.**

Zebra has no ZMQ. Not disabled, not unconfigured - the feature does not exist at
any version, in any section of `ZebradConfig`. ZMQ was zcashd's mechanism.
`apps/indexer/src/index.ts` constructs a subscriber, fails to connect, logs

```
zmq unavailable - falling back to polling only
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

> **MIGRATIONS 003 AND 004 HAVE NEVER BEEN APPLIED TO THE VPS DATABASE.** As of
> this writing the box is still on 002. That is a standing item, it is the
> operator's click, and it is the reason for the paragraph below.

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

# Restore into an empty database.
docker compose exec -T postgres \
  pg_restore -U zcashreveal --dbname=zcashreveal --clean --if-exists \
  < /var/backups/zecreveal-2026-08-29.dump
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

Configure ingress in the Cloudflare dashboard for this tunnel, or in a config
file:

```yaml
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

```bash
docker compose exec gateway getent hosts cloudflared | awk '{print $1}'
# put that address in .env as GATEWAY_TRUSTED_PROXIES, then:
docker compose up -d gateway
```

Re-read it after any `docker compose down`, which can renumber the network.

### 6.2 THE TUNNEL MUST NOT LOG QUERY STRINGS

This is the **third copy of the viewing-key exposure** (HANDOFF-05 A9), and it is
the copy that lives outside the application entirely.

The gateway already drops the query string before writing a log line, redacts
key-shaped runs from what remains, and refuses to echo either back to a caller.
**None of that reaches a reverse proxy.** cloudflared, nginx and every load
balancer log full URLs by default, so a viewing key that arrives at

```
https://api.zecreveal.example/api/search?q=uview1...
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

```bash
# Chain tip according to the node.
TIP=$(docker compose exec -T zebrad curl -s http://127.0.0.1:8232 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getblockcount","params":[]}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"])')

# Height the gateway is serving.
SERVED=$(curl -s https://api.zecreveal.example/api/pools \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("height", 0))')

echo "tip=$TIP served=$SERVED lag=$((TIP - SERVED))"
[ $((TIP - SERVED)) -gt 20 ] && echo "ALERT: snapshot is stale"
```

Measure it from the **reader's** side, as above, rather than from the publisher's.
A publisher that thinks it is publishing and a store that is not receiving look
identical from the box, and the reader is the only place the difference shows.

Container health is the cheap complement:

```bash
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
```

Note what each healthcheck does and does not mean. `zebrad` healthy means "up
with peers", not "synced". `indexer` and `publisher` healthy mean "can open a
socket to everything they are configured to dial", not "keeping up". `gateway`
healthy means `/healthz` answers with its own JSON shape. None of them measures
freshness - that is what snapshot age is for.

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
#      image: zfnd/zebra:6.2.3
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
# Stop the node and everything that reads it.
docker compose stop indexer gateway zebrad

# Remove ONLY the Zebra state volume. Naming it explicitly matters: `down -v`
# would take Postgres and Redis with it, and the indexer's analysis history is
# the one thing on this box that cannot be rebuilt from the network.
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
  > apps/indexer/test/fixtures/blocks/mainnet-$HEIGHT-<shorthash>.json
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

Fill in a row per capture. Empty is the honest current state.

| Height | Block hash | `subversion` observed | `vjoinsplit` present | Captured |
|---|---|---|---|---|
| _none yet_ | | | | |

The `vjoinsplit` column is deliverable 2b and is the point of the exercise:
`packages/zebra-rpc/src/sprout-field.ts` reports the field's absence as
INDETERMINATE rather than as zero, and this table is where "indeterminate"
becomes "observed".

---

## 11. Routine operations

```bash
# Logs for one service, last hour.
docker compose logs --since 1h gateway

# The VPS Redis. Named keys only - see the note below this block.
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli hlen zcashreveal:mempool:live

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

### Why the Redis commands above name exact keys

The obvious diagnostics - a keyspace summary, or a scan for `zcashreveal:*` -
are safe against the VPS Redis, which this project owns outright. They are
absent anyway, because `scripts/check-redis-safety.mjs` rejects them in this file
and is right to.

The guard reads files, not intentions: it cannot see which of the two servers a
`redis-cli` invocation will reach, so it treats every enumeration and every
keyspace report as if it were aimed at the shared managed store. In most of the
repository that conservatism costs nothing. **In a runbook it is the point**,
because a runbook is a copy-paste surface: the line an operator pastes at 3am is
the line most likely to be pointed at the wrong `-u` URL, and the two prefixes
differ by one letter (`zcashreveal:` here, `zecreveal:` there).

So the commands above name exact keys and enumerate nothing. If you need a
broader view of the VPS Redis, take it interactively with
`docker compose exec redis redis-cli` and do not write the result back into this
file.
