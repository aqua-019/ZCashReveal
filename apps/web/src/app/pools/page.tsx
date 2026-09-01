import type { Metadata } from "next";

import { ClaimDistribution, MigrationLens, OrchardDrain, PoolHistory, PoolSankey } from "@/components/track/Charts";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { NotMeasured } from "@/components/ui/NotMeasured";
import { api } from "@/lib/api";
import { attempt } from "@/lib/api/attempt";
import { Unverified } from "@/components/ui/Unverified";
import { resolveSnapshot } from "@/lib/snapshot/store";
import { POOL_LABEL, POOL_RULE, POOL_SW, type PoolKey } from "@/lib/chain";
import { fmtInt, fmtPct, zatToZecGrouped } from "@/lib/format";

/**
 * ISR at sixty seconds, which is HANDOFF-11 section 3's window and the same
 * number `SNAPSHOT_TTL_MS` uses in the store.
 *
 * THE TWO NUMBERS ARE ONE POLICY AND MUST NOT DRIFT. A memo shorter than this
 * window spends managed-store reads the window has already paid for; a memo
 * longer than it serves a document older than the page claims to be. Sixty
 * seconds is also roughly one block at the 75-second target interval, so a
 * reader is at worst one tip behind and the system bar says by how much.
 *
 * THIS ROUTE HAD NO `revalidate` BEFORE AND WAS PRERENDERED ONCE AT BUILD TIME,
 * which is why assertion A10's read count was zero rather than one: there was
 * no render to attach a read to. That is stated here rather than in the ledger
 * because it is the fact that makes the number in `docs/2.0/SNAPSHOT.md`
 * section 5 mean anything.
 */
export const revalidate = 120;

export const metadata: Metadata = {
  title: "Pools",
  description: "Five lanes, the value crossing between them, and the share of supply whose soundness cannot be proven.",
};

/**
 * 04 TRACKING - the pools instrument.
 *
 * The page that makes the site's largest honest claim: 4.33 percent of the
 * supply sits in two pools whose soundness rested on a proof system that was
 * later found broken, and that is a statement about what cannot be verified
 * rather than a statement that anything was counterfeited. The distinction is
 * the whole page, and the residual tile says it in its own words rather than
 * leaving a big gold number to be read as an accusation.
 */
