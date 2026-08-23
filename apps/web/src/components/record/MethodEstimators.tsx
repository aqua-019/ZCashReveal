import type { ReactNode } from "react";

import { getSource, requirePermalink, type SourceRef } from "@zcashreveal/content";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pill } from "@/components/ui/Pill";

/**
 * The eleven estimators, each with its kind, its statement, what it refuses to
 * do, and where it comes from.
 *
 * Two things about this table are load-bearing.
 *
 * First, the Kind column. `hard` means the statement follows from the consensus
 * rules and holds for every transaction on the chain; `soft` means it is a
 * behavioural prior that a wallet is free to violate and that some wallets do.
 * A page listing eleven techniques without that column would be arguing that
 * all eleven are equally good, which is false, and the four soft ones are
 * precisely the ones a reader should be able to reject.
 *
 * Second, the refusal under each statement. Every estimator here can be misread
 * as doing more than it does - a bound read as a set, an alignment read as a
 * link, a wallet fingerprint read as a person - and the refusal is the sentence
 * that closes that reading off. It is set at the same size as the statement it
 * qualifies, because a caveat in smaller type is a caveat being hidden.
 *
 * PROVENANCE. The statements are docs/2.0/TRACKING-MATH.md section 3, paragraph
 * for paragraph, and its numbering is kept: 3.1 here is 3.1 there. That
 * document specifies this site's own procedure and is attributed by name and
 * path rather than dressed as an external source. The Source / lineage column
 * is the one column with real content bindings and resolves through `getSource`
 * against `packages/content`, so a renamed or removed source shows up here
 * rather than rotting silently.
 *
 * NOTATION follows TRACKING-MATH rather than the mockup's typographic
 * subscripts: `Cand_0`, `N_eff`, `Bal^p`, `10^-4`. It reads correctly aloud,
 * which assertion A4 cares about, and it is the same string a reader will find
 * in the specification and in the indexer's source.
 */

/**
 * A lineage entry. `source` resolves to a bibliography record; `internal` is a
 * module or a section of this repository's own research notes, which is not a
 * `Source` and never gets a link that would imply it is one.
 */
type Lineage =
  | { readonly kind: "source"; readonly ref: SourceRef; readonly note?: string }
  | { readonly kind: "internal"; readonly text: string };

interface Estimator {
  /** TRACKING-MATH section number, kept as the row's identity. */
  readonly n: string;
  readonly name: string;
  /** The `Pill`, plus any trailing qualifier the pill itself cannot carry. */
  readonly kind: { readonly pill: "exact" | "bounded"; readonly text: string; readonly trailing?: string };
  readonly statement: ReactNode;
  /** What this estimator cannot do. Required - there is no row without one. */
  readonly refuses: ReactNode;
  readonly lineage: readonly Lineage[];
}

