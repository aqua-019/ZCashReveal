// Guards HANDOFF-10 assertions A6 and A7 over the two operator documents.
//
//   A6  RUNBOOK-VPS.md contains a command for each of: provisioning, first sync,
//       wipe-and-resync, backup, upgrade, and tunnel create / route / run.
//   A7  DEPLOY-2.0.md names every environment variable apps/web actually reads.
//
// A7 IS NOT IMPLEMENTED AS THE COMMAND THE ASSERTION WRITES, and the divergence
// is deliberate, reported, and the same shape as the one HANDOFF-08 found in its
// own A10. The assertion says to cross-check
//
//     grep -rhoE '(NEXT_PUBLIC|SNAPSHOT)_[A-Z_]*' apps/web/src
//
// against the document. Run literally against this tree, that command returns
// nine tokens and FOUR OF THEM ARE NOT VARIABLES:
//
//     NEXT_PUBLIC_        from prose in a docblock: "`NEXT_PUBLIC_*` is compiled
//                         into the client bundle"        (lib/env.ts:9)
//     NEXT_PUBLIC_X       from a docblock EXAMPLE: "Next.js inlines
//                         `process.env.NEXT_PUBLIC_X` only for a literal member"
//                                                        (lib/env.ts:13)
//     SNAPSHOT_REDIS_     from the same prose             (lib/env.ts:10)
//     SNAPSHOT_URL        an exported CONSTANT name, not an env var at all -
//                         `export const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL`
//                                                        (lib/env.ts:42)
//
// A guard built on that command would demand that DEPLOY-2.0.md document a
// variable called `NEXT_PUBLIC_X` that exists only inside a sentence explaining
// how Next.js inlining works. Documenting it to satisfy the guard would put a
// fictional variable in the operator's list, which is worse than the gap the
// assertion was written to close.
//
// So this implements the ASSERTION rather than the command: every name actually
// READ from `process.env` in apps/web must be documented. That is strictly
// stronger on the axis that matters - it cannot be satisfied by prose - and
// strictly narrower on the axis that was wrong. Recorded in HANDOFF-10 §5 as a
// correction with L2 named as the author of the imprecision, so that nobody
// restoring "what the handoff said" reintroduces it.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RUNBOOK = "docs/2.0/RUNBOOK-VPS.md";
const DEPLOY = "docs/2.0/DEPLOY-2.0.md";
const CUTOVER = "docs/2.0/CUTOVER.md";
// SCANS ALL OF apps/web, NOT JUST src/. The first gate round found that
// `apps/web/next.config.ts` reads NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL and
// NEXT_PUBLIC_SNAPSHOT_URL - outside src/, and therefore outside the first
// draft's scan, while the OK message claimed "apps/web reads". All three happen
// to be documented, so nothing was wrong today; what was wrong was that a
// variable introduced there tomorrow would never be demanded.
const WEB_ROOT = "apps/web";

// Only the two prefixes A7 is about. Widening the scan without this would start
// demanding that DEPLOY-2.0.md document `CI` (read by playwright.config.ts) and
// `LIGHTHOUSE_CHROME_PATH` (read by a local script) - neither of which is a
// deployment variable, and both of which would be a fictional entry in an
// operator's list, which is the very failure the A7 divergence above avoids.
const DEPLOY_PREFIXES = /^(NEXT_PUBLIC|SNAPSHOT)_/;

/**
 * A6's checklist. Each entry is a topic and the pattern that proves the runbook
 * carries a COMMAND for it rather than a paragraph about it.
 *
 * The patterns look for the command, not the heading. A runbook with a section
 * called "Backups" and no `pg_dump` in it is the failure this assertion exists
 * to catch - a document that reads as complete and cannot be executed.
 */
/**
 * HANDOFF-11's cutover checklist, on the same standard A6 sets for the runbook:
 * each row is a topic and a pattern that proves the document carries the
 * OPERATOR-EXECUTABLE thing rather than a paragraph about it.
 *
 * WHY THIS DOCUMENT GETS A ROW SET AT ALL. It is the one artefact of HANDOFF-11
 * that nobody in this repository can test by running it - no session can reach
 * a preview or production host (LEDGER-04 Q3), so every check in its
 * verification section is the operator's. A document whose whole value is that
 * somebody else can execute it is exactly the document that decays without
 * anyone noticing, which is the argument that produced A6's table one document
 * over.
 *
 * THE PATTERNS ARE DELIBERATELY NOT HEADINGS. A checklist with a section called
 * "Verify" and no request in it is the failure this catches - the same shape as
 * a runbook with a "Backups" heading and no `pg_dump`.
 *
 * WHAT THIS CANNOT CHECK, stated so a green run is not mistaken for more than
 * it is: that the steps are in a workable ORDER, that the expected answers are
 * right, or that an operator could actually follow it. Those are read by a
 * person. This checks that the executable half has not gone missing.
 */
