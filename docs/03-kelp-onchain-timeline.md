# 03 · Kelp rsETH: onchain timeline

Every row was read from Ethereum mainnet (public RPC `https://eth.drpc.org`, `cast`) unless marked otherwise. Times are UTC.

## Addresses

| What | Address |
|---|---|
| rsETH OFT adapter (Ethereum) | `0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3` (not a proxy: EIP-1967 slots are 0) |
| LayerZero EndpointV2 | `0x1a44076050125825900e736c501f859c50fE728c` |
| ReceiveUln302 | `0xc02Ab410f0734EFa3F14628780e6e695156024C2` |
| SendUln302 | `0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1` |
| LayerZero Labs DVN | `0x589dEDbD617e0CBcB916A9223F4d1300c294236b` |
| EOA delegate (until Aug 25 2025) | `0xCF7bF9D3a485b9c4d4A38d65e4d68e081a585662` |
| Kelp 3-of-6 Safe (owner throughout; delegate from Aug 25 2025) | `0xCbcdd778AA25476F203814214dD3E9b9c46829A1` (Safe v1.3.0, no guard, no modules) |
| Drain recipient | `0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b` |
| Attacked route | Unichain, LayerZero eid `30320` |

## Timeline

| Time (UTC) | Block | Event | Evidence |
|---|---|---|---|
| Feb 6 2024 02:07 | 19,166,120 | Adapter deployed (no code at 19,166,119) | `eth_getCode` |
| Apr 2 2025 08:14 | 22,179,964 | Unichain route (eid 30320) set: 1 required DVN (LZ Labs), 0 optional, 42 confirmations. Sent **directly by the EOA delegate** to EndpointV2 (not via the Safe). | tx `0x2d48d9331d96c46f8b4a9f7a7bdcf256d2034dadb42f039d27dc28077d520592`, `UlnConfigSet` log |
| Aug 25 2025 | 23,218,826 | Delegate moves from the EOA to the 3-of-6 Safe. Verifier set untouched. | `EndpointV2.delegates(adapter)` = EOA at 23,218,825, Safe at 23,218,826 |
| Apr 2025 → Apr 2026 | — | At the fork block, **24 of 26** Ethereum routes ran 1-of-1 (LZ Labs DVN); **2** (eids 30217, 30325) ran 2-of-2. All 26 had explicit app configs. The Unichain receive library was **not pinned** (`getReceiveLibrary` → `isDefault = true`). | [evidence/onchain/cfg_pre.txt](evidence/onchain/cfg_pre.txt), `getReceiveLibrary(adapter, 30320)` at 24,908,284 |
| Mar 6 2026 → Apr 2026 | — | Per LayerZero's report: a developer's machine compromised Mar 6; attacker GCP access from Mar 30; op-geth memory on two GKE clusters patched to lie only to the LZ Labs DVN; external RPC providers DoS'd. Attributed to DPRK (TraderTraitor / UNC4899). | LayerZero incident report PDF |
| Apr 18 2026 (fork block) | 24,908,284 | State used for the replay. Owner and delegate = 3-of-6 Safe; Unichain route 1 DVN; receive lib unpinned. | reads at this block |
| 17:35:35 | 24,908,285 | **Drain.** Adapter releases **116,500 rsETH** to `0x8B1b…0D3b` on a forged message (`OFTReceived`, srcEid 30320). ~$292M at the time (LayerZero's figure; Aave's prices imply ~$288M). | tx `0x1ae232da212c45f35c1525f851e4c41d529bf18af862d9ce9fd40bf709db4222` |
| 17:37–17:42 | 24,908,294–316 | rsETH split across 7 wallets. | rsETH `Transfer` logs; Aave report "7 branch addresses" |
| 17:38:47 | 24,908,301 | First rsETH supply to Aave V3 Pool (1 rsETH). | tx `0x9a7df483…057d` |
| 17:40:11 | 24,908,307 | **First Aave borrow** (0.98 WETH). **22 blocks / ~4.6 min after the drain.** | tx `0xdac71a69…d0b5` |
| from 24,908,305 | 305–343 | rsETH reaches Compound III Comet `0xA175…aE94`. (End block not re-checked.) | Transfer logs |
| from 24,908,318 | 318–353 | Euler path. (End block not re-checked.) | Transfer logs |
| 18:21:59 | 24,908,516 | Kelp pauses rsETH and ~11 contracts. | `Paused` events |
| 18:26:35 | — | Follow-up 40,000 rsETH attempt reverts (status 0). | tx `0x8509533a…` |
| 19:03:59 | 24,908,723 | **Aave freezes rsETH on Ethereum Core**, ~88 min after the drain. Arbitrum 19:13:35; Ethereum Prime 19:17:23. | `ReserveFrozen` txs `0xd40b8b3b…7176` (Core), `0x3467a866…93f9` (Prime), Arbitrum `0xaf4f242f…fbd1` |
| Apr 23 2026 09:55 | 24,941,876 / 24,941,884 | ~25 send-side routes moved to 4 required DVNs; Unichain receive side followed. Owner/delegate were already the Safe. Unichain receive lib now pinned (`isDefault = false`). | `UlnConfigSet` logs; [evidence/onchain/cfg_now.txt](evidence/onchain/cfg_now.txt) |

## Bad debt (Aave's own incident report, MODELLED)

| Scenario | Assumption | Total |
|---|---|---|
| 1. Uniform socialisation | 112,204 unbacked rsETH dilutes all rsETH equally | **$123,708,727** (Ethereum WETH $91.8M, Mantle $10.4M, Arbitrum $10.3M, Base $6.1M, …) |
| 2. Losses isolated to L2 rsETH | L2 rsETH repriced to 26.46% backing (73.54% haircut) | **$230,113,582** (Arbitrum $88.4M, Mantle $77.7M, Base $47.5M, Ink $13.9M, …) |

"The scenarios and calculations presented herein are hypothetical." Umbrella WETH module (23,507.63 WETH, ~$54.06M) covers Ethereum Core only. Source: https://governance.aave.com/raw/24580/1

**Recovery (SECONDARY, CoinDesk):** DeFi United raised ~$160M of ~$200M by Apr 26; by May 18, 106,993 of 112,103 unbacked rsETH recovered (89,567 via Aave liquidations, 17,426 via Compound), ~5,200 rsETH residual. No later closure report found.

## Pitch wording rules

- Say: "The attacked route sat on one verifier for 12.5 months, and its verifier config never changed."
- Say: "~88 minutes from drain to Aave's first freeze; 22 blocks from drain to first borrow."
- Do **not** say "one key, no multisig" (owner was a Safe; delegate became the Safe in Aug 2025).
- Do **not** say "a Safe guard would have blocked it" (the Apr 2025 change bypassed the Safe).
- Do **not** say "Floor would have saved $X". Say what the fork replay shows, scoped to Aave Ethereum.

## Reproduce

```bash
cd docs/evidence/onchain
./cfg.sh 30320 24908284     # receive-side effective vs app config + receive lib (pinned?)
./cfgs.sh 30320 24908284    # send side
python3 peers.py 24908284 30100 30520 > peers.json   # all peers of the adapter
cast call 0x1a44076050125825900e736c501f859c50fE728c "delegates(address)(address)" \
  0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3 -b 23218826 -r https://eth.drpc.org
```
