/**
 * A6, A10 and A11 - the cadence, the command count and the key namespace.
 *
 * ALL THREE ARE ASSERTED BY COUNTING WHAT THE SINK SENT, never by reading the
 * sink. docs/2.0/SNAPSHOT.md section 5: "counting commands is the only honest
 * way to assert 'exactly three'". {@link SpyManagedStore} is what the count is
 * taken from, and it is injected through `createRedisSink`'s `connect` factory,
 * which exists for exactly this reason.
 */

import { SNAPSHOT_KEY_PREFIX, snapshotKeyForHeight, SNAPSHOT_KEYS } from "@zcashreveal/types";
import { describe, expect, it } from "vitest";

import { COMMANDS_PER_TIP, WIRE_COMMANDS_PER_TIP } from "../budget.js";
import { SnapshotPublisher, type Tip } from "../publisher.js";
import {
  assertOwnedNamespace,
  createRedisSink,
  snapshotWriteKeys,
  SNAPSHOT_TTL_SECONDS,
} from "../sinks/redis.js";
import type { Sink } from "../sinks/sink.js";
import { fixtureBuild, fixtureTip, hashFor, RecordingLog, SpyManagedStore } from "./harness.js";

/** A sink that only counts, for the cadence assertion. */
function countingSink(counter: { writes: number }): Sink {
  return {
    name: "counter",
    managedStoreCommandsPerWrite: 0,
    async write(): Promise<void> {
      counter.writes += 1;
    },
    async close(): Promise<void> {},
  };
}

function harness(store: SpyManagedStore): { publisher: SnapshotPublisher; log: RecordingLog; sink: Sink } {
  const log = new RecordingLog();
  const sink = createRedisSink({ connect: () => store });
  const publisher = new SnapshotPublisher({ sinks: [sink], log, build: fixtureBuild });
  return { publisher, log, sink };
}

describe("A6 - exactly one write per NEW tip", () => {
  it("A6 PASS STATE: a stream of 5 heights containing one duplicate produces 5 writes, not 6", async () => {
    const counter = { writes: 0 };
    const log = new RecordingLog();
    const publisher = new SnapshotPublisher({
      sinks: [countingSink(counter)],
      log,
      build: fixtureBuild,
    });

    const stream: Tip[] = [
      fixtureTip(3_500_000),
      fixtureTip(3_500_001),
      fixtureTip(3_500_001), // the duplicate: same height AND same hash
      fixtureTip(3_500_002),
      fixtureTip(3_500_003),
      fixtureTip(3_500_004),
    ];
    for (const tip of stream) await publisher.onTip(tip);

    expect(stream).toHaveLength(6);
    expect(new Set(stream.map((t) => t.height)).size).toBe(5);
    expect(counter.writes).toBe(5);
    expect(publisher.publishCount).toBe(5);
  });

  it("A6 FAIL STATE: the duplicate is refused by NAME, so the outcome says which rule fired", async () => {
    const counter = { writes: 0 };
    const publisher = new SnapshotPublisher({
      sinks: [countingSink(counter)],
      log: new RecordingLog(),
      build: fixtureBuild,
    });
    await publisher.onTip(fixtureTip(3_500_000));
    const second = await publisher.onTip(fixtureTip(3_500_000));

    expect(second.published).toBe(false);
    expect(second.reason).toBe("duplicate");
    expect(counter.writes).toBe(1);
  });

  /**
   * THE HALF "DE-DUPLICATE BY HEIGHT" WOULD GET WRONG. `hash` is on the document
   * so a reader knows which block, "unambiguously, across a reorg"
   * (SNAPSHOT.md section 8.1). A reorg replaces the block at the tip height, and
   * deduplicating on height alone would suppress that publish and leave the store
   * naming a block that is no longer canonical.
   */
  it("a reorg at the same height IS published - the hash is part of the identity", async () => {
    const counter = { writes: 0 };
    const publisher = new SnapshotPublisher({
      sinks: [countingSink(counter)],
      log: new RecordingLog(),
      build: fixtureBuild,
    });
    const original = fixtureTip(3_500_000);
    await publisher.onTip(original);
    const reorged = { ...original, hash: hashFor(999_999) };
    const outcome = await publisher.onTip(reorged);

    expect(outcome.published).toBe(true);
    expect(counter.writes).toBe(2);
  });
});

