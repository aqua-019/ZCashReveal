"use client";

import { useEffect, useMemo, useReducer, useState } from "react";

import { POOL_VAR } from "@/lib/chain";
import { fmtInt, plural } from "@/lib/format";
import { onFrames } from "@/lib/api/frame-bus";
import type { SocketState } from "@/lib/api/socket";
import { IS_LIVE_TRANSPORT } from "@/lib/api/stream";
import {
  EMPTY_LIVE_STATE,
  buildLivePlane,
  liveReduce,
  type Removal,
  type RemovalReason,
} from "@/lib/live-plane";
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
 * THE CONDITION UNDER AN EMPTY TANK, AND THERE ARE FOUR OF THEM RATHER THAN
 * TWO.
 *
 * FOUND IN TWO STAGES, BOTH BY EXECUTION RATHER THAN BY READING.
 *
 * First, `next build` emits `index.html` with this layer server-rendered - what
 * a reader with JavaScript off actually receives - and it said "connecting" and
 * "no transactions are reaching this page" in one line. That second sentence is
 * a fault claim, and it was being made during normal startup on first paint for
 * every reader.
 *
 * Then a gate reviewer found the harder half: `subscribeFrames` never passed
 * `onState` to `ZecSocket`, so the socket's own state machine terminated inside
 * the class and the bus INFERRED "open" from a frame arriving. That inference is
 * one-way. A socket that connects and then dies delivers nothing to revise it
 * with, so this component latched at "live" over a dead feed for ever, drawing a
 * calm empty board - the frozen surface reporting no fault that its own docblock
 * says it exists to prevent. Reproduced across three open/die/reconnect cycles:
 * 51 frames, one state ever seen, `open`.
 *
 * With the state forwarded, `connecting` arrives twice for different reasons and
 * only one of them is a fault:
 *
 *   never connected  -> "the feed has not connected yet". The ordinary first
 *                       paint, and the whole of what a JavaScript-off reader
 *                       gets. Not a fault, and saying one here would make the
 *                       site accuse itself once per page load.
 *   connected, then
 *   `connecting`     -> THE FAULT. The socket dropped and is retrying, which is
 *                       the state an operator needs named.
 *   open             -> the feed is up. No condition; the count speaks.
 *   closed           -> teardown. `ZecSocket` sets it only in its own `close()`
 *                       and retries for ever otherwise, so a mounted component
 *                       effectively never sees it. It is mapped because
 *                       `SocketState` has three members and this record is
 *                       total, NOT because it is a state this surface expects -
 *                       and it is deliberately not given the fault wording,
 *                       because dressing an unreachable case is how a docblock
 *                       comes to describe a case with no producer (F-58-1).
 */
const CONDITION: Readonly<Record<SocketState, string | null>> = {
  open: null,
  connecting: " the feed has not connected yet",
  closed: " the feed was stopped",
};

/** The one condition that is a fault: it worked, and now it does not. */
const DROPPED = " the feed dropped and no transactions are reaching this page";

/**
 * No gateway is configured, which is not a fault and is the DEPLOYED state.
 *
 * `DEPLOY-2.0.md` sets Production and Preview to `NEXT_PUBLIC_DATA_MODE=snapshot`
 * with no `NEXT_PUBLIC_WS_URL`, so this is what the site says today. It is an
 * absence with its condition named, not an empty board left to be read as a
 * quiet chain - and emphatically not eleven committed mockup rows replayed under
 * the word "live", which is what the first draft did.
 */
