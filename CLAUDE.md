# Claude workflows for ZCashReveal

Project context for Claude Code agents working in this repo.

## Stack
- Monorepo: pnpm + Turbo
- Types: shared TypeScript package `@zcashreveal/types`
- Indexer: Node 20 + TypeScript, zebrad RPC + ZMQ, Postgres + Redis
- Gateway: Fastify + ws
- Dashboard: React 19 + Vite + Tailwind v4

## Conventions
- All hex on the wire is lowercase, no 0x prefix
- Values in zatoshi as bigint, ZEC display via lib/formatters
- Severity ramp: INFO → LOW → MEDIUM → HIGH → CRITICAL
- Leak class taxonomy in packages/zec-types/src/leaks.ts
- ZEC gold accent #F4B728, SVG icons only, no emoji
- Glassmorphism dark canvas, Instrument Serif + JetBrains Mono + Manrope

## Workflow triggers
- `snowball [feature]` — scoping questions → ARCHITECTURE.md draft
- `update [module]` — diff-style patch against current state
- `decoder [bundle]` — Sapling/Orchard structural analysis

## Don'ts
- Don't claim deterministic deanonymization from public data alone
- Don't use emoji
- Don't introduce generic Tailwind soup; respect the token system
