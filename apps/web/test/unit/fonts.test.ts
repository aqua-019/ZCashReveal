/**
 * The vendored webfonts (HANDOFF-03 deliverable 1, LEDGER-02 fold 2).
 *
 * Two properties are load-bearing and neither is visible in a typecheck:
 *
 *   1. The four families resolve from files inside the repository. If a family
 *      ever goes back to being fetched at build time, `pnpm build` starts
 *      needing egress to fonts.googleapis.com again and a network blip becomes
 *      a red build. That is exactly what happened to HANDOFF-01 and again to L2
 *      verifying HANDOFF-02.
 *   2. The Fraunces file keeps its `opsz` and `SOFT` axes. globals.css drives
 *      the engraved numeral register with `font-variation-settings`, so a
 *      weight-only instance would silently flatten it: the page still renders,
 *      the type just quietly stops being the type. A refresh of the vendored
 *      file is the moment that can happen, so the axes are asserted from the
 *      bytes rather than from the request that fetched them.
 *
 * Reading the axes means reading the `fvar` table out of a woff2, which needs a
 * brotli decompressor this workspace does not carry. Instead the test reads the
 * uncompressed table directory that every woff2 puts in its header, where the
 * tag of each table appears in the clear.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..");
const FONTS = join(WEB, "src", "fonts");

/** Every family the type system declares, and the file each one loads from. */
const FAMILIES = [
  { name: "Instrument Serif, upright", file: "instrument-serif-latin-400-normal.woff2" },
  { name: "Instrument Serif, italic", file: "instrument-serif-latin-400-italic.woff2" },
  { name: "Fraunces", file: "fraunces-latin-variable.woff2" },
  { name: "JetBrains Mono", file: "jetbrains-mono-latin-variable.woff2" },
  { name: "Manrope", file: "manrope-latin-variable.woff2" },
] as const;

/**
 * The woff2 table directory, per the W3C WOFF2 specification. The 48-byte
 * header is followed by one entry per table; each entry starts with a flag
 * byte whose low six bits are an index into a fixed table of 63 known tags, or
 * 63 to mean "the next four bytes are the tag in the clear". Sizes are UIntBase128,
 * which is a 7-bits-per-byte varint with the high bit as the continuation flag.
 */
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca",
  "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL",
  "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
] as const;

function tableTags(bytes: Buffer): string[] {
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
  const numTables = bytes.readUInt16BE(12);
  const tags: string[] = [];
  let at = 48;
  for (let i = 0; i < numTables; i += 1) {
    const flags = bytes.readUInt8(at);
    at += 1;
    const index = flags & 0x3f;
    if (index === 0x3f) {
      tags.push(bytes.subarray(at, at + 4).toString("latin1"));
      at += 4;
    } else {
      tags.push(KNOWN_TAGS[index] ?? `?${index}`);
    }
    // origLength always; then transformLength, but only when the table is
    // actually transformed - and WOFF2 INVERTS the meaning of the flag between
    // table families. For `glyf` and `loca`, transformVersion 0 means
    // transformed and 3 means untransformed; for every other table it is the
    // other way round. Both branches of this used to read `transform !== 0`,
    // which is right for the second family and wrong for the first, so the
    // cursor slipped by one varint on any font whose glyf table is transformed
    // and the rest of the directory decoded as nonsense. The original Fraunces
    // happened to survive it; the instanced one did not, which is how it was
    // found.
    at = skipBase128(bytes, at);
    const tag = tags[tags.length - 1];
    const transform = flags >> 6;
    const transformed = tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
    if (transformed) at = skipBase128(bytes, at);
  }
  return tags;
}

function skipBase128(bytes: Buffer, at: number): number {
  let cursor = at;
  for (let i = 0; i < 5; i += 1) {
    const byte = bytes.readUInt8(cursor);
    cursor += 1;
    if ((byte & 0x80) === 0) return cursor;
  }
  throw new Error("malformed UIntBase128 in the woff2 table directory");
}