const UNCONFIGURED = " no live mempool feed is configured for this deployment";

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
  // A `connecting` BEFORE any success and a `connecting` AFTER one are different
  // facts and only the second is a fault, so the component remembers which it
  // is. The socket cannot tell us - it reports the same state for both.
  const [everOpen, setEverOpen] = useState(false);
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
    return onFrames(
      {
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
        onState: (next) => {
          setSocket(next);
          if (next === "open") setEverOpen(true);
        },
      },
      // `openInFixture: false` IS THE WHOLE OF WHAT KEEPS THIS SURFACE HONEST,
      // AND THE FIRST DRAFT DID NOT PASS IT.
      //
      // `subscribeFrames` falls back to the committed `FixtureStream` whenever
      // there is no gateway, and `DEPLOY-2.0.md` sets Production AND Preview to
      // `NEXT_PUBLIC_DATA_MODE=snapshot` with `NEXT_PUBLIC_WS_URL` blank. So on
      // the site as actually deployed, this layer opened a fixture socket and
      // drew ELEVEN MOCKUP ROWS - txids beginning `ee0119443c` and `c0ffee12d3`,
      // out of a file whose own header calls them invented - under the bold word
      // "live" and the sentence "11 unconfirmed transactions drawn". Measured by
      // a gate reviewer against a real `next start` build with no network.
      //
      // That is the one defect section 3 of the handoff says would make the
      // whole page a lie: a fabricated fish. The plane therefore does not open a
      // socket it would learn nothing true from, and says so instead - an empty
      // tank naming its condition, which is the same rule every other absence on
      // this site follows. When a gateway is configured the marks are real and
      // nothing else changes.
      { openInFixture: false },
    );
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
              // NORMALISED, so `zr-live-swim`'s dash is a fraction of this
              // path rather than a user-unit constant that happens to exceed
              // it. The arcs measure 242.7 to 823.0 units across every lane
              // pair, so a literal would have worked and would have been
              // coupled to the camera.
              pathLength={1}
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

      <LiveReading
        plane={plane}
        socket={socket}
        dropped={IS_LIVE_TRANSPORT && everOpen && socket !== "open"}
        feed={feed}
        lastRemoval={state.lastRemoval}
      />
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
  dropped,
  feed,
  lastRemoval,
}: {
  readonly plane: ReturnType<typeof buildLivePlane>;
  readonly socket: SocketState;
  /** The feed was open and is not now. The only condition that is a fault. */
  readonly dropped: boolean;
  readonly feed: FeedReading;
  readonly lastRemoval: Removal | null;
}) {
  const undrawnTotal =
    plane.undrawn["no lane can be claimed"] + plane.undrawn["no single crossing describes it"];

  return (
    <div className="tplane-live-read" data-ui="turnstile-live-reading">
      <p
        className="tlr-state"
        data-state={!IS_LIVE_TRANSPORT ? "connecting" : dropped ? "closed" : socket}
        data-ui="turnstile-live-state"
      >
        <span className="dot" aria-hidden="true" />
        {/* THE BOLD WORD IS A FACT ABOUT THE TRANSPORT, NOT ABOUT THE SOCKET.
            A committed stream connects, so `socket` reads "open" - and the word
            said "live" over fourteen mockup rows. */}
        <b>{!IS_LIVE_TRANSPORT ? "no feed" : dropped ? "dropped" : STATE_TEXT[socket]}</b>
        {socket === "open" ? (
          // THE TRANSPORT, NOT THE MODE. `DATA_MODE === "live"` with a missing
          // `NEXT_PUBLIC_WS_URL` runs the committed stream, and branching on the
          // mode would print "mempool feed" over fixture rows - the failure
          // `api/index.ts` records a gate round already fixing once.
          <span className="tlr-src">
            {IS_LIVE_TRANSPORT ? " mempool feed" : " replaying the committed corpus"}
          </span>
        ) : (
          // AN ABSENCE STATES ITS CONDITION, NEVER AN OWNER (SNAPSHOT.md 8.1) -
          // and the condition differs by WHY the tank is empty. Only a feed that
          // worked and stopped is a fault; a build with no gateway configured is
          // not broken, it simply has no mempool to show.
          <span className="tlr-src" {...(dropped ? { "data-ui": "turnstile-live-fault" } : {})}>
            {!IS_LIVE_TRANSPORT ? UNCONFIGURED : dropped ? DROPPED : CONDITION[socket]}
          </span>
        )}
      </p>

      <p className="tlr-count" data-ui="turnstile-live-count">
        <b>{fmtInt(plane.drawn)}</b>
        {plane.drawn === 1 ? " unconfirmed transaction drawn" : " unconfirmed transactions drawn"}
        {/* `plural` is not used here because the FIGURE is bold and the noun is
            not, so the two cannot share one string. Same agreement rule, hand
            written, and the swept sites are listed in section 7. */}
        {plane.held === plane.drawn ? null : (
          // AT THE CEILING THE FIGURE IS THIS PAGE'S LIMIT, NOT THE POOL'S SIZE.
          // A bare "of 250 held" for a mempool of 3,000 is a measurement the
          // page cannot make; the hold is a tank, and a full tank reports its
          // own capacity.
          <> {plane.holdFull ? `of ${fmtInt(plane.held)} held, which is all this page keeps` : `of ${fmtInt(plane.held)} held`}</>
        )}
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
        {feed.refused ? (
          // "WHEN THIS PAGE CONNECTED", NOT "THE LAST TICK". The drain state
          // arrives ONLY on a `snapshot` frame, which the gateway sends on
          // connect, so this figure never refreshes while the page is open. The
          // first draft said "the last tick was cut short by a refusal" and went
          // on saying it after thirty later arrivals - a process's momentary
          // state rendered as a standing fact, which is this project's own
          // recurring shape and is what `mempool-summary.ts` already records
          // about the same object. The rate figures either side of it are
          // configuration and do not age; this one is a transient and says when
          // it was read.
          <span className="tlr-refused">{" - the feed reported a refusal when this page connected"}</span>
        ) : null}
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

      {lastRemoval === null || !lastRemoval.wasHeld ? null : (
        // THE THREE REASONS ARE NOT INTERCHANGEABLE. Only `confirmed` means the
        // transaction settled; saying so of an eviction would tell a reader a
        // dropped transaction landed.
        //
        // AND A REMOVAL THAT TOOK NOTHING OFF THE BOARD SAYS NOTHING. A
        // `tx_removed` for a txid this reader never held - routine, whenever the
        // reader connected after the transaction entered the pool - changed no
        // mark, and "the last mark to leave" would be a claim about a mark that
        // never existed. A held row that drew no mark gets the honest wording
        // instead of the mark wording.
        <p className="tlr-left" data-ui="turnstile-live-removal">
          {lastRemoval.drewMark
            ? `the last mark to leave was ${REMOVAL_TEXT[lastRemoval.reason]}`
            : `the last transaction to leave drew no mark; it was ${REMOVAL_TEXT[lastRemoval.reason]}`}
        </p>
      )}

      <p className="tlr-limit">
        {/* THE LEGEND CARRIES THE DISTINCTION IN WORDS, because under
            `prefers-reduced-motion` the entry animation is gone and the only
            remaining cue is the head.
            AND IT STATES THE RULE ONE-DIRECTIONALLY, WHICH IS THE ONLY WAY IT IS
            TRUE. A first draft said "a settled one ends in the gold arrowhead",
            which a gate round measured false for 12 of 42 settled marks:
            `plane.ts` sets `arrow: age <= 0.72`, so the oldest 28.6 per cent of
            the board carries no head at all. "No gold here" is a claim about
            THIS layer and holds; "gold there" is a claim about the other one and
            does not. The reader's rule is an implication, not an equivalence. */}
        <b>These marks are unconfirmed.</b> An unconfirmed crossing ends in a hollow ring in its own pool&apos;s colour,
        and never in gold. Gold is where a crossing lands, and nothing here has landed. A mark leaves when its transaction leaves the mempool, which is not always a confirmation. Direction
        is read from the transaction&apos;s class; where the class does not carry one, no direction is drawn.
      </p>
    </div>
  );
}
