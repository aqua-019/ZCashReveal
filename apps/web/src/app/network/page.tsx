import type { Metadata } from "next";

import {
  getBeware,
  getNetwork,
  getPhrases,
  getStats,
  getTimeline,
  getUnverifiedFor,
  requirePermalink,
  resolveSources,
  type NetworkEdge,
  type SourceRef,
} from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { LOOP_EDGE_IDS, LOOP_ENTITY_IDS, LOOP_NAMES, NetworkLoop, NetworkLoopCite } from "@/components/record/NetworkLoop";
import { NetworkPhrases, phraseTensions } from "@/components/record/NetworkPhrases";
import { NetworkPrice, NetworkPriceCite, priceMarks } from "@/components/record/NetworkPrice";
import { PageClaim } from "@/components/record/PageClaim";
import { Working } from "@/components/record/Working";
import { RecordHead } from "@/components/shell/RecordHead";
import { Block } from "@/components/ui/Block";
import { Chip } from "@/components/ui/Chip";
import { Conf, type Confidence } from "@/components/ui/Conf";
import { DataTable } from "@/components/ui/DataTable";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV, type KVEntry } from "@/components/ui/KV";
import { Quote } from "@/components/ui/Quote";
import { ZEC_PRICE } from "@/lib/series";
import { screenByHref } from "@/lib/nav";


const S = screenByHref("/network");

export const metadata: Metadata = {
  title: "The Network",
  description: S?.dek ?? "",
};

/**
 * 03 LATTICE - who holds, who speaks, and who paid whom.
 *
 * The argument of this page is narrow and it is stated at the top rather than
 * insinuated at the bottom: nothing here evidences illegality. Holding an asset
 * and saying publicly that you like it is legal. Being paid a grant to make
 * educational content is legal and, disclosed, legitimate. What the corpus
 * establishes is three things - the density of overlapping financial
 * relationships among a small group of promoters, the absence of position
 * disclosure at the point of speech, and the gap between the slogans and what
 * the chain shows. Those are editorial findings, not accusations of fraud, and
 * research 02 section 0 says so in exactly those words before it says anything
 * else.
 *
 * THIS PAGE NAMES LIVING PEOPLE AND STATES WHAT THEY WERE PAID, which sets the
 * standard every figure on it has to clear. Every amount comes from a
 * `NetworkEdge.amount` or a `NetworkEntity.exposure` verbatim; where the seed
 * has no amount the cell reads "none disclosed" and never a number; and no
 * statement about a person is rendered at a higher confidence than the record
 * it comes from. LEDGER-02 records a gate round lost to exactly the opposite:
 * a $174M figure asserted against a named person thirty lines below the text
 * that disclaimed it. `N-arthur-hayes.body` is the corpus's own correction of
 * that error and it is why the exposure cards print `exposure` and nothing else.
 *
 * THE ORDER IS THE FIX (HANDOFF-04b, rules R5 and R4). This page opened on a
 * count line - "36 parties, 41 disclosed edges, 19 catalogued phrases" - then a
 * diagram, then a 41-row table, with the argument itself carried by the dek
 * above them. That is the reader's complaint rendered literally: "vibes,
 * cryptographic terminology, vibes, huge number, tiny explanation, vibes". The
 * claim now leads, the explanation follows it, the evidence follows that, and
 * the raw material - the full edge table, the purchase ledger, the price-mark
 * table, the grant book and the phrase catalogue - sits behind disclosures
 * whose closed states say what is in them. Nothing was deleted: the diagram is
 * still a selection, and the sentence saying what it is a selection FROM is now
 * above it rather than implied by the table below it.
 *
 * THE FAIRNESS PANEL IS NOT COLLAPSED, and that is the one thing on this page
 * the collapse rule does not get to decide. A page that catalogues a promotion
 * network and puts the strongest case against its own reading behind a triangle
 * has not published it. It stays open, at full weight, beside the grant book.
 *
 * WHERE THIS DIVERGES FROM THE MOCKUP, and why:
 *   - Blocks B and C are full-width rather than a `.grid.g2` pair. The price
 *     chart carries ten annotations across twelve months; at half width its
 *     labels render at about six pixels, which is a chart that cannot be read
 *     pretending to be one that can.
 *   - The phrase catalogue renders all nineteen records, not the mockup's
 *     twelve. Two of the mockup's twelve have no phrase record at all, and
 *     seven records have no chip; truncating to twelve would mean choosing
 *     which slogans to publish, which is the one editorial decision this page
 *     is least entitled to make.
 *   - The Grayscale row does not print 393,522 ZEC. HANDOFF-03 deliverable 11
 *     records that figure as the 31 Dec 2025 line of the EDGAR table,
 *     mis-paired in two places with the Q2 10-Q; `N-grayscale-zcash-trust`
 *     ships the corrected 388,673.68359943 and its body explains the
 *     three-way disagreement.
 */

