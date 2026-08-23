/**
 * What a query string is, decided by shape alone.
 *
 * This is the first thing the Instrument does with anything a reader types, and
 * it is deliberately the narrowest possible operation: it answers "what kind of
 * identifier is this", never "who owns this". No network call happens here, and
 * for one of the six answers no network call may ever happen at all - a viewing
 * key is recognised so that it can be kept in the browser, and recognising it
 * is what makes the rest of the page able to refuse to transmit it.
 *
 * The rules are HANDOFF-04 section 3's, verbatim:
 *
 *   t1 / t3 + 33 base58 characters      transparent
 *   zs1 / u1 / zc                       shielded  (routes to /reveal, Mode B)
 *   uview / zxview / zivk               viewing key (never leaves the client)
 *   64 hex characters                   txid
 *   an integer                          block height
 *
 * ORDER MATTERS, and the order below is not the order in that list. Viewing
 * keys are tested FIRST. `uview1...` does not match the `u1` prefix and
 * `zxviews1...` does not match `zs1` or `zc`, so the two families do not
 * actually collide today - but the cost of being wrong is asymmetric in a way
 * nothing else here is. Misreading an address as a key is harmless; misreading
 * a key as an address routes a secret through a lookup path. Test for the thing
 * that must never leave the browser before testing for anything else.
 */
import type { SearchKind } from "@zcashreveal/types";

/**
 * Base58 as Bitcoin and Zcash define it: no zero, no capital O, no capital I,
 * no lowercase l. A transparent address is a prefix plus exactly 33 of these.
 */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";

/**
 * `t1` P2PKH and `t3` P2SH, mainnet - section 3's rule, and only it.
 *
 * `t2` is the TESTNET script hash and is deliberately not accepted: a gate
 * round found the class written `t[123]`, one character wider than the rule
 * the header comment calls verbatim, and wider than the comment on this line
 * describing it. A mainnet explorer that silently classifies a testnet address
 * as transparent sends the reader to an address page for a chain it does not
 * read.
 */
const TRANSPARENT = new RegExp(`^t[13]${BASE58}{33}$`);

/**
 * TEX addresses (ZIP 320) are bech32m and transparent-source-only - an
 * exchange-deposit tell. They are a transparent destination, so they classify
 * as transparent even though their encoding is nothing like a t-address.
 */
const TEX = /^tex1[02-9ac-hj-np-z]{38,}$/;

/**
 * Sapling (`zs1`), unified (`u1`) and Sprout (`zc`) receivers.
 *
 * The length floors matter. `zc` is two characters and would otherwise match
 * the word "zcash", and the whole point of the shielded answer is to say "this
 * is not an on-chain object" - saying that about a typo would be a lie of a
 * different kind. A Sprout address is 95 characters, a Sapling one 78, and a
 * unified address is longer still.
 */
const SHIELDED = /^(zs1[02-9ac-hj-np-z]{70,}|u1[02-9ac-hj-np-z]{80,}|zc[1-9A-HJ-NP-Za-km-z]{90,})$/;

/**
 * Viewing keys: unified full (`uview`), Sapling extended (`zxview`), and an
 * incoming viewing key (`zivk`). The prefixes are matched loosely on purpose -
 * a key that is recognised but malformed is refused by the client-side parser
 * on /reveal with an explanation, which is a better outcome than a key that is
 * not recognised at all and gets treated as a search term.
 */
const VIEWING_KEY = /^(uview|zxview|zivk|zxviews|uivk)[0-9a-z]*$/i;

/** 64 lowercase-or-uppercase hex characters, with no `0x` prefix. */
const TXID = /^[0-9a-fA-F]{64}$/;

/**
 * A block height. Capped at nine digits so it can never swallow a txid, and so
 * that a long run of digits reads as junk rather than as a height beyond any
 * chain that will exist. Zcash is at 3.4 million.
 */
const HEIGHT = /^[0-9]{1,9}$/;

/**
 * Classify a query. Total: every input gets exactly one of the six answers, and
 * `unknown` is a real answer rather than a failure - the page says it did not
 * recognise the input instead of guessing.
 */
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

/** The eyebrow the search field prints beside the input, per kind. */
export const KIND_TEXT: Readonly<Record<SearchKind, string>> = {
  transparent: "t-address - exact",
  shielded: "shielded - not on chain - bounded",
  "viewing-key": "viewing key - stays local",
  txid: "txid - public fields + bounds",
  height: "block height",
  unknown: "detects type",
};

/**
 * Where a recognised query resolves to.
 *
 * A viewing key resolves to `/reveal` with NO query string and no fragment: the
 * key is passed in memory by the client component that read it, never through
 * the URL. A URL carrying a viewing key would be written to history, to the
 * referrer header of every subsequent request, and to any analytics the browser
 * or a proxy applies - which is exactly the transmission the ceremony promises
 * does not happen. This function returning `/reveal` and nothing else is part
 * of that promise, and `test/unit/search-kind.test.ts` holds it.
 *
 * Returns null when there is nowhere to go.
 */
export function hrefFor(raw: string): string | null {
  const q = raw.trim();
  switch (searchKind(q)) {
    case "transparent":
      return `/address/${q}`;
    case "shielded":
      // Mode B: the honest statement that the address is not an on-chain
      // object. The address itself is public and safe in a URL - it is a
      // destination anyone can pay, not a secret - so it travels as a query
      // parameter and the page renders the pool context around it.
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
