import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Fraunces, JetBrains_Mono, Manrope } from "next/font/google";

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
 * Each declares a real `fallback` stack, so the page is legible with the
 * webfont blocked, and `display: swap`, so it is legible while it loads. The
 * CSS variables are consumed by --f-display / --f-numeral / --f-mono / --f-sans
 * in src/styles/tokens.css - components never name a family directly.
 */

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
  // Only Manrope is preloaded. It carries the body copy and is the LCP element
  // on every Record page; the display, numeral and data faces still load
  // immediately from the same origin, but they no longer compete with it for
  // the first round of bandwidth.
  preload: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  // opsz and SOFT only. WONK is never set by any rule in globals.css, and every
  // axis carried is weight in the variable font that every visitor downloads.
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
  fallback: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
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
