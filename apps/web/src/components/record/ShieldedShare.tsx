import { getStats, resolveSources } from "@zcashreveal/content";

import { Chart, ChartTable } from "@/components/record/Chart";
import { Cite } from "@/components/record/Cite";
import { PLOT, Axes, Plot, linear, path } from "@/components/record/Plot";
import { SHIELDED_SHARE, SHIELDED_SHARE_LAST_T } from "@/lib/series";

/**
 * The shielded share of ZEC supply, 2018 to 2026.
 *
 * One series, so no legend - the caption names it and the axis carries the
 * unit. Two direct labels, and only two: the May 2026 peak and the current
 * reading, because those are the two numbers the page argues about. Every other
 * point is in the table twin.
 *
 * The last reading is drawn as a BAND, not a point. CipherScan and ZECStats
 * disagree by 0.8 points on the same day, and averaging two explorers into one
 * confident number is precisely the move this site exists to refuse. The band
 * is the honest shape of a figure whose sources do not agree.
 */

const X_DOMAIN = [2018, 2027] as const;
const Y_DOMAIN = [0, 35] as const;

export function ShieldedShare() {
  const stats = getStats();
  const { low, high } = stats.shieldedSharePct;

  const { width, height, pad } = PLOT;
  const x = linear(X_DOMAIN, [pad.left, width - pad.right]);
  const y = linear(Y_DOMAIN, [height - pad.bottom, pad.top]);

  const points = SHIELDED_SHARE.map((p) => [x(p.t), y(p.value)] as const);
  const floor = y(0);
  const line = path(points);
  // The fill is the same line, closed to the axis. It is a wash at 8 per cent,
  // not a colour: the quantity is the line, and the area only says "of supply".
  const area = `${path([[points[0]?.[0] ?? 0, floor], ...points])} L${(points[points.length - 1]?.[0] ?? 0).toFixed(2)},${floor.toFixed(2)} Z`;

  const peak = SHIELDED_SHARE.reduce((a, b) => (b.value > a.value ? b : a), SHIELDED_SHARE[0] as (typeof SHIELDED_SHARE)[number]);

  const bandX = x(SHIELDED_SHARE_LAST_T);
  const bandTop = y(high);
  const bandBottom = y(low);

  return (
    <Chart
      id="shielded-share"
      caption="Shielded share of ZEC supply, 2018 to 2026"
      table={
        <ChartTable
          caption="Shielded share of ZEC supply, by reading date"
          columns={["Date", "Share of supply", "Source note"]}
          rows={[
            ...SHIELDED_SHARE.map((p) => [p.when, `${p.value} per cent`, p.note ?? "-"]),
            [
              `${stats.asOf} (block ${stats.height.toLocaleString("en-GB")})`,
              `${low} to ${high} per cent`,
              stats.shieldedShareNote,
            ],
          ]}
        />
      }
      note={
        <>
          Nine and a half years after mainnet, the shielded share peaked at 30 per cent and fell back. The final reading is a
          band because its two sources disagree: CipherScan reads {low} per cent and ZECStats {high} per cent on the same day.
          The decline from the May 2026 peak spans the Orchard disclosure and the forced Ironwood migration; the corpus flags
          the fall and declines to attribute a cause, and so does this chart.
        </>
      }
    >
      <Plot>
        <Axes
          x={x}
          y={y}
          xTicks={[2018, 2020, 2022, 2024, 2026].map((t) => ({ at: t, label: String(t) }))}
          yTicks={[0, 10, 20, 30].map((v) => ({ at: v, label: `${v}%` }))}
          yLabel="share of supply"
        />
        <path d={area} className="band" />
        <path d={line} className="series" stroke="var(--gold)" />
        {points.map((p, i) => (
          <circle key={SHIELDED_SHARE[i]?.when ?? i} cx={p[0]} cy={p[1]} r={3.5} fill="var(--gold)" className="point" />
        ))}

        {/* The current reading: a band between the two explorers, not a point. */}
        <rect x={bandX - 5} y={bandTop} width={10} height={Math.max(bandBottom - bandTop, 2)} className="band" />
        <line x1={bandX - 9} x2={bandX + 9} y1={bandTop} y2={bandTop} className="band-edge" />
        <line x1={bandX - 9} x2={bandX + 9} y1={bandBottom} y2={bandBottom} className="band-edge" />

        <text x={x(peak.t) - 10} y={y(peak.value) - 10} className="mark-label" textAnchor="end">
          peak {peak.value}% - {peak.when}
        </text>
        <text x={bandX - 12} y={bandBottom + 20} className="mark-label" textAnchor="end">
          {low} to {high}% - {stats.asOf}
        </text>
      </Plot>
    </Chart>
  );
}

/**
 * The citation for the series, rendered next to it. The chart is a claim like
 * any other and carries the same apparatus: an id, a confidence and its
 * sources.
 */
export function ShieldedShareCite() {
  const stats = getStats();
  const refs = [...new Set([...SHIELDED_SHARE.flatMap((p) => p.sources), ...stats.sources])];
  return (
    <span className="claim">
      <Cite
        id="shielded-share"
        href="/timeline#shielded-share"
        lastVerified={stats.lastVerified}
        confidence={stats.confidence}
        sources={resolveSources(refs)}
      />
    </span>
  );
}
