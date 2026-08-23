"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { countTidePulse, noteConstructed, noteRefused } from "@/lib/diagnostics";

/**
 * The one ceremony (DGIGA LAW-15, D3628): a slow luminance tide on block
 * arrival. Nothing else on this site animates on its own.
 *
 * Under prefers-reduced-motion the interval is never created and the `.on`
 * class is never applied - the ceremony does not exist rather than existing at
 * zero amplitude. Assertion A5 fast-forwards 90 s of clock (more than one
 * `periodMs`) and requires the class never to appear.
 *
 * `periodMs` stands in for the block feed. HANDOFF-11 replaces the interval
 * with the WebSocket's block event; `pulse()` is already the whole contract.
 *
 * SCOPED TO THE SPLASH. `Shell` mounts this once for the whole document, which
 * put the ceremony on every Record page too - and HANDOFF-03 section 3 is
 * explicit that Record pages are zero-motion "except the Splash fog/tide".
 * Assertion A6 did not catch it, because it reads `document.getAnimations()`
 * shortly after load and the tide first pulses 75 seconds in: the assertion was
 * passing while the page still animated. Found by design review at gate round 1.
 * The component now renders nothing off `/`, so there is no element to animate
 * rather than an element that is animated quietly.
 */

const DEFAULT_PERIOD_MS = 75_000;
const PULSE_MS = 2_600;

export function Tide({
  periodMs = DEFAULT_PERIOD_MS,
  always = false,
}: {
  readonly periodMs?: number;
  /**
   * Render regardless of route. Only the dev-gated primitive gallery sets it:
   * that page exists to mount every primitive once, and a component that
   * renders nothing off `/` would otherwise be the one primitive it cannot
   * show. Nothing in the published site passes it.
   */
  readonly always?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const isSplash = always || pathname === "/";

  useEffect(() => {
    if (!isSplash) {
      noteRefused("Tide", "the block-arrival ceremony is scoped to the splash");
      return;
    }

    const el = ref.current;
    if (el === null) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      noteRefused("Tide", "prefers-reduced-motion: reduce");
      return;
    }

    noteConstructed("Tide");

    let off: ReturnType<typeof setTimeout> | undefined;

    const id = setInterval(() => {
      const node = ref.current;
      if (node === null) return;
      countTidePulse();
      node.classList.add("on");
      off = setTimeout(() => {
        node.classList.remove("on");
      }, PULSE_MS);
    }, periodMs);

    return () => {
      clearInterval(id);
      if (off !== undefined) clearTimeout(off);
      ref.current?.classList.remove("on");
    };
  }, [periodMs, isSplash]);

  if (!isSplash) return null;

  return <div ref={ref} className="tide" aria-hidden="true" data-primitive="Tide" data-ui="tide" />;
}
