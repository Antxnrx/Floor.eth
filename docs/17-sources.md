# 17 · Sources

Primary first. Labels: (P) primary, (S) secondary, (O) onchain.

## Onchain (Ethereum mainnet, read via https://eth.drpc.org / https://ethereum-rpc.publicnode.com)

- (O) Apr 2 2025 setConfig by EOA delegate: https://etherscan.io/tx/0x2d48d9331d96c46f8b4a9f7a7bdcf256d2034dadb42f039d27dc28077d520592
- (O) Apr 18 2026 drain: https://etherscan.io/tx/0x1ae232da212c45f35c1525f851e4c41d529bf18af862d9ce9fd40bf709db4222
- (O) Oct 29 2026 Aave freeze (first tx): https://etherscan.io/tx/0x2d144463f6083fd01388e11b1c2d746fa4115b79967ac9cb19a355461e357c0a
- (O) rsETH adapter: https://etherscan.io/address/0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3
- (O) Kelp Safe: https://etherscan.io/address/0xCbcdd778AA25476F203814214dD3E9b9c46829A1
- (O) Raw config reads and scripts: [evidence/onchain/](evidence/onchain/)

## Aave governance (P)

- Aave Risk Framework (LlamaRisk), thread: https://governance.aave.com/t/arfc-aave-risk-framework/25114 · raw: https://governance.aave.com/raw/25114/1 · changelog: https://governance.aave.com/raw/25114/5
- Snapshot, Aave Risk Framework: https://snapshot.org/#/s:aavedao.eth/proposal/0xe40b377bd4a207aaaaf126738e6e0bc18f16f65a34802c3f143697b2d90666ac
- Technical Asset Listing Framework (Aave Labs): https://governance.aave.com/t/arfc-technical-asset-listing-framework/24988 · reply #7: https://governance.aave.com/raw/24988/7
- Snapshot, TALF: https://snapshot.org/#/s:aavedao.eth/proposal/0x92600751abd36540057b84a808903e3e1a005d78e9ab1eec712ac0574bca7431
- rsETH Incident Report (Apr 20 2026): https://governance.aave.com/t/rseth-incident-report-april-20-2026/24580 · raw: https://governance.aave.com/raw/24580/1
- LlamaRisk on Oct 29 2026 freeze: https://governance.aave.com/raw/25954
- Low Adoption Asset Deprecation ARFC: https://governance.aave.com/t/25401
- Wrap-depth TEMP CHECK: https://governance.aave.com/t/24726
- Chaos Labs Is Leaving Aave: https://governance.aave.com/t/chaos-labs-is-leaving-aave/24386
- LlamaRisk epoch 4 renewal (CRE stack): https://governance.aave.com/t/arfc-renew-llamarisk-as-risk-service-provider-epoch-4/24446
- LlamaRisk monthly update: https://governance.aave.com/t/llamarisk-monthly-community-update/17935/32

## Incident reports

- (P) LayerZero KelpDAO incident report: https://layerzero.network/publications/kelpdao-incident-report.pdf
- (P) Chainalysis, Resolv: https://www.chainalysis.com/blog/lessons-from-the-resolv-hack/
- (P) NCC Group, Bybit: https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/
- (P) Gnosis Pay post-mortem: https://gnosispay.com/blog/post-mortem-gnosis-pay-vulnerability-exploit
- (P) Yearn yTrades Safe guard (Mirror; returned 403 to us): https://mirror.xyz/yearn-finance-engineering.eth/pqWg0IXZI93NV50scPh0qy-nc0SmqFYTHufc2Tw85GU
- (S) Kelp recovery, CoinDesk: https://www.coindesk.com/business/2026/04/26/aave-raises-nearly-80-of-the-usd200-million-it-needs-to-cover-bad-debt-left-by-kelp-dao-exploit · https://www.coindesk.com/markets/2026/05/18/aave-restores-weth-collateral-limits-as-rseth-crisis-enters-recovery-phase
- (S) Hardcoded-oracle / Fluid bad debt: https://bingx.com/en/flash-news/post/resolv-exploit-mints-m-usr-as-hardcoded-oracle-prices-depegged-wstusr-at-triggering-m-fluid-bad-debt
- (S) Drift: https://unchainedcrypto.com
- (S) Stream xUSD: Arbitrum forum t/30206; Decrypt
- (S) Dune OApp analysis via The Defiant: https://thedefiant.io/news/security/dune-layerzero-oapp-dvn-security-analysis-1bklaq
- (S) LayerZero defaults "5 where possible": https://www.theblock.co/post/400629
- (S) H1 2026 losses: TRM Labs H1 2026 report; Blockaid H1 2026 (via The Defiant / Unchained)
- (S) Q3 2026 hacks: https://www.theblock.co/post/409944; Finbold
- (S) Chaos Labs exit: https://unchainedcrypto.com/chaos-labs-exits-aave-risk-management-role-citing-v4-workload-and-funding-gap/ · https://coincentral.com/chaos-labs-ends-aave-risk-role-despite-5m-offer/

