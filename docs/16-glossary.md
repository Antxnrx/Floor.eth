# 16 · Glossary (plain words)

| Term | Meaning |
|---|---|
| Collateral | What you deposit to borrow; like gold at a pawn shop. |
| Bridged token | A token on one chain that stands for an asset locked or minted elsewhere; like a casino chip. |
| OFT / OApp | LayerZero's standard for tokens and apps that move between chains. |
| OFT adapter | Wraps an existing token: locks it on one chain, releases it on inbound messages (escrow). |
| Mint-class OFT | Mints on inbound messages instead of releasing escrow. |
| DVN | LayerZero verifier: a service that confirms a cross-chain message really happened. |
| ULN config | LayerZero's per-route verification settings: confirmations, required DVNs, optional DVNs, optional threshold. |
| Effective config | What the chain actually enforces after inheriting defaults (`0` = default, `255` = none). |
| Receive / send library | The LayerZero contract that verifies inbound / handles outbound messages. "Pinned" = the app set it explicitly instead of following the default. |
| Grace period | Window where the old receive library still verifies messages after a switch. |
| Delegate | An address allowed to change an OApp's LayerZero settings on its behalf. |
| CCIP / CCIP 2.0 | Chainlink's cross-chain messaging; 2.0 adds pluggable Cross-Chain Verifiers. |
| CCV | Cross-Chain Verifier in CCIP 2.0 (default: CommitteeVerifier). |
| FTF | Faster-Than-Finality: accepting messages before full source-chain finality. |
| Rate limit (inbound / outbound) | Cap on how much can arrive / leave over a route in a time window. |
| Safe (multisig) | A wallet that needs k of n signers. |
| Safe guard | A contract a Safe calls before/after each tx; it can block txs, and can brick the Safe if buggy. |
| Safe module | A contract allowed to execute from the Safe; bypasses guards on v1.3/1.4. |
| Timelock | A mandatory wait before a change takes effect. |
| Proxy admin / EIP-1967 | Whoever can swap a contract's code; the standard storage slots for it. |
| LTV | Loan-to-value. LTV 0 = no new borrowing against that collateral. |
| Freeze (Aave) | No new supply or borrow of that asset; repay, withdraw and liquidations continue. |
| Liquidation | Selling an undercollateralised loan's collateral to keep the lender solvent. |
| Curator / Sentinel (Morpho) | Vault manager / the role that can lower caps instantly. |
| CRE | Chainlink Runtime Environment: workflows executed and signed by Chainlink's network. |
| Arkiv | A queryable onchain data layer ("DB-chain") with owned, expiring entities. |
| Swarm | Decentralised storage; uploads need a postage stamp batch. |
| Anon-RPC | EF tool that anonymises a wallet's or app's RPC reads. |
| CROPS | Censorship resistant, Open source, Private, Secure. |
| Mainnet fork | A local copy of a chain at a past block, for replaying real transactions. |
| Blast radius | Everything that depends on a component that fails. |
| Drift | Actual state differing from declared state. |
