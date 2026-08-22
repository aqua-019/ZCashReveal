/**
 * Candidates panel — surfaces a ClaimAssessment as forensic evidence.
 *
 * The visual rhythm encodes the project's epistemic stance: each narrowing
 * costs an assumption. The inference chain reads top-to-bottom as
 * `rawCount [waypoint] → filter [bar] → effectiveCount [waypoint] → ...`,
 * with each filter bar carrying its parameter signature, its candidate
 * cost (−N), and a one-sentence italic gloss explaining the assumption.
 *
 * Used inside LeakPanel's Section 08 ("Anonymity sets"). When
 * SpendAnnotation.assessment is undefined the upstream filter omits the
 * panel — this component never renders an "unknown" state.
 */

import type { ClaimAssessment, ClaimLevel, FilterApplication } from "@zcashreveal/types";
import { IconCandidates, IconFilter } from "./icons";

export interface CandidatesPanelProps {
  assessment: ClaimAssessment;
  /**
   * Optional spend index — when provided, the header shows "SPEND #N".
   * Omit for link-record assessments.
   */
  spendIndex?: number;
}

const CLAIM_LEVEL_LABEL: Record<ClaimLevel, string> = {
  aggregate_only: "aggregate only",
  broad_candidate_set: "broad set",
  small_heuristic_set: "small set",
  requires_disclosure: "requires disclosure",
};

