/**
 * Which implementation the Tracking surfaces read through.
 *
 * One function, and it is the only place in `apps/web` that knows more than one
 * implementation exists. Every page imports `api()`; no page imports
 * `FixtureApi` or `HttpApi`, so HANDOFF-11's cutover is an edit to this file
 * and to nothing under `src/app`.
 *
 * HANDOFF-11 IS THE COMMIT THAT SELECTS THE SECOND IMPLEMENTATION, and the
 * selection still fails CLOSED. `snapshot` and `live` now reach `HttpApi` - but
 * only when `NEXT_PUBLIC_API_URL` is also set, because a mode without a URL is
 * a deployment that forgot a variable, and the honest answer to that is
 * committed values with the disclosure switched ON rather than a page of failed
 * requests. Same shape as the dev-surface gate in `lib/env.ts`: a misconfigured
 * deployment must degrade to something honest.
 *
 * `DATA_MODE` IS READ HERE AGAIN, WHICH IT WAS NOT, and the reason it was not
 * is worth keeping. A gate round found the selection ignoring it while
 * `IS_FIXTURE` was computed from it, so the two disagreed under any mode but
 * `fixture`: the page served committed values with the disclosure switched OFF.
 * The rule that fixed it is the one below - `IS_FIXTURE` is a fact about what
 * `api()` RETURNED, never a second reading of the same variable - and it is
 * what makes reading `DATA_MODE` here safe now that there is something to
 * select.
 *
 * THE SNAPSHOT IS NOT ONE OF THESE IMPLEMENTATIONS. `lib/snapshot/store.ts` is
 * a separate, server-only path: it supplies the BASELINE every page renders
 * from - the tip, the pool lanes, the plane's document - and `api()` supplies
 * what the gateway alone can answer. A page that could not reach the gateway
 * still renders, which is the whole design goal, and it says which panels it
 * could not check.
 */
import { API_URL, DATA_MODE, WS_URL } from "@/lib/env";

import { FixtureApi } from "./fixture-api";
import { HttpApi } from "./http-api";
import type { ZecApi } from "./zec-api";

let instance: ZecApi | undefined;

/**
 * The API. Memoised, because the fixture corpus is immutable and the socket a
 * component subscribes to is per-subscription rather than per-instance.
 */
export function api(): ZecApi {
  // FAIL CLOSED, AND THE CONDITION IS THE CONFIGURATION RATHER THAN THE MODE
  // ALONE. `NEXT_PUBLIC_DATA_MODE=live` with no `NEXT_PUBLIC_API_URL` is a
  // deployment that forgot a variable, and the honest answer to that is
  // committed values with the disclosure switched ON - not a page of failed
  // requests. Both are read because either alone is a half-configured client.
  instance ??=
    DATA_MODE !== "fixture" && API_URL !== ""
      ? new HttpApi({ baseUrl: API_URL, wsUrl: WS_URL })
      : new FixtureApi();
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
