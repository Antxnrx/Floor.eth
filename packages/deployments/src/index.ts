/** Floor's deployment manifest (testnet.json), typed. Import this instead of copying addresses or RPC URLs. */
import testnet from "../testnet.json" with { type: "json" };

export type Address = `0x${string}`;
export type ChainKey = keyof typeof testnet.chains;
export type ContractKey = keyof typeof testnet.contracts;

export const DEPLOYMENT = testnet;
export const WRITER = testnet.writer as Address;
export const RSETH = testnet.kelp.token as Address;

export function contract(name: ContractKey): { chain: ChainKey; address: Address } {
  const c = testnet.contracts[name];
  return { chain: c.chain as ChainKey, address: c.address as Address };
}
export const rpcs = (chain: Exclude<ChainKey, "arkiv">): string[] => testnet.chains[chain].rpcs;
export const explorerTx = (chain: "sepolia" | "baseSepolia", hash: string) => `${testnet.chains[chain].explorerTx}${hash}`;