export function CandidatesPanel({ assessment, spendIndex }: CandidatesPanelProps) {
  const accent =
    assessment.pool === "orchard" ? "var(--c-orchard)" : "var(--c-sapling)";

  return (
    <div className="glass rounded-sm p-4">
      <header className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <IconCandidates size={12} style={{ color: accent }} />
          <span
            className="mono text-[10px] lowercase tracking-[0.15em]"
            style={{ color: accent }}
          >
            {assessment.pool}
          </span>
          {spendIndex !== undefined && (
            <span className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
              · spend #{spendIndex}
            </span>
          )}
        </div>
        <ClaimLevelBadge level={assessment.claimLevel} />
      </header>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <HeadlineMetric label="Raw cand" value={formatBig(assessment.rawCount)} />
        <HeadlineMetric
          label="Effective"
          value={formatBig(assessment.effectiveSetSize)}
        />
        <HeadlineMetric
          label="Entropy"
          value={`${assessment.entropyBits.toFixed(2)} bits`}
        />
      </div>

      <div className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)] mb-3">
        Inference chain
      </div>

      <InferenceChain assessment={assessment} />

      {assessment.appliedFilters.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {assessment.appliedFilters.map((f, i) => (
            <p
              key={i}
              className="display-italic text-[13px] text-[var(--color-ink-muted)] leading-snug"
            >
              {assumptionGloss(f)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function HeadlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)] mb-1">
        {label}
      </div>
      <div className="display text-[26px] mono tabular-nums text-ink leading-none">
        {value}
      </div>
    </div>
  );
}

function ClaimLevelBadge({ level }: { level: ClaimLevel }) {
  // Per-level visual encoding — descending epistemic weight.
  switch (level) {
    case "requires_disclosure":
      return (
        <span
          className="pill"
          style={{
            color: "#F2F2F0",
            backgroundColor: "var(--color-critical)",
            borderColor: "var(--color-critical)",
            fontWeight: 700,
          }}
        >
          {CLAIM_LEVEL_LABEL[level]}
        </span>
      );
    case "small_heuristic_set":
      return (
        <span
          className="pill"
          style={{
            color: "#1A1A22",
            backgroundColor: "var(--color-zec-gold)",
            borderColor: "var(--color-zec-gold)",
            fontWeight: 500,
          }}
        >
          {CLAIM_LEVEL_LABEL[level]}
        </span>
      );
    case "broad_candidate_set":
      return (
        <span
          className="pill"
          style={{ color: "var(--color-deposit)", fontWeight: 500 }}
        >
          {CLAIM_LEVEL_LABEL[level]}
        </span>
      );
    case "aggregate_only":
      return (
        <span
          className="pill"
          style={{ color: "var(--color-info)", opacity: 0.7 }}
        >
          {CLAIM_LEVEL_LABEL[level]}
        </span>
      );
  }
}

function InferenceChain({ assessment }: { assessment: ClaimAssessment }) {
  const { rawCount, appliedFilters } = assessment;

  if (appliedFilters.length === 0) {
    return (
      <div className="border-l-2 border-[var(--color-edge-strong)] pl-4 space-y-2">
        <Waypoint count={rawCount} note="raw Cand₀ — no filters applied" />
        <div className="mono text-[10px] text-[var(--color-ink-muted)] italic">
          No filters applied — raw Cand₀ assumes uniform posterior.
        </div>
      </div>
    );
  }

  return (
    <div className="border-l-2 border-[var(--color-edge-strong)] pl-4 space-y-1">
      <Waypoint count={rawCount} note="raw Cand₀" />
      {appliedFilters.map((f, i) => {
        const isLast = i === appliedFilters.length - 1;
        return (
          <div key={i}>
            <FilterBar filter={f} />
            <Waypoint
              count={f.countOut}
              note={isLast ? "final effective set" : `after ${filterShort(f)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function Waypoint({ count, note }: { count: bigint; note: string }) {
  return (
    <div className="flex items-baseline gap-3 -ml-[10px] py-1">
      <span
        className="display text-[20px] mono tabular-nums text-ink leading-none px-1.5"
        style={{ backgroundColor: "var(--color-surface-1)" }}
      >
        {formatBig(count)}
      </span>
      <span className="mono text-[9.5px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">
        {note}
      </span>
    </div>
  );
}

function FilterBar({ filter }: { filter: FilterApplication }) {
  const removed = filter.countIn - filter.countOut;
  return (
    <div className="ml-2 my-1.5 glass p-2.5 rounded-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5">
          <IconFilter size={10} className="text-[var(--color-zec-gold)]" />
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-ink">
            {filter.filter.replace(/_/g, " ")}
          </span>
        </span>
        <span className="mono text-[10px] tabular-nums text-[var(--color-withdrawal)]">
          −{formatBig(removed)}
        </span>
      </div>
      <div className="mono text-[9.5px] text-[var(--color-ink-muted)] break-words">
        {filterParams(filter)}
      </div>
    </div>
  );
}

function filterShort(f: FilterApplication): string {
  if (f.filter === "time_window") return "time-window narrowing";
  return "amount-match narrowing";
}

function filterParams(f: FilterApplication): string {
  if (f.filter === "time_window") {
    return `W=${f.params.windowBlocks} blocks · range (${f.params.lowHeight.toLocaleString()} , ${f.params.highHeight.toLocaleString()}]`;
  }
  const tol = Number(f.params.toleranceZat) / 100_000_000;
  return `${f.params.matchKind} · deposit at h=${f.params.matchedDepositHeight.toLocaleString()} · Δ ${tol.toFixed(4)} ZEC tolerance`;
}

function assumptionGloss(f: FilterApplication): string {
  if (f.filter === "time_window") {
    const hours = Math.round((f.params.windowBlocks * 2.5) / 60);
    return `Assumes: spender received the note within ~${hours}h of proving against the anchor at height ${f.params.highHeight.toLocaleString()}.`;
  }
  if (f.params.matchKind === "EXACT") {
    return `Assumes: this unshielding consumes the note created by the matched shielding deposit at height ${f.params.matchedDepositHeight.toLocaleString()}, with exact amount match.`;
  }
  const tol = Number(f.params.toleranceZat) / 100_000_000;
  return `Assumes: this unshielding consumes the note from a shielding deposit at height ${f.params.matchedDepositHeight.toLocaleString()}, within ${tol.toFixed(4)} ZEC fee tolerance.`;
}

function formatBig(n: bigint): string {
  return n.toLocaleString();
}
