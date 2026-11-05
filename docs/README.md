# Floor docs

Floor is a lender-side, effective-state security rating for collateral assets, with bounded enforcement.
It answers one question continuously: **"Who or what can create or release this collateral right now, and how many independent parties must agree?"**

Everything here is cited. If a statement has no source, it is marked **ESTIMATE**, **HYPOTHESIS** or **UNVERIFIED**. Read [00-evidence-policy.md](00-evidence-policy.md) before adding anything.

Last full evidence audit: 2026-11-06 (primary sources + onchain reads).

## Read in this order

| # | File | What it covers |
|---|---|---|
| 00 | [00-evidence-policy.md](00-evidence-policy.md) | Rules for every number, quote and claim |
| 01 | [01-overview.md](01-overview.md) | The idea in plain words, web2 terms and web3 terms |
| 02 | [02-problem-and-incidents.md](02-problem-and-incidents.md) | The problem and the 2025–2026 incident evidence |
| 03 | [03-kelp-onchain-timeline.md](03-kelp-onchain-timeline.md) | Kelp rsETH, block by block, with tx hashes |
| 04 | [04-aave-framework.md](04-aave-framework.md) | Aave's DAO-approved rules, verbatim, and how they map to Floor checks |
| 05 | [05-product.md](05-product.md) | Modules, grades, what Floor never does |
| 06 | [06-architecture.md](06-architecture.md) | System design, trust model, enforcement points |
| 07 | [07-effective-state-rules.md](07-effective-state-rules.md) | How to compute "effective" config correctly (LayerZero, CCIP 2.0) |
| 08 | [08-safe-guard-findings.md](08-safe-guard-findings.md) | 17 fork tests: how guards brick and get bypassed, and the safe design |
| 09 | [09-inbound-limit-test.md](09-inbound-limit-test.md) | The forged-message (inbound limit) fork test spec |
| 10 | [10-mainnet-demo.md](10-mainnet-demo.md) | The live mainnet loop on our own contracts, and safety rules |
| 11 | [11-sponsors-and-prizes.md](11-sponsors-and-prizes.md) | Prize rules (verbatim), how we qualify, open questions |
| 12 | [12-market-and-competition.md](12-market-and-competition.md) | Buyers, market size, competitors |
| 13 | [13-business-and-roadmap.md](13-business-and-roadmap.md) | Business model, moat, GTM, funding, roadmap |
| 14 | [14-risks-and-judge-qa.md](14-risks-and-judge-qa.md) | Risks, honest limits, likely judge questions |
| 15 | [15-readiness.md](15-readiness.md) | Are we ready to build? Blockers and first-hour tasks |
| 16 | [16-glossary.md](16-glossary.md) | Terms in plain words |
| 17 | [17-sources.md](17-sources.md) | Every source, grouped |
| 18 | [18-ethglobal-rules.md](18-ethglobal-rules.md) | ETHGlobal rules verbatim: deadline, picks, build rules, AI, video, judging |
| 19 | [19-sponsor-dev-reference.md](19-sponsor-dev-reference.md) | Developer quick-reference from official sponsor docs (CRE, CCIP, Arkiv, Swarm, Anon-RPC, Morpho, LayerZero) |
| 20 | [20-swarm-design.md](20-swarm-design.md) | Swarm design: evidence bundles, Arkiv↔Swarm link, browser verify, site on Swarm, `swarm.md` outline |
| — | [evidence/](evidence/) | Scripts, raw onchain outputs and the guard fork tests (re-runnable) |

For AI agents and Claude: see [`/AGENTS.md`](../AGENTS.md) and [`/CLAUDE.md`](../CLAUDE.md).
