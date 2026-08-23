import type { Metadata } from "next";
import Link from "next/link";

import { When, Zec } from "@/components/track/Amount";
import { TrackHead, TrackNav } from "@/components/track/TrackShell";
import { Block } from "@/components/ui/Block";
import { Conf } from "@/components/ui/Conf";
import { Glass } from "@/components/ui/Glass";
import { KV } from "@/components/ui/KV";
import { api } from "@/lib/api";
import { fmtInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "Flows",
  description: "The 2 January 2026 unshielding, as the Instrument reads it. The case file is on the Record.",
};

/**
 * 04 TRACKING - the flows summary.
 *
 * Deliverable 2: "`/flows` under Tracking is a summary linking to the Record
 * `/flows`." So this page is a summary and nothing more. It holds the ledger of
 * one day, the outcome arithmetic over that ledger, what is documented about
 * the institutions, and what is not supported - and every other thing the
 * Record says at length about labelling infrastructure, the rich list and the
 * allegations stays on the Record behind a link.
 *
 * The route is `/track/flows` rather than `/flows` because the Record owns
 * `/flows` and has since HANDOFF-03. Two pages under one URL is not a choice
 * available to anyone; a summary that links to the full file is.
 *
 * The ledger is read out of `packages/content` - case K-2026-01-02, the same
 * nine steps the Record renders. There is exactly one place the 2 January
 * movements are written down, which is the whole point of HANDOFF-03's gate
 * round 4 and of the sweep rule CLAUDE.md now carries.
 */
export default async function TrackFlowsPage() {
  const view = await api().getFlows();
  const k = view.case;

  return (
    <>
      <TrackHead
        title="Where the value"
        accent="went"
        dek={
          <>
            One day, reconstructed from the chain: the largest unshielding of the cycle, the round trip inside it, and what
            actually reached an exchange as against what was reported to have. Every line below is a transaction anyone can
            fetch. The full case file, with its labelling apparatus and its refusals, is on <Link href="/flows">the Record</Link>.
          </>
        }
      />

      <TrackNav path="/track/flows" />

      <Block idx="A" title={k.title} right={`${fmtInt(k.steps.length)} movements - verified on chain - last checked ${k.lastVerified}`}>
        <div className="tk-case">
          <Glass>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              <b>{view.headline}</b>
            </div>

            {k.steps.map((s) => (
              <div className="tk-ledger" key={`${s.stamp.text}-${s.note}`}>
                <span className="t">
                  <When stamp={s.stamp} />
                  {s.height === null ? null : ` - ${fmtInt(s.height)}`}
                </span>
                <span className="d">
                  <b>{s.from}</b>
                  {" to "}
                  <b>{s.to}</b>
                  {` - ${s.note}`}
                </span>
                <span className="a">
                  {s.txid === null ? <Zec zat={s.amountZat} signed={false} /> : <Link href={`/tx/${s.txid}`}><Zec zat={s.amountZat} signed={false} /></Link>}
                </span>
              </div>
            ))}

            <hr className="hair" style={{ margin: "12px 0" }} />

            <KV entries={view.outcome.map((o) => ({ k: o.k, v: o.v }))} />

            <p className="note" style={{ marginTop: 12, fontSize: 12, maxWidth: "72ch" }}>
              <b>Verdict.</b> {k.verdict} <Conf level={k.confidence} />
            </p>
          </Glass>

          <div>
            <Glass>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                <b>what is documented about institutions</b>
              </div>
              <KV entries={view.institutions.map((i) => ({ k: i.k, v: i.v }))} />
            </Glass>

            <div className="tk-warn" style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                <b>not supported - kept off the record</b>
              </div>
              <p className="note" style={{ fontSize: 12.5 }}>
                {view.notSupported}
              </p>
            </div>
          </div>
        </div>
      </Block>

      <Block idx="B" title="The full case file" right="the Record, not the Instrument">
        <Glass>
          <p className="note measure">
            This page is a summary of one day. <Link href="/flows">The Record&apos;s flows page</Link> carries the rest: the
            address-label registry with every labeller and its precedence, the rich list with its unbound chip on every row,
            the allegations table with what each one cites and what it does not, and the quarantine of claims that could not
            be published as fact. Nothing here restates any of it, because a figure written down twice is a figure that will
            eventually be corrected once - which is what happened to a Form 144 in HANDOFF-03 and is now a rule in CLAUDE.md.
          </p>
        </Glass>
      </Block>
    </>
  );
}
