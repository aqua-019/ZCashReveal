#!/usr/bin/env node
/**
 * A NETWORK-DEPENDENT DEFAULT IS WRITTEN ONCE, IN THE ONLY PLACE THAT CAN READ
 * THE NETWORK.
 *
 * THE RULE. Every variable a config module gives a default computed from that
 * module's own network field must NOT carry a literal default in any compose
 * file or any `.env.example`. Compose's `${VAR:-default}` and a `.env` line
 * cannot read a sibling variable; `loadConfig` can. A default written in both
 * places is therefore not one default written twice - it is a per-network
 * default and a constant, and the constant wins on every deployment that left
 * the variable alone.
 *
 * WHAT IT COST, MEASURED, WHICH IS WHY THIS IS A GUARD AND NOT A CONVENTION.
 * LEDGER-12 Q6: `INDEXER_START_HEIGHT` was defaulted in `loadConfig` from
 * `INDEXER_NETWORK`, and ALSO in `docker-compose.yml` and `.env.example` as a
 * mainnet constant. Section 1 of the VPS runbook opens `cp .env.example .env`,
 * so an operator always has the constant whether they wanted it or not. A
 * testnet deployment that touched neither file opened its base 705,857 blocks
 * before testnet's own NU6.3 activation, SILENTLY - `chainBaseFromBlock`
 * legitimately accepts a pre-activation block, because an absent Ironwood tree
 * size is correct there. No test could ever have caught it: every test in this
 * repository runs on mainnet constants, so the two defaults AGREE under test
 * and disagree only on the network no test uses.
 *
 * THIS IS THE SEAM FAMILY, MOVED FROM TWO PROCESSES TO TWO CONFIGURATION
 * SURFACES. LEDGER-11 records the shape: a boundary where both sides have
 * tests, and each test builds its own input rather than taking the other
 * side's output. Four instances were seams between two PROCESSES (the WS
 * envelope, `/v2/mempool`'s wire form, `TipChannelPayload`'s discriminator,
 * `ClaimAssessment`'s unsuffixed bigints). This is the fifth and the first that
 * is not: the two sides are a TypeScript resolver and a YAML interpolation, the
 * value they disagree about is a default rather than a wire encoding, and no
 * round trip exists to run because one side is not a program. That is the
 * reason a guard is the instrument here and a round-trip test is not.
 *
 * WHAT THIS GUARD PROVES, AND WHAT A GREEN RUN IS NOT EVIDENCE FOR. It proves a
 * LITERAL IS ABSENT from the two surfaces that cannot read the network. It says
 * NOTHING about whether the resolver's default is the right height, whether the
 * network field is set correctly, or whether the operator's real `.env` - which
 * is not in the repository and never will be - carries a constant of its own.
 * The same disclosure `check-svg-text-floor`'s R3 and `check-finding-sites`
 * carry about their own bounds, for the same reason: a reader must not take
 * this line as more than it is.
 *
 * AND ONE MORE BOUND, STATED BECAUSE IT IS THE ONE MOST LIKELY TO MATTER LATER,
 * AND STATED PRECISELY BECAUSE AN IMPRECISE VERSION OF IT WOULD UNDERSTATE THE
 * GUARD AS BADLY AS OVERSTATING IT. "Network-dependent" is decided by an
 * IDENTIFIER REFERENCE: the variable's value expression, with comments and
 * string literals blanked, mentions the module's own network field. Passing the
 * field to a helper IS followed - `DEEP: resolveHeight(parsed.DEEP, parsed.NET)`
 * is caught, and the self-test drives exactly that row, because the scanner
 * tracks bracket depth. What is INVISIBLE is a default that reaches the network
 * WITHOUT NAMING THE FIELD in the value expression: a module-level constant
 * already resolved somewhere else, a lookup keyed by a value derived from the
 * network, a field read off an imported object. Closing that half needs a
 * TypeScript parse and a data-flow pass, which no guard in this repository has,
 * and the honest move is to say so here rather than let a green line imply it.
 * The discovered set is PRINTED BY NAME on every run for exactly that reason:
 * a variable dropping out of it is then visible in CI output rather than
 * silent.
 *
 * AND THE BOUND THAT MATTERS MOST, WHICH THE FIRST DRAFT OF THIS HEADER DID NOT
 * STATE AT ALL. A module that declares NO network field is never scanned - it
 * cannot be, because the rule is defined relative to a module's OWN network
 * field. So a module that hard-codes a per-network constant with no network
 * variable to read is invisible here, and `apps/publisher/src/config.ts` is
 * exactly that module today: it has no network field, and
 * `SNAPSHOT_IRONWOOD_BIRTH_HEIGHT` defaults unconditionally to
 * `NU6_3_MAINNET_HEIGHT` with `.env.example` restating the same constant.
 *
 * THAT IS NOT THE LEDGER-12 Q6 DEFECT AND CALLING IT ONE WOULD BE WRONG, which
 * is worth writing down because a gate reviewer reported it as "the identical
 * 705,857-block defect, still live". Q6's shape is a default written TWICE that
 * DISAGREES on testnet, and the guard's fix is to delete one copy. Here the two
 * copies AGREE - both are the mainnet constant - so deleting the `.env.example`
 * line changes no behaviour at all and would leave the actual exposure
 * untouched. The exposure is that the publisher is mainnet-only BY
 * CONSTRUCTION, which is a product decision to take or reject in
 * `apps/publisher`, not a duplicate to remove. It is recorded in HANDOFF-13
 * section 8 as a question rather than fixed by a guard that cannot see it.
 *
 * WHY A SIBLING RATHER THAN A FOURTH RULE INSIDE `check-compose.mjs`, decided
 * by measurement rather than by taste. The brief proposed extending it, on the
 * premise that "both files are already parsed by check-compose.mjs, so the
 * reach exists". That premise is FALSE and was checked before it was built on:
 * `check-compose.mjs` declares `COMPOSE_FILES = ["docker-compose.yml",
 * "docker-compose.dev.yml"]` and reads nothing else; `.env.example` is read by
 * `check-redis-safety.mjs`, one guard over. So there was no reach to extend.
 * Three further reasons, in order of weight:
 *   1. The SUBJECT of this rule is a TypeScript module. None of that script's
 *      three rules reads TypeScript at all - its only reader is a YAML
 *      service-block splitter, and its own docblock scopes it "over the compose
 *      files". The compose half of this rule is its cheap half.
 *   2. That script is 685 lines behind one shared self-test. Three of this
 *      project's seventeen guards have shipped with a self-test that certified
 *      a hole; adding a fourth concern with its own discovery, its own file
 *      class and its own data table makes that self-test's coverage argument
 *      harder to hold, not easier.
 *   3. A separate `pnpm check` step names the rule on its own line, which is
 *      how every other guard here is wired and what an operator reads on a red
 *      build.
 *
 * NOTHING IS LISTED THAT CAN BE DISCOVERED. The config modules, the compose
 * files and the `.env.example` templates are all found by walking the tree, and
 * the network fields are read out of each module. A guard carrying its own copy
 * of a list is wrong the moment the tree gains a member - the origin this
 * project has counted four faces of (LEDGER-09b Q3), which is one more than the
 * recurrence rule needs.
 *
 * Usage:  node scripts/check-config-defaults.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".turbo", "dist", "build", "coverage", "__tests__"]);
const SEARCH_ROOTS = ["apps", "packages"];

/* -------------------------------------------------------------------------- */
/* Reading TypeScript without a TypeScript parser.                             */
/* -------------------------------------------------------------------------- */

