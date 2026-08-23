import type { Metadata } from "next";
import Link from "next/link";

import { Sev, When, Zec } from "@/components/track/Amount";
import { EstimatePanel } from "@/components/track/EstimatePanel";
import { StatedGap, TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Metric } from "@/components/ui/Metric";
import { api } from "@/lib/api";
import { ROUND_TRIP_TXID } from "@/lib/api/fixtures/tx";
import { fmtInt } from "@/lib/format";

export function generateStaticParams(): { txid: string }[] {
  return [{ txid: ROUND_TRIP_TXID }];
}

export async function generateMetadata({ params }: { params: Promise<{ txid: string }> }): Promise<Metadata> {
  const { txid } = await params;
  return {
    title: `Transaction ${txid.slice(0, 10)}...`,
    description: "What a transaction publishes, exactly; and what can be inferred from it, bounded, with every filter and assumption printed.",
  };
}

export default async function TxPage({ params }: { params: Promise<{ txid: string }> }) {
  const { txid } = await params;
  const view = await api().getTx(txid);

  return (
    <>
      <TrackHead
        title="What a transaction"
        accent="publishes"
        dek={
          <>
            A Zcash transaction publishes its version, the pools it touches, its per-pool value balance, its nullifiers, its
            anchors, its commitments, and its transparent inputs and outputs. All of that is exact. The fee is not among them:
            a fee is the difference between the outputs a transaction spends and what it pays out, and the outputs it spends
            belong to earlier transactions, so it is computed here rather than read - and where an earlier output cannot be
            resolved, this page says so instead of naming a figure. What no transaction publishes is a sender inside the
            pool, and no amount of arithmetic on the rest produces one - so what follows the public fields is a candidate
            set, its filters, and the assumptions each filter rests on.
          </>
        }
      />

      <TrackNav path={`/tx/${txid.slice(0, 10)}...`} />

      {view === null ? (
        <StatedGap what="one transaction" query={txid}>
          The round trip is the one it carries:{" "}
          <Link href={`/tx/${ROUND_TRIP_TXID}`}>7ae85864...</Link>, the 2 January 2026 unshield that calibrated the relative
          amount tolerance. HANDOFF-05 puts a gateway behind this route.
        </StatedGap>
      ) : (
        <>
          <div className="tk-head">
            <div>
              <div className="eyebrow">
                <b>transaction</b> - {view.version} - block {fmtInt(view.height)} - <When stamp={view.stamp} /> - leak class{" "}
                {view.leakClass} - severity <Sev level={view.severity} />
              </div>
              <div className="tk-addr">
                {`${view.txid.slice(0, 8)}...`}{" "}
                <span style={{ color: "var(--ink-mute)", fontSize: "0.7em" }}>{view.summary}</span>
              </div>

              <div className="tk-balrow">
                {view.metrics.map((m) => (
                  <Metric key={m.label} label={m.label} value={m.value} sub={m.note} accent={m.accent} />
                ))}
              </div>
            </div>

            <Glass>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                <b>what this transaction publishes</b>
              </div>
              <KV
                entries={view.publishes.map((p) => ({
                  k: p.k,
                  v: p.muted ? <span style={{ color: "var(--ink-mute)" }}>{p.v}</span> : p.v,
                }))}
              />
            </Glass>
          </div>

          {view.estimate === null ? null : (
            <Block idx="A" title="The origin of the spent note" right="every filter, its cost, and what it assumes">
              <Glass>
                <EstimatePanel estimate={view.estimate} />
              </Glass>
            </Block>
          )}

          {view.roundTrip.length === 0 ? null : (
            <Block idx="B" title="The round trip" right="verified on chain - the endpoints are public and the middle is not">
              <Glass>
                {view.roundTrip.map((l) => (
                  <div className={l.shielded ? "tk-ledger sh" : "tk-ledger"} key={`${l.stamp.text}-${l.description}`}>
                    <span className="t">
                      <When stamp={l.stamp} />
                      {l.height === null ? null : ` - ${fmtInt(l.height)}`}
                    </span>
                    <span className="d">
                      {l.txid === null || l.txid === view.txid ? l.description : <Link href={`/tx/${l.txid}`}>{l.description}</Link>}
                    </span>
                    <span className="a">
                      {l.amountZat === null ? (
                        // Not a zero and not an estimate. There is no amount to
                        // print for an interval whose whole property is that it
                        // published nothing.
                        <span title="nothing observable">?</span>
                      ) : (
                        <Zec zat={l.amountZat} />
                      )}
                    </span>
                  </div>
                ))}
                {view.roundTripNote === null ? null : (
                  <p className="note" style={{ marginTop: 12, fontSize: 12, maxWidth: "72ch" }}>
                    {view.roundTripNote}
                  </p>
                )}
              </Glass>
            </Block>
          )}

          <Block idx="C" title="In its block" right="everything a block publishes is exact">
            <Glass>
              <p className="note" style={{ maxWidth: "72ch" }}>
                This transaction confirmed in block <Link href={`/block/${view.height}`}>{fmtInt(view.height)}</Link>, whose
                per-pool deltas, coinbase and funding-stream outputs are all public and all exact. A block is the one query on
                this site with no inference chain on it at all.
              </p>
            </Glass>
          </Block>
        </>
      )}
    </>
  );
}
