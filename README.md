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
| `packages/verifier` | Browser verifier: raw replay, state-vs-raw, grade reproduction, multi-RPC rotation with rate-limit benching and timeouts, Anon-RPC traffic meter | 14 (live: 624/624 reads verified on mainnet) |
| `apps/verify-lab` | Minimal browser page: the verifier through EF Anon-RPC (Nym / tor-js / passthrough / direct); integration reference for `apps/web` | manual, in Chrome (results in `docs/evidence/anon-rpc/`) |
| `packages/publish` | Arkiv schemas + queries, Swarm upload/fetch, re-runnable importer | 6 (live Arkiv read) + Swarm round trip |
| `cre/floor-rating` | Chainlink CRE workflow (TypeScript); compiles to WASM with `cre-compile` | 8 (live) + 3 end-to-end in the CRE SDK runtime |
| `contracts` | FloorRegistry, FloorBroadcaster, FloorMirror (CCIP 2.0), FloorSentinel, AaveFreezeEnforcer, deploy scripts | 35 (incl. fuzz, invariants, Base + mainnet forks) |
| `arkiv/` | Arkiv judging files: schema, friction, reach, why-arkiv, data-quality, swarm | — |
| `apps/web` | UI prototype (design handoff) | — |
| `docs/` | Research, evidence, design; corrections log in `docs/00` | — |

## Headline results (all reproducible)

