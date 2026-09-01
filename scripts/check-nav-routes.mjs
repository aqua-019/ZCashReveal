// Guards the invariant `apps/web/src/lib/nav.ts` claimed in its own docblock and
// did not hold: every user-facing static route under `apps/web/src/app` has an
// entry in `NAV_ENTRIES`, or is named in this guard's EXCLUSIONS table with a
// reason.
//
// WHY THIS EXISTS. The docblock at the top of `nav.ts` said the screen table was
// "one source for the system bar, the route set, the metadata titles and the
// assertion A7 route list, so a route can never exist without a nav entry or be
// tested without being reachable". Measured at HANDOFF-04a, the tree did not
// hold that sentence: `SCREENS` held NINE screens, `src/app` held SIXTEEN
// `page.tsx` files, and `/pools` and `/reveal` were top-level user-facing pages
// with no nav entry at all - for four handoffs. `/pools` is the page the
// turnstile plane is about, so it was not a cosmetic gap: the one screen the
// instrument half of the site exists to show was unreachable from the bar.
//
// The file also argued the exclusion in a paragraph the docblock above it
// contradicted outright, which is the diagnostic detail. A file that states an
// invariant in one place and carves an exception out of it in another has no
// invariant, only two opinions, and nothing in the six-command gate could tell
// them apart. Both readings compiled, linted, typechecked and passed every test.
//
// WHY `test/e2e/routes.spec.ts` COULD NOT CATCH IT, which is the reason this is
// a guard and not another assertion in that file. The A7 walk holds a
// hand-written MIRROR of `ROUTES`, deliberately not imported, so that a route
// silently dropped from the screen table does not also silently drop out of the
// walk. That makes it a good instrument for ONE direction - an entry that no
// longer resolves - and it is blind by construction to the other: a page added
// to `src/app` that never reached the table is in neither list, so neither list
// disagrees with the other. `/pools` and `/reveal` were exactly that. The mirror
// and this guard are duals and neither subsumes the other, which is why both
// stay.
//
// THE BOUNDARY OF THIS GUARD, STATED HERE AND ECHOED IN THE OK LINE. It checks
// that a route HAS an entry. It says nothing about whether the entry's `label`,
// `dek`, `half` or `idx` is right, and it cannot: those are judgements, and a
// script pretending to make them would give the table a false air of
// verification - the same objection `check-corpus-citations.mjs` records about
// its own bound. It also does not check the dual (an entry whose href resolves
// to no page), because the A7 Playwright walk asserts every entry answers 200
// inside the shell, and a second, weaker static version of that claim would only
// make a green run read wider than it is.
//
// WHAT AN EXCLUSION IS, AND WHY IT IS DATA RATHER THAN A `continue`. Three kinds
// of page legitimately have no bar entry, and the previous arrangement expressed
// that as prose in `TRACK_FAMILY`'s comment - which is how the exception came to
// contradict the rule. Here each one is a row carrying the route and the reason,
// the self-test removes each row in turn and requires the route to become a
// finding, and a row that stops covering anything is itself a finding (R2). So
// an exclusion cannot quietly widen into "the rule does not apply here any more",
// and a member added later cannot arrive untested.

import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APP_DIR = "apps/web/src/app";
const NAV_FILE = "apps/web/src/lib/nav.ts";
const SELF = "scripts/check-nav-routes.mjs";

/**
 * The routes that are deliberately not in the bar, each with the reason.
 *
 * The self-test ITERATES THIS ARRAY (LEDGER-09a Q3): every member is removed in
 * turn and the route it covers must then be reported, over the REAL tree. A row
 * whose removal changes nothing is a row that was never load-bearing, and it
 * fails the self-test rather than sitting here looking like a rule.
 */
export const EXCLUSIONS = [
  {
    route: "/address/[addr]",
    reason:
      "a dynamic segment - one page per address value, so there is no single URL for a bar to carry. `isActive` lights Track for it instead, via TRACK_FAMILY.",
  },
  {
    route: "/block/[height]",
    reason:
      "a dynamic segment - one page per block height. Same treatment as /address: reachable from Track and from a link, never from a fixed bar item.",
  },
  {
    route: "/tx/[txid]",
    reason:
      "a dynamic segment - one page per transaction id. Same treatment as /address and /block.",
  },
  {
    route: "/track/flows",
    reason:
      "a sub-view of /track, reached from that page. It is one screen's second tab, not a tenth screen, and giving it a bar entry would light two entries at once.",
  },
  {
    route: "/dev/primitives",
    reason:
      "dev-only. src/lib/env.ts gates it on NEXT_PUBLIC_ENABLE_DEV_SURFACES, a deployed build never sets it, the page calls notFound() and answers 404. A bar entry would publish a 404 to every reader.",
  },
];

