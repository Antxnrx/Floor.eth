/**
 * Floor verify lab: the browser verifier wired to EF Anon-RPC (docs/19 §5).
 * Integration reference for apps/web: copy `makeTransport` and the verifyBundle call.
 *
 * Traffic accounting is honest: the one bootstrap read of the specifier contract goes direct (the harness needs
 * the chain before the anonymised fetch exists), and it is counted and shown as such.
 */
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { EvidenceBundle } from "@floor/core";
import { operatorMap } from "@floor/resolver/operators";
import { fromAnonRpc, jsonRpcReader, TrafficMeter, verifyBundle, type FetchFn, type VerifyReport } from "@floor/verifier";
import type { Hex } from "viem";
import fixture from "../../../packages/resolver/fixtures/rseth-24908284.json";

type Net = "tor-js" | "nym" | "passthrough" | "direct";

/** Specifier contracts on Ethereum mainnet, from github.com/ethereum/anon-rpc adopters.json5 (read 2026-11-06). */
const NETWORKS: Record<Exclude<Net, "direct">, { address: string; config?: unknown; anonymising: boolean }> = {
  "tor-js": {
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    // demonstration gateway published by the anon-rpc repo; limited capacity
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
    anonymising: true,
  },
  nym: { address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", anonymising: true },
  passthrough: { address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", anonymising: false },
};

const DEFAULTS = {
  // Archive + batch-capable free providers that accept Anon-RPC traffic (measured 2026-11-06 in Chrome):
  // blastapi and MEV Blocker answer through Nym. Nodies (HTTP 415, strict Content-Type) and 1rpc (content-type error)
  // reject requests arriving through the Nym exit; Nodies also blocks the sandbox's null origin (CORS).
  rpc: "https://eth-mainnet.public.blastapi.io, https://rpc.mevblocker.io",
  boot: "https://ethereum-rpc.publicnode.com",
  hash: "0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $<HTMLPreElement>("log");
const log = (s: string) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
  console.log("[floor-lab]", s);
};

const directFetch: FetchFn = (url, init) => fetch(url, init);

/** Per-request diagnostics: latency, HTTP status, JSON-RPC errors inside batches. */
const stats = { requests: 0, ms: [] as number[], http: {} as Record<string, number>, rpcErrors: {} as Record<string, number>, thrown: {} as Record<string, number> };
function instrument(f: FetchFn): FetchFn {
  return async (url, init) => {
    const t = performance.now();
    stats.requests++;
    try {
      const res = await f(url, init);
      stats.ms.push(performance.now() - t);
      const host = new URL(url).host;
      stats.http[`${host} ${res.status}`] = (stats.http[`${host} ${res.status}`] ?? 0) + 1;
      const text = await (res as unknown as { text(): Promise<string> }).text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { stats.rpcErrors[`${host}: ${text.slice(0, 120)}`] = (stats.rpcErrors[`${host}: ${text.slice(0, 120)}`] ?? 0) + 1; throw new Error(`HTTP ${res.status} non-JSON from ${host}`); }
      for (const r of Array.isArray(body) ? body : [body]) {
        const m = (r as { error?: { message?: string } }).error?.message;
        if (m) stats.rpcErrors[m.slice(0, 60)] = (stats.rpcErrors[m.slice(0, 60)] ?? 0) + 1;
      }
      return { ok: res.ok, status: res.status, json: async () => body };
    } catch (e) {
      const k = String((e as Error).message ?? e).slice(0, 80);
      stats.thrown[k] = (stats.thrown[k] ?? 0) + 1;
      throw e;
    }
  };
}
function statsLine() {
  const s = [...stats.ms].sort((a, b) => a - b);
  const p = (q: number) => (s.length ? (s[Math.min(s.length - 1, Math.floor(q * s.length))]! / 1000).toFixed(1) : "-");
  return `requests=${stats.requests} p50=${p(0.5)}s p90=${p(0.9)}s http=${JSON.stringify(stats.http)} rpcErrors=${JSON.stringify(stats.rpcErrors)} thrown=${JSON.stringify(stats.thrown)}`;
}

/** EIP-1193-style provider for the harness's one bootstrap read, counted on the meter as direct traffic. */
function bootstrapProvider(meter: TrafficMeter, url: string) {
  const f = meter.wrap("bootstrap (direct, by design)", directFetch);
  let id = 1;
  return {
    async request({ method, params }: { method: string; params?: unknown }) {
      const res = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params ?? [] }) });
      const j = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      return j.result;
    },
  };
}

async function makeTransport(net: Net, meter: TrafficMeter, bootUrl: string): Promise<{ fetchFn: FetchFn; label: string; close(): void }> {
  if (net === "direct") return { fetchFn: meter.wrap("direct", instrument(directFetch)), label: "direct", close() {} };
  const spec = NETWORKS[net];
  const worker = new AnonRpcWorker({ address: spec.address, config: spec.config as never, preExisting: { rpcProvider: bootstrapProvider(meter, bootUrl) } });
  const t0 = performance.now();
  await worker.ready;
  log(`${net} worker ready in ${((performance.now() - t0) / 1000).toFixed(1)} s (bundle hash-pinned by specifier ${spec.address})`);
  const label = spec.anonymising ? `anon-rpc:${net}` : `anon-rpc:${net} (NOT anonymising)`;
  return { fetchFn: meter.wrap(label, instrument(fromAnonRpc(worker as never))), label, close: () => worker.close() };
}

