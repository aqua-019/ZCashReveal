/**
 * Sprout decoding — the JoinSplit half of the four-pool model.
 *
 * SPROUT DOES NOT HAVE A `valueBalance` FIELD, which is the whole reason this
 * file exists and the reason Sprout was invisible to this project until
 * HANDOFF-06. Sapling, Orchard and Ironwood each publish a single signed
 * `valueBalance` for their bundle. Sprout instead carries, on every JoinSplit:
 *
 *   `vpub_old` - value taken OUT of the transparent pool and put INTO Sprout
 *   `vpub_new` - value released back OUT of Sprout to the transparent pool
 *
 * So Sprout's contribution to the transparent value pool, in the same sign
 * convention every other pool uses here (positive means value LEFT the pool for
 * the transparent side), is `vpub_new - vpub_old` summed over the JoinSplits.
 *
 * WHAT OMITTING IT COST, MEASURED RATHER THAN GUESSED. The gateway's first cut
 * of `poolValueBalanceZat` omitted this term, and it was a HIGH gate finding
 * inside HANDOFF-05 - raised and fixed in that handoff, so main has carried the
 * corrected version since PR #36. While it was absent, a Sprout transaction had
 * a boundary of exactly zero, so it was classified "transparent throughout",
 * the pool it actually moved value out of did not appear in its deltas, and its
 * fee was computed without the term that balances it. The INDEXER was still
 * missing it until this handoff, which is why the same defect had to be fixed
 * twice in two places. Sprout holds the residual this site's central argument is about - roughly
 * 22,621 ZEC that has never left in eight years - so it is the last pool that
 * should have been silently absent.
 *
 * `vpub_oldZat` and `vpub_newZat` are the integer fields. The unsuffixed
 * `vpub_old` and `vpub_new` are ZEC floats (Zebra 6.3.0, types/transaction.rs
 * `JoinSplit`); reading those would be wrong by a factor of 100,000,000.
 */

import type { RpcTransaction, Zatoshi } from "@zcashreveal/types";

/**
 * Sprout's net contribution to the transparent value pool, in zatoshi.
 *
 * Positive means value left Sprout, negative means value entered it, zero means
 * either that there are no JoinSplits or that they balanced exactly. Returns
 * `0n` for a transaction with no `vjoinsplit`, which is nearly all of them.
 */
export function sproutValueBalanceZat(tx: RpcTransaction): Zatoshi {
  const joinsplits = tx.vjoinsplit;
  if (joinsplits === undefined || joinsplits.length === 0) return 0n;
  return joinsplits.reduce<bigint>(
    (acc, js) => acc + BigInt(js.vpub_newZat ?? 0) - BigInt(js.vpub_oldZat ?? 0),
    0n,
  );
}

/** How many JoinSplits a transaction carries. Each counts as two ZIP 317 logical actions. */
export function joinSplitCount(tx: RpcTransaction): number {
  return tx.vjoinsplit?.length ?? 0;
}

/** Whether a transaction touches the Sprout pool at all. */
export function touchesSprout(tx: RpcTransaction): boolean {
  return joinSplitCount(tx) > 0;
}
