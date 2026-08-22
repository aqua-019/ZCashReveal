import type { ReactNode } from "react";

import { Tide } from "@/components/ambience/Tide";
import { SysBar } from "@/components/ui/SysBar";
import { TooltipLayer } from "@/components/ui/Tooltip";
import type { ChainTip } from "@/lib/chain";

import { FooterLedger } from "./FooterLedger";

/**
 * The frame every route renders inside: grain film, the block-arrival tide, the
 * system bar, the content, the footer ledger, and the single shared tooltip.
 *
 * The grain class is applied here rather than through the Grain component so
 * the film covers the full document including the footer; Grain remains
 * available as a standalone primitive for a nested surface that needs its own.
 */
export function Shell({ tip, children }: { readonly tip: ChainTip; readonly children: ReactNode }) {
  return (
    <>
      <Tide />
      <div className="shell grain">
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SysBar tip={tip} />
        <main id="main" className="screen">
          {children}
        </main>
        <FooterLedger tip={tip} />
      </div>
      <TooltipLayer />
    </>
  );
}