/**
 * Blank out comments, preserving every offset.
 *
 * A NAIVE `//` STRIP DESTROYS THIS TREE AND THE FIRST DRAFT DID EXACTLY THAT.
 * `apps/indexer/src/config.ts` line 6 is
 *   ZEBRAD_RPC_URL: z.string().url().default("http://127.0.0.1:8232"),
 * and the `//` inside that URL is not a comment. Truncating there removes the
 * closing paren and the comma, so every key after it on that line is lost and
 * the brace depth is wrong for the rest of the file. So this is a scanner that
 * tracks string, template and comment state rather than a regex.
 *
 * Comments become SPACES rather than being deleted, so offsets are preserved
 * and a later index into the blanked text still points at the same character of
 * the original.
 */
export function blankComments(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < n) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/**
 * Blank out string literals, preserving offsets and the quote characters.
 *
 * Used ONLY for the dependency test, so that a value expression mentioning the
 * network field inside an error message or a URL is not read as a reference to
 * it. Kept separate from `blankComments` because the network-field DISCOVERY
 * half needs the string contents - `z.enum(["mainnet", "testnet"])` is entirely
 * string data.
 */
export function blankStrings(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") {
          out[i] = " ";
          i += 1;
        }
        if (i < n && src[i] !== "\n") out[i] = " ";
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/**
 * Every `NAME: z.enum([... "mainnet" ... "testnet" ...])` key in a module,
 * WHERE NAME IS AN ENVIRONMENT VARIABLE.
 *
 * THE SCREAMING_SNAKE REQUIREMENT IS NOT COSMETIC AND THE FIRST DRAFT WITHOUT
 * IT WAS MISLEADING ABOUT ITS OWN REACH. Two DTO schemas carry a lowercase
 * `network: z.enum(["mainnet", "testnet"])` field - `packages/content/src/schema.ts`
 * and `packages/zec-types/src/views.ts` - and neither is a config module: that
 * field is DATA ON A WIRE TYPE, parsed from a snapshot rather than from
 * `process.env`. Counting them made the guard print "4 config module(s)" for a
 * tree with three (indexer, gateway, publisher), two of which it covers and one
 * of which it does not - a coverage number that reads as more than it is, which
 * is the defect this project files against its own reports more than any other.
 *
 * The narrowing is by CONVENTION rather than by filename, deliberately.
 * CLAUDE.md's "Env names" section makes every variable in this project
 * SCREAMING_SNAKE, and the dependent-key search below is already restricted the
 * same way, so accepting a lowercase network field was an inconsistency as well
 * as a noise source. Narrowing by filename instead - "only `config.ts`" - would
 * be a LIST wearing a pattern's clothes, and would go blind on a rename, which
 * is the silent-vacuous-pass shape a directory rename already cost this project
 * once (LEDGER-09a Q3).
 *
 * THE COST, STATED: a config module whose network field is lowercase is
 * invisible here. It would also be the first variable in this repository not
 * named by the convention, and the module count printed on every run is where a
 * reader would see the absence.
 */
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export function networkFieldsIn(moduleText) {
  const text = blankComments(moduleText);
  const found = new Set();
  const RE = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*z\s*\.\s*enum\s*\(\s*\[([^\]]*)\]/g;
  for (const m of text.matchAll(RE)) {
    const members = m[2];
    if (!ENV_NAME.test(m[1])) continue;
    if (/["']mainnet["']/.test(members) && /["']testnet["']/.test(members)) found.add(m[1]);
  }
  return found;
}

/**
 * The value expression of every SCREAMING_SNAKE property key in a module.
 *
 * Returns a Map name -> array of expressions, because a name legitimately
 * appears more than once: `INDEXER_START_HEIGHT` is a key of the zod schema
 * (value `z.preprocess(...)`), a key of the resolved object (value
 * `parsed.INDEXER_START_HEIGHT ?? (...)`), and a member of the `Config` type
 * (value `number`). The rule takes the UNION - a variable is network-dependent
 * if ANY of its value expressions reads the network field - so no region has to
 * be identified and the resolver does not have to be found by name. That is
 * deliberate: a rule that had to locate `loadConfig` would go blind the day
 * somebody renamed it, which is the silent-vacuous-pass shape a directory
 * rename already cost this project once.
 */
export function valueExpressions(moduleText) {
  const text = blankComments(moduleText);
  const out = new Map();
  const KEY = /(^|[^A-Za-z0-9_$.])([A-Z][A-Z0-9_]*)\s*:/g;
  for (const m of text.matchAll(KEY)) {
    const name = m[2];
    let i = m.index + m[0].length;
    let depth = 0;
    const start = i;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth -= 1;
      } else if ((c === "," || c === ";") && depth === 0) break;
    }
    if (!out.has(name)) out.set(name, []);
    out.get(name).push(text.slice(start, i));
  }
  return out;
}

/** THE DISCOVERY HALF. Which variables does this module default from its network? */
export function networkDependentIn(moduleText) {
  const fields = networkFieldsIn(moduleText);
  const dependent = new Set();
  if (fields.size === 0) return { fields, dependent };
  for (const [name, exprs] of valueExpressions(moduleText)) {
    if (fields.has(name)) continue; // the network field's own value is not a dependency on itself
    for (const expr of exprs) {
      const code = blankStrings(expr);
      for (const field of fields) {
        if (new RegExp(`(^|[^A-Za-z0-9_$])${field}([^A-Za-z0-9_$]|$)`).test(code)) {
          dependent.add(name);
        }
      }
    }
  }
  return { fields, dependent };
}

