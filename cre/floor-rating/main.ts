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
import { encodeReport, feedSchema, planReads, verifyEntry, type Feed } from "./logic";

export const configSchema = z.object({
  schedule: z.string(),
  feedUrl: z.string().url(),
  /** chain the evidence was read on (Ethereum mainnet for the rsETH demo) */
  sourceChainSelectorName: z.string(),
  /** chain FloorRegistry lives on */
  registryChainSelectorName: z.string(),
  registryAddress: z.string(),
  gasLimit: z.string(),
  isTestnet: z.boolean(),
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

export const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.schedule }), onCron)];

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
