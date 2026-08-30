#!/usr/bin/env node
/**
 * Guards the shared-store rules in docs/2.0/SNAPSHOT.md section 4.
 *
 * WHY THIS EXISTS AND WHY IT IS DIFFERENT FROM EVERY OTHER CHECK IN THIS REPOSITORY.
 * The Vercel-managed Redis holds ZECReveal's snapshots AND the live data of an
 * unrelated production project. The operator accepted that trade deliberately.
 * The consequence is that a mistake against that store is not a wrong figure on a
 * page - it is an outage, or a disclosure, for a project that never agreed to run
 * alongside us. So the commands below are not "discouraged": there is no
 * circumstance in this project where any of them is correct against that store,
 * and the only way to be sure a later session does not rediscover that by breaking
 * it is to make them unlandable.
 *
 * WHAT IT ACTUALLY CHECKS. A text scan. That catches the commands being WRITTEN
 * DOWN, which is the way they would really arrive - typed into a runbook step, a
 * migration script, a "just clear the bad snapshot" one-liner. It cannot catch a
 * command assembled at runtime from parts. Section 7 of SNAPSHOT.md states the
 * gaps rather than leaving them to be discovered.
 *
 * FOUR THINGS THE FIRST VERSION OF THIS FILE GOT WRONG, kept here because each is
 * a class of hole and not a typo:
 *
 *   1. UNLINK. Rule 4 forbids deleting by pattern, and UNLINK is DEL by another
 *      name - a one-word substitution defeated the whole rule.
 *   2. THE redis-cli FLAGS. `--scan`, `--bigkeys`, `--hotkeys`, `--memkeys` and
 *      `--rdb` enumerate or dump the entire keyspace without ever spelling KEYS or
 *      SCAN, and they are precisely the forms a runbook uses.
 *   3. READING THE OTHER TENANT. Every rule was scoped to keys, so MONITOR,
 *      RANDOMKEY, DBSIZE and INFO keyspace - which expose the other project's
 *      traffic and cardinality without naming a key - fell outside all of them.
 *      Sharing a database is a confidentiality problem in both directions.
 *   4. A SELF-TEST FIXTURE THAT PASSED FOR THE WRONG REASON. The SCRIPT FLUSH
 *      probe was `await client.script('FLUSH');  // SCRIPT FLUSH` and it matched
 *      the COMMENT, not the call. The fixture certified coverage the detector did
 *      not have, which is the exact failure this file's self-test exists to make
 *      impossible. Fixtures carry no explanatory comments now.
 *
 * FALSE POSITIVES ARE A SAFETY PROBLEM TOO. A guard that flags `Object.keys(` or
 * fails CI on a document for saying the rule out loud is a guard someone switches
 * off, and a switched-off guard protects nothing. Two decisions come from that:
 *   - `.keys(` fires only with a NON-EMPTY argument list. Redis KEYS takes a
 *     pattern; `Map.prototype.keys()` and `Headers.prototype.keys()` take none. So
 *     the receiver list can be wide without flagging every iteration in the tree.
 *   - The quoted-command rule matches real string quotes followed by a comma or a
 *     closing paren - an argument being passed - and never a markdown backtick, so
 *     prose that names a command in order to forbid it is not a CI failure.
 *
 * Run: node scripts/check-redis-safety.mjs   (or `pnpm check`, with the others)
 * Exit: 0 clean - 1 findings - 2 the detector itself is broken
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A DENYLIST, NOT AN ALLOWLIST.
 *
 * The first version listed the extensions to scan, which exempted by default every
 * file kind the repository did not yet have - and the next two handoffs add
 * Dockerfiles, compose overrides and shell fragments. Scanning everything except
 * what cannot carry a command is the only default that does not need updating each
 * time someone adds a file type.
 */
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".zip", ".gz", ".tgz", ".br", ".wasm", ".map",
  ".mp4", ".webm", ".mov",
]);

