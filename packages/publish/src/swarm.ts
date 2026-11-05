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

export class EvidenceHashMismatch extends Error {
  constructor(public expected: Hex, public actual: Hex) {
    super(`evidence hash mismatch: expected ${expected}, got ${actual}`);
  }
}

/**
 * Browser-safe download: plain HTTP GET {gateway}/bytes/{reference} (Bee API), hash-checked before parsing.
 * Works against a local Bee node or a public gateway; no bee-js needed in the page.
 */
export async function fetchBundle(
  gateway: string,
  reference: string,
  expectedHash: Hex,
  fetchFn: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }> = (u) => fetch(u),
): Promise<EvidenceBundle> {
  const res = await fetchFn(`${gateway.replace(/\/$/, "")}/bytes/${reference}`);
  if (!res.ok) throw new Error(`swarm fetch failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = keccak256(bytes);
  if (actual.toLowerCase() !== expectedHash.toLowerCase()) throw new EvidenceHashMismatch(expectedHash, actual);
  return JSON.parse(new TextDecoder().decode(bytes)) as EvidenceBundle;
}
