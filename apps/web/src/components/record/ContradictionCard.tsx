import { requirePermalink, resolveSources, type Contradiction } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";

/**
 * One contradiction: what was said, and what the record shows.
 *
 * The pairing is the whole argument, so it is drawn as a pair - the claim in
 * the display register behind a quiet rule, the chain's answer behind the
 * danger rule, on the one surface where the danger register is allowed to be
 * loud. `.contra`, `.side`, `.said`, `.shows` and `.lbl` are all defined in
 * globals.css and are used unchanged.
 *
 * The card head is `title`, which the corpus writes short. The body is
 * `claim`, which it writes long and as close to verbatim as the research
 * recorded it - including its own quotation marks, which is why nothing here
 * adds any.
 *
 * The id is on the article, so `/contradictions#C9` lands on the whole pairing
 * rather than on its heading. `Glass` cannot carry an id, so the two classes it
 * would have applied are written out.
 *
 * THE FOOT CARRIES WHAT THE CLOSED CITATION DOES NOT (HANDOFF-04b, rule R4).
 * It used to print the publishers, the confidence AND the last-verified date,
 * and `Cite`'s summary one line below prints the confidence and the date again
 * with the panel still shut - so a reader met the same two facts twice, inches
 * apart, and neither instance was the citation. The duplicates are gone and the
 * facts are not: the grade and the date are read once, off the citation that
 * owns them. What stays here is the one thing the closed citation cannot show -
 * WHO published the evidence, where the citation carries only how many.
 */
export function ContradictionCard({ entry }: { readonly entry: Contradiction }) {
  const sources = resolveSources(entry.sources);
  return (
    <article className="glass card cx-card" id={entry.id}>
      <h3 className="cx-t">{entry.title}</h3>

      <div className="side">
        <div className="said">
          <span className="lbl">the claim</span>
          {entry.claim}
        </div>
        <div className="shows">
          <span className="lbl">what the record shows</span>
          {entry.reality}
        </div>
      </div>

      <div className="cx-foot">
        <span className="src">{sources.map((s) => s.publisher).join(" · ")}</span>
      </div>

      <div className="claim">
        <a className="anchor" href={requirePermalink(entry.id)}>
          {entry.id}
        </a>
        <Cite id={entry.id} lastVerified={entry.lastVerified} confidence={entry.confidence} sources={sources} />
      </div>
    </article>
  );
}
