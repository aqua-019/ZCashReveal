import type { ReactNode } from "react";

export interface ChainStep {
  /** The candidate count remaining after this step. */
  readonly n: string;
  /** What was applied: "raw anchor bound", "time window", "amount match". */
  readonly what: string;
  /** The qualifier that makes the step honest, if any. */
  readonly note?: string;
  /** What the step costs in assumptions - rendered in the danger register. */
  readonly cost?: string;
}

/**
 * The filter stack, rendered. Each step shows the surviving candidate count and
 * names the assumption it bought that reduction with, so a reader can discount
 * the final figure by the assumptions they reject.
 *
 * This mirrors the FilterApplication audit record every estimator in
 * apps/indexer emits ({filter, params, countIn, countOut}); HANDOFF-04 feeds
 * real records into this component unchanged.
 */
export function InferenceChain({
  steps,
  assumption,
}: {
  readonly steps: readonly ChainStep[];
  readonly assumption?: ReactNode;
}) {
  return (
    <div data-primitive="InferenceChain">
      <ol className="chain" style={{ listStyle: "none", padding: "0 0 0 14px" }}>
        {steps.map((s) => (
          <li className="st" key={s.what}>
            <span className="n">{s.n}</span>
            <span className="w">
              <b>{s.what}</b>
              {s.note === undefined ? null : ` - ${s.note}`}
            </span>
            {s.cost === undefined ? null : <span className="cost">{s.cost}</span>}
          </li>
        ))}
      </ol>
      {assumption === undefined ? null : <p className="assume">{assumption}</p>}
    </div>
  );
}
