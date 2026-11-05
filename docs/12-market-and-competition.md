# 12 · Market and competition

## Customers

| Customer | Pain | Pays for | Price (HYPOTHESIS) |
|---|---|---|---|
| **Token issuers** (LRTs, LSTs, bridged stables, RWA tokens) | "Prove we pass Aave's rules or lose listing / exposure." | Attest: continuous compliance, evidence pack, drift alerts, pre-sign check, guard | $2–10k / month / asset |
| **Curators** (e.g. Steakhouse ~$2.7B on Morpho, Gauntlet ~$0.9B, MEV Capital, Re7) | "Is anything in my vaults silently unsafe?" | Monitoring + Sentinel enforcement | $5–25k / month |
| **Lending DAOs** (Aave, Spark, Euler, Fluid, Compound) | Enforcing a framework across hundreds of assets | Data feed for guardians, enforcer adapters, blast radius | Yearly service-provider contract |
| **Insurers / underwriters** | Pricing bridge and key risk | Ratings feed + history | Data licence |
| **Exchanges / custodians** | Listing due diligence on bridged tokens | API | Usage-based |

Curator AUM: Morpho API `curators{state{aum}}`, read 2026-11-06.

## Size (ESTIMATE)

A few hundred serious bridged or wrapped collateral assets across major lenders × $30–100k/year ≈ **$10–50M ARR** for the first wedge (bottom-up guess; no reliable category figure exists). Expansion: every listed token, RWA collateral (Aave Horizon), exchange listings, insurers.

Context:
- Lending TVL (DefiLlama, Sep 15 2026): Aave V3 $17.48B · Morpho $9.95B · Spark $4.96B.
- 2026 hacks: record first half by incident **count**; Q3 losses ~$1.17–1.26B depending on firm (Finbold, Hacken, CertiK). H1 2026: 74–76% of losses from infrastructure / key compromise (Blockaid; TRM Labs).
- Acquirers exist: Chainalysis bought Hexagate (Dec 19 2024; terms undisclosed; ~$60M per Calcalist, ESTIMATE); RedStone bought Credora (Sep 4 2025); Hypernative ~$65M raised (CB Insights aggregate; its latest round $40M Series B).

## Competition

| Player | What they do | Gap Floor fills |
|---|---|---|
| **Aave / LlamaRisk Freeze Guardian + Cap Oracle** | In-house on CRE, Aave-only; guardian fires on hard adverse signals; cap oracle proactive | Aave-only, signal-triggered, no issuer product. Floor = neutral data source for it; both on CRE |
| **Chaos Labs** | Risk oracles for market parameters | Left Aave (announced Apr 6 2026). Market risk, not security config |
| **Credora (RedStone)** | Credit ratings for Morpho/Spark vaults | Financial models; no config-level checks; no enforcement |
| **Exponential, Webacy** | A–F protocol/token risk scores | Mostly static; no enforcement |
| **L2BEAT** | Risk framework for L2s and bridges | Per bridge/chain, not per token's effective setup; no enforcement |
| **Hypernative, Hexagate (Chainalysis), BlockSec Phalcon** | Runtime threat detection, automated pause | Detect attacks in progress; don't certify standing posture. Complementary |
| **Blockaid Bridge Sentinel** | Opt-in **DVN** that can refuse to sign (date UNVERIFIED) | Issuer-side, LayerZero-side; Floor is lender-side + issuer attestation. Complementary; also a verifier Floor can score |
| **Safe Security Hub / Safe Guardrail** | Safe-side protections | Safe-only; not collateral posture |
| **ZKSC / Ninja** | Building a "neutral, cross-protocol dependency graph" (stated in Aave forum t/25114 post #4) | Direct overlap with blast radius. Floor's difference: rule packs, grades, enforcement, issuer attestation |
| **Community analysts** (e.g. Aave forum t/25114 #10/#11) | One-off scans of verifier sets and inbound limits | Snapshot, not continuous; no enforcement. Potential collaborators |

**Our combination:** effective-state graph + drift vs signed manifest + per-lender policy + bounded automatic enforcement across lenders + shift-left checks for issuers + a public, recomputable record. **We found no product doing all of these.** (Do not say "first".)
