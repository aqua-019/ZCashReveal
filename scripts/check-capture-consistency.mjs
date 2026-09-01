#!/usr/bin/env node
/**
 * Every `mainnet-*.json` capture is internally consistent.
 *
 * WHY THIS EXISTS, and it is not a general-purpose sanity check. A capture is
 * the one artifact in this repository that the suite treats as GROUND TRUTH:
 * `block-decoder.test.ts` asserts the decoder against it, so a capture that is
 * quietly wrong makes every assertion built on it quietly wrong in the same
 * direction. Nothing else in the tree can notice, because there is nothing to
 * compare a capture against - that is what makes it evidence.
 *
 * EXCEPT THAT A BLOCK CARRIES ITS OWN CHECKSUM. The header's `merkleroot` is
 * the Merkle root over the block's own transaction ids, so a header taken from
 * one block and a transaction list taken from another CANNOT agree. And the
 * three note-commitment tree sizes in `trees` are cumulative, so the delta
 * against the previous block must equal the number of outputs and actions this
 * block's own transactions contain. Both are computable from the files alone.
 *
 * THE DEFECT THIS WAS WRITTEN AGAINST IS REAL AND HAS A NUMBER.
 * ZcashFoundation/zebra issue #10550, fixed in 6.2.2: `getblock` resolved the
 * caller-supplied hash-or-height a SECOND time for `get_block_header`, and
 * bound the SaplingTree and Depth reads to it as well, so a reorg or tip
 * advance between those reads could mix block A's header with block B's
 * contents, or return a Sapling tree from a different block at the same height.
 * The same release stopped hardcoding `in_active_chain: true` on every
 * transaction in the verbosity-2 path. A capture taken from a node below 6.2.2
 * can therefore be internally inconsistent, and NOTHING IN THE FILE SAYS SO.
 *
 * So the rule this enforces is: a capture's version is RECORDED (README), and
 * its consistency is CHECKED HERE rather than inferred from the version. That
 * ordering matters - a capture from a floor-clearing node is not automatically
 * consistent, and a capture from an older node is not automatically wrong. The
 * question is answerable, so it is answered.
 *
 * THREE OUTCOMES, and the third is the one that matters. A check that passes,
 * a check that fails, and a check that COULD NOT BE RUN - the `trees` delta
 * needs the previous block, which a capture set may not contain. "Not checked"
 * is reported as not checked. It is never counted as a pass.
 *
 * Usage:  node scripts/check-capture-consistency.mjs [dir]
 *         (default dir: apps/indexer/test/fixtures/blocks)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "apps/indexer/test/fixtures/blocks";
const sha256d = (b) => createHash("sha256").update(createHash("sha256").update(b).digest()).digest();
const n = (x) => (Array.isArray(x) ? x.length : 0);

/**
 * Bitcoin/Zcash Merkle root over displayed txids.
 *
 * Txids are DISPLAYED big-endian and hashed little-endian, so each is reversed
 * on the way in and the root is reversed on the way out. An odd row duplicates
 * its last element. Getting either convention wrong yields a root that never
 * matches, which is a false alarm rather than a false pass - but it is still
 * wrong, so the self-test drives a KNOWN-ANSWER VECTOR: a real block's txids
 * and the root its node reported.
 *
 * THE VECTOR IS NOT DECORATION, AND THE SENTENCE IT REPLACED WAS FALSE. As
 * delivered, this docblock said the self-test "drives a known block" and the
 * self-test built its blocks with `merkleroot: merkleRoot(txids)` - the
 * function checking itself. Measured: reversing the byte order, and replacing
 * the odd-row duplication with a zero block, BOTH leave the self-test green,
 * because a self-computed root moves with the function computing it. Only the
 * committed captures caught them, and a tree with no captures would have
 * shipped either. A known-answer vector makes the convention checkable with no
 * fixture present, which is the state a fresh clone of this repository was in
 * for four handoffs.
 */