/* -------------------------------------------------------------------------- */
/* The two surfaces that cannot read the network.                              */
/* -------------------------------------------------------------------------- */

/**
 * A boolean per line: is this line inside an `environment:` block?
 *
 * Indentation-based, like `check-compose.mjs`'s service splitter and for the
 * same reason - this file stays dependency-free so it can run before
 * `pnpm install`, as every guard here does. A line is inside when it is more
 * indented than the `environment:` key that opened the block, and the block ends
 * at the first non-blank line indented at or below that key.
 *
 * WHY IT EXISTS. The list form `- NAME=value` is not unique to `environment:` -
 * compose spells `build.args`, `labels` and others the same way - so a list
 * reader with no block awareness reports a BUILD ARGUMENT as an environment
 * default. Measured by a round-2 reviewer. The map form stays unrestricted:
 * `NAME: value` outside `environment:` is not a shape this rule's variables
 * appear in, and narrowing it would lose the bare form the self-test drives.
 */
export function environmentLineFlags(text) {
  const lines = text.split("\n");
  const flags = new Array(lines.length).fill(false);
  let openIndent = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    if (openIndent !== -1 && indent > openIndent) {
      flags[i] = true;
      continue;
    }
    openIndent = /^\s*environment:\s*$/.test(line) ? indent : -1;
  }
  return flags;
}

/**
 * Every balanced `${...}` on one line, as {name, op, rest}.
 *
 * BALANCED RATHER THAN REGEX, because compose permits nesting and the whole
 * question here is what is left when the nesting is removed:
 * `${A:-${B}}` has no literal default and `${A:-3428143}` has one, and a
 * regex with `[^{}]*` cannot tell them apart - it simply fails to match the
 * first, which reads as "no default" by accident rather than by decision.
 */
