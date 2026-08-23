/**
 * `AddressView` from Zebra's address index.
 *
 * WHAT THIS CAN AND CANNOT SAY, stated once here because every note the view
 * renders is an instance of it.
 *
 * CAN: the balance, the total received and the total spent, exactly, for the
 * whole history - `getaddressbalance` answers over the node's index, not over
 * the window this view pages through. The UTXO count, exactly. And, for the
 * transactions in the window, each one's gross credit and debit for this
 * address, its direction, and whether it crossed the shielded boundary.
 *
 * CANNOT: anything about the shielded side beyond the fact that value crossed.
 * A boundary transaction's `estimate` is NULL here and will be until
 * HANDOFF-08 ships the estimators - and it is null rather than a fabricated
 * audit trail, with `poolNote` saying which handoff owns the answer. The DTO
 * makes an estimate carry its filters and its assumptions precisely so that one
 * cannot be invented, and inventing one to fill a required field would be the
 * exact failure this site documents in others.
 *
 * THE WINDOW IS STATED, NEVER HIDDEN. `getaddresstxids` returns every txid an
 * address ever touched and the ZIP 271 lockbox has thousands. The view reads
 * the most recent `GATEWAY_ADDRESS_TX_LIMIT` and says so in `note`; a
 * truncation presented as a whole history is a lie about completeness.
 */
import type {
  AddressTx,
  AddressView,
  BalancePoint,
  Direction,
  LabelView,
  Stamp,
} from "@zcashreveal/types";

import type { DecodedAddress } from "../address.js";
import type { CachedAddress } from "../cache.js";
import { labelFor } from "./labels.js";
import { lanesTouched, poolValueBalanceZat, resolveInputs, type ReadContext } from "./context.js";
import { countText, stampBefore, stampFromUnix, stampNoTime, zecText } from "./units.js";

const SCRIPT_TEXT: Readonly<Record<DecodedAddress["script"], string>> = {
  p2pkh: "P2PKH - pay to public key hash",
  p2sh: "P2SH - pay to script hash",
  tex: "TEX (ZIP 320) - transparent-source-only, an exchange-deposit tell",
};

export interface AddressProjection {
  readonly view: AddressView;
  /** What was written back to the cache, so the route can store it in one place. */
  readonly cacheable: CachedAddress;
  /** True where the balance figures came from the cache rather than the node. */
  readonly fromCache: boolean;
}

