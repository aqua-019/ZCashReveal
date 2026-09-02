#!/usr/bin/env node
/**
 * The Zebra image tag pinned in compose sits inside the version WINDOW this
 * repository has been read against - at or above the declared floor, and at or
 * below a ceiling declared here.
 *
 * ---------------------------------------------------------------------------
 * THE CEILING (HANDOFF-13 deliverable 0a, from LEDGER-12 Q3)
 * ---------------------------------------------------------------------------
 *
 * WHY A CEILING AT ALL. The floor stops a node too old to be right. Nothing
 * stopped an UPGRADE, and an upgrade is the direction an operator actually
 * moves: `docker compose pull` is a routine act, and the first thing this
 * project would learn about a breaking change upstream is a runtime detector
 * firing after the node had already been upgraded and resynced. The ceiling
 * inverts the default from "new is fine until proven otherwise" to "new is
 * UNEXAMINED until read", which is the posture this repository takes
 * everywhere else - the same reason an unreadable pin FAILS below.
 *
 * WHERE THE NUMBER COMES FROM, AND THE BRIEF'S REASON FOR IT WAS WRONG.
 * LEDGER-12 Q3 asked for a ceiling set EXCLUSIVE at the first released version
 * carrying ZcashFoundation/zebra PR #10461, on the stated grounds that #10461
 * "reverses the transaction-side anchor byte order and NOT getblock's or
 * z_gettreestate's roots". That characterisation was CHECKED BEFORE IT WAS
 * BUILT ON, against the merged diff rather than against the sentence, and it is
 * wrong in its first half:
 *
 *   - #10461 is `refactor(chain)!: replace Transaction enum with
 *     zcash_primitives newtype wrapper`, merged 22 Aug 2026 as `1c9b245`. It
 *     REPLACES Zebra's own V1-V6 `Transaction` enum with a librustzcash newtype
 *     across 106 files.
 *   - It does NOT flip the transaction-side anchor byte order. It PRESERVES the
 *     existing reversed display order while re-implementing it: the Orchard RPC
 *     anchor moves from `shared_anchor.bytes_in_display_order()` to wire-order
 *     bytes plus an explicit `.reverse()`, and on the Sapling path the
 *     `.reverse()` is an UNCHANGED CONTEXT LINE - only the accessor feeding it
 *     changed. Net rendered order is the same.
 *   - The second half of the claim IS correct: across the whole diff,
 *     `z_gettreestate`, `getblock`, `final_sapling_root`, `finalorchardroot` and
 *     `chain_history_root` occur zero times.
 *
 * SO THE CEILING IS KEPT AND ITS REASON IS RESTATED, because the real change is
 * a LARGER unexamined surface than the one the brief named, not a smaller one:
 * #10461 deletes `sapling_spends_per_anchor()` outright (28 removed call sites,
 * no added call site of that name) and switches RPC rendering to
 * `sapling_spends()`, which for V4 Sapling transactions changes which spend
 * iteration the RPC and consensus paths walk. Whether that is observable in
 * `getrawtransaction` output for a real mainnet transaction is UNVERIFIED here -
 * measuring it needs two builds and a corpus, which no session can run - and an
 * unmeasured change to the shape this project's decoder reads is exactly what a
 * ceiling is for.
 *
 * THE VALUE, AND WHY IT IS INCLUSIVE RATHER THAN EXCLUSIVE. Measured on 2 Sep
 * 2026 against a clone holding all 147 tags: `git tag --contains 1c9b245`
 * returns EMPTY, positively controlled - the same command on v6.3.0's commit
 * returns v6.3.0 plus its eight per-crate tags. #10461 merged twelve days after
 * v6.3.0 shipped and CHANGELOG.md on `main` has no Unreleased section, so there
 * is no released version to set an exclusive ceiling AT. That is precisely the
 * fallback LEDGER-12 Q3 names: pin at the highest tag this build has been read
 * against, INCLUSIVE. Today that is 6.3.0 - the same number as the floor, so
 * the window is currently a single point, which is a true statement about how
 * much of Zebra this repository has actually read and not an accident.
 *
 * THE BOUND KIND IS DATA, NOT A COMPARISON WRITTEN TWICE. `CEILING.inclusive`
 * carries it, so the day a release containing #10461 is cut, this row moves to
 * that version with `inclusive: false` and nothing else changes. The self-test
 * drives BOTH kinds against a synthetic ceiling, because only one of them is
 * reachable against the live value and an unreachable comparison is one nobody
 * is testing - the same reason the patch term below is driven against a
 * synthetic 6.3.1 floor.
 *
 * WHAT THE CEILING PROVES, AND WHAT A GREEN RUN IS NOT EVIDENCE FOR. It proves
 * a TAG is inside a window. It says NOTHING about whether this build is correct
 * against the node that tag runs - the tag is a string in a YAML file, and the
 * node an operator is actually talking to is A11's question, at runtime, against
 * a live subversion. Nor does it stop an operator pulling a newer image by hand.
 * The disclosure is here rather than implied because the same guard's floor half
 * already carries two clauses that cannot change a verdict, and a reader who
 * took either half for more than it is would be wrong in the expensive
 * direction.
 *
 * ---------------------------------------------------------------------------
 * THE FLOOR
 * ---------------------------------------------------------------------------
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
 * FOUR OUTCOMES, AND UNPARSED FAILS. Inside the window, below the floor, above
 * the ceiling, and could not be read. `:latest` must not pass: an unreadable tag
 * is not a satisfied bound, it is an unknown one, and treating unknown as
 * satisfied is how a bound stops being a bound. That is the same discipline
 * `check-capture-consistency.mjs` uses, with the unreadable arm decided the
 * other way round - there, "not checked" is honest because a missing predecessor
 * proves nothing; here, an unreadable pin IS the finding.
 *
 * BELOW-FLOOR AND ABOVE-CEILING ARE SEPARATE OUTCOMES RATHER THAN ONE
 * "outside the window", because they want opposite operator actions - upgrade
 * the node, versus read the release notes and move the ceiling - and because
 * collapsing them would make the failure message say less than the guard knows.
 * The same argument `version-floor.ts` makes for having three verdicts rather
 * than a boolean.
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

/**
 * THE CEILING, DECLARED HERE, AND THE REASON IT IS NOT IN `version-floor.ts`.
 *
 * The floor is READ out of that module because it has TWO readers - this guard
 * and A11's live check against a node's `subversion` - and one quantity with two
 * readers must have one source. The ceiling has ONE reader, this file, so there
 * is no second copy to drift from and nothing to keep in sync; declaring it in
 * the module that has no use for it would add a `packages/` dependency to a
 * plan-only handoff for no property gained. Whether the ceiling SHOULD grow a
 * runtime reader - so A11 also refuses a live node above it, which is the case
 * an image pin cannot see - is a real question and is asked in this handoff's
 * section 8 rather than answered here.
 *
 * `inclusive: true` means the ceiling version itself is ACCEPTED. `false` means
 * it is the first REJECTED version, which is the spelling to use the day a
 * release containing #10461 is cut.
 */
