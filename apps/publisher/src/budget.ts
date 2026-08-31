/**
 * The monthly command counter, and the refusal it powers.
 *
 * WHY THERE IS A COUNTER AT ALL. The Vercel-managed store's allowance is 500,000
 * commands a month and it is SHARED with an unrelated production project
 * (docs/2.0/SNAPSHOT.md sections 1 and 5). The publisher puts 5 commands on the
 * wire per new tip - about 172,500 a month - so `SNAPSHOT_REDIS_MONTHLY_BUDGET`
 * (default 200,000) is not a performance knob: it is the mechanism by which this
 * project can never be the reason the other one is rate limited.
 *
 * WHERE IT LIVES, AND THE TWO PLACES IT MUST NOT. SNAPSHOT.md section 5 states
 * both halves and neither is pedantry.
 *
 *   NOT IN THE MANAGED STORE. Reading and writing the counter there would be a
 *   SIXTH command per tip, which breaks assertion A10 - the whole point of
 *   which is that the count is provable by counting - and it would spend the
 *   allowance in order to measure the allowance.
 *
 *   NOT IN MEMORY ALONE. A counter that starts at zero on every restart makes
 *   the ceiling vacuous: a process that crash-loops publishes without bound and
 *   the refusal never fires.
 *
 * So it is a file on a named VPS volume, keyed by `YYYY-MM`, read at startup and
 * flushed after each tip.
 *
 * THE MONTH KEY COMES FROM A SUPPLIED TIME, NEVER FROM A BARE `new Date()`. The
 * roll from one month to the next is the one behaviour here a test must be able
 * to pin, and a function that reads the wall clock cannot be pinned. Every
 * function below that needs a month takes the milliseconds; the one place a
 * clock is read is {@link FileCommandBudget}, which takes it as an injected
 * `now`. The tip's own block timestamp is what the publisher passes after a
 * publish, so the counter is charged to the month the BLOCK belongs to rather
 * than to whatever month the process happens to be running in.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * How many commands one new tip WRITES against the managed store. SNAPSHOT.md
 * section 8.6.
 *
 * THREE IS THE WRITE COUNT AND IT IS NOT WHAT IS CHARGED. The publish is one
 * `MULTI`, three `SET`s and one `EXEC`, so five commands cross the wire and
 * three of them write. This constant is the write count, kept because A10
 * asserts it by counting the spy's `set` calls; the counter is charged
 * {@link WIRE_COMMANDS_PER_TIP}.
 */
export const COMMANDS_PER_TIP = 3;

/**
 * Commands one publish puts on the wire, envelope included: `MULTI` + 3 x `SET`
 * + `EXEC`. **This is what the monthly counter is charged.**
 *
 * WHY THE ENVELOPE IS CHARGED THOUGH NOBODY HAS SEEN A BILL (LEDGER-09 Q2, L2's
 * ruling of 30 Aug 2026, fold 2). Whether Upstash's meter bills `MULTI` and
 * `EXEC` cannot be read from inside a session - egress to `upstash.com` is
 * refused by the container's proxy. L2 could reach it and returned a partial
 * answer, which is recorded here verbatim because a later reader must be able to
 * weigh it rather than inherit a number:
 *
 *   "Operational commands like AUTH, HELLO, SELECT, COMMAND, CONFIG, INFO,
 *    PING, RESET, and QUIT are not charged."
 *      - Upstash's pricing page, read by L2 on 30 Aug 2026
 *
 * `MULTI` and `EXEC` are NOT on that list. The docs do not state the transaction
 * case explicitly, so this is EVIDENCE RATHER THAN PROOF - but a published list
 * of what is free that omits both of our envelope commands is the strongest
 * signal available short of a bill.
 *
 * THE ASYMMETRY, WHICH HANDOFF-09 HAD BACKWARDS AND L2 CORRECTED. That session
 * argued charging five "buys nothing" and costs "a predictable outage of our own
 * fallback", and kept the charge at three. The first half is right and it is the
 * REASON TO CHARGE FIVE: at five a month spends about 172,500 of a 500,000
 * allowance, still a minority share, so the true cost of over-charging is nil.
 * The second half misplaces whose resource is at risk. The 200,000 ceiling is
 * OURS and adjustable; the 500,000 is SHARED with a production project that
 * never agreed to run alongside us. A budget calibrated on an undercount
 * protects neither - it does not stop us before their meter matters, and it
 * trips our own fallback for a reason that is not the real one. When the
 * uncertainty is about someone else's quota, take the conservative side.
 *
 * STILL AN OPERATOR TASK, and raising the charge does not close it: after one
 * full month of publishing, read the console's actual command count against the
 * tips published (`handoffs/README.md`'s click list).
 *
 * NEITHER CONSTANT BECOMES THAT NUMBER, and the earlier wording of this
 * paragraph said it did. 3 is the write count and 5 is the wire count; both are
 * MEASURED facts about what this code does, both are pinned by tests, and a
 * meter reading is a third quantity that falsifies neither. What the bill
 * changes is the CHARGE - the `redis` sink's `managedStoreCommandsPerWrite`,
 * which is currently this constant. If the meter says three, that field becomes
 * {@link COMMANDS_PER_TIP}; if it says something else again, it becomes a named
 * constant of its own. Section 8.7's ceiling is re-checked against whichever it
 * is. Setting a constant called WIRE to a non-wire number would falsify its own
 * docblock and turn two suites red, which is what the old wording invited.
 */
