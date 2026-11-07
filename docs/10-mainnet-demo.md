# 10 · Mainnet demo: the full loop on our own contracts

> **Status at submission (2026-11-07): not done on mainnet, by decision (no real funds).** The same loop ran on public testnets instead: CRE wrote the rsETH grade to FloorRegistry on Ethereum Sepolia, CCIP carried it to FloorMirror on Base Sepolia, and FloorSentinel cut a real Morpho Vault V2 cap there to 0. Every tx: [`evidence/live-2026-11-07.md`](evidence/live-2026-11-07.md). The plan below (own test OFT, re-enacting the config change on stage) is the post-hackathon mainnet milestone.

**What no other team will show:** Kelp's mistake re-enacted on mainnet with real LayerZero contracts, and Floor cutting a real Morpho vault's cap automatically, with every step a verifiable tx.

## Loop

1. Deploy our own clearly-labelled test OFT on two cheap chains (e.g. Base ↔ Arbitrum) with **3 real DVNs**, pinned receive library.
2. Create a Morpho market with that token as collateral and our own **Morpho Vault V2** with a few dollars of USDC. Morpho vault creation is permissionless (`factory.createVaultV2(owner, asset, salt)`); owner calls `setIsSentinel(floorSentinel, true)`. Sentinels can "instantly decrease absolute or relative caps" (Morpho docs) and cap decreases are exempt from timelocks (vault-v2 README).
3. On stage, our demo Safe drops the route from 3 DVNs to 1 (Kelp's Apr 2 2025 change, re-enacted).
4. Floor detects it → CRE workflow (simulated or deployed) produces the signed BREACHED report → `FloorRegistry` → `FloorSentinel` calls `decreaseAbsoluteCap` on the vault → CCIP carries the rating to `FloorMirror` on the second chain (state change on receive).
5. Show explorer links, a timer ("caught in N seconds" vs 12.5 months), and the history on Arkiv.

## Safety rules (non-negotiable)

- Forged-message tests stay on forks. Never send forged messages at real contracts.
- The guard never goes on a Safe holding real funds (unaudited; brick risk, see [08](08-safe-guard-findings.md)).
- Test token: name/symbol marked TEST, no liquidity pool, no value, no promotion.
- Publish aggregates about real routes only (same detail level already public in Aave's forum).
- Keep vault deposits tiny; no third-party deposits accepted.

## Costs (ESTIMATE)

Gas on Base/Arbitrum: cents per tx. LayerZero message fees: a few dollars each. CCIP fee in LINK or native: a few dollars. Morpho vault seed: a few dollars of USDC.

## Open items

- Confirm Morpho Vault V2 factory + Morpho Blue market addresses on the chosen chains (docs.morpho.org contracts page).
- Market oracle for a test token: a fixed oracle is acceptable here **only** because it is our own test market; label it in the UI.
- Confirm the CCIP lane version (v2.0 vs pre-v2.0) for the chosen pair before claiming "CCIP 2.0" ([11](11-sponsors-and-prizes.md)).
