/**
 * `loadConfig`'s start height, which is the one field in this schema whose
 * default cannot be written as a zod default: it depends on a sibling field.
 *
 * WHY THIS FILE EXISTS AT ALL. A gate round found a mainnet height hardcoded
 * in `docker-compose.yml` as the fallback for a variable whose documented
 * default is per-network, and there was no test over the resolution to
 * contradict it. The two polarities below are the resolution itself and the
 * shapes that must NOT resolve - an empty string is absent, a malformed value
 * is refused loudly rather than coerced into a height.
 */
import { describe, expect, it } from "vitest";
import { NU6_3_ACTIVATION_MAINNET, NU6_3_ACTIVATION_TESTNET } from "@zcashreveal/instruments";

import { databaseUrl, loadConfig, rpcCeilingPerMinute } from "../config.js";

/** The minimum a parse needs; every other field has a default. */
const BASE_ENV = { DATABASE_URL: "postgres://u:p@localhost:5432/db", REDIS_URL: "redis://localhost:6379" };

const load = (over: Record<string, string>) => loadConfig({ ...BASE_ENV, ...over } as NodeJS.ProcessEnv);

describe("INDEXER_START_HEIGHT resolves to NU6.3 activation on the CONFIGURED network", () => {
  it("PASS STATE: unset on mainnet is mainnet's activation, unset on testnet is testnet's", () => {
    expect(load({}).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_MAINNET);
    expect(load({ INDEXER_NETWORK: "mainnet" }).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_MAINNET);
    expect(load({ INDEXER_NETWORK: "testnet" }).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_TESTNET);
    // The two are not the same number, so the assertion above can fail.
    expect(NU6_3_ACTIVATION_TESTNET).not.toBe(NU6_3_ACTIVATION_MAINNET);
  });

  it("FAIL STATE, BY DATA: the mainnet activation SET EXPLICITLY on testnet is kept, because an override is an override", () => {
    // The value the compose file used to inject unconditionally. It is a legal
    // override and this build must not second-guess it - what it must not do
    // is supply it when nobody asked, which the case above pins.
    const cfg = load({ INDEXER_NETWORK: "testnet", INDEXER_START_HEIGHT: String(NU6_3_ACTIVATION_MAINNET) });
    expect(cfg.INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_MAINNET);
    expect(cfg.INDEXER_START_HEIGHT).not.toBe(load({ INDEXER_NETWORK: "testnet" }).INDEXER_START_HEIGHT);
  });

  it("a BLANK value is absent, not zero, whichever way it is spelled", () => {
    // `${INDEXER_START_HEIGHT:-}` and a blank .env line both arrive as "".
    expect(load({ INDEXER_START_HEIGHT: "" }).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_MAINNET);
    expect(load({ INDEXER_NETWORK: "testnet", INDEXER_START_HEIGHT: "" }).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_TESTNET);
    // AND A SINGLE SPACE, which is NOT empty to compose's `:-` and therefore
    // reaches the schema verbatim. `Number(" ")` is 0, which failed
    // `.positive()` and threw at module scope before the logger existed - the
    // crash-loop the empty case was fixed for, by a different door.
    for (const blank of [" ", "  ", "\t", "\n"]) {
      expect(load({ INDEXER_START_HEIGHT: blank }).INDEXER_START_HEIGHT, JSON.stringify(blank)).toBe(NU6_3_ACTIVATION_MAINNET);
    }
  });

  it("FAIL STATE, BY DATA: a malformed height is refused rather than coerced", () => {
    for (const bad of ["abc", "0", "-1", "3428143.5"]) {
      expect(() => load({ INDEXER_START_HEIGHT: bad }), bad).toThrow();
    }
  });

  it("an unknown network is refused, so a typo cannot select a default nobody meant", () => {
    expect(() => load({ INDEXER_NETWORK: "regtest" })).toThrow();
  });
});

