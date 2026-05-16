import type { Hex, Zatoshi } from "./transactions.js";

export type ShieldedPool = "sapling" | "orchard";

export interface DecodedSaplingSpend {
  pool: "sapling";
  index: number;
  nullifier: Hex;
  anchor: Hex;
  cv: Hex;
  rk: Hex;
}

export interface DecodedSaplingOutput {
  pool: "sapling";
  index: number;
  cmu: Hex;
  cv: Hex;
  ephemeralKey: Hex;
  encCiphertextSize: number;
  outCiphertextSize: number;
}

export interface DecodedOrchardAction {
  pool: "orchard";
  index: number;
  nullifier: Hex;
  cmx: Hex;
  cv: Hex;
  rk: Hex;
  ephemeralKey: Hex;
  encCiphertextSize: number;
  outCiphertextSize: number;
}

export type DecodedShieldedSpend = DecodedSaplingSpend;
export type DecodedShieldedOutput = DecodedSaplingOutput;

export interface DecodedShieldedBundle {
  saplingSpends: DecodedSaplingSpend[];
  saplingOutputs: DecodedSaplingOutput[];
  saplingValueBalanceZat: Zatoshi;
  orchardActions: DecodedOrchardAction[];
  orchardValueBalanceZat: Zatoshi;
  orchardAnchor: Hex | null;
  orchardFlags: {
    enableSpends: boolean;
    enableOutputs: boolean;
  } | null;
}
