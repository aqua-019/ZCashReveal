import {
  getUnverified,
  type Confidence,
  type SourceRef,
  type Unverified,
} from "@zcashreveal/content";

import { FlowsClaim } from "@/components/record/FlowsClaim";

/**
 * What the research examined and declined to substantiate.
 *
 * This is content, not omission. A page that lists what the chain shows and
 * quietly drops what was checked and could not be stood up is doing the thing
 * this site exists to argue against, so the refusals render at the same weight
 * as the findings and never without their reason attached: the reason is the
 * substance.
 *
 * Seven of the seventeen refusals the research issues are the assessment column
 * of the allegations table above and are not repeated here; the other ten are
 * refusals attached to findings rather than to allegations, and this is their
 * home. Each anchors to the finding it qualifies.
 *
 * NOTHING IN THIS FILE IS COLLAPSED, and that is a decision rather than an
 * omission. HANDOFF-04b's R4 collapses the derivation, the raw table, the
 * method walk-through and the full source list, and this page's tables and
 * ledgers went behind disclosures accordingly. These did not: the argument of
 * /flows is that the evidence does NOT support the claims in circulation, so
 * the refusals ARE the finding and a page that folds its refusals into a
 * triangle has reversed the point of the exercise. The counts below are
 * exported so the claim beat's own summary reads the same arrays these render.
 */

/** Every status in the quarantine means "not publishable as fact", so all of them read low. */
const QUARANTINE_CONFIDENCE: Confidence = "low";

interface Refusal {
  readonly key: string;
  readonly status: string;
  readonly claim: string;
  readonly why: string;
  readonly id: string;
  readonly href?: string;
  readonly confidence: Confidence;
  readonly lastVerified: string;
  readonly sources: readonly SourceRef[];
  readonly unbound?: boolean;
}

/**
 * The ten refusals the research attaches to its own findings. Each names the
 * finding it qualifies, so the reader meets the limit at the same moment as the
 * claim rather than after it.
 */
const ATTACHED: readonly Refusal[] = [
  {
    key: "owner-t1gGCYpy",
    status: "unattributed",
    claim: "That anybody in particular owns t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V, the address the largest unshielding of the cycle went to.",
    why: "No public labeller attributes it. An aggregator reportedly published a destination address for a 202,077 ZEC move and the relay did not print it. Do not name an owner. The only defensible statement is that a single entity moved this out of shielding on 2 January 2026 and has held it transparently ever since.",
    id: "L-t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-blockchain-news-flashnews-zec-zcash-whale-alert", "S-blockchair-api-address-addr"],
  },
  {
    key: "richlist-identification",
    status: "contradicted",
    claim: "That rich-list entries 3 and 4 are Grayscale and Cypherpunk, because their balances are close to the disclosed figures.",
    why: "Neither figure matches, and both Coinbase Custody and Gemini run omnibus wallets that commingle client assets. There is no reason to expect any single address to equal any single client's balance. Do not publish these as identifications.",
    id: "R-false-inference",
    href: "/flows#R-false-inference",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-blockchair-api-zcash-addresses", "S-sec-edgar-000172026526000006-zcsh-20260630"],
    unbound: true,
  },
  {
    key: "same-party",
    status: "not-verified",
    claim: "That the January 2026 unshielder and the December 2025 withdrawer are the same party.",
    why: "A medium-high inference and not provable. The shielded pool is engineered so that an output cannot be linked to an input, and a coincidental near-match is not impossible. The site publishes the alignment and refuses the identification.",
    id: "K-2026-01-02",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-blockchair-api-transaction-hash"],
  },
  {
    key: "was-sold",
    status: "not-verified",
    claim: "That the 74,001.93 ZEC which reached the exchange hot wallet was sold.",
    why: "The chain shows arrival at a hot wallet and nothing further. A deposit is not a sale, and no venue, order or counterparty is observable from public data.",
    id: "K-2026-01-02",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-blockchair-api-transaction-hash", "S-blockchain-news-flashnews-zec-whale-deposits-74"],
  },
  {
    key: "devfund-exchange",
    status: "not-verified",
    claim: "That any dev-fund coin reached any exchange.",
    why: "No dev-fund coins were traced to any exchange and, because ZIP 271 requires each chunk to be spent completely into a shielded output, they structurally cannot be. Any claim to have traced the dev fund to an exchange is false by construction. This is a design property, not a research failure.",
    id: "K-zip271-lockbox",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-zcash-improvement-proposals-zip-0271", "S-blockchair-api-transaction-hash"],
  },
  {
    key: "sponsor-fee-sold",
    status: "not-verified",
    claim: "That the ZEC withdrawn from the Grayscale Trust as the Sponsor's Fee was sold.",
    why: "Roughly 9,700 ZEC a year leaves the Trust in kind. The filings do not say whether the Sponsor then sells it, and no address is published that would let anyone check.",
    id: "R-sponsor-fee",
    href: "/flows#R-sponsor-fee",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-sec-edgar-000172026526000006-zcsh-20260630"],
    unbound: true,
  },
  {
    key: "cypherpunk-sell",
    status: "not-verified",
    claim: "That Cypherpunk Technologies intends to sell its ZEC.",
    why: "There is no statement of intent to sell, and the stated strategy is accumulation towards a target of 5 per cent of supply. That reading is an inference at medium confidence: no lock-up, covenant or public commitment prevents sales, and no ZEC-denominated production disclosure exists yet.",
    id: "R-cypherpunk",
    href: "/flows#R-cypherpunk",
    confidence: "med",
    lastVerified: "2026-08-22",
    sources: ["S-stocktitan-cyph-10-q-cypherpunk-technologies-inc", "S-crypto-news-cypherpunk-becomes-largest-zcash-min"],
    unbound: true,
  },
  {
    key: "whale-alert",
    status: "contradicted",
    claim: "That headlines reading \"ZEC Whale Alert\" are Whale Alert output.",
    why: "Zcash does not appear in Whale Alert's published supported-chain list. The phrasing is editorial. The reporting accounts that actually cover ZEC flows are Lookonchain and EmberCN, relayed through aggregators.",
    id: "R-whale-alert",
    href: "/flows#R-whale-alert",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-whale-alert-faq"],
    unbound: true,
  },
  {
    key: "coincarp",
    status: "contradicted",
    claim: "CoinCarp's Zcash rich list.",
    why: "Materially wrong. Its first entry overstates a live balance by about 8.8 times, and its second and third rows are zero on-chain. It appears on this page only as evidence that the source is broken, and its figures are not repeated anywhere else on this site.",
    id: "R-labelling",
    href: "/flows#R-labelling",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-coincarp-zcash-richlist", "S-blockchair-api-address-addr"],
    unbound: true,
  },
  {
    key: "explorer-arithmetic",
    status: "contradicted",
    claim: "Any ZEC supply or flow figure taken from a generic multi-chain explorer.",
    why: "Blockchair's Zcash stats endpoint currently returns a negative circulation of −4,638,503.75 ZEC. Naive UTXO accounting cannot handle shielded value pools. Treat any such figure with suspicion unless it is address-level transparent data.",
    id: "R-explorer-arithmetic",
    href: "/flows#R-explorer-arithmetic",
    confidence: "high",
    lastVerified: "2026-08-22",
    sources: ["S-blockchair-api-zcash-stats"],
    unbound: true,
  },
];

