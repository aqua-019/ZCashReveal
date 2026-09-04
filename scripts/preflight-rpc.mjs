#!/usr/bin/env node
/**
 * Answer, by execution, whether one RPC endpoint can carry this stack.
 *
 *   node scripts/preflight-rpc.mjs <rpc-url>
 *   ZEBRAD_RPC_URL=https://... node scripts/preflight-rpc.mjs
 *
 * Exit 0 and the endpoint serves every method this stack sends, at a rate it can
 * work inside, running a version this build has been read against. Exit 1 and
 * the table says which of those is false. Exit 2 is a usage error.
 *
 * WHY THIS EXISTS. `z_gettreestate` is the only source of an Ironwood root
 * (`client.ts` says so at `getTreestate`), the confirmed-block driver calls it
 * at exactly the heights that append Ironwood commitments, and a public gateway
 * that does not serve it turns every later spend citing one of those anchors
 * into `UNKNOWN_ANCHOR` **permanently**, because nothing in this project
 * backfills (LEDGER-12 Q2). An operator must learn that in ten seconds from a
 * table, not in three weeks from a query that comes back empty.
 *
 * THREE OUTCOMES PER METHOD, AND THE THIRD IS THE WHOLE POINT.
 *
 *   SERVED     the endpoint answered ABOUT THE METHOD. A result, or an error
 *              about the ARGUMENTS, both mean the method exists.
 *   ABSENT     the endpoint says it does not have this method.
 *   UNKNOWN    the endpoint did not say. A refusal, a timeout, a proxy page, a
 *              shape this script could not read.
 *
 * A PREFLIGHT THAT COLLAPSED UNKNOWN INTO ABSENT WOULD REJECT GOOD ENDPOINTS,
 * and a preflight that collapsed it into SERVED would certify bad ones. The
 * worked case is `getrawtransaction`: probed with a txid that does not exist, a
 * WORKING endpoint answers `-5 No such mempool or main chain transaction`. That
 * is an error, and it is proof the method is there. A rate-limited endpoint
 * answers 429 to the same probe, which proves nothing at all - and those two
 * are one HTTP status apart.
 *
 * THE RATE IS MEASURED AND NEVER READ FROM A PAGE. A provider's documented
 * ceiling is a claim about their intent; the number this stack has to live
 * inside is what the wire does. `measureRate` bursts identical cheap calls and
 * reports the last success and the first refusal, with the n it used. A burst
 * that never gets refused reports exactly that, with its n, rather than a
 * ceiling it did not find (CLAUDE.md: a rate quoted without its n is not a
 * measurement).
 *
 * THE ORDER IS BURST FIRST, THEN PROBES, AND IT IS NOT ARBITRARY. The probes
 * have to run inside whatever ceiling exists, so the ceiling is measured before
 * they start and they are paced from it. Probing first and bursting after would
 * spend an unknown share of an unknown budget and then measure the remainder.
 *
 * WHAT THIS IS NOT. It is not a claim that the node behind the endpoint is
 * correct. It reads `subversion` and compares it to a window; a gateway can
 * report anything, and a version inside the window is UNEXAMINED-free rather
 * than proven. `check-compose-zebra-tag.mjs` makes the same disclaimer about a
 * tag and for the same reason.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The window's source, RESOLVED AGAINST THIS FILE AND NOT AGAINST THE CWD.
 *
 * IT WAS `"packages/zebra-rpc/src/version-floor.ts"` AND THAT MADE THE VERDICT
 * DEPEND ON WHERE THE OPERATOR STOOD. `readWindow` returns null when the path
 * does not exist, and the summary then printed `NO-WINDOW` and exited 0 - so the
 * same script against the same node exited 1 from the repository root, naming a
 * below-floor version, and 0 from anywhere else. An operator runs this from
 * wherever their `.env` is. Found by a gate reviewer, and it is the same shape
 * as the vacuous pass below: a check that cannot find its rule must not report
 * that the rule is satisfied.
 */
const FLOOR_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/zebra-rpc/src/version-floor.ts");

/* ---------------------------------------------------------------------------
   ARGUMENTS
   ------------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined ? fallback : v;
};
const has = (name) => argv.includes(name);

/**
 * The positional argument, skipping every flag AND the value that follows one.
 *
 * IT USED TO SKIP ANYTHING STARTING `--` AND ANYTHING ALL-DIGITS, which meant a
 * flag value that was neither became the URL. `--window-max-ms 3s` made the
 * script announce `preflight 3s`, dial nothing, and report the endpoint
 * UNREACHABLE while it was live and serving - a bogus verdict about a healthy
 * endpoint, from a typo. Found by a gate reviewer. Flags that TAKE a value are
 * data here so a new one cannot be forgotten.
 */
const VALUED_FLAGS = new Set(["--burst", "--timeout-ms", "--window-max-ms"]);
const positional = () => {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      if (VALUED_FLAGS.has(a)) i += 1;
      continue;
    }
    return a;
  }
  return undefined;
};
const URL_ = positional() ?? process.env["ZEBRAD_RPC_URL"];

