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

## All-chain rerun (2026-11-07): 64 adapters, 8 chains

**Why a rerun.** Three gaps in the first run: (1) the adapter list came from one LayerZero metadata source and missed adapters that LayerZero's OFT registry lists; (2) the peer scan stopped at endpoint id 30499, but LayerZero now has chains at 30500, 30567 and 30600; (3) adapters that **mint** on credit (instead of releasing escrow) were reported as "full+1 also succeeded" / "escrow empty" and left UNKNOWN.

**What changed in the probe.** Adapter list = every `*_ADAPTER` in LayerZero's OFT registry whose inner token is in Aave's token list on that chain (`packages/resolver/data/adapters-all-chains.json`); endpoint address and RPCs per chain (Ink's EndpointV2 differs); peers scanned over 30100–30699; an adapter that accepts more than its escrow, or a credit with no escrow, is tested at the uint64 maximum and, if that reverts, binary-searched for its real cap. The negative control (non-endpoint caller must revert `OnlyEndpoint`, wrong peer must revert `OnlyPeer`) passed on every chain where something was probed. Every decisive result is cross-checked on a second RPC (all agree). Results: `docs/evidence/inbound/2026-11-07-*.json`.

| Chain | Token | Adapter | Outcome | Routes | Escrow (tokens) / mints | Per-message cap (tokens) |
|---|---|---|---|---|---|---|
| ethereum | LINK | `0x093a…557b` | NO_INBOUND_LIMIT | 1 | 0.08 |  |
| ethereum | LINK | `0x8b31…0b33` | NO_INBOUND_LIMIT | 1 | 34,595.04 |  |
| ethereum | PYUSD | `0x53e1…d816` | NO_INBOUND_LIMIT | 1 | 1.12 |  |
| ethereum | PYUSD | `0x688e…ac82` | NO_INBOUND_LIMIT | 1 | 130,007.33 |  |
| ethereum | PYUSD | `0xa2c3…6444` | INBOUND_LIMIT | 7 | mints | 760,000,000 |
| ethereum | PYUSD | `0xe9e8…70aa` | NO_INBOUND_LIMIT | 1 | 26.83 |  |
| ethereum | PYUSD | `0xfa0e…93f8` | NO_INBOUND_LIMIT | 1 | 1,269,788.40 |  |
| ethereum | USDG | `0x147b…f9c4` | INBOUND_LIMIT | 6 | mints | 225,000,000 |
| ethereum | USDG | `0xa755…6a65` | NO_INBOUND_LIMIT | 2 | 1,038,759.77 |  |
| ethereum | USDT | `0x1f74…dfb0` | TEST_ERROR | 5 | 29,237,686.70 |  |
| ethereum | USDT | `0x2d34…5865` | NO_INBOUND_LIMIT | 1 | 1,000.00 |  |
| ethereum | USDT | `0x6925…bba6` | NO_INBOUND_LIMIT | 1 | 3,339.51 |  |
| ethereum | USDT | `0x6c96…1dee` | NO_INBOUND_LIMIT | 21 | 3,364,502,782.60 |  |
| ethereum | USDT | `0x811e…d5c0` | TEST_ERROR | 4 | 0.01 |  |
| ethereum | USDT | `0xc2e7…5352` | NO_INBOUND_LIMIT | 1 | 1,388,134.73 |  |
| ethereum | USDe | `0x5d3a…ef34` | NO_INBOUND_LIMIT | 22 | 2,088,159,429.25 |  |
| ethereum | USDe | `0xb93e…4cf3` | UNKNOWN | 1 | 0.00 |  |
| ethereum | USDtb | `0xc708…1a5d` | NO_INBOUND_LIMIT | 2 | 230.93 |  |
| ethereum | WBTC | `0x0555…2b9c` | NO_INBOUND_LIMIT | 21 | 803.02 |  |
| ethereum | WBTC | `0x2c01…76ed` | NO_INBOUND_LIMIT | 1 | 0.38 |  |
| ethereum | WBTC | `0x7134…00a6` | NO_INBOUND_LIMIT | 1 | 7.54 |  |
| ethereum | XAUT | `0x1f03…f03d` | UNKNOWN | 1 | 0.00 |  |
| ethereum | XAUT | `0xb9c2…696c` | NO_INBOUND_LIMIT | 13 | 30,942.76 |  |
| ethereum | rsETH | `0x85d4…8ef3` | NO_INBOUND_LIMIT | 1 | 16,988.14 |  |
| ethereum | sUSDe | `0x211c…e5d2` | NO_INBOUND_LIMIT | 21 | 238,292,520.91 |  |
| ethereum | weETH | `0x4eaf…3913` | NO_INBOUND_LIMIT | 1 | 0.02 |  |
| ethereum | weETH | `0xcd2e…ca63` | INBOUND_LIMIT | 20 | 104,918.65 | 10, 20, 1,000 … |
| ethereum | weETH | `0xfe7f…7d0d` | UNKNOWN | 11 | 0.00 |  |
| ethereum | FBTC | `0x0b83…da3f` | TEST_ERROR | 1 | 0.02 |  |
| ethereum | FRAX | `0x909d…1fed` | NO_INBOUND_LIMIT | 2 | 73.93 |  |
| ethereum | FXS | `0xc6f5…84ec` | UNKNOWN | 15 | 0.00 |  |
| ethereum | FXS | `0x2343…80d0` | NO_INBOUND_LIMIT | 2 | 14,220.84 |  |
| ethereum | cbBTC | `0x59ea…f539` | NO_INBOUND_LIMIT | 1 | 4.66 |  |
| ethereum | wstETH | `0xa2d3…ee3f` | NO_INBOUND_LIMIT | 1 | 1.99 |  |
| ethereum | wstETH | `0x6cea…5848` | NO_INBOUND_LIMIT | 1 | 0.38 |  |
| arbitrum | USD₮0 | `0x14e4…8d92` | NO_INBOUND_LIMIT | 21 | mints |  |
| arbitrum | USD₮0 | `0x7765…9b92` | TEST_ERROR | 5 | 1,362,738.73 |  |
| bsc | BTCB | `0x5b7b…4b13` | NO_INBOUND_LIMIT | 1 | 1.80 |  |
| ink | USDG | `0x9e12…8971` | INBOUND_LIMIT | 1 | mints | 25,000,000 |
| ink | USD₮0 | `0x1cb6…4a65` | NO_INBOUND_LIMIT | 21 | mints |  |
| optimism | OP | `0xac80…7a5a` | NO_INBOUND_LIMIT | 2 | 361,586.70 |  |
| polygon | USDT | `0x6ba1…9e13` | NO_INBOUND_LIMIT | 21 | mints |  |
| xlayer | USD₮0 | `0x94bc…5554` | NO_INBOUND_LIMIT | 21 | mints |  |

Inactive or not covered: LINK `0xee38…`, USDT `0x9335…`, USDT `0xcc1b…`, USDT `0xf6a0…`, WBTC `0xab6e…`, WBTC `0xf164…`, BAL `0xe15b…` (v1), CRV `0xc7ae…` (v1), DAI `0x91a4…` (v1), ETHx `0x39d0…`, FRAX `0xe412…`, LBTC `0x3a76…`, LBTC `0xa7c4…`, LBTC `0x1290…`, LBTC `0xacb1…`, USDC `0x28a9…` (v1), WETH `0x6959…` (v1), crvUSD `0xaa79…` (v1), BTC.b `0x2297…`, Cake `0xb274…`, WBNB `0xa900…`.

Totals: NO_INBOUND_LIMIT 31, NO_PEERS 15, LZ_V1 (not probed) 6, INBOUND_LIMIT 4, TEST_ERROR 4, UNKNOWN 4 (of 64).
Blocks: ethereum-34 26,357,818, ethereum-new 26,357,878, arbitrum 521,877,486, avalanche 99,609,899, bsc 132,061,699, ink 60,493,792, optimism 159,196,617, polygon 96,858,462, xlayer 75,223,089


**What the rerun corrects.** The original 34 Ethereum adapters, re-probed at block 26,357,818 with the wider scan, give the same result except two: **PYUSD `0xa2c3…6444` and USDG `0x147b…f9c4` mint on credit and enforce a real per-message cap (`RateLimitExceeded()`; 760M PYUSD, 225M USDG)**. They were "UNKNOWN (empty escrow)" before. So on Ethereum **three** adapters are inbound-limited (EtherFi weETH main adapter, PYUSD `0xa2c3`, USDG `0x147b`), not one. Logged in `docs/00`.

**Still not determined by this method:** 4 `TEST_ERROR` (USDT0 `0x1f74`, USDT `0x811e`, FBTC, USD₮0 Arbitrum `0x7765`: custom message codecs reject the standard payload) and 4 `UNKNOWN` (empty escrow and the 1-unit credit reverts on a balance check, so nothing to bound). 6 LayerZero **v1** adapters are outside this v2 probe.

