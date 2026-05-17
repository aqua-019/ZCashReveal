/**
 * Branded hex string. Construct only via `asHex()` at RPC deserialization
 * boundaries — never with a bare type assertion. Lowercase or uppercase
 * digits are accepted; no `0x` prefix; non-empty.
 */
export type Hex = string & { readonly __brand: "Hex" };

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Validate and brand a raw string as Hex. Throws TypeError if `s` is empty
 * or contains non-hex characters. This is the only sanctioned way to enter
 * the Hex type from untrusted input.
 */
export function asHex(s: string): Hex {
  if (!HEX_PATTERN.test(s)) {
    const preview = s.length > 32 ? `${s.slice(0, 32)}...(${s.length} chars)` : s;
    throw new TypeError(`asHex: not a hex string: "${preview}"`);
  }
  return s as Hex;
}

/** Type guard for Hex without throwing. */
export function isHex(s: string): s is Hex {
  return HEX_PATTERN.test(s);
}

export type Zatoshi = bigint;

export interface RpcVin {
  txid?: Hex;
  vout?: number;
  scriptSig?: { asm: string; hex: Hex };
  sequence: number;
  coinbase?: Hex;
}

export interface RpcVout {
  value: number;
  valueZat: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: Hex;
    reqSigs?: number;
    type: string;
    addresses?: string[];
  };
}

export interface RpcSaplingSpend {
  cv: Hex;
  anchor: Hex;
  nullifier: Hex;
  rk: Hex;
  proof: Hex;
  spendAuthSig: Hex;
}

export interface RpcSaplingOutput {
  cv: Hex;
  cmu: Hex;
  ephemeralKey: Hex;
  encCiphertext: Hex;
  outCiphertext: Hex;
  proof: Hex;
}

export interface RpcOrchardAction {
  cv: Hex;
  nullifier: Hex;
  rk: Hex;
  cmx: Hex;
  ephemeralKey: Hex;
  encCiphertext: Hex;
  outCiphertext: Hex;
  spendAuthSig: Hex;
}

export interface RpcOrchardBundle {
  actions: RpcOrchardAction[];
  flags: {
    enableSpends: boolean;
    enableOutputs: boolean;
  };
  valueBalanceZat: number;
  anchor: Hex;
  proof: Hex;
  bindingSig: Hex;
}

export interface RpcTransaction {
  txid: Hex;
  hash?: Hex;
  version: number;
  versionGroupId?: Hex;
  locktime: number;
  expiryHeight?: number;
  size: number;
  vsize?: number;
  weight?: number;
  vin: RpcVin[];
  vout: RpcVout[];
  vShieldedSpend?: RpcSaplingSpend[];
  vShieldedOutput?: RpcSaplingOutput[];
  valueBalanceZat?: number;
  bindingSig?: Hex;
  orchard?: RpcOrchardBundle;
  time?: number;
  fee?: number;
  feeZat?: number;
  blockhash?: Hex;
  confirmations?: number;
}

export interface MempoolEntry {
  txid: Hex;
  seenAt: number;
  height?: number;
  raw: RpcTransaction;
}
