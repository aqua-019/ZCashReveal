import { getNetwork, resolveSources, type Confidence, type NetworkEdge } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";

import { Chart, ChartTable, LegendItem } from "@/components/record/Chart";
import { Plot } from "@/components/record/Plot";

/**
 * The loop: nine disclosed parties and eleven disclosed transfers between them.
 *
 * This is the one drawing on the site that is not a chart of a quantity. It is
 * a hand-positioned lattice, and it is hand-positioned for a reason: the
 * argument of the page is that a specific closed circuit exists, and a force
 * layout would place the nodes by degree and hide the circuit inside a hairball.
 * `NetworkEntity` carries no coordinates and `networkSchema` is `.strict()`, so
 * they could not live in the seed even if they should; the 3x3 table below is
 * the whole of the layout.
 *
 * WHAT IT DRAWS AND WHAT IT DOES NOT. Every node is an entity record and every
 * edge is an edge record, by id. The mockup's diagram had a Coinbase node and
 * two Coinbase edges; `packages/content` has no `N-coinbase` and no edge to or
 * from one, so they are not drawn - a box with no record behind it cannot carry
 * an id, a confidence or a citation, and on this page that is disqualifying.
 * The Zcash protocol node stands in its place: it is a real record, and it is
 * what "the treasury company buys the token" and "the exchange lists the token"
 * actually terminate in.
 *
 * The corpus's own summary of the circuit, which this picture is a drawing of
 * (research 02 section 1.4): "Winklevoss Capital funds the treasury company ->
 * the treasury company buys the token and funds the developer -> the
 * developer's founder advises the treasury company -> the token's co-founder
 * advises the treasury company and runs a second developer that Winklevoss also
 * funds -> the Winklevoss exchange lists the token, adds a rewards card for it,
 * and its founders publicly advocate for it. Every leg is disclosed somewhere;
 * no single disclosure shows the whole loop."
 *
 * EDGE KIND IS NOT A SEED FIELD. `NetworkEdge` has no `kind`, and it must not
 * be inferred from `amount`: `N-edge-zooko-cypherpunk-advisor` is a people edge
 * whose consideration is undisclosed, and `N-edge-winklevoss-capital-invests-zodl`
 * is a money edge that carries no amount either. The kind is stated per edge in
 * the table below and nowhere else.
 */

/** The diagram's own coordinate space. Wider than the shared plot is tall. */
const H = 470;
/**
 * 200 units, and it stayed 200 at HANDOFF-04a after a round trip worth
 * recording. The type floor first moved `.plot .nw-sub` and `.plot
 * .edge-label` from 9.5 to 12, which overflowed two second lines - "ZODL CEO -
 * paid CYPH advisor" measured 223 units against this box - so the box was
 * widened to 244. That fixed the node labels and BROKE THE EDGE LABELS: three
 * columns in a 1000-unit space have 150 units of gap at w=200 and 106 at
 * w=244, and "$33.33M fleet, in equity" is 173 units at 12 and 137 at 9.5. It
 * fits the first gap at the old size and neither gap at the new one.
 *
 * The coordinate space cannot simply grow: `PLOT.width` is shared by every
 * chart on the site so that a stroke width means the same thing on all of
 * them. So the two labels went back to 9.5 and are a NAMED EXCLUSION in
 * test/unit/type-scale.test.ts rather than a silent survival, and the reason
 * they are allowed to be is measured rather than asserted - see that file's
 * SVG_EXCLUSIONS. `.plot .node-label` stayed at the floor: it fits.
 */
const BOX = { w: 200, h: 54 } as const;
const COL = { l: 150, c: 500, r: 850 } as const;
const ROW = { t: 96, m: 250, b: 404 } as const;

interface Node {
  /** The entity record this box stands for. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /**
   * A short display name. `NetworkEntity.title` is long-form
   * ("Cypherpunk Technologies Inc. (Nasdaq: CYPH)") and does not fit the box;
   * the cards under the diagram print the title, the role and the exposure in
   * full, with the citation.
   */
  readonly name: string;
  /** One compressed line, and which seed field it compresses. */
  readonly sub: string;
}

