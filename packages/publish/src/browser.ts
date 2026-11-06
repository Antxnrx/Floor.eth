/**
 * Browser entry point: everything a page needs to find and fetch a Floor rating without a Floor server, with no
 * Node-only dependency (no bee-js, no private keys).
 *
 *   Arkiv (floor.rating, created by the writer) -> { swarmRef, bundleHash, grade, block }
 *   Swarm gateway GET /bytes/{swarmRef}        -> bytes, keccak256(bytes) must equal bundleHash
 *
 * Arkiv reads take any JSON-RPC fetch function, so they can go through EF Anon-RPC like the chain reads.
 */
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, type Address, type Hex } from "viem";
import { latestRating } from "./arkiv.js";

export { FloorRating, FloorRoute, latestRating, singleVerifierRoutes } from "./arkiv.js";
export { EvidenceHashMismatch, fetchBundle } from "./swarm-fetch.js";

export const RABDI_PUBLIC_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
export const SWARM_PUBLIC_GATEWAY = "https://api.gateway.ethswarm.org";

type RpcFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Read-only Arkiv client whose JSON-RPC goes through `fetchFn` (direct fetch, or an Anon-RPC worker). */
export function arkivReader(fetchFn: RpcFetch, rpcUrl = RABDI_PUBLIC_RPC) {
  let id = 1;
  const transport = custom({
    async request({ method, params }) {
      const res = await fetchFn(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params ?? [] }) });
      if (!res.ok) throw new Error(`arkiv rpc HTTP ${res.status}`);
      const j = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (j.error) throw new Error(`arkiv rpc: ${j.error.message}`);
      return j.result;
    },
  });
  // accessKey "" = no key in the URL; the RPC URL used is ours (custom transport), not the chain's default.
  return createPublicClient({ chain: rabdi({ accessKey: "" }), transport });
}

export interface ArkivRating {
  entityKey: Hex | undefined;
  creator: Address | undefined;
  grade: string;
  block: number;
  ruleVersion: string;
  swarmRef: string;
  bundleHash: Hex;
}

/** The latest rating of `token` created by `writer`, flattened; null if none. */
export async function findRating(client: ReturnType<typeof arkivReader>, writer: Address, token: Address): Promise<ArkivRating | null> {
  const e = await latestRating(client as never, writer, token);
  if (!e) return null;
  const r = e as unknown as Record<string, unknown>;
  // columns come back decoded through the schema; unwrap a { type, value } just in case
  const v = (k: string) => { const x = r[k]; return x && typeof x === "object" && "value" in x ? (x as { value: unknown }).value : x; };
  const creator = r.$creator as Address | undefined;
  if (creator && creator.toLowerCase() !== writer.toLowerCase()) throw new Error(`Arkiv returned an entity created by ${creator}, not the writer`);
  return {
    entityKey: r.$key as Hex | undefined,
    creator,
    grade: String(v("grade")),
    block: Number(v("block")),
    ruleVersion: String(v("ruleVersion")),
    swarmRef: String(v("swarmRef")),
    bundleHash: String(v("bundleHash")) as Hex,
  };
}

export { adaptersBy, adapterValues, eventValues, FloorAdapter, FloorEvent, timeline, unboundedAdapters } from "./dataset.js";
