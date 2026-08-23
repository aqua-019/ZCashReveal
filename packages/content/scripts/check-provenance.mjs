/**
 * Anti-fabrication check: every URL in data/sources.json must actually occur in
 * the research corpus under docs/2.0/research.
 *
 * The validator proves the data is internally consistent. This proves it is not
 * invented: a source nobody researched cannot be cited by anything, because it
 * cannot be in sources.json in the first place.
 *
 * Run: pnpm --filter @zcashreveal/content check:provenance
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const RESEARCH = join(REPO, "docs", "2.0", "research");
const FILES = [
  "01-contemporary-zcash.md",
  "02-promotion-network.md",
  "03-history-exploits-governance.md",
  "04-exchange-inflows-insider-selling.md",
];

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

const corpus = new Set();
for (const file of FILES) {
  const text = readFileSync(join(RESEARCH, file), "utf8");
  for (const match of text.matchAll(/https?:\/\/[^\s)>\]",'`]+/g)) {
    let url = match[0];
    while (/[.,;:!?*_`]$/.test(url)) url = url.slice(0, -1);
    while (url.endsWith(")") && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) url = url.slice(0, -1);
    corpus.add(normalise(url));
  }
}

const sources = JSON.parse(readFileSync(join(HERE, "..", "data", "sources.json"), "utf8"));
const orphans = sources.filter((s) => !corpus.has(normalise(s.url)));

process.stdout.write(`provenance: ${sources.length} sources against ${corpus.size} corpus urls\n`);
if (orphans.length > 0) {
  process.stdout.write(`\nFAIL  ${orphans.length} source(s) not present in docs/2.0/research\n`);
  for (const s of orphans) process.stdout.write(`  ${s.id}  ${s.url}\n`);
  process.exit(1);
}
process.stdout.write("OK  every source url occurs in the research corpus\n");