describe("A10 - one tip produces exactly three managed-store commands", () => {
  it("A10 PASS STATE: 4 new tips produce 3 x 4 = 12 commands, counted on the client", async () => {
    const store = new SpyManagedStore();
    const { publisher } = harness(store);
    const tips = [3_600_000, 3_600_001, 3_600_002, 3_600_003];
    for (const h of tips) await publisher.onTip(fixtureTip(h));

    expect(store.calls.length).toBe(3 * tips.length);
    expect(store.transactions).toBe(tips.length);
    expect(store.execs).toBe(tips.length);

    // THREE WRITES, FIVE COMMANDS ON THE WIRE, AND BOTH ARE PINNED because only
    // the first is certain to be the number the meter charges. `MULTI` and
    // `EXEC` cross the wire like any other command; whether Upstash bills them
    // is a fact about their meter that no session can read (egress to
    // upstash.com is refused by the container's proxy), so `budget.ts` charges
    // three and states the uncertainty rather than guessing at five. The
    // difference is a month of publishing: about 103,500 commands against the
    // 150,000 default ceiling, or about 172,500 against it.
    const onTheWire = store.transactions + store.calls.length + store.execs;
    expect(onTheWire).toBe(WIRE_COMMANDS_PER_TIP * tips.length);
    expect(COMMANDS_PER_TIP).toBe(3);
    expect(WIRE_COMMANDS_PER_TIP).toBe(5);
  });

  it("A10 PASS STATE: a duplicate tip spends nothing at all", async () => {
    const store = new SpyManagedStore();
    const { publisher } = harness(store);
    await publisher.onTip(fixtureTip(3_600_000));
    await publisher.onTip(fixtureTip(3_600_000));

    expect(store.calls.length).toBe(3);
    expect(store.transactions).toBe(1);
  });

  it("A10 PASS STATE: the three are one SET with no TTL, one with EX 86400, and the height", async () => {
    const store = new SpyManagedStore();
    const { publisher } = harness(store);
    await publisher.onTip(fixtureTip(3_600_000));

    expect(store.calls[0]?.key).toBe(SNAPSHOT_KEYS.latest);
    expect(store.calls[0]?.mode).toBeUndefined();
    expect(store.calls[1]?.key).toBe(snapshotKeyForHeight(3_600_000));
    expect(store.calls[1]?.mode).toBe("EX");
    expect(store.calls[1]?.seconds).toBe(SNAPSHOT_TTL_SECONDS);
    expect(store.calls[1]?.seconds).toBeGreaterThan(0);
    expect(store.calls[1]?.seconds).toBeLessThanOrEqual(86_400);
    expect(store.calls[2]?.key).toBe(SNAPSHOT_KEYS.height);
    expect(store.calls[2]?.value).toBe("3600000");
  });
});

