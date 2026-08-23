/**
 * Rewrite URL citations into source ids.
 *
 * Transcription work cites the URL printed on the row it came from, because
 * that is the only reference a transcriber can copy without inventing
 * anything. This resolves those URLs against data/sources.json and rewrites
 * them in place, so the committed data cites ids and assertion A2 holds by
 * construction rather than by review.
 *
 * A URL that is not in sources.json is an error, not a silent addition: it
 * means the citation came from outside the research corpus.
 *
 * Run: node packages/content/scripts/resolve-refs.mjs [file.json ...]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function normalise(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    return `${u.protocol}//${u.hostname}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

const sources = JSON.parse(readFileSync(join(DATA, "sources.json"), "utf8"));
const byUrl = new Map(sources.map((s) => [normalise(s.url), s.id]));
const ids = new Set(sources.map((s) => s.id));

const targets = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : readdirSync(DATA).filter((f) => f.endsWith(".json") && f !== "sources.json");

const unresolved = [];
let rewritten = 0;

function walk(node) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      node[i] = walk(child);
    });
    return node;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "sources" && Array.isArray(value)) {
        node[key] = value.map((ref) => {
          if (typeof ref !== "string") return ref;
          if (ids.has(ref)) return ref;
          const id = byUrl.get(normalise(ref));
          if (id === undefined) {
            unresolved.push(ref);
            return ref;
          }
          rewritten += 1;
          return id;
        });
        // Two rows can cite the same source twice; one citation is enough.
        node[key] = [...new Set(node[key])];
      } else {
        node[key] = walk(value);
      }
    }
    return node;
  }
  return node;
}

for (const file of targets) {
  const path = join(DATA, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify(walk(data), null, 2)}\n`, "utf8");
}

process.stdout.write(`resolve-refs: ${rewritten} url citation(s) rewritten across ${targets.length} file(s)\n`);
if (unresolved.length > 0) {
  const unique = [...new Set(unresolved)];
  process.stdout.write(`\nFAIL  ${unique.length} citation(s) resolve to nothing in sources.json\n`);
  for (const ref of unique) process.stdout.write(`  ${ref}\n`);
  process.exit(1);
}
