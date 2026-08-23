/**
 * Assertion A5, and the rule that outranks every label: precedence is always
 * displayable, and no label may assert an identity the chain cannot establish.
 */
import { describe, expect, it } from "vitest";

import { getLabels } from "../src/loaders.js";
import { LABELLER_PRECEDENCE } from "../src/schema.js";

const ZIP271_MULTISIG = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";
const PRESUMED_HOT_WALLET = "t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ";

describe("A5 -- the two labels the handoff pins", () => {
  it("labels the ZIP 271 multisig by consensus and cites the ZIP", () => {
    const label = getLabels().find((l) => l.address === ZIP271_MULTISIG);
    expect(label).toBeDefined();
    expect(label?.labeller).toBe("consensus");
    expect(label?.method).toContain("ZIP 271");
    expect(label?.label).toContain("ZIP 271");
  });

  it("labels the presumed exchange hot wallet by analyst, below high confidence", () => {
    const label = getLabels().find((l) => l.address === PRESUMED_HOT_WALLET);
    expect(label).toBeDefined();
    expect(label?.labeller).toBe("analyst");
    expect(label?.confidence).not.toBe("high");
  });
});

describe("the label set", () => {
  it("carries at least seven addresses", () => {
    expect(getLabels().length).toBeGreaterThanOrEqual(7);
  });

  it("gives every label a method, so precedence is always renderable", () => {
    for (const label of getLabels()) {
      expect(LABELLER_PRECEDENCE).toContain(label.labeller);
      expect(label.method.length).toBeGreaterThan(20);
      expect(label.sources.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("reserves consensus for addresses written into the protocol", () => {
    for (const label of getLabels()) {
      if (label.labeller === "consensus") expect(label.method).toMatch(/ZIP \d+/);
    }
  });

  it("never claims an owner for an address no labeller attributes", () => {
    const unattributed = getLabels().find((l) => l.address === "t1gGCYpyURMo2FcYDSqeR8pgp2Kx9rnT72V");
    expect(unattributed?.labeller).toBe("behaviour");
    expect(unattributed?.notes ?? "").toMatch(/do not name an owner/i);
  });

  it("keeps the testnet multisig on the testnet", () => {
    const testnet = getLabels().filter((l) => l.network === "testnet");
    expect(testnet).toHaveLength(1);
    expect(testnet[0]?.address).toBe("t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8");
  });
});
