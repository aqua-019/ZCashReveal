"use client";

import type { ClaimLevel } from "@zcashreveal/types";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Pill } from "@/components/ui/Pill";
import { KV } from "@/components/ui/KV";
import { searchKind } from "@/lib/api/kind";
import { CLAIM_TEXT } from "@/lib/claim";

/**
 * The address half of Mode B, read from the URL in the browser.
 *
 * WHY THIS IS A CLIENT COMPONENT. Reading `searchParams` in a server component
 * makes the whole route dynamic, and a dynamic route's HTML arrives late enough
 * that the webfont swap lands after first paint: measured, `/reveal` scored
 * cumulative layout shift 0.139 and performance 92 while the otherwise heavier
 * `/track` scored 0.004 and 95, and Lighthouse attributed the whole of the
 * difference to the dek reflowing when three fonts loaded. Everything on this
 * page except the echo of which address you asked about is identical for every
 * reader, so the page is static and this one part is not.
 *
 * WHAT IT COSTS. With JavaScript off, `/reveal?addr=u1...` shows the empty
 * branch rather than the address. The page's argument does not depend on it -
 * the whole left pane says a shielded address is not an on-chain object, and
 * that sentence is server-rendered - but the echo of the address is a real
 * thing a no-script reader loses, and the empty branch says so rather than
 * pretending nothing was asked.
 *
 * WHAT IT DOES NOT DO. It reads `addr` and nothing else. There is no code path
 * here that reads a viewing key from a URL, because `TrackSearch` refuses to
 * put one there and this component would have nowhere to send it if it found
 * one.
 */
export function RevealAddress({
  context,
}: {
  readonly context: {
    readonly pool: string;
    readonly noteCountText: string;
    readonly medianNEff: string;
    readonly claim: ClaimLevel;
  };
}) {
  const params = useSearchParams();
  const addr = (params.get("addr") ?? "").trim();
  const kind = addr === "" ? "unknown" : searchKind(addr);
  const shielded = kind === "shielded";

  if (addr === "") {
    return (
      <p className="note" style={{ marginTop: 10 }}>
        No address given. Paste a <b>zs1</b>, <b>u1</b> or <b>zc</b> address into the field on <Link href="/track">Track</Link>{" "}
        and it arrives here, where this pane says what the chain contains about it - which is nothing. If you did give one and
        this line is still showing, this part of the page needs JavaScript to read the address out of the URL; everything else
        on it does not.
      </p>
    );
  }

  return (
    <>
      <div className="tk-addr" style={{ fontSize: 13 }} data-ui="mode-b-address">
        {addr}
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        {shielded ? (
          <>
            This address has shielded receivers.{" "}
            <b style={{ color: "var(--ink)" }}>None of them is ever written to the chain.</b> There is no balance to
            approximate, no history to list, and no heuristic that starts from an address. <Pill kind="undefined" />
          </>
        ) : (
          <>
            That is not a shielded address. This pane exists for <b>zs1</b>, <b>u1</b> and <b>zc</b> receivers; a transparent
            address has a real balance and a real history, and it belongs on the address view instead.{" "}
            <Link href={`/address/${addr}`}>Open it there</Link>.
          </>
        )}
      </p>

      {shielded ? (
        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            <b>what the explorer offers instead</b>
          </div>
          <KV
            entries={[
              {
                // COUNTS, never a value. Every figure here is a property of the
                // POOL and would read identically for any other shielded
                // address, which is why it is safe to show and why it is not an
                // answer about this one. It is also why there is no ZEC amount
                // anywhere in this pane, which is what assertion A5 checks from
                // outside.
                k: "pool context",
                // The claim level comes through `CLAIM_TEXT`, the same lookup
                // the estimate chips use, and the level itself is computed by
                // `claimLevelFor` in the fixture. A gate round found the word
                // "broad" written here by hand while the median N_eff of 1,240
                // is above 1,000, which is `aggregate only` - an over-claim in
                // the unsafe direction on the one page arguing that a shielded
                // spend is not resolvable.
                v: `${context.pool} tree: ${context.noteCountText} notes - median N_eff for a spend now ${context.medianNEff} - claim level ${CLAIM_TEXT[context.claim]}`,
              },
              // The last two rows are LINKS, and that is not decoration. The
              // fog over this pane thins on `:hover` and `:focus-within`, and
              // a gate round found the shielded branch contained no focusable
              // descendant at all - so `:focus-within` could never fire and a
              // keyboard-only or touch reader had no way to lift it. These are
              // the two routes the pane is telling the reader to take anyway.
              {
                k: "trace from a transaction",
                v: (
                  <>
                    <Link href="/track">paste a txid you know</Link> - public fields, then bounds
                  </>
                ),
              },
              { k: "trace from a transparent counterparty", v: "paste a t-address - its boundary events are exact" },
              {
                k: "exact answer",
                v: (
                  <>
                    <a href="#mode-a">paste the viewing key into mode A</a> - decrypted here, never uploaded
                  </>
                ),
              },
            ]}
          />
          <p className="note" style={{ marginTop: 12, fontSize: 12 }}>
            Every figure in that first row is a property of the Ironwood pool and would read identically for any other
            shielded address on the chain. That is what makes it publishable, and what makes it not an answer about this one.
          </p>
        </div>
      ) : null}
    </>
  );
}
