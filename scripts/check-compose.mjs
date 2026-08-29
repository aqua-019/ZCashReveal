// Guards HANDOFF-10 assertions A4, A5 and A8 over the compose files.
//
// Three rules, one script, in the shape check-redis-safety.mjs already
// established here: a guard per CONCERN rather than per assertion, with every
// detector self-tested in both directions on every run, so that a clean scan is
// evidence rather than the absence of it.
//
//   A4  every service in docker-compose.yml declares a healthcheck
//   A5  no literal secret in any compose file - only ${VAR} references
//   A8  the managed store's TCP URL appears in the `publisher` service and
//       nowhere else, with the NAMES read from docs/2.0/SNAPSHOT.md section 3
//       rather than from a list retyped into this script
//
// WHY A4 IS WORTH ENFORCING RATHER THAN TRUSTING. A service without a
// healthcheck is not neutral in this stack: `depends_on: condition:
// service_healthy` is how the indexer waits for Postgres and how the tunnel
// waits for the gateway, and a service that declares no healthcheck can never
// satisfy that condition. The compose file this one replaced had healthchecks
// on two of its three services, and the one it lacked was zebrad - the service
// every other one reads from.
//
// WHY A8 READS SNAPSHOT.md INSTEAD OF NAMING THE VARIABLES ITSELF. The
// assertion says to, and the reason is on the record: HANDOFF-05 found this
// repository stating three managed-store variable names that Vercel injects
// under none of them, in thirteen places. A guard carrying its own copy of the
// list would be a fourteenth. Reading the table means this guard is wrong only
// when the document is wrong, and the document is what the operator reads.

import { readFileSync, existsSync } from "node:fs";

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.dev.yml"];
const SNAPSHOT_DOC = "docs/2.0/SNAPSHOT.md";

// ---------------------------------------------------------------------------
// A structural reader for the subset of YAML compose files use.
//
// DELIBERATELY NOT A YAML PARSER, and the bound is stated rather than implied:
// it finds the `services:` mapping and splits it into per-service line ranges by
// indentation. That is exactly what A4 and A8 are written against - "counts
// healthcheck: blocks", "splits the file per service and greps" - and it keeps
// this guard dependency-free so it can run BEFORE `pnpm install` in CI, where
// the other five already run. A real parse exists (`docker compose config`) but
// it needs Docker and a resolvable .env, so it cannot hold that position.
// ---------------------------------------------------------------------------
function serviceBlocks(text) {
  const lines = text.split("\n");
  const out = new Map();

  let servicesIndent = -1;
  let i = 0;
  for (; i < lines.length; i += 1) {
    const m = /^(\s*)services:\s*$/.exec(lines[i]);
    if (m) {
      servicesIndent = m[1].length;
      i += 1;
      break;
    }
  }
  if (servicesIndent === -1) return out;

  let current = null;
  let currentIndent = -1;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || /^\s*#/.test(line)) {
      if (current !== null) out.get(current).push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;

    // A dedent to or past `services:` ends the mapping - a sibling top-level
    // key such as `volumes:` or `networks:`.
    if (indent <= servicesIndent) break;

    const head = /^\s*([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (head !== null && (currentIndent === -1 || indent === currentIndent)) {
      current = head[1];
      currentIndent = indent;
      out.set(current, []);
      continue;
    }
    if (current !== null) out.get(current).push(line);
  }
  return out;
}

/** Does this service's own block declare a healthcheck? */
function hasHealthcheck(blockLines) {
  return blockLines.some((l) => /^\s*healthcheck:\s*$/.test(l));
}

// ---------------------------------------------------------------------------
// A5 - literal secrets.
//
// NO WORD BOUNDARY BEFORE THESE NAMES, and the self-test is what taught this
// script so. The first draft used /\bPASSWORD\s*[=:]/ and it never matched
// `POSTGRES_PASSWORD:`, because the character before PASSWORD is an underscore
// and an underscore is a WORD character, so there is no boundary there to find.
// Every secret-bearing variable in this stack has exactly that shape, so the
// detector would have passed a compose file containing a plaintext database
// password while printing a clean scan. It was caught on this script's first
// run by the self-test below, which is the whole argument for having one.
// ---------------------------------------------------------------------------
const SECRET_SHAPES = [
  { rule: "sk_", re: /sk_[A-Za-z0-9]/ },
  { rule: "token=", re: /token\s*=/i },
  { rule: "PASSWORD=", re: /PASSWORD\s*[=:]/ },
  { rule: "TOKEN=", re: /TOKEN\s*[=:]/ },
  { rule: "SECRET=", re: /SECRET\s*[=:]/ },
];

/**
 * A line with every `${...}` reference blanked out.
 *
 * THIS IS THE WHOLE TRICK, and the naive alternative is why it is needed.
 * Asking "is the value entirely interpolation" of the raw line condemns
 *
 *   DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD:?x}@postgres:5432/${POSTGRES_DB}
 *
 * because once the references are removed there is still `postgres` and `5432`
 * left over - literal, and not a secret. Blanking the references FIRST and then
 * asking whether the secret shape still matches gets both cases right: the
 * shape survives only when the sensitive token sits outside an interpolation.
 */
function blankInterpolations(line) {
  return line.replace(/\$\{[^}]*\}/g, "${}");
}

