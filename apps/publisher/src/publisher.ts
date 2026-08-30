/**
 * The publish loop: one snapshot per NEW tip, to every configured sink
 * (docs/2.0/SNAPSHOT.md section 8.4).
 *
 * DE-DUPLICATION IS BY (height, hash) AND NOT BY HEIGHT ALONE, which is one
 * word more than section 8.4's "de-duplicates by height" and is the reading that
 * makes the rest of the document true. Section 8.1 says `hash` is on the
 * document so a reader knows "which block, unambiguously, ACROSS A REORG". A
 * reorg replaces the block at the tip height with a different one; deduplicating
 * on height alone would suppress exactly that publish, and the store would go on
 * serving a snapshot naming a block that is no longer canonical - the one
 * failure `hash` exists to make visible. A repeated tip repeats both fields and
 * is still suppressed, which is what A6 asserts.
 *
 * A TIP THAT ARRIVES MID-PUBLISH DOES NOT START A SECOND ONE. Section 8.4: "the
 * newer height is published on the next turn". The snapshot is a latest-wins
 * document, so skipping an intermediate height loses nothing a reader can
 * observe, whereas two concurrent `MULTI`s against a shared store could
 * interleave `latest` and `height` and leave the two disagreeing. The pending
 * tip is a single slot and the newest arrival wins it.
 *
 * THE MONTHLY COUNTER IS CHARGED FOR EVERY ATTEMPT, NOT FOR EVERY SUCCESS, and
 * the asymmetry is deliberate. A rejected `MULTI` may have spent commands before
 * it failed, and this process cannot tell from the rejection whether it did.
 * Over-counting makes the ceiling bite slightly early; under-counting lets this
 * project overrun an allowance it shares with someone else's production. Only
 * one of those two errors is ours to make.
 */

import type { SnapshotV1 } from "@zcashreveal/types";

import { isOverCeiling, type BudgetState } from "./budget.js";
import { writeToAllSinks, type Sink, type SinkResult } from "./sinks/sink.js";

/** A chain tip, as the publisher needs one. */
export interface Tip {
  readonly height: number;
  /** 64 lowercase hex characters, no `0x`. */
  readonly hash: string;
  /** The BLOCK's own timestamp, milliseconds since epoch. */
  readonly timeMs: number;
}

/** The subset of a pino logger this module uses. */
export interface PublisherLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** The monthly counter, as the publish loop uses it. {@link FileCommandBudget} satisfies it. */
export interface CommandLedger {
  readonly ceiling: number;
  readonly state: BudgetState;
  charge(commands: number, atMs: number): BudgetState;
}

export interface PublisherOptions {
  readonly sinks: ReadonlyArray<Sink>;
  readonly log: PublisherLog;
  /**
   * Build the document for one tip, and serialise it.
   *
   * A FUNCTION RATHER THAN THE INPUTS, so that reading the world - Postgres, the
   * node, the mempool - stays outside this loop and this loop stays testable
   * from literals. It is async because that reading is: the in-flight latch
   * above exists precisely because a build takes time, and a synchronous
   * signature would have hidden the concurrency section 8.4 rules on. A build
   * that throws or rejects is caught here: nothing is published for that tip and
   * the failure is logged, which is correct, because the alternative is a
   * document that names the wrong block.
   */
  readonly build: (tip: Tip) => Promise<BuiltSnapshot>;
  /** The monthly counter, or null to run uncounted (a laptop with no managed store). */
  readonly budget?: CommandLedger | null;
}

/** A document and the exact bytes every sink writes for it. */
export interface BuiltSnapshot {
  readonly snapshot: SnapshotV1;
  /** `serializeSnapshot(snapshot)`, applied ONCE so two sinks cannot disagree about the bytes. */
  readonly json: string;
}

/** What one call to {@link SnapshotPublisher.onTip} did. */
export interface PublishOutcome {
  readonly published: boolean;
  /** Why not, when `published` is false. */
  readonly reason?: "duplicate" | "deferred" | "build_failed";
  readonly results?: ReadonlyArray<SinkResult>;
}

export class SnapshotPublisher {
  readonly #options: PublisherOptions;
  #last: Tip | null = null;
  #inFlight = false;
  #pending: Tip | null = null;
  #publishes = 0;
  #ceilingReported = false;