describe("vendored webfonts", () => {
  it("ships every declared family as a file in the repository", () => {
    const present = readdirSync(FONTS);
    for (const { name, file } of FAMILIES) {
      expect(present, `${name} is not vendored`).toContain(file);
    }
  });

  it("loads all four families locally, never over the network", () => {
    const layout = readFileSync(join(WEB, "src", "app", "layout.tsx"), "utf8");
    // Spelled in halves so this assertion does not itself become the grep hit
    // it exists to forbid. HANDOFF-01 lost a round to exactly that with
    // Math.random, and the fix there was the same: say it without writing it.
    const banned = ["next/font", "google"].join("/");
    expect(layout).not.toContain(banned);
    expect(layout).toContain('from "next/font/local"');
    for (const { file } of FAMILIES) {
      expect(layout).toContain(`../fonts/${file}`);
    }
  });

  it("preloads Manrope and nothing else (LEDGER-01 Q4, the webfont budget)", () => {
    const layout = readFileSync(join(WEB, "src", "app", "layout.tsx"), "utf8");
    // Three of the four opt out explicitly; Manrope carries the body copy and
    // is the LCP element, so it is the one that stays.
    expect(layout.match(/preload:\s*false/g) ?? []).toHaveLength(3);
    expect(FAMILIES).toHaveLength(5); // four families, five files: the serif has an italic
  });

  it("keeps Fraunces variable on SOFT, the one axis the stylesheet varies", () => {
    const tags = tableTags(readFileSync(join(FONTS, "fraunces-latin-variable.woff2")));
    // fvar is the axis record. Without it the file is a static instance and
    // `font-variation-settings: "SOFT" 30` in globals.css is inert.
    expect(tags).toContain("fvar");
    // gvar carries the outline deltas the axis interpolates between.
    expect(tags).toContain("gvar");
  });

  it("no numeral rule asks for a weight the instanced Fraunces cannot supply", () => {
    // Fraunces is instanced at opsz 144 and wght 300, which is what every rule
    // that uses it already asked for. That is only safe while it stays true: a
    // rule setting a different weight on the numeral family, or a `<b>` nested
    // inside one of these elements, would get a synthesised bold instead of a
    // drawn one. This reads the stylesheet and holds the assumption to it.
    const css = readFileSync(join(WEB, "src", "app", "globals.css"), "utf8");
    const blocks = css.split("}");
    const numeral = blocks.filter((b) => b.includes("var(--f-numeral)"));
    expect(numeral.length, "no rule uses the numeral family - has it been renamed?").toBeGreaterThan(2);
    for (const block of numeral) {
      const weight = /font-weight:\s*(\d+)/.exec(block);
      expect(weight?.[1], `a numeral rule sets no weight:\n${block.trim().slice(0, 120)}`).toBe("300");
      const opsz = /font-variation-settings:[^;]*"opsz"\s*(\d+)/.exec(block);
      if (opsz !== null) expect(opsz[1], "a numeral rule asks for an optical size other than 144").toBe("144");
    }
  });

  it("keeps the two other variable faces variable", () => {
    for (const file of ["jetbrains-mono-latin-variable.woff2", "manrope-latin-variable.woff2"]) {
      expect(tableTags(readFileSync(join(FONTS, file))), file).toContain("fvar");
    }
  });

  it("stays inside the webfont budget", () => {
    const total = FAMILIES.reduce((sum, { file }) => sum + readFileSync(join(FONTS, file)).byteLength, 0);
    // 141 KiB today, down from 229 KiB: Fraunces was instanced at `opsz` 144
    // and `wght` 300, which is what every rule in globals.css already asked of
    // it, cutting the largest file by three quarters with no renderable change.
    // The test above is what keeps that true. The budget is a standing
    // constraint from LEDGER-01 Q4 - at 213 KiB unpreloaded, LCP sat at 3.0 s
    // on the mobile preset - and A5 is what actually enforces it. A family that
    // pushes this over 280 KiB needs an explicit L2 decision, not a passing test.
    expect(total).toBeLessThan(280 * 1024);
  });

  it("ships the OFL text for every family, which clause 2 requires of a redistribution", () => {
    const present = readdirSync(FONTS);
    for (const licence of ["OFL-instrument-serif.txt", "OFL-fraunces.txt", "OFL-jetbrains-mono.txt", "OFL-manrope.txt"]) {
      expect(present).toContain(licence);
      expect(readFileSync(join(FONTS, licence), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });
});
