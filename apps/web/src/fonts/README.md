# Vendored webfonts

The four families of the ZEC Forensic type system, committed to the repository so that
`next build` is hermetic. Before HANDOFF-03 they were fetched from Google at build time by
`next/font`'s Google loader, which made a green build depend on egress to `fonts.googleapis.com` and
`fonts.gstatic.com`. A failed fetch is a hard build error, not a fall back to the declared
stacks: it flaked once for the HANDOFF-01 session and again for L2 verifying HANDOFF-02, and
it is the reason HANDOFF-10's Playwright job could not be put in CI (LEDGER-01 Q3, LEDGER-02
fold 2). Nothing here is fetched at build time or at runtime.

## What each file is

| File | Family | Axes / weights | Bytes |
| --- | --- | --- | --- |
| `instrument-serif-latin-400-normal.woff2` | Instrument Serif | static, 400 | 21,032 |
| `instrument-serif-latin-400-italic.woff2` | Instrument Serif | static, 400 italic | 22,128 |
| `fraunces-latin-variable.woff2` | Fraunces | `SOFT` 0-100 (`opsz` pinned at 144, `wght` at 300) | 31,816 |
| `jetbrains-mono-latin-variable.woff2` | JetBrains Mono | `wght` 400-700 | 30,528 |
| `manrope-latin-variable.woff2` | Manrope | `wght` 200-800 | 24,836 |

131,140 bytes in total, down from 229,188. Four of the five files are exactly what the Google loader downloaded
and self-hosted from `_next/static/media`. The fifth, Fraunces, is that file with its `opsz`
axis instanced at 144:

```
python3 -c "
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = TTFont('fraunces-latin-variable.woff2')
instancer.instantiateVariableFont(f, {'opsz': 144}, inplace=True, updateFontNames=False)
f.flavor = 'woff2'
f.save('fraunces-latin-variable.woff2')"

# and, on the mono, narrowing the weight range from 100-800 to the 400-700 the
# stylesheet actually asks for (500 for labels, 700 for an inherited bold):
python3 -c "
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = TTFont('jetbrains-mono-latin-variable.woff2')
instancer.instantiateVariableFont(f, {'wght': (400, 700)}, inplace=True, updateFontNames=False)
f.flavor = 'woff2'
f.save('jetbrains-mono-latin-variable.woff2')"
```

That halves it, 120,788 bytes to 65,460, and changes nothing renderable: every rule in
`globals.css` that uses this family already sets `font-variation-settings: "opsz" 144`, so no
other optical size was ever displayed. `wght` and `SOFT` stay fully variable, so no weight is
synthesised and the engraved register still works. Glyph coverage is byte-identical - 222
characters before and after.

The reason is A5. Fraunces sat behind the stylesheet on the critical request chain and was 59
per cent of the font payload; on Lighthouse's mobile profile that held `/beware` at performance
89 against a floor of 95.

`globals.css` sets `font-variation-settings: "opsz" 144, "SOFT" 30` on the numeral register, so
the Fraunces file has to keep all three axes through subsetting. It does - `fvar` carries
`opsz`, `wght` and `SOFT` - and `apps/web/test/unit/fonts.test.ts` asserts it, so a later
refresh cannot quietly ship a weight-only instance and take the engraved register with it.

Latin subset only, matching the `subsets: ["latin"]` the previous configuration requested. A
family that later needs `latin-ext` needs a second file, not a wider request here.

## Where they came from, and how to refresh one

Each file is the `latin` `@font-face` of the Google Fonts CSS2 response for that family,
requested with a browser user-agent so the API answers in woff2. Fetched 23 Aug 2026.

```
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Fraunces:SOFT,opsz,wght@0..100,9..144,100..900&display=swap'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap'
curl -A "$UA" 'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap'
```

Take the `url(...)` from the block commented `/* latin */` in each response and download it.
The Fraunces query string is the one the Google loader itself built from
`axes: ["SOFT", "opsz"]`, which is why the vendored file is byte-for-byte what the site
already shipped.

Refreshing a family is a deliberate act, not a chore: it changes the rendered page. Re-run
`apps/web/test/unit/fonts.test.ts` and the Lighthouse floor on `/beware` (A5) afterwards.

## Licences

All four are under the SIL Open Font License 1.1. The full text of each is committed
alongside the fonts as `OFL-<family>.txt`, which is what the OFL's clause 2 requires of a
redistribution.

- Instrument Serif - Copyright 2022 The Instrument Serif Project Authors
- Fraunces - Copyright 2018 The Fraunces Project Authors
- JetBrains Mono - Copyright 2020 The JetBrains Mono Project Authors
- Manrope - Copyright 2018 The Manrope Project Authors

## The budget

Four families, Manrope preloaded alone, is a standing constraint (LEDGER-01 Q4): 213 KiB of
webfont held LCP at 3.0 s on the mobile preset until Manrope alone was preloaded, which moved
it to 1.9 s. A fifth family, or a second preload, needs an explicit L2 decision.
