/**
 * Right-aligned severity stamp — large italic display label tinted by
 * SEVERITY_COLOR with a "SEVERITY" small-caps mono caption above.
 * Used in LeakPanel.Headline; M6 lifts it out of LeakPanel.tsx so future
 * surfaces can reuse it without re-importing the private implementation.
 */

import type { Severity } from "@zcashreveal/types";
import { SEVERITY_COLOR, SEVERITY_LABEL } from "../../lib/tokens";

export interface SeverityBadgeProps {
  severity: Severity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <div
      className="flex flex-col items-end gap-1 shrink-0"
      style={{ color: SEVERITY_COLOR[severity] }}
    >
      <span className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
        Severity
      </span>
      <span className="display-italic text-[36px] leading-none">
        {SEVERITY_LABEL[severity]}
      </span>
    </div>
  );
}
