/**
 * The `redis` sink: the Vercel-managed store, and the only writer this project
 * has against it (docs/2.0/SNAPSHOT.md rule 6).
 *
 * THAT STORE IS SHARED WITH AN UNRELATED PRODUCTION PROJECT. Read SNAPSHOT.md
 * sections 1 and 4 before changing anything here. A mistake against it is not a
 * wrong figure on a page - it is an outage, or a disclosure, for a project that
 * never agreed to run alongside us. Three consequences shape this file:
 *
 *   EXACTLY THREE WRITES PER NEW TIP, IN ONE MULTI (section 8.6). The
 *   allowance is 500,000 a month and it is shared. Assertion A10 proves the
 *   three by COUNTING them with a spy on the client - not by reading this code -
 *   which is why {@link createRedisSink} takes a factory instead of building its
 *   own connection. A test cannot count what it cannot see.
 *
 *   THE TRANSACTION ENVELOPE IS TWO MORE ROUND TRIPS AND WHETHER THE METER
 *   BILLS THEM IS EVIDENCE RATHER THAN PROOF - AND FIVE IS WHAT THE COUNTER IS
 *   CHARGED. `MULTI` and `EXEC` are commands the client sends
 *   over RESP like any other, so one tip puts FIVE commands on the wire and
 *   three of them are writes. Which number the managed store's monthly meter
 *   counts is a fact about Upstash's billing, not about this code, and no
 *   session can reach it: egress to `upstash.com` is refused by the container's
 *   proxy, so it cannot be read from a document either. Both numbers are
 *   therefore MEASURED here and pinned by A10 - `store.calls.length` is 3 per
 *   tip and `store.transactions`/`store.execs` are 1 each - and BOTH are carried
 *   into `budget.ts` and SNAPSHOT.md section 8.6 rather than one being dropped.
 *   THE COUNTER IS CHARGED FIVE, the wire count, since 31 Aug 2026: Upstash's
 *   published exemption list names AUTH, HELLO, SELECT, COMMAND, CONFIG, INFO,
 *   PING, RESET and QUIT, and does not name `MULTI` or `EXEC`. That is evidence
 *   rather than proof, and the tie is broken toward the shared allowance because
 *   it is the other project's (LEDGER-09 Q2, fold 2). At 5 a month costs about
 *   172,500 against a 200,000 default ceiling and clears it, and spends a
 *   minority share of the 500,000 the two projects share. Confirming it against
 *   a real bill is still an operator task in `handoffs/README.md`'s click list.
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

import { WIRE_COMMANDS_PER_TIP } from "../budget.js";
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
export function assertOwnedNamespace(key: string): string {
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
  /**
   * Where the three keys come from. Defaults to `snapshotWriteKeys`, which is
   * the only builder production uses.
   *
   * A SEAM THAT EXISTS FOR A FAIL SIDE, AND IT IS DECLARED AS ONE RATHER THAN
   * DRESSED UP. {@link assertOwnedNamespace} is defence in depth: every key it
   * has ever seen came from `snapshotWriteKeys`, which builds the prefix from
   * `redis-topology.ts`'s constants, so the guard cannot throw for any input the
   * sink can be given. A11's fail side was therefore reaching a DIFFERENT throw
   * - `snapshotKeyForHeight`'s "not a block height" - while its comment said the
   * guard needed "a height whose key builder cannot be trusted". A guard nothing
   * can trip is indistinguishable from a guard that does nothing, and CLAUDE.md
   * makes a fail-side probe that does not fail a finding in its own right. So
   * the untrusted builder is injectable, one test hands over a key outside the
   * namespace, and the guard is shown refusing it BEFORE any `set` reaches the
   * store - which is the property A11 actually wants and could not previously
   * demonstrate.
   */
  readonly keysFor?: (height: number) => readonly [string, string, string];
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
    // FIVE - `MULTI` + 3 x `SET` + `EXEC` - and five is what the publisher
    // charges to the monthly counter per publish. It is NOT the write count:
    // three of the five write, and A10 still proves that independently by
    // counting the spy's `set` calls. The envelope is charged because Upstash's
    // published exemption list does not name `MULTI` or `EXEC`, and because the
    // allowance being protected belongs to another project (LEDGER-09 Q2, fold
    // 2). `WIRE_COMMANDS_PER_TIP` in `budget.ts` carries the whole argument and
    // the verbatim quotation.
    managedStoreCommandsPerWrite: WIRE_COMMANDS_PER_TIP,

    async write(snapshot: SnapshotV1, json: string): Promise<void> {
      store ??= options.connect();
      const [latest, perHeight, height] = (options.keysFor ?? snapshotWriteKeys)(snapshot.height);

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
