import {
  LABELLER_PRECEDENCE,
  getCase,
  getLabels,
  requirePermalink,
  resolveSources,
  type AddressLabel,
  type Labeller,
} from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { Chip } from "@/components/ui/Chip";
import { Conf } from "@/components/ui/Conf";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";

/**
 * The transparent side: exact arithmetic, then four heuristics over it.
 *
 * Nothing in this block is novel. It is the Bitcoin clustering toolkit applied
 * unchanged, and the only reason it is on the page is that a reader has to be
 * able to see where the deterministic part stops. Balance and history are
 * arithmetic. Common-input ownership, change detection and the exchange shape
 * are behavioural priors with named failure modes, and each card states its own.
 *
 * The two cards that touch real addresses bind to `packages/content` rather
 * than restating figures: the lockbox multisig and the hot wallet are both in
 * `labels.json` with their own labeller, method, confidence and sources, and
 * the withdrawal arithmetic is in `cases.json` inside the step that records it.
 * Rendering the corpus's own confidence rather than the mockup's parenthetical
 * matters here - the mockup calls the exchange reading "high" and the label
 * record grades the labeller `analyst` at `med`, and those are claims about
 * different things.
 *
 * PROVENANCE: docs/2.0/TRACKING-MATH.md sections 1.1 to 1.5.
 */

/** The precedence tiers, as the reader reads them rather than as the enum spells them. */
const LABELLER_LABEL: Record<Labeller, string> = {
  consensus: "consensus",
  "owner-filing": "owner filing",
  exchange: "exchange confirmation",
  analyst: "analyst",
  behaviour: "behaviour",
};

/** The claim apparatus for one address label: its tier, its confidence, its sources. */
function LabelClaim({ label }: { readonly label: AddressLabel }) {
  return (
    <span className="claim">
      <a className="anchor" href={requirePermalink(label.id)}>
        {label.id.slice(0, 10)}...
      </a>
      <Chip>{LABELLER_LABEL[label.labeller]}</Chip>
      <Conf level={label.confidence} />
      <Cite
        id={label.id}
        lastVerified={label.lastVerified}
        confidence={label.confidence}
        sources={resolveSources(label.sources)}
      />
    </span>
  );
}

