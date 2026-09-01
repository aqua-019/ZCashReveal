import type { SnapshotV1 } from "@zcashreveal/types";

// POOL_VAR, not POOL_SW: POOL_SW maps a pool to its `.sw` MODIFIER CLASS
// ("t", "sp", "o"...), which is what a legend swatch wants and which produces
// `var(o)` - a syntactically valid, silently-resolving-to-nothing custom
// property - if it reaches a `var()`. POOL_VAR is the custom-property map, and
// SVG paint attributes are exactly the "few places that genuinely need the
// custom property" its own comment names.
import { POOL_VAR } from "@/lib/chain";
import { fmtInt } from "@/lib/format";
import {
  LANE_ORDER,
  SPLASH_CAMERA,
  SPLASH_N_MAX,
  buildPlane,
  project,
  trafficLine,
  type Plane,
} from "@/lib/plane";

/**
 * THE TURNSTILE PLANE - five ledgers, one boundary.
 *
 * A server component over `lib/plane.ts`, which does all the arithmetic and is
 * where the argument lives. This file is the SVG and the words around it, and
 * it holds one rule of its own: EVERY NUMBER ON THIS SURFACE COMES FROM THE ONE
 * `Plane` OBJECT. The header's count, the legend's per-lane counts, the traffic
 * line under each node and the window in the sub-head are four renderings of
 * one derivation, and nothing here may recompute any of them from a second
 * source. That is assertion A1, and it is written against three defects the
 * operator shipped into the study and caught by taking a screenshot: a board
 * drawing 17 marks under a reading that said 1,284, a legend computed from the
 * fixture beside arcs computed from the live board, and a mempool row claiming
 * three crossings the plane did not draw.
 *
 * ONE HOVER VERB. The figure dims its own marks and nodes on hover and nothing
 * else - no swell, no recolour, no transform. One curve, `var(--ease)`.
 *
 * NOTHING ANIMATES. Opacity is a pure function of a mark's position in the
 * window, so the board changes when a block arrives - the surface's one
 * ceremony - and never between blocks. There is no rAF loop, no interval and no
 * Web Animations object anywhere in this subtree, which is what makes the
 * reduced-motion contract architectural rather than a cancellation.
 *
 * GOLD IS SPENT ON THE ARROWHEAD AND NOWHERE ELSE HERE. Line colour is the
 * ORIGIN ledger, so the five pool hues keep their own register; the arrowhead is
 * gold because that is where the crossing LANDS, which is the accent's fourth
 * licensed job - "value crossing a pool boundary" - spent on the crossing rather
 * than on the largest number.
 */
