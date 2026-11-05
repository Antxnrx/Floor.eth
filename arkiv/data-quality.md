# Data quality

**Is the data up to date, and how does the import keep it that way?**

- **Every value is pinned to a block.** The resolver reads all state at one block (`block` field). Nothing is "latest at some point".
- **Three independent RPC providers must agree.** Each scan runs every read on drpc, blastapi and Tenderly and compares raw bytes. `rpcAgreement` is true only if ≥2 providers answered every batch. The rsETH pre-hack scan agreed on all 624 reads.
- **Raw evidence travels with the data.** Each rating's `swarmRef` points to the evidence bundle with every raw read (`to`, `data`, block, raw `result`). The browser verifier re-runs all 624 reads against mainnet and they match byte-for-byte (`packages/verifier`, live test).
- **Grades are reproducible.** The rule engine re-runs over the bundle in the browser and must reproduce every grade; tampering with the decoded state, the grade or the hash is caught (offline tests).
- **The CRE workflow re-checks the critical reads at the pinned block** on every DON node before signing, and rejects any entry whose raw bytes imply a worse grade than claimed.
- **Re-runnable import:** `pnpm --filter @floor/publish run importer --bundle <file>:<token> --swarm --arkiv`. It skips a token whose rating for the same block already exists.
- **Staleness is visible:** `block` plus Arkiv's own creation time; entities expire after 180 days.
- **Correctness fixture:** rsETH at block 24,908,284 must give 26 receive routes, 24 with one verifier, eids 30217 and 30325 with two, and an unpinned Unichain library. It is checked in CI (offline) and live.

**Can people filter it the way they actually search for it?**

The indexed fields match the questions risk teams ask:

| Question | Query |
|---|---|
| Is this token safe right now? | `floor.rating` where `token = X`, owned by writer, order by `block` desc |
| Which collateral is BREACHED? | `floor.rating` where `grade = "BREACHED"` |
| Which routes have one effective verifier? | `floor.route` where `direction = "receive" AND independent = 1` |
| Which routes follow the default library? | `floor.route` where `pinned = false` |
| Everything on Unichain | `floor.route` where `eid = 30320` |

Known limits: operator lists are clipped to Arkiv's 128-byte string limit (the full list is in the Swarm bundle), and 2 USDT0 adapters use a custom message codec our inbound probe doesn't decode yet (reported as `TEST_ERROR`, never as pass or fail).
