#!/usr/bin/env node
// Generates packages/deployments/aave-markets.json: every production Aave V3 market (bgd-labs/aave-address-book),
// how each listed token is bridged (LayerZero OFT registry), and tested browser-usable RPCs per chain.
// Re-run any time: node packages/deployments/scripts/gen-aave-markets.mjs
import { readFileSync, writeFileSync } from "node:fs";

const MARKETS = ["Ethereum", "EthereumLido", "EthereumEtherFi", "EthereumHorizon", "Arbitrum", "Base", "Optimism", "Polygon", "Avalanche", "BNB", "Gnosis", "Scroll", "Linea", "Mantle", "Metis", "ZkSync", "Sonic", "Celo", "Soneium", "InkWhitelabel", "Plasma", "MegaEth", "Monad", "XLayer"];
const NAMES = { Ethereum: "Ethereum Core", EthereumLido: "Ethereum Prime", EthereumEtherFi: "Ethereum EtherFi", EthereumHorizon: "Ethereum Horizon", InkWhitelabel: "Ink", ZkSync: "zkSync", MegaEth: "MegaETH", XLayer: "X Layer", BNB: "BNB Chain" };
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const manifest = JSON.parse(readFileSync(new URL("../testnet.json", import.meta.url), "utf8"));
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": "floor-gen" } }); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r; };
const pick = (ts, name) => (ts.match(new RegExp(`^export const ${name} = ['"]?(0x[0-9a-fA-F]{40}|\\d+)['"]?;`, "m")) || [])[1];

async function rpcOk(url, chainId) {
  try {
    const call = (method, params) => fetch(url, { method: "POST", headers: { "content-type": "application/json", Origin: "https://floor.aexiz.in" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
    const r = await call("eth_chainId", []);
    if (!r.ok || !r.headers.get("access-control-allow-origin")) return false;
    if (parseInt((await r.json()).result, 16) !== chainId) return false;
    const c = await (await call("eth_getCode", [MULTICALL3, "latest"])).json();
    return typeof c.result === "string" && c.result.length > 10;
  } catch { return false; }
}

const lzmeta = await (await get("https://metadata.layerzero-api.com/v1/metadata")).json();
const ofts = await (await get("https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list")).json();
const lzByChainId = {};
for (const [k, c] of Object.entries(lzmeta)) {
  const id = c?.chainDetails?.nativeChainId;
  if (id && c.chainDetails?.chainType === "evm" && !lzByChainId[id]) lzByChainId[id] = k;
}
// bridged[chainId][tokenAddressLower] = { kind, oapp, symbol }
const bridged = {};
for (const [sym, entries] of Object.entries(ofts)) for (const e of entries) for (const [ck, d] of Object.entries(e.deployments ?? {})) {
  const id = lzmeta[ck]?.chainDetails?.nativeChainId;
  if (!id || lzmeta[ck]?.chainDetails?.chainType !== "evm") continue;
  const adapter = (d.type ?? "").endsWith("ADAPTER");
  const token = (adapter ? d.innerTokenAddress : d.address)?.toLowerCase();
  if (!token) continue;
  (bridged[id] ??= {})[token] = { kind: adapter ? "layerzero-adapter" : "layerzero-oft", oapp: d.address.toLowerCase(), symbol: sym, lzVersion: e.endpointVersion ?? "unknown" };
}

const markets = [];
const rpcCache = {};
for (const m of MARKETS) {
  const ts = await (await get(`https://raw.githubusercontent.com/bgd-labs/aave-address-book/main/src/ts/AaveV3${m}.ts`)).text();
  const chainId = Number(pick(ts, "CHAIN_ID"));
  if (!rpcCache[chainId]) {
    const lzRpcs = chainId === 1 ? manifest.chains.ethereum.rpcs : (lzmeta[lzByChainId[chainId]]?.rpcs ?? []).map((r) => (typeof r === "string" ? r : r.url)).filter((u) => u?.startsWith("https://") && !u.includes("{"));
    const ok = [];
    for (const u of lzRpcs) { if (ok.length >= 2) break; if (await rpcOk(u, chainId)) ok.push(u); }
    rpcCache[chainId] = ok;
  }
  markets.push({ id: m, name: NAMES[m] ?? m, chainId, pool: pick(ts, "POOL"), dataProvider: pick(ts, "AAVE_PROTOCOL_DATA_PROVIDER"), oracle: pick(ts, "ORACLE"), rpcs: rpcCache[chainId] });
  console.log(`${m.padEnd(16)} chain ${String(chainId).padEnd(7)} rpcs ${rpcCache[chainId].length}`);
}
const chainIds = new Set(markets.map((x) => x.chainId));
const out = {
  source: "Aave V3 markets: github.com/bgd-labs/aave-address-book (src/ts/AaveV3*.ts). Bridging: LayerZero OFT registry (metadata.layerzero-api.com/v1/metadata/experiment/ofts/list). RPCs: LayerZero chain metadata, kept only if they answer eth_chainId with CORS headers and have Multicall3.",
  generatedAt: new Date().toISOString(),
  multicall3: MULTICALL3,
  markets,
  bridged: Object.fromEntries(Object.entries(bridged).filter(([id]) => chainIds.has(Number(id)))),
};
writeFileSync(new URL("../aave-markets.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`wrote aave-markets.json: ${markets.length} markets, ${markets.filter((x) => !x.rpcs.length).length} without a working RPC`);