const CUTOVER_REQUIRED = [
  // The promotion is the click the whole document exists for.
  { topic: "the promotion click", re: /Promote to Production/i },
  // The gateway checks, as requests rather than as prose.
  { topic: "the /v2 snapshot check", re: /curl[^\n]*\/v2\/snapshot|GET\s+https?:\/\/[^\s]*\/v2\/snapshot/ },
  { topic: "the /v2/pools 503 expectation", re: /\/v2\/pools\b[\s\S]{0,200}?503|503[\s\S]{0,200}?\/v2\/pools\b/ },
  { topic: "the retired /api answering 410", re: /\/api\/[a-z]+[\s\S]{0,120}?410|410[\s\S]{0,120}?\/api\// },
  // The two bundle facts A8 and A4 impose together.
  { topic: "the fallback marker", re: /zr:snapshot-fallback:v1/ },
  { topic: "no managed-store name in the bundle", re: /SNAPSHOT_REDIS[\s\S]{0,200}?(browser|bundle|view source)/i },
  // The migration ordering, which is the one precondition that gets expensive
  // if it is skipped rather than merely late.
  { topic: "migrations before the cutover", re: /pnpm\s+--filter\s+@zcashreveal\/indexer\s+migrate/ },
  // The rollback. A checklist with no way back is a checklist an operator is
  // right to refuse to start.
  { topic: "rollback", re: /roll ?back/i },
  // The read-only token rule, which is the one mistake here that damages
  // another project rather than this one.
  { topic: "the read-only token rule", re: /READ_ONLY_TOKEN/ },
];

const A6_REQUIRED = [
  { topic: "provisioning", re: /docker\s+compose\s+-f\s+docker-compose\.yml\s+config|get\.docker\.com/ },
  { topic: "first sync", re: /docker\s+compose\s+up\s+-d\s+zebrad/ },
  { topic: "wipe and resync", re: /docker\s+volume\s+rm\s+\S*zebrad-data/ },
  { topic: "backup", re: /pg_dump/ },
  { topic: "restore", re: /pg_restore/ },
  // AN INVOCATION, NOT THE WORD. `/migrate/` was the one row in this table a
  // SENTENCE could satisfy - "you must migrate the database first" carries no
  // command and closed the topic. What is behind this row is section 4, which
  // is where "MIGRATIONS 003 AND 004 HAVE NEVER BEEN APPLIED TO THE VPS
  // DATABASE" lives together with the warning that 003 is the first migration
  // here that ALTERs objects it did not create and REWRITES existing rows.
  // That paragraph is the thing the operator most needs and the loose pattern
  // would not have noticed it leaving.
  //
  // Both real invocations are accepted, because the runbook uses each in a
  // different place: the container form in sections 2.2, 4 and 8, and the
  // workspace form for a host-run migration on the dev box. `run` and `exec`
  // are both accepted for the container form - the sections next door already
  // use `exec` for pg_dump and pg_restore, neither verb is a sentence, so
  // pinning one of them would only have bought a false alarm.
  {
    topic: "migrations",
    re: /docker\s+compose\s+(?:run|exec)\s+[^\n]*indexer\s+node\s+dist\/migrate|pnpm\s+--filter\s+@zcashreveal\/indexer\s+migrate/,
  },
  { topic: "upgrade", re: /docker\s+compose\s+pull\s+zebrad/ },
  { topic: "tunnel create", re: /cloudflared\s+tunnel\s+create\s+\S+/ },
  { topic: "tunnel route", re: /cloudflared\s+tunnel\s+route\s+dns\s+\S+/ },
  { topic: "tunnel run", re: /docker\s+compose\s+up\s+-d\s+cloudflared|cloudflared\s+tunnel\s+run/ },
  { topic: "tunnel ingress to gateway:8080", re: /service:\s*http:\/\/gateway:8080/ },
  // THE `20\s+blocks` ALTERNATIVE IS GONE, and it was the same defect as the
  // migrations row above: section 7 opens "Alert when the published snapshot
  // is more than 20 blocks behind the chain tip", which satisfied the row on
  // its own. Deleting the shell test underneath it would have left the topic
  // green. `-gt 20 ]` closes a POSIX test and cannot occur in a sentence.
  { topic: "snapshot age alert", re: /-gt\s+20\s*\]/ },
  // SECTION 7.1, AND BOTH CHANNELS RATHER THAN ONE (gate round 5). The section
  // shipped unguarded, which the round-4 review had named as the reason it
  // passed: publisher faults were not among the topics. It then shipped
  // documenting ONE of the two production sinks while saying "the publisher logs
  // each one" - so a row matching only the input channel would have certified
  // exactly the half-coverage that was the finding. The quotes are part of each
  // pattern because the bare words appear in the surrounding prose.
  { topic: "publisher input faults", re: /grep\s+"an input query failed"/ },
  { topic: "publisher panel faults", re: /grep\s+"analysis panel refused"/ },
  // Escaped as `\"method\":\"getblock\"` inside a shell double-quoted string in
  // the runbook, so the pattern must tolerate the backslashes. The first draft
  // did not and the PASS side caught it, which is what the self-test pair below
  // now pins.
  { topic: "fixture capture", re: /method\\?":\s*\\?"getblock/ },
  // Third row of the same shape: the fixture table's own column heading is
  // literally `subversion`, so the row was closed by the heading of the table
  // it was meant to prove gets FILLED. Both extraction shapes are accepted -
  // the bracket-quoted JSON key the runbook uses today, and a jq path - so
  // that rewriting the command is not a false alarm while deleting it is a
  // real one.
  { topic: "node subversion recorded", re: /\[\s*["']subversion["']\s*\]|\.result\.subversion/ },
];

/** Every name read from `process.env` under a directory tree. */
function envNamesRead(root) {
  const names = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) continue;
      const text = readFileSync(full, "utf8");
      // Both spellings Next.js allows. The bracket form is what a strict
      // tsconfig's noPropertyAccessFromIndexSignature pushes code towards, so a
      // guard that only understood the dot form would go blind exactly where
      // this repository's own conventions lead.
      for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
      for (const m of text.matchAll(/process\.env\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g)) names.add(m[1]);
    }
  };
  try {
    if (statSync(root).isDirectory()) walk(root);
  } catch {
    /* reported by the caller */
  }
  return names;
}

