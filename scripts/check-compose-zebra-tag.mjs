#!/usr/bin/env node
/**
 * The Zebra image tag pinned in compose clears the version floor this
 * repository declares.
 *
 * WHY THIS EXISTS. `packages/zebra-rpc/src/version-floor.ts` declares 6.3.0 and
 * A11 checks the node the RUNNING STACK talks to - at runtime, against a live
 * subversion. Nothing checked the tag compose will actually pull. HANDOFF-11
 * noticed the gap and could only state it: "the compose pin `zfnd/zebra:6.3.0`
 * clears the 6.3.0 floor with ZERO headroom, and nothing in `pnpm check` would
 * catch a tag moved one patch down". Zero headroom is the whole problem - the
 * pin is exactly the floor, so any downward edit breaks it, and the failure
 * would appear as a node that answers fine and returns pre-NU6 funding-stream
 * strings from `getblocksubsidy`.
 *
 * THE FLOOR IS READ, NEVER RESTATED. It is parsed out of `version-floor.ts`,
 * because a guard that writes the pattern a second time inside itself is this
 * project's own measured defect: HANDOFF-10's gate round 3 found the zebrad
 * guard asserting against patterns written out again in its own self-test, so
 * breaking the real check left every probe green. One source, two readers.
 *
 * THE EXTRACTION IS THE HARD HALF AND IT IS NOT `parseZebraVersion`.
 * `parseZebraVersion("zfnd/zebra:6.3.0")` returns `null` BY DESIGN - it reads a
 * node's `subversion` (`/Zebra:6.3.0/`) or a bare `6.3.0`, not an image ref. So
 * the tag is extracted FIRST and only then compared (LEDGER-11 Q3):
 *
 *   1. reject any ref containing `@` - a digest pin carries no readable version
 *   2. take the substring after the last `:` that FOLLOWS the last `/` - a
 *      registry host may carry a port, as in `registry.local:5000/zfnd/zebra`,
 *      and the colon in that host is not a tag separator
 *   3. require `^\s*v?(\d+)\.(\d+)\.(\d+)$` ANCHORED AT BOTH ENDS
 *
 * AND A MEASURED FACT ABOUT STEPS 1 AND 2 THAT A GREEN RUN MUST NOT BE READ AS
 * EVIDENCE FOR. Both were driven by mutation and NEITHER CHANGES ANY VERDICT.
 * Delete the `@` rejection and a digest ref still extracts a hex string that
 * fails step 3; delete the `lastColon < lastSlash` clause and a tagless
 * `registry.local:5000/zfnd/zebra` still extracts `5000/zfnd/zebra`, which also
 * fails step 3. Step 3's anchoring subsumes both. They are kept because each
 * produces the CORRECT DIAGNOSTIC rather than a generic one, and because a
 * later loosening of step 3 would make them load-bearing - but they are tested
 * BY MESSAGE below, not by outcome, because testing them by outcome is a probe
 * that cannot fail. Reported rather than quietly dropped, per the rule that a
 * fail-side probe which does not fail is itself a finding.
 *
 * THREE OUTCOMES, AND UNPARSED FAILS. Clears the floor, below the floor, and
 * could not be read. `:latest` must not pass: an unreadable tag is not a
 * satisfied floor, it is an unknown one, and treating unknown as satisfied is
 * how a floor stops being a floor. That is the same three-outcome discipline
 * `check-capture-consistency.mjs` uses, with the third arm decided the other
 * way round - there, "not checked" is honest because a missing predecessor
 * proves nothing; here, an unreadable pin IS the finding.
 *
 * Usage:  node scripts/check-compose-zebra-tag.mjs [file ...]
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_FILES = ["docker-compose.yml", "docker-compose.dev.yml"];
const FLOOR_SOURCE = "packages/zebra-rpc/src/version-floor.ts";
const SEMVER_TAG = /^\s*v?(\d+)\.(\d+)\.(\d+)\s*$/;
const IMAGE_LINE = /^\s*image:\s*["']?([^"'#\s]+)["']?/;

/** The floor, READ out of the TypeScript that declares it. */
function readFloor(path = FLOOR_SOURCE) {
  if (!existsSync(path)) return { ok: false, reason: `${path} does not exist` };
  const m = /ZEBRA_MIN_VERSION_STRING\s*=\s*"(\d+)\.(\d+)\.(\d+)"/.exec(readFileSync(path, "utf8"));
  if (m === null) return { ok: false, reason: `${path} declares no ZEBRA_MIN_VERSION_STRING` };
  return { ok: true, version: { major: +m[1], minor: +m[2], patch: +m[3] } };
}

