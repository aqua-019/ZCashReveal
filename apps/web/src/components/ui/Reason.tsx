import type { ReactNode } from "react";

export interface ReasonStep {
  readonly n: string;
  readonly text: ReactNode;
}

/**
 * The reasoning panel: a numbered argument behind a displayed number, ruled in
 * gold because it is the boundary between what was observed and what was
 * inferred. Nothing on this site states a bound without one of these nearby.
 */
export function Reason({ steps, label = "Reasoning" }: { readonly steps: readonly ReasonStep[]; readonly label?: string }) {
  return (
    <ol className="reason" data-primitive="Reason" aria-label={label} style={{ listStyle: "none", padding: "0 0 0 14px" }}>
      {steps.map((s) => (
        <li className="r" key={s.n}>
          <span className="n">{s.n}</span>
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}
