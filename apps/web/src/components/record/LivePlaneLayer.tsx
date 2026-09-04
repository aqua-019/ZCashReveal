"use client";

import { useEffect, useMemo, useReducer, useState } from "react";

import { POOL_VAR } from "@/lib/chain";
import { DATA_MODE } from "@/lib/env";
import { fmtInt } from "@/lib/format";
import { onFrames } from "@/lib/api/frame-bus";
import type { SocketState } from "@/lib/api/socket";
import { EMPTY_LIVE_STATE, buildLivePlane, liveReduce, type RemovalReason } from "@/lib/live-plane";
import { SPLASH_CAMERA, SPLASH_N_MAX, type Camera } from "@/lib/plane";

/**
 * THE LIVING PLANE - unconfirmed transactions, over the settled board.
 *
 * ============================================================================
 * WHY A CLIENT ISLAND AND NOT A `useEffect` IN `TurnstilePlane`
 * ============================================================================
 * `TurnstilePlane` is a SERVER component, and its own header states a property
 * that is load-bearing rather than decorative: *"There is no rAF loop, no
 * interval and no Web Animations object anywhere in this subtree, which is what
 * makes the reduced-motion contract architectural rather than a cancellation."*
 * Adding a subscription to it would move the header, the legend, the caption,
 * the alt text and five nodes into the browser bundle and delete that property
 * in the same commit.
 *
 * So the settled board stays server-rendered and this layer sits over it. Three
 * things follow, and all three are contract items rather than side effects:
 *
 *   - A reader with JavaScript off still gets the whole confirmed board, its
 *     reading and its alt text, exactly as before.
 *   - The confirmed marks cannot be perturbed by a live frame, because they are
 *     rendered by a different component from a different input in a different
 *     SVG. A7 is true by construction rather than by care.
 *   - This layer is the ONLY animated thing in the subtree, so the
 *     reduced-motion refusal has one site instead of being spread across the
 *     figure.
 *
 * ============================================================================
 * A4: NOTHING DRAWS A MARK EXCEPT AN ARRIVED FRAME
 * ============================================================================
 * This component holds no timer, no seed-driven population, no ambient
 * generator and no fallback shoal. Its entire state is `liveReduce` folded over
 * frames the bus delivered, and `liveReduce` is pure. Mounted with no socket,
 * or with a socket that never delivers, the tank draws exactly zero marks -
 * and the affordance says which of those two is happening rather than leaving
 * a calm empty board to be read as a quiet chain.
 *
 * There is deliberately no `initial` prop. `MempoolPanel` takes one because the
 * page it lives on has already fetched a mempool view server-side and a table
 * with rows in the HTML is better than a spinner. Here the equivalent would be
 * seeding the tank from the snapshot's own figures, which is exactly the thing
 * A4 forbids: `migrationHist` is a count of SETTLED crossings and every mark it
 * produced would be an unconfirmed transaction that never arrived.
 *
 * ============================================================================
 * A SPARSE TANK IS THE TRUTH
 * ============================================================================
 * At the measured keyless ceiling the mempool loop affords roughly three
 * transactions a minute, so this board is nearly empty most of the time. That
 * is a correct rendering of a metered feed and it is never padded. The
 * affordance carries the rate the producer published - `ceilingPerMinute` and
 * `txPerMinute` off `MempoolDrainState`, which rung 2 already writes - so a
 * reader seeing four marks can learn on the page why there are four, rather
 * than concluding the site is broken.
 */

/** The affordance's reading of the feed, assembled from the frames themselves. */
interface FeedReading {
  readonly ceilingPerMinute: number | null;
  readonly txPerMinute: number | null;
  readonly observed: number | null;
  readonly refused: boolean;
}

const NO_READING: FeedReading = { ceilingPerMinute: null, txPerMinute: null, observed: null, refused: false };

const STATE_TEXT: Readonly<Record<SocketState, string>> = {
  open: "live",
  connecting: "connecting",
  closed: "stopped",
};

/**
 * A count and its noun, agreeing.
 *
 * FOUND BY EXECUTING THE SENTENCE RATHER THAN READING IT, which is CLAUDE.md's
 * clause (c). Driven over the values `mempoolDrainStateSchema` actually admits -
 * `txPerMinute` is `nonnegative()` and `ceilingPerMinute` is `positive()`, so
 * both can be 1 - the rate line read "the endpoint affords 1 transactions a
 * minute against a ceiling of 1 requests". At the measured ceiling of five the
 * figure is three and the defect never shows, which is exactly why it survived
 * being read: the sentence is only wrong at values nobody typed while writing
 * it. A site whose whole subject is saying precisely what it knows cannot print
 * "1 transactions".
 *
 * A ZERO STILL PRINTS AS "0 transactions", plural, and that is correct English
 * and a correct claim: the producer measured a rate of zero. This function does
 * not decide absence - the caller does, one branch up - because a null rate and
 * a measured zero are different sentences and only one of them belongs here.
 */