/**
 * Names that are read expressions in source but are not variables anyone sets.
 *
 * ONE ENTRY, AND IT IS DOCUMENTED RATHER THAN PATTERN-MATCHED AWAY. `lib/env.ts`
 * explains Next.js inlining with a worked example - "Next.js inlines
 * `process.env.NEXT_PUBLIC_X` only for a literal member" - and that example is a
 * genuine `process.env.` expression inside a comment. Stripping comments before
 * scanning would hide it; excluding it here leaves it visible, with the reason
 * attached, and the self-test above FAILS if the example ever stops being found,
 * so this exclusion cannot quietly become dead code.
 */
const NOT_REAL_VARIABLES = new Set(["NEXT_PUBLIC_X"]);

function selfTest() {
  let ok = true;
  const fail = (m) => {
    console.error(`[infra-docs] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

  /*
   * THE CUTOVER ROWS ARE DRIVEN OVER THE REAL DOCUMENT, ONE ROW AT A TIME, AND
   * THE LOOP IS OVER `CUTOVER_REQUIRED` ITSELF.
   *
   * Two standards, and neither subsumes the other (LEDGER-09a Q3). Iterating
   * the rule's own data structure is what stops a probe set UNDER-COVERING the
   * rule: a row added tomorrow arrives with a fail side already attached rather
   * than waiting for somebody to remember one. Driving the REAL tree is what
   * stops a probe that passes against a synthetic fixture and would not against
   * reality - a hand-written positive example is chosen to pass, and this
   * project has shipped three guards whose self-test certified a hole.
   *
   * The mutation is a DATA mutation: delete the text the row matches, from the
   * real file, and require the row to fire. A row whose pattern matches
   * something that is not there to delete cannot pass this loop, and a row that
   * fires on the intact document cannot either.
   */
  if (existsSync(CUTOVER)) {
    const real = readFileSync(CUTOVER, "utf8");
    for (const { topic, re } of CUTOVER_REQUIRED) {
      const m = re.exec(real);
      if (m === null) {
        // NOT A SELF-TEST FAILURE, AND THE FIRST DRAFT MADE IT ONE. A row that
        // matches nothing means the DOCUMENT is missing that step, which is
        // precisely what the main check below reports - with the right message
        // and the right exit code. Failing here instead made the self-test win
        // the race and answer a missing checklist step with "this row has no
        // fail side", which is a true sentence about the wrong thing. Measured:
        // removing "Promote to Production" from the real document produced
        // rc=2 and a message about fail sides rather than rc=1 and a message
        // about a missing step.
        continue;
      }
      const without = real.slice(0, m.index) + real.slice(m.index + m[0].length);
      if (re.test(without)) {
        // Not a failure by itself - a document may legitimately state a thing
        // twice - but it means this row is not discriminating on the instance
        // that was removed, so the mutation must be a full sweep to mean
        // anything.
        const swept = real.split(m[0]).join("");
        if (re.test(swept)) {
          fail(`cutover row "${topic}" still matches ${CUTOVER} with every instance of its match removed`);
        }
      }
    }
  }

  // A6 patterns must match the real command shapes and not their prose.
  const shouldMatch = [
    ["backup", "docker compose exec -T postgres pg_dump -U zcashreveal --format=custom zcashreveal"],
    ["upgrade", "docker compose pull zebrad"],
    ["wipe and resync", "docker volume rm zecreveal_zebrad-data"],
    ["tunnel create", "cloudflared tunnel create zecreveal-gateway"],
    ["tunnel route", "cloudflared tunnel route dns zecreveal-gateway api.example.com"],
    ["first sync", "docker compose up -d zebrad"],
    // Backslash-escaped, as it really appears inside the runbook's shell string.
    ["fixture capture", '-d "{\\"jsonrpc\\":\\"2.0\\",\\"method\\":\\"getblock\\",\\"params\\":[\\"$HEIGHT\\",2]}"'],
    // And unescaped, which is how it would appear in a plain JSON example.
    ["fixture capture", '{"method":"getblock","params":["3430000",2]}'],
    // The three rows tightened after F-43-1. Each real invocation the runbook
    // actually carries, so that tightening the pattern cannot quietly stop
    // recognising the command it was tightened to require.
    ["migrations", "docker compose run --rm indexer node dist/migrate.js"],
    ["migrations", "pnpm --filter @zcashreveal/indexer migrate"],
    ["migrations", "docker compose exec -T indexer node dist/migrate.js"],
    ["snapshot age alert", '[ $((TIP - INDEXED)) -gt 20 ] && echo "ALERT: the indexer is behind the node"'],
    ["publisher input faults", 'docker compose logs publisher | grep "an input query failed"    # NOT expected'],
    ["publisher panel faults", 'docker compose logs publisher | grep "analysis panel refused"   # NOT expected'],
    ["node subversion recorded", `python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["subversion"])'`],
    ["node subversion recorded", "jq -r .result.subversion"],
    // FIVE TOPICS THAT HAD NEVER BEEN DRIVEN AT ALL, found by the completeness
    // loop below when it was added at gate round 6. Each line is the real
    // invocation the runbook carries, taken from the file rather than written
    // from memory - the HANDOFF-10 precedent, where a probe written from memory
    // illustrated a real finding with an example that did not satisfy it.
    ["provisioning", "curl -fsSL https://get.docker.com | sh"],
    ["restore", "pg_restore -U zcashreveal --dbname=zcashreveal --clean --if-exists \\"],
    ["tunnel run", "docker compose up -d cloudflared"],
    ["tunnel ingress to gateway:8080", "    service: http://gateway:8080"],
  ];
  for (const [topic, line] of shouldMatch) {
    const entry = A6_REQUIRED.find((e) => e.topic === topic);
    if (entry === undefined || !entry.re.test(line)) fail(`A6 "${topic}" did not match: ${line}`);
  }
  const shouldNotMatch = [
    // A heading and a sentence about backups, with no command in them. This is
    // the exact failure A6 exists to catch.
    ["backup", "## 5. Backups\n\nTake a backup before migrating; keep seven off the box."],
    ["tunnel create", "Create the tunnel in the Cloudflare dashboard."],
    ["upgrade", "Upgrading Zebra is safe within one major version."],
    ["fixture capture", "Capture a mainnet block with getblock at verbosity 2."],
    // F-43-1 AND THE TWO ROWS OF ITS SHAPE THE FINDING DID NOT NAME. Each of
    // these sentences closed its topic before the patterns above were
    // tightened, which means the runbook could have lost the command and
    // stayed green.
    //
    // L2 reported the migrations case with a worked example that does not
    // reproduce it - the backup fixture two entries above, "Take a backup
    // before migrating", does NOT contain "migrate" - so the sentence pinned
    // here is one that really did satisfy `/migrate/`. The finding was right
    // and its example was not; see HANDOFF-10 section 7.
    ["migrations", "You must migrate the database before starting the indexer."],
    ["snapshot age alert", "Alert when the published snapshot is more than 20 blocks behind the chain tip."],
    // PROSE NAMING THE CHANNEL IS NOT A COMMAND FOR READING IT, which is the
    // distinction every row in this table exists to draw.
    ["publisher input faults", "Every line this returns means an input query failed on that panel."],
    ["publisher panel faults", "The second channel fires when an analysis panel refused its inputs."],
    ["node subversion recorded", "| Height | Block hash | `subversion` observed | `vjoinsplit` present |"],
    // EIGHT TOPICS HAD NO NEGATIVE PROBE, so nothing showed their patterns
    // cannot be satisfied by a sentence - which is the exact defect three rows
    // in this list were tightened for. Each line below is prose a runbook could
    // plausibly carry ABOUT the topic, with no command in it.
    ["provisioning", "Provision the box with Docker installed from the official convenience script."],
    ["first sync", "Bring zebrad up first and let it sync before anything else starts."],
    ["wipe and resync", "To start over, remove the zebrad data volume and resync from genesis."],
    ["restore", "Restoring is the reverse of the backup step and takes about an hour."],
    ["tunnel route", "Route the DNS record for the gateway hostname through the tunnel."],
    ["tunnel run", "Run the tunnel alongside the gateway once the route exists."],
    [
      "tunnel ingress to gateway:8080",
      "The tunnel's ingress sends traffic to the gateway on port 8080 over http.",
    ],
  ];
  for (const [topic, line] of shouldNotMatch) {
    const entry = A6_REQUIRED.find((e) => e.topic === topic);
    if (entry !== undefined && entry.re.test(line)) fail(`A6 "${topic}" wrongly matched prose: ${line}`);
  }

  // ITERATE THE RULE'S OWN DATA, NOT THE PROBE LIST (LEDGER-09a Q3, enforced
  // here at gate round 6). The loop below iterates `shouldMatch` and looks each
  // entry UP in `A6_REQUIRED`, so a topic added to `A6_REQUIRED` with no probe
  // beside it was never driven at all - and the run still printed "detectors
  // self-tested in both directions". Measured: adding
  // `{ topic: "UNPROBED", re: /docker/ }` - a pattern any prose in this runbook
  // satisfies - printed OK over all 17 topics with the self-test silent. That is
  // a probe set UNDER-COVERING its rule, which is the failure the ledger rule
  // names, and this branch added two members to this very list one commit ago.
  for (const entry of A6_REQUIRED) {
    if (!shouldMatch.some(([topic]) => topic === entry.topic)) {
      fail(
        `A6 "${entry.topic}" has no shouldMatch probe, so its pattern has never been driven ` +
          "against a real command. Every topic needs one.",
      );
    }
    if (!shouldNotMatch.some(([topic]) => topic === entry.topic)) {
      fail(
        `A6 "${entry.topic}" has no shouldNotMatch probe, so nothing shows it cannot be ` +
          "satisfied by prose - the defect three rows in this list were tightened for.",
      );
    }
  }

  // A7's extractor: reads, not prose.
  const sample = [
    "/** `NEXT_PUBLIC_*` is compiled in. Next.js inlines `process.env.NEXT_PUBLIC_X` only for a literal member. */",
    'export const API = process.env.NEXT_PUBLIC_API_URL ?? "";',
    'const mode = process.env["NEXT_PUBLIC_DATA_MODE"];',
    'export const SNAPSHOT_URL: string = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "";',
  ].join("\n");
  const found = new Set();
  for (const m of sample.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) found.add(m[1]);
  for (const m of sample.matchAll(/process\.env\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g)) found.add(m[1]);
  for (const want of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_DATA_MODE", "NEXT_PUBLIC_SNAPSHOT_URL"]) {
    if (!found.has(want)) fail(`A7 extractor missed a real read: ${want}`);
  }
  // The constant's own name is not an env var.
  if (found.has("SNAPSHOT_URL")) fail("A7 extractor read an exported constant name as an env var");
  // The docblock example IS a `process.env.` occurrence, so it is found - and
  // that is correct behaviour rather than a miss: it is a real (if fictional)
  // read expression. It is excluded by name below, where the exclusion is
  // visible and justified rather than hidden in a regex.
  // AGAINST THE REAL FILE, not against the sample above. The first draft
  // asserted this on its own hardcoded string, which is true regardless of what
  // apps/web contains - so the day the docblock example is reworded, the
  // NOT_REAL_VARIABLES exclusion becomes dead code excluding nothing, and this
  // probe would have gone on passing. The first gate round called that
  // tautological and was right.
  const realReads = envNamesRead(WEB_ROOT);
  for (const excluded of NOT_REAL_VARIABLES) {
    if (!realReads.has(excluded)) {
      fail(
        `A7 excludes ${excluded} but nothing in ${WEB_ROOT} reads it any more, so the exclusion is dead code. ` +
          "Remove it from NOT_REAL_VARIABLES rather than leaving a rule that guards nothing.",
      );
    }
  }

  return ok;
}

