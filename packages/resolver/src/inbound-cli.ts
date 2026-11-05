#!/usr/bin/env tsx
/**
 * floor inbound [--block <n|latest>] [--only 0xabc,0xdef] [--out results.json]
 * Runs the inbound-limit probe over data/adapters-ethereum.json and cross-checks decisive results on a 2nd RPC.
 */
import { writeFileSync } from "node:fs";
import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import registry from "../data/adapters-ethereum.json" with { type: "json" };
import { oappAbi } from "./abis.js";
import { confirmOutcome, harnessSelfCheck, probeInbound } from "./inbound.js";
import { batch, makeRpcs } from "./rpc.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []),
);
const rpcs = makeRpcs((process.env.ETH_RPC_URLS ?? "https://eth.drpc.org,https://eth-mainnet.public.blastapi.io,https://gateway.tenderly.co/public/mainnet").split(",").filter(Boolean));
const block = !args.block || args.block === "latest" ? await rpcs[0]!.client.getBlockNumber() : BigInt(args.block);
const only = args.only ? new Set(args.only.toLowerCase().split(",")) : null;
const EIDS = Array.from({ length: 400 }, (_, i) => 30100 + i);

async function peersOf(oapp: Address): Promise<number[]> {
  const calls = EIDS.map((eid) => ({ to: oapp, sig: "peers", data: encodeFunctionData({ abi: oappAbi, functionName: "peers", args: [eid] }) }));
  const { results } = await batch([rpcs[0]!], calls, block);
  return EIDS.filter((_, i) => results[i]!.ok && !/^0x0*$/.test(results[i]!.result as Hex));
}

// Negative control first: if the harness accepts a call from a non-endpoint address, every result is void.
const self = await harnessSelfCheck(rpcs[0]!, "0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3", 30110, block);
console.log(`harness self-check: ${self.ok ? "PASS" : "FAIL"} (${self.detail})`);
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
