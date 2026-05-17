import { useEffect, useState } from "react";
import { useMempool } from "./hooks/useMempool";
import { Header } from "./components/Header";
import { MarqueeTape } from "./components/MarqueeTape";
import { MempoolStream } from "./components/MempoolStream";
import { LeakPanel } from "./components/LeakPanel";
import { AnchorDepthChart } from "./components/AnchorDepthChart";
import { ValueBalanceMonitor } from "./components/ValueBalanceMonitor";
import { NullifierFeed } from "./components/NullifierFeed";
import { TrackingPanel } from "./components/TrackingPanel";

export function App() {
  const { reports, tipHeight, connected } = useMempool();
  const [selectedTxid, setSelectedTxid] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTxid === null && reports.length > 0) {
      setSelectedTxid(reports[0]!.txid);
    }
  }, [reports, selectedTxid]);

  useEffect(() => {
    if (selectedTxid && !reports.some((r) => r.txid === selectedTxid)) {
      setSelectedTxid(reports[0]?.txid ?? null);
    }
  }, [reports, selectedTxid]);

  const selectedReport = reports.find((r) => r.txid === selectedTxid) ?? null;

  return (
    <div className="relative min-h-screen grain">
      <MarqueeTape reports={reports} />
      <Header
        tipHeight={tipHeight}
        mempoolSize={reports.length}
        connected={connected}
        selectedTxid={selectedTxid}
      />
      <div className="hairline mx-4 lg:mx-8" />
      <main className="mx-2 mt-2 mb-2">
        <div
          className="hidden lg:grid lg:gap-2 lg:h-[calc(100vh-132px)]"
          style={{ gridTemplateColumns: "minmax(280px, 320px) 1fr minmax(280px, 320px)" }}
        >
          <div className="glass rounded-sm overflow-hidden relative">
            <MempoolStream reports={reports} selectedTxid={selectedTxid} onSelect={setSelectedTxid} />
          </div>
          <div className="glass-strong rounded-sm overflow-hidden relative">
            <LeakPanel report={selectedReport} />
          </div>
          <div className="glass rounded-sm overflow-y-auto flex flex-col">
            <TrackingPanel reports={reports} />
            <div className="hairline mx-4" />
            <AnchorDepthChart reports={reports} />
            <div className="hairline mx-4" />
            <ValueBalanceMonitor reports={reports} />
            <div className="hairline mx-4" />
            <NullifierFeed reports={reports} />
          </div>
        </div>
        <div className="lg:hidden grid grid-cols-1 gap-2">
          <div className="glass rounded-sm overflow-hidden max-h-[55vh]">
            <MempoolStream reports={reports} selectedTxid={selectedTxid} onSelect={setSelectedTxid} />
          </div>
          <div className="glass-strong rounded-sm overflow-hidden">
            <LeakPanel report={selectedReport} />
          </div>
          <div className="glass rounded-sm overflow-hidden">
            <TrackingPanel reports={reports} />
            <div className="hairline mx-4" />
            <AnchorDepthChart reports={reports} />
            <div className="hairline mx-4" />
            <ValueBalanceMonitor reports={reports} />
            <div className="hairline mx-4" />
            <NullifierFeed reports={reports} />
          </div>
        </div>
      </main>
      <footer className="px-4 lg:px-8 py-3 flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
        <span>ZCashReveal v0.1.0 · shielded mempool forensics</span>
        <span>built for cypherpunks, not for compliance</span>
      </footer>
    </div>
  );
}