/** Lockfiles: machine-generated, enormous, and incapable of carrying a runbook step. */
const SKIP_FILE = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);

/**
 * Vendor and build output only.
 *
 * `legacy/`, `docs/2.0/research/` and the mockup directories are NOT skipped any
 * more. The operator's rule has no exceptions, and skipping a directory by bare
 * name would also have exempted any future path that happened to share the name.
 * Scanning them costs milliseconds.
 */
const SKIP_DIR = new Set(["node_modules", ".git", ".turbo", "dist", ".next", "build", "coverage", "playwright-report", "test-results"]);

/**
 * Files permitted to NAME the forbidden commands, because naming them is how they
 * are forbidden.
 *
 * Deliberately does NOT include DEPLOY-2.0.md, any runbook, the rest of docs/2.0,
 * or .github/workflows/ci.yml - those are where a suggested command would actually
 * land, and they are the reason the tiering exists at all.
 *
 * `handoffs/prompts/` is a PREFIX rather than a list of files: the revolution
 * protocol mandates a new PROMPT-NN.md every revolution carrying the operator's
 * message verbatim, so enumerating them one at a time would fail CI on a step the
 * protocol requires.
 */
const NAMING_ALLOWED = new Set([
  ".env.example",
  "apps/web/.env.example",
  "docs/2.0/SNAPSHOT.md",
  "CLAUDE.md",
  "handoffs/LEDGER.md",
  "handoffs/LOG.md",
  "handoffs/HANDOFF-09-instruments-snapshot.md",
  "handoffs/HANDOFF-10-infra.md",
  "handoffs/HANDOFF-11-live-wiring.md",
]);
const NAMING_ALLOWED_PREFIX = ["handoffs/prompts/"];

/** The guard may obviously name what it detects. */
const SELF = "scripts/check-redis-safety.mjs";

/* ------------------------------------------------------------------ detectors */

/** Receivers that plausibly hold a Redis client. Wide on purpose - see the header. */
const RECV = "\\w*(?:redis|client|kv|store|conn|cache|pub|sub)\\w*";

/**
 * Whole-database destruction. These words do not occur in ordinary English, so a
 * bare word match needs no cleverness.
 */
const DESTRUCTIVE = [
  { re: /\bflushdb\b/i, name: "FLUSHDB" },
  { re: /\bflushall\b/i, name: "FLUSHALL" },
  { re: /\bswapdb\b/i, name: "SWAPDB" },
  { re: /\bscript\s+flush\b/i, name: "SCRIPT FLUSH" },
  { re: /\bscriptflush\b/i, name: "SCRIPT FLUSH" },
  // The call shape, which the first version's fixture only appeared to cover.
  { re: new RegExp(`\\b${RECV}\\s*\\.\\s*script\\s*\\(\\s*["']\\s*flush`, "i"), name: "SCRIPT FLUSH" },
];

/**
 * A command name passed as a string argument: "KEYS", 'keys', and the
 * `sendCommand(['keys','*'])` / `call('keys', ...)` forms. Case-insensitive,
 * because the lowercase spellings are the ordinary ones for those APIs.
 *
 * Requires a following comma or closing paren, so a markdown backtick around the
 * word - the way every document here names it in order to forbid it - is not a hit.
 */
