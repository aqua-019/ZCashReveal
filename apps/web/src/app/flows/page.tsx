import type { Metadata } from "next";

import { getCase, getLabels, getNetwork, getStats, getUnverified } from "@zcashreveal/content";

import { formatZatoshi, groupZec, percent, toZatoshi } from "@/components/record/FlowsAmount";
import { FlowsAllegations } from "@/components/record/FlowsAllegations";
import { FlowsClaim } from "@/components/record/FlowsClaim";
import {
  FlowsFalseInference,
  FlowsLabellingInfrastructure,
  FlowsLabelsTable,
  FlowsRichList,
} from "@/components/record/FlowsLabels";
import { FlowsDoesNotSupport, FlowsGaps, FlowsQuarantine } from "@/components/record/FlowsRefusals";
import { FlowsReconstruction, FlowsTransfersTable } from "@/components/record/FlowsTransfers";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { DataTable } from "@/components/ui/DataTable";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { screenByHref } from "@/lib/nav";


const S = screenByHref("/flows");

export const metadata: Metadata = {
  title: "Flows",
  description: S?.dek ?? "",
};

/**
 * 06 FLOWS - what the chain shows against what is claimed.
 *
 * This is the page that refuses to let a headline stand in for a transaction.
 * It takes the loudest money stories of the 2025-26 cycle - the January 2026
 * unshielding, the whale deposit to Binance, the ZIP 271 lockbox, Grayscale and
 * Cypherpunk custody, Barry Silbert's sales and the insider-selling allegations
 * - and splits each into four separately labelled parts: what the chain
 * provably shows, who applied the entity label and by what method, where
 * inference begins, and how confident the record is.
 *
 * Three rules govern everything below and none of them is stylistic.
 *
 * No identity is asserted from chain data. Where an entity name sits beside an
 * address it is someone else's label, rendered with the tier that applied it
 * and, in the registry, with the full method that produced it. A label whose
 * method is hidden is an identity claim, and this site does not make one.
 *
 * Nothing is stated more confidently than the seed or the research states it.
 * Where the research hedges - "appears to be", "plausibly", "at most", "does
 * not appear to cover" - the hedge is carried verbatim rather than smoothed.
 * Figures that exist in neither `packages/content` nor research 04 are not on
 * the page at all.
 *
 * What could not be verified is published as prominently as what could. Block
 * 09 is a third of the page: ten refusals attached to findings, four quarantine
 * records, and thirteen open questions. LEDGER-02 records a gate round lost to
 * exactly the opposite instinct.
 *
 * There is no chart here, deliberately. The mockup's flows screen carries no
 * SVG and no plotted axis: it argues with tables, key/value grids and one
 * preformatted ledger, and the 26.8 / 73.2 split it turns on is the one figure
 * the research insists should be readable as text.
 */
