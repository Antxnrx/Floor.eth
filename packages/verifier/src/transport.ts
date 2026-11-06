/**
 * Chain-read transports for the browser verifier. Anything that can do JSON-RPC over `fetch` works,
 * including EF Anon-RPC's `AnonRpcWorker.fetch` (docs/19 §5), which is passed in as `fetchFn`.
 */
import type { Address, Hex } from "viem";

export interface ChainReader {
  call(to: Address, data: Hex, block: number): Promise<Hex>;
  getCode(address: Address, block: number): Promise<Hex>;
  getStorageAt(address: Address, slot: Hex, block: number): Promise<Hex>;
}

export type FetchFn = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Counts requests per route so the UI can show "N% of chain reads via Anon-RPC" (EF judging criterion). */
export class TrafficMeter {
  private counts: Record<string, number> = {};
  wrap(label: string, f: FetchFn): FetchFn {
    return (url, init) => {
      // a JSON-RPC batch counts as one request per contained call
      let n = 1;
      try {
        const b = JSON.parse(init.body);
        if (Array.isArray(b)) n = b.length;
      } catch {}
      this.counts[label] = (this.counts[label] ?? 0) + n;
      return f(url, init);
    };
  }
  /** Count requests that don't go through `wrap` (e.g. a Swarm GET). */
  count(label: string, n = 1) {
    this.counts[label] = (this.counts[label] ?? 0) + n;
  }
  get snapshot() {
    const total = Object.values(this.counts).reduce((a, b) => a + b, 0);
    return { total, byRoute: { ...this.counts }, share: (label: string) => (total ? (this.counts[label] ?? 0) / total : 0) };
  }
}

type RpcReq = { method: string; params: unknown[] };

/**
 * JSON-RPC over fetch with optional batching. `batch=1` sends single requests (safest for privacy transports
 * that may not support batches); larger batches are fine for direct providers.
 *
 * `url` may be a list: requests rotate round-robin across providers, so no single provider sees the whole check
 * (privacy) or can rate-limit it alone, and a retried read naturally lands on a different provider.
 */
export function jsonRpcReader(fetchFn: FetchFn, url: string | string[], opts: { batch?: number; concurrency?: number; cooldownMs?: number; timeoutMs?: number } = {}): ChainReader & { flush(): Promise<void> } {
  const urls = Array.isArray(url) ? url : [url];
  if (urls.length === 0) throw new Error("jsonRpcReader: no RPC url");
  let next = 0;
  // A provider that answers with a rate-limit / quota error, a non-2xx, no answer in time, or a network-level failure
  // is benched for `cooldownMs`, as long as another provider is available. "execution reverted" is an answer, not a
  // provider failure.
  const cooldownMs = opts.cooldownMs ?? 30_000;
  const benchedUntil = new Map<string, number>();
  const now = () => Date.now();
  const pickUrl = () => {
    for (let i = 0; i < urls.length; i++) {
      const u = urls[next++ % urls.length]!;
      if ((benchedUntil.get(u) ?? 0) <= now()) return u;
    }
    return urls[next++ % urls.length]!; // everyone benched: keep trying in rotation
  };
  const bench = (u: string, ms = cooldownMs) => { if (urls.length > 1) benchedUntil.set(u, now() + ms); };
  const LIMIT = /rate|limit|capacity|quota|too many|exceeded|throttl|usage/i;
  const batchSize = opts.batch ?? 1;
  let id = 1;
  let queue: { req: RpcReq; resolve: (v: Hex) => void; reject: (e: Error) => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function send(items: typeof queue) {
    const body = items.map((it) => ({ jsonrpc: "2.0", id: id++, ...it.req }));
    const u = pickUrl();
    try {
      // A request that never answers must not stall the whole check: time it out, bench the provider, and let the
      // verifier's retry pass send those reads elsewhere.
      const timeoutMs = opts.timeoutMs ?? 30_000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { bench(u); reject(new Error(`timeout after ${timeoutMs} ms (${u})`)); }, timeoutMs);
      });
      const res = await Promise.race([fetchFn(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batchSize === 1 ? body[0] : body) }), timeout]).finally(() => clearTimeout(timer));
      if (!res.ok) {
        // 403 = this provider refuses us (e.g. it blocks Tor exits): don't come back to it during this check
        bench(u, res.status === 403 ? Number.POSITIVE_INFINITY : cooldownMs);
        throw new Error(`HTTP ${res.status}`);
      }
      type Rpc = { id?: number; result?: Hex; error?: { message?: string } | string };
      const json = (await res.json()) as Rpc | Rpc[];
      const arr = Array.isArray(json) ? json : [json];
      const msg = (r?: Rpc) => (typeof r?.error === "string" ? r.error : r?.error?.message) ?? "no result";
      // A body that is not JSON-RPC (no id, error as a plain string: ZAN's "cu limit exceeded", measured 2026-11-07)
      // answers nothing: treat it as a provider failure and bench the provider.
      const malformed = arr.every((r) => r == null || typeof r !== "object" || r.id === undefined);
      if (malformed || arr.some((r) => r.error && LIMIT.test(msg(r)))) bench(u);
      if (malformed) throw new Error(`malformed JSON-RPC response from ${u}: ${msg(arr[0]).slice(0, 120)}`);
      const byId = new Map(arr.map((r) => [r.id, r]));
      body.forEach((b, i) => {
        const r = byId.get(b.id);
        if (!r || r.error || r.result === undefined) items[i]!.reject(new Error(msg(r)));
        else items[i]!.resolve(r.result);
      });
    } catch (e) {
      // A fetch that fails at the network level is a provider failure too: some providers send their 429 without CORS
      // headers, which a browser reports as "Failed to fetch" (MEV Blocker, measured 2026-11-07). Bench it like a
      // rate-limit answer so retries go elsewhere.
      bench(u);
      for (const it of items) it.reject(e as Error);
    }
  }
  async function flush() {
    const items = queue;
    queue = [];
    timer = null;
    for (let i = 0; i < items.length; i += batchSize) await send(items.slice(i, i + batchSize));
  }
  function enqueue(req: RpcReq): Promise<Hex> {
    return new Promise((resolve, reject) => {
      queue.push({ req, resolve, reject });
      if (queue.length >= batchSize * (opts.concurrency ?? 4)) void flush();
      else if (!timer) timer = setTimeout(() => void flush(), 0);
    });
  }
  const tag = (b: number) => `0x${b.toString(16)}`;
  return {
    call: (to, data, block) => enqueue({ method: "eth_call", params: [{ to, data }, tag(block)] }),
    getCode: (address, block) => enqueue({ method: "eth_getCode", params: [address, tag(block)] }),
    getStorageAt: (address, slot, block) => enqueue({ method: "eth_getStorageAt", params: [address, slot, tag(block)] }),
    flush,
  };
}

/**
 * Adapter for EF Anon-RPC (`@anon-rpc/browser-harness`, docs/19 §5): `new AnonRpcWorker({...}).fetch` is this-bound
 * and fetch-compatible, so it plugs straight into jsonRpcReader. Use batch=1: privacy transports may not batch.
 *   const meter = new TrafficMeter();
 *   const reader = jsonRpcReader(meter.wrap("anon-rpc", fromAnonRpc(worker)), RPC_URL, { batch: 1 });
 */
export function fromAnonRpc(worker: { fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> }): FetchFn {
  return (url, init) => worker.fetch(url, init);
}
