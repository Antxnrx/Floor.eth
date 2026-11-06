/**
 * Floor bridge dataset page: the Arkiv Mirror query, run in the browser.
 * Live mode reads floor.adapter / floor.event entities created by Floor's writer (optionally through EF Anon-RPC /
 * Tor). Preview mode builds the same rows from the evidence files shipped with the page, labelled as such, so the
 * page is usable before the Arkiv write and as an offline check of what was published.
 */
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { arkivRpc, DEPLOYMENT } from "@floor/deployments";
import { adaptersBy, adapterValues, arkivReader, eventValues, timeline, unboundedAdapters } from "@floor/publish/browser";
import type { Address } from "viem";
import registry from "../../../packages/resolver/data/adapters-all-chains.json";
import tl from "../../../packages/publish/data/rseth-timeline.json";
import { NETWORKS } from "./networks";

const RSETH = DEPLOYMENT.kelp.token as Address;
const DEFAULT_WRITER = DEPLOYMENT.writer;
const evidence = import.meta.glob("../../../docs/evidence/inbound/2026-11-07-*.json", { eager: true, import: "default" }) as Record<string, { block: number; rows: never[] }>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (s: string) => { $("log").textContent += `[${new Date().toISOString().slice(11, 19)}] ${s}\n`; console.log("[floor-dataset]", s); };
/** Arkiv rows come back decoded through the schema; unwrap a { type, value } if one appears. */
const v = (x: unknown): unknown => (x && typeof x === "object" && "value" in (x as object) ? (x as { value: unknown }).value : x);
const s = (x: unknown) => String(v(x));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: unknown) => Number(v(n)).toLocaleString("en-US");

type Row = Record<string, unknown>;

function render(unbounded: Row[], limited: Row[], events: Row[], sourceLabel: string) {
  $("source").innerHTML = sourceLabel;
  $("nUnb").textContent = String(unbounded.length);
  $("nLim").textContent = String(limited.length);
  $("unb").innerHTML = unbounded
    .map((r) => `<tr><td>${esc(s(r.chain))}</td><td>${esc(s(r.token))}</td><td class="mono">${short(s(r.adapter))}</td><td class="num">${fmt(r.routes)}</td><td>${esc(s(r.escrow))}</td><td class="num">${fmt(r.block)}</td></tr>`)
    .join("");
  $("lim").innerHTML = limited
    .map((r) => `<tr><td>${esc(s(r.chain))}</td><td>${esc(s(r.token))}</td><td class="mono">${short(s(r.adapter))}</td><td class="num">${fmt(r.limitedRoutes)}</td><td class="num">${fmt(r.capWhole)} ${esc(s(r.token))}</td></tr>`)
    .join("");
  const set = events.find((e) => s(e.kind) === "single-verifier");
  const drain = events.find((e) => s(e.kind) === "drain");
  $("days").textContent =
    set && drain
      ? `${Math.round((Number(v(drain.time)) - Number(v(set.time))) / 86400)} days on a single verifier before the drain (≈ ${((Number(v(drain.time)) - Number(v(set.time))) / (86400 * 30.44)).toFixed(1)} months, from block timestamps)`
      : "";
  $("tl").innerHTML = events
    .map((e) => {
      const d = new Date(Number(v(e.time)) * 1000).toISOString().slice(0, 16).replace("T", " ");
      const tx = s(e.tx);
      return `<li><span class="mono">${d} UTC · block ${fmt(e.block)}</span> · <b>${esc(s(e.kind))}</b>: ${esc(s(e.detail))}${tx.startsWith("0x") ? ` · <a href="https://etherscan.io/tx/${tx}" target="_blank" rel="noopener">tx</a>` : ""}</li>`;
    })
    .join("");
}

const QUERY = (writer: string) =>
  `floor.adapter WHERE outcome = "NO_INBOUND_LIMIT" AND $creator = ${writer} ORDER BY routes DESC\n` +
  `floor.adapter WHERE outcome = "INBOUND_LIMIT" AND $creator = ${writer}\n` +
  `floor.event   WHERE token = ${RSETH} AND $creator = ${writer} ORDER BY block ASC`;

