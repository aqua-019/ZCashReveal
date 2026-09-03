# PROMPT-14 — the messages that steered the HANDOFF-14 session

Archived verbatim under Revolution protocol step 5. One file per handoff, each message under a
heading naming what it is and when it arrived. This first message lands in the same commit as
RECONCILE (LEDGER-02 Q7); anything that arrives mid-session is appended in the next commit.

**THERE IS NO `L2 RESOLUTION` BLOCK IN THIS PROMPT, SO REVOLUTION PROTOCOL STEP 2 IS SKIPPED.** It
carries two named findings — F-52-1 restated and F-53-1, which is new — but neither arrives inside a
block fenced as `L2 RESOLUTION`, and step 2's trigger is the fence rather than the presence of L2's
voice. Both findings are recorded in this handoff's §8 instead, which is where a session's own
observations belong.

## Message 1 — the session kickoff, carrying §1-§6 of a handoff that did not exist yet (3 Sep 2026, session start)

Arrived as the opening user turn with one attached file, `proofrung1.test.ts`, reproduced under
Message 1a below. The turn carries the kickoff line, the fork-point proof obligation, DELIVERABLE 0
(write the handoff), the three-cell reconcile table, the `LOG.md` warning, and §1 through §6 of
HANDOFF-14. Reproduced below in full, from its first line to its last, byte for byte.

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Report spawn mode first. Stop at PR opened. **Fork from the head of `main`, and prove it is the right head before you touch anything:** `git merge-base --is-ancestor 4e622ff origin/main` must exit 0. `4e622ff` is HANDOFF-13's section 5 UNVERIFIED banner, and its presence is how you know PR #55 landed. If it exits 1, STOP - `main` is behind and this handoff is not ready to start. Record the SHA you actually forked from in section 7. (A literal SHA is not pinned here on purpose: the last three prompts in this project each pinned one that had moved by the time it was pasted.)

**YOUR HANDOFF DOES NOT EXIST YET. WRITING IT IS DELIVERABLE 0.** Create `handoffs/HANDOFF-14-live-without-a-database.md` from §1–§6 below, `status: in-progress`, track `Integration`, `depends_on: 12`, `written_by: L2 (Cowork) · 2 Sep 2026, re-verified 3 Sep 2026`. **RECONCILE FIRST. Exactly three things are stale on `main` at `04237c5`, all because PR #55 did not touch `handoffs/README.md`:**

| where | now | should be |
|---|---|---|
| `handoffs/HANDOFF-13-mode-a-wasm.md:4` | `status: shipped` | `status: closed` - section 7 STATUS is `DONE-WITH-ASSUMPTIONS` and says plainly *"Nothing here is a partial build"*, which is what F-50-4 requires before a merged PR closes a handoff |
| `handoffs/README.md` row 13, branch cell | "PR #53 merged mid-gate; **PR #54** carries rounds 2 and 3" | **#55 is missing** - it carried round 4 and the section 5 UNVERIFIED banner |
| `handoffs/README.md` row 13, status cell | `` `shipped` `` | `` `closed` `` |

**`handoffs/LOG.md` IS ALREADY CORRECT - DO NOT "FIX" IT.** This project keeps ONE ROW PER HANDOFF, updated in place, not one row per PR; #55 rewrote handoff 13's row to carry rounds 4 and 5, the 91 agents killed by the usage limit, the LOST state, and section 5's second verification failure. L2 read the file with `tail`, mistook an updated row for a missing one, and drafted a whole guard against a defect that does not exist. It is recorded here because the shape - **enumerating the wrong object and building on the diagnosis** - is F-52-1 and has now cost this project twice.

**THE SITE IS RENDERING A TWELVE-DAY-OLD FIXTURE AND IT DOES NOT HAVE TO BE.** `zcuck.xyz` shows `source: fixture` at block **3,456,227** (`apps/web/src/lib/api/fixtures/pools.ts:7`); mainnet was at **3,470,402** when this line was written, measured against the live endpoint on 3 Sep 2026. That is **14,175 blocks**, about **12.3 days** at 75 s. **And the site reports that gap as `snapshot age: 0 blocks`** - which is deliverable 4, and the reason it is in this handoff rather than a later one. This handoff ends that, **with no database, no node, no VPS and no sync** — because the code already supports it and only the wiring is missing.

