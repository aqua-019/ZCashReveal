/**
 * ASSERTION A4 - `searchKind` decides what a query is, by shape alone.
 *
 * The assertion asks for ten cases including `zs1...` to shielded, `uview1...`
 * to key, and a 63-hex string that is not a txid. There are rather more than
 * ten here, and the extra ones are not padding: the classifier's job is to
 * recognise a viewing key BEFORE it recognises anything else, and the cost of
 * getting that wrong is asymmetric in a way the rest of the function's answers
 * are not. Misreading an address as a key is harmless. Misreading a key as an
 * address routes a secret into a lookup path.
 *
 * The last describe block is the one that matters most: it checks that nothing
 * beginning with a key prefix ever classifies as anything else, including the
 * cases where the prefixes could plausibly collide - `u1` against `uview1`,
 * `zc` against `zxviews1`, `zs1` against `zivks1`.
 */
import { describe, expect, it } from "vitest";

import { hrefFor, KIND_TEXT, searchKind } from "@/lib/api/kind";

const TXID = "7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c";
const T3 = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";
const T1 = "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ";
const U1 = "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kdvtd8dmk6vc3dnr7tqkmrpt7gqr7a5u";
const ZS1 = `zs1${"q".repeat(75)}`;
const ZC = `zc${"A".repeat(93)}`;

describe("A4: the ten cases the assertion names", () => {
  it("1. a t1 address plus 33 base58 characters is transparent", () => {
    expect(T1).toHaveLength(35);
    expect(searchKind(T1)).toBe("transparent");
  });

  it("2. a t3 address is transparent too", () => {
    expect(searchKind(T3)).toBe("transparent");
  });

  it("2b. a t2 address is NOT transparent - t2 is testnet", () => {
    // Section 3's rule is t1 and t3. A gate round found the classifier written
    // `t[123]`, one character wider than the rule it calls verbatim and wider
    // than its own comment, so a testnet script hash classified as a mainnet
    // transparent address and `hrefFor` sent the reader to an address page for
    // a chain this site does not read.
    expect(searchKind(`t2${T1.slice(2)}`)).toBe("unknown");
  });

  it("3. zs1... is shielded", () => {
    expect(searchKind(ZS1)).toBe("shielded");
  });

  it("4. u1... is shielded", () => {
    expect(searchKind(U1)).toBe("shielded");
  });

  it("5. zc... is shielded", () => {
    expect(searchKind(ZC)).toBe("shielded");
  });

  it("6. uview1... is a viewing key", () => {
    expect(searchKind(`uview1${"q".repeat(60)}`)).toBe("viewing-key");
  });

  it("7. zxviews1... is a viewing key", () => {
    expect(searchKind(`zxviews1${"q".repeat(60)}`)).toBe("viewing-key");
  });

  it("8. zivks1... is a viewing key", () => {
    expect(searchKind(`zivks1${"q".repeat(60)}`)).toBe("viewing-key");
  });

  it("9. 64 hex characters is a txid", () => {
    expect(TXID).toHaveLength(64);
    expect(searchKind(TXID)).toBe("txid");
  });

  it("10. a 63-hex string is NOT a txid", () => {
    expect(searchKind(TXID.slice(0, 63))).toBe("unknown");
  });

  it("and an integer is a height", () => {
    expect(searchKind("3191051")).toBe("height");
  });
});

describe("A4: a viewing key is recognised before anything else", () => {
  // The asymmetry is the point. Every one of these begins with a character run
  // that another family also uses, and every one of them must come back as a
  // key rather than as an address or a search term.
  const KEYS = [
    `uview1${"q".repeat(120)}`,
    `uivk1${"q".repeat(120)}`,
    `zxviews1${"q".repeat(120)}`,
    `zxview1${"q".repeat(120)}`,
    `zivks1${"q".repeat(120)}`,
    `zivk1${"q".repeat(120)}`,
  ];

  for (const key of KEYS) {
    it(`${key.slice(0, 9)}... classifies as a viewing key, not an address`, () => {
      expect(searchKind(key)).toBe("viewing-key");
    });

    it(`${key.slice(0, 9)}... never resolves to a URL that carries it`, () => {
      // The whole promise. A key's href is /reveal and nothing more: no query
      // string, no fragment, no path segment. A URL is written to history and
      // sent as the referrer of the next request.
      const href = hrefFor(key);
      expect(href).toBe("/reveal");
      expect(href).not.toContain(key);
      expect(href).not.toContain(key.slice(0, 12));
    });
  }

  it("a key survives leading and trailing whitespace, as a paste does", () => {
    expect(searchKind(`  uview1${"q".repeat(60)}\n`)).toBe("viewing-key");
  });

  it("is case-insensitive about the prefix, because a paste may not be", () => {
    expect(searchKind(`UVIEW1${"Q".repeat(60)}`)).toBe("viewing-key");
  });
});

