# Reach

**How many people or projects already use or depend on this data?**

The data is the security configuration of LayerZero bridge routes that carry lending collateral. Everyone who lends against bridged tokens depends on it, whether they read it or not.

- **Aave** made it a rule. Its DAO-approved Risk Framework (Snapshot passed Jul 9 2026, 359,345 For / 0 Against) requires ≥3 independent verifiers, pinned receive libraries and inbound + outbound rate limits on every route carrying Aave exposure ([governance.aave.com/t/25114](https://governance.aave.com/t/arfc-aave-risk-framework/25114)).
- **The failure is real.** Kelp's rsETH adapter released 116,500 rsETH (~$292M at the time, per LayerZero) on a forged message through a route with one verifier. Aave modelled $123.7M–$230.1M of bad debt ([raw/24580/1](https://governance.aave.com/raw/24580/1)).
- **Our scan, Ethereum, block 26,351,514:** 34 LayerZero adapters over Aave-listed tokens. **20 adapters (111 routes) release their full escrow on one inbound message** (no app-level inbound limit), including ~3.30B USDT, ~2.09B USDe, ~238.7M sUSDe, 803.8 WBTC and 16,990 rsETH of escrow. Only EtherFi's main weETH adapter caps inbound (all 20 routes). Results: [`packages/resolver/results/inbound-ethereum-26351514.json`](../packages/resolver/results/inbound-ethereum-26351514.json).
- **Today this lives in forum posts and one-off scripts** (a community analysis in the Aave thread, posts #10–#11). Nobody publishes it as queryable, continuously refreshed data.

**Who would use our copy after Mumbai, and for what?**

| User | Use |
|---|---|
| Lending risk teams (Aave's risk provider, Spark, Euler, Fluid) | Enforce their listing framework across hundreds of assets; alert on drift |
| Morpho curators | Feed `FloorSentinel`, which cuts vault caps when a collateral's grade drops |
| Token issuers | Prove continuous compliance with Aave's bridge rules |
| Researchers and community analysts | Query the posture of every route instead of re-scraping |
| Insurers | Price bridge risk per route |

We keep the importer running after Mumbai (weekly scans first, then on every config change).
