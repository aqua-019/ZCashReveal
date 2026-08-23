/**
 * Amounts, stamps and the small pieces every Tracking surface repeats.
 *
 * Server components, all of them, and all pure. The point of collecting them
 * here is that a zatoshi is formatted in exactly one place: `zatToZecGrouped`
 * is the shared formatter and it never floats a value, and every sign, every
 * pill and every claim chip below reads from a DTO field rather than from a
 * caller's judgement about what a number means.
 */
import type { ReactNode } from "react";

import type { Exactness, Stamp } from "@zcashreveal/types";

import { Pill } from "@/components/ui/Pill";
import { zatToZecGrouped } from "@/lib/format";

/**
 * A signed ZEC amount. `+` is rendered explicitly for a credit, because a
 * column of unsigned numbers next to a column of negative ones reads as a
 * mistake rather than as a direction.
 */
export function Zec({ zat, note, signed = true }: { readonly zat: bigint; readonly note?: string; readonly signed?: boolean }) {
  const positive = zat > 0n;
  const body = zatToZecGrouped(zat < 0n ? -zat : zat, 8);
  const sign = !signed ? "" : positive ? "+" : zat < 0n ? "-" : "";
  return (
    <span className={`tk-amt ${positive ? "pos" : "neg"}`}>
      {sign}
      {body}
      {note === undefined ? null : <small>{note}</small>}
    </span>
  );
}

/** A ZEC amount with no sign and no colour: a balance, a total, a threshold. */
export function Plain({ zat, digits = 4 }: { readonly zat: bigint; readonly digits?: number }) {
  return <span className="tk-amt">{zatToZecGrouped(zat, digits)}</span>;
}

/**
 * A date, rendered as its own text.
 *
 * This component exists so that no page can format a `sortMs` by accident. It
 * takes a `Stamp` and prints `stamp.text`, full stop - there is no code path
 * through it that turns a number into a date (LEDGER-02 Q3, LEDGER-03 fold 2).
 * `data-precision` is on the element so the assertion suite can check that no
 * row coarser than a day rendered one.
 */
export function When({ stamp }: { readonly stamp: Stamp }) {
  return (
    <span className="mono" data-stamp data-precision={stamp.precision}>
      {stamp.text}
    </span>
  );
}

/** The exactness pill, straight from the DTO field. */
export function Exact({ kind, children }: { readonly kind: Exactness; readonly children?: string }) {
  return <Pill kind={kind === "undefined" ? "undefined" : kind} {...(children === undefined ? {} : { children })} />;
}

/** A shortened hex identifier, with the full value available to a reader who wants it. */
export function Hexish({ value, lead = 8 }: { readonly value: string; readonly lead?: number }) {
  return <span title={value}>{value.length > lead + 4 ? `${value.slice(0, lead)}...` : value}</span>;
}

/** A severity chip. The vocabulary is the DTO's; this only paints it. */
export function Sev({ level }: { readonly level: "INFO" | "LOW" | "MED" | "HIGH" }) {
  return (
    <span className={`tk-sev ${level}`} data-sev={level}>
      {level}
    </span>
  );
}

/** A labelled figure with a caption, used where a `Metric` would be too loud. */
export function Figure({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <div className="eyebrow">
        <b>{label}</b>
      </div>
      {children}
    </div>
  );
}
