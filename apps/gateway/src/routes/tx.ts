/**
 * `GET /api/tx/:txid`.
 *
 * A txid is 64 hex characters. A 62-character one is rejected with a 400 and
 * the reason rather than passed to the node, which would answer -5 and produce
 * a 404 - and "there is no such transaction" is a different statement from
 * "that is not a transaction id", which assertion A3 is about.
 */
import { txViewSchema } from "@zcashreveal/types";
import { z } from "zod";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { badRequest, notFound, toStatus } from "./errors.js";
import { respond } from "../serialize.js";
import { ReadContext } from "../views/context.js";
import { buildTxView, type IndexedLeak } from "../views/tx.js";

const txidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "a txid is 64 hex characters with no 0x prefix");

export function registerTxRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get<{ Params: { txid: string } }>("/tx/:txid", async (req, reply) => {
    const parsed = txidSchema.safeParse(req.params.txid);
    if (!parsed.success) {
      return badRequest(
        reply,
        "not a transaction id",
        parsed.error.issues.map((i) => ({ path: "txid", message: i.message })),
      );
    }
    const txid = parsed.data.toLowerCase();

    const ctx = new ReadContext(deps.rpc, deps.cache, deps.cfg);
    try {
      const indexed = await readIndexedLeak(deps, txid);
      const view = await buildTxView(ctx, txid, indexed);
      if (view === null) return notFound(reply, "the chain does not have that transaction");
      return respond("/tx", txViewSchema, view);
    } catch (err) {
      deps.log.warn({ err: String(err) }, "tx view failed");
      return toStatus(err, reply);
    }
  });
}

/**
 * What the indexer recorded about this transaction, or null.
 *
 * Null is the normal case for a confirmed transaction the indexer never saw in
 * the mempool, and the view says "not classified" for it rather than computing
 * a class down a second code path. A database that is absent or unreachable
 * also yields null: a leak classification is an enrichment, and losing it must
 * degrade the page rather than fail the request.
 */
async function readIndexedLeak(deps: RouteDeps, txid: string): Promise<IndexedLeak | null> {
  if (deps.sql === null) return null;
  try {
    const rows = await deps.sql<
      { leak_class: string; overall_severity: string; fee_zat: string; likely_wallet: string | null }[]
    >`
      SELECT leak_class, overall_severity, fee_zat, likely_wallet
      FROM leak_reports WHERE txid = ${txid} LIMIT 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    const severity =
      row.overall_severity === "MEDIUM"
        ? "MED"
        : row.overall_severity === "CRITICAL"
          ? "HIGH"
          : row.overall_severity === "HIGH" || row.overall_severity === "LOW" || row.overall_severity === "INFO"
            ? row.overall_severity
            : "INFO";
    return {
      leakClass: row.leak_class,
      severity,
      feeZat: BigInt(row.fee_zat),
      likelyWallet: row.likely_wallet,
    };
  } catch (err) {
    deps.log.warn({ err: String(err) }, "leak_reports lookup failed; serving the chain view alone");
    return null;
  }
}
