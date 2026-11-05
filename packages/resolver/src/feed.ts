/**
 * Builds the CRE feed (cre/floor-rating/logic.ts `floor.feed/v0`) from evidence bundles.
 * For each asset it lists the *critical* raw reads behind the grade, so every DON node can re-execute them at the
 * pinned scan block. Budget: the CRE quota is 15 EVM reads per execution, so we pick at most `perAsset` reads,
 * worst routes first (single effective verifier, then unpinned library).
 */
import type { EvidenceBundle } from "@floor/core";
import type { Address } from "viem";

export interface FeedCheck {
  id: string;
  to: Address;
  sig: "getUlnConfig" | "getReceiveLibrary";
  data: `0x${string}`;
  result: `0x${string}`;
}
export interface FeedEntry {
  asset: Address;
  grade: "OK" | "DEGRADED" | "UNKNOWN" | "BREACHED";
  scanBlock: number;
  ruleVersion: number;
  bundleHash: `0x${string}`;
  checks: FeedCheck[];
}

/** "0.1.0" -> 100 (FloorTypes.Rating.ruleVersion). */
export const ruleVersionCode = (v: string) => v.split(".").reduce((acc, p) => acc * 100 + Number(p), 0) % 2 ** 32;

export function feedEntry(bundle: EvidenceBundle, hash: `0x${string}`, asset: Address, perAsset = 4): FeedEntry {
  const { state, verdict } = bundle;
  const callById = new Map(state.calls.map((c) => [c.id, c]));
  const worstFirst = [...verdict.routes]
    .filter((r) => r.direction === "receive")
    .sort((a, b) => (a.effectiveIndependent ?? 99) - (b.effectiveIndependent ?? 99));
  const checks: FeedCheck[] = [];
  for (const rv of worstFirst) {
    const route = state.routes.find((r) => r.eid === rv.eid && r.direction === "receive");
    if (!route) continue;
    for (const id of route.evidence) {
      const c = callById.get(id);
      if (!c?.ok) continue;
      const sig = c.sig === "getUlnConfig" ? "getUlnConfig" : c.sig === "getReceiveLibrary" ? "getReceiveLibrary" : null;
      if (!sig || checks.some((x) => x.id === id)) continue;
      checks.push({ id, to: c.to, sig, data: c.data, result: c.result });
      if (checks.length >= perAsset) break;
    }
    if (checks.length >= perAsset) break;
  }
  return {
    asset,
    grade: verdict.grade,
    scanBlock: state.scan.block,
    ruleVersion: ruleVersionCode(verdict.rulePack.version),
    bundleHash: hash,
    checks,
  };
}

export const makeFeed = (entries: FeedEntry[]) => ({ schema: "floor.feed/v0" as const, entries });
