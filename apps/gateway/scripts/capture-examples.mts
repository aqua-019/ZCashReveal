/**
 * Capture real example responses for docs/2.0/API.md.
 *
 * The examples in that document are OUTPUT, not prose: this boots the real
 * server against a scripted node and prints what the routes actually return.
 * A hand-written example drifts from the code the day after it is written, and
 * three revolutions of this project have paid for the difference between a
 * transcript and a description.
 *
 * Run: pnpm --filter @zcashreveal/gateway exec tsx scripts/capture-examples.mts
 */
import pino from "pino";
import { ZebraRpc, type FetchLike } from "@zcashreveal/zebra-rpc";

import { NullCache } from "../src/cache.js";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

const LOCKBOX = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";
const TXID = "ab".repeat(32);

const handle = (method: string, params: readonly unknown[]): unknown => {
  switch (method) {
    case "getaddressbalance":
      return { balance: 7_818_340_930_000, received: 7_818_340_930_000 };
    case "getaddressutxos":
      return [{ address: LOCKBOX, txid: TXID, outputIndex: 0, script: "aa", satoshis: 7_818_340_930_000, height: 3_456_000 }];
    case "getaddresstxids":
      return [TXID];
    case "getrawtransaction":
      return {
        txid: String((params as string[])[0] ?? TXID),
        version: 5,
        locktime: 0,
        expiryheight: 3_456_040,
        height: 3_456_000,
        blocktime: 1_755_900_000,
        size: 512,
        vin: [{ sequence: 0, coinbase: "03c0bb34" }],
        vout: [
          {
            value: 78_183.4093,
            valueZat: 7_818_340_930_000,
            n: 0,
            scriptPubKey: { asm: "", hex: "a914", type: "scripthash", addresses: [LOCKBOX] },
          },
        ],
        orchard: { actions: [], valueBalanceZat: 0 },
      };
    case "getblockchaininfo":
      return {
        chain: "main",
        blocks: 3_456_227,
        bestblockhash: "cd".repeat(32),
        valuePools: [
          { id: "transparent", chainValue: 12_500_223, chainValueZat: 1_250_022_300_000_000, monitored: true },
          { id: "sprout", chainValue: 22_621, chainValueZat: 2_262_100_000_000, monitored: true },
          { id: "sapling", chainValue: 529_015, chainValueZat: 52_901_500_000_000, monitored: true },
          { id: "orchard", chainValue: 708_841, chainValueZat: 70_884_100_000_000, monitored: true },
          { id: "lockbox", chainValue: 78_183, chainValueZat: 7_818_340_930_000, monitored: true },
          { id: "ironwood", chainValue: 3_129_287, chainValueZat: 312_928_700_000_000, monitored: true },
        ],
      };
    case "getblock":
      return {
        hash: "cd".repeat(32),
        height: Number((params as string[])[0]),
        time: 1_755_900_000,
        size: 1_617,
        tx: [
          {
            txid: TXID,
            version: 5,
            locktime: 0,
            vin: [{ sequence: 0, coinbase: "03c0bb34" }],
            vout: [
              { value: 1.5625, valueZat: 156_250_000, n: 0, scriptPubKey: { asm: "", hex: "76a9", type: "pubkeyhash", addresses: [LOCKBOX] } },
            ],
            orchard: { actions: [], valueBalanceZat: 0 },
          },
        ],
      };
    default:
      throw new Error(`the scripted node was asked for ${method}`);
  }
};

const fetchLike: FetchLike = (_url, init) => {
  const body = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
  let payload: unknown;
  try {
    payload = { jsonrpc: "1.0", id: 1, result: handle(body.method, body.params) };
  } catch (err) {
    payload = { jsonrpc: "1.0", id: 1, error: { code: -1, message: String(err) } };
  }
  const text = JSON.stringify(payload);
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(text) as unknown), text: () => Promise.resolve(text) });
};

const cfg = loadConfig({ GATEWAY_LOG_LEVEL: "silent" } as NodeJS.ProcessEnv);
const built = await buildServer({
  cfg,
  log: pino({ level: "silent" }),
  rpc: new ZebraRpc({ url: cfg.ZEBRAD_RPC_URL, fetch: fetchLike, retries: 0 }),
  cache: new NullCache(),
});

const urls = [
  "/healthz",
  "/api/search?q=t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
  "/api/search?q=3456227",
  `/api/address/${LOCKBOX}`,
  `/api/tx/${TXID}`,
  "/api/block/3456227",
  "/api/pools/balances",
  "/api/pools",
  "/api/mempool",
  "/api/flows",
  "/api/labels",
  "/api/cases",
  "/api/snapshot",
  "/api/address/t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8",
  `/api/tx/${"ab".repeat(31)}`,
  "/api/block/-1",
];

for (const url of urls) {
  const res = await built.app.inject({ method: "GET", url });
  const parsed: unknown = res.body === "" ? null : JSON.parse(res.body);
  process.stdout.write(`\n===== GET ${url} -> ${res.statusCode}\n`);
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

await built.close();
