import { getUnverified, type Confidence, type SourceRef } from "@zcashreveal/content";

import { FlowsClaim } from "@/components/record/FlowsClaim";
import { DataTable } from "@/components/ui/DataTable";

/**
 * Allegations against the evidence actually offered for them.
 *
 * Nine rows, and the column that does the work is "evidence offered": five of
 * the nine are supported by no chain data at all, and one of them offers
 * nothing whatever. The research's instruction is that the emptiness is the
 * finding, so the column renders even when there is nothing in it rather than
 * being quietly dropped.
 *
 * Where the corpus already carries the assessment - the TechLeaks24 theory in
 * `unverified.json`, the supply-verification gap in `contradictions.json`, the
 * unlocated Arkham post - the row cites that record and prints its own words.
 * The rest are page-local `R-` claims carrying the research's sources.
 */

interface Allegation {
  readonly n: string;
  readonly allegation: string;
  readonly who: string;
  readonly when: string;
  readonly evidence: string;
  readonly assessment: string;
  readonly id: string;
  readonly also?: readonly string[];
  readonly href?: string;
  readonly confidence: Confidence;
  readonly lastVerified: string;
  readonly sources: readonly SourceRef[];
  readonly unbound?: boolean;
  /** True where this row is the page's canonical home for the id, so it owns the DOM anchor. */
  readonly anchorHere?: boolean;
}

