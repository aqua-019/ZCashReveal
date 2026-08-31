/**
 * The refusal `truncateAll` makes when this run owns no schema.
 *
 * WHY THIS FILE EXISTS. HANDOFF-09b's gate round 2 turned the test isolation
 * from a PATH - a `globalSetup` line in each vitest config - into a PROPERTY, by
 * making `truncateAll` refuse when `ZR_TEST_SCHEMA` is unset. Round 3 pointed
 * out that the guard shipped with no test in either polarity, in a repository
 * whose §5 rule is that every assertion carries a two-polarity transcript, and
 * whose failure mode here is wiping a developer's database. So: the transcript,
 * as a test.
 *
 * IT NEVER TRUNCATES ANYTHING OUTSIDE THIS RUN'S OWN SCHEMA, and gate round 4
 * found that the first draft of this file did. Every case below expects a
 * rejection, runs against this suite's own schema (where a TRUNCATE is what
 * every other file in this directory does in `beforeEach`), or drives a
 * recording stub. The one that has to delete `ZR_TEST_SCHEMA` to test the
 * escape hatch takes the stub, because deleting `ZR_TEST_SCHEMA` is precisely
 * the state in which the live connection points at `public`.
 */

import type { Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("truncateAll's schema guard", () => {
  const sql = getSql();
  afterAll(() => sql.end({ timeout: 5 }));

  /** Run `body` with `ZR_TEST_SCHEMA` and the hatch set to the given values. */
  async function withEnv(
    schema: string | undefined,
    hatch: string | undefined,
    body: () => Promise<void>,
  ): Promise<void> {
    const prevSchema = process.env["ZR_TEST_SCHEMA"];
    const prevHatch = process.env["ZR_ALLOW_PUBLIC_TRUNCATE"];
    if (schema === undefined) delete process.env["ZR_TEST_SCHEMA"];
    else process.env["ZR_TEST_SCHEMA"] = schema;
    if (hatch === undefined) delete process.env["ZR_ALLOW_PUBLIC_TRUNCATE"];
    else process.env["ZR_ALLOW_PUBLIC_TRUNCATE"] = hatch;
    try {
      await body();
    } finally {
      if (prevSchema === undefined) delete process.env["ZR_TEST_SCHEMA"];
      else process.env["ZR_TEST_SCHEMA"] = prevSchema;
      if (prevHatch === undefined) delete process.env["ZR_ALLOW_PUBLIC_TRUNCATE"];
      else process.env["ZR_ALLOW_PUBLIC_TRUNCATE"] = prevHatch;
    }
  }

  it("REFUSES when this run owns no schema, which is the door a lost globalSetup line opens", async () => {
    await withEnv(undefined, undefined, async () => {
      await expect(truncateAll(sql)).rejects.toThrow(/ZR_TEST_SCHEMA is unset/);
    });
  });

  it("REFUSES on an empty ZR_TEST_SCHEMA, not only an absent one", async () => {
    // `search_path` set to the empty string is `public` as surely as unset is,
    // and a `?? ""` upstream is how it would arrive.
    await withEnv("", undefined, async () => {
      await expect(truncateAll(sql)).rejects.toThrow(/ZR_TEST_SCHEMA is unset/);
    });
  });

  it("ALLOWS when this run owns a schema - the pass side, and it must really truncate", async () => {
    // The other polarity. A guard that refused everything would pass the two
    // assertions above and make the whole suite unrunnable, which is the failure
    // mode the escape hatch exists to avoid.
    const schema = process.env["ZR_TEST_SCHEMA"];
    if (schema === undefined || schema === "") {
      throw new Error("this suite must run under the schema-per-run globalSetup");
    }
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height)
      VALUES ('ironwood', 'guard-probe', 'aa', 1)
    `;
    await truncateAll(sql);
    const rows = await sql<Array<{ n: string }>>`SELECT count(*)::text AS n FROM pool_nullifiers`;
    expect(rows[0]?.n).toBe("0");
  });

  it("ALLOWS with the named escape hatch, so a disposable database is not locked out", async () => {
    // The hatch is why the refusal is a guard rather than a rule nobody can
    // satisfy: CI and a developer with a throwaway database both have a
    // legitimate reason to opt out, and both must say so explicitly.
    //
    // ON A RECORDING STUB, NEVER ON THE LIVE CONNECTION, and that is the whole
    // point (gate round 4). This case DELETES `ZR_TEST_SCHEMA` and sets the
    // hatch, so it IS the state the guard exists for; `getSql()` fixes
    // `search_path` at CREATION time, so on a run whose `globalSetup` line is
    // missing - the door `_setup.ts` names in as many words - `sql` resolves to
    // `public` and a real `truncateAll` here wipes the developer's six chain
    // tables. The case above throws in that state, and a thrown test does not
    // stop the file. Reproduced against a throwaway database by the round-4
    // reviewer: one `blocks` row in, zero out, from the file whose header says
    // it never truncates anything.
    //
    // The stub is not a weaker test. What the hatch has to be shown to do is
    // let the TRUNCATE THROUGH, and a statement recorded is that, exactly - the
    // pass side above already proves the same statement empties real tables.
    const statements: string[] = [];
    const stub = {
      unsafe: (q: string) => {
        statements.push(q);
        return Promise.resolve([]);
      },
    };
    await withEnv(undefined, "1", async () => {
      await expect(truncateAll(stub as unknown as Sql)).resolves.toBeUndefined();
    });
    expect(statements, "the hatch must let exactly one statement through").toHaveLength(1);
    // ALL SIX TABLES BY NAME (gate round 5). `_setup.ts`'s docblock says "SIX
    // TABLES, NOT FOUR"; a pattern naming one of them is green for a
    // `truncateAll` that lost the other five. Measured: dropping
    // `pool_snapshots` from the statement left THIS file at 4 passed while the
    // rest of the tree went red - so the file that exists to be this guard's
    // transcript said nothing about it.
    expect(statements[0]).toBe(
      "TRUNCATE pool_commitments, pool_anchors, pool_nullifiers, pool_boundary_flows, " +
        "pool_snapshots, blocks RESTART IDENTITY",
    );
  });
});
