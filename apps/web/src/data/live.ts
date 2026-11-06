/**
 * The live testnet deployment (docs/evidence/live-2026-11-07.md): addresses, transactions and measured times, plus
 * read-only onchain reads for the Enforcement screen. Times are block timestamps, not wall clock.
 */
import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { baseSepolia, sepolia } from "viem/chains";

import { DEPLOYMENT, contract, explorerTx, RSETH as RSETH_ADDR } from "@floor/deployments";

export const RSETH = RSETH_ADDR as Address;
export const CAP_ID = DEPLOYMENT.kelp.capId as `0x${string}`;
export const LIVE = {
  registry: contract("registry").address as Address, // Ethereum Sepolia
  broadcaster: contract("broadcaster").address as Address, // Ethereum Sepolia
  mirror: contract("mirror").address as Address, // Base Sepolia
  vault: contract("vault").address as Address, // Base Sepolia, Morpho Vault V2
  sentinel: contract("sentinel").address as Address, // Base Sepolia
  writer: DEPLOYMENT.writer as Address,
  swarmEvidence: DEPLOYMENT.kelp.swarmRef,
  /** the verify pages ship in the same site, under ./verify/ (relative: works on GitHub Pages and on Swarm) */
  verifyPage: "./verify/",
};
const SEPOLIA_TX = (h: string) => explorerTx("sepolia", h);
const BASE_TX = (h: string) => explorerTx("baseSepolia", h);
export const CCIP_MSG = (id: string) => `https://ccip.chain.link/msg/${id}`;

export type Step = { at: number; chain: string; kind: "cre" | "ccip" | "sentinel"; title: string; detail: string; tx: string; link: string };
const T = DEPLOYMENT.kelp.liveTxs;
export const STEPS: Step[] = [
  { at: T.creWrite.at, chain: "Ethereum Sepolia", kind: "cre", title: "Chainlink CRE writes rsETH = BREACHED", detail: "Every node re-read the evidence on Ethereum mainnet at block 24,908,284 (4 of 4 reads matched) before the report was written to FloorRegistry.", tx: T.creWrite.hash, link: SEPOLIA_TX(T.creWrite.hash) },
  { at: T.ccipSend.at, chain: "Ethereum Sepolia", kind: "ccip", title: "CCIP message sent to Base", detail: "FloorBroadcaster sends the rating over CCIP 2.0.", tx: T.ccipSend.hash, link: CCIP_MSG(T.ccipSend.messageId) },
  { at: T.ccipDelivery.at, chain: "Base Sepolia", kind: "ccip", title: "Rating lands on Base", detail: "FloorMirror accepts it only from Floor's broadcaster on Ethereum Sepolia; same grade, same evidence hash.", tx: T.ccipDelivery.hash, link: BASE_TX(T.ccipDelivery.hash) },
  { at: T.capCut.at, chain: "Base Sepolia", kind: "sentinel", title: "Morpho vault cap cut to 0", detail: "Anyone can poke; FloorSentinel reads the mirrored rating and lowers the vault's rsETH cap from 1,000,000 USDC to 0. It cannot move funds or raise caps.", tx: T.capCut.hash, link: BASE_TX(T.capCut.hash) },
];

const RATING = parseAbi(["function ratingOf(address) view returns ((uint8 grade, bool known, uint64 scanBlock, uint32 ruleVersion, uint64 updatedAt, bytes32 bundleHash))"]);
const VAULT = parseAbi(["function absoluteCap(bytes32) view returns (uint256)", "function isSentinel(address) view returns (bool)"]);
export const GRADES = ["OK", "DEGRADED", "UNKNOWN", "BREACHED"] as const;

export interface LiveState {
  registry: { grade: string; known: boolean; scanBlock: number; hash: string };
  mirror: { grade: string; known: boolean; scanBlock: number; hash: string };
  capUsdc: number;
  sentinelSet: boolean;
}

/** Read-only, straight from public RPCs (no keys). */
export async function readLive(): Promise<LiveState> {
  const sep = createPublicClient({ chain: sepolia, transport: fallback(DEPLOYMENT.chains.sepolia.rpcs.map((u) => http(u))) });
  const base = createPublicClient({ chain: baseSepolia, transport: fallback(DEPLOYMENT.chains.baseSepolia.rpcs.map((u) => http(u))) });
  const [r, m, cap, isS] = await Promise.all([
    sep.readContract({ address: LIVE.registry, abi: RATING, functionName: "ratingOf", args: [RSETH] }),
    base.readContract({ address: LIVE.mirror, abi: RATING, functionName: "ratingOf", args: [RSETH] }),
    base.readContract({ address: LIVE.vault, abi: VAULT, functionName: "absoluteCap", args: [CAP_ID] }),
    base.readContract({ address: LIVE.vault, abi: VAULT, functionName: "isSentinel", args: [LIVE.sentinel] }),
  ]);
  const fmt = (x: typeof r) => ({ grade: GRADES[x.grade] ?? String(x.grade), known: x.known, scanBlock: Number(x.scanBlock), hash: x.bundleHash });
  return { registry: fmt(r), mirror: fmt(m), capUsdc: Number(cap / 1_000_000n), sentinelSet: isS };
}