function rows(): readonly Allegation[] {
  const quarantine = getUnverified();
  const techleaks = quarantine.find((u) => u.id === "U-techleaks24-exploiter-migration-theory");
  const arkham = quarantine.find((u) => u.id === "U-arkham-174m-position-post");

  return [
    {
      n: "1",
      allegation:
        "Zcash should be considered fraudulent and a sophisticated inflation scam until proven otherwise: a venture investor with early access to a frontier model could have found and exploited the Orchard inflation bug before Taylor Hornby disclosed it on 29 May 2026.",
      who: "TechLeaks24, on Substack",
      when: "2026-08-08",
      evidence:
        "No blockchain data. No addresses. No transactions. No supply audit. It rests on circumstantial venture connections, timing correlations, a disclosure that one fund accumulated ZEC in February 2026, the Orchard balance falling from about 5.2M to 4.4M by mid-July, and about 1.9M ZEC migrating to Ironwood in two weeks.",
      assessment:
        techleaks?.why ??
        "Speculation. Report as an allegation and note the absent evidence; do not repeat as fact.",
      id: techleaks?.id ?? "U-techleaks24-exploiter-migration-theory",
      // This row is where the record renders, so this row carries the anchor.
      anchorHere: true,
      confidence: "low",
      lastVerified: techleaks?.lastVerified ?? "2026-08-22",
      sources: techleaks?.sources ?? ["S-techleaks24-substack-com-why-zcash-should-be-con"],
    },
    {
      n: "2",
      allegation: "The Zcash supply is manipulated or inflated.",
      who: "various, after the Orchard disclosure",
      when: "2026",
      evidence: "None offered. The column is empty, and that is the finding.",
      assessment:
        "Rejected by Zooko Wilcox, in a joint statement with Shielded Labs' Jason McGee on 15 June 2026: \"we believe prior exploitation is unlikely and therefore that legitimate Orchard funds are recoverable and the current supply of Zcash is sound. However, users cannot currently verify that the Zcash supply is sound, and they should not have to rely on our assessment, or anyone else's.\" That is the fairest available summary and it is notable for conceding the verification gap. Neither side has produced an audit.",
      id: "C2",
      also: ["C9"],
      confidence: "med",
      lastVerified: "2026-08-22",
      sources: ["S-bitcoinfoundation-org-altcoins-zec-price-zcash-f", "S-zcash-improvement-proposals-zip-0258"],
    },
    {
      n: "3",
      allegation: "Arthur Hayes used his followers as exit liquidity on ZEC.",
      who: "ZachXBT",
      when: "June 2026",
      evidence:
        "For ZEC: none. No wallet, no exchange, no amount, no transaction. The only address-level data produced in that episode concerned a different asset entirely.",
      assessment:
        "A conduct critique, not on-chain evidence. Hayes's ZEC exit rests only on his own statement; his response was that he sold to a willing buyer at a market price. Confidence that he sold: high, by self-disclosure. Confidence in venue, size or route: zero.",
      id: "N-arthur-hayes",
      confidence: "high",
      lastVerified: "2026-08-22",
      sources: [
        "S-coindesk-05-arthur-hayes-dumps-zcash-holdings-af",
        "S-kucoin-com-zachxbt-accuses-arthur-hayes-exit-liq",
        "S-coincentral-com-zachxbt-questions-arthur-hayes-o",
      ],
    },
    {
      n: "4",
      allegation: "Arkham can surveil Zcash: 53 per cent of Zcash is tracked.",
      who: "Arkham Intelligence marketing",
      when: "2025-12-08",
      evidence:
        "Transparent-side coverage statistics: 53 per cent of transactions labelled, $420B of volume attributed, 48 per cent of inputs and outputs attributed, 37 per cent of balances labelled.",
      assessment:
        "Materially misleading as originally framed, and publicly corrected. Mert Mumtaz of Helius said Arkham had not been able to do anything with shielded transactions while counting them in the figure; Zooko Wilcox agreed the language was misleading. Arkham later clarified that shielded transactions are not accounted for in the labelled percentage. The underlying transparent-side coverage is real; the privacy-defeat implication is not.",
      id: "R-arkham-framing",
      href: "/flows#R-arkham-framing",
      confidence: "high",
      lastVerified: "2026-08-22",
      sources: [
        "S-arkham-announcements-zcash-is-live-on-arkham",
        "S-arkham-research-how-to-track-zcash-transactions",
        "S-the-defiant-blockchains-arkham-zcash-activity-tr",
        "S-crypto-news-zcash-privacy-tested-as-arkham-track",
      ],
      unbound: true,
      anchorHere: true,
    },
    {
      n: "5",
      allegation: "202,077 ZEC was withdrawn from Binance on 20 December 2025.",
      who: "blockchain.news, attributing @EmberCN",
      when: "2025-12-20",
      evidence: "No address printed by the aggregator.",
      assessment:
        "Unverified, with a date conflict. The only movement of about 202,07x ZEC locatable on-chain is a shielded-pool exit on 2026-01-02 15:45:14, which is not a Binance withdrawal and is thirteen days later. Either the aggregator mis-dated or mis-described an event, or it refers to something that cannot be found. Do not cite.",
      id: "R-claim-embercn-202077",
      href: "/flows#R-claim-embercn-202077",
      confidence: "low",
      lastVerified: "2026-08-22",
      sources: ["S-blockchain-news-flashnews-zec-zcash-whale-alert"],
      unbound: true,
      anchorHere: true,
    },
    {
      n: "6",
      allegation: "Balances of ZEC held on exchanges fell 44 per cent.",
      who: "Yahoo and AMBCrypto syndication, sourcing Nansen",
      when: "2026-01-27",
      evidence:
        "The headline says 44 per cent; the body says 48 per cent during \"this period\", which is the past 24 hours; no absolute figures are given at all.",
      assessment:
        "Internally inconsistent and physically implausible: a collapse of roughly 46 per cent in aggregate exchange balances in a single day is not a plausible physical event. Do not cite the percentage.",
      id: "R-reserves-44pct",
      href: "/flows#R-reserves-44pct",
      confidence: "low",
      lastVerified: "2026-08-22",
      sources: ["S-yahoo-finance-zcash-price-prepares-500-exchanges"],
      unbound: true,
    },
    {
      n: "7",
      allegation:
        "More than 200,000 ZEC, about 1.2 per cent of supply, was unshielded in the first week of January 2026, sparking sell-off concerns.",
      who: "BeInCrypto, syndicated to Yahoo",
      when: "January 2026",
      evidence: "Directionally correct.",
      assessment:
        "Substantially understated and mis-framed. The verified figure is 276,077.74 ZEC in a single day, 2 January 2026, about 1.63 per cent of supply. But 73.2 per cent of it never went to an exchange and has not moved since. The sell-off framing is the part that fails.",
      id: "K-2026-01-02",
      confidence: "high",
      lastVerified: "2026-08-22",
      sources: ["S-beincrypto-zec-supply-unshielded-in-early-2026", "S-blockchair-api-transaction-hash"],
    },
    {
      n: "8",
      allegation: "Barry Silbert sold Zcash.",
      who: "multiple outlets",
      when: "November 2025",
      evidence: "Form 144 filings, which are real.",
      assessment:
        "Half-true and routinely misreported. What was sold was ZCSH trust shares on OTCQX: 1,000 shares for $47,250 by Barry E. Silbert personally on 6 November 2025, and 9,753 shares for $407,312.59 by Silbert Family Investments LLC on 5 November 2025. No ZEC moved on-chain.",
      id: "N-barry-silbert",
      also: ["T2025-11-06"],
      confidence: "high",
      lastVerified: "2026-08-22",
      sources: ["S-sec-edgar-xsl144x01-primary-doc", "S-sec-edgar-xsl144x01-primary-doc-2"],
    },
    {
      n: "9",
      allegation: "A holder lost half the value of a $174M ZEC position.",
      who: "Arkham, via CoinDesk",
      when: "2026-06-05",
      evidence: "One quotation: \"He hasn't sold ZEC for 6 months. Ouch.\"",
      assessment:
        arkham?.why ??
        "A real quotation with an unresolvable subject. The entity is never named, no exchange, custodian or address is published, and the original post could not be located. This is explicitly not Arthur Hayes.",
      id: arkham?.id ?? "U-arkham-174m-position-post",
      anchorHere: true,
      confidence: "low",
      lastVerified: arkham?.lastVerified ?? "2026-08-22",
      sources: arkham?.sources ?? ["S-coindesk-05-arthur-hayes-dumps-zcash-holdings-af"],
    },
  ];
}

