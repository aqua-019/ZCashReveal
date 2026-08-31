# @zcashreveal/gateway - the Fastify read API and WebSocket fan-out.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f apps/gateway/Dockerfile -t zecreveal/gateway:local .
# The build context is the workspace root because this is a pnpm monorepo and
# the app's dependencies are three sibling packages resolved through
# `pnpm-workspace.yaml`. A context rooted at `apps/gateway` cannot see them.
#
# FOUR STAGES, AND THE SPLIT IS NOT DECORATION. `manifests` exists so that a
# source edit does not invalidate the dependency install - the most expensive
# layer here by a wide margin. `build` and `prod-deps` both descend from it and
# are independent, so BuildKit runs them concurrently. `runtime` copies from
# both and inherits neither's toolchain, which is what keeps the compiler, the
# test runner and the TypeScript sources out of the shipped image.
#
# NO COMPILER IN EITHER INSTALL STAGE, and that is deliberate rather than an
# omission copied from elsewhere: the gateway's dependency tree is pure
# JavaScript. The indexer's image carries python3/make/g++ because `zeromq@6` is
# a native addon; adding them here would enlarge the build for nothing and would
# quietly let a native dependency be introduced without anyone noticing it had
# been.

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
COPY packages/zec-instruments/package.json ./packages/zec-instruments/
COPY apps/indexer/package.json ./apps/indexer/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/publisher/package.json ./apps/publisher/
COPY apps/web/package.json ./apps/web/
COPY legacy/dashboard/package.json ./legacy/dashboard/

# ---------------------------------------------------------------------------
# build - full (dev) install for this app's subtree, then tsc.
#
# `--filter @zcashreveal/gateway...` is the package AND its dependencies; the
# trailing ellipsis is what makes it dependencies rather than dependents. It
# keeps Next.js, Playwright and the legacy dashboard's tree out of the install
# entirely, which is most of the wall clock.
# ---------------------------------------------------------------------------
FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @zcashreveal/gateway...
COPY packages ./packages
COPY apps/gateway ./apps/gateway
# Builds the three workspace packages topologically and then the app. `tsc -b`
# is the app's own `build` script; turbo orders them.
RUN pnpm --filter @zcashreveal/gateway... build

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
RUN pnpm install --frozen-lockfile --prod --filter @zcashreveal/gateway...

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
COPY --from=build --chown=node:node /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=build --chown=node:node /app/apps/gateway/docker-healthcheck.mjs ./apps/gateway/

USER node
WORKDIR /app/apps/gateway

# The gateway is the ONLY service in this stack that anything outside the box
# reaches, and it is reached through the tunnel rather than through a published
# port. EXPOSE documents the container port for cloudflared's ingress; it
# publishes nothing by itself.
EXPOSE 8080

# The gateway has a real health surface, so its check uses it: GET /healthz,
# served by apps/gateway/src/server.ts. That is a stronger check than the
# indexer's TCP probe - it exercises the HTTP stack and the route table, not
# just a socket - which is why the two services check themselves differently
# rather than sharing one script.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["node", "docker-healthcheck.mjs"]

CMD ["node", "dist/index.js"]
