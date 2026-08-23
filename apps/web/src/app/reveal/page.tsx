import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { RevealAddress } from "@/components/track/RevealAddress";
import { RevealKey } from "@/components/track/RevealKey";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/lib/api";
import { fmtInt, fmtPct, zatToZecGrouped } from "@/lib/format";

export const metadata: Metadata = {
  title: "Reveal",
  description: "A shielded address is not an on-chain object. Mode B says so and shows the pool around it; Mode A decrypts with your own key, in your own browser.",
};

/**
 * 04 TRACKING - the viewing-key ceremony.
 *
 * TWO PANES, AND THE LEFT ONE IS THE POINT. Mode B is the resting state of a
 * shielded address: there is no balance to approximate, no history to list and
 * no heuristic that starts from an address, because the address is never
 * written to the chain at all. The pane says that and then offers what the
 * explorer CAN do instead - pool context, and a route into the two queries that
 * do have answers.
 *
 * ASSERTION A5 lives here: no route outside the Mode A pane renders a numeric
 * balance for a shielded address, and the Mode B pane below contains no ZEC
 * amount of any kind. That is not a rule this page follows carefully; it is a
 * rule it cannot break, because there is no field in `AddressView` for a
 * shielded balance and no code path from an address to one. The pool context
 * printed on the right is a property of the POOL - its note count, the median
 * claim level of a spend in it - and never of the address in the URL.
 *
 * The address arrives as a query parameter and is echoed back. That is safe and
 * deliberate: a shielded address is a destination anyone can pay, not a secret.
 * A viewing key is the opposite, and never reaches this page through a URL -
 * `TrackSearch` refuses to navigate with one, and the field in `RevealKey` is
 * not inside a form.
 */
export default async function RevealPage() {
  const pools = await api().getPools();
  const ironwood = pools.balances.find((b) => b.pool === "ironwood");

  return (
    <>
      <TrackHead
        // Short on purpose. A display-face h1 that sits near a wrap boundary
        // changes its line count when Instrument Serif swaps in, and the whole
        // page below it jumps: measured, /reveal scored cumulative layout shift
        // 0.139 and performance 92 with a five-word heading, against 0.004 and
        // 95 on /track with a three-word one, and Lighthouse attributed all of
        // the difference to the record head moving as three fonts loaded. This
        // is also the better heading: it is the page's thesis rather than a
        // decoration of it.
        title="Not on the"
        accent="chain"
        dek={
          <>
            A shielded address is never serialised onto the chain. There is no balance to look up, no history to list, and no
            heuristic that begins from one - which is not a limitation of this explorer but the property the pool exists to
            have. The only way a shielded balance appears on this site is if you hold the key and decrypt it yourself, in this
            tab, without sending it anywhere.
          </>
        }
      />

      <TrackNav path="/reveal" />

      <div className="tk-modes">
        {/* ---- Mode B ---------------------------------------------------- */}
        <div className="tk-pane fogged" data-ui="mode-b">
          <div className="eyebrow">
            <b>mode B</b> - no key - the fog is the resting state
          </div>

          {/* The address is read from the URL in the browser, so the rest of
              this page can be static - see the note at the head of
              RevealAddress. The fallback is what a no-script reader sees, and
              it is the same empty branch the island renders when the URL
              carries no address. */}
          <Suspense
            fallback={
              <p className="note" style={{ marginTop: 10 }}>
                Reading the address from the URL.
              </p>
            }
          >
            <RevealAddress
              context={{
                pool: pools.context.pool,
                noteCount: fmtInt(pools.context.noteCount),
                medianNEff: fmtInt(pools.context.medianNEff),
              }}
            />
          </Suspense>
        </div>

        {/* ---- Mode A ---------------------------------------------------- */}
        <RevealKey />
      </div>

      <Block idx="A" title="What a key does and does not open" right="TRACKING-MATH section 5">
        <Glass>
          <KV
            stack
            entries={[
              {
                k: "incoming viewing key (IVK)",
                v: "Trial-decrypts every output addressed to you: value, memo, txid, height. It derives no nullifiers, so it can tell you what you received and not what you still hold.",
              },
              {
                k: "full viewing key (FVK)",
                v: "Adds the nullifier key, so received notes can be matched against published nullifiers. Spent and unspent separate, and the balance becomes exact - the only route by which a shielded balance is ever displayed on this site.",
              },
              {
                k: "outgoing viewing key (OVK)",
                v: "Decrypts the outgoing ciphertext you wrote when you spent. It shows the recipients and values of your own outgoing transfers, which nothing else can.",
              },
              {
                k: "none of them reveal",
                v: "Who sent to you. The sender is not in the note, and no key you hold changes that.",
              },
            ]}
          />
        </Glass>
      </Block>

      <Block idx="B" title="Why the balance is undefined without one" right="not withheld - undefined">
        <Glass>
          <p className="note measure">
            The distinction matters and the site holds to it everywhere. A withheld number is one that exists and is not being
            shown. An undefined one does not exist to be shown: a shielded balance is the sum of notes whose commitments are
            in a tree and whose values are inside ciphertexts nobody but the key-holder can open. There is no server that
            knows it, no analyst who can approximate it, and no arithmetic on public data that gets closer than the whole
            pool. <Pill kind="undefined" /> is the honest pill and it is the one this page uses.
          </p>
          <p className="note measure" style={{ marginTop: 12 }}>
            The pool as a whole is a different question and does have an answer: {zatToZecGrouped(ironwood?.zat ?? 0n, 0)} ZEC
            in Ironwood at height {fmtInt(pools.atHeight)}, {fmtPct(ironwood?.share ?? 0)} of supply. Every balance on{" "}
            <Link href="/pools">the pools page</Link> is exact, because a pool&apos;s total is public even when none of its
            members is.
          </p>
        </Glass>
      </Block>
    </>
  );
}
