/**
 * Build data/sources.json from the research corpus.
 *
 * Deliverable 2 asks for "every URL de-duplicated", so this takes the union of
 * every URL in the four dossiers rather than a hand-picked subset. Nothing here
 * invents a source: a URL that is not in docs/2.0/research cannot enter the
 * file, and every title is either the corpus's own bullet text, its own link
 * text, or a mechanical rendering of the URL's own path.
 *
 * Run: node packages/content/scripts/build-sources.mjs
 * Check: pnpm --filter @zcashreveal/content check:provenance
 */
import { readFileSync, writeFileSync } from "node:fs";
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

/** The dossiers were compiled and fetched on this date; every source is accessed-as-of it. */
const ACCESSED = "2026-08-22";

const URL_RE = /https?:\/\/[^\s)>\]",'`]+/g;

/** Trailing punctuation that belongs to the prose, not the URL. */
function cleanUrl(raw) {
  let url = raw;
  while (/[.,;:!?*_`]$/.test(url)) url = url.slice(0, -1);
  // A closing paren only belongs to the URL if the URL opened one.
  while (url.endsWith(")") && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) {
    url = url.slice(0, -1);
  }
  return url;
}

/** Two URLs that differ only by a trailing slash or by case of host are one source. */
function normalise(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname}${path}${u.search}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "(26 Apr 2016)" or "2026-08-22" or a /2026/06/05/ path segment. */
function extractDate(text, url) {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const prose = /\((?:.*?)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\)/.exec(text);
  if (prose) {
    const month = MONTHS[prose[2].toLowerCase()];
    if (month) return `${prose[3]}-${month}-${prose[1].padStart(2, "0")}`;
  }
  const path = /\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(url);
  if (path) return `${path[1]}-${path[2]}-${path[3]}`;
  const pathDash = /\/(\d{4})-(\d{2})-(\d{2})[-/]/.exec(url);
  if (pathDash) return `${pathDash[1]}-${pathDash[2]}-${pathDash[3]}`;
  return null;
}

/** Publisher names for the hosts the corpus leans on; everything else falls back to the host. */
const PUBLISHERS = {
  "electriccoin.co": "Electric Coin Company",
  "zfnd.org": "Zcash Foundation",
  "zodl.com": "ZODL",
  "shieldedlabs.net": "Shielded Labs",
  "zips.z.cash": "Zcash Improvement Proposals",
  "z.cash": "Zcash",
  "forum.zcashcommunity.com": "Zcash Community Forum",
  "github.com": "GitHub",
  "nvd.nist.gov": "NVD",
  "cve.mitre.org": "MITRE",
  "sec.gov": "SEC EDGAR",
  "data.sec.gov": "SEC EDGAR",
  "coindesk.com": "CoinDesk",
  "theblock.co": "The Block",
  "cointelegraph.com": "Cointelegraph",
  "decrypt.co": "Decrypt",
  "coingecko.com": "CoinGecko",
  "coinmarketcap.com": "CoinMarketCap",
  "en.wikipedia.org": "Wikipedia",
  "arxiv.org": "arXiv",
  "eprint.iacr.org": "IACR ePrint",
  "usenix.org": "USENIX",
  "prnewswire.com": "PR Newswire",
  "stocktitan.net": "StockTitan",
  "blockchair.com": "Blockchair",
  "api.blockchair.com": "Blockchair API",
  "finance.yahoo.com": "Yahoo Finance",
  "crypto.news": "crypto.news",
  "cryptoslate.com": "CryptoSlate",
  "dlnews.com": "DL News",
  "coinmetrics.substack.com": "Coin Metrics",
  "cipherscan.app": "CipherScan",
  "zecstats.com": "ZEC Stats",
  "defuse.ca": "ZecSec",
  "schneier.com": "Schneier on Security",
  "bitcoincore.org": "Bitcoin Core",
  "seanbowe.com": "Sean Bowe",
  "tachyon.z.cash": "Project Tachyon",
  "info.arkm.com": "Arkham",
  "openzcash.org": "OpenZcash",
  "zcashcommunitygrants.org": "Zcash Community Grants",
  "nasdaq.com": "Nasdaq",
  "stockanalysis.com": "StockAnalysis",
  "ambcrypto.com": "AMBCrypto",
  "beincrypto.com": "BeInCrypto",
  "blockchain.news": "Blockchain.News",
  "protos.com": "Protos",
  "bankless.com": "Bankless",
  "messari.io": "Messari",
  "galaxy.com": "Galaxy",
  "ccn.com": "CCN",
  "u.today": "U.Today",
  "phemex.com": "Phemex",
  "cryptobriefing.com": "Crypto Briefing",
  "cointribune.com": "Cointribune",
  "thedefiant.io": "The Defiant",
  "chaincatcher.com": "ChainCatcher",
  "dailyhodl.com": "The Daily Hodl",
  "bitget.com": "Bitget",
  "tradingview.com": "TradingView",
  "coincarp.com": "CoinCarp",
  "bitinfocharts.com": "BitInfoCharts",
  "whale-alert.io": "Whale Alert",
  "blockstream.com": "Blockstream",
  "forbes.com": "Forbes",
  "wired.com": "Wired",
  "reuters.com": "Reuters",
  "bloomberg.com": "Bloomberg",
};

/**
 * Curated titles for a handful of URLs whose corpus context is a long inline
 * list rather than a title. The URL still has to come from the corpus; only the
 * label is written here.
 */
const TITLE_OVERRIDES = new Map([
  [
    "https://api.blockchair.com/zcash/dashboards/address/{addr}",
    "Blockchair Zcash API -- address dashboard (method; queried 2026-08-22)",
  ],
  [
    "https://api.blockchair.com/zcash/dashboards/transaction/{hash}",
    "Blockchair Zcash API -- transaction dashboard (method; queried 2026-08-22)",
  ],
]);

function publisherFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (PUBLISHERS[host]) return PUBLISHERS[host];
    const parts = host.split(".");
    const stem = parts.length > 2 ? parts.slice(-2).join(".") : host;
    if (PUBLISHERS[stem]) return PUBLISHERS[stem];
    return host;
  } catch {
    return "unknown";
  }
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);

/** Path segments the corpus's hosts use as routing noise rather than as meaning. */
const NOISE_SEGMENTS = new Set(["t", "p", "en", "en-eu", "news", "post", "posts", "article", "articles", "blog", "index.html"]);

/** Acronyms that must not be title-cased into nonsense. */
const ACRONYMS = new Map([
  ["nu5", "NU5"], ["nu6", "NU6"], ["nu6-1", "NU6.1"], ["nu6-2", "NU6.2"], ["nu6-3", "NU6.3"],
  ["zec", "ZEC"], ["zsa", "ZSA"], ["ecc", "ECC"], ["zf", "ZF"], ["etf", "ETF"], ["sec", "SEC"],
  ["api", "API"], ["faq", "FAQ"], ["cve", "CVE"], ["ghsa", "GHSA"], ["zip", "ZIP"], ["usd", "USD"],
]);

function titleCase(stem) {
  return stem
    .split(" ")
    .filter((w) => w.length > 0 && !/^\d{6,}$/.test(w) && !/^[0-9a-f]{16,}$/i.test(w))
    .map((w, i) => {
      const acronym = ACRONYMS.get(w.toLowerCase());
      if (acronym) return acronym;
      if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Render a URL path as a readable title when the corpus gives no prose one.
 * A one-word tail ("nu5", "zcash") says almost nothing on its own, so short
 * results are widened to the publisher plus the whole meaningful path.
 */
function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const segments = u.pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => decodeURIComponent(seg).replace(/\.(html?|json|xml|pdf|md)$/i, ""))
      .filter((seg) => seg.length > 0 && !/^\d+$/.test(seg) && !NOISE_SEGMENTS.has(seg.toLowerCase()));

    const render = (seg) => titleCase(seg.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim());
    const tail = segments.length > 0 ? render(segments[segments.length - 1]) : "";
    if (tail.length >= 12) return tail;

    const whole = segments.map(render).filter((s) => s.length > 0).join(" ");
    const publisher = publisherFor(url);
    if (whole.length === 0) return `${publisher} (${u.hostname})`;
    return `${publisher}: ${whole}`;
  } catch {
    return url;
  }
}

/**
 * Tidy a title lifted out of prose. Splitting a line on its URL can leave the
 * opening half of a markdown link behind ("... [[21shares]("), so bracket and
 * punctuation debris is trimmed from both ends until the title ends in a word.
 */
function trimTitle(text) {
  let out = text;
  for (let i = 0; i < 6; i += 1) {
    const before = out;
    out = out
      .replace(/\[\[?[^\[\]]*\]\(\s*$/, "")
      .replace(/[[(\s\u2013\u2014:,;.\-]+$/, "")
      .replace(/^[[(\s\u2013\u2014:,;.\-]+/, "")
      .trim();
    if (out === before) break;
  }
  return out;
}

/** Strip markdown emphasis and backticks; collapse whitespace. */
function plain(text) {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(text, max = 48) {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/, "");
}

/* -------------------------------------------------------------------------- */

/** normalisedUrl -> { url, titles: string[], context: string[] } */
const found = new Map();

function record(url, title, kind, context) {
  const key = normalise(url);
  let entry = found.get(key);
  if (!entry) {
    entry = { url, titles: [], contexts: [] };
    found.set(key, entry);
  }
  // Prefer https and the shorter, canonical spelling of the same resource.
  if (url.startsWith("https://") && entry.url.startsWith("http://")) entry.url = url;
  if (title) entry.titles.push({ text: title, kind });
  if (context) entry.contexts.push(context);
}

for (const file of FILES) {
  const text = readFileSync(join(RESEARCH, file), "utf8");
  for (const line of text.split("\n")) {
    const urls = [...line.matchAll(URL_RE)].map((m) => cleanUrl(m[0]));
    if (urls.length === 0) continue;

    // A source-list bullet: "- Title -- URL" (the corpus uses an em dash).
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    let bulletTitle = null;
    if (bullet) {
      const head = bullet[1].split(/https?:\/\//)[0];
      const cleaned = trimTitle(plain(head));
      if (cleaned.length >= 4) bulletTitle = cleaned;
    }

    // Markdown links give a per-URL label, usually a short publisher tag.
    const linkText = new Map();
    for (const m of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
      linkText.set(normalise(cleanUrl(m[2])), plain(m[1]));
    }

    for (const [index, url] of urls.entries()) {
      const label = trimTitle(linkText.get(normalise(url)) ?? "");
      // The bullet title describes the first URL on the line; later URLs on the
      // same bullet are separate resources and get their own derived title.
      if (index === 0 && bulletTitle) record(url, bulletTitle, "bullet", `${file}: ${plain(line).slice(0, 200)}`);
      else record(url, label.length > 12 ? label : null, "link", `${file}: ${plain(line).slice(0, 200)}`);
    }
  }
}

/* -------------------------------------------------------------------------- */

const usedIds = new Set();
const sources = [];

for (const entry of [...found.values()].sort((a, b) => normalise(a.url).localeCompare(normalise(b.url)))) {
  const publisher = publisherFor(entry.url);
  // Longest corpus-supplied title wins; it is the most descriptive one written
  // by a human. Only fall back to the URL's own path when there is none.
  // A curated source-list bullet always beats an inline link label: the bullets
  // are the dossiers' own bibliographies, the labels are one-word publisher tags.
  const byLength = (a, b) => b.text.length - a.text.length;
  const bullets = entry.titles.filter((t) => t.kind === "bullet").sort(byLength);
  const links = entry.titles.filter((t) => t.kind === "link").sort(byLength);
  const corpusTitle = (bullets[0] ?? links[0])?.text ?? null;
  const derived = titleFromUrl(entry.url);
  // A one- or two-word corpus label ("Zcash", "CoinDesk") says less than the
  // URL's own path does, so the longer of the two wins below twelve characters.
  const chosen = corpusTitle && corpusTitle.length >= 12
    ? corpusTitle
    : derived.length > (corpusTitle?.length ?? 0)
      ? derived
      : corpusTitle ?? derived;
  const title = (TITLE_OVERRIDES.get(entry.url) ?? chosen).slice(0, 220);
  const date = extractDate(entry.contexts.join(" · "), entry.url);

  let id = `S-${slug(`${publisher}-${title}`)}`;
  if (id === "S-") id = `S-${slug(entry.url)}`;
  let n = 2;
  const base = id;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);

  sources.push({ id, title, url: entry.url, publisher, date, accessed: ACCESSED });
}

sources.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(HERE, "..", "data", "sources.json"), `${JSON.stringify(sources, null, 2)}\n`, "utf8");
process.stdout.write(`sources.json: ${sources.length} sources from ${FILES.length} dossiers\n`);
