# 02 · Problem and incident evidence

## The problem in six parts

1. **Lenders accept bridged and wrapped collateral without checking its effective security.** Kelp's attacked route ran on a single verifier for 12.5 months while rsETH was collateral on Aave, Compound III and Euler. ([03](03-kelp-onchain-timeline.md))
2. **"Effective" differs from "configured".** LayerZero app config fields set to `0` inherit the endpoint default; the default for some routes is still a single DVN (Unichain default read onchain: 1 required DVN, 15 confirmations). An optional threshold can make "3 DVNs" mean "any 1 of 3". ([07](07-effective-state-rules.md), [08](08-safe-guard-findings.md) tests e, f)
3. **Signal- and change-triggered guards miss risk that never moves.** rsETH's verifier config never changed for 12.5 months.
4. **Every lender has its own rules** (Aave, Morpho curators, Euler, Spark, Fluid, Compound) and nobody checks them continuously across all of them.
5. **Shared components are invisible.** When the threat is any asset, a broad freeze is right (Aave froze 292 reserves on Oct 29 2026 for that reason). When the threat is a shared component (a verifier operator, an RPC fleet), responders need the exact list of what depends on it. No neutral cross-lender map exists today.
6. **Most loss now comes from keys and infrastructure, not code bugs.** Infrastructure and key compromise caused about 74–76% of H1 2026 losses (Blockaid; TRM Labs). [SECONDARY for Blockaid figure via press]

## The rule that matters vs the rule people count

A community analysis in Aave's forum (posts #10 and #11 in the Aave Risk Framework thread, Jul 21 and Jul 31 2026) counted verifier sets on every LayerZero route carrying Aave exposure:

- The 3-verifier rule (§2.2) flags only **~$781k (0.02%)** of ~$3.91B of escrow-class exposure.
- **35 of 39** Aave-exposed LayerZero adapters (**~$5.93B**) have **no inbound rate limit**; §2.8 requires inbound and outbound limits sized separately. LayerZero's stock `RateLimiter` only enforces outbound; `_inflow` does not reject. Only EtherFi weETH's custom limiter caps inbound.
- Method: `getConfig` per peer, DVN→operator mapping, bytecode selector scan, plus manual source reading; two zkSync adapters unverified.

**Status: community analysis, NOT yet reproduced by Floor.** Reproducing it is build task #1 ([09](09-inbound-limit-test.md)). Source: https://governance.aave.com/t/arfc-aave-risk-framework/25114 (posts #10, #11); code in a public gist linked from post #10 (not run by us).

## Incident table (2025–2026)

| Incident | What failed | Lender impact | Floor check that targets it | Evidence status |
|---|---|---|---|---|
| **Kelp rsETH**, Apr 18 2026, 116,500 rsETH (~$292M at the time, per LayerZero) | Attacked route had 1 required DVN (set by an EOA delegate on Apr 2 2025); DVN's RPCs poisoned; external RPCs DoS'd | Borrowing on Aave, Compound III, Euler within minutes; Aave **modelled** $123.7M–$230.1M bad debt (two hypothetical scenarios) | Effective DVN count incl. defaults, operator independence, pinned libs, delegate type, timelock, inbound limit | VERIFIED onchain + Aave incident report + LayerZero report |
| **Resolv USR**, Mar 22 2026, ~$23–25M | SERVICE_ROLE key in AWS KMS, no max-mint check; 80M USR minted (Chainalysis) | Lenders pricing USR with a hardcoded oracle saw no depeg; Fluid reported $10M+ bad debt; 15 Morpho vaults impacted | Mint authority type, mint caps, oracle type per market | Mechanism VERIFIED (Chainalysis); lender losses SECONDARY |
| **Drift**, Apr 1 2026 | Admin multisig signers reportedly tricked; fake token listed as collateral, limits raised | Protocol loss; estimates vary by firm (CertiK ~$136M, PeckShield ~$285M) | Admin key type, timelock on listing and limit changes | SECONDARY |
| **Stream xUSD**, Nov 2025 | Off-chain loss behind a token reused as collateral across vaults | Realised bad debt mainly Silo/Varlamore (~$14–15M) and MEV Capital on Morpho (~$0.7M); ~$285M was exposure, not loss | Dependency/reuse graph across curators | SECONDARY |
| **Binance hot-wallet exploiter on Aave**, Oct 29 2026 | Exploiter deposited 60M USDT and borrowed ~19,762 WETH (20:58–21:01 UTC) | Aave deliberately froze 292 reserves (175 V3 on 16 networks + 117 V4), 21:42–23:04 UTC; collateral top-ups blocked | Shows the cost of broad freezes; motivates a dependency map for shared-component threats | VERIFIED (LlamaRisk post + freeze tx) |

Sources for every row: [17-sources.md](17-sources.md).

## Why now

- **Aave DAO approved a binding-style framework.** LlamaRisk's Aave Risk Framework passed Snapshot on Jul 9 2026 (359,345 For / 0 Against). Aave Labs' Technical Asset Listing Framework passed on Jul 13 2026 (437,271 For). ([04](04-aave-framework.md))
- **LayerZero changed defaults after Kelp.** LayerZero Labs' DVN no longer serves 1/1 setups; LayerZero says protocol defaults will be "no less than a 3-of-3 DVN configuration" (incident report, May 2026). Reports of "5 where possible" are SECONDARY (The Block).
- **Dune (Apr 20 2026, 90-day window, via Dune's post):** of 2,665 active OApps, 47% ran 1-of-1, 45% 2-of-2, ~5% 3+. [SECONDARY: dashboard not located]
- **Chaos Labs left Aave** (announced Apr 6 2026); LlamaRisk took over risk operations. One fewer independent risk provider.
- **CCIP 2.0 (launched Sep 2026)** introduces Cross-Chain Verifiers with required/optional sets and thresholds: the same posture questions now apply to a second major bridge stack.