/** Files Next treats as a page. `.tsx` alone would miss a `.js` or `.mdx` page. */
const PAGE_FILE = /^page\.(?:(?:m|c)?[jt]sx?|mdx)$/;

/**
 * Comments removed, so a `href:` inside a docblock is not read as an entry.
 *
 * `nav.ts` is nine-tenths prose - the file's docblocks discuss `/pools` and
 * `/reveal` by name, at length, including the paragraph about the entries they
 * did NOT have. A parser that read those would have reported the pre-fix tree
 * CLEAN, which is the exact failure this guard exists to prevent, occurring
 * inside the guard. `[^:]` before the line-comment rule keeps `https://` out of
 * it, which is the same correction `check-instrument-deps.mjs` records as its
 * hole 10.
 */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The body of the array literal `name` is initialised to, or null.
 *
 * BRACKET-BALANCED AND QUOTE-AWARE rather than a non-greedy `\[([\s\S]*?)\]`.
 * Two reasons, both live in this file's real input: the declaration's TYPE
 * carries a bracket pair (`readonly Screen[] = [`), so the body starts at the
 * first `[` AFTER the `=` and not at the first `[` after the name; and a `dek`
 * string containing a bracket would close a lazy match early and drop every
 * entry below it in silence.
 */
export function arrayBody(src, name) {
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`).exec(src);
  if (decl === null) return null;
  const eq = src.indexOf("=", decl.index);
  if (eq === -1) return null;
  const open = src.indexOf("[", eq);
  if (open === -1) return null;

  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (quote !== null) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

/** Every `href: "..."` literal in a chunk of source text. */
export function hrefLiterals(body) {
  return [...body.matchAll(/\bhref\s*:\s*(["'])([^"'`]*)\1/g)].map((m) => m[2]);
}

/**
 * What the system bar renders, read out of `nav.ts` as text.
 *
 * IT FOLLOWS `NAV_ENTRIES`' OWN COMPOSITION rather than hardcoding `SCREENS` and
 * `VIEWS`. `NAV_ENTRIES` is the thing the bar maps over, so it is the object the
 * rule is about; the two lists it spreads today are a construction history, and
 * a third list added tomorrow would be invisible to a guard that named the two -
 * which is the "enumerate the object, never a source that constructs it" rule
 * CLAUDE.md records for LEDGER-09b. A whole-file `href:` sweep would fail the
 * other way: a future `FOOTER_LINKS` array would silently satisfy the rule for
 * routes the bar does not carry, and the self-test drives exactly that case.
 *
 * Returns null when the file cannot be parsed at all - a missing `NAV_ENTRIES`,
 * or a spread naming a list this file does not declare. That is exit 2, not a
 * pile of findings: a guard that cannot read its own input has no verdict.
 */
export function navHrefs(src) {
  const code = stripComments(src);
  const body = arrayBody(code, "NAV_ENTRIES");
  if (body === null) return null;

  const hrefs = hrefLiterals(body);
  const lists = [...body.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  for (const list of lists) {
    const listBody = arrayBody(code, list);
    if (listBody === null) return null;
    hrefs.push(...hrefLiterals(listBody));
  }
  return { lists, hrefs: [...new Set(hrefs)] };
}

/**
 * `app/beware/page.tsx` -> `/beware`, `app/page.tsx` -> `/`, and a route group
 * `(x)` contributes no segment - Next's own rule, and the one piece of App
 * Router semantics this guard has to know.
 */
export function routeForPageFile(rel) {
  const segments = rel
    .split("/")
    .slice(0, -1)
    .filter((s) => s !== "" && !/^\(.*\)$/.test(s));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** Every page file under `appDir`, as {file, route}, relative to `appDir`. */
export function discoverRoutes(appDir) {
  const out = [];
  const walk = (dir, prefix) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (PAGE_FILE.test(entry.name)) out.push({ file: rel, route: routeForPageFile(rel) });
    }
  };
  walk(appDir, "");
  out.sort((a, b) => a.route.localeCompare(b.route));
  return out;
}

