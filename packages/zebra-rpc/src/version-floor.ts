/**
 * The node version floor this client declares, and the parser that checks it.
 *
 * WHY A CONSTANT HERE RATHER THAN ONLY A TAG IN `docker-compose.yml`. A pin
 * states an INTENT and notices nothing. It binds the image the operator brings
 * up on the day they run `docker compose up`, and it says nothing about the node
 * a gateway is actually talking to six months later - after a manual `docker
 * pull`, after a rollback, after a second box, or after someone pointed
 * `ZEBRAD_RPC_URL` at a node that is not the one compose started. Every
 * behaviour this project depends on below is silent when it is absent: an older
 * node answers, the schemas parse, the tests pass and the numbers are wrong.
 * LEDGER-10 Q2 answered the same shape for Redis by putting the safety inside a
 * tool; this is the same move for the node version. The pin states the intent
 * and this constant is what lets something notice.
 *
 * THREE REASONS, IN THE ORDER THEY WERE ESTABLISHED, each read from Zebra's own
 * source rather than from a summary of it:
 *
 *   1. Below 6.0.0 there is no NU6.3 / Ironwood support at all.
 *
 *   2. Below ZcashFoundation/zebra PR #9805 (merged 22 Aug 2025)
 *      `getrawtransaction` does not serialise `vjoinsplit`. Every Sprout value
 *      term in this project reads that field, so against such a node
 *      `sproutValueBalanceZat` is `0n` for every transaction, silently.
 *      `sprout-field.ts` reports the absent field as INDETERMINATE rather than
 *      as zero, which makes this a detected condition - but only a node at or
 *      above the floor makes it a non-condition.
 *
 *   3. Below 6.3.0 `getblocksubsidy` returns the PRE-NU6 funding-stream
 *      `recipient` and `specification` strings for every upgrade after NU6.
 *      The whole change is one predicate in `zebra-rpc/src/methods.rs`:
 *      `let is_nu6 = NetworkUpgrade::current(&net, height) == NetworkUpgrade::Nu6`
 *      became
 *      `let is_post_nu6 = NetworkUpgrade::current(&net, height) >= NetworkUpgrade::Nu6`.
 *      At NU6.1, NU6.2 and NU6.3 the old predicate is false, so the zcashd-compat
 *      pre-NU6 strings are emitted. Zebra's 6.3.0 CHANGELOG states the bound
 *      exactly: "getblocksubsidy now returns NU6-era funding stream metadata
 *      (recipient names and specification URLs) for NU6.1 and later upgrades.
 *      Amounts and addresses were never affected" (PR #11172).
 *
 *      READ THAT LAST SENTENCE BEFORE CITING THIS FLOOR FOR THE WRONG REASON.
 *      `FundingStream.address` is on the struct at 6.2.3 as well -
 *      `zebra-rpc/src/methods/types/subsidy.rs` is byte-identical between the
 *      two tags, and so is `zebra-chain/src/parameters/network/subsidy.rs`,
 *      which holds the funding-stream tables. What 6.2.3 gets wrong is the
 *      recipient's NAME and the URL of the ZIP that defines the stream. This
 *      project displays the labeller and the method beside every label
 *      (CLAUDE.md, labels precedence), so a `consensus`-tier funding-stream
 *      label carrying a correct address under a wrong provenance string is a
 *      worse failure than an absent field: it looks sourced and is not.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not dial anything and it does not decide
 * what to do about a node below the floor. It parses a `subversion` string and
 * compares it. The assertion that a CONNECTED node clears it is HANDOFF-11 §5
 * A11, which is where a live node first exists.
 */

/** One parsed semantic version. Pre-release and build metadata are discarded. */
export interface ZebraVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * The floor, as a version rather than a string, so a comparison cannot be a
 * lexicographic accident. `"6.10.0" < "6.9.0"` is true of strings and false of
 * versions, and this project will reach a 6.10 before it reaches a 7.
 */
export const ZEBRA_MIN_VERSION: ZebraVersion = { major: 6, minor: 3, patch: 0 };

/** The floor rendered the way a human writes it, for messages. */
export const ZEBRA_MIN_VERSION_STRING = "6.3.0" as const;