const NODES: readonly Node[] = [
  // Row 1 - the money.
  { id: "N-winklevoss-capital", x: COL.l, y: ROW.t, name: "Winklevoss Capital", sub: "no exposure disclosed" },
  { id: "N-cypherpunk-technologies", x: COL.c, y: ROW.t, name: "Cypherpunk Technologies", sub: "CYPH - 323,394.38 ZEC" },
  { id: "N-zodl", x: COL.r, y: ROW.t, name: "ZODL", sub: "$25M seed, $5M of it CYPH" },
  // Row 2 - the people who hold and the asset they hold.
  { id: "N-tyler-winklevoss", x: COL.l, y: ROW.m, name: "Tyler Winklevoss", sub: "co-donor, 3,221 ZEC" },
  { id: "N-zcash-protocol", x: COL.c, y: ROW.m, name: "Zcash protocol", sub: "the common counterparty" },
  { id: "N-josh-swihart", x: COL.r, y: ROW.m, name: "Josh Swihart", sub: "ZODL CEO - paid CYPH advisor" },
  // Row 3 - the venue, the lab and the founder.
  { id: "N-gemini", x: COL.l, y: ROW.b, name: "Gemini", sub: "no exposure disclosed" },
  { id: "N-shielded-labs", x: COL.c, y: ROW.b, name: "Shielded Labs", sub: "3,221 ZEC donated in" },
  { id: "N-zooko-wilcox", x: COL.r, y: ROW.b, name: "Zooko Wilcox", sub: "FR 0.9% of supply" },
];

const AT = new Map(NODES.map((n) => [n.id, n]));

type Kind = "money" | "people";

interface Drawn {
  /** The edge record. Everything printed about this line comes from it. */
  readonly id: string;
  readonly kind: Kind;
  /** The label the line carries. A compression of `NetworkEdge.what`. */
  readonly label: string;
  /**
   * Where the label sits, as a fraction of the port-to-port segment. It is the
   * only positioning control: `.plot .edge-label` fixes `text-anchor: middle`
   * and a CSS declaration beats a presentation attribute, so a label cannot be
   * nudged sideways with an anchor - it is centred on its own line, the halo
   * knocks the line out from under it, and separation between two labels is a
   * matter of choosing different fractions.
   */
  readonly at: number;
  /**
   * Separation for parallel edges between the same two boxes, in user units.
   * It slides the port ALONG the box side it sits on - vertically when the ray
   * leaves through a left or right edge, horizontally when it leaves through a
   * top or bottom one. A separation applied on the wrong axis detaches the line
   * from the box at one end and buries it at the other, which is what a plain
   * y-offset does to every diagonal in this lattice.
   */
  readonly off?: number;
  /** Draw as an arc over the top rather than a straight line. */
  readonly arc?: true;
}

/**
 * The eleven legs of the circuit, in draw order. Every `id` resolves in
 * `network.json`; an id that does not is dropped at render time rather than
 * drawn as an unsourced line.
 */
const EDGES: readonly Drawn[] = [
  { id: "N-edge-winklevoss-capital-seeds-cypherpunk", kind: "money", label: "$58.888M seed", at: 0.5, off: -9 },
  { id: "N-edge-winklevoss-capital-sells-mining-fleet", kind: "money", label: "$33.33M fleet, in equity", at: 0.5, off: 9 },
  { id: "N-edge-cypherpunk-invests-zodl", kind: "money", label: "$5.0M SAFE", at: 0.5 },
  { id: "N-edge-winklevoss-capital-invests-zodl", kind: "money", label: "seed investor in both", at: 0.5, arc: true },
  { id: "N-edge-cypherpunk-buys-zec", kind: "money", label: "323,394.38 ZEC - $110.5M", at: 0.5 },
  { id: "N-edge-gemini-zec-rewards-card", kind: "money", label: "ZEC rewards card", at: 0.22, off: -13 },
  { id: "N-edge-gemini-shielded-withdrawals", kind: "money", label: "shielded withdrawals", at: 0.78, off: 13 },
  { id: "N-edge-winklevoss-twins-donate-shielded-labs", kind: "money", label: "3,221 ZEC gift", at: 0.3 },
  { id: "N-edge-swihart-cypherpunk-advisor", kind: "people", label: "paid advisor", at: 0.42, off: -8 },
  { id: "N-edge-swihart-founds-zodl", kind: "people", label: "founder, CEO", at: 0.5 },
  { id: "N-edge-zooko-cypherpunk-advisor", kind: "people", label: "paid advisor", at: 0.44, off: 8 },
];

