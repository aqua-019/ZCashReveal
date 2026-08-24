/**
 * Transaction-version dispatch, and the refusal that keeps the indexer running.
 *
 * WHAT THIS FILE IS FOR. Zebra will serialise a transaction version this build
 * has never seen the moment a network upgrade defines one - v6 itself was that
 * transaction a month ago - and an indexer that throws on the first of them
 * stops indexing the chain at the block it appears in. So the decoder decides,
 * before it interprets a single field, whether it models this shape at all. If
 * it does not, the transaction becomes an `UNSUPPORTED_TX` report that measures
 * nothing and says so, and the mempool loop carries on.
 *
 * THE REFUSAL IS NOT DEFENSIVE PADDING - IT IS WHAT STOPS A FABRICATION. Every
 * other `LeakClass` asserts where value went. Running the Sapling and Orchard
 * decoders over an unmodelled version would produce zeros for every field they
 * did not find, and those zeros would be published as measurements: "this
 * transaction moved no shielded value", about bytes nobody here understands.
 * That is the same defect as `tx.feeZat` and `expiryheight`, arrived at from
 * the other direction, and it is worse because it would be about a transaction
 * shape the project has no way to check itself against.
 *
 * WHAT THE VERSIONS ARE.
 *
 *   v1        the original format; no JoinSplits, no shielded bundles
 *   v2        JoinSplits appear (Sprout)
 *   v3        Overwinter
 *   v4        Sapling; JoinSplits still permitted
 *   v5        NU5 (ZIP 225): Orchard appears, JoinSplits are REMOVED
 *   v6        NU6.3 (ZIP 229): the Ironwood bundle appears
 *              (docs/2.0/research/01-contemporary-zcash.md §2.2, "Transaction
 *              format: v6, per ZIP 229", `high`)
 *
 * Zebra reports the unmasked version number, so the Overwinter high bit that
 * appears in the serialised form is not seen here.
 *
 * THREE RULES, AND EACH ONE REFUSES A SHAPE RATHER THAN A TRANSACTION.
 * An unknown version number is the obvious one. The other two are contradictions
 * between a version and its contents - an Ironwood bundle on a version that
 * predates Ironwood, or JoinSplits on a version that removed them. Neither can
 * occur on a consensus-valid chain, so seeing one means either this decoder has
 * misread the response or the node is not serialising what this build believes
 * it does. Both are reasons to decline to classify, and neither is a reason to
 * crash: the chain is the authority on what happened, and a decoder that
 * disagrees with it reports its own confusion.
 *
 * A BUNDLE KEY IS NOT A BUNDLE. Zebra emits `orchard` unconditionally, with an
 * empty action list and zero balances, even for a pre-NU5 coinbase, and the
 * Ironwood bundle is serialised from the same struct. So the rules below test
 * `actions.length`, never key presence - testing presence would mark every
 * transaction on the chain unsupported.
 */

import type { RpcTransaction } from "@zcashreveal/types";

/** The lowest transaction version this decoder models. */
export const MIN_SUPPORTED_TX_VERSION = 1;

/**
 * The highest transaction version this decoder models: v6, the format NU6.3
 * introduced for the Ironwood bundle (ZIP 229).
 *
 * RAISING THIS IS NOT THE WHOLE JOB OF SUPPORTING A NEW VERSION, which is why
 * it is a named constant with this comment attached rather than a literal in a
 * comparison. A v7 will be readable by this decoder only once something knows
 * what its bundles are called and what fields they carry; bumping the number
 * alone would replace an honest refusal with a silent misreading.
 */
export const MAX_SUPPORTED_TX_VERSION = 6;

/**
 * v6 AND THE IRONWOOD BUNDLE REST ON DRAFT ZIPs, AND SO DOES EVERY CONSTANT IN
 * THIS FILE ABOVE v5.
 *
 * ZIP 229 (the v6 transaction format) and ZIP 258 (NU6.3) are both status
 * DRAFT, as is ZIP 318 (docs/2.0/research/01-contemporary-zcash.md §2.3, `high`
 * - "229/258/318/326 = Draft"). A Draft ZIP may be edited, so the format this
 * decoder models can still change under it. The Ironwood ACTIVATION HEIGHTS
 * carry the same dependency and are marked at
 * `activation-heights.ts:IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP`; this is the
 * same fact for the format rather than for the height, marked here so a grep
 * for "Draft" finds both. Tracked as a standing deferred entry in
 * `handoffs/LEDGER.md`.
 */
