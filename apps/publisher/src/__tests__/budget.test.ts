/**
 * A12 - the publisher refuses to start over budget.
 *
 * ASSERTED IN TWO PLACES BECAUSE THE ASSERTION HAS TWO HALVES. "Exits non-zero
 * with a message naming the ceiling" is a property of a PROCESS, so it is proved
 * by spawning `src/index.ts` and reading the exit code; "writes nothing to the
 * managed store" and "the file sink is unaffected" are properties of what was
 * SENT, so they are proved in-process against a counting spy. A suite that did
 * only the second would be asserting about a function called `budgetGate` rather
 * than about a publisher.
 *
 * "THE FILE SINK IS UNAFFECTED" IS READ LITERALLY, and the reading is stated so a
 * later reader does not have to reconstruct it. SNAPSHOT.md section 8.7 says the
 * publisher "exits non-zero" AND that "the file sink is unaffected", and a
 * process cannot both exit and keep publishing. What the refusal does is write
 * nothing, remove nothing and rewrite nothing - so the `snapshot.json` the
 * previous run left is still there, byte for byte, for the gateway to serve.
 * That is what the process test checks. The other half of the sentence - a
 * RUNNING publisher that reaches the ceiling keeps the file sink and drops the
 * managed-store sink - is `publisher.ts`'s mid-run rule and is checked below too.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  addCommands,
  budgetGate,
  emptyBudget,
  FileCommandBudget,
  isOverCeiling,
  monthKeyOf,
  parseBudgetState,
  rollToMonth,
  serializeBudgetState,
} from "../budget.js";
import { SnapshotPublisher } from "../publisher.js";
import { createFileSink } from "../sinks/file.js";
import { createRedisSink } from "../sinks/redis.js";
import { fixtureBuild, fixtureTip, RecordingLog, SpyManagedStore } from "./harness.js";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTRY = join(APP_ROOT, "src", "index.ts");
const CEILING = 150_000;
/**
 * Two closed local ports. NEITHER is the managed store - tests never point at
 * that (SNAPSHOT.md rule 5) - and they are two DIFFERENT ports rather than one
 * because `assertNotManagedStore` refuses a `REDIS_URL` whose value equals any
 * `SNAPSHOT_REDIS_*` value, by exact match. That guard fired on the first
 * version of this file, which used one URL for both, and it was right to: an
 * operator who had pasted the managed URL into `REDIS_URL` would look exactly
 * like that.
 */
const CLOSED_MANAGED_URL = "redis://127.0.0.1:6399";
const CLOSED_VPS_URL = "redis://127.0.0.1:6398";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "zecreveal-budget-"));
}

/** Write a counter file recording `commands` for the month a clock is in. */
function writeCounter(path: string, commands: number, atMs: number): void {
  writeFileSync(
    path,
    serializeBudgetState({ month: monthKeyOf(atMs), commands }),
    "utf8",
  );
}

interface ProcessOutcome {
  readonly code: number | null;
  readonly killed: boolean;
  readonly output: string;
}

/**
 * Run the real entry point, and stop waiting after `waitMs`.
 *
 * `--import tsx` runs the TypeScript source, which is the same module `tsc -b`
 * emits to `dist/index.js` and the same one the container's `node dist/index.js`
 * executes.
 */
function runEntry(env: NodeJS.ProcessEnv, waitMs: number): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY], {
      cwd: APP_ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (b: Buffer) => (output += b.toString()));
    child.stderr.on("data", (b: Buffer) => (output += b.toString()));

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ code: null, killed: true, output });
    }, waitMs);

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, killed: false, output });
    });
  });
}

