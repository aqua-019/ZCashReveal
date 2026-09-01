/**
 * The `SnapshotStore` - four sources, tried in order, and a fault record for
 * every configured rung that did not answer.
 *
 * SERVER ONLY. Nothing under `'use client'` may import this module, directly or
 * transitively: it reads `process.env.SNAPSHOT_REDIS_*`, and assertion A4 greps
 * `.next/static` for those names. `./source` carries the types the client half
 * needs, so the staleness indicator imports that and never this.
 *
 * THE ORDER IS `docs/2.0/SNAPSHOT.md` §3 AND THE NAMES ARE THE ONES VERCEL
 * ACTUALLY INJECTS. HANDOFF-11 as written named `SNAPSHOT_REDIS_URL`,
 * `SNAPSHOT_REDIS_REST_URL` and `SNAPSHOT_REDIS_REST_TOKEN`; those three are
 * injected by nothing, and code written against them would have read
 * `undefined`, fallen through to the gateway or the fixture, and rendered a
 * stale site reporting no fault. HANDOFF-05 corrected the repository; this is
 * the first module that depends on the correction being right.
 *
 * THE READ-ONLY TOKEN, NEVER THE READ-WRITE ONE. `SNAPSHOT.md` rule 6: the
 * publisher is the only writer, and `apps/web` reads with
 * `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN`. Assertion A8 greps this source
 * tree for a read of the read-write name and must find none.
 *
 * READS ARE COMMANDS TOO, AND THEY ARE THE UNBOUNDED HALF (`SNAPSHOT.md` §5).
 * The publisher's three writes per block are bounded by the block rate; this
 * side is bounded by traffic, by the number of regions serving the page and by
 * how often it revalidates. So the resolution is memoised at MODULE SCOPE with
 * a staleness window, and concurrent callers share one in-flight request rather
 * than issuing one each. Two pages rendered in one revalidation window are one
 * `GET`, which is what assertion A10 counts.
 *
 * IT NEVER THROWS AND IT NEVER RETURNS NOTHING. The bundled fixture is the last
 * rung and it is always available, so `resolveSnapshot()` is total. That is the
 * whole design goal restated from the plan: "empty dashboards become
 * structurally impossible."
 */

import { snapshotV1Schema, SNAPSHOT_KEYS, type SnapshotV1 } from "@zcashreveal/types";

import { fixtureSnapshot } from "@/lib/api/fixtures/snapshot";

import type { ResolvedSnapshot, SnapshotFault, SnapshotSource } from "./source";

/**
 * How long a resolved document may be reused before another read is issued.
 *
 * SIXTY SECONDS, MATCHING §3's ISR WINDOW, and the two numbers are the same
 * number on purpose: a memo shorter than the revalidation window spends reads
 * the window already paid for, and one longer than it serves a document older
 * than the page claims to be. `revalidate` is exported from the routes; this is
 * the module-scope half of the same policy.
 */
export const SNAPSHOT_TTL_MS = 60_000;

/** The publisher writes it as one JSON string under this key. */
export const SNAPSHOT_LATEST_KEY = SNAPSHOT_KEYS.latest;

/** How long any one rung may take before it is treated as unreachable. */
const RUNG_TIMEOUT_MS = 3_000;

interface Env {
  readonly restUrl: string;
  readonly restToken: string;
  readonly tcpUrl: string;
  readonly apiUrl: string;
}

/**
 * Read the four configuration values.
 *
 * EMPTY IS ABSENT. `playwright.config.ts` sets all five `SNAPSHOT_REDIS_*`
 * names to the EMPTY STRING rather than deleting them, because Playwright
 * merges `webServer.env` over `process.env` and only a present-but-empty value
 * reliably overrides an inherited one. A store that treated `""` as configured
 * would turn that guard into a rung that is configured and always fails - a
 * fault on every e2e build, and worse, an attempt to dial an empty URL.
 *
 * Read at CALL time and not at module load, so a test can set the environment
 * between resolutions without reloading the module graph.
 */
