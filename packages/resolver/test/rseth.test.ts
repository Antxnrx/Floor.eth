import { describe, expect, it } from "vitest";
import { bundleHash, evaluate, type EvidenceBundle } from "@floor/core";
import pre from "../fixtures/rseth-24908284.json" with { type: "json" };
import { operatorMap } from "../src/operators.js";
import { makeRpcs } from "../src/rpc.js";
import { scanOApp } from "../src/lz.js";

const RSETH = "0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3";
const SAFE = "0xCbcdd778AA25476F203814214dD3E9b9c46829A1";

/** The correctness fixture from AGENTS.md / docs/03, checked against the stored pre-hack bundle. */
function assertKelpPreHack(state: EvidenceBundle["state"]) {
  const v = evaluate(state, operatorMap("ethereum"));
  const recv = v.routes.filter((r) => r.direction === "receive");
  expect(v.grade).toBe("BREACHED");
  expect(recv).toHaveLength(26);
  expect(recv.filter((r) => r.effectiveIndependent === 1)).toHaveLength(24);
  expect(recv.filter((r) => r.effectiveIndependent === 2).map((r) => r.eid).sort()).toEqual([30217, 30325]);
  const uni = state.routes.find((r) => r.eid === 30320 && r.direction === "receive")!;
  expect(uni.libraryIsDefault).toBe(true);
  expect(uni.effective.requiredDVNs).toEqual(["0x589dEDbD617e0CBcB916A9223F4d1300c294236b"]);
  for (const c of state.controllers) {
    expect(c.address).toBe(SAFE);
    expect(c.kind).toBe("safe");
    expect(c.safe?.threshold).toBe(3);
    expect(c.safe?.owners).toBe(6);
    expect(c.safe?.modules).toBe(0);
  }
  return v;
}

describe("rsETH pre-hack fixture (offline)", () => {
  it("reproduces the verified onchain facts", () => {
    assertKelpPreHack((pre as unknown as EvidenceBundle).state);
  });
  it("bundle hash is stable", () => {
    const b = pre as unknown as EvidenceBundle;
    expect(bundleHash(b)).toBe(bundleHash(JSON.parse(JSON.stringify(b))));
  });
  it("every route cites evidence calls that exist", () => {
    const s = (pre as unknown as EvidenceBundle).state;
    const ids = new Set(s.calls.map((c) => c.id));
    for (const r of s.routes) for (const e of r.evidence) expect(ids.has(e)).toBe(true);
  });
});

describe.runIf(process.env.FLOOR_LIVE)("rsETH live re-scan at block 24,908,284", () => {
  it("matches the fixture from three RPCs", async () => {
    const rpcs = makeRpcs((process.env.ETH_RPC_URLS ?? "https://eth.drpc.org,https://eth-mainnet.public.blastapi.io,https://gateway.tenderly.co/public/mainnet").split(","));
    const state = await scanOApp({ rpcs, oapp: RSETH, symbol: "rsETH", block: 24908284n });
    expect(state.scan.rpcAgreement).toBe(true);
    assertKelpPreHack(state);
  }, 180_000);
});
