import type { Metadata } from "next";

import { MethodCeremony } from "@/components/record/MethodCeremony";
import { MethodClustering } from "@/components/record/MethodClustering";
import { ESTIMATOR_COUNTS, MethodEstimators } from "@/components/record/MethodEstimators";
import { MethodGoldenCases } from "@/components/record/MethodGoldenCases";
import { ClaimLadder, ClaimLadderRefusals } from "@/components/record/MethodLadder";
import { MethodPosterior, MethodTaint } from "@/components/record/MethodPosterior";
import { MethodQueryTable } from "@/components/record/MethodQueryTable";
import { PageClaim } from "@/components/record/PageClaim";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { InferenceChain } from "@/components/ui/InferenceChain";
import { Pill } from "@/components/ui/Pill";
import { Reason } from "@/components/ui/Reason";
import { screenByHref } from "@/lib/nav";


const S = screenByHref("/method");

export const metadata: Metadata = {
  title: "Method",
  description: S?.dek ?? "",
};

/**
 * 06 METHOD - the contract.
 *
 * Every number on the Tracking pages is either exact and public or a bound with
 * its assumptions printed beside it, and this page is where the site commits to
 * which is which. It walks down from the unit a reader thinks in - an address -
 * to what the chain actually contains, through eleven named estimators each
 * carrying a hard or soft label, into a posterior whose only published output
 * is an effective candidate count and a claim level, out through the one
 * client-side ceremony by which a shielded balance may legitimately appear, and
 * ends at four calibration cases the graders have to pass.
 *
 * THE SPINE OF THE ARGUMENT IS NEGATIVE. A page that listed techniques without
 * listing their refusals would be marketing for the techniques. So every
 * estimator states what it forbids beside what it permits, every claim level
 * states what it will not license, and the page opens and closes on the same
 * three things no method here can return: a sender or recipient inside the
 * shielded pool, a shielded balance without a key, and an owner for any address
 * not named by consensus rules or by the owner's own filing.
 *
 * PROVENANCE, and the distinction that governs the whole file. Material from
 * `packages/content` - the address labels, the case files - is an external
 * claim and carries the full apparatus: an id, a confidence, a citation.
 * Material from docs/2.0/TRACKING-MATH.md is documentation of this site's own
 * procedure, not a sourced claim about the world, so it is attributed to that
 * document by name and path and is given no `sources[]` entry. Fabricating one
 * would be the precise defect this page exists to argue against.
 *
 * NOTATION. Symbols are written as TRACKING-MATH writes them - `Cand_0`,
 * `N_eff`, `Bal^p`, `10^-4` - rather than with typographic sub- and
 * superscripts. A screen reader announces `N<sub>eff</sub>` as an undivided "N
 * eff", which assertion A4 exists to catch, and the plain form is the same
 * string a reader will find in the specification and in the indexer's source.
 *
 * BLOCK NUMBERING follows TRACKING-MATH's own sections one to one, so a reader
 * holding the document can find the paragraph behind any block. Its sections 2
 * and 3 are one block here because boundary events are only interesting as the
 * exact events the estimates attach to.
 *
 * Zero motion, zero client JavaScript, no charts. The whole argument is carried
 * by tables and prose; the one drawing this method implies - the taint graph -
 * belongs on /flows, where the edges have real weights behind them.
 *
 * ============================================================================
 * CLAIM ORDER (HANDOFF-04b R5), AND WHY THIS PAGE INVERTS THE COLLAPSE RULE
 * ============================================================================
 * The reader's diagnosis - "instead of claim, explanation, evidence,
 * visualization, we get vibes, cryptographic terminology, vibes, huge number,
 * tiny explanation, vibes" - did NOT describe this page. Its dek already opened
 * on a falsifiable sentence, which is why the claim beat below is LIFTED from
 * that dek word for word rather than written: the work here is making the
 * grammar the same as the other seven Record pages, not repairing a defect.
 * The dek's remaining two sentences became the explanation under it, and the
 * dek itself is now `NAV_ENTRIES`' own description of this surface, so the
 * masthead and the site index cannot disagree about what /method is for.
 *
 * THE THREE THAT ARE NEVER COLLAPSED DO NOT EXIST HERE, DELIBERATELY, and the
 * claim beat says so rather than filling them. Material from `packages/content`
 * - the address labels in block 01, the case files in blocks 01 and 06 - is an
 * external claim and carries the full apparatus on its own row, in the open, in
 * every `Cite` summary. Material from docs/2.0/TRACKING-MATH.md is
 * documentation of this site's own procedure; it gets a name and a path and no
 * `sources[]`, and fabricating one would be the precise defect this page exists
 * to argue against. So `PageClaim` takes `status`, which states that condition,
 * and not the three - `docs/2.0/SNAPSHOT.md` section 8.1's rule about absences,
 * applied to epistemic status.
 *
 * AND THE COLLAPSE RULE INVERTS ON THIS SURFACE. It says to collapse the method
 * walk-through; on /method the method walk-through IS the claim, so applying it
 * literally would fold the page's whole argument behind shut triangles. The
 * line drawn instead is REFERENCE against ARGUMENT. Collapsed, in place rather
 * than swept to a working section at the foot of the page, because each one is
 * only legible beside the block that introduces it: the eleven-row estimator
 * table (02-03), the query grid (00) and the posterior's three lines of
 * notation with their symbol table (04). Open: every refusal, every claim
 * level, the hard-to-soft split, the clustering cards, the ceremony and the
 * four golden cases. Each disclosure's summary carries a count derived from the
 * object it is closed over, so the closed state still states the finding.
 */