export const WIRE_COMMANDS_PER_TIP = 5;

/** The counter, as it is held in memory and on disk. */
export interface BudgetState {
  /** `YYYY-MM`, UTC. */
  readonly month: string;
  /** Commands spent against the managed store in that month. */
  readonly commands: number;
}

/**
 * `YYYY-MM` in UTC, from a millisecond timestamp.
 *
 * UTC AND NOT THE HOST'S ZONE. The allowance is a property of the store's
 * billing month, not of the VPS's locale, and a container whose `TZ` changed
 * between restarts would otherwise roll the counter early or late and lose the
 * count for the overlap.
 *
 * @throws RangeError if `ms` is not a finite timestamp.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function monthKeyOf(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`monthKeyOf: ${ms} is not a timestamp. A month key from NaN would be "NaN-NaN".`);
  }
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/**
 * The state a month starts in.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function emptyBudget(month: string): BudgetState {
  return { month, commands: 0 };
}

/**
 * Carry a state into `month`, resetting the count when the month changed.
 *
 * A RESET AND NOT A CARRY-FORWARD, because the allowance is per month. The
 * previous month's total is deliberately not retained: nothing in this design
 * reads history, and keeping it would invite a later reader to sum the file and
 * refuse on a total the store never charged.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function rollToMonth(state: BudgetState, month: string): BudgetState {
  return state.month === month ? state : emptyBudget(month);
}

/**
 * Charge `commands` to a state.
 *
 * @throws RangeError if `commands` is negative or not an integer - a negative
 * charge is the shape a "refund" bug takes, and it would spend the ceiling back.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function addCommands(state: BudgetState, commands: number): BudgetState {
  if (!Number.isInteger(commands) || commands < 0) {
    throw new RangeError(
      `addCommands: ${commands} is not a non-negative whole number of commands. ` +
        "A negative charge would hand budget back that the store already spent.",
    );
  }
  return { month: state.month, commands: state.commands + commands };
}

/**
 * Whether the recorded count has reached the ceiling.
 *
 * AT OR ABOVE, NOT ABOVE. A12 says "at or above", and the difference is one
 * whole publish: `>` would let a run that has already spent exactly the ceiling
 * spend five more.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function isOverCeiling(state: BudgetState, ceiling: number): boolean {
  return state.commands >= ceiling;
}

/** What the startup gate decided, and what the process should do about it. */
export interface BudgetGate {
  /** True when the publisher may start. */
  readonly ok: boolean;
  /** 0 when `ok`, 1 otherwise. A refusal is a non-zero exit, per A12. */
  readonly exitCode: number;
  /** Human-readable, and it NAMES THE CEILING when it refuses. A12 requires that. */
  readonly message: string;
}

/**
 * The startup refusal (A12, SNAPSHOT.md section 8.7).
 *
 * A HARD REFUSAL RATHER THAN A WARNING, AND IT IS SCOPED TO THE MANAGED STORE.
 * Over the ceiling the process exits non-zero and writes nothing to the managed
 * store. "The file sink is unaffected" is section 8.7's phrase and it means what
 * it says literally: the refusal writes nothing, removes nothing and rewrites
 * nothing, so whatever `snapshot.json` the previous run left on disk is still
 * there, byte for byte, for the gateway to serve. It does NOT mean the refused
 * process keeps publishing - it has exited.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function budgetGate(state: BudgetState, ceiling: number): BudgetGate {
  if (isOverCeiling(state, ceiling)) {
    return {
      ok: false,
      exitCode: 1,
      message:
        `refusing to start: ${state.commands} managed-store commands already recorded for ${state.month}, ` +
        `at or above the ceiling of ${ceiling} (SNAPSHOT_REDIS_MONTHLY_BUDGET). ` +
        "The allowance is shared with an unrelated production project; see docs/2.0/SNAPSHOT.md section 5.",
    };
  }
  return {
    ok: true,
    exitCode: 0,
    message: `${state.commands} of ${ceiling} managed-store commands recorded for ${state.month}`,
  };
}

/**
 * Read a counter file's text.
 *
 * RETURNS NULL FOR ANYTHING IT DOES NOT UNDERSTAND, AND THAT IS THE SAFE
 * DIRECTION HERE rather than the usual one. An unreadable counter means "no
 * count for this month", which starts the month at zero and lets the publisher
 * run - the alternative, refusing to start on a corrupt file, converts a
 * one-byte disk fault into an outage of the thing whose entire purpose is that
 * the site renders when other things are down. The ceiling still bounds the run
 * that follows, so the worst case is one month's allowance spent twice, not
 * unbounded spending.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function parseBudgetState(text: string): BudgetState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const month = rec["month"];
  const commands = rec["commands"];
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return null;
  if (typeof commands !== "number" || !Number.isInteger(commands) || commands < 0) return null;
  return { month, commands };
}

/**
 * The counter file's text.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function serializeBudgetState(state: BudgetState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** How {@link FileCommandBudget} is built. */