/**
 * ROUND 4: EVERY BLANK SPELLING, AGAINST EVERY COERCED VARIABLE.
 *
 * `62c4e77` FIXED ONE VARIABLE AND ITS MESSAGE SAID IT HAD SWEPT THE SHAPE.
 * It had not. `docker compose` writes `KEY: ""` for a `${VAR:-}` whose variable
 * is unset, and a value exported as a single space is not empty to that
 * expansion at all - so " " reaches the schema verbatim. That commit gave
 * `INDEXER_START_HEIGHT` a trimming preprocess and left four other coerced
 * numbers and `databaseUrl` without one. A gate reviewer drove them all.
 *
 * THREE OF THE FOUR THREW AT MODULE SCOPE, WHICH IS A CRASH LOOP UNDER
 * `restart: unless-stopped` WITH NO LOG LINE, because `loadConfig` runs before
 * pino exists. THE FOURTH DID NOT THROW AND THAT ONE IS WORSE:
 * `ZEBRAD_RPC_RETRIES` is `.nonnegative()`, so a blank coerced to zero and
 * turned every retry off silently.
 *
 * AND `databaseUrl` READ `url.length > 0`, so a single space selected FULL mode
 * and `createDb(" ")` opened a Postgres client on a string that is not a
 * connection string.
 *
 * The table is DATA so a variable added to the schema can be added here in one
 * line, and every spelling is driven against every variable rather than one
 * pair being spot-checked.
 */
describe("blank is absent, in every spelling, for every coerced variable", () => {
  const BLANKS: ReadonlyArray<readonly [string, string]> = [
    ["empty", ""],
    ["one space", " "],
    ["tab", "\t"],
    ["newline", "\n"],
    ["CRLF", "\r\n"],
    ["spaces", "   "],
  ];

  /** Every coerced variable, with the value `loadConfig` must resolve a blank to. */
  const COERCED: ReadonlyArray<readonly [string, unknown]> = [
    ["INDEXER_POLL_INTERVAL_MS", 2000],
    ["ZEBRAD_RPC_TIMEOUT_MS", 10_000],
    ["ZEBRAD_RPC_RETRIES", 2],
    ["RECENT_ANCHOR_THRESHOLD", 100],
    ["INDEXER_RPC_MAX_RPM", undefined],
  ];

  it("no blank spelling of any coerced variable throws, and each resolves to its default", () => {
    for (const [varName, expected] of COERCED) {
      for (const [spelling, value] of BLANKS) {
        const cfg = load({ [varName]: value }) as unknown as Record<string, unknown>;
        expect(cfg[varName], `${varName} = ${spelling}`).toBe(expected);
      }
    }
  });

  it("ZEBRAD_RPC_RETRIES in particular is 2 and NOT 0, because .nonnegative() accepts zero", () => {
    // The one that did not throw. A blank turned every retry off and nothing
    // said so - a client that gives up on the first transport blip.
    for (const [spelling, value] of BLANKS) {
      expect(load({ ZEBRAD_RPC_RETRIES: value }).ZEBRAD_RPC_RETRIES, spelling).toBe(2);
    }
    // And a real 0 is still honoured, so the guard did not swallow an intent.
    expect(load({ ZEBRAD_RPC_RETRIES: "0" }).ZEBRAD_RPC_RETRIES).toBe(0);
  });

  it("databaseUrl treats every blank spelling as ABSENT, which selects mempool-only", () => {
    for (const [spelling, value] of BLANKS) {
      expect(databaseUrl(load({ DATABASE_URL: value })), spelling).toBeNull();
    }
    // And a real URL still comes back, untrimmed in its interior.
    expect(databaseUrl(load({ DATABASE_URL: "postgres://u:p@localhost:5432/db" }))).toBe(
      "postgres://u:p@localhost:5432/db",
    );
  });

  it("rpcCeilingPerMinute treats every blank spelling as UNMETERED", () => {
    for (const [spelling, value] of BLANKS) {
      expect(rpcCeilingPerMinute(load({ INDEXER_RPC_MAX_RPM: value })), spelling).toBeNull();
    }
    expect(rpcCeilingPerMinute(load({ INDEXER_RPC_MAX_RPM: "5" }))).toBe(5);
  });

  it("INDEXER_CHAIN_STORE treats every blank spelling as `auto`, and rejects an unknown value", () => {
    for (const [spelling, value] of BLANKS) {
      expect(load({ INDEXER_CHAIN_STORE: value }).INDEXER_CHAIN_STORE, spelling).toBe("auto");
    }
    expect(load({ INDEXER_CHAIN_STORE: "memory" }).INDEXER_CHAIN_STORE).toBe("memory");
    // An unknown value must NOT silently fall back to a mode the operator did
    // not choose - it throws, loudly, at startup.
    expect(() => load({ INDEXER_CHAIN_STORE: "postgres" })).toThrow();
  });

  it("a MALFORMED value still throws, so the guard did not widen into an accept-anything", () => {
    // The fail side of the guard itself. Blank is absent; "abc" is a mistake.
    for (const bad of ["abc", "-1", "0", "1.5"]) {
      expect(() => load({ INDEXER_POLL_INTERVAL_MS: bad }), bad).toThrow();
    }
  });
});
