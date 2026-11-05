import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, type Address, type Hex, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { MULTICALL3, multicallAbi } from "./abis.js";

export interface Rpc {
  name: string;
  client: PublicClient;
}

export function makeRpcs(urls: string[]): Rpc[] {
  if (urls.length === 0) throw new Error("no RPC URLs (set ETH_RPC_URLS)");
  return urls.map((url) => ({
    name: new URL(url).hostname,
    client: createPublicClient({ chain: mainnet, transport: http(url, { retryCount: 4, retryDelay: 400, timeout: 30_000 }) }) as PublicClient,
  }));
}

export interface RawCall {
  to: Address;
  data: Hex;
  sig: string;
}
export interface RawResult {
  ok: boolean;
  result: Hex;
}

const CHUNK = 120;

async function aggregate(rpc: Rpc, calls: RawCall[], block: bigint): Promise<RawResult[]> {
  const out: RawResult[] = [];
  for (let i = 0; i < calls.length; i += CHUNK) {
    const part = calls.slice(i, i + CHUNK);
    const data = encodeFunctionData({
      abi: multicallAbi,
      functionName: "aggregate3",
      args: [part.map((c) => ({ target: c.to, allowFailure: true, callData: c.data }))],
    });
    const res = await rpc.client.call({ to: MULTICALL3, data, blockNumber: block });
    if (!res.data) throw new Error(`${rpc.name}: empty multicall response`);
    const decoded = decodeFunctionResult({ abi: multicallAbi, functionName: "aggregate3", data: res.data });
    for (const r of decoded) out.push({ ok: r.success, result: r.returnData });
  }
  return out;
}

/**
 * Runs calls on the primary RPC and cross-checks every other RPC.
 * A secondary that errors is reported as unavailable; a secondary that returns different bytes is a disagreement.
 */
export async function batch(rpcs: Rpc[], calls: RawCall[], block: bigint): Promise<{ results: RawResult[]; agreement: boolean; checked: string[] }> {
  const [primary, ...rest] = rpcs;
  const results = await aggregate(primary!, calls, block);
  let agreement = true;
  const checked = [primary!.name];
  for (const r of rest) {
    try {
      const other = await aggregate(r, calls, block);
      checked.push(r.name);
      for (let i = 0; i < results.length; i++) {
        if (other[i]!.ok !== results[i]!.ok || other[i]!.result !== results[i]!.result) {
          agreement = false;
          console.warn(`[rpc] disagreement on ${calls[i]!.sig} @${calls[i]!.to}: ${primary!.name} vs ${r.name}`);
        }
      }
    } catch (e) {
      console.warn(`[rpc] ${r.name} unavailable for cross-check: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  return { results, agreement, checked };
}
