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
      buildCommand: "next build",
      outputDirectory: ".next",
    };
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
