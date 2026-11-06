/** Node-only loaders for the dataset sources (evidence JSONs and the adapter registry). */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProbeChain, ProbeRow } from "./dataset.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const registry = JSON.parse(readFileSync(join(ROOT, "packages/resolver/data/adapters-all-chains.json"), "utf8")) as {
  chains: Record<string, { chainId: number; eid: number; adapters: { oapp: string; lzVersion?: string }[] }>;
};

/** Every adapter row from docs/evidence/inbound/<date>-*.json, with its chain context. */
export function loadProbe(date = "2026-11-07"): { row: ProbeRow; chain: ProbeChain }[] {
  const dir = join(ROOT, "docs/evidence/inbound");
  const out: { row: ProbeRow; chain: ProbeChain }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.startsWith(date) && x.endsWith(".json")).sort()) {
    const name = f.slice(date.length + 1, -5); // e.g. "ethereum-34", "bsc"
    const chainKey = name.startsWith("ethereum") ? "ethereum" : name;
    const reg = registry.chains[chainKey];
    if (!reg) throw new Error(`no registry entry for ${chainKey}`);
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as { block: number; rows: ProbeRow[] };
    const lzVersion = Object.fromEntries(reg.adapters.map((a) => [a.oapp.toLowerCase(), a.lzVersion ?? "unknown"]));
    for (const row of d.rows) out.push({ row, chain: { chain: chainKey, chainId: reg.chainId, eid: reg.eid, block: d.block, evidence: `docs/evidence/inbound/${f}`, lzVersion } });
  }
  return out;
}

export function loadTimeline(file = join(ROOT, "packages/publish/data/rseth-timeline.json")) {
  return JSON.parse(readFileSync(file, "utf8")) as { token: string; events: { block: number; time: number; kind: string; detail: string; tx: string }[] };
}