## Protocol source and docs (P)

- Safe smart account (v1.3.0 / v1.4.1 / v1.5.0): https://github.com/safe-global/safe-smart-account (GuardManager L43-63 at v1.4.1)
- Safe guards docs: https://docs.safe.global/advanced/smart-account-guards
- Safe Guardrail: https://safefoundation.org/blog/safe-research-guardrail-locking-down-delegate-calls
- LayerZero V2 source: https://github.com/LayerZero-Labs/LayerZero-v2 (commit `9c741e7f`)
- LayerZero docs (defaults, DVN config, integration checklist): https://docs.layerzero.network/v2/developers/evm/protocol-gas-settings/default-config · https://docs.layerzero.network/v2/developers/evm/configuration/dvn-executor-config · https://docs.layerzero.network/v2/tools/integration-checklist
- Morpho Vault V2: https://github.com/morpho-org/vault-v2 · https://docs.morpho.org/curate/tutorials-v2/emergency · https://docs.morpho.org/curate/tutorials-v2/vault-creation/ · https://docs.morpho.org/curate/tutorials-v2/roles · https://vaultbook.gauntlet.xyz/vaults/morpho-vaults/v2-vaults/roles-and-capabilities
- Chainlink CRE: https://docs.chain.link/cre · deploy access: https://docs.chain.link/cre/guides/operations/deploy-access · deploying: https://docs.chain.link/cre/guides/operations/deploying-workflows.md
- Chainlink CCIP: https://docs.chain.link/ccip · CCVs: https://docs.chain.link/ccip/concepts/ccvs/overview · CCV starter kit: https://docs.chain.link/ccip/ccv-starter-kit · rollout changelog: https://dev.chain.link/changelog/progressive-rollout-for-new-ccip-version · announcement: https://chain.link/blog/introducing-ccip-2-0
- Arkiv: https://docs.arkiv.network · hub: https://hub.arkiv.network
- EF Anon-RPC: https://ethereum.github.io/anon-rpc/ · https://github.com/ethereum/anon-rpc
- Swarm: https://docs.ethswarm.org

## Event (P)

- Prizes: https://ethglobal.com/events/mumbai/prizes · Chainlink: …/prizes/chainlink · Arkiv: …/prizes/arkiv · EF: …/prizes/ethereum-foundation
- Event details (rules, AI, judging, video): https://ethglobal.com/events/mumbai/info/details
- Rules & Code of Conduct: https://ethglobal.com/rules

## Market (S unless noted)

- Morpho curator AUM: Morpho GraphQL API `curators{state{aum}}` (P, read 2026-11-06)
- DefiLlama TVL: https://api.llama.fi/protocol/aave-v3 · /morpho-blue · /sparklend (P, API)
- Hypernative: CB Insights; https://pulse2.com/hypernative-40-million-series-b-raised-for-threat-prevention-platform
- Hexagate: https://decrypt.co/297729/chainalysis-scoops-up-blockchain-security-firm-hexagate-amid-surge-in-crypto-hacks; Calcalist estimate
- Credora: CoinDesk, Sep 4 2025
- Audit pricing: Zealynx; Sherlock 2026 guide
