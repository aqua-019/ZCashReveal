// Guards HANDOFF-10 assertion A3, and then goes further than A3 asks.
//
// A3 says: `zebrad.toml` parses as TOML and contains `enable_cookie_auth = false`
// under `[rpc]` and the address-index keys named in the runbook.
//
// TWO OF THOSE THREE ARE CHECKED HERE AND THE THIRD CANNOT EXIST. There are no
// address-index keys in Zebra 6.2.3 - not under `[rpc]`, not under `[state]`,
// not anywhere in `ZebradConfig` (zebrad/src/config.rs:54-95 at v6.2.3). The
// address RPCs the gateway depends on are unconditional: `getaddressbalance`,
// `getaddresstxids` and `getaddressutxos` are declared on the RPC trait at
// zebra-rpc/src/methods.rs lines 232, 438 and 459. Nothing turns them on because
// nothing turns them off. So this guard asserts what the assertion was REACHING
// for - that the config zebrad will actually accept, and that the RPC surface
// the rest of the stack needs is reachable - rather than the letter of a key
// that does not exist.
//
// WHY A KEY ALLOWLIST IS THE VALUABLE PART. Every config section in Zebra
// carries `#[serde(deny_unknown_fields)]`. An unknown or misspelled key is not
// ignored and is not a warning: zebrad refuses to start. On a VPS that is a node
// that comes up, exits, and is restarted forever by `restart: unless-stopped`,
// with the reason in a log nobody is reading yet. A typo that a human would need
// a running node to discover is caught here instead, before the file is shipped.
//
// AND WHY IT CROSS-CHECKS THE COMPOSE FILE. Three values appear in both files
// and must agree: the health port the container healthcheck curls, the state
// directory the volume mounts, and the config path the entrypoint is told to
// read. Each is correct in isolation and wrong together if one moves, which is
// the exact defect shape this repository keeps finding - a correction that lands
// in one file while another still states the old value.

import { readFileSync, existsSync } from "node:fs";

const CONFIG = "infra/zebrad/zebrad.toml";
const COMPOSE = "docker-compose.yml";

/**
 * The keys Zebra 6.2.3 accepts, for the sections this project writes.
 *
 * Read from the source at tag v6.2.3, file by file, and cited here so the next
 * reader can check rather than trust:
 *
 *   [network]  zebra-network/src/config.rs
 *   [state]    zebra-state/src/config.rs
 *   [rpc]      zebra-rpc/src/config/rpc.rs
 *   [health]   zebrad/src/components/health/config.rs
 *   [tracing]  zebrad/src/components/tracing.rs
 *   [metrics]  zebrad/src/components/metrics.rs
 *   [notify]   zebrad/src/components/notify.rs
 *
 * DELIBERATELY A SUBSET. These are the keys this project has reason to set, not
 * every key Zebra accepts. A key that is real but absent from this list fails
 * the guard and the fix is to add it here WITH its source line - which is the
 * point: it makes someone read the struct before shipping a config change.
 */
const KNOWN_KEYS = {
  network: ["network", "listen_addr", "external_addr", "cache_dir", "max_connections_per_ip", "peerset_initial_target_size"],
  state: ["cache_dir", "ephemeral", "delete_old_database"],
  rpc: ["listen_addr", "indexer_listen_addr", "parallel_cpu_threads", "cookie_dir", "enable_cookie_auth", "max_response_body_size", "debug_force_finished_sync"],
  health: ["listen_addr", "min_connected_peers", "ready_max_blocks_behind", "enforce_on_test_networks", "ready_max_tip_age"],
  tracing: ["filter", "use_color", "force_use_color"],
  metrics: ["endpoint_addr"],
  notify: ["block_notify_command"],
  mempool: ["eviction_memory_time", "tx_cost_limit"],
  consensus: ["checkpoint_sync"],
  sync: ["checkpoint_verify_concurrency_limit", "download_concurrency_limit"],
  mining: ["miner_address"],
  zcashd_compat: ["enabled", "manage_zcashd", "zcashd_source", "zcashd_path", "zcashd_datadir"],
};

