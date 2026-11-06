/**
 * Landing copy and figures.
 *
 * Every number here is reproduced by something in this repo, and carries the
 * path that reproduces it. Community figures we have NOT reproduced do not
 * appear on the landing page at all — see docs/00-evidence-policy.md and the
 * "not yet reproduced" note in docs/02.
 */

import { chainName } from "@floor/core";
import { findAsset } from "./mock";

export const site = {
  name: "Floor",
  line: "Effective-state security ratings for onchain collateral, with bounded enforcement.",
  /** docs/01-overview.md:5 */
  pitch: "Kelp's attacked bridge route had one checker for 12.5 months. Every lender accepted rsETH anyway.",
  repo: "https://github.com/MeghVyas3132/Floor.eth",
} as const;

/** The hero verdict. docs/01:19, packages/resolver/fixtures/rseth-24908284.json */
export const verdict = {
  asset: "rsETH",
  block: "24,908,284",
  when: "the day before the hack",
  grade: "BREACHED",
  /** The binding constraint, not just the grade. */
  capped: "24 of 26 inbound routes resolve to a single effective verifier",
  also: [
    "25 of 26 receive libraries unpinned",
    "controlled by a 3-of-6 Safe with no timelock",
    "3 independent RPCs agree on every read",
  ],
} as const;

export type Figure = { value: string; label: string; source: string };

export const figures: Figure[] = [
  {
    value: "12.5mo",
    label: "the attacked route ran on one verifier, unnoticed",
    source: "docs/03 · onchain timeline",
  },
  {
    value: "$0",
    label: "borrowed on Aave in the fork replay, with Floor live",
    source: "contracts/test/fork/KelpReplay.t.sol",
  },
  {
    value: "624/624",
    label: "onchain reads re-verified in the browser, no trust in us",
    source: "packages/verifier",
  },
  {
    value: "20/34",
    label: "Ethereum adapters release their whole escrow on one message",
    source: "docs/09 · block 26,351,514",
  },
];

/** docs/02 "The problem in six parts", trimmed to the three that carry the pitch. */
export const gap = [
  {
    head: "Effective is not configured",
    body: "A LayerZero field set to 0 inherits the endpoint default, and LayerZero can change that default without the app touching anything. An optional threshold can quietly make “3 verifiers” mean “any 1 of 3”.",
    source: "docs/07 · effective-state rules",
  },
  {
    head: "Guards fire on change. This never changed",
    body: "Aave's guardian reacts to hard adverse signals. rsETH's verifier config sat still for 12.5 months, so there was no signal to react to. Floor grades standing state, so it catches risk that does not move.",
    source: "docs/01:40",
  },
  {
    head: "Every lender has different rules",
    body: "Aave, Morpho curators, Euler, Spark, Fluid and Compound each decide their own thresholds, and nobody checks all of them continuously. A shared verifier failing is invisible until it is not.",
    source: "docs/02:8",
  },
] as const;

/** contracts/test/fork/KelpReplay.t.sol — the attacker's real transactions, mainnet fork. */
export const replay = {
  head: "The attacker's real transactions, replayed on a mainnet fork",
  sub: "Block 24,908,284. Same calldata, same accounts. The only difference is whether Floor is live.",
  without: {
    label: "Without Floor",
    outcome: "Borrow succeeds",
    body: "The attacker supplies forged rsETH and borrows WETH, as happened at block 24,908,307.",
  },
  with: {
    label: "With Floor",
    outcome: "$0 borrowed on Aave",
    body: "The supply transaction reverts with Aave's own ReserveFrozen(). Repay and liquidation keep working after the freeze.",
  },
  source: "contracts/test/fork/KelpReplay.t.sol",
} as const;

/** README.md "How it works". Each step names the thing that actually runs. */
export const pipeline = [
  { step: "Resolve", body: "Read the asset's effective config at a pinned block, cross-checked across 3 independent RPCs.", tag: "packages/resolver" },
  { step: "Bundle", body: "Freeze the evidence into a hashed bundle. Bytes to Swarm, index to Arkiv.", tag: "packages/publish" },
  { step: "Grade", body: "Every CRE node re-reads the evidence at that block and agrees a lower-bound grade.", tag: "cre/floor-rating" },
  { step: "Attest", body: "The signed report lands in FloorRegistry, and CCIP 2.0 mirrors it to a second chain.", tag: "contracts" },
  { step: "Enforce", body: "Morpho caps cut to zero, Aave reserves freeze. Never a pause, never a blocked repay.", tag: "FloorSentinel" },
  { step: "Verify", body: "Anyone replays every read in their own browser and reproduces the grade.", tag: "packages/verifier" },
] as const;

/** README.md repo map. Test counts are what `pnpm -r test` and `forge test` report. */
export const built = [
  { path: "packages/core", what: "Rule pack, effective-independence math, canonical hashing", tests: "17" },
  { path: "packages/resolver", what: "LayerZero scanner, 3-RPC cross-check, inbound-limit probe", tests: "12 live" },
  { path: "packages/verifier", what: "Browser verifier: raw replay, grade reproduction, traffic meter", tests: "9 live" },
  { path: "packages/publish", what: "Arkiv schemas and queries, Swarm upload, re-runnable importer", tests: "6 + round trip" },
  { path: "cre/floor-rating", what: "Chainlink CRE workflow, compiles to WASM", tests: "8 + 3 e2e" },
  { path: "contracts", what: "Registry, broadcaster, CCIP mirror, sentinel, freeze enforcer", tests: "35 incl. forks" },
] as const;

/** The claim that separates Floor from a dashboard you have to believe. */
export const verify = {
  head: "You do not have to trust the grade",
  body: "The verifier runs in your browser. It pulls the bundle from Swarm, checks the hash, replays every onchain read through an independent RPC, re-runs the rules, and tells you whether it got the same answer. On mainnet it has reproduced 624 of 624 reads.",
  cta: { label: "Open the verifier", to: "/verify/rseth-prehack" },
  source: "packages/verifier · 9 live tests",
} as const;

export const stack = [
  { name: "Chainlink CRE", role: "Consensus grading and the signed report" },
  { name: "CCIP 2.0", role: "Status changes carried to a second chain" },
  { name: "Arkiv", role: "Queryable rating and route history" },
  { name: "Swarm", role: "Evidence bundles, addressed by hash" },
] as const;

/**
 * Ticker content: the real receive routes from the day-before-the-hack scan,
 * read straight off the resolver fixture. Nothing here is invented — if it
 * scrolls past, it was onchain at block 24,908,284.
 */
export const routeTicker = (() => {
  const b = findAsset("rseth-prehack")?.bundle;
  if (!b) return [] as { chain: string; verifiers: number | null }[];
  return b.verdict.routes
    .filter((r) => r.direction === "receive")
    .map((r) => ({ chain: chainName(r.eid), verifiers: r.effectiveIndependent }));
})();

export const nav = [
  { label: "The gap", href: "#gap" },
  { label: "Replay", href: "#replay" },
  { label: "How it runs", href: "#pipeline" },
  { label: "Built", href: "#built" },
] as const;
