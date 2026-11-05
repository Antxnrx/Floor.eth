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
  get snapshot() {
    const total = Object.values(this.counts).reduce((a, b) => a + b, 0);
    return { total, byRoute: { ...this.counts }, share: (label: string) => (total ? (this.counts[label] ?? 0) / total : 0) };
  }
}

type RpcReq = { method: string; params: unknown[] };

/**
 * JSON-RPC over fetch with optional batching. `batch=1` sends single requests (safest for privacy transports
 * that may not support batches); larger batches are fine for direct providers.
 */
export function jsonRpcReader(fetchFn: FetchFn, url: string, opts: { batch?: number; concurrency?: number } = {}): ChainReader & { flush(): Promise<void> } {
  const batchSize = opts.batch ?? 1;
  let id = 1;
  let queue: { req: RpcReq; resolve: (v: Hex) => void; reject: (e: Error) => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function send(items: typeof queue) {
    const body = items.map((it) => ({ jsonrpc: "2.0", id: id++, ...it.req }));
    try {
      const res = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batchSize === 1 ? body[0] : body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { id: number; result?: Hex; error?: { message: string } } | { id: number; result?: Hex; error?: { message: string } }[];
      const arr = Array.isArray(json) ? json : [json];
      const byId = new Map(arr.map((r) => [r.id, r]));
      body.forEach((b, i) => {
        const r = byId.get(b.id);
        if (!r || r.error || r.result === undefined) items[i]!.reject(new Error(r?.error?.message ?? "no result"));
        else items[i]!.resolve(r.result);
      });
    } catch (e) {
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