**THIS IS RUNG 1 OF THREE.** HANDOFF-15 adds live transactions; HANDOFF-16 adds crossings. Each rung ships alone and each makes the site more alive. Do not reach up the ladder.

---

## §1 SCOPE

Make the publisher run **against RPC alone, with no `DATABASE_URL`**, publishing a snapshot whose chain figures are live and whose analysis panels are stated absences.

**The input layer was designed for this and nobody wired it.** `apps/publisher/src/sources/chain-inputs.ts` declares `ChainInputsDeps` with four database queries typed `| null`, each carrying the same comment — *"or null when there is no database"* — while `readChainInfo` (`getblockchaininfo`, already parsed) is the one required dependency. `readSnapshotInputs` therefore already returns a full `SnapshotInputs` with null panels when the queries are absent. `apps/publisher/src/index.ts:97` nonetheless opens `postgres(cfg.DATABASE_URL)` unconditionally and passes `makeChainQueries(sql)`.

**So this is a config path, not an architecture change.** L2's measurements, offered as hypotheses to check rather than as a brief:

| what | measured |
|---|---|
| publisher RPC cost | **two calls per tip** — `getBlockchainInfoFull` + `getBlockHeader` ≈ 1.6/min at 75 s blocks |
| keyless endpoint ceiling | 5 requests/minute, hard, shared across Tatum's three hostnames — **this rung fits inside it** |
| where the five lanes come from | `valuePools` + `chainSupply` on `getblockchaininfo` (`sources/chain-inputs.ts:57`) — RPC, not the database |
| what the four panels need | the database. `SnapshotV1` makes every panel nullable *"precisely so"* a null renders as an absence (`chain-inputs.ts:42`) |
| what the plane does with a null `migrationHist` | no marks, "not measured" — `lib/plane.ts:283,287`. Already correct |
| **the snapshot field is `pools`** | not `lanes`. `Object.keys` on a built snapshot: `schema, height, hash, time, publishedAt, pools, residual, drain, migrationHist, neffSeries, lastReports, labelsVersion` |

**L2 EXECUTED THIS RUNG BEFORE WRITING THE HANDOFF.** `readSnapshotInputs` and `buildSnapshot` were driven against the live public endpoint with all four queries `null`, and produced a real `SnapshotV1`:

```
=== LIVE MAINNET SNAPSHOT, BUILT WITH NO DATABASE ===
height 3469371   hash 00000000007abe588988...
  --- the five lanes, from the node's own valuePools ---
  transparent       11988412.32 ZEC   share 71.15%
  sprout               22591.46 ZEC   share 0.13%
  sapling             524431.21 ZEC   share 3.11%
  orchard             465369.40 ZEC   share 2.76%
  ironwood           3849163.52 ZEC   share 22.84%
  --- analysis panels (database-derived) ---
  migrationHist  null - NOT MEASURED
  neffSeries     null - NOT MEASURED
  residual       PRESENT
  drain          null - NOT MEASURED
```

**THREE PANELS ARE NULL, NOT FOUR — `residual` COMES BACK MEASURED.** It derives from the node's own `chainSupply` against the pool sum, so it needs no database at all. This rung therefore ships the unprovable-supply figure live as well, which L2 did not expect and which the handoff should say plainly rather than discover.

The proof harness is delivered as `proof-rung1.test.ts` beside this prompt. It is a THROWAWAY: it calls a live endpoint and does not belong in the suite. Use it to re-confirm, then write the real tests §5 asks for.

**AND ONE LESSON FROM WRITING IT, WHICH §5's A6 IS ABOUT.** L2's first harness did not check the HTTP status. A 429 returned no `result`, the helper returned `undefined`, and the failure surfaced three frames later as `Cannot read properties of undefined (reading 'time')`. **A rate-limited call that looks like a missing field is the shape rung 2 is entirely about.** Check the status.

**Out of scope:** the mempool (rung 2); crossings (rung 3); Mode A; the address index; self-hosting `zebrad`.

## §2 READING

