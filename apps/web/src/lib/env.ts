/**
 * Environment surface for apps/web.
 *
 * HANDOFF-01 reserves the names and wires nothing: no request is made to any of
 * these endpoints in this handoff. HANDOFF-11 reads the snapshot store,
 * HANDOFF-04 reads the REST and WS URLs.
 *
 * Rules that hold from here on (CLAUDE.md):
 *   - `NEXT_PUBLIC_*` is compiled into the client bundle. Nothing secret goes there.
 *   - The managed store's variables (`docs/2.0/SNAPSHOT.md` section 3) are
 *     server-only and are never given a NEXT_PUBLIC_ alias. Their prefix is
 *     deliberately not spelled out in this file: assertion A4 greps
 *     `apps/web/src` for it and requires no match in any module the client
 *     graph reaches, and this one is reached through `api/stream.ts`.
 *     This module deliberately does not read them; the first server-side reader
 *     arrives in HANDOFF-11.
 *   - Next.js inlines `process.env.NEXT_PUBLIC_X` only for a literal member
 *     expression, so every read below is spelled out rather than computed.
 */

/**
 * How the page sources its data.
 *   fixture  - no network at all; committed sample values. The scaffold default,
 *              and the mode in which the dev-only surfaces are reachable.
 *   snapshot - server-rendered from the published snapshot (HANDOFF-09/11).
 *   live     - snapshot baseline upgraded by the WebSocket (HANDOFF-11).
 */
export type DataMode = "fixture" | "snapshot" | "live";

const DATA_MODES: readonly DataMode[] = ["fixture", "snapshot", "live"];

function readDataMode(): DataMode {
  const raw = process.env.NEXT_PUBLIC_DATA_MODE;
  return DATA_MODES.includes(raw as DataMode) ? (raw as DataMode) : "fixture";
}

export const DATA_MODE: DataMode = readDataMode();

/** Gateway REST base. Empty until HANDOFF-05/11; nothing reads it yet. */
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Gateway WebSocket. Empty until HANDOFF-11; nothing reads it yet. */
export const WS_URL: string = process.env.NEXT_PUBLIC_WS_URL ?? "";

/** Published snapshot document. Empty until HANDOFF-09; nothing reads it yet. */
export const SNAPSHOT_URL: string = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "";

/**
 * Whether the development-only surfaces exist: `/dev/primitives` and the
 * `window.__zr` instrumentation the reduced-motion assertions read.
 *
 * This gate FAILS CLOSED, and that is the whole point of its shape.
 *
 * The obvious spelling - "on when DATA_MODE is fixture" - would have been
 * wrong, because `readDataMode()` above falls back to "fixture" for an unset
 * or misspelled variable. A production deployment that simply forgot one
 * Vercel setting would then publish the primitives gallery and install the
 * diagnostics object, and CLAUDE.md forbids any agent from setting that
 * variable, so nothing in this repository could correct it. A default that
 * opens a surface is a default that will eventually open it in production.
 *
 * So: off in any production build unless something deliberately turns it on,
 * and the switch is its own variable rather than a side effect of the data
 * mode. The Playwright suite sets it (see playwright.config.ts webServer.env)
 * so A4 and A5 still run against real production output. Vercel never sets it.
 */
export const DEV_SURFACES: boolean =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEV_SURFACES === "1";
