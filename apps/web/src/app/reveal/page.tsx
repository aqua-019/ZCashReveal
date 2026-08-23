import type { Metadata } from "next";
import Link from "next/link";

import { RevealKey } from "@/components/track/RevealKey";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/lib/api";
import { fmtCount, fmtInt, fmtPct, zatToZecGrouped } from "@/lib/format";

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
export default async function RevealPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = params["addr"];
  const addr = typeof raw === "string" ? raw.trim() : "";
  const zec = api();
  const kind = addr === "" ? "unknown" : zec.searchKind(addr);
  const shielded = kind === "shielded";
  const pools = await zec.getPools();

  const ironwood = pools.balances.find((b) => b.pool === "ironwood");

  return (
    <>
      <TrackHead
        title="The fog is the"
        accent="resting state"
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

          {addr === "" ? (
            <p className="note" style={{ marginTop: 10 }}>
              No address given. Paste a <b>zs1</b>, <b>u1</b> or <b>zc</b> address into the field on{" "}
              <Link href="/track">Track</Link> and it arrives here, where this pane says what the chain contains about it -
              which is nothing.
            </p>
          ) : (
            <>
              <div className="tk-addr" style={{ fontSize: 13 }} data-ui="mode-b-address">
                {addr}
              </div>
              <p className="note" style={{ marginTop: 10 }}>
                {shielded ? (
                  <>
                    This address has shielded receivers. <b style={{ color: "var(--ink)" }}>None of them is ever written to the chain.</b>{" "}
                    There is no balance to approximate, no history to list, and no heuristic that starts from an address.{" "}
                    <Pill kind="undefined" />
                  </>
                ) : (
                  <>
                    That is not a shielded address. This pane exists for <b>zs1</b>, <b>u1</b> and <b>zc</b> receivers; a
                    transparent address has a real balance and a real history, and it belongs on the address view instead.{" "}
                    <Link href={`/address/${addr}`}>Open it there</Link>.
                  </>
                )}
              </p>
            </>
          )}

          {shielded ? (
            <div style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                <b>what the explorer offers instead</b>
              </div>
              <KV
                entries={[
                  {
                    // COUNTS, never a value. Every figure here is a property of
                    // the POOL and would read identically for any other
                    // shielded address, which is why it is safe to show and why
                    // it is not an answer about this one. It is also why there
                    // is no ZEC amount anywhere in this pane, which is what
                    // assertion A5 checks from outside.
                    k: "pool context",
                    v: `${pools.context.pool} tree: ${fmtCount(pools.context.noteCount)} notes - median N_eff for a spend now ${fmtInt(pools.context.medianNEff)} - claim level broad`,
                  },
                  { k: "trace from a transaction", v: "paste a txid you know - public fields, then bounds" },
                  { k: "trace from a transparent counterparty", v: "paste a t-address - its boundary events are exact" },
                  { k: "exact answer", v: "paste the viewing key into mode A - decrypted here, never uploaded" },
                ]}
              />
              <p className="note" style={{ marginTop: 12, fontSize: 12 }}>
                Every figure in that first row is a property of the Ironwood pool and would read identically for any other
                shielded address on the chain. That is what makes it publishable, and what makes it not an answer about this
                one.
              </p>
            </div>
          ) : null}
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
