# Block fixtures

Two kinds of file live here, and the difference between them is the whole
point of this document.

**`mainnet-*.json` — captured.** Verbosity-2 `getblock` responses saved from a
synced `zebrad`/`zcashd`, used as the ground-truth input for `decodeBlock` in
`src/decoder/__tests__/block-decoder.test.ts`. A capture is EVIDENCE: it can
disagree with this project's interfaces, which is what makes it worth having.

**`synthetic-*.json` — written by a session.** Shaped to what this repository
believes the wire looks like and parsed through the same boundary schema a
response goes through, which proves the fixture is internally consistent and
proves nothing about the node. `synthetic-v6-ironwood-3430000.json` is the
first of these: it is a post-NU6.3 block carrying two ZIP 318 crossings and one
intra-Ironwood transfer, and it exists because no captured v6 block exists.

> **Status.** No `mainnet-*.json` has ever landed here, so the real-fixture
> test is still skipped automatically via `describe.skipIf` and the synthetic
> suites are the full validation surface. No code change is needed to activate
> it — drop a conforming file in this directory and the guarded test picks it
> up on the next run.
>
> **What the synthetic Ironwood fixture cannot settle — and what has since
> been settled without it.** Its `ironwood` bundle key and the block's
> `finalironwoodroot` were both INFERRED, and a fixture written from a belief
> cannot test that belief, so A2's evidence was self-referential and was
> reported as such. L2 then read Zebra's source directly (LEDGER-07 Q5) and
> split the two:
>
> - `tx.ironwood` is **CONFIRMED**, from
>   `zebra-rpc/src/methods/types/transaction.rs` on `main`, and confirmed at the
>   shape level too — Zebra models the Ironwood bundle with the same struct as
>   Orchard, which is why `ironwood.ts` mirroring `orchard.ts` was right.
> - `block.finalironwoodroot` is **CONFIRMED ABSENT**. No `ironwoodroot` under
>   any spelling exists in `zebra-rpc/src/methods.rs`. What Ironwood got on
>   `getblock` is a SIZE — `GetBlockTrees.ironwood: IronwoodTrees { size: u64 }`,
>   ZcashFoundation/zebra PR #10888, merged 2 Jul 2026. The block-level root is
>   on `z_gettreestate`, and `z_getsubtreesbyindex` accepts `pool = "ironwood"`.
>
> The fixture was rewritten in HANDOFF-08 to match: the `finalironwoodroot` key
> is gone and a `trees` object carries the real per-pool sizes, with
> `trees.ironwood.size` equal to the number of Ironwood actions the fixture's
> own transactions contain. The capture below is still owed — the field NAMES
> are settled, the end-to-end path is not.

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

Pick a block that exercises the pools and stays small enough to commit:

- **Post-NU6.3** (mainnet height ≥ `3_428_143`) so all four pools exist and a
  v6 transaction is possible. This floor was **post-NU5 (≥ `1_687_104`)**
  until HANDOFF-07, which was correct while the decoder read two pools: a
  capture satisfying the old floor can contain no Ironwood at all, and the
  guarded suite would then report as coverage of a four-pool decoder while
  exercising three.
- **Sapling, Orchard _and_ Ironwood activity** — at least one transaction of
  each, so both block-level anchors are exercised and the capture shows what a
  real node puts in `trees` for a block that moved Ironwood. (The question this
  bullet used to ask — whether `finalironwoodroot` is the right name — is
  answered: there is no such field. See the status note above.)
- **At least one v6 transaction**, and ideally one ZIP 318 Orchard→Ironwood
  crossing, since that is the transaction shape this project exists to measure.
- **A Sprout transaction if one can be found** — one carrying at least one
  JoinSplit. This is HANDOFF-10's standing request and it is about a different
  gap: `vjoinsplit`'s spelling is settled, but no transaction with a JoinSplit
  has ever been through this decoder, and Zebra only serialises the field from
  PR #9805.
- **5–20 transactions** — enough variety to be representative without bloating
  the repo.
- **No coinbase shielding** — keep the coinbase transparent so the fixture
  isolates user-shielded activity from miner behavior.
- **≤ 200 KB** on disk.

## What to record beside a capture

The node's `subversion` string, taken from `getinfo` or `getnetworkinfo` at the
time of capture, and written into `RUNBOOK-VPS.md` with the height and hash. A
fixture proves what a node sent; the version is what says WHICH node, and it is
the difference between "this build reads Ironwood correctly" and "this build
reads what a 6.2.x reads".

## Naming convention

```
mainnet-<height>-<short-hash>.json
```

- `<height>` — the block height (decimal).
- `<short-hash>` — the first 6 hex characters of `block.hash`.

Example: a block at height `1_700_512` with hash `00000000abc123…` →
`mainnet-1700512-0000ab.json`.

The test discovers **every** file matching `mainnet-*.json` in this directory
and asserts over all of them, so the exact name only matters for human
readability. It took the lexicographically first match until HANDOFF-07, which
sorts heights as strings: a pre-NU6.3 `mainnet-1700512-*.json` sorts before a
post-NU6.3 `mainnet-3428200-*.json`, so committing an Ironwood capture beside
any other one would have silently dropped the Ironwood one while the suite
stayed green.

Synthetic fixtures are named `synthetic-<what>-<height>.json` and are
deliberately outside that glob: they are read by name from the suite that owns
them, so a synthetic file can never be mistaken for a capture.
