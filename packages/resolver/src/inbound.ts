/**
 * Inbound-limit probe (docs/09-inbound-limit-test.md).
 *
 * Simulates, via eth_call at a pinned block with `from = EndpointV2`, a correctly formed OFT inbound credit
 * from the route's real configured peer. Nothing is broadcast. It answers one question:
 * "does the app layer bound inbound releases?" It does NOT claim a route is drainable: a real attack also
 * needs the verifier layer (DVNs) compromised.
 *
 * Proof ladder per route:
 *   1. small (1 SD unit) must succeed: otherwise PAUSED / TEST_ERROR (the harness itself is checked)
 *   2. full escrow must succeed: if it does and
 *   3. full+1 reverts (balance), the credit path is proven real -> NO_INBOUND_LIMIT
 *   If (2) reverts, binary-search the largest accepted amount -> INBOUND_LIMIT with the measured cap.
 */
import type { ForkTestResult } from "@floor/core";
import { decodeErrorResult, encodeAbiParameters, encodeFunctionData, encodePacked, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { ENDPOINT_V2 } from "./abis.js";
import type { Rpc } from "./rpc.js";

const oftAbi = parseAbi([
  "function token() view returns (address)",
  "function sharedDecimals() view returns (uint8)",
  "function peers(uint32) view returns (bytes32)",
  "function lzReceive((uint32 srcEid, bytes32 sender, uint64 nonce) origin, bytes32 guid, bytes message, address executor, bytes extraData) payable",
]);
const erc20Abi = parseAbi(["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"]);
const commonErrors = parseAbi([
  "error Error(string)",
  "error EnforcedPause()",
  "error OnlyEndpoint(address)",
  "error OnlyPeer(uint32,bytes32)",
  "error NoPeer(uint32)",
  "error InboundRateLimitExceeded()",
  "error RateLimitExceeded()",
  "error SlippageExceeded(uint256,uint256)",
  "error ERC20InsufficientBalance(address,uint256,uint256)",
  // balance-exhaustion variants (OZ / solady / solmate / custom), from onchain decoding 2026-11-06
  "error InsufficientFunds()",
  "error FailedInnerCall()",
  "error TransferFromFailed()",
  // message-codec mismatch (USDT0 and other custom OFTs reject the standard payload)
  "error InvalidMsgType(uint16)",
]);
/** Errors that mean "the app layer ran out of escrow", i.e. the balance was the only ceiling (NO limit). */
const BALANCE_ERRORS = new Set(["InsufficientFunds", "FailedInnerCall", "TransferFromFailed", "ERC20InsufficientBalance"]);
/** Errors that mean the standard OFT payload does not fit this adapter: probe inconclusive, needs a custom codec. */
const CODEC_ERRORS = new Set(["InvalidMsgType"]);

/** Recipient with no special behaviour (not 0x0, not a precompile, not 0xdead which some tokens block). */
const RECIPIENT = "0x000000000000000000000000000000000000F100" as Address;
/** The LayerZero EndpointV2 the probe impersonates. Same address on most chains; some chains differ (LZ metadata). */
let endpoint: Address = ENDPOINT_V2;
export function useEndpoint(a: Address) {
  endpoint = a;
}
const U64_MAX = (1n << 64n) - 1n;

export interface ProbeTarget {
  oapp: Address;
  symbol: string;
  eids: number[];
}

type CallOutcome = { ok: true } | { ok: false; data: Hex | null; reason: string };

function describeRevert(data: Hex | null): string {
  if (!data || data === "0x") return "revert (no data)";
  try {
    const e = decodeErrorResult({ abi: commonErrors, data });
    return `${e.errorName}(${(e.args ?? []).map(String).join(",")})`;
  } catch {
    return `revert ${data.slice(0, 10)}`;
  }
}
const errName = (r: string) => r.split("(")[0]!;
const looksPaused = (r: string) => /pause/i.test(r);
/** "revert (no data)" counts: older tokens (USDT, LINK) revert with no data on insufficient balance. */
const looksBalance = (r: string) =>
  BALANCE_ERRORS.has(errName(r)) || r === "revert (no data)" || /balance|exceeds|insufficient|transfer amount|SafeERC20/i.test(r);
const looksCodec = (r: string) => CODEC_ERRORS.has(errName(r));

async function simulate(rpc: Rpc, oapp: Address, eid: number, peer: Hex, amountSD: bigint, block: bigint, n: number): Promise<CallOutcome> {
  const message = encodePacked(["bytes32", "uint64"], [`0x${RECIPIENT.slice(2).padStart(64, "0")}` as Hex, amountSD]);
  const guid = keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint256" }], ["floor-probe", BigInt(n)]));
  const data = encodeFunctionData({ abi: oftAbi, functionName: "lzReceive", args: [{ srcEid: eid, sender: peer, nonce: BigInt(n) }, guid, message, "0x0000000000000000000000000000000000000000", "0x"] });
  try {
    await rpc.client.call({ account: endpoint, to: oapp, data, blockNumber: block });
    return { ok: true };
  } catch (e) {
    const err = e as { data?: Hex; cause?: { data?: Hex; cause?: { data?: Hex } }; walk?: (f: (x: unknown) => boolean) => { data?: Hex } | null };
    const raw = err.walk?.((x) => typeof (x as { data?: unknown }).data === "string")?.data ?? err.data ?? err.cause?.data ?? null;
    return { ok: false, data: (raw as Hex) ?? null, reason: describeRevert((raw as Hex) ?? null) };
  }
}

export async function probeInbound(rpcs: Rpc[], t: ProbeTarget, block: bigint): Promise<{ results: ForkTestResult[]; kind: "adapter" | "mint"; token: Address; sharedDecimals: number; tokenDecimals: number }> {
  const rpc = rpcs[0]!;
  const read = async <T>(to: Address, abi: typeof oftAbi | typeof erc20Abi, fn: string, args: unknown[] = []) =>
    (await rpc.client.readContract({ address: to, abi, functionName: fn, args, blockNumber: block } as never)) as T;

  const token = await read<Address>(t.oapp, oftAbi, "token");
  const kind = token.toLowerCase() === t.oapp.toLowerCase() ? "mint" : "adapter";
  const sd = BigInt(await read<number>(t.oapp, oftAbi, "sharedDecimals"));
  const dec = BigInt(await read<number>(token, erc20Abi, "decimals"));
  const rate = 10n ** (dec - sd);
  const escrowSD = kind === "adapter" ? (await read<bigint>(token, erc20Abi, "balanceOf", [t.oapp])) / rate : null;
  const ceiling = escrowSD === null ? U64_MAX : escrowSD > U64_MAX ? U64_MAX : escrowSD;

  const results: ForkTestResult[] = [];
  let n = 1;
  for (const eid of t.eids) {
    const base = { name: "inbound-limit" as const, eid, forkBlock: Number(block), escrowSD: escrowSD?.toString() ?? null };
    const peer = await read<Hex>(t.oapp, oftAbi, "peers", [eid]);
    if (/^0x0+$/.test(peer)) { results.push({ ...base, outcome: "TEST_ERROR", revert: "no peer", maxAcceptedSD: null, proof: "no peer configured" }); continue; }
    if (ceiling === 0n) { results.push({ ...base, outcome: "UNKNOWN", revert: null, maxAcceptedSD: null, proof: "escrow is empty: nothing to bound" }); continue; }

    const small = await simulate(rpc, t.oapp, eid, peer, 1n, block, n++);
    if (!small.ok) {
      const why = looksCodec(small.reason)
        ? `custom message codec (${small.reason}): standard OFT payload rejected, needs an adapter-specific probe`
        : `small (1 SD) reverts: ${small.reason}`;
      results.push({ ...base, outcome: looksPaused(small.reason) ? "PAUSED" : "TEST_ERROR", revert: small.reason, maxAcceptedSD: null, proof: why });
      continue;
    }
    const full = await simulate(rpc, t.oapp, eid, peer, ceiling, block, n++);
    if (full.ok) {
      if (kind === "mint") {
        results.push({ ...base, outcome: "NO_INBOUND_LIMIT", revert: null, maxAcceptedSD: ceiling.toString(), proof: "mint-class: small ok · uint64-max mint ok" });
        continue;
      }
      const over = await simulate(rpc, t.oapp, eid, peer, ceiling + 1n, block, n++);
      if (!over.ok) {
        // The decisive fact: the full escrow was released by ONE inbound message. full+1 only confirms the escrow
        // balance (not an app rule) is the ceiling. A non-balance revert at full+1 is flagged for review.
        const note = looksBalance(over.reason) ? "escrow is the only ceiling" : "REVIEW: full+1 revert is not a known balance error";
        results.push({ ...base, outcome: "NO_INBOUND_LIMIT", revert: null, maxAcceptedSD: ceiling.toString(), proof: `full escrow released in one inbound message · full+1 reverts (${over.reason}) → ${note}` });
      } else {
        results.push({ ...base, outcome: "UNKNOWN", revert: null, maxAcceptedSD: null, proof: "full+1 also succeeded: credit path does not transfer from escrow as expected" });
      }
      continue;
    }
    // Full amount reverts: find the largest accepted amount (cap) by binary search.
    let lo = 1n, hi = ceiling; // lo accepted, hi rejected
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n;
      if ((await simulate(rpc, t.oapp, eid, peer, mid, block, n++)).ok) lo = mid; else hi = mid;
    }
    const pct = Number((lo * 10000n) / ceiling) / 100;
    results.push({ ...base, outcome: "INBOUND_LIMIT", revert: full.reason, maxAcceptedSD: lo.toString(), proof: `small ok · full reverts (${full.reason}) · max accepted ${lo} SD (${pct}% of escrow)` });
  }
  return { results, kind, token, sharedDecimals: Number(sd), tokenDecimals: Number(dec) };
}