/**
 * A strict reader for the TOML subset this file uses.
 *
 * STRICT MEANS IT REFUSES WHAT IT DOES NOT UNDERSTAND rather than skipping it.
 * A lenient parser here would be worse than none: it would silently ignore the
 * one malformed line that stops zebrad booting and report the file as parsed.
 * The subset is `[table]` headers, `key = value` with a quoted string, a bare
 * boolean or an integer, comments, and blank lines. Anything else - an array, an
 * inline table, a multi-line string, a dotted key - is reported as unsupported,
 * which is honest: this config has none of them, and if it grows one, this
 * script should be extended deliberately rather than have guessed.
 */
function parseToml(text) {
  const tables = new Map();
  const errors = [];
  let current = null;

  text.split("\n").forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\s+$/, "");
    const bare = line.trim();
    if (bare === "" || bare.startsWith("#")) return;

    const table = /^\[([A-Za-z0-9_]+)\]$/.exec(bare);
    if (table !== null) {
      current = table[1];
      if (!tables.has(current)) tables.set(current, new Map());
      return;
    }
    if (/^\[/.test(bare)) {
      errors.push({ lineNo, why: `unsupported table header: ${bare}` });
      return;
    }

    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.+?)\s*(?:#.*)?$/.exec(bare);
    if (kv === null) {
      errors.push({ lineNo, why: `not a key = value line: ${bare}` });
      return;
    }
    if (current === null) {
      errors.push({ lineNo, why: `key outside any table: ${kv[1]}` });
      return;
    }

    const rawValue = kv[2];
    let value;
    const str = /^"((?:[^"\\]|\\.)*)"$/.exec(rawValue);
    if (str !== null) value = str[1];
    else if (rawValue === "true") value = true;
    else if (rawValue === "false") value = false;
    else if (/^-?\d+$/.test(rawValue)) value = Number(rawValue);
    else {
      errors.push({ lineNo, why: `unsupported value for ${kv[1]}: ${rawValue}` });
      return;
    }
    tables.get(current).set(kv[1], value);
  });

  return { tables, errors };
}

/**
 * A YAML file with its comment lines removed.
 *
 * Whole-line comments only. An inline `# ...` after a value cannot be stripped
 * safely without a parser, because `#` is legal inside a quoted scalar - and a
 * URL fragment or a colour would be truncated. Whole-line comments are where
 * this file's prose actually lives, so removing them closes the hole the gate
 * found without inventing a parser.
 */
