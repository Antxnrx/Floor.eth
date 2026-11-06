#!/usr/bin/env tsx
/**
 * Re-runnable importer (Arkiv Mirror requirement: "Your import script is in the repo, and we can re-run it").
 *
 *   pnpm --filter @floor/publish run importer --bundle <bundle.json>:<token> [...] [--swarm] [--arkiv] [--feed out.json]
 *
 * Default is a DRY RUN: prints what would be uploaded and written, writes nothing anywhere.
 *   --swarm  upload each bundle to Swarm (BEE_URL, optional BEE_BATCH_ID; local bee-factory may buy a batch)
 *   --swarm-gateway <url>  upload through a public gateway that stamps uploads itself (no batch), e.g.
 *            https://api.gateway.ethswarm.org; the bytes are read back and hash-checked before use
 *   --swarm-ref <ref>      use an existing Swarm reference (already uploaded); it is read back and hash-checked
 *   --arkiv  create floor.rating + floor.route entities on Rabdi (ARKIV_PRIVATE_KEY, ARKIV_ACCESS_KEY)
 *   --arkiv-estimate <writer>  preflight: build the exact Arkiv transactions and ask Rabdi to estimate them
 *            from <writer> (address only, no key, nothing signed or sent)
 * --arkiv needs a real Swarm reference (from --swarm, --swarm-gateway or --swarm-ref): it never writes a placeholder.
 *   --feed   write the CRE feed (cre/floor-rating) for the same bundles
 * Idempotency: entities are keyed by (token, block); re-running for the same scan block is skipped if a rating
 * from the writer already exists at that block.
 */
import { bundleHash, type EvidenceBundle } from "@floor/core";
import { Bee } from "@ethersphere/bee-js";
import { readFileSync, writeFileSync } from "node:fs";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom } from "viem";
import { arkivClients, latestRating, publishRating, publishRoutes, ratingValues, routeValues } from "./arkiv.js";
import { bundleBytes, createBatch, fetchBundle, uploadBundle, usableBatch } from "./swarm.js";

const RABDI_RPC = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
/**
 * Arkiv wallet client whose account is just an address: eth_sendTransaction becomes eth_estimateGas, nothing is
 * signed or sent. The SDK re-wraps the error the transport throws to stop the send, so the estimate is handed back
 * through `onEstimate`, not through the error.
 */
function estimateOnlyClient(writer: Address, accessKey: string, onEstimate: (gas: bigint) => void) {
  const url = accessKey ? `${RABDI_RPC}/${encodeURIComponent(accessKey)}` : RABDI_RPC;
  let id = 1;
  const rpc = async (method: string, params: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }) });
    const j = (await r.json()) as { result?: unknown; error?: { message: string } };
    if (j.error) throw new Error(`${method}: ${j.error.message}`);
    return j.result;
  };
  const transport = custom({
    async request({ method, params }) {
      if (method === "eth_sendTransaction") {
        const [tx] = params as [Record<string, unknown>];
        const { gas: _g, maxFeePerGas: _m, maxPriorityFeePerGas: _p, gasPrice: _gp, nonce: _n, ...call } = tx;
        onEstimate(BigInt((await rpc("eth_estimateGas", [call])) as string)); // throws if Rabdi rejects it
        throw new Error("floor: estimate only, not sent");
      }
      return rpc(method, params ?? []);
    },
  });
  return createWalletClient({ chain: rabdi({ accessKey }), transport, account: writer });
}
/** Arkiv rows come back decoded through the schema; unwrap a { type, value } if one appears. */
const raw = (x: unknown) => (x && typeof x === "object" && "value" in x ? (x as { value: unknown }).value : x);

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const val = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const pairs = argv.flatMap((a, i) => (a === "--bundle" ? [argv[i + 1]!] : []));
if (!pairs.length) {
  console.error("usage: importer --bundle file.json:0xToken [...] [--swarm] [--arkiv] [--feed out.json]");
  process.exit(2);
}
const dry = !flag("--swarm") && !flag("--arkiv") && !val("--swarm-gateway");
if (flag("--arkiv") && !flag("--swarm") && !val("--swarm-gateway") && !val("--swarm-ref")) {
  console.error("--arkiv needs a real Swarm reference: add --swarm, --swarm-gateway <url> or --swarm-ref <ref>");
  process.exit(1);
}
console.log(dry ? "DRY RUN: nothing will be uploaded or written\n" : "");

const bee = flag("--swarm") ? new Bee(process.env.BEE_URL ?? "http://localhost:1633") : null;
let batch = process.env.BEE_BATCH_ID ?? null;
if (bee && !batch) batch = (await usableBatch(bee)) ?? (process.env.BEE_ALLOW_BUY === "1" ? await createBatch(bee) : null);
if (bee && !batch) {
  console.error("no usable postage batch: set BEE_BATCH_ID, or BEE_ALLOW_BUY=1 on a local dev node");
  process.exit(1);
}

