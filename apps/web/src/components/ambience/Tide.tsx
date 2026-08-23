"use client";

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
 */

const DEFAULT_PERIOD_MS = 75_000;
const PULSE_MS = 2_600;

export function Tide({ periodMs = DEFAULT_PERIOD_MS }: { readonly periodMs?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
  }, [periodMs]);

  return <div ref={ref} className="tide" aria-hidden="true" data-primitive="Tide" data-ui="tide" />;
}
