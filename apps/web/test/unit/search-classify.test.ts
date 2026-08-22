/**
 * The Track search field decides what kind of identifier it was handed before
 * any lookup happens. The classification is syntactic only - it answers "what
 * shape is this", never "who owns this" - and that boundary is what the last
 * describe block pins.
 *
 * `SearchBar.tsx` is a client component; only its pure export is exercised here,
 * so no DOM is required and the suite stays in the node environment.
 */
import { describe, expect, it } from "vitest";

import { classifyQuery } from "@/components/ui/SearchBar";

const TXID = "3a9e7c1b2d4f8a6e3c0d9b7f5a2e4c8d1b6f3a9e7c1b2d4f8a6e3c0d9b7f5a2e";

describe("classifyQuery: transaction ids", () => {
  it("recognises 64 lowercase hex characters", () => {
    expect(TXID).toHaveLength(64);
    expect(classifyQuery(TXID)).toBe("txid");
  });

  it("recognises uppercase and mixed-case hex", () => {
    expect(classifyQuery(TXID.toUpperCase())).toBe("txid");
    expect(classifyQuery(`${TXID.slice(0, 32).toUpperCase()}${TXID.slice(32)}`)).toBe("txid");
  });

  it("tolerates surrounding whitespace, as a paste does", () => {
    expect(classifyQuery(`  ${TXID}\n`)).toBe("txid");
  });

  it("rejects a hash of the wrong length", () => {
    expect(classifyQuery(TXID.slice(0, 63))).toBe("unknown");
    expect(classifyQuery(`${TXID}a`)).toBe("unknown");
  });

  it("rejects a 0x prefix, per the lowercase-hex-no-0x convention", () => {
    expect(classifyQuery(`0x${TXID}`)).toBe("unknown");
  });

  it("rejects 64 characters that are not all hex", () => {
    expect(classifyQuery(`${TXID.slice(0, 63)}z`)).toBe("unknown");
  });
});

describe("classifyQuery: block heights", () => {
  it("recognises a bare run of digits", () => {
    expect(classifyQuery("0")).toBe("block");
    expect(classifyQuery("1")).toBe("block");
    expect(classifyQuery("3456854")).toBe("block");
  });

  it("recognises the current tip height with whitespace around it", () => {
    expect(classifyQuery(" 3456854 ")).toBe("block");
  });

  it("stops treating an implausibly long digit run as a height", () => {
    expect(classifyQuery("123456789")).toBe("block");
    expect(classifyQuery("1234567890")).toBe("unknown");
  });

  it("rejects digits with separators or a sign", () => {
    expect(classifyQuery("3,456,854")).toBe("unknown");
    expect(classifyQuery("-1")).toBe("unknown");
    expect(classifyQuery("1.5")).toBe("unknown");
  });

  it("prefers block over txid only where the two cannot overlap", () => {
    // A 64-digit string is hex too; length disambiguates, and the digit rule
    // caps at nine characters so it can never swallow a txid.
    expect(classifyQuery("1".repeat(64))).toBe("txid");
  });
});

describe("classifyQuery: addresses", () => {
  it("recognises each supported address prefix", () => {
    expect(classifyQuery(`t1${"a".repeat(32)}`)).toBe("address");
    expect(classifyQuery(`t3${"a".repeat(32)}`)).toBe("address");
    expect(classifyQuery(`zs1${"q".repeat(75)}`)).toBe("address");
    expect(classifyQuery(`u1${"q".repeat(200)}`)).toBe("address");
    expect(classifyQuery(`tex1${"q".repeat(38)}`)).toBe("address");
  });

  it("is case-insensitive about the body", () => {
    expect(classifyQuery(`T1${"A".repeat(32)}`)).toBe("address");
  });

  it("rejects a prefix with too short a body", () => {
    expect(classifyQuery("t1abc")).toBe("unknown");
    expect(classifyQuery(`t1${"a".repeat(19)}`)).toBe("unknown");
    expect(classifyQuery(`t1${"a".repeat(20)}`)).toBe("address");
  });

  it("rejects an unsupported prefix", () => {
    expect(classifyQuery(`t2${"a".repeat(32)}`)).toBe("unknown");
    expect(classifyQuery(`bc1${"q".repeat(38)}`)).toBe("unknown");
  });

  it("rejects a body containing characters outside the alphanumeric set", () => {
    expect(classifyQuery(`t1${"a".repeat(20)}-${"a".repeat(10)}`)).toBe("unknown");
  });
});

describe("classifyQuery: everything else", () => {
  it("calls an empty or whitespace-only query unknown", () => {
    expect(classifyQuery("")).toBe("unknown");
    expect(classifyQuery("   ")).toBe("unknown");
    expect(classifyQuery("\t\n")).toBe("unknown");
  });

  it("calls junk unknown rather than guessing", () => {
    for (const junk of ["hello", "who owns this", "?", "zcash", "t1", "0x", "../etc/passwd"]) {
      expect(classifyQuery(junk), junk).toBe("unknown");
    }
  });

  it("is total: every input gets one of the four kinds", () => {
    const kinds = new Set(["txid", "address", "block", "unknown"]);
    for (const input of [TXID, "12345", `t1${"a".repeat(32)}`, "junk", "", "  "]) {
      expect(kinds.has(classifyQuery(input)), input).toBe(true);
    }
  });

  it("is pure: the same input classifies the same way every time", () => {
    expect(classifyQuery(TXID)).toBe(classifyQuery(TXID));
    expect(classifyQuery("junk")).toBe(classifyQuery("junk"));
  });
});
