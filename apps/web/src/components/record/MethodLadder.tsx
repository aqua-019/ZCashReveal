import type { ClaimLevel } from "@zcashreveal/types";

import { Chip } from "@/components/ui/Chip";

/**
 * The four claim levels, as a ladder.
 *
 * This is the site's output vocabulary. Every bounded number ZECReveal
 * publishes is capped by one of these four words, and the cap is computed, not
 * chosen: the posterior gives `H`, then `N_eff = 2^H`, then the level follows
 * from `N_eff` by the thresholds below.
 *
 * The bands are printed as explicit inequalities rather than as ranges because
 * the boundary is lower-inclusive and a range hides which end that is. The rule
 * in apps/indexer/src/analysis/claim-classifier.ts is that the threshold value
 * stays in the tighter level: `N_eff = 100` is `small_heuristic_set`, not
 * `broad_candidate_set`. Ten is `requires_disclosure`. Zero is too.
 *
 * The thresholds are a decade apart on purpose and coarse on purpose - coarse
 * enough that a small estimation error cannot bump a finding across a
 * category. ZECREVEAL-2.0-PLAN.md section 2 states the rule for changing them:
 * "do not retune without calibration data".
 *
 * PROVENANCE. The four names are the `ClaimLevel` union in
 * `packages/zec-types`; the thresholds are the doc comment directly above it,
 * restated in `docs/2.0/TRACKING-MATH.md` section 4. Neither is in
 * `packages/content`: they document this site's own procedure rather than an
 * external claim, so they carry a document reference and not a fabricated
 * `sources[]` entry.
 *
 * The union is IMPORTED, not restated. HANDOFF-03 restated it here because
 * `@zcashreveal/types` was not then a dependency of `apps/web`, and recorded
 * that as an assumption; LEDGER-03 fold 1 makes the package a dependency and
 * this the import. Two copies of a four-value union is exactly the shape of
 * defect the de-duplication pass in this same handoff exists to remove, and a
 * claim level is a worse thing to have two copies of than a CSS rule: the site
 * caps every bounded number it publishes with one of these four words, and a
 * fifth word appearing in one file and not the other would be a claim nobody
 * had agreed to.
 */
export type { ClaimLevel };

interface Rung {
  readonly level: ClaimLevel;
  /** The band, with the inclusive end explicit. */
  readonly range: string;
  /** What the level permits. */
  readonly permits: string;
  /** What it forbids. Never omitted - a level that states only its licence is a licence. */
  readonly refuses: string;
  readonly tone: "ok" | "gold" | "warn" | "danger";
}

/**
 * Read down the key column and this is the scale; read down the chip column and
 * it is the ramp, green to red. Nothing is drawn: there is no axis and no bar,
 * because four numbers a decade apart do not need a picture.
 */
const RUNGS: readonly Rung[] = [
  {
    level: "aggregate_only",
    range: "N_eff > 1,000",
    permits: "private under any practical adversary; publishable as a distribution or a public aggregate",
    refuses: "no per-transaction origin statement of any kind - the answer is that the origin is unresolved",
    tone: "ok",
  },
  {
    level: "broad_candidate_set",
    range: "100 < N_eff <= 1,000",
    permits: "a wide window: a bound worth reporting, with the window it was taken over",
    refuses: "names no candidate, and a bound is never a link",
    tone: "gold",
  },
  {
    level: "small_heuristic_set",
    range: "10 < N_eff <= 100",
    permits: "reportable with the heuristics cited: the filter chain and the assumption sentences render beside the number",
    refuses: "the number may not be published without the chain that produced it",
    tone: "warn",
  },
  {
    level: "requires_disclosure",
    range: "N_eff <= 10",
    permits: "nothing on its own; acting on it needs one disclosure-backed signal from outside the chain",
    refuses: "an external signal from a name is still not a name - at N_eff = 1 this site claims no identity either",
    tone: "danger",
  },
];

/**
 * The amber rung has no chip tone in the component layer, which ships gold,
 * danger, ok and blue. Painting it gold would give two adjacent claim levels the
 * same colour and the ramp would stop carrying information; `--warn` is already
 * a design token, so the fifth step costs nothing new. The rule is
 * `.chip.mt-warn` in globals.css, route layer /method. It wears the chip class but not
 * `data-primitive="Chip"`, because it is not that component and the primitive
 * audit surface should not be told otherwise.
 */
function LevelChip({ tone, children }: { readonly tone: Rung["tone"]; readonly children: string }) {
  if (tone === "warn") {
    return (
      <span className="chip mt-warn" data-tone="warn">
        {children}
      </span>
    );
  }
  return <Chip tone={tone}>{children}</Chip>;
}

/**
 * The ladder as a description list: the band is the term, the level and its
 * licence are the definition. `KV` is the right primitive but it types `k` as a
 * string and right-aligns the value column for figures, so the list is written
 * against the same `.kv` classes with the `.mt-ladder` modifier.
 */
export function ClaimLadder() {
  return (
    <dl className="kv mt-ladder">
      {RUNGS.map((r) => (
        <div key={r.level} style={{ display: "contents" }}>
          <dt className="k">{r.range}</dt>
          <dd className="v" style={{ margin: 0 }}>
            <LevelChip tone={r.tone}>{r.level}</LevelChip>
            <span>{r.permits}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The other half of the ladder, and the half a marketing version of this page
 * would leave out: what each level forbids. It is set at the same size as the
 * licence it qualifies, because a refusal in smaller type is a refusal being
 * hidden.
 */
export function ClaimLadderRefusals() {
  return (
    <div className="refuses">
      <b>what each level forbids</b>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {RUNGS.map((r) => (
          <li key={r.level} style={{ marginBottom: 4 }}>
            <span className="mono">{r.level}</span> - {r.refuses}
          </li>
        ))}
      </ul>
    </div>
  );
}
