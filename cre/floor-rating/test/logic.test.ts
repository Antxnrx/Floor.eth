import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createPublicClient, decodeAbiParameters, http, type Hex } from "viem";
import { mainnet } from "viem/chains";
import feedJson from "../fixtures/feed-rseth-prehack.json" with { type: "json" };
import { encodeReport, feedSchema, GRADE, impliedFloor, planReads, verifyEntry, type Entry } from "../logic";

const feed = feedSchema.parse(feedJson);
const entry = feed.entries[0]!;
const recorded = entry.checks.map((c) => c.result as Hex);

describe("verifyEntry", () => {
  it("accepts when every re-read matches the recorded bytes", () => {
    expect(verifyEntry(entry, recorded).accepted).toBe(true);
  });
  it("rejects a single-byte mismatch", () => {
    const t = [...recorded];
    t[1] = (t[1]!.slice(0, -2) + (t[1]!.endsWith("00") ? "01" : "00")) as Hex;
    const v = verifyEntry(entry, t);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/mismatch/);
  });
  it("rejects a failed read", () => {
    expect(verifyEntry(entry, [null, ...recorded.slice(1)]).reason).toMatch(/failed/);
  });
  it("rejects a feed that understates risk (claims OK while raw bytes show one verifier)", () => {
    const lying: Entry = { ...entry, grade: "OK" };
    const v = verifyEntry(lying, recorded);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/understates/);
  });
  it("lower bound comes from the raw bytes: 1 DVN and unpinned lib both imply BREACHED", () => {
    for (const c of entry.checks) expect(impliedFloor(c)).toBe(GRADE.BREACHED);
  });
});

describe("planReads", () => {
  it("never exceeds the 15-read CRE quota and keeps the worst grades", () => {
    const many = { ...feed, entries: Array.from({ length: 6 }, (_, i) => ({ ...entry, grade: (i % 2 ? "OK" : "BREACHED") as Entry["grade"] })) };
    const plan = planReads(many);
    expect(plan.reduce((n, e) => n + e.checks.length, 0)).toBeLessThanOrEqual(15);
    expect(plan.every((e) => e.grade === "BREACHED")).toBe(true);
  });
});

describe("encodeReport", () => {
  it("round-trips as FloorTypes.Update[]", () => {
    const [decoded] = decodeAbiParameters(
      [{ type: "tuple[]", components: [{ name: "asset", type: "address" }, { name: "grade", type: "uint8" }, { name: "scanBlock", type: "uint64" }, { name: "ruleVersion", type: "uint32" }, { name: "bundleHash", type: "bytes32" }] }],
      encodeReport([entry]),
    );
    expect(decoded[0]!.asset.toLowerCase()).toBe(entry.asset.toLowerCase());
    expect(decoded[0]!.grade).toBe(GRADE.BREACHED);
    expect(decoded[0]!.scanBlock).toBe(24908284n);
    expect(decoded[0]!.ruleVersion).toBe(100);
    expect(decoded[0]!.bundleHash).toBe(entry.bundleHash);
  });
});

/** What a DON node does, against the real chain: re-execute each listed read at the pinned block. */
describe.runIf(process.env.FLOOR_LIVE)("live: feed checks re-executed on Ethereum mainnet", () => {
  it("every recorded read reproduces byte-for-byte at block 24,908,284", async () => {
    const c = createPublicClient({ chain: mainnet, transport: http(process.env.ETH_RPC_URL ?? "https://eth.drpc.org") });
    const observed = await Promise.all(entry.checks.map(async (k) => (await c.call({ to: k.to as Hex, data: k.data as Hex, blockNumber: BigInt(entry.scanBlock) })).data ?? null));
    const v = verifyEntry(entry, observed as (Hex | null)[]);
    expect(v.accepted, v.reason).toBe(true);
  }, 60_000);
});

/** The two demo lies (fixtures/feed-rseth-lie-*.json). "observed" = what the chain really returns = the honest feed. */
describe("demo lies are rejected", () => {
  const honest = JSON.parse(readFileSync(new URL("../fixtures/feed-rseth-prehack.json", import.meta.url), "utf8")).entries[0];
  const chain = honest.checks.map((c: { result: string }) => c.result as Hex);
  it("lie 1: grade OK with the real evidence is rejected as understating risk", () => {
    const lie = JSON.parse(readFileSync(new URL("../fixtures/feed-rseth-lie-grade.json", import.meta.url), "utf8")).entries[0];
    const v = verifyEntry(lie, chain);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/understates risk/);
  });
  it("lie 2: grade OK with forged evidence is rejected because the chain disagrees", () => {
    const lie = JSON.parse(readFileSync(new URL("../fixtures/feed-rseth-lie-evidence.json", import.meta.url), "utf8")).entries[0];
    const v = verifyEntry(lie, chain);
    expect(v.accepted).toBe(false);
    expect(v.reason).toMatch(/c505 mismatch/);
  });
  it("the honest feed is accepted against the same chain", () => {
    expect(verifyEntry(honest, chain).accepted).toBe(true);
  });
});
