# 04 · Aave's rules, verbatim, and how Floor encodes them

Two documents. Attribute them correctly.

## A. Aave Risk Framework (LlamaRisk)

- Thread: https://governance.aave.com/t/arfc-aave-risk-framework/25114 · raw text: https://governance.aave.com/raw/25114/1
- **Passed Snapshot**, closed Jul 9 2026: 359,345 For / 0 Against. Proposal `0xe40b377bd4a207aaaaf126738e6e0bc18f16f65a34802c3f143697b2d90666ac`.
- Versions: v1.0 2026-06-09 (initial ARFC) · v1.1 2026-06-12 (bridge-stack roles reallocated with LayerZero) · v1.2 2026-10-06 (adds "Treatment of Externally Managed Instances"; scope = markets within the Aave DAO's risk mandate).
- Four layers: Asset risk · Bridging risk · Monitoring · Chain risk.
- Note: the summary says the framework applies "once the framework is endorsed". The Snapshot vote passed; on-chain AIP status not checked. Say "approved by Aave DAO Snapshot vote, Jul 2026".

### Verbatim requirements Floor encodes

**§2.1 Topology:** "Incomplete topology disclosure on any route carrying Aave exposure is a hard block."

**§2.2 Verifier Set Threshold:**
> "The framework sets a binding floor below which no asset can be onboarded."
> "a verifier network operated by a single organisation counts as one unit regardless of internal node count"
> "A minimum of three independent verifiers (validators, attestors, nodes, or message verifiers) is required on every route carrying Aave exposure."
> "One-of-N and two-of-N configurations are not acceptable as a default baseline regardless of vendor."
> "A route with a verifier set below the threshold is treated as a hard block on cross-chain exposure expansion and triggers non-conformance treatment for existing exposure on the route."

**§2.3 Independence:** verifiers independent across organisations, jurisdictions and infrastructure (RPC providers, hardware, cloud). "Nominal verifier-set decentralisation that collapses under any of the above independence dimensions is treated as a single point of failure for risk-tier purposes."

**§2.4 Mutable libraries:** "Receive libraries (or vendor equivalent) are pinned…" · "Unpinned receive libraries on routes carrying Aave exposure are treated as a hard constraint on the route's exposure tier until pinning is in place."

**§2.5 Timelocks:** timelocks gate ownership transfers, verifier-set changes, library upgrades, rate-limit changes and mint/burn grants; "instantaneous or sub-hour delays are not acceptable."

**§2.8 Per-route rate limiting:** "Inbound and outbound limits are sized separately by direction." "Routes without effective per-route rate limits carrying material Aave exposure are treated as a hard constraint on the asset's exposure tier."

**§2.9 Sizing:** "unbounded headroom is treated as the absence of a meaningful limit."

**§3.2 (guardian):** the Freeze Guardian fires on "hard adverse signals"; the Cap Oracle is proactive. Floor's framing: Aave's guardian is signal-triggered and Aave-only; Floor grades standing state across lenders and can feed it.

## B. Technical Asset Listing Framework (Aave Labs)

- Thread: https://governance.aave.com/t/arfc-technical-asset-listing-framework/24988
- **Passed Snapshot**, closed Jul 13 2026: 437,271 For / ~0 Against. Proposal `0x92600751abd36540057b84a808903e3e1a005d78e9ab1eec712ac0574bca7431`.
- §6 "Bridge and Cross-Chain Risk" requires that verifier/DVN configuration, rate limits and bridge admin controls be documented; weak configurations "should be escalated". No numeric minimum in §6.
- Aave Labs reply #7 (Jul 8 2026), verbatim:
  > "Routes that resolve to a single effective verifier, or to confirmation depths too shallow to resist chain reorganizations, are below bar."
  > "Verifiers operated by the same entity, or co-located on shared infrastructure, collapse to a single effective verifier regardless of the nominal count."
  - Timelock: "(24 hours acceptable, 48 hours preferred)".

## Rule pack v0 (what Floor checks)

| Rule ID | Source | Check | OK | DEGRADED | BREACHED | Onchain source |
|---|---|---|---|---|---|---|
| `AAVE-RF-2.2` | LlamaRisk §2.2 | Effective independent verifiers per route (required + optional threshold, defaults resolved, operators deduped) | ≥3 | 2 | ≤1 | `EndpointV2.getConfig` / `ReceiveUln302.getUlnConfig`; DVN→operator map |
| `AAVE-TALF-R7` | Aave Labs reply #7 | Same-entity / shared-infra collapse | distinct | — | collapses to 1 | operator map (curated) |
| `AAVE-RF-2.4` | §2.4 | Receive library pinned | pinned, no grace period | grace period active | unpinned (`isDefault`) | `getReceiveLibrary`, `receiveLibraryTimeout` |
| `AAVE-RF-2.5` | §2.5 + TALF | Who can change bridge config; timelock | Safe ≥3 signers + timelock ≥24h | Safe, no timelock | EOA delegate/owner | `delegates()`, `owner()`, Safe `getThreshold/getOwners/getModulesPaginated`, guard slot, `getMinDelay` |
| `AAVE-RF-2.8` | §2.8 | Inbound rate limit exists (fork-tested) | inbound bounded | outbound only | none | forged-message fork test ([09](09-inbound-limit-test.md)) |
| `AAVE-RF-2.9` | §2.9 | Inbound limit sized vs sustained flow | bounded headroom | — | unbounded | rate limiter config vs flow history |
| `CONF-DEPTH` | TALF reply #7 | Confirmations vs chain reorg depth | ≥ chain norm | low | 0 / inherit weak default | ULN config |
| `UPGRADE` | §2.5 | Proxy admin / implementation | timelock ≥48h | multisig | single key | EIP-1967 slots |
| `MINT` | incidents (Resolv) | Mint authority + caps | multisig + caps | multisig, no caps | single key | role holders |
| `ORACLE` | incidents (Resolv) | Lender market oracle type | market feed with bounds | exchange-rate only | hardcoded | oracle contract |

Overall grade = worst result across routes and checks. Every result carries its evidence (block, call, return value). Rule IDs and the framework version are part of the signed report.