function stripComments(text) {
  return text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

/** The port from a "host:port" listen address, or null. */
function portOf(addr) {
  const m = /:(\d+)$/.exec(String(addr));
  return m === null ? null : Number(m[1]);
}

function selfTest() {
  let ok = true;
  const fail = (m) => {
    console.error(`[zebrad-config] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

  const good = parseToml(
    ['# comment', '[rpc]', 'listen_addr = "0.0.0.0:8232"', "enable_cookie_auth = false", "", "[metrics]", "endpoint_addr = \"0.0.0.0:9999\""].join("\n"),
  );
  if (good.errors.length !== 0) fail(`rejected a valid file: ${JSON.stringify(good.errors)}`);
  if (good.tables.get("rpc")?.get("enable_cookie_auth") !== false) fail("did not read a false boolean");
  if (good.tables.get("rpc")?.get("listen_addr") !== "0.0.0.0:8232") fail("did not read a quoted string");

  // Direction two: each of these MUST be reported, not skipped.
  const mustError = [
    ['[rpc]', "enable_cookie_auth = maybe"].join("\n"),
    ['[rpc]', "listen_addr = 0.0.0.0:8232"].join("\n"), // unquoted string
    ['[rpc]', 'peers = ["a", "b"]'].join("\n"), // array, unsupported
    ["enable_cookie_auth = false"].join("\n"), // key with no table
    ["[rpc.nested]", "x = 1"].join("\n"), // dotted table, unsupported
    ['[rpc]', "this is not a key"].join("\n"),
  ];
  for (const t of mustError) {
    if (parseToml(t).errors.length === 0) fail(`accepted an invalid file: ${JSON.stringify(t)}`);
  }

  if (portOf("0.0.0.0:8080") !== 8080) fail("portOf did not read a port");
  if (portOf("nonsense") !== null) fail("portOf invented a port");

  // THE CROSS-FILE DETECTORS ARE PROBED TOO. The first gate round pointed out
  // that selfTest covered only parseToml and portOf, so the checks producing the
  // OK message's strongest claims - that the health port, the state directory
  // and the config path agree with the compose file - had no probe in either
  // direction. These pin the comment-stripping that makes them mean anything.
  const composeLike = [
    "  zebrad:",
    "    volumes:",
    "      - zebrad-data:/home/zebra/.cache/zebra",
    "      - ./infra/zebrad/zebrad.toml:/etc/zebrad/zebrad.toml:ro",
    "    environment:",
    "      CONFIG_FILE_PATH: /etc/zebrad/zebrad.toml",
    "    healthcheck:",
    '      test: ["CMD", "curl", "--fail", "--silent", "http://127.0.0.1:8080/healthy"]',
  ].join("\n");
  const stripped = stripComments(composeLike);
  if (!new RegExp("127\\.0\\.0\\.1:8080/healthy").test(stripped)) fail("cross-file: did not see a real healthcheck line");

  // The same file with the real settings replaced by COMMENTS that describe
  // them. Every check must go blind here; before the fix, all three passed.
  const proseOnly = [
    "  zebrad:",
    "    # the health server (8080) is bound inside the container",
    "    # curl http://127.0.0.1:8080/healthy to check it",
    "    # mounts ./infra/zebrad/zebrad.toml:/etc/zebrad/zebrad.toml",
    "    # sets CONFIG_FILE_PATH: /etc/zebrad/zebrad.toml",
    "    # state lives at /home/zebra/.cache/zebra",
  ].join("\n");
  const proseStripped = stripComments(proseOnly);
  if (new RegExp("127\\.0\\.0\\.1:8080/healthy").test(proseStripped)) fail("cross-file: a comment satisfied the healthcheck test");
  if (proseStripped.includes(":/home/zebra/.cache/zebra")) fail("cross-file: a comment satisfied the cache_dir test");
  if (/CONFIG_FILE_PATH:\s*\/etc\/zebrad\/zebrad\.toml/.test(proseStripped)) fail("cross-file: a comment satisfied the CONFIG_FILE_PATH test");

  return ok;
}

if (!selfTest()) {
  console.error("[zebrad-config] the parser is broken; a clean scan would prove nothing.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
if (!existsSync(CONFIG)) {
  console.error(`[zebrad-config] FAIL: ${CONFIG} does not exist.`);
  process.exit(1);
}

const { tables, errors } = parseToml(readFileSync(CONFIG, "utf8"));
const findings = [];

for (const e of errors) findings.push(`${CONFIG}:${e.lineNo}  ${e.why}`);

// Unknown keys - the ones that make zebrad refuse to start.
for (const [table, keys] of tables) {
  const known = KNOWN_KEYS[table];
  if (known === undefined) {
    findings.push(
      `${CONFIG}  unknown section [${table}]. ZebradConfig has twelve sections and this is not one of them; ` +
        "zebrad rejects the file rather than ignoring it.",
    );
    continue;
  }
  for (const key of keys.keys()) {
    if (!known.includes(key)) {
      findings.push(
        `${CONFIG}  unknown key [${table}] ${key}. Every Zebra config section is serde(deny_unknown_fields), ` +
          "so an INVENTED key here is a startup failure rather than a warning. A key that is real but merely " +
          "absent from this allowlist is not - it is this script being out of date, and the fix is to add it to " +
          "KNOWN_KEYS with the source line it was read from.",
      );
    }
  }
}

// The assertion's own requirement.
const rpc = tables.get("rpc");
if (rpc === undefined) {
  findings.push(`${CONFIG}  no [rpc] section, so the RPC server is disabled and the indexer has nothing to read.`);
} else {
  if (rpc.get("enable_cookie_auth") !== false) {
    findings.push(
      `${CONFIG}  [rpc] enable_cookie_auth must be false (A3). Zebra's cookie rotates on every restart and a ` +
        "long-lived indexer cannot follow it; the safety comes from publishing no host port for 8232.",
    );
  }
  if (rpc.get("listen_addr") === undefined) {
    findings.push(`${CONFIG}  [rpc] listen_addr is unset, and Zebra disables the RPC server by default.`);
  }
}

// Cross-file agreement with the compose stack.
if (!existsSync(COMPOSE)) {
  findings.push(`${COMPOSE} is missing, so the cross-file checks cannot run.`);
} else {
  // COMMENTS ARE STRIPPED BEFORE THESE TESTS, and the first gate round is why.
  // Each check below is a substring search over the compose file, and this file
  // is heavily commented - including comments that QUOTE the very strings being
  // searched for ("the health server (8080)", "CONFIG_FILE_PATH=/etc/zebrad/...").
  // So the cross-file agreement the header advertises as the guard's main value
  // was satisfiable by prose describing the setting rather than by the setting.
  // Delete the real healthcheck line and the guard stayed green on its own
  // comment.
  const compose = stripComments(readFileSync(COMPOSE, "utf8"));

  const healthAddr = tables.get("health")?.get("listen_addr");
  if (healthAddr === undefined) {
    findings.push(
      `${CONFIG}  [health] listen_addr is unset, but ${COMPOSE} healthchecks zebrad over HTTP. ` +
        "With it unset the server never starts and the container is unhealthy forever.",
    );
  } else {
    const port = portOf(healthAddr);
    const inCompose = new RegExp(`127\\.0\\.0\\.1:${port}/healthy`).test(compose);
    if (!inCompose) {
      findings.push(
        `${CONFIG}  [health] listen_addr is ${healthAddr}, but ${COMPOSE}'s zebrad healthcheck does not curl ` +
          `127.0.0.1:${port}/healthy. The two must agree or the check fails against a port nothing listens on.`,
      );
    }
  }

  const cacheDir = tables.get("state")?.get("cache_dir");
  if (cacheDir !== undefined && !compose.includes(`:${cacheDir}`)) {
    findings.push(
      `${CONFIG}  [state] cache_dir is ${cacheDir}, and no volume in ${COMPOSE} mounts that path. ` +
        "Zebra would sync into the container's writable layer and lose the whole chain on recreate.",
    );
  }

  if (!compose.includes(`${CONFIG}:/etc/zebrad/zebrad.toml`)) {
    findings.push(`${COMPOSE}  does not mount ${CONFIG} at /etc/zebrad/zebrad.toml, so none of this file is read.`);
  }
  if (!/CONFIG_FILE_PATH:\s*\/etc\/zebrad\/zebrad\.toml/.test(compose)) {
    findings.push(
      `${COMPOSE}  does not set CONFIG_FILE_PATH=/etc/zebrad/zebrad.toml. The image's entrypoint turns that ` +
        "variable into `zebrad --config <path>`; without it the mounted file is ignored and defaults apply.",
    );
  }
}

if (findings.length > 0) {
  console.error(`[zebrad-config] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

const sections = [...tables.keys()].sort().join(", ");
console.log(
  `[zebrad-config] OK: ${CONFIG} parses, every key in [${sections}] is one Zebra 6.2.3 accepts, ` +
    "[rpc] enable_cookie_auth = false, and the health port, state directory and config path all agree with " +
    `${COMPOSE} (parser self-tested in both directions).`,
);
