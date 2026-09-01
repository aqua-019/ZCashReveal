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
 *
 * NO CHART HERE CONTAINS A `<text>`, and that is a measurement rather than a
 * preference. A `<text>` in a scaled viewBox paints at
 * `declared x (renderedCssWidth / viewBoxWidth)`, and these seven viewBoxes are
 * the narrowest boxes on the site: the Sankey's 660 units render at 263px at a
 * 760px viewport, so its 12-unit labels painted at 4.79px, and the two /address
 * charts render at 130px at 390px, painting at 2.79px, against a 12px floor. No
 * declared value fixes that, because there is no width at which the scaling
 * stops. So every label is an HTML element in a `<ChartLabels>` layer stacked on
 * the drawing, sized by the ordinary cascade in real pixels; the full argument,
 * with the table of measurements, is in `components/record/ChartLabels.tsx`.
 *
 * WHAT THAT COSTS THE CODE, and why the geometry below is laid out in arrays
 * that did not exist before. A label used to sit inside the same `<g>` as its
 * mark, so the two shared one `transform` and could not drift apart. They are in
 * different element trees now, so every coordinate a mark and its label both
 * need is computed ONCE, above the JSX, and the array is mapped twice -
 * assertion A1. A `<g>` whose only job was to pair a mark with its text goes
 * with the text.
 */
import type { BalancePoint, PoolsView } from "@zcashreveal/types";