export default async function PoolsPage() {
  /*
   * TWO SOURCES, AND WHICH NUMBER COMES FROM WHICH IS THE POINT.
   *
   * The BALANCES come from the published document: assertion A3 is "with a
   * mocked REST endpoint returning a valid SnapshotV1 ... /pools renders the
   * mocked snapshot's balances", and `SnapshotV1.pools` is the five-lane array
   * the publisher writes on every tip. They used to come from `PoolsView`, and
   * in fixture mode the two are the same five numbers at the same height -
   * both derive from `getStats()` - which is why this swap changes nothing a
   * fixture reader can see and everything a production reader can.
   *
   * Everything else on the page - the sankey, the history, the estimator
   * charts - comes through `api()`, which is the gateway when one is
   * configured. That call can FAIL, and a page that let it throw would be a
   * 500 where section 3 requires "the snapshot data with an UNVERIFIED chip,
   * never a crash". `attempt` is what turns the throw into something
   * renderable.
   */
  const snapshot = await resolveSnapshot();
  const attempted = await attempt(() => api().getPools());
  const view = attempted.ok ? attempted.value : null;
  // The block heading names the flow window when there is one and says so when
  // there is not, rather than rendering an empty dash where a window belongs.
  const blockARight =
    view === null
      ? "value crossing each boundary, public by construction - window not measured"
      : `${view.flowWindow} - value crossing each boundary, public by construction`;

  return (
    <>
      <TrackHead
        title="Between the"
        accent="pools"
        dek={
          <>
            Every crossing between the transparent world and a shielded pool, and between one pool and another, is public by
            construction: the amounts are in the clear even when the endpoints are not. What follows is all of them for the
            last day, the balances they add up to, and the share of the supply whose soundness nobody can prove either way.
          </>
        }
      />

      <TrackNav path="/pools" />

      <Block idx="A" title="Between the pools" right={blockARight}>
        <div className="grid g-chart">
          <Glass className="tk-sankey-card">
            {view === null ? (
              <NotMeasured
                panel="pool crossings"
                condition="the gateway did not answer, and the published document carries lane balances rather than per-boundary flows"
              />
            ) : (
              <PoolSankey view={view} />
            )}
          </Glass>

          <Glass>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              <b>balances now</b>
              {attempted.ok ? null : (
                <>
                  {" "}
                  <Unverified reason={attempted.reason} />
                </>
              )}
            </div>
            <div className="tbl-wrap" tabIndex={0}>
              <table className="tk-pooltbl">
                <caption className="sr-only">{`Pool balances at height ${fmtInt(snapshot.doc.height)}, with the consensus rule that governs each.`}</caption>
                <thead>
                  <tr>
                    <th scope="col">Pool</th>
                    <th scope="col" className="mono">
                      ZEC
                    </th>
                    <th scope="col" className="mono">
                      share
                    </th>
                    <th scope="col">rule</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.doc.pools.map((lane) => (
                    <tr key={lane.lane}>
                      <td>
                        <i className={`sw ${POOL_SW[lane.lane as PoolKey]}`} aria-hidden="true" />
                        {POOL_LABEL[lane.lane as PoolKey]}
                      </td>
                      <td className="mono">{zatToZecGrouped(lane.balanceZat, 0)}</td>
                      <td className="mono">{fmtPct(lane.share)}</td>
                      <td className="cp">{POOL_RULE[lane.lane as PoolKey]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/*
              THE `source:` CHIP GOES HERE AND NOWHERE ELSE. 04a's surface list,
              which fold 2 of the L2 RESOLUTION for HANDOFF-04b makes binding:
              "inside the disclosure that carries the derivation, next to the
              count in the `<summary>` - never floating beside a value, which is
              what made the PUBLISHED group unreadable." It used to float: this
              panel's eyebrow read `balances now - {view.source}`, a provenance
              string set beside a heading with nothing to attach it to.

              The TABLE stays in the open, because the table is the measurement.
              What goes behind the toggle is the DERIVATION - which block, which
              document, when it was published - which is the collapse rule 04a
              states: collapse the derivation, never the claim.
            */}
            <details className="cite" data-ui="balance-derivation">
              <summary>
                <span className="cite-id">derivation</span>
                <span className="cite-date">{`${snapshot.doc.pools.length} lanes at height ${fmtInt(snapshot.doc.height)}`}</span>
                <span className="cite-verb">{`source: ${snapshot.source}`}</span>
              </summary>
              <div className="cite-body">
                <dl>
                  <dt>document</dt>
                  <dd className="mono">{`SnapshotV1 schema ${String(snapshot.doc.schema)}, block ${fmtInt(snapshot.doc.height)}`}</dd>
                  <dt>block hash</dt>
                  <dd className="mono">{snapshot.doc.hash}</dd>
                  <dt>block time</dt>
                  <dd className="mono">{snapshot.doc.time}</dd>
                  <dt>published</dt>
                  <dd className="mono">{snapshot.doc.publishedAt}</dd>
                  <dt>resolved from</dt>
                  <dd className="mono">{snapshot.source}</dd>
                </dl>
                <p className="note">
                  Balances are the five lanes the publisher writes on every tip. The share column is each lane over the
                  supply the node reported at that height, which is why the five sum to one and why a lane cannot be
                  compared against a figure taken at another height.
                </p>
              </div>
            </details>

            {view === null ? (
              <NotMeasured
                panel="unprovable residual"
                condition="the gateway did not answer, and the published document carries no residual for this height"
              />
            ) : (
              <>
                <div className="tk-residual" data-ui="residual">
                  <div className="l">unprovable residual - sprout and orchard</div>
                  <div className="v">{zatToZecGrouped(view.residual.zat, 0)}</div>
                  <div className="l" style={{ color: "var(--ink-dim)", letterSpacing: "0.12em", marginTop: 4 }}>
                    {`ZEC - ${fmtPct(view.residual.share, 2)} of supply - verified share ${fmtPct(view.residual.verifiedShare, 2)}`}
                  </div>
                </div>
                <p className="note" style={{ marginTop: 10, fontSize: 12 }}>
                  {view.residual.note}
                </p>
              </>
            )}
          </Glass>
        </div>
      </Block>

      <Block idx="B" title="Pool balances, 2016 to 2026" right="stacked - shielded pools only - annotated with the two unsound windows">
        <Glass>
          {view === null ? (
            <NotMeasured panel="balance history" condition="the gateway did not answer, and a snapshot carries one height rather than a series" />
          ) : (
            <PoolHistory view={view} />
          )}
        </Glass>
      </Block>

      <Block idx="C" title="The Ironwood migration" right="ZIP 318 - drain, denominations, and what an early anchor bounds">
        <div className="grid g3">
          <Glass>
            {view === null ? (
              <NotMeasured panel="drain" condition="no block time or no baseline for this height" />
            ) : (
              <OrchardDrain view={view} />
            )}
          </Glass>
          <Glass>
            {view === null ? (
              <NotMeasured panel="migration histogram" condition="no migration window was read" />
            ) : (
              <MigrationLens view={view} />
            )}
          </Glass>
          <Glass>
            {view === null ? (
              <NotMeasured panel="N_eff series" condition="no Ironwood spend in the window could be bounded" />
            ) : (
              <ClaimDistribution view={view} />
            )}
          </Glass>
        </div>
      </Block>

      <Block idx="D" title="What this page does not claim" right="the residual is a bound, not an accusation">
        <Glass>
          <p className="note measure">
            The unprovable residual is a statement about verification, not about behaviour. Sprout&apos;s soundness rested on
            the BCTV14 construction, whose key generation emitted the bypass elements found in 2018 (CVE-2019-7167), and
            Orchard&apos;s on the circuit that carried the 2026 counterfeiting bug;
            neither balance can be proven free of counterfeit value, and neither is claimed to contain any. Nobody has shown
            that a single counterfeit note exists in either. The number is here because the honest answer to &quot;is the
            supply sound&quot; is &quot;95.67 percent of it is provably so&quot;, and rounding that to yes would be the same
            move this site spends the rest of its pages objecting to.
          </p>
          <p className="note measure" style={{ marginTop: 12 }}>
            The migration lens counts denominations and never attributes one. A canonical amount is a property of ZIP 318, not
            a fingerprint of a wallet: every wallet migrating the same balance emits the same denomination run, which is what
            makes the ladder a privacy feature rather than a leak. The distribution is plotted because the shape of a day is
            worth seeing. No row of it belongs to anyone.
          </p>
        </Glass>
      </Block>
    </>
  );
}