const show = (v) => `${v.major}.${v.minor}.${v.patch}`;
const cmp = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch;

/** Step 1-3 above. Returns a version, or the reason it could not be read. */
export function extractTagVersion(ref) {
  if (ref.includes("@")) return { kind: "UNPARSED", reason: "the ref is digest-pinned, so it carries no readable version" };
  const lastSlash = ref.lastIndexOf("/");
  const lastColon = ref.lastIndexOf(":");
  if (lastColon === -1 || lastColon < lastSlash) return { kind: "UNPARSED", reason: "the ref carries no tag, so it resolves to :latest" };
  const tag = ref.slice(lastColon + 1);
  const m = SEMVER_TAG.exec(tag);
  if (m === null) return { kind: "UNPARSED", tag, reason: `the tag "${tag}" is not a bare MAJOR.MINOR.PATCH` };
  return { kind: "PARSED", tag, version: { major: +m[1], minor: +m[2], patch: +m[3] } };
}

/** Is this image ref a Zebra node image? */
const isZebraRef = (ref) => /(^|\/)zebra(d)?(:|$)/.test(ref.split("@")[0]);

/** Every zebra `image:` line in one compose file. */
function zebraRefsIn(path) {
  const refs = [];
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = IMAGE_LINE.exec(lines[i]);
    if (m !== null && isZebraRef(m[1])) refs.push({ ref: m[1], line: i + 1 });
  }
  return refs;
}

/** THE RULE. One ref, one floor, three outcomes. */
export function checkRef(ref, floor) {
  const got = extractTagVersion(ref);
  if (got.kind === "UNPARSED") {
    return { ok: false, outcome: "UNPARSED", message: `${ref} - ${got.reason}. An unreadable pin is an UNKNOWN floor, not a satisfied one.` };
  }
  if (cmp(got.version, floor) < 0) {
    return { ok: false, outcome: "BELOW-FLOOR", message: `${ref} pins ${show(got.version)}, BELOW the ${show(floor)} floor version-floor.ts declares.` };
  }
  return { ok: true, outcome: "CLEARS", version: got.version, headroom: cmp(got.version, floor) === 0 ? "none" : "some" };
}

/* -------------------------------------------------------------------------- */

/**
 * EVERY OUTCOME THE RULE CAN PRODUCE, AS DATA. The self-test iterates THIS
 * table, so a new outcome cannot arrive untested, and `OUTCOMES` below checks
 * the table reaches all three.
 *
 * The refs are the seven reference shapes L2 verified against, plus the two
 * fail-side pins fold 3 names. Every row is a DATA mutation - a ref drawn from
 * the set the rule claims to exclude - never a change to the code.
 */
const REFERENCE_REFS = [
  { ref: "zfnd/zebra:6.3.0", expect: "CLEARS" },
  { ref: "zfnd/zebra:v6.3.0", expect: "CLEARS" },
  { ref: "zfnd/zebra:6.4.1", expect: "CLEARS" },
  { ref: "zfnd/zebra:7.0.0", expect: "CLEARS" },
  { ref: "registry.local:5000/zfnd/zebra:6.3.0", expect: "CLEARS" },
  { ref: "zfnd/zebra:6.2.9", expect: "BELOW-FLOOR" },
  { ref: "zfnd/zebra:6.2.1", expect: "BELOW-FLOOR" },
  { ref: "zfnd/zebra:5.9.9", expect: "BELOW-FLOOR" },
  { ref: "zfnd/zebra:latest", expect: "UNPARSED" },
  { ref: "zfnd/zebra", expect: "UNPARSED" },
  { ref: "zfnd/zebra:6.3", expect: "UNPARSED" },
  { ref: "zfnd/zebra:6.3.0-rc1", expect: "UNPARSED" },
  { ref: "zfnd/zebra:6.3.0 ", expect: "CLEARS" },
  { ref: "zfnd/zebra@sha256:" + "a".repeat(64), expect: "UNPARSED" },
  { ref: "registry.local:5000/zfnd/zebra", expect: "UNPARSED" },
];
const OUTCOMES = ["CLEARS", "BELOW-FLOOR", "UNPARSED"];