const CEILING = {
  version: { major: 6, minor: 3, patch: 0 },
  inclusive: true,
  reason:
    "the highest tag this build has been read against. ZcashFoundation/zebra #10461 (merged 22 Aug 2026, `1c9b245`) " +
    "replaces Zebra's Transaction enum with a librustzcash newtype across 106 files and deletes " +
    "`sapling_spends_per_anchor()`, switching RPC rendering to `sapling_spends()`; it is in NO released tag " +
    "(`git tag --contains 1c9b245` is empty, positively controlled against v6.3.0), so there is no version to set an " +
    "EXCLUSIVE ceiling at and this one is INCLUSIVE at the last version that was read",
};

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

/** How a ceiling reads in a message: `<= 6.3.0` or `< 6.4.0`. */
const showCeiling = (c) => `${c.inclusive ? "<=" : "<"} ${show(c.version)}`;

/** Is this version above the ceiling? The bound kind is DATA, not two comparisons. */
function aboveCeiling(version, ceiling) {
  const d = cmp(version, ceiling.version);
  return ceiling.inclusive ? d > 0 : d >= 0;
}

/** THE RULE. One ref, one window, four outcomes. */
export function checkRef(ref, floor, ceiling = CEILING) {
  const got = extractTagVersion(ref);
  if (got.kind === "UNPARSED") {
    return { ok: false, outcome: "UNPARSED", message: `${ref} - ${got.reason}. An unreadable pin is an UNKNOWN bound, not a satisfied one.` };
  }
  if (cmp(got.version, floor) < 0) {
    return { ok: false, outcome: "BELOW-FLOOR", message: `${ref} pins ${show(got.version)}, BELOW the ${show(floor)} floor version-floor.ts declares.` };
  }
  if (aboveCeiling(got.version, ceiling)) {
    return {
      ok: false,
      outcome: "ABOVE-CEILING",
      message:
        `${ref} pins ${show(got.version)}, ABOVE the ceiling ${showCeiling(ceiling)} this guard declares - ${ceiling.reason}. ` +
        `An UNEXAMINED version is not an approved one: read that release against this build, then move the ceiling here ` +
        `in the same commit. The window is ${show(floor)} ${showCeiling(ceiling)}.`,
    };
  }
  return { ok: true, outcome: "IN-WINDOW", version: got.version, headroom: cmp(got.version, floor) === 0 ? "none" : "some" };
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
  { ref: "zfnd/zebra:6.3.0", expect: "IN-WINDOW" },
  { ref: "zfnd/zebra:v6.3.0", expect: "IN-WINDOW" },
  { ref: "registry.local:5000/zfnd/zebra:6.3.0", expect: "IN-WINDOW" },
  { ref: "zfnd/zebra:6.3.0 ", expect: "IN-WINDOW" },
  { ref: "zfnd/zebra:6.2.9", expect: "BELOW-FLOOR" },
  { ref: "zfnd/zebra:6.2.1", expect: "BELOW-FLOOR" },
  { ref: "zfnd/zebra:5.9.9", expect: "BELOW-FLOOR" },
  // THESE TWO EXPECTED `CLEARS` UNTIL HANDOFF-13 AND THE CHANGE IS THE POINT.
  // 6.4.1 and 7.0.0 are versions nobody has read this build against; under the
  // floor-only rule they passed, which is the default the ceiling inverts.
  { ref: "zfnd/zebra:6.4.1", expect: "ABOVE-CEILING", above: "minor" },
  { ref: "zfnd/zebra:7.0.0", expect: "ABOVE-CEILING", above: "major" },
  { ref: "zfnd/zebra:6.3.1", expect: "ABOVE-CEILING", above: "patch" },
  { ref: "zfnd/zebra:latest", expect: "UNPARSED" },
  { ref: "zfnd/zebra", expect: "UNPARSED" },
  { ref: "zfnd/zebra:6.3", expect: "UNPARSED" },
  { ref: "zfnd/zebra:6.3.0-rc1", expect: "UNPARSED" },
  { ref: "zfnd/zebra@sha256:" + "a".repeat(64), expect: "UNPARSED" },
  { ref: "registry.local:5000/zfnd/zebra", expect: "UNPARSED" },
  // The slashless ref - the only input that reaches `lastColon === -1`.
  { ref: "zebra", expect: "UNPARSED" },
];
/**
 * EVERY OUTCOME `checkRef` CAN RETURN, READ OUT OF ITS OWN SOURCE.
 *
 * A hand-written list made both coverage loops vacuous: deleting a row from it
 * deleted the requirement that the row's outcome be exercised, so "a new outcome
 * cannot arrive untested" - which the docblock claimed - was false. Measured by
 * a gate reviewer deleting each row in turn and watching every run stay green.
 * This is the same move the floor already makes: read the rule, never restate
 * it beside itself. `Function.prototype.toString` on `checkRef` is the rule.
 *
 * WHAT THE DERIVATION DOES NOT DO, measured by a round-2 reviewer rather than
 * reasoned. The regex sees a STRING LITERAL on an `outcome:` property. An
 * outcome introduced through a variable or a template is invisible to it, and
 * the OK line would then print a coverage count one short without complaining.
 * A literal fifth outcome IS caught; one built from a variable is not. So this
 * closes the case a hand-written list left open - a literal outcome arriving
 * untested - and not the general one, and the docblock says so rather than
 * repeating the too-strong claim the hand-written version carried.
 */
