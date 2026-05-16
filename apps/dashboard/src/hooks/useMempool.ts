import { useEffect, useMemo, useRef, useState } from "react";
import { WsClient } from "../lib/ws";
import { MOCK_REPORTS, MOCK_TIP_HEIGHT } from "../lib/mockData";

interface RawReport {
  txid: string;
  seenAt: number;
  tipHeightAtSeen: number;
  txVersion: number;
  leakClass: string;
  overallSeverity: string;
  bundle: {
    saplingSpends: Array<{ index: number; nullifier: string; anchor: string; cv: string; rk: string; pool: "sapling" }>;
    saplingOutputs: Array<{ index: number; cmu: string; cv: string; ephemeralKey: string; encCiphertextSize: number; outCiphertextSize: number; pool: "sapling" }>;
    saplingValueBalanceZat: string;
    orchardActions: Array<{ index: number; nullifier: string; cmx: string; cv: string; rk: string; ephemeralKey: string; encCiphertextSize: number; outCiphertextSize: number; pool: "orchard" }>;
    orchardValueBalanceZat: string;
    orchardAnchor: string | null;
    orchardFlags: { enableSpends: boolean; enableOutputs: boolean } | null;
  };
  transparent: {
    vin: Array<{ index: number; coinbase: boolean; prevTxid?: string; prevVout?: number; address: string | null; sequence: number }>;
    vout: Array<{ index: number; valueZat: string; addresses: string[]; scriptType: string }>;
  };
  identity: {
    sender: {
      transparentAddresses: string[];
      nullifiers: Array<{ pool: "sapling" | "orchard"; value: string }>;
      commitments: Array<{ pool: "sapling" | "orchard"; value: string }>;
    };
    recipient: {
      transparentAddresses: string[];
      nullifiers: Array<{ pool: "sapling" | "orchard"; value: string }>;
      commitments: Array<{ pool: "sapling" | "orchard"; value: string }>;
    };
  };
  spends: Array<{ pool: "sapling" | "orchard"; index: number; nullifier: string; anchor: string; anchorHeight: number | null; anchorDepthBlocks: number | null; isRecentAnchor: boolean; severity: string }>;
  outputs: Array<{ pool: "sapling" | "orchard"; index: number; commitment: string }>;
  valueFlow: {
    saplingValueBalanceZat: string;
    orchardValueBalanceZat: string;
    netTransparentInflowZat: string;
    isPureShielded: boolean;
    crossesPoolBoundary: boolean;
    direction: "DEPOSIT" | "WITHDRAWAL" | "INTRA_POOL" | "NONE";
  };
  fingerprint: {
    outputCount: number;
    spendCount: number;
    outputPadded: boolean;
    feeZat: string;
    isZip317ConventionalFee: boolean;
    expiryDelta: number | null;
    hasMemo: boolean;
    likelyWallet: string;
  };
  findings: Array<{ code: string; severity: string; message: string; field?: string }>;
  links: Array<{
    shieldingTxid: string;
    unshieldingTxid: string;
    senderAddress: string | null;
    recipientAddress: string | null;
    amountZat: string;
    timeDeltaMs: number;
    matchKind: "EXACT" | "FEE_TOLERANT";
    poolPath: "sapling" | "orchard" | "sapling→orchard" | "orchard→sapling";
    confidence: "HIGH" | "MEDIUM" | "LOW";
  }>;
}

export type { RawReport };

export interface MempoolView {
  reports: RawReport[];
  tipHeight: number | null;
  connected: boolean;
}

const MAX_REPORTS = 250;
const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8080/stream";
const MOCK_MODE = (import.meta.env.VITE_MOCK_MODE as string | undefined) === "true";

export function useMempool(): MempoolView {
  const [reports, setReports] = useState<RawReport[]>(() => MOCK_MODE ? MOCK_REPORTS : []);
  const [tipHeight, setTipHeight] = useState<number | null>(() => MOCK_MODE ? MOCK_TIP_HEIGHT : null);
  const [connected, setConnected] = useState(MOCK_MODE);
  const clientRef = useRef<WsClient | null>(null);

  useEffect(() => {
    if (MOCK_MODE) {
      const interval = setInterval(() => {
        setReports((prev) => prev.map((r) => ({ ...r, seenAt: r.seenAt })));
      }, 5000);
      return () => clearInterval(interval);
    }

    const client = new WsClient(WS_URL);
    clientRef.current = client;

    const offOpen = client.on("__open", () => setConnected(true));
    const offClose = client.on("__close", () => setConnected(false));

    const offMempool = client.on("zcashreveal:mempool", (payload: unknown) => {
      const p = payload as { type?: string; report?: RawReport; reports?: RawReport[]; txid?: string };
      if (!p) return;
      if (p.type === "mempool_snapshot" && p.reports) {
        setReports(p.reports.slice(0, MAX_REPORTS));
      } else if (p.type === "tx_added" && p.report) {
        const newReport = p.report;
        setReports((prev) => {
          const filtered = prev.filter((r) => r.txid !== newReport.txid);
          return [newReport, ...filtered].slice(0, MAX_REPORTS);
        });
      } else if (p.type === "tx_removed" && p.txid) {
        const removedTxid = p.txid;
        setReports((prev) => prev.filter((r) => r.txid !== removedTxid));
      }
    });

    const offTip = client.on("zcashreveal:tip", (payload: unknown) => {
      const p = payload as { height?: number };
      if (typeof p?.height === "number") setTipHeight(p.height);
    });

    client.connect();

    return () => {
      offOpen();
      offClose();
      offMempool();
      offTip();
      client.close();
    };
  }, []);

  return useMemo(() => ({ reports, tipHeight, connected }), [reports, tipHeight, connected]);
}