`CLAUDE.md` · **`docs/2.0/SNAPSHOT.md` in full before anything touches Redis — the managed store is shared with an unrelated production project** · `apps/publisher/src/{index,config}.ts` · `apps/publisher/src/sources/chain-inputs.ts` · `apps/web/src/lib/snapshot/{store,source}.ts` · `lib/plane.ts`.

## §3 CONTRACT

- **A null panel is a stated absence and never a zero.** `chain-inputs.ts:42` is the rule and this rung makes it load-bearing on a live document for the first time. A panel that renders `0` where it means "not measured" is a fabricated measurement.
- **An absent database is a CONFIGURATION, not a failure.** No warning storm, no degraded-mode banner that reads like breakage. The snapshot says which panels are absent and the site already knows how to render that.
- **Do not point anything but production at the managed store.** `SNAPSHOT.md` rule 5.
- **The RPC endpoint is untrusted infrastructure.** Keep `checkZebraVersionFloor`'s posture: three outcomes, and `unparsed` is not a pass.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **`DATABASE_URL` becomes optional in `apps/publisher`.** Absent, the composition root passes `null` for all four queries and never opens a connection. Present, nothing changes. The config's own docblock states which panels each mode publishes.
2. **A no-database publish path, proven end to end** against a real public RPC endpoint: real tip, real five-lane balances, four panels null, written to a **local** Redis and read back.
3. **`docs/2.0/RUNTIME.md` gains "RPC-only mode"** — the env set, the two calls per tip, what the reader sees and does not see, and the one-line reason it is honest rather than degraded.
4. **The `snapshot age` defect.** The site renders `snapshot age: 0 blocks · source: fixture`. The age computes against "whatever the page knows to be current", which with no tip frame is the document's own height, so a fixture ten days stale reports zero (`lib/snapshot/source.ts:87`). Each field is true; together they tell a reader the data is current. **When the source is `fixture` and no tip frame has arrived, the age is UNKNOWN and renders as unknown.** This is the "stale site that renders and reports no fault" shape, in the gap A13 does not cover.
5. **`docs/2.0/CUTOVER-1.0.md`** — the operator's steps from fixture to live for THIS rung only, ending at a site showing live balances.

## §5 ASSERTIONS — each needs both polarities

- **A1.** With `DATABASE_URL` unset, the publisher publishes a snapshot whose `tip` and five lanes are the node's own figures and whose four analysis panels are null. *Fail side by DATA: set `DATABASE_URL` to a live database with rows and watch the same panels come back non-null.*
- **A2.** No `postgres()` client is constructed when `DATABASE_URL` is unset. *Fail side: a spy on the constructor, asserted zero calls in RPC-only mode and one call otherwise.*
- **A3.** The site renders that snapshot with `source:` naming the resolved rung and every null panel as a NAMED absence — no zeros. *Fail side: hand it a snapshot with `migrationHist: {count: 0}` and show the plane renders a measured zero, which is a different thing and must read differently.*
- **A4.** `snapshot age` reads UNKNOWN for a fixture-sourced document with no tip frame, and a number once a tip frame arrives. *Both polarities in one test.*
- **A5.** Nothing in the suite or any new script reaches the managed store. *`SNAPSHOT.md` rule 5; grep in both directions.*
- **A6.** `pnpm -r test` green with a **real** exit code — captured directly, never through a pipe (**F-53-1**: L2's own harness read `tail`'s status for four PRs).

## §6 DISPATCH HINTS

This is small and mostly deletion — the composition root stops doing something it should never have done unconditionally. One worker on the publisher path, one on the web-side absence rendering, one on the `snapshot age` fix. The adversarial question throughout: *does this render an absence, or a zero?*

---

**L2's note.** L2 spent three exchanges saying a VPS gated this. It does not, and the file that proves it — `ChainInputsDeps`, four nullable queries with the comment written four times — was in the repository the whole time. The operator was right and pushed twice. Check §1's table the same way.

## Message 1a — the attached throwaway proof harness (`proofrung1.test.ts`, 3 Sep 2026, session start)

Attached to Message 1. It is a THROWAWAY by L2's own instruction — it calls a live public endpoint and
does not belong in the suite — and it is archived here rather than committed to
`apps/publisher/src/__tests__/` for that reason. Reproduced byte for byte.

