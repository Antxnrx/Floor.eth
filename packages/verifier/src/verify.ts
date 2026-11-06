/**
 * Browser verifier (docs/20 §Browser verification). Given an evidence bundle (from Swarm) and its expected hash
 * (from Arkiv / the CRE report), it proves three links without trusting Floor:
 *   1. raw:   every recorded read replays byte-for-byte through the provided ChainReader (Anon-RPC in the browser)
 *   2. state: every decoded value in the bundle state is exactly what the raw bytes decode to
 *   3. grade: re-running the rule pack over the state reproduces every grade in the verdict
 */
import { bundleHash, evaluate, type AssetState, type EvidenceBundle, type EvidenceCall, type OperatorMap } from "@floor/core";
import { decodeFunctionResult, getAddress, parseAbi, type Hex } from "viem";
import type { ChainReader } from "./transport.js";

export type VerifyStatus = "VERIFIED" | "MISMATCH" | "UNVERIFIED_RPC";

export interface VerifyReport {
  status: VerifyStatus;
  hash: { expected: Hex; actual: Hex; ok: boolean };
  raw: { total: number; matched: number; mismatched: string[]; failed: string[] };
  state: { ok: boolean; problems: string[] };
  grade: { ok: boolean; claimed: string; recomputed: string; routeDiffs: string[] };
}

export interface VerifyProgress {
  (stage: "hash" | "raw" | "state" | "grade", done: number, total: number): void;
}

async function replay(c: EvidenceCall, reader: ChainReader): Promise<Hex> {
  if (c.sig === "eth_getCode") return reader.getCode(c.to, c.block);
  if (c.sig.startsWith("eth_getStorageAt:")) return reader.getStorageAt(c.to, c.sig.split(":")[1] as Hex, c.block);
  return reader.call(c.to, c.data, c.block);
}

const abi = parseAbi([
  "function getUlnConfig(address,uint32) view returns ((uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs))",
  "function getReceiveLibrary(address,uint32) view returns (address lib, bool isDefault)",
  "function getSendLibrary(address,uint32) view returns (address)",
  "function isDefaultSendLibrary(address,uint32) view returns (bool)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
]);

/** Link 2: the decoded state must equal what the raw bytes decode to. */
export function checkStateAgainstRaw(state: AssetState): string[] {
  const problems: string[] = [];
  const byId = new Map(state.calls.map((c) => [c.id, c]));
  for (const r of state.routes) {
    const calls = r.evidence.map((id) => byId.get(id)).filter((c): c is EvidenceCall => !!c);
    const uln = calls.filter((c) => c.sig === "getUlnConfig")[0];
    if (!uln) { problems.push(`${r.direction}:${r.eid} has no getUlnConfig evidence`); continue; }
    const eff = decodeFunctionResult({ abi, functionName: "getUlnConfig", data: uln.result });
    const same =
      eff.confirmations.toString() === r.effective.confirmations &&
      eff.requiredDVNCount === r.effective.requiredDVNCount &&
      eff.optionalDVNThreshold === r.effective.optionalThreshold &&
      eff.requiredDVNs.map((a) => getAddress(a)).join() === r.effective.requiredDVNs.join() &&
      eff.optionalDVNs.map((a) => getAddress(a)).join() === r.effective.optionalDVNs.join();
    if (!same) problems.push(`${r.direction}:${r.eid} effective config differs from raw getUlnConfig (${uln.id})`);
    if (r.direction === "receive") {
      const lib = calls.find((c) => c.sig === "getReceiveLibrary");
      if (lib) {
        const [addr, isDefault] = decodeFunctionResult({ abi, functionName: "getReceiveLibrary", data: lib.result });
        if (isDefault !== r.libraryIsDefault || getAddress(addr) !== r.library) problems.push(`receive:${r.eid} library/pin differs from raw (${lib.id})`);
      } else problems.push(`receive:${r.eid} has no getReceiveLibrary evidence`);
    }
  }
  for (const c of state.controllers) {
    if (c.kind !== "safe" || !c.safe) continue;
    const ev = c.evidence.map((id) => byId.get(id)).filter((x): x is EvidenceCall => !!x);
    const thr = ev.find((x) => x.sig === "getThreshold");
    const owners = ev.find((x) => x.sig === "getOwners");
    if (thr && Number(decodeFunctionResult({ abi, functionName: "getThreshold", data: thr.result })) !== c.safe.threshold) problems.push(`${c.role} Safe threshold differs from raw (${thr.id})`);
    if (owners && decodeFunctionResult({ abi, functionName: "getOwners", data: owners.result }).length !== c.safe.owners) problems.push(`${c.role} Safe owner count differs from raw (${owners.id})`);
  }
  return problems;
}