- **Kelp replay (mainnet fork, the attacker's real transactions):** without Floor the attacker borrows; with Floor the real supply tx reverts with Aave `ReserveFrozen()` and **$0 is borrowed on Aave**. After the freeze, **repay and liquidation still work**. `contracts/test/fork/KelpReplay.t.sol`
- **rsETH the day before the hack (block 24,908,284):** BREACHED. 24 of 26 inbound routes resolve to one effective verifier; 25 of 26 receive libraries were unpinned; controlled by a 3-of-6 Safe with no timelock. `packages/resolver/fixtures/rseth-24908284.json`
- **Inbound limits, 64 LayerZero adapters over Aave-listed tokens on 8 chains (2026-11-07):** 31 release their full escrow, or mint without a cap, on one inbound message; 4 are inbound rate-limited (EtherFi weETH, PYUSD `0xa2c3`, USDG `0x147b` on Ethereum, USDG on Ink); 8 undetermined (custom codecs / empty escrow); 21 inactive or LayerZero v1. Every decisive result cross-checked on a second RPC. `docs/09`, `docs/evidence/inbound/`
- **Real Morpho Vault V2 (Base fork):** a BREACHED rating makes FloorSentinel cut the collateral cap to 0; the sentinel cannot raise caps. `contracts/test/fork/MorphoBaseFork.t.sol`
- **CCIP 2.0:** registry → broadcaster → mirror state change on the CCIP 2.0 local simulator; Sepolia → Arbitrum Sepolia is a v2.0 lane (checked with `@chainlink/ccip-sdk`).
- **CRE:** the workflow passes `cre workflow simulate` (CRE CLI v1.39.0): fetches the feed, re-reads the evidence on Ethereum mainnet at the pinned block, 4/4 reads match. `docs/evidence/cre/simulate-2026-11-06.txt`
- **Anon-RPC:** in Chrome, the verifier re-checked all 624 reads of the rsETH bundle over **Tor (tor-js): VERIFIED in 50 s**, and over the **Nym mixnet**: VERIFIED in 70–103 s; **99.7–99.8% of requests through Anon-RPC** (the other 2 are the harness's bootstrap read, by design). One flipped byte gives MISMATCH. The page finds the rating on Arkiv and downloads the bundle from Swarm first (tested against a local Swarm node; live once published). `docs/evidence/anon-rpc/2026-11-06-browser-runs.md`

## CROPS

- **C (censorship resistant):** checking a grade needs no Floor server. The evidence bundle is on Swarm, its hash is on Arkiv and in the CRE report onchain, and every chain read goes through Anon-RPC and rotates across several RPC providers, any of which you can swap in the page. The rating is also mirrored to a second chain over CCIP. *Limits today:* the default RPCs are free public endpoints; the tor-js gateways are temporary and run by others (production needs its own); the site itself is not yet served from Swarm.
- **O (open source):** Apache-2.0. All code, the rule pack, the evidence bundles, the importer and every test are in this repo; anyone can re-run the resolver at the same block and get the same bytes.
- **P (private):** the browser verifier routes the Arkiv lookup, the Swarm download and every chain read through EF Anon-RPC (Tor by default; Nym selectable, but Nym drops the Content-Type header so the Arkiv lookup then goes direct, shown on the meter). Measured share: 99.7–99.8% of requests; the 2 direct reads are the harness reading the specifier contract before the anonymised fetch exists, which only reveals that Anon-RPC is in use. No trackers, analytics or third-party scripts. *Limits:* RPC providers still see the queries (not who sent them); "passthrough" mode exists for testing and is labelled not anonymous.
- **S (secure):** the verifier trusts nothing from Floor: hash check, byte-for-byte replay of every read, decoded-state check and grade recomputation. Any failure ends MISMATCH or UNVERIFIED_RPC, never VERIFIED (tests). Anon-RPC worker bundles are hash-pinned onchain and run sandboxed. Enforcement contracts can only reduce risk (invariant tests). *Not yet audited.* *Testnet limit:* the CRE **simulation** forwarder on Sepolia checks no signatures, so anyone can push a report into our Sepolia registry through it (asserted in `contracts/test/fork/CreForwarderSepolia.t.sol`); the registry's newer-scan-only rule makes replays harmless, and the sentinel can only lower caps. Production uses Chainlink's KeystoneForwarder, which verifies the DON's signatures, plus the registry's workflow owner/name check.

Run the verifier yourself: `pnpm --filter @floor/verify-lab dev` → http://127.0.0.1:5181 (see `apps/verify-lab/README.md`).

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

## Commands that need your credentials

The whole sequence is rehearsed on local forks, as the real deployer, by `scripts/rehearse.sh` (28 checks; run it before deploying).

Never paste keys into files. Use a Foundry keystore (`cast wallet import`) and environment variables.

| # | Step | Command |
|---|---|---|
| 1 | CRE CLI + login | ✅ `curl -sSL https://app.chain.link/cre/install.sh \| bash && cre login`. Deploy access was not granted for the hackathon; the prize rules say simulation is enough (`docs/11`), and `cre workflow simulate --broadcast` writes onchain (step 5) |
| 2 | Deploy registry + broadcaster (Ethereum Sepolia) | `cd contracts && CRE_FORWARDER=0x15fC6ae953E024d975e77382eEeC56A9101f9F88 CCIP_ROUTER=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 forge script script/Deploy.s.sol:DeployHome --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --account floor-deployer-2 --gas-estimate-multiplier 900` (**900**: Sepolia runs Glamsterdam, whose state-creation repricing (EIP-8037) Forge 1.8.1 does not model; a first attempt with Forge's estimate ran out of gas, txs `0xf43d…d681` / `0x3006…4cc`) (forwarder = CRE *simulation* MockKeystoneForwarder; a live CRE deployment, with the production KeystoneForwarder, is a post-hackathon step once deploy access is granted) |
| 3 | Deploy mirror (Base Sepolia) | `CCIP_ROUTER=0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93 SOURCE_CHAIN_SELECTOR=16015286601757825753 SOURCE_BROADCASTER=<step 2 broadcaster> forge script script/Deploy.s.sol:DeployMirror --rpc-url https://sepolia.base.org --broadcast --account floor-deployer-2 --gas-estimate-multiplier 300` |
| 4 | Point the workflow at the registry | ✅ `registryAddress` in `cre/floor-rating/config.staging.json` = `0xE69c3e47DdaB083D0Ba4D8aD2B2dA8531ec18220` (deployer nonce 2); check it matches step 2. `gasLimit` 3,000,000 (state writes cost more on Glamsterdam Sepolia) |
| 5 | Simulate the CRE workflow (prize requirement) | ✅ dry run done 2026-11-06 (`docs/evidence/cre/simulate-2026-11-06.txt`). Onchain write after step 4: `cd cre && cre workflow simulate floor-rating --target staging-settings --non-interactive --trigger-index 0 --broadcast` with `CRE_ETH_PRIVATE_KEY` set in your shell (not in a file). **Then check the registry**, because the forwarder reports success even if the receiver rejects the report: `cast call <registry> "ratingOf(address)((uint8,bool,uint64,uint32,uint64,bytes32))" 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7 --rpc-url <sepolia>` must show grade 3 (BREACHED), known = true |
| 6 | Broadcast via CCIP to Base Sepolia | `cast send <broadcaster> "broadcast(uint64,address,address[])" 10344971235874465080 <mirror> "[0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7]" --value <quote> --rpc-url <sepolia> --account floor-deployer-2` (get `<quote>` with `cast call <broadcaster> "quote(uint64,address,address[])(uint256)" 10344971235874465080 <mirror> "[0xA129…]"`; delivery takes minutes, track it at ccip.chain.link) |
| 7 | Swarm public upload | `pnpm --filter @floor/publish run importer --bundle packages/resolver/fixtures/rseth-24908284.json:0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7 --swarm-gateway https://api.gateway.ethswarm.org` (the public gateway stamps uploads; the importer reads the bytes back and checks the hash) |
| 8 | Arkiv write (rating + 52 routes + the 64-adapter dataset + rsETH flight recorder) | from the repo root: preflight `pnpm --filter @floor/publish run importer --bundle packages/resolver/fixtures/rseth-24908284.json:0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7 --swarm-ref ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778 --dataset --arkiv-estimate 0x563567A5788820093f71951DA383838D71ad2360` (no key); then the same with `--arkiv` instead of `--arkiv-estimate …`, with `ARKIV_PRIVATE_KEY` and `ARKIV_ACCESS_KEY` set in your shell only |
| 9 | Morpho Vault V2 + FloorSentinel on Base Sepolia (reads the mirror) | `FLOOR_RATING=<mirror> VAULT_V2_FACTORY=0xE3a2CEbca662d99D0F279aF13a6bb8c9825D2ea0 VAULT_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e forge script script/MorphoDemo.s.sol:MorphoDemo --rpc-url https://sepolia.base.org --broadcast --account floor-deployer-2 --gas-estimate-multiplier 300`; after the CCIP message lands, anyone: `cast send <sentinel> "poke(address)" 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7 --rpc-url https://sepolia.base.org --account floor-deployer-2`. (No Sepolia vault: createVaultV2 costs ~34M gas there since Glamsterdam; the Sepolia flow is fork-tested.) |
| 10 | Licence | ✅ Apache-2.0 (`LICENSE`) |

## Live testnet deployment

Everything below is live and was checked onchain (full table with tx hashes: `docs/evidence/live-2026-11-07.md`).

- **Web app (all screens, live Enforcement reads), served from Swarm:** https://bah5acgzaqd7ip6r62qfygexx6ue3nvzfme47guje2362bulcyxsusjk5w4ua.bzz.limo/ (`#/enforcement` for the live loop)
- **Verify + dataset pages, served from Swarm:** https://bah5acgzaj4pea2h3q3knmuv4u2ng24wv4x3p5hbhlyi7n5dkbluwu6ejbv7q.bzz.limo/ (`dataset.html` for the Arkiv query)
- **Ethereum Sepolia:** FloorRegistry `0xE69c3e47DdaB083D0Ba4D8aD2B2dA8531ec18220` (rsETH = BREACHED, written by the CRE workflow), FloorBroadcaster `0x83ccA5fFB6389fff54Dbde6709779a8e92F945D4`
- **Base Sepolia:** FloorMirror `0xDA6E769b22ecb6815cea57aBf61494a07E571Dd6` (rating delivered by CCIP), Morpho Vault V2 `0xff5E3b49d94AA7C5213938c4B8FF1983456869Be`, FloorSentinel `0x83ccA5fFB6389fff54Dbde6709779a8e92F945D4`. **Detected on Ethereum, protection fired on Base:** the sentinel cut the vault's rsETH cap 1,000,000 USDC → 0 (tx `0x2e02faf9…7908`)
- **Swarm evidence:** `ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778`
- **Arkiv writer:** `0x563567A5788820093f71951DA383838D71ad2360` (Rabdi)

## Arkiv queries (all filtered by the writer as creator)

```ts
// the Mirror-track query: every adapter backing Aave collateral that can release everything in one message
client.select().from(FloorAdapter).where(eq("outcome", "NO_INBOUND_LIMIT")).createdBy(writer).orderBy(desc("routes")).fetch()
// the flight recorder: rsETH's sourced bridge history, oldest first
client.select().from(FloorEvent).where(eq("token", addr(rsETH))).createdBy(writer).orderBy(asc("block")).fetch()
// a rating and its routes
client.select().from(FloorRating).where(eq("token", addr(rsETH))).createdBy(writer).orderBy(desc("block")).fetch()
```

## Libraries used

forge-std, chainlink-local v0.3.1 (contracts-ccip 2.0.0), @chainlink/cre-sdk 1.23.0, @arkiv-network/sdk 1.0.1, @ethersphere/bee-js 13.2.0, viem, zod, vitest, Vite + React (prototype). Morpho Vault V2, Aave V3, LayerZero V2 and Safe contracts are used as deployed onchain (forks), not vendored.
