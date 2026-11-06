import { describe, expect, it } from "vitest";
import { bundleHash, type EvidenceBundle } from "@floor/core";
import { Bee } from "@ethersphere/bee-js";
import { MAX_ATTRIBUTES, MAX_STRING_BYTES } from "@arkiv-network/sdk";
import pre from "../../resolver/fixtures/rseth-24908284.json" with { type: "json" };
import { ratingValues, routeValues } from "../src/arkiv.js";
import { bundleBytes, createBatch, EvidenceHashMismatch, fetchBundle, uploadBundle, usableBatch } from "../src/swarm.js";

const bundle = pre as unknown as EvidenceBundle;
const RSETH = "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" as const;
const HASH = bundleHash(bundle);
const unwrap = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v);

describe("Arkiv mapping (offline)", () => {
  it("rating entity carries grade, counts, Swarm ref and the same hash as the CRE report", () => {
    const v = ratingValues(bundle, HASH, "ab".repeat(32), RSETH);
    expect(v.grade).toBe("BREACHED");
    expect(String(unwrap(v.block))).toBe("24908284");
    expect(String(unwrap(v.receiveRoutes))).toBe("26");
    expect(String(unwrap(v.singleVerifierRoutes))).toBe("24");
    expect(String(unwrap(v.unpinnedRoutes))).toBe("25");
    expect(v.bundleHash).toBe(HASH);
  });
  it("every string fits Arkiv's 128-byte limit and attribute count is within MAX_ATTRIBUTES", () => {
    const rows = [ratingValues(bundle, HASH, "ab".repeat(32), RSETH), ...routeValues(bundle, HASH, RSETH)];
    for (const row of rows) {
      expect(Object.keys(row).length).toBeLessThanOrEqual(MAX_ATTRIBUTES - 1); // -1: named schema uses one
      for (const val of Object.values(row)) if (typeof val === "string") expect(new TextEncoder().encode(val).length).toBeLessThanOrEqual(MAX_STRING_BYTES);
    }
  });
  it("route entities mirror the 26 receive + 26 send routes; Unichain receive is unpinned with 1 verifier", () => {
    const rows = routeValues(bundle, HASH, RSETH);
    expect(rows).toHaveLength(52);
    const uni = rows.find((r) => String(unwrap(r.eid)) === "30320" && r.direction === "receive")!;
    expect(String(unwrap(uni.independent))).toBe("1");
    expect(String(unwrap(uni.pinned))).toBe("false");
    expect(uni.operators).toBe("layerzero-labs");
  });
});

describe("Swarm bytes (offline)", () => {
  it("uploaded bytes hash to exactly the bundle hash", () => {
    expect(bundleBytes(bundle).hash).toBe(HASH);
  });
  it("fetchBundle refuses bytes that don't match the expected hash", async () => {
    const { bytes } = bundleBytes(bundle);
    const tampered = bytes.slice();
    tampered[10] = tampered[10]! ^ 1;
    const fake = async () => ({ ok: true, status: 200, arrayBuffer: async () => tampered.buffer });
    await expect(fetchBundle("http://x", "ab".repeat(32), HASH, fake)).rejects.toBeInstanceOf(EvidenceHashMismatch);
    // a malformed reference is refused before any request (it is read from Arkiv, i.e. untrusted input)
    await expect(fetchBundle("http://x", "../stamps", HASH, fake)).rejects.toThrow(/not a Swarm reference/);
  });
});

/** Real Swarm: a local Bee network (bee-factory, Bee v2.8.1). Run `npx @ethersphere/bee-factory start` first. */
describe.runIf(process.env.FLOOR_SWARM)("Swarm round trip on a local Bee node", () => {
  const BEE = process.env.BEE_URL ?? "http://localhost:1633";
  it("uploads the rsETH bundle, downloads it over plain HTTP from another node, hash verified", async () => {
    const bee = new Bee(BEE);
    const batch = (await usableBatch(bee)) ?? (await createBatch(bee));
    const { reference, hash, size } = await uploadBundle(bee, batch, bundle);
    expect(reference).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(HASH);
    // read back from a DIFFERENT node of the network (worker 1), like a browser using any gateway would
    const back = await fetchBundle(process.env.BEE_READ_URL ?? "http://localhost:1635", reference, HASH);
    expect(bundleHash(back)).toBe(HASH);
    expect(back.verdict.grade).toBe("BREACHED");
    console.log(`swarm ref ${reference} (${size} bytes) batch ${batch}`);
  }, 180_000);
});

/** Live read against Arkiv's Rabdi testnet with the SDK (reads need no funds; access key optional for reads). */
describe.runIf(process.env.FLOOR_LIVE)("Arkiv Rabdi testnet (live read)", () => {
  it("SDK query path works with our schema and creator filter", async () => {
    const { arkivClients, latestRating, singleVerifierRoutes } = await import("../src/arkiv.js");
    const { publicClient } = arkivClients({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
    const writer = "0x000000000000000000000000000000000000F100" as const;
    expect(await latestRating(publicClient, writer, RSETH)).toBeNull(); // nothing written by this address yet
    expect(Array.isArray(await singleVerifierRoutes(publicClient, writer))).toBe(true);
  }, 60_000);
});

/** The browser path (packages/publish/src/browser.ts): Arkiv read through a plain fetch function, as Anon-RPC provides. */
describe.runIf(process.env.FLOOR_LIVE)("Arkiv browser reader (live read)", () => {
  it("findRating goes through the given fetch function and returns null for a writer with no ratings", async () => {
    const { arkivReader, findRating } = await import("../src/browser.js");
    let calls = 0;
    const client = arkivReader(async (url, init) => { calls++; return fetch(url, init); });
    expect(await findRating(client, "0x000000000000000000000000000000000000F100", RSETH)).toBeNull();
    expect(calls).toBeGreaterThan(0);
  }, 60_000);
});