export interface FileCommandBudgetOptions {
  /** The counter file's path. On the VPS this is on a named volume. */
  readonly path: string;
  /** `SNAPSHOT_REDIS_MONTHLY_BUDGET`. */
  readonly ceiling: number;
  /**
   * The clock, injected.
   *
   * THE ONE PLACE A CLOCK IS READ IN THIS MODULE, and it is a parameter so a
   * test can pin the month. Startup has no tip to take a time from, so it reads
   * this; every charge after that uses the tip's own block timestamp instead.
   */
  readonly now: () => number;
}

/**
 * The counter, backed by a file.
 *
 * NOT PURE and deliberately the only thing here that is not: it reads and writes
 * a file. Everything it decides is decided by the pure functions above, so the
 * behaviour a test needs to pin - the roll, the charge, the refusal - is pinned
 * without a filesystem.
 */
export class FileCommandBudget {
  readonly #path: string;
  readonly #ceiling: number;
  readonly #now: () => number;
  #state: BudgetState;

  constructor(options: FileCommandBudgetOptions) {
    this.#path = options.path;
    this.#ceiling = options.ceiling;
    this.#now = options.now;
    this.#state = emptyBudget(monthKeyOf(options.now()));
  }

  /** The count as this process last knew it. */
  get state(): BudgetState {
    return this.#state;
  }

  get ceiling(): number {
    return this.#ceiling;
  }

  /**
   * Read the file and roll it into the current month. Called once, at startup.
   *
   * A MISSING FILE IS A ZERO COUNT AND NOT AN ERROR: the first run on a fresh
   * volume has spent nothing, and refusing to start because nobody has published
   * yet would be a bootstrap that cannot bootstrap.
   */
  load(): BudgetState {
    // Declared without an initialiser: both branches below assign, so an
    // initial `null` here is dead and `no-useless-assignment` says so.
    let text: string | null;
    try {
      text = readFileSync(this.#path, "utf8");
    } catch {
      text = null;
    }
    const stored = text === null ? null : parseBudgetState(text);
    const month = monthKeyOf(this.#now());
    this.#state = stored === null ? emptyBudget(month) : rollToMonth(stored, month);
    return this.#state;
  }

  /** The startup refusal, against the state {@link load} produced. */
  gate(): BudgetGate {
    return budgetGate(this.#state, this.#ceiling);
  }

  /**
   * Charge a publish and flush.
   *
   * `atMs` IS THE TIP'S OWN BLOCK TIMESTAMP, not the wall clock: the month a
   * publish belongs to is the month of the block it describes. Around a month
   * boundary the two differ by up to the propagation delay, and charging the
   * block's month is the reading that matches what the store was actually asked
   * to do for that block.
   */
  charge(commands: number, atMs: number): BudgetState {
    this.#state = addCommands(rollToMonth(this.#state, monthKeyOf(atMs)), commands);
    this.flush();
    return this.#state;
  }

  /**
   * Write the counter.
   *
   * WRITE-THEN-RENAME, so a process killed mid-write leaves either the old file
   * or the new one and never a truncated one. A truncated counter parses as null,
   * which resets the month to zero - survivable, per {@link parseBudgetState},
   * but avoidable for the price of one `rename`.
   *
   * A FAILURE TO WRITE THROWS HERE AND IS CAUGHT BY THE PUBLISHER, which logs it
   * and carries on. The counter is a safety rail, and a full disk must not take
   * down the process whose entire purpose is that the public site renders when
   * other things are down. The consequence - the recorded count stops advancing
   * until the disk recovers - errs in the direction of publishing rather than of
   * refusing, and the in-memory count still bounds THIS run.
   */
  flush(): void {
    const tmp = `${this.#path}.tmp`;
    writeFileSync(tmp, serializeBudgetState(this.#state), "utf8");
    renameSync(tmp, this.#path);
  }
}
