/**
 * The chrome every Tracking surface wears: the masthead, the sub-navigation and
 * the "what a query can return" card.
 *
 * Server components. The sub-nav itself is `SubNav` from HANDOFF-01, so the
 * active-state grammar and the hover verb are the shared ones rather than a
 * second implementation of them.
 */
import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { SubNav } from "@/components/ui/SubNav";

/** The six sub-views, in the mockup's order. */
export const TRACK_VIEWS = [
  { href: "/track", label: "Search - mempool" },
  { href: "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo", label: "Address" },
  { href: "/tx/7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c", label: "Transaction" },
  { href: "/pools", label: "Pools" },
  { href: "/track/flows", label: "Flows" },
  { href: "/reveal", label: "Reveal" },
] as const;

export function TrackNav({ path }: { readonly path: string }) {
  return <SubNav label="Tracking views" path={path} items={[...TRACK_VIEWS]} />;
}

/**
 * The masthead. Every Tracking surface carries the same one, because the
 * question it answers - what can this thing honestly tell me - is the same
 * question on all six, and answering it once at the top is better than
 * qualifying every number below.
 */
export function TrackHead({ title, accent, dek }: { readonly title: string; readonly accent?: string; readonly dek: ReactNode }) {
  return (
    <div className="record-head" style={{ paddingBottom: 0 }}>
      <div>
        <Eyebrow idx="04">TRACKING - explorer, mempool, pools, flows</Eyebrow>
        <h1 style={{ marginTop: 14 }}>
          {title}
          {accent === undefined ? null : (
            <>
              {" "}
              <em>{accent}</em>
            </>
          )}
        </h1>
        <div className="dek">{dek}</div>
      </div>
      <Glass>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          <b>what a query can return</b>
        </div>
        <KV
          entries={[
            {
              k: "t-address",
              v: (
                <>
                  <Pill kind="exact" /> balance, history, counterparties, boundary events
                </>
              ),
            },
            {
              k: "z or unified address",
              v: (
                <>
                  <Pill kind="undefined" /> not on chain - <Pill kind="exact" /> with your viewing key
                </>
              ),
            },
            {
              k: "txid",
              v: (
                <>
                  <Pill kind="exact">public fields</Pill> <Pill kind="bounded">candidate sets, N_eff, links</Pill>
                </>
              ),
            },
            { k: "labels", v: "consensus > owner filing > exchange > analyst > behaviour" },
          ]}
        />
      </Glass>
    </div>
  );
}

/**
 * The stated gap.
 *
 * Fixture mode answers for one address, one transaction and one block. Anything
 * else gets this rather than a 404, because a 404 says "no such thing" and the
 * true statement is "the chain has this and this build does not". HANDOFF-01
 * made the same argument for `Pending` and the ledger records it; the same
 * argument holds one layer down.
 */
export function StatedGap({ what, query, children }: { readonly what: string; readonly query: string; readonly children: ReactNode }) {
  return (
    <div className="tk-gap" data-ui="stated-gap">
      <div className="eyebrow">
        <b>not in the fixture corpus</b> - the chain has this; this build does not
      </div>
      <p className="q">{query}</p>
      <p className="note" style={{ maxWidth: "72ch" }}>
        {`This build reads committed values rather than a chain, so it can answer for the ${what} the fixture corpus carries and for nothing else. `}
        {children}
      </p>
    </div>
  );
}
