# 09 · Inbound-limit test (forged-message fork probe)

**Goal:** reproduce, with our own tool, whether each Aave-exposed LayerZero adapter bounds *inbound* releases at the app layer (Aave §2.8). The community figure to reproduce: **35 of 39 adapters, ~$5.93B, no inbound bound** (Aave forum t/25114 posts #10/#11). Budget: ~half a day. Accuracy over speed.

## What it proves, and what it does not

- **Proves:** whether the app layer (adapter / OFT code) rejects a max-size inbound credit from a legitimately configured peer.
- **Does not prove:** that the route is drainable. A real attack still needs the verifier layer (DVNs) to be compromised, as at Kelp. Wording: "no app-level inbound limit", never "drainable".

## Method

1. Pin a fork block (record it). `anvil --fork-url <archive RPC> --fork-block-number <N>` or `vm.createSelectFork`.
2. Build the adapter list: every LayerZero adapter/OFT whose token is Aave collateral (V3 markets + V4 spokes + Horizon in scope). Store `(chain, adapter, token, escrow balance)`.
3. For each adapter and each configured peer eid:
   - Read `peers(eid)` → the remote OApp (bytes32).
   - Impersonate EndpointV2 (`vm.prank(endpoint)`), call `lzReceive(Origin{srcEid: eid, sender: peer, nonce: next}, guid, message, executor, extraData)`.
   - `message` = OFT payload `abi.encodePacked(bytes32(to), uint64(amountSD))` (+ compose bytes if the OFT uses compose; then also test without).
   - `amountSD` = full escrow balance converted to shared decimals (`balance / decimalConversionRate`), capped at `type(uint64).max`.
4. Classify the result by **revert reason**, not just success/failure:

| Outcome | Classification |
|---|---|
| Success, tokens credited | `NO_INBOUND_LIMIT` |
| Reverts with a rate-limit error (e.g. `InboundRateLimitExceeded`, `RateLimitExceeded`) | `INBOUND_LIMIT` (record the limit and window) |
| Reverts because paused | `PAUSED` (not a limit; re-test with pause lifted on fork and report both) |
| Reverts on decimals / encoding / nonce / peer mismatch | `TEST_ERROR` (fix the test; never count as a limit) |
| Reverts for any unrecognised reason | `UNKNOWN` (inspect manually) |

5. Mint-class OFTs (credit mints instead of unlocking escrow): ceiling is `uint64` shared-decimal supply, not balance. Report separately (failure mode differs).
6. Proxies: record the implementation address at the fork block.
7. Second pass at a smaller amount (e.g. 2× highest observed sustained daily inbound flow) to test §2.9 sizing.

## Accuracy guardrails

- Cross-check per adapter against the community list. Any disagreement gets a per-route explanation before anything is published.
- Never send forged messages on a live network. Fork only.
- Publish the script, fork block and raw outputs so anyone can re-run and get the same result.
- Publish aggregates and per-adapter classifications only; no step-by-step attack material.

## Output schema (per adapter)

```json
{
  "chain": "ethereum", "block": 0, "adapter": "0x…", "token": "rsETH",
  "kind": "adapter|mint", "implementation": "0x…|null",
  "escrow": "…", "peers": [30110, 30320],
  "results": [{"eid": 30320, "amountSD": "…", "outcome": "NO_INBOUND_LIMIT", "revert": null, "tx": "fork"}],
  "classification": "NO_INBOUND_LIMIT", "matchesCommunity": true, "notes": ""
}
```

## Results (built and run, 2026-11-06)

Implementation: `packages/resolver/src/inbound.ts` (probe), `src/inbound-cli.ts` (`pnpm --filter @floor/resolver inbound --block <n>`), tests in `test/inbound.test.ts`. Raw output: [`packages/resolver/results/inbound-ethereum-26351514.json`](../packages/resolver/results/inbound-ethereum-26351514.json).

**Method as built.** The probe runs `eth_call` from the EndpointV2 address at a pinned block, never a broadcast. It sends a correctly formed OFT credit from the route's real configured peer.
- **Harness self-check before every run.** The same call must be rejected when sent from a non-endpoint address (`OnlyEndpoint`) and when it claims a wrong peer (`OnlyPeer`). If either check fails, the run aborts.
- **Proof ladder:**
  1. A credit of 1 SD unit must succeed.
  2. A credit for the full escrow must succeed.
  3. Full escrow + 1 must revert with a balance error, which proves the credit path really moves escrow.
- **If the full-escrow credit reverts,** binary search measures the largest amount the app layer accepts. That is the inbound cap.
- **Cross-check:** every decisive result is re-run on a second RPC provider.

**Calibration (live tests pass):**

| Adapter | Expected (community analysis) | Floor probe |
|---|---|---|
| rsETH `0x85d4…8Ef3` | no inbound limit | `NO_INBOUND_LIMIT`: full escrow (16,990 rsETH) released in one message |
| EtherFi weETH `0xcd2e…CA63` | real inbound limit | `INBOUND_LIMIT` on all 20 routes, `InboundRateLimitExceeded()`; caps measured per route (e.g. 20 weETH BSC, 3,000 weETH Optimism) vs 104,917 weETH escrow |
| USDT0 `0x1F74…FB0` | (custom implementation) | `TEST_ERROR`: custom codec `InvalidMsgType(1)`. Inconclusive, never counted as pass or fail |

**Ethereum, block 26,351,514, 34 LayerZero adapters over Aave-listed tokens** (registry: LayerZero metadata, `packages/resolver/data/adapters-ethereum.json`):

| Outcome | Adapters |
|---|---|
| `NO_INBOUND_LIMIT` | **20** (111 routes) |
| `INBOUND_LIMIT` | 1 (EtherFi weETH main adapter) |
| `TEST_ERROR` (custom codec) | 2 (USDT0) |
| `UNKNOWN` (empty escrow, nothing to bound) | 5 |
| `NO_PEERS` (inactive) | 6 |

Escrow behind unbounded adapters, in whole tokens using each adapter's own shared decimals: USDT 3,301,201,705 · USDe 2,088,039,672 · sUSDe 238,740,672 · PYUSD 1,672,768 · USDG 870,240 · LINK 34,525 · XAUt 30,464 · rsETH 16,990 · WBTC 811.6 · USDtb 230.9 · weETH 0.02 (a minor secondary adapter).

**How this relates to the community's "35 of 39".** Their list covers Aave-exposed adapters on several chains; ours is Ethereum adapters over Aave-listed tokens from LayerZero's metadata. The two lists overlap:
- **Agree:** on every overlapping adapter we could probe. That covers USDT0 `0x6c96`, XAUt0, rsETH, WBTC `0x0555`, PYUSD `0xfa0e`, LINK `0x8b31`, USDe, sUSDe, USDtb and USDG, all unbounded, and EtherFi weETH `0xcd2e`, bounded.
- **Inconclusive:** USDT0 `0x1F74`, which the forum reads as unbounded from source. Our probe returns `TEST_ERROR` because of its custom message codec, so it is unconfirmed by us.
- **Not in their list (as far as we can tell):** a secondary weETH adapter `0x4eaf`, unbounded but holding only 0.02 weETH.
- **Dynamic confirmation:** we confirmed by simulation the two the author could not verify from source, sUSDe (unbounded) and weETH (bounded).

We do not claim to reproduce "35/39" itself; the multi-chain list is the next step.

**A mistake we caught in our own summary.** The first tally divided every escrow by 10^6. WBTC's adapter uses 8 shared decimals, so that briefly showed "81,162 WBTC". Results now record `sharedDecimals` and `escrowTokens` per adapter. The correct value is 803.77 WBTC in the main adapter.