function renderMeter(meter: TrafficMeter, label: string) {
  const s = meter.snapshot;
  const parts = Object.entries(s.byRoute).map(([k, v]) => `${k}: ${v}`);
  $("meter").textContent = `Chain reads: ${s.total} · ${parts.join(" · ")} · share via ${label}: ${(s.share(label) * 100).toFixed(1)}%`;
}

async function run() {
  const btn = $<HTMLButtonElement>("go");
  btn.disabled = true;
  $("status").textContent = "";
  $("status").className = "status";
  logEl.textContent = "";
  Object.assign(stats, { requests: 0, ms: [], http: {}, rpcErrors: {}, thrown: {} });
  const net = (document.querySelector("input[name=net]:checked") as HTMLInputElement).value as Net;
  const rpc = $<HTMLInputElement>("rpc").value.split(",").map((x) => x.trim()).filter(Boolean);
  const boot = $<HTMLInputElement>("boot").value.trim();
  const expected = $<HTMLInputElement>("hash").value.trim() as Hex;
  const bundle = JSON.parse(JSON.stringify(fixture)) as EvidenceBundle;
  if ($<HTMLInputElement>("tamper").checked) {
    const c = bundle.state.calls.find((x) => x.ok && x.result.length > 4)!;
    const last = c.result.slice(-1);
    c.result = (c.result.slice(0, -1) + (last === "0" ? "1" : "0")) as Hex;
    log(`tampered: flipped the last nibble of read ${c.id}`);
  }
  const meter = new TrafficMeter();
  let transport: Awaited<ReturnType<typeof makeTransport>> | undefined;
  const t0 = performance.now();
  try {
    $("phase").textContent = `starting ${net}…`;
    transport = await makeTransport(net, meter, boot);
    const qs = new URLSearchParams(location.search);
    // measured over Nym 2026-11-06: batch 10 x 6 parallel ~70 s; batch 50 x 2 was 100 s to 6+ min
    const batch = Number(qs.get("batch") ?? 10), concurrency = Number(qs.get("conc") ?? 6);
    const reader = jsonRpcReader(transport.fetchFn, rpc, { batch, concurrency, timeoutMs: Number(qs.get("timeout") ?? 20_000) });
    log(`batch=${batch} concurrency=${concurrency}`);
    log(`replaying ${bundle.state.calls.length} recorded reads at block ${bundle.state.calls[0]?.block} via ${transport.label}`);
    const tick = setInterval(() => renderMeter(meter, transport!.label), 500);
    const report: VerifyReport = await verifyBundle(bundle, expected, reader, operatorMap("ethereum"), (stage, done, total) => {
      $("phase").textContent = `${stage}: ${done}/${total}`;
      if (stage === "raw" && done === total) log(`first pass done at ${((performance.now() - t0) / 1000).toFixed(1)} s · ${statsLine()}`);
    });
    log(`final · ${statsLine()}`);
    clearInterval(tick);
    renderMeter(meter, transport.label);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $("status").textContent = `${report.status} in ${secs} s`;
    $("status").className = `status ${report.status}`;
    log(`hash ok=${report.hash.ok} · raw ${report.raw.matched}/${report.raw.total} matched, ${report.raw.mismatched.length} mismatched, ${report.raw.failed.length} failed · state ok=${report.state.ok} · grade claimed=${report.grade.claimed} recomputed=${report.grade.recomputed}`);
    if (report.raw.mismatched.length) log(`mismatched: ${report.raw.mismatched.slice(0, 5).join(", ")}`);
    if (report.raw.failed.length) log(`failed: ${report.raw.failed.slice(0, 5).join(", ")}`);
    (window as unknown as { __floorLab: unknown }).__floorLab = { net, secs, report, meter: meter.snapshot.byRoute, stats: statsLine() };
  } catch (e) {
    $("status").textContent = `ERROR: ${(e as Error).message}`;
    $("status").className = "status MISMATCH";
    log(`error: ${(e as Error).stack ?? e}`);
    (window as unknown as { __floorLab: unknown }).__floorLab = { net, error: String(e) };
  } finally {
    $("phase").textContent = "";
    transport?.close();
    btn.disabled = false;
  }
}

$<HTMLInputElement>("rpc").value = DEFAULTS.rpc;
$<HTMLInputElement>("boot").value = DEFAULTS.boot;
$<HTMLInputElement>("hash").value = DEFAULTS.hash;
const q = new URLSearchParams(location.search).get("net");
if (q) (document.querySelector(`input[name=net][value="${q}"]`) as HTMLInputElement | null)?.click();
const qrpc = new URLSearchParams(location.search).get("rpc");
if (qrpc) $<HTMLInputElement>("rpc").value = qrpc;
if (new URLSearchParams(location.search).has("tamper")) $<HTMLInputElement>("tamper").checked = true;
$("go").addEventListener("click", () => void run());
if (new URLSearchParams(location.search).has("auto")) void run();