describe("A12 - the publisher refuses to start over budget", () => {
  it("A12 PASS STATE: the gate refuses at the ceiling and its message names the ceiling", () => {
    const gate = budgetGate({ month: "2026-08", commands: CEILING }, CEILING);
    expect(gate.ok).toBe(false);
    expect(gate.exitCode).toBe(1);
    expect(gate.message).toContain(String(CEILING));
    expect(gate.message).toContain("SNAPSHOT_REDIS_MONTHLY_BUDGET");
  });

  it("A12 PASS STATE: the real process exits non-zero, names the ceiling, and leaves the file alone", async () => {
    const dir = scratch();
    const counter = join(dir, "budget.json");
    const snapshotFile = join(dir, "snapshot.json");
    const previous = '{"schema":1,"height":1,"left":"by the previous run"}';
    writeFileSync(snapshotFile, previous, "utf8");
    writeCounter(counter, CEILING, Date.now());

    const outcome = await runEntry(
      {
        SNAPSHOT_BUDGET_FILE: counter,
        SNAPSHOT_FILE: snapshotFile,
        SNAPSHOT_REDIS_MONTHLY_BUDGET: String(CEILING),
        SNAPSHOT_REDIS_KV_URL: CLOSED_MANAGED_URL,
        REDIS_URL: CLOSED_VPS_URL,
        PUBLISHER_LOG_LEVEL: "info",
      },
      20_000,
    );

    expect(outcome.killed, `process did not exit; output was: ${outcome.output}`).toBe(false);
    expect(outcome.code).toBe(1);
    expect(outcome.code).not.toBe(0);
    expect(outcome.output).toContain(String(CEILING));
    expect(outcome.output).toContain("refusing to start");
    // It never got as far as constructing a sink.
    expect(outcome.output).not.toContain("publisher started");
    expect(outcome.output).not.toContain("snapshot published");
    // The file sink is unaffected: byte for byte what the previous run left.
    expect(readFileSync(snapshotFile, "utf8")).toBe(previous);
  }, 30_000);

  it("A12 FAIL STATE: one command under the ceiling, the same process starts", async () => {
    const dir = scratch();
    const counter = join(dir, "budget.json");
    writeCounter(counter, CEILING - 1, Date.now());

    const outcome = await runEntry(
      {
        SNAPSHOT_BUDGET_FILE: counter,
        SNAPSHOT_FILE: join(dir, "snapshot.json"),
        SNAPSHOT_REDIS_MONTHLY_BUDGET: String(CEILING),
        SNAPSHOT_REDIS_KV_URL: CLOSED_MANAGED_URL,
        REDIS_URL: CLOSED_VPS_URL,
        PUBLISHER_LOG_LEVEL: "info",
      },
      6_000,
    );

    // Still running when the timer fired, and it announced its budget rather
    // than refusing it. It does not reach "publisher started" here because the
    // tip subscriber is pointed at a closed port on purpose - what is asserted
    // is that the GATE let it through, which is A12's fail side.
    expect(outcome.killed, `process exited early; output was: ${outcome.output}`).toBe(true);
    expect(outcome.code).toBeNull();
    expect(outcome.output).toContain(`${CEILING - 1} of ${CEILING}`);
    expect(outcome.output).not.toContain("refusing to start");
  }, 30_000);

  it("A12 PASS STATE: at the ceiling a RUNNING publisher spends nothing and still writes the file", async () => {
    const dir = scratch();
    const snapshotFile = join(dir, "snapshot.json");
    const counter = join(dir, "budget.json");
    const clock = Date.UTC(2026, 7, 30, 12, 0, 0);
    writeCounter(counter, CEILING, clock);

    const budget = new FileCommandBudget({ path: counter, ceiling: CEILING, now: () => clock });
    budget.load();

    const store = new SpyManagedStore();
    const log = new RecordingLog();
    const publisher = new SnapshotPublisher({
      sinks: [createFileSink({ path: snapshotFile }), createRedisSink({ connect: () => store })],
      log,
      budget,
      build: fixtureBuild,
    });
    await publisher.onTip(fixtureTip(3_800_000));

    expect(store.calls).toEqual([]);
    expect(store.transactions).toBe(0);
    expect(JSON.parse(readFileSync(snapshotFile, "utf8"))).toMatchObject({ height: 3_800_000 });
    expect(log.lines.some((l) => l.msg.includes("ceiling reached"))).toBe(true);
  });

  it("A12 FAIL STATE: one under the ceiling, the same running publisher spends its three", async () => {
    const dir = scratch();
    const counter = join(dir, "budget.json");
    const clock = Date.UTC(2026, 7, 30, 12, 0, 0);
    writeCounter(counter, CEILING - 1, clock);

    const budget = new FileCommandBudget({ path: counter, ceiling: CEILING, now: () => clock });
    budget.load();

    const store = new SpyManagedStore();
    const publisher = new SnapshotPublisher({
      sinks: [createFileSink({ path: join(dir, "snapshot.json") }), createRedisSink({ connect: () => store })],
      log: new RecordingLog(),
      budget,
      build: fixtureBuild,
    });
    await publisher.onTip(fixtureTip(3_800_001));

    expect(store.calls.length).toBe(3);
    expect(budget.state.commands).toBe(CEILING + 2);
  });
});

