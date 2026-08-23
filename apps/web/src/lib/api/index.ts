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
 *
 * `DATA_MODE` is deliberately not read here. It was, and a gate round found the
 * consequence: the selection ignored it while `IS_FIXTURE` was computed from
 * it, so the two disagreed under any mode but `fixture`. This file will read it
 * again when there is a second implementation to select, and `IS_FIXTURE` will
 * still be derived from what was selected rather than from what was asked for.
 */
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
 *
 * DERIVED FROM WHAT `api()` ACTUALLY RETURNED, not from the environment. A gate
 * round found this reading `DATA_MODE === "fixture"` while `api()` returns a
 * `FixtureApi` unconditionally: under `NEXT_PUBLIC_DATA_MODE=live` the page
 * served committed values with the disclosure switched OFF, which is the one
 * failure mode the disclosure exists to prevent. The fail-closed selection is
 * right; the flag has to be a fact about it rather than a second reading of the
 * same variable.
 */
export const IS_FIXTURE: boolean = api() instanceof FixtureApi;

export { FixtureApi } from "./fixture-api";
export { HttpApi } from "./http-api";
export { searchKind, hrefFor, KIND_TEXT } from "./kind";
export { ZecSocket, parseFrame, type SocketLike, type SocketState } from "./socket";
export { subscribeFrames } from "./stream";
export type { ZecApi } from "./zec-api";