export default function MethodPage() {
  return (
    <>
      <RecordHead
        idx="06 METHOD"
        kicker="what is exact - what is bounded - what is never claimed"
        title="How the tracking"
        titleAccent="works"
        // The dek is the nav entry's own description of this surface, the same
        // string `metadata.description` already sends. The two sentences that
        // used to be here have not gone: the first is the claim below, the
        // second and third are its explanation. Reading both from one source
        // means the masthead, the site index and the page description cannot
        // drift into three descriptions of one page.
        dek={S?.dek ?? ""}
        aside={
          <Glass>
            <Eyebrow className="mt-card-eyebrow" idx="the four claim levels">
              N_eff = 2^H - thresholds a decade apart on purpose
            </Eyebrow>
            <ClaimLadder />
          </Glass>
        }
      />

      {/* The claim, then the explanation, then the evidence. Both are the dek's
          own sentences, moved rather than rewritten: this page already led with
          an assertion, and a handoff that moves sentences does not restate
          facts. */}
      <PageClaim
        claim={
          <>
            Every number on the Tracking pages is either <b>exact and public</b> or a{" "}
            <b>bound with its assumptions printed beside it</b>, and the two are never allowed to blur into each other.
          </>
        }
        explain={
          <>
            This page is the contract. It sets out the per-pool state machine, the anchor-bounded candidate sets, the
            process-of-elimination toolkit, the posterior and the viewing-key mode - and it says, in plain terms, what no
            method here can return.
          </>
        }
        status={
          <>
            This page states no confidence, no last-verified date and no source count of its own, and the absence is the
            argument rather than a gap. Procedure: <span className="mono">docs/2.0/TRACKING-MATH.md</span>, sections 0 to
            6. Thresholds and the claim-level union: <span className="mono">packages/zec-types/src/analysis.ts</span>.
            Neither is an external source and neither is cited as one - both document this site&apos;s own procedure, and
            fabricating an apparatus for them would be the precise defect this page exists to argue against. The external
            claims this page does render - the address labels, the withdrawal case and the four golden cases below - each
            carry their own confidence, last-verified date and source count in the open, on the row.
          </>
        }
      />

      <Glass className="mt-contract">
        <p className="note measure">
          The mantra has not changed since v0.2: <b>report uncertainty, not identity</b>. The claim level is how that is
          enforced rather than merely asserted - it is computed from the posterior, it caps what any surface is allowed to
          say, and it is the same ladder on every page. The bands above are lower-inclusive: the threshold value stays in
          the tighter level, so <span className="mono">N_eff = 100</span> is{" "}
          <span className="mono">small_heuristic_set</span> and not <span className="mono">broad_candidate_set</span>. They
          are coarse deliberately, coarse enough that a small estimation error cannot move a finding across a category, and
          they are not retuned without calibration data.
        </p>
        <ClaimLadderRefusals />
        {/* The provenance line that stood here has MOVED to the claim beat's
            status strip, verbatim in substance. It was always the answer to
            "where do these thresholds come from and why is there no citation",
            which is the epistemic-status question - and epistemic status
            belongs beside the claim, in the open, not four hundred pixels below
            it where a reader who has already decided the page is unsourced will
            never reach it. */}
      </Glass>

      <Block idx="00" title="What a query can honestly return" right="the address is the unit a reader thinks in; the chain is not built that way">
        <div className="grid g3">
          <Glass>
            <Pill kind="exact" />
            <p className="note" style={{ marginTop: 10 }}>
              Transparent chain data: balances, amounts, heights, counterparties. Arithmetically exact and independently
              checkable against any node.
            </p>
          </Glass>
          <Glass>
            <Pill kind="bounded" />
            <p className="note" style={{ marginTop: 10 }}>
              Shielded activity. An upper bound on a candidate set, never a value and never an owner. A bound that shrinks
              is a bound that bought its reduction with an assumption, and the assumption is printed with it.
            </p>
          </Glass>
          <Glass>
            <Pill kind="undefined" />
            <p className="note" style={{ marginTop: 10 }}>
              Undefined by construction: not derivable from public data at all. Printed as a refusal rather than left
              blank, because a blank cell reads as an oversight and a refusal reads as a finding.
            </p>
          </Glass>
        </div>
        <div style={{ marginTop: 14 }}>
          <MethodQueryTable />
        </div>
      </Block>

      <Block idx="01" title="Transparent side: exact, plus clustering" right="deterministic - the Bitcoin toolkit applies unchanged">
        <MethodClustering />
      </Block>

      <Block
        idx="02-03"
        title="Boundary events, and the estimator toolkit"
        right="every estimator emits an audit record {filter, params, countIn, countOut} - the v0.2 contract, kept verbatim"
      >
        <p className="note measure" style={{ marginBottom: 14 }}>
          For a transaction <i>T</i> and pool <i>p</i>, the public delta <span className="mono">deltaV^p(T)</span> is
          positive when value leaves the pool and negative when it enters. A transparent address <i>a</i> therefore has{" "}
          <b>shield events</b> <span className="mono">S(a) = {"{"}(T, X, h){"}"}</span> and <b>deshield events</b>{" "}
          <span className="mono">D(a) = {"{"}(T, Y, h){"}"}</span>, and both are exact. Everything below is an{" "}
          <i>estimate</i> attached to those exact events - which is why the boundary is the only place the two registers
          are allowed to meet.
        </p>

        <MethodEstimators />

        <p className="note measure" style={{ marginTop: 14 }}>
          {ESTIMATOR_COUNTS.hard} of the {ESTIMATOR_COUNTS.total} hold unconditionally; the other {ESTIMATOR_COUNTS.soft}{" "}
          are behavioural priors a wallet is free to violate. A reader who rejects all {ESTIMATOR_COUNTS.soft} soft ones is
          left with a correct, and much larger, bound - which is the point of separating them.
        </p>

        <div className="grid g2" style={{ marginTop: 18 }}>
          <Glass>
            <Eyebrow className="mt-card-eyebrow" idx="the audit record, rendered">
              illustrative shape, not a real transaction
            </Eyebrow>
            <InferenceChain
              steps={[
                {
                  n: "412,908",
                  what: "raw anchor bound",
                  note: "every commitment at or below the anchor position",
                },
                {
                  n: "18,204",
                  what: "time window",
                  note: "W = 576 blocks, about 12 hours, anchored at heightCreated",
                  cost: "assumes prompt spending",
                },
                {
                  n: "63",
                  what: "amount match",
                  note: "two-sided interval with an explicit fee tolerance",
                  cost: "assumes one matching deposit",
                },
              ]}
              assumption="Drop either soft assumption and the count returns to the line above it. The raw anchor bound is the only step that holds unconditionally, and it is the only number on this chain a reader is obliged to accept."
            />
            <div className="refuses" style={{ marginTop: 12 }}>
              <b>which window produced a number</b>
              <span>
                <span className="mono">W = 576</span> blocks is the specified default. The v0.2 code shipped a 7-day
                window (<span className="mono">MAX_LINK_WINDOW_MS</span>), and the two are not interchangeable, so every
                rendered figure states the window it was taken over rather than leaving a reader to assume one.
              </span>
            </div>
          </Glass>

          <Glass>
            <Eyebrow className="mt-card-eyebrow" idx="why the chain is generated, not narrated">
              the contract behind the picture
            </Eyebrow>
            <Reason
              steps={[
                {
                  n: "01",
                  text: (
                    <>
                      The anchor published with a spend fixes a tree position, and nothing above it can be the spent note.
                      This is the only universally correct filter.
                    </>
                  ),
                },
                {
                  n: "02",
                  text: (
                    <>
                      A time window is a behavioural guess. It is anchored at the height the note was created and it is
                      logged as an assumption, with its parameters; the audit record&apos;s{" "}
                      <span className="mono">time_window</span> variant carries{" "}
                      <span className="mono">windowBlocks</span> and a half-open height range where the lower bound is
                      exclusive and the upper bound is the anchor&apos;s own creation height.
                    </>
                  ),
                },
                {
                  n: "03",
                  text: (
                    <>
                      An amount match intersects two intervals with an explicit fee tolerance. Its audit record carries the
                      matched deposit, both amounts in zatoshi, the tolerance used, and whether the match was exact or
                      fee-tolerant - so a reader can reconstruct the step rather than take it.
                    </>
                  ),
                },
                {
                  n: "04",
                  text: (
                    <>
                      Every estimator is a pure function and emits{" "}
                      <span className="mono">{"{filter, params, countIn, countOut}"}</span> with both counts as{" "}
                      <span className="mono">bigint</span>, so the chain above is generated from the run rather than
                      narrated after it. <span className="mono">rawCount</span> and{" "}
                      <span className="mono">effectiveSetSize</span> are equal when no filter applied, and diverge by
                      exactly what the filters took.
                    </>
                  ),
                },
              ]}
            />
          </Glass>
        </div>
      </Block>

      <Block idx="04" title="Combining estimators: the posterior, the entropy, the claim" right="the number a reader sees is N_eff, never a name">
        <div className="grid g2">
          <MethodPosterior />
          <MethodTaint />
        </div>
      </Block>

      <Block idx="05" title="Mode A: the viewing-key ceremony" right="exact - client-side - the only way a shielded balance appears on this site">
        <MethodCeremony />
      </Block>

      <Block idx="06" title="Calibration, and the golden cases" right="tests the graders must pass before anything ships">
        <MethodGoldenCases />
      </Block>
    </>
  );
}
