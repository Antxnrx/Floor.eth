import { describe, expect, it } from "vitest";
import { MAX_ATTRIBUTES } from "@arkiv-network/sdk";
import { adapterValues, eventValues } from "../src/dataset.js";
import { loadProbe, loadTimeline } from "../src/dataset-load.js";

const unwrap = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v);
const rows = loadProbe().map(({ row, chain }) => ({ row, v: adapterValues(row, chain) }));
const find = (adapter: string) => rows.find((r) => r.row.oapp.toLowerCase().startsWith(adapter))!.v;

describe("floor.adapter mapping (offline, from docs/evidence/inbound)", () => {
  it("covers all 64 probed adapters on 8 chains", () => {
    expect(rows.length).toBe(64);
    expect(new Set(rows.map((r) => r.v.chain)).size).toBe(8);
  });
  it("every value fits Arkiv: strings <= 128 bytes, attributes within MAX_ATTRIBUTES", () => {
    for (const { v } of rows) {
      expect(Object.keys(v).length).toBeLessThanOrEqual(MAX_ATTRIBUTES - 1);
      for (const x of Object.values(v)) if (typeof x === "string") expect(new TextEncoder().encode(x).length).toBeLessThanOrEqual(128);
    }
  });
  it("PYUSD 0xa2c3 mints and is capped at 760,000,000 per message", () => {
    const v = find("0xa2c3");
    expect(v.outcome).toBe("INBOUND_LIMIT");
    expect(unwrap(v.mints)).toBe(true);
    expect(String(unwrap(v.capWhole))).toBe("760000000");
  });
  it("Polygon USDT mints with no cap; Ethereum USDT0 0x6c96 releases its escrow", () => {
    const p = find("0x6ba1");
    expect([p.outcome, unwrap(p.mints), p.escrow]).toEqual(["NO_INBOUND_LIMIT", true, "mints on credit"]);
    const e = find("0x6c96");
    expect(e.outcome).toBe("NO_INBOUND_LIMIT");
    expect(Number(unwrap(e.escrowWhole))).toBeGreaterThan(3_000_000_000);
  });
  it("LayerZero v1 adapters are labelled LZ_V1, not NO_PEERS", () => {
    expect(find("0xe15bcb9e").outcome).toBe("LZ_V1"); // BAL (v1)
    expect(find("0x39d0ce7d").outcome).toBe("NO_PEERS"); // ETHx (v2, no peers)
  });
  it("tallies match docs/09", () => {
    const t: Record<string, number> = {};
    for (const { v } of rows) t[v.outcome] = (t[v.outcome] ?? 0) + 1;
    expect(t.NO_INBOUND_LIMIT).toBe(31);
    expect(t.INBOUND_LIMIT).toBe(4);
  });
});

describe("floor.event mapping (flight recorder)", () => {
  const tl = loadTimeline();
  const ev = tl.events.map((e) => eventValues(tl.token as `0x${string}`, e));
  it("is ordered and fits Arkiv", () => {
    const blocks = tl.events.map((e) => e.block);
    expect([...blocks].sort((a, b) => a - b)).toEqual(blocks);
    for (const v of ev) for (const x of Object.values(v)) if (typeof x === "string") expect(new TextEncoder().encode(x).length).toBeLessThanOrEqual(128);
  });
  it("single-verifier setup to drain is ~12.5 months, from chain timestamps", () => {
    const set = tl.events.find((e) => e.kind === "single-verifier")!;
    const drain = tl.events.find((e) => e.kind === "drain")!;
    const days = (drain.time - set.time) / 86400;
    expect(days).toBeGreaterThan(375);
    expect(days).toBeLessThan(385);
  });
});