/**
 * The usage exit, MOVED INTO `main` RATHER THAN LEFT AT MODULE SCOPE.
 *
 * IT FIRED ON IMPORT AND KILLED THE TEST RUNNER. `preflight-rpc.test.ts`
 * imports `classify`, `versionVerdict`, `retryAfterMs` and `PROBES` from this
 * file to drive them directly, and vitest's argv carries no RPC URL - so a
 * top-level `process.exit(2)` ended the worker before a single test was
 * collected, reported as "0 test" rather than as anything about this script.
 * The `import.meta.url === argv[1]` guard at the bottom protects the DIALLING;
 * this is the same guard applied to the ARGUMENT CHECK, which needed it just as
 * much and did not have it.
 */
function requireUrl() {
  if (URL_ !== undefined && URL_.length > 0) return URL_;
  process.stderr.write(
    "usage: node scripts/preflight-rpc.mjs <rpc-url> [--burst N] [--skip-rate|--rate-only] [--timeout-ms N]\n" +
      "                                     [--window-max-ms N] [--skip-version]\n" +
      "   or: ZEBRAD_RPC_URL=https://... node scripts/preflight-rpc.mjs\n\n" +
      "Answers which methods this stack sends are served, what version is answering,\n" +
      "and how many requests the endpoint takes before it refuses.\n",
  );
  process.exit(2);
}

const USER = process.env["ZEBRAD_RPC_USER"] ?? "";
const PASSWORD = process.env["ZEBRAD_RPC_PASSWORD"] ?? "";
/**
 * A numeric flag, or a usage error naming it.
 *
 * `Number("3s")` IS `NaN` AND EVERY ONE OF THESE WAS READ WITH BARE `Number`.
 * A gate reviewer drove each: `--timeout-ms 3s` made `setTimeout(abort, NaN)`
 * fire immediately, so a live healthy endpoint reported UNREACHABLE - the exact
 * verdict the round-4 fix removed for the URL argument, reappearing one flag
 * over. `--burst 0` made the burst loop run zero times, so `--rate-only` exited
 * 0 having made ZERO requests - the same green-verdict-about-nothing that
 * `--skip-rate --rate-only` had just been closed for. A preflight that reports
 * on an endpoint it never contacted is the worst output this tool can produce,
 * so a malformed flag is a usage error rather than a silently coerced value.
 */
const numericFlag = (name, fallback, { min = 1 } = {}) => {
  const raw = flag(name, fallback);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) {
    process.stderr.write(`${name} must be an integer of at least ${String(min)}; got ${JSON.stringify(raw)}\n`);
    process.exit(2);
  }
  return n;
};

const BURST_N = numericFlag("--burst", "16");
const TIMEOUT_MS = numericFlag("--timeout-ms", "10000", { min: 100 });
const SKIP_RATE = has("--skip-rate");
/**
 * Measure the rate and stop.
 *
 * A REAL OPERATOR FLAG AND NOT A TEST HOOK. "How fast may I poll this?" is the
 * question asked between choosing an endpoint and setting
 * `INDEXER_RPC_MAX_RPM`, and answering it should not cost the paced probe run,
 * which at a measured five a minute takes two minutes by the endpoint's own
 * choice. That it also lets A2's assertion measure the burst without waiting out
 * a cool-off is a consequence rather than the reason: a flag existing only for a
 * test would be a code path no operator ever runs.
 */
const RATE_ONLY = has("--rate-only");
/**
 * Accept an endpoint whose version this script could not check.
 *
 * BECAUSE BLOCKING BY DEFAULT IS RIGHT AND BLOCKING WITH NO WAY THROUGH IS NOT.
 * An unreadable version is UNCHECKED rather than acceptable - `version-floor.ts`
 * says so in its own words - so the default must be a non-zero exit. But a
 * gateway that serves every one of the six wire methods this stack sends and
 * simply does not expose `getinfo` is a working endpoint, and an operator who
 * has established the node's version some other way needs a documented way to
 * say so. This is that way, and it is a FLAG rather than a silent tolerance
 * precisely so the decision appears in whatever command they wrote down.
 */
const SKIP_VERSION = has("--skip-version");
// CONTRADICTORY FLAGS ARE A USAGE ERROR AND NOT A SILENT SUCCESS. Passed
// together, the script used to print "nothing was measured" and exit 0 having
// made ZERO requests - a green verdict about an endpoint it never contacted,
// which is the worst reading a preflight can produce. Found by a gate reviewer.
if (SKIP_RATE && RATE_ONLY) {
  process.stderr.write("--skip-rate and --rate-only are contradictory: one skips the rate and the other measures nothing else.\n");
  process.exit(2);
}
/** A refusal with no `Retry-After` still needs a wait. One minute is the window every measured limiter uses. */
const DEFAULT_COOLOFF_MS = 60_000;
/**
 * How long `measureWindow` will wait for an endpoint to serve again before
 * reporting the window UNDETERMINED.
 *
 * A REAL OPERATOR FLAG, like `--rate-only`. Determining a window costs a window,
 * and an operator probing a gateway with a fifteen-minute one should be able to
 * say "spend thirty seconds and then tell me you could not". The default covers
 * every window this project has measured, with room.
 */
