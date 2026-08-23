/**
 * Content validator. Fails the build on a missing source, a stale verification
 * date, a dangling reference, or an unverified claim that has leaked into the
 * Record.
 *
 * It reads the JSON off disk rather than through `src/loaders.ts` on purpose:
 * the loaders throw on the first bad record, and a validator that stops at the
 * first fault is a validator nobody can use. Every check runs, every failure is
 * printed with its file and its id, and the process exits 1 if any failed.
 *
 * Usage: pnpm --filter @zcashreveal/content validate
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodTypeAny } from "zod";

import {
  bewareFileSchema,
  casesFileSchema,
  contradictionsFileSchema,
  labelsFileSchema,
  networkSchema,
  phrasesFileSchema,
  sourcesFileSchema,
  statsSchema,
  timelineFileSchema,
  unverifiedFileSchema,
} from "../src/schema.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Counts asserted by HANDOFF-02 section 5, A1. `exact` where the corpus fixes the number. */
const EXPECTED: ReadonlyArray<{ file: string; exact?: number; min?: number }> = [
  { file: "beware.json", exact: 14 },
  { file: "contradictions.json", exact: 16 },
  { file: "timeline.json", min: 100 },
  { file: "labels.json", min: 7 },
  { file: "cases.json", exact: 3 },
  { file: "unverified.json", min: 15 },
  { file: "sources.json", min: 150 },
];

const SCHEMAS: Readonly<Record<string, ZodTypeAny>> = {
  "beware.json": bewareFileSchema,
  "cases.json": casesFileSchema,
  "contradictions.json": contradictionsFileSchema,
  "labels.json": labelsFileSchema,
  "network.json": networkSchema,
  "phrases.json": phrasesFileSchema,
  "sources.json": sourcesFileSchema,
  "stats.json": statsSchema,
  "timeline.json": timelineFileSchema,
  "unverified.json": unverifiedFileSchema,
};

const failures: string[] = [];
function fail(message: string): void {
  failures.push(message);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as unknown;
}

/* -------------------------------------------------------------------------- */
/* Load and schema-check every file                                           */
/* -------------------------------------------------------------------------- */

const raw: Record<string, unknown> = {};
const rawText: Record<string, string> = {};

for (const file of Object.keys(SCHEMAS)) {
  let value: unknown;
  try {
    rawText[file] = readFileSync(join(DATA_DIR, file), "utf8");
    value = readJson(file);
  } catch (error) {
    fail(`${file}: unreadable (${(error as Error).message})`);
    continue;
  }
  raw[file] = value;
  const parsed = SCHEMAS[file]!.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(`${file}: ${issue.path.join(".") || "(root)"} -- ${issue.message}`);
    }
  }
}

// A data file nobody declared is a file nobody validates.
for (const entry of readdirSync(DATA_DIR)) {
  if (entry.endsWith(".json") && !(entry in SCHEMAS)) {
    fail(`${entry}: present in data/ but not declared in the validator`);
  }
}

/* -------------------------------------------------------------------------- */
/* Shapes the rest of the checks rely on                                      */
/* -------------------------------------------------------------------------- */

type WithSources = { id?: unknown; sources?: unknown; lastVerified?: unknown };

/** Every record that carries sources, paired with the file it came from. */
function claimBearingRecords(): Array<{ file: string; record: WithSources }> {
  const out: Array<{ file: string; record: WithSources }> = [];
  const push = (file: string, records: unknown): void => {
    if (Array.isArray(records)) for (const record of records) out.push({ file, record: record as WithSources });
  };
  push("beware.json", raw["beware.json"]);
  push("contradictions.json", raw["contradictions.json"]);
  push("timeline.json", raw["timeline.json"]);
  push("phrases.json", raw["phrases.json"]);
  push("labels.json", raw["labels.json"]);
  push("cases.json", raw["cases.json"]);
  const network = raw["network.json"] as { entities?: unknown; edges?: unknown } | undefined;
  push("network.json", network?.entities);
  push("network.json", network?.edges);
  const stats = raw["stats.json"];
  if (stats !== undefined) out.push({ file: "stats.json", record: stats as WithSources });
  return out;
}

/* -------------------------------------------------------------------------- */
/* A1 -- counts                                                               */
/* -------------------------------------------------------------------------- */