function readEnv(): Env {
  return {
    restUrl: (process.env.SNAPSHOT_REDIS_KV_REST_API_URL ?? "").trim(),
    // The READ-ONLY token. A8 asserts the read-write name is read nowhere here.
    restToken: (process.env.SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN ?? "").trim(),
    // Upstash injects both spellings of the TCP URL; either is the same store.
    tcpUrl: (process.env.SNAPSHOT_REDIS_KV_URL ?? process.env.SNAPSHOT_REDIS_REDIS_URL ?? "").trim(),
    apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "").trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* The read counter, which is assertion A10                                    */
/* -------------------------------------------------------------------------- */

let managedStoreGets = 0;

/**
 * How many commands this process has sent to the MANAGED store.
 *
 * Counts the `redis-rest` and `redis` rungs and nothing else: the gateway is
 * this project's own box and the fixture is a bundled import, so neither draws
 * on the allowance shared with the other project. A10 asserts that rendering
 * two pages in one window increments this by one, which is a count of the thing
 * `SNAPSHOT.md` §5 budgets rather than a count of renders.
 */
export function managedStoreReadCount(): number {
  return managedStoreGets;
}

/** Test-only. Resets the counter and the memo so a case starts from a known state. */
export function __resetSnapshotStore(): void {
  managedStoreGets = 0;
  cached = null;
  inflight = null;
}

/* -------------------------------------------------------------------------- */
/* The rungs                                                                   */
/* -------------------------------------------------------------------------- */

/** A rung answered with a document, or it did not and said why. */
type RungResult =
  | { readonly ok: true; readonly doc: SnapshotV1 }
  | { readonly ok: false; readonly reason: string }
  | { readonly ok: "unconfigured" };

/**
 * Parse a JSON text into a `SnapshotV1`, or say which half failed.
 *
 * THE TWO FAILURES ARE KEPT APART because they mean different things to an
 * operator and the same thing to a reader: "this is not JSON" is a transport or
 * a publisher defect, and "this is not a V1" is a document from a schema this
 * build does not understand. `SnapshotV1`'s own docblock names the distinction
 * as the reason the `schema` field exists.
 */
function parseDocument(text: string): RungResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "the stored document is not JSON" };
  }
  const parsed = snapshotV1Schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: `the stored document is not a SnapshotV1: ${first?.path.join(".") ?? "?"} ${first?.message ?? "invalid"}`,
    };
  }
  return { ok: true, doc: parsed.data };
}

/** `fetch` with a deadline, so an unreachable host is a fault rather than a hung render. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, RUNG_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rung 1 - the managed store's REST endpoint.
 *
 * Upstash-compatible: `GET {base}/get/{key}` with a bearer token answers
 * `{"result": "<the stored string>"}`, and `result` is `null` for a key that
 * does not exist. A key that does not exist is a FAULT here rather than a
 * silent fall-through, because the credentials were present: it means the
 * publisher has not written, which an operator needs to see.
 *
 * ONE KEY, INSIDE THE OWNED NAMESPACE. `SNAPSHOT_KEYS.latest` is
 * `zecreveal:snapshot:latest`; no scan, no enumeration, no key outside the
 * prefix. `SNAPSHOT.md` rules 1, 3 and 7.
 */
async function readRedisRest(env: Env): Promise<RungResult> {
  if (env.restUrl === "" || env.restToken === "") return { ok: "unconfigured" };
  managedStoreGets += 1;
  try {
    const base = env.restUrl.replace(/\/+$/, "");
    const res = await fetchWithTimeout(`${base}/get/${encodeURIComponent(SNAPSHOT_LATEST_KEY)}`, {
      headers: { authorization: `Bearer ${env.restToken}`, accept: "application/json" },
    });
    if (!res.ok) return { ok: false, reason: `the managed store answered ${res.status}` };
    const body: unknown = await res.json();
    const result = (body as { result?: unknown } | null)?.result;
    if (result === null || result === undefined) {
      return { ok: false, reason: "the managed store holds no snapshot yet" };
    }
    if (typeof result !== "string") {
      return { ok: false, reason: "the managed store returned a non-string value" };
    }
    return parseDocument(result);
  } catch (err) {
    // The URL and the token never reach this string: it is rendered to every
    // visitor. `routes/errors.ts` in the gateway records the same rule.
    return { ok: false, reason: `the managed store did not answer (${errName(err)})` };
  }
}

/**
 * Rung 2 - the managed store over TCP.
 *
 * NODE RUNTIME ONLY, AND IMPORTED DYNAMICALLY FOR THAT REASON. `ioredis` opens
 * a socket, which the edge runtime has no API for; a static import would put it
 * in every bundle that reaches this module even when rung 1 answers. The import
 * happens only when the TCP URL is configured AND rung 1 has already failed or
 * is unset, which on Vercel is never - both spellings are injected alongside the
 * REST pair, so this rung exists for a deployment that has the TCP URL and not
 * the REST one.
 *
 * ONE CONNECTION, CLOSED AFTER THE READ. A long-lived pool in a serverless
 * function is a connection leaked per instance; the memo above is what keeps
 * this from being per-render.
 */
