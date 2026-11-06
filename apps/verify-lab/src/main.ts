/**
 * Floor verify lab: the browser verifier wired to EF Anon-RPC (docs/19 §5).
 * Integration reference for apps/web: copy `makeTransport` and the verifyBundle call.
 *
 * Traffic accounting is honest: the one bootstrap read of the specifier contract goes direct (the harness needs
 * the chain before the anonymised fetch exists), and it is counted and shown as such.
 */
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { EvidenceBundle } from "@floor/core";
import { arkivReader, EvidenceHashMismatch, fetchBundle, findRating, RABDI_PUBLIC_RPC, SWARM_PUBLIC_GATEWAY } from "@floor/publish/browser";
import { operatorMap } from "@floor/resolver/operators";
import { fromAnonRpc, jsonRpcReader, TrafficMeter, verifyBundle, type FetchFn, type VerifyReport } from "@floor/verifier";
import { decodeFunctionResult, encodeFunctionData, parseAbi, stringToBytes, type Address, type Hex } from "viem";
import fixture from "../../../packages/resolver/fixtures/rseth-24908284.json";

type Source = "arkiv" | "swarm" | "fixture";

type Net = "tor-js" | "nym" | "passthrough" | "direct";

/** Specifier contracts on Ethereum mainnet, from github.com/ethereum/anon-rpc adopters.json5 (read 2026-11-06). */
const NETWORKS: Record<Exclude<Net, "direct">, { address: string; config?: unknown; anonymising: boolean }> = {
  "tor-js": {
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    // Gateways are blind relays into Tor. The first is a temporary alternative from the anon-rpc maintainers
    // (2026-11-06, "only up for a day or so"); the second is the demonstration gateway in the anon-rpc repo.
    // Override with ?torgw=host:port:id[,host:port:id].
    config: {
      gateways: new URLSearchParams(location.search).get("torgw")?.split(",") ?? [
        "159.89.167.167:12298:uEiA-2gShJvf4zebUOQElPY_y46cFeECnyn1TqOfnIQMeTg",
        "152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ",
      ],
    },
    anonymising: true,
  },
  nym: { address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", anonymising: true },
  passthrough: { address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", anonymising: false },
};

const DEFAULTS = {
  // Free, keyless providers that pass all four checks (measured 2026-11-06): archive reads at the pinned block,
  // batches of 10, CORS for the sandbox, and requests WITHOUT a Content-Type header (the Nym worker drops it).
  // Fail: Nodies + 1rpc (415 without Content-Type), dRPC (batches > 3 refused), publicnode/ankr/blockpi (key for
  // archive), flashbots (pruned), cloudflare (internal error), merkle/onfinality/thirdweb (rate limited).
  // Reads rotate across all of them; a rate-limited one is benched for 30 s. Add your own keyed RPC in the page.
  rpc: "https://eth-mainnet.public.blastapi.io, https://rpc.mevblocker.io, https://gateway.tenderly.co/public/mainnet, https://api.zan.top/eth-mainnet",
  boot: "https://ethereum-rpc.publicnode.com",
  hash: "0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561",
  // Floor's writer wallet (also the deployer); README "Writer wallet and query". Override with ?writer=
  writer: "0x563567A5788820093f71951DA383838D71ad2360",
  token: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7", // rsETH
  arkiv: RABDI_PUBLIC_RPC,
  gateway: SWARM_PUBLIC_GATEWAY,
  registryRpc: "https://ethereum-sepolia-rpc.publicnode.com",
};

const REGISTRY_ABI = parseAbi(["function ratingOf(address asset) view returns ((uint8 grade, bool known, uint64 scanBlock, uint32 ruleVersion, uint64 updatedAt, bytes32 bundleHash))"]);
const GRADES = ["UNKNOWN", "OK", "DEGRADED", "BREACHED"]; // FloorTypes order; only used for display

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

type AnyWorker = { fetch(url: string, init: Record<string, unknown>): Promise<{ ok: boolean; status: number; arrayBuffer?(): Promise<ArrayBuffer>; text(): Promise<string> }> };
type Transport = { raw: FetchFn; label: string; worker?: AnyWorker; close(): void };

async function makeTransport(net: Net, meter: TrafficMeter, bootUrl: string): Promise<Transport> {
  if (net === "direct") return { raw: instrument(directFetch), label: "direct", close() {} };
  const spec = NETWORKS[net];
  const worker = new AnonRpcWorker({ address: spec.address, config: spec.config as never, preExisting: { rpcProvider: bootstrapProvider(meter, bootUrl) } });
  const t0 = performance.now();
  // A second Nym worker in the same page sometimes never becomes ready (seen 2026-11-06); fail clearly instead of hanging.
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([worker.ready, new Promise<never>((_, rej) => { startTimer = setTimeout(() => { worker.close(); rej(new Error(`${net} worker not ready after 90 s; reload the page and try again`)); }, 90_000); })]).finally(() => clearTimeout(startTimer));
  log(`${net} worker ready in ${((performance.now() - t0) / 1000).toFixed(1)} s (bundle hash-pinned by specifier ${spec.address})`);
  const label = spec.anonymising ? `anon-rpc:${net}` : `anon-rpc:${net} (NOT anonymising)`;
  return { raw: instrument(fromAnonRpc(worker as never)), label, worker: worker as unknown as AnyWorker, close: () => worker.close() };
}

/** Swarm GET through the Anon-RPC worker when there is one (the gateway then can't link the download to you); direct otherwise. */
async function swarmGet(url: string, t: Transport, meter: TrafficMeter) {
  if (t.worker) {
    try {
      const r = await Promise.race([t.worker.fetch(url, { method: "GET" }), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no answer in 30 s")), 30_000))]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      meter.count(`swarm · ${t.label}`);
      return { ok: r.ok, status: r.status, arrayBuffer: async () => (r.arrayBuffer ? r.arrayBuffer() : stringToBytes(await r.text()).buffer as ArrayBuffer) };
    } catch (e) {
      log(`swarm GET through ${t.label} failed (${(e as Error).message}); falling back to a direct GET (counted as direct)`);
    }
  }
  meter.count("swarm · direct");
  return fetch(url);
}

/** One JSON-RPC call through a fetch function (used for the registry read). */
async function rpcCall(f: FetchFn, url: string, method: string, params: unknown[]) {
  const res = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

const stepsEl = $<HTMLOListElement>("steps");
function step(text: string, cls: "ok" | "bad" | "skip" = "ok") {
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = text;
  stepsEl.append(li);
  log(`step: ${text}`);
}
const v = (id: string) => $<HTMLInputElement>(id).value.trim();

/** Where the evidence comes from, with each hop checked. Returns the bundle and the hash it must match. */
async function loadEvidence(src: Source, t: Transport, meter: TrafficMeter): Promise<{ bundle: EvidenceBundle; expected: Hex }> {
  if (src === "fixture") {
    step("source: local copy shipped with the page (offline fallback, not fetched from Arkiv/Swarm)", "skip");
    return { bundle: JSON.parse(JSON.stringify(fixture)) as EvidenceBundle, expected: v("hash") as Hex };
  }
  let ref = v("ref"), expected = v("hash") as Hex;
  if (src === "arkiv") {
    const writer = v("writer") as Address, token = v("token") as Address;
    const t0 = performance.now();
    // Nym's worker drops the Content-Type header (measured 2026-11-06 with a header echo), and Arkiv's RPC answers
    // 415 without it; Nym requests can also time out. On any failure, fall back to a direct Arkiv read, counted
    // separately on the meter (never hidden). The Arkiv lookup only reveals which asset is being checked.
    const anonArkiv = meter.wrap(`arkiv · ${t.label}`, t.raw);
    const directArkiv = meter.wrap("arkiv · direct (fallback)", instrument(directFetch));
    let arkivDirect = !t.worker;
    const arkivFetch: FetchFn = async (u, init) => {
      if (!arkivDirect) {
        let why = "";
        try {
          const r = await Promise.race([anonArkiv(u, init), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no answer in 20 s")), 20_000))]);
          if (r.ok) return r;
          why = `HTTP ${r.status}`;
        } catch (e) {
          why = (e as Error).message.slice(0, 80);
        }
        arkivDirect = true;
        log(`Arkiv read through ${t.label} failed (${why}; Nym drops the Content-Type header, Arkiv then answers 415); reading Arkiv directly`);
      }
      return directArkiv(u, init);
    };
    const client = arkivReader(t.worker ? arkivFetch : meter.wrap("arkiv · direct", t.raw), v("arkiv"));
    const r = await findRating(client, writer, token);
    if (!r) throw new Error(`Arkiv: no floor.rating for ${token} created by ${writer}. Nothing published yet? (README step 8) Use source "local copy" until then.`);
    step(`Arkiv: rating ${r.grade} at block ${r.block} (${r.ruleVersion}), created by the writer ${writer}, entity ${r.entityKey ?? "?"} · ${((performance.now() - t0) / 1000).toFixed(1)} s via ${t.label}`);
    ref = r.swarmRef;
    expected = r.bundleHash;
  }
  const gateway = v("gateway").replace(/\/$/, "");
  const t1 = performance.now();
  const bundle = await fetchBundle(gateway, ref, expected, (u) => swarmGet(u, t, meter));
  step(`Swarm: downloaded ${ref.slice(0, 12)}… from ${new URL(gateway).host}; keccak256(bytes) = ${expected.slice(0, 14)}… matches · ${((performance.now() - t1) / 1000).toFixed(1)} s`);
  return { bundle, expected };
}

/** Optional: the CRE-signed rating in FloorRegistry must carry the same bundle hash. */
async function checkRegistry(expected: Hex, t: Transport, meter: TrafficMeter) {
  const registry = v("registry");
  if (!registry) { step("onchain: skipped (no FloorRegistry address given; deploy step 2 in the README)", "skip"); return true; }
  const data = encodeFunctionData({ abi: REGISTRY_ABI, functionName: "ratingOf", args: [v("token") as Address] });
  const out = (await rpcCall(meter.wrap(`registry · ${t.label}`, t.raw), v("registryRpc"), "eth_call", [{ to: registry, data }, "latest"])) as Hex;
  const r = decodeFunctionResult({ abi: REGISTRY_ABI, functionName: "ratingOf", data: out });
  const ok = r.known && r.bundleHash.toLowerCase() === expected.toLowerCase();
  step(`onchain: FloorRegistry ${registry.slice(0, 10)}… says ${GRADES[r.grade] ?? r.grade} at scan block ${r.scanBlock}, hash ${r.bundleHash.slice(0, 14)}… ${ok ? "matches" : r.known ? "DOES NOT match" : "(no rating stored)"}`, ok ? "ok" : "bad");
  return ok;
}

function renderMeter(meter: TrafficMeter, label: string) {
  const s = meter.snapshot;
  const parts = Object.entries(s.byRoute).map(([k, n]) => `${k}: ${n}`);
  const anon = Object.entries(s.byRoute).filter(([k]) => k.includes("anon-rpc")).reduce((a, [, n]) => a + n, 0);
  $("meter").textContent = `Requests: ${s.total} · ${parts.join(" · ")} · share via Anon-RPC${label.includes("NOT") ? " (passthrough, NOT anonymising)" : ""}: ${s.total ? ((anon / s.total) * 100).toFixed(1) : "0"}%`;
}

async function run() {
  const btn = $<HTMLButtonElement>("go");
  btn.disabled = true;
  $("status").textContent = "";
  $("status").className = "status";
  logEl.textContent = "";
  Object.assign(stats, { requests: 0, ms: [], http: {}, rpcErrors: {}, thrown: {} });
  const net = (document.querySelector("input[name=net]:checked") as HTMLInputElement).value as Net;
  const src = (document.querySelector("input[name=src]:checked") as HTMLInputElement).value as Source;
  stepsEl.textContent = "";
  const rpc = $<HTMLInputElement>("rpc").value.split(",").map((x) => x.trim()).filter(Boolean);
  const boot = $<HTMLInputElement>("boot").value.trim();
  const meter = new TrafficMeter();
  let transport: Transport | undefined;
  const t0 = performance.now();
  try {
    $("phase").textContent = `starting ${net}…`;
    transport = await makeTransport(net, meter, boot);
    $("phase").textContent = `fetching evidence (${src})…`;
    const { bundle, expected } = await loadEvidence(src, transport, meter);
    const onchainOk = await checkRegistry(expected, transport, meter);
    if ($<HTMLInputElement>("tamper").checked) {
      const c = bundle.state.calls.find((x) => x.ok && x.result.length > 4)!;
      const last = c.result.slice(-1);
      c.result = (c.result.slice(0, -1) + (last === "0" ? "1" : "0")) as Hex;
      log(`tampered: flipped the last nibble of read ${c.id}`);
    }
    const qs = new URLSearchParams(location.search);
    // measured over Nym 2026-11-06: batch 10 x 6 parallel ~70 s; batch 50 x 2 was 100 s to 6+ min
    const batch = Number(qs.get("batch") ?? 10), concurrency = Number(qs.get("conc") ?? 6);
    const reader = jsonRpcReader(meter.wrap(`chain · ${transport.label}`, transport.raw), rpc, { batch, concurrency, timeoutMs: Number(qs.get("timeout") ?? 20_000) });
    log(`batch=${batch} concurrency=${concurrency}`);
    log(`replaying ${bundle.state.calls.length} recorded reads at block ${bundle.state.calls[0]?.block} via ${transport.label}`);
    const tick = setInterval(() => renderMeter(meter, transport!.label), 500);
    const report: VerifyReport = await verifyBundle(bundle, expected, reader, operatorMap("ethereum"), (stage, done, total) => {
      $("phase").textContent = `${stage}: ${done}/${total}`;
      if (stage === "raw" && done === total) log(`first pass done at ${((performance.now() - t0) / 1000).toFixed(1)} s · ${statsLine()}`);
    }, { retryBackoffMs: 1000 });
    log(`final · ${statsLine()}`);
    clearInterval(tick);
    renderMeter(meter, transport.label);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    step(`replay: ${report.raw.matched}/${report.raw.total} recorded reads match mainnet at block ${bundle.state.scan.block} via ${transport.label}; grade claimed ${report.grade.claimed}, recomputed ${report.grade.recomputed}`, report.status === "VERIFIED" ? "ok" : "bad");
    // the onchain hash check can only make the result worse, never better
    const status = report.status === "VERIFIED" && !onchainOk ? "MISMATCH" : report.status;
    $("status").textContent = `${status} in ${secs} s${src === "fixture" ? " (local copy; Arkiv/Swarm not used)" : ""}`;
    $("status").className = `status ${status}`;
    log(`hash ok=${report.hash.ok} · raw ${report.raw.matched}/${report.raw.total} matched, ${report.raw.mismatched.length} mismatched, ${report.raw.failed.length} failed · state ok=${report.state.ok} · grade claimed=${report.grade.claimed} recomputed=${report.grade.recomputed}`);
    if (report.raw.mismatched.length) log(`mismatched: ${report.raw.mismatched.slice(0, 5).join(", ")}`);
    if (report.raw.failed.length) log(`failed: ${report.raw.failed.slice(0, 5).join(", ")}`);
    (window as unknown as { __floorLab: unknown }).__floorLab = { net, src, secs, status, report, meter: meter.snapshot.byRoute, stats: statsLine(), steps: [...stepsEl.children].map((li) => li.textContent) };
  } catch (e) {
    // a bundle whose bytes don't hash to the published hash is a MISMATCH, not an infrastructure error
    const mismatch = e instanceof EvidenceHashMismatch || (e as Error).message.includes("DOES NOT match");
    $("status").textContent = `${mismatch ? "MISMATCH" : "ERROR"}: ${(e as Error).message}`;
    $("status").className = mismatch ? "status MISMATCH" : "status UNVERIFIED_RPC";
    log(`error: ${(e as Error).stack ?? e}`);
    step(`stopped: ${(e as Error).message}`, "bad");
    (window as unknown as { __floorLab: unknown }).__floorLab = { net, src, error: String(e), meter: meter.snapshot.byRoute, steps: [...stepsEl.children].map((li) => li.textContent) };
  } finally {
    if (transport) renderMeter(meter, transport.label);
    $("phase").textContent = "";
    transport?.close();
    btn.disabled = false;
  }
}

// Tenderly's public gateway refuses Tor exits (403 / 429, measured 2026-11-06), so it is left out for tor-js.
const TOR_RPC = "https://eth-mainnet.public.blastapi.io, https://rpc.mevblocker.io, https://api.zan.top/eth-mainnet";
{ const n = new URLSearchParams(location.search).get("net") ?? "tor-js"; $<HTMLInputElement>("rpc").value = n === "tor-js" ? TOR_RPC : DEFAULTS.rpc; }
document.querySelectorAll<HTMLInputElement>("input[name=net]").forEach((r) => r.addEventListener("change", () => {
  const cur = $<HTMLInputElement>("rpc").value;
  if (cur === DEFAULTS.rpc || cur === TOR_RPC) $<HTMLInputElement>("rpc").value = r.value === "tor-js" ? TOR_RPC : DEFAULTS.rpc;
}));
$<HTMLInputElement>("boot").value = DEFAULTS.boot;
$<HTMLInputElement>("hash").value = DEFAULTS.hash;
const qs0 = new URLSearchParams(location.search);
for (const k of ["writer", "token", "arkiv", "gateway", "registryRpc"] as const) $<HTMLInputElement>(k).value = qs0.get(k) ?? DEFAULTS[k];
for (const k of ["ref", "registry", "hash"]) if (qs0.get(k)) $<HTMLInputElement>(k).value = qs0.get(k)!;
const qsrc = qs0.get("src");
if (qsrc) (document.querySelector(`input[name=src][value="${qsrc}"]`) as HTMLInputElement | null)?.click();
const q = qs0.get("net");
if (q) (document.querySelector(`input[name=net][value="${q}"]`) as HTMLInputElement | null)?.click();
const qrpc = new URLSearchParams(location.search).get("rpc");
if (qrpc) $<HTMLInputElement>("rpc").value = qrpc;
if (new URLSearchParams(location.search).has("tamper")) $<HTMLInputElement>("tamper").checked = true;
$("go").addEventListener("click", () => void run());
if (new URLSearchParams(location.search).has("auto")) void run();