export function FlowsAllegations() {
  return (
    <>
      <p className="note measure">
        Each row states the allegation, who made it and when, the evidence that was actually offered for it, and what
        that evidence supports. Five of the nine offer no chain data of any kind; one offers nothing at all. Reporting
        the allegation without the fourth column is how these travel.
      </p>
      <div className="fl-gap-m">
        <DataTable
          caption="Allegations, and the evidence actually offered for each"
          columns={[
            { key: "n", head: "#", mono: true, cell: (r: Allegation) => r.n },
            { key: "allegation", head: "Allegation", cell: (r: Allegation) => r.allegation },
            {
              key: "who",
              head: "Who and when",
              cell: (r: Allegation) => (
                <>
                  <span className="cp">{r.who}</span>
                  <span className="fl-attrib">{r.when}</span>
                </>
              ),
            },
            {
              key: "evidence",
              head: "Evidence actually offered",
              cell: (r: Allegation) => <span className="cp">{r.evidence}</span>,
            },
            {
              key: "assessment",
              head: "Assessment",
              cell: (r: Allegation) => (
                <span {...(r.anchorHere === true ? { id: r.id } : {})}>
                  <span className="cp">{r.assessment}</span>
                  <FlowsClaim
                    id={r.id}
                    {...(r.also === undefined ? {} : { also: r.also })}
                    {...(r.href === undefined ? {} : { href: r.href })}
                    confidence={r.confidence}
                    lastVerified={r.lastVerified}
                    sources={r.sources}
                    {...(r.unbound === true ? { unbound: true } : {})}
                  />
                </span>
              ),
            },
          ]}
          rows={rows()}
          rowKey={(r) => r.n}
        />
      </div>
    </>
  );
}