```ts
import { describe, expect, it } from "vitest";
import { readSnapshotInputs } from "../sources/chain-inputs.js";
import { buildSnapshot } from "../snapshot-builder.js";
import { REAL_INSTRUMENTS } from "../instruments.js";
import { loadConfig } from "../config.js";

const URL_ = "https://zcash-mainnet-zebrad.gateway.tatum.io/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rpc = async (method: string, params: unknown[] = []) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "1.0", id: "proof", method, params }) });
    // THE HARNESS CHECKS STATUS. Not doing so is how a 429 became `undefined`
    // and surfaced three frames later as "cannot read properties of undefined".
    if (r.status === 429) { await sleep(14_000); continue; }
    if (!r.ok) throw new Error(`${method}: HTTP ${r.status}`);
    const j = (await r.json()) as { result?: unknown; error?: { message?: string } | null };
    if (j.error) throw new Error(`${method}: ${j.error.message}`);
    if (j.result === undefined) throw new Error(`${method}: no result`);
    return j.result;
  }
  throw new Error(`${method}: rate limited after retries`);
};
const zat = (v: unknown) => BigInt(Math.round(Number(v)));

describe("PROOF: rung 1 - live mainnet snapshot with NO database", () => {
  it("builds a real SnapshotV1 from RPC alone, four panels null", async () => {
    const info = (await rpc("getblockchaininfo")) as any;
    const header = (await rpc("getblockheader", [String(info.blocks)])) as any;

    const inputs = await readSnapshotInputs(
      {
        readChainInfo: async () => ({
          valuePools: info.valuePools.map((p: any) => ({ id: p.id, chainValueZat: zat(p.chainValueZat) })),
          chainSupply: { chainValueZat: zat(info.chainSupply.chainValueZat) },
        }),
        // EVERY DATABASE QUERY IS NULL. This is the whole claim.
        queryMigrations: null,
        queryOrchardSeries: null,
        queryDrainBaseline: null,
        queryIronwoodSpends: null,
        cfg: loadConfig({ ...process.env, DATABASE_URL: undefined } as never),
        labelsVersion: "proof",
        now: () => Date.now(),
      },
      { height: info.blocks, hash: info.bestblockhash, timeMs: header.time * 1000 },
    );

    const snap = buildSnapshot(inputs, REAL_INSTRUMENTS, (p, e) => console.warn("panel absent:", p, String(e).slice(0, 80)));

    const s = snap as any;
    const out: string[] = [];
    const W = (x: string) => { out.push(x); console.warn(x); };
    W("=== LIVE MAINNET SNAPSHOT, BUILT WITH NO DATABASE ===");
    W(`height ${s.height}   hash ${String(s.hash).slice(0,20)}...`);
    W(`top-level keys: ${Object.keys(s).join(", ")}`);
    const lanes = s.lanes ?? s.ledger ?? s.pools ?? null;
    if (Array.isArray(lanes)) {
      W("  --- the five lanes, from the node's own valuePools ---");
      for (const l of lanes) W(`  ${String(l.lane).padEnd(12)} ${(Number(l.balanceZat)/1e8).toFixed(2).padStart(16)} ZEC   share ${(l.share*100).toFixed(2)}%`);
    }
    W("  --- analysis panels (database-derived) ---");
    for (const k of ["migrationHist", "neffSeries", "residual", "drain"])
      W(`  ${k.padEnd(14)} ${s[k] === null || s[k] === undefined ? "null - NOT MEASURED" : "PRESENT"}`);

    (await import("node:fs")).writeFileSync("/tmp/live-snapshot.txt", out.join("\n"));
    expect(s.height).toBeGreaterThan(3_460_000);
    expect(Array.isArray(lanes) ? lanes.length : 0).toBe(5);
    expect(s.migrationHist ?? null).toBeNull();
  }, 60_000);
});
```

**THE EXECUTING SESSION COULD NOT RUN IT, AND THE REASON IS THE WALL CLAUDE.md ALREADY RECORDS.**
Two different public Zcash RPC hosts were refused at CONNECT with 403 by the session's own egress
proxy — the same class of refusal that stands between a session and a Vercel preview, the VPS, a live
gateway and `upstash.com`. The transcript is in §7. The harness's `it()` title also says "four panels
null", which its own final `expect` does not assert and which L2's transcript above contradicts; that
is recorded in §7 as well.
