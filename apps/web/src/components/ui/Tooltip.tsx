"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * One tooltip for the whole document, following the pointer.
 *
 * Harvested from the mockup's `bindTips`: a single fixed element is moved to
 * the cursor rather than a per-element popup being mounted. Two reasons it
 * stays that way here - a table of 800 mempool rows must not mount 800
 * listeners' worth of React state, and a single element cannot produce two
 * overlapping tips.
 *
 * `TooltipLayer` mounts once in the shell and listens at the document level for
 * anything carrying `data-tip`. `Tooltip` is the ergonomic wrapper that puts
 * the attribute on its child.
 *
 * Accessibility: the tip is decoration over content that must already be
 * legible without it. The wrapper mirrors the text into `title` so keyboard and
 * screen-reader users get the same string; nothing is tooltip-only.
 */

const OFFSET = 14;
const TIP_MAX_W = 320;
const FLIP_MARGIN = 80;

export function TooltipLayer() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    function place(e: MouseEvent): void {
      const tip = ref.current;
      if (tip === null) return;
      const x = Math.min(e.clientX + OFFSET, window.innerWidth - TIP_MAX_W);
      const y = e.clientY + OFFSET;
      tip.style.left = `${Math.max(8, x)}px`;
      tip.style.top = `${y + FLIP_MARGIN > window.innerHeight ? e.clientY - 60 : y}px`;
    }

    function nearestTip(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null;
      const found = target.closest("[data-tip]");
      return found instanceof HTMLElement ? found : null;
    }

    function onMove(e: MouseEvent): void {
      const host = nearestTip(e.target);
      if (host === null) {
        setText(null);
        return;
      }
      setText(host.dataset["tip"] ?? null);
      place(e);
    }

    function onLeave(): void {
      setText(null);
    }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("scroll", onLeave, { passive: true });

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("scroll", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="tip"
      role="presentation"
      data-ui="tooltip-layer"
      style={{ display: text === null ? "none" : "block" }}
    >
      {text}
    </div>
  );
}

/**
 * Wrap content that should carry a pointer tooltip. The text is plain, not
 * markup: a tooltip that needs formatting is a panel wearing a disguise.
 */
export function Tooltip({ text, children }: { readonly text: string; readonly children: ReactNode }) {
  return (
    <span data-primitive="Tooltip" data-tip={text} title={text}>
      {children}
    </span>
  );
}
