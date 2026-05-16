export type Hex = string;
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
