/**
 * The mempool subscription, as its own entry point.
 *
 * WHY THIS IS NOT JUST `api().subscribe`. It is - `FixtureApi.subscribe`
 * delegates straight to it - but the mempool panel is a client component, and
 * importing `api()` from a client component pulls the whole `FixtureApi` into
 * the browser bundle: the address view, the transaction view, the pools view,
 * the flows view, and through the label fixture the entire
 * `@zcashreveal/content` seed corpus. Measured: `/track` went to 217 kB of
 * first-load JavaScript, against 102 kB for every Record route, for the sake of
 * one function that reads frames.
 *
 * So the subscription lives here, importing only the socket and the mempool
 * fixture, and both the client panel and `FixtureApi` call it. The panel keeps
 * reading the same code path the API would have given it; it just does not drag
 * six other views along.
 *
 * HANDOFF-11 changes the `DATA_MODE` branch below and nothing else: the panel
 * does not know which transport it is attached to, and that is the property
 * that makes the reconnect logic testable without a browser and shippable
 * without a gateway.
 */
import type { MempoolRow, MempoolView, ZecFrame } from "@zcashreveal/types";

import { API_URL, DATA_MODE, WS_URL } from "@/lib/env";

import { MEMPOOL_VIEW } from "./fixtures/mempool";
import { ZecSocket, type SocketLike } from "./socket";

/** JSON cannot carry a bigint; the wire format is a decimal string, per `zatSchema`. */
function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * A committed stream that behaves like a socket.
 *
 * It emits the mempool snapshot on open, then one arrival every `tickMs`, then
 * closes itself after a full cycle so the client's reconnect path runs in
 * normal operation rather than only under fault. Nothing here is generated: the
 * corpus is fixed and the stream is a replay of it.
 */
class FixtureStream {
  readonly #handlers = new Map<string, Set<(ev?: unknown) => void>>();
  #timers: number[] = [];
  #closed = false;

  constructor(private readonly tickMs: number) {
    // Open on the next turn of the loop, so a caller that attaches its
    // listeners synchronously after construction still sees the open event.
    this.#later(() => {
      this.#emit("open");
      this.#pump();
    }, 0);
  }

  addEventListener(type: string, handler: (ev?: unknown) => void): void {
    let set = this.#handlers.get(type);
    if (set === undefined) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
  }

  send(): void {
    // A ping. There is nothing on the other end to answer it, and the frames
    // below reset the client's idle timer, so this is deliberately inert.
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const t of this.#timers) globalThis.clearTimeout(t);
    this.#timers = [];
    this.#emit("close");
  }

  #later(fn: () => void, ms: number): void {
    this.#timers.push(globalThis.setTimeout(fn, ms) as unknown as number);
  }

  #emit(type: string, data?: unknown): void {
    for (const h of this.#handlers.get(type) ?? []) h(data);
  }

  #frame(frame: ZecFrame): void {
    if (this.#closed) return;
    this.#emit("message", { data: JSON.stringify(frame, jsonReplacer) });
  }

  #pump(): void {
    this.#frame({ type: "hello", tipHeight: MEMPOOL_VIEW.tipHeight });
    this.#frame({ type: "snapshot", view: MEMPOOL_VIEW });

    MEMPOOL_VIEW.entries.forEach((entry, i) => {
      this.#later(() => {
        this.#frame({ type: "tx_added", entry: { ...entry, ageSeconds: 0 } });
      }, this.tickMs * (i + 1));
    });

    this.#later(() => {
      this.close();
    }, this.tickMs * (MEMPOOL_VIEW.entries.length + 2));
  }
}

export interface StreamOptions {
  /** Milliseconds between simulated arrivals in fixture mode. */
  readonly tickMs?: number;
  /** Overrides the transport. Only tests pass this. */
  readonly open?: (url: string) => SocketLike;
}

/**
 * Subscribe to mempool frames. Returns an unsubscribe function.
 *
 * A frame that does not validate is DROPPED, not thrown. The fixture stream
 * writes frames this build understands; a gateway one version ahead will send
 * frames it has never heard of, and the panel going blank is a worse answer
 * than the panel ignoring them.
 */
