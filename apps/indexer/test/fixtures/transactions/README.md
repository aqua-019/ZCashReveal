# Transaction fixtures - the RPC shape, in the casing the wire uses

These are `getrawtransaction` verbosity-1 results as a node serialises them.
They exist because the repository had no such fixture until HANDOFF-05, and
that absence hid a defect for three revolutions.

## What the absence hid

`RpcTransaction` in `packages/zec-types` declares `expiryHeight` and
`versionGroupId`. zcashd and Zebra both serialise `expiryheight` and
`versiongroupid`, all lowercase (Zebra 6.3.0, `zebra-rpc/src/methods/types/
transaction.rs`, `expiry_height` renamed to `expiryheight`). No fixture in the
repository set either field in either casing, so every test that touched
`leak-analyzer.ts` exercised the branch where `expiryHeight` is `undefined` -
which is the branch a real node had always taken, for the wrong reason.

`fingerprint.ts` gates three of its five wallet signatures on
`expiryDelta !== null`. The fingerprint was therefore not degraded against real
data: it was INERT, and it reported "nothing found" while unable to see. The
tests passed, and they passed vacuously.

## The rule this directory exists to enforce

A fixture here is written in the casing a node emits, and is parsed through
`rpcTransactionSchema` from `@zcashreveal/zebra-rpc` before any decoder sees it
- never constructed as a TypeScript object literal that satisfies the interface.
An object literal typed against the interface can only ever agree with the
interface; it cannot disagree with the wire, which is the disagreement that
matters.

`ywallet-orchard-only.json` is a synthetic capture: the field names, casing and
value types are Zebra's, the values are chosen to sit inside the y-wallet
signature's expiry window. It is labelled synthetic here rather than implied to
be a mainnet capture. HANDOFF-10 owns the real mainnet capture (LEDGER-00 Q4),
and it must be taken from an actual RPC response rather than hand-written, so
the casing in the fixture is the casing production sees.