function merkleRoot(txids) {
  let level = txids.map((h) => Buffer.from(h, "hex").reverse());
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256d(Buffer.concat([level[i], level[i + 1] ?? level[i]])));
    }
    level = next;
  }
  return Buffer.from(level[0]).reverse().toString("hex");
}

function checkOne(block, prev) {
  const findings = [];
  const notChecked = [];
  let treesDeltaRan = 0;

  // A CRASH IS NOT ONE OF THE THREE OUTCOMES. `merkleRoot([])` reads `level[0]`
  // of an empty array and throws out of `Buffer.from`, and a missing `tx` throws
  // one line earlier - so a single malformed file took the whole run down with a
  // stack trace instead of naming the file it could not read, and the captures
  // after it in the directory were never examined. Every Zcash block carries at
  // least a coinbase transaction, so an absent or empty `tx` is exactly the
  // "quietly wrong capture" this guard exists to catch. Found by driving the
  // delta arm with a stub that had no transactions.
  if (!Array.isArray(block.tx) || block.tx.length === 0) {
    findings.push(
      `the capture has no transaction list (tx is ${Array.isArray(block.tx) ? "an empty array" : typeof block.tx}). ` +
        `Every block carries at least a coinbase transaction, so this file is truncated or malformed.`,
    );
    return { findings, notChecked, treesDeltaRan };
  }
  const txids = block.tx.map((t) => t.txid);

  const computed = merkleRoot(txids);
  if (computed !== block.merkleroot) {
    findings.push(
      `merkleroot MISMATCH: header says ${block.merkleroot}, the ${txids.length} txids in this file give ${computed}. ` +
        `The header and the transaction list are from DIFFERENT BLOCKS (zebra #10550).`,
    );
  }
  if (block.nTx !== block.tx.length) {
    findings.push(`nTx is ${block.nTx} but the tx array holds ${block.tx.length}`);
  }
  for (const t of block.tx) {
    if (t.blockhash !== undefined && t.blockhash !== block.hash) {
      findings.push(`tx ${t.txid} names blockhash ${t.blockhash}, not ${block.hash}`);
    }
    if (t.height !== undefined && t.height !== block.height) {
      findings.push(`tx ${t.txid} names height ${t.height}, not ${block.height}`);
    }
  }
  // `in_active_chain` was hardcoded `true` below 6.2.2. `true` is the CORRECT
  // value for a block on the best chain, so this is a check for the case where
  // it is not - not a check for the node's version.
  if (block.confirmations !== undefined && block.confirmations < 0) {
    const claimed = block.tx.filter((t) => t.in_active_chain === true);
    if (claimed.length > 0) {
      findings.push(
        `confirmations is ${block.confirmations} (not on the best chain) but ${claimed.length} tx claim in_active_chain: true`,
      );
    }
  }

  if (prev === null) {
    notChecked.push(
      `trees deltas: no capture of height ${block.height - 1} in this directory, so the cumulative ` +
        `note-commitment sizes could not be checked against this block's own outputs and actions`,
    );
  } else if (prev.hash !== block.previousblockhash) {
    findings.push(`previousblockhash ${block.previousblockhash} does not match the height-${prev.height} capture's hash ${prev.hash}`);
  } else {
    const expected = {
      sapling: block.tx.reduce((a, t) => a + n(t.vShieldedOutput), 0),
      orchard: block.tx.reduce((a, t) => a + n(t.orchard?.actions), 0),
      ironwood: block.tx.reduce((a, t) => a + n(t.ironwood?.actions), 0),
    };
    for (const pool of Object.keys(expected)) {
      const cur = block.trees?.[pool]?.size, pre = prev.trees?.[pool]?.size;
      if (cur === undefined || pre === undefined) { notChecked.push(`trees.${pool}.size absent on one of the two blocks`); continue; }
      treesDeltaRan++;
      if (cur - pre !== expected[pool]) {
        findings.push(
          `trees.${pool}.size moved ${pre} -> ${cur} (delta ${cur - pre}) but this block's transactions ` +
            `carry ${expected[pool]} ${pool === "sapling" ? "shielded outputs" : "actions"} (zebra #10550)`,
        );
      }
    }
  }
  return { findings, notChecked, treesDeltaRan };
}

