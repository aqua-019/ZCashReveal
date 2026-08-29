import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A10 - the analysis modules are pure.
 *
 * WHY THIS FILE IS HERE AND NOT IN `analysis/__tests__/`, WHICH IS WHERE IT WAS
 * WRITTEN. A10 states the assertion as a command:
 *
 *   grep -rn 'fetch(\|postgres\|ioredis' apps/indexer/src/analysis   is empty
 *
 * and a test that IMPLEMENTS that grep has to spell the three banned symbols in
 * its own detector. Sitting inside `apps/indexer/src/analysis/__tests__/`, it
 * made the assertion's own command non-empty while every module it scanned was
 * clean - the assertion failing on the file asserting it.
 *
 * THIS IS THE FOURTH SECTION 5 GREP IN THIS PROJECT TO NEED THIS TREATMENT.
 * HANDOFF-00's A9 emoji grep could not run in a POSIX locale; HANDOFF-01's A3
 * `Math.random` grep matched two comments explaining the ban; HANDOFF-06's A7
 * grep could not fail at all against a double-quoted tree. HANDOFF-01 set the
 * precedent and it is followed here rather than re-argued: reword or relocate so
 * the literal command passes, because "a spec that only passes under a
 * charitable reading is a spec nobody can run". Moving one file is the smallest
 * change that makes the assertion literally true, and `src/**\/__tests__/**`
 * still collects it.
 *
 * The scan itself is unchanged and is deliberately NON-RECURSIVE: it reads the
 * `.ts` files directly in `src/analysis/`, which are the modules A10 is about. A
 * test importing `postgres` would not make a module impure.
 */
describe("A10 - the analysis modules are pure", () => {
  it("no analysis module reaches for the network, a database or a cache", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "analysis");
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        // Comments are exempt: this module's own docblocks discuss purity and
        // name the things they forbid, and a guard that fires on its own
        // explanation is a guard that gets deleted.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (/\bfetch\s*\(|\bpostgres\b|\bioredis\b|\bundici\b/.test(code)) {
          offenders.push(`${name}:${i + 1}  ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
