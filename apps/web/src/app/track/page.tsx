import type { Metadata } from "next";

import { MempoolPanel } from "@/components/track/MempoolPanel";
import { TrackExamples, TrackSearch } from "@/components/track/TrackSearch";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { api, IS_FIXTURE } from "@/lib/api";
import { fmtInt, zatToZecGrouped } from "@/lib/format";

export const metadata: Metadata = {
  title: "Track",
  description: "Search the chain. Transparent activity resolves exactly; shielded activity resolves to a bound with its reasoning attached.",
};

/**
 * 04 TRACKING - search and mempool.
 *
 * The front door of the Instrument. HANDOFF-01 shipped this route as a search
 * affordance over a stated gap; this is the page behind it.
 *
 * The mempool is fetched on the server and passed to the client panel as its
 * initial state, so the table is twelve real rows in the HTML before any script
 * runs. The subscription upgrades that; it does not create it.
 */
export default async function TrackPage() {
  const zec = api();
  const mempool = await zec.getMempool();
  const s = mempool.summary;

  return (
    <>
      <TrackHead
        title="Follow the"
        accent="value"
        dek={
          <>
            Paste an address, a transaction or a block. The transparent side of Zcash is as public as Bitcoin and is returned{" "}
            <b>exactly</b>. The shielded side is returned as <b>bounds with the reasoning printed</b> - or exactly, if you hold
            the viewing key and decrypt in your own browser. Nothing here names a person.
          </>
        }
      />

      <TrackNav path="/track" />

      <TrackSearch />
      <TrackExamples />

      <div className="cango">
        <div className="c">
          <div className="h">
            Transparent - <em>exact</em>
          </div>
          <p>
            UTXOs, spends, counterparties, fees and clusters: common-input ownership, change detection, exchange shapes.
            Boundary events - this address shielding, or being paid from a pool - carry a pool-side estimate beside them.
          </p>
        </div>
        <div className="c">
          <div className="h">
            Shielded - <em>bounded</em>
          </div>
          <p>
            An address is never written to the chain. Without a key we show what the pool publishes around a transaction:
            anchor-bounded candidate sets, spent-count subtraction, time and amount echoes, fee-derived action counts and
            wallet fingerprints - each with its assumption and its cost.
          </p>
        </div>
        <div className="c">
          <div className="h">
            Viewing key - <em>exact, yours</em>
          </div>
          <p>
            Trial-decrypt every output with your incoming key, derive nullifiers with your full key, read your own outgoing
            ciphertexts. In the browser, never uploaded. The only way a shielded balance appears on this site.
          </p>
        </div>
      </div>

      <Block
        idx="A"
        title="Mempool"
        right={`${fmtInt(s.unconfirmed)} unconfirmed - ${fmtInt(s.shielded)} shielded - ${fmtInt(s.migrations)} migrations - ${fmtInt(s.transparent)} transparent - fee weather: ${s.feeWeather}`}
      >
        <MetricRow>
          <Metric
            label="unconfirmed"
            value={fmtInt(s.unconfirmed)}
            sub={`${(s.bytes / 1000).toFixed(1)} kB - next block in about ${s.nextBlockSeconds} s`}
          />
          <Metric
            label="shielded share"
            // THE DENOMINATOR IS WHAT COULD BE DECODED, not everything
            // unconfirmed - the same correction the conventional-fee tile below
            // already carries, arriving here two handoffs later. It read
            // `s.unconfirmed`, so a transaction the decoder declined to read
            // counted against the shielded share: the tile said "7 of 13" about
            // a mempool holding twelve readable transactions, seven of them
            // shielded. An undecodable transaction is evidence of nothing, and
            // a denominator is a claim as much as a numerator is.
            value={`${Math.round((s.shielded / s.decodedCount) * 100)}%`}
            sub={`by count - ${fmtInt(s.shielded)} of ${fmtInt(s.decodedCount)} decoded`}
          />
          <Metric
            label="value crossing boundaries"
            value={zatToZecGrouped(s.crossingZat, 1)}
            sub={s.crossingSplit}
            // Value crossing a pool boundary: gold's third licensed job.
            accent
          />
          <Metric
            label="conventional fee"
            value={fmtInt(Number(s.conventionalFeeZat))}
            // THE DENOMINATOR IS WHAT COULD BE PRICED, not everything unconfirmed.
            // It read `s.unconfirmed`, so a mempool of twelve with three known
            // fees printed "3 of 12 conventional" - a verdict on nine
            // transactions nobody priced - while the sentence in the block
            // beside it correctly said "3 of the 3 that could be priced". One
            // page, two answers.
            sub={`zat - ZIP 317 at 2 logical actions - ${fmtInt(s.conventionalCount)} of ${fmtInt(s.pricedCount)} priced pay it`}
          />
          <Metric label="findings at high" value={fmtInt(s.findingsHigh)} sub={s.findingsNote} />
        </MetricRow>

        <MempoolPanel initial={mempool} />

        {IS_FIXTURE ? (
          <p className="note" style={{ marginTop: 12, maxWidth: "72ch" }} data-ui="fixture-note">
            <b>These are committed values, not a live mempool.</b> The feed is a replay of twelve transcribed transactions and
            it closes and reopens on a cycle, which is why the badge above spends part of its time reconnecting - the
            reconnect path running in ordinary operation rather than only under fault. The gateway arrives at HANDOFF-05 and
            the live socket at the HANDOFF-11 cutover; nothing in this panel changes when they do.
          </p>
        ) : null}
      </Block>
    </>
  );
}
