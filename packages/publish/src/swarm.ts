/**
 * Swarm integration (docs/20 §Use 1-2). Evidence bundles are uploaded as their canonical JSON bytes, so
 * keccak256(downloaded bytes) === bundleHash, the same hash stored on Arkiv and signed into the CRE report.
 * No encryption: evidence is public by design (and an encrypted ref must never go into a public Arkiv entity).
 */
import { canonicalize, type EvidenceBundle } from "@floor/core";
import { Bee } from "@ethersphere/bee-js";
import { keccak256, stringToBytes, type Hex } from "viem";

export function bundleBytes(bundle: EvidenceBundle): { bytes: Uint8Array; hash: Hex } {
  const bytes = stringToBytes(canonicalize(bundle));
  return { bytes, hash: keccak256(bytes) };
}

/** Uses an existing usable batch if there is one (never buys silently in prod; see `createBatch`). */
export async function usableBatch(bee: Bee): Promise<string | null> {
  const all = await bee.stamp.getAll();
  const ok = all.find((b) => b.usable);
  return ok ? ok.batchID.toHex() : null;
}

/**
 * Buys a postage batch on the node's chain. Local dev (bee-factory) only in tests; costs xBZZ on mainnet.
 * Bee requires amount >= price * 17280 (24h of storage); at the observed local price 24000 that is 414,720,001.
 */
export async function createBatch(bee: Bee, amount = "1000000000", depth = 20): Promise<string> {
  const id = await bee.stamp.create(amount, depth, { waitForUsable: true });
  return id.toHex();
}

export async function uploadBundle(bee: Bee, batchId: string, bundle: EvidenceBundle): Promise<{ reference: string; hash: Hex; size: number }> {
  const { bytes, hash } = bundleBytes(bundle);
  // deferred:false => the call returns only after the chunks were pushed to the network, so the reference is
  // retrievable from other nodes before we publish it to Arkiv (bee-js UploadOptions.deferred docs).
  const res = await bee.data.upload(batchId, bytes, { deferred: false });
  return { reference: res.reference.toHex(), hash, size: bytes.length };
}

// Browser-safe download lives in swarm-fetch.ts (no bee-js), re-exported here for Node callers.
export { EvidenceHashMismatch, fetchBundle } from "./swarm-fetch.js";
