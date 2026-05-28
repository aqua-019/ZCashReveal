import { useState } from "react";
import clsx from "clsx";
import type { RawReport } from "../hooks/useMempool";
import type { Severity, LeakClass } from "@zcashreveal/types";
import {
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  LEAK_CLASS_LABEL,
  LEAK_CLASS_COLOR,
  LEAK_CLASS_DESCRIPTION,
} from "../lib/tokens";
import { zatToZec, shortHex } from "../lib/formatters";
import { parseAssessment } from "../lib/parsers";
import {
  IconNullifier,
  IconAnchor,
  IconCommitment,
  IconValueBalance,
  IconWarn,
  IconShield,
  IconShieldCracked,
  IconCopy,
  IconArrowRight,
} from "./icons";
import { SectionHeader } from "./primitives/SectionHeader";
import { SeverityBadge } from "./primitives/SeverityBadge";
import { BoundaryFlowPanel } from "./BoundaryFlowPanel";
import { CandidatesPanel } from "./CandidatesPanel";

interface LeakPanelProps {
  report: RawReport | null;
}

export function LeakPanel({ report }: LeakPanelProps) {
  if (!report) return <Intro />;
  return (
    <article className="px-4 lg:px-8 py-5 lg:py-7 overflow-y-auto h-full">
      <Headline report={report} />
      <div className="hairline my-7" />
      <div className="grid grid-cols-1 gap-7">
        <FindingsSection findings={report.findings} />
        <LinksSection links={report.links} />
        <AnonymitySetsSection report={report} />
        <IdentitySection report={report} />
        <BoundaryFlowPanel
          saplingValueBalanceZat={report.valueFlow.saplingValueBalanceZat}
          orchardValueBalanceZat={report.valueFlow.orchardValueBalanceZat}
          netTransparentInflowZat={report.valueFlow.netTransparentInflowZat}
          direction={report.valueFlow.direction}
        />
        <SpendsSection report={report} />
        <OutputsSection report={report} />
        <FingerprintSection report={report} />
      </div>
    </article>
  );
}

function Intro() {
  return (
    <div className="px-8 py-12 overflow-y-auto h-full">
      <p className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-zec-gold)]">
        ZCASH SHIELDED MODE — LEAK ANALYSIS
      </p>
      <h1 className="display mt-4 text-[72px] leading-[0.9] text-ink" style={{ letterSpacing: "-0.03em" }}>
        Shielded <span className="display-italic text-[var(--color-zec-gold)]">≠</span> Silent.
      </h1>
      <p className="mt-6 max-w-[52ch] text-[15px] leading-[1.55] text-[var(--color-ink-muted)]">
        Zcash's zk-SNARKs hide value, sender, and recipient. They do not hide{" "}
        <em className="display-italic text-ink">metadata</em>. Every shielded transaction publishes four classes of public data on-chain — and every one of them leaks.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-4 max-w-[640px]">
        <LeakRow icon={<IconNullifier size={16} />} field="nullifiers" desc="Per-note spend markers. Globally unique. Reveal spent-set growth and timing clusters." />
        <LeakRow icon={<IconValueBalance size={16} />} field="valueBalance" desc="Net value flowing between transparent and shielded pools. Nonzero implies boundary crossing fully public." />
        <LeakRow icon={<IconAnchor size={16} />} field="anchors" desc="Merkle root of the note commitment tree at spend time. Narrows the window during which the spent note could have entered." />
        <LeakRow icon={<IconCommitment size={16} />} field="commitments" desc="New note outputs added to the tree. Counts and timing leak per transaction." />
      </div>
      <p className="mt-10 mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
        Select a transaction from the live stream to inspect →
      </p>
    </div>
  );
}

