import type { CSSProperties, ReactNode } from "react";

/**
 * CHART LABELS AS HTML, POSITIONED OVER THE SVG - the size floor reaching the
 * one place HANDOFF-04a could not take it.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN ARGUED. A `<text>` inside a scaled
 * `viewBox` is not CSS pixels. Its declared size is in USER UNITS, and the user
 * unit is whatever the browser divides the rendered width by, so the painted
 * size is `declared x (renderedCssWidth / viewBoxWidth)` and moves with the
 * viewport. `--t-floor` is a rule about CSS pixels; a declaration cannot satisfy
 * it at every width by being made larger, because there is no width at which it
 * stops shrinking. 04a measured that from the source; L2 reproduced it on the
 * served build; this branch measured every SVG on the site and found the same
 * regime everywhere, at every declared value:
 *
 *   painted CSS px          1440    1024     760     390
 *   TwoWindows      (12u)  16.10   11.11    7.94    3.79
 *   ShieldedShare   (12u)   5.95    3.95    7.94    3.79
 *   NetworkLoop sub (9.5u) 13.15    9.20    6.84    6.84
 *   PoolSankey      (12u)  13.77    9.35    4.79    2.00
 *
 * TWO THINGS IN THAT TABLE ARE WORTH THE READER'S ATTENTION, because both
 * refute the obvious model. First, `ShieldedShare` paints at 5.95px on a 1440px
 * DESKTOP - it sits in the `.record-head` aside, a 0.8fr column of a two-column
 * grid, so the widest viewport gives it the narrowest box. Second, it is
 * NON-MONOTONE: 3.95px at 1024 and 9.62px at 900, because the head collapses to
 * one column at 900 and the chart gets WIDER as the window gets smaller. A
 * floor the viewport can walk under can be walked under going up as well as
 * down, and a check that samples only the narrow end finds neither case.
 *
 * SO THE LABEL LEAVES THE SVG. The geometry stays in the viewBox where it
 * belongs - a stroke width still means the same thing on every chart - and the
 * TEXT is an HTML element absolutely positioned over the drawing, sized by the
 * ordinary CSS cascade in real pixels. `TurnstilePlane` already does this and
 * says why in its own comment; this is that decision made general.
 *
 * WHY PERCENTAGE POSITIONING IS EXACT AND NOT AN APPROXIMATION. Every chart
 * `<svg>` here carries a `viewBox`, `preserveAspectRatio="xMidYMid meet"`,
 * `width: 100%` and `height: auto`. The intrinsic aspect ratio of such an
 * element comes from the viewBox, so the rendered box's aspect ratio EQUALS the
 * viewBox's, and the layer stretched over it maps user unit `x` to
 * `x / viewBoxWidth` of its own width - with no scale factor to track and
 * nothing to recompute when the layout moves. That is the whole reason this is
 * a percentage rather than a pixel offset: a pixel offset would need the
 * rendered width, which is exactly the quantity that is not knowable from the
 * source.
 *
 * THE LAYER IS `aria-hidden`, like the drawing it labels, and for the same
 * reason: `figure[data-chart]` carries a real `<table>` twin and the table is
 * the reading (HANDOFF-03, assertion A3). Announcing the labels as well would
 * read the same numbers twice, once as loose words with no structure.
 */

/** Where the label's anchor point sits relative to its own box. */
export type LabelAnchor = "start" | "middle" | "end";

/**
 * Which line of the label the `y` coordinate names.
 *
 * `alphabetic` is SVG's default and the one every converted `<text>` used, so
 * a converted label keeps the coordinate it already had; the layer shifts the
 * box up by one line so the glyphs sit where the baseline did.
 */
export type LabelBaseline = "alphabetic" | "middle" | "hanging";

export interface ChartLabel {
  /** Stable React key. */
  readonly key: string;
  /** x in viewBox USER UNITS - the same number the `<text>` carried. */
  readonly x: number;
  /** y in viewBox USER UNITS - the same number the `<text>` carried. */
  readonly y: number;
  readonly text: ReactNode;
  /** Extra class, for the per-chart registers below. */
  readonly className?: string;
  readonly anchor?: LabelAnchor;
  readonly baseline?: LabelBaseline;
  /**
   * A nudge off the anchor point, in CSS PIXELS rather than in user units, and
   * the distinction is the point of the whole exercise.
   *
   * `x` and `y` say WHERE ON THE DRAWING the label belongs, so they are in the
   * viewBox and scale with it. A gap between a tick mark and its number is not
   * about the drawing at all - it is about the reader's eye and the height of
   * the glyph, neither of which scales. The old `<text>` could not tell the two
   * apart and its offsets were user units: the 17 units under the x axis were
   * 8.4px of clearance for 5.95px text on a 1440px timeline and 11.3px for
   * 7.94px text at 760, so the ratio was roughly right by accident. At a fixed
   * 12px it is not, and the y tick and the first x tick collide in the corner.
   * Measured on the first render of this component, not predicted.
   */
  readonly dx?: number;
  readonly dy?: number;
}

/**
 * The layer. One per chart, a sibling of the `<svg>` inside `figure.chart`,
 * stacked on it by the grid in `globals.css` so its box is the drawing's box
 * exactly - no wrapper element, because assertion A3 counts
 * `figure[data-chart] > svg` and a wrapper would take the `<svg>` out of that
 * selector. Stacking rather than wrapping is what keeps A3 untouched.
 */
export function ChartLabels({
  vw,
  vh,
  items,
  className,
}: {
  /** viewBox width in user units. */
  readonly vw: number;
  /** viewBox height in user units. */
  readonly vh: number;
  readonly items: readonly ChartLabel[];
  /** Optional modifier on the layer, for charts that hide labels at a width. */
  readonly className?: string;
}) {
  return (
    <div className={className === undefined ? "plotlabels" : `plotlabels ${className}`} aria-hidden="true">
      {items.map((l) => (
        <span
          key={l.key}
          className={l.className === undefined ? "plabel" : `plabel ${l.className}`}
          data-anchor={l.anchor ?? "start"}
          data-baseline={l.baseline ?? "alphabetic"}
          style={
            {
              left: `${((l.x / vw) * 100).toFixed(4)}%`,
              top: `${((l.y / vh) * 100).toFixed(4)}%`,
              ...(l.dx === undefined ? {} : { "--plabel-dx": `${String(l.dx)}px` }),
              ...(l.dy === undefined ? {} : { "--plabel-dy": `${String(l.dy)}px` }),
            } as CSSProperties
          }
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