if (!selfTest()) {
  console.error("[infra-docs] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}


const findings = [];

// --- A6 -------------------------------------------------------------------
if (!existsSync(RUNBOOK)) {
  findings.push(`${RUNBOOK} does not exist; HANDOFF-10 §3 commissions it.`);
} else {
  const text = readFileSync(RUNBOOK, "utf8");
  for (const { topic, re } of A6_REQUIRED) {
    if (!re.test(text)) {
      findings.push(`${RUNBOOK}  A6: no command for "${topic}" (looked for ${re}).`);
    }
  }
}

// --- A7 -------------------------------------------------------------------
if (!existsSync(DEPLOY)) {
  findings.push(`${DEPLOY} does not exist.`);
} else if (!existsSync(WEB_ROOT)) {
  findings.push(`${WEB_ROOT} does not exist, so A7 has nothing to cross-check.`);
} else {
  const deploy = readFileSync(DEPLOY, "utf8");
  const read = [...envNamesRead(WEB_ROOT)].filter((n) => DEPLOY_PREFIXES.test(n) && !NOT_REAL_VARIABLES.has(n)).sort();
  if (read.length === 0) {
    findings.push(`${WEB_ROOT}  A7: no NEXT_PUBLIC_/SNAPSHOT_ reads found at all; the extractor has gone blind.`);
  }
  for (const name of read) {
    if (!deploy.includes(name)) {
      findings.push(
        `${DEPLOY}  A7: does not name ${name}, which ${WEB_ROOT} reads from process.env. ` +
          "An operator setting up the project from this document would miss it.",
      );
    }
  }
}

// --- the cutover checklist (HANDOFF-11) -----------------------------------
if (!existsSync(CUTOVER)) {
  findings.push(`${CUTOVER} does not exist; HANDOFF-11 section 4.1 commissions it.`);
} else {
  const text = readFileSync(CUTOVER, "utf8");
  for (const { topic, re } of CUTOVER_REQUIRED) {
    if (!re.test(text)) {
      findings.push(`${CUTOVER}  no operator-executable step for "${topic}" (looked for ${re}).`);
    }
  }
}

if (findings.length > 0) {
  console.error(`[infra-docs] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

const documented = [...envNamesRead(WEB_ROOT)].filter((n) => DEPLOY_PREFIXES.test(n) && !NOT_REAL_VARIABLES.has(n)).length;
console.log(
  `[infra-docs] OK: ${RUNBOOK} carries a command for all ${A6_REQUIRED.length} topics A6 requires, ` +
    `${DEPLOY} names all ${documented} NEXT_PUBLIC_/SNAPSHOT_ variable(s) ${WEB_ROOT} reads from process.env, ` +
    `and ${CUTOVER} carries an operator-executable step for all ${CUTOVER_REQUIRED.length} topics ` +
    "(detectors self-tested in both directions; the cutover rows check that the executable half is PRESENT, " +
    "never that the order or the expected answers are right - those are read by a person).",
);
