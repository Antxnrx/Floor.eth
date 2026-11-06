#!/usr/bin/env tsx
/**
 * floor scan --oapp <address> --block <n|latest> [--symbol rsETH] [--out file.json]
 * Resolves effective LayerZero state for an OApp on Ethereum, grades it, and writes an evidence bundle.
 */
import { DEPLOYMENT } from "@floor/deployments";
import { evaluate, makeBundle } from "@floor/core";
import { writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { scanOApp } from "./lz.js";
import { operatorMap } from "./operators.js";
import { makeRpcs } from "./rpc.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []),
);
if (!args.oapp) {
  console.error("usage: floor scan --oapp <address> --block <n|latest> [--symbol S] [--out file.json]");
  process.exit(2);
}
const rpcs = makeRpcs((process.env.ETH_RPC_URLS ?? DEPLOYMENT.chains.ethereum.rpcs.join(",")).split(",").filter(Boolean));
const block = !args.block || args.block === "latest" ? await rpcs[0]!.client.getBlockNumber() : BigInt(args.block);

const t0 = Date.now();
const state = await scanOApp({ rpcs, oapp: getAddress(args.oapp), symbol: args.symbol ?? "UNKNOWN", block });
const verdict = evaluate(state, operatorMap("ethereum"));
const { bundle, hash } = makeBundle(state, verdict);

console.log(`\n${state.asset.symbol} ${state.asset.oapp} @ block ${state.scan.block}  →  ${verdict.grade}`);
console.log(`rpc: ${state.scan.rpcProviders.join(", ")}  agreement=${state.scan.rpcAgreement}  calls=${state.calls.length}  ${Date.now() - t0}ms`);
for (const s of verdict.summary) console.log(`  - ${s}`);
console.log("\n eid    dir      grade     indep  operators");
for (const r of verdict.routes) console.log(` ${String(r.eid).padEnd(6)} ${r.direction.padEnd(8)} ${r.grade.padEnd(9)} ${String(r.effectiveIndependent ?? "-").padEnd(6)} ${r.operators.join(",")}`);
console.log(`\nbundleHash ${hash}`);
if (args.out) {
  writeFileSync(args.out, JSON.stringify(bundle, null, 1));
  console.log(`wrote ${args.out}`);
}