/**
 * The conditions under which a clean scan would prove nothing.
 *
 * A directory rename that made the walk return zero files, or a `nav.ts` edit
 * that made the parse return zero hrefs, would otherwise print OK having looked
 * at nothing. That is the silent vacuous pass this repository has shipped three
 * times, and it is exit 2 rather than a finding, because the guard is broken
 * rather than the tree.
 */
export function vacuity(routes, hrefs) {
  const problems = [];
  if (routes.length === 0) {
    problems.push(
      `V1: no page file was found under ${APP_DIR}. A rename or a moved app directory would ` +
        "otherwise pass this guard while checking nothing.",
    );
  }
  if (hrefs.length === 0) {
    problems.push(
      `V2: no href was read out of NAV_ENTRIES in ${NAV_FILE}. With an empty nav list every ` +
        "route would be a finding or, if the tree were also empty, none would be.",
    );
  }
  return problems;
}

/** Routes with no entry, plus exclusions that have stopped covering anything. */
export function navRouteFindings(routes, hrefs, exclusions) {
  const findings = [];
  const excluded = new Map(exclusions.map((e) => [e.route, e.reason]));
  const seen = new Set(routes.map((r) => r.route));

  // R1 - the rule itself.
  for (const { file, route } of routes) {
    if (hrefs.includes(route)) continue;
    if (excluded.has(route)) continue;
    findings.push(
      `${APP_DIR}/${file}  R1: "${route}" is a user-facing static route with no entry in ` +
        `NAV_ENTRIES (${NAV_FILE}) and no row in EXCLUSIONS. A page nothing links to is a page ` +
        "nobody reaches; give it an entry, or exclude it by name with a reason.",
    );
  }

  // R2 - an exclusion that covers no route. The register-decay shape: a list of
  // paths nobody reads is worse than no list, because it reads as coverage.
  for (const { route } of exclusions) {
    if (seen.has(route)) continue;
    findings.push(
      `${SELF}  R2: EXCLUSIONS names "${route}" and no page under ${APP_DIR} produces that ` +
        "route. The row now excludes nothing, so it is documentation of a page that moved rather " +
        "than a rule; delete it or re-point it.",
    );
  }

  // R3 - an exclusion whose route the bar carries anyway. The row then states a
  // reason ("a bar cannot carry it") that the bar refutes.
  for (const { route, reason } of exclusions) {
    if (!hrefs.includes(route)) continue;
    findings.push(
      `${SELF}  R3: EXCLUSIONS names "${route}" AND NAV_ENTRIES carries it. The row is dead and ` +
        `its stated reason contradicts the bar: "${reason}"`,
    );
  }

  return findings;
}

/* ============================================================================
   Self-test, both directions, over the REAL functions and the REAL tree
   ========================================================================== */