/**
 * Half the cap height of the 9.5-unit edge label, so a `y` given as a point on
 * the line renders with the text centred on it rather than sitting above it.
 */
const BASELINE = 3.5;

/** How far above the boxes the one arc rises. */
const ARC_LIFT = 59;

/**
 * Where the centre-to-centre ray leaves the box, and where a parallel sibling
 * leaves it.
 *
 * The 0.015 is a hair of clearance so the line starts outside the stroke rather
 * than on it; without it the arrowhead sits half inside the rect it points at.
 * `off` slides the port along whichever side the ray actually crosses, which is
 * the left or right side when `tx` binds and the top or bottom when `ty` does.
 */
function port(a: Node, b: Node, off: number): readonly [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : BOX.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : BOX.h / 2 / Math.abs(dy);
  const throughSide = tx < ty;
  const t = Math.min(tx, ty) + 0.015;
  return [a.x + dx * t + (throughSide ? 0 : off), a.y + dy * t + (throughSide ? off : 0)];
}

export function NetworkLoop() {
  const { edges } = getNetwork();
  const edgeAt = new Map(edges.map((e) => [e.id, e]));

  // An edge whose record has gone away is not drawn as an anonymous line: it
  // simply is not drawn, and the twin below is built from the same filtered
  // list, so the picture and the table can never disagree about what exists.
  const drawn: readonly (Drawn & { readonly edge: NetworkEdge; readonly from: Node; readonly to: Node })[] = EDGES.flatMap(
    (d) => {
      const edge = edgeAt.get(d.id);
      if (edge === undefined) return [];
      const from = AT.get(edge.from);
      const to = AT.get(edge.to);
      if (from === undefined || to === undefined) return [];
      return [{ ...d, edge, from, to }];
    },
  );

  return (
    <Chart
      id="network-loop"
      caption="The disclosed loop: nine parties, eleven transfers"
      legend={
        <>
          <LegendItem colour="var(--gold-dim)">money - a disclosed payment, investment, donation or purchase</LegendItem>
          <LegendItem colour="var(--p-orchard)">people - a disclosed role, dashed as well as coloured</LegendItem>
        </>
      }
      table={
        <ChartTable
          caption="Every edge drawn in the loop diagram, with its amount, date and confidence"
          columns={["Edge", "Kind", "What", "Amount", "Date", "Confidence"]}
          rows={drawn.map((d) => [
            `${d.from.name} to ${d.to.name} (${d.edge.id})`,
            d.kind,
            d.edge.what,
            d.edge.amount ?? "none disclosed",
            d.edge.date,
            d.edge.confidence,
          ])}
        />
      }
      note={
        <>
          Eleven of the {edges.length} disclosed edges in the corpus, chosen because they close a circuit; the table under this
          block lists all {edges.length} so the selection can be checked. Nothing here evidences illegality. Every leg is
          disclosed somewhere - a placement announcement, a 10-Q, a press release, a donation report - and no single disclosure
          shows the loop. Positions are drawn by hand: the seed carries no coordinates, and a force layout would sort these
          boxes by degree and bury the circuit the page is about.
        </>
      }
    >
      <Plot height={H}>
        <defs>
          <marker id="nw-arrow-money" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10z" fill="var(--gold-dim)" />
          </marker>
          <marker id="nw-arrow-people" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10z" fill="var(--p-orchard)" />
          </marker>
        </defs>

        {/* Lines first, boxes second: the rects are opaque, so drawing them last
            lets them occlude anything routed behind them. */}
        {drawn.map((d) => {
          const off = d.off ?? 0;
          const a = port(d.from, d.to, off);
          const b = port(d.to, d.from, off);
          const money = d.kind === "money";
          const stroke = money ? "var(--gold-dim)" : "var(--p-orchard)";
          const marker = money ? "url(#nw-arrow-money)" : "url(#nw-arrow-people)";
          // The one arc: Winklevoss Capital into ZODL, which shares both of its
          // endpoints' rows with a straight edge already, so a second straight
          // line would sit on top of the first two.
          const apex = Math.min(d.from.y, d.to.y) - BOX.h / 2 - ARC_LIFT;
          const lx = d.arc === true ? (d.from.x + d.to.x) / 2 : a[0] + (b[0] - a[0]) * d.at;
          const ly = (d.arc === true ? apex + 15 : a[1] + (b[1] - a[1]) * d.at) + BASELINE;
          return (
            <g key={d.id}>
              <path
                d={
                  d.arc === true
                    ? `M${d.from.x},${d.from.y - BOX.h / 2} C${d.from.x},${apex} ${d.to.x},${apex} ${d.to.x},${d.to.y - BOX.h / 2}`
                    : `M${a[0].toFixed(2)},${a[1].toFixed(2)} L${b[0].toFixed(2)},${b[1].toFixed(2)}`
                }
                className={money ? "edge" : "edge nw-edge-people"}
                stroke={stroke}
                markerEnd={marker}
              />
              <text x={lx.toFixed(2)} y={ly.toFixed(2)} className="edge-label">
                {d.label}
              </text>
            </g>
          );
        })}

        {NODES.map((n) => (
          <g key={n.id}>
            <rect x={n.x - BOX.w / 2} y={n.y - BOX.h / 2} width={BOX.w} height={BOX.h} rx={3} className="node" />
            <text x={n.x} y={n.y - 7} className="node-label">
              {n.name}
            </text>
            <text x={n.x} y={n.y + 13} className="nw-sub">
              {n.sub}
            </text>
          </g>
        ))}
      </Plot>
    </Chart>
  );
}

