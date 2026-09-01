import { getStats, getTimeline, resolveSources, type TimelineEvent } from "@zcashreveal/content";

import { Chart, ChartTable } from "@/components/record/Chart";
import { ChartLabels } from "@/components/record/ChartLabels";
import { Cite } from "@/components/record/Cite";
import { PLOT, Axes, Plot, axesLabels, decades, linear, log10, path } from "@/components/record/Plot";
import { ZEC_PRICE, ZEC_PRICE_MARKS, day, type PriceMark } from "@/lib/series";

/**
 * ZEC's price with the dated statements drawn on it.
 *
 * The chart makes one claim and refuses another. It claims that ten specific,
 * dated, sourced statements land where they land against the price. It refuses
 * to say that any of them moved it: the rules are drawn, and the reader is left
 * to look. Two of the marks are followed by a fall, several are followed by
 * nothing in particular, and the corpus's own reading of the period is
 * published under the chart, in both of the two incompatible versions it found.
 *
 * THE AXIS IS LOGARITHMIC, AND SAYING SO IS PART OF THE CHART. ZEC ran from
 * $39.75 to $784 over these twelve months, a factor of twenty. On a linear axis
 * everything before October 2025 is a flat line on the floor, which draws a
 * picture of a market that did nothing for two months and then exploded - and
 * the first leg, $39.75 to $247.97, is a 6x, the largest proportional move in
 * the series. A log axis gives equal vertical distance to equal proportional
 * change, which is the only reading under which "the statement was followed by
 * a 30 per cent move" means the same thing in September as in August.
 *
 * THE ANNOTATIONS ARE STAGGERED DETERMINISTICALLY. Ten labels across twelve
 * months collide; four lanes and a greedy left-to-right assignment separate
 * them. The width of a label is estimated from its character count and the mono
 * advance, not measured - there is no DOM here, this is a server render, and
 * `Math.random` is banned outright (CLAUDE.md, and eslint enforces it). The
 * same input renders the same picture on every machine, every time.
 */

/** 20 Aug 2025 to 25 Aug 2026: the window the corpus's price table covers, plus a margin. */
const X_DOMAIN = [day("2025-08-20"), day("2026-08-25")] as const;

/** Dollars. The series runs $39.75 to $784, so the decade below and the decade above. */
const Y_DOMAIN = [30, 1000] as const;

/** Gridlines: the powers of ten in the domain, plus the doublings a reader of a price chart looks for. */
const Y_TICKS = [...new Set([...decades(Y_DOMAIN), 50, 200, 400, 800])].sort((a, b) => a - b);

const X_TICKS = ["2025-09-01", "2025-11-01", "2026-01-01", "2026-03-01", "2026-05-01", "2026-07-01"] as const;

/** The annotation gutter. Labels live above it; the plot floor is below. */
const GUTTER = 94;
const LANES = 4;
const LANE_Y = (lane: number): number => 22 + lane * 15;

/** Advance width of one character of the label mono at 10.5 user units. Used to avoid collisions, never to lay out text. */
const CHAR = 6.3;

/**
 * The only two points that get a direct label, by date.
 *
 * The November high is the peak of the rally this page is about; the August
 * reading is where the record stops. They are named rather than derived,
 * because the largest value in the series is the August one and a
 * find-the-maximum would label it twice.
 */
const CALLOUTS = { high: "2025-11-07", latest: "2026-08-22" } as const;

/** A mark resolved against the timeline row that is its actual claim. */
export interface ResolvedMark {
  readonly mark: PriceMark;
  readonly event: TimelineEvent;
}

/**
 * The ten marks, each paired with its timeline row.
 *
 * A mark whose event id is not in `timeline.json` is dropped rather than drawn:
 * the label is an abbreviation of a claim, and an abbreviation with no claim
 * behind it is a caption someone made up.
 */
export function priceMarks(): readonly ResolvedMark[] {
  const at = new Map(getTimeline().map((e) => [e.id, e]));
  return ZEC_PRICE_MARKS.flatMap((mark) => {
    const event = at.get(mark.event);
    return event === undefined ? [] : [{ mark, event }];
  });
}