function LeakRow({ icon, field, desc }: { icon: React.ReactNode; field: string; desc: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex items-center gap-2 w-[170px] shrink-0 pt-0.5">
        <span className="text-[var(--color-zec-gold)]">{icon}</span>
        <span className="mono text-[12px] text-ink">{field}</span>
        <IconWarn size={11} className="text-[var(--color-critical)]" />
      </div>
      <p className="text-[13px] leading-[1.5] text-[var(--color-ink-muted)]">{desc}</p>
    </div>
  );
}

function Headline({ report }: { report: RawReport }) {
  const leakClass = report.leakClass as LeakClass;
  const severity = report.overallSeverity as Severity;
  return (
    <header>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">
            <span>Tx</span>
            <CopyButton text={report.txid} />
            <span className="text-ink truncate">{report.txid}</span>
          </div>
          <h2 className="display mt-4 text-[44px] leading-[0.95]" style={{ color: LEAK_CLASS_COLOR[leakClass], letterSpacing: "-0.025em" }}>
            <span className="display-italic">{LEAK_CLASS_LABEL[leakClass]}</span>
          </h2>
          <p className="mt-2 text-[13px] text-[var(--color-ink-muted)] max-w-[60ch]">
            {LEAK_CLASS_DESCRIPTION[leakClass]}
          </p>
        </div>
        <SeverityBadge severity={severity} />
      </div>
      <div className="mt-5 grid grid-cols-4 gap-4">
        <Stat label="Version">v{report.txVersion}</Stat>
        <Stat label="Tip @ seen">{report.tipHeightAtSeen.toLocaleString()}</Stat>
        <Stat label="Findings">{report.findings.length}</Stat>
        <Stat label="Wallet">
          <span className="text-ink">{report.fingerprint.likelyWallet.toLowerCase().replace(/_/g, " ")}</span>
        </Stat>
      </div>
    </header>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">{label}</span>
      <span className="mono text-[13px] text-ink">{children}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[var(--color-ink-dim)] hover:text-[var(--color-zec-gold)] transition-colors"
      title={copied ? "Copied" : "Copy"}
    >
      <IconCopy size={11} />
    </button>
  );
}

