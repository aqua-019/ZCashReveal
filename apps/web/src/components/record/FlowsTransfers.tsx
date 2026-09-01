import type { ReactNode } from "react";

import {
  getCase,
  getCases,
  getUnverified,
  requirePermalink,
  type Case,
  type CaseStep,
  type Confidence,
  type SourceRef,
} from "@zcashreveal/content";

import {
  formatZatoshi,
  groupZec,
  minutesBetween,
  percent,
  shortAddress,
  shortTxid,
  sumZec,
  toZatoshi,
  utc,
} from "@/components/record/FlowsAmount";
import { FlowsClaim } from "@/components/record/FlowsClaim";
import { FlowsEnd } from "@/components/record/FlowsLabels";
import { Working } from "@/components/record/Working";
import { Chip } from "@/components/ui/Chip";
import { DataTable } from "@/components/ui/DataTable";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { Pill } from "@/components/ui/Pill";
import { Reason, type ReasonStep } from "@/components/ui/Reason";

/**
 * The dated transfers table and the reconstruction of 2 January 2026.
 *
 * The table is built by flattening every step of every case in `cases.json`,
 * not by transcribing the mockup: the steps carry the txid, the height, the
 * time and the corpus's own note about what each one proves, and reading them
 * from the seed is what makes the page reproducible rather than retyped. Two
 * cases share the 202,076.207 ZEC transaction, so rows are keyed by txid and a
 * shared row anchors to both cases at the weaker of their two confidences.
 *
 * Three rows are not chain data at all: the aggregator's claimed 202,077 ZEC
 * withdrawal, Arthur Hayes's self-disclosed exit, and the $174M position Arkham
 * described. They sit in the same table because the page's argument is the
 * comparison, and each one carries an `undefined` pill in the amount column -
 * not a figure the chain can produce - and the research's refusal in the last
 * column. Dropping them would leave a table of what the chain shows with no
 * trace of what was claimed, which is the failure mode this page documents.
 *
 * WHAT HANDOFF-04b COLLAPSED HERE, AND WHAT IT DID NOT (R4). Three disclosures:
 * the raw transfer table, the fixed-width ledger and the eight-step round-trip
 * inference. All three are the working - a raw table, a derivation and a method
 * walk-through, which is the rule's own list. Everything that states a result
 * stayed open: the totals the ledger sums to, the case verdict, the
 * plain-language statement of what the round trip means, and every citation's
 * confidence and date. A reader who opens nothing on this file still meets each
 * finding, its grade and its limit; what they have to ask for is the arithmetic
 * behind it.
 */

const POOL = "shielded pool";
const LADDER: Record<Confidence, number> = { high: 0, med: 1, low: 2 };

/**
 * A step of the round-trip argument, and what kind of statement it is.
 *
 * `Reason` takes `{ n, text }` and renders both kinds identically, which is
 * right: the step itself says "Fact." or "Inference, medium-high." in its own
 * first words. The extra field exists so the disclosure that folds these eight
 * can COUNT them - five facts, one inference, two bounds - rather than carry a
 * number typed beside a list it does not read.
 */
interface RoundTripStep extends ReasonStep {
  readonly kind: "fact" | "inference" | "bound";
}

function weaker(a: Confidence, b: Confidence): Confidence {
  return LADDER[a] >= LADDER[b] ? a : b;
}

interface ChainRow {
  readonly kind: "chain";
  readonly key: string;
  readonly time: string;
  readonly step: CaseStep;
  readonly caseIds: readonly string[];
  readonly sources: readonly SourceRef[];
  readonly confidence: Confidence;
  readonly lastVerified: string;
}

interface ClaimedRow {
  readonly kind: "claimed";
  readonly key: string;
  readonly time: string;
  readonly when: string;
  /** What was claimed, in the claimant's own units. Never a chain figure. */
  readonly claimed: string;
  readonly from: string;
  readonly to: string;
  readonly assessment: string;
  readonly id: string;
  readonly href: string;
  readonly sources: readonly SourceRef[];
  readonly confidence: Confidence;
  readonly lastVerified: string;
}

type Row = ChainRow | ClaimedRow;

