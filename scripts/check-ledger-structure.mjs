// Guards the STRUCTURE of handoffs/LEDGER.md, which is the file every session
// reads before planning and the one a three-way merge is most likely to damage
// without anybody noticing.
//
// WHY THIS EXISTS. Two branches append a section 8 block to the end of this file
// in the same revolution. That is not a mistake, it is the protocol: HANDOFF-08
// and HANDOFF-10 ran concurrently and both were required to append. A three-way
// merge given two blocks anchored at the same place will interleave them, and
// the way it interleaves them is to separate a HEADING from the block it names.
// That happened on PR #43 and L2 found it by reading:
//
//   `## HANDOFF-08 (...)`      governed four lines of preamble and nothing else
//   `## HANDOFF-10 (...)`      spliced in directly under that preamble, and so
//                              governed HANDOFF-08's OWN section 8 - Q1 to Q8,
//                              its gate round counts, its deferred assumptions
//   `## HANDOFF-08 ADDENDUM`   governed its own content for 54 lines and then
//                              HANDOFF-10's section 8, both inside ONE fence
//
// Nothing was lost. Everything was filed under the wrong name, which for this
// file is the same failure: HANDOFF-09 opens next and its section 2 reading is
// "LEDGER.md, section 8 entries from every shipped handoff". It would have read
// eight questions about an analysis toolkit as infra material.
//
// This is the second record-integrity defect a merge has produced on this
// branch. The first was the conflict at b8264c8, where HANDOFF-08's #40 and #41
// landed while this branch was open and git offered a choice between two sets
// of records; it was resolved by keeping BOTH, and the resolution was correct.
// Both were caught by somebody reading. CLAUDE.md's amended stopping rule says
// a shape that has recurred is answered with a check rather than with more
// care, so here is the check.
//
// WHAT THE RULES ARE, AND WHY THESE TWO. Both were measured against the real
// damaged file before being written, and each catches the defect from a
// different end. Neither was chosen for looking reasonable.
//
//   R1  a `## ` heading is preceded by a blank line.
//       On the damaged ledger this fired exactly once, on the spliced
//       `## HANDOFF-10` at line 2674 - one finding out of 28 headings, and the
//       right one. It is the fingerprint of the splice itself.
//
//   R2  a `## ` heading governs at least one fenced block before the next
//       heading. On the damaged ledger this fired exactly once, on the orphaned
//       `## HANDOFF-08` at line 2668, which had been left with five lines of
//       preamble after the splice took its block. Every section 8 entry in this
//       file is a fenced block, so a heading with none has been separated from
//       its content.
//
// TWO RULES THAT WERE PROPOSED, MEASURED, AND ARE NOT HERE, recorded because a
// rule that looks like coverage and is not is worse than an absent rule.
//
//   "every heading naming a handoff number is followed by a block that mentions
//   that number" - L2's proposal. Executed against the damaged file: it PASSES
//   at both damaged sites. HANDOFF-08's 219-line block mentions HANDOFF-10
//   somewhere in passing and HANDOFF-10's 185-line block mentions HANDOFF-08,
//   so "mentions its own number" is satisfied by both misfilings. It also FIRES
//   on three correct blocks - the HANDOFF-08 ADDENDUM and the two round 4
//   blocks never write their own number, because a block does not usually name
//   the handoff whose section it is. Misses the defect, flags the innocent.
//
//   "no fenced block contains two `Q1.` lines" - this session's proposal, to
//   catch the shared fence. Executed against the damaged file: zero findings.
//   The HANDOFF-08 addendum sharing that fence has no line-initial `Q1.`, so
//   the marker was not in the damaged region at all.
//
// Self-tested in both directions on every run, and the self-test drives the
// REAL rule function rather than a copy of it. HANDOFF-10's gate round 3 found
// this project's zebrad guard asserting against patterns written out a second
// time inside its own selfTest, so breaking the real check left every probe
// green. One function, two callers.

import { readFileSync, existsSync } from "node:fs";

const LEDGER = "handoffs/LEDGER.md";

/**
 * Every rule, over the text of a ledger. Returns a list of finding strings.
 *
 * Fence tracking is deliberate and not incidental: this file quotes markdown,
 * shell and diffs inside fenced blocks, and a `## ` line inside a fence is
 * quoted text rather than a heading. A version of this guard that ignored
 * fences would fire on the record of a defect instead of on the defect.
 */
export function scanHeadings(lines) {
  const headings = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (lines[i].startsWith("## ")) headings.push(i);
  }
  return { headings, inFence };
}

