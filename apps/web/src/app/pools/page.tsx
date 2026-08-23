import type { Metadata } from "next";

import { ClaimDistribution, MigrationLens, OrchardDrain, PoolHistory, PoolSankey } from "@/components/track/Charts";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { api } from "@/lib/api";
import { POOL_SW, type PoolKey } from "@/lib/chain";
import { fmtInt, fmtPct, zatToZecGrouped } from "@/lib/format";

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
  const view = await api().getPools();

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

      <Block idx="A" title="Between the pools" right={`${view.flowWindow} - value crossing each boundary, public by construction`}>
        <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <Glass className="tk-sankey-card">
            <PoolSankey view={view} />
          </Glass>

          <Glass>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              <b>balances now</b> - {view.source}
            </div>
            <div className="tbl-wrap" tabIndex={0}>
              <table className="tk-pooltbl">
                <caption className="sr-only">{`Pool balances at height ${fmtInt(view.atHeight)}, with the consensus rule that governs each.`}</caption>
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
                  {view.balances.map((b) => (
                    <tr key={b.pool}>
                      <td>
                        <i className={`sw ${POOL_SW[b.pool as PoolKey]}`} aria-hidden="true" />
                        {b.label}
                      </td>
                      <td className="mono">{zatToZecGrouped(b.zat, 0)}</td>
                      <td className="mono">{fmtPct(b.share)}</td>
                      <td className="cp">{b.rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
          </Glass>
        </div>
      </Block>

      <Block idx="B" title="Pool balances, 2016 to 2026" right="stacked - shielded pools only - annotated with the two unsound windows">
        <Glass>
          <PoolHistory view={view} />
        </Glass>
      </Block>

      <Block idx="C" title="The Ironwood migration" right="ZIP 318 - drain, denominations, and what an early anchor bounds">
        <div className="grid g3">
          <Glass>
            <OrchardDrain view={view} />
          </Glass>
          <Glass>
            <MigrationLens view={view} />
          </Glass>
          <Glass>
            <ClaimDistribution view={view} />
          </Glass>
        </div>
      </Block>

      <Block idx="D" title="What this page does not claim" right="the residual is a bound, not an accusation">
        <Glass>
          <p className="note measure">
            The unprovable residual is a statement about verification, not about behaviour. Sprout&apos;s soundness rested on
            the 2016 Powers of Tau parameters and Orchard&apos;s on the circuit that carried the 2026 counterfeiting bug;
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
