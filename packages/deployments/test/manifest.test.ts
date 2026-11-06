import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { DEPLOYMENT, contract, WRITER } from "../src/index.js";

const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

describe("deployment manifest", () => {
  it("every contract has a known chain and a well-formed address", () => {
    for (const [name, c] of Object.entries(DEPLOYMENT.contracts)) {
      expect(Object.keys(DEPLOYMENT.chains), name).toContain(c.chain);
      expect(isAddr(c.address), name).toBe(true);
    }
    expect(isAddr(WRITER)).toBe(true);
  });
  it("CRE configs point at the manifest's registry (run scripts/sync-config.mjs if this fails)", () => {
    const dir = new URL("../../../cre/floor-rating/", import.meta.url);
    for (const f of readdirSync(dir).filter((x) => /^config\..*\.json$/.test(x))) {
      const c = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
      if (c.isTestnet) expect(c.registryAddress.toLowerCase(), f).toBe(contract("registry").address.toLowerCase());
    }
  });
});
