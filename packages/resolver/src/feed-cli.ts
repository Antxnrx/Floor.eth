#!/usr/bin/env tsx
/** floor feed --bundle a.json:0xToken [--bundle b.json:0xToken ...] --out feed.json */
import { bundleHash, type EvidenceBundle } from "@floor/core";
import { readFileSync, writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { feedEntry, makeFeed } from "./feed.js";

const argv = process.argv.slice(2);
const pairs = argv.flatMap((a, i) => (a === "--bundle" ? [argv[i + 1]!] : []));
const out = argv[argv.indexOf("--out") + 1];
if (!pairs.length || !out) { console.error("usage: floor feed --bundle file.json:0xToken ... --out feed.json"); process.exit(2); }
const entries = pairs.map((p) => {
  const [file, token] = p.split(":");
  const b = JSON.parse(readFileSync(file!, "utf8")) as EvidenceBundle;
  return feedEntry(b, bundleHash(b), getAddress(token!));
});
writeFileSync(out, JSON.stringify(makeFeed(entries), null, 1));
for (const e of entries) console.log(`${e.asset} ${e.grade} @${e.scanBlock} checks=${e.checks.length} bundle=${e.bundleHash}`);
