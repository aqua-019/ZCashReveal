# ZCashReveal

> **Shielded is not Silent.** The zk-SNARK hides note values and endpoints. The chain still
> publishes nullifiers, anchors, commitments and every boundary amount — and, since NU6.3,
> every Orchard to Ironwood migration amount. ZECReveal is the public instrument that makes
> that boundary legible, and the public record that keeps the receipts.

**Report uncertainty, not identity.** Public chain data does not deanonymise Zcash shielded
transactions; it bounds the set of possibilities. Every number here is either exact and
public, or a bound with its assumptions printed beside it. Nothing in this project claims to
know who sent what to whom.

**Status: 2.0 in progress.** v0.2 (indexer, gateway, shared types, 178 tests) is on `main`
and is the foundation. The 2.0 build — the public site, the four-pool model and the ZEC
Tracking suite — is being delivered handoff by handoff; see [`handoffs/`](handoffs/).

## The thesis

Zcash markets its shielded pools as private by zero-knowledge proof. The proof hides note
values, sender addresses and recipient addresses for shielded inputs and outputs. It does
not hide everything. Four classes of per-transaction data are public by construction:

| Field | Public information |
|---|---|
| **nullifiers** | One per spent note. Globally unique. Reveals spent-set growth and timing. |
| **valueBalance** | Signed net amount crossing each pool's t/z boundary. Reveals every deposit and withdrawal amount in full. |
| **anchors** | Merkle root of the note commitment tree at spend time. Reveals a window during which the spent note could have entered. |
| **commitments** | One per output note. Reveals tree growth, output counts, dust patterns. |

Nor can the protocol hide the transparent side of any t-to-z deposit or z-to-t withdrawal:
every shielding publishes the sender's transparent address, every unshielding publishes the
recipient's. The shielded middle is a temporary fog, and Kappos et al. (USENIX Security
2018) showed that round-trip pairs — a deposit amount matching a later withdrawal within
fee tolerance — narrow it sharply. Two further facts drive 2.0: twice in ten years
(Sprout 2016-18, Orchard 2022-26) a pool ran on an unsound circuit and neither window can
ever be cryptographically cleared, and ZIP 318 makes every Orchard to Ironwood migration
amount public.

## What 2.0 is

Two halves, one identity — see [`docs/2.0/ZECREVEAL-2.0-PLAN.md`](docs/2.0/ZECREVEAL-2.0-PLAN.md).

- **The Record** — static, citable, zero-motion: the exploit ledger, the contradictions
  between marketing claims and on-chain reality, the timeline, the promotion network, and a
  sources page where every claim carries a source URL, a confidence level and a
  last-verified date.
- **The ZEC Tracking suite** — live and deterministic: turnstile ledger across
  Sprout / Sapling / Orchard / Ironwood / transparent, the unprovable residual, Ironwood
  birth (a new pool's commitment tree grows from zero, so early anchors bound tiny candidate
  sets), the ZIP 318 migration lens, and the live mempool with candidate sets and inference
  chains. The public page renders from a per-block snapshot, so it is never blank when the
  feed is down; it shows the age of what it is showing.

The maths that bounds all of it is in [`docs/RESEARCH-v0.2.md`](docs/RESEARCH-v0.2.md)
(the formal spine) and [`docs/2.0/TRACKING-MATH.md`](docs/2.0/TRACKING-MATH.md)
(exact / bounded / never claimed).

## Repository layout

```
apps/
  indexer/          Zebra RPC + ZMQ, four-pool state machine, persistence, analysis
  gateway/          Fastify REST + WebSocket broker over Redis pub/sub
packages/
  zec-types/        shared types: branded Hex, Zatoshi, pool union, leak taxonomy
legacy/
  dashboard/        the parked v0.2 Vite SPA - frozen, harvested, then deleted
docs/
  RESEARCH-v0.2.md  the formal model (state machine, candidate sets, claim levels)
  2.0/              the 2.0 plan, research dossier, tracking math, mockups, v0.2 notes
handoffs/           the unit of work: README index, HANDOFF-00..13, LEDGER.md, LOG.md
infra/              zebrad configuration
scripts/            CI guards (integration-coverage assert, emoji scan)
```

`apps/web` (Next.js App Router), `apps/publisher` (snapshot) and `packages/content`
(zod-validated research data) arrive with handoffs 01, 09 and 02.

## Working on it

Node 22 (see `.nvmrc`), pnpm 9.12.0.

```bash
pnpm install --frozen-lockfile
pnpm build          # turbo, topological
pnpm typecheck      # all packages
pnpm lint           # eslint flat config; Math.random is banned repo-wide
pnpm -r test        # every workspace suite
pnpm check          # the fourteen static guards CI runs: no emoji, Vercel config,
                    # shared-Redis safety (docs/2.0/SNAPSHOT.md - the managed
                    # store holds another production project's live data),
                    # no stale two-pool unions (the pool model is four pools),
                    # no corpus citation pointing at a blank or missing line,
                    # no partial read of a FilterApplication variant's params
                    # (an exhaustiveness check protects the SET of variants and
                    # says nothing about the SHAPE of one), the instruments
                    # package reaching neither zeromq nor the indexer through
                    # its dependency graph, no multi-site
                    # gate finding left open at one of the sites it named,
                    # compose healthchecks + no literal secret + the managed-
                    # store TCP URL confined to the publisher + the snapshot
                    # file paired between its writer and its readers,
                    # zebrad.toml keys Zebra accepts and agreeing with compose,
                    # the runbook's topics and DEPLOY-2.0's variable list,
                    # LEDGER.md's heading-to-fence structure, and every
                    # user-facing static route under apps/web/src/app carrying
                    # a nav entry or a named exclusion (/pools and /reveal were
                    # top-level pages with no entry for four handoffs), and no
                    # SVG <text> in apps/web outside a register carrying its own
                    # measurement - text in a scaled viewBox paints at
                    # declared x min(sx, sy), so no declared value clears the
                    # 12px floor at every supported width and the labels are
                    # HTML positioned over the drawing
```

60 of the indexer's tests are Postgres-backed integration tests (37 before HANDOFF-06, 56 before HANDOFF-07). They gate themselves on a
live reachability probe, so without a database they skip silently and the suite still
reports green. To run them:

```bash
docker compose up -d postgres          # operator action; not run by agents
export DATABASE_URL=postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal
pnpm --filter @zcashreveal/indexer migrate
pnpm --filter @zcashreveal/indexer test    # 170 passed, 1 skipped
```

The last skip needs a captured mainnet block fixture in
`apps/indexer/test/fixtures/blocks/`; it self-activates once one is committed. CI runs the
full set against a `postgres:16` service and fails the build if those 37 ever skip again
(`scripts/assert-no-skipped-integration.mjs`).

## How work is organised

[`CLAUDE.md`](CLAUDE.md) is the contract: conventions, the design system, and the Aqua Stack
v4.1 operating model. Work arrives as a numbered handoff in [`handoffs/`](handoffs/) with
binary, machine-checkable assertions; a session executes the one marked `status: open`, and
**every pull request stops at opened**. Merging, deploying and production promotion are
human actions. [`handoffs/LEDGER.md`](handoffs/LEDGER.md) is the append-only record of what
each revolution learned.

## License

[AGPL-3.0](./LICENSE). Patterns inspired by mempool.space (AGPL-3.0); no code copied
verbatim. The decoder and link engine are original work derived from the Zcash protocol
specification.

Pre-alpha. Built for cypherpunks, not for compliance.
