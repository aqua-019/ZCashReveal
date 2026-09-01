import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

import { Shell } from "@/components/shell/Shell";
import { tipFromSnapshot } from "@/lib/chain";
import { resolveSnapshot } from "@/lib/snapshot/store";

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
  // Instanced at wght 300, which is the only weight any numeral rule asks for
  // (test/unit/fonts.test.ts holds that assumption). The file carries no wght
  // axis, so this declares the single weight it has.
  weight: "300",
  style: "normal",
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin-variable.woff2",
  // 400 to 700, which is the range the file now carries. The stylesheet asks
  // for 400 and 500 only; 700 is kept so an inherited `<b>` inside the data
  // register is drawn rather than synthesised. Declaring a wider range than the
  // file has would tell the browser it can interpolate weights that are not
  // there.
  weight: "400 700",
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
  // Declared explicitly as well as by file convention. Without an icon the
  // browser probes /favicon.ico, gets a 404, and Lighthouse scores
  // errors-in-console at zero - which is a real console error on every page
  // load, not merely a scoring artefact.
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  colorScheme: "dark",
};

/**
 * THE ONE PLACE `FIXTURE_TIP` WAS REPLACED, which is what `lib/chain.ts`
 * predicted: "every consumer already takes a `ChainTip`, so nothing else
 * changes when it does."
 *
 * The layout is now async and resolves the snapshot once per render. Once, for
 * the whole document, at module scope inside the store - `docs/2.0/SNAPSHOT.md`
 * section 5's rule about the read side, which is the half the publisher's
 * budget does not bound. Every route renders inside this layout, so every route
 * gets the same document, the same tip and the same staleness reading from one
 * resolution rather than one per page.
 *
 * IT CANNOT THROW AND IT CANNOT RETURN NOTHING. `resolveSnapshot` falls through
 * to the bundled document as its last rung, so a layout that could not reach
 * the managed store, the gateway or anything else still renders - and says so,
 * because every configured rung that failed travels with the result and is
 * named in the system bar.
 */
export default async function RootLayout({ children }: { readonly children: React.ReactNode }) {
  const fontVars = [instrumentSerif.variable, fraunces.variable, jetbrainsMono.variable, manrope.variable].join(" ");
  const snapshot = await resolveSnapshot();

  return (
    <html lang="en" className={fontVars}>
      <body>
        <Shell tip={tipFromSnapshot(snapshot.doc)} status={{ source: snapshot.source, faults: snapshot.faults }}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
