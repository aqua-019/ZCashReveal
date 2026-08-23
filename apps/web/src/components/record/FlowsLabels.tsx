import {
  getLabels,
  LABELLER_PRECEDENCE,
  type AddressLabel,
  type Labeller,
} from "@zcashreveal/content";

import { groupZec, shortAddress } from "@/components/record/FlowsAmount";
import { FlowsClaim } from "@/components/record/FlowsClaim";
import { Chip } from "@/components/ui/Chip";
import { Conf } from "@/components/ui/Conf";
import { DataTable } from "@/components/ui/DataTable";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";

/**
 * The label registry, the rich list, and the refusal that sits between them.
 *
 * This is the most dangerous material on the site, and the rules it is built to
 * are not stylistic. An address label is somebody else's attribution: the
 * schema stores who applied it (`labeller`, one of the five precedence tiers)
 * and how they arrived at it (`method`), and CLAUDE.md requires both to be
 * displayed. The registry table below therefore prints every `method` in full,
 * unabridged and unexpanded - no disclosure, no truncation, no tooltip. It is
 * the longest column on the page and that is correct, because the method is the
 * only thing standing between a label and an identity claim.
 *
 * Precedence is the exported `LABELLER_PRECEDENCE`, not a local ordering: the
 * block's contract is that the tier is printed on every row, and a page that
 * invented its own order would be printing a different claim from the one the
 * corpus makes.
 *
 * The rich list is the counterpart. Nine of the largest transparent balances on
 * the chain, and not one of them is attributed by any public labeller - which
 * is the finding. Two of them sit near two disclosed institutional positions,
 * and the box that refuses that inference is rendered beside the table rather
 * than beneath it, because a warning a reader reaches after they have already
 * drawn the conclusion is not a warning.
 */

const POOL = "shielded pool";

/** How the five tiers read to a reader; the schema's values are hyphenated codes. */
const TIER_LABEL: Record<Labeller, string> = {
  consensus: "consensus",
  "owner-filing": "owner filing",
  exchange: "exchange confirmation",
  analyst: "analyst",
  behaviour: "behaviour",
};

/** Strongest labeller first. The loader's own docstring promises this order; this enforces it. */
export function orderedLabels(): readonly AddressLabel[] {
  return [...getLabels()].sort(
    (a, b) => LABELLER_PRECEDENCE.indexOf(a.labeller) - LABELLER_PRECEDENCE.indexOf(b.labeller),
  );
}

function labelIndex(): ReadonlyMap<string, AddressLabel> {
  return new Map(getLabels().map((l) => [l.address, l]));
}

function rank(labeller: Labeller): string {
  return `${LABELLER_PRECEDENCE.indexOf(labeller) + 1} of ${LABELLER_PRECEDENCE.length}`;
}

/**
 * One end of a transfer, as the transfers table renders it.
 *
 * `CaseStep.from` and `.to` are free strings carrying either an address, the
 * literal "shielded pool", or a phrase such as "roughly twenty small addresses".
 * Where the string is an address the registry knows, the cell prints the label,
 * the tier that applied it, that label's own confidence, and a link to the row
 * in the registry below where the full method is printed. Where the registry
 * does not know it, the cell prints the address and says so - "no label from
 * any source" is a finding, not a gap.
 */
