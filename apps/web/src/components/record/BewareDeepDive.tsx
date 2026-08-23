import { permalink, resolveSources, type BewareEntry, type TimelineEvent } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
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

  return (
    <div className="bw-detail">
      <Glass>
        <Eyebrow idx="root cause">{SITE}</Eyebrow>

        {/* tabIndex only, and no aria-label: the block scrolls sideways, so it
            needs a tab stop (axe: scrollable-region-focusable), and the eyebrow
            above already names it. aria-label on an element with no role is
            prohibited, and repeating the name would announce it twice. */}
        <pre className="code" style={{ marginTop: 10 }} tabIndex={0}>
          {PATCH.map((line) => (
            <span className={`bw-${line.kind}`} key={line.text}>
              {line.text}
              {"\n"}
            </span>
          ))}
        </pre>

        <p className="note" style={{ marginTop: 12 }}>
          The two removed lines are the assignment the root cause names, at the file and lines it names. The three added
          lines are the <i>shape</i> of the constraint that was missing, reconstructed from that description rather than
          copied from the upstream commit.
        </p>

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
          <a className="anchor" href={permalink(entry.id)}>
            {entry.id}
          </a>
          <Cite
            id={entry.id}
            lastVerified={entry.lastVerified}
            confidence={entry.confidence}
            sources={sources}
          />
          <span className="src">last verified {entry.lastVerified}</span>
        </div>
      </Glass>

      <Glass>
        <Eyebrow idx="timeline">patched before it was told</Eyebrow>

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
                    <a className="anchor" href={permalink(step.id)}>
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

        <p className="note" style={{ marginTop: 12 }}>
          The confirmation on 30 May and the private coordination with miners and exchanges on 31 May are not separate
          rows in the corpus timeline; they are recorded inside B2&apos;s own account, opposite. Block heights appear
          here in the rows&apos; own wording because the timeline&apos;s height field is unset on all nine of them.
        </p>
      </Glass>
    </div>
  );
}
