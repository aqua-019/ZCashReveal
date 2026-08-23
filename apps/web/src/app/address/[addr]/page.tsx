import type { Metadata } from "next";
import Link from "next/link";

import { Exact, Sev, When, Zec } from "@/components/track/Amount";
import { BalanceStep, InteractionGraph } from "@/components/track/Charts";
import { EstimateCell } from "@/components/track/EstimatePanel";
import { StatedGap, TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Conf } from "@/components/ui/Conf";
import { Glass } from "@/components/ui/Glass";
import { Metric } from "@/components/ui/Metric";
import { api } from "@/lib/api";
import { LOCKBOX } from "@/lib/api/fixtures/address";
import { fmtInt, zatToZecGrouped } from "@/lib/format";

/**
 * Prerender the one address the fixture corpus answers for.
 *
 * `dynamicParams` stays true so any other address still renders - as the stated
 * gap below, on demand - rather than 404ing. A 404 would say "no such address",
 * and the true statement is that the chain has it and this build does not.
 */
export function generateStaticParams(): { addr: string }[] {
  return [{ addr: LOCKBOX }];
}

export async function generateMetadata({ params }: { params: Promise<{ addr: string }> }): Promise<Metadata> {
  const { addr } = await params;
  return {
    title: `Address ${addr.slice(0, 10)}...`,
    description: "Transparent balance and history, exact; the pool side of every boundary event, bounded, with its reasoning.",
  };
}

const DIR_CLASS: Readonly<Record<string, string>> = {
  "z-to-t": "in",
  coinbase: "in",
  "t-to-z": "shield",
  "t-to-t": "flat",
  migration: "shield",
};

export default async function AddressPage({ params }: { params: Promise<{ addr: string }> }) {
  const { addr } = await params;
  const view = await api().getAddress(addr);

  return (
    <>
      <TrackHead
        title="Follow the"
        accent="value"
        dek={
          <>
            A transparent address is as public as a Bitcoin one: every UTXO, every spend, every counterparty and every amount
            is on the chain and is returned exactly. What it put into a shielded pool is exact too. Where that value went
            afterwards is not, and every row below that crosses the boundary carries the estimate and the assumptions instead
            of an answer.
          </>
        }
      />

      <TrackNav path={`/address/${addr.slice(0, 12)}...`} />

      {view === null ? (
        <StatedGap what="one address" query={addr}>
          The lockbox is the one it carries:{" "}
          <Link href={`/address/${LOCKBOX}`}>t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo</Link>. HANDOFF-05 puts a gateway behind this
          route and HANDOFF-11 puts it on live data, at which point every address on the chain answers here.
        </StatedGap>
      ) : (
        <>
          <div className="tk-head">
            <div>
              <div className="eyebrow">
                <b>address</b> - {view.scriptText}
              </div>
              <div className="tk-addr">{view.address}</div>

              {view.label === null ? (
                <p className="tk-label">
                  no label - and this site will not invent one
                  <span className="prov">unlabelled</span>
                </p>
              ) : (
                <p className={`tk-label ${view.label.labeller}`} data-labeller={view.label.labeller}>
                  {view.label.label}
                  <span className="prov">{`label: ${view.label.labeller} - precedence ${view.label.rank} of 5`}</span>
                  <Conf level={view.label.confidence} />
                </p>
              )}

              <div className="tk-balrow">
                <Metric
                  label="balance"
                  value={zatToZecGrouped(view.balanceZat, 4)}
                  sub={
                    <>
                      <Exact kind={view.exactness} /> {view.balanceNote}
                    </>
                  }
                />
                <Metric label="received" value={zatToZecGrouped(view.receivedZat, 4)} sub={view.receivedNote} />
                <Metric label="sent" value={zatToZecGrouped(view.sentZat, 4)} sub={view.sentNote} />
                <Metric
                  label="net to pool"
                  value={zatToZecGrouped(view.netToPoolZat, 4)}
                  sub={view.netToPoolNote}
                  // Value crossing a pool boundary: gold's third licensed job.
                  accent
                />
              </div>
            </div>

            <Glass>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                <b>reasoning</b> - why we can say what we say
              </div>
              <ol className="reason" style={{ listStyle: "none", padding: "0 0 0 14px" }} aria-label="Why this page can say what it says">
                {view.reasoning.map((r, i) => (
                  <li className="r" key={r.title}>
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      <b>{r.title}.</b> {r.body} {r.confidence === null ? null : <Conf level={r.confidence} />}
                    </span>
                  </li>
                ))}
              </ol>
            </Glass>
          </div>

          <Block idx="A" title="Shape" right="balance as a step - counterparties as a graph">
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Glass>
                <BalanceStep points={view.balances} />
              </Glass>
              <Glass>
                <InteractionGraph interactions={view.interactions} note={view.interactionNote} />
              </Glass>
            </div>
          </Block>

          <Block
            idx="B"
            title="Transactions"
            right={`${fmtInt(view.transactions.length)} - newest first - pool-side estimates attached to boundary events`}
          >
            <div className="tbl-wrap" tabIndex={0}>
              <table className="tk-txt">
                <caption className="sr-only">
                  Every transaction touching this address, newest first, with the pool-side estimate for each boundary event.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Height and time (UTC)</th>
                    <th scope="col">Direction</th>
                    <th scope="col" className="mono">
                      Amount
                    </th>
                    <th scope="col">Counterparty</th>
                    <th scope="col">Pool-side estimate</th>
                    <th scope="col">txid</th>
                  </tr>
                </thead>
                <tbody>
                  {view.transactions.map((t) => (
                    <tr key={t.txid}>
                      <td className="mono">
                        {fmtInt(t.height)}
                        <br />
                        <When stamp={t.stamp} />
                      </td>
                      <td>
                        <span className={`tk-dir ${DIR_CLASS[t.direction] ?? "flat"}`}>{t.directionText}</span>
                      </td>
                      <td>
                        <Zec zat={t.amountZat} {...(t.amountNote === undefined ? {} : { note: t.amountNote })} />
                      </td>
                      <td className="cp">
                        <b>{t.counterparty.title}</b>
                        <br />
                        {t.counterparty.detail}
                      </td>
                      <td>
                        <EstimateCell estimate={t.estimate} note={t.poolNote} />
                      </td>
                      <td className="mono">
                        <Link href={`/tx/${t.txid}`} title={t.txid}>
                          {`${t.txid.slice(0, 8)}...`}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.note === null ? null : (
              <p className="note" style={{ marginTop: 10, fontSize: 12, maxWidth: "72ch" }}>
                <b>Explorer note.</b> {view.note}
              </p>
            )}
          </Block>

          <Block idx="C" title="What this page does not return" right="stated, not omitted">
            <Glass>
              <p className="note" style={{ maxWidth: "72ch" }}>
                Who signed either spend. Where the {zatToZecGrouped(view.netToPoolZat, 4)} ZEC that has not come back went.
                Whether anything was sold, and to whom. Every one of the three would need a signal from outside the chain, and
                none of the three is derivable from what is on it. The site says so here rather than leaving the absence to be
                read as an oversight. <Sev level="INFO" />
              </p>
            </Glass>
          </Block>
        </>
      )}
    </>
  );
}
