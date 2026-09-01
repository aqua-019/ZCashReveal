import type { ReactNode } from "react";

import { Working } from "@/components/record/Working";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pill } from "@/components/ui/Pill";

/**
 * What a query can honestly return, by the kind of thing the reader asked for.
 *
 * The point of the table is the second column. A reader arrives thinking in
 * addresses, because that is the unit every other explorer is built on; the
 * chain does not contain a shielded address at all, and no amount of analysis
 * can put one there. Setting "what the chain contains" beside "what ZECReveal
 * returns" is the argument of the page in one grid, and the row where the two
 * columns diverge most is the row that matters.
 *
 * NOTATION. Formulas and symbols are written the way
 * docs/2.0/TRACKING-MATH.md writes them - `Cand_0`, `N_eff`, `Bal^p`,
 * `deltaV^p` - rather than with typographic subscripts. Two reasons, and the
 * second is the stronger: a screen reader announces `N<sub>eff</sub>` as "N eff"
 * with no separation, which assertion A4 is there to catch; and the symbol a
 * reader sees here is then the same string they will find in TRACKING-MATH and
 * in the indexer's source.
 *
 * PROVENANCE. Every row is section 0 of docs/2.0/TRACKING-MATH.md. That
 * document specifies this site's own procedure and is not an external source,
 * so it is attributed by name and path and carries no `sources[]` entry -
 * inventing one would be the exact defect this page exists to argue against.
 *
 * THE GRID IS COLLAPSED AND THE REFUSAL BELOW IT IS NOT (HANDOFF-04b R4), and
 * on this page the split needed deciding rather than applying. A naive reading
 * of the collapse rule - "collapse the method walk-through" - would fold /method
 * into a page of shut triangles, because the method walk-through IS this page's
 * claim. So the line drawn here is REFERENCE against ARGUMENT: the four-by-four
 * grid is reference, a lookup a reader consults for the row they arrived with,
 * and the three sentences under it - a sender or recipient inside the pool, a
 * balance without a key, an owner from behaviour - are the argument and stay in
 * the open. The grid's summary carries both counts, so a reader who never opens
 * it still learns that one of the four query kinds is answered "undefined by
 * construction", which is the row the whole page turns on.
 */

/**
 * Local presentational union, not a content field. The exactness column says
 * what kind of number a row produces, which is the `Pill` vocabulary in the
 * component layer; nothing in `packages/content` models it.
 */
type Exactness = "exact" | "bounded" | "undefined";

interface QueryRow {
  readonly key: string;
  /** The unit the reader typed. */
  readonly query: ReactNode;
  /** What is actually serialised on chain for it. */
  readonly chain: ReactNode;
  /** What this site will answer. */
  readonly returns: ReactNode;
  readonly exactness: readonly { readonly kind: Exactness; readonly text: string; readonly qualifier: string }[];
}

