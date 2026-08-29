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
const WEB_SRC = "apps/web/src";

/**
 * A6's checklist. Each entry is a topic and the pattern that proves the runbook
 * carries a COMMAND for it rather than a paragraph about it.
 *
 * The patterns look for the command, not the heading. A runbook with a section
 * called "Backups" and no `pg_dump` in it is the failure this assertion exists
 * to catch - a document that reads as complete and cannot be executed.
 */
const A6_REQUIRED = [
  { topic: "provisioning", re: /docker\s+compose\s+-f\s+docker-compose\.yml\s+config|get\.docker\.com/ },
  { topic: "first sync", re: /docker\s+compose\s+up\s+-d\s+zebrad/ },
  { topic: "wipe and resync", re: /docker\s+volume\s+rm\s+\S*zebrad-data/ },
  { topic: "backup", re: /pg_dump/ },
  { topic: "restore", re: /pg_restore/ },
  { topic: "migrations", re: /migrate/ },
  { topic: "upgrade", re: /docker\s+compose\s+pull\s+zebrad/ },
  { topic: "tunnel create", re: /cloudflared\s+tunnel\s+create\s+\S+/ },
  { topic: "tunnel route", re: /cloudflared\s+tunnel\s+route\s+dns\s+\S+/ },
  { topic: "tunnel run", re: /docker\s+compose\s+up\s+-d\s+cloudflared|cloudflared\s+tunnel\s+run/ },
  { topic: "tunnel ingress to gateway:8080", re: /service:\s*http:\/\/gateway:8080/ },
  { topic: "snapshot age alert", re: /-gt\s+20|20\s+blocks/ },
  // Escaped as `\"method\":\"getblock\"` inside a shell double-quoted string in
  // the runbook, so the pattern must tolerate the backslashes. The first draft
  // did not and the PASS side caught it, which is what the self-test pair below
  // now pins.
  { topic: "fixture capture", re: /method\\?":\s*\\?"getblock/ },
  { topic: "node subversion recorded", re: /subversion/ },
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
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
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

function selfTest() {
  let ok = true;
  const fail = (m) => {
    console.error(`[infra-docs] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

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
  ];
  for (const [topic, line] of shouldNotMatch) {
    const entry = A6_REQUIRED.find((e) => e.topic === topic);
    if (entry !== undefined && entry.re.test(line)) fail(`A6 "${topic}" wrongly matched prose: ${line}`);
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
  if (!found.has("NEXT_PUBLIC_X")) fail("A7 extractor stopped seeing the docblock example; the exclusion below is now silently dead");

  return ok;
}

if (!selfTest()) {
  console.error("[infra-docs] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
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
} else if (!existsSync(WEB_SRC)) {
  findings.push(`${WEB_SRC} does not exist, so A7 has nothing to cross-check.`);
} else {
  const deploy = readFileSync(DEPLOY, "utf8");
  const read = [...envNamesRead(WEB_SRC)].filter((n) => !NOT_REAL_VARIABLES.has(n)).sort();
  if (read.length === 0) {
    findings.push(`${WEB_SRC}  A7: no process.env reads found at all; the extractor has gone blind.`);
  }
  for (const name of read) {
    if (!deploy.includes(name)) {
      findings.push(
        `${DEPLOY}  A7: does not name ${name}, which ${WEB_SRC} reads from process.env. ` +
          "An operator setting up the project from this document would miss it.",
      );
    }
  }
}

if (findings.length > 0) {
  console.error(`[infra-docs] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

const documented = [...envNamesRead(WEB_SRC)].filter((n) => !NOT_REAL_VARIABLES.has(n)).length;
console.log(
  `[infra-docs] OK: ${RUNBOOK} carries a command for all ${A6_REQUIRED.length} topics A6 requires, ` +
    `and ${DEPLOY} names all ${documented} environment variable(s) apps/web reads from process.env ` +
    "(detectors self-tested in both directions).",
);