const ESTIMATORS: readonly Estimator[] = [
  {
    n: "3.1",
    name: "Anchor bound",
    kind: { pill: "exact", text: "hard" },
    statement: (
      <>
        For a spend with nullifier <span className="mono">nf</span> and anchor <span className="mono">A</span>:{" "}
        <span className="mono">Cand_0(nf) = {"{"}cm : pos(cm) &lt;= maxPos(A){"}"}</span>. The only universally correct
        filter - a spend publishes the anchor it was proved against, and nothing appended to the tree after that anchor can
        be the note it spent.
      </>
    ),
    refuses: (
      <>
        It bounds a set; it does not enter one. It names no candidate, and no commitment inside{" "}
        <span className="mono">Cand_0</span> is more likely than any other until a soft filter says so - a bound of one
        candidate is still not a name.
      </>
    ),
    lineage: [{ kind: "internal", text: "v0.2 rawCandidateRange - RESEARCH.md" }],
  },
  {
    n: "3.2",
    name: "Spent-count subtraction",
    kind: { pill: "exact", text: "hard · cardinality" },
    statement: (
      <>
        <span className="mono">
          |unspent &cap; Cand_0| &lt;= |Cand_0| - |{"{"}nf&#8242; published before T with anchor &lt;= A{"}"}|
        </span>
        . Nullifier uniqueness bounds how large the surviving set can be.
      </>
    ),
    refuses: (
      <>
        Cardinality only. Public data does not map a nullifier back to a commitment, so it cannot say <i>which</i>{" "}
        candidates the published nullifiers consumed - it shrinks the effective size without naming candidates.
      </>
    ),
    lineage: [{ kind: "internal", text: "RESEARCH.md, nullifier uniqueness" }],
  },
  {
    n: "3.3",
    name: "Time-window prior",
    kind: { pill: "bounded", text: "soft" },
    statement: (
      <>
        The note was received within <span className="mono">W</span> blocks of{" "}
        <span className="mono">heightCreated(A)</span>; the default is <span className="mono">W = 576</span>, about 12 hours
        at 75 seconds a block. With the weighted mode on, the posterior weight is{" "}
        <span className="mono">w_t(cm) = exp(-ln2 &middot; age(cm)/tau)</span> with a half-life{" "}
        <span className="mono">tau</span> of 2 days; uniform in the window when it is off.
      </>
    ),
    refuses: (
      <>
        A behavioural guess, and wrong for any wallet that held a note longer than the window. The prior is printed with
        every number it shaped; reject it and the surviving count returns to the line above.
      </>
    ),
    lineage: [{ kind: "internal", text: "v0.2 timeWindowFilter, anchored at heightCreated" }],
  },
  {
    n: "3.4",
    name: "Amount echo (Kappos round-trip)",
    kind: { pill: "bounded", text: "soft" },
    statement: (
      <>
        Four tolerances. Exact: <span className="mono">Y = X</span>. Fee-tolerant, as specified:{" "}
        <span className="mono">|X - Y| &lt;= 5,000 zat &times; max(2, L) &times; hops</span>; as shipped, the fixed v0.2
        constant <span className="mono">FEE_TOLERANCE_ZAT = 5,000 &times; 4 &times; 8 = 160,000 zat</span>, about 0.0016
        ZEC. <b>Relative:</b> <span className="mono">|X - Y| / X &lt;= eps</span>, default{" "}
        <span className="mono">eps = 10^-4</span>. <b>Subset-sum:</b> one shield may leave as{" "}
        <span className="mono">k &lt;= 3</span> deshields inside the window, amounts quantised to{" "}
        <span className="mono">10^4</span> zat. Graded HIGH for exact with a single candidate, MEDIUM for relative within{" "}
        <span className="mono">eps</span> or absolute within fee tolerance with a single candidate, LOW for multiple
        candidates or relative within <span className="mono">10 &middot; eps</span>.
      </>
    ),
    refuses: (
      <>
        An alignment is not a link. The pool is built so that an output cannot be tied to an input; a HIGH grade states that
        public quantities line up, never that the coins are the same coins. Split matches grade LOW unless the timing is
        tight and the split count is two.
      </>
    ),
    lineage: [
      { kind: "source", ref: "S-usenix-usenixsecurity18-sec18-kappos" },
      { kind: "source", ref: "S-arxiv-pdf-1712-01210" },
    ],
  },
  {
    n: "3.5",
    name: "Fee to logical actions",
    kind: { pill: "exact", text: "hard" },
    statement: (
      <>
        ZIP 317: <span className="mono">fee = 5,000 zat &times; max(2, L)</span>, and the transparent term of{" "}
        <span className="mono">L</span> is measured in serialised <b>bytes</b> rather than in counts:{" "}
        <span className="mono">
          L = max(ceil(inSize / 150), ceil(outSize / 34)) + 2 &middot; nJoinSplit + max(nSpendsSapling, nOutputsSapling) +
          nActionsOrchard + nActionsIronwood
        </span>
        , where <span className="mono">inSize</span> and <span className="mono">outSize</span> are the summed serialised
        sizes of the transparent inputs and of the transparent outputs, and 150 and 34 are the sizes ZIP 317 fixes for a
        standard P2PKH input and output. The transparent side is public, so <span className="mono">L</span> bounds the
        shielded arity exactly - and a non-conventional fee is itself a wallet fingerprint.{" "}
        <b>The count form</b>,{" "}
        <span className="mono">
          L_p2pkh = max(t_in, t_out) + 2 &middot; nJoinSplit + max(nSpendsSapling, nOutputsSapling) + nActionsOrchard +
          nActionsIronwood
        </span>
        , is that rule with its byte term replaced by counts. It agrees with the protocol while every transparent input
        and output is a standard P2PKH and the counts stay small - nearly every transaction on the chain - though not
        quite exactly even there, since a standard input serialises at 148 bytes against the 150 ZIP 317 rounds up to, so
        from 75 inputs the byte form falls one action behind. It diverges properly for anything larger:
        the ZIP 271 lockbox is a 2-of-3 P2SH multisig whose inputs serialise at 297 bytes each, so two of them paying one
        P2PKH output give the protocol <span className="mono">L = 4</span> and a 20,000 zat conventional fee where the
        count form gives <span className="mono">L = 2</span> and 10,000.
      </>
    ),
    refuses: (
      <>
        It bounds arity, not identity: it says how many logical actions a transaction had, never whose. That a transaction
        carries three shielded actions says nothing whatever about what is inside them. And the count form decides
        nothing: a page calling a lockbox disbursement non-conventional on its authority would be stating a falsehood
        about the one address this site follows most closely, so whether a fee is conventional is settled by the byte
        form or left unsettled.
      </>
    ),
    lineage: [
      { kind: "source", ref: "S-zcash-improvement-proposals-zip-0317" },
      {
        kind: "internal",
        text: "packages/zec-types/src/zip317.ts - the rule as Zebra implements it, zip317.rs:160-173",
      },
    ],
  },
  {
    n: "3.6",
    name: "Dummy-padding policy",
    kind: { pill: "bounded", text: "soft · wallet table" },
    statement: (
      <>
        Orchard and Ironwood action counts are padded, some wallets to even counts or fixed sizes. The observed{" "}
        <span className="mono">nActions</span>, the Sapling spend and output counts,{" "}
        <span className="mono">expiryDelta = nExpiryHeight - height</span> (zcashd 20, Zashi and Zodl 40, others vary), the
        version group and the anchor age are matched against a fingerprint table covering Zodl and Zashi, Ywallet up to
        1.15.3, Zingo, Zkool, Vizor, Cake, NozyWallet, zcashd and Zallet, and Ledger and Keystone.
      </>
    ),
    refuses: (
      <>
        The output is a likely wallet with a likelihood ratio, <b>never an identity</b>. A wallet is software, not a person,
        and the version of the fingerprint table is printed with every number it influenced, because a fingerprint is only
        as current as the table behind it.
      </>
    ),
    lineage: [{ kind: "internal", text: "v0.2 fingerprint.ts, extended" }],
  },
  {
    n: "3.7",
    name: "Anchor recency",
    kind: { pill: "bounded", text: "soft" },
    statement: (
      <>
        <span className="mono">depth(A) = tip - heightCreated(A)</span>. A depth of 0 to 3 blocks means the wallet synced
        immediately before spending; a deep anchor implies stale wallet state.
      </>
    ),
    refuses: (
      <>
        Both readings are timing signals that combine with 3.3 and claim nothing alone. Anchor depth narrows no candidate
        set by itself, and any wallet that syncs on a schedule reproduces it.
      </>
    ),
    lineage: [{ kind: "internal", text: "v0.2 anchor-depth.ts" }],
  },
  {
    n: "3.8",
    name: "Mining-pool flows",
    kind: { pill: "exact", text: "hard shape", trailing: "soft attribution" },
    statement: (
      <>
        ZIP 213 forces coinbase output through the shielded pool, and pools then unshield payouts as many-output z to t
        transactions on a schedule. Periodicity and fan-out identify them, and such transactions are labelled
        &ldquo;pool-payout shape&rdquo;.
      </>
    ),
    refuses: (
      <>
        The shape names a schedule, not an operator. A pool is attributed only when the pool itself publishes its payout
        address - which is the precedence ladder applied: a shape is <span className="mono">behaviour</span>, a published
        payout address is <span className="mono">owner-filing</span>.
      </>
    ),
    lineage: [
      { kind: "source", ref: "S-orbilu-uni-lu-1-zcash-miner-linking-2" },
      {
        kind: "source",
        ref: "S-zcash-improvement-proposals-zips-z-cash",
        note: "for ZIP 213, which has no record of its own in this corpus",
      },
    ],
  },
  {
    n: "3.9",
    name: "Migration lens",
    kind: { pill: "exact", text: "hard amounts", trailing: "soft sessions" },
    statement: (
      <>
        ZIP 318 spends one Orchard note into one Ironwood output with the net amount public and quantised to{" "}
        <span className="mono">n &times; 10^k, n in {"{"}1, 2, 5{"}"}</span>, capped at 10,000 ZEC, with dust below 0.01 ZEC
        stranded. A balance <span className="mono">B</span> decomposes canonically, so a migration session bounds the number
        of notes at <span className="mono">&gt;= ceil(B / 10,000)</span> and the set of wallets at{" "}
        <span className="mono">&lt;=</span> the number of denomination runs.
      </>
    ),
    refuses: (
      <>
        Distributions and counts per window, <b>never</b> &ldquo;wallet W migrated B&rdquo;. The wallet figure is an upper
        bound and no lower bound is claimable from public data, so it is published as an upper bound and nothing else.
      </>
    ),
    lineage: [{ kind: "source", ref: "S-zcash-improvement-proposals-zip-0318" }],
  },
  {
    n: "3.10",
    name: "Sprout to Sapling migration",
    kind: { pill: "exact", text: "hard amounts" },
    statement: (
      <>
        The same logic one pool earlier: ZIP 308 amounts of{" "}
        <span className="mono">mantissa &times; 10^exponent</span>, five transactions per 500-block window. It is what makes
        the 2019 to 2026 Sprout residual legible at all.
      </>
    ),
    refuses: (
      <>
        It bounds counts, not owners - and it says nothing about the Sprout balance that never migrated, which is the part
        of the residual that matters.
      </>
    ),
    lineage: [{ kind: "source", ref: "S-zcash-improvement-proposals-zip-0308" }],
  },
  {
    n: "3.11",
    name: "Turnstile conservation",
    kind: { pill: "exact", text: "hard · global" },
    statement: (
      <>
        For every pool and window, <span className="mono">sum of estimated exits &lt;= Bal^p</span> and{" "}
        <span className="mono">Bal^p &gt;= 0</span> (ZIP 209, all pools including Ironwood); after NU6.3 at height
        3,428,143, <span className="mono">deltaV^orchard &gt;= 0</span> (ZIP 2006 - Orchard is exit-only). Any estimator
        output that violates conservation is rejected and logged.
      </>
    ),
    refuses: (
      <>
        A veto, not a source of claims: it can remove an estimate and never produce one. And it cannot tell a forged note
        already inside a pool from a legitimate one - which is why the two unsound windows can be bounded but never cleared.
        A violation in our own replay means <i>our</i> decoder is wrong, never that the chain is wrong.
      </>
    ),
    lineage: [
      { kind: "source", ref: "S-zcash-improvement-proposals-zip-0209" },
      { kind: "source", ref: "S-zcash-improvement-proposals-zip-2006" },
    ],
  },
];

