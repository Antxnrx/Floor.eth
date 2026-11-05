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
