#!/usr/bin/env node
// Writes deployment values from packages/deployments/testnet.json into the CRE workflow configs (CRE needs static
// JSON per target). CI's manifest test fails if they drift. Usage: node scripts/sync-config.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const m = JSON.parse(readFileSync(new URL("packages/deployments/testnet.json", root), "utf8"));
const dir = new URL("cre/floor-rating/", root);
for (const f of readdirSync(dir).filter((x) => /^config\..*\.json$/.test(x))) {
  const p = new URL(f, dir);
  const c = JSON.parse(readFileSync(p, "utf8"));
  if (!c.isTestnet) continue;
  const before = c.registryAddress;
  c.registryAddress = m.contracts.registry.address;
  c.watch = [{ oapp: m.kelp.adapter, asset: m.kelp.token }];
  writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
  console.log(`${f}: registryAddress ${before} -> ${c.registryAddress}`);
}
