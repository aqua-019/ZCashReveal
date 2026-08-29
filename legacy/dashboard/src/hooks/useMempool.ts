import { useEffect, useMemo, useRef, useState } from "react";
import { WsClient } from "../lib/ws";
import { MOCK_REPORTS, MOCK_TIP_HEIGHT, MOCK_POOL_SNAPSHOT } from "../lib/mockData";
import type { PoolStateSummary } from "../components/PoolStatePanel";

/**
 * Wire-shape assessment carried on each SpendAnnotation and LinkRecord.
 * bigints are JSON-encoded as strings; consumers parse at the boundary
 * via lib/parsers.parseAssessment. Mirrors @zcashreveal/types'
 * ClaimAssessment but with the bigint fields stringified.
 */
export type RawAssessment = {
  pool: LegacyPool;
  anchorRoot: string;
  rawCount: string;
  effectiveSetSize: string;
  entropyBits: number;
  claimLevel:
    | "aggregate_only"
    | "broad_candidate_set"
    | "small_heuristic_set"
    | "requires_disclosure";
  /**
   * The audit trail, as UNVALIDATED JSON.
   *
   * THIS WAS A TWO-MEMBER UNION NAMING `time_window` AND `amount_match`, and it
   * was wrong in the way this file's docblock below already describes for the
   * pool fields: "a narrow union in a cast is not a type error - it is a
   * silently dropped field". When HANDOFF-08 added `amount_echo` and
   * `conservation` to the producer, the wire began carrying records this type
   * said were impossible - and `parseFilterApplication` had an implicit else
   * that coerced them into `amount_match` and called `asHex(undefined)`, a throw
   * inside a React render at `LeakPanel.tsx:518`. A gate lens caught it.
   *
   * `params` is `unknown` because that is what it is: this app parses no schema,
   * it casts a `JSON.parse` result. Writing a narrower type here does not make
   * the wire narrower, it only moves the failure from a place the compiler can
   * see to a place it cannot. The parser coerces defensively and refuses to
   * invent a shape it was not given.
   */
  appliedFilters: Array<{
    filter: string;
    params: Record<string, unknown>;
    countIn: string;
    countOut: string;
  }>;
};

/**
 * The four pools, as the wire sends them - written out here because this app
 * parses no schema.
 *
 * legacy/dashboard is v0.2, parked read-only and retired at the HANDOFF-11
 * cutover, and it consumes the WS payload through a `JSON.parse` cast rather
 * than through `packages/zec-types`. So every shape below is a hand-written
 * mirror with no tripwire: when the producer widened from two pools to four,
 * `Record<LeakClass, string>` in `lib/tokens.ts` broke the build and these
 * unions did not, because a narrow union in a cast is not a type error - it is
 * a silently dropped field.
 *
 * Seven `pool` fields declared `"sapling" | "orchard"` while the indexer had
 * been emitting `pool: "sprout"` since HANDOFF-06 and started emitting
 * `pool: "ironwood"` in HANDOFF-07, and `poolPath` declared the four members of
 * a two-pool cross-product while `poolPath()` now returns sixteen. A gate round
 * found them.
 *
 * `scripts/check-pool-union.mjs` scans `packages` and `apps` and not `legacy`,
 * which is why it did not. Widening the scan is a decision about a retired app
 * and belongs to whoever retires it; correcting these eight unions costs
 * nothing and stops the app from silently discarding a pool it does render.
 *
 * WHAT IS DELIBERATELY NOT FIXED HERE. `RawReport.bundle` still declares no
 * Ironwood fields, so `NullifierFeed` and `ValueBalanceMonitor` show no
 * Ironwood activity. That is an omission rather than a false statement, and
 * closing it properly means rendering the pool, not declaring it: a field this
 * app parses and never draws would be "declared everywhere, exercised nowhere"
 * in the one place this project has already retired. The panels are switched
 * off at the HANDOFF-11 cutover.
 */
type LegacyPool = "sprout" | "sapling" | "orchard" | "ironwood";

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
      nullifiers: Array<{ pool: LegacyPool; value: string }>;
      commitments: Array<{ pool: LegacyPool; value: string }>;
    };
    recipient: {
      transparentAddresses: string[];
      nullifiers: Array<{ pool: LegacyPool; value: string }>;
      commitments: Array<{ pool: LegacyPool; value: string }>;
    };
  };
  spends: Array<{
    pool: LegacyPool;
    index: number;
    nullifier: string;
    anchor: string;
    anchorHeight: number | null;
    anchorDepthBlocks: number | null;
    isRecentAnchor: boolean;
    severity: string;
    assessment?: RawAssessment;
  }>;
  outputs: Array<{ pool: LegacyPool; index: number; commitment: string }>;
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
    poolPath: LegacyPool | `${LegacyPool}→${LegacyPool}`;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    assessment?: RawAssessment;
  }>;
}

export interface ChainStateSnapshot {
  readonly sapling: PoolStateSummary;
  readonly orchard: PoolStateSummary;
}

export type { RawReport };

export interface MempoolView {
  reports: RawReport[];
  tipHeight: number | null;
  connected: boolean;
  /**
   * Per-pool state snapshot. Populated in mock mode; null in live mode
   * until Module 7 plumbs a real source. Consumers must handle null
   * gracefully (App.tsx skips PoolStatePanel rendering).
   */
  snapshot: ChainStateSnapshot | null;
}

const MAX_REPORTS = 250;
const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8080/stream";
const MOCK_MODE = (import.meta.env.VITE_MOCK_MODE as string | undefined) === "true";

export function useMempool(): MempoolView {
  const [reports, setReports] = useState<RawReport[]>(() => MOCK_MODE ? MOCK_REPORTS : []);
  const [tipHeight, setTipHeight] = useState<number | null>(() => MOCK_MODE ? MOCK_TIP_HEIGHT : null);
  const [connected, setConnected] = useState(MOCK_MODE);
  const [snapshot] = useState<ChainStateSnapshot | null>(() =>
    MOCK_MODE ? MOCK_POOL_SNAPSHOT : null,
  );
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

  return useMemo(
    () => ({ reports, tipHeight, connected, snapshot }),
    [reports, tipHeight, connected, snapshot],
  );
}