/**
 * The three distinct ways a ref can be UNREADABLE, as data. Outcome coverage is
 * not enough on its own: three rows all reach UNPARSED by DIFFERENT branches,
 * and a table that happened to drop every not-semver row would still satisfy
 * "some row reaches UNPARSED". Each reason is required to be exercised, and the
 * two that cannot be told apart by outcome are told apart by their message.
 */
const UNPARSED_REASONS = [
  { reason: "digest-pinned", marker: "digest-pinned", probe: "zfnd/zebra@sha256:" + "a".repeat(64) },
  { reason: "no tag", marker: "carries no tag", probe: "registry.local:5000/zfnd/zebra" },
  { reason: "not semver", marker: "is not a bare MAJOR.MINOR.PATCH", probe: "zfnd/zebra:latest" },
];

function selfTest() {
  const floor = readFloor();
  if (!floor.ok) return `the floor could not be read: ${floor.reason}`;
  if (show(floor.version) !== "6.3.0") {
    // Not a failure - the floor is allowed to move - but the table's expectations
    // are written against 6.3.0, so say so rather than silently mis-testing.
    return `version-floor.ts now declares ${show(floor.version)}; REFERENCE_REFS is written against 6.3.0 and must be re-expected`;
  }
  for (const { ref, expect } of REFERENCE_REFS) {
    const got = checkRef(ref, floor.version);
    if (got.outcome !== expect) return `"${ref}" gave ${got.outcome}, expected ${expect}`;
  }
  for (const outcome of OUTCOMES) {
    if (!REFERENCE_REFS.some((r) => r.expect === outcome)) return `no REFERENCE_REFS row exercises the ${outcome} outcome`;
  }

  // THE COMPARATOR'S PATCH TERM IS UNREACHABLE AGAINST THE REAL FLOOR. The floor
  // is 6.3.0, whose patch is 0, so no version is below it by patch alone and no
  // image ref can drive that term - measured: deleting `a.patch - b.patch` left
  // every row above green. So the comparator is driven against a SYNTHETIC floor
  // here, which is the only way this term gets a fail side at all. A term that
  // cannot be reached is a term nobody is testing, floor value notwithstanding,
  // and the floor is allowed to move to a non-zero patch.
  const patchFloor = { major: 6, minor: 3, patch: 1 };
  const patchProbe = checkRef("zfnd/zebra:6.3.0", patchFloor);
  if (patchProbe.outcome !== "BELOW-FLOOR") {
    return `against a synthetic 6.3.1 floor, "zfnd/zebra:6.3.0" gave ${patchProbe.outcome}, expected BELOW-FLOOR - ` +
      `the comparator ignores the patch component`;
  }
  if (checkRef("zfnd/zebra:6.3.1", patchFloor).outcome !== "CLEARS") {
    return `against a synthetic 6.3.1 floor, "zfnd/zebra:6.3.1" did not CLEAR - the comparator rejects an equal version`;
  }

  // EACH UNREADABLE BRANCH, BY ITS MESSAGE. This is where the digest arm and the
  // registry-port arm are actually tested: both reach UNPARSED whether or not
  // their clause exists, so only the message distinguishes a working clause from
  // a dead one.
  for (const { reason, marker, probe } of UNPARSED_REASONS) {
    const got = checkRef(probe, floor.version);
    if (got.outcome !== "UNPARSED") return `the "${reason}" probe "${probe}" gave ${got.outcome}, expected UNPARSED`;
    if (!got.message.includes(marker)) {
      return `the "${reason}" branch produced the wrong diagnostic for "${probe}": expected a message containing ` +
        `"${marker}", got "${got.message}". The clause that produces it is dead even though the verdict is right.`;
    }
    if (!REFERENCE_REFS.some((r) => r.ref === probe)) return `"${probe}" exercises the "${reason}" branch but is not in REFERENCE_REFS`;
  }

  // THE FILE-SCANNING HALF NEEDS ITS OWN FAIL SIDE. Every row above drives
  // `checkRef` directly, which says nothing about whether `zebraRefsIn` finds
  // the line in a real file - the arm most likely to be silently inert, because
  // a scanner that matches nothing produces the same silence as a clean tree.
  // Fold 3's two fixture compose files, written and scanned end to end.
  const dir = mkdtempSync(join(tmpdir(), "zebra-tag-"));
  const fixtures = [
    { name: "below-floor.yml", pin: "zfnd/zebra:6.2.9", expect: "BELOW-FLOOR" },
    { name: "latest.yml", pin: "zfnd/zebra:latest", expect: "UNPARSED" },
    { name: "clears.yml", pin: "zfnd/zebra:6.3.0", expect: "CLEARS" },
  ];
  for (const f of fixtures) {
    const path = join(dir, f.name);
    writeFileSync(path, `services:\n  zebrad:\n    image: ${f.pin}\n    restart: unless-stopped\n  postgres:\n    image: postgres:16-alpine\n`);
    const refs = zebraRefsIn(path);
    if (refs.length !== 1) return `the scanner found ${refs.length} zebra image line(s) in ${f.name}, expected 1`;
    if (refs[0].ref !== f.pin) return `the scanner read "${refs[0].ref}" from ${f.name}, expected "${f.pin}"`;
    const got = checkRef(refs[0].ref, floor.version);
    if (got.outcome !== f.expect) return `${f.name} gave ${got.outcome}, expected ${f.expect}`;
  }

  // And the scanner must NOT claim postgres/redis as a Zebra image.
  const decoy = join(dir, "no-zebra.yml");
  writeFileSync(decoy, "services:\n  postgres:\n    image: postgres:16-alpine\n  redis:\n    image: redis:7-alpine\n  gateway:\n    image: zecreveal/gateway:local\n");
  if (zebraRefsIn(decoy).length !== 0) return "the scanner claimed a non-Zebra image as a Zebra one";
  return null;
}

