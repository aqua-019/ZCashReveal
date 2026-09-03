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
// HANDOFF-09b WIDENED IT TO apps/publisher, AND THAT IS INSTANCE THREE OF A SHAPE
// L2 ASKED TO HAVE RECOGNISED RATHER THAN RE-DERIVED (F-45-2). The shape is "CI is
// green and that is not evidence the package ran": instance one was `zebra-rpc`,
// three handoffs unenumerated in ci.yml; instance two was `packages/zec-instruments`
// with 98 tests and no CI step, HANDOFF-09a's round-1 HIGH. L2 recorded the count
// and wrote: "Clause (b) of the stopping rule triggers at three. I am not asking for
// the guard now. I am recording the count so instance three is RECOGNISED."
//
// Instance three is this: HANDOFF-09b's `snapshot-inputs.integration.test.ts` gates
// itself on a Postgres reachability probe exactly as the indexer's suites do, and the
// publisher's CI step emitted no JSON report, so nothing checked it. An unreachable
// database would have skipped five assertions - including A1, the one the whole
// handoff is for - and left the run green. Under clause (b) the instrument at
// instance three is a GUARD rather than another review, and the guard already
// existed; it was pointed at one package.
//
// Usage: node scripts/assert-no-skipped-integration.mjs <vitest-json-report> [...]
import { readFileSync } from "node:fs";

// The one sanctioned skip: a real post-NU5 mainnet block capture that needs a synced
// zebrad to produce. The test self-activates once apps/indexer/test/fixtures/blocks/
// contains a `mainnet-*.json`. See docs/2.0/v0.2-notes/RUNBOOK-finish-v0.2.md.
//
// THE TWO `runIf` MARKERS ARE ALLOWED AND ARE NOT THE SAME KIND OF THING. Each fires
// only when its service is DOWN, so on a correctly configured runner each is skipped
// BECAUSE the service is up - which is the healthy state, and the inverse of what
// this script hunts. They are named here rather than pattern-matched so that adding a
// third marker is a deliberate edit and not an accident. The titles are vitest's
// `fullName`, which joins the describe and the test with a SINGLE SPACE and not with
// the " > " a reader expects - written the other way first, and the guard caught it.
const ALLOWED_SKIPS = [
  "A7 - the redis sink against a local Redis A7 SKIPPED, WITH ITS REASON: no local Redis, so the integration half did not run",
  "A1/A4/A5 - readSnapshotInputs against a real Postgres A1 SKIPPED, WITH ITS REASON: no reachable Postgres with migration 005 applied",
  // A11's live leg. No runner this project has answers on a Zebra port, so this
  // one skips everywhere; the three tests beside it that assert the floor BY
  // DATA all run. It became visible only when ci.yml started writing a JSON
  // report for packages/zebra-rpc - before that the guard was never handed the
  // file, so the skip was invisible twice over: no report, and no INTEGRATION_FILE
  // match either (F-49-1). Added in the same commit as the report, because the
  // report alone turns CI red on every correctly configured runner.
  "A11 - the connected node clears the version floor packages/zebra-rpc declares A11 PASS STATE: the live node's subversion clears the floor",
  // HANDOFF-14's two markers, in `rpc-only.integration.test.ts`, and they are the
  // SAME KIND as A7's and A1's above rather than a new exception: each fires only
  // when its service is DOWN, so on a correctly configured runner each is skipped
  // BECAUSE the service is up. The suite's real halves - the local-Redis round
  // trip and the live-database fail side - ran in that same report.
  //
  // ADDED BY THE COMMIT THAT MADE THEM NECESSARY, WHICH IS THE WHOLE POINT OF
  // NAMING THEM. This guard's header says a new marker must be "a deliberate edit
  // and not an accident", and the accident happened anyway: the suite shipped, all
  // six local gates passed, and CI went red here - because NO local command runs
  // this script. It needs the vitest JSON reports, which only `ci.yml` asks for,
  // so `pnpm check` and `pnpm -r test` are both blind to it. That is the fifth
  // face of LEDGER-09b Q3's origin - a new suite arriving without inheriting a
  // convention every existing member has - and the second time in this project a
  // gate has existed only in CI (the first was `pnpm build`, HANDOFF-07).
  "deliverable 2 - an RPC-only snapshot published to a local Redis and read back SKIPPED, WITH ITS REASON: no local Redis, so the round trip did not run",
  "A1 FAIL SIDE - the same three panels, MEASURED, against a real database A1 FAIL SIDE SKIPPED, WITH ITS REASON: no reachable Postgres, so the fail side did not discriminate",
];

/**
 * A file whose tests must have EXECUTED, not skipped.
 *
 * Two patterns, because the two packages name their integration suites differently:
 * the indexer puts them in a directory and the publisher gives them a `.integration.`
 * infix. Matching only the first is what let instance three exist.
 */
const INTEGRATION_FILE = /\/persistence\/__tests__\/integration\/|\.integration\.test\./;

const reportPaths = process.argv.slice(2);
if (reportPaths.length === 0) {
  console.error("usage: node scripts/assert-no-skipped-integration.mjs <report.json> [...]");
  process.exit(2);
}

// MERGED ACROSS REPORTS, so one invocation can cover several packages and a missing
// report is a hard failure rather than a quietly shorter list.
const reports = reportPaths.map((p) => JSON.parse(readFileSync(p, "utf8")));
const report = {
  testResults: reports.flatMap((r) => r.testResults),
  numTotalTests: reports.reduce((n, r) => n + r.numTotalTests, 0),
  numPassedTests: reports.reduce((n, r) => n + r.numPassedTests, 0),
  numFailedTests: reports.reduce((n, r) => n + r.numFailedTests, 0),
  numPendingTests: reports.reduce((n, r) => n + r.numPendingTests, 0),
};

const skipped = report.testResults.flatMap((file) =>
  file.assertionResults
    .filter((a) => a.status !== "passed" && a.status !== "failed")
    .map((a) => ({ file: file.name, title: a.fullName, status: a.status })),
);

const unexpected = skipped.filter((s) => !ALLOWED_SKIPS.includes(s.title));
const integrationRan = report.testResults.filter(
  (f) => INTEGRATION_FILE.test(f.name) && f.assertionResults.length > 0,
);
const integrationSkipped = integrationRan.filter((f) =>
  f.assertionResults.every((a) => a.status !== "passed"),
);
// EVERY INTEGRATION FILE MUST BE ACCOUNTED FOR BY NAME, not merely counted. A count
// is satisfied by the indexer's eleven suites alone, which is exactly how a publisher
// suite that never ran would have gone unnoticed.
const seenPackages = new Set(
  integrationRan.map((f) => (f.name.includes("/apps/publisher/") ? "publisher" : "indexer")),
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
console.log(
  `[assert] OK: every integration test executed, across ${integrationRan.length} file(s) ` +
    `in ${[...seenPackages].sort().join(" + ")}.`,
);
