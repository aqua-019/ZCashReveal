import { getPhrases, resolveSources, type Phrase } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";

/**
 * Records the corpus says it found no tension in, matched on the FIELD THE CARD
 * PRINTS rather than on a flag the schema does not have.
 *
 * `Phrase` carries no boolean for this: three of the nineteen records say it in
 * prose - "No documented tension; recorded for completeness of the catalogue."
 * - and `P-low-entropy-carrier` is the worked case a later reader can check by
 * eye against its own card. Reading the same string the card renders is what
 * makes the count safe to put in a `<summary>`: the number and the body it
 * summarises come from one source, so a record that changes its wording changes
 * the card in the same place it changes the count, instead of leaving a summary
 * quietly disagreeing with the list under it.
 */
const NO_TENSION = /^\s*no documented tension\b/i;

/**
 * How many catalogued phrases carry a documented tension, and how many are
 * recorded for completeness. Exported because the disclosure that collapses
 * this catalogue on `/network` needs the finding for its closed state, and a
 * count typed in beside the list would be a second source for a quantity the
 * list already carries.
 */
export function phraseTensions(phrases: readonly Phrase[]): { readonly documented: number; readonly none: number } {
  const none = phrases.filter((p) => NO_TENSION.test(p.tension)).length;
  return { documented: phrases.length - none, none };
}

/**
 * The phrase catalogue: what was said, who said it first, and what the record
 * says back.
 *
 * The mockup's chip printed the slogan and its origin and stopped there. This
 * one prints `Phrase.tension` as well, on the same card, because a catalogue of
 * slogans that withholds the objection is a catalogue of slogans - and the
 * objection is the reason the catalogue exists. Sixteen of the nineteen carry a
 * documented tension and three say in the corpus's own words that there is
 * none; those three print too, because a page that only showed the phrases it
 * could argue with would be choosing its evidence. Nine of the sixteen are a
 * flat contradiction rather than a qualification - that is a reading, not a
 * field, so it is NOT what `phraseTensions` counts and it is not what the
 * disclosure's summary states.
 *
 * WHAT IS NOT HERE. Three slogans the brief asked for are in
 * `getUnverified()` - "#ZecToTheMoon", "the privacy layer of the internet" and
 * "the only true private cryptocurrency" - because no first-party use of any of
 * them could be located. They are not rendered anywhere on this site, and the
 * caption says so rather than leaving their absence to be noticed.
 *
 * The mockup also carried two chips with no phrase record at all: Cameron
 * Winklevoss's "encrypted money with provable correctness is unstoppable" and
 * "@cypherpunk: please stop the FUD", both dated 5 Jun 2026. The corpus has a
 * different 5 Jun 2026 Cypherpunk quotation - `P-bug-not-security-failure` -
 * and the summary on `N-cameron-winklevoss` records the provable-correctness
 * post without carrying it as a quotation. Neither mockup chip is drawn: a
 * quotation attributed to a named living person has to match a record exactly.
 *
 * The hover verb is dim and it is pure CSS, applied at the group. There is no
 * JavaScript on this surface and nothing on it animates.
 */

export function NetworkPhrases() {
  const phrases = getPhrases();
  return (
    <div className="nw-phrases">
      {phrases.map((p) => (
        <div className="nw-ph" key={p.id} id={p.id}>
          <span className="nw-text">{p.text}</span>
          <span className="nw-origin">
            {/* `date` is printed as the corpus writes it - "~26 Oct 2025",
                "date not established" - and never normalised into a day the
                research does not have. */}
            {p.date} {"·"} {p.origin}
            {p.amplifiers.length === 0 ? null : (
              <>
                {" "}
                {"·"} amplified by {p.amplifiers.join(", ")}
              </>
            )}
          </span>
          <span className="nw-tension">{p.tension}</span>
          <span className="claim">
            <a className="anchor" href={`/network#${p.id}`}>
              {p.id}
            </a>
            <Cite id={p.id} lastVerified={p.lastVerified} confidence={p.confidence} sources={resolveSources(p.sources)} />
          </span>
        </div>
      ))}
    </div>
  );
}
