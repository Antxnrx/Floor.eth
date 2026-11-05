# AGENTS.md: instructions for AI agents working on Floor

Read [`docs/README.md`](docs/README.md) first. Then [`docs/00-evidence-policy.md`](docs/00-evidence-policy.md).

## What Floor is

A lender-side, effective-state security rating for collateral assets (OK / DEGRADED / BREACHED / UNKNOWN) with bounded enforcement. It encodes Aave's DAO-approved risk framework as rules ([docs/04](docs/04-aave-framework.md)).

## Hard rules

1. **No unsourced numbers.** Every number, quote or claim in code comments, docs, UI copy or commits needs a primary source, an onchain reference at a pinned block, or a label: ESTIMATE / HYPOTHESIS / UNVERIFIED / MODELLED.
2. **Effective state only.** Never score raw config. Resolve defaults (`0`), NIL (`255`), optional thresholds, operator collapse, library pinning and grace periods ([docs/07](docs/07-effective-state-rules.md)). Failed reads = `UNKNOWN`, never `OK`.
3. **Enforcement is bounded.** Code must never move funds, pause protocols, block repay/withdraw/liquidation, touch price feeds, or self-re-enable. Add invariant tests for any enforcer.
4. **Safety.** Forged-message tests run on forks only, never live networks. Guards never go on Safes holding real funds. Test tokens are labelled TEST and have no liquidity.
5. **ETHGlobal rules** ([docs/18](docs/18-ethglobal-rules.md)): small, frequent commits; no pre-event project code; record AI assistance in `AI-USAGE.md`; keep specs and plans in the repo.
6. **No personal names** of team members or contributors in code, docs or commits.
7. **Cite, don't paraphrase,** when quoting governance or prize rules. Attribute exactly (LlamaRisk vs Aave Labs vs community analyst, thread + post number).

## Key constants (verified)

| Name | Value |
|---|---|
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| ReceiveUln302 / SendUln302 | `0xc02Ab410f0734EFa3F14628780e6e695156024C2` / `0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1` |
| LayerZero Labs DVN | `0x589dEDbD617e0CBcB916A9223F4d1300c294236b` |
| rsETH OFT adapter | `0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3` |
| Kelp replay fork block | `24,908,284` (drain at 24,908,285) |
| Arkiv Rabdi testnet | RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, chain ID `7794095` |

## Correctness fixture

The resolver must reproduce, for the rsETH adapter at block 24,908,284: 26 peers; 24 routes 1-of-1 (LZ Labs DVN); eids 30217 and 30325 2-of-2; Unichain (30320) receive library `isDefault = true`; owner and delegate = Safe `0xCbcd…29A1` (3-of-6). Raw data: [docs/evidence/onchain/](docs/evidence/onchain/).

## Tooling

Foundry (`~/.foundry/bin`), Node 26 + pnpm, Go, Python 3, Docker. Public archive-capable RPCs (checked 2026-11-06): `https://eth.drpc.org`, `https://eth-mainnet.public.blastapi.io`, `https://gateway.tenderly.co/public/mainnet`. publicnode now needs a token for historical reads.

## Commands

- Tests: `pnpm -r test` · live: `FLOOR_LIVE=1 pnpm -r test` · contracts: `cd contracts && forge test` · CRE runtime: `cd cre/floor-rating && bun test test/workflow.bun.test.ts`
- Scan: `pnpm --filter @floor/resolver scan --oapp <addr> --block <n> --symbol <S> --out bundle.json`
- Inbound probe: `pnpm --filter @floor/resolver inbound --block <n> --out results.json`
- Feed: `pnpm --filter @floor/resolver feed --bundle bundle.json:<token> --out feed.json`
- Importer (dry run by default): `pnpm --filter @floor/publish run importer --bundle bundle.json:<token> [--swarm] [--arkiv]`
- Never `--broadcast`, never send transactions, never write to Arkiv/Swarm mainnet without the user's explicit go-ahead.