/**
 * The `subversion` shape Zebra emits, as a comment rather than as the regex, so
 * the regex below can be read against it.
 *
 * `getinfo`'s `subversion` is the node's network protocol user-agent verbatim:
 * `GetInfoResponse { subversion: self.user_agent.clone(), .. }`
 * (`zebra-rpc/src/methods.rs` at v6.3.0), and `user_agent()` is
 * `format!("/Zebra:{release_version}/")` (`zebrad/src/application.rs:160-162` at
 * v6.3.0). So a real node answers `/Zebra:6.3.0/`.
 *
 * The regex is deliberately WIDER than that one shape. A node behind a proxy, a
 * fork, or a zcashd-compat peer can answer something else, and the honest
 * outcome for a string this parser does not understand is `null` - "I could not
 * tell" - not a version invented from a partial match, and not a silent pass.
 */
const SUBVERSION_RE = /^\/?\s*Zebra\s*:\s*v?(\d+)\.(\d+)\.(\d+)/i;

/** A bare `6.3.0` or `v6.3.0`, which is what a `--version` line or a tag gives. */
const BARE_VERSION_RE = /^\s*v?(\d+)\.(\d+)\.(\d+)/;

/**
 * Parse a node's `subversion` (or a bare version string) into a `ZebraVersion`.
 *
 * Returns `null` when the string is not one this parser understands, which the
 * caller must treat as UNKNOWN rather than as either pass or fail. An unparsed
 * string silently treated as passing is the failure mode this whole module
 * exists to remove.
 */
export function parseZebraVersion(subversion: string): ZebraVersion | null {
  const m = SUBVERSION_RE.exec(subversion) ?? BARE_VERSION_RE.exec(subversion);
  if (m === null) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return null;
  }
  return { major, minor, patch };
}

/** `a` against `b`: negative if `a` is older, 0 if equal, positive if newer. */
export function compareZebraVersion(a: ZebraVersion, b: ZebraVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** The three outcomes, named, because two of them are not "it failed". */
export type VersionFloorVerdict =
  | { readonly ok: true; readonly version: ZebraVersion; readonly subversion: string }
  | { readonly ok: false; readonly reason: "below-floor"; readonly version: ZebraVersion; readonly subversion: string }
  | { readonly ok: false; readonly reason: "unparsed"; readonly version: null; readonly subversion: string };

/**
 * Whether a node's `subversion` clears the declared floor.
 *
 * THREE OUTCOMES RATHER THAN A BOOLEAN, and the third is the one that matters.
 * "Below the floor" and "I could not read the string" are different facts and
 * they want different operator actions - upgrade the node, versus find out what
 * is answering. Collapsing them into `false` loses the distinction; collapsing
 * them into `true` is how a floor comes to certify a node nobody checked.
 */
export function checkZebraVersionFloor(
  subversion: string,
  floor: ZebraVersion = ZEBRA_MIN_VERSION,
): VersionFloorVerdict {
  const version = parseZebraVersion(subversion);
  if (version === null) return { ok: false, reason: "unparsed", version: null, subversion };
  if (compareZebraVersion(version, floor) < 0) {
    return { ok: false, reason: "below-floor", version, subversion };
  }
  return { ok: true, version, subversion };
}

/** A one-line, operator-readable explanation of a verdict. */
export function describeVersionFloorVerdict(v: VersionFloorVerdict): string {
  if (v.ok) {
    return `node subversion ${v.subversion} is ${v.version.major}.${v.version.minor}.${v.version.patch}, at or above the ${ZEBRA_MIN_VERSION_STRING} floor`;
  }
  if (v.reason === "below-floor") {
    return (
      `node subversion ${v.subversion} is ${v.version.major}.${v.version.minor}.${v.version.patch}, BELOW the ${ZEBRA_MIN_VERSION_STRING} floor this client declares. ` +
      `Below 6.0.0 there is no Ironwood support; below the vjoinsplit fix every Sprout value term reads 0n; ` +
      `below 6.3.0 getblocksubsidy returns pre-NU6 funding-stream provenance strings after NU6.`
    );
  }
  return (
    `node subversion ${JSON.stringify(v.subversion)} could not be parsed as a Zebra version, so the ${ZEBRA_MIN_VERSION_STRING} floor is UNVERIFIED. ` +
    `This is not a pass: find out what is answering on this RPC endpoint.`
  );
}
