/**
 * Environment surface for apps/web.
 *
 * HANDOFF-01 reserves the names and wires nothing: no request is made to any of
 * these endpoints in this handoff. HANDOFF-11 reads the snapshot store,
 * HANDOFF-04 reads the REST and WS URLs.
 *
 * Rules that hold from here on (CLAUDE.md):
 *   - `NEXT_PUBLIC_*` is compiled into the client bundle. Nothing secret goes there.
 *   - `SNAPSHOT_REDIS_*` is server-only and is never given a NEXT_PUBLIC_ alias.
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
 * True in `next dev`, and in a production build running in fixture mode - which
 * is what the Playwright suite exercises, so the assertions run against the
 * same compiled output a reviewer sees. A deployed site sets
 * NEXT_PUBLIC_DATA_MODE=snapshot and `/dev/primitives` returns 404.
 */
export const DEV_SURFACES: boolean =
  process.env.NODE_ENV === "development" || DATA_MODE === "fixture";
