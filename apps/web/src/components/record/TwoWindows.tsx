import { getBeware, resolveSources } from "@zcashreveal/content";

import { Chart, ChartTable } from "@/components/record/Chart";
import { Cite } from "@/components/record/Cite";
import { PLOT, Plot, linear } from "@/components/record/Plot";

/**
 * The two windows, on one axis: the whole of the argument in one picture.
 *
 * Zcash's chain life, from mainnet to the current tip, banded into four
 * contiguous intervals. Two of them are the periods in which the shielded
 * circuits were unsound and no one can prove nothing was minted. Laid out this
 * way the point is not that there were two incidents on a timeline - it is that
 * the incidents are most of the timeline.
 *
 * The mockup draws this with absolutely positioned divs and percentage widths.
 * It is inline SVG here, because HANDOFF-03 section 3 says charts are inline
 * SVG built in code with a table twin, and a picture that carries the page's
 * central claim is the last one that should be unreadable to a screen reader.
 * Recorded as a divergence in the section 8 ledger.
 *
 * The four breakpoints are route constants rather than parsed dates on purpose.
 * `BewareEntry.window` is a pair of loose strings ("28 Oct 2016", "1 Jun 2026
 * (4 years, 1 day)") because the corpus states some windows imprecisely, and
 * parsing free text into chart geometry is the kind of quiet fragility that
 * renders a wrong picture rather than an error. Each constant cites the seed it
 * comes from.
 */

/** Decimal years. Domain and breakpoints, each with the seed field behind it. */
const T0 = 2016.83; // B1.window.from - 28 Oct 2016, mainnet
const T_SAPLING = 2018.83; // B1.window.to - 28 Oct 2018, Sapling silently fixes it
const T_NU5 = 2022.41; // B2.window.from - 31 May 2022, NU5 ships Orchard
const T_NU62 = 2026.42; // B2.window.to - 1 Jun 2026, NU6.2 closes the circuit
const T_NOW = 2026.65; // the current tip, 22 Aug 2026

const DOMAIN = [T0 - 0.03, T_NOW] as const;

interface Band {
  readonly from: number;
  readonly to: number;
  readonly sound: boolean;
  readonly name: string;
  readonly detail: string;
  /** Printed above the band. Only the unsound ones carry one. */
  readonly label?: string;
}

const BANDS: readonly Band[] = [
  {
    from: T0,
    to: T_SAPLING,
    sound: false,
    name: "Sprout, BCTV14",
    detail: "28 Oct 2016 to 28 Oct 2018, about 730 days. Fixed silently at Sapling; disclosed 341 days after that.",
    label: "Sprout unsound - 730 d",
  },
  {
    from: T_SAPLING,
    to: T_NU5,
    sound: true,
    name: "Sapling era",
    detail: "28 Oct 2018 to 31 May 2022. Sound as far as anyone knows.",
  },
  {
    from: T_NU5,
    to: T_NU62,
    sound: false,
    name: "Orchard, halo2",
    detail: "31 May 2022 to 1 Jun 2026, 1,462 days. One missing copy constraint in the double-and-add loop.",
    label: "Orchard unsound - 1,462 d",
  },
  {
    from: T_NU62,
    to: T_NOW,
    sound: true,
    name: "NU6.2 to Ironwood",
    detail: "1 Jun 2026 to the tip. Fixed circuit, and a new pool that starts empty.",
  },
];

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

/** Days each band covers, to one day, from the decimal-year span. */
function days(band: Band): number {
  return Math.round((band.to - band.from) * 365.25);
}

export function TwoWindows() {
  const { width, pad } = PLOT;
  // One bar, not a field: a shorter viewBox than the shared 320.
  const height = 150;
  const x = linear(DOMAIN, [pad.left, width - pad.right]);
  const barY = 52;
  const barH = 34;

  const unsoundDays = BANDS.filter((b) => !b.sound).reduce((sum, b) => sum + days(b), 0);
  const totalDays = Math.round((T_NOW - T0) * 365.25);
  const sharePct = ((unsoundDays / totalDays) * 100).toFixed(0);

  return (
    <Chart
      id="two-windows"
      caption="Chain life, banded by whether the shielded circuits were sound"
      table={
        <ChartTable
          caption="The four intervals of Zcash chain life, with their soundness"
          columns={["Interval", "Sound", "Approximate days", "What happened"]}
          rows={BANDS.map((b) => [b.name, b.sound ? "yes" : "no", String(days(b)), b.detail])}
        />
      }
      note={
        <>
          About {sharePct} per cent of the chain&apos;s life to date falls inside a window in which the property that would
          rule out counterfeiting did not hold. That is not an allegation that counterfeiting occurred: no one can show that it
          did, and - this is the whole point - no one can show that it did not. A soundness bug leaves no trace, which is what
          soundness means.
        </>
      }
    >
      <Plot height={height}>
        {/* `defs` is a direct child of the one `<svg>` this figure contains. A
            nested `<svg>` would give the figure two, and assertion A3 counts
            them against the table twins. The hatch is the danger register, and
            it is the only place the splash spends it: a solid fill would read
            as a quantity, where a hatch reads as a caveat, which is what an
            unsound interval is. */}
        <defs>
          <pattern id="hatch-unsound" width="12" height="12" patternTransform="rotate(135)" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="rgba(228, 85, 63, 0.25)" />
            <rect width="6" height="12" fill="rgba(228, 85, 63, 0.55)" />
          </pattern>
        </defs>

        <line x1={pad.left} x2={width - pad.right} y1={barY + barH} y2={barY + barH} className="axisline" />
        {YEARS.map((yr) => (
          <g key={yr}>
            <line x1={x(yr)} x2={x(yr)} y1={barY + barH} y2={barY + barH + 6} className="era-tick" />
            <text x={x(yr)} y={barY + barH + 22} className="tick tick-x">
              {yr}
            </text>
          </g>
        ))}

        {BANDS.map((b) => (
          <rect
            key={b.name}
            x={x(b.from)}
            y={barY}
            width={Math.max(x(b.to) - x(b.from), 2)}
            height={barH}
            rx={2}
            fill={b.sound ? "rgba(237, 230, 216, 0.06)" : "url(#hatch-unsound)"}
            stroke={b.sound ? "var(--line)" : "rgba(228, 85, 63, 0.7)"}
            strokeWidth={1}
          />
        ))}

        {BANDS.filter((b) => b.label !== undefined).map((b) => (
          <text key={b.name} x={x(b.from) + 4} y={barY - 12} className="mark-label">
            {b.label}
          </text>
        ))}
      </Plot>
    </Chart>
  );
}

/** The citation for the diagram: both entries it is drawn from. */
export function TwoWindowsCite() {
  const beware = getBeware();
  const b1 = beware.find((e) => e.id === "B1");
  const b2 = beware.find((e) => e.id === "B2");
  const refs = [...new Set([...(b1?.sources ?? []), ...(b2?.sources ?? [])])];
  // Never more certain than the weaker of the two entries it draws.
  const confidence = b1?.confidence === "high" && b2?.confidence === "high" ? "high" : "med";
  const lastVerified = [b1?.lastVerified, b2?.lastVerified].filter((d): d is string => d !== undefined).sort()[0] ?? "2026-08-22";
  return (
    <span className="claim">
      <a className="anchor" href="/beware#B1">
        B1
      </a>
      <a className="anchor" href="/beware#B2">
        B2
      </a>
      <Cite
        id="two-windows"
        href="/#two-windows"
        lastVerified={lastVerified}
        confidence={confidence}
        sources={resolveSources(refs)}
      />
    </span>
  );
}
