import {
  getBeware,
  getCases,
  getContradictions,
  getLabels,
  getNetwork,
  getPhrases,
  getStats,
  getTimeline,
  getUnverified,
  permalink,
  type SourceRef,
} from "@zcashreveal/content";

/**
 * The citation graph: which claim cites which source.
 *
 * `sources.json` is the whole bibliography - the union of every URL in the four
 * research dossiers, 328 of them - and not merely what the Record happens to
 * cite. L2 ruled on that shape deliberately (LEDGER-02 Q2): a reader who wants
 * to audit a claim the Record did NOT make should still find the source. But it
 * means a flat list of 328 links tells the reader nothing about which of them
 * carries an argument, so `/sources` renders two labelled groups and states the
 * size of each.
 *
 * This module is what separates them. It walks every collection that carries a
 * `sources[]` and inverts it, so the page can show, next to each cited source,
 * exactly which claims rest on it - which is the more useful direction: a
 * source is interesting because of what was built on it.
 */

export interface Citation {
  /** The claim id, e.g. "B2", "T2026-06-04", "N-grayscale". */
  readonly id: string;
  /** Where it renders. */
  readonly href: string;
  /** Which collection it came from, for the reader's orientation. */
  readonly collection: string;
}

/** Every source id the Record cites, mapped to the claims citing it. */
export type CitationIndex = ReadonlyMap<SourceRef, readonly Citation[]>;

/**
 * A claim id whose permalink family is known, or a fallback. `permalink` throws
 * on an unrecognised id rather than guessing, which is the right behaviour for
 * a permalink and the wrong behaviour for an index that must not take the page
 * down over one malformed seed.
 */
function hrefFor(id: string, fallback: string): string {
  try {
    return permalink(id);
  } catch {
    return fallback;
  }
}

let cache: CitationIndex | undefined;

export function citationIndex(): CitationIndex {
  if (cache !== undefined) return cache;

  const index = new Map<SourceRef, Citation[]>();
  const add = (refs: readonly SourceRef[], citation: Citation): void => {
    for (const ref of refs) {
      const list = index.get(ref);
      if (list === undefined) index.set(ref, [citation]);
      else if (!list.some((c) => c.id === citation.id)) list.push(citation);
    }
  };

  const network = getNetwork();

  for (const e of getBeware()) add(e.sources, { id: e.id, href: hrefFor(e.id, "/beware"), collection: "beware" });
  for (const c of getContradictions())
    add(c.sources, { id: c.id, href: hrefFor(c.id, "/contradictions"), collection: "contradictions" });
  for (const t of getTimeline()) add(t.sources, { id: t.id, href: hrefFor(t.id, "/timeline"), collection: "timeline" });
  for (const n of network.entities) add(n.sources, { id: n.id, href: hrefFor(n.id, "/network"), collection: "network" });
  for (const e of network.edges) add(e.sources, { id: e.id, href: hrefFor(e.id, "/network"), collection: "network" });
  for (const p of getPhrases()) add(p.sources, { id: p.id, href: hrefFor(p.id, "/network"), collection: "phrases" });
  for (const l of getLabels()) add(l.sources, { id: l.id, href: hrefFor(l.id, "/flows"), collection: "labels" });
  for (const k of getCases()) add(k.sources, { id: k.id, href: hrefFor(k.id, "/flows"), collection: "cases" });
  // The quarantine is rendered too: an unverified item is published AS
  // unverified, with the reason, and a source cited in support of a refusal is
  // still a source the Record uses.
  for (const u of getUnverified()) add(u.sources, { id: u.id, href: hrefFor(u.id, "/flows"), collection: "unverified" });
  add(getStats().sources, { id: "stats", href: "/#pools", collection: "stats" });

  cache = index;
  return index;
}
