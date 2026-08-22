#!/usr/bin/env node
/**
 * HANDOFF-01 assertion A2 - the token file defines every value the section 3
 * contract names, with the exact hex.
 *
 * Run standalone (`pnpm --filter @zcashreveal/web check:tokens`) for a shell
 * transcript, or through `checkTokens()` from test/unit/tokens.test.ts so the
 * same rule runs in `pnpm -r test` and in CI. One implementation, two callers:
 * the assertion cannot pass in one place and fail in the other.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOKENS_PATH = join(HERE, "..", "src", "styles", "tokens.css");

/**
 * The ten colour tokens of the contract, plus the one motion curve.
 * Order is the contract's order, not alphabetical, so a diff reads like the spec.
 */
export const REQUIRED = [
  ["--bg", "#121110"],
  ["--surface", "#1a1816"],
  ["--ink", "#ede6d8"],
  ["--gold", "#f4b728"],
  ["--blue-fn", "#4c8dff"],
  ["--danger", "#e4553f"],
  ["--p-transparent", "#3a8bd9"],
  ["--p-sprout", "#1f9e62"],
  ["--p-sapling", "#d9641e"],
  ["--p-orchard", "#c94f8f"],
  ["--p-ironwood", "#8b7fe6"],
  ["--ease", "cubic-bezier(0.32, 0.72, 0, 1)"],
  ["--t1", "180ms"],
  ["--t2", "320ms"],
  ["--t3", "500ms"],
];

/**
 * @param {string} [css] token file contents; read from disk when omitted
 * @returns {{ token: string, expected: string, found: string | null, ok: boolean }[]}
 */
export function checkTokens(css) {
  const source = css ?? readFileSync(TOKENS_PATH, "utf8");
  return REQUIRED.map(([token, expected]) => {
    // Match the declaration inside :root only - the @theme bridge re-exports
    // every token as `--color-x: var(--x)`, which must not satisfy the check.
    const re = new RegExp(`^\\s*${token.replace(/-/g, "\\-")}\\s*:\\s*([^;]+);`, "m");
    const m = re.exec(source);
    const found = m && m[1] ? m[1].trim() : null;
    return {
      token,
      expected,
      found,
      // Hex is compared case-insensitively; the contract writes uppercase, the
      // file writes lowercase (CLAUDE.md: lowercase hex).
      ok: found !== null && found.toLowerCase() === expected.toLowerCase(),
    };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = checkTokens();
  const bad = results.filter((r) => !r.ok);
  for (const r of results) {
    const state = r.ok ? "ok  " : "FAIL";
    process.stdout.write(`${state} ${r.token.padEnd(16)} expected ${r.expected.padEnd(32)} found ${r.found ?? "(absent)"}\n`);
  }
  if (bad.length > 0) {
    process.stderr.write(`\ncheck-tokens: FAIL - ${bad.length} of ${results.length} token(s) wrong or absent.\n`);
    process.exit(1);
  }
  process.stdout.write(`\ncheck-tokens: OK - ${results.length} tokens present with the contracted values.\n`);
}
