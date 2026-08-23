/**
 * `window.__zr` - the instrumentation HANDOFF-01 assertion A5 reads.
 *
 * The reduced-motion contract is architectural: an animation system must not be
 * *constructed* when the user asks for reduced motion, not merely damped to
 * zero amplitude. That is unobservable from the outside - a stopped animation
 * and an absent one look identical - so the ambience components report what
 * they scheduled, and the assertion checks the report.
 *
 * Present only where `DEV_SURFACES` is true (see lib/env.ts). In a deployed
 * build the counters are never installed and nothing on `window` is touched.
 */

import { DEV_SURFACES } from "./env";

export interface ZrDiagnostics {
  /** requestAnimationFrame callbacks scheduled by ambience components. */
  rafCalls: number;
  /** Times the Tide ceremony has applied its class. */
  tidePulses: number;
  /** Ambience systems that decided to construct themselves, by name. */
  constructed: string[];
  /** Ambience systems that refused to construct, by name, with the reason. */
  refused: Record<string, string>;
}

declare global {
  interface Window {
    __zr?: ZrDiagnostics;
  }
}

function store(): ZrDiagnostics | null {
  if (!DEV_SURFACES || typeof window === "undefined") return null;
  window.__zr ??= { rafCalls: 0, tidePulses: 0, constructed: [], refused: {} };
  return window.__zr;
}

/** Called once per animation frame an ambience component actually schedules. */
export function countRaf(): void {
  const s = store();
  if (s) s.rafCalls += 1;
}

/** Called each time the block-arrival ceremony fires. */
export function countTidePulse(): void {
  const s = store();
  if (s) s.tidePulses += 1;
}

/** Called when an ambience system builds its loop. */
export function noteConstructed(name: string): void {
  const s = store();
  if (s && !s.constructed.includes(name)) s.constructed.push(name);
}

/** Called when an ambience system declines to build its loop, with the reason. */
export function noteRefused(name: string, reason: string): void {
  const s = store();
  if (s) s.refused[name] = reason;
}