function scanSecrets(text) {
  const findings = [];
  text.split("\n").forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const blanked = blankInterpolations(line);
    for (const { rule, re } of SECRET_SHAPES) {
      if (!re.test(blanked)) continue;
      // The shape matched outside an interpolation. That is a finding only if a
      // LITERAL value follows it: `TUNNEL_TOKEN: ${}` matches the shape on its
      // KEY and carries no value at all, which is the correct form.
      const sep = blanked.search(/[=:]/);
      const value = sep >= 0 ? blanked.slice(sep + 1) : "";
      if (!/[A-Za-z0-9]/.test(value.replace(/\$\{\}/g, ""))) continue;
      findings.push({ line: idx + 1, rule, text: trimmed });
    }
  });
  return findings;
}

// ---------------------------------------------------------------------------
// A8 - the managed store's names, read from SNAPSHOT.md section 3.
//
// The table's rows are: | `NAME` | what it is | who consumes it |
// A name whose consumer column names `apps/publisher` is a TCP URL the
// publisher may receive. Every OTHER managed-store name must not appear in a
// compose file at all: the REST pair belongs to apps/web on Vercel, and the
// read-WRITE token belongs nowhere near a service definition.
// ---------------------------------------------------------------------------
function managedStoreNames(docText) {
  const publisher = new Set();
  const others = new Set();
  for (const line of docText.split("\n")) {
    const m = /^\|\s*`(SNAPSHOT_REDIS_[A-Z0-9_]+)`\s*\|([^|]*)\|([^|]*)\|/.exec(line);
    if (m === null) continue;
    if (/apps\/publisher/.test(m[3])) publisher.add(m[1]);
    else others.add(m[1]);
  }
  return { publisher, others };
}

