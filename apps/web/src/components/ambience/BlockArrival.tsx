"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { onTip } from "@/lib/api/tip-bus";

/**
 * Redraw the document when a block arrives.
 *
 * THIS IS THE ONE THING FOLD 6 LICENSES, AND IT IS ALSO THE ONLY WAY THE
 * SNAPSHOT BASELINE BECOMES LIVE. The L2 RESOLUTION for HANDOFF-04b: "What you
 * MAY do is redraw the plane ON BLOCK ARRIVAL - that is the surface's one
 * licensed ceremony - and nothing per-transaction, ever." The plane is a server
 * component reading `resolveSnapshot()`, so "redraw" means asking the server
 * for a fresh render, which is what `router.refresh()` does.
 *
 * WITHOUT THIS THE CLAIM WOULD BE FALSE, and stating it without a mechanism is
 * precisely the defect the stopping rule's clause (ii) points at: a sentence
 * making a checkable claim about runtime behaviour, checked by EXECUTING the
 * behaviour rather than by reading the sentence. `revalidate = 60` is a clock,
 * not a block: it bounds how stale a cached render may be and does nothing at
 * the moment a block lands.
 *
 * NOTHING PER-TRANSACTION. The bus only ever publishes `tip`, so a mempool
 * arrival cannot reach this: a refresh per transaction would be a render per
 * transaction and, behind it, a managed-store read per transaction - three to
 * four orders of magnitude more traffic than the budget `docs/2.0/SNAPSHOT.md`
 * section 5 sets, in a database shared with another project's production.
 *
 * IT IS BOUNDED BY ISR AND NOT BY THE NUMBER OF VIEWERS. `router.refresh()`
 * re-requests this route's payload from the server; for a route with
 * `revalidate = 60` the server answers from its cached render until the window
 * expires. So a thousand browsers refreshing on one block do not become a
 * thousand snapshot reads - they become at most one per window per instance,
 * which is the same bound the store's module-scope memo already enforces.
 *
 * Renders nothing. It is a subscription with a side effect, and it is mounted
 * once by `Shell` for the same singleton reason `Tide` is.
 */
export function BlockArrival() {
  const router = useRouter();

  useEffect(
    () =>
      onTip(() => {
        router.refresh();
      }),
    [router],
  );

  return null;
}
