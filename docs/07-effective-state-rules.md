# 07 · Computing effective state correctly

The difference between Floor and a wrong number is here. Every rule below is from protocol source or a fork test.

## LayerZero V2 (EVM)

Source: LayerZero-v2 @ `9c741e7f`, `packages/layerzero-v2/evm/...`

1. **Use the resolved config, never the raw input.** `ReceiveUln302.getUlnConfig(oapp, eid)` / `SendUln302.getUlnConfig` (and `EndpointV2.getConfig(oapp, lib, eid, 2)`) return the app config merged with the default. `UlnBase.sol` L11-12/L27-29: `0` = DEFAULT (inherit), `255` = NIL (explicitly none). L74-111 resolve per field.
   - Fork test f: Unichain default today = **1 required DVN, 15 confirmations** (read via a never-configured OApp). An app field left at 0 inherits that.
2. **Effective quorum = required DVNs + optional threshold.** Fork test e: required = NIL (255), optional = 3 DVNs with threshold 1 → looks like 3 DVNs, is really "any 1 of 3".
3. **Dedupe by operator.** Multiple DVN addresses run by one organisation count as one (Aave §2.2, Aave Labs reply #7). Needs a curated DVN → operator map (hardcode ~15 known DVNs at M0).
4. **Check both directions.** Inbound security is decided by the destination chain's **receive** config; outbound by the source **send** config. Kelp's drain hit the Ethereum receive side for eid 30320.
5. **Libraries.** `EndpointV2.getReceiveLibrary(oapp, eid)` returns `(lib, isDefault)`. `isDefault = true` means unpinned (Aave §2.4 hard constraint). `getSendLibrary` returns the default when none set; a non-zero address does not mean pinned.
6. **Grace period.** `receiveLibraryTimeout(oapp, eid)` → `(lib, expiry)`. While active, the *old* receive library still verifies messages; score both. (`MessageLibManager.sol` L279-289; grace period not allowed to/from the default lib, L260-263.)
7. **Who can change it.** `_assertAuthorized` lets the OApp **or its delegate** call `setConfig`/libraries (`EndpointV2.sol` L355-357). `setDelegate` is called by the OApp (`OAppCore.setDelegate` is `onlyOwner`). So score **owner and delegate**, each: EOA vs Safe (threshold, owners, modules, guard) vs timelock (`getMinDelay`).
8. **Defaults can change without the app doing anything.** `UlnBase.setDefaultUlnConfigs` is `onlyOwner` (LayerZero). Monitoring must watch defaults for every route that inherits any field.
9. **Peers.** Enumerate `peers(eid)` for all eids; a route with a peer but weak config is in scope even if traffic is low.
10. **Inbound rate limits.** LayerZero's stock `RateLimiter._inflow` does not reject; stock `OFTAdapter` has no limiter. Existence must be tested on a fork, not assumed from inheritance ([09](09-inbound-limit-test.md)).

## Chainlink CCIP 2.0 (EVM)

Source: https://docs.chain.link/ccip/concepts/ccvs/overview, CCIP docs llms-full.

- **Cross-Chain Verifiers (CCVs)** attest a message before destination execution. Default: CCIP's **CommitteeVerifier**; others: CCTPVerifier, LombardVerifier, custom.
- Receivers expose `getCCVsAndFinalityConfig(sourceChainSelector, sender)` → `(requiredCCVs, optionalCCVs, optionalThreshold, allowedFinalityConfig)`. Same shape as LayerZero's ULN config.
- "CCV requirements are **additive**. The effective set for a message merges contributions from the sender, token pool, receiver, and lane configuration." → Floor must merge all four sources.
- **Faster-Than-Finality (FTF):** custom confirmation thresholds per lane; score like confirmation depth.
- **Token pools (v2.0)** have inbound and outbound rate limits, plus a fast-finality bucket. Read both buckets.
- Not every lane runs v2.0 yet (progressive rollout); lane version is detectable via `@chainlink/ccip-sdk`. Score the version actually live on the lane.

## Owners and controllers

- Safe: `getThreshold()`, `getOwners()`, `getModulesPaginated(0x1, n)`, guard at storage slot `keccak256("guard_manager.guard.address")`, `VERSION()`.
- Timelock: `getMinDelay()`; check who holds proposer/executor/canceller roles.
- Proxies: EIP-1967 implementation slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`, admin slot `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103`.

## Scan hygiene (SRE rules)

- Pin a block per scan; store `(chain, block, call, return)` for every value.
- Query at least two independent RPC providers and flag disagreement (don't repeat Kelp's single-RPC-trust failure).
- Treat any failed read as `UNKNOWN`, never as `OK`.
- Re-run the full scan from scratch in CI on every rule change; diff outputs.