export async function buildAddressView(
  ctx: ReadContext,
  address: string,
  decoded: DecodedAddress,
): Promise<AddressProjection> {
  const cached = await ctx.cache.getAddress(address, ctx.cfg.GATEWAY_ADDRESS_CACHE_TTL_S);

  let balanceZat: bigint;
  let receivedZat: bigint;
  let utxoCount: number;
  let txids: string[];
  if (cached !== null) {
    ({ balanceZat, receivedZat, utxoCount } = cached);
    txids = [...cached.txids];
  } else {
    ctx.countRpc(3);
    const [balance, utxos, ids] = await Promise.all([
      ctx.rpc.getAddressBalance([address]),
      ctx.rpc.getAddressUtxos([address]),
      ctx.rpc.getAddressTxIds([address]),
    ]);
    balanceZat = balance.balance;
    receivedZat = balance.received;
    utxoCount = utxos.length;
    txids = [...ids];
  }
  // `received` includes change, so what an address has SPENT is the difference.
  // Deriving it rather than summing the window is deliberate: a window sum
  // would be a figure about the window wearing the name of a lifetime total.
  const sentZat = receivedZat - balanceZat;

  const label = labelFor(address);

  /* ------------------------------------------------------------- the window */

  // The txid list came from the same cache entry as the balance, written at one
  // instant - see `CachedAddress.txids` for why the two must not be refreshed
  // independently.
  const total = txids.length;
  const window = txids.slice(Math.max(0, total - ctx.cfg.GATEWAY_ADDRESS_TX_LIMIT));

  const rows: AddressTx[] = [];
  // The signed value each row moved across the shielded boundary, kept beside
  // the rows because `AddressTx` has no field for it and `netToPoolZat` is a
  // sum of exactly this.
  const crossings: bigint[] = [];
  for (const txid of window) {
    const tx = await ctx.tx(txid);
    if (tx === null) continue;
    rows.push(await addressRow(ctx, address, tx));
    crossings.push(poolValueBalanceZat(tx));
  }
  // Newest first, which is the order the table renders and the opposite of the
  // chain order `getaddresstxids` returns.
  rows.sort((a, b) => b.height - a.height || b.stamp.sortMs - a.stamp.sortMs);

  const heights = rows.map((r) => r.height);
  const firstSeen = heights.length === 0 ? null : Math.min(...heights);
  const lastSeen = heights.length === 0 ? null : Math.max(...heights);

  /* ------------------------------------------------------------- the shapes */

  /**
   * Net value this address put into the pools and has not seen come back.
   *
   * THE VALUE THAT CROSSED, not the value this address SPENT. The first version
   * summed each shielding transaction's gross debit, which counts the change
   * that came straight back to the same address: an address that shielded
   * 30,000 ZEC by spending a 120,552.69 output and taking 90,552.69 back
   * reported 120,552.69 - a four-fold overstatement of a headline figure. The
   * quantity the DTO names is the pools' own value balance, negated, because
   * `boundary` is positive when value LEAVES a pool.
   */
  const netToPoolZat = crossings.reduce<bigint>((acc, b) => acc - b, 0n);

  const view: AddressView = {
    address,
    network: decoded.network,
    script: decoded.script,
    scriptText: SCRIPT_TEXT[decoded.script],
    label,
    balanceZat,
    receivedZat,
    sentZat,
    netToPoolZat,
    balanceNote: `Unspent output total across ${countText(utxoCount)} ${utxoCount === 1 ? "UTXO" : "UTXOs"}, ${
      cached === null
        ? "read from the node's address index."
        : `from the gateway's cache, at most ${countText(ctx.cfg.GATEWAY_ADDRESS_CACHE_TTL_S)} seconds old.`
    }`,
    receivedNote: "Gross value paid to this address over its whole history, change included.",
    sentNote: "Received less balance. Derived, not summed from the window below.",
    netToPoolNote:
      netToPoolZat === 0n
        ? "No transaction in the window moved value across a pool boundary."
        : `Net value across the shielded boundary over the ${countText(rows.length)} ${rows.length === 1 ? "transaction" : "transactions"} in the window below - what crossed, not what this address spent, so change coming back to itself is not counted twice. A figure about the window, not about the whole history.`,
    balances: balancePoints(rows, balanceZat, total === rows.length),
    interactions: interactionsFor(rows),
    interactionNote:
      rows.length === 0
        ? "Nothing to draw: this address has no transactions in the window."
        : "Edges are drawn from the window below. A counterparty outside it does not appear.",
    transactions: rows,
    reasoning: reasoning({ address, decoded, label, total, windowed: rows.length, utxoCount, fromCache: cached !== null }),
    note:
      total > rows.length
        ? `This address has ${countText(total)} transactions; the ${countText(rows.length)} most recent are shown. Every total above is for the whole history, not for this window.`
        : null,
    exactness: "exact",
  };

  return {
    view,
    cacheable: { balanceZat, receivedZat, spentZat: sentZat, utxoCount, firstSeen, lastSeen, txids },
    fromCache: cached !== null,
  };
}

/* -------------------------------------------------------------------------- */

async function addressRow(ctx: ReadContext, address: string, tx: Parameters<typeof poolValueBalanceZat>[0]): Promise<AddressTx> {
  const creditZat = tx.vout.reduce<bigint>(
    (acc, o) => (o.scriptPubKey.addresses?.includes(address) === true ? acc + BigInt(o.valueZat) : acc),
    0n,
  );

  const funded = await resolveInputs(ctx, tx);
  const debitZat = funded.reduce<bigint>(
    (acc, f) => (f !== null && f.addresses.includes(address) ? acc + f.valueZat : acc),
    0n,
  );
  const unresolved = tx.vin.some((v, i) => v.coinbase === undefined && funded[i] === null);

  const boundary = poolValueBalanceZat(tx);
  const isCoinbase = tx.vin.some((v) => v.coinbase !== undefined);
  const direction: Direction = isCoinbase
    ? "coinbase"
    : boundary < 0n && debitZat > 0n
      ? "t-to-z"
      : boundary > 0n && creditZat > 0n
        ? "z-to-t"
        : "t-to-t";

  const lanes = lanesTouched(tx);
  const height = typeof tx.height === "number" && tx.height >= 0 ? tx.height : 0;
  const stamp: Stamp =
    typeof tx.blocktime === "number"
      ? stampFromUnix(tx.blocktime)
      : typeof tx.time === "number"
        ? stampFromUnix(tx.time)
        : stampNoTime(height);

  const counterparty = counterpartyFor(tx, address, funded, direction);

  return {
    txid: tx.txid,
    height,
    stamp,
    direction,
    directionText: DIRECTION_TEXT[direction],
    amountZat: creditZat - debitZat,
    creditZat,
    debitZat,
    ...(unresolved
      ? {
          amountNote:
            "One or more inputs could not be resolved to the output they spend, so the debit is a lower bound. The node may be pruned.",
        }
      : {}),
    counterparty,
    // NULL, and deliberately. An estimate carries its filters, its N_eff and
    // its assumptions; the gateway has no estimator until HANDOFF-08, and a
    // required field is not a reason to invent an audit trail.
    estimate: null,
    poolNote:
      direction === "t-to-z"
        ? `Value entered ${lanes.filter((l) => l !== "transparent").join(" and ") || "a shielded pool"}. What it became inside is not estimated here: the estimators are HANDOFF-08's, and an estimate without its audit trail is not an estimate.`
        : direction === "z-to-t"
          ? `Value left ${lanes.filter((l) => l !== "transparent").join(" and ") || "a shielded pool"}. Where it came from inside is not estimated here: the estimators are HANDOFF-08's, and an estimate without its audit trail is not an estimate.`
          : "Transparent throughout. There is no pool side to estimate.",
    exactness: direction === "t-to-t" || direction === "coinbase" ? "exact" : "bounded",
  };
}