export function ledgerFindings(text) {
  const lines = text.split("\n");
  const findings = [];
  const { headings, inFence } = scanHeadings(lines);

  if (inFence) {
    findings.push(
      `${LEDGER}  R3: a fenced block is opened and never closed. Every later heading in the ` +
        "file is then inside it, so the other rules go blind rather than fire.",
    );
  }

  // R1 - the splice fingerprint.
  for (const i of headings) {
    if (i > 0 && lines[i - 1].trim() !== "") {
      findings.push(
        `${LEDGER}:${i + 1}  R1: no blank line before "${lines[i].slice(0, 60)}". A merge that ` +
          "splices a heading under another section's paragraph leaves exactly this trace.",
      );
    }
  }

  // R2 - a heading separated from the block it names.
  for (let h = 0; h < headings.length; h += 1) {
    const start = headings[h];
    const end = h + 1 < headings.length ? headings[h + 1] : lines.length;
    let hasFence = false;
    for (let j = start + 1; j < end; j += 1) {
      if (lines[j].startsWith("```")) {
        hasFence = true;
        break;
      }
    }
    if (!hasFence) {
      findings.push(
        `${LEDGER}:${start + 1}  R2: "${lines[start].slice(0, 60)}" governs ${end - start - 1} ` +
          "line(s) and no fenced block. Every section 8 entry here is fenced, so a heading with " +
          "none has been separated from its content - look for its block under the NEXT heading.",
      );
    }
  }

  return findings;
}

function selfTest() {
  let ok = true;
  const fail = (m) => {
    console.error(`[ledger-structure] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

  const GOOD = ["## HANDOFF-01 — a", "", "preamble", "", "```", "body", "```", ""].join("\n");
  if (ledgerFindings(GOOD).length !== 0) {
    fail(`a well-formed section was reported: ${JSON.stringify(ledgerFindings(GOOD))}`);
  }

  // R1 fail side: the exact shape PR #43's merge produced - a second heading
  // spliced directly under the first section's closing sentence.
  const SPLICED = [
    "## HANDOFF-08 — a",
    "",
    "entry, which is this one.",
    "## HANDOFF-10 — b",
    "",
    "```",
    "body",
    "```",
    "",
  ].join("\n");
  const spliced = ledgerFindings(SPLICED);
  if (!spliced.some((f) => f.includes("R1"))) fail("R1 did not fire on a spliced heading");
  // And the same document trips R2 on the heading whose block was taken, which
  // is what makes the pair worth having: the defect is visible from both ends.
  if (!spliced.some((f) => f.includes("R2"))) fail("R2 did not fire on the orphaned heading");

  // R2 fail side on its own, with the blank lines correct - so it cannot be
  // passing only as a side effect of R1.
  const ORPHAN = ["## HANDOFF-08 — a", "", "four lines", "", "## HANDOFF-10 — b", "", "```", "x", "```", ""].join("\n");
  const orphan = ledgerFindings(ORPHAN);
  if (orphan.some((f) => f.includes("R1"))) fail("R1 fired on a document whose blank lines are correct");
  if (!orphan.some((f) => f.includes("R2"))) fail("R2 did not fire on an orphaned heading");

  // R3: an unclosed fence. Stated as its own finding rather than left to make
  // the other two silently useless.
  const UNCLOSED = ["## HANDOFF-01 — a", "", "```", "body that never closes", ""].join("\n");
  if (!ledgerFindings(UNCLOSED).some((f) => f.includes("R3"))) fail("R3 did not fire on an unclosed fence");

  // A `## ` line INSIDE a fence is quoted text, not a heading. This file
  // records defects by quoting them, so a guard that could not tell the
  // difference would fire on its own incident report forever.
  const QUOTED = ["## HANDOFF-01 — a", "", "```", "## HANDOFF-99 — quoted, not a heading", "```", ""].join("\n");
  if (ledgerFindings(QUOTED).length !== 0) {
    fail(`a heading quoted inside a fence was treated as real: ${JSON.stringify(ledgerFindings(QUOTED))}`);
  }

  return ok;
}

if (!selfTest()) {
  console.error("[ledger-structure] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}

if (!existsSync(LEDGER)) {
  console.error(`[ledger-structure] FAIL: ${LEDGER} does not exist.`);
  process.exit(1);
}

const text = readFileSync(LEDGER, "utf8");
const findings = ledgerFindings(text);

if (findings.length > 0) {
  console.error(`[ledger-structure] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

// The SAME scanner the rules use. A second implementation here would be the
// exact defect this file's header warns about one paragraph above.
const headingCount = scanHeadings(text.split("\n")).headings.length;

console.log(
  `[ledger-structure] OK: ${headingCount} heading(s) in ${LEDGER}, each preceded by a blank line ` +
    "and each governing a fenced block (detectors self-tested in both directions).",
);
