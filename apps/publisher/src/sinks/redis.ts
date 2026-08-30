/**
 * The `redis` sink: the Vercel-managed store, and the only writer this project
 * has against it (docs/2.0/SNAPSHOT.md rule 6).
 *
 * THAT STORE IS SHARED WITH AN UNRELATED PRODUCTION PROJECT. Read SNAPSHOT.md
 * sections 1 and 4 before changing anything here. A mistake against it is not a
 * wrong figure on a page - it is an outage, or a disclosure, for a project that
 * never agreed to run alongside us. Three consequences shape this file:
 *
 *   EXACTLY THREE COMMANDS PER NEW TIP, IN ONE MULTI (section 8.6). The
 *   allowance is 500,000 a month and it is shared. Assertion A10 proves the
 *   three by COUNTING them with a spy on the client - not by reading this code -
 *   which is why {@link createRedisSink} takes a factory instead of building its
 *   own connection. A test cannot count what it cannot see.
 *
 *   EVERY KEY BEGINS `zecreveal:` (rule 1, assertion A11). {@link snapshotWriteKeys}
 *   is the ONE place a key is built, and it builds all three from the constants
 *   and the builder in `packages/zec-types/src/redis-topology.ts`. The prefix is
 *   never retyped here or anywhere: it differs from the VPS prefix by one letter
 *   and a transposition puts a key in the other tenant's keyspace.
 *
 *   NOTHING IS READ, ENUMERATED OR REMOVED. This sink issues writes and nothing
 *   else. There is no read to check what is already there - that would be a
 *   fourth command and A10 would catch it - and no cleanup pass: the per-height
 *   copy carries a TTL so the keyspace bounds itself without this process ever
 *   asking the store what it holds.
 *
 * A FAILURE HERE IS LOGGED AND SURVIVED, never thrown out of the publisher. The
 * `write` below is allowed to reject; `writeToAllSinks` is what catches it, logs
 * `{sink, err}` and lets the file sink's result stand. A7's fail side is exactly
 * that path: this sink pointed at a closed port, the file still written, the
 * process still up.
 */

import {
  SNAPSHOT_KEYS,
  isOwnedSnapshotKey,
  snapshotKeyForHeight,
  type SnapshotV1,
} from "@zcashreveal/types";

import type { Sink } from "./sink.js";

/**
 * The per-height copy's lifetime, in seconds (SNAPSHOT.md section 8.6).
 *
 * `zecreveal:snapshot:latest` carries NO TTL, because a store that expires the
 * latest snapshot produces the empty dashboard this design exists to prevent.
 * The per-height copy carries 86,400 so the keyspace does not grow without
 * bound - which is the only mechanism bounding it, since nothing here ever
 * enumerates or removes a key.
 */
export const SNAPSHOT_TTL_SECONDS = 86_400;

/**
 * The three keys one publish writes, in the order they are written.
 *
 * THE SINGLE PLACE THIS PROJECT BUILDS A MANAGED-STORE KEY, which is what
 * SNAPSHOT.md section 7 says rule 1's enforcement would look like: "one module
 * builds every key, and a test asserts no other module constructs one". Exported
 * so the assertion can check the three without a connection.
 *
 * @throws Error via `snapshotKeyForHeight` if `height` is not a block height.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function snapshotWriteKeys(height: number): readonly [string, string, string] {
  return [SNAPSHOT_KEYS.latest, snapshotKeyForHeight(height), SNAPSHOT_KEYS.height];
}

/**
 * Refuse a key outside the namespace.
 *
 * A RUNTIME CHECK BESIDE A COMPILE-TIME ONE, and it is not redundant with
 * {@link snapshotWriteKeys}: the builder is the place a key is CONSTRUCTED and
 * this is the place one is ISSUED, and the whole risk this file guards is that
 * some later edit issues a key it built somewhere else. It throws rather than
 * skipping, because a partially-written tip that quietly dropped one of its
 * three keys would leave `latest` and `height` disagreeing.
 *
 * @throws RangeError if `key` is outside `zecreveal:`.
 */
function assertOwnedNamespace(key: string): string {
  if (!isOwnedSnapshotKey(key)) {
    throw new RangeError(
      `the publisher refused to write ${JSON.stringify(key)}: it is outside the zecreveal: namespace. ` +
        "The managed store is shared with an unrelated production project and a key outside the " +
        "namespace lands in their keyspace. See docs/2.0/SNAPSHOT.md rule 1.",
    );
  }
  return key;
}

/**
 * A queued transaction, as this sink uses one.
 *
 * DECLARED NARROW RATHER THAN TAKING `ioredis`'s `ChainableCommander`. Two
 * reasons and the second is the load-bearing one. It states what this sink is
 * allowed to do to the shared store - `set`, and nothing else - so a later edit
 * reaching for a read or a removal has to widen this interface first, in a diff
 * a reviewer will see. And it lets a test pass a counting spy without
 * constructing a Redis client, which is what makes A10 and A11 provable by
 * counting rather than by reading.
 */
export interface SnapshotTransaction {
  set(key: string, value: string): SnapshotTransaction;
  set(key: string, value: string, mode: "EX", seconds: number): SnapshotTransaction;
  exec(): Promise<unknown>;
}

/** The managed store, as this sink uses it. */
export interface SnapshotStore {
  /** Open a transaction. Every publish uses exactly one. */
  multi(): SnapshotTransaction;
  /** Close the connection. Writes nothing. */
  quit(): Promise<unknown>;
}

export interface RedisSinkOptions {
  /**
   * How to obtain the store.
   *
   * A FACTORY, CALLED ONCE, LAZILY. Called once because one connection per
   * process is the whole traffic budget's worth; lazily so that constructing the
   * sink in a test costs no socket, and so that a publisher refused by the
   * budget gate can be built without ever dialling the store.
   */
  readonly connect: () => SnapshotStore;
}

/**
 * Build the `redis` sink.
 *
 * The caller decides whether to build one at all: absent both
 * `SNAPSHOT_REDIS_KV_URL` and `SNAPSHOT_REDIS_REDIS_URL`, this sink is not
 * constructed and the publisher runs file-only (SNAPSHOT.md section 8.5).
 */
export function createRedisSink(options: RedisSinkOptions): Sink {
  let store: SnapshotStore | null = null;

  return {
    name: "redis",
    // THREE, AND SECTION 8.6's THREE. This is what the publisher charges to the
    // monthly counter per publish; A10 proves independently, by counting the
    // spy's calls, that the number here is the number issued.
    managedStoreCommandsPerWrite: 3,

    async write(snapshot: SnapshotV1, json: string): Promise<void> {
      store ??= options.connect();
      const [latest, perHeight, height] = snapshotWriteKeys(snapshot.height);

      // ONE MULTI, THREE COMMANDS, IN SNAPSHOT.md SECTION 8.6's OWN ORDER.
      // `latest` first so that a reader polling it never sees a height key
      // ahead of the document it names.
      await store
        .multi()
        .set(assertOwnedNamespace(latest), json)
        .set(assertOwnedNamespace(perHeight), json, "EX", SNAPSHOT_TTL_SECONDS)
        .set(assertOwnedNamespace(height), String(snapshot.height))
        .exec();
    },

    async close(): Promise<void> {
      // NOTHING IS WRITTEN ON THE SHUTDOWN PATH, which A11 asserts by capturing
      // every key the spy saw across a run that includes this call. A "last
      // snapshot" or a liveness marker written here would be a key outside the
      // three, on a store whose whole budget is those three.
      if (store === null) return;
      const open = store;
      store = null;
      await open.quit();
    },
  };
}
