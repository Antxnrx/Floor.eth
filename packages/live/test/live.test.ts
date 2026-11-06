import { describe, expect, it } from "vitest";
import { MARKETS, readAllMarkets } from "../src/index.js";

describe("markets file", () => {
  it("lists every production Aave V3 market with addresses and at least one RPC", () => {
    expect(MARKETS.length).toBe(24);
    for (const m of MARKETS) {
      for (const k of ["pool", "dataProvider", "oracle"] as const) expect(m[k], `${m.id}.${k}`).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(m.rpcs.length, m.id).toBeGreaterThan(0);
    }
  });
});

describe.runIf(process.env.FLOOR_LIVE)("live: every Aave V3 market", () => {
  it("reads reserves, collateral config, supply and price from all 24 markets", async () => {
    const all = await readAllMarkets();
    for (const m of all) {
      const col = m.reserves.filter((r) => r.collateral);
      const usd = col.reduce((s, r) => s + (r.suppliedUsd ?? 0), 0);
      const bridged = col.filter((r) => r.bridge.kind !== "none-found").length;
      const em = col.filter((r) => r.collateralViaEModeOnly).length;
      console.log(
        `${m.ok ? "ok  " : "FAIL"} ${m.name.padEnd(17)} block ${String(m.block ?? "-").padEnd(10)} reserves ${String(m.reserves.length).padEnd(3)} collateral ${String(col.length).padEnd(3)} bridged ${String(bridged).padEnd(3)} emodeOnly ${String(em).padEnd(3)} supplied $${(usd / 1e9).toFixed(2)}B ${m.error ?? ""}`,
      );
    }
    const ok = all.filter((m) => m.ok);
    expect(ok.length).toBeGreaterThanOrEqual(22);
    for (const m of ok) {
      expect(m.reserves.length, m.id).toBeGreaterThan(0);
      for (const r of m.reserves) if (r.priceUsd !== null && r.active) expect(r.priceUsd, `${m.id} ${r.symbol}`).toBeGreaterThan(0);
    }
    const eth = all.find((m) => m.id === "Ethereum")!;
    expect(eth.reserves.find((r) => r.symbol === "WETH")?.collateral).toBe(true);
    // rsETH on Arbitrum is a LayerZero OFT and sits as collateral (threshold > 0): the case Floor exists for
    const arb = all.find((m) => m.id === "Arbitrum")!;
    const rs = arb.reserves.find((r) => r.symbol === "rsETH");
    expect(rs?.bridge.kind).toBe("layerzero-oft");
    expect(rs?.collateral).toBe(true);
  }, 180_000);
});
