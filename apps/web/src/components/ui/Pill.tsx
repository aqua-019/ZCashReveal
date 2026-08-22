/**
 * What kind of number the reader is looking at. This is the site's central
 * epistemic control and it is never optional:
 *   exact     - transparent chain data, arithmetically exact
 *   bounded   - shielded: an upper bound on a candidate set, never a value
 *   label     - an attribution from the label registry, with its provenance
 *   undefined - not derivable from public data; the honest refusal
 */
export type PillKind = "exact" | "bounded" | "label" | "undefined";

const CLASS: Record<PillKind, string> = {
  exact: "pill exact",
  bounded: "pill bounded",
  label: "pill label",
  // `undefined` is a CSS-hostile word on its own; the class is namespaced.
  undefined: "pill undefined-claim",
};

const TEXT: Record<PillKind, string> = {
  exact: "exact",
  bounded: "bounded",
  label: "label",
  undefined: "undefined",
};

export function Pill({ kind, children }: { readonly kind: PillKind; readonly children?: string }) {
  return (
    <span className={CLASS[kind]} data-primitive="Pill" data-kind={kind}>
      {children ?? TEXT[kind]}
    </span>
  );
}