const DIRECTION_TEXT: Readonly<Record<Direction, string>> = {
  "t-to-z": "t to z - value entered a shielded pool",
  "z-to-t": "z to t - value left a shielded pool",
  "t-to-t": "t to t - transparent throughout",
  coinbase: "coinbase - protocol issuance",
  migration: "migration - value moved between pools",
};

function counterpartyFor(
  tx: { vout: readonly { valueZat: number; scriptPubKey: { addresses?: readonly string[] | undefined } }[] },
  address: string,
  funded: readonly ({ addresses: readonly string[] } | null)[],
  direction: Direction,
): AddressTx["counterparty"] {
  if (direction === "coinbase") {
    return { title: "Coinbase", detail: "Newly issued value, not paid by anyone.", address: null };
  }
  const others = new Set<string>();
  for (const o of tx.vout) for (const a of o.scriptPubKey.addresses ?? []) if (a !== address) others.add(a);
  for (const f of funded) for (const a of f?.addresses ?? []) if (a !== address) others.add(a);

  const first = [...others][0];
  if (first === undefined) {
    return direction === "t-to-z"
      ? { title: "A shielded pool", detail: "The destination is inside the pool and has no address.", address: null }
      : { title: "Itself", detail: "Every transparent party to this transaction is this address.", address: null };
  }
  const labelled = labelFor(first);
  return {
    title: labelled === null ? "Unlabelled address" : labelled.label,
    detail:
      labelled === null
        ? `${first}. No label in the Record for this address.`
        : `${first}. Labelled by ${labelled.labeller}, precedence rank ${labelled.rank}.`,
    address: first,
  };
}

/**
 * The balance step chart.
 *
 * WORKED BACKWARDS FROM THE CURRENT BALANCE, not forwards from zero, and that
 * is forced rather than chosen: the window holds the most recent transactions,
 * so a running total from the oldest one in it would start at whatever the
 * balance was before the window and there is no way to read that directly. The
 * opening point is therefore the balance implied by the current balance less
 * every movement in the window.
 *
 * WHEN THE WINDOW IS THE WHOLE HISTORY, THAT OPENING BALANCE MUST BE ZERO, and
 * if it is not, the node's balance and the transaction arithmetic disagree
 * about this address. The first version drew the difference as an opening
 * balance, which is the one thing it definitely is not - it is a contradiction,
 * and a chart that absorbs a contradiction into a starting value has hidden
 * exactly what a reader of this site is here to see. `event` says so instead.
 *
 * `crossing` is set from the transaction's DIRECTION, never from whether the
 * balance rose. A gate round in HANDOFF-04 caught the chart keying that colour
 * off the sign, which painted a protocol-issuance coinbase - crossing nothing -
 * in the accent (LEDGER-04: gold marks a boundary crossing, never a magnitude).
 */