/** Every case step, keyed by txid so a transaction two cases share renders once. */
function chainRows(): readonly ChainRow[] {
  const rows = new Map<string, ChainRow>();
  for (const kase of getCases()) {
    kase.steps.forEach((step, index) => {
      const key = step.txid ?? `${kase.id}-${index}`;
      const existing = rows.get(key);
      if (existing === undefined) {
        rows.set(key, {
          kind: "chain",
          key,
          time: step.time,
          step,
          caseIds: [kase.id],
          sources: kase.sources,
          confidence: kase.confidence,
          lastVerified: kase.lastVerified,
        });
        return;
      }
      rows.set(key, {
        ...existing,
        caseIds: [...existing.caseIds, kase.id],
        sources: [...new Set([...existing.sources, ...kase.sources])],
        confidence: weaker(existing.confidence, kase.confidence),
        lastVerified:
          existing.lastVerified < kase.lastVerified ? existing.lastVerified : kase.lastVerified,
      });
    });
  }
  return [...rows.values()];
}

/**
 * The three rows with no transaction behind them.
 *
 * The Hayes row is bound to the network edge that records the exit; the Arkham
 * row is bound to the quarantine record that records the failure to locate the
 * original post. The aggregator's 202,077 ZEC claim has no record of its own in
 * `packages/content` - the refusal exists inside `K-202076-unshield.verdict`
 * and inside the `t1gGCYpy` label's method - so it renders page-local, marked
 * unbound, with the research's wording.
 */
function claimedRows(): readonly ClaimedRow[] {
  const arkham = getUnverified().find((u) => u.id === "U-arkham-174m-position-post");
  const rows: ClaimedRow[] = [
    {
      kind: "claimed",
      key: "R-claim-embercn-202077",
      time: "2025-12-20",
      when: "2025-12-20 (claimed)",
      claimed: "202,077 ZEC",
      from: "\"Binance\", per the aggregator",
      to: "unnamed address",
      assessment:
        "Unverified, with a date conflict. No address was published. The only on-chain movement of about 202,07x ZEC that can be located is a shielded-pool exit on 2026-01-02 15:45:14, which is not a Binance withdrawal and is thirteen days later. Either the aggregator mis-dated or mis-described an event, or it refers to something that cannot be found. Do not cite.",
      id: "R-claim-embercn-202077",
      href: "/flows#R-claim-embercn-202077",
      sources: ["S-blockchain-news-flashnews-zec-zcash-whale-alert"],
      confidence: "low",
      lastVerified: "2026-08-22",
    },
    {
      kind: "claimed",
      key: "N-edge-hayes-exits-position",
      time: "2026-06-05",
      when: "2026-06-05",
      claimed: "not on chain",
      from: "Arthur Hayes / Maelstrom, self-disclosed",
      to: "unspecified venue",
      assessment:
        "Proves that Hayes said he liquidated his entire ZEC position after the Orchard vulnerability was disclosed. Does not prove venue, size, or any on-chain footprint: the report names no exchange, no address and no amount.",
      id: "N-edge-hayes-exits-position",
      href: "/network#N-edge-hayes-exits-position",
      sources: ["S-coindesk-05-arthur-hayes-dumps-zcash-holdings-af", "S-cryptopolitan-com-zachxbt-hayes-face-off-over-ex"],
      confidence: "high",
      lastVerified: "2026-08-22",
    },
  ];
  if (arkham !== undefined) {
    rows.push({
      kind: "claimed",
      key: arkham.id,
      time: "2026-06-05T23:59:59Z",
      when: "2026-06-05 (reported)",
      claimed: "$174M position",
      from: "unnamed holder, an Arkham label, entity never named publicly",
      to: "unspecified",
      assessment: arkham.why,
      id: arkham.id,
      // The record itself is anchored in the allegations table below; this row
      // cites it there rather than claiming the anchor for a second time.
      href: requirePermalink(arkham.id),
      sources: arkham.sources,
      // The quarantine carries a status rather than a confidence, and every
      // status in it means "not publishable as fact". Rendering it at low is
      // the only reading that does not overstate the record.
      confidence: "low",
      lastVerified: arkham.lastVerified,
    });
  }
  return rows;
}

function heightOf(step: CaseStep): ReactNode {
  return step.height === undefined ? null : (
    <span className="fl-attrib">block {step.height.toLocaleString("en-GB")}</span>
  );
}