export function interpolationsIn(line) {
  const out = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    if (line[i] !== "$" || line[i + 1] !== "{") continue;
    let depth = 0;
    let j = i + 1;
    for (; j < line.length; j += 1) {
      if (line[j] === "{") depth += 1;
      else if (line[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (j >= line.length) continue; // unbalanced; not an interpolation compose would accept
    const body = line.slice(i + 2, j);
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(:?[-+?])?([\s\S]*)$/.exec(body);
    if (m !== null) out.push({ name: m[1], op: m[2] ?? "", rest: m[3] ?? "" });
    i = j;
  }
  return out;
}

/** Remove every nested `${...}` from an interpolation's default text. */
function withoutNested(rest) {
  let out = rest;
  for (let guard = 0; guard < 20; guard += 1) {
    const before = out;
    out = out.replace(/\$\{[^{}]*\}/g, "");
    if (out === before) break;
  }
  return out;
}

const HAS_VALUE = (s) => /[A-Za-z0-9]/.test(s);

/**
 * Does this compose line give NAME a literal default?
 *
 * THE FOUR VALUE-BEARING OPERATOR FORMS ARE THE SUBJECT AND THE OTHER TWO ARE
 * NOT, which is the same split `check-compose.mjs` measured with
 * `docker compose config` and recorded:
 *   ${VAR}                     no value           - fine
 *   ${VAR:?msg} ${VAR?msg}     msg is PROSE       - fine
 *   ${VAR:-d}   ${VAR-d}       d is a VALUE       - a literal default
 *   ${VAR:+a}   ${VAR+a}       a is a VALUE       - a literal default
 * plus the bare form `NAME: 3428143`, which is a default with no operator at
 * all and is the form an editor reaches for first.
 */
export function composeLiteralFor(line, name, inEnvironment = true) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;
  for (const { name: n, op, rest } of interpolationsIn(line)) {
    if (n !== name) continue;
    if (op === "" || op === ":?" || op === "?") continue;
    const literal = withoutNested(rest).trim();
    if (HAS_VALUE(literal)) return { form: `\${${name}${op}...}`, literal };
  }
  // THE MAP FORM `NAME: value`, THROUGH THE SHARED VALUE PARSER. It used to read
  // its value inline, which is why it was the one reader with no comment strip
  // and no quote strip - see `valueTextOf`.
  const bare = new RegExp(`^${name}\\s*:\\s*([\\s\\S]*)$`).exec(trimmed);
  if (bare !== null && !bare[1].includes("${")) {
    const value = valueTextOf(bare[1]);
    if (value !== null) return { form: `${name}: <bare>`, literal: value };
  }
  // COMPOSE HAS TWO `environment:` SYNTAXES AND THE FIRST DRAFT READ ONE.
  // The map form is `NAME: value`; the LIST form is `- NAME=value`, and both are
  // valid and common. A guard that sees only the map form is silent on a file
  // that is not unusual - found by a gate reviewer writing a valid list-form
  // compose file into a shadow tree and watching the run stay green. The
  // interpolation loop above already covers `- NAME=${NAME:-x}`, because it
  // scans the whole line; this is the literal half.
  const listItem = /^-\s*([\s\S]*)$/.exec(trimmed);
  if (listItem !== null && !listItem[1].includes("${") && inEnvironment) {
    const value = literalValueOf(listItem[1], name);
    if (value !== null) return { form: `- ${name}=<value>`, literal: value };
  }
  return null;
}

/**
 * THE VALUE HALF OF `NAME=VALUE`, SHARED BY BOTH SURFACES.
 *
 * WHY IT IS ONE FUNCTION NOW. The commit that added compose's list form
 * (`- NAME=value`) wrote its own value parser, and in doing so RE-CREATED, in
 * the list branch, the exact defect the SAME COMMIT fixed on the env surface:
 * `- V=   # set this per network` was read as a literal default whose value was
 * the comment prose. Two sibling branches, one commit, one fix and one
 * re-introduction - which is the clause (ii) shape stated exactly, and it was
 * found by a round-2 reviewer reading that commit against itself.
 *
 * It also could not read a WHOLE-ENTRY quote - `- "NAME=3428143"`, a standard
 * compose spelling - because its key regex was anchored at the name while the
 * quote stripping ran on the value. A guard blind to a common spelling of the
 * thing it forbids is the LEDGER-09a "assertion satisfied by every value it was
 * written to exclude" shape wearing a parser's clothes.
 *
 * So: one parser, two callers, and the fail sides below drive both.
 */
export function literalValueOf(assignment, name) {
  // A whole-entry quote wraps `NAME=VALUE` together. Unwrap before splitting,
  // which is what the list branch could not do.
  let text = assignment.trim();
  const whole = /^(["'])([\s\S]*)\1$/.exec(text);
  if (whole !== null) text = whole[2].trim();
  const m = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*([\\s\\S]*)$`).exec(text);
  if (m === null) return null;
  return valueTextOf(m[1]);
}

/**
 * THE VALUE ITSELF, SHARED BY ALL THREE READERS - env `V=x`, compose list
 * `- V=x` and compose map `V: x`.
 *
 * AN INLINE COMMENT IS NOT A VALUE. `V=   # leave unset` is what an operator
 * writes when they mean "deliberately blank". A QUOTED value keeps its `#`,
 * because inside quotes it is data - but the quotes are stripped from the VALUE
 * ONLY after any trailing comment outside them is removed, which an early draft
 * got wrong and reported `3428143" # mainnet` as the literal. The `(^|\s)#`
 * predicate is right on both surfaces: YAML and dotenv both require a `#` to
 * begin a line or follow whitespace before it opens a comment, so `3428143#x`
 * stays a value on either.
 *
 * WHY IT IS A THIRD EXTRACTION AND NOT A SECOND. `literalValueOf` was already
 * factored out once, when the compose LIST branch re-created the env branch's
 * comment defect inside the very commit that fixed it. That extraction reached
 * two of the three readers and left the compose MAP branch - `V: x`, the OLDEST
 * of the three - parsing its value inline with no comment strip and no quote
 * strip at all. So the correction landed at two sites of three, which
 * LEDGER-03 Q3 rates a HIGH finding in its own right: `V: # leave unset` FAILED
 * THE BUILD naming comment prose as the literal default, and `V: "3428143" #
 * mainnet` reported `"3428143" # mainnet` as the value. Found by a round-2
 * reviewer reading the round-1 fix against its own third site.
 *
 * THE LESSON IS THE ORIGIN, NOT THE FACE (LEDGER-09b Q3): "a value parser is
 * duplicated per surface" has now produced three faces in three commits. One
 * parser, three callers, and the SHAPES table drives every caller over every
 * form so a fourth surface cannot arrive with its own copy unnoticed.
 */
export function valueTextOf(raw) {
  const text = raw.trim();
  const q = /^(["'])([\s\S]*?)\1\s*(?:#.*)?$/.exec(text);
  const value = q !== null ? q[2].trim() : text.replace(/(^|\s)#.*$/, "").trim();
  return HAS_VALUE(value) ? value : null;
}

/** Does this `.env.example` line assign NAME a non-empty value, uncommented? */
export function envLiteralFor(line, name) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;
  const value = literalValueOf(trimmed, name);
  if (value === null) return null;
  return { form: `${name}=<value>`, literal: value };
}

/* -------------------------------------------------------------------------- */
/* Discovery.                                                                  */
/* -------------------------------------------------------------------------- */

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Config modules: any non-test `.ts` declaring a mainnet/testnet enum field. */
function discoverConfigModules() {
  const found = [];
  for (const root of SEARCH_ROOTS) {
    if (!existsSync(root)) continue;
    for (const file of walk(root, [])) {
      if (!file.endsWith(".ts") || file.endsWith(".d.ts") || /\.test\.ts$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("z.enum(")) continue;
      if (networkFieldsIn(text).size === 0) continue;
      found.push({ file, text });
    }
  }
  return found;
}

/**
 * WALKED FROM THE REPOSITORY ROOT, NOT FROM A LIST OF DIRECTORIES.
 *
 * The first draft read the root with `readdirSync(".")` and then walked only
 * `apps/` and `packages/`, so a compose file or an env template anywhere else -
 * `infra/`, which this repository already uses for deployment configuration -
 * was silently outside the scan. There is no live gap today (all four real
 * surfaces are under the old scope, measured against `git ls-files`), and that
 * is exactly the condition under which a reach gap ships: nothing fails, so
 * nothing says. Found by a gate reviewer writing a compose file into `infra/`
 * and watching the count stay at two.
 */
function discoverSurfaces() {
  const compose = [];
  const env = [];
  for (const file of walk(".", [])) {
    const rel = file.startsWith("./") ? file.slice(2) : file;
    if (/(^|\/)docker-compose.*\.ya?ml$/.test(rel)) compose.push(rel);
    if (rel === ".env.example" || rel.endsWith("/.env.example")) env.push(rel);
  }
  return { compose: compose.sort(), env: env.sort() };
}

/** THE RULE, over one already-read tree. Returns findings. */
export function scan(modules, surfaces) {
  const findings = [];
  const dependent = new Map(); // name -> module file
  let networkFieldCount = 0;
  for (const { file, text } of modules) {
    const { fields, dependent: dep } = networkDependentIn(text);
    networkFieldCount += fields.size;
    for (const name of dep) dependent.set(name, file);
  }
  for (const [name, module] of dependent) {
    for (const { file, text } of surfaces.compose) {
      const envLines = environmentLineFlags(text);
      text.split("\n").forEach((line, i) => {
        const hit = composeLiteralFor(line, name, envLines[i] === true);
        if (hit !== null) {
          findings.push({
            file,
            line: i + 1,
            name,
            module,
            surface: "compose",
            message:
              `${file}:${i + 1} gives ${name} the literal default "${hit.literal}" as ${hit.form}, and ` +
              `${module} computes ${name} from its network field. Compose cannot read a sibling variable, so a ` +
              `constant here applies on EVERY network and wins wherever the operator left the variable alone. ` +
              `(This guard sees an identifier REFERENCE, not a data flow: if ${name} is validated against the ` +
              `network rather than defaulted from it, the reference is the same and the remedy is not - say so ` +
              `here rather than deleting a value the stack needs.)`,
          });
        }
      });
    }
    for (const { file, text } of surfaces.env) {
      text.split("\n").forEach((line, i) => {
        const hit = envLiteralFor(line, name);
        if (hit !== null) {
          findings.push({
            file,
            line: i + 1,
            name,
            module,
            surface: "env",
            message:
              `${file}:${i + 1} sets ${name}="${hit.literal}", and ${module} computes ${name} from its network ` +
              `field. Section 1 of the VPS runbook opens with \`cp .env.example .env\`, so this constant reaches ` +
              `every deployment whether or not the operator chose it; commenting the line out is the usual remedy. ` +
              `(This guard sees an identifier REFERENCE, not a data flow: if ${name} is validated against the ` +
              `network rather than defaulted from it, the reference is the same and the remedy is not.)`,
          });
        }
      });
    }
  }
  return { findings, dependent, networkFieldCount };
}

/* -------------------------------------------------------------------------- */
/* Self-test: the rule's own data, in both directions, then the real tree.     */
/* -------------------------------------------------------------------------- */

/**
 * EVERY VALUE SHAPE EITHER SURFACE CAN CARRY, AS DATA. The self-test iterates
 * this table rather than a hand-written list of calls, so a shape added here
 * cannot arrive untested, and `SURFACES`/`VERDICTS` below check the table
 * reaches both surfaces and both verdicts. That is the standard LEDGER-09a Q3
 * sets after three of this project's guards shipped a self-test certifying a
 * hole - and eleven of the twelve holes in `check-instrument-deps.mjs` were
 * found by executing a probe rather than by reading one.
 */
const SHAPES = [
  { surface: "compose", form: "${V:-d}", line: "      V: ${V:-3428143}", literal: true, value: "3428143", why: "the form that shipped the defect" },
  { surface: "compose", form: "${V-d}", line: "      V: ${V-3428143}", literal: true, value: "3428143", why: "the same operator without the colon" },
  { surface: "compose", form: "${V:+d}", line: "      V: ${V:+3428143}", literal: true, value: "3428143", why: "a value used when the variable IS set" },
  { surface: "compose", form: "${V+d}", line: "      V: ${V+3428143}", literal: true, value: "3428143", why: "and without the colon" },
  { surface: "compose", form: "bare", line: "      V: 3428143", literal: true, value: "3428143", why: "a bare literal with no operator at all" },
  { surface: "compose", form: "${V:-}", line: "      V: ${V:-}", literal: false, why: "the empty default - what the fix uses" },
  { surface: "compose", form: "${V}", line: "      V: ${V}", literal: false, why: "a plain reference" },
  { surface: "compose", form: "${V:?m}", line: "      V: ${V:?set V in .env}", literal: false, why: "the operand is PROSE, not a value" },
  { surface: "compose", form: "${V?m}", line: "      V: ${V?set V in .env}", literal: false, why: "and without the colon" },
  { surface: "compose", form: "nested", line: "      V: ${V:-${W}}", literal: false, why: "a nested reference is not a literal" },
  { surface: "compose", form: "commented", line: "      # V: ${V:-3428143}", literal: false, why: "a commented line is not configuration" },
  { surface: "compose", form: "other-variable", line: "      OTHER: ${OTHER:-3428143}", literal: false, why: "another variable's default is not this one's" },
  { surface: "compose", form: "- V=d", line: "      - V=3428143", literal: true, value: "3428143", why: "compose's LIST form, which the first draft could not read at all" },
  { surface: "compose", form: "- V=${V:-d}", line: "      - V=${V:-3428143}", literal: true, value: "3428143", why: "the list form carrying an operator default" },
  { surface: "compose", form: "- V=", line: "      - V=", literal: false, why: "a list entry assigning nothing" },
  { surface: "compose", form: "- V=d inline-comment", line: "      - V=   # set this per network", literal: false, why: "the defect the list branch RE-CREATED in the same commit that fixed it on the env surface" },
  { surface: "compose", form: "- quoted-whole", line: '      - "V=3428143"', literal: true, value: "3428143", why: "a whole-entry quote, a standard compose spelling the first list reader could not see at all" },
  { surface: "compose", form: "- quoted-value", line: "      - V='3428143'", literal: true, value: "3428143", why: "a quoted value inside an unquoted entry" },
  // THE MAP FORM'S VALUE SHAPES. The map branch was the third reader and the
  // last to reach the shared parser: it had no comment strip and no quote strip
  // at all, so every row below failed before `valueTextOf`. The first is the
  // one that broke a build - a deliberately-blank line reported as a literal
  // default whose value was the comment prose.
  { surface: "compose", form: "bare inline-comment", line: "      V:   # leave unset", literal: false, why: "the map form's copy of the defect fixed twice elsewhere - it FAILED the build on a deliberately blank line" },
  { surface: "compose", form: "bare value-then-comment", line: "      V: 3428143   # mainnet", literal: true, value: "3428143", why: "the verdict was right and the reported literal was `3428143   # mainnet` - a garbage value in an operator-facing message" },
  { surface: "compose", form: "bare quoted-then-comment", line: '      V: "3428143"   # mainnet', literal: true, value: "3428143", why: "reported `\"3428143\"   # mainnet`; the map branch stripped neither quotes nor comment" },
  { surface: "compose", form: "bare quoted-hash", line: '      V: "#3428143"', literal: true, value: "#3428143", why: "inside quotes a hash is data on this surface too" },
  { surface: "compose", form: "bare hash-in-value", line: "      V: 3428143#x", literal: true, value: "3428143#x", why: "YAML needs whitespace before a `#` to open a comment, so this stays a value - the predicate must not be a bare /#/" },
  { surface: "env", form: "V=d", line: "V=3428143", literal: true, value: "3428143", why: "the form .env.example shipped" },
  { surface: "env", form: "export V=d", line: "export V=3428143", literal: true, value: "3428143", why: "the exported spelling" },
  { surface: "env", form: "quoted", line: 'V="3428143"', literal: true, value: "3428143", why: "quoted is still a value" },
  { surface: "env", form: "#V=d", line: "#V=3428143", literal: false, why: "commented out - what the fix uses" },
  { surface: "env", form: "# V=d", line: "# V=3428143", literal: false, why: "commented with a space" },
  { surface: "env", form: "V=", line: "V=", literal: false, why: "assigned nothing" },
  { surface: "env", form: "prefix-collision", line: "VV=3428143", literal: false, why: "a longer name that merely starts with the same characters" },
  { surface: "env", form: "other-variable", line: "OTHER=3428143", literal: false, why: "another variable" },
  { surface: "env", form: "inline-comment", line: "V=   # leave unset", literal: false, why: "an inline comment is prose, not a value - it was read as one" },
  { surface: "env", form: "value-then-comment", line: "V=3428143   # the mainnet constant", literal: true, value: "3428143", why: "a real value keeps its verdict when a comment follows" },
  { surface: "env", form: "quoted-hash", line: 'V="#3428143"', literal: true, value: "#3428143", why: "inside quotes a hash is data, so the comment strip must not run" },
  { surface: "env", form: "quoted-then-comment", line: 'V="3428143"   # mainnet', literal: true, value: "3428143", why: "the quoted arm must strip the trailing comment too - it reported `3428143\" # mainnet` as the literal" },
];
const SURFACES = ["compose", "env"];
const VERDICTS = [true, false];

/**
 * THE RULE'S OWN DATA STRUCTURE, WHICH IS THE SET OF VALUE FORMS AND NOT THE
 * SET OF VERDICTS.
 *
 * The first draft checked coverage over (surface, verdict) pairs and that check
 * was VACUOUS in exactly the way this project has measured before: deleting the
 * `#V=d` row left it green, because three other env rows also carry
 * literal=false, so "some row reaches this verdict" was still satisfied while
 * one whole operator form had stopped being tested. Found by re-running a
 * mutation probe that had first appeared to be caught - it was caught by the
 * working directory rather than by the check, which is the "check the probe
 * before judging the code" rule pointed at this script's own self-test.
 *
 * So the coverage check iterates THESE, and it runs in both directions: every
 * declared form must have a row (a new form cannot arrive untested) and every
 * row's form must be declared (a typo cannot buy coverage for a form nobody
 * listed). That is the LEDGER-09a Q3 standard, and it is the fourth time on
 * this project that a guard's self-test was found certifying a hole - the first
 * three shipped.
 */
const COMPOSE_FORMS = ["${V}", "${V:-d}", "${V-d}", "${V:+d}", "${V+d}", "${V:?m}", "${V?m}", "${V:-}", "bare", "nested", "commented", "other-variable", "- V=d", "- V=${V:-d}", "- V=", "- V=d inline-comment", "- quoted-whole", "- quoted-value", "bare inline-comment", "bare value-then-comment", "bare quoted-then-comment", "bare quoted-hash", "bare hash-in-value"];
const ENV_FORMS = ["V=d", "export V=d", "quoted", "#V=d", "# V=d", "V=", "prefix-collision", "other-variable", "inline-comment", "value-then-comment", "quoted-hash", "quoted-then-comment"];

/**
 * A synthetic config module carrying every discovery case at once, so the
 * TypeScript half is driven over data too rather than only over the real tree.
 */
const SYNTHETIC_MODULE = [
  'import { A, B } from "@zcashreveal/instruments";',
  "const Schema = z.object({",
  '  RPC_URL: z.string().url().default("http://127.0.0.1:8232"),',
  '  NET: z.enum(["mainnet", "testnet"]).default("mainnet"),',
  "  // A comment naming NET must not make a variable network-dependent.",
  "  COMMENTED: z.coerce.number().default(1),",
  '  STRINGED: z.string().default("set NET first"),',
  "  PLAIN: z.coerce.number().int().positive().optional(),",
  "  INLINE_COMMENTED: z.coerce.number().default(/* falls back to NET's height */ 1),",
  "  TRAILING_COMMENTED: z.coerce",
  "    .number()",
  "    // resolved against NET somewhere else entirely",
  "    .default(1),",
  "  DEPENDENT: z.coerce.number().int().positive().optional(),",
  "  DEEP: z.coerce.number().int().positive().optional(),",
  "});",
  "// A DTO WIRE FIELD, NOT AN ENVIRONMENT VARIABLE: lowercase, and it must not be",
  "// discovered as a network field. Two real files in this tree have exactly this",
  "// shape, and counting them overstated the guard's own reach.",
  "const Dto = z.object({",
  '  network: z.enum(["mainnet", "testnet"]),',
  "});",
  "export function loadConfig(env) {",
  "  const parsed = Schema.parse(env);",
  "  return {",
  "    ...parsed,",
  "    DEPENDENT: parsed.DEPENDENT ?? (parsed.NET === \"mainnet\" ? A : B),",
  // THE FORM THAT REQUIRES DEPTH TRACKING, and it is not decoration: the value
  // expression carries a comma INSIDE the call, so a scanner that stops at the
  // first comma regardless of nesting reads this expression as
  // `resolveHeight(parsed.DEEP` and concludes DEEP is not network-dependent.
  // That is a FALSE NEGATIVE - the dangerous direction - and a helper-function
  // resolver is the first thing a later session would reach for. Neither the
  // synthetic module's other rows nor the real indexer config contains a comma
  // inside a value expression, so the depth term was unreachable by outcome
  // until this row existed: measured by deleting `&& depth === 0` and watching
  // a full run stay green.
  "    DEEP: resolveHeight(parsed.DEEP, parsed.NET),",
  "  };",
  "}",
].join("\n");

function selfTest() {
  // 1. THE SHAPE TABLE, both surfaces, both verdicts.
  // A literal row without an expected value is a row that cannot see a parser
  // reporting garbage. Structural, so a new row cannot arrive verdict-only.
  for (const shape of SHAPES) {
    if (shape.literal && typeof shape.value !== "string") {
      return `the ${shape.surface} row ${JSON.stringify(shape.line)} declares literal=true and no expected value - ` +
        "a verdict-only row is satisfied by every value it was written to exclude";
    }
  }
  for (const shape of SHAPES) {
    const got = shape.surface === "compose" ? composeLiteralFor(shape.line, "V") : envLiteralFor(shape.line, "V");
    const isLiteral = got !== null;
    if (isLiteral !== shape.literal) {
      return `the ${shape.surface} shape ${JSON.stringify(shape.line)} (${shape.why}) was read as ` +
        `${isLiteral ? "a literal default" : "no default"}, expected the opposite`;
    }
    // THE VALUE, NOT ONLY THE VERDICT. Every row here exists to test a VALUE
    // PARSER, and for 35 rows this loop compared a BOOLEAN and nothing else - so
    // a row was satisfied by exactly the values it was written to exclude, which
    // is this project's most-recorded defect shape wearing a self-test's
    // clothes. Measured: after the map form was routed through the shared
    // parser, dropping the quote arm and widening the comment predicate to a
    // bare /#/ BOTH left every row green, because neither changes a verdict -
    // only the reported string. The operator reads that string.
    if (shape.literal && got.literal !== shape.value) {
      return `the ${shape.surface} shape ${JSON.stringify(shape.line)} (${shape.why}) was correctly read as a ` +
        `literal default, and its VALUE was ${JSON.stringify(got.literal)} where the rule gives ` +
        `${JSON.stringify(shape.value)} - the verdict-only check could not see this`;
    }
  }
  for (const surface of SURFACES) {
    for (const verdict of VERDICTS) {
      if (!SHAPES.some((s) => s.surface === surface && s.literal === verdict)) {
        return `no SHAPES row exercises ${surface} with literal=${verdict}`;
      }
    }
  }
  // COVERAGE OVER THE FORMS, IN BOTH DIRECTIONS. This is the check that the
  // verdict-pair version above could not make; see the COMPOSE_FORMS docblock.
  for (const [surface, forms] of [["compose", COMPOSE_FORMS], ["env", ENV_FORMS]]) {
    for (const form of forms) {
      if (!SHAPES.some((s) => s.surface === surface && s.form === form)) {
        return `no SHAPES row exercises the ${surface} value form ${JSON.stringify(form)}`;
      }
    }
    for (const row of SHAPES.filter((s) => s.surface === surface)) {
      if (!forms.includes(row.form)) {
        return `the ${surface} row ${JSON.stringify(row.line)} declares form ${JSON.stringify(row.form)}, ` +
          `which is not in the declared form list - a row cannot buy coverage for a form nobody listed`;
      }
    }
  }

  // 1b. THE ENVIRONMENT-BLOCK TRACKER, OVER A FIXTURE THAT CONTAINS ITS OWN
  //     COUNTER-EXAMPLE. Added because a round-2 mutation showed the block
  //     awareness had NO self-test at all: deleting `&& inEnvironment` and
  //     making the tracker return true for every line both survived a full run,
  //     because every SHAPES row is a bare line with no block context and
  //     `composeLiteralFor` defaults `inEnvironment` to true. A guard clause
  //     with no probe is a guard clause nobody is testing.
  const ENV_BLOCK_FIXTURE = [
    "services:",
    "  indexer:",
    "    build:",
    "      args:",
    "        - V=3428143",      // NOT environment - a build argument
    "    labels:",
    "      - V=3428143",        // NOT environment - a label
    "    environment:",
    "      - V=3428143",        // environment
    "      - W=1",              // environment
    "    ports:",
    '      - "8080:80"',        // NOT environment
  ];
  const flags = environmentLineFlags(ENV_BLOCK_FIXTURE.join("\n"));
  const expected = [false, false, false, false, false, false, false, false, true, true, false, false];
  for (let i = 0; i < expected.length; i += 1) {
    if (flags[i] !== expected[i]) {
      return `the environment-block tracker put line ${i + 1} (${JSON.stringify(ENV_BLOCK_FIXTURE[i].trim())}) ` +
        `${flags[i] ? "INSIDE" : "OUTSIDE"} an environment block, expected the opposite`;
    }
  }
  // And the two halves together: the same text, read as a compose file, must
  // report the environment entry and NOT the build argument or the label.
  const envHits = ENV_BLOCK_FIXTURE.map((line, i) => composeLiteralFor(line, "V", flags[i] === true)).filter((h) => h !== null);
  if (envHits.length !== 1) {
    return `the list reader found ${envHits.length} literal default(s) for V in the block fixture, expected exactly 1 - ` +
      "the build argument and the label must not count, and the environment entry must";
  }

  // 2. THE DISCOVERY HALF, over the synthetic module.
  const syn = networkDependentIn(SYNTHETIC_MODULE);
  if (!syn.fields.has("NET")) return "the synthetic module's NET field was not recognised as a network enum";
  if (syn.fields.has("network")) {
    return "the synthetic module's lowercase DTO field `network` was discovered as a network field - " +
      "a wire type read from a snapshot is not an environment variable, and counting it overstates this guard's reach";
  }
  if (syn.fields.size !== 1) return `the synthetic module yielded ${syn.fields.size} network fields, expected 1`;
  if (!syn.dependent.has("DEPENDENT")) return "the synthetic module's DEPENDENT was not found to read NET";
  if (!syn.dependent.has("DEEP")) {
    return "the synthetic module's DEEP was not found to read NET - its value expression carries a comma " +
      "inside the call, so the value-expression scanner is not tracking bracket depth and every helper-style " +
      "resolver is a FALSE NEGATIVE";
  }
  const REASONS = {
    COMMENTED: "a line COMMENT above the key naming the field",
    INLINE_COMMENTED: "a BLOCK COMMENT inside the value expression naming the field",
    TRAILING_COMMENTED: "a LINE COMMENT inside a multi-line value expression naming the field",
    STRINGED: "a STRING naming the field",
  };
  for (const innocent of ["RPC_URL", "COMMENTED", "INLINE_COMMENTED", "TRAILING_COMMENTED", "STRINGED", "PLAIN", "NET"]) {
    if (syn.dependent.has(innocent)) {
      return `${innocent} was wrongly classified as network-dependent in the synthetic module ` +
        `(${REASONS[innocent] ?? "no reference to the field at all"})`;
    }
  }

  // THE COMMENT BLANKER, IN BOTH DIRECTIONS, AND THE FIRST DRAFT COULD ONLY
  // TEST ONE OF THEM. It asserted that `RPC_URL` survives blanking - which is
  // true whether the blanker works or is disabled entirely, so disabling the
  // `//` branch left the whole self-test green. Measured, not reasoned: the
  // mutation survived a full run. Both polarities are needed because the two
  // failure modes are opposite. A blanker that is too EAGER eats the rest of a
  // line containing a URL, and every key after it on that line vanishes from
  // the scan. A blanker that is too LAZY leaves comments in, and a value
  // expression is then "network-dependent" because somebody mentioned the
  // network field in prose.
  const blanked = blankComments(SYNTHETIC_MODULE);
  if (blanked.length !== SYNTHETIC_MODULE.length) return "blankComments did not preserve offsets";
  if (!blanked.includes("8232")) return "blankComments ate a line containing a URL - the `//` in http:// is not a comment";
  if (!blanked.includes("NET:")) return "blankComments ate the network field";
  if (/falls back to/.test(blanked)) return "blankComments left a BLOCK comment in place";
  if (/resolved against/.test(blanked)) return "blankComments left a LINE comment in place";
  const strung = blankStrings(SYNTHETIC_MODULE);
  if (strung.length !== SYNTHETIC_MODULE.length) return "blankStrings did not preserve offsets";
  if (/set NET first/.test(strung)) return "blankStrings left a string literal in place";
  if (!strung.includes("STRINGED")) return "blankStrings ate a key";

  // 3. A CODE MUTATION OF THE SYNTHETIC MODULE: delete the reference and the
  //    dependency must disappear. This is what proves the detector reads the
  //    reference rather than the NAME.
  const mutated = SYNTHETIC_MODULE.replace('parsed.NET === "mainnet" ? A : B', "A");
  if (mutated === SYNTHETIC_MODULE) return "the synthetic mutation matched nothing - the probe is stale";
  if (networkDependentIn(mutated).dependent.has("DEPENDENT")) {
    return "DEPENDENT stayed network-dependent after its only reference to NET was removed";
  }

  return null;
}

/**
 * DRIVEN OVER THE REAL TREE, WITH DATA MUTATIONS DRAWN FROM THE EXCLUDED SET.
 *
 * The shape table above is synthetic by construction. This half takes the tree
 * as it actually is, re-injects the literal that ACTUALLY SHIPPED - the mainnet
 * constant on `INDEXER_START_HEIGHT` - into each surface IN MEMORY, and
 * requires a finding naming that variable and that file. Nothing is written.
 *
 * Reported as THREE OUTCOMES and the third is not a pass: if the tree has no
 * network-dependent variable at all, this probe cannot run, and saying "not
 * run" is the only honest thing to print. A probe that silently does not
 * discriminate and a guard that is inert produce the same output, and this
 * project has now had five malformed probes that each first looked like an
 * inert guard.
 */
function realTreeProbe(modules, surfaces) {
  const { dependent } = scan(modules, surfaces);
  if (dependent.size === 0) {
    return { outcome: "NOT-RUN", reason: "no network-dependent variable exists in the tree, so no literal can be injected" };
  }
  const [name] = [...dependent.keys()];
  const injected = [];
  for (const { file, text } of surfaces.compose) {
    if (!text.includes(name)) continue;
    const mutated = text.replace(new RegExp(`\\$\\{${name}:-\\}`), `\${${name}:-3428143}`);
    if (mutated === text) continue;
    const { findings } = scan(modules, { compose: [{ file, text: mutated }], env: [] });
    if (!findings.some((f) => f.name === name && f.file === file)) {
      return { outcome: "FAILED", reason: `injecting a literal default for ${name} into ${file} produced no finding` };
    }
    injected.push(`${file} (compose)`);
  }
  for (const { file, text } of surfaces.env) {
    if (!new RegExp(`^#\\s*${name}=`, "m").test(text)) continue;
    const mutated = text.replace(new RegExp(`^#\\s*${name}=.*$`, "m"), `${name}=3428143`);
    if (mutated === text) continue;
    const { findings } = scan(modules, { compose: [], env: [{ file, text: mutated }] });
    if (!findings.some((f) => f.name === name && f.file === file)) {
      return { outcome: "FAILED", reason: `uncommenting ${name} with a value in ${file} produced no finding` };
    }
    injected.push(`${file} (env)`);
  }
  if (injected.length === 0) {
    return { outcome: "NOT-RUN", reason: `${name} appears in no surface in a form this probe knows how to mutate` };
  }
  return { outcome: "RAN", reason: `${name} re-injected into ${injected.join(", ")}, each caught` };
}

/* -------------------------------------------------------------------------- */

const failure = selfTest();
if (failure !== null) {
  console.error(`[config-defaults] SELF-TEST FAILED: ${failure}`);
  process.exit(1);
}

const modules = discoverConfigModules();
const names = discoverSurfaces();
const surfaces = {
  compose: names.compose.map((file) => ({ file, text: readFileSync(file, "utf8") })),
  env: names.env.map((file) => ({ file, text: readFileSync(file, "utf8") })),
};

if (modules.length === 0) {
  console.error(
    "[config-defaults] FAIL: no config module declaring a mainnet/testnet enum was found under " +
      `${SEARCH_ROOTS.join(", ")}. This repository runs a network-specific indexer and gateway; a tree with ` +
      "none is a discovery that stopped matching, not a clean tree.",
  );
  process.exit(1);
}

const { findings, dependent, networkFieldCount } = scan(modules, surfaces);

if (networkFieldCount === 0) {
  console.error("[config-defaults] FAIL: config modules were found but none yielded a network field - the reader is inert.");
  process.exit(1);
}

// THE SURFACES NEED THE SAME FLOOR THE MODULES HAVE, and the paragraph that
// justifies the module floor argues for this one word for word: a discovery
// that stopped matching produces the same silence as a clean tree. Without it
// a broken `discoverSurfaces` prints "no literal default ... in 0 compose
// file(s) or 0 env template(s)" and exits 0, which reads as coverage.
if (names.compose.length === 0 || names.env.length === 0) {
  console.error(
    `[config-defaults] FAIL: discovery found ${names.compose.length} compose file(s) and ${names.env.length} env ` +
      "template(s). This repository has both; a tree with neither is a discovery that stopped matching, not a clean tree.",
  );
  process.exit(1);
}

const probe = realTreeProbe(modules, surfaces);
if (probe.outcome === "FAILED") {
  console.error(`[config-defaults] SELF-TEST FAILED against the real tree: ${probe.reason}`);
  process.exit(1);
}

for (const { file } of modules) {
  const { fields, dependent: dep } = networkDependentIn(readFileSync(file, "utf8"));
  console.log(
    `[config-defaults] scanned ${file}: network field(s) ${[...fields].join(", ") || "none"}; ` +
      `network-dependent default(s) ${[...dep].join(", ") || "none"}`,
  );
}
console.log(`[config-defaults] surfaces: ${names.compose.join(", ")} | ${names.env.join(", ")}`);
console.log(`[config-defaults] real-tree data-mutation probe: ${probe.outcome} - ${probe.reason}`);

if (findings.length > 0) {
  for (const f of findings) console.error(`[config-defaults] FAIL ${f.message}`);
  console.error(`[config-defaults] rc=1 over ${findings.length} literal default(s) for ${dependent.size} network-dependent variable(s).`);
  process.exit(1);
}

console.log(
  `[config-defaults] OK: ${dependent.size} network-dependent default(s) (${[...dependent.keys()].join(", ") || "none"}) ` +
    `across ${modules.length} config module(s); no literal default for any of them in ${names.compose.length} compose ` +
    `file(s) or ${names.env.length} env template(s). Self-test drove ${SHAPES.length} value shapes across both ` +
    "surfaces and both verdicts, and one synthetic module through discovery plus a code mutation of it; the real-tree " +
    `data mutation ${probe.outcome === "RAN" ? "RAN" : "did NOT run (" + probe.reason + ")"}. ` +
    "THIS PROVES A LITERAL IS ABSENT, NEVER THAT THE RESOLVER'S DEFAULT IS RIGHT - and a default that " +
    "reaches the network through an indirection no regex can follow is invisible to the discovery half, which is why " +
    "the discovered set is printed by name above.",
);
