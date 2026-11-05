import type { AssetState, ControllerState, EvidenceCall, RouteState, UlnConfig } from "@floor/core";
import { decodeFunctionResult, encodeFunctionData, getAddress, zeroAddress, type Abi, type Address, type Hex } from "viem";
import { ENDPOINT_V2, SAFE_GUARD_SLOT, SAFE_SENTINEL, endpointAbi, oappAbi, safeAbi, timelockAbi, ulnAbi } from "./abis.js";
import { batch, type Rpc } from "./rpc.js";

export interface ScanOptions {
  rpcs: Rpc[];
  oapp: Address;
  symbol: string;
  block: bigint;
  /** LayerZero mainnet endpoint ids to probe for peers. */
  eids?: number[];
}

const ZERO32 = `0x${"0".repeat(64)}` as Hex;
const DEFAULT_EIDS = Array.from({ length: 30500 - 30100 }, (_, i) => 30100 + i);

/** Collects every read as evidence, then decodes. One instance per scan. */
class Recorder {
  calls: EvidenceCall[] = [];
  agreement = true;
  providers = new Set<string>();
  constructor(private rpcs: Rpc[], private block: bigint) {}

  async run<T extends { abi: Abi; fn: string; to: Address; args: readonly unknown[] }>(reqs: T[]) {
    const raw = reqs.map((r) => ({
      to: r.to,
      sig: r.fn,
      data: encodeFunctionData({ abi: r.abi, functionName: r.fn, args: r.args } as never),
    }));
    const { results, agreement, checked } = await batch(this.rpcs, raw, this.block);
    if (!agreement) this.agreement = false;
    checked.forEach((c) => this.providers.add(c));
    return results.map((res, i) => {
      const id = `c${this.calls.length + 1}`;
      this.calls.push({ id, to: raw[i]!.to, sig: raw[i]!.sig, data: raw[i]!.data, block: Number(this.block), result: res.result, ok: res.ok });
      let value: unknown = undefined;
      if (res.ok && res.result !== "0x") {
        try {
          value = decodeFunctionResult({ abi: reqs[i]!.abi, functionName: reqs[i]!.fn, data: res.result } as never);
        } catch {
          value = undefined;
        }
      }
      return { id, ok: res.ok && value !== undefined, value };
    });
  }

  /** Non-eth_call reads (code, storage) are recorded with a pseudo-signature the verifier understands. */
  async raw(kind: "eth_getCode" | "eth_getStorageAt", to: Address, slot?: Hex) {
    const c = this.rpcs[0]!.client;
    const result: Hex =
      kind === "eth_getCode"
        ? ((await c.getCode({ address: to, blockNumber: this.block })) ?? "0x")
        : ((await c.getStorageAt({ address: to, slot: slot!, blockNumber: this.block })) ?? ZERO32);
    const id = `c${this.calls.length + 1}`;
    this.calls.push({ id, to, sig: slot ? `${kind}:${slot}` : kind, data: "0x", block: Number(this.block), result, ok: true });
    return { id, result };
  }
}

type UlnTuple = { confirmations: bigint; requiredDVNCount: number; optionalDVNCount: number; optionalDVNThreshold: number; requiredDVNs: readonly Address[]; optionalDVNs: readonly Address[] };
const toUln = (t: UlnTuple): UlnConfig => ({
  confirmations: t.confirmations.toString(),
  requiredDVNCount: t.requiredDVNCount,
  optionalDVNCount: t.optionalDVNCount,
  optionalThreshold: t.optionalDVNThreshold,
  requiredDVNs: t.requiredDVNs.map((a) => getAddress(a)),
  optionalDVNs: t.optionalDVNs.map((a) => getAddress(a)),
});

async function classify(rec: Recorder, role: "owner" | "delegate", address: Address, evidence: string[]): Promise<ControllerState> {
  if (address === zeroAddress) return { role, address, kind: "none", evidence };
  const code = await rec.raw("eth_getCode", address);
  if (code.result === "0x") return { role, address, kind: "eoa", evidence: [...evidence, code.id] };
  const [thr, owners, mods, ver, delay] = await rec.run([
    { abi: safeAbi, fn: "getThreshold", to: address, args: [] },
    { abi: safeAbi, fn: "getOwners", to: address, args: [] },
    { abi: safeAbi, fn: "getModulesPaginated", to: address, args: [SAFE_SENTINEL, 100n] },
    { abi: safeAbi, fn: "VERSION", to: address, args: [] },
    { abi: timelockAbi, fn: "getMinDelay", to: address, args: [] },
  ]);
  const ev = [...evidence, code.id, thr!.id, owners!.id, mods!.id, ver!.id, delay!.id];
  if (thr!.ok && owners!.ok) {
    const guard = await rec.raw("eth_getStorageAt", address, SAFE_GUARD_SLOT);
    const g = `0x${guard.result.slice(-40)}` as Address;
    return {
      role, address, kind: "safe", evidence: [...ev, guard.id],
      safe: {
        threshold: Number(thr!.value as bigint),
        owners: (owners!.value as readonly Address[]).length,
        modules: mods!.ok ? (mods!.value as readonly [readonly Address[], Address])[0].length : 0,
        guard: g === zeroAddress ? null : getAddress(g),
        version: ver!.ok ? (ver!.value as string) : null,
      },
    };
  }
  if (delay!.ok) return { role, address, kind: "timelock", evidence: ev, timelock: { minDelaySeconds: (delay!.value as bigint).toString() } };
  return { role, address, kind: "contract", evidence: ev };
}

