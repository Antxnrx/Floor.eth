/**
 * Arkiv public dataset (Mirror track): two more schemas next to floor.rating / floor.route.
 *
 *   floor.adapter : one entity per LayerZero adapter over an Aave-listed token, any chain, from the inbound-limit probe
 *                   (docs/09 "All-chain rerun", docs/evidence/inbound/*.json). Query: "which adapters can release
 *                   everything in one message?"
 *   floor.event   : the flight recorder, one entity per sourced event in a token's bridge history
 *                   (packages/publish/data/rseth-timeline.json, from docs/03). Query: "rsETH's history, oldest first".
 *
 * Mapping functions are pure (unit-tested offline). Every string is clipped to Arkiv's 128-byte limit.
 */
import { and, asc, desc, eq } from "@arkiv-network/sdk/query";
import { addr, bool, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import type { PublicArkivClient } from "@arkiv-network/sdk";
import type { Address } from "viem";

export const FloorAdapter = defineSchema("floor.adapter", {
  chain: str().indexed(),
  chainId: u64().indexed(),
  eid: u64().indexed(),
  token: str().indexed(),
  adapter: addr().indexed(),
  /** NO_INBOUND_LIMIT | INBOUND_LIMIT | TEST_ERROR | UNKNOWN | NO_PEERS | LZ_V1 */
  outcome: str().indexed(),
  routes: u64().indexed(),
  unboundedRoutes: u64().indexed(),
  limitedRoutes: u64().indexed(),
  /** the adapter credits by minting (escrow is no ceiling) */
  mints: bool().indexed(),
  /** escrow held by the adapter, whole tokens (floor), 0 if none or minting */
  escrowWhole: u64().indexed(),
  /** smallest per-message cap over its limited routes, whole tokens; 0 = no cap measured */
  capWhole: u64().indexed(),
  block: u64().indexed(),
  escrow: str(),
  crossCheck: str(),
  evidence: str(),
});

export const FloorEvent = defineSchema("floor.event", {
  token: addr().indexed(),
  block: u64().indexed(),
  time: u64().indexed(),
  kind: str().indexed(),
  detail: str(),
  tx: str(),
});

const clip = (s: string, max = 128) => {
  const b = new TextEncoder().encode(s);
  return b.length <= max ? s : new TextDecoder().decode(b.slice(0, max - 1)).replace(/�$/, "") + "…";
};

/** One row of docs/evidence/inbound/<date>-<chain>.json as written by packages/resolver/src/inbound-cli.ts. */
export interface ProbeRow {
  oapp: string;
  symbol: string;
  outcome?: string;
  error?: string;
  eids?: number[];
  sharedDecimals?: number;
  escrowTokens?: number | null;
  crossCheck?: string;
  routeCounts?: Record<string, number>;
  results?: { outcome: string; maxAcceptedSD: string | null; proof: string }[];
}
export interface ProbeChain {
  chain: string;
  chainId: number;
  eid: number;
  block: number;
  evidence: string;
  /** adapter address (lowercase) -> LayerZero endpoint version from LZ's OFT registry, when known */
  lzVersion?: Record<string, string>;
}

export function adapterValues(row: ProbeRow, c: ProbeChain) {
  const results = row.results ?? [];
  const mints = results.some((r) => r.proof.includes("minting"));
  const limited = results.filter((r) => r.outcome === "INBOUND_LIMIT" && r.maxAcceptedSD);
  const sd = row.sharedDecimals ?? 6;
  const caps = limited.map((r) => BigInt(r.maxAcceptedSD!) / 10n ** BigInt(sd));
  const cap = caps.length ? caps.reduce((a, b) => (b < a ? b : a)) : 0n;
  let outcome = row.outcome ?? (row.error ? "ERROR" : "UNKNOWN");
  if (outcome === "NO_PEERS" && c.lzVersion?.[row.oapp.toLowerCase()] === "v1") outcome = "LZ_V1";
  const escrowTokens = !mints && typeof row.escrowTokens === "number" ? row.escrowTokens : 0;
  return {
    chain: c.chain,
    chainId: u64(c.chainId),
    eid: u64(c.eid),
    token: clip(row.symbol),
    adapter: addr(row.oapp as Address),
    outcome,
    routes: u64(row.eids?.length ?? 0),
    unboundedRoutes: u64(results.filter((r) => r.outcome === "NO_INBOUND_LIMIT").length),
    limitedRoutes: u64(limited.length),
    mints: bool(mints),
    escrowWhole: u64(BigInt(Math.floor(escrowTokens))),
    capWhole: u64(cap),
    block: u64(c.block),
    escrow: mints ? "mints on credit" : typeof row.escrowTokens === "number" ? clip(`${row.escrowTokens.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${row.symbol}`) : "-",
    crossCheck: row.crossCheck ?? "-",
    evidence: clip(c.evidence),
  };
}

export interface TimelineEvent {
  block: number;
  time: number;
  kind: string;
  detail: string;
  tx: string;
}
export function eventValues(token: Address, e: TimelineEvent) {
  return { token: addr(token), block: u64(e.block), time: u64(e.time), kind: clip(e.kind), detail: clip(e.detail), tx: clip(e.tx || "-") };
}

/** "Every adapter that can release everything in one message", widest exposure (most routes) first. */
export async function unboundedAdapters(client: PublicArkivClient, writer: Address) {
  const { entities } = await client.select().from(FloorAdapter).where(eq("outcome", "NO_INBOUND_LIMIT")).createdBy(writer).orderBy(desc("routes")).fetch();
  return entities;
}

/** All adapters with a given outcome on one chain (e.g. the rate-limited ones). */
export async function adaptersBy(client: PublicArkivClient, writer: Address, outcome: string, chain?: string) {
  const q = chain ? and(eq("outcome", outcome), eq("chain", chain)) : eq("outcome", outcome);
  const { entities } = await client.select().from(FloorAdapter).where(q).createdBy(writer).orderBy(desc("routes")).fetch();
  return entities;
}

/** The flight recorder: a token's sourced bridge history, oldest first. */
export async function timeline(client: PublicArkivClient, writer: Address, token: Address) {
  const { entities } = await client.select().from(FloorEvent).where(eq("token", addr(token))).createdBy(writer).orderBy(asc("block")).fetch();
  return entities;
}