async function readRedisTcp(env: Env): Promise<RungResult> {
  if (env.tcpUrl === "") return { ok: "unconfigured" };
  managedStoreGets += 1;
  let client: { get: (k: string) => Promise<string | null>; quit: () => Promise<unknown> } | null = null;
  try {
    const { Redis } = (await import("ioredis")) as unknown as {
      Redis: new (url: string, opts: Record<string, unknown>) => {
        get: (k: string) => Promise<string | null>;
        quit: () => Promise<unknown>;
      };
    };
    client = new Redis(env.tcpUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      connectTimeout: RUNG_TIMEOUT_MS,
      enableOfflineQueue: false,
    });
    const text = await client.get(SNAPSHOT_LATEST_KEY);
    if (text === null) return { ok: false, reason: "the managed store holds no snapshot yet" };
    return parseDocument(text);
  } catch (err) {
    return { ok: false, reason: `the managed store did not answer (${errName(err)})` };
  } finally {
    if (client !== null) {
      try {
        await client.quit();
      } catch {
        // A failed quit on an already-broken socket is not a second fault.
      }
    }
  }
}

/**
 * Rung 3 - the gateway.
 *
 * `/v2/snapshot`, NOT `/api/snapshot`. HANDOFF-11 §3 as written spelled it
 * `/api`, and §4.2 of the same handoff deletes that prefix - so a rung written
 * against it would have answered 410 the moment the gateway change landed and
 * fallen silently through to the fixture. Both paths answer on merged main,
 * which is what kept the contradiction invisible. Corrected in §3 by
 * deliverable 0.
 *
 * The gateway answers 503 with a `reason` when it has no document, which is a
 * fault here: this rung was configured and the answer is "nothing to render".
 */
async function readGateway(env: Env): Promise<RungResult> {
  if (env.apiUrl === "") return { ok: "unconfigured" };
  try {
    const base = env.apiUrl.replace(/\/+$/, "");
    const res = await fetchWithTimeout(`${base}/v2/snapshot`, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: `the gateway answered ${res.status}` };
    return parseDocument(await res.text());
  } catch (err) {
    return { ok: false, reason: `the gateway did not answer (${errName(err)})` };
  }
}

/** An error's class name, which is all of it that is safe to render. */
function errName(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "timed out" : err.name;
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/* The resolution                                                              */
/* -------------------------------------------------------------------------- */

let cached: ResolvedSnapshot | null = null;
let inflight: Promise<ResolvedSnapshot> | null = null;

const RUNGS: ReadonlyArray<{ source: SnapshotSource; read: (env: Env) => Promise<RungResult> }> = [
  { source: "redis-rest", read: readRedisRest },
  { source: "redis", read: readRedisTcp },
  { source: "gateway", read: readGateway },
];

async function resolveUncached(nowMs: number): Promise<ResolvedSnapshot> {
  const env = readEnv();
  const faults: SnapshotFault[] = [];

  for (const rung of RUNGS) {
    const result = await rung.read(env);
    if (result.ok === true) {
      return { doc: result.doc, source: rung.source, faults, fetchedAtMs: nowMs };
    }
    // `unconfigured` is not a fault: an unset variable is a deployment choice.
    if (result.ok === false) faults.push({ rung: rung.source, reason: result.reason });
  }

  return { doc: fixtureSnapshot(), source: "fixture", faults, fetchedAtMs: nowMs };
}

/**
 * The document this render should use.
 *
 * ONE FETCH PER WINDOW, SHARED BY EVERY CALLER IN IT. Two pages rendering in the
 * same revalidation window issue one managed-store `GET` between them; ten
 * components on one page issue none beyond it. That is `SNAPSHOT.md` §5's rule
 * about the read side, and assertion A10 counts it rather than reviewing it.
 *
 * A resolution that fell through to the fixture is cached like any other. It has
 * to be: without that, a deployment whose store is down would issue a fresh
 * failing read for every component on every render - the unbounded read the
 * budget exists to prevent, arriving precisely when the store is least able to
 * serve it.
 */
export async function resolveSnapshot(): Promise<ResolvedSnapshot> {
  const now = Date.now();
  if (cached !== null && now - cached.fetchedAtMs < SNAPSHOT_TTL_MS) return cached;
  if (inflight !== null) return inflight;

  inflight = resolveUncached(now)
    .then((resolved) => {
      cached = resolved;
      return resolved;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