export function TurnstilePlane({
  snapshot,
  nMax = SPLASH_N_MAX,
}: {
  readonly snapshot: SnapshotV1;
  readonly nMax?: number;
}) {
  const plane = buildPlane(snapshot, { nMax });

  return (
    <figure className="tplane" data-primitive="TurnstilePlane" data-ui="turnstile">
      <PlaneHead plane={plane} />

      {/* The board is its own positioned box. The label layer is `inset: 0`
          against THIS element, not against the figure: the figure also holds
          the header and the caption, so positioning the labels against it put
          every label a hundred-odd pixels low and dropped the near row into the
          caption text. Found by rendering the page and reading it. */}
      <div className="tplane-board">
      <svg
        className="tplane-svg"
        viewBox="0 0 1180 560"
        role="img"
        aria-label={planeAlt(plane)}
        data-ui="turnstile-svg"
      >
        <PlaneDefs />
        <Graticule />
        {plane.marks.map((m, i) => (
          <g className="tmark" key={`${m.from}-${m.to}-${String(i)}`}>
            <path
              d={m.d}
              fill="none"
              stroke={`var(${POOL_VAR[m.from]})`}
              strokeOpacity={m.opacity}
              // UNIFORM WEIGHT. One constant for every mark, because the
              // document carries no per-crossing amount and a varying width
              // would render one.
              strokeWidth={1.15}
              strokeLinecap="round"
              {...(m.arrow ? { markerEnd: "url(#tplane-arrow)" } : {})}
            />
          </g>
        ))}
        {plane.nodes.map((n) => (
          <g className="tnode" key={n.lane} data-lane={n.lane}>
            <title>{`${n.lane} - ${fmtInt(Number(n.balanceZat / 100_000_000n))} ZEC - ${(n.share * 100).toFixed(2)}% of supply`}</title>
            {n.drop === null ? null : (
              <>
                <line
                  x1={n.cx.toFixed(1)}
                  y1={n.cy.toFixed(1)}
                  x2={n.drop.cx.toFixed(1)}
                  y2={n.drop.cy.toFixed(1)}
                  stroke={`var(${POOL_VAR[n.lane]})`}
                  strokeOpacity={0.34}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <ellipse
                  cx={n.drop.cx.toFixed(1)}
                  cy={n.drop.cy.toFixed(1)}
                  rx={(n.r * 0.62).toFixed(1)}
                  ry={(n.r * 0.24).toFixed(1)}
                  fill="none"
                  stroke={`var(${POOL_VAR[n.lane]})`}
                  strokeOpacity={0.22}
                  strokeWidth={1}
                  strokeDasharray="1 5"
                />
              </>
            )}
            {/* The dotted orbit the share arc is swept on. */}
            <circle
              cx={n.cx.toFixed(1)}
              cy={n.cy.toFixed(1)}
              r={(n.r * 1.42).toFixed(1)}
              fill="none"
              stroke={`var(${POOL_VAR[n.lane]})`}
              strokeOpacity={0.26}
              strokeWidth={1}
              strokeDasharray="1 6"
            />
            {/* SOLIDITY MEANS OBSERVABILITY (D3640). A shielded pool's interior
                is not visible to anyone, this site included, so it is hatched;
                transparent is solid because it is. A plane of five equal solid
                discs would claim a view the instrument does not have. */}
            <circle
              cx={n.cx.toFixed(1)}
              cy={n.cy.toFixed(1)}
              r={n.r.toFixed(1)}
              fill={n.veiled ? `url(#tplane-hatch-${n.lane})` : `var(${POOL_VAR[n.lane]})`}
              fillOpacity={n.veiled ? 1 : 0.82}
            />
            {/* The BOUNDARY is public, so it is drawn sharp. That boundary is
                also the only thing this instrument actually measures. */}
            <circle
              cx={n.cx.toFixed(1)}
              cy={n.cy.toFixed(1)}
              r={n.r.toFixed(1)}
              fill="none"
              stroke={`var(${POOL_VAR[n.lane]})`}
              strokeWidth={(1.7 * n.depth).toFixed(2)}
            />
            <path
              d={shareArc(n.cx, n.cy, n.r * 1.42, n.shareSweep)}
              fill="none"
              stroke={`var(${POOL_VAR[n.lane]})`}
              strokeWidth={(3 * n.depth).toFixed(2)}
              strokeLinecap="round"
            />
          </g>
        ))}
      </svg>

      {/* THE LABELS ARE HTML, NOT SVG <text>, and that is the size floor doing
          its work. SVG text inside a viewBox scales with the box, so a 12px
          label in user units is 12px only at one width and smaller at every
          narrower one - a floor that the viewport can walk under is not a
          floor. Positioned from the same projected coordinates the discs use. */}
      <ul className="tplane-labels" aria-hidden="true">
        {plane.nodes.map((n) => (
          <li
            key={n.lane}
            className="tplane-label"
            data-lane={n.lane}
            data-traffic={n.traffic.kind}
            style={{ left: `${((n.cx / 1180) * 100).toFixed(2)}%`, top: `${(labelTop(n.cy, n.r, n.lane) / 560) * 100}%` }}
          >
            <span className="tl-name">{n.lane}</span>
            <span className="tl-bal">
              {fmtInt(Number(n.balanceZat / 100_000_000n))} - {(n.share * 100).toFixed(2)}%
            </span>
            <span className="tl-traffic">{trafficLine(n.traffic)}</span>
          </li>
        ))}
      </ul>
      </div>

      <figcaption className="tplane-cap">
        {/* The legend repeats the traffic line the labels carry, and the
            repetition is deliberate rather than an oversight: below 760px the
            label overlay is hidden, because five absolutely-positioned blocks
            on a 390px board collide into unreadable mush. The legend is then
            the ONLY carrier of the per-lane reading, so it has to be the whole
            reading and not an abbreviation of it. Both come from the same
            `n.traffic`, which is what keeps A1 true across the breakpoint - a
            legend abbreviated by hand would be a second rendering that could
            drift from the first. */}
        <ul className="tplane-legend">
          {LANE_ORDER.map((lane) => {
            const n = plane.nodes.find((x) => x.lane === lane);
            if (n === undefined) return null;
            return (
              <li className="tlg" key={lane}>
                <span className="tlg-sw" style={{ background: `var(${POOL_VAR[lane]})`, opacity: n.veiled ? 0.72 : 1 }} />
                {lane} <b>{trafficLine(n.traffic)}</b>
              </li>
            );
          })}
        </ul>
        <p className="tplane-limit">
          <b>One mark per counted crossing, uniform weight.</b> Amounts, ordering and confirmation state are not carried per
          crossing in this document, so arc thickness means nothing here and the plane draws no pending arcs. Line colour is
          the origin ledger; the gold arrowhead is where the crossing landed. Perspective is composition, never a measurement.
          An empty plane is the normal state: value moving <i>inside</i> a pool crosses nothing.
        </p>
        {plane.capNote === null ? null : (
          <p className="tplane-cap-note" data-ui="turnstile-capnote">
            {plane.capNote}
          </p>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * The reading, at the same weight as the picture.
 *
 * The window is what makes two boards comparable, so it sits here rather than
 * in the caption - and it is stated in BLOCKS, because blocks are what the
 * document carries. `lib/plane.ts` has the argument for why minutes would be a
 * conversion rather than a reading.
 */
function PlaneHead({ plane }: { readonly plane: Plane }) {
  const r = plane.reading;

  return (
    <div className="tplane-head">
      <span className="tplane-title">
        the turnstile plane
        <span className="tplane-sub">five ledgers, one boundary - ZIP 318 migration is the measured crossing</span>
      </span>
      {r === null ? (
        // An absence states its CONDITION, never an owner. SNAPSHOT.md 8.1.
        <span className="tplane-absent" data-ui="turnstile-reading">
          {plane.absence?.what ?? "Crossings"} - not measured
          <span className="tplane-cond">{plane.absence?.condition ?? "no migration window was read"}</span>
        </span>
      ) : (
        <span className="tplane-reading" data-ui="turnstile-reading">
          <b>{fmtInt(r.countedCrossings)}</b> crossings measured over <b>{fmtInt(r.windowBlocks)}</b> blocks
          <span className="tplane-cond">
            {r.capped ? `board drawing ${fmtInt(r.drawnMarks)} of them` : "every one drawn"} - to block {fmtInt(r.height)}
          </span>
        </span>
      )}
    </div>
  );
}

/** One hatch per veiled lane, and one gold arrowhead shared by every mark. */
function PlaneDefs() {
  return (
    <defs>
      {LANE_ORDER.map((lane) => (
        <pattern
          key={lane}
          id={`tplane-hatch-${lane}`}
          width="5"
          height="5"
          patternTransform="rotate(135)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="5" height="5" fill={`var(${POOL_VAR[lane]})`} fillOpacity={0.16} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={`var(${POOL_VAR[lane]})`} strokeOpacity={0.62} strokeWidth={1.6} />
        </pattern>
      ))}
      <marker
        id="tplane-arrow"
        viewBox="0 0 10 10"
        refX="8.4"
        refY="5"
        markerWidth="7.4"
        markerHeight="7.4"
        orient="auto-start-reverse"
      >
        <path d="M0 1.2 L9.4 5 L0 8.8 z" fill="var(--gold)" />
      </marker>
    </defs>
  );
}

/**
 * The plane itself: a graticule and three orbit rings.
 *
 * Static - it depends on the camera and on nothing in the document - so it is
 * written out rather than derived, and there is no arithmetic here that could
 * disagree with a reading.
 */
function Graticule() {
  const lines: React.ReactElement[] = [];
  const N = 14;
  for (let i = 0; i <= N; i += 1) {
    const t = -1 + (2 * i) / N;
    const o = i % 7 === 0 ? 0.42 : i % 2 === 0 ? 0.2 : 0.1;
    const [ax, ay] = proj(t, -1);
    const [bx, by] = proj(t, 1);
    const [cx, cy] = proj(-1, t);
    const [dx, dy] = proj(1, t);
    lines.push(
      <line key={`v${String(i)}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--gold)" strokeOpacity={o} strokeWidth={1} />,
      <line key={`h${String(i)}`} x1={cx} y1={cy} x2={dx} y2={dy} stroke="var(--gold)" strokeOpacity={o} strokeWidth={1} />,
    );
  }
  return (
    <g className="tplane-floor" aria-hidden="true">
      {lines}
      {[
        [1.02, 0.3, "1 6"],
        [1.13, 0.19, "1 8"],
        [1.26, 0.11, "1 10"],
      ].map(([r, op, dash]) => (
        <polyline
          key={String(r)}
          points={ring(Number(r))}
          fill="none"
          stroke="var(--gold)"
          strokeOpacity={Number(op)}
          strokeWidth={1}
          strokeDasharray={String(dash)}
        />
      ))}
    </g>
  );
}

/* ---- geometry helpers, all pure and all on the splash camera ---- */

function proj(x: number, z: number): readonly [string, string] {
  const [px, py] = project(SPLASH_CAMERA, x, 0, z);
  return [px.toFixed(1), py.toFixed(1)];
}

function ring(r: number): string {
  const pts: string[] = [];
  for (let a = 0; a <= 64; a += 1) {
    const th = (a / 64) * Math.PI * 2;
    const [px, py] = project(SPLASH_CAMERA, Math.cos(th) * r, 0, Math.sin(th) * r);
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return pts.join(" ");
}

/** The share arc, swept clockwise from twelve o'clock on the node's ring. */
function shareArc(cx: number, cy: number, r: number, sweep: number): string {
  const a0 = -Math.PI / 2;
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a0 + sweep) * r;
  const y1 = cy + Math.sin(a0 + sweep) * r;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${String(large)} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Labels go below a near node and above a far one, so they never sit on a mark. */
function labelTop(cy: number, r: number, lane: string): number {
  if (lane === "ironwood") return cy - r * 1.9 - 52;
  if (lane === "sprout" || lane === "sapling") return cy - r * 1.6 - 52;
  return cy + r * 1.6 + 6;
}

/**
 * The alt text, which has to carry the same reading as the picture.
 *
 * A figure whose alt text says less than its caption is a figure that is
 * inaccessible rather than decorative, and one whose alt text says MORE is a
 * second source for a rendered quantity. This restates the one `Plane`.
 */
function planeAlt(plane: Plane): string {
  const r = plane.reading;
  const where =
    "Five Zcash ledgers on a perspective plane: transparent near-left, orchard near-right, sprout far-left, " +
    "sapling far-right, ironwood raised at the centre. Shielded ledgers are hatched because their interiors are " +
    "not observable; their boundaries are drawn sharp because those are public.";
  if (r === null) {
    return `${where} No crossings are drawn: ${plane.absence?.condition ?? "no migration window was read"}.`;
  }
  return (
    `${where} ${fmtInt(r.countedCrossings)} ZIP 318 crossings were counted from orchard to ironwood over ` +
    `${fmtInt(r.windowBlocks)} blocks to block ${fmtInt(r.height)}, and the board draws ` +
    `${fmtInt(r.drawnMarks)} of them at uniform weight. No other pool boundary is measured by this document.`
  );
}
