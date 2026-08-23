/**
 * Labels and cases, read from `packages/content` rather than restated.
 *
 * `labels.json` and `cases.json` are the Record's seeds and are the only place
 * these facts are written down. The gateway reads them through the same loaders
 * the Record uses, so a correction lands on both halves of the site at once -
 * the lesson HANDOFF-03's gate round 4 paid for and CLAUDE.md now states as a
 * rule. `apps/web/src/lib/api/fixtures/labels.ts` does exactly this on the
 * fixture side; the two agree because they read the same file, not because
 * anyone keeps them agreeing.
 *
 * The only thing added here is the precedence RANK, which CLAUDE.md requires to
 * be displayed with every label and which the seed does not carry as a number.
 * It is derived from `labeller`, never from the text.
 */
import { getCases, getLabels } from "@zcashreveal/content";
import { LABELLER_RANK, type CaseView, type LabelView } from "@zcashreveal/types";

import { stampFromIso } from "./stamp.js";

const ZAT_PER_ZEC = 100_000_000n;

/**
 * A decimal ZEC string from the seed to zatoshi, exactly.
 *
 * By string arithmetic, never by multiplying a float: `78183.4093 * 1e8` is
 * 7818340929999.999 in IEEE 754, and the lockbox balance is the one number on
 * this site that assertion A2 pins to the zatoshi.
 */
function zecToZat(amount: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(amount);
  if (m === null) throw new Error(`labels: not a ZEC amount with at most 8 decimals: "${amount}"`);
  const [, sign, whole, frac = ""] = m;
  const zat = BigInt(whole as string) * ZAT_PER_ZEC + BigInt(frac.padEnd(8, "0"));
  return sign === "-" ? -zat : zat;
}

let labelCache: readonly LabelView[] | undefined;

export function labelViews(): readonly LabelView[] {
  labelCache ??= getLabels().map((l): LabelView => ({
    address: l.address,
    network: l.network,
    label: l.label,
    labeller: l.labeller,
    rank: LABELLER_RANK[l.labeller],
    method: l.method,
    confidence: l.confidence,
    lastVerified: l.lastVerified,
    sources: [...l.sources],
    balanceZat: l.balanceZec === null ? null : zecToZat(l.balanceZec),
    ...(l.notes === undefined ? {} : { notes: l.notes }),
  }));
  return labelCache;
}

/** The label for one address, or null. Never guesses: an unlabelled address is unlabelled. */
export function labelFor(address: string): LabelView | null {
  return labelViews().find((l) => l.address === address) ?? null;
}

let caseCache: readonly CaseView[] | undefined;

export function caseViews(): readonly CaseView[] {
  caseCache ??= getCases().map((k): CaseView => ({
    id: k.id,
    title: k.title,
    summary: k.summary,
    steps: k.steps.map((s) => ({
      stamp: stampFromIso(s.time),
      height: s.height ?? null,
      from: s.from,
      to: s.to,
      amountZat: zecToZat(s.amount),
      note: s.note,
      txid: s.txid ?? null,
    })),
    verdict: k.verdict,
    confidence: k.confidence,
    sources: [...k.sources],
    lastVerified: k.lastVerified,
  }));
  return caseCache;
}
