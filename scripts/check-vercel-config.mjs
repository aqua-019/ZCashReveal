#!/usr/bin/env node
/**
 * Assertion A8 (LEDGER-01 addendum, fold 9).
 *
 * Vercel reads the ROOT vercel.json for every project in this repository,
 * whatever a project's Root Directory is set to, and it overrides the file
 * inside that Root Directory. L2 proved it: the first production build of the
 * zecreveal project (Root Directory apps/web) ran the root file's build command,
 * built legacy/dashboard, then failed with NEXT_OUTPUT_DIR_MISSING looking for
 * legacy/dashboard/dist underneath apps/web.
 *
 * So the root file must not exist, and apps/web must declare the Next.js
 * framework itself. This check exists so the root file cannot come back by
 * accident: restoring it silently breaks production for apps/web.
 *
 * Deleting the root file turned out to be necessary but not sufficient. The
 * deployment on the commit that deleted it STILL ran the dashboard's build
 * command and STILL died on "legacy/dashboard/dist", because the same settings
 * are also stored on the zecreveal project itself, imported when the project was
 * created. vercel.json takes precedence over stored project settings, so
 * apps/web/vercel.json now pins buildCommand, installCommand and outputDirectory
 * explicitly rather than relying on the project's settings being clean. This
 * check asserts all of them, so a later edit cannot quietly hand control back to
 * whatever is stored in the dashboard.
 *
 * Run: node scripts/check-vercel-config.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const rootConfig = join(REPO, "vercel.json");
if (existsSync(rootConfig)) {
  failures.push(
    "vercel.json exists at the repository root. Vercel applies it to every project here, " +
      "overriding apps/web/vercel.json, and the apps/web build fails with NEXT_OUTPUT_DIR_MISSING. " +
      "Keep legacy/dashboard building from the z-cash-reveal-dashboard2 project settings instead; " +
      "the exact values are in docs/2.0/DEPLOY-2.0.md.",
  );
}

const webConfigPath = join(REPO, "apps", "web", "vercel.json");
if (!existsSync(webConfigPath)) {
  failures.push("apps/web/vercel.json is missing; apps/web must declare its own framework.");
} else {
  let webConfig;
  try {
    webConfig = JSON.parse(readFileSync(webConfigPath, "utf8"));
  } catch (error) {
    failures.push(`apps/web/vercel.json is not valid JSON: ${error.message}`);
  }
  if (webConfig) {
    // Every one of these must be pinned in the repository. Leaving any of them to
    // the project settings is what broke the build: the stored values there are
    // the legacy dashboard's.
    const required = {
      framework: "nextjs",
      installCommand: "pnpm install --frozen-lockfile",
      // THE BUILD COMMAND MUST GO THROUGH TURBO, and must not name any
      // individual workspace dependency.
      //
      // apps/web depends on workspace packages whose exports resolve to dist/,
      // so the bare `next build` the Next.js preset would run does not build
      // them. HANDOFF-03 solved that by naming @zcashreveal/content in the
      // command. HANDOFF-04 added @zcashreveal/types as a second dependency
      // (LEDGER-03 fold 1) and the pinned string did not grow with it: the
      // preview failed with "Module not found: Can't resolve
      // '@zcashreveal/types'", and it passed locally only because `pnpm build`
      // goes through turbo, whose build task carries dependsOn ["^build"],
      // while Vercel runs the literal string.
      //
      // A hand-maintained list of dependencies in a config file is a list that
      // will drift again on the next handoff that adds one. `turbo run build
      // --filter=@zcashreveal/web` asks the dependency graph instead, so the
      // command is correct for whatever apps/web depends on next and nobody has
      // to remember to edit it. This check pins that FORM: a command naming a
      // package by hand is rejected even if it happens to be complete today.
      buildCommand: "pnpm turbo run build --filter=@zcashreveal/web",
      outputDirectory: ".next",
    };
    // The form, not just the value: a future edit that reverts to naming
    // packages by hand fails here with the reason rather than on Vercel.
    const build = typeof webConfig.buildCommand === "string" ? webConfig.buildCommand : "";
    if (build !== "" && /--filter[= ]@zcashreveal\/(content|types)\b/.test(build)) {
      failures.push(
        `apps/web/vercel.json buildCommand names a workspace dependency by hand: ${JSON.stringify(build)}. ` +
          "That list drifts every time apps/web gains a dependency - it did between HANDOFF-03 and HANDOFF-04, " +
          "and the preview failed with Module not found: Can't resolve '@zcashreveal/types'. " +
          "Use `pnpm turbo run build --filter=@zcashreveal/web` and let the dependency graph answer.",
      );
    }
    if (build !== "" && !build.includes("turbo run build")) {
      failures.push(
        `apps/web/vercel.json buildCommand does not go through turbo: ${JSON.stringify(build)}. ` +
          "Vercel runs the literal string and bypasses the turbo task graph, so `dependsOn: [\"^build\"]` " +
          "does not apply and workspace dependencies are not built.",
      );
    }

    for (const [key, expected] of Object.entries(required)) {
      if (webConfig[key] !== expected) {
        failures.push(
          `apps/web/vercel.json ${key} is ${JSON.stringify(webConfig[key])}, expected ${JSON.stringify(expected)}. ` +
            "Unset here means the zecreveal project's stored setting wins, and that is the legacy dashboard's.",
        );
      }
    }
  }
}

process.stdout.write("vercel config\n");
process.stdout.write(`  root vercel.json      ${existsSync(rootConfig) ? "PRESENT" : "absent"}  (expected absent)\n`);
process.stdout.write(
  `  apps/web/vercel.json  ${existsSync(webConfigPath) ? "present" : "MISSING"}  (expected present, and pinning framework, install, build and output)\n`,
);

if (failures.length > 0) {
  process.stdout.write(`\nFAIL  ${failures.length} problem${failures.length === 1 ? "" : "s"}\n`);
  for (const message of failures) process.stdout.write(`  ${message}\n`);
  process.exit(1);
}
process.stdout.write("\nOK  the root file is gone and apps/web pins its own build settings\n");
