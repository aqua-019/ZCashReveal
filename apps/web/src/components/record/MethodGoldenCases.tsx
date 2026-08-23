import type { ReactNode } from "react";

import { getCase, requirePermalink, resolveSources, type Case, type CaseStep } from "@zcashreveal/content";

import { Cite } from "@/components/record/Cite";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pill } from "@/components/ui/Pill";
import { zatToZecGrouped } from "@/lib/format";

/**
 * The four calibration cases the graders must pass before anything ships.
 *
 * These are not illustrations. They are test expectations, and two of the four
 * are expectations that the grader will <i>refuse</i> to make a claim: the
 * lockbox echo has tight timing and the same address on both legs and must
 * still come out LOW, and the 202,076 ZEC unshielding must come out
 * `aggregate_only` rather than a guess. A calibration set containing only
 * successes calibrates nothing.
 *
 * EVERY NUMBER IN THE CHAIN-FACTS COLUMN IS COMPUTED from the two amount
 * strings and the two timestamps of the corpus's own case steps, in zatoshi
 * arithmetic, at render time. Nothing here is a transcribed figure that could
 * drift away from the seed behind it. Where the computed value and
 * docs/2.0/TRACKING-MATH.md's rounded prose differ - the round trip is 51 min
 * 35 s and the document says "52 min" - the computed value is printed and the
 * document's rounding is named. Silently printing the rounder number would be
 * the small dishonesty this page exists to rule out.
 *
 * THE REQUIRED-GRADE COLUMN IS NOT `case.confidence`. `Case.confidence` is the
 * research confidence in the reconstruction; the grade is what the amount-echo
 * grader must return, or the claim level the assessment must reach. They are
 * different ladders and conflating them is exactly the defect this page exists
 * to prevent, so the grades are authored as test expectations and the research
 * confidence is rendered separately, in the citation, where it belongs.
 */

const ZAT_PER_ZEC = 100_000_000n;

/** A ZEC decimal string to zatoshi, exactly. No float touches an amount. */
function zecToZat(zec: string): bigint {
  const negative = zec.startsWith("-");
  const body = negative ? zec.slice(1) : zec;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? "" : body.slice(dot + 1);
  const padded = `${frac}00000000`.slice(0, 8);
  const value = BigInt(whole) * ZAT_PER_ZEC + BigInt(padded);
  return negative ? -value : value;
}

