import type { Metadata } from "next";

import { MempoolPanel, type MempoolBaseline } from "@/components/track/MempoolPanel";
import { NotMeasured } from "@/components/ui/NotMeasured";
import { Unverified } from "@/components/ui/Unverified";
import { attempt } from "@/lib/api/attempt";
import { resolveSnapshot } from "@/lib/snapshot/store";
import { TrackExamples, TrackSearch } from "@/components/track/TrackSearch";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Metric, MetricRow } from "@/components/ui/Metric";
import { api, IS_FIXTURE } from "@/lib/api";
import { fmtInt, zatToZecGrouped } from "@/lib/format";
import { mempoolDrainNotice, mempoolHeaderText, shieldedShareTile } from "@/lib/mempool-summary";

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
 * initial state, so the table is every committed row in the HTML before any
 * script runs - the count is the fixture's, not a number repeated here, because
 * this sentence said twelve for two rows after the corpus reached fourteen, and
 * was the THIRD site of that one stale number. The subscription upgrades that; it does not create it.
 */
/**
 * THIS PAGE IS SERVER-RENDERED AND MUST NOT BE FROZEN AT BUILD TIME.
 *
 * `next build` reported `/track` as a STATIC route with no revalidate, so every
 * server-rendered figure on it - the summary tiles, the block header, and as of
 * HANDOFF-15 the completeness notice - was computed once at build and never
 * again. A staleness figure that cannot age is not a staleness figure; the
 * notice would have said "last tick just now" over a table the client island
 * had rewritten forty times.
 *
 * 60 SECONDS, MATCHING `/` AND `/pools`, which HANDOFF-11 gave the same value
 * for the same reason. It bounds the server half's staleness rather than
 * removing it: the notice can be up to a minute behind, which is legible
 * against a metered indexer whose tick is a minute long anyway. Moving the
 * notice into the client island would remove the bound entirely and is the
 * larger change rung 3 can take, now that the WebSocket frame carries the drain.
 *
 * Found by a gate reviewer reading the build output rather than the page.
 */
export const revalidate = 60;

export default async function TrackPage() {
  /*
   * THE MEMPOOL COMES FROM THE GATEWAY, AND FROM THE SNAPSHOT WHEN IT CANNOT.
   *
   * Section 3: "the mempool island hydrates from `snapshot.lastReports` then
   * subscribes to WS". Until HANDOFF-11 this page did `await zec.getMempool()`
   * with nothing around it - correct while `api()` was always the fixture, and
   * a **500** the moment `api()` became `HttpApi` and the gateway did not
   * answer. The page that exists so the site can never render empty was the one
   * page that could not render at all.
   *
   * THE ROWS FALL BACK AND THE SUMMARY DOES NOT, which is the honest split.
   * `SnapshotV1.lastReports` is fifty real `MempoolRow`s, so the table is real.
   * It carries no summary, and the metric row states bytes, a fee weather, a
   * crossing total and a findings count - none of which is derivable from fifty
   * rows, and all of which render as a measurement if invented. So the tiles
   * become a named absence stating the CONDITION, which is
   * `docs/2.0/SNAPSHOT.md` section 8.1 applied to a panel that has rows and no
   * aggregate.
   */
  const zec = api();
  const attempted = await attempt(() => zec.getMempool());
  const snapshot = await resolveSnapshot();
  const mempool = attempted.ok ? attempted.value : null;
  const s = mempool?.summary ?? null;
  // READ OFF THE VIEW RATHER THAN DERIVED HERE. The indexer is the only process
  // that knows how many transactions it did not get to; see `MempoolDrainState`
  // in packages/zec-types for why a second derivation would mean something
  // else. `?? null` covers the gateway not answering at all, which the notice
  // renders as a named absence rather than as a complete drain.
  const drain = mempoolDrainNotice(mempool?.drain ?? null);
  const baseline: MempoolBaseline =
    mempool ?? { tipHeight: snapshot.doc.height, entries: snapshot.doc.lastReports };

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
        right={s === null ? "the gateway did not answer - rows from the published snapshot" : mempoolHeaderText(s, s.feeWeather)}
      >
        {s === null ? (
          <>
            <Unverified reason={attempted.ok ? "" : attempted.reason} />
            <NotMeasured
              panel="mempool summary"
              condition="the gateway did not answer, and a published snapshot carries rows without the aggregate they were counted from"
            />
          </>
        ) : (
        <MetricRow>
          <Metric
            label="unconfirmed"
            value={fmtInt(s.unconfirmed)}
            sub={`${(s.bytes / 1000).toFixed(1)} kB - next block in about ${s.nextBlockSeconds} s`}
          />
          <Metric
            label="shielded share"
            // BOTH STRINGS COME FROM `shieldedShareTile`, and the page calling
            // the same function the test calls is the point of it. The
            // denominator is what could be DECODED, not everything unconfirmed
            // - the correction the conventional-fee tile below already carries,
            // arriving here two handoffs later - and the zero-denominator case
            // is answered in words rather than as "NaN%".
            value={shieldedShareTile(s).value}
            sub={shieldedShareTile(s).sub}
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
        )}

        {/*
          HOW COMPLETE THE TABLE BELOW IS, DIRECTLY ABOVE THE TABLE
          (HANDOFF-15 deliverable 3). Section 3's contract: "a reader must never
          be shown five transactions and left to assume that is the mempool".
          It sits between the aggregate tiles and the rows because it is a
          statement about the ROWS - how many of them there should have been -
          and a figure of that kind three screens away from what it qualifies is
          a figure nobody reads.

          `data-complete` IS THE MACHINE-READABLE HALF, on `EpochClock`'s
          `data-age` precedent: an assertion discriminates on an attribute
          rather than on a regex over English, so rewording the copy cannot
          silently turn a test into a tautology.
        */}
        {drain.known ? (
          <p
            className="note"
            style={{ marginTop: 12, maxWidth: "72ch" }}
            data-ui="mempool-drain"
            data-complete={String(drain.complete)}
          >
            <b>{drain.headline}</b> - {drain.detail}
          </p>
        ) : (
          <NotMeasured panel="mempool completeness" condition={drain.condition} />
        )}

        <MempoolPanel initial={baseline} />

        {IS_FIXTURE ? (
          <p className="note" style={{ marginTop: 12, maxWidth: "72ch" }} data-ui="fixture-note">
            {/*
              THE COUNT IS THE BASELINE'S OWN LENGTH, not a summary field. It
              read `mempool.summary.unconfirmed`, which is unreachable when the
              gateway did not answer - and this paragraph only renders under
              `IS_FIXTURE`, where it always did. Reading the array the sentence
              is about removes the null and the second source at once: a count
              beside a table cannot disagree with the table.
            */}
            <b>These are committed values, not a live mempool.</b> The feed is a replay of{" "}
            {fmtInt(baseline.entries.length)} transcribed transactions and
            it closes and reopens on a cycle, which is why the badge above spends part of its time reconnecting - the
            reconnect path running in ordinary operation rather than only under fault. The live socket arrives when
            NEXT_PUBLIC_DATA_MODE is `live` and the gateway is configured; nothing in this panel changes when it does.
          </p>
        ) : null}
      </Block>
    </>
  );
}