let arkiv: ReturnType<typeof arkivClients> | null = null;
let writer: Address | null = null;
if (flag("--arkiv")) {
  const pk = process.env.ARKIV_PRIVATE_KEY as Hex | undefined;
  if (!pk || !process.env.ARKIV_ACCESS_KEY) {
    console.error("--arkiv needs ARKIV_PRIVATE_KEY and ARKIV_ACCESS_KEY (hub.arkiv.network)");
    process.exit(1);
  }
  arkiv = arkivClients({ accessKey: process.env.ARKIV_ACCESS_KEY, privateKey: pk });
  writer = privateKeyToAccount(pk).address;
}

const feedEntries: unknown[] = [];
for (const p of pairs) {
  const [file, tokenRaw] = p.split(":");
  const token = getAddress(tokenRaw!);
  const bundle = JSON.parse(readFileSync(file!, "utf8")) as EvidenceBundle;
  const hash = bundleHash(bundle);
  console.log(`${bundle.state.asset.symbol} ${token} @${bundle.state.scan.block} grade=${bundle.verdict.grade} hash=${hash}`);

  let swarmRef = "(dry-run)";
  if (bee && batch) {
    const up = await uploadBundle(bee, batch, bundle);
    swarmRef = up.reference;
    console.log(`  swarm: ${swarmRef} (${up.size} bytes, batch ${batch})`);
  } else if (val("--swarm-gateway")) {
    const gw = val("--swarm-gateway")!.replace(/\/$/, "");
    const { bytes } = bundleBytes(bundle);
    const res = await fetch(`${gw}/bytes`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Blob([bytes as BlobPart]) });
    if (!res.ok) throw new Error(`gateway upload failed: HTTP ${res.status} ${await res.text()}`);
    swarmRef = ((await res.json()) as { reference: string }).reference;
    await fetchBundle(gw, swarmRef, hash); // read back through the gateway: bytes must hash to the bundle hash
    console.log(`  swarm (gateway ${new URL(gw).host}): ${swarmRef} (${bytes.length} bytes), read back and hash-checked`);
  } else if (val("--swarm-ref")) {
    swarmRef = val("--swarm-ref")!;
    await fetchBundle(process.env.SWARM_GATEWAY ?? "https://api.gateway.ethswarm.org", swarmRef, hash);
    console.log(`  swarm (existing): ${swarmRef}, read back and hash-checked`);
  }

  const rating = ratingValues(bundle, hash, swarmRef, token);
  const routes = routeValues(bundle, hash, token);
  if (arkiv?.walletClient && writer) {
    const existing = await latestRating(arkiv.publicClient, writer, token);
    if (existing && String(raw((existing as { block?: unknown }).block)) === String(bundle.state.scan.block)) {
      console.log("  arkiv: rating for this scan block already exists, skipped");
    } else {
      const r = await publishRating(arkiv.walletClient, rating);
      console.log(`  arkiv: floor.rating ${r.entityKey} (tx ${r.txHash})`);
      const rs = await publishRoutes(arkiv.walletClient, routes);
      console.log(`  arkiv: ${rs.length} floor.route entities`);
    }
  } else if (val("--arkiv-estimate")) {
    let last: bigint | null = null;
    const w = estimateOnlyClient(getAddress(val("--arkiv-estimate")!), process.env.ARKIV_ACCESS_KEY ?? "", (g) => (last = g));
    const est = async (label: string, f: () => Promise<unknown>): Promise<bigint> => {
      last = null;
      try {
        await f();
      } catch (e) {
        if (last === null) throw new Error(`${label}: Rabdi would reject it: ${(e as Error).message.split("\n")[0]}`);
        return last;
      }
      throw new Error(`${label}: the send was not intercepted (nothing should have been sent; check the transport)`);
    };
    const g1 = await est("floor.rating", () => publishRating(w as never, rating));
    let gr = 0n;
    for (const [i, r] of routes.entries()) gr += await est(`floor.route #${i}`, () => publishRoutes(w as never, [r]));
    const gasPrice = BigInt((await (w as unknown as { request: (a: unknown) => Promise<string> }).request({ method: "eth_gasPrice" })) as string);
    console.log(`  arkiv (estimate, nothing sent): floor.rating ${g1} gas + ${routes.length} floor.route ${gr} gas = ${g1 + gr} gas ≈ ${Number((g1 + gr) * gasPrice) / 1e18} tGLM at ${gasPrice} wei`);
  } else {
    console.log(`  arkiv (dry): 1 floor.rating + ${routes.length} floor.route entities`);
  }

  if (val("--feed")) {
    const { feedEntry } = await import("../../resolver/src/feed.js");
    feedEntries.push(feedEntry(bundle, hash, token));
  }
}

const feedOut = val("--feed");
if (feedOut) {
  writeFileSync(feedOut, JSON.stringify({ schema: "floor.feed/v0", entries: feedEntries }, null, 1));
  console.log(`\nwrote CRE feed ${feedOut}`);
}
