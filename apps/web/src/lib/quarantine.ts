import { getUnverified } from "@zcashreveal/content";

/**
 * Which surface renders each quarantined claim.
 *
 * `unverified.json` holds 32 records spanning the whole Record, and HANDOFF-03
 * renders them beside the findings they qualify rather than in one list: the
 * flows-related ones on `/flows`, next to the allegations they refuse, and the
 * promotion-network ones on `/network`, under the claims that page would
 * otherwise have carried. That is the right editorial call - a refusal read
 * next to the claim it refuses is worth more than a refusal in an appendix -
 * but it means no single route owns the U- family.
 *
 * `permalink()` in packages/content cannot know this. It maps an id prefix to a
 * route, and the quarantine's route depends on subject, not on prefix. So the
 * split lives here, next to the pages that make it, and both the anchors and
 * the /sources citation index read it from one place. Before this existed the
 * two disagreed and every quarantine citation dead-ended on a page with no such
 * element - found by the security audit at gate round 1.
 *
 * The better long-term shape is a `surface` field on `Unverified`, set by
 * whoever owns packages/content next; recorded in the section 8 ledger.
 */

/**
 * Rendered on /network, under the claims that page does not make. These are the
 * four ids in `DROPPED_IDS` in src/app/network/page.tsx; the two lists have to
 * agree, and `test/unit/quarantine.test.ts` is what makes sure they do.
 */
const ON_NETWORK: readonly string[] = [
  "U-korean-exchange-dominance",
  "U-21shares-zec-etp",
  "U-bot-networks-pumping-zec",
  "U-ecc-zf-layoffs-2023-24",
];

/** Every other quarantined record anchors on /flows. */
export function quarantineHref(id: string): string {
  return `${ON_NETWORK.includes(id) ? "/network" : "/flows"}#${id}`;
}

/** The records a given surface is responsible for anchoring. */
export function quarantineFor(surface: "/flows" | "/network"): readonly string[] {
  const all = getUnverified().map((u) => u.id);
  return surface === "/network" ? all.filter((id) => ON_NETWORK.includes(id)) : all.filter((id) => !ON_NETWORK.includes(id));
}
