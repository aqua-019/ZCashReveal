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

/**
 * A SHIELD AND A DESHIELD, not only a coinbase.
 *
 * The first version of this script captured a coinbase and nothing else, and
 * three HIGH defects survived it: the transparent pool delta's sign was
 * inverted, `netToPoolZat` summed gross debits instead of what crossed, and the
 * ZIP 317 action count was wrong. None of the three is visible on a coinbase,
 * because a coinbase has no inputs, crosses no boundary and pays no fee. An
 * example corpus that only exercises the trivial case is an example corpus that
 * certifies the trivial case.
 */
const HOT = "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ";
const FUND = "11".repeat(32);
const SHIELD = "22".repeat(32);

const shieldTx = {
  txid: SHIELD,
  version: 5,
  locktime: 0,
  expiryheight: 3_456_040,
  height: 3_456_000,
  blocktime: 1_755_900_000,
  size: 2_698,
  vin: [{ txid: FUND, vout: 1, sequence: 0, scriptSig: { asm: "", hex: "48".repeat(72) } }],
  vout: [
    {
      value: 90_552.69,
      valueZat: 9_055_269_000_000,
      n: 0,
      scriptPubKey: { asm: "", hex: "76a914".padEnd(50, "0"), type: "pubkeyhash", addresses: [HOT] },
    },
  ],
  vShieldedSpend: [],
  vShieldedOutput: [],
  orchard: {
    actions: [
      { cv: "1f".repeat(32), nullifier: "2a".repeat(32), rk: "3b".repeat(32), cmx: "4c".repeat(32), ephemeralKey: "5d".repeat(32), encCiphertext: "6e".repeat(580), spendAuthSig: "7f".repeat(64), outCiphertext: "80".repeat(80) },
      { cv: "81".repeat(32), nullifier: "92".repeat(32), rk: "a3".repeat(32), cmx: "b4".repeat(32), ephemeralKey: "c5".repeat(32), encCiphertext: "d6".repeat(580), spendAuthSig: "e7".repeat(64), outCiphertext: "f8".repeat(80) },
    ],
    valueBalance: -30_000,
    valueBalanceZat: -3_000_000_000_000,
    flags: { enableSpends: true, enableOutputs: true },
    anchor: "09".repeat(32),
    proof: "aa".repeat(64),
    bindingSig: "bb".repeat(64),
  },
};

const fundingTx = {
  txid: FUND,
  version: 5,
  locktime: 0,
  height: 3_400_000,
  blocktime: 1_750_000_000,
  vin: [{ sequence: 0, coinbase: "03c0bb34" }],
  vout: [
    { value: 0, valueZat: 0, n: 0, scriptPubKey: { asm: "", hex: "6a", type: "nulldata" } },
    { value: 120_552.69, valueZat: 12_055_269_000_000, n: 1, scriptPubKey: { asm: "", hex: "76a914".padEnd(50, "0"), type: "pubkeyhash", addresses: [HOT] } },
  ],
  orchard: { actions: [], valueBalanceZat: 0 },
};

const handle = (method: string, params: readonly unknown[]): unknown => {
  const arg = (params as Array<{ addresses?: string[] }>)[0];
  const who = arg?.addresses?.[0];
  const id = String((params as string[])[0] ?? "");
  switch (method) {
    case "getaddressbalance":
      return who === HOT
        ? { balance: 9_055_269_000_000, received: 12_055_269_000_000 }
        : { balance: 7_818_340_930_000, received: 7_818_340_930_000 };
    case "getaddressutxos":
      return who === HOT
        ? [{ address: HOT, txid: SHIELD, outputIndex: 0, script: "76a914", satoshis: 9_055_269_000_000, height: 3_456_000 }]
        : [{ address: LOCKBOX, txid: TXID, outputIndex: 0, script: "aa", satoshis: 7_818_340_930_000, height: 3_456_000 }];
    case "getaddresstxids":
      return who === HOT ? [FUND, SHIELD] : [TXID];
    case "getrawmempool":
      return params[0] === true ? {} : [];
    case "getrawtransaction":
      if (id === SHIELD) return shieldTx;
      if (id === FUND) return fundingTx;
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
  `/v2/address/${HOT}`,
  `/v2/tx/${SHIELD}`,
  "/v2/search?q=t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
  "/v2/search?q=3456227",
  `/v2/address/${LOCKBOX}`,
  `/v2/tx/${TXID}`,
  "/v2/block/3456227",
  "/v2/pools/balances",
  "/v2/pools",
  "/v2/mempool",
  "/v2/flows",
  "/v2/labels",
  "/v2/cases",
  "/v2/snapshot",
  "/v2/address/t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8",
  `/v2/tx/${"ab".repeat(31)}`,
  "/v2/block/-1",
];

for (const url of urls) {
  const res = await built.app.inject({ method: "GET", url });
  const parsed: unknown = res.body === "" ? null : JSON.parse(res.body);
  process.stdout.write(`\n===== GET ${url} -> ${res.statusCode}\n`);
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

await built.close();