function withFixtureTree(build) {
  const root = mkdtempSync(join(tmpdir(), "nav-routes-"));
  try {
    return build(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writePage(app, dir, name = "page.tsx") {
  const full = dir === "" ? app : join(app, dir);
  mkdirSync(full, { recursive: true });
  writeFileSync(join(full, name), "export default function P() {\n  return null;\n}\n");
}

/**
 * ACCUMULATOR STYLE ON PURPOSE: every broken probe reports in one run. An
 * early return would hide probes two through twenty behind the first failure,
 * and the run that matters is the one where a session has just broken several
 * things at once.
 */
function selfTest(realRoutes, realNav) {
  let ok = true;
  const fail = (m) => {
    console.error(`[nav-routes] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

  const realHrefs = realNav?.hrefs ?? [];

  // R1 findings only. Several probes below run over trees that legitimately hold
  // none of the excluded routes, where R2 fires by design; filtering is stated
  // here once rather than hidden at each site, and R2's own firing is asserted
  // on its own terms further down instead of being discarded.
  const r1 = (found) => found.filter((f) => f.includes("R1"));

  // ---- 1. PASS SIDE, over the real tree -----------------------------------
  //
  // THE PASS SIDE IS "EVERY ROUTE THE BAR CARRIES IS SILENT", NOT "THE TREE IS
  // CLEAN", and the difference is the whole reason this comment is here. The
  // first draft asserted the second, and the fail-side probe that added a real
  // `page.tsx` at an unlisted route showed what that cost: a dirty tree tripped
  // the self-test, the run exited 2 saying "the detectors are broken", and
  // exit 1 - the guard's own finding path, the reason it exists - could not be
  // reached by any input at all. That is a branch a constraint kept unreachable,
  // which CLAUDE.md records as its own defect shape. Whether the tree is clean
  // is the SWEEP's verdict; whether the detector discriminates is this
  // function's, and conflating them makes one of the two unreportable.
  const live = navRouteFindings(realRoutes, realHrefs, EXCLUSIONS);
  const carriedRoutes = realRoutes.filter((r) => realHrefs.includes(r.route));
  if (carriedRoutes.length === 0) {
    fail(`no route under ${APP_DIR} is carried by NAV_ENTRIES, so the pass side has nothing to stand on`);
  }

  // ---- 2. EVERY EXCLUSION, REMOVED IN TURN, AGAINST THE REAL TREE ---------
  // The loop over the rule's own data structure. A member added later cannot
  // arrive untested, and a member that is not load-bearing fails here rather
  // than sitting in the table looking like a rule.
  for (const e of EXCLUSIONS) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      fail(`EXCLUSIONS row "${e.route}" carries no reason, so it is an exception nobody has to justify`);
    }
    const without = EXCLUSIONS.filter((x) => x !== e);
    const found = navRouteFindings(realRoutes, realHrefs, without);
    if (!found.some((f) => f.includes("R1") && f.includes(`"${e.route}"`))) {
      fail(
        `removing the EXCLUSIONS row for "${e.route}" did not make it a finding over the real ` +
          `${APP_DIR} tree - the row excludes nothing, or the route no longer exists under that name`,
      );
    }
    // The anti-probe half of the same member: WITH the row, it must be silent.
    if (live.some((f) => f.includes("R1") && f.includes(`"${e.route}"`))) {
      fail(`"${e.route}" is reported even though EXCLUSIONS names it`);
    }
  }

  // THE CORRECT ARRANGEMENT, DRAWN FROM THE REAL TREE. Every route the bar does
  // carry, over the real hrefs and the real table: not one of them may be
  // reported. Without this, every probe above is satisfied by a detector that
  // reports everything it is handed.
  if (r1(navRouteFindings(carriedRoutes, realHrefs, EXCLUSIONS)).length !== 0) {
    fail(
      `a route the bar carries was reported: ${r1(navRouteFindings(carriedRoutes, realHrefs, EXCLUSIONS)).join(" | ")}`,
    );
  }

  // R2 and R3, driven with inputs a real tree cannot be made to hold on demand.
  const stale = navRouteFindings(realRoutes, realHrefs, [
    ...EXCLUSIONS,
    { route: "/gone", reason: "a page that has since been deleted" },
  ]);
  if (!stale.some((f) => f.includes("R2") && f.includes("/gone"))) {
    fail("R2 did not fire on an exclusion naming a route no page produces");
  }
  const dead = navRouteFindings(realRoutes, realHrefs, [
    ...EXCLUSIONS,
    { route: realHrefs[0] ?? "/", reason: "a bar cannot carry this" },
  ]);
  if (!dead.some((f) => f.includes("R3"))) {
    fail("R3 did not fire on an exclusion for a route NAV_ENTRIES carries");
  }

  // ---- 3. DATA MUTATION, over a real fixture tree and the REAL functions ---
  //
  // The real EXCLUSIONS table is passed in throughout, so a row that wrongly
  // covered `/unlisted` would still be caught here; the fixture holds none of
  // the five excluded routes, so R2 fires five times against it by design, and
  // that firing is asserted on its own terms at the end of the block rather
  // than discarded by the `r1` filter.
  withFixtureTree((root) => {
    const app = join(root, "app");

    // THE DATA MUTATION THE RULE EXISTS FOR: a page.tsx at a route nav.ts does
    // not carry. Drawn from the set the predicate claims to exclude - a route
    // with no entry - rather than from a code change, which would only prove
    // the detector is wired.
    writePage(app, "unlisted");
    const mutated = discoverRoutes(app);
    if (mutated.length !== 1 || mutated[0].route !== "/unlisted") {
      fail(`discoverRoutes returned ${JSON.stringify(mutated)} for one page at app/unlisted/page.tsx`);
    }
    const mutatedFindings = r1(navRouteFindings(mutated, realHrefs, EXCLUSIONS));
    if (!mutatedFindings.some((f) => f.includes('"/unlisted"'))) {
      fail("a page.tsx at a route NAV_ENTRIES does not carry was not reported");
    }

    // ---- 4. ANTI-PROBE: the correct arrangement must stay silent -----------
    // A route the bar DOES carry, discovered by the same real walk, over the
    // same real hrefs. Without this the probe above would pass a detector that
    // simply reports every route it is given.
    writePage(app, "beware");
    const withEntry = discoverRoutes(app).filter((r) => r.route === "/beware");
    if (withEntry.length !== 1) fail("the fixture's /beware page was not discovered");
    if (r1(navRouteFindings(withEntry, realHrefs, EXCLUSIONS)).length !== 0) {
      fail("a route WITH a nav entry was reported - the detector fires on the correct arrangement");
    }

    // Route mapping, including the two shapes prose cannot settle: the index
    // page and a route group, which contributes no segment.
    writePage(app, "");
    writePage(app, join("(marketing)", "promo"));
    writePage(app, join("a", "b"));
    writeFileSync(join(app, "layout.tsx"), "export default function L() { return null; }\n");
    const mapped = discoverRoutes(app).map((r) => r.route);
    for (const expected of ["/", "/promo", "/a/b", "/beware", "/unlisted"]) {
      if (!mapped.includes(expected)) fail(`discoverRoutes did not map a page to ${expected}: got ${mapped.join(", ")}`);
    }
    if (mapped.includes("/(marketing)/promo")) fail("discoverRoutes did not strip the route group (marketing)");
    if (mapped.length !== 5) fail(`discoverRoutes returned ${mapped.length} routes, expected 5 (layout.tsx is not a page)`);

    // R2 OVER THE SAME REAL WALK, rather than discarded by the filter above.
    // None of the five excluded routes exists in this tree, so every row has
    // stopped covering anything and every row must say so.
    const staleHere = navRouteFindings(discoverRoutes(app), realHrefs, EXCLUSIONS).filter((f) => f.includes("R2"));
    if (staleHere.length !== EXCLUSIONS.length) {
      fail(`R2 reported ${staleHere.length} stale exclusion(s) over a tree holding none of the ${EXCLUSIONS.length}`);
    }

    // ---- 5. VACUITY -------------------------------------------------------
    // A moved directory returns zero routes IN SILENCE. This is the shape that
    // has shipped three times here, so it is proved rather than asserted.
    if (discoverRoutes(join(root, "does-not-exist")).length !== 0) {
      fail("discoverRoutes threw or invented files for a missing directory");
    }
    if (!vacuity([], realHrefs).some((v) => v.includes("V1"))) {
      fail("vacuity did not report an empty route walk, so a renamed app directory would pass");
    }
    if (!vacuity(realRoutes, []).some((v) => v.includes("V2"))) {
      fail("vacuity did not report an empty nav list, so an unparsed nav.ts would pass");
    }
    if (vacuity(realRoutes, realHrefs).length !== 0) {
      fail("vacuity fired on the real, non-empty inputs");
    }
  });

  // ---- The nav parser, driven over source text it has to get right --------
  const fixtureNav = [
    "/**",
    ' * A docblock that names href: "/ghost" while explaining why it is not one.',
    " */",
    "export const SCREENS: readonly Screen[] = [",
    '  { idx: "00", href: "/", label: "Splash", dek: "brackets [like these] in a dek" },',
    '  { idx: "01", href: "/beware", label: "Beware", dek: "see https://example.com/a for the source" },',
    "];",
    "export const VIEWS: readonly Screen[] = [",
    '  { idx: "--", href: "/pools", label: "Pools" }, // href: "/phantom"',
    "];",
    "export const FOOTER_LINKS = [",
    '  { href: "/not-in-the-bar" },',
    "];",
    "export const NAV_ENTRIES: readonly Screen[] = [...SCREENS, ...VIEWS];",
  ].join("\n");
  const parsed = navHrefs(fixtureNav);
  if (parsed === null) {
    fail("navHrefs could not parse a fixture nav.ts");
  } else {
    for (const expected of ["/", "/beware", "/pools"]) {
      if (!parsed.hrefs.includes(expected)) fail(`navHrefs lost ${expected} from a spread list`);
    }
    // A BRACKET IN A STRING must not close the array early - the entry AFTER
    // the bracket is the one a lazy match would drop, and it would be dropped
    // silently, turning a real finding into a clean run.
    if (!parsed.hrefs.includes("/beware")) fail("a bracket inside a dek truncated the SCREENS body");
    // A COMMENT IS NOT AN ENTRY, in both spellings. `nav.ts`'s docblocks discuss
    // the routes that had no entry, so a parser that read comments would have
    // reported the pre-HANDOFF-04a tree clean.
    if (parsed.hrefs.includes("/ghost")) fail("navHrefs read an href out of a block comment");
    if (parsed.hrefs.includes("/phantom")) fail("navHrefs read an href out of a line comment");
    // A LIST NAV_ENTRIES DOES NOT SPREAD IS NOT THE BAR. A whole-file sweep
    // would count this and quietly satisfy the rule for a route no bar carries.
    if (parsed.hrefs.includes("/not-in-the-bar")) {
      fail("navHrefs counted a list NAV_ENTRIES does not spread, so any array of hrefs would satisfy the rule");
    }
    if (parsed.lists.join(",") !== "SCREENS,VIEWS") {
      fail(`navHrefs read the composition as ${parsed.lists.join(",")}, expected SCREENS,VIEWS`);
    }
  }
  if (navHrefs("export const OTHER = [];") !== null) {
    fail("navHrefs returned a result for a file with no NAV_ENTRIES, instead of reporting it cannot run");
  }
  if (navHrefs("export const NAV_ENTRIES = [...MISSING];") !== null) {
    fail("navHrefs returned a result while NAV_ENTRIES spreads a list it could not read");
  }
  // And the REAL nav.ts, not only a fixture: a parser tuned to a synthetic file
  // that would not survive the real one is the silent-vacuous-pass shape again.
  if (realNav === null) fail(`navHrefs could not parse the real ${NAV_FILE}`);
  else if (realNav.hrefs.length < 2) fail(`navHrefs read ${realNav.hrefs.length} href(s) from the real ${NAV_FILE}`);

  return ok;
}

/* ============================================================================
   The sweep
   ========================================================================== */

let navSource = null;
try {
  navSource = readFileSync(join(ROOT, NAV_FILE), "utf8");
} catch {
  console.error(`[nav-routes] cannot read ${NAV_FILE}; a scan without the nav table would prove nothing.`);
  process.exit(2);
}

const routes = discoverRoutes(join(ROOT, APP_DIR));
const nav = navHrefs(navSource);

if (!selfTest(routes, nav)) {
  console.error("[nav-routes] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}

if (nav === null) {
  console.error(
    `[nav-routes] cannot read NAV_ENTRIES out of ${NAV_FILE}: the declaration is missing, or it ` +
      "spreads a list this file does not declare. That is a guard that cannot run, not a clean tree.",
  );
  process.exit(2);
}

const empty = vacuity(routes, nav.hrefs);
if (empty.length > 0) {
  console.error("[nav-routes] cannot run: the scan would be vacuous.");
  for (const v of empty) console.error(`  ${v}`);
  process.exit(2);
}

const findings = navRouteFindings(routes, nav.hrefs, EXCLUSIONS);

if (findings.length > 0) {
  console.error(`[nav-routes] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

const carried = routes.filter((r) => nav.hrefs.includes(r.route)).length;
const excludedCount = routes.length - carried;
console.log(
  `[nav-routes] OK: ${routes.length} page file(s) under ${APP_DIR}, ${carried} carried by ` +
    `NAV_ENTRIES (composed of ${nav.lists.join(" + ") || "its own literals"}, ${nav.hrefs.length} href(s)), ` +
    `${excludedCount} named in EXCLUSIONS with a reason, 0 unaccounted for. The rule is that a route ` +
    "HAS an entry - never that its label, dek, half or index is right " +
    "(detectors self-tested in both directions, over the real app tree).",
);
