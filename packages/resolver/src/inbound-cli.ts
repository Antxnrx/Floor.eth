#!/usr/bin/env tsx
/**
 * floor inbound [--block <n|latest>] [--only 0xabc,0xdef] [--out results.json]
 *               [--registry data/adapters-all-chains.json --chain bsc]   (other chains: endpoint + RPCs from the registry)
 * Runs the inbound-limit probe over an adapter registry and cross-checks decisive results on a 2nd RPC.
 */
import { writeFileSync } from "node:fs";
import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { readFileSync } from "node:fs";
import { DEPLOYMENT } from "@floor/deployments";
import ethRegistry from "../data/adapters-ethereum.json" with { type: "json" };
import { oappAbi } from "./abis.js";
import { confirmOutcome, harnessSelfCheck, probeInbound, useEndpoint } from "./inbound.js";
import { batch, makeRpcs } from "./rpc.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []),
);
type Entry = { oapp: string; symbol: string; [k: string]: unknown };
type ChainReg = { endpoint: string; eid: number; rpcs: string[]; adapters: Entry[] };
const chainReg: ChainReg | null = args.registry ? (JSON.parse(readFileSync(args.registry, "utf8")).chains[args.chain ?? "ethereum"] as ChainReg) : null;
if (args.registry && !chainReg) throw new Error(`chain ${args.chain} not in ${args.registry}`);
const registry: { adapters: Entry[] } = chainReg ?? ethRegistry;
if (chainReg) useEndpoint(getAddress(chainReg.endpoint));
const defaultRpcs = chainReg ? chainReg.rpcs.join(",") : DEPLOYMENT.chains.ethereum.rpcs.join(",");
const rpcs = makeRpcs((process.env.ETH_RPC_URLS ?? defaultRpcs).split(",").filter(Boolean));
const block = !args.block || args.block === "latest" ? await rpcs[0]!.client.getBlockNumber() : BigInt(args.block);
const only = args.only ? new Set(args.only.toLowerCase().split(",")) : null;
// LayerZero v2 mainnet endpoint ids run 30101..30600 (LZ metadata, 2026-11-07); scan to 30699 for headroom.
const EIDS = Array.from({ length: 600 }, (_, i) => 30100 + i);

async function peersOf(oapp: Address): Promise<number[]> {
  const calls = EIDS.map((eid) => ({ to: oapp, sig: "peers", data: encodeFunctionData({ abi: oappAbi, functionName: "peers", args: [eid] }) }));
  const { results } = await batch([rpcs[0]!], calls, block);
  return EIDS.filter((_, i) => results[i]!.ok && !/^0x0*$/.test(results[i]!.result as Hex));
}

// Negative control first: if the harness accepts a call from a non-endpoint address, every result is void.
// Ethereum: the rsETH adapter (Arbitrum route). Other chains: the first adapter in the registry that has a peer.
async function selfCheckTarget(): Promise<[Address, number] | null> {
  if (!chainReg || args.chain === "ethereum") return ["0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3", 30110];
  for (const a of registry.adapters) {
    const eids = await peersOf(getAddress(a.oapp));
    if (eids.length) return [getAddress(a.oapp), eids[0]!];
  }
  return null; // no adapter on this chain has a peer: nothing will be probed, every row is NO_PEERS
}
const target = await selfCheckTarget();
const self = target ? await harnessSelfCheck(rpcs[0]!, target[0], target[1], block) : { ok: true, detail: "skipped: no adapter on this chain has a peer, so no route is probed" };
console.log(`harness self-check: ${target ? (self.ok ? "PASS" : "FAIL") : "SKIPPED"} (${self.detail})`);
if (!self.ok) { console.error("aborting: harness does not exercise the real receive path"); process.exit(1); }

const rows: unknown[] = [];
const tally: Record<string, number> = {};
/** Adapter-level outcome: any unbounded route makes the adapter unbounded. */
const adapterOutcome = (outs: string[]) =>
  outs.includes("NO_INBOUND_LIMIT") ? "NO_INBOUND_LIMIT" : outs.length && outs.every((o) => o === "INBOUND_LIMIT") ? "INBOUND_LIMIT" : outs.includes("TEST_ERROR") ? "TEST_ERROR" : "UNKNOWN";
console.log(`inbound-limit probe @ block ${block} (${rpcs.map((r) => r.name).join(", ")})\n`);
console.log(" symbol  adapter      kind     peers  adapter outcome    cross-check  routes");
for (const a of registry.adapters) {
  if (only && !only.has(a.oapp)) continue;
  const oapp = getAddress(a.oapp);
  try {
    const eids = await peersOf(oapp);
    if (eids.length === 0) { console.log(` ${a.symbol.padEnd(7)} ${oapp.slice(0, 10)}   -        0      NO_PEERS (not an active route)`); tally.NO_PEERS = (tally.NO_PEERS ?? 0) + 1; rows.push({ ...a, eids, outcome: "NO_PEERS", results: [] }); continue; }
    const { results, kind, sharedDecimals, tokenDecimals } = await probeInbound(rpcs, { oapp, symbol: a.symbol, eids }, block);
    const escrowSD = results[0]?.escrowSD ?? null;
    /** Whole-token escrow, using THIS adapter's shared decimals (never assume 6). */
    const escrowTokens = escrowSD === null ? null : Number(BigInt(escrowSD)) / 10 ** sharedDecimals;
    // Cross-check the decisive result of every route on a second provider.
    const checks = rpcs[1] ? await Promise.all(results.map((r) => confirmOutcome(rpcs[1]!, { oapp, symbol: a.symbol, eids }, r))) : results.map(() => true);
    const routeCounts = results.reduce<Record<string, number>>((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {});
    const outcomes = adapterOutcome(results.map((r) => r.outcome));
    tally[outcomes] = (tally[outcomes] ?? 0) + 1;
    const agree = checks.every(Boolean);
    console.log(` ${a.symbol.padEnd(7)} ${oapp.slice(0, 10)}   ${kind.padEnd(8)} ${String(eids.length).padEnd(6)} ${outcomes.padEnd(18)} ${agree ? "agree" : "DISAGREE"}       ${Object.entries(routeCounts).map(([k, v]) => `${k}:${v}`).join(" ")}`);
    rows.push({ ...a, kind, sharedDecimals, tokenDecimals, escrowTokens, eids, outcome: outcomes, routeCounts, results, crossCheck: agree ? "agree" : "disagree" });
  } catch (e) {
    console.log(` ${a.symbol.padEnd(7)} ${oapp.slice(0, 10)}   ERROR: ${(e as Error).message.split("\n")[0]}`);
    rows.push({ ...a, error: (e as Error).message.split("\n")[0] });
  }
}
console.log(`\nadapters with peers and escrow, by outcome: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(", ")}`);
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ block: Number(block), rpcs: rpcs.map((r) => r.name), method: "eth_call from EndpointV2 (no broadcast); docs/09", rows, tally, selfCheck: self }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 1));
  console.log(`\nwrote ${args.out}`);
}