export const V6_FORMAT_RESTS_ON_A_DRAFT_ZIP = "ZIP 229, status Draft" as const;

/**
 * The first version whose format carries an Ironwood bundle. ZIP 229 / NU6.3.
 */
export const IRONWOOD_MIN_TX_VERSION = 6;

/**
 * The first version whose format removed JoinSplits: v5, per ZIP 225.
 *
 * THAT v6 DID NOT BRING THEM BACK IS AN INFERENCE, NOT A QUOTATION. This
 * repository states only that v6 is "the transaction format, per ZIP 229"
 * (docs/2.0/research/01-contemporary-zcash.md §2.2) and carries no field list
 * for it; ZIP 229 itself is Draft and unreachable from this container. The
 * inference errs safe - a v6 carrying JoinSplits is declined rather than
 * mismeasured - which is why it is allowed to stand while labelled.
 */
export const JOINSPLIT_REMOVED_FROM_TX_VERSION = 5;

/**
 * What the dispatcher concluded about a transaction's shape.
 *
 * A discriminated union rather than a boolean, because the caller needs the
 * REASON to put on the report: "this decoder does not model version 7" and
 * "this v4 carries an Ironwood bundle" are different facts about the chain and
 * a reader who sees only a class learns neither.
 */
export type VersionDispatch =
  | {
      kind: "SUPPORTED";
      version: number;
      /** Whether this version's format can carry an Ironwood bundle at all. */
      mayCarryIronwood: boolean;
    }
  | {
      kind: "UNSUPPORTED";
      version: number;
      /** One phrase naming the rule that declined it. Goes on the report and the log line. */
      reason: string;
      /** The response's own top-level keys, sorted. Keys only - never values. */
      rawFieldNames: string[];
    };

/**
 * Decide whether this decoder models the transaction's shape. Never throws.
 *
 * Total by construction: every path returns a `VersionDispatch`, it reads only
 * `version`, `ironwood.actions.length` and `vjoinsplit.length`, and it does not
 * convert, parse or brand anything. A function whose job is to keep the decoder
 * from throwing on an unknown shape must not itself be able to throw on one.
 */
export function dispatchByVersion(tx: RpcTransaction): VersionDispatch {
  const version = tx.version;

  if (
    !Number.isInteger(version) ||
    version < MIN_SUPPORTED_TX_VERSION ||
    version > MAX_SUPPORTED_TX_VERSION
  ) {
    return unsupported(
      tx,
      `transaction version ${String(version)} is outside the range this decoder models (${MIN_SUPPORTED_TX_VERSION} to ${MAX_SUPPORTED_TX_VERSION})`,
    );
  }

  if (version < IRONWOOD_MIN_TX_VERSION && (tx.ironwood?.actions.length ?? 0) > 0) {
    return unsupported(
      tx,
      `v${version} carries ${tx.ironwood?.actions.length ?? 0} Ironwood actions, and the Ironwood bundle exists only from v6 (ZIP 229)`,
    );
  }

  if (version >= JOINSPLIT_REMOVED_FROM_TX_VERSION && (tx.vjoinsplit?.length ?? 0) > 0) {
    return unsupported(
      tx,
      `v${version} carries ${tx.vjoinsplit?.length ?? 0} JoinSplits, and v5 removed them (ZIP 225)`,
    );
  }

  return {
    kind: "SUPPORTED",
    version,
    mayCarryIronwood: version >= IRONWOOD_MIN_TX_VERSION,
  };
}

/**
 * The keys the response actually carried, sorted.
 *
 * KEYS ONLY, NEVER VALUES. §3 of the handoff asks for the raw field names to be
 * logged, and the reason to stop at names is that the values of an unclassified
 * transaction may be amounts, scripts or ciphertext - content this project does
 * not log about a transaction it has declined to understand. The names are what
 * a later handoff implementing the next version actually needs: they are the one
 * thing this build cannot guess.
 *
 * Sorted so two logs of the same shape compare equal.
 */
export function topLevelFieldNames(tx: RpcTransaction): string[] {
  return Object.keys(tx).sort();
}

function unsupported(tx: RpcTransaction, reason: string): VersionDispatch {
  return {
    kind: "UNSUPPORTED",
    version: tx.version,
    reason,
    rawFieldNames: topLevelFieldNames(tx),
  };
}
