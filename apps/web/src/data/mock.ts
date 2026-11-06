/**
 * Data layer for the prototype. Shapes match @floor/core so the real API can replace this file 1:1.
 * REAL: rsETH bundles are actual scans (packages/resolver/fixtures). Everything flagged `mock: true` is invented
 * for UI states only and is shown with a MOCK badge (docs/00-evidence-policy.md).
 */
import type { EvidenceBundle, Grade } from "@floor/core";
import preHack from "../../../../packages/resolver/fixtures/rseth-24908284.json";
import now from "../../../../packages/resolver/fixtures/rseth-now.json";

export interface AssetRow {
  key: string;
  symbol: string;
  label: string;
  chain: string;
  grade: Grade;
  block: number;
  receiveRoutes: number;
  singleVerifier: number;
  unpinned: number;
  controller: string;
  operators: string[];
  mock: boolean;
  bundle?: EvidenceBundle;
}

const fromBundle = (key: string, label: string, b: EvidenceBundle): AssetRow => {
  const recv = b.verdict.routes.filter((r) => r.direction === "receive");
  const owner = b.state.controllers.find((c) => c.role === "owner");
  return {
    key, symbol: b.state.asset.symbol, label, chain: "Ethereum", grade: b.verdict.grade, block: b.state.scan.block,
    receiveRoutes: recv.length,
    singleVerifier: recv.filter((r) => r.effectiveIndependent === 1).length,
    unpinned: b.state.routes.filter((r) => r.direction === "receive" && r.libraryIsDefault).length,
    controller: owner?.kind === "safe" ? `Safe ${owner.safe!.threshold}-of-${owner.safe!.owners}, no timelock` : owner?.kind ?? "?",
    operators: [...new Set(recv.flatMap((r) => r.operators))],
    mock: false, bundle: b,
  };
};

export const ASSETS: AssetRow[] = [
  fromBundle("rseth-prehack", "rsETH · day before the hack", preHack as unknown as EvidenceBundle),
  fromBundle("rseth-now", "rsETH · today", now as unknown as EvidenceBundle),
  { key: "mock-ok", symbol: "AAA", label: "Example OK asset", chain: "Ethereum", grade: "OK", block: 26351514, receiveRoutes: 4, singleVerifier: 0, unpinned: 0, controller: "Timelock 48h", operators: ["layerzero-labs", "google-cloud", "nethermind"], mock: true },
  { key: "mock-degraded", symbol: "BBB", label: "Example DEGRADED asset", chain: "Ethereum", grade: "DEGRADED", block: 26351514, receiveRoutes: 6, singleVerifier: 0, unpinned: 0, controller: "Safe 4-of-7, no timelock", operators: ["layerzero-labs", "canary"], mock: true },
  { key: "mock-unknown", symbol: "CCC", label: "Example UNKNOWN asset", chain: "Ethereum", grade: "UNKNOWN", block: 26351514, receiveRoutes: 3, singleVerifier: 0, unpinned: 0, controller: "Unrecognised contract", operators: ["layerzero-labs", "unmapped:0x1234…"], mock: true },
  { key: "mock-breached", symbol: "DDD", label: "Example BREACHED asset", chain: "Ethereum", grade: "BREACHED", block: 26351514, receiveRoutes: 2, singleVerifier: 2, unpinned: 1, controller: "EOA", operators: ["layerzero-labs"], mock: true },
];

export const findAsset = (key: string) => ASSETS.find((a) => a.key === key);

/**
 * Headline numbers. Our own reproduced scan leads; community figures follow and
 * stay labelled until we reproduce them (docs/02).
 */
export const HEADLINE = [
  { value: "24 / 26", label: "rsETH routes on a single verifier, day before the hack", source: "Floor scan @ block 24,908,284 (3 RPCs agree)" },
  { value: "~99.98%", label: "of Aave LayerZero exposure passes the 3-verifier rule", source: "community analysis, Aave forum t/25114 #10 (not yet reproduced)" },
  { value: "35 / 39", label: "Aave-exposed adapters with no inbound limit (~$5.93B)", source: "community analysis, t/25114 #11 (not yet reproduced)" },
];

export interface EnforcementEvent {
  time: string;
  kind: "rating" | "cre" | "sentinel" | "ccip" | "aave";
  title: string;
  detail: string;
  tx?: string;
  mock: boolean;
}
export const EVENTS: EnforcementEvent[] = [
  { time: "T+0s", kind: "rating", title: "Config change detected", detail: "TEST-OFT route Base→Arbitrum: required DVNs 3 → 1", mock: true },
  { time: "T+4s", kind: "rating", title: "Grade OK → BREACHED", detail: "AAVE-RF-2.2: 1 effective independent verifier", mock: true },
  { time: "T+9s", kind: "cre", title: "CRE report written", detail: "FloorRegistry.onReport(bundleHash, BREACHED)", tx: "0x…", mock: true },
  { time: "T+12s", kind: "sentinel", title: "Morpho cap cut", detail: "FloorSentinel → vault.decreaseAbsoluteCap(collateral TEST-OFT, 0)", tx: "0x…", mock: true },
  { time: "T+40s", kind: "ccip", title: "CCIP status delivered", detail: "FloorMirror on Arbitrum: TEST-OFT = BREACHED", tx: "0x…", mock: true },
];

export const KELP_TIMELINE = [
  { t: "Apr 2 2025", block: "22,179,964", text: "Unichain route set to 1 required DVN by an EOA delegate (sent directly, not via the Safe)." },
  { t: "Aug 25 2025", block: "23,218,826", text: "Delegate moves to the 3-of-6 Safe. Verifier set untouched." },
  { t: "Apr 18 2026 17:35:35", block: "24,908,285", text: "Drain: 116,500 rsETH released on a forged message (~$292M at the time, per LayerZero)." },
  { t: "17:40:11", block: "24,908,307", text: "First Aave borrow, 22 blocks after the drain." },
  { t: "18:21:59", block: "24,908,516", text: "Kelp pauses its contracts." },
  { t: "19:03:59", block: "24,908,723", text: "Aave freezes rsETH on Ethereum Core (~88 min after the drain)." },
];

export const RULES = [
  { id: "AAVE-RF-2.2", title: "≥3 independent verifiers per route", source: "LlamaRisk Aave Risk Framework §2.2", quote: "A minimum of three independent verifiers … is required on every route carrying Aave exposure." },
  { id: "AAVE-TALF-R7", title: "Same operator collapses to one", source: "Aave Labs, TALF thread reply #7", quote: "Verifiers operated by the same entity, or co-located on shared infrastructure, collapse to a single effective verifier regardless of the nominal count." },
  { id: "AAVE-RF-2.4", title: "Receive library pinned", source: "LlamaRisk §2.4", quote: "Unpinned receive libraries on routes carrying Aave exposure are treated as a hard constraint on the route's exposure tier until pinning is in place." },
  { id: "AAVE-RF-2.5", title: "Timelocked bridge authority", source: "LlamaRisk §2.5", quote: "instantaneous or sub-hour delays are not acceptable." },
  { id: "AAVE-RF-2.8", title: "Inbound + outbound rate limits", source: "LlamaRisk §2.8", quote: "Inbound and outbound limits are sized separately by direction." },
];
