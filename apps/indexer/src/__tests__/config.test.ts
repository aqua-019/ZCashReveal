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

import { loadConfig } from "../config.js";

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

  it("an EMPTY value is absent, not zero: `${INDEXER_START_HEIGHT:-}` and a blank .env line both arrive as \"\"", () => {
    expect(load({ INDEXER_START_HEIGHT: "" }).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_MAINNET);
    expect(load({ INDEXER_NETWORK: "testnet", INDEXER_START_HEIGHT: "" }).INDEXER_START_HEIGHT).toBe(NU6_3_ACTIVATION_TESTNET);
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
