/**
 * Arkiv integration (docs/20, /arkiv/schema.md). Two schemas on Arkiv's Rabdi testnet (chain id 7794095):
 *   floor.rating : one entity per (asset, scan block): grade + Swarm reference to the evidence bundle + its hash
 *   floor.route  : one entity per (asset, route, direction, scan block): the mirrored LayerZero route posture
 * Mapping functions are pure (unit-tested offline). Publishing needs a funded writer key + an Arkiv access key.
 */
import type { EvidenceBundle } from "@floor/core";
import { createPublicClient, createWalletClient, ExpirationTime, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { addr, bool, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ARKIV_CHAIN_ID = 7794095;

export const FloorRating = defineSchema("floor.rating", {
  token: addr().indexed(),
  oapp: addr().indexed(),
  chainId: u64().indexed(),
  grade: str().indexed(),
  block: u64().indexed(),
  ruleVersion: str().indexed(),
  receiveRoutes: u64().indexed(),
  singleVerifierRoutes: u64().indexed(),
  unpinnedRoutes: u64().indexed(),
  swarmRef: str(),
  bundleHash: str(),
});

export const FloorRoute = defineSchema("floor.route", {
  token: addr().indexed(),
  oapp: addr().indexed(),
  eid: u64().indexed(),
  direction: str().indexed(),
  grade: str().indexed(),
  /** minimum distinct operators an attacker must compromise; 0 = route disabled (dead DVN) */
  independent: u64().indexed(),
  requiredDvns: u64().indexed(),
  confirmations: u64().indexed(),
  pinned: bool().indexed(),
  block: u64().indexed(),
  /** comma-joined operator ids, truncated to the 128-byte str limit */
  operators: str(),
  bundleHash: str(),
});

const clip = (s: string, max = 128) => {
  const b = new TextEncoder().encode(s);
  return b.length <= max ? s : new TextDecoder().decode(b.slice(0, max - 1)).replace(/�$/, "") + "…";
};

export function ratingValues(bundle: EvidenceBundle, hash: Hex, swarmRef: string, token: Address) {
  const recv = bundle.verdict.routes.filter((r) => r.direction === "receive");
  return {
    token: addr(token),
    oapp: addr(bundle.state.asset.oapp),
    chainId: u64(bundle.state.scan.chainId),
    grade: bundle.verdict.grade,
    block: u64(bundle.state.scan.block),
    ruleVersion: `${bundle.verdict.rulePack.id}@${bundle.verdict.rulePack.version}`,
    receiveRoutes: u64(recv.length),
    singleVerifierRoutes: u64(recv.filter((r) => r.effectiveIndependent === 1).length),
    unpinnedRoutes: u64(bundle.state.routes.filter((r) => r.direction === "receive" && r.libraryIsDefault).length),
    swarmRef,
    bundleHash: hash,
  };
}

export function routeValues(bundle: EvidenceBundle, hash: Hex, token: Address) {
  return bundle.verdict.routes.map((v) => {
    const s = bundle.state.routes.find((r) => r.eid === v.eid && r.direction === v.direction)!;
    return {
      token: addr(token),
      oapp: addr(bundle.state.asset.oapp),
      eid: u64(v.eid),
      direction: v.direction,
      grade: v.grade,
      independent: u64(v.effectiveIndependent ?? 0),
      requiredDvns: u64(s.effective.requiredDVNCount === 255 ? 0 : s.effective.requiredDVNCount),
      confirmations: u64(s.effective.confirmations),
      pinned: bool(!s.libraryIsDefault),
      block: u64(bundle.state.scan.block),
      operators: clip(v.operators.join(",")),
      bundleHash: hash,
    };
  });
}

export function arkivClients(opts: { accessKey: string; privateKey?: Hex }) {
  const chain = rabdi({ accessKey: opts.accessKey });
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = opts.privateKey ? createWalletClient({ chain, transport: http(), account: privateKeyToAccount(opts.privateKey) }) : null;
  return { publicClient, walletClient };
}

export const EXPIRATION_DAYS = 180;

export async function publishRating(wallet: WalletArkivClient, values: ReturnType<typeof ratingValues>) {
  return wallet.createEntity(FloorRating, values, { expiration: ExpirationTime.fromDays(EXPIRATION_DAYS) });
}

export async function publishRoutes(wallet: WalletArkivClient, values: ReturnType<typeof routeValues>) {
  const out = [];
  for (const v of values) out.push(await wallet.createEntity(FloorRoute, v, { expiration: ExpirationTime.fromDays(EXPIRATION_DAYS) }));
  return out;
}

/** Latest rating for a token, written by Floor's writer wallet only (anyone can write to a schema name). */
export async function latestRating(client: PublicArkivClient, writer: Address, token: Address) {
  const { entities } = await client.select().from(FloorRating).where(eq("token", addr(token))).ownedBy(writer).orderBy(desc("block")).fetch();
  return entities[0] ?? null;
}

/** The Mirror-track query: every route that resolves to a single effective verifier. */
export async function singleVerifierRoutes(client: PublicArkivClient, writer: Address) {
  const { entities } = await client.select().from(FloorRoute).where(and(eq("direction", "receive"), eq("independent", u64(1)))).ownedBy(writer).fetch();
  return entities;
}
