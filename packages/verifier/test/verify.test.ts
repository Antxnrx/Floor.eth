import { describe, expect, it } from "vitest";
import { bundleHash, type EvidenceBundle } from "@floor/core";
import { operatorMap } from "@floor/resolver/operators";
import type { Hex } from "viem";
import pre from "../../resolver/fixtures/rseth-24908284.json" with { type: "json" };
import { jsonRpcReader, TrafficMeter, verifyBundle, type ChainReader, type FetchFn } from "../src/index.js";

const ops = operatorMap("ethereum");
const clone = () => JSON.parse(JSON.stringify(pre)) as EvidenceBundle;
const HASH = bundleHash(pre as unknown as EvidenceBundle);

/** A reader that answers from the bundle's own recorded bytes (what an honest chain returns). */
function honestReader(b: EvidenceBundle, override?: (id: string, r: Hex) => Hex): ChainReader {
  const byKey = new Map(b.state.calls.map((c) => [`${c.sig}|${c.to}|${c.data}`.toLowerCase(), c]));
  const answer = (sig: string, to: string, data: string) => {
    const c = byKey.get(`${sig}|${to}|${data}`.toLowerCase());
    if (!c) return Promise.reject(new Error("unknown call"));
    if (!c.ok) return Promise.reject(new Error("execution reverted"));
    return Promise.resolve(override ? override(c.id, c.result) : c.result);
  };
  const sigOf = (to: string, data: string) => b.state.calls.find((c) => c.to.toLowerCase() === to.toLowerCase() && c.data === data)!.sig;
  return {
    call: (to, data) => answer(sigOf(to, data), to, data),
    getCode: (a) => answer("eth_getCode", a, "0x"),
    getStorageAt: (a, slot) => answer(`eth_getStorageAt:${slot}`, a, "0x"),
  };
}

describe("verifyBundle (offline, real rsETH pre-hack bundle)", () => {
  it("VERIFIED when chain bytes, state and grade all line up", async () => {
    const b = clone();
    const r = await verifyBundle(b, HASH, honestReader(b), ops);
    expect(r.status).toBe("VERIFIED");
    expect(r.raw.matched).toBe(r.raw.total);
    expect(r.state.ok).toBe(true);
    expect(r.grade.recomputed).toBe("BREACHED");
  });

  it("MISMATCH when the chain returns different bytes for one read", async () => {
    const b = clone();
    const target = b.state.calls.find((c) => c.sig === "getUlnConfig" && c.ok)!.id;
    const r = await verifyBundle(b, HASH, honestReader(b, (id, res) => (id === target ? ((res.slice(0, -1) + (res.endsWith("0") ? "1" : "0")) as Hex) : res)), ops);
    expect(r.status).toBe("MISMATCH");
    expect(r.raw.mismatched).toEqual([target]);
  });

  it("MISMATCH when the bundle hash does not match the one on Arkiv / in the CRE report", async () => {
    const b = clone();
    const r = await verifyBundle(b, `0x${"00".repeat(32)}`, honestReader(b), ops);
    expect(r.status).toBe("MISMATCH");
    expect(r.hash.ok).toBe(false);
  });

  it("MISMATCH when decoded state is edited to look safer than the raw bytes (3 DVNs claimed)", async () => {
    const b = clone();
    const route = b.state.routes.find((x) => x.eid === 30320 && x.direction === "receive")!;
    route.effective.requiredDVNCount = 3; // lie in the decoded state; raw bytes still say 1
    const r = await verifyBundle(b, bundleHash(b), honestReader(b), ops);
    expect(r.status).toBe("MISMATCH");
    expect(r.state.problems.join()).toMatch(/receive:30320 effective config differs/);
  });

  it("MISMATCH when the verdict grade is edited", async () => {
    const b = clone();
    b.verdict.grade = "OK";
    const r = await verifyBundle(b, bundleHash(b), honestReader(b), ops);
    expect(r.status).toBe("MISMATCH");
    expect(r.grade.ok).toBe(false);
    expect(r.grade.recomputed).toBe("BREACHED");
  });

  it("UNVERIFIED_RPC (never VERIFIED) when reads fail", async () => {
    const b = clone();
    const failing: ChainReader = { call: () => Promise.reject(new Error("timeout")), getCode: () => Promise.reject(new Error("timeout")), getStorageAt: () => Promise.reject(new Error("timeout")) };
    const r = await verifyBundle(b, HASH, failing, ops);
    expect(r.status).toBe("UNVERIFIED_RPC");
  });
});

describe("retry behaviour", () => {
  it("a read that fails once then succeeds ends VERIFIED; a wrong answer on retry stays MISMATCH", async () => {
    const b = clone();
    const honest = honestReader(b);
    const seen = new Set<string>();
    const flaky: ChainReader = {
      call: (to, data, block) => { const k = `${to}${data}`; if (!seen.has(k)) { seen.add(k); return Promise.reject(new Error("429")); } return honest.call(to, data, block); },
      getCode: honest.getCode,
      getStorageAt: honest.getStorageAt,
    };
    expect((await verifyBundle(b, HASH, flaky, ops)).status).toBe("VERIFIED");

    const target = b.state.calls.find((c) => c.sig === "getUlnConfig" && c.ok)!;
    const seen2 = new Set<string>();
    const flakyThenWrong: ChainReader = {
      call: (to, data, block) => {
        const k = `${to}${data}`;
        if (data === target.data && to === target.to) { if (!seen2.has(k)) { seen2.add(k); return Promise.reject(new Error("429")); } return Promise.resolve("0xdead" as Hex); }
        return honest.call(to, data, block);
      },
      getCode: honest.getCode,
      getStorageAt: honest.getStorageAt,
    };
    const r = await verifyBundle(b, HASH, flakyThenWrong, ops);
    expect(r.status).toBe("MISMATCH");
    expect(r.raw.mismatched).toContain(target.id);
  });
});

describe("TrafficMeter", () => {
  it("counts JSON-RPC calls per route, batches count per call", async () => {
    const m = new TrafficMeter();
    const ok: FetchFn = async () => ({ ok: true, status: 200, json: async () => [] });
    const anon = m.wrap("anon-rpc", ok);
    const direct = m.wrap("direct", ok);
    await anon("u", { method: "POST", headers: {}, body: JSON.stringify([{}, {}, {}]) });
    await direct("u", { method: "POST", headers: {}, body: JSON.stringify({}) });
    expect(m.snapshot.total).toBe(4);
    expect(m.snapshot.share("anon-rpc")).toBe(0.75);
  });
});

/** The real thing: replay all 624 recorded reads against Ethereum mainnet at block 24,908,284. */
describe.runIf(process.env.FLOOR_LIVE)("live verifyBundle against mainnet", () => {
  it("VERIFIED, with every read counted by the traffic meter", async () => {
    const meter = new TrafficMeter();
    const fetchFn = meter.wrap("direct-rpc", globalThis.fetch as unknown as FetchFn);
    // blastapi allows JSON-RPC batches; drpc free tier caps batches at 3 (observed 2026-11-06)
    const reader = jsonRpcReader(fetchFn, process.env.ETH_RPC_URL ?? "https://eth-mainnet.public.blastapi.io", { batch: 50, concurrency: 2 });
    const b = clone();
    const r = await verifyBundle(b, HASH, reader, ops);
    expect(r.raw.failed, `failed: ${r.raw.failed.slice(0, 5)}`).toEqual([]);
    expect(r.status).toBe("VERIFIED");
    expect(meter.snapshot.total).toBeGreaterThanOrEqual(b.state.calls.length); // retries add requests, never fewer
  }, 300_000);
});
