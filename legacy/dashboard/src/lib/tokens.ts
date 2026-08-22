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

export const LEAK_CLASS_COLOR: Record<LeakClass, string> = {
  PURE_SHIELDED: "var(--color-pure)",
  T_TO_Z: "var(--color-deposit)",
  Z_TO_T: "var(--color-withdrawal)",
  MIXED: "var(--color-medium)",
  MIGRATION_S2O: "var(--color-migration)",
  COINBASE_SHIELDED: "var(--color-low)",
  FULLY_TRANSPARENT: "var(--color-transparent)",
};

export const LEAK_CLASS_LABEL: Record<LeakClass, string> = {
  PURE_SHIELDED: "z → z",
  T_TO_Z: "t → z",
  Z_TO_T: "z → t",
  MIXED: "mixed",
  MIGRATION_S2O: "S → O",
  COINBASE_SHIELDED: "coinbase",
  FULLY_TRANSPARENT: "transparent",
};

export const LEAK_CLASS_DESCRIPTION: Record<LeakClass, string> = {
  PURE_SHIELDED: "Pure intra-pool shielded transaction",
  T_TO_Z: "Transparent to shielded — deposit, transparent side fully public",
  Z_TO_T: "Shielded to transparent — withdrawal, transparent side fully public",
  MIXED: "Mixed pool transaction — partial t↔z boundary crossing",
  MIGRATION_S2O: "Sapling to Orchard pool migration",
  COINBASE_SHIELDED: "Miner shielded coinbase output",
  FULLY_TRANSPARENT: "No shielded components — all data public",
};
