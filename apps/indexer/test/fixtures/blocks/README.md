# Block fixtures — real mainnet `getblock` captures

Verbosity-2 `getblock` responses captured from a synced `zebrad`/`zcashd`
node, used as the ground-truth input for `decodeBlock` in
`src/decoder/__tests__/block-decoder.test.ts`.

> **Status (Module 7A):** This README ships now; the fixture JSON arrives in a
> follow-up PR once Docker/`zebrad` is back online. Until a `mainnet-*.json`
> file lands here, the real-fixture test is skipped automatically via
> `describe.skipIf` and the **synthetic** suite is the full validation surface.
> No code change is needed to activate it — drop a conforming file in this
> directory and the guarded test picks it up on the next run.

## Capture procedure

Point the request at a local node's JSON-RPC port and save the raw result:

```bash
curl --user user:pass \
  -d '{"method":"getblock","params":["<height>",2]}' \
  http://localhost:8232 \
  > mainnet-<height>-<hash>.json
```

Verbosity `2` is required — it inlines the full transaction objects that
`decodeBlock` walks. Verbosity `0` (raw hex) and `1` (txids only) will not
deserialize into `RpcBlock`.

If the response is wrapped in a JSON-RPC envelope (`{"result": …, "error":
null, "id": …}`), strip it down to the inner `result` object before saving —
the test deserializes the file directly as an `RpcBlock`.

## Selection criteria (§2)

Pick a block that exercises both pools and stays small enough to commit:

- **Post-NU5** (mainnet height ≥ `1_687_104`) so both `finalsaplingroot` and
  `finalorchardroot` are present.
- **Sapling _and_ Orchard activity** — at least one tx with Sapling
  spends/outputs and at least one tx with Orchard actions, so the block-level
  anchors on both pools are exercised.
- **5–20 transactions** — enough variety to be representative without bloating
  the repo.
- **No coinbase shielding** — keep the coinbase transparent so the fixture
  isolates user-shielded activity from miner behavior.
- **≤ 200 KB** on disk.

## Naming convention

```
mainnet-<height>-<short-hash>.json
```

- `<height>` — the block height (decimal).
- `<short-hash>` — the first 6 hex characters of `block.hash`.

Example: a block at height `1_700_512` with hash `00000000abc123…` →
`mainnet-1700512-0000ab.json`.

The test discovers any file matching `mainnet-*.json` in this directory, so the
exact name only matters for human readability.
