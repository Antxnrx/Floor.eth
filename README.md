# Floor

Effective-state security ratings for onchain collateral, with bounded enforcement.

> "Kelp's attacked bridge route had one checker for 12.5 months. Every lender accepted rsETH anyway."

Floor continuously grades who or what can release a collateral asset, how many independent parties must agree, and how fast those settings can change. It encodes Aave's DAO-approved risk framework as code, and lets lenders act on the grade automatically, without ever moving funds or blocking repayments or liquidations. Every grade carries its evidence, and anyone can re-verify it in a browser without trusting Floor.

Built at ETHGlobal Mumbai (Nov 5–7 2026). Docs: [`docs/README.md`](docs/README.md). Agent rules: [`AGENTS.md`](AGENTS.md). AI disclosure: [`AI-USAGE.md`](AI-USAGE.md).

## How it works

```
resolver (pinned block, 3 RPCs)  ->  evidence bundle  ->  Swarm (bytes)  +  Arkiv (floor.rating / floor.route)
        |                                   |
        v                                   v
   CRE feed  ->  CRE workflow: re-reads the evidence at the pinned block on every node, checks a lower-bound grade
                  -> signed report -> FloorRegistry  -> FloorBroadcaster --CCIP 2.0--> FloorMirror (2nd chain)
                                            |
                          FloorSentinel (Morpho V2 caps)  /  AaveFreezeEnforcer (freeze)
browser verifier: Arkiv -> Swarm -> hash check -> replay every read via Anon-RPC -> re-run rules -> VERIFIED
```

## Repo map

| Path | What | Tests |
|---|---|---|
| `packages/core` | Types, Aave rule pack v0, effective-independence math, canonical hashing | 17 |
| `packages/resolver` | LayerZero effective-state scanner (3-RPC cross-check), inbound-limit probe, CRE feed builder | 12 (live) |
| `packages/verifier` | Browser verifier: raw replay, state-vs-raw, grade reproduction, Anon-RPC traffic meter | 9 (live: 624/624 reads verified on mainnet) |
| `packages/publish` | Arkiv schemas + queries, Swarm upload/fetch, re-runnable importer | 6 (live Arkiv read) + Swarm round trip |
| `cre/floor-rating` | Chainlink CRE workflow (TypeScript); compiles to WASM with `cre-compile` | 8 (live) + 3 end-to-end in the CRE SDK runtime |
| `contracts` | FloorRegistry, FloorBroadcaster, FloorMirror (CCIP 2.0), FloorSentinel, AaveFreezeEnforcer, deploy scripts | 35 (incl. fuzz, invariants, Base + mainnet forks) |
| `arkiv/` | Arkiv judging files: schema, friction, reach, why-arkiv, data-quality, swarm | — |
| `apps/web` | UI prototype (design handoff) | — |
| `docs/` | Research, evidence, design; corrections log in `docs/00` | — |

## Headline results (all reproducible)