export function subscribeFrames(onFrame: (frame: ZecFrame) => void, options: StreamOptions = {}): () => void {
  const tickMs = options.tickMs ?? 4_000;
  const live = DATA_MODE === "live" && WS_URL !== "" && API_URL !== "";

  const socket = new ZecSocket(live ? WS_URL : "fixture://mempool", {
    open: options.open ?? (live ? (url) => new WebSocket(url) as unknown as SocketLike : () => new FixtureStream(tickMs) as unknown as SocketLike),
    onFrame: (raw) => {
      // Checked on the way in even in fixture mode, where this end wrote the
      // frame. The two modes are one code path to the consumer, and a consumer
      // that trusts one and checks the other has two code paths again.
      const frame = asFrame(raw);
      if (frame !== null) onFrame(frame);
    },
    // In fixture mode the committed stream closes after each cycle by design,
    // so the retry has to be brisk enough not to leave a visible stall, and
    // jittered so it is not a metronome. There is no other end to answer a
    // ping, so the heartbeat is off.
    ...(live ? {} : { baseDelayMs: 400, maxDelayMs: 2_000, idleTimeoutMs: 0, pingIntervalMs: 0 }),
  });
  socket.connect();
  return () => {
    socket.close();
  };
}

/* -------------------------------------------------------------------------- */
/* The frame guard                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Narrow an unknown frame, by hand.
 *
 * WHY NOT `zecFrameSchema.safeParse`. Because this module is imported by a
 * client component, and importing the zod schema costs 15 kB of the browser
 * bundle on `/track` - measured, by building the route with and without it:
 * 8.64 kB of route JavaScript against 23.6 kB. The Record routes ship 102 kB
 * and score 94 on performance against a floor that HANDOFF-04 inherits, so 15
 * kB spent re-checking a frame this build wrote is not a good trade on the one
 * route that has a live panel.
 *
 * The guard checks exactly what the consumer reads and nothing else: a frame's
 * `type`, and for the two that carry a payload, that the payload has the shape
 * `MempoolPanel` indexes into. It is total - every input gets `null` or a
 * frame - and anything unrecognised is DROPPED, because a gateway one version
 * ahead will send frames this build has never heard of and the panel going
 * blank is a worse answer than the panel ignoring them.
 *
 * `test/unit/frame-guard.test.ts` holds this function and `zecFrameSchema` to
 * the same verdict on every frame the fixture stream emits, plus a table of
 * malformed ones, so the cheap check and the authoritative schema cannot drift
 * apart silently. That test imports zod; the browser does not.
 */
export function asFrame(raw: unknown): ZecFrame | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  switch (f["type"]) {
    case "hello":
      return isHeight(f["tipHeight"]) ? { type: "hello", tipHeight: f["tipHeight"] } : null;
    case "tip":
      return isHeight(f["height"]) && isTxid(f["hash"]) ? { type: "tip", height: f["height"], hash: f["hash"] } : null;
    case "tx_removed":
      return isTxid(f["txid"]) && (f["reason"] === "confirmed" || f["reason"] === "evicted" || f["reason"] === "replaced")
        ? { type: "tx_removed", txid: f["txid"], reason: f["reason"] }
        : null;
    case "tx_added": {
      const entry = asRow(f["entry"]);
      return entry === null ? null : { type: "tx_added", entry };
    }
    case "snapshot": {
      const view = asView(f["view"]);
      return view === null ? null : { type: "snapshot", view };
    }
    default:
      return null;
  }
}

const isHeight = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isCount = isHeight;
const isTxid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** JSON carries a zatoshi as a decimal-integer string; a float is refused, not rounded. */
function asZat(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  return null;
}

/**
 * A zatoshi field that is allowed to be null, distinguishing THE FIELD WAS NULL
 * from THE FIELD WAS RUBBISH.
 *
 * `asZat` collapses both onto `null`, which is fine for a required field and
 * wrong for a nullable one. `feeZat` became nullable in HANDOFF-06 because the
 * fee is not on the wire and computing it can fail - and the guard below reads
 * `feeZat === null` as "reject this row", so with the old helper every
 * transaction whose fee could not be computed would have been DROPPED FROM THE
 * LIVE PANEL rather than shown without a fee. A dropped row does not look like
 * a bug; it looks like a quiet mempool.
 *
 * Returns `undefined` for a malformed value, which is what the guard rejects.
 */