/** The entity ids the diagram draws, in reading order, for the cards beneath it. */
export const LOOP_ENTITY_IDS: readonly string[] = NODES.map((n) => n.id);

/** The edge ids the diagram draws, so the full edge table can mark them. */
export const LOOP_EDGE_IDS: ReadonlySet<string> = new Set(EDGES.map((e) => e.id));

/**
 * Short display names for the entities the diagram boxes.
 *
 * `NetworkEntity.title` is long-form by design - it is what a filing calls the
 * party - and a 41-row edge table set in long-form titles is unreadable. The
 * table falls back to the title for any entity not on the diagram, so no name
 * is ever invented for a party this file does not already name.
 */
export const LOOP_NAMES: ReadonlyMap<string, string> = new Map(NODES.map((n) => [n.id, n.name]));

/**
 * The citation for the diagram as a whole.
 *
 * A drawing of eleven claims is itself a claim, and it inherits the weakest
 * confidence of the eleven rather than the strongest: a picture cannot be more
 * certain than the least certain line in it. `lastVerified` is likewise the
 * oldest of the eleven, not the newest, so the date on the citation is the date
 * beyond which some part of the picture has not been re-checked.
 */
export function NetworkLoopCite() {
  const edgeAt = new Map(getNetwork().edges.map((e) => [e.id, e]));
  const drawn = EDGES.flatMap((d) => {
    const edge = edgeAt.get(d.id);
    return edge === undefined ? [] : [edge];
  });
  const rank: Record<Confidence, number> = { high: 0, med: 1, low: 2 };
  const weakest = drawn.reduce<Confidence>((worst, e) => (rank[e.confidence] > rank[worst] ? e.confidence : worst), "high");
  const oldest = drawn.reduce((a, e) => (e.lastVerified < a ? e.lastVerified : a), "9999-12-31");
  const refs = [...new Set(drawn.flatMap((e) => e.sources))];
  return (
    <span className="claim">
      <a className="anchor" href="/network#network-loop">
        network-loop
      </a>
      <Cite
        id="network-loop"
        href="/network#network-loop"
        lastVerified={oldest}
        confidence={weakest}
        sources={resolveSources(refs)}
      />
    </span>
  );
}
