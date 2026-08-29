import { describe, expect, it } from "vitest";
import { asHex, type Hex } from "@zcashreveal/types";

import { ZebraRpc, type FetchLike } from "../client.js";
import { RpcError, RpcSchemaError, RpcTransportError } from "../errors.js";

/**
 * The client's contract, exercised against a scripted transport.
 *
 * Nothing here talks to a node. What is under test is the part of the client
 * that a node cannot show you anyway: which failures are retried, which are
 * not, what the params array actually contains, and whether a response that
 * does not match Zebra's shape is caught at the boundary or passed on.
 */

interface Scripted {
  readonly status?: number;
  readonly body?: unknown;
  /** Raw body, for the non-JSON case. */
  readonly text?: string;
  readonly throws?: Error;
}

/** A transport that replays a script and records what it was asked for. */
function transport(script: readonly Scripted[]) {
  const calls: { url: string; body: unknown }[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    calls.push({ url, body: JSON.parse(String(init.body)) as unknown });
    if (step?.throws) throw step.throws;
    const text = step?.text ?? JSON.stringify(step?.body ?? {});
    return {
      ok: (step?.status ?? 200) < 400,
      status: step?.status ?? 200,
      json: () => Promise.resolve(JSON.parse(text) as unknown),
      text: () => Promise.resolve(text),
    };
  };
  return { fetch, calls, attempts: () => i };
}

function client(script: readonly Scripted[], options: Partial<ConstructorParameters<typeof ZebraRpc>[0]> = {}) {
  const t = transport(script);
  const rpc = new ZebraRpc({
    url: "http://127.0.0.1:8232",
    fetch: t.fetch,
    // No real sleeping: a retry test that waits 200 ms per attempt is a slow
    // test that proves nothing extra.
    sleep: () => Promise.resolve(),
    ...options,
  });
  return { rpc, ...t };
}

const OK = (result: unknown): Scripted => ({ body: { jsonrpc: "1.0", id: 1, result } });

const BALANCE = { balance: 7_818_340_930_000, received: 7_818_340_930_000 };

describe("params - what actually goes on the wire", () => {
  it("sends getaddressbalance a single OBJECT, not an array of strings", async () => {
    const { rpc, calls } = client([OK(BALANCE)]);
    await rpc.getAddressBalance(["t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo"]);
    expect(calls[0]?.body).toMatchObject({
      method: "getaddressbalance",
      params: [{ addresses: ["t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo"] }],
    });
  });

  it("sends getblock its selector as a STRING even for a height", async () => {
    // Zebra types `hash_or_height` as String (methods.rs:303-307). A bare JSON
    // number fails to deserialise, and the failure looks like a bad request
    // rather than like a type error, which is why this is pinned.
    const { rpc, calls } = client([OK({ hash: "aa".repeat(32), height: 12, time: 1, tx: [] })]);
    await rpc.getBlock({ height: 12 });
    expect(calls[0]?.body).toMatchObject({ method: "getblock", params: ["12", 2] });
  });

  it("sends getrawtransaction verbosity as the NUMBER 1, never the boolean true", async () => {
    // Zebra types `verbose` as u8, not bool. `true` fails to deserialise.
    const { rpc, calls } = client([OK(rawTx())]);
    await rpc.getRawTransaction(hex64("ab"));
    const params = (calls[0]?.body as { params: unknown[] }).params;
    expect(params[1]).toBe(1);
    expect(params[1]).not.toBe(true);
  });

  it("passes a height range to getaddresstxids only when one is given", async () => {
    const { rpc, calls } = client([OK([]), OK([])]);
    await rpc.getAddressTxIds(["t1a"]);
    await rpc.getAddressTxIds(["t1a"], { start: 5, end: 9 });
    expect((calls[0]?.body as { params: unknown[] }).params).toEqual([{ addresses: ["t1a"] }]);
    expect((calls[1]?.body as { params: unknown[] }).params).toEqual([{ addresses: ["t1a"], start: 5, end: 9 }]);
  });

  it("omits the Authorization header when no credentials are configured", async () => {
    // The project's dev Zebra runs enable_cookie_auth=false and the RPC port is
    // loopback-bound. Sending an empty Basic header would be worse than none.
    let seen: Record<string, string> | undefined;
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:8232",
      fetch: (async (_url, init) => {
        seen = init.headers as Record<string, string>;
        return { ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(JSON.stringify({ result: [] })) };
      }) as FetchLike,
    });
    await rpc.getRawMempool();
    expect(seen && "Authorization" in seen).toBe(false);
  });

  it("sends Basic auth when credentials are configured", async () => {
    let seen: Record<string, string> | undefined;
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:8232",
      user: "u",
      password: "p",
      fetch: (async (_url, init) => {
        seen = init.headers as Record<string, string>;
        return { ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(JSON.stringify({ result: [] })) };
      }) as FetchLike,
    });
    await rpc.getRawMempool();
    expect(seen?.["Authorization"]).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
  });
});

