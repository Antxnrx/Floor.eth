/**
 * Live state of every Aave V3 market (packages/deployments/aave-markets.json), read straight from each chain.
 * Per market: the reserve list, then one Multicall3 batch for every reserve's config, supply, oracle price, symbol,
 * and (for tokens bridged by a LayerZero adapter on that chain) the adapter's escrow balance.
 * Interfaces used are the ones stable across Aave V3 versions (Pool.getReservesList, AaveProtocolDataProvider,
 * AaveOracle). A market that fails is reported as failed; it never breaks the others.
 */
import markets from "@floor/deployments/aave-markets.json" with { type: "json" };
import { createPublicClient, defineChain, erc20Abi, fallback, http, parseAbi, type Address } from "viem";

const poolAbi = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getReservesCount() view returns (uint256)",
  "function getReserveAddressById(uint16 id) view returns (address)",
  // Aave V3.2+: which reserves each E-mode category accepts as collateral (bit i = reserve id i)
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
]);
/** E-mode category ids probed per market (Aave uses small ids; unused ids return an empty bitmap). */
const EMODE_IDS = Array.from({ length: 40 }, (_, i) => i + 1);
const dataProviderAbi = parseAbi([
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getATokenTotalSupply(address asset) view returns (uint256)",
]);
const oracleAbi = parseAbi(["function getAssetPrice(address asset) view returns (uint256)", "function BASE_CURRENCY_UNIT() view returns (uint256)"]);

/** "none-found": not in LayerZero's OFT registry for this chain (native, or bridged some other way). */
export type BridgeKind = "none-found" | "layerzero-adapter" | "layerzero-oft";
export interface Reserve {
  asset: Address;
  symbol: string;
  decimals: number;
  /** accepted as collateral: liquidation threshold > 0, or listed as collateral in an E-mode category */
  collateral: boolean;
  /** only through E-mode (base liquidation threshold is 0) */
  collateralViaEModeOnly: boolean;
  ltvBps: number;
  liquidationThresholdBps: number;
  frozen: boolean;
  active: boolean;
  /** whole tokens supplied to the market */
  supplied: number;
  priceUsd: number | null;
  suppliedUsd: number | null;
  bridge: { kind: BridgeKind; oapp?: Address; lzSymbol?: string; lzVersion?: string; escrow?: number };
}
export interface MarketState {
  id: string;
  name: string;
  chainId: number;
  ok: boolean;
  error?: string;
  block?: number;
  readAt: number;
  reserves: Reserve[];
}
export interface Market {
  id: string;
  name: string;
  chainId: number;
  pool: string;
  dataProvider: string;
  oracle: string;
  rpcs: string[];
}
export const MARKETS = markets.markets as Market[];
type Bridged = Record<string, Record<string, { kind: BridgeKind; oapp: string; symbol: string; lzVersion: string }>>;
const BRIDGED = markets.bridged as unknown as Bridged;

const num = (x: bigint, decimals: number) => Number(x) / 10 ** decimals;