function balancePoints(rows: readonly AddressTx[], balanceZat: bigint, windowIsWholeHistory: boolean): BalancePoint[] {
  const oldestFirst = [...rows].sort((a, b) => a.height - b.height || a.stamp.sortMs - b.stamp.sortMs);
  const moved = oldestFirst.reduce<bigint>((acc, r) => acc + r.amountZat, 0n);
  const opening = balanceZat - moved;
  const first = oldestFirst[0];

  // An address with no movements at all. Two points are required and there is
  // nothing to plot between them, so both say that in words rather than
  // drawing the genesis block twice, which is what the first version did.
  if (first === undefined) {
    const nowhere = stampNoTime(0);
    return [
      { height: 0, stamp: nowhere, balanceZat, event: "no movements in this window", crossing: false },
      { height: 0, stamp: nowhere, balanceZat, event: "no movements in this window", crossing: false },
    ];
  }

  const contradiction = windowIsWholeHistory && opening !== 0n;
  const points: BalancePoint[] = [
    {
      height: Math.max(0, first.height - 1),
      stamp: stampBefore(first.stamp),
      balanceZat: opening,
      event: contradiction
        ? `The node reports a balance that these transactions do not account for, by ${zecText(opening)}. This window is the address's whole history, so the two should agree; they are both shown rather than reconciled.`
        : null,
      crossing: false,
    },
  ];

  let running = opening;
  for (const r of oldestFirst) {
    running += r.amountZat;
    points.push({
      height: r.height,
      stamp: r.stamp,
      balanceZat: running,
      event: `${r.directionText}, ${zecText(r.amountZat)}`,
      crossing: r.direction === "t-to-z" || r.direction === "z-to-t" || r.direction === "migration",
    });
  }
  return points;
}

/**
 * The interaction graph, every edge on ONE base.
 *
 * Each edge carries the NET value moved between this address and that
 * counterparty, summed over the window. The first version mixed bases - a
 * coinbase edge carried the gross credit while a pool edge carried the net -
 * so two edges on one diagram measured different things and the picture
 * compared them as if they did not.
 */
function interactionsFor(rows: readonly AddressTx[]): AddressView["interactions"] {
  const edges = new Map<string, { kind: "coinbase" | "pool" | "transparent"; from: string; to: string; label: string; valueZat: bigint }>();
  for (const r of rows) {
    const kind = r.direction === "coinbase" ? "coinbase" : r.direction === "t-to-t" ? "transparent" : "pool";
    const other = r.counterparty.address ?? r.counterparty.title;
    const outward = r.amountZat < 0n;
    const key = `${kind}:${other}:${outward ? "out" : "in"}`;
    const magnitude = r.amountZat < 0n ? -r.amountZat : r.amountZat;
    const existing = edges.get(key);
    if (existing === undefined) {
      edges.set(key, {
        kind,
        from: outward ? "this address" : other,
        to: outward ? other : "this address",
        label: r.counterparty.title,
        valueZat: magnitude,
      });
    } else {
      existing.valueZat += magnitude;
    }
  }
  return [...edges.values()];
}

function reasoning(i: {
  address: string;
  decoded: DecodedAddress;
  label: LabelView | null;
  total: number;
  windowed: number;
  utxoCount: number;
  fromCache: boolean;
}): AddressView["reasoning"] {
  const steps: AddressView["reasoning"] = [
    {
      title: "The address was decoded, not pattern-matched",
      body: `Base58check decode gives a ${i.decoded.script.toUpperCase()} version byte pair for ${i.decoded.network}, and the checksum verifies. A regular expression would have said it looks like an address; this says it is one, and which chain it belongs to.`,
      confidence: "high",
    },
    {
      title: "Balances come from the node's address index",
      body: `getaddressbalance and getaddressutxos over the whole chain: ${countText(i.utxoCount)} unspent ${i.utxoCount === 1 ? "output" : "outputs"}. These are exact and are not derived from the transactions listed below.${i.fromCache ? " Served from the gateway's cache, at most one TTL old." : ""}`,
      confidence: "high",
    },
    {
      title: "The transaction list is a window",
      body:
        i.total > i.windowed
          ? `getaddresstxids reports ${countText(i.total)} transactions for this address. The ${countText(i.windowed)} most recent are read in full; the rest are counted and not fetched.`
          : `getaddresstxids reports ${countText(i.total)} ${i.total === 1 ? "transaction" : "transactions"}, all of which are read in full.`,
      confidence: "high",
    },
    {
      title: "Nothing here is a claim about who controls this address",
      body:
        i.label === null
          ? "The Record carries no label for this address, and none is inferred. An address with no label is unlabelled, not unknown-but-probably."
          : `The Record labels this address "${i.label.label}", applied by ${i.label.labeller} at precedence rank ${i.label.rank}, method: ${i.label.method}. That is a published attribution with its own sources, not an inference this gateway made.`,
      confidence: i.label === null ? null : i.label.confidence,
    },
    {
      title: "The pool side is not estimated here",
      body:
        "Where a transaction crossed the shielded boundary, this view says that it crossed and how much crossed. It does not say what the value became inside the pool. The estimators and their audit trails are HANDOFF-08's, and an estimate rendered without its filters, its N_eff and its assumptions is not one.",
      confidence: null,
    },
  ];
  return steps;
}