const KEYS_QUOTED = /["']\s*keys\s*["']\s*[,)\]]/i;

/** `redis.keys(pattern)`. The non-empty argument list is what excludes `map.keys()`. */
const KEYS_METHOD = new RegExp(`\\b${RECV}\\s*\\.\\s*keys\\s*\\(\\s*[^)\\s]`, "i");

/** `redis-cli ... KEYS <pattern>`, or a bare `KEYS *` as a session transcript spells it. */
const KEYS_SHELL = /\bredis-cli\b[^\n]*\bKEYS\b|^\s*KEYS\s+["']?\*/;

/**
 * Enumeration by redis-cli FLAG, which never spells KEYS or SCAN.
 *
 * `--scan` is allowed only when the same line bounds it with a `zecreveal:`
 * pattern. `--bigkeys`, `--hotkeys`, `--memkeys` and `--rdb` sample or dump the
 * WHOLE keyspace and cannot be bounded, so they are never allowed.
 */
const CLI_SCAN = /\bredis-cli\b[^\n]*--scan\b/i;
const CLI_DUMP = /\bredis-cli\b[^\n]*--(bigkeys|hotkeys|memkeys|rdb)\b/i;

/** `SCAN` on a Redis-ish receiver, or the quoted command. */
const SCAN_CALL = new RegExp(`(?:["']\\s*scan\\s*["']\\s*[,)\\]]|\\b${RECV}\\s*\\.\\s*scan\\s*\\()`, "i");

/**
 * Deletion. `UNLINK` is `DEL` by another name and defeated rule 4 outright until
 * it was added here.
 *
 * Two shapes: a glob inside the call, and a call whose first argument is not a
 * `zecreveal:` string literal - which covers the two-statement form where the
 * pattern arrives in a variable.
 */
const DEL_GLOB = new RegExp(`\\b${RECV}\\s*\\.\\s*(?:del|unlink)\\s*\\([^)]*\\*`, "i");
const DEL_NONLITERAL = new RegExp(`\\b${RECV}\\s*\\.\\s*(?:del|unlink)\\s*\\(\\s*(?!["'\`]zecreveal:)[^)\\s"'\`]`, "i");
const DEL_SHELL = /\bredis-cli\b[^\n]*\b(DEL|UNLINK)\b[^\n]*\*|\bredis-cli\b[^\n]*\*[^\n]*\b(DEL|UNLINK)\b/i;

/**
 * Rule 7 - commands whose RESULT is not scoped to a key of ours.
 *
 * These take no key at all, so every key-scoped rule missed them, and each one
 * reports on the other tenant: MONITOR streams their live command traffic,
 * RANDOMKEY hands back one of their keys, DBSIZE and INFO keyspace count them.
 */
const CROSS_TENANT = [
  { re: new RegExp(`\\bmonitor\\b(?=[^\\n]*redis)|\\b${RECV}\\s*\\.\\s*monitor\\s*\\(|\\bredis-cli\\b[^\\n]*\\bmonitor\\b`, "i"), name: "MONITOR streams the other tenant's commands" },
  { re: new RegExp(`\\brandomkey\\b`, "i"), name: "RANDOMKEY returns the other tenant's keys" },
  { re: new RegExp(`\\bdbsize\\b`, "i"), name: "DBSIZE counts the other tenant's keys" },
  { re: /\binfo\s+keyspace\b/i, name: "INFO keyspace reports the other tenant's keyspace" },
];

/**
 * THE ONE FILE-SCOPED FACT THIS GUARD USES, and the reason it is not the thing
 * L2 forbade.
 *
 * LEDGER-10 Q2 ruled that this guard must NOT be taught to infer which of the
 * two Redis servers a `redis-cli` line will reach. That ruling stands and this
 * does not violate it, because nothing here is inferred. A file matching
 * `PROVES_VPS_TARGET` contains a CALL to `assertNotManagedStore` with an array
 * of candidates - the same function `apps/indexer/src/config.ts` and
 * `apps/gateway/src/config.ts` call at boot, which throws if the URL it is
 * handed is the managed store by hostname OR by an exact value match against
 * any `SNAPSHOT_REDIS_*` variable in the environment. The file proves its own
 * target at runtime; the guard reads the proof rather than guessing.
 *
 * What it unlocks is narrow and both halves are required: a `SCAN` line, in such
 * a file, ALSO bounded by the VPS prefix. Neither half alone is enough, an
 * unbounded scan is still a finding there, and every other rule - KEYS, the
 * enumeration flags, the destructive commands, the cross-tenant readers - is
 * untouched in every file including this one.
 *
 * WHY THE `.md` EXCLUSION. A document can quote the call; a document cannot
 * execute it. A runbook that pastes `assertNotManagedStore([...])` beside a
 * `redis-cli --scan` line would otherwise buy the exemption with a sentence,
 * which is the copy-paste surface this whole rule exists to protect.
 *
 * WHAT IT DOES NOT COVER, stated here rather than discovered later: the proof is
 * per FILE, not per CLIENT. A file that calls `assertNotManagedStore` on one URL
 * and then scans a DIFFERENT client bought the exemption for both. Nothing in
 * this repository does that, and a review that sees it should treat it as a
 * finding on its own - the same bound `docs/2.0/SNAPSHOT.md` section 7 records
 * for a command assembled at runtime.
 */
const PROVES_VPS_TARGET = /\bassertNotManagedStore\s*\(\s*\[/;

/** The VPS namespace, spelled as a literal or imported under its constant name. */
const VPS_BOUNDED = /\bVPS_KEY_PREFIX\b|zcashreveal:/;

/**
 * Inspect one line. Returns the rule that fired, or null.
 *
 * `ctx.provesVpsTarget` defaults to FALSE, so every file that does not carry the
 * proof is inspected exactly as it was before this parameter existed.
 */
function inspect(line, ctx = { provesVpsTarget: false }) {
  for (const { re, name } of DESTRUCTIVE) {
    if (re.test(line)) return `${name} is forbidden against the shared store (rule 2)`;
  }
  if (KEYS_QUOTED.test(line) || KEYS_METHOD.test(line) || KEYS_SHELL.test(line)) {
    return "KEYS is forbidden outright - it enumerates the other tenant's keyspace (rule 3)";
  }
  if (CLI_DUMP.test(line)) {
    return "redis-cli --bigkeys/--hotkeys/--memkeys/--rdb samples or dumps the WHOLE keyspace (rules 3, 7)";
  }
  if (CLI_SCAN.test(line) && !/zecreveal:/.test(line)) {
    return "redis-cli --scan is permitted only bounded by --pattern 'zecreveal:*' (rule 3)";
  }
  if (SCAN_CALL.test(line) && !/zecreveal:/.test(line)) {
    if (ctx.provesVpsTarget && VPS_BOUNDED.test(line)) {
      // A scan bounded to the VPS namespace, in a file that refuses to start
      // against the managed store. See PROVES_VPS_TARGET above.
    } else {
      return "SCAN is permitted only with MATCH zecreveal:*, or bounded by VPS_KEY_PREFIX in a file that calls assertNotManagedStore (rule 3)";
    }
  }
  if (DEL_GLOB.test(line) || DEL_NONLITERAL.test(line) || DEL_SHELL.test(line)) {
    return "no DEL or UNLINK except on an exact zecreveal: key this project wrote (rule 4)";
  }
  for (const { re, name } of CROSS_TENANT) {
    if (re.test(line)) return `${name} (rule 7)`;
  }
  return null;
}

/* ------------------------------------------------------------------ self-test */

/**
 * Both polarities, pinned, and NO EXPLANATORY COMMENTS INSIDE THE FIXTURES.
 *
 * The first version's SCRIPT FLUSH probe carried a trailing `// SCRIPT FLUSH` and
 * passed by matching that comment rather than the call it was meant to prove. A
 * fixture that can pass for a reason other than the one it claims certifies
 * nothing, which is the precise failure this self-test exists to prevent.
 */
const MUST_CATCH = [
  ["await redis.flushdb();", "FLUSHDB"],
  ["redis-cli -u $SNAPSHOT_REDIS_KV_URL FLUSHALL", "FLUSHALL"],
  ["  SWAPDB 0 1", "SWAPDB"],
  ["await client.script('FLUSH');", "SCRIPT FLUSH call shape"],
  ['const all = await redis.keys("zecreveal:*");', "KEYS method"],
  ["redis-cli KEYS '*'", "KEYS shell"],
  ['await client.send("KEYS", "*");', "KEYS quoted"],
  ["await conn.sendCommand(['keys', '*']);", "keys lowercase quoted"],
  ["redis.call('keys', KEYS[1])", "Lua keys"],
  ["for await (const k of redisClient.scan(0)) {", "SCAN method"],
  // The VPS-bounded scan is STILL a finding in a file that does not carry the
  // proof - which is every file except the one tool that does. Without this
  // entry the exemption would be untested in the direction that matters.
  ['await client.scan(cursor, "MATCH", `${VPS_KEY_PREFIX}*`);', "VPS-bounded SCAN with no proof in the file"],
  ['await redisClient.scan(cursor, "MATCH", "zcashreveal:*");', "VPS-prefix SCAN with no proof in the file"],
  ['await kvStore.del("zecreveal:snapshot:*");', "DEL glob"],
  ["await cache.unlink(pattern);", "UNLINK non-literal"],
  ["redis-cli --scan --pattern '*'", "cli --scan unbounded"],
  ["redis-cli --bigkeys", "cli --bigkeys"],
  ["redis-cli --rdb /tmp/dump.rdb", "cli --rdb"],
  ["redis-cli MONITOR", "MONITOR"],
  ["await client.randomkey();", "RANDOMKEY"],
  ["const n = await redis.dbsize();", "DBSIZE"],
  ["redis-cli INFO keyspace", "INFO keyspace"],
  // A document that names a destructive command IS a hit. That is deliberate and
  // is the whole reason the rule's own documents are allowlisted by path: prose is
  // where a runbook step lives, and a runbook step is what rule 2 forbids.
  ["Run FLUSHDB to clear a stale snapshot.", "destructive command named in prose"],
];

/**
 * Every entry here is a line that appears in this repository or in any normal
 * TypeScript project. Flagging one would make the check noise, and noise gets
 * switched off - which is the same outcome as having no check.
 */
const MUST_IGNORE = [
  "const names = Object.keys(config);",
  "for (const k of map.keys()) {",
  "const it = store.keys();",
  "const h = new Headers(); h.keys();",
  "Holds only zecreveal:snapshot:* keys, written by the publisher.",
  "3. `KEYS` is forbidden outright. `SCAN` is permitted only with `MATCH zecreveal:*`.",
  "types/transaction.rs:268-429 scanned in full",
  "await redis.scan(0, 'MATCH', 'zecreveal:*');",
  'await redis.del("zecreveal:snapshot:3456227");',
  "expect(Object.keys(body.summary)).toContain('bytes');",
  "redis-cli --scan --pattern 'zecreveal:*'",
  "const monitor = new PerformanceObserver(cb);",
  "// the estimator monitors the drain rate over a window",
];

/**
 * The exemption, in both directions, with the proof supplied explicitly.
 *
 * MUST_CATCH above already pins that these same two lines FAIL without the
 * proof. A one-directional fixture would let the exemption widen to everything
 * and still report green, which is the shape round 4 of HANDOFF-08 found twice
 * in the guards it had just written.
 */
const PROVEN = { provesVpsTarget: true };
const MUST_ALLOW_WITH_PROOF = [
  ['await client.scan(cursor, "MATCH", `${VPS_KEY_PREFIX}*`, "COUNT", 200);', "VPS-bounded SCAN in a proving file"],
  ['await redisClient.scan(cursor, "MATCH", "zcashreveal:*");', "VPS-prefix SCAN in a proving file"],
];
const MUST_STILL_CATCH_WITH_PROOF = [
  ["for await (const k of redisClient.scan(0)) {", "unbounded SCAN, even in a proving file"],
  ['const all = await redis.keys("zcashreveal:*");', "KEYS, which the proof never unlocks"],
  ["redis-cli --scan --pattern 'zcashreveal:*'", "cli --scan, which the proof never unlocks"],
  ["await redis.flushdb();", "FLUSHDB, which the proof never unlocks"],
  ["const n = await redis.dbsize();", "DBSIZE, which the proof never unlocks"],
];

let broken = false;
for (const [line, why] of MUST_ALLOW_WITH_PROOF) {
  const hit = inspect(line, PROVEN);
  if (hit !== null) {
    console.error(`check-redis-safety: FATAL - the proof exemption did not apply where it must (${why}): ${hit}`);
    broken = true;
  }
}
for (const [line, why] of MUST_STILL_CATCH_WITH_PROOF) {
  if (inspect(line, PROVEN) === null) {
    console.error(`check-redis-safety: FATAL - the proof exemption widened past its rule (${why}): ${line}`);
    broken = true;
  }
}
// The detector for the proof itself, both ways: a call is a proof, a mention is not.
if (!PROVES_VPS_TARGET.test('assertNotManagedStore([["REDIS_URL", url]], process.env);')) {
  console.error("check-redis-safety: FATAL - PROVES_VPS_TARGET does not match the call shape it exists to find.");
  broken = true;
}
for (const notAProof of [
  "// see assertNotManagedStore in packages/zec-types",
  "import { assertNotManagedStore } from \"@zcashreveal/types\";",
  "assertNotManagedStore(candidates, env);",
]) {
  if (PROVES_VPS_TARGET.test(notAProof)) {
    console.error(`check-redis-safety: FATAL - PROVES_VPS_TARGET accepted something that is not a call with a candidate array: ${notAProof}`);
    broken = true;
  }
}
for (const [line, why] of MUST_CATCH) {
  if (inspect(line) === null) {
    console.error(`check-redis-safety: FATAL - the detector missed a line it must catch (${why}): ${line}`);
    broken = true;
  }
}
for (const line of MUST_IGNORE) {
  const hit = inspect(line);
  if (hit !== null) {
    console.error(`check-redis-safety: FATAL - the detector flagged a line it must ignore (${hit}): ${line}`);
    broken = true;
  }
}
if (broken) {
  console.error("check-redis-safety: the scan would be unreliable in one direction or the other. Aborting.");
  process.exit(2);
}

/* ---------------------------------------------------------------------- scan */

const findings = [];

function allowedToName(rel) {
  return NAMING_ALLOWED.has(rel) || NAMING_ALLOWED_PREFIX.some((p) => rel.startsWith(p));
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (SKIP_FILE.has(entry)) continue;
    const dot = entry.lastIndexOf(".");
    const ext = dot <= 0 ? "" : entry.slice(dot).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;

    const rel = relative(REPO, full).split(sep).join("/");
    if (rel === SELF) continue;
    if (allowedToName(rel)) continue;

    let source;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    // A NUL in the first kilobyte means binary content under an unknown extension.
    if (source.slice(0, 1024).includes("\u0000")) continue;

    const ctx = { provesVpsTarget: ext !== ".md" && PROVES_VPS_TARGET.test(source) };

    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const rule = inspect(lines[i], ctx);
      if (rule !== null) findings.push({ file: rel, line: i + 1, rule, text: lines[i].trim().slice(0, 120) });
    }
  }
}

walk(REPO);

if (findings.length > 0) {
  console.error("check-redis-safety: FAIL - the Vercel-managed Redis is SHARED with an unrelated");
  console.error("production project. See docs/2.0/SNAPSHOT.md sections 1 and 4.\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.rule}`);
    console.error(`      ${f.text}`);
  }
  process.exit(1);
}

console.log(
  `check-redis-safety: OK - ${MUST_CATCH.length + MUST_IGNORE.length + MUST_ALLOW_WITH_PROOF.length + MUST_STILL_CATCH_WITH_PROOF.length} fixtures self-tested in four directions, no forbidden Redis command ` +
    `in any scanned file (the rule's own documents are allowed to name them).`,
);
