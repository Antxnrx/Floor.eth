/**
 * End-to-end run of the real workflow handler (main.ts onCron) inside the CRE SDK test runtime.
 * HTTP and EVM capabilities are mocked with the SDK's own mocks; the EVM mock answers with the bytes recorded on
 * Ethereum mainnet at block 24,908,284 (cre/floor-rating/fixtures, verified live by test/logic.test.ts).
 * Run: bun test test/workflow.bun.test.ts
 */
import { describe, expect } from "bun:test";
import { EvmMock, HttpActionsMock, newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { decodeAbiParameters, type Hex } from "viem";
import feedJson from "../fixtures/feed-rseth-prehack.json";
import { onCron, type Config } from "../main";

const ETH_MAINNET = 5009297550715157269n; // ethereum-mainnet chain selector (docs/19 §2)
const SEPOLIA = 16015286601757825753n; // ethereum-testnet-sepolia chain selector

const config: Config = {
  schedule: "*/30 * * * * *",
  feedUrl: "https://example.invalid/feed.json",
  sourceChainSelectorName: "ethereum-mainnet",
  registryChainSelectorName: "ethereum-testnet-sepolia",
  registryAddress: "0x000000000000000000000000000000000000F100",
  gasLimit: "500000",
  isTestnet: true,
  receiveLib: "0xc02Ab410f0734EFa3F14628780e6e695156024C2",
  watch: [{ oapp: "0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3", asset: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" }],
  ruleVersion: 100,
};

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const hexToBytes = (h: string) => Uint8Array.from(Buffer.from(h.slice(2), "hex"));
const toHex = (u: Uint8Array | string) => (typeof u === "string" ? `0x${Buffer.from(u, "base64").toString("hex")}` : `0x${Buffer.from(u).toString("hex")}`) as Hex;

function setup(feed: unknown, tamper = false) {
  const http = HttpActionsMock.testInstance();
  http.sendRequest = () => ({ statusCode: 200, body: b64(new TextEncoder().encode(JSON.stringify(feed))) });

  const recorded = new Map((feedJson as { entries: { checks: { data: string; result: string }[] }[] }).entries[0]!.checks.map((c) => [c.data.toLowerCase(), c.result]));
  const src = EvmMock.testInstance(ETH_MAINNET);
  const seenBlocks: string[] = [];
  src.callContract = (req) => {
    const data = toHex(req.call!.data as Uint8Array).toLowerCase();
    // absVal bytes of the requested block number; 24,908,284 = 0x017c11fc
    seenBlocks.push(Buffer.from(Object.values((req.blockNumber as unknown as { absVal: Record<string, number> }).absVal)).toString("hex"));
    let out = recorded.get(data)!;
    if (tamper) out = out.slice(0, -2) + (out.endsWith("00") ? "01" : "00");
    return { data: b64(hexToBytes(out)) };
  };

  const dst = EvmMock.testInstance(SEPOLIA);
  const writes: Hex[] = [];
  dst.writeReport = (req) => {
    writes.push(toHex(req.report!.rawReport as Uint8Array));
    return { txStatus: "TX_STATUS_SUCCESS" as never, txHash: b64(new Uint8Array(32)) };
  };
  return { writes, seenBlocks };
}

describe("floor-rating workflow (CRE SDK test runtime)", () => {
  test("verifies the rsETH pre-hack evidence and writes a BREACHED report", () => {
    const { writes, seenBlocks } = setup(feedJson);
    const runtime = newTestRuntime<Config>(null, undefined, config);
    const res = onCron(runtime as never);
    if (res.written !== 1) console.log("LOGS", JSON.stringify((runtime as unknown as { getLogs(): string[] }).getLogs()));
    expect(res.written).toBe(1);
    expect(writes.length).toBe(1);
    expect(seenBlocks.length).toBe(4);
    // every read was pinned to the exact scan block 24,908,284, never "latest"/"finalized"
    for (const b of seenBlocks) expect(b).toBe((24908284).toString(16).padStart(8, "0"));
    // the written report decodes to the expected FloorTypes.Update
    const [u] = decodeAbiParameters(
      [{ type: "tuple[]", components: [{ name: "asset", type: "address" }, { name: "grade", type: "uint8" }, { name: "scanBlock", type: "uint64" }, { name: "ruleVersion", type: "uint32" }, { name: "bundleHash", type: "bytes32" }] }],
      ("0x" + writes[0]!.slice(2 + 109 * 2)) as Hex, // skip the 109-byte report metadata header (REPORT_METADATA_HEADER_LENGTH)
    );
    expect(u[0]!.asset).toBe("0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7");
    expect(u[0]!.grade).toBe(3);
    expect(u[0]!.scanBlock).toBe(24908284n);
  });

  test("tampered chain response => entry rejected => nothing written", () => {
    const { writes } = setup(feedJson, true);
    const runtime = newTestRuntime<Config>(null, undefined, config);
    expect(onCron(runtime as never).written).toBe(0);
    expect(writes.length).toBe(0);
  });

  test("feed that claims OK for rsETH is rejected by the lower-bound rule", () => {
    const lying = JSON.parse(JSON.stringify(feedJson));
    lying.entries[0].grade = "OK";
    const { writes } = setup(lying);
    const runtime = newTestRuntime<Config>(null, undefined, config);
    expect(onCron(runtime as never).written).toBe(0);
    expect(writes.length).toBe(0);
  });
});

