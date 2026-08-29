# @zcashreveal/indexer - the process that reads Zebra and writes Postgres/Redis.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f apps/indexer/Dockerfile -t zecreveal/indexer:local .
# The build context is the workspace root because this is a pnpm monorepo and
# the app's dependencies are three sibling packages resolved through
# `pnpm-workspace.yaml`. A context rooted at `apps/indexer` cannot see them.
#
# FOUR STAGES, AND THE SPLIT IS NOT DECORATION. `manifests` exists so that a
# source edit does not invalidate the dependency install - the most expensive
# layer here by a wide margin. `build` and `prod-deps` both descend from it and
# are independent, so BuildKit runs them concurrently. `runtime` copies from
# both and inherits neither's toolchain, which is what keeps the compiler, the
# test runner and the TypeScript sources out of the shipped image.
#
# THE NATIVE MODULE IS THE REASON `prod-deps` HAS A COMPILER. `zeromq@6` is a
# native addon; it ships prebuilds, but musl is the platform where a prebuild is
# most likely to be missing, and a source build then needs python3/make/g++. The
# alternative - discovering that at deploy time on the VPS - is worse than
# carrying the toolchain in a stage that is thrown away.

FROM node:22-alpine AS base
# Pinned to the version in the root package.json's `packageManager` field. If
# those two disagree, `--frozen-lockfile` is the thing that notices.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV CI=true

# ---------------------------------------------------------------------------
# manifests - every workspace package.json, and nothing else.
#
# EVERY manifest, including the ones this image never builds. `--frozen-lockfile`
# reconciles the lockfile against every importer `pnpm-workspace.yaml` resolves,
# so omitting `apps/web` or `legacy/dashboard` here makes the lockfile look stale
# and the install fails with a message that does not mention the missing file.
# ---------------------------------------------------------------------------
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/zec-types/package.json ./packages/zec-types/
COPY packages/content/package.json ./packages/content/
COPY packages/zebra-rpc/package.json ./packages/zebra-rpc/
COPY apps/indexer/package.json ./apps/indexer/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/web/package.json ./apps/web/
COPY legacy/dashboard/package.json ./legacy/dashboard/

# ---------------------------------------------------------------------------
# build - full (dev) install for this app's subtree, then tsc.
#
# `--filter @zcashreveal/indexer...` is the package AND its dependencies; the
# trailing ellipsis is what makes it dependencies rather than dependents. It
# keeps Next.js, Playwright and the legacy dashboard's tree out of the install
# entirely, which is most of the wall clock.
# ---------------------------------------------------------------------------
FROM manifests AS build
RUN apk add --no-cache python3 make g++
RUN pnpm install --frozen-lockfile --filter @zcashreveal/indexer...
COPY packages ./packages
COPY apps/indexer ./apps/indexer
# Builds the three workspace packages topologically and then the app. `tsc -b`
# is the app's own `build` script; turbo orders them.
RUN pnpm --filter @zcashreveal/indexer... build

# ---------------------------------------------------------------------------
# prod-deps - the same subtree, production dependencies only.
#
# A SEPARATE INSTALL RATHER THAN A PRUNE. `pnpm prune --prod` over the build
# stage's store would leave the workspace links pointing at packages whose
# devDependencies were removed underneath them; a clean `--prod` install
# resolves the graph that will actually be shipped. It costs one more install
# and it is the difference between an image that runs and an image that runs
# until something reaches for `tsx`.
# ---------------------------------------------------------------------------
FROM manifests AS prod-deps
RUN apk add --no-cache python3 make g++
RUN pnpm install --frozen-lockfile --prod --filter @zcashreveal/indexer...

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM base AS runtime

# `node:22-alpine` already provides an unprivileged `node` user (uid 1000). The
# process needs no write access to anything in the image: its state is Postgres
# and Redis, both over the network.
ENV NODE_ENV=production

# The dependency graph, symlinks and all. Copied as one tree because pnpm's
# node_modules is a symlink farm into `node_modules/.pnpm`, and copying the
# top-level directory alone would leave every link dangling.
COPY --from=prod-deps --chown=node:node /app ./

# The compiled output, layered over it. `packages/content` ships `data/` beside
# `dist/` - its package.json `files` field lists both - and the loaders read
# those JSON seeds at runtime, so the data directory is not optional.
COPY --from=build --chown=node:node /app/packages/zec-types/dist ./packages/zec-types/dist
COPY --from=build --chown=node:node /app/packages/zebra-rpc/dist ./packages/zebra-rpc/dist
COPY --from=build --chown=node:node /app/packages/content/dist ./packages/content/dist
COPY --from=build --chown=node:node /app/packages/content/data ./packages/content/data
COPY --from=build --chown=node:node /app/apps/indexer/dist ./apps/indexer/dist
COPY --from=build --chown=node:node /app/apps/indexer/docker-healthcheck.mjs ./apps/indexer/

# THE MIGRATIONS DIRECTORY IS NOT OPTIONAL, and leaving it out is a mistake that
# only shows up on the VPS. `dist/migrate.js` resolves its SQL at
# `join(here, "..", "migrations")` - that is `/app/apps/indexer/migrations`, a
# path relative to the compiled file rather than to the working directory - so
# without this line `docker compose run --rm indexer node dist/migrate.js`, which
# is the command RUNBOOK-VPS.md section 4 tells an operator to run against a
# production database, fails on a directory that is not there.
#
# It is copied from the BUILD stage rather than from the context so that the
# whole image comes from one place, and .sql files are not compiled, so what
# lands here is byte-identical to the repository.
COPY --from=build --chown=node:node /app/apps/indexer/migrations ./apps/indexer/migrations

USER node
WORKDIR /app/apps/indexer

# No EXPOSE: the indexer listens on nothing. It dials Zebra, Postgres and Redis
# and is reachable from nowhere, which is the correct attack surface for it.

# The healthcheck is a real probe, not a formality - see the header of
# docker-healthcheck.mjs for what it measures and, more importantly, what it
# does not. The obvious alternative for a process with no HTTP surface is
# `node -e "process.exit(0)"`, which cannot fail and would report healthy for a
# wedged container forever.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["node", "docker-healthcheck.mjs"]

CMD ["node", "dist/index.js"]
