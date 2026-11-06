/**
 * Browser-safe Swarm download (no bee-js): plain HTTP GET {gateway}/bytes/{reference} (Bee API), hash-checked
 * before parsing. Works against a local Bee node or a public gateway (api.gateway.ethswarm.org sends
 * Access-Control-Allow-Origin: *, checked 2026-11-06).
 */
import type { EvidenceBundle } from "@floor/core";
import { keccak256, type Hex } from "viem";

export class EvidenceHashMismatch extends Error {
  constructor(public expected: Hex, public actual: Hex) {
    super(`evidence hash mismatch: expected ${expected}, got ${actual}`);
  }
}

export async function fetchBundle(
  gateway: string,
  reference: string,
  expectedHash: Hex,
  fetchFn: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }> = (u) => fetch(u),
): Promise<EvidenceBundle> {
  if (!/^[0-9a-f]{64}$/i.test(reference)) throw new Error(`not a Swarm reference: ${reference}`);
  const res = await fetchFn(`${gateway.replace(/\/$/, "")}/bytes/${reference}`);
  if (!res.ok) throw new Error(`swarm fetch failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = keccak256(bytes);
  if (actual.toLowerCase() !== expectedHash.toLowerCase()) throw new EvidenceHashMismatch(expectedHash, actual);
  return JSON.parse(new TextDecoder().decode(bytes)) as EvidenceBundle;
}
