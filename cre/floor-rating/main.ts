/**
 * Floor rating workflow (Chainlink CRE, TypeScript).
 *   cron -> HTTP fetch of the Floor feed (identical consensus) -> EVM re-reads at each entry's pinned scan block
 *   -> verifyEntry (byte equality + lower-bound grade) -> signed report -> FloorRegistry.onReport
 * Simulate: cre workflow simulate floor-rating --target staging-settings   (docs/19 §1; no deploy access needed)
 */
import {
  blockNumber,
  bytesToHex,
  consensusIdenticalAggregation,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  handler,
  HTTPClient,
  logTriggerConfig,
  protoBigIntToBigint,
  type HTTPSendRequester,
  ok,
  prepareReportRequest,
  Runner,
  type Runtime,
  text,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Address, type Hex, zeroAddress } from "viem";
import { z } from "zod";
import { decodeUlnConfigSet, encodeReport, eventEntry, feedSchema, planReads, ulnConfigCall, ULN_CONFIG_SET_TOPIC, verifyEntry, type Feed } from "./logic";

export const configSchema = z.object({
  schedule: z.string(),
  // z.string().url() needs the URL class, which the CRE WASM runtime does not provide
  feedUrl: z.string().regex(/^https:\/\/[^\s]+$/, "feedUrl must be an https URL"),
  /** chain the evidence was read on (Ethereum mainnet for the rsETH demo) */
  sourceChainSelectorName: z.string(),
  /** chain FloorRegistry lives on */
  registryChainSelectorName: z.string(),
  registryAddress: z.string(),
  gasLimit: z.string(),
  isTestnet: z.boolean(),
  /** Event path: LayerZero receive library to watch on the source chain, and which adapter maps to which rated asset. */
  receiveLib: z.string(),
  watch: z.array(z.object({ oapp: z.string(), asset: z.string() })),
  ruleVersion: z.number(),
});
export type Config = z.infer<typeof configSchema>;

/** Runs on every node; identical consensus means all nodes must have fetched the same bytes. */
const fetchFeed = (send: HTTPSendRequester, config: Config): string => {
  const res = send.sendRequest({ url: config.feedUrl, method: "GET" }).result();
  if (!ok(res)) throw new Error(`feed fetch failed: HTTP ${res.statusCode}`);
  return text(res);
};

export const onCron = (runtime: Runtime<Config>) => {
  const cfg = runtime.config;
  const raw = new HTTPClient().sendRequest(runtime, fetchFeed, consensusIdenticalAggregation<string>())(cfg).result();
  const feed: Feed = feedSchema.parse(JSON.parse(raw));

  const src = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.sourceChainSelectorName, isTestnet: false });
  const dst = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.registryChainSelectorName, isTestnet: cfg.isTestnet });
  if (!src || !dst) throw new Error("unknown chain selector name");
  const srcClient = new EVMClient(src.chainSelector.selector);

  const accepted = [];
  for (const entry of planReads(feed)) {
    const observed = entry.checks.map((c) => {
      try {
        const r = srcClient
          .callContract(runtime, {
            call: encodeCallMsg({ from: zeroAddress, to: c.to as Address, data: c.data as Hex }),
            blockNumber: blockNumber(entry.scanBlock), // the exact block the scan was pinned to
          })
          .result();
        return bytesToHex(r.data) as Hex;
      } catch {
        return null;
      }
    });
    const v = verifyEntry(entry, observed);
    runtime.log(`${v.asset}: ${v.accepted ? "ACCEPT" : "REJECT"} (${v.reason})`);
    if (v.accepted) accepted.push(entry);
  }
  if (accepted.length === 0) return { written: 0 };

  const report = runtime.report(prepareReportRequest(encodeReport(accepted))).result();
  const res = new EVMClient(dst.chainSelector.selector)
    .writeReport(runtime, { receiver: cfg.registryAddress, report, gasConfig: { gasLimit: cfg.gasLimit } })
    .result();
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${res.errorMessage || res.txStatus}`);
  return { written: accepted.length };
};

/**
 * Event path: a LayerZero UlnConfigSet log on the source chain (someone changed a route's verifier config).
 * The log only says WHICH route changed; every node re-reads that route's config onchain at the log's block and
 * grades the bytes it read (same lower-bound rule as the feed path). A change that leaves one verifier is written
 * as BREACHED immediately; anything else waits for the full re-scan.
 */
export const onConfigChange = (runtime: Runtime<Config>, log: { address: Uint8Array; data: Uint8Array; blockNumber?: { absVal: Uint8Array; sign: bigint } | unknown; txHash: Uint8Array }) => {
  const cfg = runtime.config;
  const { oapp, eid } = decodeUlnConfigSet(bytesToHex(log.data) as Hex);
  const watched = cfg.watch.find((w) => w.oapp.toLowerCase() === oapp.toLowerCase());
  const tx = bytesToHex(log.txHash);
  if (!watched) {
    runtime.log(`config change for ${oapp} eid ${eid} (tx ${tx}): not a watched adapter, ignored`);
    return { written: 0 };
  }
  const block = protoBigIntToBigint(log.blockNumber as never);
  const lib = bytesToHex(log.address) as Address;
  const src = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.sourceChainSelectorName, isTestnet: false });
  const dst = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.registryChainSelectorName, isTestnet: cfg.isTestnet });
  if (!src || !dst) throw new Error("unknown chain selector name");
  const read = new EVMClient(src.chainSelector.selector)
    .callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: lib, data: ulnConfigCall(oapp, eid) }), blockNumber: blockNumber(block) })
    .result();
  const entry = eventEntry({ asset: watched.asset as Address, lib, oapp, eid, block: Number(block), read: bytesToHex(read.data) as Hex, ruleVersion: cfg.ruleVersion });
  if (!entry) {
    runtime.log(`${watched.asset}: route ${eid} changed in tx ${tx} at block ${block}; config read at that block keeps more than one verifier: no downgrade, full re-scan decides`);
    return { written: 0 };
  }
  runtime.log(`${watched.asset}: route ${eid} changed in tx ${tx} at block ${block}; config read at that block needs ONE verifier -> BREACHED`);
  const report = runtime.report(prepareReportRequest(encodeReport([entry]))).result();
  const res = new EVMClient(dst.chainSelector.selector)
    .writeReport(runtime, { receiver: cfg.registryAddress, report, gasConfig: { gasLimit: cfg.gasLimit } })
    .result();
  if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${res.errorMessage || res.txStatus}`);
  return { written: 1 };
};

export const initWorkflow = (config: Config) => {
  const src = getNetwork({ chainFamily: "evm", chainSelectorName: config.sourceChainSelectorName, isTestnet: false });
  if (!src) throw new Error("unknown source chain");
  return [
    handler(new CronCapability().trigger({ schedule: config.schedule }), onCron), // trigger index 0
    handler(
      new EVMClient(src.chainSelector.selector).logTrigger(
        logTriggerConfig({ addresses: [config.receiveLib as Hex], topics: [[ULN_CONFIG_SET_TOPIC]], confidence: "FINALIZED" }),
      ),
      onConfigChange as never,
    ), // trigger index 1
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
