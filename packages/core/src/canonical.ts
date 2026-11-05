import { keccak256, stringToBytes, type Hex } from "viem";

/** Deterministic JSON: sorted object keys, no whitespace, bigint as decimal string, undefined dropped. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortDeep(x);
    }
    return out;
  }
  return v;
}

export const bundleHash = (bundle: unknown): Hex => keccak256(stringToBytes(canonicalize(bundle)));
