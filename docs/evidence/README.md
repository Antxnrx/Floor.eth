# Evidence

Re-runnable proof for claims in the docs. Written 2026-11-06, during the event.

## onchain/

Raw LayerZero config reads for the rsETH OFT adapter `0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3` on Ethereum.

| File | What |
|---|---|
| `cfg.sh <eid> <block>` | Receive side: effective config (`getUlnConfig`), app config (`getAppUlnConfig`), receive library + `isDefault` |
| `cfgs.sh <eid> <block>` | Send side: same, via SendUln302 + `getSendLibrary` |
| `peers.py <block> <fromEid> <toEid>` | Enumerates non-zero `peers(eid)` |
| `peers_pre.json` | Peers at the pre-hack fork block |
| `cfg_pre.txt` / `cfgs_pre.txt` | Receive / send configs at block 24,908,284 (pre-hack) |
| `cfg_fix.txt` | Configs around the earlier change window (see audit notes) |
| `cfg_now.txt` | Configs at read time (2026-11-06) |

Output format: `eid | eff=(confirmations, requiredDVNCount, optionalDVNCount, optionalThreshold, [required], [optional]) | app=(…) | lib=<address> <isDefault>`.

Needs Foundry `cast` on PATH. Override RPC with `ETH_RPC_URL=<url>`.

## guard-proof/

Foundry project with 17 mainnet-fork tests on Safe guard behaviour (see [../08-safe-guard-findings.md](../08-safe-guard-findings.md)).

```bash
cd guard-proof
forge install foundry-rs/forge-std --no-git   # creates lib/forge-std
forge test --match-contract GuardProof -vv    # optional: RPC=<archive mainnet RPC>
```

Fork block 26,351,000. Expected: `17 passed; 0 failed; 0 skipped`. `src/Guards.sol` contains the naive guard, always-revert guard and the post-state PoC guard. **The PoC guard is not audited; never install it on a Safe with funds.**
