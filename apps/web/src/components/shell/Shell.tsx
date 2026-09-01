import type { ReactNode } from "react";

import { BlockArrival } from "@/components/ambience/BlockArrival";
import { Grain } from "@/components/ambience/Grain";
import { Tide } from "@/components/ambience/Tide";
import { SysBar } from "@/components/ui/SysBar";
import { TooltipLayer } from "@/components/ui/Tooltip";
import type { ChainTip } from "@/lib/chain";
import type { SnapshotFault, SnapshotSource } from "@/lib/snapshot/source";

import { FooterLedger } from "./FooterLedger";

/**
 * The frame every route renders inside: grain film, the block-arrival tide, the
 * system bar, the content, the footer ledger, and the single shared tooltip.
 *
 * Everything here is a SINGLETON. Grain, Tide, SysBar and TooltipLayer are each
 * mounted exactly once, for the whole document, and a page must never mount its
 * own. Two Grains stack two full-viewport films; two Tides are two block-arrival
 * ceremonies on one surface, which the design system forbids outright; two
 * SysBars are two role="banner" landmarks, the second nested inside <main>.
 */
export function Shell({
  tip,
  status,
  children,
}: {
  readonly tip: ChainTip;
  readonly status: { readonly source: SnapshotSource; readonly faults: readonly SnapshotFault[] };
  readonly children: ReactNode;
}) {
  return (
    <>
      <BlockArrival />
      <Tide />
      <Grain>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SysBar tip={tip} status={status} />
        <main id="main" className="screen">
          {children}
        </main>
        <FooterLedger status={status} />
      </Grain>
      <TooltipLayer />
    </>
  );
}
