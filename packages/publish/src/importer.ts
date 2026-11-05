#!/usr/bin/env tsx
/**
 * Re-runnable importer (Arkiv Mirror requirement: "Your import script is in the repo, and we can re-run it").
 *
 *   pnpm --filter @floor/publish run importer --bundle <bundle.json>:<token> [...] [--swarm] [--arkiv] [--feed out.json]
 *
 * Default is a DRY RUN: prints what would be uploaded and written, writes nothing anywhere.
 *   --swarm  upload each bundle to Swarm (BEE_URL, optional BEE_BATCH_ID; local bee-factory may buy a batch)
 *   --arkiv  create floor.rating + floor.route entities on Rabdi (ARKIV_PRIVATE_KEY, ARKIV_ACCESS_KEY)
 *   --feed   write the CRE feed (cre/floor-rating) for the same bundles
 * Idempotency: entities are keyed by (token, block); re-running for the same scan block is skipped if a rating
 * from the writer already exists at that block.
 */
import { bundleHash, type EvidenceBundle } from "@floor/core";
import { Bee } from "@ethersphere/bee-js";
import { readFileSync, writeFileSync } from "node:fs";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arkivClients, latestRating, publishRating, publishRoutes, ratingValues, routeValues } from "./arkiv.js";
import { createBatch, uploadBundle, usableBatch } from "./swarm.js";

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const val = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
const pairs = argv.flatMap((a, i) => (a === "--bundle" ? [argv[i + 1]!] : []));
if (!pairs.length) {
  console.error("usage: importer --bundle file.json:0xToken [...] [--swarm] [--arkiv] [--feed out.json]");
  process.exit(2);
}
const dry = !flag("--swarm") && !flag("--arkiv");
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
  }

  const rating = ratingValues(bundle, hash, swarmRef, token);
  const routes = routeValues(bundle, hash, token);
  if (arkiv?.walletClient && writer) {
    const existing = await latestRating(arkiv.publicClient, writer, token);
    if (existing && String((existing as { block?: unknown }).block) === String(bundle.state.scan.block)) {
      console.log("  arkiv: rating for this scan block already exists, skipped");
    } else {
      const r = await publishRating(arkiv.walletClient, rating);
      console.log(`  arkiv: floor.rating ${r.entityKey} (tx ${r.txHash})`);
      const rs = await publishRoutes(arkiv.walletClient, routes);
      console.log(`  arkiv: ${rs.length} floor.route entities`);
    }
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
