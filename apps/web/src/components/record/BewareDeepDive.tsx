import { requirePermalink, resolveSources, type BewareEntry, type TimelineEvent } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { Working } from "@/components/record/Working";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";

/**
 * B2 in full: the two lines of Rust, and the nine days.
 *
 * The left card is a diagram made of text - removed lines in danger, added
 * lines in ok, framing comments in muted ink - and the right card is a
 * register of the corpus's own timeline rows for the same window. Neither is a
 * chart: there is no axis here, and the four years between the first step and
 * the second are deliberately not encoded in the spacing.
 *
 * PROVENANCE. `bewareEntrySchema` has no patch field, so the diff below is not
 * loaded from the corpus. The two removed lines are the assignment
 * `B2.rootCause` names, at the file and lines it names; the three added lines
 * are the shape of the constraint that was missing, reconstructed from that
 * description rather than copied from the upstream commit, and the card says
 * so in as many words. The nine steps, by contrast, are real timeline rows,
 * each with its own id, confidence and citation.
 *
 * BOTH ARE THE WORKING, SO BOTH ARE COLLAPSED (HANDOFF-04b R4). A diff and a
 * nine-row register are a derivation and a method walk-through - the two things
 * the collapse rule names - and they were the first thing under this block's
 * heading, which is the "huge number, tiny explanation" order the redesign was
 * commissioned to fix. What is NOT collapsed is the argument beside them: what a
 * turnstile bounds, and B2's own confidence, date, sources and citation. Each
 * summary carries a count derived from the array it discloses, so a summary
 * cannot disagree with the body under it.
 */

/** The file and lines `B2.rootCause` names. Not a separate corpus field. */
const SITE = "halo2_gadgets/src/ecc/chip/mul/incomplete.rs · L309-310";

type PatchKind = "c" | "del" | "add";

/**
 * The diff, line by line, with the register each line is set in. `c` is a
 * framing comment, `del` is what was there, `add` is the constraint that was
 * not. There is no hunk header: five lines changed, and a `@@` would imply a
 * line range this reconstruction does not have.
 */
const PATCH: readonly { readonly kind: PatchKind; readonly text: string }[] = [
  { kind: "c", text: "// the incomplete double-and-add loop kept the base constant across rows via q_mul_2," },
  { kind: "c", text: "// but never tied it to the real base point g_d - the base was free." },
  { kind: "del", text: '- region.assign_advice(|| "x_p", self.double_and_add.x_p, row + offset, || x_p)?;' },
  { kind: "del", text: '- region.assign_advice(|| "y_p", self.y_p,                 row + offset, || y_p)?;' },
  { kind: "add", text: "+ if row == 0 {" },
  { kind: "add", text: '+     region.copy_advice(|| "base", self.base, 0, self.double_and_add.x_p, row)?;' },
  { kind: "add", text: "+ }" },
  { kind: "c", text: "// consequence: pk_d = [ivk]·g_d was never enforced, so the same note stays" },
  { kind: "c", text: "// spendable under fresh nullifiers. Consensus only rejects repeated ones." },
];

export function BewareDeepDive({
  entry,
  steps,
}: {
  readonly entry: BewareEntry;
  readonly steps: readonly TimelineEvent[];
}) {
  const sources = resolveSources(entry.sources);
  // Counted from `PATCH` rather than typed beside it: the summary states how
  // many lines the panel holds while it is shut, and a literal there could
  // disagree with the array under it.
  const removed = PATCH.filter((l) => l.kind === "del").length;
  const added = PATCH.filter((l) => l.kind === "add").length;

  return (
    <div className="bw-detail">
      <Glass>
        <Eyebrow idx="root cause">{SITE}</Eyebrow>

        <div style={{ marginTop: 10 }}>
          <Working
            title="The missing constraint, as a diff"
            finding={`${PATCH.length} lines, ${removed} removed`}
          >
            {/* tabIndex only, and no aria-label: the block scrolls sideways, so it
                needs a tab stop (axe: scrollable-region-focusable), and the summary
                above already names it. aria-label on an element with no role is
                prohibited, and repeating the name would announce it twice. */}
            <pre className="code" style={{ marginTop: 14 }} tabIndex={0}>
              {PATCH.map((line) => (
                <span className={`bw-${line.kind}`} key={line.text}>
                  {line.text}
                  {"\n"}
                </span>
              ))}
            </pre>

            <p className="note">
              The {removed} removed lines are the assignment the root cause names, at the file and lines it names. The{" "}
              {added} added lines are the <i>shape</i> of the constraint that was missing, reconstructed from that
              description rather than copied from the upstream commit.
            </p>
          </Working>
        </div>

        <p className="note" style={{ marginTop: 12 }}>
          ZIP 209 rejects any block that would drive a pool&apos;s balance below zero, so what a pool can pay out is
          bounded by what provably entered it. That is the layer at which the 21 million cap held. It says nothing about
          which notes inside the pool were real: forged and legitimate notes are indistinguishable once they are in, so
          the value a counterfeiter could have realised would have come out of <i>other holders</i>, not out of new
          supply. Both readings - unlimited counterfeit, and the cap intact - are true, at different layers.
        </p>

        <p className="src" style={{ marginTop: 10 }}>
          {sources.map((s) => s.publisher).join(" · ")}
        </p>

        <div className="claim">
          <a className="anchor" href={requirePermalink(entry.id)}>
            {entry.id}
          </a>
          <Cite
            id={entry.id}
            lastVerified={entry.lastVerified}
            confidence={entry.confidence}
            sources={sources}
          />
        </div>
      </Glass>

      <Glass>
        <Eyebrow idx="timeline">patched before it was told</Eyebrow>

        <Working title="How it was found and patched" finding={`${steps.length} steps, each cited`}>
          <div className="bw-steps" style={{ marginTop: 6 }}>
            {steps.map((step) => {
              // The corpus prints its own dates and this renders them verbatim:
              // `date` is a sort key, and two of these nine rows are ranges the
              // research does not resolve to a day (HANDOFF-03, assertion A11).
              const loud = step.category === "EXPLOIT";
              return (
                <div className="bw-step" key={step.id}>
                  <span className="bw-w">{loud ? <b>{step.dateText}</b> : step.dateText}</span>
                  <span>
                    <b>{step.title}</b>
                    {step.summary === step.title ? null : <> {step.summary}</>}
                    <span className="claim">
                      <a className="anchor" href={requirePermalink(step.id)}>
                        {step.id}
                      </a>
                      <Cite
                        id={step.id}
                        lastVerified={step.lastVerified}
                        confidence={step.confidence}
                        sources={resolveSources(step.sources)}
                      />
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

        </Working>

        {/* OUTSIDE the disclosure, and that is the point: this paragraph states
            what the corpus does NOT carry. An absence behind a toggle is the
            null-panel-renders-as-zero defect in a nicer coat, the same clause
            that keeps confidence and last-verified in the open - so the reader
            learns what the register omits without having to open it, and the
            closed control is not the only thing in this card. */}
        <p className="note" style={{ marginTop: 14 }}>
          The register holds the corpus&apos;s own timeline rows for this window and nothing else: the confirmation on
          30 May and the private coordination with miners and exchanges on 31 May are not separate rows in it - they are
          recorded inside B2&apos;s own account, opposite. Block heights appear inside the {steps.length} steps in the
          rows&apos; own wording, because the timeline&apos;s height field is unset on all of them.
        </p>
      </Glass>
    </div>
  );
}