const OUTCOMES = [...new Set([...checkRef.toString().matchAll(/outcome:\s*"([A-Z-]+)"/g)].map((m) => m[1]))];

/**
 * THE THREE WAYS A VERSION CAN BE ABOVE THE CEILING, AS DATA, BECAUSE THE
 * COMPARATOR HAS THREE COMPONENTS AND EACH CAN BE WRONG ON ITS OWN.
 *
 * Outcome coverage alone is too coarse to see this, and that was measured
 * rather than reasoned: deleting the 6.3.1 row - the ONLY one that is above the
 * ceiling by its PATCH component - left the run green, because 6.4.1 and 7.0.0
 * still satisfied "some row reaches ABOVE-CEILING". This file already records
 * the same lesson from the other bound, where the floor's patch term was
 * unreachable against a floor ending in zero and had to be driven against a
 * synthetic 6.3.1. Same comparator, same three components, same standard.
 */
const ABOVE_BY = ["patch", "minor", "major"];

/**
 * The fixture compose files, at module scope so the OK line can DERIVE its count
 * instead of writing `4` beside three counts that are derived. A fifth fixture
 * used to leave the guard announcing four - measured by a gate reviewer adding
 * one and grepping the summary.
 *
 * AND A MUTATION THAT SURVIVES BY DESIGN, REPORTED RATHER THAN QUIETLY LEFT:
 * writing the literal back into the summary sentence is not caught by anything,
 * because no assertion reads the OK line's text. Derivation removes the way this
 * number goes stale on its own; it does not stop someone re-typing it. An
 * assertion over a summary string would be a probe against this file's own
 * prose, which is the loose-pattern shape recorded elsewhere in this repository,
 * so the honest move is the one the two verdict-neutral clauses above already
 * take - say so, rather than build a check that looks like coverage.
 */