const ROWS: readonly QueryRow[] = [
  {
    key: "transparent",
    query: (
      <>
        <b>Transparent address</b>
        <br />
        <span className="mono">t1...</span> P2PKH {"·"} <span className="mono">t3...</span> P2SH
      </>
    ),
    chain: <>Every UTXO, every spend, every counterparty, every amount, every fee.</>,
    returns: (
      <>
        Balance, full history, counterparties, cluster membership, and <b>boundary events</b> - this address shielding, or
        being paid from the pool - each with a pool-side estimate.
      </>
    ),
    exactness: [
      { kind: "exact", text: "exact", qualifier: "transparent side" },
      { kind: "bounded", text: "bounded", qualifier: "pool side" },
    ],
  },
  {
    key: "shielded",
    query: (
      <>
        <b>Shielded address</b>
        <br />
        <span className="mono">zs1...</span> {"·"} <span className="mono">zc...</span> {"·"} the shielded receivers of a{" "}
        <span className="mono">u1...</span> unified address
      </>
    ),
    chain: (
      <>
        <b>Nothing.</b> The address is never serialised on chain. Notes are commitments and ciphertexts; spends are
        nullifiers.
      </>
    ),
    returns: (
      <>
        <b>Mode A</b>, with a viewing key: exact balance and history by trial decryption in the browser. <b>Mode B</b>,
        without one: the honest statement that the address is not an on-chain object, the pool-level context, and a route
        into transaction and transparent queries.
      </>
    ),
    exactness: [
      { kind: "exact", text: "exact", qualifier: "Mode A, with a key" },
      { kind: "undefined", text: "undefined", qualifier: "Mode B - undefined by construction" },
    ],
  },
  {
    key: "txid",
    query: <b>Transaction id</b>,
    chain: (
      <>
        Version, pools touched, <span className="mono">valueBalance</span> per pool, nullifiers, anchors, commitments,
        transparent in and out, fee, expiry, action counts.
      </>
    ),
    returns: (
      <>
        Leak class, the per-spend candidate set <span className="mono">Cand_0</span>, <span className="mono">N_eff</span>, a
        claim level, round-trip links, a wallet fingerprint, and what this transaction publishes about itself.
      </>
    ),
    exactness: [
      { kind: "exact", text: "public fields", qualifier: "as decoded" },
      { kind: "bounded", text: "inferences", qualifier: "with their assumptions" },
    ],
  },
  {
    key: "block",
    query: <b>Block or height</b>,
    chain: <>Everything above, per transaction; the coinbase; the funding-stream outputs.</>,
    returns: <>Per-pool deltas, migrations, and the turnstile ledger.</>,
    exactness: [{ kind: "exact", text: "exact", qualifier: "arithmetic over public fields" }],
  },
];

const COLUMNS: readonly Column<QueryRow>[] = [
  { key: "query", head: "Query", cell: (r) => r.query },
  { key: "chain", head: "What the chain contains", cell: (r) => r.chain },
  { key: "returns", head: "What ZECReveal returns", cell: (r) => r.returns },
  {
    key: "exactness",
    head: "Exactness",
    cell: (r) => (
      <>
        {r.exactness.map((e) => (
          <span key={e.text} style={{ display: "block", marginBottom: 4 }}>
            <Pill kind={e.kind}>{e.text}</Pill> <span className="src">{e.qualifier}</span>
          </span>
        ))}
      </>
    ),
  },
];

/**
 * The rows whose Exactness column carries an `undefined` verdict, kept as the
 * ROWS THEMSELVES rather than as a number.
 *
 * Both halves of the summary below then read `.length` off an array the table
 * also renders, so a summary saying "4 kinds" over a table of five is not
 * reachable. The second count is the one worth carrying in the closed state:
 * exactly one of the four kinds - a shielded address, in Mode B - is answered
 * "undefined by construction", and that is the row the page turns on.
 *
 * The first draft of this held a `QUERY_COUNTS` object of two numbers, and
 * `test/unit/summary-findings.test.ts` rejected it: its predicate accepts a
 * literal digit or an interpolation naming `length`, `count`, `total` or
 * `size`, and `QUERY_COUNTS.kinds` is none of those. Widening the checker was
 * the wrong repair - it reads the call site precisely because a summary's
 * finding is a prop it cannot otherwise see - so the call site names the array.
 */
const UNDEFINED_ROWS = ROWS.filter((r) => r.exactness.some((e) => e.kind === "undefined"));

export function MethodQueryTable() {
  return (
    <>
      <Working
        title="What each query kind can honestly return"
        finding={`${ROWS.length} kinds, ${UNDEFINED_ROWS.length} undefined by construction`}
      >
        <DataTable
          caption="What each kind of query can honestly return"
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.key}
        />
      </Working>
      <div className="refuses" style={{ marginTop: 12 }}>
        <b>never returned</b>
        <span>
          A sender or recipient <i>inside</i> the shielded pool. A shielded balance without a key. An owner for any address
          that is not named by consensus rules or by the owner&apos;s own filing. No estimator below moves any of the three
          from the left column into the right one, and none of the three is a limitation this site intends to remove.
        </span>
      </div>
    </>
  );
}