const WINDOW_PROBE_MAX_MS = numericFlag("--window-max-ms", "75000", { min: 100 });
/** How many times one probe is retried after a refusal before it is reported UNKNOWN. */
const PROBE_RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------------------
   THE WINDOW, READ RATHER THAN RESTATED
   ------------------------------------------------------------------------ */

/**
 * Floor and ceiling, READ out of `version-floor.ts`.
 *
 * NOT RESTATED HERE, for the reason `check-compose-zebra-tag.mjs` gives about
 * the floor and HANDOFF-16 extended to the ceiling: one quantity with two
 * readers must have one source. This script is the ceiling's second reader and
 * is why it moved into that module.
 *
 * ANCHORED AT `export const`, because the loose form matches the DOCBLOCK. That
 * is not a hypothetical: the same regex, unanchored, was written in
 * `check-compose-zebra-tag.mjs` on the day this file was written and its own
 * self-test caught it reading `ZEBRA_MAX_VERSION_INCLUSIVE = true` out of a
 * sentence of prose after the declaration had been deleted.
 */
function readWindow(path = FLOOR_SOURCE) {
  if (!existsSync(path)) return null;
  // COMMENTS STRIPPED FIRST, for `check-compose-zebra-tag.mjs`'s reason: a block
  // comment whose lines start at column 0 satisfies `^export const` under `/m`,
  // so a commented-out declaration reads as a live one. The two readers of this
  // file must agree about what counts as a declaration or they are two rules.
  const src = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const lo = /^export const ZEBRA_MIN_VERSION_STRING\s*=\s*"(\d+)\.(\d+)\.(\d+)"/m.exec(src);
  const hi = /^export const ZEBRA_MAX_VERSION_STRING\s*=\s*"(\d+)\.(\d+)\.(\d+)"/m.exec(src);
  const inc = /^export const ZEBRA_MAX_VERSION_INCLUSIVE\s*=\s*(true|false)/m.exec(src);
  if (lo === null || hi === null || inc === null) return null;
  return {
    floor: { major: +lo[1], minor: +lo[2], patch: +lo[3] },
    ceiling: { major: +hi[1], minor: +hi[2], patch: +hi[3] },
    inclusive: inc[1] === "true",
  };
}

/** The same two regexes `version-floor.ts` declares, kept in step by the probe list below. */
const SUBVERSION_RE = /^\/?\s*Zebra\s*:\s*v?(\d+)\.(\d+)\.(\d+)/i;
const BARE_VERSION_RE = /^\s*v?(\d+)\.(\d+)\.(\d+)/;

