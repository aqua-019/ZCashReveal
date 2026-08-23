/**
 * Transparent address validation, by decoding rather than by pattern.
 *
 * A regular expression over the base58 alphabet says an address LOOKS like one.
 * This decodes the base58check envelope and checks the version bytes and the
 * checksum, which says it IS one - and, more to the point for assertion A3,
 * says which network it belongs to. A mainnet gateway that answers for a
 * testnet address is answering about a chain it does not read.
 *
 * The four version prefixes are the Zcash protocol specification section 5.6.1.1
 * ("Transparent Addresses"), and each is two bytes. NOT ZIP 316, which an
 * earlier version of this comment cited: ZIP 316 is the Unified Address
 * specification and defines no transparent version bytes at all. ZIP 320, cited
 * below for TEX, is the right reference for that one.
 *   mainnet P2PKH  0x1CB8  renders as t1
 *   mainnet P2SH   0x1CBD  renders as t3
 *   testnet P2PKH  0x1D25  renders as tm
 *   testnet P2SH   0x1CBA  renders as t2
 *
 * TEX addresses (ZIP 320) are bech32m with the human-readable part `tex` on
 * mainnet and `textest` on testnet. They are transparent-source-only, which is
 * an exchange-deposit tell, and they are a transparent DESTINATION - so they
 * classify as transparent even though the encoding shares nothing with a
 * t-address. The bech32m checksum is verified here for the same reason the
 * base58 one is.
 */
import { createHash } from "node:crypto";

export type AddressScript = "p2pkh" | "p2sh" | "tex";
export type Network = "mainnet" | "testnet";

export interface DecodedAddress {
  readonly script: AddressScript;
  readonly network: Network;
  /**
   * The address as decoded, which is what every caller must use from here on.
   *
   * NOT the string that came in. Decoding trims surrounding whitespace, and a
   * caller that keeps the raw input then asks the node about `" t3ev... "`,
   * caches under it, and prints it back to the reader as the address it
   * answered for. One canonical value, returned by the thing that validated it.
   */
  readonly address: string;
  /** The 20-byte hash the address commits to, lowercase hex. */
  readonly hash: string;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const VERSIONS: ReadonlyArray<readonly [number, number, AddressScript, Network]> = [
  [0x1c, 0xb8, "p2pkh", "mainnet"],
  [0x1c, 0xbd, "p2sh", "mainnet"],
  [0x1d, 0x25, "p2pkh", "testnet"],
  [0x1c, 0xba, "p2sh", "testnet"],
];

/**
 * Decode a transparent address, or return null.
 *
 * Null means "this is not a transparent address on any network", and the caller
 * turns it into a 400 with the reason. It never means "not on this network" -
 * that distinction is the returned `network`, and it is the caller's to reject,
 * because the message a reader needs for a testnet address on a mainnet gateway
 * is different from the one they need for a typo.
 */
export function decodeAddress(raw: string): DecodedAddress | null {
  const address = raw.trim();
  if (address.length === 0) return null;
  // A length ceiling before the decode, not after.
  //
  // `base58Decode` is a big-integer accumulation and therefore quadratic in the
  // input length: 10,000 characters costs about 17 ms and 100,000 about 1.1 s.
  // Fastify's `maxParamLength` defaults to 100 and rejects a longer path
  // parameter with a 404 before this is ever reached - measured: 100 characters
  // routes, 101 does not - so the route is already protected. This guard is
  // here because that protection is an undocumented framework default that a
  // future configuration change could raise, and because this function is
  // exported and may be called from somewhere with no such ceiling.
  if (address.length > MAX_ADDRESS_LENGTH) return null;
  return decodeBase58Check(address) ?? decodeTex(address);
}

/**
 * The longest string that can be a transparent address.
 *
 * A t-address is 35 characters. A TEX address is bech32m with a `tex` prefix
 * and a 20-byte payload, comfortably under 60. 120 leaves room for a longer
 * human-readable part without leaving room for a denial of service.
 */
const MAX_ADDRESS_LENGTH = 120;

function decodeBase58Check(address: string): DecodedAddress | null {
  const bytes = base58Decode(address);
  // 2 version + 20 hash + 4 checksum.
  if (bytes === null || bytes.length !== 26) return null;

  const payload = bytes.subarray(0, 22);
  const checksum = bytes.subarray(22);
  const expected = sha256(sha256(payload)).subarray(0, 4);
  if (!checksum.equals(expected)) return null;

  const found = VERSIONS.find(([a, b]) => payload[0] === a && payload[1] === b);
  if (found === undefined) return null;
  return { script: found[2], network: found[3], address, hash: payload.subarray(2).toString("hex") };
}

function base58Decode(s: string): Buffer | null {
  // Big-integer base conversion. `bigint` rather than a byte-array carry loop
  // because the project already counts in bigint and because 26 bytes is far
  // too small for the performance difference to matter.
  let acc = 0n;
  for (const ch of s) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    acc = acc * 58n + BigInt(digit);
  }
  let hex = acc.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  const body = Buffer.from(hex, "hex");

  // Every leading "1" is a leading zero byte that the base conversion drops.
  let leading = 0;
  for (const ch of s) {
    if (ch !== "1") break;
    leading += 1;
  }
  return Buffer.concat([Buffer.alloc(leading), body]);
}

function sha256(b: Buffer): Buffer {
  return createHash("sha256").update(b).digest();
}

/* -------------------------------------------------------------------------- */
/* bech32m, for TEX (ZIP 320)                                                 */
/* -------------------------------------------------------------------------- */

const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONST = 0x2bc830a3;

function decodeTex(address: string): DecodedAddress | null {
  const lower = address.toLowerCase();
  // Mixed case is invalid in bech32 and is rejected rather than normalised: a
  // checksum over the lowercased form of a mixed-case string would accept a
  // string no encoder produces.
  if (address !== lower && address !== address.toUpperCase()) return null;

  const split = lower.lastIndexOf("1");
  if (split < 1) return null;
  const hrp = lower.slice(0, split);
  const network: Network | undefined = hrp === "tex" ? "mainnet" : hrp === "textest" ? "testnet" : undefined;
  if (network === undefined) return null;

  const data: number[] = [];
  for (const ch of lower.slice(split + 1)) {
    const v = BECH32_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    data.push(v);
  }
  if (data.length < 6) return null;
  if (bech32Polymod([...hrpExpand(hrp), ...data]) !== BECH32M_CONST) return null;

  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  if (bytes === null || bytes.length !== 20) return null;
  // The lowercased form: bech32m is case-insensitive but not mixed-case, and
  // the canonical rendering is lower.
  return { script: "tex", network, address: lower, hash: Buffer.from(bytes).toString("hex") };
}

function hrpExpand(hrp: string): number[] {
  const high: number[] = [];
  const low: number[] = [];
  for (const ch of hrp) {
    const code = ch.charCodeAt(0);
    high.push(code >> 5);
    low.push(code & 31);
  }
  return [...high, 0, ...low];
}

function bech32Polymod(values: readonly number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= GEN[i] ?? 0;
    }
  }
  return chk >>> 0;
}

function convertBits(data: readonly number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}