function plural(n: number, one: string, many: string): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}

const REMOVAL_TEXT: Readonly<Record<RemovalReason, string>> = {
  confirmed: "confirmed into a block",
  evicted: "evicted from the mempool",
  replaced: "replaced by another transaction",
};

export function LivePlaneLayer({
  camera = SPLASH_CAMERA,
  nMax = SPLASH_N_MAX,
}: {
  readonly camera?: Camera;
  readonly nMax?: number;
}) {
  const [state, dispatch] = useReducer(liveReduce, EMPTY_LIVE_STATE);
  const [socket, setSocket] = useState<SocketState>("connecting");
  const [feed, setFeed] = useState<FeedReading>(NO_READING);
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    // THE REFUSAL IS ARCHITECTURAL, ON THE PATTERN `Tide` AND `FogCanvas`
    // ALREADY USE. Under `prefers-reduced-motion` the marks are rendered with
    // no travel class at all rather than with an animation damped to zero, so
    // there is nothing to cancel. The global `@media` block in `globals.css` is
    // the brace behind this belt; `data-motion` is what makes the contract
    // observable to a test, since a stopped animation and an absent one look
    // identical from outside.
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setMotion(!query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    // ONE SUBSCRIPTION THROUGH THE BUS, NOT A SOCKET OF OUR OWN. `tip-bus.ts`
    // is already mounted in the shell on this route; a bare `subscribeFrames`
    // here would be the second connection its own header was written against.
    return onFrames({
      onFrame: (frame) => {
        dispatch(frame);
        if (frame.type === "snapshot") {
          const drain = frame.view.drain;
          setFeed(
            drain === null
              ? NO_READING
              : {
                  ceilingPerMinute: drain.ceilingPerMinute,
                  txPerMinute: drain.txPerMinute,
                  observed: drain.observed,
                  refused: drain.refused,
                },
          );
        }
      },
      onState: setSocket,
    });
  }, []);

  const plane = useMemo(() => buildLivePlane(state, { camera, nMax }), [state, camera, nMax]);

  return (
    <div className="tplane-live" data-ui="turnstile-live" data-motion={motion ? "on" : "off"}>
      <svg
        className="tplane-live-svg"
        viewBox="0 0 1180 560"
        aria-hidden="true"
        focusable="false"
        data-ui="turnstile-live-svg"
      >
        {plane.marks.map((m) => (
          <g
            className={`tlive tlive-${m.kind}${m.travels && motion ? " tlive-swim" : ""}`}
            key={m.txid}
            data-live-mark=""
            data-txid={m.txid}
            data-kind={m.kind}
          >
            <path
              d={m.d}
              fill="none"
              stroke={`var(${POOL_VAR[m.lane]})`}
              strokeOpacity={0.62}
              // THINNER THAN A SETTLED MARK, which is 1.15 on the board below.
              // The weight is uniform across live marks for the reason the
              // settled board's is: no per-transaction amount is carried, and a
              // varying width would render one.
              strokeWidth={0.9}
              strokeLinecap="round"
            />
            {m.head === null ? null : (
              // THE HOLLOW HEAD IS THE DISTINCTION FROM A SETTLED CROSSING, and
              // it is spent in the lane's own hue rather than in gold. Gold is
              // where a crossing LANDS; nothing here has landed.
              <circle
                cx={m.head.cx.toFixed(1)}
                cy={m.head.cy.toFixed(1)}
                r={m.head.r.toFixed(1)}
                fill="none"
                stroke={`var(${POOL_VAR[m.lane]})`}
                strokeOpacity={0.85}
                strokeWidth={1.1}
              />
            )}
          </g>
        ))}
      </svg>

      <LiveReading plane={plane} socket={socket} feed={feed} lastRemoval={state.lastRemoval} />
    </div>
  );
}

/**
 * What the feed is doing, in words, at the same weight as the picture.
 *
 * THE TWO EMPTIES MUST READ DIFFERENTLY, which is A6. A tank with no marks
 * because the socket never connected and a tank with no marks because the
 * chain is quiet look identical, and only one of them is a fault. This is the
 * same argument the mempool panel's badge makes and the same argument the
 * snapshot-age line in the footer makes: a surface that has stopped updating
 * and does not say so is this project's most-recorded defect shape.
 */