const FIXTURES = [
  { name: "below-floor.yml", pin: "zfnd/zebra:6.2.9", expect: "BELOW-FLOOR" },
  { name: "latest.yml", pin: "zfnd/zebra:latest", expect: "UNPARSED" },
  { name: "above-ceiling.yml", pin: "zfnd/zebra:6.4.0", expect: "ABOVE-CEILING" },
  { name: "in-window.yml", pin: "zfnd/zebra:6.3.0", expect: "IN-WINDOW" },
];

/**
 * AND ABOVE_BY IS PINNED TO THE COMPARATOR'S ARITY rather than to a number
 * written twice: a `ZebraVersion` has exactly the fields `cmp` walks, so the
 * component count is derivable from the floor object itself. An emptied
 * ABOVE_BY made its coverage loop vacuous, which a gate reviewer measured.
 */
const VERSION_COMPONENTS = () =>
  new Set([...cmp.toString().matchAll(/\.(major|minor|patch)\b/g)].map((m) => m[1])).size;

/**
 * BOTH CEILING KINDS, AS DATA, DRIVEN AGAINST A SYNTHETIC CEILING.
 *
 * Only `inclusive: true` is reachable against the live value, so the exclusive
 * branch would otherwise be a comparison nobody tests - and it is the branch
 * this row moves to the day a release containing #10461 exists, which is the
 * worst moment to discover it was never driven. Same argument as the patch term
 * against a synthetic 6.3.1 floor below. The boundary version itself is the
 * discriminating input: it is the ONLY value the two kinds disagree about.
 */
const CEILING_KINDS = [
  { inclusive: true, atBoundary: "IN-WINDOW", justAbove: "ABOVE-CEILING", justBelow: "IN-WINDOW" },
  { inclusive: false, atBoundary: "ABOVE-CEILING", justAbove: "ABOVE-CEILING", justBelow: "IN-WINDOW" },
];

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
  // THE SLASHLESS REF, WHICH IS THE ONLY INPUT THAT REACHES `lastColon === -1`.
  // The header claims both halves of step 2 are tested by message. That was true
  // of `lastColon < lastSlash` and false of this half: the registry-port probe
  // above has a slash, so it exercises the OTHER clause, and deleting
  // `lastColon === -1` left the self-test green while the guard reported a bare
  // `zebra` pin as UNPARSED for the wrong reason. Measured by a gate reviewer.
  { reason: "no tag, slashless", marker: "carries no tag", probe: "zebra" },
  { reason: "not semver", marker: "is not a bare MAJOR.MINOR.PATCH", probe: "zfnd/zebra:latest" },
];