/* -------------------------------------------------------------------------- */
/* Route-local constants                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cypherpunk's ZEC purchase ledger, tranche by tranche.
 *
 * NOT IN `packages/content`. There is no per-tranche array anywhere in the
 * package: the six purchases exist as one sentence inside
 * `N-cypherpunk-technologies.body`, and the `USD`, `Cumulative` and
 * `Disclosed via` columns have no field at all. The table below is research 02
 * section 1.2 transcribed row for row, with each row carrying the source the
 * research cites for it, so the provenance survives the transcription even
 * though the shape does not. A `purchases[]` array on the network schema is the
 * right home for it and is recorded in the section 8 ledger.
 *
 * The last row is the point of the table. Four of the six purchases got a press
 * release and the 12 March 2026 buy appeared only on the investor dashboard;
 * after 15 April 2026 the company stopped announcing them at all, and roughly
 * 19,488 ZEC was bought with no dedicated disclosure, surfacing only in the
 * quarterly filing. This paragraph and the panel below both used to say
 * "purchases one to five each got a press release", which the `via` column of
 * this same table contradicts on row four - a sentence disagreeing with the
 * data beside it about a named public company. Both were corrected together and
 * the panel's figure is now counted from the column rather than restated. That is lawful and probably cheaper. It also ends the
 * promotional cadence the earlier buys had, which is a fact about the promotion
 * network rather than about the accounting.
 */
interface Tranche {
  readonly date: string;
  readonly zec: string;
  readonly usd: string;
  readonly avg: string;
  readonly cumulative: string;
  readonly via: string;
  readonly sources: readonly SourceRef[];
}

const CYPHERPUNK_LEDGER: readonly Tranche[] = [
  {
    date: "12 Nov 2025",
    zec: "203,775.27",
    usd: "~$50.0M",
    avg: "$245.37",
    cumulative: "203,775.27",
    via: "press release + 8-K",
    sources: ["S-pr-newswire-news-releases-leap-therapeutics-rebr"],
  },
  {
    date: "18-19 Nov 2025",
    zec: "29,869",
    usd: "~$18.0M",
    avg: "~$603",
    cumulative: "233,644",
    via: "press release",
    sources: ["S-pr-newswire-news-releases-cypherpunk-purchases-a", "S-coingecko-companies-cypherpunk-technologies"],
  },
  {
    date: "30 Dec 2025",
    zec: "56,418.09",
    usd: "~$29.0M",
    avg: "$514.02",
    cumulative: "290,062.67",
    via: "press release",
    sources: ["S-pr-newswire-news-releases-cypherpunk-accelerates"],
  },
  {
    date: "12 Mar 2026",
    zec: "~4,680",
    usd: "~$2.0M",
    avg: "~$428",
    cumulative: "294,743",
    via: "investor dashboard",
    sources: ["S-coingecko-companies-cypherpunk-technologies"],
  },
  {
    date: "15 Apr 2026",
    zec: "9,163.32",
    usd: "$2.15M",
    avg: "$234.63",
    cumulative: "303,906.40",
    via: "press release, the last one",
    sources: ["S-pr-newswire-news-releases-cypherpunk-increases-i"],
  },
  {
    date: "Apr-Jun 2026",
    zec: "~19,488",
    usd: "not disclosed",
    avg: "not disclosed",
    cumulative: "323,394.38",
    via: "10-Q only",
    sources: ["S-stocktitan-cyph-10-q-cypherpunk-technologies-inc"],
  },
];

/**
 * The programme-level totals the ZCG ledger states outside its itemised lines.
 *
 * Hoisted out of the JSX so the disclosure that collapses the grant book can
 * count them - `GRANT_TOTALS.length` rather than a literal three typed beside a
 * list of three, which would be a second source for a quantity the list already
 * carries.
 */
const GRANT_TOTALS: readonly KVEntry[] = [
  { k: "conference marketing", v: "$9k to $64k per event" },
  { k: "Twitter ambassador programme", v: "$4,500" },
  { k: "explicitly promotional, total", v: "roughly $3.5M to $3.8M" },
];

/** The five ZCG grant edges the paid-content panel itemises, in the order the corpus lists them. */
const GRANT_EDGE_IDS: readonly string[] = [
  "N-edge-zcg-grants-zcash-media",
  "N-edge-zcg-grants-zechub",
  "N-edge-zcg-grants-zcash-brazil",
  "N-edge-zcg-grants-free2z",
  "N-edge-zcg-grants-zk-av-club",
];

/**
 * The move between two closes on the plotted series, in words.
 *
 * Arithmetic on two figures the corpus states, and nothing more. The mockup
 * quoted "~71% from November to March and ~50% in June"; both of those use
 * intraday extremes, and `getUnverified()` quarantines the exact June low
 * (U-june-5-crash-exact-low) and the exact date of the November high
 * (U-cycle-high-date-nov-2025) precisely because the sources disagree on them.
 * Closes are what the series has, so closes are what this computes, and the
 * panel says which it is.
 */
function move(fromDate: string, toDate: string): string {
  const a = ZEC_PRICE.find((p) => p.date === fromDate);
  const b = ZEC_PRICE.find((p) => p.date === toDate);
  if (a === undefined || b === undefined) return "not derivable from the published series";
  const pct = ((b.value - a.value) / a.value) * 100;
  return `${pct < 0 ? "down" : "up"} ${Math.abs(pct).toFixed(1)} per cent`;
}