export async function verifyBundle(
  bundle: EvidenceBundle,
  expectedHash: Hex,
  reader: ChainReader & { flush?: () => Promise<void> },
  operators: OperatorMap,
  onProgress?: VerifyProgress,
  /** Wait retryBackoffMs * 2^(attempt-1) before each retry round after the first (lets rate limits reset). */
  opts: { retryBackoffMs?: number } = {},
): Promise<VerifyReport> {
  const actual = bundleHash(bundle);
  const hashOk = actual.toLowerCase() === expectedHash.toLowerCase();
  onProgress?.("hash", 1, 1);

  // Link 1: raw replay
  const calls = bundle.state.calls;
  const mismatched: string[] = [];
  const failed: string[] = [];
  let matched = 0;
  let done = 0;
  const pending = calls.map((c) =>
    replay(c, reader)
      .then((got) => {
        if (!c.ok) {
          // the original read reverted; a replay that now *succeeds* is a mismatch
          mismatched.push(c.id);
        } else if (got.toLowerCase() === c.result.toLowerCase()) matched++;
        else mismatched.push(c.id);
      })
      .catch(() => {
        // a recorded revert that reverts again is a match; otherwise it's an RPC failure
        if (!c.ok) matched++;
        else failed.push(c.id);
      })
      .finally(() => onProgress?.("raw", ++done, calls.length)),
  );
  await reader.flush?.();
  await Promise.all(pending);

  // Retry failed reads (providers throttle, mixnets drop packets, Tor exits time out). Retries go in parallel through the reader's
  // own batching, which matters on slow transports (Nym: ~1-2 s per round trip); only the last attempt goes one at a time
  // for providers that cap batch sizes. A retry never upgrades a mismatch.
  const retryOne = async (id: string, sequential: boolean) => {
    const c = calls.find((x) => x.id === id)!;
    try {
      const p = replay(c, reader);
      if (sequential) await reader.flush?.();
      const got = await p;
      // same rules as the first pass: a recorded revert that now succeeds is a mismatch
      if (c.ok && got.toLowerCase() === c.result.toLowerCase()) matched++;
      else mismatched.push(id);
    } catch {
      // a recorded revert that reverts again is a match; otherwise it is still an RPC failure
      if (!c.ok) matched++;
      else failed.push(id);
    }
  };
  // 5 attempts: Tor exits time out at random (25 of ~140 requests in one run, 2026-11-06), so a read can need
  // several fresh circuits. Only failures are retried; a mismatch is final.
  const ATTEMPTS = 5;
  for (let attempt = 0; attempt < ATTEMPTS && failed.length; attempt++) {
    const again = failed.splice(0, failed.length);
    if (attempt > 0 && opts.retryBackoffMs) await new Promise((r) => setTimeout(r, opts.retryBackoffMs! * 2 ** (attempt - 1)));
    if (attempt < ATTEMPTS - 1) {
      const ps = again.map((id) => retryOne(id, false));
      await reader.flush?.();
      await Promise.all(ps);
    } else {
      for (const id of again) await retryOne(id, true);
    }
  }

  // Link 2: state consistency
  const problems = checkStateAgainstRaw(bundle.state);
  onProgress?.("state", 1, 1);

  // Link 3: grade reproduction
  const re = evaluate(bundle.state, operators);
  const routeDiffs = bundle.verdict.routes
    .filter((r) => {
      const x = re.routes.find((y) => y.eid === r.eid && y.direction === r.direction);
      return !x || x.grade !== r.grade || x.effectiveIndependent !== r.effectiveIndependent;
    })
    .map((r) => `${r.direction}:${r.eid}`);
  const gradeOk = re.grade === bundle.verdict.grade && routeDiffs.length === 0;
  onProgress?.("grade", 1, 1);

  const status: VerifyStatus =
    !hashOk || mismatched.length || problems.length || !gradeOk ? "MISMATCH" : failed.length ? "UNVERIFIED_RPC" : "VERIFIED";
  return {
    status,
    hash: { expected: expectedHash, actual, ok: hashOk },
    raw: { total: calls.length, matched, mismatched, failed },
    state: { ok: problems.length === 0, problems },
    grade: { ok: gradeOk, claimed: bundle.verdict.grade, recomputed: re.grade, routeDiffs },
  };
}
