import type { OperatorMap } from "@floor/core";
import dvns from "../data/dvns.json" with { type: "json" };
import overrides from "../data/operator-overrides.json" with { type: "json" };

/**
 * DVN address -> operator, from the LayerZero metadata snapshot (data/dvns.json)
 * plus curated family overrides (data/operator-overrides.json).
 */
export function operatorMap(chain: string): OperatorMap {
  const chainDvns = (dvns.chains as Record<string, Record<string, { id: string; name: string; deprecated?: boolean }>>)[chain];
  if (!chainDvns) throw new Error(`no DVN metadata for chain ${chain}`);
  const family = new Map<string, string>();
  for (const [fam, g] of Object.entries(overrides.groups)) for (const id of g.ids) family.set(id, fam);
  const dead = new Set(overrides.dead);
  const out: OperatorMap = {};
  for (const [addr, v] of Object.entries(chainDvns)) {
    out[addr.toLowerCase()] = { id: family.get(v.id) ?? v.id, name: v.name, ...(dead.has(v.id) ? { dead: true } : {}) };
  }
  return out;
}
