/**
 * The three HANDOFF-09 audit records, taken through the seam that publishes them.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS NOT A DUPLICATE OF THE THREE MODULE SUITES.
 * Each instrument's own suite asserts that its `FilterApplication` carries the
 * right fields. None of them asserts that the record SURVIVES THE JOURNEY to a
 * rendered inference chain, and that journey has a narrow gate in it:
 * `auditRecordToEstimateFilter` flattens every `params` value through
 * `flattenParam` and the result is parsed by `estimateFilterSchema`, a CLOSED
 * shape that accepts `string | number | boolean` and nothing else.
 *
 * `packages/zec-types/src/views.ts` records a 500 that came out of exactly this
 * gate: a `params` value that was neither scalar nor array reached the gateway,
 * `estimateFilterSchema.parse` threw, and the route answered 500 for a
 * transaction whose analysis was fine. The compiler does not catch it - the
 * union widens happily and the flattening is `unknown`-in - and no module test
 * catches it either, because a module test never calls the flattener. It is a
 * seam defect, so it needs a seam test.
 *
 * THREE VARIANTS AND A NEGATIVE. The negative is the point of the fourth case:
 * `turnstileResidual` emits NO record at all, deliberately, because U_h and V_h
 * narrow nothing. A test suite that only ever asserts records exist would pass
 * just as happily if the residual had grown one by accident, and a filter record
 * for a filter that did not happen is a false step in an inference chain a reader
 * is invited to check.
 *
 * The `filter` name is asserted on the PARSED output rather than on the input,
 * so this also pins that each name reached `filterNameSchema`'s closed enum -
 * which is the half `tsc` proves at the boundary and nothing proves at runtime.
 */

import { describe, expect, it } from "vitest";
import {
  auditRecordToEstimateFilter,
  estimateFilterSchema,
  asHex,
  type FilterApplication,
} from "@zcashreveal/types";

import {
  ironwoodBirth,
  migrationLens,
  orchardDrain,
  turnstileResidual,
} from "@zcashreveal/instruments";

const ZATOSHI_PER_ZEC = 100_000_000n;
function zec(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > 8) throw new Error(`more than 8 decimal places: ${amount}`);
  return BigInt(whole!) * ZATOSHI_PER_ZEC + BigInt(frac.padEnd(8, "0"));
}
const hx = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/** Parse, and return the parsed record so a caller can assert on it. */
function throughTheGate(audit: FilterApplication, label: string) {
  const flattened = auditRecordToEstimateFilter(audit, label);
  const parsed = estimateFilterSchema.safeParse(flattened);
  expect(
    parsed.success,
    parsed.success ? "" : `estimateFilterSchema rejected ${audit.filter}: ${JSON.stringify(parsed.error?.issues)}`,
  ).toBe(true);
  return parsed.success ? parsed.data : null;
}

describe("HANDOFF-09's audit records survive the gateway's flatten-and-parse gate", () => {
  it("migration_lens", () => {
    const lens = migrationLens(
      [
        { txid: hx(1), height: 5, amountZat: zec("500") },
        { txid: hx(2), height: 6, amountZat: zec("499.5") },
      ],
      { lowHeight: 0, highHeight: 10 },
    );
    const parsed = throughTheGate(lens.audit, "migration lens");
    expect(parsed?.filter).toBe("migration_lens");
    // Every params key survives the flatten as a scalar, none stringified to
    // "[object Object]" - which is what `flattenParam`'s fallback produces and is
    // the shape the recorded 500 wore before it reached the parse.
    for (const [k, v] of Object.entries(parsed?.params ?? {})) {
      expect(typeof v, `${k} flattened to ${typeof v}`).toMatch(/string|number|boolean/);
      expect(String(v), `${k} flattened to an object`).not.toContain("[object");
    }
  });

  it("turnstile_window, on every record the drain emits", () => {
    const drain = orchardDrain(
      [
        { height: 100, timeMs: 0, balanceZat: zec("3660000") },
        { height: 200, timeMs: 24 * 3_600_000, balanceZat: zec("708841") },
      ],
      { baselineHeight: 100, baselineZat: zec("3660000"), atHeight: 200 },
    );
    expect(drain.audits.length, "the drain emitted no record, so this proved nothing").toBeGreaterThan(0);
    for (const audit of drain.audits) {
      const parsed = throughTheGate(audit, "turnstile window");
      expect(parsed?.filter).toBe("turnstile_window");
      for (const [k, v] of Object.entries(parsed?.params ?? {})) {
        expect(typeof v, `${k} flattened to ${typeof v}`).toMatch(/string|number|boolean/);
        expect(String(v), `${k} flattened to an object`).not.toContain("[object");
      }
    }
  });

  it("ironwood_birth", () => {
    const birth = ironwoodBirth(
      [
        { txid: hx(3), height: 3_428_200, pool: "ironwood", candidateCount: 5n },
        { txid: hx(4), height: 3_428_300, pool: "ironwood", candidateCount: 5000n },
      ],
      { birthHeight: 3_428_143, lowHeight: 3_428_143, highHeight: 3_500_000 },
    );
    const parsed = throughTheGate(birth.audit, "Ironwood birth");
    expect(parsed?.filter).toBe("ironwood_birth");
    for (const [k, v] of Object.entries(parsed?.params ?? {})) {
      expect(typeof v, `${k} flattened to ${typeof v}`).toMatch(/string|number|boolean/);
      expect(String(v), `${k} flattened to an object`).not.toContain("[object");
    }
  });

  it("THE NEGATIVE: the residual emits no record, because it narrows nothing", () => {
    const r = turnstileResidual(
      { sprout: zec("22621"), orchard: zec("708841") },
      zec("16889987"),
    );
    // A filter record here would be a step in the inference chain that did not
    // happen. U_h and V_h are aggregates at one height with no candidate set.
    expect("audit" in r, "the residual grew an audit record - see the variant docblock").toBe(false);
  });

  it("the gate is not vacuous: a non-scalar params value IS rejected", () => {
    // The fail side. Without this, every assertion above would pass just as
    // happily against a schema that accepted anything, and the file would be
    // evidence of nothing. `{}` is what an un-flattened object looks like.
    const bad = {
      filter: "migration_lens",
      label: "hand-built",
      params: { lowHeight: { nested: true } as unknown as number },
      countIn: 1n,
      countOut: 1n,
    };
    expect(estimateFilterSchema.safeParse(bad).success).toBe(false);
  });
});