  constructor(options: PublisherOptions) {
    this.#options = options;
  }

  /** How many publishes actually reached the sinks. A6 counts this. */
  get publishCount(): number {
    return this.#publishes;
  }

  /** The last tip published, or null before the first. */
  get lastPublished(): Tip | null {
    return this.#last;
  }

  /**
   * Offer a tip.
   *
   * Resolves when this tip has been published, suppressed as a duplicate, or
   * deferred behind a publish already in flight. Never rejects: a sink failure
   * is `writeToAllSinks`'s business and a build failure is caught here.
   */
  async onTip(tip: Tip): Promise<PublishOutcome> {
    if (this.#isDuplicate(tip)) {
      return { published: false, reason: "duplicate" };
    }
    if (this.#inFlight) {
      // Latest wins. See the header: the snapshot is a latest-wins document.
      this.#pending = tip;
      return { published: false, reason: "deferred" };
    }

    this.#inFlight = true;
    try {
      return await this.#publish(tip);
    } finally {
      this.#inFlight = false;
      const next = this.#pending;
      this.#pending = null;
      if (next !== null && !this.#isDuplicate(next)) {
        // The deferred tip's own turn. Awaited by nobody, which is why its
        // rejection cannot escape: `onTip` never rejects.
        void this.onTip(next);
      }
    }
  }

  #isDuplicate(tip: Tip): boolean {
    const last = this.#last;
    return last !== null && last.height === tip.height && last.hash === tip.hash;
  }

  async #publish(tip: Tip): Promise<PublishOutcome> {
    let built: BuiltSnapshot;
    try {
      built = await this.#options.build(tip);
    } catch (err) {
      this.#options.log.error(
        { err, height: tip.height, hash: tip.hash },
        "snapshot build failed; nothing published for this tip",
      );
      return { published: false, reason: "build_failed" };
    }

    const sinks = this.#affordableSinks();
    const results = await writeToAllSinks(sinks, built.snapshot, built.json, this.#options.log);

    this.#last = tip;
    this.#publishes += 1;
    this.#charge(sinks, tip);

    this.#options.log.info(
      {
        height: tip.height,
        sinks: results.map((r) => `${r.sink}=${r.ok ? "ok" : "failed"}`).join(" "),
      },
      "snapshot published",
    );
    return { published: true, results };
  }

  /**
   * The sinks this publish may use.
   *
   * THE MID-RUN HALF OF THE CEILING, and it is not the same rule as A12's
   * startup refusal. A process that starts one command under the ceiling and
   * then runs for a month would spend the whole shared allowance while never
   * failing the startup gate, so the ceiling has to bind the running process
   * too. What it does is DROP THE SINKS THAT COST COMMANDS, not exit: the file
   * sink keeps the gateway's copy fresh, which is section 8.7's "the file sink
   * is unaffected" applied to a process that is already running.
   */
  #affordableSinks(): ReadonlyArray<Sink> {
    const budget = this.#options.budget;
    if (budget === undefined || budget === null) return this.#options.sinks;
    if (!isOverCeiling(budget.state, budget.ceiling)) return this.#options.sinks;

    if (!this.#ceilingReported) {
      this.#ceilingReported = true;
      this.#options.log.warn(
        { recorded: budget.state.commands, ceiling: budget.ceiling, month: budget.state.month },
        "monthly managed-store ceiling reached; publishing to the file sink only",
      );
    }
    return this.#options.sinks.filter((s) => s.managedStoreCommandsPerWrite === 0);
  }

  /** Charge the attempted sinks' cost to the monthly counter. See the header. */
  #charge(sinks: ReadonlyArray<Sink>, tip: Tip): void {
    const budget = this.#options.budget;
    if (budget === undefined || budget === null) return;
    const commands = sinks.reduce((sum, s) => sum + s.managedStoreCommandsPerWrite, 0);
    if (commands === 0) return;
    try {
      budget.charge(commands, tip.timeMs);
    } catch (err) {
      // A full disk must not take down the process whose purpose is that the
      // site renders when other things are down. The in-memory count still
      // bounds this run; only the restart-survival half is lost.
      this.#options.log.error({ err }, "could not flush the monthly command counter");
    }
  }
}
