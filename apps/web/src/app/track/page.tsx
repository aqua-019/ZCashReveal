import type { Metadata } from "next";

import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { Pill } from "@/components/ui/Pill";
import { SearchBar } from "@/components/ui/SearchBar";
import { SubNav } from "@/components/ui/SubNav";
import { Pending } from "@/components/shell/Pending";
import { RecordHead } from "@/components/shell/RecordHead";
import { screenByHref } from "@/lib/nav";

const S = screenByHref("/track");

export const metadata: Metadata = {
  title: "Track",
  description: S?.dek ?? "",
};

/**
 * 05 TRACK - the explorer's front door.
 *
 * HANDOFF-01 ships the search affordance and the promise; HANDOFF-04 ships the
 * views behind it (/address/:addr, /tx/:txid, /pools, /reveal) in fixture mode,
 * and HANDOFF-11 puts them on live data.
 *
 * The SubNav points at /track for every view for now, because a nav item that
 * 404s is worse than one that does not move yet.
 */
export default function TrackPage() {
  return (
    <>
      <RecordHead
        idx="05"
        kicker="the explorer"
        title="Track"
        dek={
          <>
            Search the chain and get back what the chain actually says. Transparent activity resolves <b>exactly</b>. Shielded
            activity resolves to a <b>bound</b> on a candidate set, with the reasoning that produced it attached. Neither ever
            resolves to a person.
          </>
        }
      />

      <SubNav
        label="Tracking views"
        path="/track"
        items={[
          { href: "/track", label: "Search - mempool" },
          { href: "/flows", label: "Flows" },
        ]}
      />

      <SearchBar />

      <Block idx="01" title="What you can and cannot get" right="stated before you search, not after">
        <div className="cango">
          <div className="c">
            <p>
              <Pill kind="exact" />
            </p>
            <h3 className="h">Transparent</h3>
            <p>
              Balance, full history, counterparties, exact amounts, exact times. Every t-address that ever shielded or unshielded
              is a public endpoint, and both sides of that crossing are in the clear.
            </p>
          </div>
          <div className="c">
            <p>
              <Pill kind="bounded" />
            </p>
            <h3 className="h">Shielded</h3>
            <p>
              Existence, nullifiers, anchor, action counts, fees and every boundary amount, plus an upper bound on the candidate
              set for a spend. Note values and endpoints inside a z-to-z transfer stay hidden, and this site does not guess at
              them.
            </p>
          </div>
          <div className="c">
            <p>
              <Pill kind="undefined" />
            </p>
            <h3 className="h">
              <em>Identity</em>
            </h3>
            <p>
              Never. Not from clustering, not from timing, not from amount matching. A label is displayed only with its
              provenance rank, and a behavioural guess is displayed as a heuristic, not as a name.
            </p>
          </div>
        </div>
      </Block>

      <Block idx="02" title="Your own keys, in your own browser" right="Mode A - 2.1">
        <Glass>
          <p className="note">
            A viewing key you hold decrypts your own notes. When that ships, the decryption runs entirely in the browser: the key
            is never transmitted, never logged and never stored server-side, and no shielded balance is rendered without one.
            Until then /reveal is the ceremony UI with the gate closed.
          </p>
        </Glass>
      </Block>

      <Block idx="03" title="The views" right="scheduled">
        <Pending handoff="HANDOFF-04 / 05 / 11" title="Address, transaction, pools, flows and reveal">
          The high-fidelity mempool table, the address view with its balance step chart and interaction graph, the transaction
          view with its inference chain, the four-pool Sankey and the migration lens all arrive in fixture mode with HANDOFF-04,
          served by the REST API from HANDOFF-05, and go live at the HANDOFF-11 cutover.
        </Pending>
      </Block>
    </>
  );
}
