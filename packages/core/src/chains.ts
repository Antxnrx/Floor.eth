import eids from "./data/eids.json" with { type: "json" };

/** LayerZero V2 mainnet endpoint id -> chain name (LayerZero metadata API snapshot, 2026-11-06). */
export const chainName = (eid: number): string => (eids.eids as Record<string, string>)[String(eid)] ?? `eid ${eid}`;
