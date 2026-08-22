// Guards HANDOFF-00 assertion A5: the Postgres-backed integration tests must actually
// run in CI, not silently skip.
//
// Why this exists. The integration suites gate themselves on a live TCP reachability
// probe (apps/indexer/src/persistence/__tests__/integration/_setup.ts:
// `describe.skipIf(!reachable)`), not on the presence of DATABASE_URL. So a
// misconfigured or unreachable database does not fail the run - it produces a green
// run of 133 tests instead of 170, and the Postgres coverage evaporates without a
// single red mark. This script turns that silent downgrade into a hard failure.
//
// Usage: node scripts/assert-no-skipped-integration.mjs <vitest-json-report>
import { readFileSync } from "node:fs";

// The one sanctioned skip: a real post-NU5 mainnet block capture that needs a synced
// zebrad to produce. The test self-activates once apps/indexer/test/fixtures/blocks/
// contains a `mainnet-*.json`. See docs/2.0/v0.2-notes/RUNBOOK-finish-v0.2.md.
const ALLOWED_SKIPS = [
  "decodeBlock — real mainnet fixture decodes a captured post-NU5 mainnet block end-to-end",
];

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: node scripts/assert-no-skipped-integration.mjs <report.json>");
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));

const skipped = report.testResults.flatMap((file) =>
  file.assertionResults
    .filter((a) => a.status !== "passed" && a.status !== "failed")
    .map((a) => ({ file: file.name, title: a.fullName, status: a.status })),
);

const unexpected = skipped.filter((s) => !ALLOWED_SKIPS.includes(s.title));
const integrationRan = report.testResults.filter(
  (f) => f.name.includes("/persistence/__tests__/integration/") && f.assertionResults.length > 0,
);
const integrationSkipped = integrationRan.filter((f) =>
  f.assertionResults.every((a) => a.status !== "passed"),
);

console.log(
  `[assert] total=${report.numTotalTests} passed=${report.numPassedTests} ` +
    `failed=${report.numFailedTests} skipped=${report.numPendingTests}`,
);
console.log(`[assert] integration files with executed tests: ${integrationRan.length}`);
for (const s of skipped) {
  const tag = ALLOWED_SKIPS.includes(s.title) ? "allowed" : "UNEXPECTED";
  console.log(`[assert] skipped (${tag}): ${s.title}`);
}

let failed = false;

if (integrationRan.length === 0 || integrationSkipped.length > 0) {
  console.error(
    "[assert] FAIL: Postgres integration tests did not execute. The reachability probe " +
      "found no database, so the suites skipped themselves. Check the postgres service, " +
      "DATABASE_URL, and that `pnpm --filter @zcashreveal/indexer migrate` ran first.",
  );
  failed = true;
}

if (unexpected.length > 0) {
  console.error(`[assert] FAIL: ${unexpected.length} unexpected skipped test(s):`);
  for (const s of unexpected) console.error(`  - ${s.title}  (${s.file})`);
  failed = true;
}

if (report.numFailedTests > 0) {
  console.error(`[assert] FAIL: ${report.numFailedTests} failing test(s).`);
  failed = true;
}

if (failed) process.exit(1);
console.log("[assert] OK: every Postgres integration test executed.");
