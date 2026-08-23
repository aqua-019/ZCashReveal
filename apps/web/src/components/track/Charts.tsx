/**
 * The Tracking suite's charts. Inline SVG, server-rendered, each with a table
 * twin.
 *
 * They reuse `Chart` and `ChartTable` from the Record rather than a second
 * wrapper, so the `figure[data-chart] > svg` + `> table` contract that assertion
 * A3 checks holds on the Instrument too. That is not bookkeeping: the Sankey
 * below carries the entire "value crossing a boundary" claim of the /pools page,
 * and a reader using a screen reader gets the numbers rather than the word
 * "image".
 *
 * NOTHING HERE ANIMATES and nothing here is random. Positions are pure
 * functions of the data; the only interaction is the Sankey's hover, which is
 * the site's one hover verb (dim the rest) expressed in CSS and nowhere else.
 */
import type { PoolsView } from "@zcashreveal/types";

import { Chart, ChartTable } from "@/components/record/Chart";
import { POOL_SW, type PoolKey } from "@/lib/chain";
import { fmtInt, zatToZecGrouped } from "@/lib/format";

const LANE_VAR: Readonly<Record<string, string>> = {
  transparent: "var(--p-transparent)",
  sprout: "var(--p-sprout)",
  sapling: "var(--p-sapling)",
  orchard: "var(--p-orchard)",
  ironwood: "var(--p-ironwood)",
};

const LANE_NAME: Readonly<Record<string, string>> = {
  transparent: "Transparent",
  sprout: "Sprout",
  sapling: "Sapling",
  orchard: "Orchard",
  ironwood: "Ironwood",
};

const zecOf = (zat: bigint): number => Number(zat) / 1e8;

/* ========================================================================== */
/* The address balance, as a step                                             */
/* ========================================================================== */

/**
 * A step chart, not a line chart. A balance does not slide between two values -
 * it is one number until a transaction confirms and then another, and drawing a
 * slope between them would assert a continuum that does not exist. The mockup
 * draws it as a step for the same reason.
 */