/** Scientific notation with one significant decimal: 8.1 x 10^-6. */
function sci(value: number, digits = 1): string {
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${mantissa.toFixed(digits)} x 10^${exponent}`;
}

/** The gap between two ISO timestamps, to the second. Rounding is the caller's business. */
function gap(fromIso: string, toIso: string): string {
  const seconds = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Shortened txid for a facts cell. The full hex lives on /flows and in the case file. */
function shortTx(txid: string): string {
  return `${txid.slice(0, 8)}...`;
}

function stepByTxid(record: Case | undefined, txid: string): CaseStep | undefined {
  return record?.steps.find((s) => s.txid === txid);
}

interface GoldenRow {
  readonly key: string;
  readonly title: string;
  readonly facts: ReactNode;
  /** The grade the grader must return. A test expectation, not a research confidence. */
  readonly grade: ReactNode;
  readonly why: ReactNode;
  /** The case the row is computed from, for the claim apparatus. */
  readonly source: Case;
}

const COLUMNS: readonly Column<GoldenRow>[] = [
  {
    key: "case",
    head: "Case",
    cell: (r) => (
      <>
        <b>{r.title}</b>
        <span className="claim">
          <a className="anchor" href={requirePermalink(r.source.id)}>
            {r.source.id}
          </a>
          <Cite
            id={r.source.id}
            lastVerified={r.source.lastVerified}
            confidence={r.source.confidence}
            sources={resolveSources(r.source.sources)}
          />
        </span>
      </>
    ),
  },
  { key: "facts", head: "Chain facts, computed from the case steps", cell: (r) => <span className="mt-facts">{r.facts}</span> },
  { key: "grade", head: "Required grade", cell: (r) => r.grade },
  { key: "why", head: "Why it matters", cell: (r) => r.why },
];

export function MethodGoldenCases() {
  const jan = getCase("K-2026-01-02");
  const lockbox = getCase("K-zip271-lockbox");
  const unshield = getCase("K-202076-unshield");

  const rows: GoldenRow[] = [];

  /* -- 1. the 2 Jan 2026 round-trip ---------------------------------------- */
  const shield = stepByTxid(jan, "a79347138b88b5a0405c643964c8ef308240fa5ea1058f6e35e40789f4b621c0");
  const deshield = stepByTxid(jan, "7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c");
  if (jan !== undefined && shield !== undefined && deshield !== undefined) {
    const x = zecToZat(shield.amount);
    const y = zecToZat(deshield.amount);
    const delta = x - y;
    const relative = Number(delta) / Number(x);
    // The v0.2 absolute tolerance, from apps/indexer/src/analysis/constants.ts:
    // 5,000 zat marginal fee x 4 internal hops x 8 safety margin.
    const toleranceZat = 160_000n;
    const overTolerance = Number(delta) / Number(toleranceZat);
    const insideEpsilon = 1e-4 / relative;
    rows.push({
      key: "round-trip",
      title: "2 Jan 2026 round-trip",
      source: jan,
      facts: (
        <>
          <span className="mono">{shortTx(shield.txid ?? "")}</span> shields{" "}
          <span className="mono">{zatToZecGrouped(x)}</span> at {shield.time.slice(11, 19)} UTC;{" "}
          <span className="mono">{shortTx(deshield.txid ?? "")}</span> unshields{" "}
          <span className="mono">{zatToZecGrouped(y)}</span> at {deshield.time.slice(11, 19)} to a fresh, single-use
          address.
          <br />
          Residual <span className="mono">{zatToZecGrouped(delta)}</span> ZEC, relative{" "}
          <span className="mono">{sci(relative)}</span>, gap <span className="mono">{gap(shield.time, deshield.time)}</span>
          .
        </>
      ),
      grade: <Chip tone="gold">MEDIUM</Chip>,
      why: (
        <>
          The v0.2 absolute tolerance of 160,000 zat, about 0.0016 ZEC, misses it by a factor of{" "}
          {overTolerance.toFixed(0)}. The relative rule catches it with a factor of {insideEpsilon.toFixed(0)} to spare
          inside <span className="mono">eps = 10^-4</span>. A single candidate at that tolerance is MEDIUM, not HIGH.
          <span className="refuses">
            <b>refuses</b>
            <span>
              MEDIUM is the ceiling here and not a modest HIGH. The candidate set is the whole commitment tree at that
              anchor and this site prints no size for it, because no source in the corpus states one; what makes the row
              worth publishing is that four public quantities align, not that any one of them is decisive. The link is
              unprovable by design.
            </span>
          </span>
        </>
      ),
    });
  }

  /* -- 2. the lockbox partial echo ----------------------------------------- */
  const lockOut = stepByTxid(lockbox, "eaedfdddd569ef24eaeeae9642746aaa26959a0e7f35ccb32aef660277ade2a9");
  const lockBack = stepByTxid(lockbox, "1f6099a47cac73924e53ad36b00f3d2bfa81820d526a87d866db4bc71faa663f");
  if (lockbox !== undefined && lockOut !== undefined && lockBack !== undefined) {
    const x = zecToZat(lockOut.amount);
    const y = zecToZat(lockBack.amount);
    const delta = x - y;
    const relative = Number(delta) / Number(x);
    const outsideEpsilon = relative / 1e-4;
    const outsideLoosest = relative / 1e-3;
    rows.push({
      key: "lockbox",
      title: "Lockbox partial echo",
      source: lockbox,
      facts: (
        <>
          <span className="mono">{shortTx(lockOut.txid ?? "")}</span> shields{" "}
          <span className="mono">{zatToZecGrouped(x)}</span> on {lockOut.time.slice(0, 10)} at{" "}
          {lockOut.time.slice(11, 19)} UTC; <span className="mono">{shortTx(lockBack.txid ?? "")}</span> returns{" "}
          <span className="mono">{zatToZecGrouped(y)}</span> to the same multisig at {lockBack.time.slice(11, 19)}.
          <br />
          Residual <span className="mono">{zatToZecGrouped(delta)}</span> ZEC, relative{" "}
          <span className="mono">{(relative * 100).toFixed(1)}%</span>, gap{" "}
          <span className="mono">{gap(lockOut.time, lockBack.time)}</span>.
        </>
      ),
      grade: <Chip>LOW</Chip>,
      why: (
        <>
          Everything a matcher likes is here: twenty minutes apart, and the same consensus-defined address on both legs. The
          residual is {outsideEpsilon.toFixed(0)} times outside <span className="mono">eps</span> and still{" "}
          {outsideLoosest.toFixed(0)} times outside the loosest relative grade at{" "}
          <span className="mono">10 eps</span>, so no relative grade applies at all.
          <span className="refuses">
            <b>refuses</b>
            <span>
              This is the test of the grader&apos;s restraint. It must show the pair and refuse to claim it - a strong prior
              from timing and address reuse does not license a link the amount rule rejects.
            </span>
          </span>
        </>
      ),
    });
  }

  /* -- 3. the 202,076.207 unshielding -------------------------------------- */
  const big = stepByTxid(unshield, "e179e5b0f9fec1c6a9718b1dbe8cedddf1d8e494db276fe72c047a153365a163");
  if (unshield !== undefined && big !== undefined) {
    rows.push({
      key: "unshield",
      title: "202,076.207 unshielding",
      source: unshield,
      facts: (
        <>
          <span className="mono">{shortTx(big.txid ?? "")}</span> pays{" "}
          <span className="mono">{zatToZecGrouped(zecToZat(big.amount))}</span> ZEC out of the pool at{" "}
          {big.time.slice(0, 10)} {big.time.slice(11, 19)} UTC, from a transaction with zero transparent inputs, to{" "}
          <span className="mono">{big.to.slice(0, 10)}...</span>. As of the corpus&apos;s last check the address has never
          spent.
        </>
      ),
      grade: <Chip tone="ok">aggregate_only</Chip>,
      why: (
        <>
          There is no in-window shield of comparable size, so <span className="mono">Cand_0</span> is the whole tree and{" "}
          <span className="mono">N_eff</span> stays above every threshold.
          <span className="refuses">
            <b>refuses</b>
            <span>
              The explorer must say the origin is unresolved, and not guess. This is the row that most tempts a
              guess - the largest single exit of the period - and the correct output is the one that names nothing.
            </span>
          </span>
        </>
      ),
    });
  }

  /* -- 4. the transparent sum ---------------------------------------------- */
  const trancheA = stepByTxid(jan, "7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c");
  const trancheB = stepByTxid(jan, "6db13a92f870a655e9a03d5914cad2dcc1be22be205ef781abce4eebf6ca6062");
  const consolidation = stepByTxid(jan, "ba0783815529f9825d3d3a8c2d7f3dafe63468e4b5b60dcec61f7d54d1dee84c");
  if (jan !== undefined && trancheA !== undefined && trancheB !== undefined && consolidation !== undefined) {
    const a = zecToZat(trancheA.amount);
    const b = zecToZat(trancheB.amount);
    const total = zecToZat(consolidation.amount);
    const sum = a + b;
    const residual = total - sum;
    rows.push({
      key: "transparent-sum",
      title: "Transparent sum",
      source: jan,
      facts: (
        <>
          <span className="mono">
            {zatToZecGrouped(a)} + {zatToZecGrouped(b)} = {zatToZecGrouped(sum)}
          </span>{" "}
          against <span className="mono">{zatToZecGrouped(total)}</span> consolidated to the hot wallet at{" "}
          {consolidation.time.slice(11, 19)} UTC. Difference{" "}
          <span className="mono">{zatToZecGrouped(residual, 8)}</span> ZEC.
        </>
      ),
      grade: <Pill kind="exact" />,
      why: (
        <>
          Transparent arithmetic is exact and this row is the control: it is the only one on the page whose answer needs no
          assumption at all. The difference is the second tranche&apos;s own residual, printed rather than smoothed.
          <span className="refuses">
            <b>refuses</b>
            <span>
              Exact about the transparent legs and silent about where either tranche came from inside the pool. An exact sum
              on this side of the boundary licenses nothing on the other side.
            </span>
          </span>
        </>
      ),
    });
  }

  return (
    <>
      <DataTable
        caption="Four golden cases, and the grade each one must receive"
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.key}
      />

      <p className="note measure" style={{ marginTop: 12 }}>
        The Required grade column is a <b>test expectation</b>, not a confidence rating. The confidence shown in each
        citation is the research confidence in the reconstruction of the case, which is a different ladder measuring a
        different thing; a case can be reconstructed with high confidence and still be required to grade LOW, and the
        lockbox row is exactly that. Every figure in the chain-facts column is computed from the case steps in zatoshi
        arithmetic at render time. Where <span className="mono">docs/2.0/TRACKING-MATH.md</span> rounds - it writes 52
        minutes for the round trip and 20 for the lockbox - the computed value is what is printed here.
      </p>

      <p className="note measure" style={{ marginTop: 10 }}>
        Beyond the four: unit tests per estimator, property tests for conservation (section 3.11), and regression tests that
        the v0.2 audit-record shape has not changed.
      </p>

      <div className="refuses" style={{ marginTop: 10 }}>
        <b>not yet calibrated</b>
        <span>
          <span className="mono">p_change</span>, <span className="mono">eps</span> and{" "}
          <span className="mono">tau</span> are to be calibrated on 2025 and 2026 blocks with the calibration date printed
          in the footer. That has not been done. <span className="mono">eps = 10^-4</span> and{" "}
          <span className="mono">tau = 2 days</span> are stated defaults carried from the specification, and{" "}
          <span className="mono">p_change</span> has no Zcash value at all - so there is no calibration date in the footer
          yet, and this paragraph stands in for one.
        </span>
      </div>
    </>
  );
}