/**
 * EVERY ARM OF THE RULE, AS DATA. The self-test iterates THIS LIST, so a probe
 * set cannot silently under-cover the rule: adding a detector to `checkOne`
 * without adding a row here fails `FINDING_SITES` below.
 *
 * WHY THIS REPLACED A TWO-PROBE SELF-TEST. As delivered, the self-test drove
 * the merkleroot arm and the sapling delta arm - two of the seven places
 * `checkOne` can raise a finding. The other five (nTx, per-tx blockhash, per-tx
 * height, the best-chain flag, and previousblockhash) had no fail side at all,
 * which is the shape LEDGER-09a Q3 names: three of this project's guards have
 * shipped with a self-test that certified a hole, and eleven of the twelve holes
 * in `check-instrument-deps.mjs` were found by executing a probe rather than by
 * reading. A guard whose self-test covers two arms is evidence about two arms.
 *
 * Each row is a DATA mutation - a value drawn from the set the arm claims to
 * exclude - never a code change, per CLAUDE.md's rule that a fail side which is
 * only a code mutation proves an assertion is wired and never that it
 * discriminates.
 */
const ARMS = [
  { arm: "tx-missing", needsPrev: false, expect: "no transaction list", marker: "no transaction list", mutate: (b) => { delete b.tx; } },
  { arm: "tx-empty", needsPrev: false, expect: "no transaction list", marker: "no transaction list", mutate: (b) => { b.tx = []; } },
  { arm: "merkleroot", needsPrev: false, expect: "merkleroot MISMATCH", marker: "merkleroot MISMATCH", mutate: (b) => { b.tx[b.tx.length - 1].txid = "33".repeat(32); } },
  { arm: "nTx", needsPrev: false, expect: "nTx is", marker: "nTx is", mutate: (b) => { b.nTx = b.tx.length + 1; } },
  { arm: "tx-blockhash", needsPrev: false, expect: "names blockhash", marker: "names blockhash", mutate: (b) => { b.tx[0].blockhash = "ff".repeat(32); } },
  { arm: "tx-height", needsPrev: false, expect: "names height", marker: "names height", mutate: (b) => { b.tx[0].height = b.height + 1; } },
  { arm: "best-chain", needsPrev: false, expect: "in_active_chain", marker: "not on the best chain", mutate: (b) => { b.confirmations = -1; b.tx[0].in_active_chain = true; } },
  { arm: "previousblockhash", needsPrev: true, expect: "previousblockhash", marker: "does not match the height-", mutate: (b) => { b.previousblockhash = "ee".repeat(32); } },
  { arm: "trees-sapling", needsPrev: true, expect: "trees.sapling.size", marker: "${pool}.size moved", mutate: (b) => { b.trees.sapling.size += 99; } },
  { arm: "trees-orchard", needsPrev: true, expect: "trees.orchard.size", marker: "${pool}.size moved", mutate: (b) => { b.trees.orchard.size += 99; } },
  { arm: "trees-ironwood", needsPrev: true, expect: "trees.ironwood.size", marker: "${pool}.size moved", mutate: (b) => { b.trees.ironwood.size += 99; } },
];

/**
 * The number of places `checkOne` can raise a finding, counted out of its own
 * source rather than asserted from memory. ARMS must reach all of them.
 *
 * THIS IS THE HALF THAT CANNOT BE FAKED BY ADDING PROBES. `ARMS` proves every
 * row fires; this proves no arm exists that no row reaches. Neither subsumes
 * the other, which is why both are here.
 */
const FINDING_SITES = 8;

