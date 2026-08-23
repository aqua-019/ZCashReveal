/**
 * What a query string is, decided by shape alone.
 *
 * A SECOND IMPLEMENTATION, AND DELIBERATELY SO. `apps/web/src/lib/api/kind.ts`
 * holds the browser's copy and the gateway cannot import it - `apps/web` is a
 * Next.js application, not a package, and a gateway that depended on it would
 * invert the direction of the whole architecture. Sharing it would mean moving
 * it into `packages/zec-types`, which is where it should eventually live, and
 * that is recorded in the section 8 ledger rather than done here: HANDOFF-04
 * shipped the browser copy three days ago and moving it now would edit another
 * track's surface for a refactor neither handoff asked for.
 *
 * The rules are HANDOFF-04 section 3's, verbatim, and the unit test holds this
 * copy to the same cases the browser copy is held to - so the two can be
 * checked against each other by reading two files, which is the honest cost of
 * the duplication until it is removed.
 *
 * ORDER MATTERS. Viewing keys are tested FIRST. The prefixes do not actually
 * collide today, but the cost of being wrong is asymmetric in a way nothing
 * else here is: misreading an address as a key is harmless, and misreading a
 * key as an address routes a secret through a lookup path.
 */
import type { SearchKind } from "@zcashreveal/types";

/** Base58 as Bitcoin and Zcash define it: no zero, no capital O, no capital I, no lowercase l. */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";

/**
 * `t1` P2PKH and `t3` P2SH, mainnet - section 3's rule, and only it.
 *
 * `t2` is the TESTNET script hash and is deliberately not accepted here, for
 * the same reason the browser copy refuses it: a mainnet explorer that
 * classifies a testnet address as transparent sends the reader to an address
 * page for a chain it does not read. `decodeAddress` is what a route uses to
 * REJECT one with a reason; this only classifies.
 */
const TRANSPARENT = new RegExp(`^t[13]${BASE58}{33}$`);

/** TEX addresses (ZIP 320) are bech32m, transparent-source-only, and a transparent destination. */
const TEX = /^tex1[02-9ac-hj-np-z]{38,}$/;

/** Sapling (`zs1`), unified (`u1`) and Sprout (`zc`) receivers, with the length floors that stop `zc` matching "zcash". */
const SHIELDED = /^(zs1[02-9ac-hj-np-z]{70,}|u1[02-9ac-hj-np-z]{80,}|zc[1-9A-HJ-NP-Za-km-z]{90,})$/;

/** Viewing keys, matched loosely on purpose: recognised-but-malformed is a better outcome than unrecognised. */
const VIEWING_KEY = /^(uview|zxview|zivk|zxviews|uivk)[0-9a-z]*$/i;

/** 64 hex characters, either case, with no `0x` prefix. */
const TXID = /^[0-9a-fA-F]{64}$/;

/** A block height, capped at nine digits so it can never swallow a txid. */
const HEIGHT = /^[0-9]{1,9}$/;

/** Total: every input gets exactly one of the six answers, and `unknown` is a real answer. */
export function searchKind(raw: string): SearchKind {
  const q = raw.trim();
  if (q === "") return "unknown";
  if (VIEWING_KEY.test(q)) return "viewing-key";
  if (SHIELDED.test(q)) return "shielded";
  if (TRANSPARENT.test(q) || TEX.test(q)) return "transparent";
  if (HEIGHT.test(q)) return "height";
  if (TXID.test(q)) return "txid";
  return "unknown";
}

/**
 * Where a recognised query resolves to.
 *
 * A viewing key resolves to `/reveal` with NO query string and no fragment, and
 * that is the same promise the browser copy makes: a URL carrying a viewing key
 * would be written to history, to the referrer header of every subsequent
 * request and to any analytics a proxy applies. Returning a bare `/reveal` is
 * part of that promise even here, where the key has unfortunately already
 * travelled.
 *
 * Returns null when there is nowhere to go.
 */
export function hrefFor(raw: string): string | null {
  const q = raw.trim();
  switch (searchKind(q)) {
    case "transparent":
      return `/address/${q}`;
    case "shielded":
      return `/reveal?addr=${encodeURIComponent(q)}`;
    case "viewing-key":
      return "/reveal";
    case "txid":
      return `/tx/${q.toLowerCase()}`;
    case "height":
      return `/block/${q}`;
    case "unknown":
      return null;
  }
}
