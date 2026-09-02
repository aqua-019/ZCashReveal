/**
 * The loop that keeps the chain state at the node's tip (HANDOFF-12).
 *
 * ONE STEP IS ONE DECISION: the node's tip is read; if the state is behind, the
 * next block by height is fetched and applied; if that block does not extend
 * this state, the reorg is resolved and the step reports it; if the state is
 * at the tip, the step is idle and the loop sleeps for the poll interval. A
 * step is exported on its own so a test can drive the loop one decision at a
 * time against a scripted node and an in-memory store.
 *
 * ZEBRA HAS NO ZMQ (RUNBOOK-VPS section 3), so this loop IS how confirmed
 * blocks reach the indexer: polling by height. Catch-up from the start height
 * to the tip is the same loop with no sleeps between blocks.
 *
 * TWO KINDS OF ERROR, TWO ANSWERS. A transport or node error - a refused
 * socket, a -8 for a height the node reorged away between two calls, a schema
 * mismatch - is logged and retried after the poll interval; the state was not
 * mutated. A `ChainRuntimeError` other than continuity, or any
 * `ZCashRevealStateError`, means this build's decode disagrees with consensus,
 * the in-memory state may be dirty, and the loop STOPS and hands the error to
 * `onFatal` - which in production exits the process so that a restart replays
 * the last block that was written. Retrying such an error would republish a
 * number just proved wrong.
 */
import type { Logger } from "pino";
import type { Hex } from "@zcashreveal/types";
import type { GetTreestate, RpcBlock } from "@zcashreveal/zebra-rpc";

import { ZCashRevealStateError } from "../state/errors.js";
import type { ChainState } from "./chain-state.js";
import type { ChainStore, RollbackCounts } from "./chain-store.js";
import { applyConfirmedBlock, type AppliedBlock } from "./confirmed-block.js";
import { ChainContinuityError, ChainRuntimeError } from "./errors.js";
import { resolveReorg, type HeaderSource } from "./reorg.js";

export interface FollowerRpc extends HeaderSource {
  getBlockchainInfo(): Promise<{ readonly blocks: number }>;
  getBlock(id: { readonly height: number }): Promise<RpcBlock>;
  getTreestate(id: { readonly hash: Hex }): Promise<GetTreestate>;
}

export type StepResult =
  | { readonly kind: "idle"; readonly tip: number }
  | { readonly kind: "applied"; readonly block: AppliedBlock; readonly tip: number }
  | { readonly kind: "reorg"; readonly splitHeight: number; readonly rolledBack: RollbackCounts; readonly tip: number };

export interface FollowerOptions {
  readonly rpc: FollowerRpc;
  readonly store: ChainStore;
  readonly log: Logger;
  readonly pollIntervalMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Called after every applied block, before the next step. The anchor registry is fed from here. */
  readonly onApplied?: (block: AppliedBlock) => Promise<void> | void;
  readonly onReorg?: (splitHeight: number, rolledBack: RollbackCounts) => Promise<void> | void;
  /** Called once, with the error, when the loop stops on a consensus disagreement. */
  readonly onFatal: (err: unknown) => void;
}

export class ChainFollower {
  /** REPLACED on a reorg. Read it through the follower, never hold it. */
  chain: ChainState;
  private running = false;
  private loopDone: Promise<void> | null = null;
  private lastTip: number | null = null;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    chain: ChainState,
    private readonly opts: FollowerOptions,
  ) {
    this.chain = chain;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** The node's tip as last observed, or `null` before the first step. */
  get tipHeight(): number | null {
    return this.lastTip;
  }

  async step(): Promise<StepResult> {
    const info = await this.opts.rpc.getBlockchainInfo();
    const tip = info.blocks;
    this.lastTip = tip;
    if (this.chain.height >= tip) return { kind: "idle", tip };

    const block = await this.opts.rpc.getBlock({ height: this.chain.height + 1 });
    try {
      const applied = await applyConfirmedBlock(this.chain, block, this.opts.store, {
        treestate: (hash) => this.opts.rpc.getTreestate({ hash }),
        log: this.opts.log,
      });
      if (this.opts.onApplied !== undefined) await this.opts.onApplied(applied);
      return { kind: "applied", block: applied, tip };
    } catch (err) {
      if (!(err instanceof ChainContinuityError)) throw err;
      this.opts.log.warn({ height: block.height, tip: this.chain.height }, err.message);
      const resolution = await resolveReorg(this.chain, this.opts.store, this.opts.rpc, block, this.opts.log);
      this.chain = resolution.chain;
      if (this.opts.onReorg !== undefined) await this.opts.onReorg(resolution.splitHeight, resolution.rolledBack);
      return { kind: "reorg", splitHeight: resolution.splitHeight, rolledBack: resolution.rolledBack, tip };
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopDone = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loopDone;
    this.loopDone = null;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.step();
        if (result.kind === "idle") await this.sleep(this.opts.pollIntervalMs);
      } catch (err) {
        if (isFatal(err)) {
          this.running = false;
          this.opts.log.fatal({ err, height: this.chain.height }, "the confirmed-block driver disagrees with consensus; stopping");
          this.opts.onFatal(err);
          return;
        }
        this.opts.log.error({ err, height: this.chain.height }, "confirmed-block step failed; retrying after the poll interval");
        await this.sleep(this.opts.pollIntervalMs);
      }
    }
  }
}

/** A disagreement with consensus, or corrupt state: this build's fault, and never retried. */
export function isFatal(err: unknown): boolean {
  if (err instanceof ChainContinuityError) return false;
  return err instanceof ChainRuntimeError || err instanceof ZCashRevealStateError;
}
