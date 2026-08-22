import type { ReactNode } from "react";

export interface KVEntry {
  readonly k: string;
  readonly v: ReactNode;
}

/**
 * A dense key/value block in the mono register. `stack` switches to a single
 * column for narrow panels. Rendered as a description list so a screen reader
 * reads the pairing, not two unrelated runs of text.
 */
export function KV({ entries, stack = false }: { readonly entries: readonly KVEntry[]; readonly stack?: boolean }) {
  return (
    <dl className={stack ? "kv stack" : "kv"} data-primitive="KV">
      {entries.map((e) => (
        <div key={e.k} style={{ display: "contents" }}>
          <dt className="k">{e.k}</dt>
          <dd className="v" style={{ margin: 0 }}>
            {e.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
