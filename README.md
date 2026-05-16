# ZCashReveal

> **Shielded ≠ Silent.** A live forensic mempool that visualizes the public
> metadata Zcash zk-SNARKs do *not* hide — and traces value across the
> shielded fog using the Kappos round-trip heuristic.

## The thesis

Zcash markets its shielded pools (Sapling, Orchard) as private by
zero-knowledge proof. The proof hides note values, sender addresses, and
recipient addresses for shielded inputs and outputs. It does **not** hide
everything. The protocol publishes four classes of public per-transaction
data:

| Field | Public information |
|---|---|
| **nullifiers** | One per spent note. Globally unique. Reveals spent-set growth and timing. |
| **valueBalance** | Signed net amount crossing each pool's t↔z boundary. Reveals every deposit and withdrawal amount in full. |
| **anchors** | Merkle root of the note commitment tree at spend time. Reveals a window during which the spent note could have entered. |
| **commitments** | One per output note. Reveals tree growth, output counts, dust patterns. |

And the protocol cannot hide the **transparent side** of any t→z deposit
or z→t withdrawal. Every shielding publishes the sender's transparent
address. Every unshielding publishes the recipient's transparent address.
The shielded middle is a *temporary* fog.

The Kappos et al. (USENIX Security 2018) "Empirical Analysis of Anonymity
in Zcash" showed that round-trip pairs — where a deposit amount matches
a later withdrawal amount within fee tolerance — collapse this fog with
high probability. ZCashReveal builds this analysis pipeline open-source.

## What it does today (v0.1)

Real-time mempool ingestion, per-tx decoding of every Sapling + Orchard
shielded action, and visualization of the four leak classes plus
round-trip linking. Live stream, per-tx forensic panel, sender/recipient
identity with transparent addresses + nullifier/commitment cryptographic
pseudonyms, round-trip Tracking panel, anchor depth histogram,
value-flow chart, live nullifier feed, wallet fingerprint heuristics.

## Architecture

```
zebrad → indexer (leak-analyzer + link-engine) → postgres + redis
                                              → gateway (Fastify + WS)
                                              → dashboard (React 19 + Vite)
```

Mock mode (`VITE_MOCK_MODE=true`) ships synthetic mempool data so the
dashboard renders fully on Vercel without a backend connected.

## Roadmap

**v0.2 — Mathematics.** Note Commitment Tree model, nullifier hypothesis
engine, anchor-bounded candidate sets, Shannon entropy + effective
anonymity set per spend, turnstile boundary-flow analysis, subset-sum /
LP-relaxation, probabilistic flow graph, S2O migration bridging. See
RESEARCH.md.

**v0.3 — GigaUI / GigaUX.** 3D commitment-tree flythrough, animated
round-trip pulse, full graph explorer, mobile-native gestures.

## License

[AGPL-3.0](./LICENSE). Patterns inspired by mempool.space (AGPL-3.0).
No code copied verbatim. Decoder and link engine are original work
derived from the Zcash protocol spec.

Pre-alpha. Built for cypherpunks, not for compliance.
