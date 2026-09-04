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
import { applyConfirmedBlock, type AppliedBlock, type TreestateSource } from "./confirmed-block.js";
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
  /**
   * How long to wait after an APPLIED block before taking the next step, or
   * undefined for none.
   *
   * `pollIntervalMs` BOUNDS THE IDLE RATE AND NOTHING ELSE, which is not what a
   * ceiling needs. `loop()` sleeps only when a step comes back `idle`, so while
   * this state is behind the tip it re-enters `step()` immediately and spends
   * requests as fast as the gate allows - measured at twenty blocks and
   * forty-one wire calls with zero sleeps. Against a node you own that is
   * correct and this stays undefined; against a metered endpoint it starves
   * every other caller on the same client for the whole of the catch-up, and
   * `planConfirmedFollow` supplies the interval that holds the follower to its
   * reservation instead.
   */
  readonly catchUpIntervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Where the Ironwood treestate comes from. Defaults to calling `rpc.getTreestate`.
   *
   * INJECTABLE BECAUSE THE DEFAULT CANNOT EXPRESS AN ABSENT METHOD, AND THAT
   * COST A STALL. `FollowerRpc.getTreestate` returns `Promise<GetTreestate>`, so
   * the default source can only resolve or throw - it can never return the
   * `null` that `TreestateSource`'s own contract defines as "a node that does
   * not serve it". Against an endpoint answering `-32601` for that one method
   * the throw reaches the loop, `isFatal` is false, and the same block is
   * fetched and refused forever. See `runtime/treestate-source.ts`, which is
   * where the two sources and the measurement live.
   */
  readonly treestate?: TreestateSource;
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
  private readonly treestate: TreestateSource;

  constructor(
    chain: ChainState,
    private readonly opts: FollowerOptions,
  ) {
    this.chain = chain;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.treestate = opts.treestate ?? ((hash) => opts.rpc.getTreestate({ hash }));
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
        treestate: this.treestate,
        log: this.opts.log,
      });
      if (this.opts.onApplied !== undefined) {
        try {
          await this.opts.onApplied(applied);
        } catch (err) {
          // A FATAL-SHAPED ERROR IS STILL FATAL, EVEN HERE. Swallowing every
          // error unconditionally removed the follower's own "two kinds of
          // error" invariant for the whole `onApplied` interface: a
          // ChainRuntimeError or a state error raised by a callback would have
          // stopped the loop before this try/catch existed and silently did
          // not after it. A gate reviewer measured both sides against the real
          // class. No shipped callback raises one today, which is exactly the
          // consumer-correct-by-accident shape this project keeps finding in
          // fix commits.
          if (isFatal(err)) throw err;
          // THE BLOCK IS ALREADY COMMITTED AND THE CHAIN HAS ALREADY ADVANCED
          // PAST IT, SO THIS IS NOT A STEP TO RETRY AND MUST NOT BE REPORTED
          // AS ONE. `applyConfirmedBlock` writes and advances before returning;
          // letting a side-effect failure out of `step()` sent it to the loop's
          // generic handler, which logged "retrying after the poll interval"
          // and then fetched the NEXT block - so the anchors this block
          // registered were lost with no retry and no backfill, while the log
          // said the opposite. The loss is now loud, attributable, and named at
          // the height it happened. Found by a gate reviewer.
          this.opts.log.error(
            { err, height: applied.height, anchors: applied.anchors.map((a) => a.root) },
            "onApplied failed AFTER the block was committed; its anchors are unregistered and will NOT be retried",
          );
        }
      }
      return { kind: "applied", block: applied, tip };
    } catch (err) {
      if (!(err instanceof ChainContinuityError)) throw err;
      this.opts.log.warn({ height: block.height, tip: this.chain.height }, err.message);
      const resolution = await resolveReorg(this.chain, this.opts.store, this.opts.rpc, block, this.opts.log);
      this.chain = resolution.chain;
      // THE SAME SHAPE, ONE CALLBACK LATER, AND IT HAD A LIVE TRIGGER THE
      // FIRST ONE DID NOT. `onReorg` runs after the rollback has committed and
      // after `this.chain` has been replaced, so a throw there is not a step to
      // retry either - and the shipped callback calls
      // `anchorRegistry.forgetAbove`, a Postgres write that can fail
      // transiently. Left unwrapped, it reached the loop's generic handler and
      // was logged as "retrying after the poll interval", which is the exact
      // sentence the `onApplied` fix was written to stop saying. Found by the
      // gate round that reviewed that fix.
      if (this.opts.onReorg !== undefined) {
        try {
          await this.opts.onReorg(resolution.splitHeight, resolution.rolledBack);
        } catch (err) {
          if (isFatal(err)) throw err;
          this.opts.log.error(
            { err, splitHeight: resolution.splitHeight },
            "onReorg failed AFTER the rollback was committed; the anchor registry may still hold orphaned rows and will NOT be retried",
          );
        }
      }
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
        // AND A PACED CATCH-UP WHEN ONE IS CONFIGURED. See `catchUpIntervalMs`.
        // A reorg step is paced too: it also spends requests - the header walk
        // to the split - and a reorg on a metered endpoint is not a reason to
        // stop metering.
        else if (this.opts.catchUpIntervalMs !== undefined) await this.sleep(this.opts.catchUpIntervalMs);
      } catch (err) {
        if (isFatal(err)) {
          this.running = false;
          this.opts.log.fatal({ err, height: this.chain.height }, "the confirmed-block driver disagrees with consensus; stopping");
          // AN `onFatal` THAT THROWS MUST NOT BECOME AN UNHANDLED REJECTION.
          // `loop()`'s promise is awaited only by `stop()`, so a throwing
          // callback both rejected `stop()` and produced an unhandled rejection
          // - measured by a gate reviewer, one per throw. The shipped callback
          // is `onFatal: () => void shutdown(1)` and `shutdown` closes sockets
          // and calls `process.exit`, so the throw is reachable in principle;
          // the reviewer labelled the production reachability UNVERIFIED and it
          // stays that way. What is certain is that the last thing a process
          // does before exiting on a consensus disagreement should not be to
          // lose the reason in an unhandled rejection.
          try {
            this.opts.onFatal(err);
          } catch (fromCallback) {
            this.opts.log.fatal({ err: fromCallback }, "onFatal itself threw; the process is stopping anyway");
          }
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