export function FlowsTransfersTable() {
  const rows: readonly Row[] = [...chainRows(), ...claimedRows()].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  // ON CHAIN, NOT "VERIFIED". The summary first read "14 verified on chain",
  // and rendering it showed why that was wrong: fourteen rows are chain events
  // but only thirteen carry a txid, and the `verified` chip - which is what the
  // paragraph above means by the word - renders only where one exists.
  // `K-202076-unshield` has a step the corpus has no transaction id for. The
  // three counts now close on the row total and none of them claims more than
  // the cell beneath it does.
  const onChain = rows.filter((r) => r.kind === "chain").length;

  return (
    <>
      <p className="note measure">
        Every row marked <b>verified</b> was pulled directly from the Blockchair Zcash API on 22 August 2026 and is
        reproducible against a public endpoint; the transaction id is printed so a reader can check the row rather than
        trust it. Times are UTC. Three rows carry no transaction at all - they are claims, and they are here so the
        comparison is visible.
      </p>
      {/* THE RAW TABLE, COLLAPSED (R4). Thirteen rows of transaction ids,
          block heights and per-row citations are the evidence in its raw
          form; the paragraph above states what the table shows and stays
          open, and the summary carries the row counts so a reader knows what
          is inside before deciding to open it. The counts are derived from
          the same array the table maps, so the two cannot disagree. */}
      <div className="fl-gap-m">
        <Working
          title="Every dated transfer, and the claim made about each"
          finding={`${rows.length} rows, ${onChain} on chain, ${rows.length - onChain} claim only`}
        >
          <DataTable
            caption="Large ZEC transfers and the claims made about them, 24 November 2025 to 5 June 2026"
            columns={[
              {
                key: "when",
                head: "Date and time, UTC",
                mono: true,
                cell: (r: Row) =>
                  r.kind === "chain" ? (
                    <>
                      {utc(r.step.time)}
                      {heightOf(r.step)}
                    </>
                  ) : (
                    <>
                      {r.when}
                      <span className="fl-attrib">no block; not a chain event</span>
                    </>
                  ),
              },
              {
                key: "zec",
                head: "ZEC",
                mono: true,
                cell: (r: Row) =>
                  r.kind === "chain" ? (
                    <>
                      <Pill kind="exact" /> {groupZec(r.step.amount)}
                      {r.step.from === POOL || r.step.to === POOL ? (
                        <span className="fl-attrib">
                          crosses the shielded-pool boundary: the amount is public, the party on the pool side is not
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Pill kind="undefined" /> {r.claimed}
                      <span className="fl-attrib">not derivable from public chain data</span>
                    </>
                  ),
              },
              {
                key: "from",
                head: "From",
                cell: (r: Row) =>
                  r.kind === "chain" ? <FlowsEnd value={r.step.from} /> : <span className="cp">{r.from}</span>,
              },
              {
                key: "to",
                head: "To",
                cell: (r: Row) =>
                  r.kind === "chain" ? <FlowsEnd value={r.step.to} /> : <span className="cp">{r.to}</span>,
              },
              {
                key: "source",
                head: "Source",
                mono: true,
                cell: (r: Row) =>
                  r.kind === "chain" ? (
                    <>
                      {r.step.txid === undefined ? (
                        <span className="fl-attrib">no transaction id in the corpus for this step</span>
                      ) : (
                        <>
                          <span className="fl-addr">tx {shortTxid(r.step.txid)}</span>
                          <Chip tone="ok">verified</Chip>
                        </>
                      )}
                      <span className="fl-attrib">{r.caseIds.join(" · ")}</span>
                    </>
                  ) : (
                    <Chip tone="danger">claim only</Chip>
                  ),
              },
              {
                key: "proves",
                head: "Proves, and does not prove",
                cell: (r: Row) => (
                  <>
                    <span className="cp">{r.kind === "chain" ? r.step.note : r.assessment}</span>
                    {r.kind === "chain" ? (
                      <FlowsClaim
                        id={r.caseIds[0] ?? "K-2026-01-02"}
                        {...(r.caseIds.length > 1 ? { also: r.caseIds.slice(1) } : {})}
                        confidence={r.confidence}
                        lastVerified={r.lastVerified}
                        sources={r.sources}
                      />
                    ) : (
                      <FlowsClaim
                        id={r.id}
                        href={r.href}
                        confidence={r.confidence}
                        lastVerified={r.lastVerified}
                        sources={r.sources}
                        unbound={r.id.startsWith("R-")}
                      />
                    )}
                  </>
                ),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.key}
          />
        <p className="note fl-gap-s measure">
          The full transaction ids are in the citation on every row, and each resolves at{" "}
          <code className="mono">api.blockchair.com/zcash</code>. Research 04 makes publishing them a condition of the
          page: every on-chain claim here is reproducible against a public API, and that reproducibility is the only
          credibility the page has.
        </p>
        </Working>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 2.1 - the reconstruction                                                   */
/* -------------------------------------------------------------------------- */

const TIME_WIDTH = 19;
const RULE_WIDTH = 48;

/** The endpoint as the fixed-width ledger names it. Never annotated with an owner. */
function ledgerEnd(value: string): string {
  if (value === POOL) return "SHIELDED POOL";
  return /^t[123][1-9A-HJ-NP-Za-km-z]{33}$/.test(value) ? shortAddress(value) : value;
}

/**
 * The sign convention, derived rather than stored. The ledger is written from
 * the two boundaries the case crosses: value leaving the wallet the case starts
 * at, or entering the shielded pool, is negative; value emerging from the pool
 * is positive; a transparent-to-transparent movement between two other
 * addresses carries no sign, because nothing crossed either boundary.
 */
function sign(step: CaseStep, origin: string): string {
  if (step.from === POOL) return "+";
  if (step.to === POOL) return "−";
  return step.from === origin ? "−" : "";
}

function buildLedger(kase: Case): string {
  const origin = kase.steps[0]?.from ?? "";
  const amounts = kase.steps.map((s) => `${sign(s, origin)}${groupZec(s.amount)}`);
  const withdrawals = kase.steps.filter((s) => s.time < "2026" && s.from === origin);
  const subtotal = formatZatoshi(sumZec(withdrawals.map((s) => s.amount)));
  const width = Math.max(...amounts.map((a) => a.length), subtotal.length);

  const lines: string[] = [];
  let ruled = false;
  kase.steps.forEach((step, index) => {
    if (!ruled && step.time >= "2026" && withdrawals.length > 0) {
      lines.push(`${" ".repeat(TIME_WIDTH)}  ${"-".repeat(RULE_WIDTH)}`);
      lines.push(
        `${" ".repeat(TIME_WIDTH)}  ${subtotal.padStart(width)} ZEC   total withdrawn to ${ledgerEnd(
          withdrawals[0]?.to ?? "",
        )}`,
      );
      lines.push("");
      ruled = true;
    }
    lines.push(
      `${utc(step.time).padEnd(TIME_WIDTH)}  ${(amounts[index] ?? "").padStart(width)} ZEC   ${ledgerEnd(
        step.from,
      )} → ${ledgerEnd(step.to)}`,
    );
  });
  return lines.join("\n");
}

export function FlowsReconstruction() {
  const kase = getCase("K-2026-01-02");
  const parked = getCase("K-202076-unshield");
  if (kase === undefined) return null;

  const exits = kase.steps.filter((s) => s.from === POOL);
  const unshielded = sumZec(exits.map((s) => s.amount));
  const origin = kase.steps[0]?.from ?? "";
  const reachedStep = kase.steps.find((s) => s.to === origin && s.from !== origin);
  const reached = reachedStep === undefined ? 0n : toZatoshi(reachedStep.amount);
  const largest = exits.reduce<CaseStep | undefined>(
    (best, s) => (best === undefined || toZatoshi(s.amount) > toZatoshi(best.amount) ? s : best),
    undefined,
  );
  const stillParked = largest === undefined ? 0n : toZatoshi(largest.amount);

  // The round trip, computed rather than asserted: the step that shields a whole
  // balance, and the first pool exit after it.
  const shielding = kase.steps.find((s) => s.to === POOL);
  const emergence =
    shielding === undefined ? undefined : exits.find((s) => s.time > shielding.time);
  const delta =
    shielding === undefined || emergence === undefined
      ? undefined
      : toZatoshi(shielding.amount) - toZatoshi(emergence.amount);
  const gap =
    shielding === undefined || emergence === undefined
      ? undefined
      : minutesBetween(shielding.time, emergence.time);

  /**
   * THE ROUND TRIP, AS EIGHT LABELLED STEPS.
   *
   * `kind` is not decoration: the disclosure below states what the reader is
   * about to open - five facts, one inference and two bounds on it - and it
   * counts them from this array rather than restating a number beside it. The
   * distinction the field carries is the page's whole discipline: steps 01 to
   * 05 are chain records, 06 is the inference they support at medium-high, and
   * 07 and 08 are why it is neither higher nor lower.
   */
  const roundTrip: readonly RoundTripStep[] = [
    {
      n: "01",
      kind: "fact",
      text: (
        <>
          <b>Fact.</b> The fresh address received exactly 49,999.97 ZEC from the hot wallet on 24 and 25 December
          2025, and its balance is 50,000.96 ZEC. The 0.99 ZEC difference is arithmetic; the corpus records no
          fourth withdrawal, so what it was is not established. Calling it a funding seed would be a behavioural
          read, and this step is labelled a fact.
        </>
      ),
    },
    {
      n: "02",
      kind: "fact",
      text: (
        <>
          <b>Fact.</b> On 2 January 2026 at 18:01:43 it spent all four of its outputs into a transaction with zero
          transparent outputs, shielding the entire balance.
        </>
      ),
    },
    {
      n: "03",
      kind: "fact",
      text: (
        <>
          <b>Fact.</b> {gap === undefined ? "Fifty-two" : gap} minutes later, a transaction with zero transparent
          inputs created a single output of 50,000.5541 ZEC.
        </>
      ),
    },
    {
      n: "04",
      kind: "fact",
      text: (
        <>
          <b>Fact.</b> The difference is {delta === undefined ? "0.4059" : formatZatoshi(delta)} ZEC, 0.0008 per
          cent of the principal.
        </>
      ),
    },
    {
      n: "05",
      kind: "fact",
      text: (
        <>
          <b>Fact.</b> That output was consolidated with a 24,000.9781 ZEC unshielding and sent to the hot wallet.
        </>
      ),
    },
    {
      n: "06",
      kind: "inference",
      text: (
        <>
          <b>Inference, medium-high.</b> The same party shielded and immediately unshielded about 50,000 ZEC to
          break the transparent link before returning it. <Pill kind="bounded" /> Not a fact, and not provable.
        </>
      ),
    },
    {
      n: "07",
      kind: "bound",
      text: (
        <>
          <b>Why not higher.</b> The shielded pool held roughly 4.9M ZEC at the time and is specifically
          engineered so that an output cannot be linked to an input. A coincidental near-match is not impossible.
        </>
      ),
    },
    {
      n: "08",
      kind: "bound",
      text: (
        <>
          <b>Why not lower.</b> Four independent alignments: amount agreement to four decimal places, the
          fifty-two-minute proximity, the fresh address shielding its entire balance and never appearing again,
          and the emergent value being routed straight back to the wallet the coins came from.
        </>
      ),
    },
  ];
  const facts = roundTrip.filter((step) => step.kind === "fact").length;
  const inferences = roundTrip.filter((step) => step.kind === "inference").length;

  return (
    <div className="fl-stack">
      <Glass>
        <Eyebrow idx="2.1 the 2 january 2026 event, reconstructed">every line verified on chain</Eyebrow>
        {/* THE DERIVATION, COLLAPSED; THE TOTALS IT SUMS TO, OPEN (R4). The
            ledger is how the three figures below were arrived at, line by
            line - the rule's "derivation", exactly. The summary counts the
            lines from the case's own steps, so a case gaining a step moves the
            summary with the ledger rather than leaving it stale. */}
        <div className="fl-gap-s">
          <Working
            title="The fixed-width ledger, every line a transaction"
            finding={`${kase.steps.length} transactions, ${exits.length} leaving the pool`}
          >
            <p className="fl-attrib fl-gap-s">
              Each line is one transaction: time in UTC, the signed amount, and the two ends. The rule marks the
              December subtotal.
            </p>
            <pre className="code fl-code fl-gap-s">{buildLedger(kase)}</pre>
          </Working>
        </div>
        <div className="fl-gap-s">
          <KV
            entries={[
              {
                k: "total unshielded on 2 January 2026",
                v: (
                  <>
                    <Pill kind="exact" /> {formatZatoshi(unshielded)} ZEC
                  </>
                ),
              },
              {
                k: "reached the presumed exchange wallet",
                v: (
                  <>
                    {formatZatoshi(reached)} ZEC · {percent(reached, unshielded)} per cent
                  </>
                ),
              },
              {
                k: "still parked, never spent",
                v: (
                  <>
                    {formatZatoshi(stillParked)} ZEC · {percent(stillParked, unshielded)} per cent
                  </>
                ),
              },
              ...(delta === undefined || gap === undefined
                ? []
                : [
                    {
                      k: "shield-to-unshield difference",
                      v: (
                        <>
                          {formatZatoshi(delta)} ZEC across {gap} minutes
                        </>
                      ),
                    },
                  ]),
            ]}
          />
        </div>
        <p className="note fl-gap-s">
          The totals above are summed from the steps in zatoshi, so they are exact. The research prints the same total as{" "}
          <b>276,077.739 ZEC, about 1.63 per cent of the then-circulating supply</b>, and notes that this is higher than
          the figure the press reported, which counted only the largest tranche.
        </p>
      </Glass>

      <Glass id={kase.id}>
        <Eyebrow idx="what the steps establish">the case verdict, in full</Eyebrow>
        <p className="note fl-gap-s">{kase.verdict}</p>
        <FlowsClaim
          id={kase.id}
          confidence={kase.confidence}
          lastVerified={kase.lastVerified}
          sources={kase.sources}
        />
        <div className="hair fl-gap-m" />
        <div className="fl-gap-m" />
        <Eyebrow idx="the round trip, stated precisely">the most consequential inference on this page</Eyebrow>
        {/* THE DERIVATION, COLLAPSED; THE CONCLUSION, NOT (R4). Eight numbered
            steps are a walk-through, which is exactly what the collapse rule
            folds. The verdict above it and the plain-language statement below
            it are the finding and both stay open, so a reader who never opens
            this still meets the claim, its confidence and its limit. */}
        <Working
          title="The round-trip inference, step by step"
          finding={`${roundTrip.length} steps, ${facts} facts, ${inferences} inference`}
        >
          <Reason label="The round-trip inference, step by step" steps={roundTrip} />
        </Working>
        <p className="quote fl-gap-m" style={{ fontSize: 18 }}>
          On-chain records show about 50,000 ZEC leaving this exchange wallet in late December, being fully shielded on 2
          January, and a near-identical amount emerging from shielding fifty-two minutes later and returning to the same
          wallet. Zcash&apos;s design means these cannot be proven to be the same coins. If they are, the widely-reported
          74,002 ZEC whale deposit represents at most about 24,000 ZEC of new inflow.
        </p>
      </Glass>

      {parked === undefined ? null : (
        <Glass id={parked.id}>
          <Eyebrow idx="2.2 the 202,076 zec unshielding that never moved">
            two steps, seven and a half months apart
          </Eyebrow>
          <div className="fl-gap-s">
            <KV
              entries={parked.steps.map((s) => ({
                k: `${utc(s.time)}${s.txid === undefined ? " · no transaction id in the corpus" : ` · ${shortTxid(s.txid)}`}`,
                v: (
                  <>
                    {groupZec(s.amount)} ZEC from {ledgerEnd(s.from)}
                  </>
                ),
              }))}
            />
          </div>
          <p className="note fl-gap-s">{parked.verdict}</p>
          <FlowsClaim
            id={parked.id}
            confidence={parked.confidence}
            lastVerified={parked.lastVerified}
            sources={parked.sources}
          />
        </Glass>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* What the claim beat at the top of the page reads                           */
/* -------------------------------------------------------------------------- */

/** Rows in the dated transfer table. Derived from the same builders it renders. */
export function transferRowCount(): number {
  return chainRows().length + claimedRows().length;
}

/**
 * The sources the three claim-only rows carry. The chain rows' sources belong
 * to the cases in `packages/content` and the page totals those from the records
 * themselves, so counting them here would be counting them twice - which a Set
 * absorbs, but which would also hide it if one of the two ever stopped.
 */
export function transferSources(): readonly SourceRef[] {
  return claimedRows().flatMap((r) => r.sources);
}