describe("the counter itself", () => {
  it("the month key is UTC and comes from the supplied time, not from a clock", () => {
    expect(monthKeyOf(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe("2026-01");
    expect(monthKeyOf(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe("2026-12");
    expect(() => monthKeyOf(Number.NaN)).toThrow(/not a timestamp/);
  });

  it("a new month resets rather than carrying forward", () => {
    const august = { month: "2026-08", commands: 149_999 };
    expect(rollToMonth(august, "2026-08")).toBe(august);
    expect(rollToMonth(august, "2026-09")).toEqual({ month: "2026-09", commands: 0 });
  });

  it("the ceiling bites AT the ceiling, not one publish past it", () => {
    expect(isOverCeiling({ month: "2026-08", commands: 149_999 }, 150_000)).toBe(false);
    expect(isOverCeiling({ month: "2026-08", commands: 150_000 }, 150_000)).toBe(true);
  });

  it("a negative charge is refused - it would hand back budget the store already spent", () => {
    expect(() => addCommands(emptyBudget("2026-08"), -3)).toThrow(/non-negative/);
  });

  it("an unreadable counter file is a zero count for the month, not a refusal to start", () => {
    const path = join(scratch(), "budget.json");
    writeFileSync(path, "{ not json", "utf8");
    expect(parseBudgetState("{ not json")).toBeNull();

    const clock = Date.UTC(2026, 7, 30, 12, 0, 0);
    const budget = new FileCommandBudget({ path, ceiling: CEILING, now: () => clock });
    expect(budget.load()).toEqual({ month: "2026-08", commands: 0 });
    expect(budget.gate().ok).toBe(true);
  });

  it("a charge survives a restart, which is what makes the ceiling non-vacuous", () => {
    const path = join(scratch(), "budget.json");
    const clock = Date.UTC(2026, 7, 30, 12, 0, 0);
    const first = new FileCommandBudget({ path, ceiling: CEILING, now: () => clock });
    first.load();
    first.charge(3, clock);
    first.charge(3, clock);

    const restarted = new FileCommandBudget({ path, ceiling: CEILING, now: () => clock });
    expect(restarted.load()).toEqual({ month: "2026-08", commands: 6 });
  });

  it("a charge is keyed to the BLOCK's month, so a block from the next month rolls the counter", () => {
    const path = join(scratch(), "budget.json");
    const august = Date.UTC(2026, 7, 31, 23, 59, 0);
    const september = Date.UTC(2026, 8, 1, 0, 1, 0);
    const budget = new FileCommandBudget({ path, ceiling: CEILING, now: () => august });
    budget.load();
    budget.charge(3, august);
    expect(budget.state).toEqual({ month: "2026-08", commands: 3 });
    budget.charge(3, september);
    expect(budget.state).toEqual({ month: "2026-09", commands: 3 });
  });
});