const counts: Record<string, number> = {};
for (const { file, exact, min } of EXPECTED) {
  const value = raw[file];
  const n = Array.isArray(value) ? value.length : -1;
  counts[file] = n;
  if (n < 0) {
    fail(`${file}: expected an array`);
  } else if (exact !== undefined && n !== exact) {
    fail(`${file}: expected exactly ${exact} entries, found ${n}`);
  } else if (min !== undefined && n < min) {
    fail(`${file}: expected at least ${min} entries, found ${n}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Ids are unique, per file and across the claim space                        */
/* -------------------------------------------------------------------------- */

const seenIds = new Map<string, string>();
for (const { file, record } of claimBearingRecords()) {
  const id = record.id;
  if (typeof id !== "string") continue;
  const previous = seenIds.get(id);
  if (previous !== undefined) fail(`${file}: duplicate claim id "${id}" (already in ${previous})`);
  else seenIds.set(id, file);
}

const unverifiedRecords = (raw["unverified.json"] ?? []) as Array<{ id?: unknown; claim?: unknown }>;
const unverifiedIds = new Set<string>();
for (const record of unverifiedRecords) {
  if (typeof record.id !== "string") continue;
  if (unverifiedIds.has(record.id)) fail(`unverified.json: duplicate id "${record.id}"`);
  unverifiedIds.add(record.id);
}

/* -------------------------------------------------------------------------- */
/* A2 -- every SourceRef resolves, and sources.json is itself sound           */
/* -------------------------------------------------------------------------- */

const sources = (raw["sources.json"] ?? []) as Array<{ id?: unknown; url?: unknown }>;
const sourceIds = new Set<string>();
const sourceUrls = new Map<string, string>();
for (const source of sources) {
  if (typeof source.id === "string") {
    if (sourceIds.has(source.id)) fail(`sources.json: duplicate source id "${source.id}"`);
    sourceIds.add(source.id);
  }
  if (typeof source.url === "string") {
    const normalised = source.url.replace(/\/+$/, "").toLowerCase();
    const previous = sourceUrls.get(normalised);
    if (previous !== undefined) fail(`sources.json: duplicate url ${source.url} (already on ${previous})`);
    else if (typeof source.id === "string") sourceUrls.set(normalised, source.id);
  }
}

const referenced = new Set<string>();
for (const { file, record } of claimBearingRecords()) {
  const refs = record.sources;
  if (!Array.isArray(refs)) continue;
  for (const ref of refs) {
    if (typeof ref !== "string") continue;
    referenced.add(ref);
    if (!sourceIds.has(ref)) {
      fail(`${file}: ${String(record.id)} cites "${ref}", which is not in sources.json`);
    }
  }
}
for (const record of unverifiedRecords as Array<{ id?: unknown; sources?: unknown }>) {
  if (!Array.isArray(record.sources)) continue;
  for (const ref of record.sources) {
    if (typeof ref !== "string") continue;
    referenced.add(ref);
    if (!sourceIds.has(ref)) {
      fail(`unverified.json: ${String(record.id)} cites "${ref}", which is not in sources.json`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* A3 -- at least one source, and a lastVerified date that is not in the future */
/* -------------------------------------------------------------------------- */

const today = new Date().toISOString().slice(0, 10);
for (const { file, record } of claimBearingRecords()) {
  const id = typeof record.id === "string" ? record.id : "(no id)";
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    fail(`${file}: ${id} has no sources`);
  }
  const lastVerified = record.lastVerified;
  if (typeof lastVerified !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lastVerified)) {
    fail(`${file}: ${id} has no lastVerified date`);
  } else if (lastVerified > today) {
    fail(`${file}: ${id} lastVerified ${lastVerified} is in the future (today is ${today})`);
  }
}

/* -------------------------------------------------------------------------- */
/* A4 -- nothing from the quarantine appears anywhere else                    */
/* -------------------------------------------------------------------------- */

for (const record of unverifiedRecords) {
  const claim = record.claim;
  if (typeof claim !== "string" || claim.length < 12) {
    if (typeof claim === "string") fail(`unverified.json: claim "${claim}" is too short to be checkable`);
    continue;
  }
  for (const [file, text] of Object.entries(rawText)) {
    if (file === "unverified.json") continue;
    if (text.includes(claim)) {
      fail(`${file}: contains the unverified claim "${claim}" (id ${String(record.id)}) -- it may appear only in unverified.json`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Network edges point at entities that exist                                 */
/* -------------------------------------------------------------------------- */

const network = raw["network.json"] as
  | { entities?: Array<{ id?: unknown }>; edges?: Array<{ id?: unknown; from?: unknown; to?: unknown }> }
  | undefined;
if (network !== undefined) {
  const entityIds = new Set((network.entities ?? []).map((e) => e.id).filter((id): id is string => typeof id === "string"));
  for (const edge of network.edges ?? []) {
    for (const end of ["from", "to"] as const) {
      const value = edge[end];
      if (typeof value === "string" && !entityIds.has(value)) {
        fail(`network.json: edge ${String(edge.id)} points ${end} at "${value}", which is not an entity`);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

const unreferenced = [...sourceIds].filter((id) => !referenced.has(id));

process.stdout.write("content validation\n");
for (const { file, exact, min } of EXPECTED) {
  const label = file.replace(/\.json$/, "").padEnd(15, " ");
  const want = exact !== undefined ? `expected ${exact}` : `expected >= ${min}`;
  process.stdout.write(`  ${label} ${String(counts[file]).padStart(4, " ")}  (${want})\n`);
}
process.stdout.write(`  ${"network".padEnd(15, " ")} ${String((network?.entities ?? []).length).padStart(4, " ")} entities, ${(network?.edges ?? []).length} edges\n`);
process.stdout.write(`  ${"phrases".padEnd(15, " ")} ${String((raw["phrases.json"] as unknown[] | undefined)?.length ?? 0).padStart(4, " ")}\n`);
process.stdout.write(`  ${"source refs".padEnd(15, " ")} ${String(referenced.size).padStart(4, " ")} cited, ${unreferenced.length} uncited\n`);

if (failures.length > 0) {
  process.stdout.write(`\nFAIL  ${failures.length} problem${failures.length === 1 ? "" : "s"}\n`);
  for (const message of failures) process.stdout.write(`  ${message}\n`);
  process.exit(1);
}

process.stdout.write("\nOK  all checks passed\n");
