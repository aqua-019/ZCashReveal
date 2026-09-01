import Link from "next/link";

import { ZecMark } from "@/components/icons";
import { EpochClock } from "./EpochClock";
import { ScreenDisclosure } from "./ScreenDisclosure";
import { ScreenNav } from "./ScreenNav";
import type { ChainTip } from "@/lib/chain";
import type { SnapshotFault, SnapshotSource } from "@/lib/snapshot/source";

/**
 * The system bar: wordmark, where-you-are, epoch clock, and the screen index
 * behind a disclosure. Sticky, glass-backed, present on every route -
 * assertion A7 checks `[data-ui=sysbar]` on each one.
 *
 * The `<header>` element itself moved into `ScreenDisclosure` in HANDOFF-04a,
 * because the open state has to live on the element the CSS reads. This is
 * still a server component and the markup is still in the static HTML; what
 * changed is that the header hydrates along with the nav and the clock rather
 * than staying inert. That is one more hydration boundary and it buys the only
 * disclosure path a touch device has.
 */
export function SysBar({
  tip,
  status,
}: {
  readonly tip: ChainTip;
  readonly status: { readonly source: SnapshotSource; readonly faults: readonly SnapshotFault[] };
}) {
  return (
    <ScreenDisclosure
      bar={
        <>
          <Link className="wordmark" href="/" aria-label="ZCashReveal home">
            <ZecMark className="z" />
            <span className="name">
              ZCash<em>Reveal</em>
            </span>
            <span className="tag">shielded ≠ silent</span>
          </Link>
          <EpochClock tip={tip} status={status} />
        </>
      }
      panel={
        <div className="navwrap">
          <div className="navinner">
            <ScreenNav />
          </div>
        </div>
      }
    />
  );
}
