"use client";

import { useId, useState } from "react";

import { IconSearch } from "@/components/icons";

/** What a query string looks like, decided before any lookup is attempted. */
export type QueryKind = "txid" | "address" | "block" | "unknown";

/**
 * Classify a query by shape alone. No network, no guessing at ownership: this
 * only answers "what kind of identifier is this", which is a syntactic
 * question. HANDOFF-04 routes on the answer.
 */
export function classifyQuery(raw: string): QueryKind {
  const q = raw.trim();
  if (q === "") return "unknown";
  if (/^[0-9]{1,9}$/.test(q)) return "block";
  if (/^[0-9a-f]{64}$/i.test(q)) return "txid";
  // t1/t3 transparent, zs1 Sapling, u1 unified, tex1 TEX (ZIP 320).
  if (/^(t1|t3|zs1|u1|tex1)[0-9a-z]{20,}$/i.test(q)) return "address";
  return "unknown";
}

const KIND_LABEL: Record<QueryKind, string> = {
  txid: "txid",
  address: "address",
  block: "height",
  unknown: "unrecognised",
};

/**
 * The Track search field. HANDOFF-01 ships the affordance and the classifier;
 * submission is inert until HANDOFF-04 has routes to submit to, and the field
 * says so rather than failing silently.
 */
export function SearchBar({
  placeholder = "transaction id, address, or block height",
  onSubmitQuery,
}: {
  readonly placeholder?: string;
  readonly onSubmitQuery?: (value: string, kind: QueryKind) => void;
}) {
  const [value, setValue] = useState("");
  const id = useId();
  const kind = classifyQuery(value);

  return (
    <form
      className="search"
      data-primitive="SearchBar"
      data-ui="searchbar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitQuery?.(value.trim(), kind);
      }}
    >
      <span className="ic" aria-hidden="true">
        <IconSearch />
      </span>
      <label htmlFor={id} className="sr-only">
        Search the chain
      </label>
      <input
        id={id}
        name="q"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <span className="kind" data-testid="search-kind">
        {value.trim() === "" ? "any" : KIND_LABEL[kind]}
      </span>
      <button className="go" type="submit">
        Resolve
      </button>
    </form>
  );
}
