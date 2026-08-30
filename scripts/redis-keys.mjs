/**
 * Enumerate the VPS Redis keyspace, safely, as a tool rather than as a paste.
 *
 * WHY THIS FILE EXISTS (LEDGER-10 Q2). `docs/2.0/RUNBOOK-VPS.md` section 11 used
 * to name exact keys and enumerate nothing, and said so in a note explaining
 * that `scripts/check-redis-safety.mjs` cannot tell which of the two Redis
 * servers a `redis-cli` line will reach - so it treats every enumeration as if
 * it were aimed at the shared managed store. That conservatism is correct and L2
 * ruled that the guard must NOT be taught the distinction: a guard that infers a
 * `redis-cli` line's target is a guard that will be confidently wrong, and the
 * failure it would enable is an outage for another project's production data.
 *
 * The cost was real: the operator had no way to see what is in the VPS Redis.
 * The answer is not to loosen the guard and not to accept the cost. It is to
 * move the safety INSIDE the tool, so it is a property of the code rather than
 * of the operator's paste:
 *
 *   1. The URL comes from `REDIS_URL` in the environment. There is no `--url`
 *      flag and there will not be one. A flag is a paste, and the line pasted at
 *      3am is the one most likely to carry the wrong `-u` - `zcashreveal:` and
 *      `zecreveal:` differ by one letter.
 *   2. `assertNotManagedStore` runs FIRST, before a socket is opened, and this
 *      process exits non-zero if it throws. That is the same function the
 *      indexer and the gateway call at boot (`apps/*//*config.ts`), so the rule
 *      is enforced in one place for all three.
 *   3. The scan is bounded to `VPS_KEY_PREFIX` and the bound is not a string
 *      literal typed here - it is imported from `@zcashreveal/types`.
 *
 * The runbook line then becomes `pnpm redis:keys`, which names no Redis command
 * at all and so gives the text guard nothing to be wrong about.
 *
 * WHAT THIS IS NOT FOR. The Vercel-managed store. There is no code path here
 * that can reach it: step 2 refuses by hostname and by an exact value match
 * against every `SNAPSHOT_REDIS_*` variable in the environment. If you want to
 * know what is in the managed store, read `docs/2.0/SNAPSHOT.md` - the answer is
 * three keys, this project wrote all of them, and enumerating someone else's
 * keyspace to confirm it is rule 7's whole subject.
 *
 * Exit codes: 0 listed, 1 refused or failed.
 */

/**
 * Both imports are DYNAMIC and both failures are explained, because the two
 * things this tool needs are built artefacts of the workspace and the honest
 * failure for a missing one is a sentence, not a `ERR_MODULE_NOT_FOUND` stack.
 * `@zcashreveal/types` resolves through its `dist/`, so a tree that has never
 * been built cannot satisfy it.
 */
async function load(specifier, remedy) {
  try {
    return await import(specifier);
  } catch {
    console.error(`redis:keys: cannot resolve ${specifier}. ${remedy}`);
    process.exit(1);
  }
}

const { assertNotManagedStore, VPS_KEY_PREFIX } = await load(
  "@zcashreveal/types",
  "Run `pnpm install` and `pnpm build` from the repository root - this tool reads the shared two-Redis contract from that package rather than retyping the one letter that separates the two servers.",
);

const url = process.env.REDIS_URL;
if (url === undefined || url === "") {
  console.error("redis:keys: REDIS_URL is not set. This tool reads it from the environment and takes no --url flag; see the header.");
  process.exit(1);
}

// FIRST, before a socket exists. The order is the point: a check that runs after
// the connection is a check that has already done the thing it was preventing.
try {
  assertNotManagedStore([["REDIS_URL", url]], process.env);
} catch (err) {
  console.error(`redis:keys: REFUSED. ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const limit = Number(process.env.REDIS_KEYS_LIMIT ?? 500);

const { default: Redis } = await load("ioredis", "Run `pnpm install` from the repository root.");

const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });

try {
  await client.connect();

  const found = [];
  let cursor = "0";
  let truncated = false;
  do {
    // THE BOUND IS WRITTEN AT THE CALL SITE, not passed in from a variable, and
    // that shape was chosen by running `scripts/check-redis-safety.mjs` against
    // the first draft of this file rather than by taste. The guard reads lines.
    // A `MATCH` argument held in a `pattern` variable is a bound the reader of
    // that line cannot see and the guard cannot check - it could hold anything
    // by the time control reaches here. Inlining it makes the bound part of the
    // statement it bounds. `VPS_KEY_PREFIX` is imported from
    // `@zcashreveal/types`, so the one letter that separates the two servers is
    // not retyped here either. COUNT is a hint; the cursor loop is what keeps
    // this non-blocking on the server.
    const [next, batch] = await client.scan(cursor, "MATCH", `${VPS_KEY_PREFIX}*`, "COUNT", 200);
    cursor = next;
    for (const k of batch) {
      if (found.length >= limit) {
        truncated = true;
        break;
      }
      found.push(k);
    }
  } while (cursor !== "0" && !truncated);

  found.sort();
  for (const key of found) {
    const type = await client.type(key);
    console.log(`${type.padEnd(6)} ${key}`);
  }

  // NO SILENT CAP. A tool that prints 500 of 5,000 keys and says nothing reads
  // as "that is all of them", which is the failure this line exists to prevent.
  console.log(
    truncated
      ? `redis:keys: ${found.length} key(s) shown, TRUNCATED at REDIS_KEYS_LIMIT=${limit}. There are more under ${VPS_KEY_PREFIX}`
      : `redis:keys: ${found.length} key(s) under ${VPS_KEY_PREFIX} (complete).`,
  );
} catch (err) {
  console.error(`redis:keys: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  client.disconnect();
}
