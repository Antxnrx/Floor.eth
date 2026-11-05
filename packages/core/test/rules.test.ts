import { describe, expect, it } from "vitest";
import { canonicalize, bundleHash, evaluate, independence, type AssetState, type OperatorMap, type RouteState, type UlnConfig } from "../src/index.js";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const LZ = A(1), LZ2 = A(2), NETH = A(3), TWIN = A(4), GOOG = A(5), DEAD = A(6), UNK1 = A(7), UNK2 = A(8);
const map: OperatorMap = {
  [LZ]: { id: "layerzero-labs", name: "LayerZero Labs" },
  [LZ2]: { id: "layerzero-labs", name: "LayerZero Labs" },
  [NETH]: { id: "nethermind", name: "Nethermind" },
  [TWIN]: { id: "nethermind", name: "Twinstake" },
  [GOOG]: { id: "google-cloud", name: "Google" },
  [DEAD]: { id: "lz-dead-dvn", name: "LZDeadDVN", dead: true },
};
const cfg = (req: `0x${string}`[], opt: `0x${string}`[] = [], thr = 0, reqCount = req.length): UlnConfig => ({
  confirmations: "15", requiredDVNCount: reqCount, optionalDVNCount: opt.length, optionalThreshold: thr, requiredDVNs: req, optionalDVNs: opt,
});

describe("independence", () => {
  it("1 required DVN = 1", () => expect(independence(cfg([LZ]), map).count).toBe(1));
  it("same-operator DVNs collapse", () => expect(independence(cfg([LZ, LZ2]), map).count).toBe(1));
  it("Twinstake + Nethermind are one operator id", () => expect(independence(cfg([NETH, TWIN, LZ]), map).count).toBe(2));
  it("fake-3: NIL required + 3 optional with threshold 1 = 1", () => {
    const r = independence(cfg([], [LZ, NETH, GOOG], 1, 255), map);
    expect(r.count).toBe(1);
    expect(r.blocked).toBe(false);
  });
  it("optional DVN from a required operator is free for the attacker", () => {
    // required LZ; optional {LZ2, NETH} threshold 1 -> LZ2 is free -> still 1 operator
    expect(independence(cfg([LZ], [LZ2, NETH], 1), map).count).toBe(1);
  });
  it("threshold covered greedily by largest groups", () => {
    // optional {NETH, TWIN, GOOG} threshold 2 -> nethermind group (2) covers it -> 1 extra operator
    expect(independence(cfg([LZ], [NETH, TWIN, GOOG], 2), map).count).toBe(2);
  });
  it("3 distinct required = 3", () => expect(independence(cfg([LZ, NETH, GOOG]), map).count).toBe(3));
  it("dead required DVN blocks the route", () => expect(independence(cfg([DEAD]), map).blocked).toBe(true));
  it("unreachable threshold blocks the route", () => expect(independence(cfg([], [LZ], 2, 255), map).blocked).toBe(true));
  it("unmapped DVNs are reported", () => expect(independence(cfg([UNK1]), map).unmapped).toEqual([UNK1]));
});

const route = (eid: number, eff: UlnConfig, isDefault = false, direction: "receive" | "send" = "receive"): RouteState => ({
  eid, direction, peer: `0x${"0".repeat(64)}`, library: A(99), libraryIsDefault: isDefault, timeout: null, effective: eff, app: eff, evidence: [`c${eid}`],
});
const state = (routes: RouteState[], controllers: AssetState["controllers"] = []): AssetState => ({
  asset: { symbol: "T", chainId: 1, oapp: A(42), token: null },
  scan: { chainId: 1, block: 100, blockHash: `0x${"0".repeat(64)}`, timestamp: 0, rpcProviders: ["a"], rpcAgreement: true },
  routes, controllers, forkTests: [], calls: [],
});
const safe = (threshold: number, modules = 0) => ({
  role: "owner" as const, address: A(50), kind: "safe" as const, evidence: ["o"],
  safe: { threshold, owners: 6, modules, guard: null, version: "1.3.0" },
});

describe("evaluate", () => {
  it("Kelp-like pre-hack state is BREACHED", () => {
    const v = evaluate(state([route(30320, cfg([LZ]), true)], [safe(3)]), map);
    expect(v.grade).toBe("BREACHED");
    const r = v.routes[0]!;
    expect(r.results.find((x) => x.rule === "AAVE-RF-2.2")!.outcome).toBe("BREACHED");
    expect(r.results.find((x) => x.rule === "AAVE-RF-2.4")!.outcome).toBe("BREACHED");
    expect(r.results.find((x) => x.rule === "AAVE-RF-2.8")!.outcome).toBe("SKIPPED");
  });
  it("3 independent + pinned + timelocked controller is OK when inbound tested", () => {
    const s = state([route(30110, cfg([LZ, NETH, GOOG]))], [{ role: "owner", address: A(51), kind: "timelock", timelock: { minDelaySeconds: "172800" }, evidence: [] }]);
    s.forkTests.push({ name: "inbound-limit", eid: 30110, forkBlock: 100, outcome: "INBOUND_LIMIT", revert: null });
    expect(evaluate(s, map).grade).toBe("OK");
  });
  it("≥3 only via unmapped DVNs is UNKNOWN, not OK", () => {
    const v = evaluate(state([route(1, cfg([LZ, UNK1, UNK2]))]), map);
    expect(v.routes[0]!.results[0]!.outcome).toBe("UNKNOWN");
  });
  it("EOA controller is BREACHED; 3-of-6 Safe without timelock is DEGRADED", () => {
    const eoa = evaluate(state([], [{ role: "delegate", address: A(60), kind: "eoa", evidence: [] }]), map);
    expect(eoa.grade).toBe("BREACHED");
    expect(evaluate(state([], [safe(3)]), map).grade).toBe("DEGRADED");
    expect(evaluate(state([], [safe(1)]), map).grade).toBe("BREACHED");
  });
  it("SKIPPED results never improve or worsen a grade", () => {
    const v = evaluate(state([route(1, cfg([LZ, NETH, GOOG]))]), map);
    expect(v.grade).toBe("OK");
  });
  it("send routes are not graded on receive-library pinning", () => {
    const v = evaluate(state([route(1, cfg([LZ, NETH, GOOG]), true, "send")]), map);
    expect(v.routes[0]!.results.map((r) => r.rule)).toEqual(["AAVE-RF-2.2"]);
  });
});

describe("canonical", () => {
  it("is key-order independent and bigint-safe", () => {
    expect(canonicalize({ b: 1n, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":"1"}');
    expect(bundleHash({ x: 1, y: 2 })).toBe(bundleHash({ y: 2, x: 1 }));
  });
});
