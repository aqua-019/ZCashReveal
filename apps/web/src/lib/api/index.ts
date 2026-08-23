/**
 * Which implementation the Tracking surfaces read through.
 *
 * One function, and it is the only place in `apps/web` that knows more than one
 * implementation exists. Every page imports `api()`; no page imports
 * `FixtureApi` or `HttpApi`, so HANDOFF-11's cutover is an edit to this file
 * and to nothing under `src/app`.
 *
 * FIXTURE IS THE ONLY MODE WIRED IN THIS HANDOFF, and the selection deliberately
 * fails CLOSED rather than open. `snapshot` and `live` are reserved names that
 * HANDOFF-09 and HANDOFF-11 fill in; until they do, selecting one of them gets
 * the fixture rather than a client pointed at an empty `NEXT_PUBLIC_API_URL`.
 * That is the same shape as the dev-surface gate in `lib/env.ts`: a
 * misconfigured deployment must degrade to something honest, not to a page of
 * failed requests.
 */
import { DATA_MODE } from "@/lib/env";

import { FixtureApi } from "./fixture-api";
import type { ZecApi } from "./zec-api";

let instance: ZecApi | undefined;

/**
 * The API. Memoised, because the fixture corpus is immutable and the socket a
 * component subscribes to is per-subscription rather than per-instance.
 */
export function api(): ZecApi {
  instance ??= new FixtureApi();
  return instance;
}

/**
 * Whether the page is reading committed values rather than a chain.
 *
 * Surfaces say so in their own words rather than looking this up in several
 * places: a reader who is shown a mempool must be told whether it is the real
 * one, and there is exactly one condition under which it is.
 */
export const IS_FIXTURE: boolean = DATA_MODE === "fixture";

export { FixtureApi } from "./fixture-api";
export { HttpApi } from "./http-api";
export { searchKind, hrefFor, KIND_TEXT } from "./kind";
export { ZecSocket, parseFrame, type SocketLike, type SocketState } from "./socket";
export type { ZecApi } from "./zec-api";