function RefusalItem({ item }: { readonly item: Refusal }) {
  return (
    <li>
      <span className="st">{item.status}</span>
      <p className="cl">{item.claim}</p>
      <p className="why">{item.why}</p>
      <FlowsClaim
        id={item.id}
        {...(item.href === undefined ? {} : { href: item.href })}
        confidence={item.confidence}
        lastVerified={item.lastVerified}
        sources={item.sources}
        {...(item.unbound === true ? { unbound: true } : {})}
      />
    </li>
  );
}

export function FlowsDoesNotSupport() {
  return (
    <>
      <p className="note measure">
        Each item below is something the research examined and would not assert. Seven further refusals - the TechLeaks24
        theory, the exit-liquidity allegation, the Silbert share sales, the aggregator&apos;s 202,077 ZEC withdrawal, the
        44 per cent exchange-balance headline, the first-week-of-January framing and Arkham&apos;s coverage claim - are
        the assessment column of the allegations table above, and are not repeated here.
      </p>
      <ul className="quarantine">
        {ATTACHED.map((item) => (
          <RefusalItem item={item} key={item.key} />
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The quarantine records that bear on this page                              */
/* -------------------------------------------------------------------------- */

/**
 * `unverified.json` holds 32 records across the whole Record; four of them are
 * about flows and are not already rendered in the allegations table. The
 * remaining twenty-six belong to other surfaces and are rendered there.
 */
const FLOWS_QUARANTINE: readonly string[] = [
  "U-grayscale-published-zec-address",
  "U-nu6-lockbox-current-balance",
  "U-zooko-sold-for-taxes",
  "U-fr-withdrawals-linkable-headline",
];

/**
 * The four records, RESOLVED, so a count taken elsewhere counts what renders.
 * The list above is ids; the page's claim beat says how many quarantine records
 * are on the page, and if one of these ids ever stopped resolving the list
 * would shorten while a literal beside it would not. Same rule as a `<summary>`
 * deriving its finding from the rows it discloses.
 */
export function flowsQuarantineRecords(): readonly Unverified[] {
  return getUnverified().filter((u) => FLOWS_QUARANTINE.includes(u.id));
}

export function FlowsQuarantine() {
  const records = flowsQuarantineRecords();
  return (
    <>
      <p className="note measure">
        The quarantine is where a claim goes when it cannot be published as fact. These four bear on this page. Two more,
        the unlocated Arkham post and the TechLeaks24 theory, are in the allegations table above.
      </p>
      <ul className="quarantine">
        {records.map((u: Unverified) => (
          // `id` here is what makes the quarantine permalink resolve. The
          // U- family routes to /flows (packages/content loaders), and this is
          // the only place on the site that renders these four records, so this
          // is where the anchor target belongs. Without it every U- citation
          // dead-ends on a page that has no such element.
          <li key={u.id} id={u.id}>
            <span className="st">{u.status}</span>
            <p className="cl">{u.claim}</p>
            <p className="why">{u.why}</p>
            <FlowsClaim
              id={u.id}
              confidence={QUARANTINE_CONFIDENCE}
              lastVerified={u.lastVerified}
              sources={u.sources}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The thirteen open gaps                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The places that were searched, cited by the gaps claim below.
 *
 * Named rather than inlined because the claim beat at the top of /flows states
 * how many distinct sources the whole page rests on, and it computes that from
 * the same arrays the claims render. A source list that exists only inside a
 * JSX attribute cannot be counted without being copied, and a copy is a second
 * place for the same fact to be stated differently.
 */
const GAPS_SOURCES: readonly SourceRef[] = [
  "S-intel-arkm-com-token-zcash",
  "S-sec-edgar-000172026526000006-zcsh-20260630",
  "S-stocktitan-cyph-10-q-cypherpunk-technologies-inc",
  "S-whale-alert-faq",
  "S-usenix-usenixsecurity18-sec18-kappos",
  "S-cryptoquant-com-exchange-flows-exchange-reserve",
];

/** Research 04 section 7, numbered as the research numbers them. */
const GAPS: readonly string[] = [
  "The original Arkham post behind the $174M figure. The entity, the custodian and the address are all unlocated; Arkham's public pages render only through JavaScript.",
  "Any Arkham ZEC entity label for Coinbase Prime, Coinbase Custody, Grayscale, Cypherpunk or DCG. None found. Arkham's own Zcash page names only the United States government, from the AlphaBay seizure, and anonymous traders.",
  "Any Grayscale-published ZEC address or proof of reserves. The S-3, the S-3/A and the 10-Q were checked; the custodian is named and the addresses are not.",
  "Any Cypherpunk-published ZEC address. The 10-Q names the custodian; no addresses.",
  "Any report of ZEC moving to Coinbase Prime. Zero results across Whale Alert, Lookonchain, Arkham, Spot On Chain, EmberCN and PeckShield. Every identifiable large flow in 2025 and 2026 concerns Binance.",
  "Anchorage, BitGo or Copper holding ZEC. No primary evidence for any of the three.",
  "Transaction-level sale disclosures from the Zcash Foundation, the Electric Coin Company or Zcash Community Grants. No dev-fund coins were traced to any exchange and, because ZIP 271 mandates shielding, structurally cannot be.",
  "Founders' Reward address tracing to exchanges in 2025 and 2026. Kappos and colleagues at USENIX Security 2018 remain the canonical clustering work; the Electric Coin Company's own transfers post is blocked to robots, and no address list was extracted in this pass.",
  "Any public ZEC exchange-reserve series with readable values.",
  "That Zooko Wilcox sold ZEC to pay a tax bill. Searched specifically; no source found. Treat as unsourced.",
  "Owner identity for every nine-figure address in the rich list. This is the single largest attribution gap in Zcash.",
  "Whether the January 2026 unshielder and the December 2025 withdrawer are the same party.",
  "Mining-pool payout routing, for ViaBTC, F2Pool and Foundry, to exchanges. No published analysis was found.",
];

export function FlowsGaps() {
  return (
    <>
      <p className="note measure">
        Thirteen questions the research pass asked and could not answer. They are printed because a page that reports
        only what it found, and not what it looked for and missed, is telling the reader how much it knows without
        telling them how much there is to know.
      </p>
      <ol className="fl-gaps fl-gap-m" id="R-gaps">
        {GAPS.map((gap, index) => (
          <li key={gap}>
            <span className="n">{String(index + 1).padStart(2, "0")}</span>
            {gap}
          </li>
        ))}
      </ol>
      <FlowsClaim
        id="R-gaps"
        href="/flows#R-gaps"
        confidence="high"
        lastVerified="2026-08-22"
        sources={GAPS_SOURCES}
        unbound
      />
      <p className="note fl-gap-s measure">
        Every line above is a search that returned nothing, so the citation lists the places that were searched rather
        than a source for the finding. A negative result has no source; it has a date and a method.
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* What the claim beat at the top of the page reads                           */
/* -------------------------------------------------------------------------- */

/** Refusals attached to findings. Derived from the array that renders them. */
export const REFUSAL_COUNT = ATTACHED.length;

/** Open questions. Derived from the array that renders them. */
export const GAP_COUNT = GAPS.length;

/**
 * Every source this file's page-local claims rest on. The quarantine records'
 * own sources are not here: those come from `packages/content` and the page
 * totals them from the records themselves.
 */
export function flowsRefusalSources(): readonly SourceRef[] {
  return [...ATTACHED.flatMap((r) => r.sources), ...GAPS_SOURCES];
}