export default function FlowsPage() {
  const stats = getStats();
  const network = getNetwork();
  const lockbox = getCase("K-zip271-lockbox");
  const multisig = getLabels().find((l) => l.address === "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo");
  const grayscale = network.entities.find((e) => e.id === "N-grayscale-zcash-trust");
  const cypherpunk = network.entities.find((e) => e.id === "N-cypherpunk-technologies");
  const foundation = network.entities.find((e) => e.id === "N-zcash-foundation");
  const ecc = network.entities.find((e) => e.id === "N-electric-coin-company");
  const zcg = network.entities.find((e) => e.id === "N-zcash-community-grants");
  const dcgContribution = network.edges.find((e) => e.id === "N-edge-dcg-contributes-etf");
  const mining = network.edges.find((e) => e.id === "N-edge-winklevoss-capital-sells-mining-fleet");
  const advisor = network.edges.find((e) => e.id === "N-edge-zooko-cypherpunk-advisor");
  const techleaks = getUnverified().find((u) => u.id === "U-techleaks24-exploiter-migration-theory");

  // Supply, derived from the five buckets in zatoshi. The research quotes ZEC
  // Stats at 16,890,961 issued and 4,530,445 shielded; the buckets the package
  // ships do not reconcile to either, and the page prints both rather than
  // picking the one that reads better.
  const issuedZat = stats.pools.reduce<bigint>((total, p) => total + p.zatoshi, 0n);
  const transparentZat = stats.pools.find((p) => p.bucket === "transparent")?.zatoshi ?? 0n;
  const shieldedZat = issuedZat - transparentZat;
  const shieldedZec = shieldedZat / 100_000_000n;
  const usdLow = shieldedZec * BigInt(stats.priceUsd.low);
  const usdHigh = shieldedZec * BigInt(stats.priceUsd.high);

  // The lockbox, summed from its own steps rather than transcribed.
  const lockboxOut =
    lockbox === undefined
      ? 0n
      : lockbox.steps.reduce<bigint>(
          (total, s) =>
            s.to === "shielded pool"
              ? total + toZatoshi(s.amount)
              : s.from === "shielded pool"
                ? total - toZatoshi(s.amount)
                : total,
          0n,
        );
  const lockboxMinted = lockbox?.steps[0]?.amount ?? "78750.00";
  const lockboxRemaining = multisig?.balanceZec ?? null;

  return (
    <>
      <RecordHead
        idx="06 FLOWS"
        kicker={`exchange inflows and the insider question - research date ${stats.asOf} - chain state ${stats.height.toLocaleString("en-GB")}`}
        title="What the chain shows vs. what is"
        titleAccent="claimed"
        dek={
          <>
            Every claim on this page is split four ways: <b>(a)</b> what the chain shows, reproducible from public block
            data; <b>(b)</b> who labelled it and how; <b>(c)</b> inference against fact; <b>(d)</b> confidence. No
            identity is asserted from chain data alone. Where an entity name sits beside an address it is{" "}
            <i>someone else&apos;s label</i>, attributed, with the confidence reflecting <i>their</i> evidence and not
            ours.
          </>
        }
        aside={
          <Glass>
            <Eyebrow idx="in one line">the finding</Eyebrow>
            <p className="quote fl-gap-s" style={{ fontSize: 19 }}>
              Custody is documented; addresses are not. The largest unshielding of the cycle mostly never reached an
              exchange. The dev fund is 99.28 per cent untouched and untraceable by design. Nobody has produced on-chain
              evidence of insider selling, and the allegations in circulation cite no addresses, no transactions and no
              supply audit.
            </p>
          </Glass>
        }
      />

      <Glass className="fl-gap-m">
        <Eyebrow idx="how to read the marks">four kinds of number, and one chip</Eyebrow>
        <ul className="fl-legend fl-gap-s">
          <li>
            <Pill kind="exact" /> transparent chain data, arithmetically exact and reproducible against a public API.
          </li>
          <li>
            <Pill kind="bounded" /> an inference across the shielded pool. Never a fact, and never provable by design.
          </li>
          <li>
            <Pill kind="label" /> somebody else&apos;s attribution, with the tier that applied it printed beside it.
          </li>
          <li>
            <Pill kind="undefined" /> not derivable from public data. The honest refusal, not a missing value.
          </li>
          <li>
            <Chip>unbound</Chip> sourced by the research pass but not yet a schema-validated record in the content
            package.
          </li>
          <li>
            <Chip tone="ok">verified</Chip> pulled directly from the Blockchair Zcash API on {stats.asOf}.
          </li>
        </ul>
      </Glass>

      {/* ---------------------------------------------------------------- 01 */}
      <Block idx="01" title="Executive summary" right="eight findings - every one reproducible from a public endpoint">
        <div className="grid g2">
          <Glass className="fl-stack" id="R-arkham-coverage">
            <Eyebrow idx="1.1">a surveillance firm indexes the transparent side</Eyebrow>
            <p className="note">
              Arkham Intelligence launched Zcash coverage on <b>8 December 2025</b>, claiming 53 per cent of transactions
              labelled, $420B of volume attributed, 48 per cent of inputs and outputs attributed and 37 per cent of
              balances labelled. Its own research page concedes the boundary: shielded transfers are &quot;fully private.
              The only piece of data visible on-chain is the transaction fee.&quot; Mert Mumtaz and <b>Zooko Wilcox</b>{" "}
              called the framing misleading, saying Arkham is just tracking wallets that opted into public transparency;
              Arkham then clarified that shielded transactions are not accounted for in the 50 per cent it labels. Both
              its own figures, 53 and 50, are printed here because the correction does not reconcile them.
            </p>
            <FlowsClaim
              id="R-arkham-coverage"
              href="/flows#R-arkham-coverage"
              confidence="high"
              lastVerified={stats.asOf}
              sources={[
                "S-arkham-announcements-zcash-is-live-on-arkham",
                "S-arkham-research-how-to-track-zcash-transactions",
                "S-the-defiant-blockchains-arkham-zcash-activity-tr",
              ]}
              unbound
            />
          </Glass>

          <Glass className="fl-stack">
            <Eyebrow idx="1.2">the january 2026 story is real, and materially incomplete</Eyebrow>
            <p className="note">
              <b>276,077.74 ZEC</b> was unshielded on <b>one day, 2 January 2026</b>, not across the first week as the
              press reported, and all of it inside three hours and forty-six minutes. Only <b>74,001.93 ZEC, 26.8 per
              cent</b>, reached the high-throughput address Lookonchain labels Binance. The largest tranche,{" "}
              <b>202,076.207 ZEC</b>, went to a single transparent address and <b>has never moved</b>. The exit framing
              is not supported by the destination of 73 per cent of the coins.
            </p>
            <FlowsClaim
              id="K-2026-01-02"
              confidence="high"
              lastVerified={stats.asOf}
              sources={["S-blockchair-api-transaction-hash", "S-beincrypto-zec-supply-unshielded-in-early-2026"]}
            />
          </Glass>

          <Glass className="fl-stack">
            <Eyebrow idx="1.3">two-thirds of the whale deposit appears to be a round trip</Eyebrow>
            <p className="note">
              49,999.97 ZEC left the hot wallet on 24 and 25 December 2025 for a fresh address; that address shielded its
              whole balance on 2 January at 18:01:43; <b>50,000.5541 ZEC emerged fifty-two minutes later</b>, 0.4059 ZEC
              smaller, and was returned to the same wallet. Net new inflow attributable to that flow is therefore{" "}
              <b>at most about 24,001 ZEC, not 74,002</b>. <Pill kind="bounded" /> Medium-high: the shielded pool
              deliberately breaks the link, and the inference rests on an amount delta and a fifty-two-minute gap.
            </p>
            <FlowsClaim
              id="K-2026-01-02"
              confidence="med"
              lastVerified={stats.asOf}
              sources={["S-blockchair-api-transaction-hash", "S-blockchain-news-flashnews-zec-whale-deposits-74"]}
            />
          </Glass>

          <Glass className="fl-stack">
            <Eyebrow idx="1.4">the lockbox is 99.28 per cent untouched</Eyebrow>
            <p className="note">
              78,750 ZEC was minted at the NU6.1 activation, block 3,146,400, as ten outputs of 7,875 to the ZIP 271
              two-of-three multisig held by the Zcash Foundation, the Electric Coin Company and Shielded Labs.{" "}
              <b>566.5907 ZEC, 0.72 per cent</b>, has net left it, into shielded outputs exactly as the ZIP mandates.
              Disbursement is therefore untraceable to any exchange after the first hop: <b>a design property, not a
              cover-up</b>, and it means the question of whether the dev fund sold is unanswerable from chain data.
            </p>
            <FlowsClaim
              id="K-zip271-lockbox"
              also={["L-t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo"]}
              confidence="high"
              lastVerified={stats.asOf}
              sources={["S-zcash-improvement-proposals-zip-0271", "S-blockchair-api-transaction-hash"]}
            />
          </Glass>

          <Glass className="fl-stack">
            <Eyebrow idx="1.5">custody is documented, addresses are not</Eyebrow>
            <p className="note">
              Two custodial relationships are established from primary filings: the <b>Grayscale Zcash Trust</b> at
              Coinbase Custody Trust Company, and <b>Cypherpunk Technologies</b> at Gemini Space Station.{" "}
              <b>Neither publishes on-chain addresses or a proof of reserves.</b> No public rich list applies an exchange
              or custodian label to any Zcash address, and the largest transparent holders on the chain today are
              entirely unattributed in public data.
            </p>
            <div className="fl-kv-prose">
              <KV
                stack
                entries={[
                  { k: "Grayscale Zcash Trust", v: grayscale?.exposure ?? "no exposure disclosed" },
                  { k: "Cypherpunk Technologies", v: cypherpunk?.exposure ?? "no exposure disclosed" },
                ]}
              />
            </div>
            <FlowsClaim
              id="N-grayscale-zcash-trust"
              also={["N-cypherpunk-technologies"]}
              confidence="med"
              lastVerified={stats.asOf}
              sources={[
                "S-sec-edgar-000172026526000006-zcsh-20260630",
                "S-stocktitan-cyph-10-q-cypherpunk-technologies-inc",
              ]}
            />
          </Glass>

          <Glass className="fl-stack" id="R-sponsor-fee">
            <Eyebrow idx="1.6">the one hard recurring institutional outflow</Eyebrow>
            <p className="note">
              Grayscale&apos;s <b>Sponsor&apos;s Fee, paid in kind</b>: 4,848.65 ZEC in the first half of 2026 and
              4,883.12 ZEC in the first half of 2025, roughly 9,700 ZEC a year, withdrawn from the Trust and transferred
              to the Sponsor. <b>The filings do not say whether the Sponsor then sells it.</b> It is the only disclosed,
              recurring, documented institutional ZEC outflow anywhere in this research.
            </p>
            <FlowsClaim
              id="R-sponsor-fee"
              href="/flows#R-sponsor-fee"
              confidence="high"
              lastVerified={stats.asOf}
              sources={["S-sec-edgar-000172026526000006-zcsh-20260630"]}
              unbound
            />
          </Glass>

          <Glass className="fl-stack">
            <Eyebrow idx="1.7">the insider-selling allegations are not evidenced</Eyebrow>
            <p className="note">
              TechLeaks24, on 8 August 2026, argues that ZEC should be considered fraudulent until proven otherwise and
              cites <b>no addresses, no transactions and no supply audit</b>. ZachXBT&apos;s exit-liquidity critique of
              Arthur Hayes attaches <b>no ZEC on-chain evidence</b>. Barry Silbert&apos;s Form 144 filings are real, and
              they are <b>ZCSH trust shares sold on OTCQX</b>, which move no ZEC on-chain and create no exchange inflow.
            </p>
            <FlowsClaim
              id={techleaks?.id ?? "U-techleaks24-exploiter-migration-theory"}
              confidence="low"
              lastVerified={techleaks?.lastVerified ?? stats.asOf}
              sources={techleaks?.sources ?? ["S-techleaks24-substack-com-why-zcash-should-be-con"]}
            />
          </Glass>

          <Glass className="fl-stack" id="R-whale-alert">
            <Eyebrow idx="1.8">whale alert does not appear to cover zcash</Eyebrow>
            <p className="note">
              Its published supported-chain list does not include Zcash. Headlines reading &quot;ZEC Whale Alert&quot; on
              aggregator sites are editorial phrasing rather than that account&apos;s output. The reporting accounts that
              actually cover ZEC flows are <b>Lookonchain</b> and <b>EmberCN</b>, relayed through aggregators. The
              research puts this no more strongly than that Zcash is absent from the list, and neither does this page.
            </p>
            <FlowsClaim
              id="R-whale-alert"
              href="/flows#R-whale-alert"
              confidence="high"
              lastVerified={stats.asOf}
              sources={["S-whale-alert-faq"]}
              unbound
            />
          </Glass>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- 02 */}
      <Block
        idx="02"
        title="Dated table of large ZEC transfers"
        right={`verified rows pulled from the Blockchair Zcash API on ${stats.asOf} - times UTC`}
      >
        <FlowsTransfersTable />
      </Block>

      {/* ---------------------------------------------------------------- 03 */}
      <Block idx="03" title="The 2 January 2026 event, reconstructed" right="the arithmetic, and the limit of it">
        <FlowsReconstruction />
      </Block>

      {/* ---------------------------------------------------------------- 04 */}
      <Block idx="04" title="Labelled and candidate addresses" right="the label precedence is printed on every row">
        <FlowsLabelsTable />
      </Block>

      {/* ---------------------------------------------------------------- 05 */}
      <Block
        idx="05"
        title="Largest transparent holders, and who labels them"
        right="nine of the largest balances on the chain, and not one attribution"
      >
        <div className="grid g2">
          <FlowsRichList />
          <div className="fl-stack">
            <FlowsFalseInference />
            <FlowsLabellingInfrastructure />
          </div>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- 06 */}
      <Block
        idx="06"
        title="Exchange-reserve trends"
        right="there is no free, public, verifiable ZEC exchange-reserve series - say so"
      >
        <div className="grid g2">
          <div id="R-reserve-providers">
            <DataTable
              caption="Every provider checked for a ZEC exchange-reserve series, and what could be read"
              columns={[
                { key: "provider", head: "Provider", cell: (r: { readonly provider: string }) => r.provider },
                {
                  key: "series",
                  head: "ZEC exchange-reserve series?",
                  cell: (r: { readonly series: string }) => <span className="cp">{r.series}</span>,
                },
                {
                  key: "verified",
                  head: "What could be verified",
                  cell: (r: { readonly verified: string }) => <span className="cp">{r.verified}</span>,
                },
              ]}
              rows={[
                {
                  provider: "CryptoQuant",
                  series: "An endpoint exists and its page metadata describes an exchange-reserve chart.",
                  verified:
                    "Values unreadable: a Cloudflare interstitial, and the API needs a key. The endpoint existing is suggestive; the series may be empty.",
                },
                {
                  provider: "Glassnode",
                  series: "The balance-on-exchanges metric exists.",
                  verified: "ZEC coverage unconfirmed; the endpoint list requires authentication and returned 401.",
                },
                {
                  provider: "CoinGlass",
                  series: "An exchange-balance tracker exists.",
                  verified: "ZEC is not present on it. CoinGlass ZEC coverage is derivatives, liquidations and funding only.",
                },
                {
                  provider: "Nansen",
                  series: "Cited as the chart source in a January 2026 article.",
                  verified: "Not independently verifiable; Nansen ZEC coverage is not documented publicly.",
                },
                {
                  provider: "ZEC Stats",
                  series: "No.",
                  verified: "Confirmed: it publishes pool, supply and derivatives data and explicitly no exchange reserves.",
                },
                { provider: "IntoTheBlock", series: "Not found.", verified: "No ZEC exchange-flow product located." },
              ]}
              rowKey={(r) => r.provider}
            />
            <p className="note fl-gap-s">
              This is a genuine data gap, and the page says so plainly rather than reprinting a percentage from an
              aggregator.
            </p>
            <FlowsClaim
              id="R-reserve-providers"
              href="/flows#R-reserve-providers"
              confidence="high"
              lastVerified={stats.asOf}
              sources={[
                "S-cryptoquant-com-exchange-flows-exchange-reserve",
                "S-coinglass-com-balance",
                "S-zec-stats-zecstats-com",
              ]}
              unbound
            />
          </div>

          <div className="fl-stack">
            <Glass className="fl-stack" id="R-reserves-44pct">
              <Eyebrow idx="the circulating number, and why it is unusable">a headline that cannot be true</Eyebrow>
              <p className="note">
                A syndicated article of 27 January 2026 was headlined &quot;Exchanges&apos; ZEC Balance Falls 44%&quot;,
                while its body text cited Nansen for a 48 per cent drop &quot;during this period&quot; - the past
                twenty-four hours - and gave no absolute figures at all. A collapse of roughly 46 per cent in aggregate
                exchange balances in one day is not a plausible physical event. <b>Flagged unreliable; the percentage is
                not cited here.</b>
              </p>
              <FlowsClaim
                id="R-reserves-44pct"
                href="/flows#R-reserves-44pct"
                confidence="low"
                lastVerified={stats.asOf}
                sources={["S-yahoo-finance-zcash-price-prepares-500-exchanges"]}
                unbound
              />
              <div className="hair" />
              <Eyebrow idx={`what can be said, verified ${stats.asOf}`}>from the loaders, not from an aggregator</Eyebrow>
              <KV
                entries={[
                  {
                    k: "shielded, summed from the four pool buckets",
                    v: (
                      <>
                        <Pill kind="exact" /> {formatZatoshi(shieldedZat)} ZEC
                      </>
                    ),
                  },
                  {
                    k: "shielded share of supply",
                    v: `${stats.shieldedSharePct.low} to ${stats.shieldedSharePct.high} per cent`,
                  },
                  {
                    k: "value of the shielded pools",
                    v: `$${(Number(usdLow) / 1e9).toFixed(2)}B to $${(Number(usdHigh) / 1e9).toFixed(2)}B`,
                  },
                  { k: "issued, summed from all five buckets", v: `${formatZatoshi(issuedZat)} of 21,000,000 ZEC` },
                  {
                    k: "largest identified transparent institutional position",
                    v: "Grayscale Zcash Trust, 388,673.68 ZEC, about 2.3 per cent of supply",
                  },
                ]}
              />
              <p className="note">
                The share is a <b>range and not a point</b>: CipherScan reads 26.0 per cent at block{" "}
                {stats.height.toLocaleString("en-GB")} and ZEC Stats reads 26.8 per cent, so the site cites the range.
                The research&apos;s own supply bullet quotes ZEC Stats at 4,530,445 ZEC shielded and 16,890,961 ZEC
                issued; neither reconciles with the buckets the package ships, which is why both are printed and neither
                is presented as the other.
              </p>
              <p className="note">
                Because both Gemini and Binance issue <b>transparent</b> deposit addresses, exchange balances are in
                principle observable. Nobody publishes the address sets needed to compute them.
              </p>
              <span id="R-supply-distribution" />
              <FlowsClaim
                id="R-supply-distribution"
                href="/flows#R-supply-distribution"
                confidence={stats.confidence}
                lastVerified={stats.lastVerified}
                sources={[...stats.sources, "S-support-gemini-com-en-us-31670107364891-what-typ"]}
              />
            </Glass>

            <div className="fl-warn" id="R-explorer-arithmetic">
              <Eyebrow idx="caveat on explorer arithmetic">not a rounding error</Eyebrow>
              <p className="note fl-gap-s">
                Blockchair&apos;s Zcash stats endpoint currently returns a <b>negative</b> circulation of −4,638,503.75
                ZEC. Naive UTXO accounting cannot handle shielded value pools. Treat any ZEC supply or flow figure taken
                from a generic multi-chain explorer with suspicion unless it is address-level transparent data.
              </p>
              <FlowsClaim
                id="R-explorer-arithmetic"
                href="/flows#R-explorer-arithmetic"
                confidence="high"
                lastVerified={stats.asOf}
                sources={["S-blockchair-api-zcash-stats"]}
                unbound
              />
            </div>
          </div>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- 07 */}
      <Block
        idx="07"
        title="Dev fund and insider disclosed sales"
        right="what is disclosed, and what is structurally unknowable"
      >
        <p className="note measure">
          The numbering below follows the research: 5.1, 5.2, 5.4, 5.5, 5.6. The gap at 5.3 is kept rather than closed -
          5.3 is the round-trip inference, and it is rendered in block 03 beside the ledger it argues about.
        </p>
        <div className="grid g2 fl-gap-m">
          {lockbox === undefined ? null : (
            <Glass className="fl-stack" id={lockbox.id}>
              <Eyebrow idx="5.1 the zip 271 lockbox">facts high - downstream destination zero, by design</Eyebrow>
              <KV
                entries={[
                  ...lockbox.steps.map((s) => ({
                    k: `${s.time.slice(0, 10)}${s.txid === undefined ? "" : ` · ${s.txid.slice(0, 8)}…`}`,
                    v: `${s.to === "shielded pool" ? "−" : "+"}${groupZec(s.amount)} ZEC ${
                      s.to === "shielded pool" ? "into shielded outputs" : "to the multisig"
                    }`,
                  })),
                  {
                    k: "net removed",
                    v: (
                      <>
                        <b>{formatZatoshi(lockboxOut)} ZEC</b> ·{" "}
                        {percent(lockboxOut, toZatoshi(lockboxMinted), 2)} per cent
                      </>
                    ),
                  },
                  {
                    k: "remaining unspent",
                    v:
                      lockboxRemaining === null ? (
                        <Pill kind="undefined" />
                      ) : (
                        <>
                          <b>{groupZec(lockboxRemaining)} ZEC</b> ·{" "}
                          {percent(toZatoshi(lockboxRemaining), toZatoshi(lockboxMinted), 2)} per cent
                        </>
                      ),
                  },
                ]}
              />
              <p className="note">{lockbox.verdict}</p>
              <FlowsClaim
                id={lockbox.id}
                also={["L-t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo"]}
                confidence={lockbox.confidence}
                lastVerified={lockbox.lastVerified}
                sources={lockbox.sources}
              />
            </Glass>
          )}

          <Glass className="fl-stack" id="R-zf-ecc-zcg">
            <Eyebrow idx="5.2 the foundation, ecc and bootstrap, and community grants">
                positions disclosed, sales not
              </Eyebrow>
            <div className="fl-kv-prose">
              <KV
                stack
                entries={[
                  {
                    k: "Zcash Foundation",
                    v: (
                      <>
                        {foundation?.exposure ?? "no exposure disclosed"}. <b>No transaction-level sale disclosure.</b>{" "}
                        The Q1 2026 report gives $36.69M of liquid assets against a ZEC-denominated income stream, which
                        necessarily implies historical conversion, but no amounts, dates, venues or counterparties are
                        published. The report&apos;s own PDF was blocked to the research pass, so the breakdown reaches
                        this page through secondary reporting.
                      </>
                    ),
                  },
                  {
                    k: "ECC and Bootstrap",
                    v: (
                      <>
                        {ecc?.exposure ?? "no exposure disclosed"}. The transparency report records gains and losses at
                        the point of a subsequent sale and <b>discloses no quantities, venues or methods</b>. The
                        public series <i>appears</i> to stop at the fourth quarter of 2023, which is the research&apos;s
                        own hedge and is left as it stands.
                      </>
                    ),
                  },
                  {
                    k: "Zcash Community Grants",
                    v: (
                      <>
                        {zcg?.exposure ?? "no exposure disclosed"}. The accounting is USD-denominated with{" "}
                        <b>no transaction ids, no addresses and no timestamps</b>, so grant flows cannot be tied to chain
                        activity at all.
                      </>
                    ),
                  },
                ]}
              />
            </div>
            <FlowsClaim
              id="R-zf-ecc-zcg"
              href="/flows#R-zf-ecc-zcg"
              also={["N-zcash-foundation", "N-electric-coin-company", "N-zcash-community-grants"]}
              confidence="med"
              lastVerified={stats.asOf}
              sources={[
                "S-zcash-foundation-05-zcash-foundation-q1-2026",
                "S-electric-coin-company-04-transparency-report-mar",
                "S-openzcash-zcg-disbursements",
              ]}
              unbound
            />
          </Glass>

          <Glass className="fl-stack" id="R-grayscale-ledger">
            <Eyebrow idx="5.4 grayscale zcash trust">
                SEC EDGAR - the only fully documented recurring institutional outflow
              </Eyebrow>
            <DataTable
              caption="Grayscale Zcash Trust, ZEC held and fair value, from the filings"
              columns={[
                { key: "date", head: "Date", mono: true, cell: (r: { readonly date: string }) => r.date },
                { key: "held", head: "ZEC held", mono: true, cell: (r: { readonly held: string }) => r.held },
                { key: "value", head: "Fair value", mono: true, cell: (r: { readonly value: string }) => r.value },
                {
                  key: "event",
                  head: "Event",
                  cell: (r: { readonly event: string }) => <span className="cp">{r.event}</span>,
                },
              ]}
              rows={[
                { date: "2024-12-31", held: "392,723.58934327", value: "$22,040k", event: "" },
                {
                  date: "H1 2025",
                  held: "",
                  value: "",
                  event: "4,888.23272520 ZEC contributed; 4,883.12100169 distributed for the Sponsor's Fee.",
                },
                { date: "2025-06-30", held: "392,728.70106678", value: "$15,324k", event: "" },
                { date: "2025-12-31", held: "393,522.33134026", value: "$200,441k", event: "Cost basis $47,911k." },
                {
                  date: "H1 2026",
                  held: "",
                  value: "",
                  event: "ZEC contributed: nil. 4,848.64774083 distributed for the Sponsor's Fee.",
                },
                {
                  date: "2026-06-30",
                  held: "388,673.68359943",
                  value: "$155,252k",
                  event: "Cost basis $47,320k. NAV per share $32.15, against $41.51 at 31 December 2025. 4,829,300 shares outstanding.",
                },
              ]}
              rowKey={(r) => r.date}
            />
            <p className="note">
              The 393,522.33 figure is the <b>31 December 2025</b> line, not the Q2 position: the two are routinely
              mis-paired. Custodian: Coinbase Custody Trust Company, LLC, with Coinbase, Inc. as prime broker and the
              keys held offline in the Vault Balance. Roughly 9,700 ZEC a year leaves in kind and the resale is
              undisclosed. <b>No addresses and no proof of reserves appear in the S-3, the S-3/A or the 10-Q.</b>
            </p>
            <FlowsClaim
              id="R-grayscale-ledger"
              href="/flows#R-grayscale-ledger"
              also={["N-grayscale-zcash-trust"]}
              confidence="high"
              lastVerified={stats.asOf}
              sources={[
                "S-sec-edgar-000172026526000006-zcsh-20260630",
                "S-sec-edgar-000119312525298561-zcsh-20251126",
                "S-stocktitan-zcsh-s-3-a-grayscale-zcash-trust-zec",
              ]}
              unbound
            />
          </Glass>

          <Glass className="fl-stack" id="R-form144">
            <Eyebrow idx="5.5 dcg and silbert">real, documented - and share sales, not ZEC</Eyebrow>
            <p className="note">
              <b>148 Form 144 filings</b> on the Trust, 84 in 2024 and 64 in 2025, spanning 24 January 2024 to 6 November
              2025. The filers, by CIK: Digital Currency Group, Inc.; DCG International Investments Ltd.; Silbert Family
              Investments LLC; Silbert Barry E.; and Lenihan Lawrence D Jr. The DCG entities filed in clustered
              consecutive-day runs, which is <i>the signature of</i> a programmatic Rule 144 disposal schedule rather
              than a proven one.
            </p>
            <div className="fl-kv-prose">
              <KV
                stack
                entries={[
                  {
                    k: "filed 2025-11-05 · Silbert Family Investments LLC",
                    v: "9,753 shares, $407,312.59 aggregate market value, sold 5 November 2025 on OTCQX through Canaccord Genuity Inc.; originally acquired 24 October 2017 from the issuer for cash.",
                  },
                  {
                    k: "filed 2025-11-06 · Silbert Barry E.",
                    v: "1,000 shares, $47,250.00 aggregate market value, sold 6 November 2025 on OTCQX through Capital Institutional Services, Inc.; originally acquired 11 July 2018 in a privately negotiated purchase from the issuer.",
                  },
                ]}
              />
            </div>
            <p className="note">
              These are <b>ZCSH trust shares traded on OTCQX between investors</b>. They move <b>no ZEC on-chain</b>,
              create <b>no exchange inflow</b> and add <b>no ZEC sell pressure</b>. Reporting them as insider ZEC selling
              would be wrong. The juxtaposition worth stating as fact, and not as an accusation: the same corporate
              family that filed dozens of Rule 144 notices through 2024 and 2025 is now, per the S-3/A of 18 and 19
              August 2026, in discussions for {dcgContribution?.amount ?? "~200,000 ZEC"} to be contributed to that Trust
              ahead of the proposed NYSE Arca listing - discussions the filing is explicit are{" "}
              <b>not binding agreements or commitments to purchase</b>.
            </p>
            <FlowsClaim
              id="R-form144"
              href="/flows#R-form144"
              also={["N-barry-silbert", "N-edge-dcg-contributes-etf"]}
              confidence="high"
              lastVerified={stats.asOf}
              sources={[
                "S-sec-edgar-xsl144x01-primary-doc",
                "S-sec-edgar-xsl144x01-primary-doc-2",
                "S-sec-edgar-submissions-cik0001652536",
                "S-stocktitan-zcsh-s-3-a-grayscale-zcash-trust-zec",
              ]}
              unbound
            />
            <div className="hair" />
            <div id="R-cypherpunk">
              <Eyebrow idx="5.6 cypherpunk technologies">accumulation stated, nothing preventing the opposite</Eyebrow>
            </div>
            <p className="note">
              {cypherpunk?.exposure ?? "no exposure disclosed"}. Custodian: <b>Gemini Space Station</b>, from the 10-Q&apos;s
              own risk-factor language - not Coinbase Prime and not Anchorage. Gemini issues transparent addresses, so
              the holding is in principle on transparent addresses, but <b>no address has been published by anyone</b>.
              Since {mining?.date ?? "18 August 2026"} the company has run a 4.2 GSol/s Equihash fleet, about 18 per cent
              of network hashrate, acquired from Winklevoss Capital for {mining?.amount ?? "$33.33M in equity"}; at a
              network-wide reward of roughly 43,800 ZEC a month an 18 per cent share <i>implies</i> about 7,880 ZEC a
              month, which is arithmetic on a hashrate share and not a disclosed production figure.{" "}
              <b>There is no statement of intent to sell</b>, and the stated target is 5 per cent of supply; there is
              also no lock-up and no covenant preventing sales. Zooko Wilcox joined as a {advisor?.what ?? "paid strategic advisor"},
              which is relevant to any insider framing, though the filings reviewed disclose no ZEC compensation for the
              role.
            </p>
            <FlowsClaim
              id="R-cypherpunk"
              href="/flows#R-cypherpunk"
              also={["N-cypherpunk-technologies", "N-edge-winklevoss-capital-sells-mining-fleet"]}
              confidence="med"
              lastVerified={stats.asOf}
              sources={[
                "S-stocktitan-cyph-10-q-cypherpunk-technologies-inc",
                "S-crypto-news-cypherpunk-becomes-largest-zcash-min",
                "S-support-gemini-com-en-us-31670107364891-what-typ",
              ]}
              unbound
            />
          </Glass>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- 08 */}
      <Block
        idx="08"
        title="Allegations against the evidence"
        right="reported as allegations - assessed on the evidence actually offered"
      >
        <FlowsAllegations />
      </Block>

      {/* ---------------------------------------------------------------- 09 */}
      <Block
        idx="09"
        title="What this page does not support"
        right="kept off the record until a primary source appears"
      >
        <div className="fl-stack">
          <div>
            <Eyebrow idx="9.1 refusals attached to findings">ten claims the research would not make</Eyebrow>
            <div className="fl-gap-s">
              <FlowsDoesNotSupport />
            </div>
          </div>
          <div className="hair" />
          <div>
            <Eyebrow idx="9.2 from the quarantine">records that cannot be published as fact</Eyebrow>
            <div className="fl-gap-s">
              <FlowsQuarantine />
            </div>
          </div>
          <div className="hair" />
          <div>
            <Eyebrow idx="9.3 what could not be verified">thirteen open questions</Eyebrow>
            <div className="fl-gap-s">
              <FlowsGaps />
            </div>
          </div>
        </div>
        <p className="src fl-gap-m">
          Sources for this surface: the Zcash Improvement Proposals (ZIP 271, ZIP 255, ZIP 1015, ZIP 1016); SEC EDGAR,
          for the Grayscale Zcash Trust 10-Q, S-3, S-3/A and the November 2025 Forms 144, and for the Cypherpunk
          Technologies 10-Q; the Blockchair Zcash API, for the address dashboards and the thirteen transactions listed
          above, queried {stats.asOf}; mainnet.zcashexplorer.app; Arkham announcements and research pages; The Defiant;
          crypto.news; BeInCrypto; Yahoo Finance; blockchain.news, relaying Lookonchain and EmberCN; CoinDesk; ZEC Stats;
          CipherScan; CoinCarp; and the Whale Alert FAQ. Every URL, publisher and access date is on{" "}
          <a href="/sources">the sources page</a>, which is where URLs live on this site.
        </p>
      </Block>
    </>
  );
}
