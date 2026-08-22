"use client";

import { useEffect, useState } from "react";

import type { ChainTip } from "@/lib/chain";
import { fmtTipTime } from "@/lib/chain";
import { fmtBlockAge, fmtInt } from "@/lib/format";
import { seedLabel } from "@/lib/seed";

/**
 * The epoch clock: the site keeps time in blocks, not in seconds.
 *
 * Height advancing is *information*, so it is not gated on reduced motion - a
 * reader who suppresses animation still needs to know the chain moved. The
 * ceremony that accompanies it (the luminance tide) is the part that is gated,
 * and it lives in components/ambience/Tide.tsx.
 *
 * `blockIntervalMs` stands in for the block feed until HANDOFF-11 wires the
 * WebSocket; the component's contract does not change when it does.
 */
export function EpochClock({ tip, blockIntervalMs = 75_000 }: { readonly tip: ChainTip; readonly blockIntervalMs?: number }) {
  const [height, setHeight] = useState(tip.height);

  useEffect(() => {
    setHeight(tip.height);
    const id = setInterval(() => {
      setHeight((h) => h + 1);
    }, blockIntervalMs);
    return () => {
      clearInterval(id);
    };
  }, [tip.height, blockIntervalMs]);

  return (
    <div className="clock" aria-live="polite" data-primitive="EpochClock" data-ui="epochclock">
      <span className="dot" aria-hidden="true" />
      <span>
        block{" "}
        <span className="h" data-testid="epoch-height">
          {fmtInt(height)}
        </span>
      </span>
      <span className="age">
        {fmtBlockAge(tip.snapshotAgeBlocks)} - seed {seedLabel(tip.hash)}
      </span>
      <span className="age">{fmtTipTime(tip.timeMs)}</span>
    </div>
  );
}
