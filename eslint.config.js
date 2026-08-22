// Flat config for the ZCashReveal monorepo.
//
// Scope: 2.0 code only. `legacy/` is the parked v0.2 SPA (see legacy/dashboard/README.md)
// and is not held to these rules; build output, docs and the pnpm store are ignored.
//
// The one project-specific rule is the Math.random ban. CLAUDE.md requires every
// stochastic-looking surface to be seeded from the chain tip (FNV-1a -> mulberry32) so
// that a given tip renders identically for every viewer; Math.random would make the
// ambience non-reproducible and untestable.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const NO_MATH_RANDOM = {
  "no-restricted-properties": [
    "error",
    {
      object: "Math",
      property: "random",
      message:
        "Math.random is banned. Seed from the chain tip instead (FNV-1a -> mulberry32); see CLAUDE.md, Design system.",
    },
  ],
};

export default tseslint.config(
  {
    // Not linted: build output, dependencies, the parked v0.2 app, and docs assets.
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/coverage/**",
      "legacy/**",
      "docs/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...NO_MATH_RANDOM,
      // bigint is the zatoshi carrier throughout; `any` is the thing to keep out.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // apps/web runs in the browser as well as in the Node render pass, so it
    // needs both global sets. `no-undef` is already off for TypeScript under
    // typescript-eslint (the compiler owns that check), but a plain .js or
    // .mjs config file in this tree would otherwise be judged against Node
    // globals alone.
    files: ["apps/web/**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Tests may shadow and re-declare freely. Unused fixture builders are reported as
    // warnings, not errors: HANDOFF-00 forbids edits under apps/*/src, so a real finding
    // there (block-decoder.test.ts: unused `saplingSpend`) must stay visible without
    // failing the gate. Promote back to "error" once a handoff is allowed to touch it.
    files: ["**/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
