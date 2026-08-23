import type { ReactNode } from "react";

/**
 * Mode A: the viewing-key ceremony, and the only route by which a shielded
 * balance ever appears on this site.
 *
 * The grid has four panes and the fourth is not a footnote. Three of them say
 * what a key reveals; the fourth says what nothing reveals, and it is the same
 * size and sits in the same row, because it is the condition on which the other
 * three are allowed to exist. A key that left the browser would turn this site
 * into a custodian of the one secret Zcash exists to keep.
 *
 * DISAMBIGUATION. "Ceremony" here is the interaction ritual for a reader who
 * supplies their own key. It is not the Zcash trusted-setup ceremony, which is
 * a different thing entirely and lives on /beware#B14 and /contradictions#C3.
 *
 * SHIPPING STATE. `packages/wasm-keys` is Phase 4 work. Until it lands, /reveal
 * is the ceremony interface with the gate closed, and this block says so rather
 * than describing a capability the site does not yet have. What it describes is
 * the design, and the design's constraints are what make it publishable at all.
 *
 * PROVENANCE: docs/2.0/TRACKING-MATH.md section 5, and
 * docs/2.0/ZECREVEAL-2.0-PLAN.md section 9 for the shipping state.
 */

interface Pane {
  readonly label: string;
  readonly kind: "yes" | "no";
  readonly body: ReactNode;
}

const PANES: readonly Pane[] = [
  {
    label: "accepts",
    kind: "yes",
    body: (
      <>
        A UFVK, a Sapling FVK or an IVK - and for Sprout, a viewing key. Parsed in the browser by a WASM build of{" "}
        <span className="mono">zcash_keys</span> and <span className="mono">zcash_note_encryption</span>.
      </>
    ),
  },
  {
    label: "IVK",
    kind: "yes",
    body: <>Every received note: value, memo, txid, height.</>,
  },
  {
    label: "FVK",
    kind: "yes",
    body: (
      <>
        Adds <span className="mono">nk</span>, so the nullifiers of received notes are derivable, so spent and unspent are
        separable, so the balance is exact. An OVK decrypts <span className="mono">out_ciphertext</span> and adds the
        recipients and values of the key-holder&apos;s own outgoing transfers.
      </>
    ),
  },
  {
    label: "never",
    kind: "no",
    body: (
      <>
        The key never leaves the browser. Results are never stored. Senders are not in the note and are not revealed by any
        key - that limit is the circuit&apos;s, not this interface&apos;s, and no key on this list removes it.
      </>
    ),
  },
];

export function MethodCeremony() {
  return (
    <>
      <div className="mt-ceremony">
        {PANES.map((p) => (
          <div key={p.label} className={`mt-cell ${p.kind === "yes" ? "mt-yes" : "mt-no"}`}>
            <b>{p.label}</b>
            {p.body}
          </div>
        ))}
      </div>

      <p className="note measure" style={{ marginTop: 12 }}>
        The page fetches compact blocks and outputs from the gateway and decrypts locally; results are labelled{" "}
        <span className="mono">exact - decrypted locally</span>. The interface is a ceremony in the design-system sense
        (DGIGA D3642): the fog parts pane by pane while the page states, at each pane, what the key does and does not
        reveal. Mode B - the whole of the rest of this site - never shows a shielded balance at all.
      </p>

      <div className="refuses" style={{ marginTop: 10 }}>
        <b>not yet shipped</b>
        <span>
          The WASM key package is Phase 4 work and <span className="mono">/reveal</span> currently renders the ceremony with
          the gate closed. What is described above is a design and its constraints, not a running feature, and this page
          would rather say so than imply otherwise.
        </span>
      </div>
    </>
  );
}