export function FlowsEnd({ value }: { readonly value: string }) {
  if (value === POOL) {
    return (
      <>
        <span className="fl-addr">shielded pool</span>
        <span className="fl-attrib">
          no address exists on this side of the transaction; the pool is not an owner
        </span>
      </>
    );
  }

  const label = labelIndex().get(value);
  if (label === undefined) {
    // Either a phrase the corpus states ("roughly twenty small addresses") or an
    // address no labeller has touched. Neither is an identity.
    const isAddress = /^t[123][1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
    return (
      <>
        <span className="fl-addr">{value}</span>
        <span className="fl-attrib">
          {isAddress ? "no label from any source; do not name an owner" : "as the corpus states it"}
        </span>
      </>
    );
  }

  return (
    <>
      <a className="fl-addr" href={`/flows#${label.id}`}>
        {shortAddress(label.address)}
      </a>
      <span className="cp">
        <Pill kind="label" /> {label.label}
      </span>
      <span className="fl-attrib">
        applied by {TIER_LABEL[label.labeller]}, precedence {rank(label.labeller)} · this label&apos;s own
        confidence <Conf level={label.confidence} /> · method printed in full at {label.id}
      </span>
    </>
  );
}

/** The registry itself. Every method, in full, next to the label it justifies. */
export function FlowsLabelsTable() {
  const labels = orderedLabels();
  return (
    <>
      <p className="note measure">
        Eight addresses carry a label. One of them is labelled by the consensus rules themselves; the rest are labelled by
        an analyst or by their own behaviour, and every one of those is <b>somebody else&apos;s attribution</b>. The
        precedence order is <b>consensus, owner filing, exchange confirmation, analyst, behaviour</b>, and it is printed on
        every row with the method that produced the label. No row on this table asserts who owns an address.
      </p>
      <div className="fl-gap-m">
        <DataTable
          caption="Labelled and candidate addresses, strongest labeller first"
          columns={[
            {
              key: "address",
              head: "Address",
              mono: true,
              cell: (l: AddressLabel) => (
                <>
                  <span className="fl-addr" id={l.id}>
                    {l.address}
                  </span>
                  <span className="fl-attrib">
                    {l.network === "testnet" ? "testnet" : "mainnet"} · {l.id}
                  </span>
                </>
              ),
            },
            {
              key: "label",
              head: "Label",
              cell: (l: AddressLabel) => (
                <>
                  <Pill kind="label" /> <span className="cp">{l.label}</span>
                </>
              ),
            },
            {
              key: "labeller",
              head: "Labeller and method",
              cell: (l: AddressLabel) => (
                <>
                  {l.labeller === "consensus" ? (
                    <Chip tone="gold">
                      {TIER_LABEL[l.labeller]} · precedence {rank(l.labeller)}
                    </Chip>
                  ) : (
                    <Chip>
                      {TIER_LABEL[l.labeller]} · precedence {rank(l.labeller)}
                    </Chip>
                  )}
                  <span className="cp fl-gap-s">{l.method}</span>
                </>
              ),
            },
            {
              key: "profile",
              head: "On-chain profile and balance",
              cell: (l: AddressLabel) => (
                <>
                  <span className="fl-addr">
                    {l.balanceZec === null ? (
                      <>
                        <Pill kind="undefined" /> no balance stated
                      </>
                    ) : (
                      <>
                        <Pill kind="exact" /> {groupZec(l.balanceZec)} ZEC
                      </>
                    )}
                  </span>
                  {l.notes === undefined ? null : <span className="cp">{l.notes}</span>}
                  <span className="fl-attrib">balance as at {l.lastVerified}</span>
                </>
              ),
            },
            {
              key: "confidence",
              head: "Confidence",
              cell: (l: AddressLabel) => (
                <FlowsClaim
                  id={l.id}
                  confidence={l.confidence}
                  lastVerified={l.lastVerified}
                  sources={l.sources}
                />
              ),
            },
          ]}
          rows={labels}
          rowKey={(l) => l.id}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The rich list                                                              */
/* -------------------------------------------------------------------------- */

interface RichRow {
  readonly rank: string;
  readonly address: string;
  readonly zec: string;
  readonly kind: string;
  readonly read: string;
}

/**
 * The live Blockchair rich list as the research pass read it on 22 August 2026.
 * There is no rich-list collection in `packages/content` - `labels.json` holds
 * eight addresses and six of these nine are not among them - so these rows are
 * page-local and carry the `unbound` chip. Every figure is the research's own;
 * nothing here has been recomputed.
 */
const RICH_LIST: readonly RichRow[] = [
  {
    rank: "1",
    address: "t3aPMe94jMKyrgkbH5SSukimvdMFJ59EFhP",
    zec: "438920.90",
    kind: "P2SH",
    read: "Active 2023-04 to 2026-08; 100 outputs, 1,319,834 ZEC received. Large, long-lived, multisig-shaped. No public label.",
  },
  {
    rank: "2",
    address: "t1gsBrGZGMyDGZw2icGnMpVBuEGVWip5kH8",
    zec: "400001.01",
    kind: "P2PKH",
    read: "4,650,001 ZEC lifetime across only 20 outputs - very large round-number movements. First seen 2025-11-13. No public label.",
  },
  {
    rank: "3",
    address: "t1cpC3SS8okUsMQwTqWgzyA1k237B3WCeco",
    zec: "386846.32",
    kind: "P2PKH",
    read: "Steady accumulation since 2026-02-09; 107 outputs; still receiving, last 2026-08-13. No public label.",
  },
  {
    rank: "4",
    address: "t3hdTwzcVVGEqDdNKJTBfWvWyaFYNJv7KkA",
    zec: "341937.19",
    kind: "P2SH",
    read: "First seen 2025-10-23; 18 outputs. No public label.",
  },
  {
    rank: "5",
    address: "t1Lyq3AcqVcXkBTPHgNsDYoSyRDpugdSkE7",
    zec: "230100.45",
    kind: "P2PKH",
    read: "One single receipt, 2025-11-20, never spent. Pure cold storage. No public label.",
  },
  {
    rank: "6",
    address: "t1VxyLUKaK2tvj5iMRQagued6qpxPNvRkk7",
    zec: "220000.00",
    kind: "P2PKH",
    read: "Round number. No public label.",
  },
  {
    rank: "7",
    address: "t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V",
    zec: "202076.21",
    kind: "P2PKH",
    read: "The 2 January 2026 unshielding destination. No public label.",
  },
  {
    rank: "8 to 23",
    address: "not enumerated by the research pass",
    zec: "",
    kind: "",
    read: "Sixteen addresses the research did not read individually. The gap is printed rather than closed.",
  },
  {
    rank: "24",
    address: "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
    zec: "78183.41",
    kind: "P2SH",
    read: "The ZIP 271 lockbox - the only spec-identified address in the top 25.",
  },
  {
    rank: "25",
    address: "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ",
    zec: "74881.26",
    kind: "P2PKH",
    read: "The hot wallet Lookonchain labels Binance. That label is an analyst's, and it is set out in the registry above.",
  },
];

export function FlowsRichList() {
  return (
    <div>
      <DataTable
        caption="Largest transparent holders, Blockchair rich list read 22 August 2026, all unattributed"
        columns={[
          { key: "rank", head: "#", mono: true, cell: (r: RichRow) => r.rank },
          {
            key: "address",
            head: "Address",
            mono: true,
            cell: (r: RichRow) => <span className="fl-addr">{r.address}</span>,
          },
          {
            key: "zec",
            head: "ZEC",
            mono: true,
            cell: (r: RichRow) =>
              r.zec === "" ? <Pill kind="undefined" /> : (
                <>
                  <Pill kind="exact" /> {groupZec(r.zec)}
                </>
              ),
          },
          { key: "kind", head: "Script", mono: true, cell: (r: RichRow) => r.kind },
          {
            key: "read",
            head: "Behavioural read, inference only",
            cell: (r: RichRow) => <span className="cp">{r.read}</span>,
          },
        ]}
        rows={RICH_LIST}
        rowKey={(r) => r.rank}
      />
      <p className="note fl-gap-s" id="R-richlist">
        A large balance is <b>not evidence of anything</b>. It is not evidence of an exchange, a custodian, a fund, an
        insider or a seller. Nine-figure ZEC positions sit in addresses that no public labeller has attributed, and the
        research names that as the single largest attribution gap in Zcash. The column above is headed{" "}
        <b>inference only</b> because that is exactly what it is: script type, first-seen date and output count, from
        which no owner follows.
      </p>
      <FlowsClaim
        id="R-richlist"
        href="/flows#R-richlist"
        confidence="high"
        lastVerified="2026-08-22"
        sources={["S-blockchair-api-zcash-addresses", "S-blockchair-api-address-addr"]}
        unbound
      />
    </div>
  );
}

/**
 * The refusal that belongs beside the rich list.
 *
 * Two of the nine balances sit near two disclosed institutional positions. The
 * near-match and the reason it proves nothing are rendered together; publishing
 * the first without the second would be the exact failure this page exists to
 * document.
 */
export function FlowsFalseInference() {
  return (
    <div className="fl-warn" id="R-false-inference">
      <Eyebrow idx="a tempting false inference, pre-empted">rank 3 and rank 4 above</Eyebrow>
      <p className="note fl-gap-s">
        Entry #3 (386,846.32 ZEC) sits close to Grayscale Zcash Trust&apos;s disclosed 388,673.68 ZEC, and entry #4
        (341,937.19) is in the neighbourhood of Cypherpunk&apos;s 323,394.38. <b>These proximities are not evidence.</b>{" "}
        Neither figure matches. More importantly, both Coinbase Custody and Gemini run omnibus wallets that commingle
        client assets, so there is <b>no reason to expect any single address to equal any single client&apos;s balance</b>,
        and every reason to expect it not to. <b>Do not publish these as identifications.</b> They appear here only so the
        page can pre-empt the inference when a reader raises it.
      </p>
      <FlowsClaim
        id="R-false-inference"
        href="/flows#R-false-inference"
        confidence="high"
        lastVerified="2026-08-22"
        sources={[
          "S-blockchair-api-zcash-addresses",
          "S-sec-edgar-000172026526000006-zcsh-20260630",
          "S-stocktitan-cyph-10-q-cypherpunk-technologies-inc",
        ]}
        unbound
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* What labelling infrastructure exists at all                                */
/* -------------------------------------------------------------------------- */

/**
 * The survey of every public ZEC labelling source the research could reach.
 * Rendered because the answer is nearly empty: one vendor labels ZEC entities
 * at all, its pages are gated, and the most-cited free rich list is materially
 * wrong. The CoinCarp figures below appear here and nowhere else on the site -
 * they are the evidence that the source is broken, not data.
 */
const INFRASTRUCTURE: readonly { readonly k: string; readonly v: string }[] = [
  { k: "Blockchair", v: "Rich list live and accurate. No entity labels: ZEC address objects carry no tag field." },
  {
    k: "CoinCarp",
    v: "Rich list present, every row \"None listed\". Badly stale: it lists one address at 1,414,573 ZEC against a live balance of 160,205.10, and its rows 2 and 3 are zero on-chain.",
  },
  {
    k: "CoinCarp exchange wallets",
    v: "Purports to label exchanges. The table is empty and the asset is BEP20-wrapped ZEC on BNB Chain, not native Zcash. Not usable.",
  },
  { k: "BitInfoCharts", v: "Rich list present, no labels surfaced. The table did not render for extraction." },
  {
    k: "CipherScan",
    v: "Privacy score, risk scanner, blend check and shielded-pool analytics. A rich-list feature exists but the route returns 404. Entity labels not evidenced.",
  },
  { k: "ZEC Stats", v: "Strong network and pool data. Explicitly no exchange reserves and no entity labels." },
  {
    k: "Arkham",
    v: "The only meaningful ZEC labeller. Public pages render through JavaScript only and the entity list is not extractable without an account.",
  },
  { k: "Whale Alert", v: "Zcash is not in the published supported-chain list." },
];

export function FlowsLabellingInfrastructure() {
  return (
    <Glass className="fl-stack" id="R-labelling">
      <Eyebrow idx="what labelling infrastructure exists for zcash">surveyed 22 August 2026</Eyebrow>
      <div className="fl-kv-prose">
        <KV stack entries={INFRASTRUCTURE.map((row) => ({ k: row.k, v: row.v }))} />
      </div>
      <p className="note">
        One vendor labels Zcash entities at all, and its pages are gated. That is the whole of the public labelling
        infrastructure for this chain, and it is why every attribution on this page names the party who made it.
      </p>
      <FlowsClaim
        id="R-labelling"
        href="/flows#R-labelling"
        confidence="high"
        lastVerified="2026-08-22"
        sources={[
          "S-blockchair-api-address-addr",
          "S-coincarp-zcash-richlist",
          "S-coincarp-zcash-exchange-wallets",
          "S-bitinfocharts-top-100-richest-zcash-addresses",
          "S-cipherscan-cipherscan-app",
          "S-zec-stats-zecstats-com",
          "S-intel-arkm-com-token-zcash",
          "S-whale-alert-faq",
        ]}
        unbound
      />
    </Glass>
  );
}