export function MethodClustering() {
  const labels = getLabels();
  const lockbox = labels.find((l) => l.id === "L-t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo");
  const hotWallet = labels.find((l) => l.id === "L-t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ");

  // The withdrawal arithmetic is not authored here. It is the note the corpus
  // attached to the step that records the transaction, and it is quoted.
  const janCase = getCase("K-2026-01-02");
  const withdrawal = janCase?.steps.find(
    (s) => s.txid === "f45ded5d44452c405d92e66d69d760a5a7d01f94aab937b96ecd1f666edb4712",
  );

  // How many labels sit at each tier, counted rather than asserted. The shape of
  // this count is itself the argument for printing the tier: almost nothing on
  // this site is labelled by consensus, and a reader should see that.
  const perTier = new Map<Labeller, number>();
  for (const l of labels) perTier.set(l.labeller, (perTier.get(l.labeller) ?? 0) + 1);

  return (
    <>
      <div className="grid g2">
        <Glass>
          <Eyebrow className="mt-card-eyebrow" idx="1.1 balance and history">
            arithmetic, not inference
          </Eyebrow>
          <p className="note">
            <span className="mono">bal(a) = sum over u in UTXO(a) of v(u)</span>. History is every transaction with an input
            or output script paying <i>a</i>; counterparties are the other scripts in those transactions. Fees are{" "}
            <span className="mono">sum in - sum out - valueBalance terms</span>, and where a transaction has shielded
            components the fee is split across pools, so the page shows the ZIP 317 conventional fee and the implied
            logical-action count <span className="mono">L = fee / 5000</span>.
          </p>
          <div className="refuses">
            <b>refuses</b>
            <span>
              Exact on the transparent side and silent about the other one. <span className="mono">L</span> tells you how
              many logical actions a transaction had; it tells you nothing about what they moved or to whom.
            </span>
          </div>
        </Glass>

        <Glass>
          <Eyebrow className="mt-card-eyebrow" idx="1.2 common-input ownership">
            union-find over input scripts
          </Eyebrow>
          <p className="note">
            All transparent inputs of one transaction are spent by one key-holder, so union-find over the input scripts
            yields clusters <span className="mono">C(a)</span>. Two exceptions are flagged rather than assumed away:
            coinjoin-like shapes, rare on Zcash, and P2SH multisig.
          </p>
          <div className="refuses">
            <b>refuses</b>
            <span>
              A multisig cluster is a cluster of <i>signers</i>, not one owner. The ZIP 271 lockbox is the named instance: a
              2-of-3 held by three separate organisations, and treating it as a single entity would be wrong about the one
              address on this chain whose holders are defined by consensus code.
            </span>
          </div>
          {lockbox === undefined ? null : (
            <>
              <p className="note" style={{ marginTop: 10 }}>
                <span className="mono">{lockbox.address}</span> - {lockbox.label}
              </p>
              <LabelClaim label={lockbox} />
            </>
          )}
        </Glass>

        <Glass>
          <Eyebrow className="mt-card-eyebrow" idx="1.3 change detection">
            soft membership, weighted
          </Eyebrow>
          <p className="note">
            In a two-output transparent transaction where one output pays a never-seen address of the same script type and
            the other is a round amount or a reused address, the fresh one is change with probability{" "}
            <span className="mono">p_change</span>. Change outputs extend the cluster with weight{" "}
            <span className="mono">p_change</span>.
          </p>
          <div className="refuses">
            <b>refuses</b>
            <span>
              Soft membership, never fact. And this site does not print a value for{" "}
              <span className="mono">p_change</span>: the Bitcoin literature gives 0.8 to 0.9, that figure is not
              transferable to Zcash without measuring it, and the Zcash calibration has not been run. Until it has, the
              parameter is named and its value is not.
            </span>
          </div>
        </Glass>

        <Glass>
          <Eyebrow className="mt-card-eyebrow" idx="1.4 exchange-withdrawal shape">
            behavioural, and only behavioural
          </Eyebrow>
          <p className="note">
            One large input paying out once with the change returning to the <i>same</i> address, and many-to-one deposit
            sweeps, are behavioural exchange signatures.
            {withdrawal === undefined ? null : (
              <>
                {" "}
                The corpus records one on {withdrawal.time.slice(0, 10)}: &ldquo;{withdrawal.note}&rdquo;
              </>
            )}
          </p>
          <div className="refuses">
            <b>refuses</b>
            <span>
              The shape supports &ldquo;exchange hot wallet&rdquo;. It does not support <i>which</i> exchange - that needs a
              confirmation or a vendor label, and the label&apos;s provenance is printed either way. The record below is
              graded by its labeller and its confidence, not by how convincing the shape is.
            </span>
          </div>
          {hotWallet === undefined ? null : (
            <>
              <p className="note" style={{ marginTop: 10 }}>
                <span className="mono">{hotWallet.address}</span> - {hotWallet.label}
              </p>
              <LabelClaim label={hotWallet} />
            </>
          )}
          {janCase === undefined ? null : (
            <span className="claim">
              <a className="anchor" href={requirePermalink(janCase.id)}>
                {janCase.id}
              </a>
              <Cite
                id={janCase.id}
                lastVerified={janCase.lastVerified}
                confidence={janCase.confidence}
                sources={resolveSources(janCase.sources)}
              />
            </span>
          )}
        </Glass>
      </div>

      <Glass className="mt-precedence">
        <Eyebrow className="mt-card-eyebrow" idx="1.5 consensus labels, and the precedence that ranks every other kind">
          always displayed
        </Eyebrow>
        <p className="note">
          The only labels carrying certainty are the ones consensus defines: the ZIP 271 lockbox multisig, the ZIP 1014,
          1015 and 1016 funding-stream recipients enumerated in consensus code per height, the historic Founders&apos;
          Reward addresses from the original chainparams, and TEX receivers under ZIP 320, which accept transparent sources
          only and are therefore an exchange-deposit tell. Everything else is ranked:
        </p>
        <ol className="mt-precedence-chain">
          {LABELLER_PRECEDENCE.map((l, i) => (
            <li key={l}>
              <span className="mt-rank">{i + 1}</span>
              <span className="mt-tier">{LABELLER_LABEL[l]}</span>
              <span className="src">
                {perTier.get(l) ?? 0} of {labels.length} labels in this corpus
              </span>
            </li>
          ))}
        </ol>
        <div className="refuses">
          <b>refuses</b>
          <span>
            The order is not this page&apos;s to choose - it is <span className="mono">LABELLER_PRECEDENCE</span> in{" "}
            <span className="mono">packages/content/src/schema.ts</span>, exported so that a page cannot invent its own. A
            tier is displayed with every label and never implied by position in a list, and a consensus label on a
            small-set finding still does not make that finding an identity claim: precedence and claim level are
            independent axes, and neither one licenses the other.
          </span>
        </div>
      </Glass>
    </>
  );
}