function LiveReading({
  plane,
  socket,
  feed,
  lastRemoval,
}: {
  readonly plane: ReturnType<typeof buildLivePlane>;
  readonly socket: SocketState;
  readonly feed: FeedReading;
  readonly lastRemoval: RemovalReason | null;
}) {
  const undrawnTotal =
    plane.undrawn["no lane can be claimed"] + plane.undrawn["no single crossing describes it"];

  return (
    <div className="tplane-live-read" data-ui="turnstile-live-reading">
      <p className="tlr-state" data-state={socket} data-ui="turnstile-live-state">
        <span className="dot" aria-hidden="true" />
        <b>{STATE_TEXT[socket]}</b>
        {socket === "open" ? (
          <span className="tlr-src">
            {DATA_MODE === "live" ? " mempool feed" : " replaying the committed corpus"}
          </span>
        ) : (
          // AN ABSENCE STATES ITS CONDITION, NEVER AN OWNER. SNAPSHOT.md 8.1.
          <span className="tlr-src" data-ui="turnstile-live-fault">
            {" no transactions are reaching this page"}
          </span>
        )}
      </p>

      <p className="tlr-count" data-ui="turnstile-live-count">
        <b>{fmtInt(plane.drawn)}</b>
        {plane.drawn === 1 ? " unconfirmed transaction drawn" : " unconfirmed transactions drawn"}
        {/* `plural` is not used here because the FIGURE is bold and the noun is
            not, so the two cannot share one string. Same agreement rule, hand
            written, and the swept sites are listed in section 7. */}
        {plane.held === plane.drawn ? null : <> {`of ${fmtInt(plane.held)} held`}</>}
        {plane.capped ? (
          <span className="tlr-cap" data-ui="turnstile-live-capped">
            {` - the board holds ${fmtInt(plane.drawn)} marks and more are in the pool, so what is drawn is a sample`}
          </span>
        ) : null}
      </p>

      {/* THE RATE, SO A SPARSE TANK READS AS A METERED FEED RATHER THAN A
          BROKEN ONE. Both figures are the producer's - `MempoolDrainState` -
          and each renders as an absence when the producer said nothing, never
          as a zero. */}
      <p className="tlr-rate" data-ui="turnstile-live-rate">
        {feed.ceilingPerMinute === null && feed.txPerMinute === null
          ? "the feed publishes no rate, so how many transactions this endpoint affords is not known here"
          : `the endpoint affords ${
              feed.txPerMinute === null
                ? "an unstated number of transactions"
                : plural(feed.txPerMinute, "transaction", "transactions")
            } a minute${
              feed.ceilingPerMinute === null
                ? ""
                : ` against a ceiling of ${plural(feed.ceilingPerMinute, "request", "requests")}`
            } - a sparse board is a metered feed, not a fault`}
        {feed.refused ? <span className="tlr-refused">{" - the last tick was cut short by a refusal"}</span> : null}
      </p>

      {undrawnTotal === 0 ? null : (
        // A ROW THAT DRAWS NOTHING IS COUNTED RATHER THAN DROPPED. A dropped
        // row does not look like a bug, it looks like a quiet mempool.
        <p className="tlr-undrawn" data-ui="turnstile-live-undrawn">
          {`${fmtInt(undrawnTotal)} held ${undrawnTotal === 1 ? "transaction draws" : "transactions draw"} no mark: `}
          {plane.undrawn["no lane can be claimed"] > 0
            ? `${fmtInt(plane.undrawn["no lane can be claimed"])} where no lane can be claimed`
            : null}
          {plane.undrawn["no lane can be claimed"] > 0 && plane.undrawn["no single crossing describes it"] > 0
            ? ", "
            : null}
          {plane.undrawn["no single crossing describes it"] > 0
            ? `${fmtInt(plane.undrawn["no single crossing describes it"])} where no single crossing describes it`
            : null}
        </p>
      )}

      {lastRemoval === null ? null : (
        // THE THREE REASONS ARE NOT INTERCHANGEABLE. Only `confirmed` means the
        // transaction settled; saying so of an eviction would tell a reader a
        // dropped transaction landed.
        <p className="tlr-left" data-ui="turnstile-live-removal">
          {`the last mark to leave was ${REMOVAL_TEXT[lastRemoval]}`}
        </p>
      )}

      <p className="tlr-limit">
        <b>These marks are unconfirmed.</b> They carry no gold head, because gold is where a crossing lands and nothing
        here has landed. A mark leaves when its transaction leaves the mempool, which is not always a confirmation.
        Direction is read from the transaction&apos;s class; where the class does not carry one, no direction is drawn.
      </p>
    </div>
  );
}
