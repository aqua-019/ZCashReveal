/**
 * Call the gateway and come back with an answer either way.
 *
 * WHY THIS EXISTS, AND IT IS ASSERTION A7. `HttpApi` parses every response
 * against its Zod DTO and THROWS when the shape is wrong - deliberately, so a
 * gateway that omits a field fails at the boundary with the field named rather
 * than rendering `undefined` three components later. That is the right
 * behaviour for the client and the wrong behaviour for a page: an uncaught
 * throw in a server component is a 500, and HANDOFF-11 section 3 says a
 * validation failure "renders the snapshot data with an `UNVERIFIED` chip,
 * never a crash".
 *
 * So the throw stays where it is and the PAGE decides what to do about it. A
 * page that calls `attempt` gets a value or a reason, and a reason is something
 * it can render: the snapshot's own numbers, with the chip saying which part of
 * the page could not be checked and why.
 *
 * THE REASON IS CLIENT-SAFE. `Error.message` from `HttpApi` names the path and
 * the offending field, both of which are this project's own vocabulary and
 * neither of which is a secret. Nothing from a network error's `cause` chain
 * reaches it, because that is where a URL with credentials in it would be.
 */

export type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "the gateway did not answer" };
  }
}