describe("results - validation at the boundary", () => {
  it("returns getaddressbalance as bigint zatoshi, including `received`", async () => {
    // Zebra's own doc comment says it does not return `received`. It does.
    const { rpc } = client([OK(BALANCE)]);
    const balance = await rpc.getAddressBalance(["t3ev"]);
    expect(balance.balance).toBe(7_818_340_930_000n);
    expect(balance.received).toBe(7_818_340_930_000n);
  });

  it("brands and lowercases a txid on the way through", async () => {
    const { rpc } = client([OK(["AB".repeat(32)])]);
    const [txid] = await rpc.getRawMempool();
    expect(txid).toBe("ab".repeat(32));
  });

  it("maps the wire's expiryheight and versiongroupid onto the names the decoder reads", async () => {
    // The whole point: `RpcTransaction` declares camelCase, the wire is
    // lowercase, and before this mapping every expiry-delta fingerprint read
    // undefined against a real node.
    const { rpc } = client([OK({ ...rawTx(), expiryheight: 1_234_567, versiongroupid: "892f2085" })]);
    const tx = await rpc.getRawTransaction(hex64("ab"));
    expect(tx.expiryHeight).toBe(1_234_567);
    expect(tx.versionGroupId).toBe("892f2085");
  });

  it("leaves expiryHeight absent when the node did not send one", async () => {
    const { rpc } = client([OK(rawTx())]);
    const tx = await rpc.getRawTransaction(hex64("ab"));
    expect(tx.expiryHeight).toBeUndefined();
  });

  it("keeps fields this project does not read, rather than stripping them", async () => {
    // A stripped `ironwood` bundle would mean a decoder that sees no Ironwood
    // on a chain that has one.
    const { rpc } = client([OK({ ...rawTx(), authdigest: "ff".repeat(32), ironwood: { actions: [], valueBalanceZat: 0 } })]);
    const tx = await rpc.getRawTransaction(hex64("ab"));
    expect((tx as unknown as { authdigest: string }).authdigest).toBe("ff".repeat(32));
    // Read through the DECLARED field since HANDOFF-07. The cast this
    // replaces would have passed even if the client had stripped the bundle
    // and something else had put an `ironwood` key back.
    expect(tx.ironwood).toBeDefined();
    expect(tx.ironwood?.actions).toEqual([]);
  });

  it("forwards `trees`, which is the only block-level Ironwood signal getblock carries", async () => {
    // ADDED IN HANDOFF-08's GATE, BECAUSE THE FIELD SHIPPED WITHOUT ONE. Fold 5
    // removed `finalironwoodroot` - a field L2 confirmed against Zebra's source
    // does not exist - and put `trees` in its place as the thing that DOES carry
    // Ironwood at block level. The replacement went in untested, so the branch
    // that forwards it, the schema that types it and the optionality that
    // matters most were all unexercised.
    const { rpc } = client([
      OK({
        hash: hex64("aa"),
        height: 3_428_200,
        time: 9,
        tx: [],
        trees: { sapling: { size: 12 }, orchard: { size: 34 }, ironwood: { size: 7 } },
      }),
    ]);
    const block = await rpc.getBlock({ height: 3_428_200 });
    expect(block.trees?.ironwood?.size).toBe(7);
    expect(block.trees?.orchard?.size).toBe(34);
    expect(block.trees?.sapling?.size).toBe(12);
    // A SIZE IS NOT A ROOT, and no root is invented from it.
    expect((block as unknown as Record<string, unknown>).finalironwoodroot).toBeUndefined();
  });

  it("accepts a block whose Ironwood tree is empty, because Zebra omits the key entirely", async () => {
    // `ironwood: IronwoodTrees { size: u64 }` is declared
    // `#[serde(default, skip_serializing_if = "IronwoodTrees::is_empty")]`
    // (ZcashFoundation/zebra PR #10888), so a block before the tree has any
    // commitments carries NO `ironwood` key - which is every block this project
    // can currently reach. A schema that required it would reject the whole
    // response, and the failure would look like a bad node.
    const { rpc } = client([
      OK({ hash: hex64("ab"), height: 3_191_017, time: 9, tx: [], trees: { sapling: { size: 12 }, orchard: { size: 34 } } }),
    ]);
    const block = await rpc.getBlock({ height: 3_191_017 });
    expect(block.trees).toBeDefined();
    expect(block.trees?.ironwood).toBeUndefined();
    expect(block.trees?.orchard?.size).toBe(34);
  });

  it("omits `trees` entirely when the node sent none, rather than fabricating an empty one", async () => {
    // The fail side of the two above: `trees` is spread conditionally, so its
    // absence has to survive as an absence. An empty object here would read
    // downstream as "every pool's tree is empty", which is a measurement.
    const { rpc } = client([OK({ hash: hex64("ac"), height: 3, time: 9, tx: [] })]);
    const block = await rpc.getBlock({ height: 3 });
    expect(block.trees).toBeUndefined();
    expect("trees" in block).toBe(false);
  });

  it("rejects a zatoshi amount that has been through a double", async () => {
    const { rpc } = client([OK({ balance: 1.5, received: 2 })]);
    await expect(rpc.getAddressBalance(["t1a"])).rejects.toBeInstanceOf(RpcSchemaError);
  });

  it("rejects a txid that is not 64 hex characters", async () => {
    const { rpc } = client([OK(["ab".repeat(31)])]);
    await expect(rpc.getRawMempool()).rejects.toBeInstanceOf(RpcSchemaError);
  });

  it("refuses a verbosity-1 block where verbosity 2 was asked for", async () => {
    // getBlock always requests 2. A node answering with txid strings is a
    // contradiction, and the decoder must not receive strings where it expects
    // transaction objects.
    const { rpc } = client([OK({ hash: hex64("aa"), height: 3, time: 9, tx: [hex64("bb")] })]);
    await expect(rpc.getBlock({ height: 3 })).rejects.toThrow(/verbosity 2/);
  });

  it("refuses a block with no height rather than defaulting it to zero", async () => {
    // A decoded block at height 0 would be written to the database as genesis.
    const { rpc } = client([OK({ hash: hex64("aa"), time: 9, tx: [] })]);
    await expect(rpc.getBlock({ height: 3 })).rejects.toThrow(/carries both a height and a time/);
  });

  it("surfaces a non-JSON body as a transport failure, not as a parse crash", async () => {
    const { rpc } = client([{ status: 502, text: "<html>bad gateway</html>" }], { retries: 0 });
    await expect(rpc.getRawMempool()).rejects.toBeInstanceOf(RpcTransportError);
  });
});

