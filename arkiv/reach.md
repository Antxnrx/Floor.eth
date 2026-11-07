# Reach

**How many people or projects already use or depend on this data?**

The data is the security configuration of LayerZero bridge routes that carry lending collateral. Everyone who lends against bridged tokens depends on it, whether they read it or not.

- **Aave** made it a rule. Its DAO-approved Risk Framework (Snapshot passed Jul 9 2026, 359,345 For / 0 Against) requires ≥3 independent verifiers, pinned receive libraries and inbound + outbound rate limits on every route carrying Aave exposure ([governance.aave.com/t/25114](https://governance.aave.com/t/arfc-aave-risk-framework/25114)).
- **The failure is real.** Kelp's rsETH adapter released 116,500 rsETH (~$292M at the time, per LayerZero) on a forged message through a route with one verifier. Aave modelled $123.7M–$230.1M of bad debt ([raw/24580/1](https://governance.aave.com/raw/24580/1)).
- **Our scan, all chains (rerun 2026-11-07):** 64 LayerZero adapters behind Aave-listed tokens on 8 chains. **31 have no inbound bound**: one inbound message releases the whole escrow, or mints with no cap. 4 are rate-limited per message (EtherFi weETH, PYUSD `0xa2c3`, USDG `0x147b` on Ethereum, USDG on Ink); 8 are undetermined; 21 inactive or LayerZero v1. On Ethereum alone, 20 adapters (111 routes) release their full escrow, including ~3.36B USDT, ~2.09B USDe, ~238.3M sUSDe, 803 WBTC and 16,988 rsETH. Results: [`docs/evidence/inbound/`](../docs/evidence/inbound/), table in [`docs/09`](../docs/09-inbound-limit-test.md). The dataset is on Arkiv and queried live at https://floor.aexiz.in/verify/dataset.html.
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