function validPair() {
  const txids = ["11".repeat(32), "22".repeat(32)];
  const prev = {
    hash: "pp".repeat(16), height: 1, nTx: 1, confirmations: 11,
    merkleroot: merkleRoot(["aa".repeat(32)]),
    tx: [{ txid: "aa".repeat(32), blockhash: "pp".repeat(16), height: 1 }],
    trees: { sapling: { size: 10 }, orchard: { size: 20 }, ironwood: { size: 30 } },
  };
  const cur = {
    hash: "cc".repeat(16), height: 2, nTx: 2, confirmations: 10,
    previousblockhash: prev.hash, merkleroot: merkleRoot(txids),
    // one sapling output, two orchard actions, three ironwood actions
    trees: { sapling: { size: 11 }, orchard: { size: 22 }, ironwood: { size: 33 } },
    tx: [
      { txid: txids[0], blockhash: "cc".repeat(16), height: 2, vShieldedOutput: [{}] },
      { txid: txids[1], blockhash: "cc".repeat(16), height: 2, orchard: { actions: [{}, {}] }, ironwood: { actions: [{}, {}, {}] } },
    ],
  };
  return { prev, cur };
}

// ── self-test: the check must FAIL on every block it should reject ──────────
// A guard that has never been seen to fire is indistinguishable from one that
// checks nothing. Driven by DATA mutations - a value from the set each arm
// claims to exclude - not by disabling anything.
/**
 * Mainnet block 3,432,130: its five txids in block order, and the `merkleroot`
 * its node reported in the same response. Recorded here so the byte-order and
 * odd-row conventions are pinned by an answer this file did not compute.
 */
const KNOWN_MERKLE_VECTOR = {
  height: 3432130,
  txids: [
    "e2cbdd53381cfe894ffa7b271681b5b2a0b55e37a484a1972b2a0220cfe56a30",
    "570e06e453c676551417ca46366066ce9fba005f23641c76bd1c47ee36531cb0",
    "39f405af04d37f718fe6e02576f62a7fa301c00e2744a8503d97b57607bdd5e2",
    "c88aef31237cbeb2917c2326902b56c54e70d972665bd4169b2c31742e96adbf",
    "2ffa807c9eae2b552ee918e151a32f4e1286d63256f402b2bc03624a6adb04f6",
  ],
  merkleroot: "073420ea8578f8c2aff6b67947e324a50a9975e5e72252fc7034bd0428d79a5d",
};

