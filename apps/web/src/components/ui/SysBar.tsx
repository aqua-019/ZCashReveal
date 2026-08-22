import Link from "next/link";

import { ZecMark } from "@/components/icons";
import { EpochClock } from "./EpochClock";
import { ScreenNav } from "./ScreenNav";
import type { ChainTip } from "@/lib/chain";

/**
 * The system bar: wordmark, screen list, epoch clock. Sticky, glass-backed,
 * present on every route - assertion A7 checks `[data-ui=sysbar]` on each one.
 *
 * A server component holding two client children, so the bar itself is in the
 * static HTML and only the nav's active state and the clock's tick hydrate.
 */
export function SysBar({ tip }: { readonly tip: ChainTip }) {
  return (
    <header className="sysbar" role="banner" data-primitive="SysBar" data-ui="sysbar">
      <Link className="wordmark" href="/" aria-label="ZCashReveal home">
        <ZecMark className="z" />
        <span className="name">
          ZCash<em>Reveal</em>
        </span>
        <span className="tag">shielded is not silent</span>
      </Link>
      <ScreenNav />
      <EpochClock tip={tip} />
    </header>
  );
}