/** Cross-check: rerun the decisive outcome on another provider. */
export async function confirmOutcome(rpc: Rpc, t: ProbeTarget, r: ForkTestResult): Promise<boolean> {
  if (!r.maxAcceptedSD) return true;
  const peer = (await rpc.client.readContract({ address: t.oapp, abi: oftAbi, functionName: "peers", args: [r.eid], blockNumber: BigInt(r.forkBlock) })) as Hex;
  const ok = await simulate(rpc, t.oapp, r.eid, peer, BigInt(r.maxAcceptedSD), BigInt(r.forkBlock), 777);
  return ok.ok;
}

/**
 * Negative control, run before trusting any result: the same message sent from a NON-endpoint address must revert
 * with OnlyEndpoint, and a wrong peer must revert with OnlyPeer. If either passes, the harness is not exercising
 * the real receive path and every result is void.
 */
export async function harnessSelfCheck(rpc: Rpc, oapp: Address, eid: number, block: bigint): Promise<{ ok: boolean; detail: string }> {
  const peer = (await rpc.client.readContract({ address: oapp, abi: oftAbi, functionName: "peers", args: [eid], blockNumber: block })) as Hex;
  const message = encodePacked(["bytes32", "uint64"], [`0x${RECIPIENT.slice(2).padStart(64, "0")}` as Hex, 1n]);
  const call = (account: Address, sender: Hex) =>
    rpc.client
      .call({ account, to: oapp, blockNumber: block, data: encodeFunctionData({ abi: oftAbi, functionName: "lzReceive", args: [{ srcEid: eid, sender, nonce: 1n }, keccak256(toHex("selfcheck")), message, "0x0000000000000000000000000000000000000000", "0x"] }) })
      .then(() => "ok", (e) => describeRevert(((e as { walk?: (f: (x: unknown) => boolean) => { data?: Hex } | null }).walk?.((x) => typeof (x as { data?: unknown }).data === "string")?.data ?? null) as Hex | null));
  const notEndpoint = await call("0x000000000000000000000000000000000000bEEF", peer);
  const wrongPeer = await call(endpoint, `0x${"ab".repeat(32)}`);
  const ok = notEndpoint.startsWith("OnlyEndpoint") && (wrongPeer.startsWith("OnlyPeer") || wrongPeer.startsWith("NoPeer"));
  return { ok, detail: `non-endpoint → ${notEndpoint}; wrong peer → ${wrongPeer}` };
}

export const _test = { describeRevert, looksBalance, looksCodec, looksPaused };