export function NetworkPrice() {
  const stats = getStats();
  const marks = priceMarks();

  const { width, height, pad } = PLOT;
  const x = linear(X_DOMAIN, [pad.left, width - pad.right]);
  const y = log10(Y_DOMAIN, [height - pad.bottom, GUTTER]);
  const floor = height - pad.bottom;
  const right = width - pad.right;

  const points = ZEC_PRICE.map((p) => [x(day(p.date)), y(p.value)] as const);
  const line = path(points);

  // Two direct labels and only two, named by date rather than found by size.
  // The November reading is the corpus's "cycle high"; the August reading is
  // the last one it publishes, and it is the larger of the two, so picking the
  // maximum would label the same point twice and leave the high of the rally
  // the page is about unmarked.
  const cycleHigh = ZEC_PRICE.find((p) => p.date === CALLOUTS.high);
  const latest = ZEC_PRICE.find((p) => p.date === CALLOUTS.latest);

  // Lane assignment, left to right. `taken[lane]` is the x of the right edge of
  // the last label placed in that lane; a label goes in the first lane it clears
  // by 10 units, and if it clears none it goes in the lane whose last label ends
  // soonest, which is the least bad of the four collisions available.
  const taken = new Array<number>(LANES).fill(Number.NEGATIVE_INFINITY);
  const edgeOf = (lane: number): number => taken[lane] ?? Number.NEGATIVE_INFINITY;
  // One tick list for the marks and the labels both, so a rule and its number
  // cannot drift apart when either is edited.
  const xTicks = X_TICKS.map((d) => ({ at: day(d), label: d.slice(0, 7) }));
  const yTicks = Y_TICKS.map((v) => ({ at: v, label: `$${v.toLocaleString("en-GB")}` }));

  const placed = marks.map(({ mark, event }) => {
    const at = x(day(event.date));
    const w = mark.label.length * CHAR;
    // A label that would run off the right edge is anchored to the right of its
    // own rule instead of the left. Which two marks that is falls out of the
    // dates; it is not a hand-picked pair.
    const anchor: "start" | "end" = at + 6 + w > right ? "end" : "start";
    const left = anchor === "start" ? at + 6 : at - 6 - w;
    let lane = taken.findIndex((edge) => edge + 10 <= left);
    if (lane < 0) {
      lane = 0;
      for (let i = 1; i < LANES; i += 1) if (edgeOf(i) < edgeOf(lane)) lane = i;
    }
    taken[lane] = left + w;
    return { mark, event, at, lane, anchor };
  });

  return (
    <Chart
      id="network-price"
      caption="ZEC daily close against ten dated statements, Aug 2025 to Aug 2026 (log scale)"
      table={
        <ChartTable
          caption="ZEC daily close by date, and the dated statements marked on the chart"
          columns={["Date", "Close or statement", "Note"]}
          rows={[
            ...ZEC_PRICE.map((p) => [p.when, `$${p.value.toLocaleString("en-GB")}`, p.note ?? "CoinGecko daily close"]),
            ...placed.map((p) => [p.event.dateText, p.mark.label, `${p.event.title} (${p.event.id}, ${p.event.confidence})`]),
          ]}
        />
      }
      labels={
        <ChartLabels
          vw={PLOT.width}
          vh={PLOT.height}
          items={[
            ...axesLabels({ x, y, xTicks, yTicks, yLabel: "USD, log scale" }),
            ...placed.map((p) => ({
              key: p.event.id,
              x: p.at,
              y: LANE_Y(p.lane),
              text: p.mark.label,
              className: "nw-mark-label halo",
              anchor: p.anchor,
              dx: p.anchor === "start" ? 5 : -5,
            })),
            ...(cycleHigh === undefined
              ? []
              : [
                  {
                    key: "cycle-high",
                    x: x(day(cycleHigh.date)),
                    y: y(cycleHigh.value),
                    text: `$${String(cycleHigh.value)} cycle high`,
                    className: "mark-label halo",
                    anchor: "end" as const,
                    dx: -8,
                    dy: -6,
                  },
                ]),
            ...(latest === undefined
              ? []
              : [
                  {
                    key: "latest",
                    x: x(day(latest.date)),
                    y: y(latest.value),
                    text: `$${String(latest.value)} - ${latest.when}`,
                    className: "mark-label halo",
                    anchor: "end" as const,
                    dx: -8,
                    dy: -6,
                  },
                ]),
          ]}
        />
      }
      note={
        <>
          The vertical axis is <b>logarithmic</b>, and it has to be: the series runs from $39.75 to $784, so on a linear axis
          the whole of the first leg - a six-fold move - is a flat line on the floor, and the picture argues that nothing
          happened before October 2025. On a log axis equal heights are equal proportional moves, which is the only scale on
          which the annotations can be compared with each other. Twenty-five points, no interpolation between them; the corpus
          publishes these twenty-five out of a 366-point daily pull. The rules mark the day a statement was made and claim
          nothing about what followed it. Two incompatible readings of the period are on the record and both are published
          here, at the weight the corpus gives them rather than at equal weight: Delphi Digital (Nov 2025), which the
          research grades <b>med</b>, found the rally was whale-driven and had &quot;nothing to do with retail&quot;; CCN,
          citing CoinMarketCap, graded <b>low</b>, found institutional inflows under 20 per cent and read it as retail.
          They cannot both be right, the corpus declines to choose, and the weaker of the two is marked as weaker. Open interest today is{" "}
          <b>${(stats.openInterestUsd / 1e9).toFixed(2)}B</b> against a market capitalisation of $
          {(stats.marketCapUsd.low / 1e9).toFixed(1)}B to ${(stats.marketCapUsd.high / 1e9).toFixed(1)}B.
        </>
      }
    >
      <Plot>
        <Axes x={x} y={y} xTicks={xTicks} yTicks={yTicks} />

        {/* The statements: a rule from the label down to the floor. Drawn before
            the series so the price line and its points sit on top of them. */}
        {placed.map((p) => (
          <g key={p.event.id}>
            <line x1={p.at} x2={p.at} y1={LANE_Y(p.lane) + 5} y2={floor} className="nw-mark-rule" />
          </g>
        ))}

        <path d={line} className="series" stroke="var(--ink-dim)" />
        {points.map((pt, i) => (
          <circle key={ZEC_PRICE[i]?.date ?? i} cx={pt[0]} cy={pt[1]} r={3} fill="var(--ink)" className="point" />
        ))}

      </Plot>
    </Chart>
  );
}

/**
 * The citation for the series. The chart is a claim like any other: it carries
 * an id, a confidence and every source id its points name, resolved.
 *
 * The confidence is `stats.confidence`, which is `med`, and not the `high` the
 * research puts on its own price table. The chart prints the current-state
 * figures from `stats.json` in its note as well as the series, and a claim may
 * not be more certain than the least certain thing inside it.
 */
export function NetworkPriceCite() {
  const stats = getStats();
  // The two competing readings named in the chart note are claims the chart
  // makes, so their sources belong in its citation. Without them a reader who
  // opens the popover to check "Delphi Digital" finds CoinGecko and CipherScan.
  // Gate round 1.
  const READINGS = ["S-tradingview-u-today-56fd7e455094b-0-behind-xrp-s", "S-ccn-crypto-zec-500-percent-rally-explained-next"];
  const refs = [...new Set([...ZEC_PRICE.flatMap((p) => p.sources), ...stats.sources, ...READINGS])];
  return (
    <span className="claim">
      <a className="anchor" href="/network#network-price">
        network-price
      </a>
      <Cite
        id="network-price"
        href="/network#network-price"
        lastVerified={stats.lastVerified}
        confidence={stats.confidence}
        sources={resolveSources(refs)}
      />
    </span>
  );
}