function scanManagedStore(serviceMap, names) {
  const findings = [];
  for (const [service, lines] of serviceMap) {
    for (const line of lines) {
      if (/^\s*#/.test(line)) continue;
      for (const name of names.publisher) {
        if (line.includes(name) && service !== "publisher") {
          findings.push({
            service,
            rule: "managed-store TCP URL outside the publisher service",
            text: line.trim(),
          });
        }
      }
      for (const name of names.others) {
        if (line.includes(name)) {
          findings.push({
            service,
            rule: "managed-store variable that belongs to apps/web on Vercel, not to any compose service",
            text: line.trim(),
          });
        }
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Self-test, both directions, on every run.
// ---------------------------------------------------------------------------
function selfTest() {
  let ok = true;
  const fail = (msg) => {
    console.error(`[compose] SELF-TEST FAIL: ${msg}`);
    ok = false;
  };

  const sample = [
    "name: zecreveal",
    "services:",
    "  alpha:",
    "    image: a:1",
    "    healthcheck:",
    '      test: ["CMD", "true"]',
    "  beta:",
    "    image: b:1",
    "    environment:",
    "      FOO: bar",
    "volumes:",
    "  data:",
  ].join("\n");
  const blocks = serviceBlocks(sample);
  if ([...blocks.keys()].join(",") !== "alpha,beta") fail(`splitter found [${[...blocks.keys()]}]`);
  if (!hasHealthcheck(blocks.get("alpha") ?? [])) fail("splitter lost alpha's healthcheck");
  if (hasHealthcheck(blocks.get("beta") ?? [])) fail("splitter invented a healthcheck for beta");
  if (blocks.has("data")) fail("splitter read a top-level volume as a service");

  const mustFlag = [
    "      POSTGRES_PASSWORD: hunter2",
    "      TUNNEL_TOKEN: eyJhIjoiZXhhbXBsZSJ9",
    "      STRIPE: sk_live_abcdef",
    "      SNAPSHOT_REDIS_KV_REST_API_TOKEN: AX8sASQgN2E",
    "      url: https://example.com/?token=abc123",
  ];
  const mustNotFlag = [
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}",
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-zcashreveal}",
    "      TUNNEL_TOKEN: ${TUNNEL_TOKEN}",
    "      # The token encodes the tunnel credentials and lives in .env",
    // The trap a naive "is the value all interpolation" test fails: real literal
    // text around real references, none of it a secret.
    "      DATABASE_URL: postgres://${POSTGRES_USER:-zcashreveal}:${POSTGRES_PASSWORD:?x}@postgres:5432/${POSTGRES_DB:-zcashreveal}",
    "      SNAPSHOT_REDIS_KV_URL: ${SNAPSHOT_REDIS_KV_URL:-}",
  ];
  for (const s of mustFlag) {
    if (scanSecrets(s).length === 0) fail(`A5 did not flag a literal secret: ${JSON.stringify(s)}`);
  }
  for (const s of mustNotFlag) {
    if (scanSecrets(s).length > 0) fail(`A5 wrongly flagged: ${JSON.stringify(s)}`);
  }

  const fakeDoc = [
    "| `SNAPSHOT_REDIS_KV_REST_API_URL` | REST endpoint | `apps/web`, server-side |",
    "| `SNAPSHOT_REDIS_KV_URL` | TCP URL | `apps/publisher` |",
    "| `SNAPSHOT_REDIS_REDIS_URL` | TCP URL | `apps/publisher` |",
  ].join("\n");
  const names = managedStoreNames(fakeDoc);
  if (!names.publisher.has("SNAPSHOT_REDIS_KV_URL")) fail("A8 did not read the publisher TCP URL from the table");
  if (!names.others.has("SNAPSHOT_REDIS_KV_REST_API_URL")) fail("A8 did not read the web-side name from the table");
  if (names.publisher.size !== 2 || names.others.size !== 1) fail("A8 mis-partitioned the table");

  const goodMap = new Map([
    ["publisher", ["      SNAPSHOT_REDIS_KV_URL: ${SNAPSHOT_REDIS_KV_URL:-}"]],
    ["gateway", ["      REDIS_URL: redis://redis:6379"]],
  ]);
  if (scanManagedStore(goodMap, names).length > 0) fail("A8 flagged the correct placement");

  // The exact fail side the assertion names: add it to the gateway.
  const badMap = new Map([
    ["publisher", ["      SNAPSHOT_REDIS_KV_URL: ${SNAPSHOT_REDIS_KV_URL:-}"]],
    ["gateway", ["      SNAPSHOT_REDIS_KV_URL: ${SNAPSHOT_REDIS_KV_URL:-}"]],
  ]);
  if (scanManagedStore(badMap, names).length === 0) fail("A8 did not flag the TCP URL on the gateway");

  const webNameMap = new Map([["publisher", ["      SNAPSHOT_REDIS_KV_REST_API_URL: x"]]]);
  if (scanManagedStore(webNameMap, names).length === 0) fail("A8 did not flag a web-side name inside a service");

  return ok;
}

if (!selfTest()) {
  console.error("[compose] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The real scan.
// ---------------------------------------------------------------------------
if (!existsSync(SNAPSHOT_DOC)) {
  console.error(`[compose] FAIL: ${SNAPSHOT_DOC} is missing, so A8's variable names have no source.`);
  process.exit(2);
}
const names = managedStoreNames(readFileSync(SNAPSHOT_DOC, "utf8"));
if (names.publisher.size === 0) {
  console.error(
    `[compose] FAIL: no managed-store variable in ${SNAPSHOT_DOC} section 3 names apps/publisher as its consumer. ` +
      "Either that table changed shape or it lost its names; this guard will not scan against an empty list.",
  );
  process.exit(2);
}

const findings = [];
let servicesChecked = 0;

for (const file of COMPOSE_FILES) {
  if (!existsSync(file)) {
    findings.push({ file, line: 0, rule: "missing compose file", text: `${file} does not exist` });
    continue;
  }
  const text = readFileSync(file, "utf8");
  const blocks = serviceBlocks(text);

  if (blocks.size === 0) {
    findings.push({ file, line: 0, rule: "no services", text: "no services: mapping found" });
    continue;
  }

  // A4 applies to the production file only. The dev override is a PARTIAL
  // document that adds ports and replica counts to services the base file
  // defines; requiring it to restate a healthcheck would mean maintaining the
  // same block in two places, which is the shape of defect this repository has
  // been bitten by twice.
  if (file === "docker-compose.yml") {
    for (const [service, lines] of blocks) {
      servicesChecked += 1;
      if (!hasHealthcheck(lines)) {
        findings.push({
          file,
          line: 0,
          rule: "A4 service without a healthcheck",
          text: `${service} declares none, so nothing can depend on it with condition: service_healthy`,
        });
      }
    }
  }

  for (const f of scanSecrets(text)) findings.push({ file, ...f });
  for (const f of scanManagedStore(blocks, names)) {
    findings.push({ file, line: 0, rule: `A8 ${f.rule}`, text: `${f.service}: ${f.text}` });
  }
}

if (findings.length > 0) {
  console.error(`[compose] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  [${f.rule}]  ${f.text}`);
  }
  process.exit(1);
}

console.log(
  `[compose] OK: ${servicesChecked} service(s) in docker-compose.yml all declare a healthcheck; ` +
    `no literal secret in ${COMPOSE_FILES.length} compose file(s); ` +
    `the managed-store TCP URL (${[...names.publisher].sort().join(", ")}) appears in the publisher service only, ` +
    `named from ${SNAPSHOT_DOC} section 3 (detectors self-tested in both directions).`,
);