/**
 * THE UNPARSED TABLE IS PINNED TO THE RULE IT DESCRIBES.
 *
 * `extractTagVersion` gives a fixed set of UNPARSED DIAGNOSTICS; the table must
 * exercise every one. Without this, deleting a row deleted the only test of a
 * live clause in silence, and the OK line printed the shrunken count as if it
 * were complete - measured by a gate reviewer deleting each row in turn, all
 * three surviving. Read out of the function's own source, the same move
 * `OUTCOMES` and the floor already make.
 *
 * AND THE BOUND, ALSO MEASURED. This pin is over distinct DIAGNOSTICS, not over
 * CLAUSES, and the function has FOUR unreadable clauses giving THREE
 * diagnostics: the slashless `lastColon === -1` and the registry-port
 * `lastColon < lastSlash` both say "the ref carries no tag". A dropped clause
 * that SHARES a message with a surviving one is therefore invisible to this pin
 * - which is exactly the hole the "no tag, slashless" row exists to cover, and
 * that hole was found by mutation rather than by this pin.
 *
 * SO THERE IS A SECOND PIN, `UNPARSED_CLAUSES`, AND IT IS WHY THE ROW-DELETION
 * HOLE IS NOW CLOSED. It counts the `||`-separated terms of every condition
 * guarding an UNPARSED return, read out of the function's own source - four -
 * and requires the table to hold that many rows. Before it, deleting either
 * same-marker row survived: the diagnostic pin still saw three markers, and the
 * OK line, which took its count from `UNPARSED_REASONS.length`, then announced
 * "all 3 unreadable branches" - a TRUE statement about the table and a FALSE
 * one about the rule, which still had four clauses. A green run that reports a
 * coverage it no longer has is worse than a red one, and the count is now read
 * from the rule so the sentence cannot shrink with the table. Measured by a
 * gate reviewer, verified by re-running the mutations here.
 *
 * WHAT IS STILL OPEN, AND IT IS THE MAPPING RATHER THAN THE COUNT: nothing
 * checks WHICH clause each row exercises. Replacing the slashless probe with a
 * second registry-port ref keeps the length at four and the markers at three
 * while `lastColon === -1` loses its only test. Closing that needs the test to
 * decide which clause a probe fires, which is restating the rule inside its own
 * check - the move this file refuses two screens above. Recorded as open, per
 * the rule that a documented bound is weaker than a guard and must say so.
 */
