"use client";

import { useEffect, useState } from "react";

import type { ChainTip } from "@/lib/chain";
import { fmtTipTime } from "@/lib/chain";
import { fmtInt, fmtSnapshotAge } from "@/lib/format";
import { seedLabel } from "@/lib/seed";
import { onTip } from "@/lib/api/tip-bus";
import {
  snapshotAgeBlocks,
  SNAPSHOT_FALLBACK_MARKER,
  type SnapshotFault,
  type SnapshotSource,
} from "@/lib/snapshot/source";

/**
 * The epoch clock, and beside it the staleness indicator.
 *
 * The site keeps time in blocks, not in seconds. Height advancing is
 * *information*, so it is not gated on reduced motion - a reader who suppresses
 * animation still needs to know the chain moved. The ceremony that accompanies
 * it (the luminance tide) is the part that is gated, and it lives in
 * components/ambience/Tide.tsx.
 *
 * THE FAKE ADVANCE IS GONE, AND DELETING IT IS A CORRECTION RATHER THAN A
 * REMOVAL. This component used to increment the height on a local 75-second
 * interval - `blockIntervalMs`, described in its own docblock as standing in
 * "for the block feed until HANDOFF-11 wires the WebSocket". Against a fixture
 * that is a manufactured measurement: the clock told every visitor the chain
 * had advanced when no block had arrived and no feed existed. The height now
 * moves only when a `tip` frame says so, which in fixture mode is never, and
 * the `aria-live` this component's own comment promised "once the event is
 * real" is on the height span because the event now is.
 *
 * THE STALENESS INDICATOR IS HERE BECAUSE FOLD 2 OF THE L2 RESOLUTION FOR
 * HANDOFF-04b PUTS IT HERE: "the system bar, beside the epoch clock. It is a
 * property of the DOCUMENT, not of any panel, and the bar is the one surface
 * every route carries." It is in this component rather than a sibling so that
 * the bar holds ONE client island with ONE frame subscription: the age is the
 * difference between the tip the clock knows and the height the document
 * describes, so a second island would need the same subscription to compute it.
 */
export function EpochClock({
  tip,
  status,
}: {
  readonly tip: ChainTip;
  readonly status: { readonly source: SnapshotSource; readonly faults: readonly SnapshotFault[] };
}) {
  const [height, setHeight] = useState(tip.height);

  useEffect(() => {
    setHeight(tip.height);
    // ONE SUBSCRIPTION FOR THE WHOLE DOCUMENT, through the tip bus, which opens
    // nothing outside live mode: the committed FixtureStream emits no `tip`
    // frame at all, so a fixture clock stands still - the honest reading of a
    // fixture. The bus is also where the ONLY-FORWARD rule lives, so no
    // consumer has to remember it: a `tip` frame naming a lower height is a
    // reorg or a late-delivered frame, and a clock running backwards would
    // render a chain reorganisation as a clock fault.
    //
    // `height` IS DELIBERATELY NOT A DEPENDENCY. The updater below reads the
    // current value through setState's function form, so the effect does not
    // need it - and listing it would detach and re-attach on every block.
    return onTip((t) => {
      setHeight((h) => (t.height > h ? t.height : h));
    });
  }, [tip.height]);

  const age = snapshotAgeBlocks(tip.height, height);

  return (
    <div className="clock" data-primitive="EpochClock" data-ui="epochclock">
      <span className="dot" aria-hidden="true" />
      <span>
        block{" "}
        <span className="h" data-testid="epoch-height" aria-live="polite">
          {fmtInt(height)}
        </span>
      </span>
      {/*
        THE STALENESS INDICATOR. `data-marker` is what carries
        SNAPSHOT_FALLBACK_MARKER into the client bundle, which is what the
        post-deploy smoke job greps for: the marker and the machinery ship
        together or neither does.

        `data-source` is the machine-readable half of the same statement the
        text makes, so an assertion reads an attribute rather than parsing prose
        - and the text is still there, because a reader is owed the sentence.
      */}
      <span
        className="stale"
        data-ui="staleness"
        data-source={status.source}
        data-marker={SNAPSHOT_FALLBACK_MARKER}
        data-faults={status.faults.length}
      >
        {fmtSnapshotAge(age)} · source: {status.source}
        {status.faults.length > 0 ? (
          // A CONFIGURED RUNG THAT DID NOT ANSWER IS NAMED, WHICH IS ASSERTION
          // A13. Section 3: an assertion here "must fail when the FIRST source
          // is unreachable, not merely when the last one is". A resolution that
          // walked past a configured managed store and rendered `source:
          // fixture` with no further word is a stale site that renders and
          // reports no fault - the failure this whole read path exists against.
          <>
            {" · "}
            <b className="stale-fault">
              {status.faults.length} source{status.faults.length === 1 ? "" : "s"} did not answer:{" "}
              {status.faults.map((f) => `${f.rung} - ${f.reason}`).join("; ")}
            </b>
          </>
        ) : null}
      </span>
      <span className="age">seed {seedLabel(tip.hash)}</span>
      <span className="age">{fmtTipTime(tip.timeMs)}</span>
    </div>
  );
}
