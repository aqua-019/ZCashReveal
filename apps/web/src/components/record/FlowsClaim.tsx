import { permalink, resolveSources, type Confidence, type SourceRef } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { Chip } from "@/components/ui/Chip";
import { Conf } from "@/components/ui/Conf";

/**
 * The claim apparatus, in the one shape this page uses everywhere.
 *
 * HANDOFF-03 section 3 requires that every rendered claim show its id, its
 * confidence and a citation popover. The timeline page writes that out inline;
 * /flows renders somewhere near forty claims, so it is a component here, and it
 * adds two things the timeline does not need.
 *
 * The first is `also`: several renderings on this page rest on more than one
 * record - a custody statement that is two network entities, a card that is a
 * case and a label. Each id gets its own anchor to its own home page, and the
 * confidence passed in is the weaker of the ones combined, never the stronger.
 *
 * The second is `unbound`. Most of what /flows argues is carried by
 * `packages/content` and is schema-validated. A minority - the rich list, the
 * labelling-infrastructure survey, the exchange-reserve provider table, the
 * Grayscale holdings series, the Form 144 counts - exists only in
 * docs/2.0/research/04-exchange-inflows-insider-selling.md, which has the
 * primary sources but no collection in the package yet. Those render with their
 * sources attached like everything else and carry an `unbound` chip, so a
 * reader can see which figures the schema has checked and which it has not.
 * Their ids are the `R-` family, which `permalink()` does not route: they are
 * page-local, so every one passes `href` explicitly.
 */
export function FlowsClaim({
  id,
  also,
  href,
  confidence,
  lastVerified,
  sources,
  unbound = false,
}: {
  readonly id: string;
  /** Further ids this rendering rests on. Each is anchored to its own page. */
  readonly also?: readonly string[];
  /** Where this id lives. Required for the page-local `R-` family. */
  readonly href?: string;
  readonly confidence: Confidence;
  readonly lastVerified: string;
  readonly sources: readonly SourceRef[];
  /** True where the figures come from research 04 rather than a validated record. */
  readonly unbound?: boolean;
}) {
  const path = href ?? permalink(id);
  return (
    <span className="claim">
      <a className="anchor" href={path}>
        {id}
      </a>
      {(also ?? []).map((other) => (
        <a className="anchor" key={other} href={permalink(other)}>
          {other}
        </a>
      ))}
      <Conf level={confidence} />
      {unbound ? (
        <Chip title="Stated and sourced by the 22 August 2026 research pass, but not yet carried as a schema-validated record in packages/content.">
          unbound
        </Chip>
      ) : null}
      {sources.length === 0 ? (
        // A quarantine record may legitimately carry no source - the schema
        // allows it, and for an unlocatable claim the absence is the finding.
        // `Cite` reads an empty source list as a seed that has drifted from the
        // schema, which is the right reading everywhere except here, so the
        // reason is stated in place of the popover. A record that declares
        // sources and resolves none still goes through `Cite` and still gets
        // that warning, because there it would be true.
        <span className="fl-attrib">
          no source: nothing could be located to cite, which is why the record is quarantined
        </span>
      ) : (
        <Cite
          id={id}
          {...(href === undefined ? {} : { href })}
          lastVerified={lastVerified}
          confidence={confidence}
          sources={resolveSources(sources)}
        />
      )}
    </span>
  );
}
