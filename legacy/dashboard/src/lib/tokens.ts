/**
 * TS-side mirror of CSS color variables for inline styles + conditionals.
 */

import type { Severity, LeakClass } from "@zcashreveal/types";

export const SEVERITY_COLOR: Record<Severity, string> = {
  INFO: "var(--color-info)",
  LOW: "var(--color-low)",
  MEDIUM: "var(--color-medium)",
  HIGH: "var(--color-high)",
  CRITICAL: "var(--color-critical)",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MED",
  HIGH: "HIGH",
  CRITICAL: "CRIT",
};

/*
 * THIS APP IS RETIRED AND THESE THREE MAPS ARE KEPT COMPILING, NOT MAINTAINED.
 *
 * legacy/dashboard is v0.2, parked read-only by HANDOFF-00 and switched off at
 * the HANDOFF-11 cutover. It is still in the workspace, so it is still in
 * `pnpm typecheck`, and `Record<LeakClass, string>` means every widening of
 * that union lands here as a build failure. HANDOFF-06 added MIGRATION_O2I and
 * HANDOFF-07 added UNSUPPORTED_TX; the entries below are the minimum that keeps
 * the workspace building. The tripwire has now caught two widenings, which is
 * the argument for leaving it exactly as it is.
 *
 * The O2I colour deliberately reuses the migration token rather than taking a
 * new one: this app is not getting a design pass, and inventing a colour here
 * would put a fifth pool-ish token into a palette nobody is going to reconcile.
 * UNSUPPORTED_TX reuses the medium token for the same reason.
 *
 * ITS DESCRIPTION IS THE ONE ENTRY THAT HAD TO BE WRITTEN CAREFULLY, because
 * `LEAK_CLASS_DESCRIPTION` is reader-facing prose in a shipped string. Every
 * other member of the union describes a FLOW; this one describes the decoder's
 * refusal to read a transaction, so a description written to match the pattern
 * ("... transaction") would characterise a flow nobody measured. It says what
 * happened instead.
 */
export const LEAK_CLASS_COLOR: Record<LeakClass, string> = {
  PURE_SHIELDED: "var(--color-pure)",
  T_TO_Z: "var(--color-deposit)",
  Z_TO_T: "var(--color-withdrawal)",
  MIXED: "var(--color-medium)",
  MIGRATION_S2O: "var(--color-migration)",
  MIGRATION_O2I: "var(--color-migration)",
  COINBASE_SHIELDED: "var(--color-low)",
  FULLY_TRANSPARENT: "var(--color-transparent)",
  UNSUPPORTED_TX: "var(--color-medium)",
};

export const LEAK_CLASS_LABEL: Record<LeakClass, string> = {
  PURE_SHIELDED: "z → z",
  T_TO_Z: "t → z",
  Z_TO_T: "z → t",
  MIXED: "mixed",
  MIGRATION_S2O: "S → O",
  MIGRATION_O2I: "O → I",
  COINBASE_SHIELDED: "coinbase",
  FULLY_TRANSPARENT: "transparent",
  UNSUPPORTED_TX: "not decoded",
};

export const LEAK_CLASS_DESCRIPTION: Record<LeakClass, string> = {
  PURE_SHIELDED: "Pure intra-pool shielded transaction",
  T_TO_Z: "Transparent to shielded — deposit, transparent side fully public",
  Z_TO_T: "Shielded to transparent — withdrawal, transparent side fully public",
  MIXED: "Mixed pool transaction — partial t↔z boundary crossing",
  MIGRATION_S2O: "Sapling to Orchard pool migration",
  MIGRATION_O2I: "Orchard to Ironwood pool migration (ZIP 318)",
  COINBASE_SHIELDED: "Miner shielded coinbase output",
  FULLY_TRANSPARENT: "No shielded components — all data public",
  UNSUPPORTED_TX:
    "Transaction version or bundle shape the decoder does not model — nothing about this transaction was measured",
};
