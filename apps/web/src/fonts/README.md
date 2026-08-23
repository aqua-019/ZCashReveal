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
| `fraunces-latin-variable.woff2` | Fraunces | `opsz` 9-144, `wght` 100-900, `SOFT` 0-100 | 120,788 |
| `jetbrains-mono-latin-variable.woff2` | JetBrains Mono | `wght` 100-800 | 40,404 |
| `manrope-latin-variable.woff2` | Manrope | `wght` 200-800 | 24,836 |

229,188 bytes in total, which is the same set of bytes the site served before: these are the
exact files the Google loader downloaded and self-hosted from `_next/static/media`, not a
different cut of the same families.

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
