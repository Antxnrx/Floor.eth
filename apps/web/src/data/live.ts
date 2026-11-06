/**
 * The live testnet deployment (docs/evidence/live-2026-11-07.md): addresses, transactions and measured times, plus
 * read-only onchain reads for the Enforcement screen. Times are block timestamps, not wall clock.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { baseSepolia, sepolia } from "viem/chains";

export const RSETH = "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" as Address;
export const CAP_ID = "0x09fbda71b8f952b0a095484d57b80eb47dc31aba9c40515dd56ac3f662772a74" as const;
export const LIVE = {
  registry: "0xE69c3e47DdaB083D0Ba4D8aD2B2dA8531ec18220" as Address, // Ethereum Sepolia
  broadcaster: "0x83ccA5fFB6389fff54Dbde6709779a8e92F945D4" as Address, // Ethereum Sepolia
  mirror: "0xDA6E769b22ecb6815cea57aBf61494a07E571Dd6" as Address, // Base Sepolia
  vault: "0xff5E3b49d94AA7C5213938c4B8FF1983456869Be" as Address, // Base Sepolia, Morpho Vault V2
  sentinel: "0x83ccA5fFB6389fff54Dbde6709779a8e92F945D4" as Address, // Base Sepolia
  writer: "0x563567A5788820093f71951DA383838D71ad2360" as Address,
  swarmEvidence: "ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778",
  site: "https://bah5acgzaj4pea2h3q3knmuv4u2ng24wv4x3p5hbhlyi7n5dkbluwu6ejbv7q.bzz.limo/",
};
export const SEPOLIA_TX = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
export const BASE_TX = (h: string) => `https://sepolia.basescan.org/tx/${h}`;
export const CCIP_MSG = (id: string) => `https://ccip.chain.link/msg/${id}`;

export type Step = { at: number; chain: string; kind: "cre" | "ccip" | "sentinel"; title: string; detail: string; tx: string; link: string };
export const STEPS: Step[] = [
  { at: 1793999136, chain: "Ethereum Sepolia", kind: "cre", title: "Chainlink CRE writes rsETH = BREACHED", detail: "Every node re-read the evidence on Ethereum mainnet at block 24,908,284 (4 of 4 reads matched) before the report was written to FloorRegistry.", tx: "0x00aafcff100d5e7ed26ff80038b6d0ac5a75c28015364a39aae47fcb8f66b3dd", link: SEPOLIA_TX("0x00aafcff100d5e7ed26ff80038b6d0ac5a75c28015364a39aae47fcb8f66b3dd") },
  { at: 1793999436, chain: "Ethereum Sepolia", kind: "ccip", title: "CCIP message sent to Base", detail: "FloorBroadcaster sends the rating over CCIP 2.0 (message 0xd088…c9f5).", tx: "0xd1b846b607431cbee123983b94c6dc8a5606212ac8c433b49352903e3c4acd3e", link: CCIP_MSG("0xd088dbeb921c1973d65910c005616e3884a7f9ccefee9072b5ff248c30fcc9f5") },
  { at: 1794000497, chain: "Base Sepolia", kind: "ccip", title: "Rating lands on Base", detail: "FloorMirror accepts it only from Floor's broadcaster on Ethereum Sepolia; same grade, same evidence hash.", tx: "0xe8994fb000134afb6c305ca2e4922c363a1765db9133aebe001d8c741200cdf9", link: BASE_TX("0xe8994fb000134afb6c305ca2e4922c363a1765db9133aebe001d8c741200cdf9") },
  { at: 1794001698, chain: "Base Sepolia", kind: "sentinel", title: "Morpho vault cap cut to 0", detail: "Anyone can poke; FloorSentinel reads the mirrored rating and lowers the vault's rsETH cap from 1,000,000 USDC to 0. It cannot move funds or raise caps.", tx: "0x2e02faf98aa30336d7b802b5a3f3176e48231c025e4877095731bad9a3697908", link: BASE_TX("0x2e02faf98aa30336d7b802b5a3f3176e48231c025e4877095731bad9a3697908") },
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
  const sep = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });
  const base = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
  const [r, m, cap, isS] = await Promise.all([
    sep.readContract({ address: LIVE.registry, abi: RATING, functionName: "ratingOf", args: [RSETH] }),
    base.readContract({ address: LIVE.mirror, abi: RATING, functionName: "ratingOf", args: [RSETH] }),
    base.readContract({ address: LIVE.vault, abi: VAULT, functionName: "absoluteCap", args: [CAP_ID] }),
    base.readContract({ address: LIVE.vault, abi: VAULT, functionName: "isSentinel", args: [LIVE.sentinel] }),
  ]);
  const fmt = (x: typeof r) => ({ grade: GRADES[x.grade] ?? String(x.grade), known: x.known, scanBlock: Number(x.scanBlock), hash: x.bundleHash });
  return { registry: fmt(r), mirror: fmt(m), capUsdc: Number(cap / 1_000_000n), sentinelSet: isS };
}
