"use client";

import { useEffect, useMemo, useState } from "react";

import type { MempoolRow, MempoolView } from "@zcashreveal/types";

import { Sev } from "@/components/track/Amount";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import type { SocketState } from "@/lib/api/socket";
import { subscribeFrames } from "@/lib/api/stream";
import { fmtElapsed, fmtInt } from "@/lib/format";

const LANE_VAR: Readonly<Record<string, string>> = {
  transparent: "var(--p-transparent)",
  sprout: "var(--p-sprout)",
  sapling: "var(--p-sapling)",
  orchard: "var(--p-orchard)",
  ironwood: "var(--p-ironwood)",
};

const STATE_TEXT: Readonly<Record<SocketState, string>> = {
  open: "live",
  connecting: "reconnecting",
  closed: "stopped",
};

/**
 * The mempool: a dense table and a detail panel.
 *
 * SERVER-RENDERED FIRST. The component is handed the snapshot the page already
 * fetched, so the table is in the HTML before any script runs and a reader with
 * JavaScript off sees twelve real rows rather than a spinner. The subscription
 * upgrades it; it does not create it. That also means the Playwright assertions
 * about this table are assertions about shipped output.
 *
 * THE SOCKET IS THE REAL ONE. In fixture mode `subscribeFrames` drives
 * `ZecSocket` over a committed stream rather than a WebSocket, so the reconnect
 * schedule, the frame parsing and this component's state machine are the same
 * code in both modes. The stream deliberately closes after each cycle, which is
 * why the badge in the corner spends part of its life saying "reconnecting":
 * that is the reconnect path running in normal operation rather than only under
 * fault, and it is visible on purpose.
 *
 * WHY A BADGE AT ALL. A panel showing chain data that has silently stopped
 * updating is worse than one that says so. The badge is the same argument as
 * the snapshot-age line in the footer.
 */
export function MempoolPanel({ initial }: { readonly initial: MempoolView }) {
  const [view, setView] = useState<MempoolView>(initial);
  const [state, setState] = useState<SocketState>("connecting");
  const [selected, setSelected] = useState<string>(initial.entries[0]?.txid ?? "");

  useEffect(() => {
    // `subscribeFrames` rather than `api().subscribe`: identical code path,
    // and it does not pull the address, transaction, pools and flows fixtures
    // - or the whole content seed corpus behind the label fixture - into the
    // browser bundle. It returns its own unsubscribe, so a component cannot
    // accidentally tear down someone else's.
    const stop = subscribeFrames((frame) => {
      switch (frame.type) {
        case "snapshot":
          setView(frame.view);
          setState("open");
          break;
        case "tx_added":
          setState("open");
          setView((v) => {
            // Dedupe by txid, newest first, and cap the list. The legacy
            // dashboard capped at 250; twelve committed rows never reach it,
            // and the cap is here so the live path cannot grow without bound.
            const rest = v.entries.filter((e) => e.txid !== frame.entry.txid);
            return { ...v, entries: [frame.entry, ...rest].slice(0, 250) };
          });
          break;
        case "tx_removed":
          setView((v) => ({ ...v, entries: v.entries.filter((e) => e.txid !== frame.txid) }));
          break;
        case "tip":
          setView((v) => ({ ...v, tipHeight: frame.height }));
          break;
        case "hello":
          setState("open");
          break;
      }
    });
    return stop;
  }, []);

  const rows = view.entries;
  const detail = useMemo(() => rows.find((r) => r.txid === selected) ?? rows[0], [rows, selected]);

  return (
    <div className="tk-mp-grid">
      <Glass padded={false} className="tk-mp-scroll">
        <table className="tk-mp" data-ui="mempool-table">
          <caption className="sr-only">
            {`Unconfirmed transactions, newest first. ${fmtInt(rows.length)} in the pool at height ${fmtInt(view.tipHeight)}.`}
          </caption>
          <thead>
            <tr>
              <th scope="col">txid</th>
              <th scope="col">age</th>
              <th scope="col">ver</th>
              <th scope="col">flow</th>
              <th scope="col">pools</th>
              <th scope="col">valueBalance</th>
              <th scope="col">fee to L</th>
              <th scope="col">wallet guess</th>
              <th scope="col">findings</th>
              <th scope="col">sev</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.txid}
                data-txid={r.txid}
                {...(r.txid === detail?.txid ? { "aria-selected": true as const } : {})}
                onClick={() => {
                  setSelected(r.txid);
                }}
              >
                <td className="id">
                  {/* A button, not a click handler on a cell: the row has to be
                      reachable and operable from the keyboard, and a real
                      button is the only thing that is both without
                      re-implementing focus, Enter and Space by hand. */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r.txid);
                    }}
                    aria-pressed={r.txid === detail?.txid}
                  >
                    {`${r.txid.slice(0, 8)}...${r.txid.slice(-6)}`}
                  </button>
                </td>
                <td className="mono" style={{ color: "var(--ink-mute)" }}>
                  {fmtElapsed(0, r.ageSeconds * 1000)}
                </td>
                <td className="mono">{r.version}</td>
                <td className="fl">
                  <i>{r.flow}</i>
                </td>
                <td>
                  <span className="tk-lanes">
                    {r.lanes.map((l) => (
                      <i key={l} style={{ background: LANE_VAR[l] }} title={l} />
                    ))}
                  </span>
                </td>
                <td className="tk-vb">{r.valueBalanceText}</td>
                <td className="mono">{`${fmtInt(Number(r.feeZat))} to ${r.logicalActions}`}</td>
                <td className="cp">{r.walletGuess}</td>
                <td className="cp">{r.finding}</td>
                <td>
                  <Sev level={r.severity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Glass>

      <Glass>
        <div className="tk-ph">
          <h3 className="mono">{detail?.txid ?? "-"}</h3>
          <span className="r" data-state={state}>
            {detail === undefined ? "" : `${detail.version} - ${fmtElapsed(0, detail.ageSeconds * 1000)}`}
          </span>
        </div>

        <p className="tk-conn" data-state={state} data-ui="mempool-state">
          <span className="dot" aria-hidden="true" />
          {STATE_TEXT[state]}
          <span className="sr-only">{` - the mempool feed is ${STATE_TEXT[state]}`}</span>
        </p>

        {detail === undefined ? null : (
          <>
            <div style={{ marginTop: 12 }}>
              <KV
                entries={[
                  { k: "flow", v: `${detail.flow} - ${detail.class}` },
                  { k: "valueBalance", v: detail.valueBalanceText },
                  { k: "fee", v: `${fmtInt(Number(detail.feeZat))} zat to L = ${detail.logicalActions} logical actions` },
                  { k: "wallet guess", v: detail.walletGuess },
                  { k: "severity", v: <Sev level={detail.severity} /> },
                ]}
              />
            </div>
            <hr className="hair" />
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              <b>reasoning</b>
            </div>
            <ol className="reason" style={{ listStyle: "none", padding: "0 0 0 14px" }} aria-label="Why this transaction is classified as it is">
              {detail.reasoning.map((line, i) => (
                <li className="r" key={line}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
            <p className="assume">
              Assumptions are printed with every estimate, and a finding is never an identity. Nothing in this panel names a
              sender, a recipient or an owner, because none of the three is in what a transaction publishes.
            </p>
          </>
        )}
      </Glass>
    </div>
  );
}

/** The reasoning a row of the given class carries, for the server-rendered fallback. */
export function reasoningFor(row: MempoolRow): readonly string[] {
  return row.reasoning;
}