function FindingsSection({ findings }: { findings: RawReport["findings"] }) {
  if (findings.length === 0) {
    return (
      <section>
        <SectionHeader index="01" title="Findings" />
        <p className="mono text-[11px] text-[var(--color-ink-muted)]">No leak findings recorded for this transaction.</p>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader index="01" title="Findings" />
      <ul className="space-y-2">
        {findings.map((f, i) => (
          <li key={i} className="glass flex items-start gap-3 p-3 rounded-sm"
            style={{ borderLeftColor: SEVERITY_COLOR[f.severity as Severity], borderLeftWidth: 2 }}>
            <span className="pill shrink-0 mt-0.5" style={{ color: SEVERITY_COLOR[f.severity as Severity] }}>
              {SEVERITY_LABEL[f.severity as Severity]}
            </span>
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">
                {f.code.replace(/_/g, " ")}
                {f.field && <span> · {f.field}</span>}
              </div>
              <p className="text-[13px] text-ink leading-[1.5] mt-1">{f.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpendsSection({ report }: { report: RawReport }) {
  const spends = report.spends;
  if (spends.length === 0) {
    return (
      <section>
        <SectionHeader index="04" title="Spends & anchors" />
        <p className="mono text-[11px] text-[var(--color-ink-muted)]">No shielded spends.</p>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader index="04" title="Spends & anchors" />
      <div className="glass rounded-sm overflow-hidden">
        <table className="w-full mono text-[11px]">
          <thead>
            <tr className="text-left text-[var(--color-ink-dim)] uppercase tracking-[0.15em] text-[9px]">
              <th className="px-3 py-2 font-normal">Pool</th>
              <th className="px-3 py-2 font-normal">Nullifier</th>
              <th className="px-3 py-2 font-normal">Anchor</th>
              <th className="px-3 py-2 font-normal text-right">Depth</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-edge)]">
            {spends.map((s, i) => (
              <tr key={`${s.pool}-${i}`} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    {s.pool === "sapling" ? (
                      <IconShield size={11} className="text-[var(--color-ink-muted)]" />
                    ) : (
                      <IconShieldCracked size={11} className="text-[var(--color-zec-gold)]" />
                    )}
                    <span className="text-ink">{s.pool}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--color-ink-muted)]">{shortHex(s.nullifier, 8, 4)}</td>
                <td className="px-3 py-2 text-[var(--color-ink-muted)]">{shortHex(s.anchor, 8, 4)}</td>
                <td className="px-3 py-2 text-right">
                  {s.anchorDepthBlocks !== null ? (
                    <span className={clsx(s.isRecentAnchor ? "text-[var(--color-medium)]" : "text-[var(--color-ink)]")}>
                      {s.anchorDepthBlocks}<span className="text-[var(--color-ink-dim)] ml-1">blk</span>
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink-dim)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OutputsSection({ report }: { report: RawReport }) {
  const outs = report.outputs;
  if (outs.length === 0) {
    return (
      <section>
        <SectionHeader index="05" title="Outputs & commitments" />
        <p className="mono text-[11px] text-[var(--color-ink-muted)]">No shielded outputs.</p>
      </section>
    );
  }
  const saplingCount = outs.filter((o) => o.pool === "sapling").length;
  const orchardCount = outs.filter((o) => o.pool === "orchard").length;
  return (
    <section>
      <SectionHeader index="05" title="Outputs & commitments" />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <PoolCountCell pool="Sapling" count={saplingCount} />
        <PoolCountCell pool="Orchard" count={orchardCount} />
      </div>
      <div className="glass rounded-sm p-3 max-h-[180px] overflow-y-auto">
        <ul className="mono text-[10px] space-y-1">
          {outs.slice(0, 16).map((o, i) => (
            <li key={i} className="flex items-center justify-between text-[var(--color-ink-muted)]">
              <span className="flex items-center gap-2">
                <IconCommitment size={10} className={o.pool === "orchard" ? "text-[var(--color-zec-gold)]" : "text-[var(--color-ink-dim)]"} />
                <span className="text-ink">{shortHex(o.commitment, 10, 6)}</span>
              </span>
              <span className="text-[var(--color-ink-dim)]">{o.pool}</span>
            </li>
          ))}
          {outs.length > 16 && (
            <li className="text-[var(--color-ink-dim)] text-center pt-2">+ {outs.length - 16} more</li>
          )}
        </ul>
      </div>
    </section>
  );
}

function PoolCountCell({ pool, count }: { pool: string; count: number }) {
  return (
    <div className="glass p-3 rounded-sm flex items-center justify-between">
      <span className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">{pool}</span>
      <span className="display text-[24px] text-ink">{count}</span>
    </div>
  );
}

function FingerprintSection({ report }: { report: RawReport }) {
  const f = report.fingerprint;
  return (
    <section>
      <SectionHeader index="06" title="Fingerprint" />
      <div className="glass rounded-sm p-4">
        <div className="flex items-baseline justify-between">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">Wallet signature</span>
          <span className="display-italic text-[18px] text-[var(--color-zec-gold)]">
            {f.likelyWallet.toLowerCase().replace(/_/g, " ")}
          </span>
        </div>
        <div className="hairline my-3" />
        <dl className="grid grid-cols-2 gap-y-2 mono text-[11px]">
          <Datum k="Fee (zat)" v={f.feeZat} />
          <Datum k="ZIP-317" v={f.isZip317ConventionalFee ? "conventional" : "non-standard"} />
          <Datum k="Expiry delta" v={f.expiryDelta !== null ? `${f.expiryDelta} blocks` : "—"} />
          <Datum k="Output padding" v={f.outputPadded ? "padded" : "tight"} />
        </dl>
      </div>
    </section>
  );
}

function Datum({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <dt className="text-[var(--color-ink-dim)]">{k}</dt>
      <dd className="text-ink text-right">{v}</dd>
    </>
  );
}

function IdentitySection({ report }: { report: RawReport }) {
  return (
    <section>
      <SectionHeader index="02" title="Sender & recipient identity" />
      <p className="text-[12px] leading-[1.5] text-[var(--color-ink-muted)] mb-5 max-w-[68ch]">
        Shielded transactions hide wallet addresses via zk-SNARK. They do{" "}
        <em className="display-italic text-ink">not</em> hide the per-note cryptographic identifiers — every spend publishes a unique{" "}
        <span className="text-[var(--color-zec-gold)] mono text-[11px]">nullifier</span>{" "}
        and every output publishes a unique{" "}
        <span className="text-[var(--color-zec-gold)] mono text-[11px]">commitment</span>.
        These are public, globally unique per-tx pseudonyms.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IdentityCard side="SENDER"
          transparentAddresses={report.identity.sender.transparentAddresses}
          nullifiers={report.identity.sender.nullifiers}
          commitments={report.identity.sender.commitments} />
        <IdentityCard side="RECIPIENT"
          transparentAddresses={report.identity.recipient.transparentAddresses}
          nullifiers={report.identity.recipient.nullifiers}
          commitments={report.identity.recipient.commitments} />
      </div>
    </section>
  );
}

function IdentityCard({
  side, transparentAddresses, nullifiers, commitments,
}: {
  side: "SENDER" | "RECIPIENT";
  transparentAddresses: string[];
  nullifiers: Array<{ pool: "sapling" | "orchard"; value: string }>;
  commitments: Array<{ pool: "sapling" | "orchard"; value: string }>;
}) {
  const isSender = side === "SENDER";
  return (
    <div className="glass rounded-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">{side}</span>
        <span className="display-italic text-[14px] text-ink">{isSender ? "inputs to" : "from outputs"}</span>
      </div>
      <IdentityBlock label="Transparent address" empty="no transparent side" emptySubtle
        items={transparentAddresses.map((a) => ({ primary: a, tag: "t-addr", color: "var(--color-critical)" }))} />
      {isSender && (
        <IdentityBlock label="Nullifier (sender pseudonym)" empty="no shielded spend" emptySubtle
          items={nullifiers.map((n) => ({ primary: shortHex(n.value, 12, 8), tag: n.pool, color: "var(--color-zec-gold)" }))} />
      )}
      {!isSender && (
        <IdentityBlock label="Note commitment (recipient pseudonym)" empty="no shielded output" emptySubtle
          items={commitments.map((c) => ({ primary: shortHex(c.value, 12, 8), tag: c.pool, color: "var(--color-zec-gold)" }))} />
      )}
      {((isSender && nullifiers.length > 0) || (!isSender && commitments.length > 0)) && (
        <div className="border-t border-[var(--color-edge)] pt-3">
          <div className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)] mb-1">Wallet address</div>
          <div className="flex items-center gap-2 mono text-[11px] text-[var(--color-ink-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pure)]" />
            <em className="display-italic text-[13px] text-[var(--color-pure)]">hidden</em>
            <span className="text-[var(--color-ink-dim)]">· zk-SNARK encrypted</span>
          </div>
        </div>
      )}
    </div>
  );
}

function IdentityBlock({
  label, empty, emptySubtle, items,
}: {
  label: string; empty: string; emptySubtle: boolean;
  items: Array<{ primary: string; tag: string; color: string }>;
}) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)] mb-1.5">{label}</div>
      {items.length === 0 ? (
        <div className={clsx("mono text-[11px]", emptySubtle ? "text-[var(--color-ink-dim)]" : "text-[var(--color-ink-muted)]")}>
          — <span className="text-[var(--color-ink-dim)]">{empty}</span>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 mono text-[11px]">
              <span className="flex items-center gap-2 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                <span className="text-ink truncate" style={{ color: it.color }}>{it.primary}</span>
              </span>
              <span className="text-[var(--color-ink-dim)] shrink-0 text-[10px] uppercase tracking-[0.1em]">{it.tag}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinksSection({ links }: { links: RawReport["links"] }) {
  if (!links || links.length === 0) return null;
  return (
    <section>
      <SectionHeader index="07" title="Round-trip links" />
      <p className="text-[12px] leading-[1.5] text-[var(--color-ink-muted)] mb-4 max-w-[68ch]">
        This transaction was matched to a counterparty across the shielded fog. The amounts correlate within ZIP-317 fee tolerance — strong evidence the same entity sits on both sides.
      </p>
      <ul className="space-y-3">
        {links.map((l, i) => (
          <li key={i} className="glass rounded-sm p-4"
            style={{
              borderLeftWidth: 2,
              borderLeftColor: l.confidence === "HIGH" ? "var(--color-critical)"
                : l.confidence === "MEDIUM" ? "var(--color-high)" : "var(--color-medium)",
            }}>
            <div className="flex items-center justify-between mb-3">
              <span className="pill" style={{
                color: l.confidence === "HIGH" ? "var(--color-critical)"
                  : l.confidence === "MEDIUM" ? "var(--color-high)" : "var(--color-medium)",
              }}>{l.confidence}</span>
              <span className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-dim)]">
                {l.matchKind === "EXACT" ? "exact amount" : "fee-tolerant"} · {l.poolPath}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div className="space-y-1">
                <div className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">Sender (t to z)</div>
                <div className="mono text-[11px] text-[var(--color-deposit)] break-all">{l.senderAddress ?? "—"}</div>
                <div className="mono text-[10px] text-[var(--color-ink-dim)]">{shortHex(l.shieldingTxid, 8, 6)}</div>
              </div>
              <div className="hidden lg:flex items-center justify-center">
                <span className="display-italic text-[24px] text-[var(--color-zec-gold)]">→</span>
              </div>
              <div className="space-y-1 lg:text-right">
                <div className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)]">Recipient (z to t)</div>
                <div className="mono text-[11px] text-[var(--color-withdrawal)] break-all">{l.recipientAddress ?? "—"}</div>
                <div className="mono text-[10px] text-[var(--color-ink-dim)]">{shortHex(l.unshieldingTxid, 8, 6)}</div>
              </div>
            </div>
            <div className="hairline my-3" />
            <div className="flex items-center justify-between mono text-[11px]">
              <span className="display text-[18px] text-ink">
                {zatToZec(l.amountZat)}<span className="text-[var(--color-ink-dim)] text-[10px] ml-1">ZEC</span>
              </span>
              <span className="text-[var(--color-ink-muted)]">time delta {fmtMs(l.timeDeltaMs)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function fmtMs(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function AnonymitySetsSection({ report }: { report: RawReport }) {
  const spendsWithAssessment = report.spends.filter(
    (s) => s.assessment !== undefined,
  );
  const linksWithAssessment = (report.links ?? []).filter(
    (l) => l.assessment !== undefined,
  );
  if (spendsWithAssessment.length === 0 && linksWithAssessment.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeader index="08" title="Anonymity sets" />
      <p className="text-[12px] leading-[1.5] text-[var(--color-ink-muted)] mb-4 max-w-[68ch]">
        Each shielded spend has a candidate set of commitments it could be
        consuming. The filter chain narrows that set under explicit
        assumptions — never identifying a specific note, only bounding how
        many remain.
      </p>
      <div className="space-y-4">
        {spendsWithAssessment.map((s) => (
          <CandidatesPanel
            key={`spend-${s.pool}-${s.index}`}
            assessment={parseAssessment(s.assessment!)}
            spendIndex={s.index}
          />
        ))}
        {linksWithAssessment.length > 0 && (
          <>
            <div className="hairline my-2" />
            <h4 className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-dim)] mb-3">
              Round-trip link assessments
            </h4>
            {linksWithAssessment.map((l, i) => (
              <CandidatesPanel
                key={`link-${i}`}
                assessment={parseAssessment(l.assessment!)}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
