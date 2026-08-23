import type { Metadata } from "next";
import Link from "next/link";

import { Sev, When, Zec } from "@/components/track/Amount";
import { StatedGap, TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block as Section } from "@/components/ui/Block";
import { DataTable } from "@/components/ui/DataTable";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Metric } from "@/components/ui/Metric";
import { Pill } from "@/components/ui/Pill";
import { api } from "@/lib/api";
import { ROUND_TRIP_HEIGHT } from "@/lib/api/fixtures/block";
import { fmtInt, zatToZecGrouped } from "@/lib/format";

export function generateStaticParams(): { height: string }[] {
  return [{ height: String(ROUND_TRIP_HEIGHT) }];
}

export async function generateMetadata({ params }: { params: Promise<{ height: string }> }): Promise<Metadata> {
  const { height } = await params;
  return {
    title: `Block ${height}`,
    description: "Per-pool deltas, coinbase and every transaction's public fields. The one query whose answer is exact all the way down.",
  };
}

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  // A height that is not a plain integer never reaches the API. `Number` would
  // happily turn "3e6" and " 12 " into numbers, and a route parameter is
  // untrusted input like any other.
  const n = /^[0-9]{1,9}$/.test(height) ? Number(height) : Number.NaN;
  const view = Number.isNaN(n) ? null : await api().getBlock(n);

  return (
    <>
      <TrackHead
        title="Everything in a block is"
        accent="exact"
        dek={
          <>
            A block publishes its transactions&apos; public fields, its per-pool deltas, its coinbase and its funding-stream
            outputs, in full and without ambiguity. There is no candidate set to narrow here and no assumption to print, which
            makes this the only Tracking surface with no inference chain on it - and the reason it is worth having beside the
            others.
          </>
        }
      />

      <TrackNav path={`/block/${height}`} />

      {view === null ? (
        <StatedGap what="one block" query={height}>
          The one it carries is <Link href={`/block/${ROUND_TRIP_HEIGHT}`}>{fmtInt(ROUND_TRIP_HEIGHT)}</Link>, the block the 2
          January unshield confirmed in. HANDOFF-05 puts a gateway behind this route.
        </StatedGap>
      ) : (
        <>
          <div className="tk-head">
            <div>
              <div className="eyebrow">
                <b>block</b> - <When stamp={view.stamp} /> UTC
              </div>
              <div className="tk-addr">{fmtInt(view.height)}</div>
              <p className="cp" style={{ marginTop: 8, wordBreak: "break-all" }}>
                {view.hash}
              </p>

              <div className="tk-balrow">
                <Metric label="transactions" value={fmtInt(view.txCount)} sub={<><Pill kind="exact" /> including the coinbase</>} />
                <Metric label="size" value={`${(view.sizeBytes / 1000).toFixed(1)} kB`} sub="serialised" />
                <Metric
                  label="net pool movement"
                  value={zatToZecGrouped(view.deltas.reduce((a, d) => a + d.deltaZat, 0n), 4)}
                  sub="positive leaves the pools"
                  accent
                />
                <Metric label="coinbase" value={zatToZecGrouped(view.coinbase.totalZat, 4)} sub="block subsidy, ZIP 1015" />
              </div>
            </div>

            <Glass>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                <b>where the subsidy goes</b>
              </div>
              <KV
                entries={view.coinbase.lines.map((l) => ({
                  k: l.k,
                  v: l.muted ? <span style={{ color: "var(--ink-mute)" }}>{l.v}</span> : l.v,
                }))}
              />
            </Glass>
          </div>

          <Section idx="A" title="Per-pool deltas" right="positive leaves the pool, negative enters it - both public by construction">
            <Glass>
              <KV
                entries={view.deltas.map((d) => ({
                  k: d.pool,
                  v: d.deltaZat === 0n ? <span style={{ color: "var(--ink-mute)" }}>no movement</span> : <Zec zat={d.deltaZat} />,
                }))}
              />
            </Glass>
          </Section>

          <Section idx="B" title="Transactions" right={`${fmtInt(view.transactions.length)} - in block order`}>
            <DataTable
              caption={`Every transaction in block ${fmtInt(view.height)}, in block order.`}
              rowKey={(r) => r.txid}
              rows={view.transactions}
              columns={[
                {
                  key: "txid",
                  head: "txid",
                  mono: true,
                  cell: (r) =>
                    r.txid === "0".repeat(64) ? (
                      <span style={{ color: "var(--ink-mute)" }}>coinbase</span>
                    ) : (
                      <Link href={`/tx/${r.txid}`} title={r.txid}>{`${r.txid.slice(0, 10)}...`}</Link>
                    ),
                },
                { key: "ver", head: "ver", mono: true, cell: (r) => r.version },
                { key: "flow", head: "flow", cell: (r) => <span className="cp">{r.flow}</span> },
                { key: "value", head: "value", mono: true, cell: (r) => <span className="cp">{r.valueText}</span> },
                { key: "sev", head: "sev", cell: (r) => <Sev level={r.severity} /> },
              ]}
            />
            <p className="note" style={{ marginTop: 10, fontSize: 12, maxWidth: "72ch" }}>
              {view.note}
            </p>
          </Section>
        </>
      )}
    </>
  );
}
