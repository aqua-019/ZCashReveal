import { Working } from "@/components/record/Working";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glass } from "@/components/ui/Glass";

/**
 * The posterior: how eleven estimators become one number a reader is allowed to
 * see, and what that number is not.
 *
 * The arithmetic is small and worth reading in full, because the shape of it is
 * the argument. Each candidate origin gets a weight from four likelihood terms;
 * the weights are normalised into a distribution; the distribution's Shannon
 * entropy is converted back into a count. `N_eff` is therefore not "how many
 * candidates survived" - it is how many equally likely candidates the surviving
 * distribution is worth. A filter stack that leaves 400 candidates of which one
 * carries most of the mass has a small `N_eff`, and the claim level says so.
 *
 * The only published output is `N_eff` and the claim level it maps to. The
 * top-three candidates and their weights are shown on a transaction page so a
 * reader can audit the arithmetic; they are commitment positions in a tree, and
 * a commitment position is not a person, an address or an owner.
 *
 * PROVENANCE: docs/2.0/TRACKING-MATH.md section 4, verbatim in substance. The
 * entropy primitives are `@zcashreveal/instruments`' entropy.ts and the claim
 * mapping is its claim-classifier.ts.
 */

/**
 * The three lines TRACKING-MATH section 4 states, in `.code` - the site's one
 * preformatted-block treatment, shared with the /beware diff and the /flows
 * reconstruction ledger since the HANDOFF-04 de-duplication pass. They are set
 * as text rather than as an image or a typeset block: a reader who wants to
 * check the arithmetic should be able to select it.
 */
const POSTERIOR = `w_j  proportional to  L_amount(Y | X_j) . L_time(h - h_j) . L_fp(T, T_j) . L_struct(T_j)
p_j  =  w_j / sum of w
H    =  - sum over j of  p_j log2 p_j        N_eff = 2^H        claim = level(N_eff)`;

interface Term {
  readonly term: string;
  readonly value: string;
  readonly tunable: string;
}

/** The four likelihood terms, and which of them a reader is entitled to argue with. */
const TERMS: readonly Term[] = [
  { term: "L_amount", value: "1 for an exact match; exp(-(|X_j - Y| / X_j) / eps) for a relative one", tunable: "eps = 10^-4" },
  { term: "L_time", value: "the half-life kernel exp(-ln2 . age / tau)", tunable: "tau = 2 days" },
  { term: "L_fp", value: "1.0 when the wallet fingerprints agree, 0.5 when they disagree", tunable: "tunable, and it is a soft signal" },
  {
    term: "L_struct",
    value: "down-weights candidates already consumed by a HIGH link, one-to-one, greedy by weight",
    tunable: "structural, not behavioural",
  },
];

/**
 * The derivation's own two counts, read off the objects the panel renders.
 *
 * The line count comes from splitting `POSTERIOR` rather than from a literal
 * `3`: the constant is a template literal a later editor will add a line to,
 * and a summary that then said three over four lines would be the one thing a
 * closed panel must never be, which is wrong about what it is closed over.
 */
const POSTERIOR_LINES = POSTERIOR.split("\n").length;

export function MethodPosterior() {
  return (
    <Glass>
      <Eyebrow className="mt-card-eyebrow" idx="the posterior">
        four likelihoods, one distribution, one number
      </Eyebrow>

      {/* THE ARITHMETIC IS COLLAPSED AND THE REFUSAL IS NOT (HANDOFF-04b R4).
          `H = - sum over j of p_j log2 p_j` is the literal instance of the
          reader's "cryptographic terminology" beat - three lines of notation
          arriving before any sentence saying what the number is for - and the
          symbol table is the same material one layer down, so the two travel
          together rather than leaving a reader with definitions for formulas
          they can no longer see. What stays in the open is the paragraph naming
          the five things every transaction page prints beside the number, and
          the refusal below it, because those are the argument. */}
      <Working
        title="The posterior, line by line"
        finding={`${POSTERIOR_LINES} lines, ${TERMS.length} likelihood terms`}
      >
        <pre className="code">{POSTERIOR}</pre>

        <dl className="kv mt-ladder" style={{ marginTop: 12 }}>
          {TERMS.map((t) => (
            <div key={t.term} style={{ display: "contents" }}>
              <dt className="k">{t.term}</dt>
              <dd className="v" style={{ margin: 0 }}>
                <span>
                  {t.value} <span className="src">{t.tunable}</span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </Working>

      <p className="note" style={{ marginTop: 12 }}>
        Every transaction page prints the same five things beside the number: the candidate count before and after each
        filter, the top three candidates with their <span className="mono">p_j</span>,{" "}
        <span className="mono">N_eff</span>, the claim chip, and the assumption sentences -{" "}
        <span className="mono">W</span>, <span className="mono">tau</span>, <span className="mono">eps</span> and the
        fingerprint-table version. A posterior published without them would be a number with no way to disagree with it.
      </p>

      <div className="refuses" style={{ marginTop: 12 }}>
        <b>what the posterior is not</b>
        <span>
          It is a weighting over commitment positions in a tree, and a commitment position is not a person, an address or an
          owner. A weight of 0.97 on one candidate is a statement about how the public quantities line up, not a claim that
          the note is that candidate - and the v0.2 baseline this replaces was uniform, so any weighting at all is an
          assumption that has to be declared before it is used.
        </span>
      </div>
    </Glass>
  );
}

/**
 * The right-hand card: the multi-hop extension, and the closing refusal.
 *
 * The taint paragraph describes a picture and deliberately does not draw one.
 * The drawing belongs on /flows, where the edges have real weights behind them;
 * a diagram here would be an illustration of a method rather than a rendering
 * of data, and this surface carries no charts at all.
 */
export function MethodTaint() {
  return (
    <Glass>
      <Eyebrow className="mt-card-eyebrow" idx="flow estimate over hops">
        what the drawing on /flows is a drawing of
      </Eyebrow>
      <p className="note">
        From a transparent address, follow value through <span className="mono">k &lt;= 3</span> boundary crossings,
        multiplying <span className="mono">p_j</span> along the paths. Edges are drawn with opacity proportional to weight
        and cut at <span className="mono">p &lt; 0.02</span>, and the <b>mass unresolved in the pool</b> is shown as a
        first-class residual bar rather than as leftover - because it is the honest answer most of the time.
      </p>

      <div className="hair" style={{ margin: "14px 0" }} />

      <Eyebrow className="mt-card-eyebrow" idx="what this is not">
        the closing refusal, and the reason for the rest
      </Eyebrow>
      <p className="note">
        None of it identifies a person. It produces bounded, reproducible estimates from public data, with every assumption
        visible and every claim capped by the claim level. Three hops of a multiplied probability is still a probability;
        it never becomes a fact by being followed further.
      </p>
    </Glass>
  );
}
