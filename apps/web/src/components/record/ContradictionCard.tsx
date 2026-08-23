import { permalink, resolveSources, type Contradiction } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { Conf } from "@/components/ui/Conf";

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
        <Conf level={entry.confidence} />
        <span className="src">last verified {entry.lastVerified}</span>
      </div>

      <div className="claim">
        <a className="anchor" href={permalink(entry.id)}>
          {entry.id}
        </a>
        <Cite id={entry.id} lastVerified={entry.lastVerified} confidence={entry.confidence} sources={sources} />
      </div>
    </article>
  );
}