export async function scanOApp(o: ScanOptions): Promise<AssetState> {
  const rec = new Recorder(o.rpcs, o.block);
  const blk = await o.rpcs[0]!.client.getBlock({ blockNumber: o.block });
  const eids = o.eids ?? DEFAULT_EIDS;

  // 1. Peers
  const peerRes = await rec.run(eids.map((eid) => ({ abi: oappAbi, fn: "peers", to: o.oapp, args: [eid] })));
  const peers = eids
    .map((eid, i) => ({ eid, id: peerRes[i]!.id, peer: peerRes[i]!.ok ? (peerRes[i]!.value as Hex) : ZERO32 }))
    .filter((p) => p.peer !== ZERO32);

  // 2. Libraries per peer
  const libReqs = peers.flatMap((p) => [
    { abi: endpointAbi, fn: "getReceiveLibrary", to: ENDPOINT_V2, args: [o.oapp, p.eid] },
    { abi: endpointAbi, fn: "receiveLibraryTimeout", to: ENDPOINT_V2, args: [o.oapp, p.eid] },
    { abi: endpointAbi, fn: "getSendLibrary", to: ENDPOINT_V2, args: [o.oapp, p.eid] },
    { abi: endpointAbi, fn: "isDefaultSendLibrary", to: ENDPOINT_V2, args: [o.oapp, p.eid] },
  ]);
  const lib = await rec.run(libReqs as never);

  // 3. ULN configs (effective + app) on the library actually in use
  const cfgReqs = peers.flatMap((p, i) => {
    const recvLib = lib[i * 4]!.ok ? (lib[i * 4]!.value as readonly [Address, boolean])[0] : ENDPOINT_V2;
    const sendLib = lib[i * 4 + 2]!.ok ? (lib[i * 4 + 2]!.value as Address) : ENDPOINT_V2;
    return [
      { abi: ulnAbi, fn: "getUlnConfig", to: recvLib, args: [o.oapp, p.eid] },
      { abi: ulnAbi, fn: "getAppUlnConfig", to: recvLib, args: [o.oapp, p.eid] },
      { abi: ulnAbi, fn: "getUlnConfig", to: sendLib, args: [o.oapp, p.eid] },
      { abi: ulnAbi, fn: "getAppUlnConfig", to: sendLib, args: [o.oapp, p.eid] },
    ];
  });
  const cfg = await rec.run(cfgReqs as never);

  const routes: RouteState[] = [];
  const unresolved: string[] = [];
  peers.forEach((p, i) => {
    const [rl, rt, sl, sd] = [lib[i * 4]!, lib[i * 4 + 1]!, lib[i * 4 + 2]!, lib[i * 4 + 3]!];
    const [re, ra, se, sa] = [cfg[i * 4]!, cfg[i * 4 + 1]!, cfg[i * 4 + 2]!, cfg[i * 4 + 3]!];
    if (rl.ok && re.ok) {
      const [library, isDefault] = rl.value as readonly [Address, boolean];
      const t = rt.ok ? (rt.value as readonly [Address, bigint]) : null;
      routes.push({
        eid: p.eid, direction: "receive", peer: p.peer, library: getAddress(library), libraryIsDefault: isDefault,
        timeout: t && t[0] !== zeroAddress ? { library: getAddress(t[0]), expiry: t[1].toString() } : null,
        effective: toUln(re.value as UlnTuple), app: ra.ok ? toUln(ra.value as UlnTuple) : null,
        evidence: [p.id, rl.id, rt.id, re.id, ra.id],
      });
    } else unresolved.push(`receive:${p.eid}`);
    if (sl.ok && se.ok) {
      routes.push({
        eid: p.eid, direction: "send", peer: p.peer, library: getAddress(sl.value as Address), libraryIsDefault: sd.ok ? (sd.value as boolean) : false,
        timeout: null, effective: toUln(se.value as UlnTuple), app: sa.ok ? toUln(sa.value as UlnTuple) : null,
        evidence: [p.id, sl.id, sd.id, se.id, sa.id],
      });
    } else unresolved.push(`send:${p.eid}`);
  });
  if (unresolved.length) console.warn(`[scan] unresolved routes (non-ULN library or failed read): ${unresolved.join(", ")}`);

  // 4. Controllers
  const [own, del] = await rec.run([
    { abi: oappAbi, fn: "owner", to: o.oapp, args: [] },
    { abi: endpointAbi, fn: "delegates", to: ENDPOINT_V2, args: [o.oapp] },
  ]);
  const controllers: ControllerState[] = [];
  controllers.push(await classify(rec, "owner", own!.ok ? getAddress(own!.value as Address) : zeroAddress, [own!.id]));
  controllers.push(await classify(rec, "delegate", del!.ok ? getAddress(del!.value as Address) : zeroAddress, [del!.id]));

  return {
    asset: { symbol: o.symbol, chainId: 1, oapp: getAddress(o.oapp), token: null },
    scan: {
      chainId: 1, block: Number(o.block), blockHash: blk.hash!, timestamp: Number(blk.timestamp),
      rpcProviders: [...rec.providers],
      // Agreement is only meaningful if at least two independent providers answered every batch.
      rpcAgreement: rec.agreement && rec.providers.size >= 2,
    },
    routes,
    controllers,
    forkTests: [],
    calls: rec.calls,
    ...(unresolved.length ? { unresolved } : {}),
  } as AssetState;
}