function selfTest() {
  // KNOWN ANSWER FIRST. Five txids is an odd row at the second level, so this
  // one vector exercises both conventions the comment above describes.
  const computedKnown = merkleRoot(KNOWN_MERKLE_VECTOR.txids);
  if (computedKnown !== KNOWN_MERKLE_VECTOR.merkleroot) {
    return `merkleRoot() is wrong: mainnet block ${KNOWN_MERKLE_VECTOR.height}'s ${KNOWN_MERKLE_VECTOR.txids.length} txids ` +
      `give ${computedKnown}, but its node reported ${KNOWN_MERKLE_VECTOR.merkleroot}`;
  }

  // COVERAGE, BOTH DIRECTIONS, OVER checkOne'S OWN SOURCE.
  //
  // The count alone was not enough and a probe proved it: deleting an ARMS row
  // left the count unchanged, so the rule lost a probe and the self-test stayed
  // green - the same "self-test that certifies a hole" this was written against,
  // reproduced inside the fix for it. So the source is split at its finding
  // sites and each side is checked against the other: every site must carry some
  // row's marker, and every row's marker must be found at some site. Comments
  // are stripped first, because a marker word appearing in prose above a
  // detector would satisfy the check without any detector existing.
  const bare = checkOne.toString().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const chunks = bare.split("findings.push(").slice(1);
  if (chunks.length !== FINDING_SITES) {
    return `checkOne raises findings in ${chunks.length} places but ARMS is written against ${FINDING_SITES}. ` +
      `A detector was added or removed without a probe: add an ARMS row for it and update FINDING_SITES.`;
  }
  for (let i = 0; i < chunks.length; i++) {
    if (!ARMS.some((a) => chunks[i].includes(a.marker))) {
      return `finding site ${i + 1} of ${chunks.length} in checkOne is reached by no ARMS row, so nothing drives it`;
    }
  }
  for (const a of ARMS) {
    if (!bare.includes(a.marker)) {
      return `the ${a.arm} row's marker "${a.marker}" appears at no finding site in checkOne - the row probes a detector that is gone`;
    }
  }

  // PASS STATE, both with and without a predecessor.
  const base = validPair();
  const alone = checkOne(base.cur, null);
  if (alone.findings.length !== 0) return `the self-test's VALID block was rejected: ${alone.findings[0]}`;
  if (alone.treesDeltaRan !== 0) return `the delta arm ran ${alone.treesDeltaRan} times with no predecessor, expected 0`;
  if (alone.notChecked.length !== 1) return `a block with no predecessor reported ${alone.notChecked.length} NOT CHECKED, expected 1`;

  const paired = checkOne(base.cur, base.prev);
  if (paired.findings.length !== 0) return `the self-test's VALID delta block was rejected: ${paired.findings[0]}`;
  if (paired.treesDeltaRan !== 3) return `the delta arm ran ${paired.treesDeltaRan} times, expected 3`;
  if (paired.notChecked.length !== 0) return `a block with its predecessor reported ${paired.notChecked.length} NOT CHECKED, expected 0`;

  // FAIL STATE, once per arm.
  //
  // The try/catch is not defensive dressing. A detector that THROWS on the input
  // it was written to reject looks identical, from the outside, to one that
  // reports nothing - both leave the run with rc=1 - and only one of them is a
  // guard doing its job. Neutering the malformed-`tx` detector proved it: the
  // self-test failed by stack trace, which is the fourth outcome this guard's
  // own header says it does not have. Naming the arm that threw makes the two
  // distinguishable in the transcript.
  for (const { arm, needsPrev, mutate, expect } of ARMS) {
    const { prev, cur } = validPair();
    mutate(cur);
    let findings;
    try {
      ({ findings } = checkOne(cur, needsPrev ? prev : null));
    } catch (err) {
      return `the ${arm} arm THREW instead of reporting a finding: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!findings.some((f) => f.includes(expect))) {
      return `the ${arm} arm did not fire: mutating it produced ${findings.length === 0 ? "no finding" : `"${findings[0]}"`}, ` +
        `which does not contain "${expect}"`;
    }
  }
  return null;
}

const selfTestFailure = selfTest();
if (selfTestFailure !== null) {
  console.error(`[capture-consistency] SELF-TEST FAILED: ${selfTestFailure}`);
  process.exit(1);
}

if (!existsSync(DIR)) {
  console.log(`[capture-consistency] OK: ${DIR} does not exist, so there are 0 captures to check. Self-test passed.`);
  process.exit(0);
}
const names = readdirSync(DIR).filter((f) => /^mainnet-.*\.json$/.test(f));
const byHeight = new Map();
for (const f of names) {
  const b = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  byHeight.set(b.height, b);
}

let failed = false, checked = 0, deltasRan = 0;
const unchecked = [];
for (const [height, block] of [...byHeight].sort((a, b) => a[0] - b[0])) {
  const { findings, notChecked, treesDeltaRan } = checkOne(block, byHeight.get(height - 1) ?? null);
  checked++;
  deltasRan += treesDeltaRan;
  for (const f of findings) { console.error(`[capture-consistency] FAIL height ${height}: ${f}`); failed = true; }
  for (const u of notChecked) unchecked.push(`height ${height}: ${u}`);
}

for (const u of unchecked) console.log(`[capture-consistency] NOT CHECKED - ${u}`);
if (failed) { console.error(`[capture-consistency] rc=1 over ${checked} capture(s).`); process.exit(1); }
console.log(
  `[capture-consistency] OK: ${checked} capture(s) in ${DIR} are internally consistent ` +
    `(merkle root recomputed from txids; nTx; per-tx blockhash and height; best-chain flag; ` +
    `${deltasRan} note-commitment tree delta(s) checked against the blocks' own outputs and actions)` +
    `${unchecked.length > 0 ? `, with ${unchecked.length} check(s) reported above as NOT RUN` : ", every check ran"}` +
    `${checked === 0 ? " - with no captures present it is driven by the self-test alone" : ""}.`,
);