export function parseVersion(subversion) {
  const m = SUBVERSION_RE.exec(subversion) ?? BARE_VERSION_RE.exec(subversion);
  if (m === null) return null;
  const v = { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  if (!Number.isSafeInteger(v.major) || !Number.isSafeInteger(v.minor) || !Number.isSafeInteger(v.patch)) return null;
  return v;
}

const cmp = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch;
const show = (v) => `${v.major}.${v.minor}.${v.patch}`;

/** Four outcomes, matching `checkZebraVersionWindow`: in-window, below-floor, above-ceiling, unparsed. */
export function versionVerdict(subversion, window) {
  const version = parseVersion(subversion);
  if (version === null) return { outcome: "UNPARSED", version: null };
  if (cmp(version, window.floor) < 0) return { outcome: "BELOW-FLOOR", version };
  const c = cmp(version, window.ceiling);
  if (window.inclusive ? c > 0 : c >= 0) return { outcome: "ABOVE-CEILING", version };
  return { outcome: "IN-WINDOW", version };
}

/* ---------------------------------------------------------------------------
   THE PROBES, AS DATA
   ------------------------------------------------------------------------ */

/**
 * Every wire call this stack sends outside the address index, with THE PARAMS IT
 * SENDS, and what a working endpoint may answer.
 *
 * WITH THE REAL PARAMS, BECAUSE AVAILABILITY IS PER SHAPE AND NOT PER NAME.
 * `getblock` at verbosity 1 and `getblock` at verbosity 2 are the same method
 * name and a different capability - this stack only ever sends 2, and a gateway
 * that serves 1 and refuses 2 cannot carry it. `getrawmempool` is the same story
 * with `[false]` and `[true]`. A probe list keyed by NAME would certify both.
 *
 * AS DATA AND NOT AS EIGHT HAND-WRITTEN CALLS, so that the self-test can iterate
 * the list and a method added here cannot arrive untested (LEDGER-09a Q3).
 *
 * `required` IS PER ROW BECAUSE NOT EVERY ROW COSTS THE SAME TO LOSE.
 * `z_gettreestate` absent costs every Ironwood anchor, permanently; `getinfo`
 * absent costs the version check and nothing else, and the honest report for it
 * is a warning rather than a refusal to proceed.
 */
export const PROBES = [
  {
    key: "getblockchaininfo",
    method: "getblockchaininfo",
    params: [],
    required: true,
    why: "the tip, the lane balances, and the follower's every step",
  },
  {
    key: "getblock",
    method: "getblock",
    // A height far above any chain: a working endpoint answers -8 about the
    // ARGUMENT, which is proof the method is there and costs no block transfer.
    params: ["99999999", 2],
    required: true,
    why: "every confirmed block, at verbosity 2 - the only verbosity this stack sends",
  },
  {
    key: "getblockheader",
    method: "getblockheader",
    params: ["0000000000000000000000000000000000000000000000000000000000000000", true],
    required: true,
    why: "the base row's block time on a cold start",
  },
  {
    key: "getrawmempool",
    method: "getrawmempool",
    params: [false],
    required: true,
    why: "the mempool txid list",
  },
  {
    key: "getrawmempool[verbose]",
    method: "getrawmempool",
    params: [true],
    required: true,
    why: "the mempool with sizes, which is what /v2/mempool renders",
  },
  {
    key: "getrawtransaction",
    method: "getrawtransaction",
    params: ["0000000000000000000000000000000000000000000000000000000000000000", 1],
    required: true,
    why: "every mempool transaction this stack analyses",
  },
  {
    key: "z_gettreestate",
    method: "z_gettreestate",
    params: ["99999999"],
    required: true,
    why: "THE ONLY SOURCE OF AN IRONWOOD ROOT. Absent, every Ironwood anchor is missing and every later spend citing one reads UNKNOWN_ANCHOR permanently - there is no backfill",
  },
  {
    key: "getinfo",
    method: "getinfo",
    params: [],
    required: false,
    why:
      "subversion, for the version window. Nothing else in this stack calls it, so its absence costs the VERSION CHECK and nothing else - " +
      "but an unchecked version still BLOCKS, because version-floor.ts's own rule is that an unparsed version is not a pass. " +
      "Pass --skip-version to proceed against an endpoint whose version you established another way",
  },
];

/* ---------------------------------------------------------------------------
   ONE REQUEST
   ------------------------------------------------------------------------ */

let requestCount = 0;

/**
 * One JSON-RPC request, classified by what came back.
 *
 * THE HTTP STATUS IS READ BEFORE THE BODY, which is the fix `client.ts` carries
 * and the reason it carries it: the two commonest real 429 bodies are a
 * Cloudflare HTML page (which `JSON.parse` throws on) and a JSON-RPC-wrapped
 * limiter (which parses into an error object and reads as a fact about the
 * chain). A third, measured on the live endpoint, parses and carries NEITHER
 * `result` NOR `error`. All three are refusals and the status is the only field
 * that says so about all of them.
 */
async function rpc(method, params) {
  requestCount += 1;
  const headers = { "content-type": "application/json" };
  if (USER.length > 0 || PASSWORD.length > 0) {
    headers["authorization"] = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(URL_, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "1.0", id: requestCount, method, params }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (res.status === 429) {
      return { kind: "REFUSED", status: 429, retryAfterMs: retryAfterMs(res.headers.get("retry-after")), body: text.slice(0, 200) };
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return { kind: "UNREADABLE", status: res.status, body: text.slice(0, 200) };
    }
    if (payload !== null && typeof payload === "object" && payload.error !== null && payload.error !== undefined) {
      const e = payload.error;
      return {
        kind: "RPC-ERROR",
        status: res.status,
        code: typeof e === "object" && e !== null ? e.code : undefined,
        message: typeof e === "object" && e !== null ? String(e.message ?? "") : String(e),
      };
    }
    if (payload === null || typeof payload !== "object" || !("result" in payload)) {
      // Parses, carries neither `result` nor `error`. The measured gateway 429
      // body has exactly this shape; at a non-429 status it is a proxy, not a node.
      return { kind: "UNREADABLE", status: res.status, body: text.slice(0, 200) };
    }
    if (payload.result === null) {
      // A KEY IS NOT AN ANSWER. The envelope test read `"result" in payload`, so
      // a proxy replying `{"result": null}` to every method was certified as
      // serving all eight while `{}` - one key less - failed every one. None of
      // the probes below can legitimately answer `null`: `getblockchaininfo`
      // returns an object, the two `getblock` shapes an object or an error, the
      // mempool ones an array or a map. A gate reviewer flipped every verdict
      // with one key.
      return { kind: "UNREADABLE", status: res.status, body: "result: null" };
    }
    return { kind: "OK", status: res.status, result: payload.result };
  } catch (err) {
    return { kind: "TRANSPORT", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `Retry-After` in either RFC 9110 form, or null when absent or unreadable.
 *
 * A SECOND COPY OF `packages/zebra-rpc/src/rate-limit.ts`'s `parseRetryAfterMs`,
 * DELIBERATELY, AND THE TEST PINS THEM TOGETHER. This script has no workspace
 * imports on purpose - an operator runs it against a candidate endpoint from a
 * fresh clone, before `pnpm install`, and a script that needed a built package
 * to answer "can this endpoint carry the stack" would be useless at exactly the
 * moment it is wanted. The cost of that choice is a duplicate, and the duplicate
 * is paid for in `preflight-rpc.test.ts`, which drives BOTH implementations over
 * one table and fails if they ever disagree.
 *
 * AND THE FIRST DRAFT OF THIS COPY REINTRODUCED THE DEFECT THE ORIGINAL WAS
 * FIXED FOR, WHICH IS WHY THE PINNING TEST EXISTS RATHER THAN A COMMENT.
 * It read delta-seconds strictly and then handed everything else to
 * `Date.parse`. `Date.parse("1.5")` is 5 January 2001 - a real date, in the past
 * - so the clamp below returned 0 and every caller reads 0 as "the endpoint said
 * retry immediately". The endpoint said nothing of the sort. That is HANDOFF-15's
 * measured defect, reproduced in a copy of its own fix, half an hour after the
 * fix was read. The test caught it on its first run.
 *
 * So the date form is admitted only when it CONTAINS A MONTH NAME, which every
 * form RFC 9110 requires a recipient to accept does carry - IMF-fixdate, the
 * obsolete RFC 850 form and asctime. `Date.parse` still does the parsing; the
 * month check only decides whether the string is a date at all.
 */
export function retryAfterMs(header, now = Date.now()) {
  if (header === null || header === undefined) return null;
  const text = String(header).trim();
  if (text === "") return null;
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    if (!Number.isFinite(seconds)) return null;
    return seconds * 1000;
  }
  if (!/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  // A well-formed date already past genuinely means "you may retry now", so THIS
  // zero is correct where the one above was an absence wearing a zero's clothes.
  return Math.max(0, at - now);
}

/* ---------------------------------------------------------------------------
   CLASSIFYING ONE PROBE
   ------------------------------------------------------------------------ */

/**
 * The messages an endpoint uses to say "I do not have that method".
 *
 * AS A LIST BECAUSE `-32601` IS NOT UNIVERSAL. Zebra answers `Method not found`
 * with the JSON-RPC standard code; gateways in front of a node routinely answer
 * their own text with `-1`, `-32000` or no code at all. The code is checked
 * first and the text second, and a row that matches neither is SERVED - because
 * an error this list does not recognise is an error ABOUT THE ARGUMENTS until
 * shown otherwise, and that is the safe direction: it can only make the
 * preflight admit an endpoint the runtime will then name at startup, never make
 * it reject a working one.
 */
export const ABSENCE_PATTERNS = [
  /method not found/i,
  /unknown method/i,
  /not supported/i,
  /unsupported method/i,
  /no such method/i,
  /method .* is disabled/i,
  /disabled method/i,
];

/** SERVED / ABSENT / UNKNOWN from one response. Pure, so the self-test can drive every arm. */
export function classify(res) {
  if (res.kind === "OK") return { outcome: "SERVED", detail: "answered with a result" };
  if (res.kind === "REFUSED") return { outcome: "UNKNOWN", detail: "429 - the endpoint refused before it said whether it has this method" };
  if (res.kind === "TRANSPORT") return { outcome: "UNKNOWN", detail: `transport: ${res.error}` };
  if (res.kind === "UNREADABLE") return { outcome: "UNKNOWN", detail: `HTTP ${res.status} carrying neither result nor error` };
  // The script's own copy already routes an envelope with no `result` through
  // `UNREADABLE` above, so the `empty result` case the TypeScript classifier had
  // to add cannot arise here. The two are pinned together by test regardless.
  // An RPC error. -32601 is the standard code; the text list catches the rest.
  if (res.code === -32601) return { outcome: "ABSENT", detail: `-32601 ${res.message}` };
  if (ABSENCE_PATTERNS.some((re) => re.test(res.message))) {
    return { outcome: "ABSENT", detail: `${String(res.code ?? "no code")} ${res.message}` };
  }
  // THE WORKED CASE THIS WHOLE FUNCTION EXISTS FOR: an error about the ARGUMENT.
  // `getrawtransaction` on a txid that does not exist answers -5 "No such
  // mempool or main chain transaction", and that is proof the method WORKS.
  return { outcome: "SERVED", detail: `${String(res.code ?? "no code")} ${res.message} (an error about the argument, so the method is there)` };
}

/* ---------------------------------------------------------------------------
   THE RATE
   ------------------------------------------------------------------------ */

/**
 * How many requests this endpoint takes before it refuses, AND OVER WHAT WINDOW.
 *
 * A COUNT WITHOUT A WINDOW IS NOT A RATE, AND THE FIRST VERSION OF THIS
 * FUNCTION REPORTED ONE ANYWAY. It issued n back-to-back calls, returned
 * `lastSuccess`, and the caller printed `Set INDEXER_RPC_MAX_RPM=<lastSuccess>`.
 * That is correct only if the endpoint's window happens to be exactly one
 * minute. Driven against a mock limiting five per SECOND - three hundred a
 * minute - it printed "5 succeeded, request 6 refused" and recommended a ceiling
 * of five: a sixty-fold under-estimate, which would have made the indexer
 * analyse approximately nothing while the endpoint sat idle. Found by a gate
 * reviewer and reproduced here before the fix was written. It is the same shape
 * as CLAUDE.md's rule about a rate quoted without its n, one step further along:
 * the n was there and the DENOMINATOR was not.
 *
 * SO THE WINDOW IS MEASURED TOO, BY TWO ROUTES AND A THIRD OUTCOME.
 *
 *   `Retry-After`  when the refusal carries it, that IS the window the endpoint
 *                  is telling you about, and it costs nothing to read.
 *   recovery       otherwise, poll until the endpoint serves again and time it.
 *                  Bounded, because an endpoint that refuses for an hour must
 *                  not hang a preflight.
 *   UNDETERMINED   neither answered inside the bound. The capacity is still
 *                  reported - it is a real measurement - and NO per-minute
 *                  figure is derived and no ceiling is recommended, because a
 *                  number invented here is a number an operator will paste into
 *                  a config file.
 */
async function measureRate(n) {
  const at = [];
  const startedAt = Date.now();
  for (let i = 1; i <= n; i += 1) {
    const res = await rpc("getblockchaininfo", []);
    at.push(res.kind);
    if (res.kind === "REFUSED") {
      const refusedAt = Date.now();
      const window = await measureWindow(res.retryAfterMs, refusedAt);
      return {
        refused: true,
        lastSuccess: i - 1,
        firstRefusal: i,
        n,
        retryAfterMs: res.retryAfterMs,
        burstMs: refusedAt - startedAt,
        window,
        // THE DERIVED FIGURE, AND IT IS null WHEN THE WINDOW IS UNDETERMINED
        // RATHER THAN A GUESS. capacity per window, scaled to a minute.
        // ZERO SUCCESSES DERIVES NOTHING. `Math.max(1, ...)` turned a burst
        // whose FIRST request was refused into "Set INDEXER_RPC_MAX_RPM=1 ...
        // (0 requests per 1s window)" - a sentence that states its own
        // measurement is zero and recommends one anyway. An endpoint already
        // refusing when the preflight arrives has told you nothing about its
        // rate; it has told you it is currently refusing.
        perMinute:
          window.ms === null || window.ms <= 0 || i - 1 === 0
            ? null
            : Math.max(1, Math.floor(((i - 1) * 60_000) / window.ms)),
        sequence: at,
      };
    }
    if (res.kind === "TRANSPORT") {
      return { refused: false, unreachable: true, lastSuccess: i - 1, firstRefusal: null, n: i, perMinute: null, sequence: at };
    }
  }
  return {
    refused: false,
    lastSuccess: n,
    firstRefusal: null,
    n,
    burstMs: Date.now() - startedAt,
    perMinute: null,
    sequence: at,
  };
}

/** How long the endpoint stays refused, from `Retry-After` or by waiting it out. */
async function measureWindow(retryAfterMs, refusedAt) {
  if (retryAfterMs !== null && retryAfterMs > 0) {
    // THE HEADER IS BELIEVED FOR THE WINDOW AND NOT FOR THE WAIT. A gate
    // reviewer pointed a mock with `Retry-After: 3600` at this and the preflight
    // slept the full hour before probing a single method, with
    // `--window-max-ms` set to three seconds and ignored. The window is a
    // MEASUREMENT and an hour-long one is still true; the WAIT is a choice, and
    // it is the operator's to bound.
    return { ms: retryAfterMs, source: "Retry-After" };
  }
  // POLLED, WITH A CEILING ON THE WAIT. A minute plus a little covers every
  // window this project has measured; beyond that the honest answer is that the
  // window was not determined, not a larger guess.
  const deadline = refusedAt + WINDOW_PROBE_MAX_MS;
  let step = 2000;
  while (Date.now() < deadline) {
    await sleep(step);
    const res = await rpc("getblockchaininfo", []);
    if (res.kind === "OK") return { ms: Date.now() - refusedAt, source: "measured recovery" };
    if (res.kind === "TRANSPORT") return { ms: null, source: "the endpoint stopped answering while the window was being measured" };
    step = Math.min(step * 2, 8000);
  }
  return { ms: null, source: `no recovery inside ${String(Math.round(WINDOW_PROBE_MAX_MS / 1000))}s` };
}

/* ---------------------------------------------------------------------------
   THE RUN
   ------------------------------------------------------------------------ */

async function probeWithRetry(probe, paceMs) {
  let cooloff = DEFAULT_COOLOFF_MS;
  for (let attempt = 0; attempt <= PROBE_RETRIES; attempt += 1) {
    if (attempt > 0) {
      process.stderr.write(`  ... ${probe.key} was refused; waiting ${Math.round(cooloff / 1000)}s and retrying\n`);
      await sleep(cooloff);
    } else if (paceMs > 0) {
      await sleep(paceMs);
    }
    const res = await rpc(probe.method, probe.params);
    const verdict = classify(res);
    if (verdict.outcome !== "UNKNOWN" || res.kind !== "REFUSED") return { probe, res, ...verdict };
    cooloff = res.retryAfterMs ?? DEFAULT_COOLOFF_MS;
  }
  return { probe, outcome: "UNKNOWN", detail: `refused on every one of ${PROBE_RETRIES + 1} attempts` };
}

async function main() {
  requireUrl();
  const window = readWindow();
  process.stdout.write(`preflight ${URL_}\n\n`);

  let rate = null;
  if (!SKIP_RATE) {
    process.stdout.write(`measuring the rate: a burst of ${BURST_N} getblockchaininfo\n`);
    rate = await measureRate(BURST_N);
    if (rate.unreachable) {
      process.stdout.write(`\n  UNREACHABLE after ${rate.n} request(s). Nothing below can be measured.\n`);
      process.stdout.write(`  ${rate.sequence.join(", ")}\n`);
      process.exit(1);
    }
    process.stdout.write(
      rate.refused
        ? `  last success ${rate.lastSuccess}, first refusal ${rate.firstRefusal}, n=${rate.n}, burst took ${String(rate.burstMs)}ms\n` +
            `  window ${rate.window.ms === null ? "UNDETERMINED" : `${String(Math.round(rate.window.ms))}ms`} (${rate.window.source})\n` +
            `  ${rate.perMinute === null ? "NO per-minute figure: the window was not determined, so a rate cannot be derived" : `derived ceiling ${String(rate.perMinute)} requests/minute`}\n\n`
        : `  no refusal in n=${rate.n} over ${String(rate.burstMs)}ms. That is not "unmetered": it is no refusal in ${rate.n}.\n\n`,
    );
  }

  if (RATE_ONLY) {
    process.stdout.write(
      // `rate` cannot be null here: the two flags are refused as a usage error
      // above, so RATE_ONLY implies the burst ran.
      rate === null
        ? "rate                    NOT MEASURED  unreachable: --rate-only implies the burst ran\n"
        : rate.refused
          ? `rate                    MEASURED      ${rate.lastSuccess} succeeded, request ${rate.firstRefusal} refused, n=${rate.n}; ` +
            `window ${rate.window.ms === null ? "UNDETERMINED" : `${String(Math.round(rate.window.ms))}ms`}; ` +
            `${rate.perMinute === null ? "no per-minute figure" : `${String(rate.perMinute)}/minute`}\n`
          : `rate                    NO REFUSAL    none in n=${rate.n}\n`,
    );
    process.stdout.write(`total requests          ${String(requestCount)}\n`);
    process.exit(0);
  }

  // PACED FROM THE MEASUREMENT. At a measured five-a-minute the probes below run
  // one every twelve seconds, which is slow and is the endpoint's decision
  // rather than this script's.
  // PACED FROM THE DERIVED PER-MINUTE FIGURE, NOT FROM THE BURST COUNT. Where the
  // window could not be determined the probes are paced from the burst count
  // treated as a per-minute ceiling, which is the SLOWEST reading of the
  // measurement and therefore the safe one to probe at - it can waste an
  // operator's time and cannot spend budget they do not have.
  const perMinute = rate !== null && rate.refused ? (rate.perMinute ?? rate.lastSuccess) : null;
  const paceMs = perMinute !== null && perMinute > 0 ? Math.ceil(60_000 / perMinute) : 0;
  if (rate !== null && rate.refused) {
    const measured = rate.window.ms ?? rate.retryAfterMs ?? DEFAULT_COOLOFF_MS;
    const waitMs = Math.min(measured, WINDOW_PROBE_MAX_MS);
    process.stdout.write(
      waitMs < measured
        ? `  the window is ${String(Math.round(measured / 1000))}s and --window-max-ms bounds the wait at ${String(Math.round(waitMs / 1000))}s; probing after that, so a refusal below is UNKNOWN rather than absent\n\n`
        : `  waiting ${String(Math.round(waitMs / 1000))}s for the window to clear before probing methods\n\n`,
    );
    await sleep(waitMs);
  }

  process.stdout.write(`probing ${PROBES.length} method shapes${paceMs > 0 ? `, one every ${Math.round(paceMs / 1000)}s` : ""}\n`);
  const results = [];
  for (const probe of PROBES) results.push(await probeWithRetry(probe, paceMs));

  // The version, from getinfo if it is there.
  const info = results.find((r) => r.probe.key === "getinfo");
  let version = null;
  if (info !== undefined && info.outcome === "SERVED" && info.res?.kind === "OK") {
    const sub = info.res.result?.subversion;
    version = typeof sub === "string" ? { subversion: sub, ...(window === null ? { outcome: "NO-WINDOW", version: null } : versionVerdict(sub, window)) } : null;
  }

  process.stdout.write(`\n${"method".padEnd(24)}${"verdict".padEnd(10)}detail\n`);
  process.stdout.write(`${"-".repeat(24)}${"-".repeat(10)}${"-".repeat(40)}\n`);
  for (const r of results) {
    process.stdout.write(`${r.probe.key.padEnd(24)}${r.outcome.padEnd(10)}${r.detail}\n`);
  }

  process.stdout.write("\n");
  if (version !== null) {
    process.stdout.write(
      `subversion              ${version.outcome.padEnd(14)}${version.subversion}` +
        `${window === null ? " (the window could not be read)" : ` against ${show(window.floor)} to ${show(window.ceiling)}${window.inclusive ? " inclusive" : " exclusive"}`}\n`,
    );
  } else {
    process.stdout.write("subversion              UNKNOWN       getinfo did not answer with a readable subversion\n");
  }
  process.stdout.write(
    rate === null
      ? "rate                    SKIPPED       --skip-rate was passed\n"
      : rate.refused
        ? `rate                    MEASURED      ${rate.lastSuccess} succeeded, request ${rate.firstRefusal} refused, n=${rate.n}; ` +
          `window ${rate.window.ms === null ? "UNDETERMINED" : `${String(Math.round(rate.window.ms))}ms`} (${rate.window.source}); ` +
          `${rate.perMinute === null ? "no per-minute figure derived" : `${String(rate.perMinute)} requests/minute`}\n`
        : `rate                    NO REFUSAL    none in n=${rate.n}\n`,
  );
  process.stdout.write(`total requests          ${String(requestCount)}\n\n`);

  // THE VERDICT. A required method ABSENT or UNKNOWN is a stop; an optional one
  // is a line in the report. An above-ceiling version is a stop for the reason
  // the ceiling exists: unexamined is not fine.
  const blocking = [];
  for (const r of results) {
    if (!r.probe.required) continue;
    if (r.outcome === "SERVED") continue;
    blocking.push(`${r.probe.key} is ${r.outcome} - ${r.probe.why}`);
  }
  // EVERY VERSION OUTCOME EXCEPT IN-WINDOW BLOCKS, AND THE FIRST VERSION LET TWO
  // OF THEM THROUGH. `UNPARSED` exited 0 printing "This endpoint serves every
  // method this stack sends" beside `subversion UNPARSED /MagicBean:5.4.2/`, and
  // `NO-WINDOW` - the window file unreadable - did the same. Both are the
  // vacuous pass `version-floor.ts` names in its own words: "an unparsed string
  // silently treated as passing is the failure mode this whole module exists to
  // remove", and "this is not a pass: find out what is answering on this RPC
  // endpoint". A preflight that cannot read the rule must not report the rule
  // satisfied. Found by two gate-round reviewers independently.
  if (SKIP_VERSION) {
    process.stdout.write("NOTE  --skip-version was passed, so the version window was NOT checked. That is unchecked, not passed.\n");
  } else if (version === null) {
    blocking.push(
      "the version could not be read: getinfo did not answer with a subversion this script recognises. " +
        "Pass --skip-version if you have established the node's version another way",
    );
  } else if (version.outcome !== "IN-WINDOW") {
    blocking.push(
      version.outcome === "NO-WINDOW"
        ? `the version window could not be read from ${FLOOR_SOURCE}, so subversion ${version.subversion} is UNCHECKED - which is not a pass`
        : `subversion ${version.subversion} is ${version.outcome}`,
    );
  }
  for (const r of results) {
    if (r.probe.required || r.outcome === "SERVED") continue;
    process.stdout.write(`NOTE  ${r.probe.key} is ${r.outcome}. ${r.probe.why}\n`);
  }
  if (blocking.length > 0) {
    process.stdout.write("\nTHIS ENDPOINT CANNOT CARRY THE STACK AS CONFIGURED:\n");
    for (const b of blocking) process.stdout.write(`  - ${b}\n`);
    process.exit(1);
  }
  process.stdout.write("\nThis endpoint serves every method this stack sends.\n");
  if (rate !== null && rate.refused) {
    // NO RECOMMENDATION WITHOUT A WINDOW. A number printed here is a number an
    // operator pastes into a config file, and a burst count printed as a
    // per-minute ceiling is wrong by whatever ratio the real window bears to a
    // minute - sixty-fold against a per-second limiter, measured.
    process.stdout.write(
      rate.perMinute === null
        ? `NO CEILING RECOMMENDED: ${String(rate.lastSuccess)} requests were served before a refusal, but the window ` +
          `could not be determined (${rate.window.source}), so that count is a burst capacity and not a rate. ` +
          `Re-run when the endpoint sends Retry-After, or set INDEXER_RPC_MAX_RPM from the provider's own documented ` +
          `figure and treat it as unverified.\n`
        : `Set INDEXER_RPC_MAX_RPM=${String(rate.perMinute)} so the client meters itself to what was measured ` +
          `(${String(rate.lastSuccess)} requests per ${String(Math.round(rate.window.ms / 1000))}s window, ` +
          `by ${rate.window.source}).\n`,
    );
  }
  process.exit(0);
}

// GUARDED SO AN IMPORT NEVER DIALS ANYTHING. The self-test imports `classify`,
// `versionVerdict`, `retryAfterMs` and `PROBES` and must not open a socket.
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