/** One lineage cell: published work as a permalink, internal references as prose. */
function LineageCell({ entries }: { readonly entries: readonly Lineage[] }) {
  return (
    <div className="cp mt-lineage">
      {entries.map((e) => {
        if (e.kind === "internal") {
          return (
            <div key={e.text} className="mt-internal">
              {e.text}
            </div>
          );
        }
        const source = getSource(e.ref);
        if (source === undefined) {
          // A dangling ref is a corpus problem, not a render problem. Say so
          // rather than dropping this row's provenance on the floor.
          return (
            <div key={e.ref} className="mt-internal">
              {e.ref} - not in the bibliography
            </div>
          );
        }
        return (
          <div key={e.ref}>
            <a href={requirePermalink(source.id)} title={`${source.publisher} - accessed ${source.accessed}`}>
              <b>{source.title}</b>
            </a>
            {e.note === undefined ? null : <span className="mt-internal"> {e.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

const COLUMNS: readonly Column<Estimator>[] = [
  { key: "n", head: "#", mono: true, cell: (r) => r.n },
  { key: "name", head: "Estimator", cell: (r) => <b>{r.name}</b> },
  {
    key: "kind",
    head: "Kind",
    cell: (r) => (
      <>
        <Pill kind={r.kind.pill}>{r.kind.text}</Pill>
        {r.kind.trailing === undefined ? null : (
          <span className="src">
            {" "}
            {"·"} {r.kind.trailing}
          </span>
        )}
      </>
    ),
  },
  {
    key: "statement",
    head: "Statement, and what it refuses",
    cell: (r) => (
      <span className="mt-statement">
        {r.statement}
        <span className="refuses">
          <b>refuses</b>
          {r.refuses}
        </span>
      </span>
    ),
  },
  { key: "lineage", head: "Source / lineage", cell: (r) => <LineageCell entries={r.lineage} /> },
];

export function MethodEstimators() {
  return (
    <DataTable
      caption="The eleven estimators, their kind, and the claim each one will not make"
      columns={COLUMNS}
      rows={ESTIMATORS}
      rowKey={(r) => r.n}
    />
  );
}

/** Counts for the block's own caption, so the split is stated rather than counted by eye. */
export const ESTIMATOR_COUNTS = {
  total: ESTIMATORS.length,
  hard: ESTIMATORS.filter((e) => e.kind.pill === "exact").length,
  soft: ESTIMATORS.filter((e) => e.kind.pill === "bounded").length,
} as const;