import { Chart, ChartTable } from "@/components/record/Chart";
import { ChartLabels } from "@/components/record/ChartLabels";
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
// The DTO's own type, not a structural restatement of it. A gate round added
// `crossing` to `BalancePoint` and the restatement did not have it, which is
// the failure mode a restated type has and an imported one does not.
export function BalanceStep({ points }: { readonly points: readonly BalancePoint[] }) {
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
  /** The zero rule, and the row the date labels hang from. */
  const floor = H - pb;

  let d = `M${X(0)},${Y(points[0]?.balanceZat ?? 0n)}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) continue;
    d += ` L${X(i)},${Y(prev.balanceZat)} L${X(i)},${Y(cur.balanceZat)}`;
  }

  // Round gridlines, not fractions of a computed ceiling: 0.25 of 85,000 is
  // 21,250, and an axis labelled 21k / 43k / 64k reads as noise rather than as
  // a scale. Step to the nearest 25,000 under the ceiling.
  const step = 25_000;
  const gridLines: number[] = [];
  for (let g = 0; g < ceiling; g += step) gridLines.push(g);

  // `Y(BigInt(Math.round(g * 1e8)))` was written three times inside one `<g>` -
  // twice for the rule, once for its number. The number is in a different
  // element tree now, so one array is the only thing keeping them on one row.
  const grid = gridLines.map((g) => ({
    key: String(g),
    y: Y(BigInt(Math.round(g * 1e8))),
    text: `${String(Math.round(g / 1000))}k`,
  }));

  // The x axis names two readings and no others: the first and the last.
  const ends = points.flatMap((p, i) =>
    i === 0 || i === points.length - 1
      ? [{ key: `x${String(p.height)}`, x: X(i), text: p.stamp.text.slice(0, 10), first: i === 0 }]
      : [],
  );

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
      labels={
        <ChartLabels
          vw={W}
          vh={H}
          items={[
            ...grid.map((g) => ({
              key: `g${g.key}`,
              x: pl,
              y: g.y,
              text: g.text,
              className: "axis",
              anchor: "end" as const,
              baseline: "middle" as const,
              dx: -5,
            })),
            ...ends.map((e) => ({
              key: e.key,
              x: e.x,
              y: floor,
              text: e.text,
              className: "axis",
              anchor: e.first ? ("start" as const) : ("end" as const),
              baseline: "hanging" as const,
              dy: 5,
            })),
          ]}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="tk-svg" role="img" aria-label="Lockbox balance over time, drawn as a step">
        <g className="grid">
          {grid.map((g) => (
            <line key={g.key} x1={pl} x2={W - pr} y1={g.y} y2={g.y} />
          ))}
        </g>
        {/* The series is a TRANSPARENT address's balance, so it is drawn in the
            transparent pool hue. The mockup draws it in gold; a gate round
            pointed out that a balance history is none of gold's four licensed
            jobs, and that spending the accent on the whole line leaves nothing
            to mark the two points on it that ARE a licensed job. */}
        <path d={`${d} L${X(points.length - 1)},${Y(0n)} L${X(0)},${Y(0n)} Z`} fill="var(--p-transparent)" opacity="0.08" />
        <path d={d} fill="none" stroke="var(--p-transparent)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) =>
          p.event === null ? null : (
            <circle
              key={p.height}
              cx={X(i)}
              cy={Y(p.balanceZat)}
              r="4"
              // Gold marks a pool crossing and nothing else - the third
              // licensed job, read off the DTO rather than inferred from the
              // direction of the line. Every other event is ink.
              fill={p.crossing ? "var(--gold)" : "var(--ink-dim)"}
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ),
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
/**
 * The colour key, restored after a gate round.
 *
 * The mockup's caption for this figure carries one - "gold = transparent,
 * magenta = pool boundary, green = coinbase" - and the first draft dropped it,
 * which left the two hues the graph actually uses unlabelled on the page. Gold
 * is gone from the key with the base stroke it named, so the key is the two
 * that remain.
 */
const LEGEND = [
  <li key="cb">
    <i className="sw sp" />
    coinbase
  </li>,
  <li key="pool">
    <i className="sw o" />
    pool boundary
  </li>,
];

/** The graph's own coordinate space, read by the viewBox and by the label layer. */
const IG = { W: 560, H: 200, boxH: 42, textY: 18 } as const;

/**
 * The three boxes, as a table rather than as three `<g transform>` blocks.
 *
 * The rect and its two lines of text used to share one `translate`, which made
 * them one placement by construction. The text is HTML now and sits outside the
 * `<g>`, so the translate cannot reach it and the box's own coordinates are the
 * single source both halves read.
 */
const IG_NODES: readonly {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly name: string;
  readonly sub: string;
}[] = [
  { key: "coinbase", x: 14, y: 20, w: 126, name: "NU6.1 coinbase", sub: "block 3,146,400" },
  { key: "lockbox", x: 215, y: 82, w: 140, name: "t3ev37Q2...UwYo", sub: "lockbox" },
  { key: "orchard", x: 428, y: 74, w: 116, name: "Orchard pool", sub: "opaque - exit only" },
];

/**
 * Where each edge's label sits, by the index of the interaction it names.
 *
 * Both pool edges leave the address on the right. Their labels sit clear of the
 * node boxes rather than across them: the first above the upper curve, the
 * second below the lower one, both anchored at the end so they grow leftward
 * into empty space instead of into the pool node.
 */
const IG_EDGE_LABELS: readonly {
  readonly key: string;
  readonly i: number;
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "end";
}[] = [
  { key: "e-coinbase", i: 0, x: 152, y: 64, anchor: "start" },
  { key: "e-pool-out", i: 1, x: 424, y: 36, anchor: "end" },
  { key: "e-pool-in", i: 2, x: 424, y: 146, anchor: "end" },
];

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
      dense
      caption={
        <>
          <b>interactions</b> - edge width proportional to the square root of value
        </>
      }
      legend={LEGEND}
      note={note}
      table={
        <ChartTable
          caption="Counterparties of this address"
          columns={["From", "To", "What", "ZEC"]}
          rows={interactions.map((e) => [e.from, e.to, e.label, zatToZecGrouped(e.valueZat, 4)])}
        />
      }
      labels={
        <ChartLabels
          vw={IG.W}
          vh={IG.H}
          items={[
            ...IG_EDGE_LABELS.map((l) => ({
              key: l.key,
              x: l.x,
              y: l.y,
              text: interactions[l.i]?.label ?? "",
              // The halo the SVG drew with `paint-order: stroke` in the SURFACE
              // colour, not the page background: these labels cross the edges
              // and sit against the panel the graph is inset in.
              className: "el halo-surface",
              anchor: l.anchor,
            })),
            // The second line is one line below the first, in pixels, and that
            // is the whole reason the pair reads: 14 user units of separation
            // was 16px at a 1440 viewport and 7.6px at 760, and two 12px lines
            // 7.6px apart are one smudge.
            ...IG_NODES.flatMap((n) => [
              { key: `n-${n.key}`, x: n.x, y: n.y + IG.textY, text: n.name, className: "ig-n", dx: 8 },
              { key: `s-${n.key}`, x: n.x, y: n.y + IG.textY, text: n.sub, className: "ig-s", dx: 8, dy: 12 },
            ]),
          ]}
        />
      }
    >
      <svg viewBox={`0 0 ${IG.W} ${IG.H}`} className="tk-svg tk-ig" role="img" aria-label="Interaction graph for this address">
        <path className="e cb" d="M140,44 L215,102" strokeWidth={widthFor(interactions[0]?.valueZat ?? 0n)} />
        <path className="e pool" d="M355,96 C392,96 392,50 428,50" strokeWidth={widthFor(interactions[1]?.valueZat ?? 0n)} />
        <path className="e pool" d="M428,62 C392,62 392,124 355,124" strokeWidth={widthFor(interactions[2]?.valueZat ?? 0n)} />
        {IG_NODES.map((n) => (
          <g className="n" key={n.key}>
            <rect x={n.x} y={n.y} width={n.w} height={IG.boxH} rx="3" />
          </g>
        ))}
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

  // The node's vertical centre. Both rects and all four of its labels are hung
  // off it, and it used to be recomputed inside the JSX map that drew them.
  const nodes = order.flatMap((k) => {
    const l = left.get(k);
    const r = right.get(k);
    return l === undefined || r === undefined ? [] : [{ k, l, r, cy: l.y + Math.max(l.h, r.h) / 2 }];
  });

  return (
    <Chart
      id="tk-sankey"
      dense
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
      labels={
        <ChartLabels
          vw={SANKEY.W}
          vh={SANKEY.H}
          items={nodes.flatMap(({ k, cy }) => [
            // Each side's two lines are centred on the node AS A PAIR, half a
            // line either side of `cy`, because `cy` is the node's own centre.
            // The `<text>` did it with `cy + 1` and `cy + 13`, which was 15px of
            // separation at a 1440 viewport and 5.2px at 760 - the two lines ran
            // into each other at exactly the width the label was smallest.
            { key: `ln-${k}`, x: SANKEY.lx, y: cy, text: LANE_NAME[k], className: "sk-n", anchor: "end" as const, baseline: "middle" as const, dx: -6, dy: -6 },
            {
              key: `lv-${k}`,
              x: SANKEY.lx,
              y: cy,
              text: `out ${zatToZecGrouped(outs.get(k) ?? 0n, 0)}`,
              className: "sk-v",
              anchor: "end" as const,
              baseline: "middle" as const,
              dx: -6,
              dy: 6,
            },
            { key: `rn-${k}`, x: SANKEY.rx + SANKEY.nodeW, y: cy, text: LANE_NAME[k], className: "sk-n", baseline: "middle" as const, dx: 6, dy: -6 },
            {
              key: `rv-${k}`,
              x: SANKEY.rx + SANKEY.nodeW,
              y: cy,
              text: `in ${zatToZecGrouped(ins.get(k) ?? 0n, 0)}`,
              className: "sk-v",
              baseline: "middle" as const,
              dx: 6,
              dy: 6,
            },
          ])}
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
        {nodes.map(({ k, l, r }) => (
          <g key={k}>
            <g className="node">
              <rect x={SANKEY.lx} y={l.y} width={SANKEY.nodeW} height={l.h} fill={LANE_VAR[k]} data-lane={k} data-side="out" />
            </g>
            <g className="node">
              <rect x={SANKEY.rx} y={r.y} width={SANKEY.nodeW} height={r.h} fill={LANE_VAR[k]} data-lane={k} data-side="in" />
            </g>
          </g>
        ))}
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

  /**
   * The shielded share, restored after a gate round. The mockup annotates this
   * point "4.39M shielded - 26%" and the first draft kept only the first half,
   * which drops the one figure that makes 4.39M mean anything. Computed from
   * the balances table on the same page rather than written down: the four
   * shielded lanes over all five.
   */
  const supplyNow = view.balances.reduce((a, b) => a + zecOf(b.zat), 0);
  const shieldedShare = supplyNow === 0 ? 0 : (shieldedNow / supplyNow) * 100;

  const grid = [1e6, 2e6, 3e6, 4e6, 5e6].map((g) => ({ key: String(g), y: Y(g), text: `${String(g / 1e6)}M` }));
  const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

  // The band's top edge is the rect's `y` and the label's anchor both, so it is
  // named once. The rect starts 18 units above the plot so the label has a lane
  // of its own above the stack.
  const bandTop = pt - 18;
  const bands = view.unsoundBands.map((b) => ({ label: b.label, x: X(b.from), w: X(b.to) - X(b.from) }));

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
      labels={
        <ChartLabels
          vw={W}
          vh={H}
          items={[
            ...grid.map((g) => ({
              key: `g${g.key}`,
              x: pl,
              y: g.y,
              text: g.text,
              className: "axis",
              anchor: "end" as const,
              baseline: "middle" as const,
              dx: -5,
            })),
            ...years.map((yr) => ({
              key: `y${String(yr)}`,
              x: X(yr),
              y: H - pb,
              text: String(yr),
              className: "axis",
              anchor: "middle" as const,
              baseline: "hanging" as const,
              dy: 5,
            })),
            // The band label hangs from the band's own top edge rather than
            // sitting at a fixed depth into it: 12 user units of headroom was
            // 14.6px at a 1440 viewport and 3.4px at 390, so at every width
            // below about 1100 the words rode out through the top of the band.
            ...bands.map((b) => ({
              key: b.label,
              x: b.x,
              y: bandTop,
              text: b.label,
              className: "band-label",
              baseline: "hanging" as const,
              dx: 3,
              dy: 2,
            })),
            // -3 rather than the -6 a direct label usually takes, against the 2
            // above rather than a 3, and the four pixels between those two pairs
            // of numbers are the whole reason: the band label is pinned to the
            // FRAME and this mark to a VALUE near the top of the axis, so they
            // converge as the viewport narrows rather than as it widens. The
            // 44.8 user units between them are 55px at 1440 and 27px at 760, and
            // two 12px labels with their gaps need 26. Measured on the served
            // build: they overlapped by 3.9px at 760 before the four moved.
            {
              key: "shielded-now",
              x: X(2026.64),
              y: Y(shieldedNow),
              text: `${(shieldedNow / 1e6).toFixed(2)}M shielded - ${shieldedShare.toFixed(0)} percent`,
              className: "mark",
              anchor: "end" as const,
              dx: -5,
              dy: -3,
            },
          ]}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="tk-svg" role="img" aria-label="Shielded pool balances from 2016 to 2026, an indicative reconstruction">
        <g className="grid">
          {grid.map((g) => (
            <line key={g.key} x1={pl} x2={W - pr} y1={g.y} y2={g.y} />
          ))}
        </g>
        {layers.map((l) => (
          <path key={l.key} d={l.d} fill={LANE_VAR[l.key]} fillOpacity="0.55" stroke="var(--bg)" strokeWidth="1.5" />
        ))}
        <g className="tk-band">
          {bands.map((b) => (
            <rect key={b.label} x={b.x} y={bandTop} width={b.w} height={H - pt - pb + 18} />
          ))}
        </g>
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
  const grid = [1e6, 2e6, 3e6].map((g) => ({ key: String(g), y: Y(g), text: `${String(g / 1e6)}M` }));

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
      labels={
        <ChartLabels
          vw={W}
          vh={H}
          items={[
            ...grid.map((g) => ({
              key: `g${g.key}`,
              x: pl,
              y: g.y,
              text: g.text,
              className: "axis",
              anchor: "end" as const,
              baseline: "middle" as const,
              dx: -4,
            })),
            ...view.drain.marks.map((m) => ({
              key: m.text,
              x: X(m.i),
              y: H - pb,
              text: m.text,
              className: "axis",
              anchor: m.i === 0 ? ("start" as const) : m.i === n ? ("end" as const) : ("middle" as const),
              baseline: "hanging" as const,
              dy: 5,
            })),
          ]}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="tk-svg" role="img" aria-label="Orchard pool balance since Ironwood activation">
        <g className="grid">
          {grid.map((g) => (
            <line key={g.key} x1={pl} x2={W - pr} y1={g.y} y2={g.y} />
          ))}
        </g>
        <polyline points={pts} fill="none" stroke="var(--p-orchard)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={X(n)} cy={Y(zecOf(view.drain.nowZat))} r="4" fill="var(--p-orchard)" stroke="var(--surface)" strokeWidth="2" />
      </svg>
    </Chart>
  );
}

/** The histogram's own coordinate space: `floor` is the rule the bars stand on. */
const MLENS = { W: 320, H: 120, floor: 96, barH: 86 } as const;

export function MigrationLens({ view }: { readonly view: PoolsView }) {
  const max = view.denominations.rows.reduce((a, r) => (r.count > a ? r.count : a), 1);
  // One column width for the bar and for the label under it. It was computed
  // inside the JSX map, where the rect used `i * w + 1.5` and the label used
  // `i * w + w / 2` - two readings of one column.
  const w = MLENS.W / view.denominations.rows.length;
  const bars = view.denominations.rows.map((r, i) => {
    const h = (r.count / max) * MLENS.barH;
    return { label: r.label, x: i * w + 1.5, w: w - 3, y: MLENS.floor - h, h: Math.max(2, h), cx: i * w + w / 2 };
  });
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
      labels={
        <ChartLabels
          vw={MLENS.W}
          vh={MLENS.H}
          items={bars.map((b) => ({
            key: b.label,
            x: b.cx,
            y: MLENS.floor,
            text: b.label,
            className: "axis",
            anchor: "middle" as const,
            baseline: "hanging" as const,
            dy: 5,
          }))}
        />
      }
    >
      {/* One <svg> per chart is the contract A3 checks, so the histogram is an
          svg rather than the mockup's flex row of divs. It also means the bars
          scale with the frame instead of with the font. */}
      <svg viewBox={`0 0 ${MLENS.W} ${MLENS.H}`} className="tk-svg" role="img" aria-label="Migration crossings by canonical denomination">
        {bars.map((b) => (
          <rect key={b.label} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--p-ironwood)" rx="2" data-denom={b.label} />
        ))}
        <line x1="0" x2={MLENS.W} y1={MLENS.floor} y2={MLENS.floor} stroke="var(--line-strong)" strokeWidth="1" />
      </svg>
    </Chart>
  );
}

/** The ladder's own coordinate space: one row every `pitch` units. */
const CLAIM = { W: 320, H: 128, pitch: 31, barTop: 15, barH: 12 } as const;

export function ClaimDistribution({ view }: { readonly view: PoolsView }) {
  /**
   * THE SAME VOCABULARY THE CHIPS USE, and a gate round is why.
   *
   * The mockup's bars are gold at `broad` and amber at `small heuristic`,
   * while `EstimatePanel` gives `broad` no colour at all and reserved the
   * accent for the rung above it - so /pools and /tx read the same word two
   * opposite ways, one link apart. Neither gold use was licensed: a claim
   * level is not a primary action, an active state, value crossing a pool
   * boundary or the system-identity register. The ladder now runs ok ->
   * neutral -> warn -> danger on both surfaces, bottom rung to top.
   */
  const TONE: Readonly<Record<string, string>> = {
    requires_disclosure: "var(--danger)",
    small_heuristic_set: "var(--warn)",
    broad_candidate_set: "var(--ink-dim)",
    aggregate_only: "var(--ok)",
  };
  // The row's top edge, read by the two rects and by the label above them.
  const bars = view.neff.rows.map((r, i) => ({
    claim: r.claim,
    text: `${r.label} - ${r.pct} percent`,
    y: i * CLAIM.pitch + CLAIM.barTop,
    w: (r.pct / 100) * CLAIM.W,
  }));
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
      labels={
        <ChartLabels
          vw={CLAIM.W}
          vh={CLAIM.H}
          // The label sits ABOVE its bar, and the first row's used to be clipped
          // by the top of the viewBox - at y = 4 the strongest claim level on
          // the chart was the one a reader could not read, and y = 10 was the
          // repair. Neither is load-bearing now: the label is an HTML sibling of
          // the drawing, the layer is `overflow: visible`, and a 5px gap above
          // the bar is a 5px gap at every width the site supports.
          items={bars.map((b) => ({ key: b.claim, x: 0, y: b.y, text: b.text, className: "axis", dy: -5 }))}
        />
      }
    >
      <svg viewBox={`0 0 ${CLAIM.W} ${CLAIM.H}`} className="tk-svg" role="img" aria-label="Distribution of claim levels for Ironwood spends since activation">
        {bars.map((b) => (
          <g key={b.claim}>
            <rect x="0" y={b.y} width={CLAIM.W} height={CLAIM.barH} fill="var(--surface-2)" />
            <rect x="0" y={b.y} width={b.w} height={CLAIM.barH} fill={TONE[b.claim]} data-claim={b.claim} />
          </g>
        ))}
      </svg>
    </Chart>
  );
}