function asNullableZat(v: unknown): bigint | null | undefined {
  if (v === null) return null;
  const zat = asZat(v);
  return zat === null ? undefined : zat;
}

const LANES = new Set(["transparent", "sprout", "sapling", "orchard", "ironwood"]);
const VERSIONS = new Set(["v4", "v5", "v6"]);
const SEVERITIES = new Set(["INFO", "LOW", "MED", "HIGH"]);
const CLASSES = new Set(["shield", "deshield", "shielded", "migration", "transparent"]);

function asRow(v: unknown): MempoolRow | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const feeZat = asNullableZat(r["feeZat"]);
  const lanes = Array.isArray(r["lanes"]) && r["lanes"].length > 0 && r["lanes"].every((l) => typeof l === "string" && LANES.has(l))
    ? (r["lanes"] as MempoolRow["lanes"])
    : null;
  const reasoning = Array.isArray(r["reasoning"]) && r["reasoning"].length > 0 && r["reasoning"].every(isText) ? (r["reasoning"] as string[]) : null;
  if (
    !isTxid(r["txid"]) ||
    !isCount(r["ageSeconds"]) ||
    typeof r["version"] !== "string" ||
    !VERSIONS.has(r["version"]) ||
    !isText(r["flow"]) ||
    lanes === null ||
    !isText(r["valueBalanceText"]) ||
    feeZat === undefined ||
    !isCount(r["logicalActions"]) ||
    !isText(r["walletGuess"]) ||
    !isText(r["finding"]) ||
    typeof r["severity"] !== "string" ||
    !SEVERITIES.has(r["severity"]) ||
    typeof r["class"] !== "string" ||
    !CLASSES.has(r["class"]) ||
    reasoning === null
  ) {
    return null;
  }
  return {
    txid: r["txid"],
    ageSeconds: r["ageSeconds"],
    version: r["version"] as MempoolRow["version"],
    flow: r["flow"],
    lanes,
    valueBalanceText: r["valueBalanceText"],
    feeZat,
    logicalActions: r["logicalActions"],
    walletGuess: r["walletGuess"],
    finding: r["finding"],
    severity: r["severity"] as MempoolRow["severity"],
    class: r["class"] as MempoolRow["class"],
    reasoning,
  };
}

function asView(v: unknown): MempoolView | null {
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  if (!isHeight(m["tipHeight"]) || !Array.isArray(m["entries"])) return null;
  const entries: MempoolRow[] = [];
  for (const e of m["entries"]) {
    const row = asRow(e);
    if (row === null) return null;
    entries.push(row);
  }
  const s = m["summary"];
  if (typeof s !== "object" || s === null) return null;
  const sum = s as Record<string, unknown>;
  const crossingZat = asZat(sum["crossingZat"]);
  const conventionalFeeZat = asZat(sum["conventionalFeeZat"]);
  if (
    crossingZat === null ||
    conventionalFeeZat === null ||
    !isCount(sum["unconfirmed"]) ||
    !isCount(sum["shielded"]) ||
    !isCount(sum["migrations"]) ||
    !isCount(sum["transparent"]) ||
    !isCount(sum["bytes"]) ||
    !isCount(sum["nextBlockSeconds"]) ||
    !isCount(sum["pricedCount"]) ||
    !isCount(sum["conventionalCount"]) ||
    !isCount(sum["findingsHigh"]) ||
    !isText(sum["crossingSplit"]) ||
    !isText(sum["findingsNote"]) ||
    !isText(sum["feeWeather"])
  ) {
    return null;
  }
  return {
    tipHeight: m["tipHeight"],
    entries,
    summary: {
      unconfirmed: sum["unconfirmed"],
      shielded: sum["shielded"],
      migrations: sum["migrations"],
      transparent: sum["transparent"],
      bytes: sum["bytes"],
      nextBlockSeconds: sum["nextBlockSeconds"],
      crossingZat,
      crossingSplit: sum["crossingSplit"],
      conventionalFeeZat,
      pricedCount: sum["pricedCount"],
      conventionalCount: sum["conventionalCount"],
      findingsHigh: sum["findingsHigh"],
      findingsNote: sum["findingsNote"],
      feeWeather: sum["feeWeather"],
    },
  };
}