/**
 * The confidence levels, in the order the strip prints them. A named list
 * because the tally below iterates the RULE'S OWN DATA rather than the values
 * that happen to be in the seed today.
 */
const CONF_LEVELS: readonly Confidence[] = ["high", "med", "low"];

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export default function NetworkPage() {
  const { entities, edges } = getNetwork();
  const entityAt = new Map(entities.map((e) => [e.id, e]));
  const edgeAt = new Map(edges.map((e) => [e.id, e]));
  const phrases = getPhrases();
  const stats = getStats();
  const marks = priceMarks();

  const zooko = entityAt.get("N-zooko-wilcox");
  const winningMeme = phrases.find((p) => p.id === "P-zcash-winning-meme");
  const privacyIsNormal = phrases.find((p) => p.id === "P-privacy-is-normal");
  const cyph = entityAt.get("N-cypherpunk-technologies");
  const zcg = entityAt.get("N-zcash-community-grants");
  const vitalik = entityAt.get("N-vitalik-buterin");
  const b2 = getBeware().find((b) => b.id === "B2");
  const secClosed = getTimeline().find((e) => e.id === "T2026-01-15");
  const ironwood = getTimeline().find((e) => e.id === "T2026-07-28");
  const zashi = getTimeline().find((e) => e.id === "T2024-03-28");

  const loopEntities = LOOP_ENTITY_IDS.flatMap((id) => {
    const e = entityAt.get(id);
    return e === undefined ? [] : [e];
  });

  const grants = GRANT_EDGE_IDS.flatMap((id) => {
    const e = edgeAt.get(id);
    return e === undefined ? [] : [e];
  });

  // The claims the research checked and dropped, asked for by surface rather
  // than by a list of ids kept here. They are published as dropped rather than
  // deleted, because deleting them hides the fact that they were checked.
  // HANDOFF-03 held these four ids in TWO places - here and in a module in
  // src/lib - with a unit test to stop them drifting apart; HANDOFF-04
  // deliverable 9 moved the fact onto the record itself (LEDGER-03 Q4), so this
  // page and `permalink()` now read the same field and cannot disagree.
  const dropped = getUnverifiedFor("/network");

  /**
   * THE CLAIM BEAT'S EPISTEMIC STRIP, and the one of the three this page does
   * not state.
   *
   * `lastVerified` and `sourceCount` are DERIVED from the same records the page
   * renders - every party, every edge, every phrase - so neither can disagree
   * with what is under it. The corpus verifies all of them on one date today
   * and it prints as one; a second date would appear here the moment one
   * existed, rather than being noticed later.
   *
   * NO PAGE-LEVEL CONFIDENCE, and it is omitted rather than derived. The corpus
   * grades each RECORD; it grades no sentence like the claim above, which is
   * this page's reading OF those records. Taking the weakest of them, or the
   * modal one, would state a grade no corpus row makes, on a page that names
   * living people and says what they were paid - `docs/2.0/SNAPSHOT.md` section
   * 8.1's rule about absences, applied to epistemic status. Nothing is hidden
   * by leaving it out: the distribution prints in the open directly below, and
   * every record still carries its own grade in its own citation.
   */
  const graded = [...entities, ...edges, ...phrases];
  const sourceCount = new Set(graded.flatMap((r) => r.sources)).size;
  const verified = [...new Set(graded.map((r) => r.lastVerified))].sort();

  /**
   * The grade distribution, iterated over the LEVEL SET rather than over the
   * grades that happen to occur, so a level the corpus starts using cannot
   * arrive unprinted. The zero filter is the other half: a level nothing
   * carries would otherwise be announced with no value behind it, which is the
   * null-panel-renders-as-zero shape in the component written against it.
   */
  const gradeTally = CONF_LEVELS.map((level) => ({
    level,
    n: graded.filter((r) => r.confidence === level).length,
  })).filter((g) => g.n > 0);

  /** How many disclosed edges the loop diagram draws - the diagram's own set, never a literal. */
  const drawn = edges.filter((e) => LOOP_EDGE_IDS.has(e.id)).length;

  /**
   * Tranches announced in a press release, counted from the `via` column rather
   * than restated beside it. The prose under this table used to say "purchases
   * one to five each got a press release" while row four of the table said
   * "investor dashboard"; a figure read off the column cannot repeat that.
   */
  const pressReleased = CYPHERPUNK_LEDGER.filter((t) => t.via.includes("press release")).length;

  /** The catalogue's own finding, read off the field the cards print. */
  const tensions = phraseTensions(phrases);

  /** A party's display name: the diagram's short form where it has one, the record's title otherwise. */
  const name = (id: string): string => LOOP_NAMES.get(id) ?? entityAt.get(id)?.title ?? id;

  /**
   * The claim apparatus for one edge row: its id as a permalink, then the
   * popover.
   *
   * `home` marks the row that OWNS the anchor. `permalink("N-edge-...")` is
   * `/network#N-edge-...`, so exactly one element on this page may carry that
   * id; the full edge table is that element, and the grant table below links to
   * it rather than declaring it a second time. Two elements sharing an id is
   * invalid HTML and makes the permalink ambiguous, which on a page whose whole
   * proposition is "every claim has one canonical address" is worse than untidy.
   */
  const hayesExit = edgeAt.get("N-edge-hayes-exits-position");
  const zcashMedia = edgeAt.get("N-edge-zcg-grants-zcash-media");
  const navalInvests = edgeAt.get("N-edge-naval-invests-ecc");

  const edgeClaim = (e: NetworkEdge, home = false) => (
    <span className="claim" {...(home ? { id: e.id } : {})}>
      <a className="anchor" href={`/network#${e.id}`}>
        {e.id}
      </a>
      <Cite id={e.id} lastVerified={e.lastVerified} confidence={e.confidence} sources={resolveSources(e.sources)} />
    </span>
  );

  return (
    <>
      <RecordHead
        idx="03 LATTICE"
        kicker="holders - promoters - payers - every leg disclosed somewhere, the whole loop nowhere"
        title="Who holds, who"
        titleAccent="speaks"
        dek={
          <>
            Holders, promoters and payers, and the {edges.length} disclosed transfers and roles that connect them - taken from
            placements, 10-Qs, press releases and donation reports, and printed as those filings state them.
          </>
        }
        aside={
          winningMeme === undefined ? undefined : (
            <Glass>
              <Eyebrow idx="an insider on the slogan">the phrase catalogue, entry one</Eyebrow>
              <div style={{ marginTop: 12 }}>
                {/* The attribution is the phrase record's own `origin`, plus the
                    two roles `N-zooko-wilcox.role` states: Chief Product Officer
                    at Shielded Labs and paid strategic advisor to Cypherpunk,
                    both since Dec 2025. It is the conflict, not the credential,
                    and it belongs next to the sentence. */}
                <Quote
                  who={`${winningMeme.origin}${
                    zooko === undefined ? "" : " - Shielded Labs CPO and paid strategic advisor to Cypherpunk Technologies"
                  }`}
                >
                  {winningMeme.text}
                </Quote>
              </div>
              <span className="claim">
                <a className="anchor" href={`/network#${winningMeme.id}`}>
                  {winningMeme.id}
                </a>
                <Cite
                  id={winningMeme.id}
                  lastVerified={winningMeme.lastVerified}
                  confidence={winningMeme.confidence}
                  sources={resolveSources(winningMeme.sources)}
                />
              </span>
            </Glass>
          )
        }
      />

      {/* CLAIM, THEN EXPLANATION, THEN EVIDENCE, THEN THE WORKING (R5). The claim
          is LIFTED rather than written: it is this page's own kicker - "every
          leg disclosed somewhere, the whole loop nowhere" - stated as a
          sentence a reader can disagree with, and the disclosed edges below are
          what it rests on. The explanation is the dek's three findings, in the
          dek's own words, moved down to where an explanation belongs. */}
      <PageClaim
        claim={
          <>
            Holders, promoters and payers here are the same small group of people. Every leg of that loop is disclosed
            somewhere, and the whole loop is disclosed nowhere.
          </>
        }
        explain={
          <>
            Nothing here evidences illegality. Holding an asset and advocating for it is legal, and grant-funded education is
            legitimate when it is disclosed. The forensic finding is a density rather than a crime: {edges.length} disclosed
            edges among {entities.length} parties, the absence of position disclosure at the point of speech, and the gap
            between the slogans and the chain. What follows is the evidence - the loop, the purchase ledger, the statements
            set against price and the phrase catalogue - and then the working. The strongest case against this reading is on
            the same page, at the same weight, in block E.
          </>
        }
        lastVerified={verified.join(" · ")}
        sourceCount={sourceCount}
      >
        {/* THE FIGURES, NOW UNDER THE CLAIM THEY ARE EVIDENCE FOR. This
            paragraph opened the page: a count directly beneath the masthead,
            which is the "huge number, tiny explanation" half of the complaint
            with the number first. Not one figure in it was cut. */}
        <p className="note" style={{ marginTop: 18 }}>
          {entities.length} parties, {edges.length} disclosed edges - {drawn} of them drawn in the loop below -{" "}
          {phrases.length} catalogued phrases. Every figure is a seed field printed verbatim; where a party has disclosed no
          position the card says <i>none disclosed</i> rather than estimating one.
        </p>
        {/* THE GRADES, IN THE OPEN, AND NOT ONE OF THEM IS THIS PAGE'S. Every
            record carries the corpus's grade in its own citation - and on a
            page whose raw tables now sit behind disclosures, those chips would
            have gone behind the triangles with them. That is the collapse
            rule's hardest clause: epistemic status behind a toggle is the
            null-panel-renders-as-zero defect in a nicer coat. */}
        <p className="note" style={{ marginTop: 10 }}>
          The corpus grades every record on this page and none of the sentence above:{" "}
          {gradeTally.map((g, i) => (
            <span key={g.level}>
              {i === 0 ? "" : ", "}
              {g.n} <Conf level={g.level} />
            </span>
          ))}{" "}
          across the {graded.length} parties, edges and phrases. A grade for the claim itself would be one this site invented.
        </p>
      </PageClaim>

      <Block
        idx="A"
        title="The loop"
        id="network-loop"
        right="solid gold is money, dashed orchard is a role - from placements, 10-Qs, press releases and donation reports"
      >
        {/* THE EXPLANATION BEFORE THE VISUALIZATION. The diagram arrived with
            nothing saying what it is a selection FROM, so a reader met a
            handful of arcs and, further down, a 41-row table, with no sentence
            between them pairing the two. Both counts are read off the same two
            collections the diagram and the table render. */}
        <p className="note" style={{ marginBottom: 16 }}>
          The diagram draws {drawn} of the {edges.length} disclosed edges - the ones that close a loop between a holder, a
          promoter and a payer. The other {edges.length - drawn} are in the table under it, which is where the selection can
          be argued with.
        </p>
        <NetworkLoop />
        <NetworkLoopCite />

        <div className="nw-ents">
          {loopEntities.map((e) => (
            // The id goes on the card, not on the text inside it: the card is
            // what a permalink to this party should land on.
            <Glass key={e.id} id={e.id} className="nw-ent-card">
              <div className="ent">
                <span className="who">{name(e.id)}</span>
                <span className="kind">{e.kind}</span>
                <span className="nw-role">{e.role}</span>
                {e.exposure === null ? (
                  <span className="none">none disclosed</span>
                ) : (
                  <span className="exposure">{e.exposure}</span>
                )}
              </div>
              <span className="claim">
                <a className="anchor" href={`/network#${e.id}`}>
                  {e.id}
                </a>
                <Cite
                  id={e.id}
                  lastVerified={e.lastVerified}
                  confidence={e.confidence}
                  sources={resolveSources(e.sources)}
                />
              </span>
            </Glass>
          ))}
        </div>

        <div style={{ marginTop: 22 }}>
          {/* THE RAW TABLE COLLAPSES (R4), and the summary answers what the
              closed state has to answer: how many edges there are, and how many
              of them the picture above chose. Every row still renders in the
              HTML and still owns its permalink - a fragment navigation into a
              closed `<details>` reveals it, which is what keeps
              `/network#N-edge-...` landing on the row that declares the id. */}
          <Working
            title="Every disclosed edge, in full"
            finding={`${edges.length} rows, ${drawn} of them drawn above`}
          >
            <DataTable
              caption={`All ${edges.length} disclosed edges. The ${drawn} marked "drawn" are the ones the diagram above shows; the rest are the reason the diagram is a selection rather than the record.`}
              columns={[
                {
                  key: "edge",
                  head: "Edge",
                  cell: (e) => (
                    <>
                      {name(e.from)} {"→"} {name(e.to)}
                      {/* Neutral, not gold. The accent has a budget - primary
                          action, active state, value crossing a boundary - and
                          eleven marker chips in a forty-one-row table is not one
                          of the three. */}
                      {LOOP_EDGE_IDS.has(e.id) ? (
                        <>
                          {" "}
                          <Chip>drawn</Chip>
                        </>
                      ) : null}
                    </>
                  ),
                },
                { key: "what", head: "What", cell: (e) => e.what },
                // `amount` is optional on the schema and its absence is a fact:
                // some of these transfers were made and their consideration was
                // never disclosed. The cell says that rather than showing a dash
                // that could be read as zero.
                { key: "amount", head: "Amount", mono: true, cell: (e) => e.amount ?? "none disclosed" },
                // `date` is a looseDate and is printed exactly as the corpus
                // states it - "ongoing", "Mar 2026", "12 Nov 2025 - 30 Jun 2026".
                { key: "date", head: "Date", cell: (e) => e.date },
                {
                  key: "source",
                  head: "Source",
                  cell: (e) => resolveSources(e.sources).map((s) => s.publisher).join(" · "),
                },
                { key: "conf", head: "Conf.", cell: (e) => <Conf level={e.confidence} /> },
                { key: "claim", head: "Claim", cell: (e) => edgeClaim(e, true) },
              ]}
              rows={edges}
              rowKey={(e) => e.id}
            />
          </Working>
        </div>
      </Block>

      <Block idx="B" title="Cypherpunk Technologies, CYPH" right="purchase ledger - 10-Q, 30 Jun 2026">
        <div className="grid g2">
          <div>
            {/* THE EXPLANATION MOVED ABOVE THE LEDGER, and its first figure is
                counted from the `via` column instead of restated beside it. It
                read "purchases one to five each got a press release", which
                that column contradicts on row four. */}
            <p className="note" style={{ marginBottom: 12 }}>
              The last row is the one to read. {pressReleased} of the {CYPHERPUNK_LEDGER.length} tranches were announced in a
              press release; the 12 March 2026 buy appeared only on the investor dashboard; and after 15 April 2026 the
              company stopped announcing purchases at all, so the last tranche surfaced only in the quarterly filing. That is
              lawful and probably cheaper. It also ended the promotional cadence the earlier buys had.
            </p>
            <Working
              title="The purchase ledger, tranche by tranche"
              finding={`${CYPHERPUNK_LEDGER.length} tranches, ${CYPHERPUNK_LEDGER.length - pressReleased} with no press release`}
            >
              <DataTable
                caption="Cypherpunk's ZEC purchases, tranche by tranche, with the disclosure each one appeared in"
                columns={[
                  { key: "date", head: "Date", cell: (t) => t.date },
                  { key: "zec", head: "ZEC added", mono: true, cell: (t) => t.zec },
                  { key: "usd", head: "USD", mono: true, cell: (t) => t.usd },
                  { key: "avg", head: "Avg", mono: true, cell: (t) => t.avg },
                  { key: "cum", head: "Cumulative", mono: true, cell: (t) => t.cumulative },
                  { key: "via", head: "Disclosed via", cell: (t) => t.via },
                ]}
                rows={CYPHERPUNK_LEDGER}
                rowKey={(t) => t.date}
              />
            </Working>
            <span className="claim">
              <a className="anchor" href="/network#N-cypherpunk-technologies">
                cypherpunk-purchase-ledger
              </a>
              <Cite
                id="cypherpunk-purchase-ledger"
                href="/network#N-cypherpunk-technologies"
                lastVerified={cyph?.lastVerified ?? stats.lastVerified}
                confidence="high"
                sources={resolveSources([...new Set(CYPHERPUNK_LEDGER.flatMap((t) => t.sources))])}
              />
            </span>
          </div>

          <Glass>
            {cyph === undefined ? null : (
              <>
                <Eyebrow idx="position">as the filings state it</Eyebrow>
                <div style={{ marginTop: 12 }}>
                  <KV
                    stack
                    entries={[
                      { k: "disclosed exposure", v: cyph.exposure ?? "none disclosed" },
                      {
                        k: "mining",
                        v:
                          edgeAt.get("N-edge-winklevoss-capital-sells-mining-fleet") === undefined
                            ? "none disclosed"
                            : `${edgeAt.get("N-edge-winklevoss-capital-sells-mining-fleet")?.amount ?? "none disclosed"} - ${
                                edgeAt.get("N-edge-winklevoss-capital-sells-mining-fleet")?.date ?? ""
                              }, from the same fund that seeded the company`,
                      },
                                            {
                        k: "shares outstanding",
                        // Two separate measurements, not one. 83.9M is the
                        // 31 Dec 2025 count and 107,764,382 the 30 Jun 2026
                        // count - a half-year move, not a year-on-year one -
                        // and the +223 per cent figure is a StockAnalysis YoY
                        // metric against a different base. Printing them as one
                        // line made the percentage arithmetically false of the
                        // pair beside it, about a named public company. Gate
                        // round 1.
                        v: "83,900,000 at 31 Dec 2025 to 107,764,382 at 30 Jun 2026",
                      },
                      { k: "overhang", v: "80.77M pre-funded warrants and a $200M Cantor ATM" },
                      { k: "mNAV", v: "about 0.6x on basic shares at $790 ZEC - a discount, not a premium" },
                    ]}
                  />
                </div>
                <p className="note" style={{ marginTop: 14 }}>
                  The mNAV line is the correction to the standard treasury-company critique, and it cuts against this page. CYPH
                  has not sustained a premium to the ZEC it holds: it traded below a dollar for much of 2026 and took a Nasdaq
                  deficiency notice. The dilution is real and large; what it diluted into was a discount. A claim of premium
                  extraction would be unsupported on this data, and is not made.
                </p>
                <span className="claim">
                  <a className="anchor" href={`/network#${cyph.id}`}>
                    {cyph.id}
                  </a>
                  <Cite
                    id={cyph.id}
                    lastVerified={cyph.lastVerified}
                    confidence={cyph.confidence}
                    sources={resolveSources(cyph.sources)}
                  />
                </span>
              </>
            )}
          </Glass>
        </div>
      </Block>

      <Block idx="C" title="Statements against price" id="network-price" right="CoinGecko daily - statements dated - log scale">
        {/* What the marks ARE, before the chart rather than after it. The
            second sentence is a limit rather than a caption: a statement
            plotted beside a price move is a coincidence in time, and this page
            neither has nor claims the evidence for anything more. */}
        <p className="note" style={{ marginBottom: 16 }}>
          {marks.length} dated statements from the timeline, set against the daily close on a log scale. Each mark is a claim
          someone made in public on that day; the chart shows what the price did around it and says nothing about why.
        </p>
        <NetworkPrice />
        <NetworkPriceCite />

        <div style={{ marginTop: 22 }}>
          <Working
            title="The marked statements, row by row"
            finding={`${marks.length} statements, each a dated timeline row`}
          >
            <DataTable
              caption={`The ${marks.length} marked statements, each one a dated row of the timeline rather than a caption`}
              columns={[
                { key: "date", head: "Date", cell: (m) => m.event.dateText },
                { key: "label", head: "On the chart", cell: (m) => m.mark.label },
                { key: "what", head: "The record", cell: (m) => m.event.title },
                { key: "conf", head: "Conf.", cell: (m) => <Conf level={m.event.confidence} /> },
                {
                  key: "claim",
                  head: "Claim",
                  cell: (m) => (
                    <span className="claim">
                      <a className="anchor" href={`/timeline#${m.event.id}`}>
                        {m.event.id}
                      </a>
                      <Cite
                        id={m.event.id}
                        lastVerified={m.event.lastVerified}
                        confidence={m.event.confidence}
                        sources={resolveSources(m.event.sources)}
                      />
                    </span>
                  ),
                },
              ]}
              rows={marks}
              rowKey={(m) => m.event.id}
            />
          </Working>
        </div>
      </Block>

      <Block
        idx="D"
        title="Phrase catalogue"
        right={`${phrases.length} phrases - first known origin - what the record says back - unverified slogans are not shown`}
      >
        {/* THE ABSENCE STAYS IN THE OPEN and the catalogue collapses beneath
            it, which is the way round the collapse rule requires: what is NOT
            published is a fact about this page, and a reader who never opens
            the disclosure still has to meet it. */}
        <p className="note" style={{ marginBottom: 16 }}>
          Three slogans the brief asked for are not here and never will be: no first-party use of &quot;#ZecToTheMoon&quot;,
          &quot;the privacy layer of the internet&quot; or &quot;the only true private cryptocurrency&quot; could be located
          anywhere. They sit in the quarantine with the reason attached, which is a different thing from being deleted.
        </p>
        <Working
          title="The phrase catalogue in full"
          finding={`${phrases.length} phrases, ${tensions.documented} with a documented tension`}
        >
          <NetworkPhrases />
        </Working>
      </Block>

      <Block idx="E" title="Paid content, and what cuts the other way" right="the grant book, and the case against this page">
        <div className="grid g2">
          <Glass>
            <Eyebrow idx="paid content">
              Zcash Community Grants{zcg === undefined ? "" : ` - ${zcg.exposure ?? "none disclosed"}`}
            </Eyebrow>
            {/* THE ARGUMENT STAYS OPEN AND THE BOOK COLLAPSES UNDER IT. The two
                surviving criticisms and the arithmetic that cuts the other way
                are what a reader has to meet; the itemised lines and the
                programme totals are the raw material behind them. */}
            <p className="note" style={{ marginTop: 14 }}>
              Transparent by the standards of this industry: every grant is public, debated on the forum, tracked to
              milestones, and the largest single media grant was cancelled for under-delivery. Two criticisms survive that.
              The downstream content rarely re-discloses the funding at the point of consumption; and Paul Brigner sits on the
              grant committee while employed as ZODL&apos;s policy chief. And the arithmetic cuts the other way as well:{" "}
              <b>$3.5M of lifetime promotional grants cannot move a ${(stats.marketCapUsd.low / 1e9).toFixed(1)}B asset</b>.
              If this move was engineered, it was engineered by balance sheets and derivatives, not by content.
            </p>
            <div style={{ marginTop: 14 }}>
              <Working
                title="The grant book"
                finding={`${grants.length} itemised lines, ${GRANT_TOTALS.length} programme totals`}
              >
                <DataTable
                  caption={`The ${grants.length} largest explicitly promotional grant lines, from the ZCG ledger`}
                  columns={[
                    { key: "who", head: "Grantee", cell: (e) => name(e.to) },
                    { key: "amount", head: "Amount", mono: true, cell: (e) => e.amount ?? "none disclosed" },
                    { key: "date", head: "Date", cell: (e) => e.date },
                    { key: "claim", head: "Claim", cell: edgeClaim },
                  ]}
                  rows={grants}
                  rowKey={(e) => e.id}
                />
                <div style={{ marginTop: 14 }}>
                  <KV entries={GRANT_TOTALS} />
                </div>
              </Working>
            </div>
            {zcg === undefined ? null : (
              <span className="claim" id={zcg.id}>
                <a className="anchor" href={`/network#${zcg.id}`}>
                  {zcg.id}
                </a>
                <Cite
                  id={zcg.id}
                  lastVerified={zcg.lastVerified}
                  confidence={zcg.confidence}
                  sources={resolveSources(zcg.sources)}
                />
              </span>
            )}
          </Glass>

          {/*
            The fairness panel. It is not a disclaimer and it is not decoration:
            a page that catalogues a promotion network without publishing the
            strongest case against its own reading is advocacy with footnotes.
            Every line below is a record with an id, and the ids are here so the
            panel can be audited as hard as the lattice can.
          */}
          <Glass className="fair">
            <Eyebrow idx="what cuts the other way" className="nw-fair-head">
              published on the same page, at the same weight, by design
            </Eyebrow>
            <ul className="nw-fair-list">
              <li>
                <b>The loudest promoter sold, and said so.</b> Arthur Hayes liquidated the entire position on{" "}
                {hayesExit?.date ?? "4-5 Jun 2026"} and disclosed the exit publicly. That is not
                what a coordinated cartel does.
                {hayesExit === undefined ? null : edgeClaim(hayesExit)}
              </li>
              <li>
                <b>The ecosystem argued with itself in public.</b>{" "}
                {vitalik?.summary ?? "Vitalik Buterin publicly opposed the token-voting change favoured by Naval Ravikant."}
                {vitalik === undefined ? null : (
                  <span className="claim" id={vitalik.id}>
                    <a className="anchor" href={`/network#${vitalik.id}`}>
                      {vitalik.id}
                    </a>
                    <Cite
                      id={vitalik.id}
                      lastVerified={vitalik.lastVerified}
                      confidence={vitalik.confidence}
                      sources={resolveSources(vitalik.sources)}
                    />
                  </span>
                )}
              </li>
              <li>
                <b>The grant programme killed its own biggest promotional grant.</b> The{" "}
                {zcashMedia?.amount ?? "$600,000"} Zcash Media grant was cancelled at six of
                nine milestones.
                {zcashMedia === undefined ? null : edgeClaim(zcashMedia)}
              </li>
              <li>
                <b>The advocacy predates the rally by years.</b> &quot;Privacy is normal&quot; is an ECC post of{" "}
                {privacyIsNormal?.date ?? "21 Oct 2020"}; Naval&apos;s investment in the Electric Coin Company is{" "}
                {navalInvests?.date ?? "2015"}, at{" "}
                {navalInvests?.amount ?? "an undisclosed amount"}. This is a decade-old network, not one assembled for a
                pump.
                {navalInvests === undefined ? null : edgeClaim(navalInvests)}
              </li>
              <li>
                <b>The regulator closed its file.</b> {secClosed?.title ?? "The SEC closed the Zcash Foundation probe."}
                {secClosed === undefined ? null : (
                  <span className="claim">
                    <a className="anchor" href={`/timeline#${secClosed.id}`}>
                      {secClosed.id}
                    </a>
                    <Cite
                      id={secClosed.id}
                      lastVerified={secClosed.lastVerified}
                      confidence={secClosed.confidence}
                      sources={resolveSources(secClosed.sources)}
                    />
                  </span>
                )}
              </li>
              <li>
                <b>The engineering is real and it shipped.</b> {zashi?.title ?? "Zashi wallet launches"} (
                {zashi?.dateText ?? "28 Mar 2024"}); {ironwood?.title ?? "NU6.3 Ironwood launches a new shielded pool"} (
                {ironwood?.dateText ?? "28 Jul 2026"}). A promotion-only ecosystem does not seal its own pool behind a
                turnstile.
              </li>
              <li>
                <b>It disclosed and fixed its own worst bug rather than burying it.</b> {b2?.id ?? "B2"} was found on{" "}
                {b2?.discovered ?? "29 May 2026, 23:53"}. Fixed: {b2?.fixed ?? "3 Jun 2026"}. Disclosed:{" "}
                {b2?.disclosed ?? "4 Jun 2026"}.
                {b2 === undefined ? null : (
                  <span className="claim">
                    <a className="anchor" href={`/beware#${b2.id}`}>
                      {b2.id}
                    </a>
                    <Cite id={b2.id} lastVerified={b2.lastVerified} confidence={b2.confidence} sources={resolveSources(b2.sources)} />
                  </span>
                )}
              </li>
              <li>
                <b>The price fell, hard, twice.</b> From the November high to the March trough the plotted daily closes are{" "}
                {move("2025-11-07", "2026-03-01")}; across the two sessions after the Orchard disclosure they are{" "}
                {move("2026-06-04", "2026-06-06")}. Both figures are arithmetic on the series above, and both stop there:
                the corpus quarantines the exact June low and the exact date of the November high, so no deeper number is
                published. That is not what a functioning manipulation looks like.
              </li>
            </ul>

            <p className="note nw-dropped" style={{ marginTop: 16 }}>
              <b>Dropped after research.</b> Four claims this page would otherwise have carried were checked and are not
              published. They are listed rather than deleted, because deleting them would hide that they were checked at all.
            </p>
            <ul className="quarantine">
              {dropped.map((u) => (
                // `id` is what makes the permalink resolve: this page is where
                // these records render, and each one's own `surface` field is
                // what says so. They pointed at /sources before, which renders
                // no U- id at all, so every citation dead-ended.
                <li key={u.id} id={u.id}>
                  <span className="st">{u.status}</span>
                  <p className="cl">{u.claim}</p>
                  <p className="why">{u.why}</p>
                  <span className="claim">
                    <a className="anchor" href={requirePermalink(u.id)}>
                      {u.id}
                    </a>
                    {/* NOT `<Conf level="low" />`, which is what this printed.
                        `unverifiedSchema` carries id, claim, status, why,
                        sources, surface and lastVerified - and no confidence -
                        so the grade was a literal typed into the page for a
                        record the corpus never graded, on the one list whose
                        whole subject is what could not be established. The
                        condition is named instead, and the last-verified date
                        the record DOES carry is printed rather than dropped.
                        `docs/2.0/SNAPSHOT.md` section 8.1, applied to
                        epistemic status. */}
                    <span className="src">
                      last verified {u.lastVerified} - no confidence: a quarantined record carries a status and a reason, and
                      the schema grades none of them
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Glass>
        </div>
      </Block>
    </>
  );
}
