import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

import { Shell } from "@/components/shell/Shell";
import { FIXTURE_TIP } from "@/lib/chain";

/**
 * Four families, four roles (CLAUDE.md, Design system):
 *   Instrument Serif - display, italic for the wordmark
 *   Fraunces         - numerals; the variable `opsz`/`SOFT` axes carry the
 *                      engraved register
 *   JetBrains Mono   - all chain data, tabular lining numerals
 *   Manrope          - prose
 *
 * All four are `next/font/local`, loaded from files committed under
 * `src/fonts`, never the Google loader. Fetching them at build time made a
 * green build depend on egress to fonts.googleapis.com and fonts.gstatic.com,
 * and a failed fetch is a hard build error rather than a fall back to the
 * declared stacks - it flaked once for HANDOFF-01 and again for L2 verifying
 * HANDOFF-02 (LEDGER-02 fold 2). The bytes are the same ones the Google
 * loader used to download; see src/fonts/README.md for the exact requests.
 *
 * Each declares a real `fallback` stack, so the page is legible with the
 * webfont blocked, and `display: swap`, so it is legible while it loads. The
 * CSS variables are consumed by --f-display / --f-numeral / --f-mono / --f-sans
 * in src/styles/tokens.css - components never name a family directly.
 */

const instrumentSerif = localFont({
  src: [
    { path: "../fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
  // Only Manrope is preloaded. It carries the body copy and is the LCP element
  // on every Record page; the display, numeral and data faces still load
  // immediately from the same origin, but they no longer compete with it for
  // the first round of bandwidth.
  preload: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
  // A serif measured against a serif: the size-adjusted fallback face Next
  // synthesises for the swap period is derived from these metrics, and matching
  // the register keeps the reflow at swap small.
  adjustFontFallback: "Times New Roman",
});

/**
 * One variable file, three axes. `wght` is the CSS weight; `opsz` and `SOFT`
 * are driven by `font-variation-settings` in globals.css, which is why the
 * subset has to keep them. `weight: "100 900"` is the range the file declares,
 * not a request for 900: without the range Next writes a single `font-weight`
 * and the browser synthesises every other weight.
 */
const fraunces = localFont({
  src: "../fonts/fraunces-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin-variable.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
  fallback: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: "Arial",
});

const manrope = localFont({
  src: "../fonts/manrope-latin-variable.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-manrope",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://zecreveal.vercel.app"),
  title: {
    default: "ZCashReveal - shielded is not silent",
    template: "%s - ZCashReveal",
  },
  description:
    "A public instrument for the Zcash turnstile and a public record of the two windows in which its circuits were unsound. Public chain data only; uncertainty reported, never identity.",
  applicationName: "ZCashReveal",
  keywords: ["Zcash", "shielded pool", "turnstile", "Orchard", "Ironwood", "forensics", "anonymity set"],
  openGraph: {
    type: "website",
    siteName: "ZCashReveal",
    title: "ZCashReveal - shielded is not silent",
    description:
      "The turnstile, rendered as data. Nullifiers, anchors, commitments, boundary amounts and migration denominations - bounds, never identities.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZCashReveal - shielded is not silent",
    description: "A public instrument for the Zcash turnstile, and the public record behind it.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  const fontVars = [instrumentSerif.variable, fraunces.variable, jetbrainsMono.variable, manrope.variable].join(" ");

  return (
    <html lang="en" className={fontVars}>
      <body>
        <Shell tip={FIXTURE_TIP}>{children}</Shell>
      </body>
    </html>
  );
}