describe("failure classification and the retry policy", () => {
  it("retries a transport failure and succeeds on a later attempt", async () => {
    const { rpc, attempts } = client([{ throws: new Error("ECONNREFUSED") }, { throws: new Error("ECONNREFUSED") }, OK([])]);
    await expect(rpc.getRawMempool()).resolves.toEqual([]);
    expect(attempts()).toBe(3);
  });

  it("gives up after `retries` transport failures and names the count", async () => {
    const { rpc, attempts } = client([{ throws: new Error("ECONNREFUSED") }], { retries: 2 });
    const err = await rpc.getRawMempool().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcTransportError);
    expect((err as RpcTransportError).attempts).toBe(3);
    expect(attempts()).toBe(3);
  });

  it("does NOT retry a JSON-RPC error - a missing transaction is an answer", async () => {
    // The fail side of the retry policy. -5 means the chain does not have it;
    // asking twice more turns a correct instant 404 into a slow one.
    const { rpc, attempts } = client([
      { status: 500, body: { error: { code: -5, message: "Transaction not found in mempool or best chain" } } },
    ]);
    const err = await rpc.getRawTransaction(hex64("ab")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).code).toBe(-5);
    expect((err as RpcError).isNotFound).toBe(true);
    expect(attempts()).toBe(1);
  });

  it("does NOT retry a schema failure - the shape is the shape", async () => {
    const { rpc, attempts } = client([OK({ balance: "not a number", received: 1 })]);
    await expect(rpc.getAddressBalance(["t1a"])).rejects.toBeInstanceOf(RpcSchemaError);
    expect(attempts()).toBe(1);
  });

  it("classifies -8 as not-found and anything else as a real failure", async () => {
    const { rpc: a } = client([{ status: 500, body: { error: { code: -8, message: "block height not in best chain" } } }]);
    const outOfRange: unknown = await a.getBlock({ height: 9_999_999 }).catch((e: unknown) => e);
    expect((outOfRange as RpcError).isNotFound).toBe(true);

    const { rpc: b } = client([{ status: 500, body: { error: { code: -1, message: "No blocks in state" } } }]);
    const misc: unknown = await b.getBlock({ height: 1 }).catch((e: unknown) => e);
    expect((misc as RpcError).isNotFound).toBe(false);
  });

  it("times out an attempt rather than waiting on a hung node", async () => {
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:8232",
      timeoutMs: 5,
      retries: 0,
      sleep: () => Promise.resolve(),
      fetch: ((_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal | undefined;
          signal?.addEventListener("abort", () => { reject(new Error("aborted")); });
        })) as FetchLike,
    });
    await expect(rpc.getRawMempool()).rejects.toBeInstanceOf(RpcTransportError);
  });

  it("names the method and the failing field in a schema error", async () => {
    const { rpc } = client([OK({ balance: 1.5, received: 2 })]);
    const err: unknown = await rpc.getAddressBalance(["t1a"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcSchemaError);
    expect((err as RpcSchemaError).message).toContain("getaddressbalance");
    expect((err as RpcSchemaError).issues[0]?.path).toBe("balance");
  });
});

/* -------------------------------------------------------------------------- */

/** A 32-byte identifier built from a repeated hex pair, branded as the API wants. */
function hex64(pair: string): Hex {
  return asHex(pair.repeat(32));
}

function rawTx() {
  return {
    txid: "ab".repeat(32),
    version: 5,
    locktime: 0,
    vin: [],
    vout: [],
  };
}