describe("A11 - every key the publisher writes begins zecreveal:", () => {
  it("A11 PASS STATE: every key argument the spy saw carries the prefix", async () => {
    const store = new SpyManagedStore();
    const { publisher } = harness(store);
    for (const h of [3_700_000, 3_700_001, 3_700_002]) await publisher.onTip(fixtureTip(h));

    const keys = store.keyArguments();
    expect(keys.length).toBe(9);
    const foreign = keys.filter((k) => !k.startsWith(SNAPSHOT_KEY_PREFIX));
    expect(foreign, `keys outside the namespace: ${JSON.stringify(foreign)}`).toEqual([]);
  });

  it("A11 PASS STATE: the failure path writes no key outside the namespace and adds no fourth", async () => {
    const store = new SpyManagedStore();
    store.failWith = new Error("ECONNREFUSED 127.0.0.1:6399");
    const { publisher, log } = harness(store);
    await publisher.onTip(fixtureTip(3_700_010));

    const foreign = store.keyArguments().filter((k) => !k.startsWith(SNAPSHOT_KEY_PREFIX));
    expect(foreign, `keys outside the namespace: ${JSON.stringify(foreign)}`).toEqual([]);
    expect(store.calls.length).toBe(3);
    // The failure was reported as {sink, err} and the process is still running.
    expect(log.lines.some((l) => l.level === "error" && l.obj["sink"] === "redis")).toBe(true);
  });

  it("A11 PASS STATE: the shutdown path writes nothing at all", async () => {
    const store = new SpyManagedStore();
    const { publisher, sink } = harness(store);
    await publisher.onTip(fixtureTip(3_700_020));
    const before = store.calls.length;
    await sink.close();

    expect(store.calls.length).toBe(before);
    expect(store.quits).toBe(1);
    const foreign = store.keyArguments().filter((k) => !k.startsWith(SNAPSHOT_KEY_PREFIX));
    expect(foreign, `keys outside the namespace: ${JSON.stringify(foreign)}`).toEqual([]);
  });

  it("A11 PASS STATE: the one key builder produces all three and only owned keys", () => {
    const keys = snapshotWriteKeys(3_700_030);
    expect(keys).toHaveLength(3);
    for (const k of keys) expect(k.startsWith(SNAPSHOT_KEY_PREFIX)).toBe(true);
  });

  it("A11 FAIL STATE: a key outside the namespace is refused BY THE GUARD before it is sent", async () => {
    // THE PROBE THAT USED TO STAND HERE DID NOT REACH THE GUARD. It called
    // `sink.write({ height: -1 })` and asserted `/not a block height/` - which
    // is `snapshotKeyForHeight` refusing an impossible height, one function
    // earlier. `assertOwnedNamespace` never ran, and its own comment said so:
    // "reaching the guard needs a height whose key builder cannot be trusted".
    // A guard nothing can trip and a guard that does nothing produce the same
    // green test, so `keysFor` makes the untrusted builder injectable and this
    // probe hands over exactly that.
    const store = new SpyManagedStore();
    const sink = createRedisSink({
      connect: () => store,
      // The second key is the other tenant's namespace, one letter away from
      // ours - `zcashreveal:` is the VPS prefix - which is the transposition
      // rule 1 exists for.
      keysFor: (h) => [SNAPSHOT_KEYS.latest, `zcashreveal:snapshot:${h}`, SNAPSHOT_KEYS.height],
    });
    await expect(sink.write({ height: 3_700_040 } as never, "{}")).rejects.toThrow(
      /outside the zecreveal: namespace/,
    );
    // NOTHING WAS COMMITTED, AND THE FOREIGN KEY WAS NEVER EVEN QUEUED. The
    // guard runs while the MULTI is being built: the first owned key is queued,
    // the second throws, and `exec` is never reached - so the store sees one
    // queued `set` and no transaction. That ordering is the reason the guard
    // sits on the argument rather than after the chain.
    expect(store.keyArguments().filter((k) => !k.startsWith(SNAPSHOT_KEY_PREFIX))).toEqual([]);
    expect(store.calls.length).toBe(1);
    expect(store.execs).toBe(0);

    // AND THE GUARD ITSELF, IN BOTH POLARITIES, so the wiring above is not the
    // only evidence that it discriminates.
    expect(assertOwnedNamespace(SNAPSHOT_KEYS.latest)).toBe(SNAPSHOT_KEYS.latest);
    expect(() => assertOwnedNamespace("zcashreveal:snapshot:latest")).toThrow(RangeError);
    expect(() => assertOwnedNamespace("snapshot:latest")).toThrow(RangeError);
    expect(() => assertOwnedNamespace("")).toThrow(RangeError);
  });

  it("A11: an impossible height is still refused one function earlier, by the key builder", async () => {
    // The half the old probe actually exercised, kept as its own case rather
    // than deleted: a key is never assembled by hand, so a height that cannot
    // be a block height fails before a key exists to guard.
    const store = new SpyManagedStore();
    const sink = createRedisSink({ connect: () => store });
    await expect(sink.write({ height: -1 } as never, "{}")).rejects.toThrow(/not a block height/);
    expect(store.calls).toEqual([]);
  });
});
