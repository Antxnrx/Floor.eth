#!/usr/bin/env tsx
/**
 * Config-change watch (the "event" layer of the live dashboard). For every chain with an Aave V3 market, read the
 * LayerZero logs since the last run and keep the ones that touch a LayerZero deployment of an Aave-listed token
 * (adapter on its home chain, or OFT minted on that chain):
 *   ReceiveUln302  UlnConfigSet(oapp, eid, config)      verifier set / confirmations changed
 *   EndpointV2     ReceiveLibrarySet(receiver, eid, lib) receive library changed (pinning)
 *   EndpointV2     DelegateSet(oapp, delegate)           who can change the config
 * State (last block per chain) and events are written to docs/evidence/watch/, committed by the scheduler, and shown
 * on the Live market tab. Read-only: no key needed.
 *
 *   pnpm --filter @floor/resolver exec tsx src/watch-cli.ts [--lookback 200]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import markets from "@floor/deployments/aave-markets.json" with { type: "json" };
import { createPublicClient, decodeEventLog, fallback, http, parseAbi, type Address } from "viem";

const ROOT = resolve(new URL("../../../", import.meta.url).pathname);
const DIR = resolve(ROOT, "docs/evidence/watch");
const STATE = resolve(DIR, "state.json");
const EVENTS = resolve(DIR, "events.json");
const lookback = Number(process.argv[process.argv.indexOf("--lookback") + 1] || 200);
/** --range <chainId>:<from>:<to> scans only that window and writes nothing (tests, backfills). */
const rangeArg = process.argv.includes("--range") ? process.argv[process.argv.indexOf("--range") + 1]!.split(":").map(Number) : null;
const CHUNK = 500n; // several free RPCs cap eth_getLogs ranges

const abi = parseAbi([
  "event UlnConfigSet(address oapp, uint32 eid, (uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs) config)",
  "event ReceiveLibrarySet(address receiver, uint32 eid, address newLib)",
  "event DelegateSet(address sender, address delegate)",
]);

type Lz = { chainKey: string; eid: number; endpoint: string; receiveUln302: string | null; logRpcs?: string[] };
type Tok = { kind: string; oapp: string; symbol: string };
const LZ = markets.layerzero as Record<string, Lz>;
const BRIDGED = markets.bridged as unknown as Record<string, Record<string, Tok>>;
/** fallback when no log-capable RPC was found */
const rpcsFor = (chainId: number) => markets.markets.find((m) => m.chainId === chainId)?.rpcs ?? [];

const state: { updatedAt?: string; chains: Record<string, { block: number; checkedAt: string; error?: string }> } = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { chains: {} };
const events: Record<string, unknown>[] = existsSync(EVENTS) ? JSON.parse(readFileSync(EVENTS, "utf8")) : [];
const seen = new Set(events.map((e) => `${e.chainId}:${e.tx}:${e.logIndex}`));
let found = 0;

await Promise.all(
  Object.entries(LZ).map(async ([cid, lz]) => {
    const chainId = Number(cid);
    if (rangeArg && rangeArg[0] !== chainId) return;
    const tokens = Object.values(BRIDGED[cid] ?? {});
    const byOapp = new Map(tokens.map((t) => [t.oapp.toLowerCase(), t]));
    const rpcs = lz.logRpcs?.length ? lz.logRpcs : rpcsFor(chainId);
    if (!byOapp.size || !rpcs.length) return;
    const client = createPublicClient({ transport: fallback(rpcs.map((u) => http(u, { timeout: 20_000, retryCount: 1 }))) });
    try {
      const latest = rangeArg ? BigInt(rangeArg[2]!) : await client.getBlockNumber();
      const prev = state.chains[cid]?.block;
      let from = rangeArg ? BigInt(rangeArg[1]!) : prev ? BigInt(prev) + 1n : latest - BigInt(lookback);
      const addresses = [lz.endpoint, lz.receiveUln302].filter(Boolean) as Address[];
      while (from <= latest) {
        const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
        const logs = await client.getLogs({ address: addresses, events: abi, fromBlock: from, toBlock: to });
        for (const log of logs) {
          const d = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: Record<string, unknown> };
          const oapp = String(d.args.oapp ?? d.args.receiver ?? d.args.sender).toLowerCase();
          const t = byOapp.get(oapp);
          if (!t) continue;
          const key = `${chainId}:${log.transactionHash}:${log.logIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const cfg = d.args.config as { requiredDVNCount: number; optionalDVNThreshold: number } | undefined;
          events.push({
            chainId, chain: lz.chainKey, block: Number(log.blockNumber), tx: log.transactionHash, logIndex: log.logIndex,
            event: d.eventName, symbol: t.symbol, kind: t.kind, oapp,
            eid: d.args.eid !== undefined ? Number(d.args.eid) : undefined,
            requiredDVNs: cfg?.requiredDVNCount, optionalThreshold: cfg?.optionalDVNThreshold,
            singleVerifier: cfg ? (cfg.requiredDVNCount === 255 ? 0 : cfg.requiredDVNCount) + (cfg.optionalDVNThreshold === 255 ? 0 : cfg.optionalDVNThreshold) <= 1 : undefined,
            newLib: d.args.newLib, delegate: d.args.delegate,
          });
          found++;
        }
        from = to + 1n;
      }
      state.chains[cid] = { block: Number(latest), checkedAt: new Date().toISOString() };
    } catch (e) {
      state.chains[cid] = { ...(state.chains[cid] ?? { block: 0 }), checkedAt: new Date().toISOString(), error: (e as Error).message.split("\n")[0]!.slice(0, 140) };
    }
  }),
);

if (rangeArg) {
  console.log(JSON.stringify(events.filter((e) => e.chainId === rangeArg[0] && Number(e.block) >= rangeArg[1]! && Number(e.block) <= rangeArg[2]!), null, 1));
  process.exit(0);
}
state.updatedAt = new Date().toISOString();
mkdirSync(DIR, { recursive: true });
writeFileSync(STATE, JSON.stringify(state, null, 1) + "\n");
writeFileSync(EVENTS, JSON.stringify(events.sort((a, b) => Number(b.block) - Number(a.block)).slice(0, 500), null, 1) + "\n");
const failed = Object.entries(state.chains).filter(([, s]) => s.error);
console.log(`watch: ${Object.keys(state.chains).length} chains checked, ${found} new config events on tracked bridges, ${failed.length} chain errors`);
for (const [c, s] of failed) console.log(`  chain ${c}: ${s.error}`);