describe("A4: the classifier is total and pure", () => {
  const KINDS = new Set(["transparent", "shielded", "viewing-key", "txid", "height", "unknown"]);

  it("every input gets exactly one of the six kinds", () => {
    for (const input of [T1, T3, U1, ZS1, ZC, TXID, "3191051", "junk", "", "   ", "0x1234", "../etc/passwd"]) {
      expect(KINDS.has(searchKind(input)), input).toBe(true);
    }
  });

  it("the same input classifies the same way every time", () => {
    expect(searchKind(TXID)).toBe(searchKind(TXID));
    expect(searchKind("junk")).toBe(searchKind("junk"));
  });

  it("every kind has display text", () => {
    for (const k of KINDS) expect(KIND_TEXT[k as keyof typeof KIND_TEXT].length).toBeGreaterThan(0);
  });
});

describe("A4: what is rejected, and why", () => {
  it("rejects a 0x prefix, per the lowercase-hex-no-0x convention", () => {
    expect(searchKind(`0x${TXID}`)).toBe("unknown");
  });

  it("rejects 64 characters that are not all hex", () => {
    expect(searchKind(`${TXID.slice(0, 63)}z`)).toBe("unknown");
  });

  it("rejects a t-address of the wrong length", () => {
    expect(searchKind(`t1${"a".repeat(32)}`)).toBe("unknown");
    expect(searchKind(`t1${"a".repeat(34)}`)).toBe("unknown");
    expect(searchKind(`t1${"a".repeat(33)}`)).toBe("transparent");
  });

  it("rejects base58's four excluded characters in a t-address", () => {
    // No zero, no capital O, no capital I, no lowercase l. An address that
    // contains one is a typo, and calling it an address would send the reader
    // to a lookup that cannot succeed.
    for (const bad of ["0", "O", "I", "l"]) {
      expect(searchKind(`t1${bad}${"a".repeat(32)}`), bad).toBe("unknown");
    }
  });

  it("does not mistake the word zcash for a Sprout address", () => {
    // `zc` is a two-character prefix, and without a length floor it matches
    // most sentences that start with the project's name.
    expect(searchKind("zcash")).toBe("unknown");
    expect(searchKind("zcash is a cryptocurrency")).toBe("unknown");
  });

  it("stops treating an implausibly long digit run as a height", () => {
    expect(searchKind("123456789")).toBe("height");
    expect(searchKind("1234567890")).toBe("unknown");
  });

  it("rejects a height with separators or a sign", () => {
    expect(searchKind("3,191,051")).toBe("unknown");
    expect(searchKind("-1")).toBe("unknown");
    expect(searchKind("1.5")).toBe("unknown");
  });

  it("calls an empty query unknown rather than guessing", () => {
    expect(searchKind("")).toBe("unknown");
    expect(searchKind("   ")).toBe("unknown");
    expect(hrefFor("")).toBeNull();
  });
});

describe("A4: where a recognised query goes", () => {
  it("a transparent address goes to its own page", () => {
    expect(hrefFor(T3)).toBe(`/address/${T3}`);
  });

  it("a shielded address goes to Mode B, carrying the address", () => {
    // Safe and deliberate: a shielded address is a destination anyone can pay,
    // not a secret. A viewing key is the opposite, which is the case above.
    expect(hrefFor(U1)).toBe(`/reveal?addr=${encodeURIComponent(U1)}`);
  });

  it("a txid is lowercased on the way to its page", () => {
    expect(hrefFor(TXID.toUpperCase())).toBe(`/tx/${TXID}`);
  });

  it("a height goes to its block", () => {
    expect(hrefFor("3191051")).toBe("/block/3191051");
  });
});
