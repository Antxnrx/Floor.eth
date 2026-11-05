import { describe, expect, it } from "vitest";
import { encodeErrorResult, parseAbi } from "viem";
import { _test, harnessSelfCheck, probeInbound } from "../src/inbound.js";
import { makeRpcs } from "../src/rpc.js";

const { describeRevert, looksBalance, looksCodec, looksPaused } = _test;
const enc = (sig: string, args: unknown[] = []) => {
  const abi = parseAbi([`error ${sig}`] as unknown as readonly ["error X()"]);
  return encodeErrorResult({ abi, errorName: (abi[0] as { name: string }).name, args } as never);
};

describe("revert classification (offline)", () => {
  it("decodes the selectors seen onchain", () => {
    expect(describeRevert(enc("InsufficientFunds()"))).toBe("InsufficientFunds()");
    expect(describeRevert(enc("FailedInnerCall()"))).toBe("FailedInnerCall()");
    expect(describeRevert(enc("InvalidMsgType(uint16)", [1]))).toBe("InvalidMsgType(1)");
    expect(describeRevert(enc("InboundRateLimitExceeded()"))).toBe("InboundRateLimitExceeded()");
    expect(describeRevert("0x")).toBe("revert (no data)");
    expect(describeRevert("0xdeadbeef")).toBe("revert 0xdeadbeef");
  });
  it("balance-exhaustion errors are recognised (they mean NO app limit)", () => {
    for (const r of ["InsufficientFunds()", "FailedInnerCall()", "TransferFromFailed()", "revert (no data)", "Error(ERC20: transfer amount exceeds balance)"]) expect(looksBalance(r)).toBe(true);
  });
  it("a rate-limit revert is NOT mistaken for a balance error", () => {
    expect(looksBalance("InboundRateLimitExceeded()")).toBe(false);
    expect(looksBalance("RateLimitExceeded()")).toBe(false);
  });
  it("codec mismatch and pause are recognised", () => {
    expect(looksCodec("InvalidMsgType(1)")).toBe(true);
    expect(looksCodec("InsufficientFunds()")).toBe(false);
    expect(looksPaused("EnforcedPause()")).toBe(true);
    expect(looksPaused("Error(Pausable: paused)")).toBe(true);
  });
});

/** Calibration against known adapters at a pinned block. Simulation only (eth_call), nothing broadcast. */
describe.runIf(process.env.FLOOR_LIVE)("inbound probe calibration (live, block 26,351,514)", () => {
  const rpcs = makeRpcs((process.env.ETH_RPC_URLS ?? "https://eth.drpc.org,https://eth-mainnet.public.blastapi.io").split(","));
  const B = 26351514n;

  it("harness self-check: non-endpoint and wrong-peer calls are rejected", async () => {
    const r = await harnessSelfCheck(rpcs[0]!, "0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3", 30110, B);
    expect(r.ok, r.detail).toBe(true);
  }, 60_000);

  it("rsETH adapter: NO_INBOUND_LIMIT, full escrow released in one message", async () => {
    const { results, kind } = await probeInbound(rpcs, { oapp: "0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3", symbol: "rsETH", eids: [30110] }, B);
    expect(kind).toBe("adapter");
    expect(results[0]!.outcome).toBe("NO_INBOUND_LIMIT");
    expect(results[0]!.maxAcceptedSD).toBe(results[0]!.escrowSD);
  }, 120_000);

  it("EtherFi weETH adapter: INBOUND_LIMIT with a measured cap far below escrow", async () => {
    const { results } = await probeInbound(rpcs, { oapp: "0xcd2eb13D6831d4602D80E5db9230A57596CDCA63", symbol: "weETH", eids: [30111] }, B);
    const r = results[0]!;
    expect(r.outcome).toBe("INBOUND_LIMIT");
    expect(r.revert).toBe("InboundRateLimitExceeded()");
    expect(BigInt(r.maxAcceptedSD!)).toBeLessThan(BigInt(r.escrowSD!));
    // the measured cap must itself be accepted and cap+1 rejected (binary search is exact)
    expect(r.maxAcceptedSD).toBe("3000000000"); // 3,000 weETH at 6 shared decimals, block 26,351,514
  }, 180_000);

  it("USDT0 adapter with custom codec is reported as inconclusive, never as a pass or fail", async () => {
    const { results } = await probeInbound(rpcs, { oapp: "0x1F748c76dE468e9D11bd340fA9D5CBADf315dFB0", symbol: "USDT", eids: [30110] }, B);
    expect(results[0]!.outcome).toBe("TEST_ERROR");
    expect(results[0]!.proof).toMatch(/custom message codec/);
  }, 60_000);
});