export function BalanceStep({ points }: { readonly points: PoolsView extends never ? never : readonly { readonly height: number; readonly stamp: { readonly text: string }; readonly balanceZat: bigint; readonly event: string | null }[] }) {
  const W = 560;
  const H = 190;
  const pl = 58;
  const pr = 44;
  const pt = 16;
  const pb = 24;
  const max = points.reduce((a, p) => (p.balanceZat > a ? p.balanceZat : a), 0n);
  const ceiling = zecOf(max) * 1.08;
  const X = (i: number): number => pl + (i / (points.length - 1)) * (W - pl - pr);
  const Y = (zat: bigint): number => pt + (1 - zecOf(zat) / ceiling) * (H - pt - pb);

  let d = `M${X(0)},${Y(points[0]?.balanceZat ?? 0n)}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) continue;
    d += ` L${X(i)},${Y(prev.balanceZat)} L${X(i)},${Y(cur.balanceZat)}`;
  }

  const gridLines = [0, 0.25, 0.5, 0.75].map((f) => f * ceiling);

  return (
    <Chart
      id="tk-balance"
      caption={
        <>
          <b>balance over time</b> - step - ZEC
        </>
      }
      table={
        <ChartTable
          caption="Lockbox balance after each transaction"
          columns={["When", "Height", "Balance ZEC", "What moved"]}
          rows={points.map((p) => [p.stamp.text, fmtInt(p.height), zatToZecGrouped(p.balanceZat, 4), p.event ?? "no movement"])}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="tk-svg" role="img" aria-label="Lockbox balance over time, drawn as a step">
        <g className="grid">
          {gridLines.map((g) => (
            <g key={g}>
              <line x1={pl} x2={W - pr} y1={Y(BigInt(Math.round(g * 1e8)))} y2={Y(BigInt(Math.round(g * 1e8)))} />
              <text x={pl - 6} y={Y(BigInt(Math.round(g * 1e8))) + 3} textAnchor="end" className="axis">
                {`${Math.round(g / 1000)}k`}
              </text>
            </g>
          ))}
        </g>
        <path d={`${d} L${X(points.length - 1)},${Y(0n)} L${X(0)},${Y(0n)} Z`} fill="var(--gold)" opacity="0.08" />
        <path d={d} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) =>
          p.event === null ? null : (
            <circle
              key={p.height}
              cx={X(i)}
              cy={Y(p.balanceZat)}
              r="4"
              fill={p.balanceZat > (points[i - 1]?.balanceZat ?? 0n) ? "var(--gold)" : "var(--p-orchard)"}
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ),
        )}
        {points.map((p, i) =>
          i === 0 || i === points.length - 1 ? (
            <text key={`x${p.height}`} x={X(i)} y={H - 6} textAnchor={i === 0 ? "start" : "end"} className="axis">
              {p.stamp.text.slice(0, 10)}
            </text>
          ) : null,
        )}
      </svg>
    </Chart>
  );
}

/* ========================================================================== */
/* The interaction graph                                                      */
/* ========================================================================== */

/**
 * Three nodes and three edges, laid out by hand.
 *
 * A force-directed graph would be a lie about a graph this size: it would move
 * between renders and imply a topology nobody computed. Edge width is
 * proportional to the square root of the value, which is the mockup's own rule
 * and the standard way to keep a large value from swamping a small one.
 */
export function InteractionGraph({
  interactions,
  note,
}: {
  readonly interactions: readonly { readonly kind: "coinbase" | "pool" | "transparent"; readonly from: string; readonly to: string; readonly label: string; readonly valueZat: bigint }[];
  readonly note: string;
}) {
  const widthFor = (zat: bigint): number => Math.max(2, Math.min(10, Math.sqrt(zecOf(zat)) / 30));

  return (
    <Chart
      id="tk-interactions"
      caption={
        <>
          <b>interactions</b> - edge width proportional to the square root of value
        </>
      }
      note={note}
      table={
        <ChartTable
          caption="Counterparties of this address"
          columns={["From", "To", "What", "ZEC"]}
          rows={interactions.map((e) => [e.from, e.to, e.label, zatToZecGrouped(e.valueZat, 4)])}
        />
      }
    >
      <svg viewBox="0 0 560 200" className="tk-svg tk-ig" role="img" aria-label="Interaction graph for this address">
        <path className="e cb" d="M140,44 L215,102" strokeWidth={widthFor(interactions[0]?.valueZat ?? 0n)} />
        <text className="el" x="152" y="64">
          {interactions[0]?.label ?? ""}
        </text>
        <path className="e pool" d="M355,102 C395,102 395,44 430,44" strokeWidth={widthFor(interactions[1]?.valueZat ?? 0n)} />
        <text className="el" x="318" y="70">
          {interactions[1]?.label ?? ""}
        </text>
        <path className="e pool" d="M430,66 C395,66 395,124 355,124" strokeWidth={widthFor(interactions[2]?.valueZat ?? 0n)} />
        <text className="el" x="372" y="150">
          {interactions[2]?.label ?? ""}
        </text>
        <g className="n" transform="translate(14,20)">
          <rect width="126" height="42" rx="3" />
          <text x="10" y="18">
            NU6.1 coinbase
          </text>
          <text x="10" y="32" className="s">
            block 3,146,400
          </text>
        </g>
        <g className="n" transform="translate(215,82)">
          <rect width="140" height="42" rx="3" />
          <text x="10" y="18">
            t3ev37Q2...UwYo
          </text>
          <text x="10" y="32" className="s">
            lockbox
          </text>
        </g>
        <g className="n" transform="translate(430,24)">
          <rect width="116" height="42" rx="3" />
          <text x="10" y="18">
            Orchard pool
          </text>
          <text x="10" y="32" className="s">
            opaque - exit only
          </text>
        </g>
      </svg>
    </Chart>
  );
}

/* ========================================================================== */
/* The Sankey                                                                 */
/* ========================================================================== */

const SANKEY = { W: 660, H: 360, lx: 208, rx: 438, nodeW: 14, gap: 16, top: 16, bottom: 12 } as const;

/**
 * Normalised node heights, computed the way assertion A6 checks them.
 *
 * The scale factor is chosen so that the SUM of the node heights plus every gap
 * fits inside the drawing area - which is what stops a busy day from drawing
 * bands off the bottom of the frame. A6 recomputes it from the rendered `rect`
 * attributes rather than from this function, so the assertion is about what the
 * page emitted and not about what this code intended.
 *
 * Exported because the assertion's unit half re-derives it, and because a
 * layout nobody can compute independently is a layout nobody can check.
 */
export function sankeyLayout(view: PoolsView): {
  readonly order: readonly string[];
  readonly left: ReadonlyMap<string, { y: number; h: number }>;
  readonly right: ReadonlyMap<string, { y: number; h: number }>;
  readonly scale: number;
} {
  const order = ["transparent", "sapling", "orchard", "ironwood", "sprout"];
  const outs = new Map<string, bigint>();
  const ins = new Map<string, bigint>();
  for (const f of view.flows) {
    outs.set(f.from, (outs.get(f.from) ?? 0n) + f.zat);
    ins.set(f.to, (ins.get(f.to) ?? 0n) + f.zat);
  }

  const usable = SANKEY.H - SANKEY.top - SANKEY.bottom - SANKEY.gap * (order.length - 1);
  // The largest of each lane's inflow and outflow is what its node has to be
  // tall enough for; the sum of those is what the scale has to divide by.
  const summax = order.reduce((a, k) => {
    const o = outs.get(k) ?? 0n;
    const i = ins.get(k) ?? 0n;
    return a + zecOf(o > i ? o : i);
  }, 0);
  const scale = usable / summax;
  // A floor of 6px so a lane with almost no traffic is still visible and still
  // labelled. The floor is the reason A6 is worth asserting: five floors of 6px
  // plus four gaps of 16px is 94px, and any scale that produced taller bands
  // than the frame would overflow silently.
  const sc = (zat: bigint): number => Math.max(6, zecOf(zat) * scale);

  const left = new Map<string, { y: number; h: number }>();
  const right = new Map<string, { y: number; h: number }>();
  let y = SANKEY.top;
  for (const k of order) {
    const hl = sc(outs.get(k) ?? 0n);
    const hr = sc(ins.get(k) ?? 0n);
    left.set(k, { y, h: hl });
    right.set(k, { y, h: hr });
    y += Math.max(hl, hr) + SANKEY.gap;
  }
  return { order, left, right, scale };
}

export function PoolSankey({ view }: { readonly view: PoolsView }) {
  const { order, left, right } = sankeyLayout(view);
  const outs = new Map<string, bigint>();
  const ins = new Map<string, bigint>();
  for (const f of view.flows) {
    outs.set(f.from, (outs.get(f.from) ?? 0n) + f.zat);
    ins.set(f.to, (ins.get(f.to) ?? 0n) + f.zat);
  }

  const lo = new Map<string, number>();
  const ro = new Map<string, number>();
  const total = view.flows.reduce((a, f) => a + zecOf(f.zat), 0);
  const usable = SANKEY.H - SANKEY.top - SANKEY.bottom - SANKEY.gap * (order.length - 1);
  const summax = order.reduce((a, k) => {
    const o = outs.get(k) ?? 0n;
    const i = ins.get(k) ?? 0n;
    return a + zecOf(o > i ? o : i);
  }, 0);
  const scale = usable / summax;

  return (
    <Chart
      id="tk-sankey"
      caption={
        <>
          <b>between the pools</b> - {view.flowWindow} - value crossing each boundary, public by construction
        </>
      }
      note={view.flowNote}
      table={
        <ChartTable
          caption={`Value crossing each pool boundary, ${view.flowWindow}`}
          columns={["From", "To", "ZEC"]}
          rows={view.flows.map((f) => [LANE_NAME[f.from] ?? f.from, LANE_NAME[f.to] ?? f.to, zatToZecGrouped(f.zat, 0)])}
        />
      }
    >
      <svg viewBox={`0 0 ${SANKEY.W} ${SANKEY.H}`} className="tk-svg tk-sankey" role="img" aria-label={`Value crossing pool boundaries, ${view.flowWindow}`}>
        {view.flows.map((f) => {
          const a = left.get(f.from);
          const b = right.get(f.to);
          if (a === undefined || b === undefined) return null;
          const h = Math.max(3, zecOf(f.zat) * scale);
          const y0 = a.y + (lo.get(f.from) ?? 0);
          const y1 = b.y + (ro.get(f.to) ?? 0);
          lo.set(f.from, (lo.get(f.from) ?? 0) + h);
          ro.set(f.to, (ro.get(f.to) ?? 0) + h);
          const mid = (SANKEY.lx + SANKEY.rx) / 2;
          return (
            <path
              key={`${f.from}-${f.to}`}
              className="flow"
              fill={LANE_VAR[f.from]}
              d={`M${SANKEY.lx + SANKEY.nodeW},${y0} C${mid},${y0} ${mid},${y1} ${SANKEY.rx},${y1} L${SANKEY.rx},${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${SANKEY.lx + SANKEY.nodeW},${y0 + h}Z`}
            >
              <title>{`${LANE_NAME[f.from] ?? f.from} to ${LANE_NAME[f.to] ?? f.to}: ${zatToZecGrouped(f.zat, 0)} ZEC, ${((zecOf(f.zat) / total) * 100).toFixed(1)} percent of the window`}</title>
            </path>
          );
        })}
        {order.map((k) => {
          const l = left.get(k);
          const r = right.get(k);
          if (l === undefined || r === undefined) return null;
          const cy = l.y + Math.max(l.h, r.h) / 2;
          return (
            <g key={k}>
              <g className="node">
                <rect x={SANKEY.lx} y={l.y} width={SANKEY.nodeW} height={l.h} fill={LANE_VAR[k]} data-lane={k} data-side="out" />
                <text x={SANKEY.lx - 8} y={cy + 1} textAnchor="end">
                  {LANE_NAME[k]}
                </text>
                <text x={SANKEY.lx - 8} y={cy + 13} textAnchor="end" className="v">
                  {`out ${zatToZecGrouped(outs.get(k) ?? 0n, 0)}`}
                </text>
              </g>
              <g className="node">
                <rect x={SANKEY.rx} y={r.y} width={SANKEY.nodeW} height={r.h} fill={LANE_VAR[k]} data-lane={k} data-side="in" />
                <text x={SANKEY.rx + SANKEY.nodeW + 8} y={cy + 1}>
                  {LANE_NAME[k]}
                </text>
                <text x={SANKEY.rx + SANKEY.nodeW + 8} y={cy + 13} className="v">
                  {`in ${zatToZecGrouped(ins.get(k) ?? 0n, 0)}`}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </Chart>
  );
}

/* ========================================================================== */
/* Pool history                                                               */
/* ========================================================================== */

export function PoolHistory({ view }: { readonly view: PoolsView }) {
  const W = 1100;
  const H = 280;
  const pl = 58;
  const pr = 18;
  const pt = 32;
  const pb = 28;
  const x0 = 2016.8;
  const x1 = 2026.78;
  const ymax = 5_000_000;
  const X = (t: number): number => pl + ((t - x0) / (x1 - x0)) * (W - pl - pr);
  const Y = (v: number): number => pt + (1 - v / ymax) * (H - pt - pb);

  const keys = ["sprout", "sapling", "orchard", "ironwood"] as const;
  let base = view.history.map(() => 0);
  const layers: { key: (typeof keys)[number]; d: string }[] = [];
  for (const k of keys) {
    const top = view.history.map((p, i) => (base[i] ?? 0) + zecOf(p[k]));
    let d = `M${X(view.history[0]?.t ?? x0)},${Y(base[0] ?? 0)}`;
    view.history.forEach((p, i) => {
      d += ` L${X(p.t)},${Y(top[i] ?? 0)}`;
    });
    for (let i = view.history.length - 1; i >= 0; i -= 1) {
      d += ` L${X(view.history[i]?.t ?? x0)},${Y(base[i] ?? 0)}`;
    }
    layers.push({ key: k, d: `${d}Z` });
    base = top;
  }

  const shieldedNow = keys.reduce((a, k) => a + zecOf(view.history[view.history.length - 1]?.[k] ?? 0n), 0);

  return (
    <Chart
      id="tk-poolhist"
      caption={
        <>
          <b>pool balances, 2016 to 2026</b> - stacked - shielded pools only
        </>
      }
      note="An indicative reconstruction from the shielded-share series, not a read of per-block balances. The last point is the real one and matches the balances table above it. The indexer replaces this whole series at HANDOFF-09."
      legend={keys.map((k) => (
        <li key={k}>
          <i className={`sw ${POOL_SW[k as PoolKey]}`} />
          {LANE_NAME[k]}
        </li>
      ))}
      table={
        <ChartTable
          caption="Shielded pool balances by year, indicative"
          columns={["When", "Sprout", "Sapling", "Orchard", "Ironwood"]}
          rows={view.history.map((p) => [p.when, zatToZecGrouped(p.sprout, 0), zatToZecGrouped(p.sapling, 0), zatToZecGrouped(p.orchard, 0), zatToZecGrouped(p.ironwood, 0)])}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="tk-svg" role="img" aria-label="Shielded pool balances from 2016 to 2026, an indicative reconstruction">
        <g className="grid">
          {[1e6, 2e6, 3e6, 4e6, 5e6].map((g) => (
            <g key={g}>
              <line x1={pl} x2={W - pr} y1={Y(g)} y2={Y(g)} />
              <text x={pl - 6} y={Y(g) + 3} textAnchor="end" className="axis">
                {`${g / 1e6}M`}
              </text>
            </g>
          ))}
        </g>
        {layers.map((l) => (
          <path key={l.key} d={l.d} fill={LANE_VAR[l.key]} fillOpacity="0.55" stroke="var(--bg)" strokeWidth="1.5" />
        ))}
        <g className="tk-band">
          {view.unsoundBands.map((b) => (
            <g key={b.label}>
              <rect x={X(b.from)} y={pt - 18} width={X(b.to) - X(b.from)} height={H - pt - pb + 18} />
              <text x={X(b.from) + 4} y={pt - 6}>
                {b.label}
              </text>
            </g>
          ))}
        </g>
        {[2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
          <text key={y} x={X(y)} y={H - 6} textAnchor="middle" className="axis">
            {y}
          </text>
        ))}
        <text x={X(2026.64) - 6} y={Y(shieldedNow) - 8} textAnchor="end" className="mark">
          {`${(shieldedNow / 1e6).toFixed(2)}M shielded`}
        </text>
      </svg>
    </Chart>
  );
}

/* ========================================================================== */
/* Drain, denominations, claim distribution                                   */
/* ========================================================================== */

export function OrchardDrain({ view }: { readonly view: PoolsView }) {
  const W = 320;
  const H = 140;
  const pl = 40;
  const pr = 12;
  const pt = 24;
  const pb = 22;
  const ymax = zecOf(view.drain.startZat) * 1.04;
  const n = view.drain.points.length - 1;
  const X = (i: number): number => pl + (i / n) * (W - pl - pr);
  const Y = (v: number): number => pt + (1 - v / ymax) * (H - pt - pb);
  const pts = view.drain.points.map((p) => `${X(p.i)},${Y(zecOf(p.zat))}`).join(" ");

  return (
    <Chart
      id="tk-drain"
      caption={
        <>
          <b>orchard drain</b> - since Ironwood activated
        </>
      }
      note={view.drain.note}
      table={
        <ChartTable
          caption="Orchard pool balance since Ironwood activation"
          columns={["Sample", "ZEC"]}
          rows={view.drain.points.map((p) => [`day ${p.i}`, zatToZecGrouped(p.zat, 0)])}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="tk-svg" role="img" aria-label="Orchard pool balance since Ironwood activation">
        <g className="grid">
          {[1e6, 2e6, 3e6].map((g) => (
            <g key={g}>
              <line x1={pl} x2={W - pr} y1={Y(g)} y2={Y(g)} />
              <text x={pl - 5} y={Y(g) + 3} textAnchor="end" className="axis">
                {`${g / 1e6}M`}
              </text>
            </g>
          ))}
        </g>
        <polyline points={pts} fill="none" stroke="var(--p-orchard)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={X(n)} cy={Y(zecOf(view.drain.nowZat))} r="4" fill="var(--p-orchard)" stroke="var(--surface)" strokeWidth="2" />
        {view.drain.marks.map((m) => (
          <text key={m.text} x={X(m.i)} y={H - 5} textAnchor={m.i === 0 ? "start" : m.i === n ? "end" : "middle"} className="axis">
            {m.text}
          </text>
        ))}
      </svg>
    </Chart>
  );
}

export function MigrationLens({ view }: { readonly view: PoolsView }) {
  const max = view.denominations.rows.reduce((a, r) => (r.count > a ? r.count : a), 1);
  return (
    <Chart
      id="tk-denoms"
      caption={
        <>
          <b>migration lens</b> - ZIP 318 - {view.flowWindow}
        </>
      }
      note={`${fmtInt(view.denominations.crossings)} crossings carrying ${zatToZecGrouped(view.denominations.zat, 0)} ZEC, both counted from the bars. ${view.denominations.strandedNote}`}
      table={
        <ChartTable
          caption="Migration crossings by canonical denomination"
          columns={["Denomination ZEC", "Crossings"]}
          rows={view.denominations.rows.map((r) => [r.label, String(r.count)])}
        />
      }
    >
      {/* One <svg> per chart is the contract A3 checks, so the histogram is an
          svg rather than the mockup's flex row of divs. It also means the bars
          scale with the frame instead of with the font. */}
      <svg viewBox="0 0 320 120" className="tk-svg" role="img" aria-label="Migration crossings by canonical denomination">
        {view.denominations.rows.map((r, i) => {
          const w = 320 / view.denominations.rows.length;
          const h = (r.count / max) * 86;
          return (
            <g key={r.label}>
              <rect x={i * w + 1.5} y={96 - h} width={w - 3} height={Math.max(2, h)} fill="var(--p-ironwood)" rx="2" data-denom={r.label} />
              <text x={i * w + w / 2} y={112} textAnchor="middle" className="axis">
                {r.label}
              </text>
            </g>
          );
        })}
        <line x1="0" x2="320" y1="96" y2="96" stroke="var(--line-strong)" strokeWidth="1" />
      </svg>
    </Chart>
  );
}

export function ClaimDistribution({ view }: { readonly view: PoolsView }) {
  const TONE: Readonly<Record<string, string>> = {
    requires_disclosure: "var(--danger)",
    small_heuristic_set: "var(--warn)",
    broad_candidate_set: "var(--gold)",
    aggregate_only: "var(--ok)",
  };
  return (
    <Chart
      id="tk-neff"
      caption={
        <>
          <b>ironwood birth</b> - claim level of a spend, since 28 July
        </>
      }
      note={view.neff.note}
      table={
        <ChartTable
          caption="Claim level of an Ironwood spend since activation"
          columns={["Claim level", "Share of spends"]}
          rows={view.neff.rows.map((r) => [r.label, `${r.pct} percent`])}
        />
      }
    >
      <svg viewBox="0 0 320 120" className="tk-svg" role="img" aria-label="Distribution of claim levels for Ironwood spends since activation">
        {view.neff.rows.map((r, i) => (
          <g key={r.claim}>
            <rect x="0" y={i * 30 + 8} width="320" height="12" fill="var(--surface-2)" />
            <rect x="0" y={i * 30 + 8} width={(r.pct / 100) * 320} height="12" fill={TONE[r.claim]} data-claim={r.claim} />
            <text x="0" y={i * 30 + 4} className="axis">
              {`${r.label} - ${r.pct} percent`}
            </text>
          </g>
        ))}
      </svg>
    </Chart>
  );
}
