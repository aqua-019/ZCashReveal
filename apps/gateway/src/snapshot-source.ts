/**
 * The snapshot the gateway serves: read the file sink, parse it, validate it.
 *
 * THE FILE, AND NOT THE MANAGED STORE, AND THAT IS A RULE RATHER THAN A
 * CONVENIENCE. `docs/2.0/SNAPSHOT.md` section 8.5 marks the `file` sink required
 * and says why in its own row - "this is what the gateway serves". The managed
 * store is shared with an unrelated production project, every read of it is a
 * command drawn from an allowance that project is also drawing on, and
 * `config.ts` already refuses to start if any Redis URL this process would dial
 * is that store. So the gateway reads a local file the publisher renamed into
 * place, and the two processes share a volume rather than a database.
 *
 * WRITE-THEN-RENAME IS THE OTHER HALF OF THAT CONTRACT. `apps/publisher`'s file
 * sink writes a temporary file and renames it over the target, which is atomic
 * within a directory, so a reader here sees the whole previous document or the
 * whole new one and never a truncated prefix. This module therefore does not
 * retry a parse failure: a document that does not parse is not a torn read, it
 * is a document that is wrong.
 *
 * NO IN-PROCESS CACHE. The publisher writes once per new tip, roughly every 75
 * seconds, and the route answers with `Cache-Control: max-age=60` - so the
 * caching that matters happens in front of the gateway, on a copy that carries
 * the height it was taken at. A cached copy HERE would serve a stale height
 * under a fresh `max-age`, which is the one failure a reader cannot detect.
 *
 * FOUR WAYS TO HAVE NO SNAPSHOT, KEPT APART. "There is no file yet" is the
 * ordinary state of a stack whose publisher has not reached its first tip;
 * "the file is not JSON" and "the file is not a V1" are the publisher's defect
 * or a version this gateway does not understand; "the file could not be read" is
 * this box's. They are one status to a client and four different things to an
 * operator, so the reason travels with the failure instead of being flattened
 * into it.
 */

import { readFile } from "node:fs/promises";

import { snapshotV1Schema, type SnapshotV1 } from "@zcashreveal/types";

/** Why there is no snapshot to serve. Four states, never flattened into one. */
export type SnapshotUnavailableReason = "absent" | "unreadable" | "malformed" | "invalid";

/** One schema complaint, in the shape `ApiError.issues` already carries. */
export interface SnapshotIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * What a read of the file sink produced.
 *
 * A DISCRIMINATED RESULT RATHER THAN A THROW, because "there is no snapshot yet"
 * is not an exceptional condition - it is the state every fresh deployment is in
 * until the publisher's first tip, and both callers (the route and the WebSocket
 * connect path) have something specific and different to do about it.
 */
export type SnapshotRead =
  | { readonly ok: true; readonly snapshot: SnapshotV1 }
  | {
      readonly ok: false;
      readonly reason: SnapshotUnavailableReason;
      /** Client-safe. It never carries the path, which is a fact about this box. */
      readonly detail: string;
      /** Non-empty only for `invalid`, where the complaints are about the document's own shape. */
      readonly issues: readonly SnapshotIssue[];
    };

/**
 * Read, parse and validate the snapshot at `path`.
 *
 * NOTHING FROM THE FILESYSTEM ERROR REACHES `detail` EXCEPT THE ERRNO CODE, and
 * the path never does. That is `routes/errors.ts`'s rule applied one layer down:
 * a 5xx that helpfully quoted the failure would publish an internal path to
 * whoever triggered it. `EACCES` says what an operator needs and names nothing.
 *
 * Never throws. Every failure is a `{ ok: false }` result.
 */
export async function readSnapshotFile(path: string): Promise<SnapshotRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return unavailable("absent", "no snapshot has been published yet");
    }
    return unavailable("unreadable", `the snapshot file could not be read (${code ?? "unknown error"})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parser's message quotes the offending token, which is content from a
    // file this process does not author. A fixed sentence says as much as a
    // client can act on.
    return unavailable("malformed", "the snapshot file is not JSON");
  }

  const result = snapshotV1Schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: "invalid",
      detail: "the snapshot file is not a version 1 snapshot",
      issues: result.error.issues.map((i) => ({
        path: i.path.join(".") || "(root)",
        message: i.message,
      })),
    };
  }

  return { ok: true, snapshot: result.data };
}

function unavailable(reason: SnapshotUnavailableReason, detail: string): SnapshotRead {
  return { ok: false, reason, detail, issues: [] };
}
