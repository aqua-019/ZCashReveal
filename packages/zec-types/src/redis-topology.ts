/**
 * The two-Redis contract, in one place so it is not retyped in three apps.
 *
 * THE TWO PREFIXES DIFFER BY ONE LETTER AND MEAN DIFFERENT SERVERS.
 *
 *   `zcashreveal:`  (with the `a`) - the VPS Redis. Pub/sub, the live mempool, the
 *                   anchor registry. Per-transaction traffic. Never leaves the box.
 *   `zecreveal:`    (no `a`)       - the Vercel-managed store. Snapshots only.
 *
 * Until this module existed the second prefix lived only as hand-typed string
 * literals in prose, waiting to be retyped by `apps/publisher` and by `apps/web`.
 * One transposed letter puts a snapshot key in the VPS namespace, or - far worse -
 * puts a VPS key in the managed store, which is SHARED WITH AN UNRELATED
 * PRODUCTION PROJECT. See `docs/2.0/SNAPSHOT.md`.
 *
 * The VPS channel and key names stay in `realtime.ts`, which is the contract
 * between the indexer and the gateway and predates this file. What is here is the
 * managed store's half plus the guard both apps need.
 */

/** The VPS Redis namespace. Everything on that instance begins with this. */
export const VPS_KEY_PREFIX = "zcashreveal:" as const;

/**
 * The managed store namespace. EVERY key this project writes, reads or deletes
 * there begins with this - no scratch keys, no health-check key outside it,
 * because anything outside it lands in the other tenant's keyspace.
 */
export const SNAPSHOT_KEY_PREFIX = "zecreveal:" as const;

/**
 * The three keys the publisher writes, and the only three this project owns.
 *
 * Builders rather than constants for the height one, so a caller cannot assemble
 * it from a template string and get the prefix wrong.
 */
export const SNAPSHOT_KEYS = {
  /** The current snapshot. No TTL. */
  latest: `${SNAPSHOT_KEY_PREFIX}snapshot:latest`,
  /** The tip height the `latest` snapshot describes. */
  height: `${SNAPSHOT_KEY_PREFIX}snapshot:height`,
} as const;

/** The per-height snapshot, which carries a 24 h TTL. */
export function snapshotKeyForHeight(height: number): string {
  if (!Number.isInteger(height) || height < 0) {
    throw new Error(`snapshotKeyForHeight: ${height} is not a block height`);
  }
  return `${SNAPSHOT_KEY_PREFIX}snapshot:${height}`;
}

/** Whether a key is one this project may touch on the managed store. */
export function isOwnedSnapshotKey(key: string): boolean {
  return key.startsWith(SNAPSHOT_KEY_PREFIX);
}

/**
 * Hosts that serve the Vercel-managed store. Suffix-matched, so a subdomain counts.
 *
 * A list rather than one string because the store is a Marketplace integration and
 * the provider behind it is the operator's to change. What must not change is that
 * no process on the VPS ever dials one of them.
 */
export const MANAGED_STORE_HOSTS: readonly string[] = ["upstash.io"];

/** The hostname of a URL, lowercased, or null if it does not parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether a URL addresses the managed store, by host. */
export function isManagedStoreUrl(url: string): boolean {
  const host = hostOf(url);
  if (host === null) return false;
  return MANAGED_STORE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Refuse to start if a Redis URL a process would dial is the managed store.
 *
 * WHY A HARD FAILURE RATHER THAN A WARNING. These URLs are operator-set strings
 * handed straight to a Redis constructor, and the things that dial them - the
 * indexer's writer, the gateway's rate limiter - are per-transaction and
 * per-request. The managed store holds another production project's live data on a
 * shared 500,000-command monthly allowance, and this project's entire budgeted
 * share of it is three writes per BLOCK. One pasted URL turns that into one write
 * per request, under a key prefix outside `zecreveal:`, in someone else's
 * database - and it would work, quietly, which is the whole problem.
 *
 * Two independent checks, because either alone has a gap: the HOSTNAME, which
 * catches a URL typed from memory; and an exact VALUE match against any
 * `SNAPSHOT_REDIS_*` variable in this environment, which catches a copy-paste out
 * of the Vercel UI whatever host it names.
 *
 * @param candidates the variables this process would dial, as [name, value] pairs
 * @param env the environment to compare against
 */
export function assertNotManagedStore(
  candidates: readonly (readonly [string, string | undefined])[],
  env: Readonly<Record<string, string | undefined>>,
): void {
  const snapshotValues = new Map<string, string>();
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("SNAPSHOT_REDIS") && typeof value === "string" && value.length > 0) {
      snapshotValues.set(value, name);
    }
  }

  for (const [name, value] of candidates) {
    if (value === undefined || value.length === 0) continue;

    const matched = snapshotValues.get(value);
    if (matched !== undefined) {
      throw new Error(
        `${name} is set to the same value as ${matched}. That is the Vercel-managed store, which is ` +
          `SHARED with an unrelated production project: this process would write into someone else's ` +
          `database. See docs/2.0/SNAPSHOT.md.`,
      );
    }

    if (isManagedStoreUrl(value)) {
      throw new Error(
        `${name} points at ${hostOf(value) ?? "an unknown host"}, which serves the Vercel-managed store. ` +
          `That store is SHARED with an unrelated production project and must never be on a hot path. ` +
          `Use the VPS Redis. See docs/2.0/SNAPSHOT.md.`,
      );
    }
  }
}
