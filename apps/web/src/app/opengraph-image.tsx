import { ImageResponse } from "next/og";

/**
 * The social card. Rendered at request time by the Edge-compatible ImageResponse
 * renderer, which supports a deliberately narrow slice of CSS - no custom
 * properties, no external stylesheet - so the palette is inlined here as
 * literals. Those literals are the same values as src/styles/tokens.css and are
 * commented with their token names so a drift is visible in review.
 */

export const alt = "ZCashReveal - shielded is not silent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#121110"; // --bg
const INK = "#EDE6D8"; // --ink
const INK_MUTE = "#7C7366"; // --ink-mute
const GOLD = "#F4B728"; // --gold
const LINE = "rgba(237,230,216,0.18)"; // --line-strong

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          color: INK,
          padding: "64px 72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: INK_MUTE,
          }}
        >
          <span style={{ color: GOLD, marginRight: 18 }}>00 SYSTEM</span>
          shielded-pool forensics - public data only
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 128, fontStyle: "italic", lineHeight: 1 }}>
            <span>ZCash</span>
            <span style={{ color: GOLD }}>Reveal</span>
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 30, color: INK_MUTE, maxWidth: 900, lineHeight: 1.4 }}>
            The turnstile, rendered as data. Nullifiers, anchors, commitments and every boundary amount - reported as bounds,
            never as identity.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 22,
            fontSize: 20,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: INK_MUTE,
          }}
        >
          <span>report uncertainty, not identity</span>
          <span style={{ color: GOLD }}>shielded is not silent</span>
        </div>
      </div>
    ),
    size,
  );
}
