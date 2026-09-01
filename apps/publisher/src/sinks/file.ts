/**
 * The `file` sink: `snapshot.json` on the local filesystem.
 *
 * THE ONE SINK THAT IS NOT OPTIONAL (docs/2.0/SNAPSHOT.md section 8.5). It is
 * what the gateway serves from `GET /v2/snapshot` and what a dev run produces,
 * so there is no configuration in which it is absent - which is also why A7's
 * and A12's fail sides are both stated in terms of it: whatever goes wrong with
 * the managed store, this file keeps being written.
 *
 * WRITE-THEN-RENAME. A reader of `snapshot.json` is the gateway, on another
 * process, with no lock between them; a plain `writeFile` gives that reader a
 * window in which the file is a truncated prefix of a JSON document, and a
 * snapshot that refuses to parse is the empty dashboard this whole design exists
 * to prevent. `rename` within a directory is atomic on every filesystem this
 * runs on, so a reader sees the old document or the new one and never half of
 * either.
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { SnapshotV1 } from "@zcashreveal/types";

import type { Sink } from "./sink.js";

export interface FileSinkOptions {
  /** `SNAPSHOT_FILE`. */
  readonly path: string;
}

/** Build the `file` sink. */
export function createFileSink(options: FileSinkOptions): Sink {
  const { path } = options;
  const tmp = `${path}.tmp`;
  return {
    name: "file",
    // The local filesystem. Nothing here is drawn from the shared allowance,
    // which is why A12's "the file sink is unaffected" is true by construction
    // rather than by a special case in the budget.
    managedStoreCommandsPerWrite: 0,
    async write(_snapshot: SnapshotV1, json: string): Promise<void> {
      // The directory may not exist on a first run against a fresh volume.
      // `recursive` makes an existing directory a no-op rather than an EEXIST
      // this would then have to distinguish from a real failure.
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tmp, json, "utf8");
      await rename(tmp, path);
    },
    async close(): Promise<void> {
      // Nothing is held open: each write opens, writes and renames. Declared
      // rather than omitted so that `Sink` has one shape and a caller closing
      // every sink does not have to ask which ones have a close.
    },
  };
}