async function live() {
  const btn = $<HTMLButtonElement>("go");
  btn.disabled = true;
  $("log").textContent = "";
  const writer = $<HTMLInputElement>("writer").value.trim() as Address;
  const rpc = $<HTMLInputElement>("arkiv").value.trim();
  const net = (document.querySelector("input[name=net]:checked") as HTMLInputElement).value;
  $("query").textContent = QUERY(writer);
  let worker: AnonRpcWorker | null = null;
  const t0 = performance.now();
  try {
    let fetchFn = (u: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => fetch(u, init) as never;
    if (net === "tor-js") {
      $("phase").textContent = "starting Tor…";
      let id = 1;
      const rpcProvider = {
        async request({ method, params }: { method: string; params?: unknown }) {
          const r = await fetch(DEPLOYMENT.chains.ethereum.bootstrapRpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params ?? [] }) });
          const j = (await r.json()) as { result?: unknown; error?: { message: string } };
          if (j.error) throw new Error(j.error.message);
          return j.result;
        },
      };
      const spec = NETWORKS["tor-js"];
      worker = new AnonRpcWorker({ address: spec.address, config: spec.config as never, preExisting: { rpcProvider } });
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([worker.ready, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("Tor did not start in 90 s; try again or choose Direct")), 90_000); })]).finally(() => clearTimeout(timer));
      log(`Tor ready in ${((performance.now() - t0) / 1000).toFixed(1)} s (specifier ${spec.address}; 1 bootstrap read is direct, by design)`);
      const w = worker;
      fetchFn = (u, init) => w.fetch(u, init) as never;
    }
    $("phase").textContent = "querying Arkiv…";
    const client = arkivReader(fetchFn, rpc);
    const [unb, lim, ev] = await Promise.all([unboundedAdapters(client as never, writer), adaptersBy(client as never, writer, "INBOUND_LIMIT"), timeline(client as never, writer, RSETH)]);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    log(`Arkiv answered: ${unb.length} unbounded, ${lim.length} limited, ${ev.length} events (${secs} s, ${net})`);
    if (!unb.length && !lim.length && !ev.length) {
      render([], [], [], `<span class="warn">Nothing on Arkiv yet from ${esc(writer)}.</span> The dataset is published with <code>importer --dataset --arkiv</code> (README step 8). Use "Preview from local evidence" meanwhile.`);
      return;
    }
    render(unb as unknown as Row[], lim as unknown as Row[], ev as unknown as Row[], `<span class="ok">LIVE from Arkiv</span> (Rabdi), entities created by <code>${esc(writer)}</code>, read ${net === "tor-js" ? "through Tor" : "directly"} in ${secs} s. No Floor server involved.`);
  } catch (e) {
    $("source").innerHTML = `<span class="bad">Query failed: ${esc((e as Error).message)}</span>`;
    log(`error: ${(e as Error).stack ?? e}`);
  } finally {
    worker?.close();
    $("phase").textContent = "";
    btn.disabled = false;
  }
}

function preview() {
  const reg = (registry as { chains: Record<string, { chainId: number; eid: number; adapters: { oapp: string; lzVersion?: string }[] }> }).chains;
  const rows: Row[] = [];
  for (const [path, d] of Object.entries(evidence)) {
    const name = path.split("2026-11-07-")[1]!.replace(".json", "");
    const key = name.startsWith("ethereum") ? "ethereum" : name;
    const c = reg[key]!;
    const lzVersion = Object.fromEntries(c.adapters.map((a) => [a.oapp.toLowerCase(), a.lzVersion ?? "unknown"]));
    for (const row of d.rows) rows.push(adapterValues(row, { chain: key, chainId: c.chainId, eid: c.eid, block: d.block, evidence: path, lzVersion }) as Row);
  }
  const unb = rows.filter((r) => r.outcome === "NO_INBOUND_LIMIT").sort((a, b) => Number(v(b.routes)) - Number(v(a.routes)));
  const lim = rows.filter((r) => r.outcome === "INBOUND_LIMIT");
  const ev = tl.events.map((e) => eventValues(RSETH, e) as Row);
  $("query").textContent = QUERY($<HTMLInputElement>("writer").value.trim());
  render(unb, lim, ev, `<span class="warn">PREVIEW from the evidence files shipped with this page</span> (docs/evidence/inbound, ${rows.length} adapters). Not read from Arkiv.`);
}

$<HTMLInputElement>("writer").value = new URLSearchParams(location.search).get("writer") ?? DEFAULT_WRITER;
$<HTMLInputElement>("arkiv").value = new URLSearchParams(location.search).get("arkiv") ?? arkivRpc(import.meta.env.VITE_ARKIV_ACCESS_KEY);
if (new URLSearchParams(location.search).get("net") === "direct") (document.querySelector("input[name=net][value=direct]") as HTMLInputElement).checked = true;
$("go").addEventListener("click", () => void live());
$("preview").addEventListener("click", preview);
if (new URLSearchParams(location.search).has("auto")) void live();
if (new URLSearchParams(location.search).has("preview")) preview();