- **Kelp replay (mainnet fork, the attacker's real transactions):** without Floor the attacker borrows; with Floor the real supply tx reverts with Aave `ReserveFrozen()` and **$0 is borrowed on Aave**. After the freeze, **repay and liquidation still work**. `contracts/test/fork/KelpReplay.t.sol`
- **rsETH the day before the hack (block 24,908,284):** BREACHED. 24 of 26 inbound routes resolve to one effective verifier; 25 of 26 receive libraries were unpinned; controlled by a 3-of-6 Safe with no timelock. `packages/resolver/fixtures/rseth-24908284.json`
- **Inbound limits, 34 Ethereum adapters over Aave-listed tokens (block 26,351,514):** 20 adapters release their full escrow on one inbound message; only EtherFi weETH's main adapter is rate-limited (caps measured per route). `docs/09`
- **Real Morpho Vault V2 (Base fork):** a BREACHED rating makes FloorSentinel cut the collateral cap to 0; the sentinel cannot raise caps. `contracts/test/fork/MorphoBaseFork.t.sol`
- **CCIP 2.0:** registry → broadcaster → mirror state change on the CCIP 2.0 local simulator; Sepolia → Arbitrum Sepolia is a v2.0 lane (checked with `@chainlink/ccip-sdk`).

## Run the tests

```bash
pnpm install
pnpm -r test                               # offline TS suites
FLOOR_LIVE=1 pnpm -r test                  # + live mainnet / Arkiv reads (public RPCs, no keys)
(cd cre/floor-rating && bun test test/workflow.bun.test.ts)     # CRE SDK test runtime (needs bun >= 1.2.21)
(cd contracts && forge test)               # contracts incl. forks (public RPCs; override ETH_RPC_URL / BASE_RPC_URL)
npx @ethersphere/bee-factory start --tag v2.8.1 && (cd packages/publish && FLOOR_SWARM=1 npx vitest run)   # Swarm
```

Tools: Node ≥ 20, pnpm 10, Foundry ≥ 1.8, Bun ≥ 1.2.21 (CRE), Docker (Swarm dev).

## Commands that need your credentials (nothing here was run)

Never paste keys into files. Use a Foundry keystore (`cast wallet import`) and environment variables.

| # | Step | Command |
|---|---|---|
| 1 | CRE CLI + login + deploy access | `curl -sSL https://app.chain.link/cre/install.sh \| bash && cre login && cre account access` (choose "Hackathon") |
| 2 | Deploy registry + broadcaster (Ethereum Sepolia) | `cd contracts && CRE_FORWARDER=0x15fC6ae953E024d975e77382eEeC56A9101f9F88 CCIP_ROUTER=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 forge script script/Deploy.s.sol:DeployHome --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --account <keystore>` (forwarder = CRE *simulation* MockKeystoneForwarder; use the prod KeystoneForwarder after deploy access) |
| 3 | Deploy mirror (Arbitrum Sepolia) | `CCIP_ROUTER=0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165 SOURCE_CHAIN_SELECTOR=16015286601757825753 SOURCE_BROADCASTER=<step 2 broadcaster> forge script script/Deploy.s.sol:DeployMirror --rpc-url https://sepolia-rollup.arbitrum.io/rpc --broadcast --account <keystore>` |
| 4 | Point the workflow at the registry | set `registryAddress` in `cre/floor-rating/config.staging.json` to the step-2 registry |
| 5 | Simulate the CRE workflow (prize requirement) | ✅ dry run done 2026-11-06 (`docs/evidence/cre/simulate-2026-11-06.txt`). Onchain write after step 4: `cd cre && cre workflow simulate floor-rating --target staging-settings --non-interactive --trigger-index 0 --broadcast` with `CRE_ETH_PRIVATE_KEY` set in your shell (not in a file) |
| 6 | Broadcast via CCIP | `cast send <broadcaster> "broadcast(uint64,address,address[])" 3478487238524512106 <mirror> "[0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7]" --value <quote> --rpc-url <sepolia> --account <keystore>` (get `<quote>` with `cast call <broadcaster> "quote(uint64,address,address[])(uint256)" …`) |
| 7 | Swarm public upload | buy a batch (Beeport or a Bee light node on Gnosis), then `BEE_URL=<node> BEE_BATCH_ID=<batch> pnpm --filter @floor/publish run importer --bundle packages/resolver/fixtures/rseth-24908284.json:0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7 --swarm` |
| 8 | Arkiv write | faucet + access key at hub.arkiv.network, then `ARKIV_PRIVATE_KEY=… ARKIV_ACCESS_KEY=… pnpm --filter @floor/publish run importer --bundle …:0xA129… --swarm --arkiv`; put the writer address and one query in this README and `arkiv/swarm.md` |
| 9 | Morpho mainnet loop (should-have) | deploy your own Vault V2 via the factory, `DeploySentinel`, then owner `setIsSentinel(sentinel,true)` + curator `watch(...)` (see `contracts/test/fork/MorphoBaseFork.t.sol` for the exact sequence) |
| 10 | Licence | ✅ Apache-2.0 (`LICENSE`) |

## Writer wallet and query (Arkiv)

- Writer wallet: **TODO after step 8**
- Query: `arkiv_query` with `arkiv.schema = str('floor.route') AND independent = u64(1)`, filtered by owner = writer (see `arkiv/schema.md`)

## Libraries used

forge-std, chainlink-local v0.3.1 (contracts-ccip 2.0.0), @chainlink/cre-sdk 1.23.0, @arkiv-network/sdk 1.0.1, @ethersphere/bee-js 13.2.0, viem, zod, vitest, Vite + React (prototype). Morpho Vault V2, Aave V3, LayerZero V2 and Safe contracts are used as deployed onchain (forks), not vendored.