const UNPARSED_RETURNS = new Set(
  [...extractTagVersion.toString().matchAll(/reason:\s*(?:`|")([^`"$]{6,})/g)].map((m) => m[1].slice(0, 24)),
).size;

/**
 * How many CLAUSES can send `extractTagVersion` down an UNPARSED return - the
 * `||`-separated terms of every condition guarding one, read out of the
 * function's own source. Four, against three diagnostics. The table needs a row
 * per CLAUSE, not per diagnostic, and this is what pins it: see the block above
 * for what it closed and what it leaves open.
 */
const UNPARSED_CLAUSES = [
  ...extractTagVersion.toString().matchAll(/if \(([^)]*(?:\)[^)]*)*?)\) return \{ kind: "UNPARSED"/g),
].reduce((n, m) => n + m[1].split("||").length, 0);

function selfTest() {
  const floor = readFloor();
  if (!floor.ok) return `the floor could not be read: ${floor.reason}`;
  if (show(floor.version) !== "6.3.0") {
    // Not a failure - the floor is allowed to move - but the table's expectations
    // are written against 6.3.0, so say so rather than silently mis-testing.
    return `version-floor.ts now declares ${show(floor.version)}; REFERENCE_REFS is written against 6.3.0 and must be re-expected`;
  }
  // THE SAME PROTECTION FOR THE CEILING, and it is the one more likely to fire:
  // the ceiling is expected to MOVE, by design, every time somebody reads a new
  // Zebra release. A moved ceiling with a stale table would silently re-expect
  // nothing, which is how a guard comes to certify a hole.
  if (show(CEILING.version) !== "6.3.0" || CEILING.inclusive !== true) {
    return (
      `the ceiling is now ${showCeiling(CEILING)}; REFERENCE_REFS is written against an INCLUSIVE 6.3.0 ceiling ` +
      "and must be re-expected - 6.3.1, 6.4.1 and 7.0.0 in particular"
    );
  }
  // THE FLOOR AND THE CEILING MUST BOUND A NON-EMPTY WINDOW. An exclusive
  // ceiling equal to the floor accepts nothing at all, and a guard that rejects
  // every possible input is indistinguishable from a broken one on a red build.
  if (aboveCeiling(floor.version, CEILING)) {
    return `the window is EMPTY: the floor ${show(floor.version)} is itself above the ceiling ${showCeiling(CEILING)}`;
  }
  for (const { ref, expect } of REFERENCE_REFS) {
    const got = checkRef(ref, floor.version);
    if (got.outcome !== expect) return `"${ref}" gave ${got.outcome}, expected ${expect}`;
  }
  for (const outcome of OUTCOMES) {
    if (!REFERENCE_REFS.some((r) => r.expect === outcome)) return `no REFERENCE_REFS row exercises the ${outcome} outcome`;
  }
  // PINNED ON THE DISTINCT MARKERS, NOT THE ROW COUNT. The first pin compared
  // `UNPARSED_REASONS.length` to the number of UNPARSED returns, and two rows
  // share the "carries no tag" marker - so with four rows for three branches,
  // deleting one still satisfied it. Measured: the mutation survived. What has
  // to hold is that every distinct DIAGNOSTIC is exercised.
  if (UNPARSED_REASONS.length !== UNPARSED_CLAUSES) {
    // DIRECTION-AWARE, because the two directions are different defects and the
    // first draft of this message diagnosed both as the first. A code mutation
    // deleting `lastColon === -1` from the RULE leaves the table over-covered,
    // and reporting that as "a clause has lost its only probe" sends the reader
    // to the table when the rule is what moved.
    const short = UNPARSED_REASONS.length < UNPARSED_CLAUSES;
    return `extractTagVersion has ${UNPARSED_CLAUSES} clause(s) reaching an UNPARSED return and UNPARSED_REASONS ` +
      `holds ${UNPARSED_REASONS.length} row(s) - ` +
      (short
        ? "a clause has lost its only probe, and the OK line would still report the shrunken count as complete coverage"
        : "the RULE lost a clause and the table still probes it, so a row now tests a branch that no longer exists");
  }
  const markers = new Set(UNPARSED_REASONS.map((r) => r.marker));
  if (markers.size !== UNPARSED_RETURNS) {
    return `extractTagVersion gives ${UNPARSED_RETURNS} distinct UNPARSED diagnostic(s) and UNPARSED_REASONS exercises ` +
      `${markers.size} - a diagnostic has lost its probe, and outcome coverage cannot see it`;
  }
  if (ABOVE_BY.length !== VERSION_COMPONENTS(floor.version)) {
    return `a version has ${VERSION_COMPONENTS(floor.version)} component(s) and ABOVE_BY names ${ABOVE_BY.length} - ` +
      "each component of the comparator can be wrong on its own, so each needs a row above the ceiling";
  }
  if (OUTCOMES.length < 4) {
    return `only ${OUTCOMES.length} outcome(s) were read out of checkRef's source - the derivation is broken, ` +
      "so every outcome-coverage loop below is vacuous";
  }
  for (const component of ABOVE_BY) {
    if (!REFERENCE_REFS.some((r) => r.above === component)) {
      return `no REFERENCE_REFS row is above the ceiling by its ${component} component - that term of the ` +
        "comparator is untested, and outcome coverage cannot see it because the other components satisfy it";
    }
  }
  for (const row of REFERENCE_REFS.filter((r) => r.above !== undefined)) {
    if (!ABOVE_BY.includes(row.above)) return `"${row.ref}" declares above:"${row.above}", which is not a declared component`;
    if (row.expect !== "ABOVE-CEILING") return `"${row.ref}" declares an above-component but expects ${row.expect}`;
  }

  // BOTH CEILING KINDS, AT AND AROUND THE BOUNDARY. Driven against a synthetic
  // ceiling because only one kind is reachable against the live value.
  const synthCeilingVersion = { major: 9, minor: 1, patch: 0 };
  for (const kind of CEILING_KINDS) {
    const ceiling = { version: synthCeilingVersion, inclusive: kind.inclusive, reason: "synthetic, for the self-test" };
    const cases = [
      ["zfnd/zebra:9.1.0", kind.atBoundary, "at the boundary"],
      ["zfnd/zebra:9.1.1", kind.justAbove, "one patch above the boundary"],
      ["zfnd/zebra:9.0.9", kind.justBelow, "one patch below the boundary"],
    ];
    for (const [ref, expect, where] of cases) {
      const got = checkRef(ref, floor.version, ceiling);
      if (got.outcome !== expect) {
        return `against a synthetic ${kind.inclusive ? "INCLUSIVE" : "EXCLUSIVE"} 9.1.0 ceiling, "${ref}" (${where}) ` +
          `gave ${got.outcome}, expected ${expect} - the bound kind is not being honoured`;
      }
    }
  }
  // AND THE TWO KINDS MUST DISAGREE SOMEWHERE, or `inclusive` is decoration and
  // the loop above is satisfied by a comparator that ignores it entirely.
  if (CEILING_KINDS[0].atBoundary === CEILING_KINDS[1].atBoundary) {
    return "CEILING_KINDS expects the same verdict at the boundary for both kinds, so nothing distinguishes them";
  }

  // THE ABOVE-CEILING MESSAGE NAMES BOTH VERSIONS. LEDGER-12 Q3 asks for it by
  // name, and a message that named only one would leave an operator knowing the
  // pin is rejected and not what it is rejected against.
  //
  // DRIVEN AGAINST A SYNTHETIC CEILING, AND THE FIRST DRAFT COULD NOT FAIL.
  // It checked the LIVE message for `show(CEILING.version)`, which is "6.3.0" -
  // and "6.3.0" also appears in that message as the FLOOR and again inside the
  // ceiling's own `reason` string. So deleting the ceiling from the message
  // left the assertion satisfied by an unrelated occurrence: an assertion
  // satisfied by every value it was written to exclude, which is the shape
  // HANDOFF-13 deliverable 3 exists to specify a guard against, committed
  // inside the change that reports it. Measured: the mutation survived a full
  // run. A synthetic ceiling whose version shares no digits with the floor is
  // what makes the check discriminate, and the ceiling is required WITH its
  // bound operator so a bare version cannot satisfy it either.
  //
  // THE THIRD DRAFT OF THIS CHECK, AND THE FIRST TWO WERE BOTH SATISFIED BY
  // VALUES THEY WERE WRITTEN TO EXCLUDE. Draft one asserted the LIVE message
  // contained `show(CEILING.version)` = "6.3.0", which also appears in it as the
  // FLOOR. Draft two moved to a synthetic ceiling but wrote the expectation as
  // `showCeiling(msgCeiling)` - COMPUTING THE EXPECTED VALUE BY CALLING THE
  // FUNCTION UNDER TEST, so every string `showCeiling` can return satisfied it
  // and a comparator that always rendered "<=", or rendered the wrong version
  // entirely, shipped green. And `includes("9.2.0")` was satisfied by the
  // `${ref}` the message echoes back, whatever the template did with the
  // extracted version. Both measured by a gate reviewer, both SURVIVED a full
  // run. So: expectations are LITERALS, the ref echo is stripped before the
  // version is looked for, and BOTH bound kinds are covered - the exclusive one
  // being the spelling this file says the row moves to the day a release
  // carrying #10461 is cut.
  const MESSAGE_CASES = [
    { inclusive: true, ref: "zfnd/zebra:9.2.0", expectCeiling: "<= 9.1.0", expectVersion: "9.2.0" },
    { inclusive: false, ref: "zfnd/zebra:9.1.0", expectCeiling: "< 9.1.0", expectVersion: "9.1.0" },
  ];
  for (const c of MESSAGE_CASES) {
    const msgCeiling = { version: { major: 9, minor: 1, patch: 0 }, inclusive: c.inclusive, reason: "synthetic, for the self-test" };
    const above = checkRef(c.ref, floor.version, msgCeiling);
    if (above.outcome !== "ABOVE-CEILING") {
      return `the ${c.inclusive ? "inclusive" : "exclusive"} message probe gave ${above.outcome}, expected ABOVE-CEILING`;
    }
    if (!above.message.includes(c.expectCeiling)) {
      return `the ABOVE-CEILING message does not render the ceiling as the literal "${c.expectCeiling}": "${above.message}"`;
    }
    // THE REF ECHO IS STRIPPED FIRST. The template opens with `${ref}`, and the
    // version was extracted FROM that ref, so searching the whole message for
    // the version finds the echo rather than the rendering.
    const withoutEcho = above.message.split(c.ref).join("");
    if (!withoutEcho.includes(c.expectVersion)) {
      return `the ABOVE-CEILING message names the pinned version only inside its echo of the ref: "${above.message}"`;
    }
  }

  // THE COMPARATOR'S PATCH TERM IS UNREACHABLE AGAINST THE REAL FLOOR. The floor
  // is 6.3.0, whose patch is 0, so no version is below it by patch alone and no
  // image ref can drive that term - measured: deleting `a.patch - b.patch` left
  // every row above green. So the comparator is driven against a SYNTHETIC floor
  // here, which is the only way this term gets a fail side at all. A term that
  // cannot be reached is a term nobody is testing, floor value notwithstanding,
  // and the floor is allowed to move to a non-zero patch.
  const patchFloor = { major: 6, minor: 3, patch: 1 };
  // AND A SYNTHETIC CEILING TO GO WITH IT. Against a 6.3.1 floor the LIVE
  // ceiling (6.3.0, inclusive) would put 6.3.1 above the ceiling, so the second
  // probe below would report ABOVE-CEILING and the floor comparator would never
  // be driven on its equal-version arm - a probe defeated by the other bound
  // rather than by the term it exists to test. The window is widened here so the
  // floor term is the only thing that can decide either case.
  const patchCeiling = { version: { major: 9, minor: 9, patch: 9 }, inclusive: true, reason: "synthetic, for the self-test" };
  const patchProbe = checkRef("zfnd/zebra:6.3.0", patchFloor, patchCeiling);
  if (patchProbe.outcome !== "BELOW-FLOOR") {
    return `against a synthetic 6.3.1 floor, "zfnd/zebra:6.3.0" gave ${patchProbe.outcome}, expected BELOW-FLOOR - ` +
      `the comparator ignores the patch component`;
  }
  if (checkRef("zfnd/zebra:6.3.1", patchFloor, patchCeiling).outcome !== "IN-WINDOW") {
    return `against a synthetic 6.3.1 floor, "zfnd/zebra:6.3.1" was not IN-WINDOW - the comparator rejects an equal version`;
  }

  // `headroom` DECIDES WHETHER THE OPERATOR SEES THE NO-HEADROOM LINE, AND HAD
  // NO ASSERTION AT ALL. Its "some" arm is unreachable against the live window:
  // floor and ceiling are both 6.3.0 inclusive, so the only IN-WINDOW version is
  // 6.3.0 exactly and headroom is always "none" - a gate reviewer enumerated all
  // 900 versions 0.0.0-8.9.9 and measured none=1, some=0. So a one-token change
  // could delete the operator's warning and ship green. Both arms are reachable
  // against the wide synthetic window, which is the only place to drive them.
  if (checkRef("zfnd/zebra:6.3.1", patchFloor, patchCeiling).headroom !== "none") {
    return "a version EQUAL to the floor did not report headroom \"none\" - the operator's NO-HEADROOM warning is dead";
  }
  if (checkRef("zfnd/zebra:6.4.0", patchFloor, patchCeiling).headroom !== "some") {
    return "a version ABOVE the floor did not report headroom \"some\" - the NO-HEADROOM warning fires on every pin";
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
  const fixtures = FIXTURES;
  for (const f of fixtures) {
    const path = join(dir, f.name);
    writeFileSync(path, `services:\n  zebrad:\n    image: ${f.pin}\n    restart: unless-stopped\n  postgres:\n    image: postgres:16-alpine\n`);
    const refs = zebraRefsIn(path);
    if (refs.length !== 1) return `the scanner found ${refs.length} zebra image line(s) in ${f.name}, expected 1`;
    if (refs[0].ref !== f.pin) return `the scanner read "${refs[0].ref}" from ${f.name}, expected "${f.pin}"`;
    const got = checkRef(refs[0].ref, floor.version);
    if (got.outcome !== f.expect) return `${f.name} gave ${got.outcome}, expected ${f.expect}`;
  }
  // EVERY OUTCOME, FROM A REAL FILE. The loop above proves the scanner reads a
  // line; this proves the fixture table has not quietly shrunk to a subset.
  // Measured: deleting the above-ceiling fixture left the run green, because
  // nothing asked what the fixtures collectively covered - the same coarse-
  // coverage hole as the ABOVE_BY one, one table over.
  for (const outcome of OUTCOMES) {
    if (!fixtures.some((f) => f.expect === outcome)) {
      return `no fixture compose file exercises the ${outcome} outcome end to end`;
    }
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
      console.log(
        `[compose-zebra-tag] ${file}:${line} ${ref} sits in the window ${show(floor.version)} ${showCeiling(CEILING)} with NO ` +
          "headroom below - any downward edit breaks the floor, and any upward edit breaks the ceiling. The window is one " +
          "point wide, which is a true statement about how much of Zebra this build has been read against.",
      );
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
  `[compose-zebra-tag] OK: ${checked} Zebra image reference(s) across ${files.length} compose file(s) sit inside the ` +
    `window ${show(floor.version)} ${showCeiling(CEILING)} - floor READ from ${FLOOR_SOURCE}, ceiling declared in this ` +
    `guard (tag extracted before comparison; digest pins, tagless refs and non-semver tags such as :latest all FAIL as ` +
    `UNPARSED, because an unreadable pin is an unknown bound rather than a satisfied one). Self-test drove ` +
    `${REFERENCE_REFS.length} reference refs across all ${OUTCOMES.length} outcomes and all ${UNPARSED_CLAUSES} ` +
    `unreadable clauses, READ FROM THE RULE so this count cannot shrink with the table (two are checked by message, ` +
    "because their clause cannot change a verdict), both " +
    `ceiling kinds at and around a synthetic boundary, and ${FIXTURES.length} fixture compose files end to end. THIS PROVES A TAG IS ` +
    "INSIDE A WINDOW, NEVER THAT THIS BUILD IS CORRECT AGAINST THE NODE THAT TAG RUNS - that is A11's question, at " +
    "runtime, against a live subversion.",
);
