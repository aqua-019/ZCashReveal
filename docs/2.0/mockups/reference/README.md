# Reference screenshots — mockup v2.1

Rendered from `../zecreveal-2.0-mockups-v2.html` at 1500 px wide with the real typefaces embedded (Instrument Serif, Fraunces, JetBrains Mono, Manrope from fontsource), full page, light-grain ambience on, reduced motion off. The HTML remains the source of truth for every value and class; these PNGs pin the intended look for `design-reviewer` comparisons and for anyone reading the repo without a browser.

| File | Screen | Route in 2.0 |
|---|---|---|
| `v2-00-splash.png` | 00 · Splash — system statement, the two windows, entry cards | `/` |
| `v2-01-beware.png` | 01 · Beware — exploit ledger B1–B14, severity, detectability | `/beware` (+ `/contradictions`) |
| `v2-02-timeline.png` | 02 · Timeline — governance, funding, leadership, exploits, network | `/timeline` |
| `v2-03-network.png` | 03 · Network — promotion loop, Cypherpunk ledger, phrase catalogue | `/network` |
| `v2-04-tracking-search.png` | 04 · Tracking — search bar + high-fidelity mempool | `/track` |
| `v2-04-tracking-address.png` | 04 · Tracking — address page (ZIP 271 lockbox fixture), reasoning panel, balance step chart, interaction graph | `/address/:addr` |
| `v2-04-tracking-tx.png` | 04 · Tracking — transaction page (`7ae85864…`), inference chain, the round trip | `/tx/:txid` |
| `v2-04-tracking-pools.png` | 04 · Tracking — pools sankey + pool history | `/pools` |
| `v2-04-tracking-flows.png` | 04 · Tracking — exchange inflows summary (links to 06) | `/track#flows` |
| `v2-04-tracking-reveal.png` | 04 · Tracking — viewing-key ceremony (Mode A, 2.1) | `/reveal` |
| `v2-05-method.png` | 05 · Method — estimators, posterior, claim levels, golden cases | `/method` |
| `v2-06-flows.png` | 06 · Flows — the full exchange-inflows case file with provenance | `/flows` |

Colour is 256-colour quantized PNG (Floyd–Steinberg); judge hue from the tokens in the HTML, not from these files.

## Known defects in the mockup, and what supersedes them

The mockup HTML is the historical artefact. Where it and the shipped token layer
disagree, these are the rulings.

**The tip hash literal is 65 hex characters.** `zecreveal-2.0-mockups-v2.html`
line 1494 prints

```
00000000005f3a9e7c1b2d4f8a6e3c0d9b7f5a2e4c8d1b6f3a9e7c1b2d4f8c21e
```

which has ten leading zeros where it should have nine. A Zcash block hash is 32
bytes, so 64 hex characters; 65 cannot be one. The canonical fixture is the
64-character value in `apps/web/src/lib/chain.ts`:

```
0000000005f3a9e7c1b2d4f8a6e3c0d9b7f5a2e4c8d1b6f3a9e7c1b2d4f8c21e
```

pinned by a unit test in `apps/web/test/`. **No handoff may harvest the literal
out of the mockup HTML.** HANDOFF-04's contract carries the same rule for the
tracking UI (LEDGER-01 Q2, fold 5).

**Two muted ink tokens are superseded.** The mockup `:root` sets `--ink-mute`
`#7c7366` (4.04:1 against `--bg`) and `--ink-faint` `#4f4840` (2.10:1). Both were
being used for real text at 9.5 to 12 px, which is normal text under WCAG, so
neither cleared AA. The canonical values are `--ink-mute` `#8f8576` and
`--ink-faint` `#6a6157`, and `--ink-faint` is retired from text entirely: it is a
non-text token for hairlines and rules. Where a mockup value and WCAG AA for
normal text disagree, AA wins (LEDGER-01 Q1, folds 3 and 4).