export async function readMarket(m: Market, opts: { timeoutMs?: number } = {}): Promise<MarketState> {
  const base = { id: m.id, name: m.name, chainId: m.chainId, readAt: Date.now() };
  if (!m.rpcs.length) return { ...base, ok: false, error: "no working RPC for this chain", reserves: [] };
  const chain = defineChain({
    id: m.chainId,
    name: m.name,
    nativeCurrency: { name: "native", symbol: "native", decimals: 18 },
    rpcUrls: { default: { http: m.rpcs } },
    contracts: { multicall3: { address: markets.multicall3 as Address } },
  });
  const client = createPublicClient({ chain, transport: fallback(m.rpcs.map((u) => http(u, { timeout: opts.timeoutMs ?? 15_000, retryCount: 1 }))) });
  try {
    const block = await client.getBlockNumber();
    const assets = (await client.readContract({ address: m.pool as Address, abi: poolAbi, functionName: "getReservesList", blockNumber: block })) as Address[];
    // E-mode collateral: map reserve id -> address, then read every category's collateral bitmap (V3.2+; on older
    // markets these calls fail and only the base liquidation threshold counts).
    const count = Number(await client.readContract({ address: m.pool as Address, abi: poolAbi, functionName: "getReservesCount", blockNumber: block }).catch(() => 0n));
    const idCalls = Array.from({ length: count }, (_, id) => ({ address: m.pool as Address, abi: poolAbi, functionName: "getReserveAddressById", args: [id] }));
    const bmCalls = EMODE_IDS.map((id) => ({ address: m.pool as Address, abi: poolAbi, functionName: "getEModeCategoryCollateralBitmap", args: [id] }));
    const em = (await client.multicall({ contracts: [...idCalls, ...bmCalls] as never, allowFailure: true, blockNumber: block })) as { status: string; result?: unknown }[];
    const idToAsset = em.slice(0, count).map((r) => (r.status === "success" ? String(r.result).toLowerCase() : ""));
    const eModeCollateral = new Set<string>();
    for (const r of em.slice(count)) {
      if (r.status !== "success") continue;
      const bm = BigInt(r.result as bigint);
      for (let i = 0; i < idToAsset.length; i++) if ((bm >> BigInt(i)) & 1n && idToAsset[i]) eModeCollateral.add(idToAsset[i]!);
    }
    const bridged = BRIDGED[String(m.chainId)] ?? {};
    const calls = assets.flatMap((a) => {
      const b = bridged[a.toLowerCase()];
      return [
        { address: m.dataProvider as Address, abi: dataProviderAbi, functionName: "getReserveConfigurationData", args: [a] },
        { address: m.dataProvider as Address, abi: dataProviderAbi, functionName: "getATokenTotalSupply", args: [a] },
        { address: m.oracle as Address, abi: oracleAbi, functionName: "getAssetPrice", args: [a] },
        { address: a, abi: erc20Abi, functionName: "symbol" },
        b?.kind === "layerzero-adapter"
          ? { address: a, abi: erc20Abi, functionName: "balanceOf", args: [b.oapp as Address] }
          : { address: a, abi: erc20Abi, functionName: "decimals" },
      ];
    });
    const results = (await client.multicall({
      contracts: [{ address: m.oracle as Address, abi: oracleAbi, functionName: "BASE_CURRENCY_UNIT" }, ...calls] as never,
      allowFailure: true,
      blockNumber: block,
    })) as { status: string; result?: unknown }[];
    const [unitRes, ...res] = results;
    const unit = unitRes?.status === "success" ? Number(unitRes.result as bigint) : 1e8; // Aave V3 USD markets: 1e8
    const reserves: Reserve[] = assets.map((a, i) => {
      const [cfg, supply, price, sym, extra] = res.slice(i * 5, i * 5 + 5);
      const c = cfg?.status === "success" ? (cfg.result as readonly [bigint, bigint, bigint, bigint, bigint, boolean, boolean, boolean, boolean, boolean]) : null;
      const decimals = c ? Number(c[0]) : 18;
      const supplied = supply?.status === "success" ? num(supply.result as bigint, decimals) : 0;
      const priceUsd = price?.status === "success" ? Number(price.result as bigint) / unit : null;
      const b = bridged[a.toLowerCase()];
      const escrow = b?.kind === "layerzero-adapter" && extra?.status === "success" ? num(extra.result as bigint, decimals) : undefined;
      return {
        asset: a,
        symbol: sym?.status === "success" ? String(sym.result) : a.slice(0, 8),
        decimals,
        collateral: (c ? c[2] > 0n : false) || eModeCollateral.has(a.toLowerCase()),
        collateralViaEModeOnly: !(c && c[2] > 0n) && eModeCollateral.has(a.toLowerCase()),
        ltvBps: c ? Number(c[1]) : 0,
        liquidationThresholdBps: c ? Number(c[2]) : 0,
        frozen: c ? c[9] : false,
        active: c ? c[8] : false,
        supplied,
        priceUsd,
        suppliedUsd: priceUsd === null ? null : supplied * priceUsd,
        bridge: b ? { kind: b.kind, oapp: b.oapp as Address, lzSymbol: b.symbol, lzVersion: b.lzVersion, escrow } : { kind: "none-found" },
      };
    });
    return { ...base, ok: true, block: Number(block), reserves };
  } catch (e) {
    return { ...base, ok: false, error: (e as Error).message.split("\n")[0]!.slice(0, 160), reserves: [] };
  }
}

/** Every market in parallel; failures are per market. */
export const readAllMarkets = (opts?: { timeoutMs?: number }) => Promise.all(MARKETS.map((m) => readMarket(m, opts)));
