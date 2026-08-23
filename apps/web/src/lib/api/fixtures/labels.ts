/**
 * Labels, read from `packages/content` rather than restated here.
 *
 * `labels.json` is the Record's seed and it is the only place an address label
 * is written down. The Instrument reads it through the same loader the Record
 * uses, so a correction to a label lands on both halves of the site at once -
 * which is the lesson HANDOFF-03's gate round 4 paid for, and which CLAUDE.md
 * now states as a rule.
 *
 * The only thing this module adds is the precedence RANK, which CLAUDE.md
 * requires to be displayed with every label and which the seed does not carry
 * as a number. It is derived from the `labeller` value, never from the text.
 */
import { getLabels } from "@zcashreveal/content";
import { LABELLER_RANK, type LabelView } from "@zcashreveal/types";

import { zec } from "./units";

/** One seed record as the Instrument renders it. */
function toView(l: ReturnType<typeof getLabels>[number]): LabelView {
  return {
    address: l.address,
    network: l.network,
    label: l.label,
    labeller: l.labeller,
    rank: LABELLER_RANK[l.labeller],
    method: l.method,
    confidence: l.confidence,
    lastVerified: l.lastVerified,
    sources: [...l.sources],
    balanceZat: l.balanceZec === null ? null : zec(l.balanceZec),
    ...(l.notes === undefined ? {} : { notes: l.notes }),
  };
}

let cache: readonly LabelView[] | undefined;

/** Every label in the seed, in seed order. */
export function labelViews(): readonly LabelView[] {
  cache ??= getLabels().map(toView);
  return cache;
}

/** The label for one address, or null. Never guesses: an unlabelled address is unlabelled. */
export function labelFor(address: string): LabelView | null {
  return labelViews().find((l) => l.address === address) ?? null;
}