const failure = selfTest();
if (failure !== null) {
  console.error(`[compose-zebra-tag] SELF-TEST FAILED: ${failure}`);
  process.exit(1);
}

const floor = readFloor();
if (!floor.ok) {
  console.error(`[compose-zebra-tag] FAIL: ${floor.reason}`);
  process.exit(1);
}

const files = (process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_FILES).filter((f) => existsSync(f));
let failed = false;
let checked = 0;
const perFile = [];
for (const file of files) {
  const refs = zebraRefsIn(file);
  // A compose file with no Zebra image is not a failure - docker-compose.dev.yml
  // has none by design - but it IS reported, so "no findings" can never be the
  // silence of a scanner that matched nothing.
  perFile.push(`${file}: ${refs.length} zebra image line(s)`);
  for (const { ref, line } of refs) {
    checked++;
    const verdict = checkRef(ref, floor.version);
    if (!verdict.ok) {
      console.error(`[compose-zebra-tag] FAIL ${file}:${line} ${verdict.message}`);
      failed = true;
    } else if (verdict.headroom === "none") {
      console.log(`[compose-zebra-tag] ${file}:${line} ${ref} clears the ${show(floor.version)} floor with NO headroom - any downward edit breaks it.`);
    }
  }
}

for (const line of perFile) console.log(`[compose-zebra-tag] scanned ${line}`);
if (failed) {
  console.error(`[compose-zebra-tag] rc=1 over ${checked} zebra image reference(s).`);
  process.exit(1);
}
if (checked === 0) {
  console.error(
    `[compose-zebra-tag] FAIL: no Zebra image reference was found in ${files.length} compose file(s). ` +
      `This repository runs a Zebra node; a tree with none is a scanner that stopped matching, not a clean tree.`,
  );
  process.exit(1);
}
console.log(
  `[compose-zebra-tag] OK: ${checked} Zebra image reference(s) across ${files.length} compose file(s) clear the ` +
    `${show(floor.version)} floor read from ${FLOOR_SOURCE} (tag extracted before comparison; digest pins, tagless refs ` +
    `and non-semver tags such as :latest all FAIL as UNPARSED). Self-test drove ${REFERENCE_REFS.length} reference refs ` +
    `across all ${OUTCOMES.length} outcomes and all ${UNPARSED_REASONS.length} unreadable branches (two of which are ` +
    `checked by message, because their clause cannot change a verdict), plus 3 fixture compose files end to end.`,
);
